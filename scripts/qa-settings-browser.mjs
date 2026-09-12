import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
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
const output = fixtureDir + "/settings-browser";
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
const { seedManagedChurch } =
  await import("../tests/seed-church-management.ts");
const { relationshipCommand } =
  await import("../lib/platform/relationships.ts");
const { randomUUID } = await import("node:crypto");
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
try {
  const a = await createPortalActor(db, "settingsbrowser"),
    b = await createPortalActor(db, "settingsother");
  const managed = await seedManagedChurch(db, a);
  await relationshipCommand(db, a.token, {
    operation: "privacy",
    mutationId: randomUUID(),
    expectedVersion: 0,
    mentions: "NOBODY",
    showRelationships: false
  });
  await signIn(a);
  await go("/platform/settings");
  await page.getByLabel("Search settings", { exact: true }).waitFor();
  await page.getByLabel("Search settings", { exact: true }).fill("alerts");
  await page.locator("#setting-notifications-availability").click();
  await page.waitForURL("**/settings/notifications/availability");
  await page
    .getByText(
      "In-app notification categories, email alerts, push and quiet hours are not available yet.",
      { exact: true }
    )
    .waitFor();
  await page.goBack();
  await page.getByLabel("Search settings", { exact: true }).waitFor();
  assert.equal(
    await page.getByLabel("Search settings", { exact: true }).inputValue(),
    "alerts"
  );
  await page.getByLabel("Search settings", { exact: true }).fill("hide phone");
  await page.locator("#setting-privacy-directory").waitFor();
  assert.match(
    await page.locator("#setting-privacy-directory").innerText(),
    /Settings › Privacy and interactions/
  );
  await page.getByLabel("Search settings", { exact: true }).fill("family");
  await page
    .getByText("No matching settings. Try a different word.", { exact: true })
    .waitFor();
  await page.getByLabel("Search settings", { exact: true }).fill("");
  await page.locator("#folder-help").scrollIntoViewIfNeeded();
  const y = await page.evaluate(() => scrollY);
  await page.locator("#folder-help").click();
  await page.waitForURL("**/settings/help");
  await page.locator("#setting-help-features").waitFor();
  await page
    .getByRole("link", { name: "Back to settings", exact: true })
    .click();
  await page.getByLabel("Search settings", { exact: true }).waitFor();
  await page.waitForFunction(
    (expected) => Math.abs(scrollY - expected) < 80,
    y
  );
  ok(
    "Search synonyms, unavailable features, typed-query Back and folder scroll restoration"
  );

  await go("/platform/settings/display/reading");
  await page.getByLabel("Appearance", { exact: true }).waitFor();
  await page.getByLabel("Appearance", { exact: true }).selectOption("dark");
  await page
    .getByLabel("Post text size", { exact: true })
    .selectOption("largest");
  await page
    .getByText("Reading preferences saved in this browser.", { exact: true })
    .waitFor();
  await page
    .getByRole("button", { name: "Restore display defaults", exact: true })
    .click();
  await page.getByRole("region", { name: "Review display defaults" }).waitFor();
  await page
    .getByRole("button", { name: "Confirm display reset", exact: true })
    .click();
  assert.equal(
    await page.getByLabel("Appearance", { exact: true }).inputValue(),
    "system"
  );
  assert.equal(
    await page.getByLabel("Post text size", { exact: true }).inputValue(),
    "comfortable"
  );
  assert.equal(
    (await db.socialPreferences.findUniqueOrThrow({ where: { ownerId: a.id } }))
      .mentions,
    "NOBODY"
  );
  await page.evaluate(() => {
    const d = Object.getOwnPropertyDescriptor(Document.prototype, "cookie");
    window.restoreReadingCookie = () =>
      Object.defineProperty(Document.prototype, "cookie", d);
    Object.defineProperty(Document.prototype, "cookie", {
      configurable: true,
      get: d.get,
      set(v) {
        if (!v.startsWith("godschurches_reading=")) d.set.call(this, v);
      }
    });
  });
  await page.getByLabel("Appearance", { exact: true }).selectOption("dark");
  await page
    .getByRole("button", {
      name: "Retry saving reading preferences",
      exact: true
    })
    .waitFor();
  await page
    .getByRole("link", { name: "Back to Appearance and reading", exact: true })
    .click();
  await page
    .getByText(
      "Retry saving or discard your unsaved reading choices before leaving.",
      { exact: true }
    )
    .waitFor();
  await page
    .getByRole("button", {
      name: "Discard unsaved reading choices",
      exact: true
    })
    .click();
  assert.equal(
    await page.getByLabel("Appearance", { exact: true }).inputValue(),
    "system"
  );
  assert.equal(
    await page
      .getByText("Reading preferences saved in this browser.", { exact: true })
      .count(),
    0
  );
  await page.getByLabel("Appearance", { exact: true }).selectOption("dark");
  await page.evaluate(() => window.restoreReadingCookie());
  await page
    .getByRole("button", {
      name: "Retry saving reading preferences",
      exact: true
    })
    .click();
  await page
    .getByText("Reading preferences saved in this browser.", { exact: true })
    .waitFor();
  await page.reload();
  await page.getByLabel("Appearance", { exact: true }).waitFor();
  assert.equal(
    await page.getByLabel("Appearance", { exact: true }).inputValue(),
    "dark"
  );
  ok(
    "Display reset touches only browser preferences; storage failure retains work, discards to confirmed values and retries exact choices"
  );

  await go("/platform/settings/privacy/relationships");
  await page.getByLabel("Who may mention you").waitFor();
  assert.equal(
    await page.getByLabel("Who may mention you").inputValue(),
    "NOBODY"
  );
  const bodies = [];
  let lose = true;
  await page.route("**/api/platform/relationships", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    bodies.push(route.request().postData());
    if (lose) {
      lose = false;
      const r = await route.fetch();
      assert.equal(r.status(), 200);
      return route.abort("failed");
    }
    return route.continue();
  });
  await page.getByLabel("Who may mention you").selectOption("FOLLOWED");
  await page
    .getByRole("button", { name: "Save privacy choices", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Retry same privacy choices", exact: true })
    .waitFor();
  await page
    .getByRole("button", { name: "Retry same privacy choices", exact: true })
    .click();
  await page.getByText("Privacy choices saved.", { exact: true }).waitFor();
  assert.equal(bodies.length, 2);
  assert.equal(bodies[0], bodies[1]);
  let saved = await db.socialPreferences.findUniqueOrThrow({
    where: { ownerId: a.id }
  });
  assert.equal(saved.version, 2);
  assert.equal(saved.mentions, "FOLLOWED");
  await page.unroute("**/api/platform/relationships");
  await page.getByLabel("Who may mention you").selectOption("EVERYONE");
  await relationshipCommand(db, a.token, {
    operation: "privacy",
    mutationId: randomUUID(),
    expectedVersion: 2,
    mentions: "NOBODY",
    showRelationships: false
  });
  await page
    .getByRole("button", { name: "Save privacy choices", exact: true })
    .click();
  await page.waitForFunction(
    () =>
      document.querySelector('button[type="submit"]')?.disabled ||
      Array.from(document.querySelectorAll("button")).some(
        (b) => b.textContent === "Save privacy choices" && b.disabled
      )
  );
  assert.equal(
    await page.getByLabel("Who may mention you").inputValue(),
    "EVERYONE"
  );
  await page
    .getByRole("button", { name: "Review saved privacy choices", exact: true })
    .click();
  await page
    .getByRole("complementary", { name: "Saved privacy choices" })
    .waitFor();
  await page
    .getByRole("button", {
      name: "Discard unsaved privacy choices",
      exact: true
    })
    .click();
  assert.equal(
    await page.getByLabel("Who may mention you").inputValue(),
    "NOBODY"
  );
  assert.equal(
    (await db.socialPreferences.findUniqueOrThrow({ where: { ownerId: a.id } }))
      .version,
    3
  );
  await page.getByLabel("Who may mention you").selectOption("FOLLOWED");
  await page.route("**/api/platform/settings", (route) =>
    route.fulfill({
      status: 503,
      json: { message: "Fixture settings connection unavailable." }
    })
  );
  await page.evaluate(() => {
    dispatchEvent(new Event("blur"));
    dispatchEvent(new Event("focus"));
  });
  await page
    .getByRole("button", { name: "Retry settings", exact: true })
    .waitFor();
  assert.equal(await page.getByLabel("Who may mention you").isVisible(), false);
  await page.unroute("**/api/platform/settings");
  await page
    .getByRole("button", { name: "Retry settings", exact: true })
    .click();
  await page.getByLabel("Who may mention you").waitFor();
  assert.equal(
    await page.getByLabel("Who may mention you").inputValue(),
    "FOLLOWED"
  );
  const { currentRelease } = await import("../lib/platform/release-content.ts");
  const changed = {
    ...currentRelease,
    id: "settings-future-fixture",
    version: "2026.09.13.1"
  };
  await page.route("**/api/platform/release", (route) =>
    route.fulfill({
      json: {
        release: "2".repeat(40),
        product: {
          build: "2".repeat(40),
          id: changed.id,
          version: changed.version
        },
        notes: changed
      }
    })
  );
  await page
    .getByRole("button", { name: "Check for updates", exact: true })
    .click();
  await page.locator('[data-update-decision="keep-work"]').waitFor();
  assert.equal(
    await page
      .getByRole("button", { name: "Refresh now", exact: true })
      .count(),
    0
  );
  await page
    .getByRole("button", { name: "See what’s new", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("heading", { name: "Version 2026.09.13.1" })
    .waitFor();
  await page.getByRole("button", { name: "Close notes", exact: true }).click();
  assert.equal(
    await page.getByLabel("Who may mention you").inputValue(),
    "FOLLOWED"
  );
  assert.equal(
    (await db.socialPreferences.findUniqueOrThrow({ where: { ownerId: a.id } }))
      .version,
    3
  );
  await page.unroute("**/api/platform/release");
  await page.evaluate(() => history.back());
  await page
    .getByText("Save or resolve your privacy choices before leaving.", {
      exact: true
    })
    .waitFor();
  assert.match(page.url(), /settings\/privacy\/relationships/);
  await page
    .getByRole("button", {
      name: "Discard unsaved privacy choices",
      exact: true
    })
    .click();
  ok(
    "Privacy exact-body lost acknowledgement, conflict review, confirmed discard, safe-update notes and native Back protection"
  );

  await go("/platform/settings/church/organization");
  await page.getByLabel("Church", { exact: true }).waitFor();
  await page
    .getByLabel("Church", { exact: true })
    .selectOption(managed.church.id);
  await page
    .locator('a[href="/platform/churches/' + managed.church.id + '/access"]')
    .waitFor();
  await db.churchCapabilityGrant.updateMany({
    where: { userId: a.id, churchId: managed.church.id },
    data: { revokedAt: new Date(), version: { increment: 1 } }
  });
  await page.evaluate(() => {
    dispatchEvent(new Event("blur"));
    dispatchEvent(new Event("focus"));
  });
  await page.waitForFunction(
    (id) =>
      !document.querySelector('a[href="/platform/churches/' + id + '/access"]'),
    managed.church.id
  );
  const tools = await (
    await context.request.get(
      config.origin + "/api/platform/church-tools?churchId=" + managed.church.id
    )
  ).json();
  assert.deepEqual(tools.capabilities, []);
  await signIn(b);
  await page.evaluate(() => {
    dispatchEvent(new Event("blur"));
    dispatchEvent(new Event("focus"));
  });
  await page
    .getByText(
      "You have no approved church connection to select. A follow or contributed listing does not appoint you to manage a church.",
      { exact: true }
    )
    .waitFor();
  assert.equal(await page.locator("#settings-church").count(), 0);
  const ctx = await (
    await context.request.get(config.origin + "/api/platform/settings")
  ).json();
  assert.equal(ctx.ownerId, b.id);
  assert.deepEqual(ctx.churches, []);
  const denied = await context.request.get(
    config.origin + "/api/platform/settings",
    { headers: { "x-expected-account": a.id } }
  );
  assert.equal(denied.status(), 401);
  assert.doesNotMatch(await denied.text(), /emailLabel|churches|ownerId/);
  const noWrite = await context.request.post(
    config.origin + "/api/platform/settings",
    { data: { operation: "set", ownerId: a.id, enabled: true } }
  );
  assert.equal(noWrite.status(), 405);
  ok(
    "Current church-role refresh, account switch, expected-account mismatch and no generic settings writes"
  );

  await go("/platform/settings");
  await page.getByLabel("Search settings", { exact: true }).waitFor();
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(() => document.fonts.ready);
    await bounded();
    await page.evaluate(
      () => (document.documentElement.style.fontSize = "32px")
    );
    await page.evaluate(
      () =>
        new Promise((r) =>
          requestAnimationFrame(() => requestAnimationFrame(r))
        )
    );
    await bounded();
    await page.screenshot({
      path: output + "/settings-" + width + ".png",
      fullPage: true
    });
    await page.evaluate(() => (document.documentElement.style.fontSize = ""));
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByLabel("Search settings", { exact: true }).focus();
  await page.keyboard.type("password");
  await page.locator("#setting-security-password").focus();
  await page.keyboard.press("Enter");
  await page.waitForURL("**/settings/security/password");
  await page
    .getByRole("heading", { level: 1, name: "Password", exact: true })
    .waitFor();
  ok(
    "Phone/desktop enlarged text, search keyboard navigation and reachable controls"
  );

  await context.clearCookies();
  await page.goto(config.origin + "/platform/settings/display/reading");
  assert.equal(
    new URL(page.url()).searchParams.get("next"),
    "/platform/settings/display/reading"
  );
  const anon = await context.request.get(
    config.origin + "/api/platform/settings"
  );
  assert.equal(anon.status(), 401);
  assert.match(anon.headers()["cache-control"], /no-store/);
  const unknown = await context.request.get(
    config.origin + "/platform/settings/account/unknown"
  );
  assert.equal(unknown.status(), 404);
  assert.deepEqual(errors, []);
  ok(
    "Guest deep-link sign-in return, private no-store endpoint and unknown setting 404"
  );
  writeFileSync(
    output + "/result.json",
    JSON.stringify({ results, errors }, null, 2)
  );
  console.log("SETTINGS_BROWSER_PASS " + results.length);
} finally {
  await browser.close();
  await db.$disconnect();
}
