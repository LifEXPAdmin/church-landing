import type { PostTx } from "./post-access";
import { recordDiscoveryControl } from "./retention-controls";

// Called only from the existing authorized media transaction after its current
// listing authority check. Removed or changed photographs cannot reappear through
// an older restored listing without the owner's explicit publication review.
export async function recordExchangeImageChange(tx: PostTx, listingId: string, actorId: string) {
  const row = await tx.exchangeListing.update({ where: { id: listingId }, data: {
    version: { increment: 1 }, visibilityVersion: { increment: 1 }
  } });
  await tx.exchangeListingAudit.create({ data: { listingId, actorId, action: "PHOTO_CHANGE", version: row.version } });
  await recordDiscoveryControl(tx, "EXCHANGE_VISIBILITY", actorId, listingId, row.visibilityVersion);
}
