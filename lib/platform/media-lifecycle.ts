import type { MediaAsset } from "@prisma/client";
import type { PostTx } from "./post-access";
import { PortalError } from "./portal-policy";
const HOUR = 3600_000;
export async function garbage(tx: PostTx, prefix: string) {
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
    data: {
      status: "RETIRED",
      version: { increment: 1 },
      ...(asset.purpose === "SUPPORT_ATTACHMENT"
        ? { caption: "", alt: "" }
        : {})
    }
  });
  await tx.personalPhoto.updateMany({
    where: { assetId: asset.id, deletedAt: null },
    data: { deletedAt: new Date(), version: { increment: 1 } }
  });
  await garbage(tx, asset.storagePrefix);
}
