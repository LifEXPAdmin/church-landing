import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { assertPortalTestDatabase, createPortalActor } from "./seed-portal";
import {
  calendarDisplayView,
  calendarMonthDays
} from "../lib/platform/calendar-view";
import {
  defaultCalendarDisplay,
  calendarDisplayInput,
  calendarDisplayPreferences
} from "../lib/platform/calendar-display";
import {
  saveRegionalPreferences,
  readRegionalPreferences
} from "../lib/platform/regional-preferences";
import { readSettingsContext } from "../lib/platform/settings-context";
import { loginAccount, readAccountSession } from "../lib/platform/accounts";
import { calendarCommand } from "../lib/platform/calendar-commands";
import {
  prepareAccountExport,
  downloadAccountExport
} from "../lib/platform/account-export";
import { requestPermanentAccountDeletion } from "../lib/platform/account-deletion";
import { eraseRequestedAccountData } from "../lib/platform/account-erasure";
import { createSessionToken } from "../lib/platform/auth";
const db = new PrismaClient();
before(() => assertPortalTestDatabase(db));
after(() => db.$disconnect());
const calendar = {
  weekStart: 1,
  defaultView: "MONTH",
  timeZoneMode: "DEVICE",
  timeZone: "Pacific/Auckland"
} as const;
const command = (expectedVersion = 0) => ({
  mutationId: randomUUID(),
  expectedVersion,
  dateFormat: "DMY",
  timeFormat: "H24",
  calendar
});

test("explicit view URLs override defaults and device mode remains explicit across navigation", () => {
  assert.deepEqual(calendarDisplayView({}, calendar), {
    mode: "MONTH",
    zoneMode: "DEVICE",
    weekStart: 1,
    timeZone: "Pacific/Auckland"
  });
  assert.equal(
    calendarDisplayView({ timeZone: "UTC" }, calendar).zoneMode,
    "FIXED"
  );
  assert.equal(
    calendarDisplayView({ timeZone: "UTC", zoneMode: "DEVICE" }, calendar)
      .zoneMode,
    "DEVICE"
  );
  assert.equal(
    calendarDisplayView({ mode: "AGENDA" }, calendar).mode,
    "AGENDA"
  );
  for (const query of [{ mode: "WEEK" }, { zoneMode: "auto" }])
    assert.throws(() => calendarDisplayView(query, calendar));
  for (const value of [
    { ...calendar, weekStart: 2 },
    { ...calendar, defaultView: "YEAR" },
    { ...calendar, timeZoneMode: "auto" },
    { ...calendar, timeZone: "+01:00" },
    { ...calendar, timeZone: "No/SuchZone" },
    { ...calendar, extra: true },
    { weekStart: 1 }
  ])
    assert.equal(calendarDisplayInput(value), null);
});

test("month geometry, DST crossings and exclusive ends preserve all-day dates in opposite viewing zones", () => {
  const timed = {
    id: "DST",
    allDay: false,
    startLocal: "2026-03-08T01:30",
    endLocal: "2026-03-08T03:30",
    startAt: "2026-03-08T07:30:00Z",
    endAt: "2026-03-08T08:30:00Z"
  };
  const allDay = {
    id: "all-day",
    allDay: true,
    startLocal: "2026-03-07",
    endLocal: "2026-03-09",
    startAt: "2026-03-07T00:00:00Z",
    endAt: "2026-03-09T00:00:00Z"
  };
  const midnight = {
    ...timed,
    id: "midnight",
    startAt: "2026-03-07T23:30:00Z",
    endAt: "2026-03-08T00:00:00Z"
  };
  const events = [timed, allDay, midnight],
    original = JSON.stringify(events);
  const sunday = calendarMonthDays("2026-03", "UTC", 0, events);
  assert.equal(sunday[0]?.date, "2026-03-01");
  const monday = calendarMonthDays("2026-03", "UTC", 1, events);
  assert.deepEqual(monday.slice(0, 6), Array(6).fill(null));
  assert.equal(monday[6]?.date, "2026-03-01");
  assert.deepEqual(
    monday.find((c) => c?.date === "2026-03-08")?.events.map((e) => e.id),
    ["DST", "all-day"]
  );
  for (const zone of [
    "America/Chicago",
    "Pacific/Honolulu",
    "Pacific/Kiritimati"
  ]) {
    const days = calendarMonthDays("2026-03", zone, 0, events);
    assert.deepEqual(
      days
        .filter((c) => c?.events.some((e) => e.id === "all-day"))
        .map((c) => c!.date),
      ["2026-03-07", "2026-03-08"]
    );
  }
  assert.equal(
    calendarMonthDays("2028-02", "UTC", 1, []).filter(Boolean).length,
    29
  );
  assert.equal(
    calendarMonthDays("2026-02", "UTC", 1, []).filter(Boolean).length,
    28
  );
  assert.equal(JSON.stringify(events), original);
});

