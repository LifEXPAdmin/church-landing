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
const output = fixtureDir + "/calendar-settings-browser-" + Date.now();
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
  const saved = await calendarCommand(db, owner.token, {
    operation: "create-calendar",
    requestKey: randomUUID(),
    name: "Fictional settings calendar",
    timeZone: "America/Chicago"
  });
  const before = await db.platformCalendar.findUniqueOrThrow({
    where: { id: saved.id }
  });
  await signIn(owner);
  await folder();
  const main = page.locator(".gc-settings-main");
  assert.match(await main.innerText(), /These are personal viewing choices/);
  for (const name of [
    "Display",
    "Reminders and alerts",
    "Calendars and subscriptions",
    "Schedule sharing"
  ])
    await main.getByRole("heading", { name, exact: true }).waitFor();
  assert.equal(await main.locator("#setting-calendar-sharing").count(), 1);
  assert.equal(await main.locator("#setting-calendar-details").count(), 1);
  assert.equal(
    await main.locator("input, select, button[disabled]").count(),
    0
  );
  assert.ok(
    await page
      .locator("#calendar-audience")
      .evaluate(
        (heading) =>
          !!(
            heading.compareDocumentPosition(
              document.querySelector("#setting-calendar-sharing")
            ) & Node.DOCUMENT_POSITION_FOLLOWING
          )
      )
  );
  assert.match(
    await main.innerText(),
    /an active full-detail share can still reveal event details/
  );
  assert.match(await main.innerText(), /Saved defaults apply when you open a calendar/);
  for (const width of [320, 390, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "200%";
    });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1
      ),
      "No overflow at " + width
    );
    if (width === 320)
      await page.screenshot({
        path: output + "/calendar-320-large.png",
        fullPage: true
      });
  }
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "";
  });
  await page.setViewportSize({ width: 390, height: 844 });
  ok(
    "Four personal groups, separate sharing rows, audience-first order, truthful availability and 320/390/1280 large-text layout"
  );

  await page.locator("#setting-calendar-formats").focus();
  await page.keyboard.press("Enter");
  await page.waitForURL("**/settings/language/interface");
  await page.getByLabel("Date format", { exact: true }).waitFor();
  await page.getByLabel("Time format", { exact: true }).waitFor();
  await page.goBack();
  await page.locator("#setting-calendar-formats").waitFor();
  await page.waitForFunction(
    () => document.activeElement?.id === "setting-calendar-formats"
  );
  await page.locator("#setting-calendar-alerts").click();
  await page.waitForURL("**/settings/notifications/availability");
  await page
    .getByRole("heading", { name: "Notification preferences", exact: true })
    .waitFor();
  await folder();
  await page.locator("#setting-calendar-commitments").click();
  await page.waitForURL("**/platform/commitments");
  await page
    .getByRole("heading", { name: "My commitments", exact: true })
    .waitFor();
  ok(
    "Keyboard entry and Back focus use canonical date/time, notification and commitment screens"
  );

  await folder();
  await page.locator("#setting-calendar-view").click();
  await page.waitForURL("**/platform/settings/calendar/view");
  await page.getByLabel("Week starts on", { exact: true }).waitFor();
  for (const id of ["layers", "sharing", "details"]) {
    await folder();
    await page.locator("#setting-calendar-" + id).click();
    await page.waitForURL("**/platform/calendars");
    await page
      .getByRole("link", { name: "Fictional settings calendar", exact: true })
      .waitFor();
  }
  assert.deepEqual(
    await db.platformCalendar.findUniqueOrThrow({ where: { id: saved.id } }),
    before
  );
  assert.equal(
    await db.calendarShare.count({ where: { calendarId: saved.id } }),
    0
  );
  await page
    .getByRole("link", { name: "Fictional settings calendar", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Share this calendar", exact: true })
    .waitFor();
  const share = page.getByRole("form", {
    name: "Save calendar sharing with " + f.churchA.name,
    exact: true
  });
  await share
    .getByLabel("Information to share", { exact: true })
    .selectOption("BUSY");
  await share.getByRole("checkbox").check();
  await share
    .getByRole("button", {
      name: "Save calendar sharing with " + f.churchA.name,
      exact: true
    })
    .click();
  await page
    .getByText("Current calendar sharing: Busy only", { exact: true })
    .waitFor();
  let row = await db.calendarShare.findFirstOrThrow({
    where: { calendarId: saved.id, churchId: f.churchA.id }
  });
  assert.equal(row.level, "BUSY");
  await share
    .getByLabel("Information to share", { exact: true })
    .selectOption("DETAILS");
  await share.getByRole("checkbox").check();
  await share
    .getByRole("button", {
      name: "Save calendar sharing with " + f.churchA.name,
      exact: true
    })
    .click();
  await page
    .getByText("Current calendar sharing: Full details", { exact: true })
    .waitFor();
  row = await db.calendarShare.findFirstOrThrow({
    where: { calendarId: saved.id, churchId: f.churchA.id }
  });
  assert.equal(row.level, "DETAILS");
  await page
    .getByRole("button", {
      name: "End calendar sharing with " + f.churchA.name,
      exact: true
    })
    .click();
  await page
    .getByText("Current calendar sharing: Off", { exact: true })
    .waitFor();
  row = await db.calendarShare.findFirstOrThrow({
    where: { calendarId: saved.id, churchId: f.churchA.id }
  });
  assert.ok(row.revokedAt);
  ok(
    "Navigation is read-only; canonical sharing confirms busy/full details separately and revokes the saved share"
  );

  await go("/platform/settings");
  await page.getByLabel("Search settings", { exact: true }).fill("busy");
  await page.locator("#setting-calendar-sharing").waitFor();
  await page.getByLabel("Search settings", { exact: true }).fill("reminder");
  await page.locator("#setting-calendar-alerts").waitFor();
  assert.match(
    await page.locator("#setting-calendar-alerts").innerText(),
    /not available yet/
  );
  await context.clearCookies();
  await go("/platform/settings/calendar");
  assert.equal(await page.locator("#setting-calendar-sharing").count(), 0);
  assert.doesNotMatch(
    await page.locator("body").innerText(),
    /Fictional settings calendar|private-login@example.test/
  );
  const signInLinks = await page
    .getByRole("link", { name: "Sign in", exact: true })
    .evaluateAll((links) => links.map((link) => link.href));
  assert.ok(
    signInLinks.some(
      (href) =>
        new URL(href).searchParams.get("next") === "/platform/settings/calendar"
    )
  );
  await signIn(f.memberB);
  await folder();
  await page.locator("#setting-calendar-details").click();
  await page.waitForURL("**/platform/calendars");
  await page
    .getByRole("heading", { name: "My calendars", exact: true })
    .waitFor();
  assert.doesNotMatch(
    await page.locator("body").innerText(),
    /Fictional settings calendar/
  );
  ok(
    "Search respects availability; sign-in return is bounded and another account cannot see the prior calendar"
  );
  assert.deepEqual(errors, []);
  assert.deepEqual(blockedRequests, []);
  writeFileSync(
    output + "/summary.json",
    JSON.stringify(
      {
        origin: config.origin,
        passed: results.length,
        results,
        browserErrors: errors,
        externalRequests: blockedRequests,
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
        errors
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
