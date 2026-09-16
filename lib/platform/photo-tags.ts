import type { PrismaClient } from "@prisma/client";
import { expected, PortalError } from "./portal-policy";
import { postId } from "./post-input";
import { socialCommand, socialInput } from "./social-operations";
import { recordDiscoveryControl } from "./retention-controls";
import { protectDiscoveryRecovery } from "./discovery-recovery";
import { recordDomainActivity } from "./domain-activity";
import {
  PHOTO_TAG_LIMIT,
  canRequestPhotoTag,
  photoTagInclude,
  photoTagRequestAllowed,
  readableTagAsset,
  requireTagOwner,
  tagAudienceChurch,
  tagContextCache,
  visiblePhotoTag
} from "./photo-tag-policy";

export async function photoTagCommand(
  db: PrismaClient,
  token: unknown,
  input: Record<string, unknown>
) {
  socialInput(input, [
    "operation",
    "mutationId",
    "ownerId",
    "id",
    "assetId",
    "recipientId",
    "expectedVersion",
    "imageVersion",
    "choice"
  ]);
  const operation = input.operation;
  if (
    !["request", "accept", "decline", "remove", "preferences"].includes(
      operation as string
    )
  )
    throw new PortalError(400, "Choose a photo tag action.");
  let actingOwner = "";
  const result = await socialCommand(
    db,
    token,
    "photo-tags",
    input,
    async (tx, ownerId) => {
      actingOwner = ownerId;
      const context = await requireTagOwner(tx, ownerId);
      if (operation === "preferences") {
        if (
          typeof input.choice !== "string" ||
          !["EVERYONE", "FOLLOWED", "NOBODY"].includes(input.choice)
        )
          throw new PortalError(400, "Choose who may request a photo tag.");
        const prior = await tx.socialPreferences.findUnique({
          where: { ownerId }
        });
        expected(input.expectedVersion, prior?.photoTagVersion ?? 0);
        const saved = await tx.socialPreferences.upsert({
          where: { ownerId },
          create: {
            ownerId,
            photoTagRequests: input.choice,
            photoTagVersion: 1
          },
          update: {
            photoTagRequests: input.choice,
            photoTagVersion: { increment: 1 },
            photoTagRecoveryRequired: false
          }
        });
        await recordDiscoveryControl(
          tx,
          "PHOTO_TAG_PREFERENCES",
          ownerId,
          ownerId,
          saved.photoTagVersion
        );
        return {
          id: ownerId,
          version: saved.photoTagVersion,
          message:
            "Photo tag choices saved. Every new tag still requires your approval."
        };
      }
      if (operation === "request") {
        const asset = await readableTagAsset(
          tx,
          context,
          postId(input.assetId)
        );
        if (!asset || !canRequestPhotoTag(context, asset))
          throw new PortalError(
            403,
            "Only a current photo manager may request a tag."
          );
        expected(input.imageVersion, asset.version);
        const recipientId = postId(input.recipientId);
        if (!(await photoTagRequestAllowed(tx, ownerId, recipientId)))
          throw new PortalError(
            400,
            "This person cannot receive this photo tag request."
          );
        const recipient = await requireTagOwner(tx, recipientId);
        if (!(await readableTagAsset(tx, recipient, asset.id)))
          throw new PortalError(
            400,
            "This person cannot view the photo. A tag cannot change its audience."
          );
        const previous = await tx.photoTag.findUnique({
          where: { assetId_recipientId: { assetId: asset.id, recipientId } }
        });
        if (previous)
          throw new PortalError(
            409,
            "A tag for this person already exists. Review its current status; declined or removed tags cannot be requested again."
          );
        if (
          (await tx.photoTag.count({ where: { assetId: asset.id } })) >=
          PHOTO_TAG_LIMIT
        )
          throw new PortalError(
            409,
            "This photo has reached its tag request limit."
          );
        const tag = await tx.photoTag.create({
          data: {
            assetId: asset.id,
            requesterId: ownerId,
            recipientId,
            imageVersion: asset.version,
            audienceChurchId: tagAudienceChurch(asset)
          }
        });
        await recordDomainActivity(tx, {
          kind: "PHOTO_TAG_REQUEST",
          category: "photos",
          sourceId: tag.id,
          sourceVersion: tag.version,
          actorId: ownerId,
          recipientId,
          once: true
        });
        return {
          id: tag.id,
          version: tag.version,
          message:
            "Tag request saved privately. It appears as an association only after approval."
        };
      }
      const tag = await tx.photoTag.findUnique({
        where: { id: postId(input.id) },
        include: photoTagInclude
      });
      if (!tag) throw new PortalError(404, "This photo tag is unavailable.");
      const recipient = tag.recipientId === ownerId,
        requester = tag.requesterId === ownerId;
      const asset = await readableTagAsset(tx, context, tag.assetId);
      if (
        operation === "remove"
          ? !recipient &&
            !requester &&
            !(asset && canRequestPhotoTag(context, asset))
          : !recipient
      )
        throw new PortalError(404, "This photo tag is unavailable.");
      expected(input.expectedVersion, tag.version);
      if (operation === "accept") {
        if (tag.state !== "PENDING")
          throw new PortalError(409, "Only a pending request may be accepted.");
        const current = await visiblePhotoTag(
          tx,
          context,
          tag,
          tagContextCache(tx, context)
        );
        if (
          !current ||
          !(await photoTagRequestAllowed(tx, tag.requesterId, ownerId))
        )
          throw new PortalError(
            409,
            "The photo or its tag permissions changed. Decline or remove the request."
          );
        expected(input.imageVersion, current.version);
      } else if (operation === "decline" && tag.state !== "PENDING") {
        throw new PortalError(
          409,
          "Only a pending request may be declined. Remove an approved tag instead."
        );
      } else if (operation === "remove" && tag.state === "REMOVED") {
        return {
          id: tag.id,
          version: tag.version,
          message: "This tag is already removed."
        };
      }
      const state =
        operation === "accept"
          ? "APPROVED"
          : operation === "decline"
            ? "DECLINED"
            : "REMOVED";
      const saved = await tx.photoTag.update({
        where: { id: tag.id },
        data: {
          state,
          version: { increment: 1 },
          decidedAt: new Date(),
          ...(operation === "accept" ? { imageVersion: asset!.version } : {})
        }
      });
      await recordDiscoveryControl(
        tx,
        "PHOTO_TAG",
        ownerId,
        saved.id,
        saved.version
      );
      if (state === "APPROVED")
        await recordDomainActivity(tx, {
          kind: "PHOTO_TAG_APPROVED",
          category: "photos",
          sourceId: saved.id,
          sourceVersion: saved.version,
          actorId: ownerId,
          recipientId: saved.requesterId,
          once: true
        });
      return {
        id: saved.id,
        version: saved.version,
        message:
          state === "APPROVED"
            ? "Photo tag approved within the photo’s permitted audience."
            : state === "DECLINED"
              ? "Photo tag declined. No association was published."
              : "Photo tag removed. The original photo has not been deleted."
      };
    },
    async (tx, ownerId) => {
      actingOwner = ownerId;
      await requireTagOwner(tx, ownerId);
      if (input.ownerId !== ownerId)
        throw new PortalError(401, "Your sign-in changed. Reload photo tags.");
    }
  );
  const protectedRecovery = await protectDiscoveryRecovery(db, actingOwner);
  return {
    ...result,
    protectedRecovery,
    ...(!protectedRecovery
      ? {
          message:
            result.message +
            " Recovery protection is pending; your current choice is saved."
        }
      : {})
  };
}
