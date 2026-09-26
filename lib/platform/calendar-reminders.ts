import type { PrismaClient } from "@prisma/client";
import { recordDomainActivity } from "./domain-activity";
import {
  calendarReminderMinutes,
  wakeCalendarReminders
} from "./calendar-reminder-plan";
import { eligibleWhere } from "./portal-policy";
import { notificationWrite } from "./notification-outbox";
import { dispatchNotifications } from "./notification-queue";
import { NOTIFICATION_WORK_TOPIC } from "./notification-work-message";

const DAY = 86400000;
export const calendarReminderMessage = (plan: {
  id: string;
  version: number;
}) => ({ ...plan, kind: "calendar-reminder" as const });
export type CalendarReminderPublish = (
  plan: { id: string; version: number },
  delaySeconds: number,
  key: string
) => Promise<unknown>;
const publishReminder: CalendarReminderPublish = async (
  plan,
  delaySeconds,
  idempotencyKey
) => {
  if (process.env.VERCEL !== "1")
    throw Error("Calendar reminder work requires the deployed queue.");
  return (await import("@vercel/queue")).send(
    NOTIFICATION_WORK_TOPIC,
    calendarReminderMessage(plan),
    { delaySeconds, retentionSeconds: 604800, idempotencyKey }
  );
};

