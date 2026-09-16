import { recordDomainActivity } from "./domain-activity";
import type {
  ExchangeInquiry,
  ExchangeInquiryState,
  Prisma
} from "@prisma/client";
import type { PostTx } from "./post-access";
import { recordDiscoveryControl } from "./retention-controls";
import {
  activeExchangeInquiry,
  heldExchangeInquiry,
  currentExchangeInquiry
} from "./exchange-handoff-policy";

export async function recordExchangeInquiry(
  tx: PostTx,
  row: ExchangeInquiry,
  actorId: string | null,
  action: string
) {
  await tx.exchangeInquiryAudit.create({
    data: {
      inquiryId: row.id,
      actorId,
      action,
      state: row.state,
      version: row.version
    }
  });
  const custodian = actorId ?? row.requesterId ?? row.receiverId;
  if (custodian)
    await recordDiscoveryControl(
      tx,
      "EXCHANGE_INQUIRY",
      custodian,
      row.id,
      row.version
    );
  if (action !== "CLEAR" && row.requesterId && row.receiverId) {
    const pairs = actorId
      ? [
          [
            actorId,
            actorId === row.requesterId ? row.receiverId : row.requesterId
          ]
        ]
      : [
          [row.requesterId, row.receiverId],
          [row.receiverId, row.requesterId]
        ];
    for (const [actor, recipient] of pairs)
      await recordDomainActivity(tx, {
        kind: action === "INQUIRE" ? "EXCHANGE_INQUIRY" : "EXCHANGE_HANDOFF",
        category: "handoffs",
        sourceId: row.id,
        sourceVersion: row.version,
        actorId: actor,
        recipientId: recipient,
        createdAt: row.updatedAt
      });
  }
}

// Explicitly selected report evidence is the only reason to retain operational
// pickup text after a hold ends. Ordinary readers never receive this copy.
async function retainedPickup(tx: PostTx, row: ExchangeInquiry) {
  return (
    !!(await tx.communityReport.findFirst({
      where: { targetType: "EXCHANGE_HANDOFF", targetId: row.id },
      select: { id: true }
    })) ||
    !!(await tx.retentionHold.findFirst({
      where: { target: "EXCHANGE_INQUIRY", targetId: row.id, releasedAt: null },
      select: { id: true }
    }))
  );
}

export async function endExchangeInquiry(
  tx: PostTx,
  row: ExchangeInquiry,
  state: ExchangeInquiryState,
  actorId: string | null,
  now = new Date(),
  cancellation?: { reason: string; note: string }
) {
  if (!activeExchangeInquiry(row.state)) return row;
  if (activeExchangeInquiry(state))
    throw new Error("A terminal inquiry state is required");
  const saved = await tx.exchangeInquiry.update({
    where: { id: row.id },
    data: {
      state,
      version: { increment: 1 },
      endedAt: now,
      wakeAt: null,
      dispatchedAt: null,
      dispatchClaimedAt: null,
      pickupDetails: (await retainedPickup(tx, row)) ? row.pickupDetails : "",
      ...(cancellation
        ? { cancelReason: cancellation.reason, cancelNote: cancellation.note }
        : {})
    }
  });
  if (heldExchangeInquiry(row.state) && row.listingId) {
    const listing = await tx.exchangeListing.findUnique({
      where: { id: row.listingId }
    });
    if (listing?.state === "RESERVED") {
      const updated = await tx.exchangeListing.update({
        where: { id: listing.id },
        data: {
          state: "CLOSED",
          version: { increment: 1 },
          visibilityVersion: { increment: 1 }
        }
      });
      const custodian = actorId ?? row.receiverId ?? row.requesterId;
      await tx.exchangeListingAudit.create({
        data: {
          listingId: listing.id,
          actorId: custodian,
          action: `HANDOFF_${state}`,
          version: updated.version
        }
      });
      if (custodian)
        await recordDiscoveryControl(
          tx,
          "EXCHANGE_VISIBILITY",
          custodian,
          listing.id,
          updated.visibilityVersion
        );
    }
  }
  await recordExchangeInquiry(tx, saved, actorId, state);
  return saved;
}

export async function settleExchangeInquiry(
  tx: PostTx,
  row: ExchangeInquiry,
  now = new Date()
) {
  if (!activeExchangeInquiry(row.state)) return row;
  if (row.expiresAt <= now)
    return endExchangeInquiry(tx, row, "EXPIRED", null, now);
  if (!(await currentExchangeInquiry(tx, row, now)))
    return endExchangeInquiry(tx, row, "REVOKED", null, now);
  return row;
}

// Called inside the canonical permission writer, so block/unblock and source
// withdrawal cannot leave a consent interval that becomes readable again.
export async function revokeExchangeInquiries(
  tx: PostTx,
  where: Prisma.ExchangeInquiryWhereInput,
  actorId: string | null
) {
  let after: string | undefined;
  for (;;) {
    const rows = await tx.exchangeInquiry.findMany({
      where: {
        AND: [
          where,
          { state: { in: ["INQUIRED", "SELECTED", "RESERVED"] } },
          ...(after ? [{ id: { gt: after } }] : [])
        ]
      },
      orderBy: { id: "asc" },
      take: 100
    });
    for (const row of rows)
      await endExchangeInquiry(tx, row, "REVOKED", actorId);
    if (rows.length < 100) return;
    after = rows.at(-1)!.id;
  }
}

export async function clearExchangeInquiry(
  tx: PostTx,
  row: ExchangeInquiry,
  actorId: string,
  now = new Date()
) {
  const data =
    row.requesterId === actorId
      ? { requesterClearedAt: now }
      : { receiverClearedAt: now };
  const saved = await tx.exchangeInquiry.update({
    where: { id: row.id },
    data: {
      ...data,
      version: { increment: 1 },
      ...((data.requesterClearedAt ||
        row.requesterClearedAt ||
        !row.requesterId) &&
      (data.receiverClearedAt || row.receiverClearedAt || !row.receiverId)
        ? { unretainedAt: now }
        : {})
    }
  });
  await recordExchangeInquiry(tx, saved, actorId, "CLEAR");
  return saved;
}
