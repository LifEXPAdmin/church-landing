import { Prisma, type PrismaClient } from "@prisma/client";
import { recordDomainActivity } from "./domain-activity";
import {
  calendarReminderMinutes,
  volunteerReminderMinutes,
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
  occurrenceId?: string,
  slotId?: string
) {
  const rows = await db.calendarReminderJob.findMany({
    where: {
      ...(ownerId ? { ownerId } : {}),
      ...(occurrenceId
        ? {
            owner: {
              OR: [
                { eventResponses: { some: { occurrenceId } } },
                {
                  volunteerSignups: {
                    some: {
                      slot: { post: { eventOccurrenceId: occurrenceId } }
                    }
                  }
                }
              ]
            }
          }
        : {}),
      ...(slotId ? { owner: { volunteerSignups: { some: { slotId } } } } : {}),
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
    const volunteerLead = volunteerReminderMinutes(preferences);
    if (
      (!lead && !volunteerLead) ||
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
    // A shared due-time cursor orders both sources, including different lead times.
    // RSVP keys retain their old raw IDs, preserving existing queued cursors.
    const sources: Prisma.Sql[] = [];
    if (lead)
      sources.push(Prisma.sql`
      SELECT r.id AS "sourceId", r.id AS "cursorKey", 'CALENDAR_REMINDER' AS kind,
        o.version AS "sourceVersion", o."startAt" AS "startAt",
        o."startAt" - (${lead} * interval '1 minute') AS "dueAt"
      FROM "CalendarResponse" r
      JOIN "CalendarOccurrence" o ON o.id=r."occurrenceId"
      JOIN "CalendarEvent" e ON e.id=o."eventId"
      JOIN "PlatformCalendar" c ON c.id=e."calendarId"
      WHERE r."userId"=${ownerId} AND r.state IN ('GOING','MAYBE')
        AND NOT o."allDay" AND o."canceledAt" IS NULL AND e."canceledAt" IS NULL
        AND c."archivedAt" IS NULL`);
    // Legacy shift columns are UTC timestamps without a zone; normalize them
    // before comparing with zoned occurrence instants, regardless of DB timezone.
    if (volunteerLead)
      sources.push(Prisma.sql`
      SELECT s.id AS "sourceId", 'v:' || s.id AS "cursorKey", 'VOLUNTEER_REMINDER' AS kind,
        (s.version::bigint + v.version + o.version)::double precision AS "sourceVersion",
        coalesce(v."shiftStartAt" AT TIME ZONE 'UTC',o."startAt") AS "startAt",
        coalesce(v."shiftStartAt" AT TIME ZONE 'UTC',o."startAt") - (${volunteerLead} * interval '1 minute') AS "dueAt"
      FROM "PostVolunteerSignup" s
      JOIN "PostVolunteerSlot" v ON v.id=s."slotId"
      JOIN "PlatformPost" p ON p.id=v."postId"
      JOIN "CalendarOccurrence" o ON o.id=p."eventOccurrenceId"
      JOIN "CalendarEvent" e ON e.id=o."eventId"
      JOIN "PlatformCalendar" c ON c.id=e."calendarId"
      WHERE s."userId"=${ownerId} AND s.state='ACTIVE' AND s."completedAt" IS NULL
        AND (NOT o."allDay" OR (v."shiftStartAt" IS NOT NULL AND v."shiftEndAt" IS NOT NULL))
        AND coalesce(v."shiftStartAt" AT TIME ZONE 'UTC',o."startAt") >= o."startAt"
        AND coalesce(v."shiftEndAt" AT TIME ZONE 'UTC',o."endAt") <= o."endAt"
        AND o."canceledAt" IS NULL AND e."canceledAt" IS NULL AND c."archivedAt" IS NULL`);
    type Candidate = {
      sourceId: string;
      cursorKey: string;
      kind: string;
      sourceVersion: number;
      startAt: Date;
      dueAt: Date;
    };
    const candidates = Prisma.join(sources, " UNION ALL ");
    const rows = await tx.$queryRaw<Candidate[]>(Prisma.sql`
      SELECT * FROM (${candidates}) candidate
      WHERE "startAt">${now} AND "dueAt"<=${now}
        AND ("dueAt">${job.throughAt} OR ("dueAt"=${job.throughAt} AND "cursorKey">${job.throughId}))
      ORDER BY "dueAt", "cursorKey" LIMIT 11`);
    let recorded = 0;
    for (const row of rows.slice(0, 10)) {
      if (
        !Number.isSafeInteger(row.sourceVersion) ||
        row.sourceVersion <= 0 ||
        row.sourceVersion > 2147483647
      )
        continue;
      // Each source resolver checks dated consent, current versions and access.
      if (
        await recordDomainActivity(
          tx,
          {
            kind: row.kind,
            category: "commitments",
            sourceId: row.sourceId,
            sourceVersion: row.sourceVersion,
            actorId: ownerId,
            recipientId: ownerId,
            createdAt: row.dueAt
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
        : (
            await tx.$queryRaw<Candidate[]>(Prisma.sql`
      SELECT * FROM (${candidates}) candidate WHERE "dueAt">${now}
      ORDER BY "dueAt", "cursorKey" LIMIT 1`)
          )[0];
    await tx.calendarReminderJob.update({
      where: { ownerId },
      data: {
        version: { increment: 1 },
        throughAt: rows.length > 10 ? last.dueAt : now,
        throughId: rows.length > 10 ? last.cursorKey : "",
        wakeAt: rows.length > 10 ? now : next ? next.dueAt : null,
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
      OR: [
        {
          calendarReminderMinutes: { in: [15, 60] },
          calendarReminderSince: { not: null }
        },
        {
          volunteerReminderMinutes: { in: [15, 60] },
          volunteerReminderSince: { not: null }
        }
      ],
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