test("calendar preferences persist across logins with one version, exact retries and backwards-compatible format saves", async () => {
  const a = await createPortalActor(db, "caldisplay"),
    b = await createPortalActor(db, "calother");
  const id = (
    await calendarCommand(db, a.token, {
      operation: "create-calendar",
      name: "Display fixture",
      timeZone: "UTC",
      requestKey: randomUUID()
    })
  ).id;
  const event = await calendarCommand(db, a.token, {
    operation: "create-event",
    calendarId: id,
    expectedVersion: 1,
    requestKey: randomUUID(),
    title: "Original source times",
    allDay: false,
    timeZone: "America/Chicago",
    startLocal: "2026-03-08T01:30",
    endLocal: "2026-03-08T03:30",
    weeklyUntil: null
  });
  const source = await db.calendarEvent.findUniqueOrThrow({
    where: { id: event.id }
  });
  const occurrences = await db.calendarOccurrence.findMany({
    where: { eventId: event.id }
  });
  await db.calendarLayerPreference.create({
    data: {
      ownerId: a.id,
      calendarId: id,
      followed: true,
      visible: false,
      color: "ROSE"
    }
  });
  await db.socialPreferences.create({
    data: {
      ownerId: a.id,
      quietTimeZone: "America/Chicago",
      quietStart: 1320,
      quietEnd: 420,
      pushCategories: ["commitments"]
    }
  });
  const originalLayer = await db.calendarLayerPreference.findMany({
    where: { ownerId: a.id }
  });
  const originalAlerts = await db.socialPreferences.findUnique({
    where: { ownerId: a.id }
  });
  const body = command(),
    receipt = await saveRegionalPreferences(db, a.token, body);
  assert.deepEqual(await saveRegionalPreferences(db, a.token, body), receipt);
  const token = await loginAccount(
    db,
    a.email,
    a.password,
    "Fresh calendar session"
  );
  const state = await readRegionalPreferences(db, token);
  assert.deepEqual(state.calendar, calendar);
  assert.deepEqual(
    (await readSettingsContext(db, token, a.id)).regional,
    state
  );
  assert.deepEqual(
    calendarDisplayPreferences(await readAccountSession(db, token)),
    calendar
  );
  assert.deepEqual(
    (await readRegionalPreferences(db, b.token)).calendar,
    defaultCalendarDisplay
  );
  await assert.rejects(
    saveRegionalPreferences(db, token, {
      ...body,
      calendar: { ...calendar, weekStart: 0 }
    })
  );
  await assert.rejects(saveRegionalPreferences(db, token, command(0)));
  await saveRegionalPreferences(db, token, {
    mutationId: randomUUID(),
    expectedVersion: 1,
    dateFormat: "YMD",
    timeFormat: "H12"
  });
  assert.deepEqual(
    (await readRegionalPreferences(db, a.token)).calendar,
    calendar
  );
  const competing = await Promise.allSettled([
    saveRegionalPreferences(db, a.token, command(2)),
    saveRegionalPreferences(db, token, {
      ...command(2),
      calendar: { ...calendar, weekStart: 0 }
    })
  ]);
  assert.equal(competing.filter((r) => r.status === "fulfilled").length, 1);
  assert.deepEqual(
    await db.calendarEvent.findUnique({ where: { id: event.id } }),
    source
  );
  assert.deepEqual(
    await db.calendarOccurrence.findMany({ where: { eventId: event.id } }),
    occurrences
  );
  assert.deepEqual(
    await db.calendarLayerPreference.findMany({ where: { ownerId: a.id } }),
    originalLayer
  );
  assert.deepEqual(
    await db.socialPreferences.findUnique({ where: { ownerId: a.id } }),
    originalAlerts
  );
});

test("invalid display writes are atomic and exported choices are erased through the existing account lifecycle", async () => {
  const a = await createPortalActor(db, "calerase"),
    b = await createPortalActor(db, "calkeep");
  for (const invalid of [
    { ...calendar, timeZone: "unknown" },
    { ...calendar, weekStart: 6 },
    { ...calendar, defaultView: "WEEK" },
    { ...calendar, userId: b.id },
    null
  ]) {
    assert.throws(() =>
      saveRegionalPreferences(db, a.token, { ...command(), calendar: invalid })
    );
    assert.equal((await readRegionalPreferences(db, a.token)).version, 0);
  }
  await saveRegionalPreferences(db, a.token, command());
  await saveRegionalPreferences(db, b.token, command());
  const secret = process.env.AUTH_RATE_LIMIT_SECRET!;
  const proof = await prepareAccountExport(db, a.token, a.password, secret);
  const text = await downloadAccountExport(
    db,
    a.token,
    proof.authorization,
    secret
  );
  assert.ok(
    text.includes('"calendarDisplayTimeZone": "Pacific/Auckland"') ||
      text.includes('"calendarDisplayTimeZone":"Pacific/Auckland"')
  );
  assert.ok(!text.includes(b.email));
  const journal = { async recordAccount() {}, async completeAccount() {} };
  await requestPermanentAccountDeletion(
    db,
    a.token,
    a.password,
    true,
    createSessionToken(),
    journal
  );
  const deletion = await db.accountDeletion.findUniqueOrThrow({
    where: { userId: a.id }
  });
  await eraseRequestedAccountData(db, deletion.id, journal);
  const erased = await db.platformUser.findUniqueOrThrow({
    where: { id: a.id }
  });
  assert.deepEqual(calendarDisplayPreferences(erased), defaultCalendarDisplay);
  assert.deepEqual(
    (await readRegionalPreferences(db, b.token)).calendar,
    calendar
  );
  await assert.rejects(readRegionalPreferences(db, a.token));
  await assert.rejects(saveRegionalPreferences(db, a.token, command(1)));
});
