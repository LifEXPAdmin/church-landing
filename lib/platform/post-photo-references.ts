import type { PlatformPost } from "@prisma/client";
import { expected, PortalError } from "./portal";
import { postId, type PostContext, type PostTx } from "./post-access";
import {
  readableAssetWhere,
  requirePhotoLibrary
} from "./personal-photo-policy";
import { socialInput } from "./social-operations";
export type SavedPhotoReference = { id: string; version: number };
export function savedPhotoReferences(value: unknown): SavedPhotoReference[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 10)
    throw new PortalError(400, "Choose up to ten saved photos.");
  const rows = value.map((row) => {
    socialInput(row, ["id", "version"]);
    if (!Number.isInteger(row.version) || row.version < 1)
      throw new PortalError(400, "Refresh the saved photo before choosing it.");
    return { id: postId(row.id), version: row.version as number };
  });
  if (new Set(rows.map((row) => row.id)).size !== rows.length)
    throw new PortalError(400, "Choose each photo only once.");
  return rows;
}
export async function validatePostPhotosIn(
  tx: PostTx,
  context: PostContext,
  post: Pick<
    PlatformPost,
    "authorId" | "authorChurchId" | "audience" | "audienceChurchId"
  >,
  references: SavedPhotoReference[]
) {
  if (!references.length) return;
  requirePhotoLibrary();
  if (post.authorChurchId || post.authorId !== context.actorId)
    throw new PortalError(
      403,
      "Saved personal photos can be attached only to your own personal post."
    );
  for (const reference of references) {
    const asset = await tx.mediaAsset.findFirst({
      where: {
        AND: [
          {
            id: reference.id,
            purpose: "PROFILE_PHOTO",
            profileUserId: context.actorId,
            personalPhoto: { ownerId: context.actorId, deletedAt: null }
          },
          readableAssetWhere(context)
        ]
      },
      include: { personalPhoto: true }
    });
    if (!asset?.personalPhoto)
      throw new PortalError(
        409,
        "A saved photo is no longer available. Keep your draft and choose a current photo."
      );
    expected(reference.version, asset.version);
    const privacy = asset.personalPhoto;
    const compatible =
      privacy.audience === "PUBLIC" ||
      (post.audience === "CHURCH" &&
        (privacy.audience === "MEMBERS" ||
          (privacy.audience === "CHURCH" &&
            privacy.audienceChurchId === post.audienceChurchId)));
    if (!compatible)
      throw new PortalError(
        400,
        "This post would widen a saved photo's audience. Choose its sharing audience in Photos first, then refresh the draft photo."
      );
  }
}
export async function attachPostPhotosIn(
  tx: PostTx,
  context: PostContext,
  post: PlatformPost,
  input: unknown
) {
  const references = savedPhotoReferences(input);
  await validatePostPhotosIn(tx, context, post, references);
  if (references.length)
    await tx.postPhotoReference.createMany({
      data: references.map((row, position) => ({
        postId: post.id,
        assetId: row.id,
        ownerId: post.authorId,
        position
      }))
    });
}
