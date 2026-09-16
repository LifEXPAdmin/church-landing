import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
const fixtureDir = process.argv[2];
assert.ok(fixtureDir, "Pass the existing isolated preview artifact directory");
const config = JSON.parse(
  readFileSync(fixtureDir + "/browser-env.json", "utf8")
);
assert.match(config.origin, /^https:\/\/127\.0\.0\.1:\d+$/);
Object.assign(process.env, {
  DATABASE_URL: config.database,
  DIRECT_URL: config.database,
  ACCOUNT_ORIGIN: config.origin,
  NEXT_PUBLIC_SITE_URL: config.origin,
  ACCOUNT_TEST_ISOLATED: "1",
  ACCOUNT_DELIVERY_MODE: "test-sink",
  ACCOUNT_TEST_SINK_DIR: process.cwd() + "/" + fixtureDir + "/sink",
  AUTH_RATE_LIMIT_SECRET: "medium-fixture-only-secret-".repeat(3),
  NODE_ENV: "test",
  VERCEL: ""
});
const { PrismaClient } = await import("@prisma/client");
const { assertPortalTestDatabase } = await import("../tests/seed-portal.ts");
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
  timezoneId: "America/Chicago",
  viewport: { width: 390, height: 844 }
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => {
  const issue = { path: new URL(page.url()).pathname, message: e.message };
  errors.push(issue);
  console.log("BROWSER_ERROR", JSON.stringify(issue));
});
const results = [];
const ok = (s) => {
  results.push(s);
  console.log("PASS " + s);
};
const output = fixtureDir + "/regional-browser";
mkdirSync(output, { recursive: true });
const go = async (path) => {
  await page.goto(config.origin + path);
  await page.getByRole("heading", { level: 1 }).waitFor();
};
const bounded = async () =>
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1
    ),
    "No horizontal page overflow"
  );

const { createPortalActor } = await import("../tests/seed-portal.ts");

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

const { loginAccount } = await import("../lib/platform/accounts.ts");
const { saveRegionalPreferences } =
  await import("../lib/platform/regional-preferences.ts");
const { getProfileEditor } = await import("../lib/platform/profiles.ts");
const { calendarCommand } =
  await import("../lib/platform/calendar-commands.ts");
const { replayRetentionControls } =
  await import("../lib/platform/retention-controls.ts");
const settings = "/platform/settings/language/interface";
const formatsSaved = () =>
  page
    .getByText("Your date and time formats were saved.", { exact: true })
    .waitFor();
const profileSave = () =>
  page.getByRole("button", { name: "Save profile", exact: true }).click();
