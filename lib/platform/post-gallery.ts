import type { PrismaClient } from "@prisma/client";
import { expected, PortalError } from "./portal-policy";
import { postContext, postCanEdit, withPostRead } from "./post-access";
import { postField, postId } from "./post-input";
import { readableConversation } from "./comment-policy";
import { readableAssetWhere } from "./personal-photo-policy";
import { listImagesIn } from "./media";
import { imagesAvailable } from "./media-storage";
import { socialCommand, socialInput } from "./social-operations";
export function readPostGallery(db: PrismaClient, token: unknown, id: unknown) {
  return withPostRead(db, token, async (tx, context) => {
    const post = await readableConversation(tx, context, id),
      canManage = postCanEdit(context, post);
    const images = await listImagesIn(tx, context, "POST_PHOTO", post.id);
    const references = canManage
      ? await tx.postPhotoReference.findMany({
          where: { postId: post.id },
          select: { assetId: true },
          take: 11
        })
      : [];
    return {
      postId: post.id,
      postVersion: post.version,
      canManage,
      imagesAvailable: imagesAvailable(),
      images,
      savedPhotoIds: references
        .filter((row) => images.some((image) => image.id === row.assetId))
        .map((row) => row.assetId),
      unavailableReferences: references
        .filter((row) => !images.some((image) => image.id === row.assetId))
        .map((row) => row.assetId),
      pendingUploads: canManage
        ? await tx.mediaAsset.count({
            where: {
              postId: post.id,
              purpose: "POST_PHOTO",
              status: "UPLOADING",
              leaseUntil: { gt: new Date() }
            }
          })
        : 0,
      limit: 10
    };
  });
}
export async function postGalleryCommand(
  db: PrismaClient,
  token: unknown,
  input: Record<string, unknown>
) {
  socialInput(input, [
    "operation",
    "mutationId",
    "postId",
    "expectedVersion",
    "images",
    "imageId",
    "imageVersion",
    "caption",
    "alt"
  ]);
  return socialCommand(db, token, "gallery", input, async (tx, ownerId) => {
    const context = await postContext(tx, ownerId),
      post = await readableConversation(tx, context, input.postId);
    if (!postCanEdit(context, post))
      throw new PortalError(403, "You cannot change this photo gallery.");
    expected(input.expectedVersion, post.version);
    const native = await tx.mediaAsset.findMany({
      where: { postId: post.id, purpose: "POST_PHOTO", status: "READY" },
      orderBy: [{ position: "asc" }, { id: "asc" }],
      take: 11
    });
    const references = await tx.postPhotoReference.findMany({
      where: { postId: post.id },
      include: { asset: true },
      take: 11
    });
    const images = [
      ...native,
      ...references.map((row) => ({ ...row.asset, position: row.position }))
    ];
    if (images.length > 10)
      throw new PortalError(409, "This gallery needs a size review.");
    if (input.operation === "remove-reference") {
      const reference = references.find(
        (row) => row.assetId === postId(input.imageId)
      );
      if (!reference)
        throw new PortalError(
          404,
          "This saved photo is no longer attached to the post."
        );
      await tx.postPhotoReference.delete({
        where: {
          postId_assetId: { postId: post.id, assetId: reference.assetId }
        }
      });
    } else if (input.operation === "reorder") {
      if (
        await tx.mediaAsset.count({
          where: {
            postId: post.id,
            purpose: "POST_PHOTO",
            status: "UPLOADING",
            leaseUntil: { gt: new Date() }
          }
        })
      )
        throw new PortalError(
          409,
          "Wait for pending uploads to finish before reordering photos."
        );
      if (
        !Array.isArray(input.images) ||
        input.images.length !== images.length ||
        input.images.length > 10
      )
        throw new PortalError(
          409,
          "Reload the complete gallery before reordering it."
        );
      const order = input.images.map((value) => {
        socialInput(value, ["id", "version"]);
        const id = postId(value.id),
          row = images.find((i) => i.id === id);
        if (!row)
          throw new PortalError(
            409,
            "One of these photos is no longer in this gallery."
          );
        expected(value.version, row.version);
        return row;
      });
      if (new Set(order.map((i) => i.id)).size !== images.length)
        throw new PortalError(400, "Include every photo exactly once.");
      for (const [position, image] of order.entries()) {
        if (references.some((row) => row.assetId === image.id))
          await tx.postPhotoReference.update({
            where: { postId_assetId: { postId: post.id, assetId: image.id } },
            data: { position }
          });
        else
          await tx.mediaAsset.update({
            where: { id: image.id },
            data: { position, version: { increment: 1 } }
          });
      }
    } else if (input.operation === "metadata") {
      const image = images.find((i) => i.id === postId(input.imageId));
      if (!image) throw new PortalError(404, "This photo is unavailable.");
      if (
        !(await tx.mediaAsset.findFirst({
          where: { AND: [{ id: image.id }, readableAssetWhere(context)] },
          select: { id: true }
        }))
      )
        throw new PortalError(
          404,
          "This photo is unavailable. Refresh your current access."
        );
      expected(input.imageVersion, image.version);
      await tx.mediaAsset.update({
        where: { id: image.id },
        data: {
          caption: postField(input.caption, 500),
          alt: postField(input.alt, 300),
          version: { increment: 1 }
        }
      });
    } else throw new PortalError(400, "Choose a supported gallery action.");
    const row = await tx.platformPost.update({
      where: { id: post.id },
      data: { version: { increment: 1 }, editedAt: new Date() }
    });
    return {
      id: post.id,
      version: row.version,
      message: "Photo gallery saved."
    };
  });
}
