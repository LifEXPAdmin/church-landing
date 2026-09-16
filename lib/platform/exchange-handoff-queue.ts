import type { PrismaClient } from "@prisma/client";
import { recordDomainActivity } from "./domain-activity";
import { settleExchangeInquiry } from "./exchange-handoff-lifecycle";
import { activeExchangeInquiry } from "./exchange-handoff-policy";
import { dispatchNotifications } from "./notification-queue";
import { NOTIFICATION_WORK_TOPIC } from "./notification-work-message";

const DAY = 86400000;
export const exchangeHandoffMessage = (plan: {
  id: string;
  version: number;
}) => ({ ...plan, kind: "handoff" as const });
export type HandoffPublish = (
  plan: { id: string; version: number },
  delay: number,
  key: string
) => Promise<unknown>;
const publishHandoff: HandoffPublish = async (
  plan,
  delaySeconds,
  idempotencyKey
) => {
  if (process.env.VERCEL !== "1")
    throw Error("Exchange handoff work requires the deployed queue.");
  return (await import("@vercel/queue")).send(
    NOTIFICATION_WORK_TOPIC,
    exchangeHandoffMessage(plan),
    { delaySeconds, retentionSeconds: 604800, idempotencyKey }
  );
};

export async function dispatchExchangeHandoffs(
  db: PrismaClient,
  inquiryId?: string,
  publish: HandoffPublish = publishHandoff,
  now = new Date()
) {
  const rows = await db.exchangeInquiry.findMany({
    where: {
      ...(inquiryId ? { id: inquiryId } : {}),
      recoveryRequired: false,
      state: { in: ["INQUIRED", "SELECTED", "RESERVED"] },
      wakeAt: { lte: new Date(now.getTime() + 6 * DAY) },
      AND: [
        {
          OR: [
            { dispatchedAt: null },
            { dispatchedAt: { lte: new Date(now.getTime() - 5 * DAY) } },
            {
              wakeAt: { lte: now },
              dispatchedAt: { lte: new Date(now.getTime() - 3600000) }
            }
          ]
        },
        {
          OR: [
            { dispatchClaimedAt: null },
            { dispatchClaimedAt: { lte: new Date(now.getTime() - 60000) } }
          ]
        }
      ]
    },
    orderBy: [{ wakeAt: "asc" }, { id: "asc" }],
    select: { id: true, version: true, wakeAt: true },
    take: 100
  });
  let queued = 0,
    failed = 0;
  for (let i = 0; i < rows.length; i += 8) {
    const results = await Promise.allSettled(
      rows.slice(i, i + 8).map(async (row) => {
        const claim = await db.exchangeInquiry.updateMany({
          where: {
            id: row.id,
            version: row.version,
            wakeAt: row.wakeAt,
            OR: [
              { dispatchClaimedAt: null },
              { dispatchClaimedAt: { lte: new Date(now.getTime() - 60000) } }
            ]
          },
          data: { dispatchClaimedAt: now, dispatchAttempts: { increment: 1 } }
        });
        if (!claim.count) return false;
        try {
          await publish(
            { id: row.id, version: row.version },
            Math.max(
              0,
              Math.ceil((row.wakeAt!.getTime() - now.getTime()) / 1000)
            ),
            `exchange-handoff:${row.id}:${row.version}:${row.wakeAt!.getTime()}:${Math.floor(now.getTime() / 3600000)}`
          );
          await db.exchangeInquiry.updateMany({
            where: {
              id: row.id,
              version: row.version,
              wakeAt: row.wakeAt,
              dispatchClaimedAt: now
            },
            data: {
              dispatchedAt: now,
              dispatchClaimedAt: null,
              lastDispatchErrorAt: null
            }
          });
          return true;
        } catch (error) {
          await db.exchangeInquiry.updateMany({
            where: { id: row.id, version: row.version, dispatchClaimedAt: now },
            data: { dispatchClaimedAt: null, lastDispatchErrorAt: now }
          });
          throw error;
        }
      })
    );
    for (const result of results)
      if (result.status === "rejected") failed++;
      else if (result.value) queued++;
  }
  return { queued, failed };
}

