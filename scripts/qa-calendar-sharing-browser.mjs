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
const output = fixtureDir + "/calendar-sharing-browser-" + Date.now();
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
const folder = async () => {
  await go("/platform/settings/calendar");
  await page.locator("#setting-calendar-sharing").waitFor();
};
try {
  const f = await seedPortal(db),
    owner = f.contact;
  const calendar = await calendarCommand(db, owner.token, {
    operation: "create-calendar",
    requestKey: randomUUID(),
    name: "Fictional disclosure calendar",
    timeZone: "America/Chicago"
  });
  const secret = {
    title: "Private appointment " + randomUUID(),
    description: "Private preparation notes " + randomUUID(),
    location: "Private location " + randomUUID(),
    onlineUrl: "https://example.test/private-" + randomUUID(),
    organizer: "Private organizer " + randomUUID()
  };
  const saved = await calendarCommand(db, owner.token, {
    operation: "create-event",
    calendarId: calendar.id,
    expectedVersion: 1,
    requestKey: randomUUID(),
    ...secret,
    allDay: false,
    startLocal: "2026-10-25T09:00",
    endLocal: "2026-10-25T10:00",
    timeZone: "America/Chicago",
    weeklyUntil: null
  });
  const occurrence = await db.calendarOccurrence.findFirstOrThrow({
    where: { eventId: saved.id }
  });
  const calendarPath = "/platform/calendars/" + calendar.id;
  const eventPath = "/platform/events/" + occurrence.id;
  const commands = [];
  page.on("request", (request) => {
    if (request.method() === "POST")
      commands.push(new URL(request.url()).pathname);
  });
  await signIn(owner);
  await folder();
  await page.locator("#setting-calendar-sharing").click();
  await page
    .getByRole("link", { name: "Fictional disclosure calendar", exact: true })
    .click();
  await go(calendarPath + "?month=2026-09");
  await page
    .getByText(
      "Add an event or choose a month with an active event to compare a real example. Whole-calendar sharing still includes current and future events.",
      { exact: true }
    )
    .waitFor();
  const form = page.getByRole("form", {
    name: "Change calendar view",
    exact: true
  });
  await form.getByLabel("Month", { exact: true }).fill("2026-10");
  await form.getByRole("button", { name: "Update view", exact: true }).click();
  await page
    .getByRole("heading", { name: "Compare sharing levels", exact: true })
    .waitFor();
  const previews = page.getByRole("region", {
    name: "Compare sharing levels",
    exact: true
  });
  const busy = page.locator('[aria-label="Busy-only preview"]');
  const details = page.locator('[aria-label="Full-details preview"]');
  await previews.locator("summary", { hasText: "Busy-only preview" }).focus();
  await page.keyboard.press("Enter");
  await busy.waitFor();
  assert.match(await busy.innerText(), /Busy/);
  for (const value of Object.values(secret))
    assert.ok(!(await busy.innerHTML()).includes(value));
  await previews
    .locator("summary", { hasText: "Full-details preview" })
    .click();
  await details.waitFor();
  for (const value of Object.values(secret))
    assert.ok((await details.innerText()).includes(value));
  assert.match(await previews.innerText(), /one active event in the month/);
  assert.equal(
    await db.calendarShare.count({ where: { calendarId: calendar.id } }),
    0
  );
  assert.equal(
    await db.calendarEventShare.count({ where: { eventId: saved.id } }),
    0
  );
  assert.deepEqual(commands, []);
  for (const width of [320, 390, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "200%";
    });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1
      ),
      "Preview reflows at " + width
    );
    if (width === 390)
      await page.screenshot({
        path: output + "/sharing-390-large.png",
        fullPage: true
      });
  }
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "";
  });
  ok(
    "Settings entry, empty month, actual redacted/full source previews, keyboard expansion and enlarged text; previewing writes nothing"
  );

  await go(eventPath);
  await page
    .getByRole("heading", { name: "Compare sharing levels", exact: true })
    .waitFor();
  assert.match(await previews.innerText(), /current occurrence/);
  const share = page.getByRole("form", {
    name: "Save event sharing with " + f.churchA.name,
    exact: true
  });
  await share
    .getByLabel("Information to share", { exact: true })
    .selectOption("BUSY");
  await share.getByRole("checkbox").check();
  await share
    .getByRole("button", {
      name: "Save event sharing with " + f.churchA.name,
      exact: true
    })
    .click();
  await page
    .getByText("Current event sharing: Busy only", { exact: true })
    .waitFor();
  await signIn(f.memberA);
  await go(eventPath);
  await page.getByRole("heading", { name: "Busy", exact: true }).waitFor();
  assert.equal(
    await page
      .getByRole("region", { name: "Compare sharing levels", exact: true })
      .count(),
    0
  );
  const busyHtml = await (
    await context.request.get(config.origin + eventPath)
  ).text();
  const busyDto = await (
    await context.request.get(
      config.origin +
        "/api/platform/calendars?view=event&occurrenceId=" +
        occurrence.id
    )
  ).text();
  for (const value of Object.values(secret)) {
    assert.ok(!busyHtml.includes(value), "Busy HTML excludes " + value);
    assert.ok(!busyDto.includes(value), "Busy JSON excludes " + value);
  }
  ok(
    "Event-series preview scope and actual confirmed BUSY sharing redact private fields from another member's HTML and JSON"
  );

  await signIn(owner);
  await go(calendarPath + "?month=2026-10");
  const whole = page.getByRole("form", {
    name: "Save calendar sharing with " + f.churchA.name,
    exact: true
  });
  await whole
    .getByLabel("Information to share", { exact: true })
    .selectOption("DETAILS");
  await whole.getByRole("checkbox").check();
  await whole
    .getByRole("button", {
      name: "Save calendar sharing with " + f.churchA.name,
      exact: true
    })
    .click();
  await page
    .getByText("Current calendar sharing: Full details", { exact: true })
    .waitFor();
  await go(eventPath);
  assert.match(
    await previews.innerText(),
    /full-detail share on either the calendar or event can still reveal details/
  );
  await page
    .getByRole("button", {
      name: "End event sharing with " + f.churchA.name,
      exact: true
    })
    .click();
  await page.getByText("Current event sharing: Off", { exact: true }).waitFor();
  await signIn(f.memberA);
  await go(eventPath);
  await page
    .getByRole("heading", { name: secret.title, exact: true })
    .waitFor();
  assert.equal(
    await page
      .getByRole("region", { name: "Compare sharing levels", exact: true })
      .count(),
    0
  );
  await signIn(owner);
  await go(calendarPath + "?month=2026-10");
  await page
    .getByRole("button", {
      name: "End calendar sharing with " + f.churchA.name,
      exact: true
    })
    .click();
  await page
    .getByText("Current calendar sharing: Off", { exact: true })
    .waitFor();
  await signIn(f.memberA);
  await go(eventPath);
  await page
    .getByRole("heading", { name: "Calendar unavailable", exact: true })
    .waitFor();
  assert.doesNotMatch(
    await page.locator("body").innerText(),
    new RegExp(secret.title)
  );
  ok(
    "Independent calendar full-detail authority survives event-share revocation; revoking both ends access and previews remain owner-only"
  );

  for (const actor of [f.unverified, f.unacknowledged, f.memberB]) {
    await signIn(actor);
    await go(eventPath);
    assert.equal(
      await page
        .getByRole("region", { name: "Compare sharing levels", exact: true })
        .count(),
      0
    );
    assert.doesNotMatch(
      await page.locator("body").innerText(),
      new RegExp(secret.title)
    );
  }
  await context.clearCookies();
  await go(eventPath);
  assert.equal(
    await page
      .getByRole("region", { name: "Compare sharing levels", exact: true })
      .count(),
    0
  );
  assert.doesNotMatch(
    await page.locator("body").innerText(),
    new RegExp(secret.title)
  );
  assert.deepEqual(errors, []);
  assert.deepEqual(blockedRequests, []);
  ok(
    "Unverified, non-adult-acknowledged, outsider and guest sessions cannot read private event previews; no new schedule authority"
  );
  writeFileSync(
    output + "/summary.json",
    JSON.stringify(
      {
        origin: config.origin,
        results,
        passed: results.length,
        browserErrors: errors,
        externalRequests: blockedRequests,
        fixtureCommands: commands.length,
        productionWrites: 0
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
      productionWrites: 0
    })
  );
} catch (error) {
  await page
    .screenshot({ path: output + "/failure.png", fullPage: true })
    .catch(() => {});
  writeFileSync(
    output + "/failure.json",
    JSON.stringify(
      {
        error: String(error),
        stack: error.stack,
        url: page.url(),
        results,
        errors,
        overflow: await page.evaluate(() =>
          [...document.querySelectorAll("body *")]
            .map((e) => ({
              tag: e.tagName,
              cls: e.className,
              name: e.getAttribute("name"),
              width: e.getBoundingClientRect().width,
              right: e.getBoundingClientRect().right
            }))
            .filter((e) => e.right > innerWidth + 1)
        )
      },
      null,
      2
    )
  );
  throw error;
} finally {
  await browser.close();
  await db.$disconnect();
}
