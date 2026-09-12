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
const output = fixtureDir + "/display-settings-browser";
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
try {
  const actor = await createPortalActor(db, "displaypreview");
  await signIn(actor);
  const beforeStyle = await db.profilePresentation.findUnique({
    where: { userId: actor.id }
  });
  const beforePrivacy = await db.socialPreferences.findUnique({
    where: { ownerId: actor.id }
  });
  await page.emulateMedia({
    colorScheme: "light",
    reducedMotion: "no-preference"
  });
  await go("/platform/settings/display/reading");
  const root = page.locator(".platform-design[data-release][data-reader-size]");
  const preview = page.getByRole("region", {
    name: "Display preview",
    exact: true
  });
  const choose = async (name, value) =>
    page.getByLabel(name, { exact: true }).selectOption(value);
  const save = () =>
    page
      .getByRole("button", { name: "Save display choices", exact: true })
      .click();
  const cookie = async () =>
    (await context.cookies()).find((c) => c.name === "godschurches_reading")
      ?.value ?? null;
  const style = (el, property) =>
    el.evaluate((e, p) => getComputedStyle(e)[p], property);
  await preview.waitFor();
  const originalCookie = await cookie();
  const originalCanvas = await style(root, "backgroundColor");
  await choose("Appearance", "dark");
  await choose("Post text size", "largest");
  await choose("Home reading layout", "list");
  assert.equal(await root.getAttribute("data-appearance"), "system");
  assert.equal(await root.getAttribute("data-reader-size"), "comfortable");
  assert.equal(await cookie(), originalCookie);
  assert.equal(await style(root, "backgroundColor"), originalCanvas);
  assert.notEqual(await style(preview, "backgroundColor"), originalCanvas);
  assert.equal(
    await style(preview.locator(".gc-reader-sample").first(), "fontSize"),
    "24px"
  );
  assert.equal(await preview.getByRole("article").count(), 2);
  await choose("Home reading layout", "pages");
  const next = preview.getByRole("button", {
    name: "Next sample",
    exact: true
  });
  await next.focus();
  await page.keyboard.press("Enter");
  await preview
    .getByRole("heading", { name: "Make room for one another", exact: true })
    .waitFor();
  const previous = preview.getByRole("button", {
    name: "Previous sample",
    exact: true
  });
  await previous.focus();
  assert.equal(
    await previous.evaluate((e) => e.matches(":focus-visible")),
    true
  );
  assert.notEqual(await style(previous, "outlineStyle"), "none");
  await page.keyboard.press("Enter");
  await preview
    .getByRole("heading", { name: "A place to belong", exact: true })
    .waitFor();
  ok(
    "Sample cards reflect staged theme, text and layout without writing storage or changing the app; sample controls work with keyboard and visible focus"
  );

  const { currentRelease } = await import("../lib/platform/release-content.ts");
  const future = {
    ...currentRelease,
    id: "display-future-fixture",
    version: "2026.09.13.1"
  };
  await page.route("**/api/platform/release", (route) =>
    route.fulfill({
      json: {
        release: "2".repeat(40),
        product: {
          build: "2".repeat(40),
          id: future.id,
          version: future.version
        },
        notes: future
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
  await page.unroute("**/api/platform/release");
  await page
    .getByRole("link", { name: "Back to Appearance and reading", exact: true })
    .click();
  await page
    .getByText(
      "Retry saving or discard your unsaved reading choices before leaving.",
      { exact: true }
    )
    .waitFor();
  assert.match(page.url(), /\/settings\/display\/reading$/);
  await page.evaluate(() => history.back());
  await page
    .getByText(
      "Retry saving or discard your unsaved reading choices before leaving.",
      { exact: true }
    )
    .waitFor();
  assert.equal(
    await page.getByLabel("Post text size", { exact: true }).inputValue(),
    "largest"
  );
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
  assert.equal(await cookie(), originalCookie);
  await choose("Appearance", "dark");
  await choose("Post text size", "largest");
  await save();
  await page
    .getByText("Reading preferences saved in this browser.", { exact: true })
    .waitFor();
  assert.equal(await root.getAttribute("data-appearance"), "dark");
  assert.equal(await root.getAttribute("data-reader-size"), "largest");
  const savedCookie = await cookie();
  assert.deepEqual(
    Object.keys(JSON.parse(decodeURIComponent(savedCookie))).sort(),
    ["appearance", "mode", "reduceData", "reduceMotion", "size"]
  );
  await page.reload();
  await preview.waitFor();
  assert.equal(await root.getAttribute("data-appearance"), "dark");
  assert.equal(
    await page.getByLabel("Post text size", { exact: true }).inputValue(),
    "largest"
  );
  ok(
    "Preview survives in-app and native Back; discard writes nothing; explicit Save applies exactly five browser fields and survives reload"
  );

  await choose("Appearance", "system");
  await save();
  await page.emulateMedia({ colorScheme: "light" });
  const light = await style(root, "backgroundColor");
  await page.emulateMedia({ colorScheme: "dark" });
  const dark = await style(root, "backgroundColor");
  assert.notEqual(light, dark);
  assert.equal(await style(preview, "backgroundColor"), dark);
  await choose("Appearance", "light");
  await save();
  assert.equal(await style(root, "backgroundColor"), light);
  await page.emulateMedia({ colorScheme: "light" });
  assert.equal(await style(root, "backgroundColor"), light);
  await page.emulateMedia({ colorScheme: "dark" });
  assert.equal(await style(root, "backgroundColor"), light);
  assert.deepEqual(
    await db.profilePresentation.findUnique({ where: { userId: actor.id } }),
    beforeStyle
  );
  assert.deepEqual(
    await db.socialPreferences.findUnique({ where: { ownerId: actor.id } }),
    beforePrivacy
  );
  ok(
    "System appearance responds to live device changes; explicit light remains selected; profile presentation and relationship privacy remain unchanged"
  );

  await page.evaluate(() => {
    const d = Object.getOwnPropertyDescriptor(Document.prototype, "cookie");
    window.displayWrites = [];
    window.restoreDisplayCookie = () =>
      Object.defineProperty(Document.prototype, "cookie", d);
    Object.defineProperty(Document.prototype, "cookie", {
      configurable: true,
      get: d.get,
      set(v) {
        if (v.startsWith("godschurches_reading=")) {
          window.displayWrites.push(v);
          return;
        }
        d.set.call(this, v);
      }
    });
  });
  await choose("Appearance", "dark");
  await save();
  const retry = page.getByRole("button", {
    name: "Retry saving reading preferences",
    exact: true
  });
  await retry.waitFor();
  assert.equal(
    await page.getByLabel("Post text size", { exact: true }).isDisabled(),
    true
  );
  await retry.click();
  const writes = await page.evaluate(() => window.displayWrites);
  assert.equal(writes.length, 2);
  assert.equal(writes[0], writes[1]);
  await page
    .getByRole("button", {
      name: "Discard unsaved reading choices",
      exact: true
    })
    .click();
  assert.equal(await root.getAttribute("data-appearance"), "light");
  await choose("Appearance", "dark");
  await save();
  await retry.waitFor();
  await page.evaluate(() => window.restoreDisplayCookie());
  await retry.click();
  await page
    .getByText("Reading preferences saved in this browser.", { exact: true })
    .waitFor();
  assert.equal(await root.getAttribute("data-appearance"), "dark");
  ok(
    "Blocked storage locks edits, retries identical cookie writes, discards to confirmed state and recovers with storage restored"
  );

  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(
      () => (document.documentElement.style.fontSize = "200%")
    );
    await bounded();
    for (const control of await page
      .locator(".gc-settings select,.gc-settings button")
      .all()) {
      const bounds = await control.boundingBox();
      if (bounds)
        assert.ok(
          bounds.width > 0 &&
            bounds.x >= 0 &&
            bounds.x + bounds.width <= width + 1,
          "Display control fits viewport"
        );
    }
  }
  await page.evaluate(() => (document.documentElement.style.fontSize = ""));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: output + "/display-preview-390.png",
    fullPage: true
  });
  await page
    .getByRole("button", { name: "Restore display defaults", exact: true })
    .click();
  assert.equal(await root.getAttribute("data-appearance"), "dark");
  await page
    .getByRole("button", { name: "Confirm display reset", exact: true })
    .click();
  assert.deepEqual(JSON.parse(decodeURIComponent(await cookie())), {
    appearance: "system",
    mode: "pages",
    size: "comfortable",
    reduceMotion: false,
    reduceData: false
  });
  assert.deepEqual(
    await db.profilePresentation.findUnique({ where: { userId: actor.id } }),
    beforeStyle
  );
  assert.deepEqual(
    await db.socialPreferences.findUnique({ where: { ownerId: actor.id } }),
    beforePrivacy
  );
  ok(
    "Display remains bounded at phone and desktop widths with doubled root text; confirmed reset changes only the five browser fields"
  );

  const { postCommand } = await import("../lib/platform/post-commands.ts");
  const { randomUUID } = await import("node:crypto");
  const post = await postCommand(db, actor.token, {
    operation: "create",
    requestKey: randomUUID(),
    content:
      "Display motion fixture. A readable post to test actual focused reading."
  });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await go("/platform/feed?post=" + post.id);
  const postPage = page
    .locator(".gc-focused-post .gc-post-page:not([hidden])")
    .first();
  await postPage.waitFor();
  assert.notEqual(await style(postPage, "animationName"), "none");
  await page.emulateMedia({ reducedMotion: "reduce" });
  assert.equal(await style(postPage, "animationName"), "none");
  await go("/platform/settings/display/reading");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.getByLabel("Reduce motion", { exact: false }).check();
  await save();
  await go("/platform/feed?post=" + post.id);
  await postPage.waitFor();
  assert.equal(await style(postPage, "animationName"), "none");
  ok(
    "Actual focused post animation honors both device reduced motion and the saved explicit reduction"
  );
  assert.deepEqual(errors, []);
  writeFileSync(
    output + "/result.json",
    JSON.stringify(
      { passed: results.length, results, errors, productionWrites: 0 },
      null,
      2
    )
  );
} catch (error) {
  await page
    .screenshot({ path: output + "/failure.png", fullPage: true })
    .catch(() => {});
  writeFileSync(
    output + "/failure.txt",
    String(error) + "\n" + (await page.locator("body").innerText())
  );
  throw error;
} finally {
  await browser.close();
  await db.$disconnect();
}
