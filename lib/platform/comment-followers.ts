import type { Prisma, PrismaClient } from "@prisma/client";
import { recordCommentActivity } from "./comment-activity";
import { dispatchNotifications, type QueuePublish } from "./notification-queue";
import { NOTIFICATION_WORK_TOPIC } from "./notification-work-message";

export const COMMENT_FOLLOWER_TOPIC = NOTIFICATION_WORK_TOPIC;
export const COMMENT_FOLLOWER_BATCH = 20;
const DAY = 86400000;
export type FollowerPublish = (
  commentId: string,
  key: string
) => Promise<unknown>;
const publishFollowers: FollowerPublish = async (id, idempotencyKey) => {
  if (process.env.VERCEL !== "1")
    throw Error("Deployed conversation queue required.");
  const { send } = await import("@vercel/queue");
  return send(
    COMMENT_FOLLOWER_TOPIC,
    { id },
    { retentionSeconds: 604800, idempotencyKey }
  );
};

// A small page and its durable cursor commit together. The shared policy gate
// permits ordinary comments while serializing with follow/access revocations;
// the job row lock deduplicates competing consumers without a global write lock.
export function processCommentFollowerBatch(
  db: PrismaClient,
  commentId: string,
  now = new Date()
) {
  return db.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock_shared(730221, 2)`;
      await tx.$queryRaw`SELECT "commentId" FROM "CommentFollowerJob" WHERE "commentId" = ${commentId} FOR UPDATE`;
      const job = await tx.commentFollowerJob.findUnique({
        where: { commentId },
        include: {
          comment: {
            select: {
              authorId: true,
              postId: true,
              deletedAt: true,
              prayerUpdate: { select: { targetKey: true } }
            }
          }
        }
      });
      if (!job || job.completedAt) return { done: true, processed: 0 };
      const expired = job.createdAt.getTime() + 7 * DAY <= now.getTime();
      const recipients =
        expired || job.comment.deletedAt
          ? []
          : job.phase === "PRAYER"
            ? job.comment.prayerUpdate
              ? await tx.prayerRecord.findMany({
                  where: {
                    targetKey: job.comment.prayerUpdate.targetKey,
                    savedAt: { not: null },
                    updatesSince: { lt: job.createdAt },
                    ...(job.cursor ? { id: { gt: job.cursor } } : {})
                  },
                  select: { id: true, ownerId: true },
                  orderBy: { id: "asc" },
                  take: COMMENT_FOLLOWER_BATCH
                })
              : []
            : await tx.conversationPreference.findMany({
                where: {
                  postId: job.comment.postId,
                  mode: "FOLLOW",
                  followedAt: { lt: job.createdAt },
                  ...(job.cursor ? { id: { gt: job.cursor } } : {})
                },
                select: { id: true, ownerId: true },
                orderBy: { id: "asc" },
                take: COMMENT_FOLLOWER_BATCH
              });
      for (const recipient of recipients)
        await recordCommentActivity(
          tx,
          job.comment.authorId,
          job.comment.postId,
          commentId,
          recipient.ownerId,
          job.createdAt
        );
      const nextPrayer =
        !expired &&
        !job.comment.deletedAt &&
        job.phase === "CONVERSATIONS" &&
        recipients.length < COMMENT_FOLLOWER_BATCH &&
        !!job.comment.prayerUpdate;
      const done = recipients.length < COMMENT_FOLLOWER_BATCH && !nextPrayer;
      await tx.commentFollowerJob.update({
        where: { commentId },
        data: {
          ...(recipients.length ? { cursor: recipients.at(-1)!.id } : {}),
          ...(nextPrayer ? { phase: "PRAYER", cursor: null } : {}),
          ...(done ? { completedAt: now } : {})
        }
      });
      return { done, processed: recipients.length };
    },
    { maxWait: 10000, timeout: 15000 }
  );
}

// At most 20 recipients x 8 existing devices per page. Handoff failure retains
// the existing notification outbox for the secured maintenance repair path.
export async function advanceCommentFollowers(
  db: PrismaClient,
  commentId: string,
  publish?: QueuePublish
) {
  const result = await processCommentFollowerBatch(db, commentId);
  let failed = 0;
  for (let i = 0; i < 2; i++) {
    const sent = await dispatchNotifications(db, commentId, publish);
    failed += sent.failed;
    if (sent.failed || sent.queued < 100) break;
  }
  return { ...result, failed };
}

export async function dispatchCommentFollowers(
  db: PrismaClient,
  commentId?: string,
  publish: FollowerPublish = publishFollowers
) {
  const now = new Date();
  const rows = await db.commentFollowerJob.findMany({
    where: {
      ...(commentId ? { commentId } : {}),
      completedAt: null,
      OR: [
        { dispatchedAt: null },
        { dispatchedAt: { lt: new Date(now.getTime() - 3600000) } }
      ]
    },
    select: { commentId: true },
    orderBy: [{ createdAt: "asc" }, { commentId: "asc" }],
    take: 100
  });
  let queued = 0,
    failed = 0;
  for (let i = 0; i < rows.length; i += 8) {
    const results = await Promise.allSettled(
      rows.slice(i, i + 8).map(async (row) => {
        await publish(
          row.commentId,
          `${row.commentId}:${Math.floor(now.getTime() / 3600000)}`
        );
        await db.commentFollowerJob.updateMany({
          where: { commentId: row.commentId, completedAt: null },
          data: { dispatchedAt: now }
        });
      })
    );
    for (const result of results)
      if (result.status === "fulfilled") queued++;
      else failed++;
  }
  return { queued, failed };
}

export async function cleanCommentFollowerJobs(
  tx: Prisma.TransactionClient,
  now = new Date()
) {
  // Expired unfinished work is not replayed. Source-lived SocialEvents retain
  // recipient deduplication after the content-free continuation is removed.
  const removed = await tx.commentFollowerJob.deleteMany({
    where: {
      OR: [
        { completedAt: { lte: new Date(now.getTime() - 14 * DAY) } },
        { createdAt: { lte: new Date(now.getTime() - 21 * DAY) } }
      ]
    }
  });
  return removed.count;
}
