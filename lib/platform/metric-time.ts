import { Temporal } from "@js-temporal/polyfill";
import { calendarDate, calendarZone } from "./calendar-time";
import { PortalError } from "./portal-policy";
import { METRIC_RAW_DAYS, METRIC_ZONE } from "./metric-policy";

export function metricDay(at: Date, zone = METRIC_ZONE) {
  return Temporal.Instant.from(at.toISOString())
    .toZonedDateTimeISO(calendarZone(zone))
    .toPlainDate()
    .toString();
}
export function metricDayStart(day: string, zone = METRIC_ZONE) {
  return new Date(
    calendarDate(day).toZonedDateTime(calendarZone(zone)).epochMilliseconds
  );
}
export function metricAddDays(day: string, days: number) {
  if (!Number.isSafeInteger(days) || Math.abs(days) > 1000)
    throw new PortalError(400, "Choose a bounded reporting interval.");
  return calendarDate(day).add({ days }).toString();
}
export type MetricWindow = {
  from: string;
  through: string;
  days: number;
  zone: string;
  start: string;
  end: string;
  calendarEnd: string;
  partial: boolean;
  comparison: { from: string; through: string; start: string; end: string };
};

/** Endpoints are calendar boundaries, including 23/25-hour DST days. */
export function metricWindow(
  input: Record<string, unknown>,
  now = new Date(),
  timeZone = METRIC_ZONE
): MetricWindow {
  const zone = calendarZone(timeZone),
    today = metricDay(now, zone);
  if (
    Object.keys(input).some(
      (key) => !["from", "through", "preset"].includes(key)
    )
  )
    throw new PortalError(400, "Use the supported report date fields.");
  const preset = input.preset ?? "30";
  let from: string, through: string;
  if (input.from !== undefined || input.through !== undefined) {
    if (input.preset !== undefined)
      throw new PortalError(
        400,
        "Choose a preset or a complete custom interval."
      );
    from = calendarDate(input.from).toString();
    through = calendarDate(input.through).toString();
  } else {
    if (!["1", "7", "30", "90"].includes(String(preset)))
      throw new PortalError(400, "Choose today, seven, thirty or ninety days.");
    through = today;
    from = metricAddDays(today, 1 - Number(preset));
  }
  const days = calendarDate(from).until(calendarDate(through)).days + 1;
  if (days < 1 || days > METRIC_RAW_DAYS || through > today)
    throw new PortalError(
      400,
      "Choose up to ninety calendar days ending no later than today."
    );
  const start = metricDayStart(from, zone),
    calendarEnd = metricDayStart(metricAddDays(through, 1), zone);
  const partial = now < calendarEnd,
    end = partial ? now : calendarEnd;
  const previousFrom = metricAddDays(from, -days),
    previousThrough = metricAddDays(from, -1);
  // Compare equal calendar windows. A partial current period is explicitly
  // compared with a complete preceding period; never silently scale a count.
  return {
    from,
    through,
    days,
    zone,
    start: start.toISOString(),
    end: end.toISOString(),
    calendarEnd: calendarEnd.toISOString(),
    partial,
    comparison: {
      from: previousFrom,
      through: previousThrough,
      start: metricDayStart(previousFrom, zone).toISOString(),
      end: start.toISOString()
    }
  };
}

export function metricReturnObservation(
  signupDay: string,
  day: 7 | 30,
  now: Date,
  zone = METRIC_ZONE
) {
  const observationDay = metricAddDays(signupDay, day);
  return {
    day: observationDay,
    mature: now >= metricDayStart(metricAddDays(observationDay, 1), zone)
  };
}
