import { randomUUID } from "node:crypto";
import type { ExchangeListing } from "@prisma/client";
import {
  recordNeedChange,
  disableNeedCoordinator
} from "./exchange-need-lifecycle";
import { needCoordinatorCurrent } from "./exchange-need-policy";
import type { PostTx } from "./post-access";
import { PortalError } from "./portal-policy";

export async function validateNeedPublication(
  tx: PostTx,
  listing: Pick<ExchangeListing, "id">
) {
  const need = await tx.exchangeNeed.findUnique({
    where: { listingId: listing.id },
    include: { slots: true }
  });
  if (!need) return;
  if (
    need.recoveryRequired ||
    need.closedAt ||
    need.canceledAt ||
    !need.deadlineAt ||
    need.deadlineAt <= new Date() ||
    !(await needCoordinatorCurrent(tx, need))
  )
    throw new PortalError(
      409,
      "Before publishing this need, choose a future deadline and deliberately accept the current coordinator responsibility. Closed needs must be repeated as new drafts."
    );
  if (
    !need.slots.length ||
    need.slots.length > 12 ||
    need.slots.every((s) => s.closedAt)
  )
    throw new PortalError(
      400,
      "Add at least one open need action before publishing."
    );
  for (const slot of need.slots) {
    if (slot.closedAt) continue;
    if (
      slot.loan &&
      (!slot.returnAt ||
        slot.returnAt <= need.deadlineAt ||
        !slot.returnResponsibility)
    )
      throw new PortalError(
        400,
        "Review every equipment loan's new return date and responsibility before publishing."
      );
    if (slot.action === "VOLUNTEER" && !slot.volunteerSlotId)
      throw new PortalError(
        400,
        "Choose a fresh canonical event role for each repeated volunteer slot."
      );
  }
}
export async function repeatNeedStructure(
  tx: PostTx,
  fromListingId: string,
  toListingId: string,
  actorId: string
) {
  const original = await tx.exchangeNeed.findUnique({
    where: { listingId: fromListingId },
    include: { slots: { orderBy: { id: "asc" }, take: 13 } }
  });
  if (!original) return;
  if (original.recoveryRequired || original.slots.length > 12)
    throw new PortalError(
      409,
      "Resolve this need's recovery or size review before repeating its structure."
    );
  const copy = await tx.exchangeNeed.create({
    data: { id: toListingId, listingId: toListingId }
  });
  for (const slot of original.slots)
    await tx.exchangeNeedSlot.create({
      data: {
        id: randomUUID(),
        needId: copy.id,
        action: slot.action,
        label: slot.label,
        unit: slot.unit,
        target: slot.target,
        loan: slot.loan
      }
    });
  await tx.exchangeListing.update({
    where: { id: toListingId },
    data: { neededBy: null }
  });
  await recordNeedChange(tx, copy.id, actorId, "REPEAT_STRUCTURE");
}
export async function withdrawNeedListing(
  tx: PostTx,
  listingId: string,
  actorId: string
) {
  const need = await tx.exchangeNeed.findUnique({ where: { listingId } });
  if (!need) return;
  await disableNeedCoordinator(tx, need.id, actorId);
  await tx.exchangeNeed.update({
    where: { id: need.id },
    data: { closedAt: new Date(), closeReason: "The listing was withdrawn." }
  });
  await recordNeedChange(tx, need.id, actorId, "SOURCE_WITHDRAWN");
}
