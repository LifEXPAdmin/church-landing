import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { sessionCookieFixtureName } from "./session-cookie-fixture.mjs";

// Use the parent's already running isolated production HTTPS application.
assert.ok(process.argv[2], "Pass the active isolated HTTPS fixture directory.");
const fixture = resolve(process.argv[2]);
assert.ok(fixture.startsWith(resolve(".account-test") + "/"));
const config = JSON.parse(
  readFileSync(join(fixture, "browser-env.json"), "utf8")
);
assert.match(config.origin, /^https:\/\/127\.0\.0\.1:\d+$/);
assert.equal(new URL(config.database).hostname, "127.0.0.1");
assert.ok(
  process.env.NODE_EXTRA_CA_CERTS &&
    resolve(process.env.NODE_EXTRA_CA_CERTS) === resolve(config.certificate),
  "Start Node with NODE_EXTRA_CA_CERTS set to the fixture certificate."
);
Object.assign(
  process.env,
  JSON.parse(readFileSync(join(fixture, "test-env.json"), "utf8")),
  {
    DATABASE_URL: config.database,
    DIRECT_URL: config.database,
    ACCOUNT_ORIGIN: config.origin,
    NEXT_PUBLIC_SITE_URL: config.origin,
    ACCOUNT_TEST_ISOLATED: "1",
    ACCOUNT_DELIVERY_MODE: "test-sink",
    NODE_ENV: "test",
    VERCEL: "",
    PRIVILEGED_MFA_MODE: "off",
    PLATFORM_MEASUREMENT_ENABLED: "true",
    PLATFORM_METRICS_ZONE: "America/Chicago",
    RESEND_API_KEY: "",
    MAILERLITE_API_KEY: "",
    SOCIAL_EMAIL_ENABLED: "false",
    FOUNDER_WELCOME_ENABLED: "false",
    FOUNDER_ANNOUNCEMENTS_ENABLED: "false",
    PUSH_ENABLED: "false"
  }
);
const { PrismaClient } = await import("@prisma/client");
const { assertPortalTestDatabase, createPortalActor, seedOperatorGrants } =
  await import("../tests/seed-portal.ts");
const { metricDay, metricDayStart, metricAddDays } =
  await import("../lib/platform/metric-time.ts");
const { METRIC_POLICY } = await import("../lib/platform/metric-policy.ts");
const { ADULT_POLICY } = await import("../lib/platform/portal.ts");
const { metricCsv } = await import("../lib/platform/metric-export.ts");
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
    process.env.CHROMIUM_PATH ??
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  args: [
    "--ignore-certificate-errors-spki-list=" +
      createHash("sha256").update(der).digest("base64")
  ]
});
const context = await browser.newContext({
  viewport: { width: 320, height: 844 },
  timezoneId: "America/Chicago",
  reducedMotion: "reduce",
  acceptDownloads: true
});
const output = join(fixture, "metric-module-summaries-browser-" + Date.now());
mkdirSync(output, { recursive: true, mode: 0o700 });
const results = [],
  errors = [],
  externalRequests = [],
  receipts = [],
  observations = [];
let phase = "fixture",
  viewer,
  member,
  filters;
const ok = (message) => {
  results.push(message);
  console.log("PASS " + message);
};
await context.route(/^https?:\/\//, async (route) => {
  const url = new URL(route.request().url());
  if (url.origin === config.origin) return route.continue();
  externalRequests.push(url.origin + url.pathname);
  return route.abort();
});
const page = await context.newPage();
page.setDefaultTimeout(30000);
page.on("pageerror", (error) => errors.push(error.message));
const eventually = async (check, message) => {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (await check()) return;
    await new Promise((done) => setTimeout(done, 100));
  }
  assert.fail(message);
};
const signIn = async (actor) => {
  await context.clearCookies();
  if (actor)
    await context.addCookies([
      {
        name: sessionCookieFixtureName(config.origin),
        value: actor.token,
        url: config.origin,
        httpOnly: true,
        secure: true,
        sameSite: "Lax"
      }
    ]);
};
const modules = () =>
  page.getByRole("region", { name: "Platform module summaries", exact: true });
const actions = (report) =>
  report.modules.groups.flatMap((group) => group.actions);
