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
  NODE_ENV: "test",
  VERCEL: "",
  PRIVILEGED_MFA_MODE: "off"
});
const { PrismaClient } = await import("@prisma/client");
const { assertPortalTestDatabase, seedPortal } =
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
  viewport: { width: 390, height: 844 },
  timezoneId: "America/Chicago"
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
const output = fixtureDir + "/calendar-display-browser-" + Date.now();
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
  // Set up a new fictional login after leaving the prior account document.
  await page.goto("about:blank");
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
const settings = "/platform/settings/calendar/view";
const savedMessage = () =>
  page
    .getByText("Your calendar display and formats were saved.", { exact: true })
    .waitFor();
const currentUser = (id) =>
  db.platformUser.findUniqueOrThrow({ where: { id } });
const bounded = async () =>
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1
    ),
    true
  );
try {
  const f = await seedPortal(db),
    a = f.memberA,
    b = f.memberB;
  const source = await calendarCommand(db, a.token, {
    operation: "create-calendar",
    requestKey: randomUUID(),
    name: "Display QA calendar",
    timeZone: "America/Chicago"
  });
  for (let i = 0; i < 6; i++) {
    const c = await db.platformCalendar.findUniqueOrThrow({
      where: { id: source.id }
    });
    await calendarCommand(db, a.token, {
      operation: "create-event",
      calendarId: source.id,
      expectedVersion: c.version,
      requestKey: randomUUID(),
      title: i === 0 ? "All-day display QA" : `Timed display QA ${i}`,
      timeZone: "America/Chicago",
      allDay: i === 0,
      startLocal: i === 0 ? "2026-10-10" : "2026-10-10T23:30",
      endLocal: i === 0 ? "2026-10-11" : "2026-10-11T00:30",
      weeklyUntil: null
    });
  }
  const original = await db.calendarOccurrence.findMany({
    where: { event: { calendarId: source.id } },
    orderBy: { id: "asc" }
  });
  await signIn(a);
  await go(settings);
  await page.getByLabel("Week starts on", { exact: true }).selectOption("1");
  await page
    .getByLabel("Default calendar view", { exact: true })
    .selectOption("MONTH");
  await page
    .getByLabel("Fixed viewing time zone", { exact: true })
    .fill("Pacific/Auckland");
  await page.getByLabel("Time format", { exact: true }).selectOption("H24");
  await page
    .getByRole("button", { name: "Save calendar display", exact: true })
    .click();
  await savedMessage();
  const first = await currentUser(a.id);
  assert.equal(first.calendarWeekStart, 1);
  assert.equal(first.calendarDefaultView, "MONTH");
  assert.equal(first.calendarDisplayTimeZone, "Pacific/Auckland");
  const token = await loginAccount(
    db,
    a.email,
    a.password,
    "New display browser login"
  );
  await signIn({ ...a, token });
  await go("/platform/calendars?month=2026-10");
  const month = page.getByRole("region", { name: "Scrollable calendar month" });
  await month.waitFor();
  const monthPicker = page.getByLabel("Month", { exact: true });
  const pickerStyle = await monthPicker.evaluate((element) => {
    const style = getComputedStyle(element), rect = element.getBoundingClientRect();
    return { display: style.display, border: parseFloat(style.borderTopWidth),
      width: rect.width, height: rect.height, className: element.className };
  });
  assert.equal(pickerStyle.display, "block");
  assert.ok(pickerStyle.border >= 1 && pickerStyle.width >= 150 && pickerStyle.height >= 44);
  assert.ok(!pickerStyle.className.includes("function"), "Server-rendered picker uses actual shared style values");
  assert.equal(await month.locator("th").first().innerText(), "Monday");
  assert.match(
    await page.locator("body").innerText(),
    /Fixed viewing time zone: Pacific\/Auckland/
  );
  const cell = (date) =>
    month
      .locator("td")
      .filter({ has: page.locator(`time[datetime="${date}"]`) });
  await cell("2026-10-10")
    .getByRole("link", { name: "All-day display QA", exact: true })
    .waitFor();
  await cell("2026-10-11")
    .getByRole("link", { name: "Timed display QA 1", exact: true })
    .waitFor();
  assert.equal(await cell("2026-10-11").locator("li").count(), 3);
  const more = cell("2026-10-11").getByRole("link", {
    name: "2 more in agenda",
    exact: true
  });
  await more.waitFor();
  await more.click();
  await page.getByRole("list", { name: "Event agenda", exact: true }).waitFor();
  assert.equal(
    await page
      .getByRole("list", { name: "Event agenda", exact: true })
      .locator(":scope > li")
      .count(),
    6
  );
  assert.equal(
    new URL(page.url()).searchParams.get("timeZone"),
    "Pacific/Auckland"
  );
  assert.equal((await currentUser(a.id)).calendarDefaultView, "MONTH");
  ok(
    "Saved controls survive a new login, Monday month placement respects fixed zone and all-day dates, and dense days open the full agenda without changing defaults"
  );

  await go("/platform/calendars?month=2026-10");
  await month.waitFor();
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(
      () => (document.documentElement.style.fontSize = "32px")
    );
    await bounded();
    await month.focus();
    await page.keyboard.press("End");
    await page.screenshot({
      path: output + `/month-${width}.png`,
      fullPage: true
    });
    await page.evaluate(() => (document.documentElement.style.fontSize = ""));
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("link", { name: "Next month", exact: true }).click();
  await page.getByRole("table", { name: "November 2026 events" }).waitFor();
  assert.equal(new URL(page.url()).searchParams.get("mode"), "MONTH");
  assert.equal(new URL(page.url()).searchParams.get("zoneMode"), "FIXED");
  await go("/platform/calendars?month=2026-10&mode=AGENDA&timeZone=UTC");
  await page.getByRole("list", { name: "Event agenda", exact: true }).waitFor();
  assert.equal(
    (await currentUser(a.id)).calendarDisplayTimeZone,
    "Pacific/Auckland"
  );
  ok(
    "Month navigation preserves its mode and fixed zone; 320/390/1440 layouts at doubled text contain the scrollable grid; temporary overrides do not persist"
  );

  await go(settings);
  await page
    .getByLabel("Fixed viewing time zone", { exact: true })
    .fill("invalid draft zone");
  await page
    .getByLabel("Calendar time zone", { exact: true })
    .selectOption("DEVICE");
  await page
    .getByRole("button", { name: "Save calendar display", exact: true })
    .click();
  await savedMessage();
  await go("/platform/calendars?month=2026-10");
  await month.waitFor();
  assert.match(
    await page.locator("body").innerText(),
    /Following this device’s time zone: America\/Chicago/
  );
  assert.equal(new URL(page.url()).searchParams.get("zoneMode"), "DEVICE");
  const copied = page.url();
  const otherContext = await browser.newContext({
    timezoneId: "Asia/Tokyo",
    viewport: { width: 390, height: 844 }
  });
  await otherContext.route("**/*", (route) =>
    new URL(route.request().url()).origin === config.origin
      ? route.continue()
      : (blockedRequests.push(route.request().url()), route.abort())
  );
  await otherContext.addCookies([
    {
      name: "church_platform_session",
      value: token,
      domain: "127.0.0.1",
      path: "/",
      secure: true,
      httpOnly: true,
      sameSite: "Lax"
    }
  ]);
  const otherPage = await otherContext.newPage();
  otherPage.on("pageerror", (e) => errors.push(e.message));
  await otherPage.goto(copied);
  await otherPage
    .getByRole("region", { name: "Scrollable calendar month" })
    .waitFor();
  assert.match(
    await otherPage.locator("body").innerText(),
    /Following this device’s time zone: Asia\/Tokyo/
  );
  assert.equal(
    new URL(otherPage.url()).searchParams.get("timeZone"),
    "Asia/Tokyo"
  );
  await otherContext.close();
  await go("/platform/calendars?month=2026-10&timeZone=UTC&zoneMode=FIXED");
  await month.waitFor();
  assert.match(
    await page.locator("body").innerText(),
    /Fixed viewing time zone: UTC/
  );
  ok(
    "Following-device resolves Chicago and a copied URL on a Tokyo browser independently; an explicit fixed override stays fixed and mode changes discard an unused invalid zone draft"
  );

  await go(settings);
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
  await page.getByLabel("Week starts on", { exact: true }).selectOption("0");
  await page
    .getByRole("button", { name: "Save calendar display", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Retry the same save", exact: true })
    .click();
  await savedMessage();
  assert.equal(bodies.length, 2);
  assert.equal(new Set(bodies).size, 1);
  await page.unroute("**/api/platform/regional");
  const current = await currentUser(a.id);
  await saveRegionalPreferences(db, token, {
    mutationId: randomUUID(),
    expectedVersion: current.regionalVersion,
    dateFormat: "DMY",
    timeFormat: "H12",
    calendar: {
      weekStart: 1,
      defaultView: "AGENDA",
      timeZoneMode: "FIXED",
      timeZone: "Europe/London"
    }
  });
  await page
    .getByLabel("Default calendar view", { exact: true })
    .selectOption("AGENDA");
  await page
    .getByRole("button", { name: "Save calendar display", exact: true })
    .click();
  await page.getByText(/This information changed/).waitFor();
  assert.equal(
    await page.getByLabel("Week starts on", { exact: true }).inputValue(),
    "0"
  );
  await page
    .getByRole("button", {
      name: "Discard edits and reload saved formats",
      exact: true
    })
    .click();
  await page.getByLabel("Fixed viewing time zone", { exact: true }).waitFor();
  assert.equal(
    await page
      .getByLabel("Fixed viewing time zone", { exact: true })
      .inputValue(),
    "Europe/London"
  );
  ok(
    "Lost responses replay identical bytes exactly once; competing format/display saves retain the draft until deliberate reload"
  );

  await page.getByLabel("Week starts on", { exact: true }).selectOption("0");
  const beforeSwitch = await currentUser(a.id);
  await page
    .getByRole("link", { name: "Back to Calendar", exact: true })
    .click();
  assert.ok(page.url().endsWith(settings));
  await page
    .getByText(
      "Your display edits are still here. Save, retry or discard them before leaving.",
      { exact: true }
    )
    .waitFor();
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await context.clearCookies();
  await context.addCookies([
    {
      name: "church_platform_session",
      value: b.token,
      domain: "127.0.0.1",
      path: "/",
      secure: true,
      httpOnly: true,
      sameSite: "Lax"
    }
  ]);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page.waitForFunction(
    () => !document.querySelector('input[placeholder="America/Chicago"]')
  );
  assert.equal(
    await page.getByLabel("Week starts on", { exact: true }).count(),
    0
  );
  assert.deepEqual(await currentUser(a.id), beforeSwitch);
  await go("/platform/calendars?month=2026-10&mode=MONTH");
  await month.waitFor();
  assert.equal(
    await page
      .getByRole("link", { name: "All-day display QA", exact: true })
      .count(),
    0
  );
  assert.deepEqual(
    await db.calendarOccurrence.findMany({
      where: { event: { calendarId: source.id } },
      orderBy: { id: "asc" }
    }),
    original
  );
  ok(
    "Account changes conceal the former owner's controls and private calendar data; source event instants and dates stay byte-for-byte unchanged"
  );
  const shared = await calendarCommand(db, f.contact.token, {
    operation: "create-calendar",
    requestKey: randomUUID(),
    name: "Private month source marker",
    timeZone: "UTC"
  });
  await calendarCommand(db, f.contact.token, {
    operation: "create-event",
    calendarId: shared.id,
    expectedVersion: 1,
    requestKey: randomUUID(),
    title: "Private month title marker",
    description: "Private month notes marker",
    location: "Private month address marker",
    timeZone: "UTC",
    allDay: false,
    startLocal: "2026-10-10T09:00",
    endLocal: "2026-10-10T10:00",
    weeklyUntil: null
  });
  await calendarCommand(db, f.contact.token, {
    operation: "share-calendar",
    calendarId: shared.id,
    churchId: f.churchA.id,
    expectedVersion: 0,
    level: "BUSY",
    confirmed: true
  });
  await signIn(a);
  const sharedPath =
    "/platform/calendars?" +
    new URLSearchParams({
      month: "2026-10",
      mode: "MONTH",
      timeZone: "UTC",
      zoneMode: "FIXED",
      layers: "selected",
      layer: shared.id
    });
  const response = await go(sharedPath);
  assert.doesNotMatch(
    await response.text(),
    /Private month (title|notes|address|source) marker/
  );
  await month.getByRole("link", { name: "Busy", exact: true }).waitFor();
  assert.doesNotMatch(
    await page.locator("body").innerText(),
    /Private month (title|notes|address|source) marker/
  );
  await page.screenshot({
    path: output + "/busy-month-phone.png",
    fullPage: true
  });
  await calendarCommand(db, f.contact.token, {
    operation: "revoke-calendar-share",
    calendarId: shared.id,
    churchId: f.churchA.id,
    expectedVersion: 1
  });
  await page.reload();
  await page
    .getByRole("heading", { name: "Calendar unavailable", exact: true })
    .waitFor();
  assert.equal(
    await page.getByRole("link", { name: "Busy", exact: true }).count(),
    0
  );
  ok(
    "Dirty display links preserve the draft; month HTML and UI redact Busy source details and current revocation removes the view"
  );
  assert.deepEqual(errors, []);
  assert.deepEqual(blockedRequests, []);
  writeFileSync(
    output + "/result.json",
    JSON.stringify(
      {
        passed: results.length,
        results,
        browserErrors: errors,
        externalRequests: blockedRequests,
        productionWrites: 0,
        evidence: "isolated built HTTPS browser"
      },
      null,
      2
    )
  );
  console.log(JSON.stringify({ passed: results.length, output }));
} catch (error) {
  writeFileSync(
    output + "/failure.json",
    JSON.stringify(
      {
        error: String(error),
        stack: error.stack,
        url: page.url(),
        results,
        errors,
        text: await page
          .locator("body")
          .innerText()
          .catch(() => "")
      },
      null,
      2
    )
  );
  await page
    .screenshot({ path: output + "/failure.png", fullPage: true })
    .catch(() => {});
  throw error;
} finally {
  await browser.close();
  await db.$disconnect();
}
