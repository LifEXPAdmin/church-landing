import type { PrismaClient } from "@prisma/client";
import { eligibleWhere } from "./portal-policy";
import { readAccountSession } from "./accounts";
export const WELCOME_TOPIC = "founder-welcome-v1";
export type WelcomePublish = (recipientId: string) => Promise<unknown>;
const publishWelcome: WelcomePublish = async (id) => {
  if (
    process.env.VERCEL !== "1" ||
    process.env.FOUNDER_WELCOME_ENABLED !== "true"
  )
    throw Error("Founder welcome queue is not configured on this deployment.");
  const { send } = await import("@vercel/queue");
  return send(
    WELCOME_TOPIC,
    { id },
    {
      retentionSeconds: 604800,
      idempotencyKey: `${id}:${Math.floor(Date.now() / 3600000)}`
    }
  );
};
export async function dispatchPendingFounderWelcomes(
  db: PrismaClient,
  ownerId?: string,
  publish: WelcomePublish = publishWelcome
) {
  if (process.env.FOUNDER_WELCOME_ENABLED !== "true")
    return { queued: 0, failed: 0 };
  const rows = await db.platformUser.findMany({
    where: {
      ...(ownerId ? { id: ownerId } : {}),
      pendingFounderWelcomeAt: { not: null },
      ...eligibleWhere
    },
    select: { id: true },
    orderBy: [{ pendingFounderWelcomeAt: "asc" }, { id: "asc" }],
    take: 100
  });
  let queued = 0,
    failed = 0;
  for (let i = 0; i < rows.length; i += 8) {
    const results = await Promise.allSettled(
      rows.slice(i, i + 8).map((row) => publish(row.id))
    );
    for (const result of results)
      if (result.status === "fulfilled") queued++;
      else failed++;
  }
  return { queued, failed };
}
export function scheduleFounderWelcome(
  db: PrismaClient,
  token: unknown,
  afterResponse?: (work: () => Promise<void>) => void
) {
  if (!afterResponse || process.env.FOUNDER_WELCOME_ENABLED !== "true") return;
  try {
    afterResponse(async () => {
      try {
        const owner = await readAccountSession(db, token);
        if (
          owner &&
          (await dispatchPendingFounderWelcomes(db, owner.id)).failed
        )
          console.error("founder_welcome_handoff_incomplete");
      } catch {
        console.error("founder_welcome_handoff_incomplete");
      }
    });
  } catch {
    console.error("founder_welcome_handoff_incomplete");
  }
}
