import { createHmac, timingSafeEqual } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import { accountConfig } from "./account-config";
import { expected, PortalError } from "./portal";
import { postContext, postField, postId, withPostRead } from "./post-access";
import { socialUserWhere } from "./social-policy";
import { socialCommand, socialInput } from "./social-operations";
import { projectImage, retireImage } from "./media";
import { imagesAvailable } from "./media-storage";
import {
  checkPhotoAudience,
  photoAlbumsEnabled,
  directPhotoAudience,
  PHOTO_LIBRARY_LIMIT,
  PHOTO_PAGE_SIZE,
  profilePicture,
  readableAssetWhere,
  requirePhotoLibrary
} from "./personal-photo-policy";

function photoCursor(scope: string) {
  const sign = (body: string) =>
    createHmac("sha256", accountConfig().rateSecret)
      .update("photos:" + scope + ":" + body)
      .digest("hex");
  return {
    encode(row: { assetId: string; createdAt: Date }) {
      const body = Buffer.from(
        JSON.stringify({ id: row.assetId, at: row.createdAt.toISOString() })
      ).toString("base64url");
      return body + "." + sign(body);
    },
    decode(value: unknown) {
      if (!value) return null;
      try {
        if (typeof value !== "string" || value.length > 600) throw Error();
        const [body, signature, extra] = value.split(".");
        if (
          extra ||
          !/^[a-f0-9]{64}$/.test(signature) ||
          !timingSafeEqual(Buffer.from(sign(body)), Buffer.from(signature))
        )
          throw Error();
        const row = JSON.parse(Buffer.from(body, "base64url").toString());
        if (
          typeof row.at !== "string" ||
          new Date(row.at).toISOString() !== row.at
        )
          throw Error();
        return { assetId: postId(row.id), createdAt: new Date(row.at) };
      } catch {
        throw new PortalError(
          400,
          "Reload Photos before loading the next page."
        );
      }
    }
  };
}
export function readPersonalPhotos(
  db: PrismaClient,
  token: unknown,
  input: {
    profileId: unknown;
    view?: unknown;
    after?: unknown;
    id?: unknown;
    ids?: unknown;
    preview?: unknown;
  }
) {
  requirePhotoLibrary();
  return withPostRead(db, token, async (tx, context) => {
    if (!context.actorId)
      throw new PortalError(401, "Sign in to view profile photos.");
    const actorId = context.actorId;
    const profileId = postId(input.profileId),
      view = input.view ?? "all";
    if (!["all", "profile", "cover", "hidden"].includes(String(view)))
      throw new PortalError(400, "Choose a photo collection.");
    const profile = await tx.platformUser.findFirst({
      where: { AND: [{ id: profileId }, socialUserWhere(context)] },
      select: { id: true }
    });
    if (!profile) throw new PortalError(404, "These photos are unavailable.");
    const memberPreview = input.preview === "member" && actorId === profileId;
    if (memberPreview)
      context = {
        actorId: "member-preview",
        churches: [],
        publishers: new Set(),
        moderators: new Set(),
        volunteers: new Set()
      };
    const canManage = actorId === profileId && !memberPreview;
    let selectedIds: string[] | undefined;
    if (input.ids != null) {
      if (typeof input.ids !== "string")
        throw new PortalError(400, "Choose saved photo references.");
      selectedIds = input.ids.split(",").map(postId);
      if (
        !selectedIds.length ||
        selectedIds.length > 10 ||
        new Set(selectedIds).size !== selectedIds.length
      )
        throw new PortalError(400, "Choose up to ten different saved photos.");
    }
    if (view === "hidden" && !canManage)
      throw new PortalError(404, "These photos are unavailable.");
    const where: Prisma.PersonalPhotoWhereInput = {
      ownerId: profileId,
      deletedAt: null,
      hiddenAt:
        input.id || selectedIds
          ? undefined
          : view === "hidden"
            ? { not: null }
            : null,
      asset: {
        AND: [
          readableAssetWhere(context),
          ...(view === "profile"
            ? [{ purpose: "PROFILE_AVATAR" as const }]
            : view === "cover"
              ? [{ purpose: "PROFILE_COVER" as const }]
              : [])
        ]
      }
    };
    const cursor = photoCursor(
        `${context.actorId}:${profileId}:${view}:newest-v1`
      ),
      after = cursor.decode(input.after);
    const ownedCount = canManage
      ? await tx.personalPhoto.count({
          where: { ownerId: profileId, deletedAt: null }
        })
      : null;
    if (ownedCount !== null && ownedCount > PHOTO_LIBRARY_LIMIT)
      throw new PortalError(
        503,
        "This photo library needs a size review. Nothing has been removed."
      );
    const total = await tx.personalPhoto.count({ where });
    const rows = await tx.personalPhoto.findMany({
      where: {
        AND: [
          where,
          ...(input.id ? [{ assetId: postId(input.id) }] : []),
          ...(selectedIds ? [{ assetId: { in: selectedIds } }] : []),
          ...(after
            ? [
                {
                  OR: [
                    { createdAt: { lt: after.createdAt } },
                    {
                      createdAt: after.createdAt,
                      assetId: { lt: after.assetId }
                    }
                  ]
                }
              ]
            : [])
        ]
      },
      include: { asset: true },
      orderBy: [{ createdAt: "desc" }, { assetId: "desc" }],
      take: PHOTO_PAGE_SIZE + 1
    });
    const page = rows.slice(0, PHOTO_PAGE_SIZE);
    const current = canManage
      ? await tx.mediaAsset.findMany({
          where: {
            profileUserId: profileId,
            purpose: { in: ["PROFILE_AVATAR", "PROFILE_COVER"] },
            status: "READY",
            isCurrent: true
          },
          select: { id: true, version: true, purpose: true },
          take: 2
        })
      : [];
    return {
      profileId,
      canManage,
      imagesAvailable: imagesAvailable(),
      albumsAvailable: photoAlbumsEnabled(),
      total,
      limit: PHOTO_LIBRARY_LIMIT,
      capacityRemaining:
        ownedCount === null
          ? null
          : Math.max(0, PHOTO_LIBRARY_LIMIT - ownedCount),
      pageSize: PHOTO_PAGE_SIZE,
      current,
      images: page.map((row) => ({
        ...projectImage(row.asset),
        photoVersion: row.version,
        audience: row.audience,
        audienceChurchId: row.audienceChurchId,
        hidden: !!row.hiddenAt,
        current: profilePicture(row.asset.purpose) && row.asset.isCurrent,
        sourcePostId: row.asset.postId
      })),
      nextCursor:
        rows.length > PHOTO_PAGE_SIZE
          ? cursor.encode(page[page.length - 1])
          : null
    };
  });
}
export function personalPhotoCommand(
  db: PrismaClient,
  token: unknown,
  input: Record<string, unknown>
) {
  requirePhotoLibrary();
  socialInput(input, [
    "operation",
    "mutationId",
    "imageId",
    "expectedVersion",
    "imageVersion",
    "caption",
    "alt",
    "audience",
    "audienceChurchId",
    "confirmed",
    "currentId",
    "currentVersion"
  ]);
  return socialCommand(
    db,
    token,
    "personal-photo",
    input,
    async (tx, ownerId) => {
      const row = await tx.personalPhoto.findFirst({
        where: {
          assetId: postId(input.imageId),
          ownerId,
          deletedAt: null,
          asset: { status: "READY" }
        },
        include: { asset: true }
      });
      if (!row) throw new PortalError(404, "This photo is unavailable.");
      expected(input.expectedVersion, row.version);
      expected(input.imageVersion, row.asset.version);
      const asset = row.asset,
        context = await postContext(tx, ownerId);
      let message = "Photo saved.";
      if (input.operation === "select") {
        if (!profilePicture(asset.purpose) || asset.profileUserId !== ownerId)
          throw new PortalError(
            400,
            "Choose a saved picture from the matching profile or cover collection."
          );
        const current = await tx.mediaAsset.findFirst({
          where: {
            profileUserId: ownerId,
            purpose: asset.purpose,
            status: "READY",
            isCurrent: true
          }
        });
        if (
          (input.currentId ?? null) !== (current?.id ?? null) ||
          input.currentVersion !== (current?.version ?? 0)
        )
          throw new PortalError(
            409,
            "Your current picture changed in another tab. Refresh before choosing a replacement."
          );
        if (current && current.id !== asset.id)
          await tx.mediaAsset.update({
            where: { id: current.id },
            data: { isCurrent: false, version: { increment: 1 } }
          });
        await tx.mediaAsset.update({
          where: { id: asset.id },
          data: { isCurrent: true, version: { increment: 1 } }
        });
        await tx.personalPhoto.update({
          where: { assetId: asset.id },
          data: { hiddenAt: null }
        });
        message =
          "Current picture changed. Your other saved pictures remain in Photos.";
      } else if (input.operation === "metadata") {
        if (asset.postId)
          throw new PortalError(
            400,
            "Edit this photo's caption in its source post."
          );
        await tx.mediaAsset.update({
          where: { id: asset.id },
          data: {
            caption: postField(input.caption, 500),
            alt: postField(input.alt, 300),
            version: { increment: 1 }
          }
        });
      } else if (input.operation === "audience") {
        if (asset.purpose !== "PROFILE_PHOTO")
          throw new PortalError(
            400,
            "This photo keeps its profile or source post audience."
          );
        const privacy = directPhotoAudience(
          input.audience,
          input.audienceChurchId
        );
        checkPhotoAudience(context, privacy);
        if (privacy.audience === "PUBLIC" && input.confirmed !== true)
          throw new PortalError(
            400,
            "Confirm that Public photos can be viewed by people who are not signed in."
          );
        await tx.personalPhoto.update({
          where: { assetId: asset.id },
          data: privacy
        });
        await tx.mediaAsset.update({
          where: { id: asset.id },
          data: { version: { increment: 1 } }
        });
        message =
          "Photo audience saved. Existing posts and albums cannot widen this audience.";
      } else if (input.operation === "hide" || input.operation === "restore") {
        if (
          input.operation === "hide" &&
          profilePicture(asset.purpose) &&
          asset.isCurrent
        )
          throw new PortalError(
            409,
            "Change or remove your current picture before hiding it from Photos."
          );
        await tx.personalPhoto.update({
          where: { assetId: asset.id },
          data: { hiddenAt: input.operation === "hide" ? new Date() : null }
        });
        message =
          input.operation === "hide"
            ? "Hidden from your profile Photos. Its source and audience are unchanged."
            : "Returned to your profile Photos.";
      } else if (input.operation === "delete") {
        if (input.confirmed !== true)
          throw new PortalError(
            400,
            "Confirm deletion of this saved photo and its processed images."
          );
        if (asset.postId)
          throw new PortalError(
            409,
            "Remove this photo from its source post, or hide it from your profile instead."
          );
        if (profilePicture(asset.purpose) && asset.isCurrent)
          throw new PortalError(
            409,
            "Change or remove your current picture before deleting its saved photo."
          );
        if (
          await tx.postPhotoReference.count({
            where: { assetId: asset.id, post: { status: { not: "WITHDRAWN" } } }
          })
        )
          throw new PortalError(
            409,
            "This photo is used by a post. Remove it from that post before deleting the saved photo."
          );
        await retireImage(tx, asset);
        return {
          id: asset.id,
          version: row.version + 1,
          message:
            "Photo deleted from view. Its processed files are scheduled for cleanup."
        };
      } else throw new PortalError(400, "Choose a supported photo action.");
      const updated = await tx.personalPhoto.update({
        where: { assetId: asset.id },
        data: { version: { increment: 1 } }
      });
      return { id: asset.id, version: updated.version, message };
    }
  );
}
