import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";

const fixtureDir = process.argv[2];
assert.match(fixtureDir ?? "", /^\.account-test\/[a-z0-9-]+$/);
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
  ACCOUNT_TEST_SINK_DIR: resolve(fixtureDir, "sink"),
  RETENTION_TEST_DIR: resolve(fixtureDir, "retention"),
  AUTH_RATE_LIMIT_SECRET: "medium-fixture-only-secret-".repeat(3),
  PLATFORM_MEASUREMENT_ENABLED: "true",
  PLATFORM_METRICS_ZONE: "America/Chicago",
  NODE_ENV: "test",
  VERCEL: "",
  RESEND_API_KEY: "",
  MAILERLITE_API_KEY: "",
  FOUNDER_WELCOME_ENABLED: "false",
  FOUNDER_ANNOUNCEMENTS_ENABLED: "false"
});
const { PrismaClient } = await import("@prisma/client");
const { assertPortalTestDatabase, createPortalActor, seedOperatorGrants } =
  await import("../tests/seed-portal.ts");
const { metricDay, metricDayStart, metricAddDays } =
  await import("../lib/platform/metric-time.ts");
const { METRIC_POLICY } = await import("../lib/platform/metric-policy.ts");
const { ADULT_POLICY } = await import("../lib/platform/portal.ts");
const { readPlatformMetrics } =
  await import("../lib/platform/metric-report.ts");
const { readAdminOverview } = await import("../lib/platform/admin-overview.ts");
const { readMeasurementChoice, saveMeasurementChoice } =
  await import("../lib/platform/platform-measurement.ts");
const db = new PrismaClient({ log: [{ emit: "event", level: "query" }] });
await assertPortalTestDatabase(db);
let queryCount = 0;
db.$on("query", () => queryCount++); // Never record SQL parameters or private rows.
const output = fixtureDir + "/metrics-browser";
mkdirSync(output, { recursive: true, mode: 0o700 });
const results = [],
  errors = [],
  requests = [];
const ok = (message) => {
  results.push(message);
  console.log("PASS " + message);
};
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
  viewport: { width: 320, height: 844 },
  acceptDownloads: true
});
const page = await context.newPage();
page.on("pageerror", (error) => errors.push(error.message));
page.on("request", (r) => {
  if (r.url() === config.origin + "/api/platform/measurement")
    requests.push({
      method: r.method(),
      body: r.postData() ? JSON.parse(r.postData()) : null
    });
});
const signIn = async (actor) => {
  await context.clearCookies();
  await context.addCookies([
    {
      name: "church_platform_session",
      value: actor.token,
      url: config.origin,
      httpOnly: true,
      secure: true,
      sameSite: "Lax"
    }
  ]);
};
const go = async (path) => {
  await page.bringToFront();
  const response = await page.goto(config.origin + path);
  assert.equal(response.status(), 200);
};
const fits = async () =>
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1
    ),
    "No page overflow at 320px"
  );
