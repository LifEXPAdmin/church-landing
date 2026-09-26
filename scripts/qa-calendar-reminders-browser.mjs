import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
const fixtureDir = process.argv[2];
assert.ok(fixtureDir, "Pass the isolated calendar fixture directory");
const config = JSON.parse(
  readFileSync(fixtureDir + "/browser-env.json", "utf8")
);
assert.match(config.origin, /^https:\/\/127\.0\.0\.1:\d+$/);
assert.equal(new URL(config.database).hostname, "127.0.0.1");
Object.assign(process.env, {
  DATABASE_URL: config.database,
  DIRECT_URL: config.database,
  ACCOUNT_ORIGIN: config.origin,
  NEXT_PUBLIC_SITE_URL: config.origin,
  ACCOUNT_TEST_ISOLATED: "1",
  ACCOUNT_DELIVERY_MODE: "test-sink",
  ACCOUNT_TEST_SINK_DIR: process.cwd() + "/" + fixtureDir + "/sink",
  MEDIA_STORAGE_MODE: "local-test",
  MEDIA_TEST_DIR: process.cwd() + "/" + fixtureDir + "/images",
  RETENTION_TEST_DIR: process.cwd() + "/" + fixtureDir + "/retention",
  NODE_ENV: "test",
  VERCEL: "",
  PRIVILEGED_MFA_MODE: "off"
});
const { PrismaClient } = await import("@prisma/client");
const { assertPortalTestDatabase, createPortalActor } =
  await import("../tests/seed-portal.ts");
const db = new PrismaClient();
await assertPortalTestDatabase(db);
const { chromium } = createRequire(
  process.env.PLAYWRIGHT_MODULE ??
    `${process.env.HOME}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json`
)("playwright");
const pub = execFileSync("openssl", [
  "x509",
  "-in",
  config.certificate,
  "-pubkey",
  "-noout"
]);
const der = execFileSync("openssl", ["pkey", "-pubin", "-outform", "DER"], {
  input: pub
});
const browser = await chromium.launch({
  headless: true,
  executablePath:
    process.env.CHROMIUM_PATH ??
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  args: [
    "--ignore-certificate-errors-spki-list=" +
      createHash("sha256").update(der).digest("base64")
  ]
});
const context = await browser.newContext({
  viewport: { width: 390, height: 844 }
});
const blockedRequests = [];
await context.route("**/*", (route) => {
  if (new URL(route.request().url()).origin === config.origin)
    return route.continue();
  blockedRequests.push(route.request().url());
  return route.abort();
});
const page = await context.newPage(),
  errors = [],
  results = [];
page.setDefaultTimeout(20000);
page.on("pageerror", (error) => errors.push(error.message));
const output = fixtureDir + "/calendar-reminders-browser-" + Date.now();
mkdirSync(output, { recursive: true });
const ok = (message) => {
  results.push(message);
  console.log("PASS " + message);
};
const go = async (path) => {
  const response = await page.goto(config.origin + path);
  assert.equal(response.status(), 200);
  return response;
};
const { randomUUID } = await import("node:crypto");
const { calendarCommand } =
  await import("../lib/platform/calendar-commands.ts");
const signIn = async (actor) => {
  await context.clearCookies();
  await context.addCookies([
    {
      name: "church_platform_session",
      value: actor.token,
      domain: "127.0.0.1",
      path: "/",
      secure: true,
      httpOnly: true,
      sameSite: "Lax"
    }
  ]);
};

const { readNotificationPreferences, notificationPreferenceCommand } =
  await import("../lib/platform/notification-preferences.ts");
const { advanceCalendarReminders } =
  await import("../lib/platform/calendar-reminders.ts");
const { loginAccount } = await import("../lib/platform/accounts.ts");
const until = async (fn) => {
  for (let n = 0; n < 100; n++) {
    if (await fn()) return;
    await page.waitForTimeout(100);
  }
  throw Error("State did not settle");
};
const notifications = "/platform/settings/notifications/availability";
const selector = () =>
  page.getByLabel("Timed calendar reminders", { exact: true });
