import type { PrismaClient, Prisma } from "@prisma/client";
import { withAccountRead } from "./account-read";
import { eligibleWhere, isEligible, PortalError } from "./portal-policy";
import { postId } from "./post-input";
import { projectImage } from "./media";
import { socialUserWhere } from "./social-policy";
import {
  PHOTO_TAG_LIMIT,
  canRequestPhotoTag,
  photoTagInclude,
  photoTagRequestAllowed,
  readableTagAsset,
  requireTagOwner,
  tagContextCache,
  tagSourceDescription,
  tagSourceHref,
  visiblePhotoTag,
  type TagAsset,
  type PhotoTagRow
} from "./photo-tag-policy";

type Query = {
  view?: unknown;
  id?: unknown;
  assetId?: unknown;
  profileId?: unknown;
  scope?: unknown;
  after?: unknown;
  q?: unknown;
};
export function readPhotoTags(
  db: PrismaClient,
  token: unknown,
  query: Query = {}
) {
  return withAccountRead(db, token, async (tx, ownerId) => {
    const context = await requireTagOwner(tx, ownerId),
      owner = context.actorId!;
    const contexts = tagContextCache(tx, context);
    const project = async (
      tag: PhotoTagRow,
      privateReview: boolean,
      checked?: TagAsset | null
    ) => {
      const visible =
        checked === undefined
          ? await visiblePhotoTag(tx, context, tag, contexts)
          : checked;
      // Closed owned history can show the source only if this viewer still has access.
      const asset =
        visible ??
        (privateReview && ["DECLINED", "REMOVED"].includes(tag.state)
          ? await readableTagAsset(tx, context, tag.assetId)
          : null);
      const ownRecipient = tag.recipientId === owner,
        ownRequest = tag.requesterId === owner;
      return {
        id: tag.id,
        version: tag.version,
        state: tag.state,
        createdAt: tag.createdAt.toISOString(),
        image: asset ? projectImage(asset) : null,
        sourceName: asset ? tagSourceDescription(asset) : null,
        sourceHref: asset ? tagSourceHref(asset) : null,
        person:
          asset &&
          isEligible(tag.recipient) &&
          !context.blockedIds?.includes(tag.recipientId)
            ? { name: tag.recipient.name, username: tag.recipient.username }
            : null,
        requesterName:
          asset &&
          isEligible(tag.requester) &&
          !context.blockedIds?.includes(tag.requesterId)
            ? tag.requester.name
            : null,
        received: ownRecipient,
        canAccept:
          ownRecipient &&
          tag.state === "PENDING" &&
          !!visible &&
          (await photoTagRequestAllowed(tx, tag.requesterId, owner)),
        canDecline: ownRecipient && tag.state === "PENDING",
        canRemove:
          tag.state !== "REMOVED" &&
          (ownRecipient ||
            ownRequest ||
            !!(asset && canRequestPhotoTag(context, asset))),
        originalChurchAudience: !!tag.audienceChurchId
      };
    };
    const view = query.view ?? "inbox";
    if (view === "preferences") {
      const preferences = await tx.socialPreferences.findUnique({
        where: { ownerId: owner },
        select: {
          photoTagRequests: true,
          photoTagVersion: true,
          photoTagRecoveryRequired: true
        }
      });
      return {
        kind: "preferences" as const,
        ownerId: owner,
        choice: preferences?.photoTagRequests ?? "EVERYONE",
        version: preferences?.photoTagVersion ?? 0,
        recoveryRequired: preferences?.photoTagRecoveryRequired ?? false
      };
    }
    if (view === "asset" || view === "people") {
      const asset = await readableTagAsset(tx, context, postId(query.assetId));
      if (!asset) throw new PortalError(404, "This photo is unavailable.");
      const canRequest = canRequestPhotoTag(context, asset);
      if (view === "people") {
        if (!canRequest)
          throw new PortalError(
            403,
            "Only a current photo manager may request tags."
          );
        if (
          typeof query.q !== "string" ||
          query.q.trim().length < 2 ||
          query.q.length > 100
        )
          throw new PortalError(
            400,
            "Enter at least two characters to find an adult."
          );
        const rows = await tx.platformUser.findMany({
          where: {
            AND: [
              eligibleWhere,
              socialUserWhere(context),
              {
                id: {
                  not: owner,
                  ...(query.after ? { gt: postId(query.after) } : {})
                },
                OR: [
                  { name: { contains: query.q.trim(), mode: "insensitive" } },
                  {
                    username: { contains: query.q.trim(), mode: "insensitive" }
                  }
                ]
              }
            ]
          },
          select: { id: true, name: true, username: true },
          orderBy: { id: "asc" },
          take: 21
        });
        const items = [];
        for (const candidate of rows.slice(0, 20))
          if (
            candidate.username &&
            (await photoTagRequestAllowed(tx, owner, candidate.id)) &&
            (await readableTagAsset(tx, await contexts(candidate.id), asset.id))
          )
            items.push(candidate);
        return {
          kind: "people" as const,
          ownerId: owner,
          items,
          nextCursor: rows.length > 20 ? rows[19].id : null
        };
      }
      const rows = await tx.photoTag.findMany({
        where: {
          assetId: asset.id,
          OR: [
            { state: "APPROVED" },
            { requesterId: owner },
            { recipientId: owner }
          ]
        },
        include: photoTagInclude,
        orderBy: { id: "asc" },
        take: PHOTO_TAG_LIMIT
      });
      const items = [];
      for (const tag of rows) {
        const privateReview =
          tag.requesterId === owner || tag.recipientId === owner;
        const visible = await visiblePhotoTag(tx, context, tag, contexts);
        if (privateReview || visible)
          items.push(await project(tag, privateReview, visible));
      }
      return {
        kind: "asset" as const,
        ownerId: owner,
        image: projectImage(asset),
        sourceName: tagSourceDescription(asset),
        sourceHref: tagSourceHref(asset),
        canRequest,
        items,
        nextCursor: null
      };
    }
    if (view !== "inbox" && view !== "profile")
      throw new PortalError(400, "Choose a photo tag view.");
    let profile: { id: string; name: string; username: string } | null = null;
    let where: Prisma.PhotoTagWhereInput;
    if (view === "profile") {
      const person = await tx.platformUser.findFirst({
        where: {
          AND: [
            { id: postId(query.profileId) },
            eligibleWhere,
            socialUserWhere(context)
          ]
        },
        select: { id: true, name: true, username: true }
      });
      if (!person)
        throw new PortalError(404, "These tagged photos are unavailable.");
      profile = person;
      where = { recipientId: person.id, state: "APPROVED" };
    } else {
      if (
        query.scope != null &&
        !["received", "sent"].includes(query.scope as string)
      )
        throw new PortalError(400, "Choose received or sent requests.");
      where = query.id
        ? {
            id: postId(query.id),
            OR: [{ recipientId: owner }, { requesterId: owner }]
          }
        : query.scope === "sent"
          ? { requesterId: owner }
          : { recipientId: owner };
    }
    const rows = await tx.photoTag.findMany({
      where: {
        AND: [
          where,
          ...(query.after ? [{ id: { lt: postId(query.after) } }] : [])
        ]
      },
      include: photoTagInclude,
      orderBy: { id: "desc" },
      take: 21
    });
    if (query.id && !rows.length)
      throw new PortalError(404, "This photo tag is unavailable.");
    const items = [];
    for (const tag of rows.slice(0, 20)) {
      const visible = await visiblePhotoTag(tx, context, tag, contexts);
      if (view === "inbox" || visible)
        items.push(await project(tag, view === "inbox", visible));
    }
    return {
      kind: view as "inbox" | "profile",
      ownerId: owner,
      profile,
      items,
      nextCursor: rows.length > 20 ? rows[19].id : null
    };
  });
}
export type PhotoTagView = Awaited<ReturnType<typeof readPhotoTags>>;
