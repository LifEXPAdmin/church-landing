import type { PrismaClient } from "@prisma/client";
import {
  recordNeedChange,
  settleNeedContributions
} from "./exchange-need-lifecycle";
import { needCoordinatorCurrent } from "./exchange-need-policy";

// Deadline gates are synchronous on every claim. This existing maintenance
// cycle creates the durable notice once, then the ordinary fanout queue delivers.
export async function advanceNeedDeadlines(
  db: PrismaClient,
  now = new Date(),
  limit = 20
) {
  const due = await db.exchangeNeed.findMany({
    where: {
      deadlineAt: { lte: now },
      deadlineNoticeAt: null,
      recoveryRequired: false,
      closedAt: null
    },
    orderBy: [{ deadlineAt: "asc" }, { id: "asc" }],
    select: { id: true },
    take: Math.min(100, Math.max(1, limit))
  });
  let recorded = 0;
  for (const row of due)
    recorded += await db.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(730221, 2)`;
        const need = await tx.exchangeNeed.findUnique({
          where: { id: row.id }
        });
        if (
          !need ||
          need.recoveryRequired ||
          need.deadlineNoticeAt ||
          need.closedAt ||
          !need.deadlineAt ||
          need.deadlineAt > now
        )
          return 0;
        await settleNeedContributions(tx, need.id);
        await tx.exchangeNeed.update({
          where: { id: need.id },
          data: { deadlineNoticeAt: now }
        });
        if (need.coordinatorId && (await needCoordinatorCurrent(tx, need)))
          await recordNeedChange(
            tx,
            need.id,
            need.coordinatorId,
            "DEADLINE_REACHED",
            {
              text: "The need deadline has passed. New commitments are closed. Existing receipts and equipment returns remain separate."
            }
          );
        return 1;
      },
      { maxWait: 10000, timeout: 15000 }
    );
  return { checked: due.length, recorded };
}
