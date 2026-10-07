import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { createRequire } from "node:module";
import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { sessionCookieFixtureName } from "./session-cookie-fixture.mjs";

// The parent owns the ready isolated production app. This runner only creates
// fictional fixtures and drives the real schedule-link interface.
assert.ok(process.argv[2], "Pass the owned isolated fixture directory.");
const fixture = resolve(process.argv[2]);
assert.ok(fixture.startsWith(resolve(".account-test") + "/"));
const envFile = join(fixture, "test-env.json");
Object.assign(process.env, JSON.parse(readFileSync(envFile, "utf8")));
const configFile = join(fixture, "browser-env.json");
const config = existsSync(configFile)
  ? JSON.parse(readFileSync(configFile, "utf8"))
  : {
      origin: process.env.ACCOUNT_ORIGIN,
      certificate: join(fixture, "localhost-cert.pem")
    };
const origin = config.origin;
assert.match(origin, /^https:\/\/127\.0\.0\.1:\d+$/);
assert.equal(
  resolve(process.env.NODE_EXTRA_CA_CERTS ?? ""),
  resolve(config.certificate),
  "Start Node with NODE_EXTRA_CA_CERTS set to the owned HTTPS certificate."
);
Object.assign(process.env, {
  ACCOUNT_ORIGIN: origin,
  NEXT_PUBLIC_SITE_URL: origin,
  ACCOUNT_TEST_ISOLATED: "1",
  ACCOUNT_DELIVERY_MODE: "test-sink",
  NODE_ENV: "test",
  VERCEL: "",
  PRIVILEGED_MFA_MODE: "off",
  COMMUNITY_REPORTS_ENABLED: "true",
  SOCIAL_EMAIL_ENABLED: "false",
  PUSH_ENABLED: "false",
  FOUNDER_WELCOME_ENABLED: "false",
  FOUNDER_ANNOUNCEMENTS_ENABLED: "false",
  RESEND_API_KEY: "",
  MAILERLITE_API_KEY: ""
});
if (config.database)
  Object.assign(process.env, {
    DATABASE_URL: config.database,
    DIRECT_URL: config.database
  });
const { PrismaClient } = await import("@prisma/client");
const { assertPortalTestDatabase, createPortalActor, seedOperatorGrants } =
  await import("../tests/seed-portal.ts");
const { seedInterchurchHelp } =
  await import("../tests/seed-interchurch-help.ts");
const { calendarCommand } =
  await import("../lib/platform/calendar-commands.ts");
const db = new PrismaClient();
await assertPortalTestDatabase(db);
const { chromium } = createRequire(
  process.env.PLAYWRIGHT_MODULE ??
    `${process.env.HOME}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json`
)("playwright");
const publicKey = execFileSync("openssl", [
  "x509",
  "-in",
  config.certificate,
  "-pubkey",
  "-noout"
]);
const der = execFileSync("openssl", ["pkey", "-pubin", "-outform", "DER"], {
  input: publicKey
});
const browser = await chromium.launch({
  headless: true,
  executablePath:
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  args: [
    "--ignore-certificate-errors-spki-list=" +
      createHash("sha256").update(der).digest("base64"),
    "--no-proxy-server"
  ]
});
const context = await browser.newContext({
  viewport: { width: 390, height: 844 }
});
context.setDefaultTimeout(15000);
const external = [],
  errors = [],
  results = [];
await context.route("**/*", (route) => {
  if (new URL(route.request().url()).origin === origin) return route.continue();
  external.push(route.request().url());
  return route.abort();
});
const page = await context.newPage();
page.on("pageerror", (e) => errors.push(e.message));
page.on("dialog", (dialog) => dialog.accept());
const output = join(fixture, "interchurch-schedule-browser-" + Date.now());
mkdirSync(output, { recursive: true });
const sources = [
  "lib/platform/interchurch-help-schedule.ts",
  "lib/platform/interchurch-help-commands.ts",
  "lib/platform/interchurch-help-reads.ts",
  "components/platform/interchurch-help-schedule.tsx",
  "components/platform/interchurch-help-actions.tsx",
  "lib/platform/calendar-commands.ts",
  "lib/platform/post-participation.ts"
];
const identity = {
  head: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
  buildId: readFileSync(".next/BUILD_ID", "utf8").trim(),
  runnerSha256: createHash("sha256")
    .update(readFileSync(new URL(import.meta.url)))
    .digest("hex"),
  hashes: Object.fromEntries(
    sources.map((path) => [
      path,
      createHash("sha256").update(readFileSync(path)).digest("hex")
    ])
  )
};
const progress = (step) => {
  writeFileSync(
    join(output, "progress.json"),
    JSON.stringify(
      { identity, step, results, at: new Date().toISOString() },
      null,
      2
    )
  );
  console.log("STEP " + step);
};
const bounded = async (promise, label) => {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(Error(`Timed out: ${label}`)), 15000);
      })
    ]);
  } finally {
    clearTimeout(timer);
  }
};
const settled = () => page.waitForLoadState("networkidle", { timeout: 15000 });
const ok = (label) => {
  results.push(label);
  console.log("PASS " + label);
};
const button = (name) => page.getByRole("button", { name, exact: true });
const schedule = () =>
  page.getByRole("region", { name: "Agreement schedule link", exact: true });
