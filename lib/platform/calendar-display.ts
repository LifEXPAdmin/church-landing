export type CalendarDisplayPreferences = {
  weekStart: 0 | 1;
  defaultView: "AGENDA" | "MONTH";
  timeZoneMode: "FIXED" | "DEVICE";
  timeZone: string;
};

export const defaultCalendarDisplay: Readonly<CalendarDisplayPreferences> =
  Object.freeze({
    weekStart: 0,
    defaultView: "AGENDA",
    timeZoneMode: "FIXED",
    timeZone: "UTC"
  });

export function validCalendarDisplayZone(value: unknown): value is string {
  if (
    typeof value !== "string" ||
    !value ||
    value.length > 100 ||
    value.trim() !== value ||
    /^[+-]/.test(value)
  )
    return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format(0);
    return true;
  } catch {
    return false;
  }
}

export function calendarDisplayInput(
  value: unknown
): CalendarDisplayPreferences | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (
    Object.keys(v).some(
      (key) =>
        !["weekStart", "defaultView", "timeZoneMode", "timeZone"].includes(key)
    ) ||
    (v.weekStart !== 0 && v.weekStart !== 1) ||
    (v.defaultView !== "AGENDA" && v.defaultView !== "MONTH") ||
    (v.timeZoneMode !== "FIXED" && v.timeZoneMode !== "DEVICE") ||
    !validCalendarDisplayZone(v.timeZone)
  )
    return null;
  return {
    weekStart: v.weekStart,
    defaultView: v.defaultView,
    timeZoneMode: v.timeZoneMode,
    timeZone: v.timeZone
  };
}

/** Presentation only. Invalid persisted choices never supply event instants. */
export function calendarDisplayPreferences(
  user:
    | {
        calendarWeekStart?: number;
        calendarDefaultView?: string;
        calendarTimeZoneMode?: string;
        calendarDisplayTimeZone?: string;
      }
    | null
    | undefined
): CalendarDisplayPreferences {
  return (
    calendarDisplayInput({
      weekStart: user?.calendarWeekStart ?? 0,
      defaultView: user?.calendarDefaultView ?? "AGENDA",
      timeZoneMode: user?.calendarTimeZoneMode ?? "FIXED",
      timeZone: user?.calendarDisplayTimeZone ?? "UTC"
    }) ?? { ...defaultCalendarDisplay }
  );
}
