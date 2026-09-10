import type {
  PrismaClient,
  CalendarVisibility,
  CalendarShareLevel
} from "@prisma/client";
import { portal, expected, PortalError } from "./portal";
import { calendarZone, expandCalendarSchedule } from "./calendar-time";
import {
  calendarContext,
  calendarInclude,
  eventInclude,
  calendarHas,
  calendarOwn,
  requireCalendarEdit,
  eventAccess,
  calendarField as field,
  calendarId as id,
  type CalendarContext,
  type CalendarTx,
  type EventRow
} from "./calendar-access";

async function audit(
  tx: CalendarTx,
  actorId: string,
  calendarId: string,
  targetId: string,
  action: string,
  version: number
) {
  await tx.calendarAudit.create({
    data: { actorId, calendarId, targetId, action, version }
  });
}
function detail(input: Record<string, unknown>) {
  const onlineUrl = field(input.onlineUrl ?? "", 2000, true);
  if (onlineUrl) {
    let url: URL;
    try {
      url = new URL(onlineUrl);
    } catch {
      throw new PortalError(400, "Enter a complete https or http online link.");
    }
    if (
      !["https:", "http:"].includes(url.protocol) ||
      url.username ||
      url.password
    )
      throw new PortalError(
        400,
        "Use an https or http online link without credentials."
      );
  }
  return {
    title: field(input.title, 160),
    description: field(input.description ?? "", 5000, true),
    location: field(input.location ?? "", 300, true),
    onlineUrl,
    organizer: field(input.organizer ?? "", 100, true)
  };
}
function requirePublishedEdit(context: CalendarContext, event: EventRow) {
  requireCalendarEdit(context, event.calendar);
  if (
    event.visibility !== "PRIVATE" &&
    (!event.calendar.churchId ||
      !calendarHas(context, event.calendar.churchId, "PUBLISH_CHURCH_EVENTS"))
  )
    throw new PortalError(
      403,
      "Editing an event shared with church members or the public also requires publication permission. Ask its publisher to return it to a private draft first."
    );
}
function visibility(
  context: CalendarContext,
  churchId: string | null,
  input: unknown
): CalendarVisibility {
  if (!["PRIVATE", "CHURCH", "PUBLIC"].includes(String(input)))
    throw new PortalError(400, "Choose a supported event visibility.");
  if (!churchId && input !== "PRIVATE")
    throw new PortalError(
      400,
      "Personal events stay private. Use an explicit calendar or event share."
    );
  if (
    input !== "PRIVATE" &&
    (!churchId || !calendarHas(context, churchId, "PUBLISH_CHURCH_EVENTS"))
  )
    throw new PortalError(
      403,
      "Publishing church events requires a separate permission."
    );
  return input as CalendarVisibility;
}
export async function calendarCommand(
  db: PrismaClient,
  token: unknown,
  input: Record<string, unknown>
) {
  return portal(db, token, async (tx, actor) => {
    const context = await calendarContext(tx, actor),
      op = input.operation;
    if (op === "create-calendar") {
      const churchId = input.churchId ? id(input.churchId) : null;
      if (churchId && !calendarHas(context, churchId, "EDIT_CHURCH_CALENDAR"))
        throw new PortalError(
          403,
          "An approved church calendar editor must create this calendar."
        );
      const requestKey = id(input.requestKey);
      const prior = await tx.platformCalendar.findUnique({
        where: { creatorId_requestKey: { creatorId: actor.id, requestKey } },
        include: calendarInclude
      });
      if (prior) {
        requireCalendarEdit(context, prior);
        return { id: prior.id, message: "This calendar was already saved." };
      }
      if (
        (await tx.platformCalendar.count({
          where: {
            archivedAt: null,
            ...(churchId ? { churchId } : { ownerId: actor.id })
          }
        })) >= 20
      )
        throw new PortalError(
          409,
          "Use up to twenty active calendars for one person or church."
        );
      const row = await tx.platformCalendar.create({
        data: {
          ownerId: churchId ? null : actor.id,
          churchId,
          creatorId: actor.id,
          requestKey,
          name: field(input.name, 100),
          timeZone: calendarZone(input.timeZone)
        }
      });
      await audit(tx, actor.id, row.id, row.id, "CREATE_CALENDAR", row.version);
      return {
        id: row.id,
        message:
          "Calendar created. Personal events are private until you deliberately share them."
      };
    }
    if (op === "withdraw-response") {
      const prior = await tx.calendarResponse.findUnique({
        where: {
          occurrenceId_userId: {
            occurrenceId: id(input.occurrenceId),
            userId: actor.id
          }
        },
        include: {
          occurrence: { select: { event: { select: { calendarId: true } } } }
        }
      });
      if (!prior) throw new PortalError(404, "Your response was not found.");
      expected(input.expectedVersion, prior.version);
      await tx.calendarResponse.update({
        where: { id: prior.id },
        data: { state: "DECLINED", version: { increment: 1 } }
      });
      await audit(
        tx,
        actor.id,
        prior.occurrence.event.calendarId,
        prior.id,
        "WITHDRAW_RESPONSE",
        prior.version + 1
      );
      return { id: prior.occurrenceId, message: "Your commitment has ended." };
    }
    if (
      [
        "rename-calendar",
        "archive-calendar",
        "create-event",
        "share-calendar",
        "revoke-calendar-share"
      ].includes(String(op))
    ) {
      const calendar = await tx.platformCalendar.findUnique({
        where: { id: id(input.calendarId) },
        include: calendarInclude
      });
      if (!calendar) throw new PortalError(404, "Calendar not found.");
      requireCalendarEdit(context, calendar);
      if (op === "create-event") {
        const requestKey = id(input.requestKey);
        const prior = await tx.calendarEvent.findUnique({
          where: {
            calendarId_requestKey: { calendarId: calendar.id, requestKey }
          },
          select: {
            id: true,
            occurrences: {
              select: { id: true },
              orderBy: { ordinal: "asc" },
              take: 1
            }
          }
        });
        if (prior)
          return {
            id: prior.id,
            occurrenceId: prior.occurrences[0]?.id,
            message: "This event was already saved."
          };
        expected(input.expectedVersion, calendar.version);
        if (
          (await tx.calendarEvent.count({
            where: { calendarId: calendar.id, canceledAt: null }
          })) >= 500
        )
          throw new PortalError(
            409,
            "This calendar has reached 500 active event series. Cancel an unused series first."
          );
        const schedule = expandCalendarSchedule(input),
          data = detail(input);
        const row = await tx.calendarEvent.create({
          data: {
            calendarId: calendar.id,
            requestKey,
            ...data,
            ...schedule.schedule,
            visibility: visibility(
              context,
              calendar.churchId,
              input.visibility ?? "PRIVATE"
            ),
            occurrences: {
              create: schedule.occurrences.map((time) => ({ ...data, ...time }))
            }
          },
          include: {
            occurrences: {
              select: { id: true },
              orderBy: { ordinal: "asc" },
              take: 1
            }
          }
        });
        await tx.platformCalendar.update({
          where: { id: calendar.id },
          data: { version: { increment: 1 } }
        });
        await audit(
          tx,
          actor.id,
          calendar.id,
          row.id,
          "CREATE_EVENT",
          row.version
        );
        return {
          id: row.id,
          occurrenceId: row.occurrences[0]?.id,
          message:
            "Event saved. No invitations or external reminders were sent."
        };
      }
      if (op === "share-calendar" || op === "revoke-calendar-share") {
        if (!calendarOwn(context, calendar))
          throw new PortalError(
            403,
            "Only the personal calendar owner can share it."
          );
        const churchId = id(input.churchId),
          connection = context.churches.find((c) => c.id === churchId);
        const prior = await tx.calendarShare.findUnique({
          where: { calendarId_churchId: { calendarId: calendar.id, churchId } }
        });
        expected(input.expectedVersion, prior?.version ?? 0);
        if (op === "revoke-calendar-share") {
          if (!prior || prior.revokedAt)
            throw new PortalError(404, "Active calendar share not found.");
          await tx.calendarShare.update({
            where: { id: prior.id },
            data: { revokedAt: new Date(), version: { increment: 1 } }
          });
          await audit(
            tx,
            actor.id,
            calendar.id,
            prior.id,
            "REVOKE_CALENDAR_SHARE",
            prior.version + 1
          );
          return {
            id: calendar.id,
            message:
              "This calendar share has ended. Separate event shares are unchanged."
          };
        }
        if (!connection)
          throw new PortalError(
            403,
            "An approved connection to this church is required to share a calendar."
          );
        if (
          !["BUSY", "DETAILS"].includes(String(input.level)) ||
          input.confirmed !== true
        )
          throw new PortalError(
            400,
            "Choose busy-only or event details and confirm this calendar share."
          );
        const data = {
          level: input.level as CalendarShareLevel,
          connectionId: connection.connectionId,
          revokedAt: null
        };
        const share = await tx.calendarShare.upsert({
          where: { calendarId_churchId: { calendarId: calendar.id, churchId } },
          create: { calendarId: calendar.id, churchId, ...data },
          update: { ...data, version: { increment: 1 } }
        });
        await audit(
          tx,
          actor.id,
          calendar.id,
          share.id,
          "SHARE_CALENDAR",
          share.version
        );
        return {
          id: calendar.id,
          message:
            "Your selected calendar sharing is saved. Other calendars are unchanged."
        };
      }
      expected(input.expectedVersion, calendar.version);
      if (op === "archive-calendar") {
        if (
          input.confirmed !== true ||
          (await tx.calendarEvent.count({
            where: { calendarId: calendar.id, canceledAt: null }
          }))
        )
          throw new PortalError(
            409,
            "Cancel the calendar’s event series and confirm before archiving it."
          );
        await tx.platformCalendar.update({
          where: { id: calendar.id },
          data: { archivedAt: new Date(), version: { increment: 1 } }
        });
      } else
        await tx.platformCalendar.update({
          where: { id: calendar.id },
          data: {
            name: field(input.name, 100),
            timeZone: calendarZone(input.timeZone),
            version: { increment: 1 }
          }
        });
      await audit(
        tx,
        actor.id,
        calendar.id,
        calendar.id,
        String(op).toUpperCase().replaceAll("-", "_"),
        calendar.version + 1
      );
      return {
        id: calendar.id,
        message: "Calendar saved. Existing event times were not changed."
      };
    }
    const event = await tx.calendarEvent.findUnique({
      where: { id: id(input.eventId) },
      include: eventInclude
    });
    if (!event) throw new PortalError(404, "Event not found.");
    if (op === "share-event" || op === "revoke-event-share") {
      if (!calendarOwn(context, event.calendar) || event.calendar.archivedAt)
        throw new PortalError(
          403,
          "Only this personal event’s owner can share it."
        );
      const churchId = id(input.churchId),
        connection = context.churches.find((c) => c.id === churchId);
      const prior = await tx.calendarEventShare.findUnique({
        where: { eventId_churchId: { eventId: event.id, churchId } }
      });
      expected(input.expectedVersion, prior?.version ?? 0);
      if (op === "revoke-event-share") {
        if (!prior || prior.revokedAt)
          throw new PortalError(404, "Active event share not found.");
        await tx.calendarEventShare.update({
          where: { id: prior.id },
          data: { revokedAt: new Date(), version: { increment: 1 } }
        });
        await audit(
          tx,
          actor.id,
          event.calendarId,
          prior.id,
          "REVOKE_EVENT_SHARE",
          prior.version + 1
        );
        return {
          id: event.id,
          message:
            "This event share has ended. A separate calendar share, if present, still applies."
        };
      }
      if (!connection || event.canceledAt)
        throw new PortalError(
          403,
          "An active event and approved church connection are required."
        );
      if (
        !["BUSY", "DETAILS"].includes(String(input.level)) ||
        input.confirmed !== true
      )
        throw new PortalError(
          400,
          "Choose busy-only or event details and confirm this event share."
        );
      const data = {
        level: input.level as CalendarShareLevel,
        connectionId: connection.connectionId,
        revokedAt: null
      };
      const share = await tx.calendarEventShare.upsert({
        where: { eventId_churchId: { eventId: event.id, churchId } },
        create: { eventId: event.id, churchId, ...data },
        update: { ...data, version: { increment: 1 } }
      });
      await audit(
        tx,
        actor.id,
        event.calendarId,
        share.id,
        "SHARE_EVENT",
        share.version
      );
      return {
        id: event.id,
        message:
          "Only this event series is shared. Other event shares and calendar sharing are unchanged."
      };
    }
    if (op === "rsvp") {
      const access = eventAccess(context, event);
      if (!access || access === "BUSY")
        throw new PortalError(
          403,
          "Event details access is required to respond."
        );
      const occurrence = await tx.calendarOccurrence.findFirst({
        where: { id: id(input.occurrenceId), eventId: event.id }
      });
      if (!occurrence) throw new PortalError(404, "Occurrence not found.");
      if (event.canceledAt || occurrence.canceledAt)
        throw new PortalError(
          409,
          "This event is canceled and cannot accept a new response."
        );
      if (!["GOING", "MAYBE", "DECLINED"].includes(String(input.state)))
        throw new PortalError(400, "Choose going, maybe or declined.");
      expected(input.occurrenceVersion, occurrence.version);
      const prior = await tx.calendarResponse.findUnique({
        where: {
          occurrenceId_userId: { occurrenceId: occurrence.id, userId: actor.id }
        }
      });
      expected(input.expectedVersion, prior?.version ?? 0);
      const state = input.state as "GOING" | "MAYBE" | "DECLINED";
      const row = await tx.calendarResponse.upsert({
        where: {
          occurrenceId_userId: { occurrenceId: occurrence.id, userId: actor.id }
        },
        create: { occurrenceId: occurrence.id, userId: actor.id, state },
        update: { state, version: { increment: 1 } }
      });
      await audit(tx, actor.id, event.calendarId, row.id, "RSVP", row.version);
      return {
        id: occurrence.id,
        message:
          "Your response is saved. Check My commitments for any overlapping time."
      };
    }
    if (op === "set-visibility") {
      if (
        !event.calendar.churchId ||
        !calendarHas(
          context,
          event.calendar.churchId,
          "PUBLISH_CHURCH_EVENTS"
        ) ||
        event.calendar.archivedAt
      )
        throw new PortalError(
          403,
          "A current church event publisher must change publication visibility."
        );
      expected(input.expectedVersion, event.version);
      if (input.confirmed !== true)
        throw new PortalError(
          400,
          "Confirm the audience for this event series."
        );
      await tx.calendarEvent.update({
        where: { id: event.id },
        data: {
          visibility: visibility(
            context,
            event.calendar.churchId,
            input.visibility
          ),
          version: { increment: 1 }
        }
      });
      await audit(
        tx,
        actor.id,
        event.calendarId,
        event.id,
        "SET_EVENT_VISIBILITY",
        event.version + 1
      );
      return { id: event.id, message: "The event series audience is updated." };
    }
    requirePublishedEdit(context, event);
    expected(input.expectedVersion, event.version);
    if (event.canceledAt)
      throw new PortalError(
        409,
        "This series is canceled. Create a new event if it should run again."
      );
    if (op === "edit-event") {
      const scope = input.scope;
      if (scope !== "OCCURRENCE" && scope !== "SERIES")
        throw new PortalError(
          400,
          "Choose one occurrence or the event series."
        );
      const data = detail(input),
        times = expandCalendarSchedule(
          scope === "OCCURRENCE" ? { ...input, weeklyUntil: null } : input
        );
      if (scope === "OCCURRENCE") {
        const occurrence = await tx.calendarOccurrence.findFirst({
          where: { id: id(input.occurrenceId), eventId: event.id }
        });
        if (!occurrence || occurrence.canceledAt)
          throw new PortalError(404, "Active occurrence not found.");
        expected(input.occurrenceVersion, occurrence.version);
        const { ordinal: ignored, ...time } = times.occurrences[0];
        void ignored;
        await tx.calendarOccurrence.update({
          where: { id: occurrence.id },
          data: {
            ...data,
            ...time,
            isException: true,
            version: { increment: 1 }
          }
        });
        await tx.calendarEvent.update({
          where: { id: event.id },
          data: { version: { increment: 1 } }
        });
      } else {
        if (input.confirmed !== true)
          throw new PortalError(
            400,
            "Confirm the series change. Existing RSVPs stay linked to their occurrences."
          );
        const rows = await tx.calendarOccurrence.findMany({
          where: { eventId: event.id },
          orderBy: { ordinal: "asc" }
        });
        if (rows.length !== times.occurrences.length)
          throw new PortalError(
            400,
            "Keep this series’ occurrence count. Cancel or create a separate series to change its length."
          );
        if (
          rows.some((r) => r.isException && !r.canceledAt) &&
          input.replaceExceptions !== true
        )
          throw new PortalError(
            409,
            "This series contains individually edited occurrences. Explicitly confirm replacing those edits, or edit one occurrence."
          );
        await tx.calendarEvent.update({
          where: { id: event.id },
          data: { ...data, ...times.schedule, version: { increment: 1 } }
        });
        for (const time of times.occurrences) {
          const row = rows.find((r) => r.ordinal === time.ordinal)!;
          if (!row.canceledAt)
            await tx.calendarOccurrence.update({
              where: { id: row.id },
              data: {
                ...data,
                ...time,
                isException: false,
                version: { increment: 1 }
              }
            });
        }
      }
    } else if (op === "cancel-event") {
      if (
        input.confirmed !== true ||
        !["OCCURRENCE", "SERIES"].includes(String(input.scope))
      )
        throw new PortalError(
          400,
          "Choose and confirm cancellation of this occurrence or series."
        );
      if (input.scope === "OCCURRENCE") {
        const occurrence = await tx.calendarOccurrence.findFirst({
          where: {
            id: id(input.occurrenceId),
            eventId: event.id,
            canceledAt: null
          }
        });
        if (!occurrence)
          throw new PortalError(404, "Active occurrence not found.");
        expected(input.occurrenceVersion, occurrence.version);
        await tx.calendarOccurrence.update({
          where: { id: occurrence.id },
          data: { canceledAt: new Date(), version: { increment: 1 } }
        });
      } else {
        await tx.calendarOccurrence.updateMany({
          where: { eventId: event.id, canceledAt: null },
          data: { canceledAt: new Date(), version: { increment: 1 } }
        });
      }
      await tx.calendarEvent.update({
        where: { id: event.id },
        data: {
          ...((await tx.calendarOccurrence.count({
            where: { eventId: event.id, canceledAt: null }
          })) === 0
            ? { canceledAt: new Date() }
            : {}),
          version: { increment: 1 }
        }
      });
    } else throw new PortalError(400, "Choose an available calendar action.");
    await audit(
      tx,
      actor.id,
      event.calendarId,
      input.scope === "OCCURRENCE" ? id(input.occurrenceId) : event.id,
      `${String(op).toUpperCase().replaceAll("-", "_")}_${input.scope}`,
      event.version + 1
    );
    return {
      id: event.id,
      message:
        "Event updated. Existing response links are preserved; no external message was sent."
    };
  });
}