let phase = "entry";
try {
  const a = await createPortalActor(db, "regionqa"),
    b = await createPortalActor(db, "regionother"),
    restricted = await createPortalActor(db, "regionlimit", { adult: false });
  const location = "Only-me location QA marker " + randomUUID();
  await db.platformUser.update({
    where: { id: a.id },
    data: { location, locationAudience: "ONLY_ME" }
  });
  await signIn(a);
  await go(settings);
  await page.getByLabel("Date format", { exact: true }).waitFor();
  await page.getByLabel("Date format", { exact: true }).focus();
  assert.equal(
    await page.evaluate(() => document.activeElement?.id),
    "regional-date-format"
  );
  await page.keyboard.press("Tab");
  assert.equal(
    await page.evaluate(() => document.activeElement?.id),
    "regional-time-format"
  );
  await page.getByLabel("Date format", { exact: true }).selectOption("DMY");
  await page.getByLabel("Time format", { exact: true }).selectOption("H24");
  await page
    .locator("[data-regional-preview]")
    .filter({ hasText: "16/09/2026, 13:05 CDT" })
    .waitFor();
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(
      () => (document.documentElement.style.fontSize = "32px")
    );
    await bounded();
    await page.screenshot({
      path: output + `/formats-${width}.png`,
      fullPage: true
    });
    await page.evaluate(() => (document.documentElement.style.fontSize = ""));
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole("button", { name: "Save date and time formats", exact: true })
    .click();
  await formatsSaved();
  let saved = await db.platformUser.findUniqueOrThrow({ where: { id: a.id } });
  assert.equal(saved.dateFormat, "DMY");
  assert.equal(saved.timeFormat, "H24");
  assert.equal(saved.location, location);
  assert.equal(saved.locationAudience, "ONLY_ME");
  const fresh = await loginAccount(
    db,
    a.email,
    a.password,
    "Second fictional regional browser"
  );
  await signIn({ ...a, token: fresh });
  await go(settings);
  await page.getByLabel("Date format", { exact: true }).waitFor();
  assert.equal(
    await page.getByLabel("Date format", { exact: true }).inputValue(),
    "DMY"
  );
  assert.equal(
    await page.getByLabel("Time format", { exact: true }).inputValue(),
    "H24"
  );
  ok(
    "Keyboard navigation and 320/390/1440 layouts at doubled text, accurate preview, saved account formats and new-session persistence"
  );

  phase = "uncertain format save";
  const bodies = [];
  let lose = true;
  await page.route("**/api/platform/regional", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    bodies.push(route.request().postData());
    const response = await route.fetch();
    assert.ok(response.ok());
    if (lose) {
      lose = false;
      return route.abort("failed");
    }
    return route.fulfill({ response });
  });
  await page.getByLabel("Date format", { exact: true }).selectOption("YMD");
  await page.getByLabel("Time format", { exact: true }).selectOption("H12");
  await page
    .getByRole("button", { name: "Save date and time formats", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Retry the same save", exact: true })
    .waitFor();
  await page.waitForFunction(() =>
    [...document.querySelectorAll("button")].some(
      (b) => b.textContent === "Retry the same save" && !b.disabled
    )
  );
  saved = await db.platformUser.findUniqueOrThrow({ where: { id: a.id } });
  const acceptedVersion = saved.regionalVersion;
  assert.equal(saved.dateFormat, "YMD");
  assert.equal(
    await page.getByLabel("Date format", { exact: true }).inputValue(),
    "YMD"
  );
  await page
    .getByRole("button", { name: "Retry the same save", exact: true })
    .click();
  await formatsSaved();
  assert.equal(new Set(bodies).size, 1);
  assert.equal(bodies.length, 2);
  assert.equal(
    (await db.platformUser.findUniqueOrThrow({ where: { id: a.id } }))
      .regionalVersion,
    acceptedVersion
  );
  await page.unroute("**/api/platform/regional");
  await saveRegionalPreferences(db, a.token, {
    mutationId: randomUUID(),
    expectedVersion: acceptedVersion,
    dateFormat: "DMY",
    timeFormat: "H24"
  });
  await page.getByLabel("Time format", { exact: true }).selectOption("H24");
  await page
    .getByRole("button", { name: "Save date and time formats", exact: true })
    .click();
  await page.getByText(/This information changed/).waitFor();
  assert.equal(
    await page.getByLabel("Date format", { exact: true }).inputValue(),
    "YMD"
  );
  await page
    .getByRole("button", {
      name: "Discard edits and reload saved formats",
      exact: true
    })
    .click();
  await page.getByLabel("Date format", { exact: true }).waitFor();
  assert.equal(
    await page.getByLabel("Date format", { exact: true }).inputValue(),
    "DMY"
  );
  ok(
    "Accepted response loss retries identical bytes once; version conflicts retain unsaved choices until deliberate reload"
  );

  phase = "real event presentation";
  const calendar = await calendarCommand(db, a.token, {
    operation: "create-calendar",
    requestKey: randomUUID(),
    name: "Regional format QA calendar",
    timeZone: "America/Chicago"
  });
  const events = [];
  for (const allDay of [false, true]) {
    const current = await db.platformCalendar.findUniqueOrThrow({
      where: { id: calendar.id }
    });
    const event = await calendarCommand(db, a.token, {
      operation: "create-event",
      calendarId: calendar.id,
      expectedVersion: current.version,
      requestKey: randomUUID(),
      title: allDay ? "Leap day regional QA" : "Regional timed QA",
      allDay,
      startLocal: allDay ? "2028-02-29" : "2026-10-25T13:05",
      endLocal: allDay ? "2028-03-02" : "2026-10-25T14:05",
      timeZone: "America/Chicago",
      weeklyUntil: allDay ? null : "2026-11-01"
    });
    events.push(
      await db.calendarOccurrence.findFirstOrThrow({
        where: { eventId: event.id }
      })
    );
  }
  const originalTimes = events.map((e) => [
    e.startAt.toISOString(),
    e.endAt.toISOString()
  ]);
  await go(`/platform/events/${events[0].id}?timeZone=America%2FChicago`);
  await page
    .getByText(/25\/10\/2026, 13:05 CDT to 25\/10\/2026, 14:05 CDT/)
    .waitFor();
  await page
    .getByText("Occurrences in this series (2)", { exact: true })
    .click();
  await page
    .getByRole("link", { name: "25/10/2026 · 13:05", exact: true })
    .waitFor();
  await page
    .getByText(
      "Series dates use the event's source time zone: America/Chicago.",
      { exact: true }
    )
    .waitFor();
  await go(`/platform/events/${events[0].id}?timeZone=Asia%2FTokyo`);
  await page.getByText(/26\/10\/2026, 03:05 GMT\+9/).waitFor();
  await go(`/platform/events/${events[1].id}?timeZone=Pacific%2FHonolulu`);
  await page
    .getByText("All day · 29/02/2028 through 01/03/2028", { exact: true })
    .waitFor();
  const afterTimes = await Promise.all(
    events.map((e) =>
      db.calendarOccurrence.findUniqueOrThrow({ where: { id: e.id } })
    )
  );
  assert.deepEqual(
    afterTimes.map((e) => [e.startAt.toISOString(), e.endAt.toISOString()]),
    originalTimes
  );
  await bounded();
  await page.screenshot({
    path: output + "/all-day-phone.png",
    fullPage: true
  });
  ok(
    "Actual timed event and all-day pages use saved formats across explicit zones without changing stored instants"
  );

  phase = "private profile HTML and editor";
  await signIn(b);
  const memberResponse = await page.goto(
    config.origin + "/platform/profile/" + a.username
  );
  assert.doesNotMatch(await memberResponse.text(), new RegExp(location));
  await page.getByRole("heading", { level: 1 }).waitFor();
  assert.doesNotMatch(
    await page.locator("body").innerText(),
    new RegExp(location)
  );
  await signIn(a);
  const previewResponse = await page.goto(
    config.origin + "/platform/profile/" + a.username + "?preview=member"
  );
  assert.doesNotMatch(await previewResponse.text(), new RegExp(location));
  const visitorResponse = await page.goto(
    config.origin + "/platform/profile/" + a.username + "?preview=visitor"
  );
  assert.doesNotMatch(await visitorResponse.text(), new RegExp(location));
  await go("/platform/profile/me");
  await page
    .getByLabel("Who can see your location?", { exact: true })
    .waitFor();
  assert.equal(
    await page.getByLabel("Location (optional)", { exact: true }).inputValue(),
    location
  );
  assert.equal(
    await page
      .getByLabel("Who can see your location?", { exact: true })
      .inputValue(),
    "ONLY_ME"
  );
  await page
    .getByLabel("Who can see your location?", { exact: true })
    .selectOption("MEMBERS");
  await profileSave();
  await page.waitForURL("**/platform/profile/" + a.username);
  await signIn(b);
  await go("/platform/profile/" + a.username);
  await page.getByText("Location: " + location, { exact: true }).waitFor();
  await signIn(a);
  await go("/platform/profile/me");
  await page
    .getByLabel("Who can see your location?", { exact: true })
    .selectOption("ONLY_ME");
  await profileSave();
  await page.waitForURL("**/platform/profile/" + a.username);
  await signIn(b);
  const hiddenResponse = await page.goto(
    config.origin + "/platform/profile/" + a.username
  );
  assert.doesNotMatch(await hiddenResponse.text(), new RegExp(location));
  assert.equal(
    (await db.platformUser.findUniqueOrThrow({ where: { id: a.id } })).location,
    location
  );
  ok(
    "Only me is absent from actual member and preview HTML, sharing is deliberate, and hiding retains the owner's text"
  );

  phase = "restricted disclosure and restore";
  await signIn(restricted);
  await go("/platform/profile/me");
  await page
    .getByLabel("Who can see your location?", { exact: true })
    .waitFor();
  assert.equal(
    await page
      .locator('#profile-location-audience option[value="MEMBERS"]')
      .isDisabled(),
    true
  );
  await page
    .getByLabel("Location (optional)", { exact: true })
    .fill("Restricted private QA location");
  await profileSave();
  await page.waitForURL("**/platform/profile/" + restricted.username);
  assert.equal(
    (await getProfileEditor(db, restricted.token)).locationAudience,
    "ONLY_ME"
  );
  const entries = (
    await db.retentionControl.findMany({
      where: { kind: "PROFILE_LOCATION", sourceId: a.id },
      orderBy: { version: "asc" }
    })
  ).map((r) => r.payload);
  await db.platformUser.update({
    where: { id: a.id },
    data: {
      location: "Outdated location QA marker",
      locationAudience: "MEMBERS",
      locationVersion: 0
    }
  });
  await replayRetentionControls(db, entries);
  await signIn(a);
  await go("/platform/profile/me");
  await page.getByText(/Your location was cleared during recovery/).waitFor();
  assert.equal(
    await page.getByLabel("Location (optional)", { exact: true }).inputValue(),
    ""
  );
  assert.equal(
    await page
      .getByLabel("Who can see your location?", { exact: true })
      .inputValue(),
    "ONLY_ME"
  );
  await bounded();
  await page.screenshot({
    path: output + "/location-privacy-phone.png",
    fullPage: true
  });
  const restored = await getProfileEditor(db, a.token);
  await page
    .getByLabel("Location (optional)", { exact: true })
    .fill("Reviewed private QA city");
  await profileSave();
  await page.waitForURL("**/platform/profile/" + a.username);
  const reviewed = await getProfileEditor(db, a.token);
  assert.equal(reviewed.locationRecoveryRequired, false);
  assert.ok(reviewed.locationVersion > restored.locationVersion);
  ok(
    "Restricted profile controls permit Only me and restored privacy requires an explicit reviewed save"
  );

  phase = "account switch and read failure";
  await go(settings);
  await page.getByLabel("Date format", { exact: true }).waitFor();
  const unchanged = await db.platformUser.findUniqueOrThrow({
    where: { id: a.id }
  });
  await signIn(b);
  await page.evaluate(() => {
    window.dispatchEvent(new Event("blur"));
    window.dispatchEvent(new Event("focus"));
  });
  await page.waitForFunction(
    () =>
      !document.querySelector(
        '[aria-label="Language and location choices"] select'
      ) ||
      document
        .querySelector('[aria-label="Language and location choices"] select')
        ?.closest('[aria-hidden="true"]')
  );
  assert.equal(
    (await db.platformUser.findUniqueOrThrow({ where: { id: a.id } }))
      .regionalVersion,
    unchanged.regionalVersion
  );
  await signIn(a);
  await page.route("**/api/platform/settings", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ message: "Fixture settings unavailable" })
    })
  );
  await go(settings);
  await page
    .getByText("Fixture settings unavailable", { exact: true })
    .waitFor();
  assert.equal(
    await page.getByLabel("Date format", { exact: true }).count(),
    0
  );
  await page.unroute("**/api/platform/settings");
  await context.clearCookies();
  await go(settings);
  assert.equal(
    await page.getByLabel("Date format", { exact: true }).count(),
    0
  );
  ok(
    "Switched accounts and unavailable or guest reads conceal regional controls without saving to the wrong account"
  );
  phase = "live support formats and static demo";
  // The database and origin were checked as isolated before enabling fixture intake.
  process.env.SUPPORT_INTAKE_ENABLED = "true";
  const { seedSupport, requestInput } = await import("../tests/seed-support.ts");
  const { supportCommand } = await import("../lib/platform/support.ts");
  const support = await seedSupport(db);
  for (const actor of [support.memberA, support.owner])
    await saveRegionalPreferences(db, actor.token, {
      mutationId: randomUUID(), expectedVersion: 0,
      dateFormat: "DMY", timeFormat: "H24"
    });
  const subject = "Regional support QA " + randomUUID();
  const created = await supportCommand(
    db, support.memberA.token,
    await requestInput(db, support.memberA.token, { subject })
  );
  const stamp = "2026-09-15T13:05:00.000Z";
  await db.supportCase.update({
    where: { id: created.caseId },
    data: { createdAt: new Date(stamp), updatedAt: new Date(stamp) }
  });
  await signIn(support.memberA);
  await go("/platform/help/cases/" + created.caseId);
  assert.match(await page.locator(`time[datetime="${stamp}"]`).first().innerText(), /15\/09\/2026, 13:05 UTC/);
  await go("/platform/help/requests");
  assert.match(await page.locator("article").filter({ hasText: subject }).innerText(), /15\/09\/2026, 13:05 UTC/);
  await signIn(support.owner);
  await go("/platform/admin/requests");
  const caseLink = page.getByRole("link", { name: subject, exact: true });
  await caseLink.waitFor();
  await go(await caseLink.getAttribute("href"));
  assert.match(await page.locator(`time[datetime="${stamp}"]`).first().innerText(), /15\/09\/2026, 13:05 UTC/);
  await context.clearCookies();
  const demoApiRequests = [];
  const demoRequest = (request) => {
    if (new URL(request.url()).pathname.startsWith("/api/"))
      demoApiRequests.push(new URL(request.url()).pathname);
  };
  page.on("request", demoRequest);
  for (const view of ["support-requests", "support-case", "support-inbox"]) {
    await go("/platform/demo/" + view);
    assert.match(await page.locator("time").first().innerText(), /Sep 8, 2026, \d+:\d+ [AP]M UTC/);
  }
  page.off("request", demoRequest);
  assert.deepEqual(demoApiRequests, []);
  ok("Actual private support and admin pages use saved formats while all support demos retain static dates and make no API requests");
  assert.deepEqual(errors, []);
  writeFileSync(
    output + "/result.json",
    JSON.stringify(
      {
        passed: results.length,
        errors: errors.length,
        results,
        productionWrites: 0,
        externalSends: 0
      },
      null,
      2
    )
  );
} catch (error) {
  writeFileSync(
    output + "/failure.txt",
    `${phase}\n${String(error.stack ?? error)}\n${await page.locator("body").innerText()}`
  );
  await page.screenshot({ path: output + "/failure.png", fullPage: true });
  throw error;
} finally {
  await browser.close();
  await db.$disconnect();
}
