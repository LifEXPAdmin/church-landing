import type { Prisma, PrismaClient, CalendarOccurrence } from "@prisma/client";
import { portal, PortalError, eligibleWhere } from "./portal";
import { postContext } from "./post-access";
import { volunteerCommitmentsIn } from "./post-participation-reads";
import { calendarWindow, type CalendarSchedule } from "./calendar-time";
import {
  calendarContext,
  calendarInclude,
  eventInclude,
  calendarOwn,
  calendarCanEdit,
  calendarHas,
  sharedLevel,
  eventAccess,
  projectOccurrence,
  calendarSource,
  loadCalendarSourceNames,
  accessibleCalendarWhere,
  calendarId as id,
  type CalendarContext,
  type CalendarTx,
  type CalendarRow,
  type EventRow
} from "./calendar-access";

const MAX_AGENDA = 1000;
type Window = ReturnType<typeof calendarWindow>;
type OccurrenceRow = CalendarOccurrence & { event: EventRow };
function timeWhere(range: Window): Prisma.CalendarOccurrenceWhereInput {
  return {
    OR: [
      {
        allDay: true,
        startLocal: { lt: range.until },
        endLocal: { gt: range.from }
      },
      {
        allDay: false,
        startAt: { lt: range.endAt },
        endAt: { gt: range.startAt }
      }
    ]
  };
}
async function calendarVisible(
  tx: CalendarTx,
  context: CalendarContext,
  calendar: CalendarRow
) {
  if (calendar.archivedAt) return false;
  if (
    calendarOwn(context, calendar) ||
    context.churches.some((c) => c.id === calendar.churchId)
  )
    return true;
  if (sharedLevel(context, calendar, calendar.shares)) return true;
  if (!calendar.ownerId) return false;
  return !!(await tx.calendarEventShare.findFirst({
    where: {
      event: { calendarId: calendar.id, calendar: { owner: eligibleWhere } },
      churchId: { in: context.churches.map((c) => c.id) },
      revokedAt: null,
      connection: { userId: calendar.ownerId, state: "APPROVED" }
    },
    select: { id: true }
  }));
}
function projectCalendar(context: CalendarContext, calendar: CalendarRow) {
  const level = sharedLevel(context, calendar, calendar.shares);
  const own = calendarOwn(context, calendar);
  const canEdit = calendarCanEdit(context, calendar);
  return {
    id: calendar.id,
    name:
      own || calendar.churchId || level === "DETAILS"
        ? calendar.name
        : "Shared calendar",
    source: calendarSource(context, calendar, level),
    timeZone:
      own || calendar.churchId || level === "DETAILS"
        ? calendar.timeZone
        : undefined,
    version: canEdit ? calendar.version : undefined,
    canEdit,
    canPublish:
      !!calendar.churchId &&
      calendarHas(context, calendar.churchId, "PUBLISH_CHURCH_EVENTS"),
    own,
    ...(own
      ? {
          shares: calendar.shares.map((s) => ({
            churchId: s.churchId,
            level: s.level,
            version: s.version,
            revoked: !!s.revokedAt
          }))
        }
      : {})
  };
}
function projectChurches(context: CalendarContext) {
  return context.churches.map((c) => ({
    id: c.id,
    name: c.name,
    canCreate: calendarHas(context, c.id, "EDIT_CHURCH_CALENDAR")
  }));
}
export async function getCalendarDetails(
  db: PrismaClient,
  token: unknown,
  calendarId: string
) {
  return portal(db, token, async (tx, actor) => {
    const context = await calendarContext(tx, actor);
    const calendar = await tx.platformCalendar.findUnique({
      where: { id: id(calendarId) },
      include: calendarInclude
    });
    if (!calendar || !(await calendarVisible(tx, context, calendar)))
      throw new PortalError(404, "This calendar is not available.");
    await loadCalendarSourceNames(tx, context, [calendar]);
    return {
      calendar: projectCalendar(context, calendar),
      churches: projectChurches(context)
    };
  });
}
export async function getCalendars(
  db: PrismaClient,
  token: unknown,
  options: { churchId?: string; cursor?: string } = {}
) {
  return portal(db, token, async (tx, actor) => {
    const context = await calendarContext(tx, actor);
    if (
      options.churchId &&
      !context.churches.some((c) => c.id === id(options.churchId))
    )
      throw new PortalError(
        403,
        "An approved church connection is required for shared layers."
      );
    const rows = await tx.platformCalendar.findMany({
      where: {
        AND: [accessibleCalendarWhere(context)],
        ...(options.cursor ? { id: { gt: id(options.cursor) } } : {}),
        ...(options.churchId
          ? {
              OR: [
                { churchId: options.churchId },
                {
                  shares: {
                    some: { churchId: options.churchId, revokedAt: null }
                  }
                },
                {
                  events: {
                    some: {
                      shares: {
                        some: { churchId: options.churchId, revokedAt: null }
                      }
                    }
                  }
                }
              ]
            }
          : {})
      },
      orderBy: { id: "asc" },
      take: 21,
      include: calendarInclude
    });
    const calendars = [];
    await loadCalendarSourceNames(tx, context, rows.slice(0, 20));
    for (const calendar of rows.slice(0, 20)) {
      if (!(await calendarVisible(tx, context, calendar))) continue;
      calendars.push(projectCalendar(context, calendar));
    }
    return {
      calendars,
      cursor: rows.length > 20 ? rows[19].id : undefined,
      churches: projectChurches(context)
    };
  });
}
async function projectAgenda(
  tx: CalendarTx,
  context: CalendarContext,
  rows: OccurrenceRow[]
) {
  if (rows.length > MAX_AGENDA)
    throw new PortalError(
      409,
      "This range contains too many events. Choose fewer calendar layers or a shorter date range."
    );
  await loadCalendarSourceNames(
    tx,
    context,
    rows.map((row) => row.event.calendar)
  );
  const responses = context.actor
    ? await tx.calendarResponse.findMany({
        where: {
          userId: context.actor.id,
          occurrenceId: { in: rows.map((r) => r.id) }
        },
        select: { occurrenceId: true, state: true, version: true }
      })
    : [];
  return rows.flatMap((row) => {
    const response = responses.find((r) => r.occurrenceId === row.id);
    const dto = projectOccurrence(
      context,
      row.event,
      row,
      response
        ? { state: response.state, version: response.version }
        : undefined
    );
    return dto ? [dto] : [];
  });
}
export async function getCalendarAgenda(
  db: PrismaClient,
  token: unknown,
  options: {
    calendarIds: string[];
    from: string;
    until: string;
    timeZone: string;
  }
) {
  if (!Array.isArray(options.calendarIds) || options.calendarIds.length > 20)
    throw new PortalError(400, "Select up to twenty calendar layers.");
  const calendarIds = [...new Set(options.calendarIds.map(id))],
    range = calendarWindow(options.from, options.until, options.timeZone);
  return portal(db, token, async (tx, actor) => {
    const context = await calendarContext(tx, actor);
    const calendars = await tx.platformCalendar.findMany({
      where: { id: { in: calendarIds } },
      include: calendarInclude
    });
    if (calendars.length !== calendarIds.length)
      throw new PortalError(404, "A selected calendar is unavailable.");
    for (const calendar of calendars)
      if (!(await calendarVisible(tx, context, calendar)))
        throw new PortalError(
          403,
          "A selected calendar is no longer shared with you. Update your calendar layers."
        );
    // Apply audience restrictions before fetching event content or counting the
    // agenda limit. An independently shared event must not reveal or be blocked
    // by the owner's other private appointments.
    const audiences: Prisma.CalendarEventWhereInput[] = calendars.map(
      (calendar) => {
        if (
          calendarCanEdit(context, calendar) ||
          (calendar.churchId &&
            calendarHas(context, calendar.churchId, "PUBLISH_CHURCH_EVENTS"))
        )
          return { calendarId: calendar.id };
        if (calendar.churchId)
          return {
            calendarId: calendar.id,
            visibility: { in: ["CHURCH", "PUBLIC"] }
          };
        if (sharedLevel(context, calendar, calendar.shares))
          return { calendarId: calendar.id };
        return {
          calendarId: calendar.id,
          shares: {
            some: {
              churchId: { in: context.churches.map((c) => c.id) },
              revokedAt: null,
              connection: { userId: calendar.ownerId!, state: "APPROVED" }
            }
          }
        };
      }
    );
    const rows = await tx.calendarOccurrence.findMany({
      where: {
        ...timeWhere(range),
        event: { OR: audiences }
      },
      include: { event: { include: eventInclude } },
      orderBy: [{ startAt: "asc" }, { id: "asc" }],
      take: MAX_AGENDA + 1
    });
    return {
      from: range.from,
      until: range.until,
      timeZone: range.timeZone,
      events: await projectAgenda(tx, context, rows)
    };
  });
}
export async function getCalendarEvent(
  db: PrismaClient,
  token: unknown,
  occurrenceId: string
) {
  return portal(db, token, async (tx, actor) => {
    const context = await calendarContext(tx, actor);
    const row = await tx.calendarOccurrence.findUnique({
      where: { id: id(occurrenceId) },
      include: { event: { include: eventInclude } }
    });
    if (!row || !eventAccess(context, row.event))
      throw new PortalError(404, "This event is not available.");
    const projected = (await projectAgenda(tx, context, [row]))[0];
    const event = row.event;
    const own = calendarOwn(context, event.calendar);
    return {
      event: projected,
      churches: projectChurches(context),
      occurrences: await tx.calendarOccurrence
        .findMany({
          where: { eventId: event.id },
          select: { id: true, startLocal: true, canceledAt: true },
          orderBy: { ordinal: "asc" },
          take: 52
        })
        .then((rows) =>
          rows.map((r) => ({
            id: r.id,
            startLocal: r.startLocal,
            canceled: !!r.canceledAt || !!event.canceledAt
          }))
        ),
      ...(calendarCanEdit(context, event.calendar)
        ? {
            series: {
              id: event.id,
              title: event.title,
              description: event.description,
              location: event.location,
              onlineUrl: event.onlineUrl,
              organizer: event.organizer,
              allDay: event.allDay,
              timeZone: event.timeZone,
              startLocal: event.startLocal,
              endLocal: event.endLocal,
              weeklyUntil: event.weeklyUntil,
              version: event.version,
              visibility: event.visibility
            }
          }
        : {}),
      ...(own
        ? {
            shares: event.shares.map((s) => ({
              churchId: s.churchId,
              level: s.level,
              version: s.version,
              revoked: !!s.revokedAt
            })),
            calendarShares: event.calendar.shares.map((s) => ({
              churchId: s.churchId,
              level: s.level,
              version: s.version,
              revoked: !!s.revokedAt
            }))
          }
        : {})
    };
  });
}
export async function getPublicChurchAgenda(
  db: PrismaClient,
  options: { churchId: string; from: string; until: string; timeZone: string }
) {
  const churchId = id(options.churchId),
    range = calendarWindow(options.from, options.until, options.timeZone);
  return db.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(730221, 2)`;
      const church = await tx.church.findUnique({
        where: { id: churchId },
        select: { id: true, name: true, slug: true }
      });
      if (!church) throw new PortalError(404, "Church not found.");
      const context = await calendarContext(tx, null);
      // Filter public publication in the query, before any event content is loaded.
      const rows = await tx.calendarOccurrence.findMany({
        where: {
          ...timeWhere(range),
          event: {
            visibility: "PUBLIC",
            calendar: { churchId, archivedAt: null }
          }
        },
        include: { event: { include: eventInclude } },
        orderBy: [{ startAt: "asc" }, { id: "asc" }],
        take: MAX_AGENDA + 1
      });
      return {
        church,
        from: range.from,
        until: range.until,
        timeZone: range.timeZone,
        events: await projectAgenda(tx, context, rows)
      };
    },
    { maxWait: 10000, timeout: 15000 }
  );
}
export async function getPublicCalendarEvent(
  db: PrismaClient,
  occurrenceId: string
) {
  return db.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(730221, 2)`;
      const row = await tx.calendarOccurrence.findFirst({
        where: {
          id: id(occurrenceId),
          event: {
            visibility: "PUBLIC",
            calendar: { churchId: { not: null }, archivedAt: null }
          }
        },
        include: { event: { include: eventInclude } }
      });
      if (!row)
        throw new PortalError(404, "This public event is not available.");
      return {
        event: projectOccurrence(
          await calendarContext(tx, null),
          row.event,
          row
        )
      };
    },
    { maxWait: 10000, timeout: 15000 }
  );
}
function overlaps(
  a: CalendarOccurrence,
  b: CalendarOccurrence,
  viewerZone: string
) {
  function interval(row: CalendarOccurrence) {
    if (!row.allDay)
      return { start: row.startAt.getTime(), end: row.endAt.getTime() };
    const range = calendarWindow(row.startLocal, row.endLocal, viewerZone);
    return { start: range.startAt.getTime(), end: range.endAt.getTime() };
  }
  const x = interval(a),
    y = interval(b);
  return x.start < y.end && y.start < x.end;
}
export async function getCalendarCommitments(
  db: PrismaClient,
  token: unknown,
  options: { from: string; until: string; timeZone: string }
) {
  const range = calendarWindow(options.from, options.until, options.timeZone);
  return portal(db, token, async (tx, actor) => {
    const context = await calendarContext(tx, actor);
    const responses = await tx.calendarResponse.findMany({
      where: {
        userId: actor.id,
        state: { in: ["GOING", "MAYBE"] },
        occurrence: timeWhere(range)
      },
      include: {
        occurrence: { include: { event: { include: eventInclude } } }
      },
      take: MAX_AGENDA + 1,
      orderBy: { id: "asc" }
    });
    const ownTime = await tx.calendarOccurrence.findMany({
      where: {
        ...timeWhere(range),
        canceledAt: null,
        event: {
          canceledAt: null,
          calendar: { ownerId: actor.id, archivedAt: null }
        }
      },
      include: { event: { include: eventInclude } },
      take: MAX_AGENDA + 1
    });
    if (responses.length > MAX_AGENDA || ownTime.length > MAX_AGENDA)
      throw new PortalError(409, "Choose a shorter commitments range.");
    const visible = responses.filter((r) =>
      eventAccess(context, r.occurrence.event)
    );
    const volunteerRows = await volunteerCommitmentsIn(
      tx,
      await postContext(tx, actor.id),
      timeWhere(range)
    );
    await loadCalendarSourceNames(
      tx,
      context,
      visible.map((r) => r.occurrence.event.calendar)
    );
    const busy = [
      ...ownTime,
      ...volunteerRows.flatMap((r) =>
        r.occurrence && !r.event?.canceled ? [r.occurrence] : []
      ),
      ...visible
        .filter(
          (r) =>
            r.state === "GOING" &&
            !r.occurrence.canceledAt &&
            !r.occurrence.event.canceledAt
        )
        .map((r) => r.occurrence)
    ];
    return {
      from: range.from,
      until: range.until,
      timeZone: range.timeZone,
      volunteerCommitments: volunteerRows.map(({ occurrence, ...row }) => ({
        ...row,
        conflict:
          occurrence &&
          !row.event?.canceled &&
          busy.some(
            (other) =>
              other.id !== occurrence.id &&
              overlaps(occurrence, other, range.timeZone)
          )
            ? "You have another commitment or busy period at this time."
            : null
      })),
      commitments: visible
        .map((r) => {
          const row = r.occurrence,
            canceled = !!(row.canceledAt || row.event.canceledAt);
          return {
            ...projectOccurrence(context, row.event, row, {
              state: r.state,
              version: r.version
            })!,
            response: { state: r.state, version: r.version },
            conflict:
              !canceled &&
              r.state === "GOING" &&
              busy.some(
                (other) =>
                  other.id !== row.id && overlaps(row, other, range.timeZone)
              )
                ? "You have another commitment or busy period at this time."
                : null
          };
        })
        .sort(
          (a, b) =>
            String(a.startAt).localeCompare(String(b.startAt)) ||
            String(a.id).localeCompare(String(b.id))
        )
    };
  });
}

export type { CalendarSchedule };
