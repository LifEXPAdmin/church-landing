import { wakeCalendarReminders } from "./calendar-reminder-plan";
import {
  dispatchCalendarReminders,
  type CalendarReminderPublish
} from "./calendar-reminders";
import { recordExchangeSearchMatch } from "./exchange-alerts";
import { feedbackNotificationFamily } from "./feedback-notification-source";
import { feedbackFollowupEnabled } from "./feedback-followup-policy";
import type { Prisma, PrismaClient } from "@prisma/client";
import { activeRoleGrantWhere } from "./church-permissions";
import { eligibleWhere } from "./portal-policy";
import { recordDomainActivity } from "./domain-activity";
import { dispatchNotifications, type QueuePublish } from "./notification-queue";
import type { FollowerPublish } from "./comment-followers";
import {
  NOTIFICATION_WORK_TOPIC,
  notificationFanoutMessage
} from "./notification-work-message";

export const NOTIFICATION_FANOUT_TOPIC = NOTIFICATION_WORK_TOPIC;
export const NOTIFICATION_FANOUT_BATCH = 20;
const DAY = 86400000;
const publishFanout: FollowerPublish = async (id, idempotencyKey) => {
  if (process.env.VERCEL !== "1")
    throw Error("Deployed activity queue required.");
  const { send } = await import("@vercel/queue");
  return send(NOTIFICATION_FANOUT_TOPIC, notificationFanoutMessage(id), {
    retentionSeconds: 604800,
    idempotencyKey
  });
};

