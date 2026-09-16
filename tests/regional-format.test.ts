import test from "node:test";
import assert from "node:assert/strict";
import { eventWhen } from "../lib/platform/calendar-view";
import {
  defaultRegionalPreferences,
  formatRegionalCalendarDate,
  formatRegionalTimestamp,
  formatRegionalWallTime,
  regionalPresentation
} from "../lib/platform/regional-format";

test("regional date and time choices are independent and preserve the source instant and zone", () => {
  const value = "2026-09-16T18:05:00Z";
  const options = {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  } as const;
  assert.equal(
    formatRegionalTimestamp(value, defaultRegionalPreferences, options),
    new Intl.DateTimeFormat("en-US", options).format(new Date(value))
  );
  assert.equal(
    formatRegionalTimestamp(
      value,
      { dateFormat: "DMY", timeFormat: "H24" },
      options
    ),
    "16/09/2026, 13:05"
  );
  assert.equal(
    formatRegionalTimestamp(
      value,
      { dateFormat: "MDY", timeFormat: "H12" },
      options
    ),
    "09/16/2026, 1:05 PM"
  );
  assert.equal(
    formatRegionalTimestamp(
      value,
      { dateFormat: "YMD", timeFormat: "H24" },
      { ...options, timeZone: "Asia/Tokyo" }
    ),
    "2026-09-17, 03:05"
  );
  assert.equal(value, "2026-09-16T18:05:00Z");
});

test("source instants render both DST transitions without changing or guessing the local time", () => {
  const options = {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short"
  } as const;
  const prefs = { dateFormat: "YMD", timeFormat: "H24" } as const;
  assert.equal(
    formatRegionalTimestamp("2026-03-08T07:30:00Z", prefs, options),
    "2026-03-08, 01:30 CST"
  );
  assert.equal(
    formatRegionalTimestamp("2026-03-08T08:30:00Z", prefs, options),
    "2026-03-08, 03:30 CDT"
  );
  assert.equal(
    formatRegionalTimestamp("2026-11-01T06:30:00Z", prefs, options),
    "2026-11-01, 01:30 CDT"
  );
  assert.equal(
    formatRegionalTimestamp("2026-11-01T07:30:00Z", prefs, options),
    "2026-11-01, 01:30 CST"
  );
});

test("calendar dates keep their day, validate leap dates, and do not silently normalize invalid source data", () => {
  assert.equal(
    formatRegionalCalendarDate("2028-02-29", {
      dateFormat: "DMY",
      timeFormat: "H24"
    }),
    "29/02/2028"
  );
  assert.equal(
    formatRegionalCalendarDate("2026-11-01", defaultRegionalPreferences),
    "2026-11-01"
  );
  for (const bad of [
    "2026-02-29",
    "2026-13-01",
    "2026-02-30",
    "",
    "2026-01-01T00:00:00Z"
  ])
    assert.equal(
      formatRegionalCalendarDate(bad, defaultRegionalPreferences),
      "Date unavailable"
    );
  assert.equal(
    formatRegionalTimestamp("invalid", defaultRegionalPreferences),
    "Date unavailable"
  );
  assert.equal(
    formatRegionalTimestamp(
      "2026-09-16T00:00:00Z",
      defaultRegionalPreferences,
      { timeZone: "Not/A_Zone" }
    ),
    "Date unavailable"
  );
  assert.deepEqual(
    regionalPresentation({ dateFormat: "unsupported", timeFormat: "unbuilt" }),
    defaultRegionalPreferences
  );
});

test("all-day event ranges keep their calendar days in every viewer zone", () => {
  const event = {
    allDay: true,
    startLocal: "2028-02-29",
    endLocal: "2028-03-02",
    startAt: "2028-02-29T06:00:00Z",
    endAt: "2028-03-02T06:00:00Z"
  };
  for (const zone of ["America/Chicago", "Asia/Tokyo", "Pacific/Honolulu"])
    assert.equal(
      eventWhen(event, zone, { dateFormat: "DMY", timeFormat: "H24" }),
      "All day · 29/02/2028 through 01/03/2028"
    );
  assert.equal(
    eventWhen({ ...event, endLocal: "2028-02-30" }, "UTC"),
    "Date unavailable"
  );
});

test("source wall-time labels preserve their date and zone boundary without resolving DST again", () => {
  const prefs = { dateFormat: "DMY", timeFormat: "H12" } as const;
  assert.equal(
    formatRegionalWallTime("2026-11-01T01:30", prefs),
    "01/11/2026 1:30 AM"
  );
  assert.equal(
    formatRegionalWallTime("2026-10-25T13:05", prefs),
    "25/10/2026 1:05 PM"
  );
  assert.equal(formatRegionalWallTime("2028-02-29", prefs), "29/02/2028");
  assert.equal(
    formatRegionalWallTime(
      "2026-11-01T01:30",
      defaultRegionalPreferences,
      " · "
    ),
    "2026-11-01 · 01:30"
  );
  for (const value of [
    "2026-02-30T13:05",
    "2026-11-01T25:30",
    "2026-11-01T01:30Z"
  ])
    assert.equal(formatRegionalWallTime(value, prefs), "Date unavailable");
});

test("repeated presentation keeps distinct locales, options and source zones after bounded formatter reuse", () => {
  const value = new Date("2026-11-01T06:30:45.123Z");
  const zones = ["UTC", ...Intl.supportedValuesOf("timeZone").slice(0, 80)];
  for (const locale of ["en-US", "en-GB", "fr-FR"]) {
    for (const timeZone of zones) {
      for (const hourCycle of ["h12", "h23"] as const) {
        const options = {
          timeZone,
          dateStyle: "full",
          timeStyle: "long",
          hourCycle
        } as const;
        const expected = new Intl.DateTimeFormat(locale, options).format(value);
        for (const instant of [value, new Date(+value + 86400000), value])
          assert.equal(
            formatRegionalTimestamp(
              instant,
              defaultRegionalPreferences,
              options,
              locale
            ),
            instant === value
              ? expected
              : new Intl.DateTimeFormat(locale, options).format(instant)
          );
      }
    }
  }
  const options = { timeZone: "UTC", hour: "numeric" } as const;
  assert.equal(
    formatRegionalTimestamp(value, defaultRegionalPreferences, options),
    formatRegionalTimestamp(value, defaultRegionalPreferences, {
      hour: "numeric",
      timeZone: "UTC",
      minute: undefined
    })
  );
});

test("implicit system zones remain current between calls", () => {
  const original = process.env.TZ;
  try {
    const date = new Date("2026-09-16T18:05:00Z");
    for (const timeZone of ["UTC", "America/Chicago", "Asia/Tokyo", "UTC"]) {
      process.env.TZ = timeZone;
      const options = { dateStyle: "full", timeStyle: "long" } as const;
      assert.equal(
        formatRegionalTimestamp(date, defaultRegionalPreferences, options),
        new Intl.DateTimeFormat("en-US", options).format(date)
      );
    }
  } finally {
    if (original === undefined) delete process.env.TZ;
    else process.env.TZ = original;
  }
});
