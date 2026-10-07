import type { Prisma } from "@prisma/client";
import type { PostTx } from "./post-access";
import { recordDiscoveryControl } from "./retention-controls";
import { recordDomainActivity } from "./domain-activity";

export async function recordHelpChange(
  tx: PostTx,
  requestId: string,
  actorId: string,
  action: string,
  targetId?: string,
  reason = ""
) {
  const row = await tx.interchurchHelpRequest.update({
    where: { id: requestId },
    data: { version: { increment: 1 } }
  });
  await tx.interchurchHelpEvent.create({
    data: { requestId, actorId, action, targetId, reason, version: row.version }
  });
  await recordDiscoveryControl(
    tx,
    "INTERCHURCH_HELP",
    actorId,
    requestId,
    row.version
  );
  if (targetId) {
    const offer = await tx.interchurchHelpOffer.findUnique({
      where: { id: targetId },
      include: { agreement: true }
    });
    const recipients =
      action === "SCHEDULE_CHANGED"
        ? [offer?.coordinatorId, offer?.responderId]
        : [
            offer?.responderId === actorId
              ? offer.coordinatorId
              : offer?.responderId
          ];
    if (offer)
      for (const recipientId of new Set(recipients)) {
        if (!recipientId || recipientId === actorId) continue;
        await recordDomainActivity(tx, {
          kind: "INTERCHURCH_HELP",
          category: "needs",
          sourceId: offer.id,
          sourceVersion: offer.version,
          actorId,
          recipientId
        });
      }
  }
  return row;
}
export async function revokeHelpOffers(
  tx: PostTx,
  where: Prisma.InterchurchHelpOfferWhereInput,
  actorId: string
) {
  let after: string | undefined;
  for (;;) {
    const rows = await tx.interchurchHelpOffer.findMany({
      where: {
        AND: [
          where,
          { authorityKey: { not: null } },
          ...(after ? [{ id: { gt: after } }] : [])
        ]
      },
      orderBy: { id: "asc" },
      take: 100
    });
    for (const row of rows) {
      await tx.interchurchHelpOffer.update({
        where: { id: row.id },
        data: {
          authorityKey: null,
          state: "REVOKED",
          noticeSince: null,
          endedAt: row.endedAt ?? new Date(),
          version: { increment: 1 }
        }
      });
      await tx.interchurchHelpAgreement.updateMany({
        where: {
          offerId: row.id,
          state: { in: ["NEEDS_REVIEW", "CONFIRMED"] }
        },
        data: { state: "REVOKED" }
      });
      await tx.interchurchHelpAgreement.updateMany({
        where: { offerId: row.id },
        data: {
          authorityKey: null,
          requesterContact: "",
          responderContact: "",
          requesterNoticeSince: null,
          responderNoticeSince: null,
          requesterAcknowledged: null,
          responderAcknowledged: null,
          contactVersion: { increment: 1 },
          version: { increment: 1 }
        }
      });
      await recordHelpChange(
        tx,
        row.requestId,
        actorId,
        "ACCESS_ENDED",
        row.id
      );
    }
    if (rows.length < 100) return;
    after = rows.at(-1)!.id;
  }
}
export async function invalidateHelpTerms(
  tx: PostTx,
  requestId: string,
  actorId: string
) {
  const offers = await tx.interchurchHelpOffer.findMany({
    where: { requestId, state: "SELECTED" },
    take: 101
  });
  if (offers.length > 100)
    throw Error("Ministry help agreement bound exceeded");
  for (const offer of offers) {
    await tx.interchurchHelpAgreement.updateMany({
      where: {
        offerId: offer.id,
        state: { in: ["NEEDS_REVIEW", "CONFIRMED"] }
      },
      data: {
        state: "NEEDS_REVIEW",
        requesterAcknowledged: null,
        responderAcknowledged: null,
        requesterContact: "",
        responderContact: "",
        contactVersion: { increment: 1 },
        version: { increment: 1 }
      }
    });
    await tx.interchurchHelpOffer.update({
      where: { id: offer.id },
      data: { version: { increment: 1 } }
    });
    await recordHelpChange(tx, requestId, actorId, "REQUEST_CHANGED", offer.id);
  }
}

export async function disableHelpCoordinator(
  tx: PostTx,
  where: Prisma.InterchurchHelpRequestWhereInput,
  actorId: string
) {
  let after: string | undefined;
  for (;;) {
    const rows = await tx.interchurchHelpRequest.findMany({
      where: {
        AND: [
          where,
          { coordinatorKey: { not: null } },
          ...(after ? [{ id: { gt: after } }] : [])
        ]
      },
      select: { id: true },
      orderBy: { id: "asc" },
      take: 100
    });
    for (const row of rows) {
      await tx.interchurchHelpRequest.update({
        where: { id: row.id },
        data: {
          coordinatorKey: null,
          coordinatorDisplay: "Coordinator unavailable",
          consentVersion: { increment: 1 }
        }
      });
      await recordHelpChange(tx, row.id, actorId, "COORDINATOR_ACCESS_ENDED");
    }
    if (rows.length < 100) return;
    after = rows.at(-1)!.id;
  }
}

export async function cancelHelpCommitments(
  tx: PostTx,
  requestId: string,
  actorId: string
) {
  const rows = await tx.interchurchHelpOffer.findMany({
    where: {
      requestId,
      agreement: { state: { in: ["NEEDS_REVIEW", "CONFIRMED"] } }
    },
    take: 101
  });
  if (rows.length > 100) throw Error("Ministry help agreement bound exceeded");
  for (const row of rows) {
    await tx.interchurchHelpAgreement.update({
      where: { offerId: row.id },
      data: {
        state: "CANCELED",
        canceledAt: new Date(),
        completionNote: "The requesting church canceled this request.",
        requesterAcknowledged: null,
        responderAcknowledged: null,
        requesterContact: "",
        responderContact: "",
        requesterNoticeSince: null,
        responderNoticeSince: null,
        version: { increment: 1 },
        contactVersion: { increment: 1 }
      }
    });
    await tx.interchurchHelpOffer.update({
      where: { id: row.id },
      data: { endedAt: new Date(), version: { increment: 1 } }
    });
    await recordHelpChange(tx, requestId, actorId, "REQUEST_CANCELED", row.id);
  }
}
