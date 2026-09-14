import type { PrismaClient } from "@prisma/client";
import { withAccountRead } from "./account-read";
import { postId } from "./post-input";
import { PortalError } from "./portal-policy";
import { socialPolicy, socialUserWhere } from "./social-policy";
import type { ImageManifest } from "./media-processing";
import { imageStorage, type ImageStorage } from "./media-storage";

/** Resolve and deliver only the current avatar within the caller's account. */
export async function readAvatar(
  db: PrismaClient,
  token: unknown,
  target: unknown,
  expectedAccount: unknown,
  store: ImageStorage = imageStorage(),
  signal = AbortSignal.timeout(15_000)
) {
  const targetId = postId(target);
  if (typeof expectedAccount !== "string" || !expectedAccount)
    throw new PortalError(401, "Your sign-in could not be checked.");
  const check = () =>
    withAccountRead(db, token, async (tx, ownerId) => {
      if (!ownerId || ownerId !== expectedAccount)
        throw new PortalError(
          401,
          "Your sign-in changed. Reload before continuing."
        );
      // Profile avatars use the existing active-account and bidirectional block
      // policy. Church publishing grants do not determine profile visibility.
      const policy = await socialPolicy(tx, ownerId);
      const asset = await tx.mediaAsset.findFirst({
        where: {
          purpose: "PROFILE_AVATAR",
          profileUserId: targetId,
          profileUser: socialUserWhere(policy),
          status: "READY",
          isCurrent: true
        },
        select: { id: true, version: true, storagePrefix: true, variants: true }
      });
      if (!asset) throw new PortalError(404, "Image unavailable.");
      return asset;
    });
  const before = await check();
  const bytes = await store.get(before.storagePrefix + "/thumb.webp", signal);
  signal.throwIfAborted();
  const after = await check();
  if (
    after.id !== before.id ||
    after.version !== before.version ||
    after.storagePrefix !== before.storagePrefix
  )
    throw new PortalError(404, "Image unavailable.");
  if (!bytes || bytes.length !== (after.variants as ImageManifest).thumb.bytes)
    throw new PortalError(503, "This image could not be loaded. Try again.");
  return bytes;
}