const save = () =>
  page
    .getByRole("button", { name: "Save notification choices", exact: true })
    .click();
let owner;
try {
  owner = await createPortalActor(db, "reminderbrowser");
  const other = await createPortalActor(db, "reminderother");
  const calendar = await calendarCommand(db, owner.token, {
    operation: "create-calendar",
    name: "Reminder browser private calendar",
    timeZone: "UTC",
    requestKey: randomUUID()
  });
  const event = await calendarCommand(db, owner.token, {
    operation: "create-event",
    calendarId: calendar.id,
    expectedVersion: 1,
    requestKey: randomUUID(),
    title: "Private reminder browser event",
    description: "Fictional private details",
    allDay: false,
    timeZone: "UTC",
    startLocal: new Date(Date.now() + 3600000).toISOString().slice(0, 16),
    endLocal: new Date(Date.now() + 7200000).toISOString().slice(0, 16),
    weeklyUntil: null
  });
  const occurrence = await db.calendarOccurrence.findFirstOrThrow({
    where: { eventId: event.id }
  });
  await calendarCommand(db, owner.token, {
    operation: "rsvp",
    eventId: event.id,
    occurrenceId: occurrence.id,
    occurrenceVersion: 1,
    expectedVersion: 0,
    state: "GOING"
  });
  const sourceBefore = await db.calendarOccurrence.findUniqueOrThrow({
    where: { id: occurrence.id }
  });
  await signIn(owner);
  await go("/platform/settings/calendar");
  await page.locator("#setting-calendar-alerts").click();
  await page.waitForURL("**/settings/notifications/availability");
  await selector().waitFor();
  assert.equal(await selector().inputValue(), "0");
  assert.match(
    await page.locator(".gc-settings-main").innerText(),
    /All-day events, following a calendar and volunteer-only/
  );
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(
      () => (document.documentElement.style.fontSize = "200%")
    );
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1
      )
    );
    if (width === 390)
      await page.screenshot({
        path: output + "/reminders-phone-large.png",
        fullPage: true
      });
  }
  await page.evaluate(() => (document.documentElement.style.fontSize = ""));
  await page.setViewportSize({ width: 390, height: 844 });
  await selector().focus();
  // Native select type-ahead is a keyboard action; Enter would submit this form.
  await selector().press("1");
  await until(async () => (await selector().inputValue()) === "15");
  assert.equal(await selector().inputValue(), "15");
  const bodies = [];
  let lost = false;
  const url = config.origin + "/api/platform/notifications";
  await page.route(url, async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    bodies.push(route.request().postData());
    if (!lost) {
      lost = true;
      const response = await route.fetch();
      assert.equal(response.status(), 200);
      await response.dispose();
      return route.abort("failed");
    }
    return route.continue();
  });
  await save();
  await page
    .getByRole("button", {
      name: "Retry last notification action",
      exact: true
    })
    .waitFor();
  await page
    .getByRole("button", {
      name: "Retry last notification action",
      exact: true
    })
    .click();
  await until(
    async () =>
      !(await page
        .getByRole("button", {
          name: "Retry last notification action",
          exact: true
        })
        .count()) &&
      !(await page
        .getByRole("button", { name: "Save notification choices", exact: true })
        .isEnabled())
  );
  await page.unroute(url);
  assert.equal(bodies.length, 2);
  assert.equal(bodies[0], bodies[1]);
  assert.equal(
    (await readNotificationPreferences(db, owner.token)).preferences
      .calendarReminderMinutes,
    15
  );
  assert.deepEqual(
    await db.calendarOccurrence.findUniqueOrThrow({
      where: { id: occurrence.id }
    }),
    sourceBefore
  );
  ok(
    "Keyboard opt-in, clear scope, large-text layouts and exact retry save only notification consent"
  );
  const fresh = await loginAccount(
    db,
    owner.email,
    owner.password,
    "Reminder preferences new session"
  );
  await page.goto("about:blank");
  await signIn({ ...owner, token: fresh });
  await go(notifications);
  await selector().waitFor();
  assert.equal(await selector().inputValue(), "15");
  await selector().selectOption("60");
  const before = await readNotificationPreferences(db, owner.token);
  await notificationPreferenceCommand(db, owner.token, {
    operation: "preferences",
    mutationId: randomUUID(),
    ownerId: owner.id,
    expectedVersion: before.preferences.version,
    inApp: before.preferences.inApp,
    pushCategories: [],
    quietHours: null,
    calendarReminderMinutes: 0
  });
  await save();
  await page
    .getByText(
      "These choices changed elsewhere. Your selections are preserved.",
      { exact: true }
    )
    .waitFor();
  assert.equal(await selector().inputValue(), "60");
  assert.equal(
    (await readNotificationPreferences(db, owner.token)).preferences
      .calendarReminderMinutes,
    0
  );
  await page
    .getByRole("button", {
      name: "Discard unsaved notification choices",
      exact: true
    })
    .click();
  await until(async () => (await selector().inputValue()) === "0");
  await selector().selectOption("15");
  await save();
  await until(
    async () =>
      (await readNotificationPreferences(db, owner.token)).preferences
        .calendarReminderMinutes === 15
  );
  await until(
    async () =>
      !(await page
        .getByRole("button", { name: "Save notification choices", exact: true })
        .isEnabled())
  );
  ok(
    "Fresh login persists the choice; stale saves preserve edits and cannot overwrite another session"
  );
  await go("/platform/calendars");
  const details = page
    .getByText("My choices for Reminder browser private calendar", {
      exact: true
    })
    .locator("..");
  await details.locator("summary").click();
  await details.getByLabel("Follow this calendar", { exact: true }).check();
  await details.getByLabel("Show in My calendars", { exact: true }).uncheck();
  await details
    .getByRole("button", {
      name: "Save my choices for Reminder browser private calendar",
      exact: true
    })
    .click();
  await until(async () => {
    const row = await db.calendarLayerPreference.findUnique({
      where: {
        ownerId_calendarId: { ownerId: owner.id, calendarId: calendar.id }
      }
    });
    return row?.followed && !row.visible;
  });
  const response = await db.calendarResponse.findUniqueOrThrow({
    where: {
      occurrenceId_userId: { occurrenceId: occurrence.id, userId: owner.id }
    }
  });
  assert.equal(response.state, "GOING");
  assert.equal(
    (await readNotificationPreferences(db, owner.token)).preferences
      .calendarReminderMinutes,
    15
  );
  // Simulate elapsed fictional time only; the browser consent and source were
  // already verified unchanged. No provider or production database is reachable.
  const now = new Date(),
    old = new Date(now.getTime() - 120000),
    due = new Date(now.getTime() - 1000),
    start = new Date(due.getTime() + 900000);
  await db.socialPreferences.update({
    where: { ownerId: owner.id },
    data: { calendarReminderSince: old }
  });
  await db.calendarResponse.update({
    where: { id: response.id },
    data: { updatedAt: old }
  });
  await db.calendarEvent.update({
    where: { id: event.id },
    data: { updatedAt: old }
  });
  await db.calendarOccurrence.update({
    where: { id: occurrence.id },
    data: {
      startAt: start,
      endAt: new Date(start.getTime() + 3600000),
      updatedAt: old
    }
  });
  const job = await db.calendarReminderJob.update({
    where: { ownerId: owner.id },
    data: { throughAt: old, wakeAt: due }
  });
  assert.equal(
    (
      await advanceCalendarReminders(
        db,
        owner.id,
        job.version,
        new Date(),
        async () => ({ failed: 0 })
      )
    ).recorded,
    1
  );
  await go("/platform/activity?category=commitments");
  await page
    .getByText("A reminder for an event in your commitments", { exact: true })
    .waitFor();
  assert.doesNotMatch(
    await page.locator("main").innerText(),
    /Fictional private details|Private reminder browser event/
  );
  assert.equal(
    await db.notificationDelivery.count({
      where: { ownerId: owner.id, event: { kind: "CALENDAR_REMINDER" } }
    }),
    0
  );
  ok(
    "Hiding a calendar preserves RSVP and reminder scope; due Activity uses a private canonical destination with no phone consent"
  );
  await go(notifications);
  await selector().waitFor();
  await selector().selectOption("60");
  await page
    .getByRole("link", { name: "Back to Notifications", exact: true })
    .click();
  assert.equal(new URL(page.url()).pathname, notifications);
  await page
    .getByText("Save or resolve notification changes before leaving.", {
      exact: true
    })
    .waitFor();
  await page
    .getByRole("button", {
      name: "Discard unsaved notification choices",
      exact: true
    })
    .click();
  await until(async () => (await selector().inputValue()) === "15");
  await selector().selectOption("0");
  await save();
  await until(
    async () =>
      (await readNotificationPreferences(db, owner.token)).preferences
        .calendarReminderMinutes === 0
  );
  await until(
    async () =>
      (await page
        .locator(".gc-settings[aria-busy]")
        .getAttribute("aria-busy")) === "false"
  );
  await until(
    async () =>
      !(await page
        .getByRole("button", { name: "Save notification choices", exact: true })
        .isEnabled())
  );
  assert.equal(
    await db.calendarReminderJob.count({ where: { ownerId: owner.id } }),
    0
  );
  await go("/platform/activity?category=commitments");
  assert.equal(
    await page
      .getByText("A reminder for an event in your commitments", { exact: true })
      .count(),
    0
  );
  ok(
    "Unsaved navigation guard protects the choice; turning reminders off removes the plan and stale Activity"
  );
  await go(notifications);
  await selector().waitFor();
  await selector().selectOption("60");
  await context.clearCookies();
  await context.addCookies([
    {
      name: "church_platform_session",
      value: other.token,
      domain: "127.0.0.1",
      path: "/",
      secure: true,
      httpOnly: true,
      sameSite: "Lax"
    }
  ]);
  await save();
  await selector().waitFor({ state: "hidden" });
  assert.equal(
    (await readNotificationPreferences(db, owner.token)).preferences
      .calendarReminderMinutes,
    0
  );
  assert.equal(
    (await readNotificationPreferences(db, other.token)).preferences
      .calendarReminderMinutes,
    0
  );
  await page.reload();
  await selector().waitFor();
  assert.equal(await selector().inputValue(), "0");
  assert.doesNotMatch(
    await page.locator("body").innerText(),
    /Reminder browser private calendar/
  );
  ok(
    "An account switch rejects the old owner write and clears private reminder selections"
  );
  assert.deepEqual(errors, []);
  assert.deepEqual(blockedRequests, []);
  writeFileSync(
    output + "/summary.json",
    JSON.stringify(
      {
        passed: results.length,
        results,
        browserErrors: errors,
        externalRequests: blockedRequests,
        productionWrites: 0,
        providerSends: 0
      },
      null,
      2
    )
  );
  console.log(
    JSON.stringify({
      output,
      passed: results.length,
      browserErrors: 0,
      productionWrites: 0,
      providerSends: 0
    })
  );
} catch (error) {
  await page
    .screenshot({ path: output + "/failure.png", fullPage: true })
    .catch(() => {});
  throw error;
} finally {
  if (owner)
    await db.calendarReminderJob.deleteMany({ where: { ownerId: owner.id } });
  await context.close();
  await browser.close();
  await db.$disconnect();
}
