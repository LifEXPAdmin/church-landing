import { createHash, randomUUID } from "node:crypto";
import type { MediaAsset, Prisma, PrismaClient } from "@prisma/client";
import { withOwnedSession } from "./account-sessions";
import {
  postContext,
  postField,
  postId,
  withPostRead,
  type PostTx
} from "./post-access";
import { PortalError } from "./portal";
import {
  centeredCrop,
  imageAspect,
  validImageCrop,
  type ImageCrop
} from "./image-crop";
import {
  imageTarget,
  readableImageTarget,
  writableImageTarget,
  type ImageTarget
} from "./media-access";
import {
  IMAGE_VARIANTS,
  imageVariant,
  processImage,
  type ImageManifest
} from "./media-processing";
import { imageStorage, type ImageStorage } from "./media-storage";

import {
  associatePersonalPhoto,
  checkPhotoAudience,
  directPhotoAudience,
  personalOwner,
  photoCapacity,
  photoLibraryEnabled,
  profilePicture,
  readableAssetWhere,
  requirePhotoLibrary
} from "./personal-photo-policy";

const HOUR = 3600_000,
  LEASE = 120_000;
const paths = (prefix: string) =>
  IMAGE_VARIANTS.map((v) => prefix + "/" + v + ".webp");
const targetOf = (a: ImageTarget) => ({
  purpose: a.purpose,
  profileUserId: a.profileUserId,
  churchId: a.churchId,
  postId: a.postId
});
export function projectImage(asset: MediaAsset) {
  const manifest = asset.variants as ImageManifest;
  return {
    id: asset.id,
    version: asset.version,
    purpose: asset.purpose,
    caption: asset.caption,
    alt: asset.alt,
    position: asset.position,
    crop: asset.crop as ImageCrop | null,
    variants: Object.fromEntries(
      IMAGE_VARIANTS.map((v) => [
        v,
        { ...manifest[v], url: `/api/platform/images/${asset.id}/${v}` }
      ])
    ) as Record<
      string,
      { width: number; height: number; bytes: number; url: string }
    >
  };
}
export type ImageView = ReturnType<typeof projectImage>;
async function garbage(tx: PostTx, prefix: string) {
  await tx.mediaGarbage.upsert({
    where: { storagePrefix: prefix },
    create: { storagePrefix: prefix, dueAt: new Date(Date.now() + 24 * HOUR) },
    update: {}
  });
}
export async function retireImage(tx: PostTx, asset: MediaAsset) {
  // Album writes share the lifecycle lock. Removing a source never silently
  // destroys another owned collection, even when album controls are disabled.
  if (await tx.photoAlbumEntry.count({ where: { assetId: asset.id } }))
    throw new PortalError(
      409,
      "This photo is used by an album. Remove it from your albums before deleting the photo."
    );
  await tx.mediaAsset.update({
    where: { id: asset.id },
    data: { status: "RETIRED", version: { increment: 1 } }
  });
  await tx.personalPhoto.updateMany({
    where: { assetId: asset.id, deletedAt: null },
    data: { deletedAt: new Date(), version: { increment: 1 } }
  });
  await garbage(tx, asset.storagePrefix);
}
function mutation<T>(
  db: PrismaClient,
  token: unknown,
  work: (tx: PostTx, actorId: string) => Promise<T>
) {
  return withOwnedSession(
    db,
    token,
    (tx, session) => work(tx, session.userId),
    true
  );
}
export async function listImagesIn(
  tx: PostTx,
  context: Awaited<ReturnType<typeof postContext>>,
  purpose: unknown,
  targetId: unknown
) {
  const target = imageTarget(purpose, targetId);
  await readableImageTarget(tx, context, target);
  const native = await tx.mediaAsset.findMany({
    where: {
      AND: [target, readableAssetWhere(context)],
      ...(profilePicture(target.purpose) ? { isCurrent: true } : {})
    },
    orderBy: [{ position: "asc" }, { id: "asc" }],
    take: 11
  });
  const references = target.postId
    ? await tx.postPhotoReference.findMany({
        where: { postId: target.postId, asset: readableAssetWhere(context) },
        include: { asset: true },
        orderBy: [{ position: "asc" }, { assetId: "asc" }],
        take: 11
      })
    : [];
  const images = [
    ...native,
    ...references.map((row) => ({ ...row.asset, position: row.position }))
  ].sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
  if (images.length > 10)
    throw new PortalError(
      409,
      "This image list needs a size review. Use the paginated Photos library for saved photos."
    );
  return images.map(projectImage);
}
export async function listImages(
  db: PrismaClient,
  token: unknown,
  purpose: unknown,
  targetId: unknown
) {
  return withPostRead(db, token, (tx, context) =>
    listImagesIn(tx, context, purpose, targetId)
  );
}
export async function uploadImage(
  db: PrismaClient,
  token: unknown,
  input: {
    purpose: unknown;
    targetId: unknown;
    requestKey: unknown;
    replacesId?: unknown;
    caption?: unknown;
    alt?: unknown;
    crop?: unknown;
    audience?: unknown;
    audienceChurchId?: unknown;
  },
  bytes: Buffer,
  store: ImageStorage = imageStorage(),
  signal = AbortSignal.timeout(45_000)
) {
  const target = imageTarget(input.purpose, input.targetId);
  const direct = target.purpose === "PROFILE_PHOTO";
  if (direct) requirePhotoLibrary();
  else if (input.audience !== undefined || input.audienceChurchId !== undefined)
    throw new PortalError(
      400,
      "This image inherits its original profile, church or post audience."
    );
  const privacy = direct
    ? directPhotoAudience(input.audience, input.audienceChurchId)
    : undefined;
  const single = !target.postId && !direct;
  const currentTarget = {
    ...target,
    ...(profilePicture(target.purpose) ? { isCurrent: true } : {})
  };
  const aspect = imageAspect(target.purpose);
  const suppliedCrop =
    input.crop === undefined ? (aspect ? centeredCrop : null) : input.crop;
  if (aspect ? !validImageCrop(suppliedCrop) : suppliedCrop !== null)
    throw new PortalError(400, "Check the image crop and try again.");
  const crop = validImageCrop(suppliedCrop)
    ? { x: suppliedCrop.x, y: suppliedCrop.y, zoom: suppliedCrop.zoom }
    : null;
  const requestKey = postId(input.requestKey);
  if (!/^[a-f0-9-]{36}$/.test(requestKey))
    throw new PortalError(400, "Use a new image request reference.");
  const replacesId = input.replacesId ? postId(input.replacesId) : null;
  if (direct && replacesId)
    throw new PortalError(
      400,
      "Save a separate photo or change its details in Photos."
    );
  const caption = postField(input.caption ?? "", 500),
    alt = postField(input.alt ?? "", 300);
  const fingerprint = createHash("sha256")
    .update(
      JSON.stringify({
        target,
        replacesId,
        caption,
        alt,
        crop,
        ...(privacy ? { privacy } : {})
      })
    )
    .update(bytes)
    .digest("hex");
  const reserved = await mutation(db, token, async (tx, actorId) => {
    const context = await postContext(tx, actorId);
    await writableImageTarget(tx, context, target);
    if (privacy) checkPhotoAudience(context, privacy);
    const previous = await tx.mediaAsset.findUnique({
      where: { uploaderId_requestKey: { uploaderId: actorId, requestKey } }
    });
    if (previous) {
      if (previous.fingerprint !== fingerprint)
        throw new PortalError(
          409,
          "This request belongs to another image. Keep the same file when retrying."
        );
      if (previous.status === "RETIRED")
        throw new PortalError(
          409,
          "This image was removed. Choose a new upload to add it again."
        );
      if (previous.status === "READY") return { asset: previous, ready: true };
      if (previous.leaseUntil > new Date())
        throw new PortalError(
          409,
          "This upload is still processing. Wait briefly before retrying."
        );
    }
    const old = replacesId
      ? await tx.mediaAsset.findFirst({
          where: { id: replacesId, ...currentTarget, status: "READY" }
        })
      : null;
    if (replacesId && !old)
      throw new PortalError(
        409,
        "The image changed. Refresh before replacing it."
      );
    if (
      single &&
      !old &&
      (await tx.mediaAsset.count({
        where: { ...currentTarget, status: "READY" }
      }))
    )
      throw new PortalError(
        409,
        "An image already exists. Refresh and explicitly replace it."
      );
    const now = new Date();
    const occupied = await tx.mediaAsset.count({
      where: {
        ...currentTarget,
        ...(previous ? { id: { not: previous.id } } : {}),
        OR: [
          { status: "READY" },
          { status: "UPLOADING", leaseUntil: { gt: now } }
        ]
      }
    });
    const references = target.postId
      ? await tx.postPhotoReference.count({ where: { postId: target.postId } })
      : 0;
    if (
      occupied + references >=
      (direct ? 1000 : target.postId ? 10 : 1) + (old ? 1 : 0)
    )
      throw new PortalError(
        409,
        target.postId
          ? "A post holds up to ten photos, including active uploads."
          : "Another image is processing here. Wait and refresh."
      );
    const ownerId = await personalOwner(tx, target);
    if (ownerId && photoLibraryEnabled()) await photoCapacity(tx, ownerId);
    if (previous) await garbage(tx, previous.storagePrefix);
    const storagePrefix = "images/" + randomUUID();
    await garbage(tx, storagePrefix);
    const data = {
      storagePrefix,
      leaseUntil: new Date(Date.now() + LEASE),
      variants: {}
    };
    const asset = previous
      ? await tx.mediaAsset.update({ where: { id: previous.id }, data })
      : await tx.mediaAsset.create({
          data: {
            ...data,
            ...target,
            uploaderId: actorId,
            requestKey,
            fingerprint,
            replacesId,
            caption,
            alt,
            ...(crop ? { crop: crop as unknown as Prisma.InputJsonValue } : {}),
            position:
              old?.position ??
              (target.postId
                ? Math.max(
                    -1,
                    ...(
                      await tx.mediaAsset.findMany({
                        where: {
                          postId: target.postId,
                          OR: [
                            { status: "READY" },
                            {
                              status: "UPLOADING",
                              leaseUntil: { gt: new Date() }
                            }
                          ]
                        },
                        select: { position: true },
                        take: 11
                      })
                    ).map((row) => row.position),
                    ...(
                      await tx.postPhotoReference.findMany({
                        where: { postId: target.postId },
                        select: { position: true },
                        take: 11
                      })
                    ).map((row) => row.position)
                  ) + 1
                : occupied)
          }
        });
    return { asset, ready: false };
  });
  if (reserved.ready) return projectImage(reserved.asset);
  const asset = reserved.asset;
  try {
    signal.throwIfAborted();
    const processed = await processImage(
      bytes,
      crop && aspect ? { crop: crop as ImageCrop, aspect } : undefined
    );
    signal.throwIfAborted();
    for (const variant of IMAGE_VARIANTS) {
      await store.put(
        asset.storagePrefix + "/" + variant + ".webp",
        processed.files[variant],
        signal
      );
      signal.throwIfAborted();
    }
    return await mutation(db, token, async (tx, actorId) => {
      const context = await postContext(tx, actorId);
      await writableImageTarget(tx, context, target);
      if (privacy) checkPhotoAudience(context, privacy);
      const current = await tx.mediaAsset.findUniqueOrThrow({
        where: { id: asset.id }
      });
      if (
        current.status !== "UPLOADING" ||
        current.storagePrefix !== asset.storagePrefix ||
        current.leaseUntil <= new Date()
      )
        throw new PortalError(
          409,
          "This upload expired or changed. Retry the same image."
        );
      const old = replacesId
        ? await tx.mediaAsset.findFirst({
            where: { id: replacesId, ...currentTarget, status: "READY" }
          })
        : null;
      if (replacesId && !old)
        throw new PortalError(
          409,
          "The image changed while uploading. Refresh before replacing it."
        );
      if (
        single &&
        !old &&
        (await tx.mediaAsset.count({
          where: { ...currentTarget, status: "READY" }
        }))
      )
        throw new PortalError(
          409,
          "Another image was saved. Refresh before replacing it."
        );
      if (
        target.postId &&
        !old &&
        (await tx.mediaAsset.count({
          where: { postId: target.postId, status: "READY" }
        })) +
          (await tx.postPhotoReference.count({
            where: { postId: target.postId }
          })) >=
          10
      )
        throw new PortalError(409, "This post already has ten photos.");
      if (old) {
        if (profilePicture(old.purpose) && photoLibraryEnabled()) {
          await associatePersonalPhoto(tx, old);
          await tx.mediaAsset.update({
            where: { id: old.id },
            data: { isCurrent: false, version: { increment: 1 } }
          });
        } else await retireImage(tx, old);
      }
      const ready = await tx.mediaAsset.update({
        where: { id: asset.id },
        data: {
          status: "READY",
          variants: processed.manifest as unknown as Prisma.InputJsonValue
        }
      });
      await associatePersonalPhoto(tx, ready, privacy);
      await tx.mediaGarbage.delete({
        where: { storagePrefix: asset.storagePrefix }
      });
      if (target.postId)
        await tx.platformPost.update({
          where: { id: target.postId },
          data: { version: { increment: 1 }, editedAt: new Date() }
        });
      return projectImage(ready);
    });
  } catch (error) {
    // Renew the ledger after an uncertain failure: an expired attempt may have
    // raced cleanup while its provider was still completing a write.
    await db.mediaGarbage
      .upsert({
        where: { storagePrefix: asset.storagePrefix },
        create: {
          storagePrefix: asset.storagePrefix,
          dueAt: new Date(Date.now() + 24 * HOUR)
        },
        update: { dueAt: new Date(Date.now() + 24 * HOUR) }
      })
      .catch(() => {});
    // Never delete here: a lost provider reply may still finish. The pre-write
    // ledger collects this unique attempt after a grace period, even on a crash.
    await db.mediaAsset
      .updateMany({
        where: {
          id: asset.id,
          storagePrefix: asset.storagePrefix,
          status: "UPLOADING"
        },
        data: { leaseUntil: new Date(0) }
      })
      .catch(() => {});
    throw error;
  }
}
export function removeImage(
  db: PrismaClient,
  token: unknown,
  id: unknown,
  expectedVersion: unknown
) {
  return mutation(db, token, async (tx, actorId) => {
    const asset = await tx.mediaAsset.findUnique({ where: { id: postId(id) } });
    if (!asset) throw new PortalError(404, "Image unavailable.");
    await writableImageTarget(
      tx,
      await postContext(tx, actorId),
      targetOf(asset)
    );
    if (
      (asset.status === "RETIRED" ||
        (profilePicture(asset.purpose) && !asset.isCurrent)) &&
      asset.version === Number(expectedVersion) + 1
    )
      return { removed: true };
    if (!Number.isInteger(expectedVersion) || asset.version !== expectedVersion)
      throw new PortalError(
        409,
        "The image changed. Refresh before removing it."
      );
    if (profilePicture(asset.purpose) && !asset.isCurrent)
      throw new PortalError(
        409,
        "Use Photos to review a retained picture before deleting it."
      );
    if (profilePicture(asset.purpose) && photoLibraryEnabled()) {
      if (!asset.isCurrent || asset.status !== "READY")
        throw new PortalError(
          409,
          "The current picture changed. Refresh before removing it."
        );
      await associatePersonalPhoto(tx, asset);
      await tx.mediaAsset.update({
        where: { id: asset.id },
        data: { isCurrent: false, version: { increment: 1 } }
      });
    } else {
      if (asset.purpose === "PROFILE_PHOTO")
        throw new PortalError(
          400,
          "Use the photo library to review and delete a saved photo."
        );
      await retireImage(tx, asset);
    }
    if (asset.postId)
      await tx.platformPost.update({
        where: { id: asset.postId },
        data: { version: { increment: 1 }, editedAt: new Date() }
      });
    return { removed: true };
  });
}
export async function readImage(
  db: PrismaClient,
  token: unknown,
  id: unknown,
  variantValue: unknown,
  store: ImageStorage = imageStorage(),
  signal = AbortSignal.timeout(15_000)
) {
  const variant = imageVariant(variantValue),
    assetId = postId(id);
  const check = () =>
    withPostRead(db, token, async (tx, context) => {
      const asset = await tx.mediaAsset.findFirst({
        where: { AND: [{ id: assetId }, readableAssetWhere(context)] }
      });
      if (!asset) throw new PortalError(404, "Image unavailable.");
      return asset;
    });
  const before = await check();
  const bytes = await store.get(
    before.storagePrefix + "/" + variant + ".webp",
    signal
  );
  const after = await check();
  if (
    after.storagePrefix !== before.storagePrefix ||
    after.version !== before.version
  )
    throw new PortalError(404, "Image unavailable.");
  if (
    !bytes ||
    bytes.length !== (after.variants as ImageManifest)[variant].bytes
  )
    throw new PortalError(503, "This image could not be loaded. Try again.");
  return bytes;
}
// Used by the secret-protected maintenance route. Immutable prefixes and the
// existing lifecycle gate make duplicate invocations safe without a new queue.
export async function collectImageGarbage(
  db: PrismaClient,
  store: ImageStorage = imageStorage(),
  now = new Date(),
  signal = AbortSignal.timeout(40_000)
) {
  signal.throwIfAborted();
  const candidates = await db.mediaGarbage.findMany({
    where: { dueAt: { lte: now } },
    orderBy: [{ dueAt: "asc" }, { storagePrefix: "asc" }],
    take: 20
  });
  let removed = 0;
  for (const candidate of candidates) {
    signal.throwIfAborted();
    const eligible = await withPostRead(db, "", async (tx) => {
      const row = await tx.mediaAsset.findUnique({
        where: { storagePrefix: candidate.storagePrefix }
      });
      if (
        row?.status === "READY" ||
        (row?.status === "UPLOADING" && row.leaseUntil > now)
      )
        return false;
      // Expire before external deletion so this attempt can never attach later.
      if (row?.status === "UPLOADING")
        await tx.mediaAsset.update({
          where: { id: row.id },
          data: { leaseUntil: new Date(0) }
        });
      return true;
    });
    if (!eligible) continue;
    signal.throwIfAborted();
    await store.delete(
      paths(candidate.storagePrefix),
      AbortSignal.any([signal, AbortSignal.timeout(15_000)])
    );
    // A lost/aborted provider response retains the durable record for retry.
    signal.throwIfAborted();
    const result = await db.mediaGarbage.deleteMany({
      where: { storagePrefix: candidate.storagePrefix, dueAt: candidate.dueAt }
    });
    removed += result.count;
  }
  return { removed };
}