export async function dispatchCalendarReminders(
  db: PrismaClient,
  ownerId?: string,
  publish: CalendarReminderPublish = publishReminder,
  now = new Date(),
  occurrenceId?: string
) {
  const rows = await db.calendarReminderJob.findMany({
    where: {
      ...(ownerId ? { ownerId } : {}),
      ...(occurrenceId
        ? { owner: { eventResponses: { some: { occurrenceId } } } }
        : {}),
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
    orderBy: [{ wakeAt: "asc" }, { ownerId: "asc" }],
    take: 100
  });
  let queued = 0,
    failed = 0;
  for (let i = 0; i < rows.length; i += 8) {
    const results = await Promise.allSettled(
      rows.slice(i, i + 8).map(async (row) => {
        const claim = await db.calendarReminderJob.updateMany({
          where: {
            ownerId: row.ownerId,
            version: row.version,
            wakeAt: row.wakeAt,
            dispatchedAt: row.dispatchedAt,
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
            { id: row.ownerId, version: row.version },
            Math.max(
              0,
              Math.ceil((row.wakeAt!.getTime() - now.getTime()) / 1000)
            ),
            `calendar-reminder:${row.ownerId}:${row.version}:${row.wakeAt!.getTime()}:${Math.floor(now.getTime() / 3600000)}`
          );
          await db.calendarReminderJob.updateMany({
            where: {
              ownerId: row.ownerId,
              version: row.version,
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
          await db.calendarReminderJob.updateMany({
            where: {
              ownerId: row.ownerId,
              version: row.version,
              dispatchClaimedAt: now
            },
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

export async function advanceCalendarReminders(
  db: PrismaClient,
  ownerId: string,
  version: number,
  now = new Date(),
  handoff = async () => {
    const deliveries = await dispatchNotifications(
      db,
      undefined,
      undefined,
      ownerId
    );
    const jobs = await dispatchCalendarReminders(db, ownerId);
    return { failed: deliveries.failed + jobs.failed };
  }
) {
  const result = await notificationWrite(db, async (tx) => {
    const job = await tx.calendarReminderJob.findUnique({ where: { ownerId } });
    if (!job)
      return { checked: 0, recorded: 0, retryAfterSeconds: 0, handoff: false };
    if (job.version !== version)
      return { checked: 0, recorded: 0, retryAfterSeconds: 0, handoff: true };
    const preferences = await tx.socialPreferences.findUnique({
      where: { ownerId }
    });
    const lead = calendarReminderMinutes(preferences);
    if (
      !lead ||
      !(await tx.platformUser.findFirst({
        where: { id: ownerId, ...eligibleWhere },
        select: { id: true }
      }))
    ) {
      await tx.calendarReminderJob.delete({ where: { ownerId } });
      return { checked: 0, recorded: 0, retryAfterSeconds: 0, handoff: false };
    }
    if (!job.wakeAt)
      return { checked: 0, recorded: 0, retryAfterSeconds: 0, handoff: false };
    if (job.wakeAt > now)
      return {
        checked: 0,
        recorded: 0,
        retryAfterSeconds: Math.ceil(
          (job.wakeAt.getTime() - now.getTime()) / 1000
        ),
        handoff: false
      };
    const offset = lead * 60000,
      cursorStart = new Date(job.throughAt.getTime() + offset),
      dueThrough = new Date(now.getTime() + offset);
    const source = {
      allDay: false,
      canceledAt: null,
      event: { canceledAt: null, calendar: { archivedAt: null } }
    };
    const rows = await tx.calendarResponse.findMany({
      where: {
        userId: ownerId,
        state: { in: ["GOING", "MAYBE"] },
        occurrence: { ...source, startAt: { gt: now, lte: dueThrough } },
        OR: [
          { occurrence: { startAt: { gt: cursorStart } } },
          { occurrence: { startAt: cursorStart }, id: { gt: job.throughId } }
        ]
      },
      include: { occurrence: { select: { startAt: true, version: true } } },
      orderBy: [{ occurrence: { startAt: "asc" } }, { id: "asc" }],
      take: 11
    });
    let recorded = 0;
    for (const row of rows.slice(0, 10)) {
      const due = new Date(row.occurrence.startAt.getTime() - offset);
      if (row.updatedAt >= due || preferences!.calendarReminderSince! >= due)
        continue;
      // The source resolver rechecks current event version, access and consent.
      if (
        await recordDomainActivity(
          tx,
          {
            kind: "CALENDAR_REMINDER",
            category: "commitments",
            sourceId: row.id,
            sourceVersion: row.occurrence.version,
            actorId: ownerId,
            recipientId: ownerId,
            createdAt: due
          },
          now
        )
      )
        recorded++;
    }
    const last = rows[9];
    const next =
      rows.length > 10
        ? null
        : await tx.calendarResponse.findFirst({
            where: {
              userId: ownerId,
              state: { in: ["GOING", "MAYBE"] },
              occurrence: { ...source, startAt: { gt: dueThrough } }
            },
            select: { occurrence: { select: { startAt: true } } },
            orderBy: [{ occurrence: { startAt: "asc" } }, { id: "asc" }]
          });
    await tx.calendarReminderJob.update({
      where: { ownerId },
      data: {
        version: { increment: 1 },
        throughAt:
          rows.length > 10
            ? new Date(last.occurrence.startAt.getTime() - offset)
            : now,
        throughId: rows.length > 10 ? last.id : "",
        wakeAt:
          rows.length > 10
            ? now
            : next
              ? new Date(next.occurrence.startAt.getTime() - offset)
              : null,
        dispatchedAt: null,
        dispatchClaimedAt: null
      }
    });
    return {
      checked: Math.min(10, rows.length),
      recorded,
      retryAfterSeconds: 0,
      handoff: true
    };
  });
  const dispatch = result.handoff ? await handoff() : { failed: 0 };
  return { ...result, failed: dispatch.failed };
}

export async function recoverCalendarReminders(
  db: PrismaClient,
  now = new Date()
) {
  const rows = await db.socialPreferences.findMany({
    where: {
      calendarReminderMinutes: { in: [15, 60] },
      calendarReminderSince: { not: null },
      notificationRecoveryRequired: false,
      owner: { ...eligibleWhere, calendarReminderJob: null }
    },
    select: { ownerId: true },
    orderBy: { ownerId: "asc" },
    take: 20
  });
  for (const row of rows)
    await notificationWrite(db, (tx) =>
      wakeCalendarReminders(tx, row.ownerId, false, now)
    );
  return { checked: rows.length };
}

export function scheduleCalendarReminders(
  db: PrismaClient,
  ownerId: string,
  afterResponse?: (work: () => Promise<void>) => void
) {
  if (!afterResponse) return;
  try {
    afterResponse(async () => {
      try {
        if ((await dispatchCalendarReminders(db, ownerId)).failed)
          console.error("calendar_reminder_handoff_incomplete");
      } catch {
        console.error("calendar_reminder_handoff_incomplete");
      }
    });
  } catch {
    console.error("calendar_reminder_handoff_incomplete");
  }
}
