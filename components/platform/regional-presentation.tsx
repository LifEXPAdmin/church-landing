"use client";
import { createContext, useContext, useEffect, useState } from "react";
import {
  defaultRegionalPreferences,
  formatRegionalTimestamp,
  formatRegionalWallTime,
  regionalPresentation,
  type RegionalPreferences
} from "@/lib/platform/regional-format";
import { eventWhen } from "@/lib/platform/calendar-view";
const RegionalContext = createContext<RegionalPreferences>(
  defaultRegionalPreferences
);
const DeviceZoneContext = createContext("UTC");
export function RegionalProvider({
  value,
  children
}: {
  value: { dateFormat?: string; timeFormat?: string } | null;
  children: React.ReactNode;
}) {
  const [zone, setZone] = useState("UTC");
  useEffect(() => {
    try {
      setZone(Intl.DateTimeFormat().resolvedOptions().timeZone);
    } catch {
      /* UTC remains explicit. */
    }
  }, []);
  return (
    <RegionalContext.Provider value={regionalPresentation(value)}>
      <DeviceZoneContext.Provider value={zone}>
        {children}
      </DeviceZoneContext.Provider>
    </RegionalContext.Provider>
  );
}
export function useRegionalPreferences() {
  return useContext(RegionalContext);
}
export function RegionalWallTime({
  value,
  separator
}: {
  value: string;
  separator?: string;
}) {
  return (
    <>{formatRegionalWallTime(value, useRegionalPreferences(), separator)}</>
  );
}
export function RegionalEventTime({
  event,
  timeZone
}: {
  event: Parameters<typeof eventWhen>[0];
  timeZone: string;
}) {
  return <>{eventWhen(event, timeZone, useRegionalPreferences())}</>;
}
export function RegionalTime({
  value,
  options,
  locale = "en-US",
  dateOnly = false,
  defaultText
}: {
  value: string | number | Date;
  options?: Intl.DateTimeFormatOptions;
  locale?: string;
  dateOnly?: boolean;
  defaultText?: string;
}) {
  const preferences = useRegionalPreferences();
  const zone = useContext(DeviceZoneContext);
  if (
    defaultText !== undefined &&
    preferences.dateFormat === "DEFAULT" &&
    preferences.timeFormat === "DEFAULT"
  )
    return <>{defaultText}</>;
  const formatting =
    options ??
    ({
      year: "numeric",
      month: "numeric",
      day: "numeric",
      ...(dateOnly
        ? {}
        : { hour: "numeric", minute: "2-digit", second: "2-digit" })
    } satisfies Intl.DateTimeFormatOptions);
  return (
    <>
      {formatRegionalTimestamp(
        value,
        preferences,
        { timeZone: zone, ...formatting },
        locale
      )}
    </>
  );
}