const privateOffer = () =>
  page.getByRole("article", { name: "Private ministry offer", exact: true });
const schedulePattern = /\/api\/platform\/exchange\?.*view=help-schedule/;
const wait = async (fn) => {
  for (let i = 0; i < 100; i++) {
    if (await fn()) return;
    await page.waitForTimeout(100);
  }
  throw Error("Expected current saved state was not observed.");
};
const signin = async (actor) => {
  await context.clearCookies();
  await context.addCookies([
    {
      name: sessionCookieFixtureName(origin),
      value: actor.token,
      url: origin,
      secure: true,
      httpOnly: true,
      sameSite: "Lax"
    }
  ]);
};
const go = async (actor, path) => {
  await signin(actor);
  const response = await page.goto(origin + path);
  assert.equal(response.status(), 200);
  await page.bringToFront();
  await settled();
};
const proposed = () =>
  schedule().getByRole("checkbox", { name: /I propose this schedule change/ });
let offerId, manager, responder;
const agreement = () =>
  db.interchurchHelpAgreement.findUniqueOrThrow({ where: { offerId } });
const open = (actor) =>
  go(actor, "/platform/exchange/help/offers?id=" + offerId);
const acknowledge = async (actor) => {
  await open(actor);
  const prior = await agreement();
  await page
    .getByRole("checkbox", {
      name: "I acknowledge the exact current terms shown for this private agreement.",
      exact: true
    })
    .check();
  await button("Acknowledge current agreement").click();
  await wait(async () => (await agreement()).version > prior.version);
};
const choose = async (kind, id) => {
  await schedule()
    .getByLabel("Schedule type", { exact: true })
    .selectOption(kind);
  await schedule()
    .getByRole("button", { name: "Find current schedules", exact: true })
    .click();
  await schedule()
    .getByLabel("Current schedule", { exact: true })
    .selectOption(id);
  await proposed().check();
};
try {
  const reviewer = await createPortalActor(db, "schedreview");
  await seedOperatorGrants(db, reviewer, ["REVIEW_COMMUNITY_REPORTS"]);
  const f = await seedInterchurchHelp(db);
  manager = f.manager;
  responder = f.responder;
  offerId = await f.offer();
  let saved;
  const counts = await Promise.all([
    db.calendarResponse.count(),
    db.postVolunteerSignup.count(),
    db.volunteerApplication.count()
  ]);

  await open(manager);
  await schedule().waitFor();
  await choose("EVENT", f.occurrence.id);
  let firstBody,
    dropped = false;
  const retryBodies = [];
  const loseLink = async (route) => {
    if (
      route.request().method() === "POST" &&
      JSON.parse(route.request().postData()).operation === "help-link-schedule"
    ) {
      const body = route.request().postData();
      retryBodies.push(body);
      if (!dropped) {
        dropped = true;
        firstBody = body;
        await route.fetch();
        return route.abort("failed");
      }
    }
    return route.continue();
  };
  await page.route("**/api/platform/exchange", loseLink);
  await schedule()
    .getByRole("button", { name: "Link selected schedule", exact: true })
    .click();
  await button("Confirm original request").waitFor();
  await button("Confirm original request").click();
  await wait(async () => retryBodies.length === 2);
  await page.unroute("**/api/platform/exchange", loseLink);
  assert.equal(retryBodies[1], firstBody);
  saved = await agreement();
  assert.equal(saved.state, "NEEDS_REVIEW");
  assert.equal(saved.requesterAcknowledged, null);
  assert.equal(saved.responderAcknowledged, null);
  assert.equal(saved.terms.schedule.id, f.occurrence.id);
  assert.deepEqual(
    await Promise.all([
      db.calendarResponse.count(),
      db.postVolunteerSignup.count(),
      db.volunteerApplication.count()
    ]),
    counts
  );
  ok(
    "Actual event-link proposal and exact lost-response retry clear both acknowledgments without creating RSVP, signup or application"
  );

  await acknowledge(manager);
  await acknowledge(responder);
  assert.equal((await agreement()).state, "CONFIRMED");
  await open(responder);
  const chosenContact = "Fictional exact-pair contact " + randomUUID();
  await page
    .getByLabel("My optional contact for this exact pair", { exact: true })
    .fill(chosenContact);
  await page
    .getByRole("checkbox", { name: /Share only the contact value/ })
    .check();
  await button("Share chosen contact").click();
  await wait(
    async () => (await agreement()).responderContact === chosenContact
  );
  for (const width of [320, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await open(manager);
    await schedule().waitFor();
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1
      )
    );
    await page.screenshot({
      path: join(output, `linked-event-${width}.png`),
      fullPage: true
    });
  }
  ok(
    "Both adults acknowledge independently; optional contact remains separate; linked view fits narrow and desktop layouts"
  );

  // Inject explicit transport denials into the real foreground consumer. Each
  // iteration starts with the full private agreement/contact visibly present.
  for (const status of [401, 403, 404]) {
    progress(`Foreground ${status}: opening current agreement`);
    await open(manager);
    await schedule().waitFor();
    assert.ok((await privateOffer().innerText()).includes(chosenContact));
    assert.ok(await page.evaluate(() => document.hasFocus()));
    let denied = false;
    const rejectSchedule = async (route) => {
      denied = true;
      await route.fulfill({
        status,
        contentType: "application/json",
        headers: { "cache-control": "no-store" },
        body: JSON.stringify({
          message: "Current schedule access is unavailable."
        })
      });
    };
    await page.route(schedulePattern, rejectSchedule);
    progress(`Foreground ${status}: requesting schedules`);
    await button("Find current schedules").click();
    await button("Recheck current access").waitFor();
    await settled();
    assert.ok(denied);
    assert.equal(await privateOffer().count(), 0);
    assert.equal(await schedule().count(), 0);
    assert.ok(
      !(await page.locator("body").innerText()).includes(chosenContact)
    );
    assert.ok(await page.evaluate(() => document.hasFocus()));
    await bounded(
      page.unroute(schedulePattern, rejectSchedule),
      `remove ${status} response route`
    );
    progress(`Foreground ${status}: full private page concealed`);
  }
  progress("Foreground sign-out: opening current agreement");
  await open(manager);
  await schedule().waitFor();
  await context.clearCookies();
  const signedOutIdentity = page.waitForResponse(
    (response) =>
      response.url().includes("/api/platform/profile?view=identity") &&
      response.status() === 401
  );
  progress("Foreground sign-out: requesting schedules after cookie removal");
  await button("Find current schedules").click();
  // currentSocialOwner deliberately cancels the unread 401 response stream.
  // The observed denial and settled UI are authoritative; finished() can wait
  // indefinitely for a stream that the consumer intentionally canceled.
  await signedOutIdentity;
  await button("Recheck current access").waitFor();
  await settled();
  assert.equal(await privateOffer().count(), 0);
  assert.ok(!(await page.locator("body").innerText()).includes(chosenContact));
  progress("Foreground sign-out: full private page concealed");
  ok(
    "Foreground 401/403/404 schedule denials and actual sign-out conceal the entire private agreement without a blur or focus refresh"
  );

  const beforeChange = await agreement();
  const currentEvent = await db.calendarEvent.findUniqueOrThrow({
    where: { id: f.event.id }
  });
  const currentOccurrence = await db.calendarOccurrence.findUniqueOrThrow({
    where: { id: f.occurrence.id }
  });
  await calendarCommand(db, manager.token, {
    operation: "edit-event",
    eventId: f.event.id,
    expectedVersion: currentEvent.version,
    occurrenceId: currentOccurrence.id,
    occurrenceVersion: currentOccurrence.version,
    scope: "OCCURRENCE",
    title: currentOccurrence.title + " revised",
    description: currentOccurrence.description,
    location: currentOccurrence.location,
    onlineUrl: currentOccurrence.onlineUrl,
    organizer: currentOccurrence.organizer,
    allDay: false,
    startLocal: currentOccurrence.startLocal,
    endLocal: currentOccurrence.endLocal,
    timeZone: "UTC"
  });
  saved = await agreement();
  assert.equal(saved.state, "NEEDS_REVIEW");
  assert.equal(saved.requesterAcknowledged, null);
  assert.equal(saved.responderAcknowledged, null);
  assert.equal(saved.responderContact, "");
  assert.deepEqual(
    saved.terms,
    beforeChange.terms,
    "Source edits retain the reviewed time and target snapshot"
  );
  await open(manager);
  await page
    .getByText("The linked schedule changed.", { exact: false })
    .waitFor();
  assert.equal(
    await button("Acknowledge current agreement").isDisabled(),
    true
  );
  assert.ok(!(await page.content()).includes(chosenContact));
  await proposed().check();
  const beforeRelink = saved.version;
  await button("Use current linked schedule").click();
  await wait(async () => (await agreement()).version > beforeRelink);
  assert.equal((await agreement()).requesterAcknowledged, null);
  assert.equal((await agreement()).responderAcknowledged, null);
  ok(
    "Canonical event edit atomically removes consent/contact; real interface requires explicit current-link review and renewed bilateral agreement"
  );

  await open(manager);
  await choose("VOLUNTEER_SLOT", f.slot.id);
  const beforeSlot = (await agreement()).version;
  await button("Link selected schedule").click();
  await wait(async () => (await agreement()).version > beforeSlot);
  saved = await agreement();
  assert.equal(saved.terms.schedule.kind, "VOLUNTEER_SLOT");
  assert.equal(saved.terms.schedule.id, f.slot.id);
  assert.equal(
    saved.terms.endLocal,
    (
      await db.postVolunteerSlot.findUniqueOrThrow({ where: { id: f.slot.id } })
    ).shiftEndAt
      .toISOString()
      .slice(0, 16)
  );
  assert.deepEqual(
    await Promise.all([
      db.calendarResponse.count(),
      db.postVolunteerSignup.count(),
      db.volunteerApplication.count()
    ]),
    counts
  );
  ok(
    "Independent volunteer shift links its authoritative interval while reserving no place or bypassing application approval"
  );

  await open(manager);
  await schedule().waitFor();
  let release, reached;
  const held = new Promise((resolve) => {
    release = resolve;
  });
  const started = new Promise((resolve) => {
    reached = resolve;
  });
  const hold = async (route) => {
    const response = await route.fetch({ timeout: 15000 });
    reached();
    try {
      await bounded(held, "release held schedule response");
    } catch (error) {
      errors.push(error.message);
      await route.abort();
      return;
    }
    await route.fulfill({ response });
  };
  await page.route(schedulePattern, hold);
  progress("Held response: requesting current schedule choices");
  await button("Find current schedules").click();
  await bounded(started, "schedule request reaching held response");
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  release();
  await page.waitForTimeout(200);
  assert.equal(await schedule().count(), 0);
  assert.equal(
    await page.getByLabel("Current schedule", { exact: true }).count(),
    0
  );
  await page.unroute(schedulePattern, hold);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await schedule().waitFor();
  await signin(f.outsider);
  const changedIdentity = page.waitForResponse(
    (response) =>
      response.url().includes("/api/platform/profile?view=identity") &&
      response.status() === 200
  );
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  const identityRead = await changedIdentity;
  assert.equal(
    (await bounded(identityRead.json(), "replacement identity body")).id,
    f.outsider.id
  );
  await settled();
  assert.equal(await schedule().count(), 0);
  assert.equal(await privateOffer().count(), 0);
  ok(
    "Held schedule choices cannot reopen a concealed source and account replacement removes the retained private link"
  );

  const eventBeforeHide = await db.calendarEvent.findUniqueOrThrow({
    where: { id: f.event.id }
  });
  await calendarCommand(db, manager.token, {
    operation: "set-visibility",
    eventId: f.event.id,
    expectedVersion: eventBeforeHide.version,
    visibility: "PRIVATE",
    confirmed: true
  });
  await open(responder);
  await wait(async () => (await schedule().count()) === 0);
  const currentRead = await context.request.get(
    origin + "/api/platform/exchange?view=help-offer&id=" + offerId,
    { headers: { origin, "X-Expected-Account": responder.id } }
  );
  assert.equal(currentRead.status(), 200);
  const body = await currentRead.text();
  for (const secret of [f.occurrence.id, f.slot.id, f.post.id, chosenContact])
    assert.ok(!body.includes(secret));
  assert.match(currentRead.headers()["cache-control"], /no-store/);
  ok(
    "Loss of canonical target access returns an unavailable private receipt without schedule identifiers or prior contact"
  );
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
  writeFileSync(
    join(output, "results.json"),
    JSON.stringify({ identity, results, errors, external }, null, 2)
  );
  console.log("EVIDENCE " + output);
} catch (error) {
  writeFileSync(
    join(output, "failure.json"),
    JSON.stringify(
      {
        identity,
        results,
        errors,
        external,
        message: error.message,
        stack: error.stack
      },
      null,
      2
    )
  );
  writeFileSync(join(output, "failure.html"), await page.content());
  await page
    .screenshot({ path: join(output, "failure.png"), fullPage: true })
    .catch(() => {});
  throw error;
} finally {
  await context.close();
  await browser.close();
  await db.$disconnect();
}