const action = (report, key) => actions(report).find((row) => row.key === key);
const read = async (dates = filters, status = 200, owner = viewer) => {
  const response = await context.request.get(
    config.origin +
      "/api/platform/admin?" +
      new URLSearchParams({ view: "metrics", ...dates }),
    { headers: owner ? { "X-Expected-Account": owner.id } : {} }
  );
  assert.equal(response.status(), status);
  assert.match(response.headers()["cache-control"], /no-store/);
  const body = await response.json();
  if (status !== 200) {
    assert.equal(body.report, undefined);
    return body;
  }
  assert.ok(body.report?.modules);
  return body.report;
};
const open = async (dates = filters) => {
  const response = await page.goto(
    config.origin + "/platform/admin/growth?" + new URLSearchParams(dates)
  );
  assert.equal(response.status(), 200);
  await modules().waitFor();
  if (dates.from)
    await eventually(
      async () =>
        (
          await page
            .getByRole("region", { name: "Selected period", exact: true })
            .innerText()
        ).includes(dates.from + " through " + dates.through),
      "Current selected dates settled"
    );
};
const countText = (value, state) =>
  state === "unavailable"
    ? "Unavailable"
    : state === "suppressed"
      ? "Suppressed"
      : value === null
        ? "Unavailable"
        : state === "partial"
          ? `${value} (partial)`
          : String(value);
const percentText = (value) =>
  value.percent === null
    ? value.state === "suppressed"
      ? "Suppressed"
      : "Unavailable"
    : `${value.percent.toFixed(1)}%${value.state === "partial" ? " (partial)" : ""}`;
const assertScreen = async (report) => {
  const section = modules();
  await section.waitFor();
  assert.match(await section.innerText(), /Platform scope/);
  assert.ok(
    (await section.innerText()).includes(
      `${report.modules.denominator.label}: ${report.modules.denominator.measuredAccounts}.`
    )
  );
  assert.equal(report.modules.scope, "platform");
  assert.equal(actions(report).length, 6);
  for (const group of report.modules.groups) {
    const table = section
      .getByRole("region", {
        name: `${group.label}: successful source actions`,
        exact: true
      })
      .getByRole("table");
    assert.equal(await table.getByRole("columnheader").count(), 6);
    for (const row of group.actions) {
      const ui = table
        .locator("tbody tr")
        .filter({ has: page.getByText(row.label, { exact: true }) });
      assert.equal(await ui.count(), 1, row.key + " has one action row");
      assert.deepEqual(
        (await ui.getByRole("cell").allTextContents()).map((text) =>
          text.trim()
        ),
        [
          countText(row.current.actors, row.current.state),
          countText(row.current.actions, row.current.state),
          countText(row.previous.actors, row.previous.state),
          countText(row.previous.actions, row.previous.state),
          percentText(row.current)
        ],
        row.key + " agrees with permitted projection"
      );
      assert.ok((await ui.innerText()).includes(row.source));
      for (const period of ["current", "previous"]) {
        if (row[period].reason)
          assert.ok((await ui.innerText()).includes(row[period].reason));
        const old = report[period].adoption.find(
          (item) => item.key === row.key
        );
        assert.equal(row[period].actors, old.actors);
        assert.equal(row[period].actions, old.actions);
      }
    }
  }
  const unavailable = section.getByRole("region", {
    name: "Outcomes and modules not measured",
    exact: true
  });
  assert.equal(report.modules.unavailable.length, 7);
  for (const item of report.modules.unavailable) {
    assert.equal(item.count, null);
    const row = unavailable
      .locator("tbody tr")
      .filter({
        has: page.getByRole("rowheader").filter({ hasText: item.label })
      });
    assert.equal(
      await row.getByRole("cell").first().innerText(),
      "Unavailable"
    );
    assert.ok((await row.innerText()).includes(item.reason));
    if (item.definitionKey)
      assert.ok(
        (await row.innerText()).includes(report.definitions[item.definitionKey])
      );
  }
  for (const scope of report.modules.unavailableScopes) {
    const row = section.getByRole("region", {
      name: "Unavailable scopes",
      exact: true
    });
    assert.ok((await row.innerText()).includes(scope.label));
    assert.ok((await row.innerText()).includes(scope.reason));
  }
  for (const key of ["current", "previous"]) {
    const period = report.modules.periods[key];
    const card = section.getByRole("region", {
      name: key === "current" ? "Selected period" : "Preceding period",
      exact: true
    });
    assert.ok(
      (await card.innerText()).includes(
        {
          complete: "Complete collection coverage",
          partial: "Partial collection coverage",
          unavailable: "Unavailable"
        }[period.coverage]
      )
    );
    if (period.reason)
      assert.ok((await card.innerText()).includes(period.reason));
  }
  observations.push({ phase, window: report.window, modules: report.modules });
};
const moduleCsv = (csv) =>
  csv.split("\r\n").filter((line) => line.startsWith("modules."));
