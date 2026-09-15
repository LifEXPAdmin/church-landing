import type { PrismaClient } from "@prisma/client";
import { publishScheduledPost } from "./post-commands";
import { dispatchNotificationFanout } from "./notification-fanout";
import {
  NOTIFICATION_WORK_TOPIC,
  scheduledPublicationMessage
} from "./notification-work-message";

export const SCHEDULED_PUBLICATION_TOPIC = NOTIFICATION_WORK_TOPIC;
const DAY = 86_400_000;
export type ScheduledPublish = (
  plan: { id: string; version: number },
  delaySeconds: number,
  key: string
) => Promise<unknown>;
const publishPlan: ScheduledPublish = async (plan, delaySeconds, key) => {
  if (process.env.VERCEL !== "1")
    throw Error("Scheduled publication requires the deployed queue.");
  return (await import("@vercel/queue")).send(
    SCHEDULED_PUBLICATION_TOPIC,
    scheduledPublicationMessage(plan),
    { delaySeconds, retentionSeconds: 604800, idempotencyKey: key }
  );
};

/** The canonical post owns the plan. Queue messages contain only its revision.
 * Daily maintenance rolls distant plans into a six-day horizon, leaving a day
 * for retry within the provider's seven-day TTL. Expired handoffs are repaired.
 */
export async function dispatchScheduledPosts(
  db: PrismaClient,
  actorId?: string,
  publish: ScheduledPublish = publishPlan,
  now = new Date(),
  postId?: string
) {
  const plans = await db.platformPost.findMany({
    where: {
      status: "SCHEDULED",
      ...(postId ? { id: postId } : {}),
      scheduleAt: { lte: new Date(now.getTime() + 6 * DAY) },
      ...(actorId ? { scheduledById: actorId } : {}),
      OR: [
        { scheduleDispatchedVersion: null },
        {
          NOT: {
            scheduleDispatchedVersion: {
              equals: db.platformPost.fields.version
            }
          }
        },
        { scheduleDispatchedAt: { lte: new Date(now.getTime() - 5 * DAY) } },
        {
          scheduleAt: { lte: now },
          scheduleDispatchedAt: { lte: new Date(now.getTime() - 3_600_000) }
        }
      ]
    },
    select: { id: true, version: true, scheduleAt: true },
    orderBy: [{ scheduleAt: "asc" }, { id: "asc" }],
    take: 100
  });
  let queued = 0,
    failed = 0;
  for (let i = 0; i < plans.length; i += 8) {
    const outcomes = await Promise.allSettled(
      plans.slice(i, i + 8).map(async (plan) => {
        const delay = Math.max(
          0,
          Math.ceil((plan.scheduleAt!.getTime() - now.getTime()) / 1000)
        );
        await publish(
          { id: plan.id, version: plan.version },
          delay,
          `scheduled:${plan.id}:${plan.version}:${Math.floor(now.getTime() / 3_600_000)}`
        );
        // A concurrent edit/cancel must never acknowledge the new plan with an old handoff.
        await db.platformPost.updateMany({
          where: { id: plan.id, version: plan.version, status: "SCHEDULED" },
          data: {
            scheduleDispatchedAt: now,
            scheduleDispatchedVersion: plan.version
          }
        });
      })
    );
    for (const outcome of outcomes)
      if (outcome.status === "fulfilled") queued++;
      else failed++;
  }
  return { queued, failed };
}

export async function advanceScheduledPost(
  db: PrismaClient,
  id: string,
  version: number,
  now = new Date(),
  handoff: (actorId: string) => Promise<{ failed: number }> = (actorId) =>
    dispatchNotificationFanout(db, actorId)
) {
  const result = await publishScheduledPost(db, id, version, now);
  // Retrying after commit also repairs notification handoff. Source keys and the
  // post revision prevent another publication or another recipient intent.
  const post = await db.platformPost.findFirst({
    where: { id, status: "PUBLISHED", version: { gte: version + 1 } },
    select: { authorId: true }
  });
  const failed = post ? (await handoff(post.authorId)).failed : 0;
  return { ...result, failed };
}

export function schedulePublicationHandoff(
  db: PrismaClient,
  actorId: string,
  afterResponse?: (work: () => Promise<void>) => void,
  postId?: string
) {
  if (!afterResponse) return;
  try {
    afterResponse(async () => {
      try {
        if (
          (
            await dispatchScheduledPosts(
              db,
              postId ? undefined : actorId,
              undefined,
              undefined,
              postId
            )
          ).failed
        )
          console.error("scheduled_publication_handoff_incomplete");
      } catch {
        console.error("scheduled_publication_handoff_incomplete");
      }
    });
  } catch {
    console.error("scheduled_publication_handoff_incomplete");
  }
}
