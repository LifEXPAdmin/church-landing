import type { ExchangeNeedContribution, Prisma } from "@prisma/client";
import type { PostTx } from "./post-access";
import { recordDiscoveryControl } from "./retention-controls";
import { activeNeedStates } from "./exchange-need-options";
import { currentNeedContribution } from "./exchange-need-policy";
import { recordDomainActivity, recordFanout } from "./domain-activity";

// Advancing one recovery owner in the same transaction covers every child write.
// Opaque recovery controls never need to carry a contributor or their notes.
export async function recordNeedChange(
  tx: PostTx,
  needId: string,
  actorId: string | null,
  action: string,
  details: {
    targetId?: string;
    text?: string;
    previousQuantity?: number;
    quantity?: number;
  } = {}
) {
  const need = await tx.exchangeNeed.update({
    where: { id: needId },
    data: { version: { increment: 1 } }
  });
  const event = await tx.exchangeNeedEvent.create({
    data: { needId, version: need.version, actorId, action, ...details }
  });
  const custodian = actorId ?? need.coordinatorId;
  if (custodian)
    await recordDiscoveryControl(
      tx,
      "EXCHANGE_NEED",
      custodian,
      need.id,
      need.version
    );
  if (
    actorId &&
    [
      "UPDATE",
      "DEADLINE",
      "DEADLINE_REACHED",
      "CLOSED_NEED",
      "CANCELED_NEED",
      "SLOT_CLOSED"
    ].includes(action)
  )
    await recordFanout(
      tx,
      "NEED_UPDATE",
      event.id,
      event.version,
      actorId,
      event.createdAt
    );
  if (
    actorId &&
    details.targetId &&
    [
      "COMMITTED",
      "QUOTED",
      "WAITLISTED",
      "CANCELED",
      "DECLINED",
      "ACCEPT",
      "RECEIVE",
      "RETURN-LOAN",
      "DISPUTE"
    ].includes(action)
  ) {
    const row = await tx.exchangeNeedContribution.findUnique({
      where: { id: details.targetId }
    });
    const recipientId =
      row?.contributorId === actorId ? row.coordinatorId : row?.contributorId;
    if (row && recipientId)
      await recordDomainActivity(tx, {
        kind: "NEED_CONTRIBUTION",
        category: "needs",
        sourceId: row.id,
        sourceVersion: row.version,
        actorId,
        recipientId
      });
  }
  return need;
}
export async function endNeedContribution(
  tx: PostTx,
  row: ExchangeNeedContribution,
  state: "CANCELED" | "DECLINED" | "REVOKED",
  actorId: string | null
) {
  if (!activeNeedStates.includes(row.state) && state !== "REVOKED") return row;
  const saved = await tx.exchangeNeedContribution.update({
    where: { id: row.id },
    data: {
      state: activeNeedStates.includes(row.state) ? state : row.state,
      endedAt: row.endedAt ?? new Date(),
      shareName: false,
      ...(state === "REVOKED" ? { authorityKey: null } : {}),
      version: { increment: 1 }
    }
  });
  await recordNeedChange(tx, row.needId, actorId ?? row.contributorId, state, {
    targetId: row.id
  });
  return saved;
}
export async function revokeNeedContributions(
  tx: PostTx,
  where: Prisma.ExchangeNeedContributionWhereInput,
  actorId: string | null
) {
  let after: string | undefined;
  for (;;) {
    const rows = await tx.exchangeNeedContribution.findMany({
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
    for (const row of rows)
      await endNeedContribution(tx, row, "REVOKED", actorId);
    if (rows.length < 100) return;
    after = rows.at(-1)!.id;
  }
}
export async function disableNeedCoordinator(
  tx: PostTx,
  needId: string,
  actorId: string
) {
  await revokeNeedContributions(tx, { needId }, actorId);
  await tx.exchangeNeed.update({
    where: { id: needId },
    data: { coordinatorKey: null, consentVersion: { increment: 1 } }
  });
  await recordNeedChange(tx, needId, actorId, "CONSENT_ENDED");
}
// This maintenance pass precedes commands, and commits independently of stale
// editor conflicts. A restored membership cannot revive the original epoch.
export async function settleNeedContributions(tx: PostTx, needId: string) {
  let after: string | undefined;
  for (;;) {
    const rows = await tx.exchangeNeedContribution.findMany({
      where: {
        needId,
        state: { in: activeNeedStates },
        ...(after ? { id: { gt: after } } : {})
      },
      orderBy: { id: "asc" },
      take: 100
    });
    for (const row of rows)
      if (!(await currentNeedContribution(tx, row)))
        await endNeedContribution(tx, row, "REVOKED", null);
    if (rows.length < 100) return;
    after = rows.at(-1)!.id;
  }
}