const exportCurrent = async (report, label) => {
  const pending = page.waitForEvent("download");
  await page
    .getByRole("button", {
      name: "Export current aggregates as CSV",
      exact: true
    })
    .click();
  const download = await pending;
  const path = join(output, label + ".csv");
  await download.saveAs(path);
  assert.equal(await download.failure(), null);
  const csv = readFileSync(path, "utf8");
  assert.deepEqual(
    moduleCsv(csv),
    moduleCsv(metricCsv(report)),
    "Actual downloaded module projection agrees with API and screen"
  );
  assert.ok(csv.includes(`window.from,${report.window.from}`));
  assert.ok(csv.includes(`window.through,${report.window.through}`));
  assert.ok(
    !csv.includes("p_modsumm_"),
    "Aggregate CSV contains no fictional actor identities"
  );
  const sha256 = createHash("sha256").update(csv).digest("hex");
  const receipt = await db.adminOperation.findFirstOrThrow({
    where: { actorId: viewer.id, sourceType: "METRICS_EXPORT" },
    orderBy: { createdAt: "desc" }
  });
  assert.equal(receipt.result.sha256, sha256);
  assert.equal(receipt.result.from, report.window.from);
  assert.equal(receipt.result.through, report.window.through);
  receipts.push({ path, sha256, receipt: receipt.requestKey });
};
const fits = async (width) => {
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1
    ),
    `No document overflow at ${width}px`
  );
  const region = modules().getByRole("region", {
    name: "Connections: successful source actions",
    exact: true
  });
  await region.focus();
  await page.keyboard.press("ArrowRight");
  assert.ok(
    await region.evaluate((element) => element === document.activeElement),
    "Tables remain keyboard reachable"
  );
};
const postExport = (extra = {}) =>
  context.request.post(config.origin + "/api/platform/admin", {
    headers: { Origin: config.origin, "X-Expected-Account": viewer.id },
    data: {
      operation: "metrics-export",
      requestKey: randomUUID(),
      ...filters,
      ...extra
    }
  });