const eventually = async (check) => {
  for (let i = 0; i < 60; i++) {
    if (await check()) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  assert.fail("Expected local state did not arrive");
};
const settings = "/platform/settings/privacy/measurement";
const checkbox = () =>
  page.getByRole("checkbox", {
    name: "Allow optional platform measurement",
    exact: true
  });
const save = () =>
  page
    .getByRole("button", { name: "Save measurement choices", exact: true })
    .click();
const saved = () =>
  page
    .getByText("Your measurement choices were saved.", { exact: true })
    .waitFor();
let priorIncludedIds = [];
try {
  // Synthetic dates are used only in this guarded local fixture. They never
  // stand in for production maturity or real people's choices.
  // A reused isolated database can contain opted-in actors from other suites.
  // Temporarily exclude those fictional actors so empty/cohort assertions are
  // owned by this run, then restore their existing measurement flags.
  priorIncludedIds = (
    await db.platformUser.findMany({
      where: { username: { startsWith: "p_" }, metricExcluded: false },
      select: { id: true }
    })
  ).map((actor) => actor.id);
  await db.platformUser.updateMany({
    where: { id: { in: priorIncludedIds } },
    data: { metricExcluded: true }
  });
  const previous = await db.platformMetricConfiguration.findFirstOrThrow({
    orderBy: { version: "desc" }
  });
  const today = metricDay(new Date(), previous.zone),
    day = metricAddDays(today, -40);
  const at = (n) =>
    new Date(
      metricDayStart(metricAddDays(day, n), previous.zone).getTime() +
        12 * 3600000
    );
  const counts = await db.platformUser.count({
    where: {
      metricExcluded: false,
      erasedAt: null,
      suspendedAt: null,
      deactivatedAt: null
    }
  });
  const cfg = await db.platformMetricConfiguration.create({
    data: {
      version: previous.version + 1,
      zone: previous.zone,
      startedAt: at(-5),
      openingStates: { ENABLED: counts, DEACTIVATED: 0, SUSPENDED: 0 }
    }
  });
  const viewer = await createPortalActor(db, "mqaviewer"),
    member = await createPortalActor(db, "mqamember"),
    other = await createPortalActor(db, "mqaother");
  await seedOperatorGrants(db, viewer, [
    "VIEW_PLATFORM_METRICS",
    "EXPORT_PLATFORM_METRICS"
  ]);
  const target = await createPortalActor(db, "mqatarget");
  for (let i = 0; i < 10; i++) {
    const key = "p_mqa_" + randomUUID().replaceAll("-", "");
    const actor = await db.platformUser.create({
      data: {
        username: key,
        name: "Fictional dated metric fixture",
        email: key + "@example.test",
        createdAt: at(0),
        emailVerifiedAt: at(0),
        adultAcknowledgedAt: at(0),
        adultPolicyVersion: ADULT_POLICY,
        metricCreationMethod: i < 6 ? "EMAIL" : "GOOGLE"
      }
    });
    await db.platformMeasurementChoice.create({
      data: {
        userId: actor.id,
        enabledAt: at(0),
        policy: METRIC_POLICY,
        cohortEligible: true
      }
    });
    for (const n of [
      i < 8 ? 0 : null,
      i < 4 ? 7 : null,
      i < 2 ? 30 : null
    ].filter((n) => n !== null))
      await db.platformMetricActivityDay.create({
        data: {
          userId: actor.id,
          version: cfg.version,
          day: metricDayStart(metricAddDays(day, n), "UTC"),
          firstAt: at(n),
          lastAt: at(n)
        }
      });
    if (i < 6)
      await db.platformFollow.create({
        data: { followerId: actor.id, followingId: target.id, createdAt: at(2) }
      });
  }
  const filters = { from: day, through: metricAddDays(day, 31) };
  const growthPath = "/platform/admin/growth?" + new URLSearchParams(filters);
  await signIn(viewer);
  await go(growthPath);
  await page
    .getByRole("heading", { name: "Platform growth", exact: true })
    .waitFor();
  const funnel = page.getByRole("region", {
    name: "Mature seven-day signup funnel",
    exact: true
  });
  assert.ok((await funnel.innerText()).includes("80.0% (8 / 10)"));
  assert.ok((await funnel.innerText()).includes("60.0% (6 / 10)"));
  const returns = await page
    .getByRole("region", { name: "Exact-day return rates", exact: true })
    .innerText();
  assert.ok(returns.includes("40.0% (4 / 10)"));
  assert.ok(returns.includes("20.0% (2 / 10)"));
  assert.match(
    await page.locator('meta[name="robots"]').getAttribute("content"),
    /noindex/
  );
  await fits();
  await funnel.focus();
  await page.keyboard.press("ArrowRight");
  assert.equal(
    await funnel.evaluate((el) => el === document.activeElement),
    true
  );
  await page.screenshot({ path: output + "/growth-320.png", fullPage: true });
  ok(
    "320px mature 10/8/6/4/2 report matches source counts, has keyboard tables and private metadata"
  );
  const downloadEvent = page.waitForEvent("download");
  await page
    .getByRole("button", {
      name: "Export current aggregates as CSV",
      exact: true
    })
    .click();
  const download = await downloadEvent;
  const csvPath = output + "/aggregate.csv";
  await download.saveAs(csvPath);
  const csv = readFileSync(csvPath, "utf8");
  assert.ok(csv.includes("funnel.foreground.percent,80"));
  assert.ok(csv.includes("returns.d30.percent,20"));
  assert.ok(csv.includes("Unavailable or suppressed"));
  assert.ok(!csv.includes(member.id));
  assert.ok(!csv.includes(viewer.email));
  const receipt = await db.adminOperation.findFirstOrThrow({
    where: { actorId: viewer.id, sourceType: "METRICS_EXPORT" },
    orderBy: { createdAt: "desc" }
  });
  assert.equal(
    receipt.result.sha256,
    createHash("sha256").update(csv).digest("hex")
  );
  ok(
    "Actual browser CSV download retains selected dates, suppression and its matching audit hash"
  );
  await page.getByRole("link", { name: "Today", exact: true }).click();
  await page.waitForURL("**/platform/admin/growth?preset=1");
  await eventually(
    async () =>
      (await page.getByLabel("From", { exact: true }).inputValue()) === today
  );
  await page.getByText("No measured signup cohort", { exact: true }).waitFor();
  assert.ok(
    (await page.locator("main").innerText()).includes(
      "Current period is partial"
    )
  );
  await page
    .getByLabel("From", { exact: true })
    .fill(metricAddDays(today, -85));
  await page
    .getByLabel("Through", { exact: true })
    .fill(metricAddDays(today, -80));
  await page.getByRole("button", { name: "Apply dates", exact: true }).click();
  await page.waitForURL(
    (url) => url.searchParams.get("from") === metricAddDays(today, -85)
  );
  await page.getByText("No measured signup cohort", { exact: true }).waitFor();
  assert.ok(
    (await page.locator("main").innerText()).includes(
      "Incomplete measurement coverage"
    )
  );
  assert.ok(
    (await funnel.innerText()).includes(
      "Unavailable: no mature eligible denominator"
    )
  );
  await fits();
  await funnel.screenshot({ path: output + "/empty-cohort-320.png" });
  const immature = await createPortalActor(db, "mqaimmature");
  await saveMeasurementChoice(db, immature.token, {
    operation: "choice",
    mutationId: randomUUID(),
    expectedVersion: 0,
    enabled: true,
    shareDevice: false,
    referral: "UNKNOWN"
  });
  await page.getByRole("link", { name: "Today", exact: true }).click();
  await page.waitForURL("**/platform/admin/growth?preset=1");
  await eventually(async () =>
    (await funnel.innerText()).includes("Not mature yet\t1")
  );
  await page
    .getByRole("region", { name: "Signup-calendar-day cohorts", exact: true })
    .screenshot({ path: output + "/immature-cohort-320.png" });
  await page.route("**/api/platform/admin?**", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        message: "Fictional temporarily unavailable report"
      })
    })
  );
  await page.evaluate(() =>
    window.dispatchEvent(new Event("admin-access-changed"))
  );
  await page
    .getByText("Fictional temporarily unavailable report", { exact: true })
    .waitFor();
  assert.equal(await funnel.isVisible(), false);
  await page.unroute("**/api/platform/admin?**");
  await page
    .getByRole("button", { name: "Recheck current access", exact: true })
    .click();
  await funnel.waitFor();
  await go(growthPath);
  await funnel.waitFor();
  ok(
    "Preset and custom dates persist; empty, partial, suppressed, immature and failed-read states remain distinct and recoverable"
  );
  await page.evaluate(() => window.dispatchEvent(new Event("offline")));
  await eventually(async () => !(await funnel.isVisible()));
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await funnel.waitFor();
  await db.platformOperatorGrant.updateMany({
    where: { userId: viewer.id, capability: "EXPORT_PLATFORM_METRICS" },
    data: { revokedAt: new Date() }
  });
  await page.evaluate(() =>
    window.dispatchEvent(new Event("admin-access-changed"))
  );
  await funnel.waitFor();
  await eventually(
    async () =>
      !(await page
        .getByRole("button", {
          name: "Export current aggregates as CSV",
          exact: true
        })
        .isVisible())
  );
  ok(
    "Lost connection conceals reports; reconnect rechecks, and export revocation removes download access"
  );
  await signIn(member);
  await go(settings);
  await checkbox().waitFor();
  assert.equal(await checkbox().isChecked(), false);
  assert.equal(
    await db.platformMeasurementChoice.count({ where: { userId: member.id } }),
    0
  );
  await checkbox().check();
  await page
    .getByRole("checkbox", {
      name: "Share a coarse device and browser family",
      exact: true
    })
    .check();
  await page
    .getByRole("combobox", {
      name: "How did you hear about God’s Churches?",
      exact: true
    })
    .selectOption("SEARCH");
  await page.evaluate(() => {
    window.dispatchEvent(new Event("blur"));
    window.dispatchEvent(new Event("focus"));
  });
  await checkbox().waitFor();
  assert.equal(await checkbox().isChecked(), true);
  await fits();
  await save();
  await saved();
  const choice = await db.platformMeasurementChoice.findUniqueOrThrow({
    where: { userId: member.id }
  });
  assert.ok(choice.enabledAt);
  assert.equal(choice.referral, "SEARCH");
  assert.equal(choice.shareDevice, true);
  await page.screenshot({ path: output + "/choices-320.png", fullPage: true });
  ok(
    "Choice starts off without a row; explicit optional dimensions and unsaved edits survive focus recheck and save"
  );
  requests.length = 0;
  await go("/platform/menu");
  await eventually(async () => requests.some((r) => r.method === "GET"));
  await page.waitForTimeout(250);
  assert.equal(
    requests.filter(
      (r) => r.method === "POST" && r.body?.operation === "foreground"
    ).length,
    0
  );
  const navLink = page
    .locator("header a,nav a")
    .filter({ hasText: "Home" })
    .first();
  await navLink.focus();
  await page.keyboard.press("ArrowRight");
  await eventually(
    async () =>
      (await db.platformMetricActivityDay.count({
        where: { userId: member.id }
      })) === 1
  );
  const signal = requests.find((r) => r.body?.operation === "foreground");
  assert.ok(signal);
  assert.deepEqual(
    Object.keys(signal.body).sort(),
    [
      "operation",
      "choiceVersion",
      "afterForegroundAt",
      "device",
      "browser"
    ].sort()
  );
  await go(settings);
  await checkbox().waitFor();
  await page
    .getByRole("combobox", {
      name: "How did you hear about God’s Churches?",
      exact: true
    })
    .selectOption("CHURCH");
  const beforeOther = await readMeasurementChoice(db, member.token);
  await saveMeasurementChoice(db, member.token, {
    operation: "choice",
    mutationId: randomUUID(),
    expectedVersion: beforeOther.version,
    enabled: true,
    shareDevice: true,
    referral: "SOCIAL"
  });
  await save();
  await page.getByText(/Your unsaved choices are retained/).waitFor();
  assert.equal(
    await page
      .getByRole("combobox", {
        name: "How did you hear about God’s Churches?",
        exact: true
      })
      .inputValue(),
    "CHURCH"
  );
  assert.equal(
    (await readMeasurementChoice(db, member.token)).referral,
    "SOCIAL"
  );
  await page
    .getByRole("button", { name: "Reload saved choices", exact: true })
    .click();
  await eventually(
    async () =>
      (await page
        .getByRole("combobox", {
          name: "How did you hear about God’s Churches?",
          exact: true
        })
        .inputValue()) === "SOCIAL"
  );
  ok(
    "Idle navigation writes nothing; trusted foreground input creates one minimal fact; another-device change rejects stale save"
  );
  await checkbox().uncheck();
  let abortedBody = null;
  await page.route("**/api/platform/measurement", async (route) => {
    if (route.request().method() === "POST") {
      abortedBody = route.request().postData();
      await route.abort("failed");
    } else await route.continue();
  });
  await save();
  await page
    .getByRole("button", { name: "Retry unconfirmed change", exact: true })
    .waitFor();
  await eventually(async () => abortedBody !== null);
  await page.getByText(/You can retry the same change/).waitFor();
  await page.unroute("**/api/platform/measurement");
  const retried = page.waitForRequest(
    (r) =>
      r.method() === "POST" && r.url().endsWith("/api/platform/measurement")
  );
  await page
    .getByRole("button", { name: "Retry unconfirmed change", exact: true })
    .click();
  assert.equal((await retried).postData(), abortedBody);
  await saved();
  assert.equal(
    await db.platformMetricActivityDay.count({ where: { userId: member.id } }),
    0
  );
  const withdrawn = await readMeasurementChoice(db, member.token);
  assert.equal(withdrawn.enabled, false);
  assert.equal(withdrawn.referral, "UNKNOWN");
  assert.equal(withdrawn.shareDevice, false);
  ok(
    "An unconfirmed withdrawal retries the identical command and removes use facts and optional dimensions"
  );
  await signIn(other);
  await page.evaluate(() => {
    window.dispatchEvent(new Event("blur"));
    window.dispatchEvent(new Event("focus"));
  });
  await eventually(async () => !(await checkbox().isVisible()));
  assert.equal(
    await db.platformMeasurementChoice.count({ where: { userId: other.id } }),
    0
  );
  await go("/platform/admin/growth");
  await page
    .getByRole("heading", { name: "Admin view unavailable", exact: true })
    .waitFor();
  await fits();
  await signIn(viewer);
  await go(growthPath);
  await funnel.waitFor();
  await db.platformOperatorGrant.updateMany({
    where: { userId: viewer.id, capability: "VIEW_PLATFORM_METRICS" },
    data: { revokedAt: new Date() }
  });
  await page.evaluate(() =>
    window.dispatchEvent(new Event("admin-access-changed"))
  );
  await eventually(async () => !(await funnel.isVisible()));
  ok(
    "Account switching conceals old choices, ordinary members cannot open Growth, and revoked viewers lose retained reports"
  );
  const costViewer = await createPortalActor(db, "mqacost");
  await seedOperatorGrants(db, costViewer, ["VIEW_PLATFORM_METRICS"]);
  const cost = {};
  for (const [label, read] of Object.entries({
    growth: () => readPlatformMetrics(db, costViewer.token, filters),
    overview: () => readAdminOverview(db, costViewer.token),
    choice: () => readMeasurementChoice(db, member.token)
  })) {
    await read();
    const samples = [];
    for (let i = 0; i < 7; i++) {
      queryCount = 0;
      const start = performance.now();
      const value = await read();
      samples.push({
        ms: performance.now() - start,
        commands: queryCount,
        bytes: Buffer.byteLength(JSON.stringify(value))
      });
    }
    cost[label] = samples;
  }
  assert.deepEqual(errors, []);
  writeFileSync(
    output + "/results.json",
    JSON.stringify(
      {
        at: new Date().toISOString(),
        results,
        errors,
        cost,
        fixture:
          "Fictional localhost dates and accounts only; not a production capacity or physical-device result",
        productionWrites: 0,
        externalSends: 0
      },
      null,
      2
    ),
    { mode: 0o600 }
  );
  ok(
    "No browser runtime errors; seven warm service samples retain only command counts, durations and response sizes"
  );
} catch (error) {
  await page
    .screenshot({ path: output + "/failure.png", fullPage: true })
    .catch(() => {});
  writeFileSync(
    output + "/failure.json",
    JSON.stringify(
      {
        results,
        errors,
        error: String(error),
        url: page.url(),
        text: await page
          .locator("body")
          .innerText()
          .catch(() => "")
      },
      null,
      2
    ),
    { mode: 0o600 }
  );
  throw error;
} finally {
  await browser.close();
  await db.platformUser.updateMany({
    where: { id: { in: priorIncludedIds } },
    data: { metricExcluded: false }
  });
  await db.$disconnect();
}
