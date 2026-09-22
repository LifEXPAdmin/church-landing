import {
  defaultRegionalPreferences,
  formatRegionalTimestamp,
  formatRegionalCalendarDate,
  type RegionalPreferences
} from "./regional-format";
import type { CalendarDisplayPreferences } from "./calendar-display";
// Presentation helpers are safe to use in the browser; they never read accounts.
export type CalendarQuery = {
  signup?: string;
  month?: string;
  timeZone?: string;
  layer?: string | string[];
  cursor?: string;
  layers?: string;
  mode?: string;
  zoneMode?: string;
};
export function calendarDisplayView(
  query: CalendarQuery,
  saved: CalendarDisplayPreferences
): {
  mode: "AGENDA" | "MONTH";
  zoneMode: "FIXED" | "DEVICE";
  weekStart: 0 | 1;
  timeZone: string;
} {
  const mode = query.mode ?? saved.defaultView;
  const zoneMode =
    query.zoneMode ??
    (query.timeZone === undefined ? saved.timeZoneMode : "FIXED");
  if (
    (mode !== "AGENDA" && mode !== "MONTH") ||
    (zoneMode !== "FIXED" && zoneMode !== "DEVICE")
  )
    throw new Error("Choose a supported calendar view and time zone mode.");
  return {
    mode,
    zoneMode,
    weekStart: saved.weekStart,
    timeZone: query.timeZone ?? saved.timeZone
  };
}

/** Month geometry and day placement never change source event dates or instants. */
export function calendarMonthDays<
  T extends {
    allDay: boolean;
    startLocal: string;
    endLocal: string;
    startAt: string;
    endAt: string;
  }
>(month: string, timeZone: string, weekStart: 0 | 1, events: T[]) {
  const range = monthRange(month, timeZone);
  const first = new Date(range.from + "T12:00:00Z");
  const count = new Date(
    Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)
  ).getUTCDate();
  const offset = (first.getUTCDay() - weekStart + 7) % 7;
  const cells: ({ date: string; events: T[] } | null)[] = Array.from(
    { length: Math.ceil((offset + count) / 7) * 7 },
    (_, i) =>
      i < offset || i >= offset + count
        ? null
        : {
            date: `${month}-${String(i - offset + 1).padStart(2, "0")}`,
            events: []
          }
  );
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  const dateAt = (at: number) => {
    const parts = formatter.formatToParts(at);
    return ["year", "month", "day"]
      .map((type) => parts.find((p) => p.type === type)!.value)
      .join("-");
  };
  for (const event of events) {
    const start = event.allDay
      ? event.startLocal
      : dateAt(Date.parse(event.startAt));
    const end = event.allDay
      ? event.endLocal
      : dateAt(Date.parse(event.endAt) - 1);
    for (const cell of cells) {
      if (
        cell &&
        cell.date >= start &&
        (event.allDay ? cell.date < end : cell.date <= end)
      )
        cell.events.push(event);
    }
  }
  return cells;
}
export function monthRange(month?: string, timeZone = "UTC") {
  // Use a stated zone so server and first browser render agree. Viewers may
  // explicitly choose their device zone or another IANA time zone.
  const current = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit"
  }).formatToParts(new Date());
  const fallback = `${current.find((p) => p.type === "year")!.value}-${current.find((p) => p.type === "month")!.value}`;
  const value = month ?? fallback;
  if (!/^20\d{2}-(0[1-9]|1[0-2])$/.test(value))
    throw new Error("Choose a month from 2000 through 2099.");
  const date = new Date(`${value}-01T12:00:00Z`);
  const shift = (n: number) =>
    new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + n, 1, 12))
      .toISOString()
      .slice(0, 7);
  return {
    month: value,
    from: value + "-01",
    until: shift(1) + "-01",
    previous: shift(-1),
    next: shift(1),
    timeZone,
    label: date.toLocaleDateString("en-US", {
      month: "long",
      year: "numeric",
      timeZone: "UTC"
    })
  };
}
export function eventWhen(
  event: {
    allDay: boolean;
    startLocal: string;
    endLocal: string;
    startAt: string;
    endAt: string;
  },
  timeZone: string,
  preferences: RegionalPreferences = defaultRegionalPreferences
) {
  if (event.allDay) {
    if (
      formatRegionalCalendarDate(event.endLocal, preferences) ===
      "Date unavailable"
    )
      return "Date unavailable";
    const end = new Date(event.endLocal + "T12:00:00Z");
    if (!Number.isFinite(end.getTime())) return "Date unavailable";
    end.setUTCDate(end.getUTCDate() - 1);
    const finalDate = end.toISOString().slice(0, 10);
    return `All day · ${formatRegionalCalendarDate(event.startLocal, preferences)}${finalDate !== event.startLocal ? ` through ${formatRegionalCalendarDate(finalDate, preferences)}` : ""}`;
  }
  const format = (value: string) =>
    formatRegionalTimestamp(value, preferences, {
      timeZone,
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short"
    });
  return `${format(event.startAt)} to ${format(event.endAt)}`;
}