try {
  // Only this script's retained synthetic cohort is excluded after an interrupted
  // run. All unrelated fictional accounts and their saved choices are preserved.
  await db.platformUser.updateMany({
    where: { username: { startsWith: "p_modsumm_" } },
    data: { metricExcluded: true }
  });
  const previous = await db.platformMetricConfiguration.findFirstOrThrow({
    orderBy: { version: "desc" }
  });
  const today = metricDay(new Date(), previous.zone);
  const date = (offset) => metricAddDays(today, offset);
  const at = (offset) =>
    new Date(
      metricDayStart(date(offset), previous.zone).getTime() + 12 * 3600000
    );
  const count = await db.platformUser.count({
    where: {
      metricExcluded: false,
      erasedAt: null,
      suspendedAt: null,
      deactivatedAt: null
    }
  });
  await db.platformMetricConfiguration.create({
    data: {
      version: previous.version + 1,
      zone: previous.zone,
      startedAt: at(-60),
      openingStates: { ENABLED: count, DEACTIVATED: 0, SUSPENDED: 0 }
    }
  });
  viewer = await createPortalActor(db, "modviewer");
  member = await createPortalActor(db, "modmember");
  const currentTarget = await createPortalActor(db, "modtarget"),
    previousTarget = await createPortalActor(db, "modprior");
  await seedOperatorGrants(db, viewer, [
    "VIEW_PLATFORM_METRICS",
    "EXPORT_PLATFORM_METRICS"
  ]);
  await signIn(viewer);
  let base, baseline;
  for (const offset of [-40, -30, -20]) {
    const candidate = { from: date(offset), through: date(offset + 6) };
    const report = await read(candidate);
    if (
      actions(report).every((row) =>
        [row.current, row.previous].every(
          (value) =>
            value.state === "measured" &&
            value.actors === 0 &&
            value.actions === 0
        )
      )
    ) {
      base = offset;
      filters = candidate;
      baseline = report;
      break;
    }
  }
  assert.ok(
    baseline,
    "Fixture provides a quiet covered two-period source window without changing prior choices"
  );
  const actors = [],
    posts = [];
  for (let index = 0; index < 6; index++) {
    const username = "p_modsumm_" + randomUUID().replaceAll("-", "");
    const actor = await db.platformUser.create({
      data: {
        username,
        name: "Fictional module summary actor",
        email: username + "@example.test",
        createdAt: at(base - 10),
        emailVerifiedAt: at(base - 10),
        adultAcknowledgedAt: at(base - 10),
        adultPolicyVersion: ADULT_POLICY,
        metricCreationMethod: "EMAIL"
      }
    });
    actors.push(actor);
    await db.platformMeasurementChoice.create({
      data: {
        userId: actor.id,
        enabledAt: at(base - 10),
        policy: METRIC_POLICY,
        cohortEligible: true
      }
    });
    await db.platformFollow.create({
      data: {
        followerId: actor.id,
        followingId: currentTarget.id,
        createdAt: at(base + 2)
      }
    });
    posts.push(
      await db.platformPost.create({
        data: {
          authorId: actor.id,
          content: "Fictional module summary fixture post",
          publishedAt: at(base + 2),
          createdAt: at(base + 2)
        }
      })
    );
    if (index < 5) {
      await db.platformFollow.create({
        data: {
          followerId: actor.id,
          followingId: previousTarget.id,
          createdAt: at(base - 2)
        }
      });
      await db.platformPost.create({
        data: {
          authorId: actor.id,
          content: "Fictional preceding module fixture post",
          publishedAt: at(base - 2),
          createdAt: at(base - 2)
        }
      });
    }
  }
  phase = "source counts and module scope";
  await open();
  const report = await read();
  assert.equal(
    report.modules.denominator.measuredAccounts,
    baseline.modules.denominator.measuredAccounts + 6
  );
  for (const key of ["FOLLOW", "POST"]) {
    assert.deepEqual(
      [
        action(report, key).current.actors,
        action(report, key).current.actions,
        action(report, key).previous.actors,
        action(report, key).previous.actions
      ],
      [6, 6, 5, 5]
    );
  }
  for (const key of ["REPLY", "RSVP", "VOLUNTEER", "EVENT"])
    assert.deepEqual(
      [action(report, key).current.actors, action(report, key).current.actions],
      [0, 0]
    );
  await assertScreen(report);
  await fits(320);
  await modules().scrollIntoViewIfNeeded();
  await page.screenshot({
    path: join(output, "modules-320.png"),
    fullPage: true
  });
  await modules()
    .getByRole("region", { name: "Connections", exact: true })
    .screenshot({ path: join(output, "connections-320.png") });
  ok(
    "Platform module cards retain six separate action categories, exact current/preceding source counts, measured zero, current denominator and seven explicitly unavailable outcomes"
  );

  phase = "CSV parity and wide layout";
  await exportCurrent(report, "measured-modules");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await assertScreen(await read());
  await fits(1440);
  await modules().scrollIntoViewIfNeeded();
  await page.screenshot({
    path: join(output, "modules-1440.png"),
    fullPage: true
  });
  await modules()
    .getByRole("region", { name: "Connections", exact: true })
    .screenshot({ path: join(output, "connections-1440.png") });
  ok(
    "Downloaded CSV agrees with every module value, state, rate and reason; audit receipt hash matches; 320px and 1440px tables remain accessible without document overflow"
  );

  phase = "date coverage";
  const periods = [
    {
      name: "covered-zero",
      dates: { from: date(-5), through: date(-1) },
      coverage: "complete"
    },
    {
      name: "partial",
      dates: { from: date(-63), through: date(-57) },
      coverage: "partial"
    },
    {
      name: "unavailable",
      dates: { from: date(-75), through: date(-69) },
      coverage: "unavailable"
    }
  ];
  for (const period of periods) {
    await page.getByLabel("From", { exact: true }).fill(period.dates.from);
    await page
      .getByLabel("Through", { exact: true })
      .fill(period.dates.through);
    await page
      .getByRole("button", { name: "Apply dates", exact: true })
      .click();
    await page.waitForURL(
      (url) =>
        url.searchParams.get("from") === period.dates.from &&
        url.searchParams.get("through") === period.dates.through
    );
    await modules().waitFor();
    const selected = await read(period.dates);
    assert.equal(selected.modules.periods.current.coverage, period.coverage);
    if (period.name === "covered-zero")
      assert.ok(
        actions(selected).every(
          (row) =>
            row.current.actors === 0 &&
            row.current.actions === 0 &&
            row.current.state === "measured"
        ),
        "Quiet covered fixture period is genuine zero"
      );
    if (period.name === "unavailable")
      assert.ok(
        actions(selected).every(
          (row) =>
            row.current.actors === null &&
            row.current.actions === null &&
            row.current.percent === null &&
            row.current.state === "unavailable"
        )
      );
    if (period.name === "partial")
      assert.equal(selected.modules.periods.previous.coverage, "unavailable");
    await assertScreen(selected);
    await exportCurrent(selected, period.name + "-modules");
  }
  await page.getByRole("link", { name: "Today", exact: true }).click();
  await page.waitForURL((url) => url.searchParams.get("preset") === "1");
  await modules().waitFor();
  const current = await read({ preset: "1" });
  assert.equal(current.window.partial, true);
  assert.equal(current.modules.periods.current.coverage, "complete");
  await assertScreen(current);
  assert.ok(
    (
      await page
        .getByRole("region", { name: "Selected period", exact: true })
        .innerText()
    ).includes("still in progress")
  );
  ok(
    "Custom dates and Today keep selected/preceding boundaries, complete collection coverage, partial observations, wholly unavailable history and in-progress calendar time distinct on screen and CSV"
  );

  phase = "small-group suppression";
  await db.platformPostComment.create({
    data: {
      postId: posts[0].id,
      authorId: actors[0].id,
      content: "Fictional small-group source fixture",
      createdAt: at(base + 2)
    }
  });
  await open();
  const suppressed = await read();
  assert.ok(
    actions(suppressed).every(
      (row) =>
        row.current.state === "suppressed" &&
        row.current.actors === null &&
        row.current.actions === null &&
        row.current.percent === null
    )
  );
  assert.equal(action(suppressed, "FOLLOW").previous.actors, 5);
  await assertScreen(suppressed);
  await exportCurrent(suppressed, "suppressed-modules");
  ok(
    "A real one-actor reply suppresses the whole selected complementary breakdown and rates, while the preceding permitted period stays distinct in UI and CSV"
  );

  phase = "unsupported scopes";
  const beforeInvalid = await db.adminOperation.count({
    where: { actorId: viewer.id, sourceType: "METRICS_EXPORT" }
  });
  for (const extra of [
    { ownerId: viewer.id },
    { churchId: "fictional-unavailable-scope" },
    { scope: "owner" },
    { scope: "church" }
  ]) {
    await read({ ...filters, ...extra }, 400);
    const denied = await postExport(extra);
    assert.equal(denied.status(), 400);
    assert.equal((await denied.json()).csv, undefined);
  }
  assert.equal(
    await db.adminOperation.count({
      where: { actorId: viewer.id, sourceType: "METRICS_EXPORT" }
    }),
    beforeInvalid
  );
  ok(
    "Owner and church scope inputs are rejected by both read and export boundaries without producing private reports, CSV or export receipts"
  );

  phase = "revoked authority";
  await db.platformOperatorGrant.updateMany({
    where: {
      userId: viewer.id,
      capability: "EXPORT_PLATFORM_METRICS",
      revokedAt: null
    },
    data: { revokedAt: new Date() }
  });
  await page.evaluate(() =>
    window.dispatchEvent(new Event("admin-access-changed"))
  );
  await eventually(
    async () =>
      (await page
        .getByRole("button", {
          name: "Export current aggregates as CSV",
          exact: true
        })
        .count()) === 0,
    "Revoked export control disappears"
  );
  await modules().waitFor();
  await assertScreen(await read());
  assert.equal((await postExport()).status(), 404);
  await db.platformOperatorGrant.updateMany({
    where: {
      userId: viewer.id,
      capability: "VIEW_PLATFORM_METRICS",
      revokedAt: null
    },
    data: { revokedAt: new Date() }
  });
  await page.evaluate(() =>
    window.dispatchEvent(new Event("admin-access-changed"))
  );
  await eventually(
    async () => (await modules().count()) === 0,
    "Revoked module report disappears"
  );
  await read(filters, 404);
  await signIn(member);
  await read(filters, 404, member);
  await signIn(null);
  await read(filters, 401, null);
  assert.equal(
    await db.adminOperation.count({
      where: { actorId: viewer.id, sourceType: "METRICS_EXPORT" }
    }),
    beforeInvalid
  );
  assert.deepEqual(externalRequests, []);
  assert.deepEqual(errors, []);
  ok(
    "Current VIEW and EXPORT permissions remain independent: revoked exports cannot download, revoked viewers lose modules, and members/guests receive no aggregate payload"
  );
  writeFileSync(
    join(output, "results.json"),
    JSON.stringify(
      { results, observations, receipts, errors, externalRequests },
      null,
      2
    ),
    { mode: 0o600 }
  );
  console.log("EVIDENCE " + output);
} catch (error) {
  writeFileSync(
    join(output, "failure.json"),
    JSON.stringify(
      {
        phase,
        error: String(error),
        stack: error.stack,
        results,
        observations,
        receipts,
        errors,
        externalRequests,
        url: page.url()
      },
      null,
      2
    ),
    { mode: 0o600 }
  );
  await page
    .screenshot({ path: join(output, "failure.png"), fullPage: true })
    .catch(() => {});
  console.error("EVIDENCE " + output);
  throw error;
} finally {
  await browser.close();
  await db.$disconnect();
}
