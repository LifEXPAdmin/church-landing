import type { PrismaClient } from "@prisma/client";
export const ANNOUNCEMENT_TOPIC = "founder-announcement-v1";
export type AnnouncementPublish = (id: string) => Promise<unknown>;
const publishAnnouncement: AnnouncementPublish = async (id) => {
  if (
    process.env.VERCEL !== "1" ||
    process.env.FOUNDER_WELCOME_ENABLED !== "true"
  )
    throw Error(
      "Founder announcement queue is not configured on this deployment."
    );
  const { send } = await import("@vercel/queue");
  return send(
    ANNOUNCEMENT_TOPIC,
    { id },
    {
      retentionSeconds: 604800,
      idempotencyKey: `${id}:${Math.floor(Date.now() / 3600000)}`
    }
  );
};
export async function dispatchFounderAnnouncements(
  db: PrismaClient,
  id?: string,
  publish: AnnouncementPublish = publishAnnouncement
) {
  if (process.env.FOUNDER_WELCOME_ENABLED !== "true")
    return { queued: 0, failed: 0 };
  const rows = await db.founderAnnouncement.findMany({
    where: { ...(id ? { id } : {}), status: "SENDING" },
    select: { id: true },
    orderBy: [{ queuedAt: "asc" }, { id: "asc" }],
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
