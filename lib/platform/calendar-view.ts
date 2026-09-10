// Presentation helpers are safe to use in the browser; they never read accounts.
export type CalendarQuery = {
  month?: string;
  timeZone?: string;
  layer?: string | string[];
  cursor?: string;
  layers?: string;
  mode?: string;
};
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
  timeZone: string
) {
  if (event.allDay) {
    const end = new Date(event.endLocal + "T12:00:00Z");
    end.setUTCDate(end.getUTCDate() - 1);
    const finalDate = end.toISOString().slice(0, 10);
    return `All day · ${event.startLocal}${finalDate !== event.startLocal ? ` through ${finalDate}` : ""}`;
  }
  const format = (value: string) =>
    new Date(value).toLocaleString("en-US", {
      timeZone,
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short"
    });
  return `${format(event.startAt)} – ${format(event.endAt)}`;
}
