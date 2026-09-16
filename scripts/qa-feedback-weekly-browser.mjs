import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
const dir = process.argv[2];
assert.match(dir ?? "", /^\.account-test\/[a-z0-9-]+$/);
const config = JSON.parse(readFileSync(dir + "/browser-env.json", "utf8"));
assert.match(config.origin, /^https:\/\/127\.0\.0\.1:\d+$/);
assert.equal(new URL(config.database).hostname, "127.0.0.1");
Object.assign(process.env, {
  DATABASE_URL: config.database,
  DIRECT_URL: config.database,
  ACCOUNT_ORIGIN: config.origin,
  NEXT_PUBLIC_SITE_URL: config.origin,
  ACCOUNT_TEST_ISOLATED: "1",
  ACCOUNT_DELIVERY_MODE: "test-sink",
  ACCOUNT_TEST_SINK_DIR: resolve(dir, "sink"),
  RETENTION_TEST_DIR: resolve(dir, "retention"),
  MEDIA_STORAGE_MODE: "local-test",
  MEDIA_TEST_DIR: resolve(dir, "images"),
  AUTH_RATE_LIMIT_SECRET: "medium-fixture-only-secret-".repeat(3),
  NODE_ENV: "test",
  VERCEL: "",
  FEEDBACK_INTAKE_ENABLED: "true",
  FEEDBACK_IDEAS_ENABLED: "true",
  FEEDBACK_FOLLOWUP_ENABLED: "true",
  SUPPORT_INTAKE_ENABLED: "true",
  RESEND_API_KEY: "",
  MAILERLITE_API_KEY: "",
  FOUNDER_WELCOME_ENABLED: "false",
  FOUNDER_ANNOUNCEMENTS_ENABLED: "false",
  PUSH_ENABLED: "false"
});
const { PrismaClient } = await import("@prisma/client"),
  db = new PrismaClient();
const { seedSupport } = await import("../tests/seed-support.ts");

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
const results = [],
  errors = [],
  dialogs = [],
  contexts = [];
const output = dir + "/feedback-weekly-browser";
mkdirSync(output, { recursive: true, mode: 0o700 });

const ok = (label) => {
  results.push(label);
  console.log("PASS " + label);
};
async function pageFor(actor) {
  const context = await browser.newContext({
    viewport: { width: 320, height: 844 }
  });
  contexts.push(context);
  await context.route("**/*", (route) =>
    new URL(route.request().url()).origin === config.origin
      ? route.continue()
      : route.abort()
  );
  if (actor)
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
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("dialog", async (dialog) => {
    dialogs.push(dialog.type());
    await dialog.accept();
  });
  return page;
}
const go = async (page, path) => {
  await page.bringToFront();
  const response = await page.goto(config.origin + path, {
    waitUntil: "domcontentloaded"
  });
  assert.equal(response.status(), 200);
};
const fits = async (page) => {
  const fits = await page.evaluate(
    () => document.documentElement.scrollWidth <= innerWidth + 1
  );
  if (!fits) {
    writeFileSync(
      output + "/overflow.json",
      JSON.stringify(
        await page.evaluate(() =>
          [...document.querySelectorAll("main *")]
            .map((el) => ({
              tag: el.tagName,
              name: el.getAttribute("name"),
              class: el.className,
              right: Math.round(el.getBoundingClientRect().right),
              width: Math.round(el.getBoundingClientRect().width)
            }))
            .filter((el) => el.right > innerWidth + 1)
        ),
        null,
        2
      )
    );
    await page.screenshot({ path: output + "/overflow.png", fullPage: true });
  }
  assert.ok(fits, "No 320px page overflow");
};
const until = async (fn) => {
  for (let n = 0; n < 80; n++) {
    if (await fn()) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  assert.fail("Expected browser state did not arrive");
};
const send = async (page, button, endpoint = "feedback") => {
  const response = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/platform/" + endpoint) &&
      r.request().method() === "POST"
  );
  await page.getByRole("button", { name: button, exact: true }).focus();
  await page.getByRole("button", { name: button, exact: true }).press("Enter");
  const r = await response;
  assert.equal(r.status(), 200, await r.text());
  await page.waitForFunction(
    (name) =>
      [...document.forms]
        .filter((f) => f.getAttribute("aria-label") === name)
        .every((f) => f.getAttribute("aria-busy") !== "true"),
    button
  );
  return r.json();
};

process.env.PLATFORM_MEASUREMENT_ENABLED = "true";
process.env.PLATFORM_METRICS_ZONE = "America/Chicago";
const { seedOperatorGrants, createPortalActor } =
  await import("../tests/seed-portal.ts");
const { readFeedbackWeekly } =
  await import("../lib/platform/feedback-weekly.ts");
const { metricDayStart } = await import("../lib/platform/metric-time.ts");
const { METRIC_POLICY } = await import("../lib/platform/metric-policy.ts");
const { FEEDBACK_PROMPT_POLICY } =
  await import("../lib/platform/feedback-prompt-policy.ts");