export function processNotificationFanoutBatch(
  db: PrismaClient,
  id: string,
  now = new Date()
) {
  return db.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock_shared(730221, 2)`;
      await tx.$queryRaw`SELECT id FROM "NotificationFanoutJob" WHERE id=${id} FOR UPDATE`;
      const job = await tx.notificationFanoutJob.findUnique({ where: { id } });
      if (!job || job.completedAt)
        return {
          done: true,
          processed: 0,
          sourceId: null,
          ...(job?.kind === "EVENT_CHANGED"
            ? { reminderSourceId: job.sourceId }
            : {})
        };
      let recipients: { id: string; ownerId: string }[] = [];
      let postId: string | null = null;
      let valid = job.createdAt.getTime() + 7 * DAY > now.getTime();
      const after = job.cursor ? { id: { gt: job.cursor } } : {};
      const page = {
        orderBy: { id: "asc" as const },
        take: NOTIFICATION_FANOUT_BATCH
      };
      if (valid && job.kind === "NEED_UPDATE") {
        const update = await tx.exchangeNeedEvent.findUnique({
          where: { id: job.sourceId },
          include: { need: true }
        });
        valid =
          !!update &&
          update.version === job.sourceVersion &&
          update.actorId === job.actorId &&
          update.createdAt.getTime() === job.createdAt.getTime() &&
          !update.need.recoveryRequired;
        if (valid && update) {
          const cutoff =
            update.action === "CANCELED_NEED"
              ? (update.need.canceledAt ?? update.createdAt)
              : update.createdAt;
          recipients =
            job.phase === "PRIMARY"
              ? (
                  await tx.exchangeNeedContribution.findMany({
                    where: {
                      needId: update.needId,
                      contributorId: { not: null },
                      authorityKey: { not: null },
                      createdAt: { lt: cutoff },
                      OR: [{ endedAt: null }, { endedAt: { gte: cutoff } }],
                      ...after
                    },
                    select: { id: true, contributorId: true },
                    ...page
                  })
                ).map((r) => ({ id: r.id, ownerId: r.contributorId! }))
              : (
                  await tx.postVolunteerSignup.findMany({
                    where: {
                      slot: { exchangeNeedSlot: { needId: update.needId } },
                      state: "ACTIVE",
                      activeSince: { lt: cutoff },
                      ...after
                    },
                    select: { id: true, userId: true },
                    ...page
                  })
                ).map((r) => ({ id: r.id, ownerId: r.userId }));
        }
      } else if (valid && job.kind === "EXCHANGE_LISTING") {
        valid = !!(await tx.exchangeListing.findFirst({
          where: {
            id: job.sourceId,
            state: "ACTIVE",
            moderationState: "VISIBLE",
            erasedAt: null,
            recoveryRequired: false,
            publishedAt: job.createdAt,
            version: { gte: job.sourceVersion }
          },
          select: { id: true }
        }));
        if (valid)
          recipients = await tx.exchangeSavedSearch.findMany({
            where: {
              deletedAt: null,
              recoveryRequired: false,
              alertsSince: { lt: job.createdAt },
              ownerId: { not: job.actorId },
              owner: eligibleWhere,
              ...after
            },
            select: { id: true, ownerId: true },
            ...page
          });
      } else if (valid && job.kind === "AUTHOR_POST") {
        const post = await tx.platformPost.findUnique({
          where: { id: job.sourceId },
          select: {
            id: true,
            status: true,
            publishedAt: true,
            authorId: true,
            authorChurchId: true
          }
        });
        valid =
          !!post &&
          post.status === "PUBLISHED" &&
          post.authorId === job.actorId &&
          post.publishedAt?.getTime() === job.createdAt.getTime();
        if (valid && post) {
          postId = post.id;
          recipients = await tx.socialRelationship.findMany({
            where: {
              ...(post.authorChurchId
                ? { churchId: post.authorChurchId }
                : { targetUserId: post.authorId }),
              authorBellSince: { lt: job.createdAt },
              blocked: false,
              ...after
            },
            select: { id: true, ownerId: true },
            ...page
          });
        }
      } else if (valid && job.kind === "CHURCH_REVIEW") {
        const connection = await tx.churchConnection.findUnique({
          where: { id: job.sourceId },
          select: { churchId: true, userId: true, state: true, version: true }
        });
        valid =
          !!connection &&
          connection.userId === job.actorId &&
          connection.state === "PENDING" &&
          connection.version === job.sourceVersion;
        if (valid && connection) {
          if (job.phase === "PRIMARY")
            recipients = (
              await tx.churchCapabilityGrant.findMany({
                where: {
                  churchId: connection.churchId,
                  capability: "REVIEW_CONNECTIONS",
                  revokedAt: null,
                  createdAt: { lte: job.createdAt },
                  userId: { not: job.actorId },
                  user: eligibleWhere,
                  ...after
                },
                select: { id: true, userId: true },
                ...page
              })
            ).map((r) => ({ id: r.id, ownerId: r.userId }));
          else
            recipients = (
              await tx.churchRoleGrant.findMany({
                where: {
                  ...activeRoleGrantWhere(),
                  churchId: connection.churchId,
                  capability: "REVIEW_CONNECTIONS",
                  createdAt: { lte: job.createdAt },
                  AND: [
                    {
                      assignment: {
                        createdAt: { lte: job.createdAt },
                        connection: { userId: { not: job.actorId } }
                      }
                    }
                  ],
                  ...after
                },
                select: {
                  id: true,
                  assignment: {
                    select: { connection: { select: { userId: true } } }
                  }
                },
                ...page
              })
            ).map((r) => ({
              id: r.id,
              ownerId: r.assignment.connection.userId
            }));
        }
      } else if (valid && job.kind === "EVENT_CHANGED") {
        valid = !!(await tx.calendarOccurrence.findFirst({
          where: { id: job.sourceId, version: { gte: job.sourceVersion } },
          select: { id: true }
        }));
        if (valid) {
          if (job.phase === "PRIMARY")
            recipients = (
              await tx.calendarResponse.findMany({
                where: {
                  occurrenceId: job.sourceId,
                  state: { in: ["GOING", "MAYBE"] },
                  updatedAt: { lte: job.createdAt },
                  ...after
                },
                select: { id: true, userId: true },
                ...page
              })
            ).map((r) => ({ id: r.id, ownerId: r.userId }));
          else
            recipients = (
              await tx.postVolunteerSignup.findMany({
                where: {
                  slot: { post: { eventOccurrenceId: job.sourceId } },
                  state: "ACTIVE",
                  updatedAt: { lte: job.createdAt },
                  ...after
                },
                select: { id: true, userId: true },
                ...page
              })
            ).map((r) => ({ id: r.id, ownerId: r.userId }));
        }
      } else if (valid && job.kind === "VOLUNTEER_REQUEST") {
        const slot = await tx.postVolunteerSlot.findFirst({
          where: {
            id: job.sourceId,
            version: { gte: job.sourceVersion },
            closedAt: null
          },
          select: { postId: true, post: { select: { authorChurchId: true } } }
        });
        valid = !!slot?.post.authorChurchId;
        if (slot?.post.authorChurchId) {
          postId = slot.postId;
          recipients = await tx.socialRelationship.findMany({
            where: {
              churchId: slot.post.authorChurchId,
              authorBellSince: { lt: job.createdAt },
              blocked: false,
              ...after
            },
            select: { id: true, ownerId: true },
            ...page
          });
        }
      } else if (valid && job.kind === "VOLUNTEER_CHANGED") {
        const slot = await tx.postVolunteerSlot.findFirst({
          where: { id: job.sourceId, version: { gte: job.sourceVersion } },
          select: { postId: true }
        });
        valid = !!slot;
        if (slot) {
          postId = slot.postId;
          recipients = (
            await tx.postVolunteerSignup.findMany({
              where: {
                slotId: job.sourceId,
                state: "ACTIVE",
                updatedAt: { lte: job.createdAt },
                ...after
              },
              select: { id: true, userId: true },
              ...page
            })
          ).map((r) => ({ id: r.id, ownerId: r.userId }));
        }
      } else if (
        valid &&
        job.kind === "FEEDBACK_IDEA" &&
        feedbackFollowupEnabled()
      ) {
        const proof = await tx.feedbackIdeaEvent.findFirst({
          where: {
            ideaId: job.sourceId,
            version: job.sourceVersion,
            actorId: job.actorId,
            createdAt: job.createdAt,
            action: "STATUS"
          },
          select: { id: true }
        });
        const family = proof
          ? await feedbackNotificationFamily(tx, job.sourceId, job.createdAt)
          : [];
        if (family.length)
          recipients = (
            await tx.feedbackIdeaSubscription.findMany({
              where: {
                ideaId: { in: family },
                user: eligibleWhere,
                OR: [
                  { inAppSince: { lt: job.createdAt } },
                  { emailSince: { lt: job.createdAt } },
                  { pushSince: { lt: job.createdAt } }
                ],
                ...after
              },
              select: { id: true, userId: true },
              ...page
            })
          ).map((r) => ({ id: r.id, ownerId: r.userId }));
        else valid = false;
      } else valid = false;
      // One bounded consent read avoids work for the default-Off audience.
      const reminderOwners =
        job.kind === "EVENT_CHANGED" &&
        job.phase === "PRIMARY" &&
        recipients.length
          ? await tx.socialPreferences.findMany({
              where: {
                ownerId: { in: recipients.map((r) => r.ownerId) },
                calendarReminderMinutes: { in: [15, 60] },
                calendarReminderSince: { not: null },
                notificationRecoveryRequired: false
              },
              select: { ownerId: true },
              orderBy: { ownerId: "asc" },
              take: NOTIFICATION_FANOUT_BATCH
            })
          : [];
      for (const owner of reminderOwners)
        await wakeCalendarReminders(tx, owner.ownerId, false, now);
      for (const recipient of recipients) {
        if (recipient.ownerId === job.actorId) continue;
        if (job.kind === "EXCHANGE_LISTING") {
          await recordExchangeSearchMatch(tx, job, recipient.id);
          continue;
        }
        await recordDomainActivity(tx, {
          kind: job.kind,
          sourceId: job.sourceId,
          sourceVersion: job.sourceVersion,
          actorId: job.actorId,
          recipientId: recipient.ownerId,
          postId,
          createdAt: job.createdAt,
          category:
            job.kind === "NEED_UPDATE"
              ? "needs"
              : job.kind === "FEEDBACK_IDEA"
                ? "feedback"
                : job.kind === "AUTHOR_POST"
                  ? "posts"
                  : job.kind === "CHURCH_REVIEW"
                    ? "church"
                    : "commitments"
        });
      }
      const nextPhase =
        valid &&
        job.phase === "PRIMARY" &&
        ["EVENT_CHANGED", "CHURCH_REVIEW", "NEED_UPDATE"].includes(job.kind) &&
        recipients.length < NOTIFICATION_FANOUT_BATCH;
      const done = recipients.length < NOTIFICATION_FANOUT_BATCH && !nextPhase;
      await tx.notificationFanoutJob.update({
        where: { id },
        data: {
          ...(recipients.length ? { cursor: recipients.at(-1)!.id } : {}),
          ...(nextPhase ? { phase: "SECONDARY", cursor: null } : {}),
          ...(done ? { completedAt: now } : {})
        }
      });
      return {
        done,
        processed: recipients.length,
        sourceId: job.sourceId,
        ...(job.kind === "EVENT_CHANGED"
          ? { reminderSourceId: job.sourceId }
          : {})
      };
    },
    { maxWait: 10000, timeout: 15000 }
  );
}
export async function advanceNotificationFanout(
  db: PrismaClient,
  id: string,
  publish?: QueuePublish,
  reminderPublish?: CalendarReminderPublish
) {
  const result = await processNotificationFanoutBatch(db, id);
  let failed = 0;
  if (result.sourceId)
    for (let i = 0; i < 2; i++) {
      const sent = await dispatchNotifications(db, result.sourceId, publish);
      failed += sent.failed;
      if (sent.failed || sent.queued < 100) break;
    }
  // Recover every pending owner touched by this occurrence, including earlier
  // batches whose database commit succeeded but queue handoff failed.
  const reminders = result.reminderSourceId
    ? await dispatchCalendarReminders(
        db,
        undefined,
        reminderPublish,
        new Date(),
        result.reminderSourceId
      )
    : { queued: 0, failed: 0 };
  failed += reminders.failed;
  return { ...result, done: result.done && reminders.queued < 100, failed };
}
export async function dispatchNotificationFanout(
  db: PrismaClient,
  actorId?: string,
  publish: FollowerPublish = publishFanout
) {
  const now = new Date();
  const jobs = await db.notificationFanoutJob.findMany({
    where: {
      ...(actorId ? { actorId } : {}),
      completedAt: null,
      OR: [
        { dispatchedAt: null },
        { dispatchedAt: { lt: new Date(now.getTime() - 3600000) } }
      ]
    },
    select: { id: true },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: 100
  });
  let queued = 0,
    failed = 0;
  for (let i = 0; i < jobs.length; i += 8) {
    const results = await Promise.allSettled(
      jobs.slice(i, i + 8).map(async (job) => {
        await publish(
          job.id,
          `activity:${job.id}:${Math.floor(now.getTime() / 3600000)}`
        );
        await db.notificationFanoutJob.updateMany({
          where: { id: job.id, completedAt: null },
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
export async function cleanNotificationFanout(
  tx: Prisma.TransactionClient,
  now = new Date()
) {
  return (
    await tx.notificationFanoutJob.deleteMany({
      where: {
        OR: [
          { completedAt: { lte: new Date(now.getTime() - 14 * DAY) } },
          { createdAt: { lte: new Date(now.getTime() - 21 * DAY) } }
        ]
      }
    })
  ).count;
}

export function scheduleDomainActivity(
  db: PrismaClient,
  actorId: string,
  afterResponse?: (work: () => Promise<void>) => void
) {
  if (!afterResponse) return;
  try {
    afterResponse(async () => {
      try {
        const jobs = await db.notificationFanoutJob.findMany({
          where: { actorId, completedAt: null },
          select: { id: true },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          take: 2
        });
        for (const job of jobs) await advanceNotificationFanout(db, job.id);
        if (
          (await dispatchNotifications(db, undefined, undefined, actorId))
            .failed
        )
          console.error("domain_activity_delivery_handoff_incomplete");
        if ((await dispatchCalendarReminders(db, actorId)).failed)
          console.error("calendar_reminder_handoff_incomplete");
        if ((await dispatchNotificationFanout(db, actorId)).failed)
          console.error("domain_activity_handoff_incomplete");
      } catch {
        console.error("domain_activity_handoff_incomplete");
      }
    });
  } catch {
    console.error("domain_activity_handoff_incomplete");
  }
}
