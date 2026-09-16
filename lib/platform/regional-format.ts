export const regionalDateFormats = ["DEFAULT", "MDY", "DMY", "YMD"] as const;
export const regionalTimeFormats = ["DEFAULT", "H12", "H24"] as const;
export type RegionalPreferences = {
  dateFormat: (typeof regionalDateFormats)[number];
  timeFormat: (typeof regionalTimeFormats)[number];
};
export const defaultRegionalPreferences: Readonly<RegionalPreferences> =
  Object.freeze({
    dateFormat: "DEFAULT",
    timeFormat: "DEFAULT"
  });

/** Presentation only. Unknown stored choices must be rejected by the edit service. */
export function regionalPresentation(value: unknown): RegionalPreferences {
  const input = value as Partial<RegionalPreferences> | null;
  return {
    dateFormat: regionalDateFormats.includes(
      input?.dateFormat as RegionalPreferences["dateFormat"]
    )
      ? input!.dateFormat!
      : "DEFAULT",
    timeFormat: regionalTimeFormats.includes(
      input?.timeFormat as RegionalPreferences["timeFormat"]
    )
      ? input!.timeFormat!
      : "DEFAULT"
  };
}

const stampOptions: Intl.DateTimeFormatOptions = {
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "UTC"
};

/** The caller owns the zone and source instant; preferences affect presentation only. */
export function formatRegionalTimestamp(
  value: string | number | Date,
  preferences: RegionalPreferences,
  options: Intl.DateTimeFormatOptions = stampOptions,
  locale = "en-US"
) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return "Date unavailable";
  const prefs = regionalPresentation(preferences);
  const adjusted = { ...options };
  const hasTime = !!(options.hour || options.timeStyle);
  if (hasTime && prefs.timeFormat !== "DEFAULT") {
    delete adjusted.hour12;
    adjusted.hourCycle = prefs.timeFormat === "H12" ? "h12" : "h23";
  }
  try {
    if (prefs.dateFormat === "DEFAULT" || !(options.day || options.dateStyle))
      return new Intl.DateTimeFormat(locale, adjusted).format(date);
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: options.timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).formatToParts(date);
    const part = (kind: Intl.DateTimeFormatPartTypes) =>
      parts.find((p) => p.type === kind)!.value;
    const day = part("day"),
      month = part("month"),
      year = part("year");
    const numeric =
      prefs.dateFormat === "MDY"
        ? `${month}/${day}/${year}`
        : prefs.dateFormat === "DMY"
          ? `${day}/${month}/${year}`
          : `${year}-${month}-${day}`;
    const weekday = options.weekday
      ? new Intl.DateTimeFormat(locale, {
          timeZone: options.timeZone,
          weekday: options.weekday
        }).format(date) + ", "
      : "";
    if (!hasTime) return weekday + numeric;
    const timeOptions: Intl.DateTimeFormatOptions = {
      timeZone: options.timeZone,
      ...(options.timeStyle
        ? { timeStyle: options.timeStyle }
        : {
            hour: options.hour,
            minute: options.minute,
            second: options.second,
            fractionalSecondDigits: options.fractionalSecondDigits,
            timeZoneName: options.timeZoneName
          }),
      ...(adjusted.hour12 === undefined ? {} : { hour12: adjusted.hour12 }),
      ...(adjusted.hourCycle === undefined
        ? {}
        : { hourCycle: adjusted.hourCycle })
    };
    return `${weekday}${numeric}, ${new Intl.DateTimeFormat(locale, timeOptions).format(date)}`;
  } catch {
    // Invalid source dates/zones must not silently become a different event time.
    return "Date unavailable";
  }
}

/** A calendar date has no viewer-zone conversion, including leap days and DST. */
export function formatRegionalCalendarDate(
  value: string,
  preferences: RegionalPreferences
) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return "Date unavailable";
  const date = new Date(value + "T12:00:00Z");
  if (
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
  )
    return "Date unavailable";
  if (regionalPresentation(preferences).dateFormat === "DEFAULT") return value;
  return formatRegionalTimestamp(date, preferences, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "UTC"
  });
}

/** A saved wall time already belongs to its labeled source zone. Never convert it. */
export function formatRegionalWallTime(
  value: string,
  preferences: RegionalPreferences,
  separator = " "
) {
  const match = /^(\d{4}-\d{2}-\d{2})(?:T([01]\d|2[0-3]):([0-5]\d))?$/.exec(
    value
  );
  if (!match) return "Date unavailable";
  const day = formatRegionalCalendarDate(match[1], preferences);
  if (day === "Date unavailable" || !match[2]) return day;
  const time = regionalPresentation(preferences).timeFormat;
  const clock =
    time === "DEFAULT"
      ? `${match[2]}:${match[3]}`
      : new Intl.DateTimeFormat("en-US", {
          timeZone: "UTC",
          hour: time === "H12" ? "numeric" : "2-digit",
          minute: "2-digit",
          hourCycle: time === "H12" ? "h12" : "h23"
        }).format(new Date(value + ":00Z"));
  return day + separator + clock;
}
