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
const output = fixtureDir + "/calendar-privacy-browser-" + Date.now();
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
const folder = async () => {
  await go("/platform/settings/calendar");
  await page.locator("#setting-calendar-sharing").waitFor();
};
try {
  const f = await seedPortal(db);
  const { portalCommand } = await import("../lib/platform/portal.ts");
  const grant = (actor, church, capability) =>
    portalCommand(db, f.operator.token, {
      operation: "grant",
      churchId: church.id,
      userId: actor.id,
      capability,
      expectedVersion: 0
    });
  await grant(f.memberA, f.churchA, "EDIT_CHURCH_CALENDAR");
  await grant(f.coordinator, f.churchA, "PUBLISH_CHURCH_EVENTS");
  await grant(f.memberB, f.churchB, "EDIT_CHURCH_CALENDAR");
  const create = async (actor, name, churchId) => {
    const calendar = await calendarCommand(db, actor.token, {
      operation: "create-calendar",
      requestKey: randomUUID(),
      name,
      churchId,
      timeZone: "America/Chicago"
    });
    const event = await calendarCommand(db, actor.token, {
      operation: "create-event",
      calendarId: calendar.id,
      expectedVersion: 1,
      requestKey: randomUUID(),
      title: name + " private event",
      description: "Fictional private notes",
      allDay: false,
      startLocal: "2026-10-25T09:00",
      endLocal: "2026-10-25T10:00",
      timeZone: "America/Chicago",
      weeklyUntil: null
    });
    const occurrence = await db.calendarOccurrence.findFirstOrThrow({
      where: { eventId: event.id }
    });
    return {
      calendar,
      event,
      occurrence,
      path: "/platform/calendars/" + calendar.id,
      eventPath: "/platform/events/" + occurrence.id
    };
  };
  const personal = await create(f.contact, "Personal private fixture"),
    a = await create(f.memberA, "Church A calendar fixture", f.churchA.id),
    b = await create(f.memberB, "Church B calendar fixture", f.churchB.id);
  const posts = [];
  page.on("request", (r) => {
    if (r.method() === "POST") posts.push(new URL(r.url()).pathname);
  });
  const scope = page.getByRole("region", {
    name: "Church calendar administration",
    exact: true
  });
  await signIn(f.contact);
  await go(personal.path + "?month=2026-10");
  const prior = await db.calendarEvent.findUniqueOrThrow({
    where: { id: personal.event.id }
  });
  await page
    .getByRole("link", { name: "Manage event privacy", exact: true })
    .click();
  await page.locator("#event-privacy").waitFor();
  assert.equal(new URL(page.url()).hash, "#event-privacy");
  assert.match(
    await page.locator("#event-privacy").innerText(),
    /Share this event/
  );
  assert.equal(await scope.count(), 0);
  await go(personal.path + "?month=2026-10&timeZone=America%2FLos_Angeles");
  assert.deepEqual(posts, []);
  const form = page.getByRole("form", {
    name: "Save calendar settings",
    exact: true
  });
  await form
    .getByLabel("Default time zone for new events", { exact: true })
    .fill("America/Denver");
  const saved = page.waitForResponse(
    (r) =>
      new URL(r.url()).pathname === "/api/platform/calendars" &&
      r.request().method() === "POST"
  );
  await form
    .getByRole("button", { name: "Save calendar settings", exact: true })
    .click();
  assert.equal((await saved).status(), 200);
  assert.deepEqual(
    await db.calendarEvent.findUniqueOrThrow({
      where: { id: personal.event.id }
    }),
    prior
  );
  assert.equal(
    await db.calendarShare.count({
      where: { calendarId: personal.calendar.id }
    }),
    0
  );
  assert.equal(
    await db.calendarEventShare.count({
      where: { eventId: personal.event.id }
    }),
    0
  );
  ok(
    "Personal agenda links to exact event privacy; navigation and changed new-event default leave existing private audience, times and shares unchanged"
  );

  await signIn(f.memberA);
  await folder();
  await page.locator("#setting-calendar-church").click();
  const item = page
    .locator("li")
    .filter({
      has: page.getByRole("link", {
        name: "Church A calendar fixture",
        exact: true
      })
    });
  await item
    .getByRole("link", { name: "Manage church calendar", exact: true })
    .click();
  await scope.waitFor();
  assert.equal(new URL(page.url()).hash, "#calendar-administration");
  assert.match(await scope.innerText(), new RegExp(f.churchA.name));
  assert.match(await scope.innerText(), /Calendar editor: Edit details/);
  assert.doesNotMatch(
    await scope.innerText(),
    /Event publisher: Publish event audiences/
  );
  assert.equal(
    await scope.getByRole("link").getAttribute("href"),
    `/platform/churches/${f.churchA.id}/responsibilities`
  );
  await go(a.eventPath);
  await scope.waitFor();
  assert.equal(await page.locator("#event-privacy").count(), 0);
  assert.equal(
    await page
      .getByRole("form", { name: "Save event audience", exact: true })
      .count(),
    0
  );
  const forged = await context.request.post(
    config.origin + "/api/platform/calendars",
    {
      headers: { Origin: config.origin },
      data: {
        operation: "set-visibility",
        eventId: a.event.id,
        expectedVersion: 1,
        visibility: "PUBLIC",
        confirmed: true
      }
    }
  );
  assert.equal(forged.status(), 403);
  ok(
    "Settings church administration uses selected organization, actual editor duty and canonical roles link; editor has no publication form or forged API authority"
  );

  await signIn(f.coordinator);
  await go(a.path + "?month=2026-10");
  await scope.waitFor();
  assert.match(
    await scope.innerText(),
    /Event publisher: Publish event audiences/
  );
  assert.doesNotMatch(await scope.innerText(), /Calendar editor: Edit details/);
  await page
    .getByRole("link", { name: "Manage event privacy", exact: true })
    .click();
  await page.locator("#event-privacy").waitFor();
  assert.match(
    await page.locator("#event-privacy").innerText(),
    /Church publication/
  );
  assert.equal(
    await page
      .getByRole("heading", { name: "Edit this occurrence", exact: true })
      .count(),
    0
  );
  for (const width of [320, 390, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "200%";
    });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1
      ),
      "Scope and privacy controls reflow at " + width
    );
    if (width === 390)
      await scope.screenshot({ path: output + "/church-scope-390-large.png" });
  }
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "";
  });
  const grantRow = await db.churchCapabilityGrant.findFirstOrThrow({
    where: {
      userId: f.coordinator.id,
      churchId: f.churchA.id,
      capability: "PUBLISH_CHURCH_EVENTS",
      revokedAt: null
    }
  });
  await portalCommand(db, f.operator.token, {
    operation: "revoke-grant",
    churchId: f.churchA.id,
    id: grantRow.id,
    expectedVersion: grantRow.version
  });
  const audience = page.getByRole("form", {
    name: "Save event audience",
    exact: true
  });
  await audience
    .getByLabel("Event series audience", { exact: true })
    .selectOption("PUBLIC");
  await audience.getByRole("checkbox").check();
  const stale = page.waitForResponse(
    (r) =>
      new URL(r.url()).pathname === "/api/platform/calendars" &&
      r.request().method() === "POST"
  );
  await audience
    .getByRole("button", { name: "Save event audience", exact: true })
    .click();
  assert.equal((await stale).status(), 403);
  assert.equal(
    (await db.calendarEvent.findUniqueOrThrow({ where: { id: a.event.id } }))
      .visibility,
    "PRIVATE"
  );
  await go(a.eventPath);
  assert.equal(await scope.count(), 0);
  assert.equal(await page.locator("#event-privacy").count(), 0);
  ok(
    "Publisher-only duty reaches exact audience controls without editor tools; revoked authority rejects an already-open form and disappears on refresh; enlarged layouts pass"
  );

  await signIn(f.memberB);
  await go(b.path);
  await scope.waitFor();
  assert.match(await scope.innerText(), new RegExp(f.churchB.name));
  assert.doesNotMatch(await scope.innerText(), new RegExp(f.churchA.name));
  await go(a.path);
  assert.equal(await scope.count(), 0);
  await go(a.eventPath + "#event-privacy");
  assert.equal(await page.locator("#event-privacy").count(), 0);
  for (const actor of [f.contact, f.unverified, f.unacknowledged]) {
    await signIn(actor);
    await go(a.eventPath);
    assert.equal(await scope.count(), 0);
    assert.equal(await page.locator("#event-privacy").count(), 0);
  }
  await page.goto("about:blank");
  await context.clearCookies();
  await go(a.eventPath + "#event-privacy");
  assert.equal(await scope.count(), 0);
  assert.equal(await page.locator("#event-privacy").count(), 0);
  assert.deepEqual(errors, []);
  assert.deepEqual(blockedRequests, []);
  ok(
    "Second church remains scoped to its own editor; wrong-church, ordinary member, ineligible and guest direct links cannot reveal private administration"
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
        fixtureCommands: posts.length,
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