const { metricConfiguration } =
  await import("../lib/platform/platform-measurement.ts");
try {
  await db.platformUser.updateMany({
    where: { username: { startsWith: "p_weeklybro_" } },
    data: { metricExcluded: true }
  });
  const fixture = await seedSupport(db);
  await seedOperatorGrants(db, fixture.owner, [
    "MANAGE_PRODUCT_FEEDBACK",
    "VIEW_PLATFORM_METRICS",
    "EXPORT_PLATFORM_METRICS"
  ]);
  const initial = await readFeedbackWeekly(db, fixture.owner.token);
  const week = initial.weekly.window.from;
  const at = new Date(
    metricDayStart(week, initial.weekly.window.zone).getTime() + 12 * 3600000
  );
  const configuration = await metricConfiguration(db);
  const caseIds = [];
  for (let i = 0; i < 10; i++) {
    const a = await createPortalActor(db, "weeklybrowser");
    await db.platformUser.update({
      where: { id: a.id },
      data: { createdAt: new Date(at.getTime() - 8 * 86400000) }
    });
    await db.platformMeasurementChoice.create({
      data: {
        userId: a.id,
        policy: METRIC_POLICY,
        enabledAt: new Date(at.getTime() - 86400000)
      }
    });
    const claim = await db.feedbackPromptClaim.create({
      data: {
        id: crypto.randomUUID(),
        userId: a.id,
        campaign: FEEDBACK_PROMPT_POLICY,
        measurementVersion: 1,
        configurationVersion: configuration.version,
        createdAt: at,
        expiresAt: new Date(at.getTime() + 120000),
        shownAt: at,
        finishedAt: new Date(at.getTime() + 60000)
      }
    });
    if (i < 6) {
      const c = await db.supportCase.create({
        data: {
          requesterId: a.id,
          category: "ACCOUNT_WEBSITE",
          subject: "Weekly browser source " + i,
          description: "PRIVATE case explanation",
          ownerGrantId: fixture.ownerGrant.id,
          ownerGrantVersion: 1,
          priority: i === 0 ? "HIGH" : "NORMAL",
          createdAt: at,
          triageTags: ["navigation"],
          feedback: {
            create: {
              kind: i === 0 ? "BUG" : "GENERAL",
              rating: [1, 3, 4, 5, 5, null][i],
              createdAt: new Date(at.getTime() + 60000),
              entryPoint: i < 2 ? "PROMPT" : "VOLUNTARY",
              ...(i < 2 ? { promptClaimId: claim.id } : {})
            }
          }
        }
      });
      caseIds.push(c.id);
    }
  }
  const staff = await pageFor(fixture.owner);
  await go(staff, "/platform/admin/feedback/weekly");
  await staff
    .getByRole("heading", { name: "Weekly feedback review", exact: true })
    .waitFor();
  await staff
    .getByText(
      "6 cases · 6 retained messages across those cases · 6 distinct requesters.",
      { exact: false }
    )
    .waitFor();
  await staff.getByText("5 / 3.60 out of 5", { exact: true }).waitFor();
  await staff.getByText("2 / 10: 20.0%", { exact: true }).waitFor();
  await fits(staff);
  await staff.screenshot({ path: output + "/weekly-320.png", fullPage: true });
  ok(
    "At 320px the authorized weekly view reconciles six cases, five ratings averaging 3.6 and two responses to ten displayed prompts; small detail groups remain suppressed"
  );

  const learned = staff.getByRole("textbox", {
    name: "What we learned (optional)",
    exact: true
  });
  await learned.fill("PRIVATE unsent weekly observation");
  await staff
    .getByRole("textbox", { name: "What we will try (optional)", exact: true })
    .fill("Clarify the navigation label");
  await staff
    .getByRole("textbox", {
      name: "What we will check next (optional)",
      exact: true
    })
    .fill("Review distinct people and reopened cases");
  await staff
    .getByRole("textbox", {
      name: "Canonical build task or specification (optional)",
      exact: true
    })
    .fill("https://github.com/example/website/issues/12");
  await staff.evaluate(() => window.dispatchEvent(new Event("blur")));
  assert.equal(await learned.isVisible(), false);
  await staff.evaluate(() => window.dispatchEvent(new Event("focus")));
  await learned.waitFor({ state: "visible" });
  assert.equal(await learned.inputValue(), "PRIVATE unsent weekly observation");
  const endpoint = config.origin + "/api/platform/admin",
    bodies = [];
  let lost = false;
  await staff.route(endpoint, async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    const body = route.request().postData();
    if (JSON.parse(body).operation !== "feedback-review")
      return route.continue();
    bodies.push(body);
    if (!lost) {
      lost = true;
      await route.fetch();
      await route.abort();
    } else await route.continue();
  });
  await staff
    .getByRole("button", { name: "Save private review", exact: true })
    .focus();
  await staff
    .getByRole("button", { name: "Save private review", exact: true })
    .press("Enter");
  await staff
    .getByRole("button", { name: "Retry original action", exact: true })
    .waitFor();
  await until(
    async () =>
      (await db.feedbackWeeklyReview.count({
        where: { userId: fixture.owner.id, week, version: 1 }
      })) === 1
  );
  assert.equal(await learned.inputValue(), "PRIVATE unsent weekly observation");
  await send(staff, "Retry original action", "admin");
  await staff
    .getByRole("button", { name: "Save private review", exact: true })
    .waitFor();
  assert.equal(bodies.length, 2);
  assert.equal(bodies[0], bodies[1]);
  const requestKey = JSON.parse(bodies[0]).requestKey;
  assert.equal(
    await db.adminOperation.count({
      where: { actorId: fixture.owner.id, requestKey }
    }),
    1
  );
  await until(() =>
    staff.evaluate(
      () => document.activeElement?.getAttribute("role") === "status"
    )
  );
  await staff.unroute(endpoint);
  await fits(staff);
  ok(
    "Keyboard review notes survive access rechecks and a lost save acknowledgment; the identical retry creates one protected receipt and restores focus to status"
  );

  await staff
    .getByRole("link", { name: "Weekly browser source 0", exact: true })
    .first()
    .click();
  await staff
    .getByRole("heading", { name: "Weekly browser source 0", exact: true })
    .waitFor();
  await fits(staff);
  await go(
    staff,
    "/platform/admin/growth?from=" +
      week +
      "&through=" +
      initial.weekly.window.through
  );
  await staff
    .getByRole("heading", { name: "Feedback and prompt coverage", exact: true })
    .waitFor();
  const exported = staff.waitForEvent("download");
  await staff
    .getByRole("button", {
      name: "Export current aggregates as CSV",
      exact: true
    })
    .click();
  const download = await exported;
  const csv = readFileSync(await download.path(), "utf8");
  assert.ok(csv.includes("feedback.current.mean,3.6"));
  assert.ok(csv.includes("feedback.current.prompt.percent,20"));
  assert.ok(!csv.includes("PRIVATE"));
  assert.ok(caseIds.every((id) => !csv.includes(id)));
  await fits(staff);
  await staff.screenshot({
    path: output + "/growth-feedback-320.png",
    fullPage: true
  });
  ok(
    "An authorized source link opens the native case and the separately permitted Growth CSV contains the same suppressed aggregates without case or review-note text"
  );

  const outsider = await createPortalActor(db, "weeklybrowserother");
  await seedOperatorGrants(db, outsider, ["MANAGE_PRODUCT_FEEDBACK"]);
  const other = await pageFor(outsider);
  await go(other, "/platform/admin/feedback/weekly");
  await other
    .getByRole("heading", { name: "Weekly feedback review", exact: true })
    .waitFor();
  await other
    .getByText(
      "0 cases · 0 retained messages across those cases · 0 distinct requesters.",
      { exact: false }
    )
    .waitFor();
  assert.equal(
    await other
      .getByRole("textbox", { name: "What we learned (optional)", exact: true })
      .inputValue(),
    ""
  );
  assert.equal(
    await other
      .getByRole("heading", {
        name: "Ratings and response coverage",
        exact: true
      })
      .count(),
    0
  );
  await fits(other);
  await other.screenshot({
    path: output + "/scope-empty-320.png",
    fullPage: true
  });
  await staff.bringToFront();
  await go(staff, "/platform/admin/feedback/weekly");
  await staff
    .getByRole("textbox", { name: "What we learned (optional)", exact: true })
    .waitFor();
  await db.platformOperatorGrant.updateMany({
    where: { userId: fixture.owner.id, capability: "MANAGE_PRODUCT_FEEDBACK" },
    data: { revokedAt: new Date() }
  });
  await staff.evaluate(() => window.dispatchEvent(new Event("blur")));
  await staff.evaluate(() => window.dispatchEvent(new Event("focus")));
  await staff
    .getByRole("button", { name: "Recheck current access", exact: true })
    .waitFor();
  assert.equal(
    await staff
      .getByRole("textbox", { name: "What we learned (optional)", exact: true })
      .isVisible(),
    false
  );
  const member = await pageFor(fixture.memberA);
  await go(member, "/platform/admin/feedback/weekly");
  await member
    .getByRole("heading", { name: "Admin view unavailable", exact: true })
    .waitFor();
  assert.deepEqual(errors, []);
  assert.deepEqual(dialogs, []);
  ok(
    "A product-only reviewer sees no other source cases, aggregate ratings or operator notes; role revocation conceals retained content and ordinary users are denied"
  );
} finally {
  writeFileSync(
    output + "/result.json",
    JSON.stringify(
      {
        at: new Date().toISOString(),
        results,
        errors,
        dialogs,
        completed: results.length === 4
      },
      null,
      2
    ),
    { mode: 0o600 }
  );
  for (const c of contexts) await c.close();
  await browser.close();
  await db.$disconnect();
}
