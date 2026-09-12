import type {
  MediaAsset,
  MediaPurpose,
  PersonalPhotoAudience,
  Prisma
} from "@prisma/client";
import { PortalError } from "./portal";
import {
  postId,
  postReadableWhere,
  type PostContext,
  type PostTx
} from "./post-access";
import { socialUserWhere } from "./social-policy";

export const PHOTO_LIBRARY_LIMIT = 1000;
export const PHOTO_PAGE_SIZE = 24;
export function photoAlbumsEnabled() {
  return process.env.PHOTO_ALBUMS_ENABLED === "true";
}
export function photoLibraryEnabled() {
  return process.env.PERSONAL_PHOTO_LIBRARY_ENABLED === "true";
}
export function requirePhotoLibrary() {
  if (!photoLibraryEnabled())
    throw new PortalError(
      503,
      "The photo library is not available yet. Your current pictures are unchanged."
    );
}
export function profilePicture(purpose: string) {
  return purpose === "PROFILE_AVATAR" || purpose === "PROFILE_COVER";
}
export function directPhotoAudience(value: unknown, church: unknown) {
  const audience = value ?? "ONLY_ME";
  if (!["ONLY_ME", "MEMBERS", "PUBLIC", "CHURCH"].includes(String(audience)))
    throw new PortalError(
      400,
      "Choose Only me, Members, Public or Church for this photo."
    );
  const audienceChurchId =
    church == null || church === "" ? null : postId(church);
  if ((audience === "CHURCH") !== !!audienceChurchId)
    throw new PortalError(
      400,
      "Choose the church for a Church photo audience only."
    );
  return { audience: audience as PersonalPhotoAudience, audienceChurchId };
}
export function checkPhotoAudience(
  context: PostContext,
  audience: ReturnType<typeof directPhotoAudience>
) {
  if (
    audience.audienceChurchId &&
    !context.churches.includes(audience.audienceChurchId)
  )
    throw new PortalError(
      403,
      "Your approved access to this church changed. Choose a current photo audience."
    );
}
// This predicate governs metadata, counts and every derivative. Feature switches
// may hide controls, but can never disable a privacy choice already stored.
export function readableAssetWhere(
  context: PostContext
): Prisma.MediaAssetWhereInput {
  return {
    status: "READY",
    OR: [
      ...(context.actorId
        ? [
            {
              purpose: {
                in: ["PROFILE_AVATAR", "PROFILE_COVER"] as MediaPurpose[]
              },
              profileUser: socialUserWhere(context)
            }
          ]
        : []),
      {
        purpose: "PROFILE_PHOTO",
        profileUser: socialUserWhere(context),
        personalPhoto: {
          deletedAt: null,
          OR: [
            { audience: "PUBLIC" },
            ...(context.actorId
              ? [
                  { audience: "MEMBERS" as const },
                  { audience: "ONLY_ME" as const, ownerId: context.actorId }
                ]
              : []),
            { audience: "CHURCH", audienceChurchId: { in: context.churches } }
          ]
        }
      },
      {
        purpose: { in: ["CHURCH_LOGO", "CHURCH_COVER"] },
        church: {
          OR: [{ communityListed: true }, { id: { in: context.churches } }]
        }
      },
      { purpose: "POST_PHOTO", post: postReadableWhere(context) }
    ]
  };
}
export async function personalOwner(
  tx: PostTx,
  asset: Pick<MediaAsset, "profileUserId" | "postId">
) {
  if (asset.profileUserId) return asset.profileUserId;
  if (!asset.postId) return null;
  const post = await tx.platformPost.findUnique({
    where: { id: asset.postId },
    select: { authorId: true, authorChurchId: true }
  });
  return post && !post.authorChurchId ? post.authorId : null;
}
export async function photoCapacity(
  tx: PostTx,
  ownerId: string,
  exceptId?: string
) {
  const count = await tx.personalPhoto.count({
    where: {
      ownerId,
      deletedAt: null,
      ...(exceptId ? { assetId: { not: exceptId } } : {})
    }
  });
  if (count >= PHOTO_LIBRARY_LIMIT)
    throw new PortalError(
      409,
      "Your photo library holds up to 1,000 photos. Delete an unneeded photo before saving another."
    );
}
export async function associatePersonalPhoto(
  tx: PostTx,
  asset: MediaAsset,
  audience?: ReturnType<typeof directPhotoAudience>
) {
  const ownerId = await personalOwner(tx, asset);
  if (!ownerId) return;
  if (photoLibraryEnabled()) await photoCapacity(tx, ownerId, asset.id);
  await tx.personalPhoto.upsert({
    where: { assetId: asset.id },
    create: {
      assetId: asset.id,
      ownerId,
      audience:
        asset.purpose === "PROFILE_PHOTO"
          ? (audience?.audience ?? "ONLY_ME")
          : asset.postId
            ? "SOURCE"
            : "MEMBERS",
      audienceChurchId:
        asset.purpose === "PROFILE_PHOTO" ? audience?.audienceChurchId : null
    },
    update: {} // Retries cannot reset an owner's later audience or hiding choice.
  });
}
