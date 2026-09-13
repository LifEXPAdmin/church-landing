import type { PrismaClient } from "@prisma/client";
import { pushAvailable } from "./push-config";
export const PUSH_TOPIC = "phone-notification-v1";
export type QueuePublish = (
  id: string,
  delaySeconds: number,
  key: string
) => Promise<unknown>;
export const publishPush: QueuePublish = async (
  id,
  delaySeconds,
  idempotencyKey
) => {
  if (process.env.VERCEL !== "1" || !pushAvailable())
    throw Error("Notification queue is not configured on this deployment.");
  const { send } = await import("@vercel/queue");
  return send(
    PUSH_TOPIC,
    { id },
    { delaySeconds, retentionSeconds: 604800, idempotencyKey }
  );
};
export async function dispatchNotifications(
  db: PrismaClient,
  sourceId?: string,
  publish: QueuePublish = publishPush
) {
  if (!pushAvailable()) return { queued: 0, failed: 0 };
  const now = new Date();
  const rows = await db.notificationDelivery.findMany({
    where: {
      state: { not: "FINISHED" },
      expiresAt: { gt: now },
      AND: [
        {
          OR: [
            { dispatchedAt: null },
            { dispatchedAt: { lt: new Date(now.getTime() - 3600000) } }
          ]
        }
      ],
      ...(sourceId
        ? {
            event: {
              OR: [
                { messageId: sourceId },
                { requestId: sourceId },
                { reportId: sourceId },
                { id: sourceId }
              ]
            }
          }
        : {}),
      OR: [
        { state: "QUEUED" },
        { state: "IN_FLIGHT", leaseUntil: { lte: now } }
      ]
    },
    select: { id: true, availableAt: true, attempts: true },
    orderBy: [{ availableAt: "asc" }, { id: "asc" }],
    take: 100
  });
  let queued = 0,
    failed = 0;
  // Bounded groups avoid saturating the database/provider from one request.
  for (let i = 0; i < rows.length; i += 8) {
    const results = await Promise.allSettled(
      rows
        .slice(i, i + 8)
        .map((row) =>
          publish(
            row.id,
            Math.min(
              604799,
              Math.max(
                0,
                Math.ceil((row.availableAt.getTime() - now.getTime()) / 1000)
              )
            ),
            `${row.id}:${row.attempts}:${Math.floor(now.getTime() / 3600000)}`
          )
        )
    );
    for (let j = 0; j < results.length; j++) {
      if (results[j].status === "fulfilled") {
        queued++;
        await db.notificationDelivery.updateMany({
          where: { id: rows[i + j].id, state: { not: "FINISHED" } },
          data: { dispatchedAt: now }
        });
      } else failed++;
    }
  }
  return { queued, failed };
}