export async function advanceExchangeHandoff(
  db: PrismaClient,
  id: string,
  version: number,
  now = new Date(),
  handoff = async () => {
    const notifications = await dispatchNotifications(db, id),
      queue = await dispatchExchangeHandoffs(db, id);
    return { failed: notifications.failed + queue.failed };
  }
) {
  const result = await db.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(730221, 2)`;
      const prior = await tx.exchangeInquiry.findUnique({ where: { id } });
      if (!prior || prior.recoveryRequired)
        return { done: true, retryAfterSeconds: 0, writes: false };
      if (prior.version !== version)
        return { done: true, retryAfterSeconds: 0, writes: true };
      const row = await settleExchangeInquiry(tx, prior, now);
      if (!activeExchangeInquiry(row.state) || !row.wakeAt)
        return { done: true, retryAfterSeconds: 0, writes: true };
      if (row.wakeAt > now)
        return {
          done: false,
          retryAfterSeconds: Math.ceil(
            (row.wakeAt.getTime() - now.getTime()) / 1000
          ),
          writes: true
        };
      if (
        row.state === "RESERVED" &&
        row.remindedPlanVersion < row.planVersion
      ) {
        await tx.exchangeInquiry.update({
          where: { id },
          data: {
            remindedPlanVersion: row.planVersion,
            wakeAt: row.expiresAt,
            dispatchedAt: null,
            dispatchClaimedAt: null
          }
        });
        // One canonical event per agreed plan and recipient. Do not increment the
        // agreement version merely because a reminder worker ran.
        if (row.windowEnd! > now && row.requesterId && row.receiverId) {
          for (const [actorId, recipientId] of [
            [row.requesterId, row.receiverId],
            [row.receiverId, row.requesterId]
          ])
            await recordDomainActivity(tx, {
              kind: "EXCHANGE_REMINDER",
              category: "handoffs",
              sourceId: id,
              sourceVersion: row.version,
              actorId,
              recipientId,
              createdAt: now
            });
        }
        return { done: true, retryAfterSeconds: 0, writes: true };
      }
      return {
        done: false,
        retryAfterSeconds: Math.max(
          1,
          Math.ceil((row.expiresAt.getTime() - now.getTime()) / 1000)
        ),
        writes: true
      };
    },
    { maxWait: 10000, timeout: 15000 }
  );
  // A duplicate delivery after commit also repairs failed outbox dispatch.
  const failed = result.writes ? (await handoff()).failed : 0;
  return {
    done: result.done,
    retryAfterSeconds: result.retryAfterSeconds,
    failed
  };
}

export async function recoverExchangeHandoffs(
  db: PrismaClient,
  now = new Date(),
  limit = 20
) {
  const due = await db.exchangeInquiry.findMany({
    where: {
      recoveryRequired: false,
      state: { in: ["INQUIRED", "SELECTED", "RESERVED"] },
      wakeAt: { lte: now }
    },
    orderBy: [{ wakeAt: "asc" }, { id: "asc" }],
    select: { id: true, version: true },
    take: Math.min(100, Math.max(1, limit))
  });
  let failed = 0;
  for (const row of due)
    failed += (await advanceExchangeHandoff(db, row.id, row.version, now))
      .failed;
  return { checked: due.length, failed };
}

export function scheduleExchangeHandoffs(
  db: PrismaClient,
  id: string,
  afterResponse?: (work: () => Promise<void>) => void
) {
  if (!afterResponse) return;
  try {
    afterResponse(async () => {
      try {
        const queue = await dispatchExchangeHandoffs(db, id),
          notifications = await dispatchNotifications(db, id);
        if (queue.failed || notifications.failed)
          console.error("exchange_handoff_dispatch_incomplete");
      } catch {
        console.error("exchange_handoff_dispatch_incomplete");
      }
    });
  } catch {
    console.error("exchange_handoff_dispatch_incomplete");
  }
}
