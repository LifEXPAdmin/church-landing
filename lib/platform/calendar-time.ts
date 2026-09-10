import { Temporal } from "@js-temporal/polyfill";
import { PortalError } from "./portal";

export type CalendarSchedule = {
  allDay: boolean;
  timeZone: string;
  startLocal: string;
  endLocal: string;
  weeklyUntil: string | null;
};
export type OccurrenceTime = Omit<CalendarSchedule, "weeklyUntil"> & {
  ordinal: number;
  startAt: Date;
  endAt: Date;
};
export function calendarZone(value: unknown): string {
  if (typeof value !== "string" || value.length > 100 || /^[+-]/.test(value))
    throw new PortalError(
      400,
      "Choose an IANA time zone, such as America/Chicago."
    );
  try {
    return new Intl.DateTimeFormat("en", { timeZone: value }).resolvedOptions()
      .timeZone;
  } catch {
    throw new PortalError(400, "Choose an available IANA time zone.");
  }
}
export function calendarDate(value: unknown) {
  if (typeof value !== "string" || !/^20\d{2}-\d{2}-\d{2}$/.test(value))
    throw new PortalError(400, "Enter a date between 2000 and 2099.");
  try {
    return Temporal.PlainDate.from(value, { overflow: "reject" });
  } catch {
    throw new PortalError(400, "Enter a valid calendar date.");
  }
}
function local(value: unknown, allDay: boolean) {
  if (allDay) return calendarDate(value).toPlainDateTime();
  if (
    typeof value !== "string" ||
    !/^20\d{2}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)
  )
    throw new PortalError(
      400,
      "Enter a local date and time, including hours and minutes."
    );
  try {
    return Temporal.PlainDateTime.from(value, { overflow: "reject" });
  } catch {
    throw new PortalError(400, "Enter a valid local date and time.");
  }
}
export function expandCalendarSchedule(input: Record<string, unknown>): {
  schedule: CalendarSchedule;
  occurrences: OccurrenceTime[];
} {
  if (typeof input.allDay !== "boolean")
    throw new PortalError(400, "Choose whether this is an all-day event.");
  const allDay = input.allDay;
  const timeZone = calendarZone(input.timeZone);
  const start = local(input.startLocal, allDay),
    end = local(input.endLocal, allDay);
  if (
    Temporal.PlainDateTime.compare(end, start) <= 0 ||
    Temporal.PlainDateTime.compare(end, start.add({ days: 31 })) > 0
  )
    throw new PortalError(
      400,
      "The end must be after the start and within 31 days. All-day end dates are exclusive."
    );
  const until = input.weeklyUntil ? calendarDate(input.weeklyUntil) : null;
  if (
    until &&
    (Temporal.PlainDate.compare(until, start.toPlainDate()) < 0 ||
      Temporal.PlainDate.compare(
        until,
        start.toPlainDate().add({ days: 357 })
      ) > 0)
  )
    throw new PortalError(
      400,
      "A weekly series needs an end date and can contain at most 52 occurrences."
    );
  const occurrences: OccurrenceTime[] = [];
  const string = (date: Temporal.PlainDateTime) =>
    allDay
      ? date.toPlainDate().toString()
      : date.toString({ smallestUnit: "minute" });
  for (let ordinal = 0; ordinal < 52; ordinal++) {
    const s = start.add({ weeks: ordinal }),
      e = end.add({ weeks: ordinal });
    if (
      ordinal &&
      (!until || Temporal.PlainDate.compare(s.toPlainDate(), until) > 0)
    )
      break;
    let startAt: Date, endAt: Date;
    try {
      // Never silently shift a nonexistent/repeated local time. The user can
      // select another time; ordinary weekly wall times remain stable at DST.
      startAt = new Date(
        s.toZonedDateTime(timeZone, { disambiguation: "reject" })
          .epochMilliseconds
      );
      endAt = new Date(
        e.toZonedDateTime(timeZone, { disambiguation: "reject" })
          .epochMilliseconds
      );
    } catch {
      throw new PortalError(
        400,
        `The time on ${s.toPlainDate()} is skipped or repeated in ${timeZone}. Choose an unambiguous time for this event or series.`
      );
    }
    if (endAt <= startAt)
      throw new PortalError(
        400,
        "The event must end after it begins in its time zone."
      );
    occurrences.push({
      ordinal,
      allDay,
      timeZone,
      startLocal: string(s),
      endLocal: string(e),
      startAt,
      endAt
    });
  }
  return {
    schedule: {
      allDay,
      timeZone,
      startLocal: string(start),
      endLocal: string(end),
      weeklyUntil: until?.toString() ?? null
    },
    occurrences
  };
}

// Month/agenda bounds are date based in the selected viewer zone. All-day
// entries use their saved date strings, never a shifted UTC date.
export function calendarWindow(from: unknown, until: unknown, zone: unknown) {
  const timeZone = calendarZone(zone);
  const start = calendarDate(from),
    end = calendarDate(until);
  if (
    Temporal.PlainDate.compare(end, start) <= 0 ||
    Temporal.PlainDate.compare(end, start.add({ days: 93 })) > 0
  )
    throw new PortalError(400, "Choose a calendar range of up to 93 days.");
  return {
    from: start.toString(),
    until: end.toString(),
    timeZone,
    startAt: new Date(start.toZonedDateTime(timeZone).epochMilliseconds),
    endAt: new Date(end.toZonedDateTime(timeZone).epochMilliseconds)
  };
}
