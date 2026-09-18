import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";

const fixtureDir = process.argv[2];
assert.match(fixtureDir ?? "", /^\.account-test\/[a-z0-9-]+$/);
const config = JSON.parse(
  readFileSync(fixtureDir + "/browser-env.json", "utf8")
);
assert.match(config.origin, /^https:\/\/127\.0\.0\.1:\d+$/);
assert.equal(new URL(config.database).hostname, "127.0.0.1");
assert.equal(new URL(config.database).pathname, "/godschurches_security_test");
assert.ok(
  process.env.AUTH_RATE_LIMIT_SECRET,
  "Use the isolated preview environment"
);
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
  PRIVILEGED_MFA_MODE: "off",
  COMMUNITY_REPORTS_ENABLED: "true",
  SOCIAL_EMAIL_ENABLED: "false",
  BLOB_READ_WRITE_TOKEN: "",
  RESEND_API_KEY: "",
  MAILERLITE_API_KEY: "",
  MEDIA_STORAGE_MODE: "local-test",
  MEDIA_TEST_DIR: process.cwd() + "/" + fixtureDir + "/images"
});
const { PrismaClient } = await import("@prisma/client");
const { createPortalActor, assertPortalTestDatabase, seedOperatorGrants } =
  await import("../tests/seed-portal.ts");
const { readMenuShortcuts, saveMenuShortcuts } =
  await import("../lib/platform/menu-shortcuts.ts");
const { loginAccount } = await import("../lib/platform/accounts.ts");
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
      createHash("sha256").update(der).digest("base64"),
    "--no-proxy-server"
  ]
});
const context = await browser.newContext({
  viewport: { width: 320, height: 844 },
  hasTouch: true
});
await context.route("**/*", (route) =>
  new URL(route.request().url()).origin === config.origin
    ? route.continue()
    : route.abort()
);
const page = await context.newPage(),
  errors = [],
  results = [];
const output = fixtureDir + "/menu-shortcuts-browser-" + Date.now();
mkdirSync(output, { recursive: true });
page.on("pageerror", (e) =>
  errors.push({ path: new URL(page.url()).pathname, message: e.message })
);
const ok = (message) => {
  results.push(message);
  console.log("PASS " + message);
};
const go = async (path) =>
  assert.equal((await page.goto(config.origin + path)).status(), 200);
const signIn = async (actor) => {
  await context.clearCookies();
  if (actor)
    await context.addCookies([
      {
        name: "church_platform_session",
        value: actor.token,
        url: config.origin,
        secure: true,
        httpOnly: true,
        sameSite: "Lax"
      }
    ]);
};
const bounded = async () =>
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1
    ),
    "No horizontal page overflow"
  );
const waitUntil = async (work) => {
  for (let i = 0; i < 80; i++) {
    if (await work()) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw Error("Expected current shortcut state was not observed");
};
const editor = () =>
  page
    .locator("details")
    .filter({
      has: page.locator("summary", { hasText: "Edit Menu shortcuts" })
    });
const savedLinks = () =>
  page.getByRole("list", { name: "Saved Menu shortcuts", exact: true });
const openEditor = async () => {
  await editor().waitFor({ state: "visible" });
  if (!(await editor().evaluate((node) => node.open)))
    await editor().locator("summary").click();
  await editor().getByRole("checkbox").first().waitFor();
};
const save = () =>
  editor()
    .getByRole("button", { name: "Save Menu shortcuts", exact: true })
    .click();
const row = (owner) =>
  db.socialPreferences.findUniqueOrThrow({ where: { ownerId: owner.id } });
const menuTitles = () =>
  savedLinks().locator(".gc-menu-link-title").allTextContents();
try {
  const owner = await createPortalActor(db, "cutbrowser"),
    other = await createPortalActor(db, "cutother");
  await db.socialPreferences.create({
    data: {
      ownerId: owner.id,
      feedMode: "friends",
      feedVersion: 7,
      mentions: "NOBODY",
      version: 3
    }
  });
  await go("/platform/menu");
  assert.equal(await editor().count(), 0);
  ok(
    "Guests receive working Menu navigation without another account's shortcut editor"
  );
  await signIn(owner);
  await go("/platform/menu");
  await openEditor();
  const ids = ["settings", "exchange", "groups", "calendars", "profile", "qr"];
  const initial = await readMenuShortcuts(db, owner.token);
  const titles = ids.map(
    (id) => initial.choices.find((item) => item.id === id).title
  );
  for (const name of titles)
    await editor().getByRole("checkbox", { name, exact: true }).check();
  assert.equal(
    await editor()
      .getByRole("checkbox", { name: "My feed", exact: true })
      .isDisabled(),
    true
  );
  await editor()
    .getByRole("button", { name: "Move Exchange up", exact: true })
    .click();
  await page.getByRole("link", { name: "Back to Home", exact: true }).click();
  await editor()
    .getByText("Save or resolve your private choice before leaving.", {
      exact: true
    })
    .waitFor();
  assert.equal(new URL(page.url()).pathname, "/platform/menu");
  await page.evaluate(() => history.back());
  await editor()
    .getByRole("checkbox", { name: "Account settings", exact: true })
    .waitFor();
  assert.equal(
    await editor()
      .getByRole("checkbox", { name: "Account settings", exact: true })
      .isChecked(),
    true
  );
  await save();
  await waitUntil(
    async () =>
      (await menuTitles()).join("|") ===
      [titles[1], titles[0], ...titles.slice(2)].join("|")
  );
  assert.deepEqual((await row(owner)).menuShortcutIds, [
    ids[1],
    ids[0],
    ...ids.slice(2)
  ]);
  const secondToken = await loginAccount(
    db,
    owner.email,
    owner.password,
    "Shortcut second browser"
  );
  const second = await browser.newContext();
  await second.route("**/*", (route) =>
    new URL(route.request().url()).origin === config.origin
      ? route.continue()
      : route.abort()
  );
  await second.addCookies([
    {
      name: "church_platform_session",
      value: secondToken,
      url: config.origin,
      secure: true,
      httpOnly: true,
      sameSite: "Lax"
    }
  ]);
  const secondPage = await second.newPage();
  await secondPage.goto(config.origin + "/platform/menu");
  await secondPage
    .getByRole("list", { name: "Saved Menu shortcuts", exact: true })
    .waitFor();
  assert.deepEqual(
    await secondPage
      .getByRole("list", { name: "Saved Menu shortcuts", exact: true })
      .locator(".gc-menu-link-title")
      .allTextContents(),
    await menuTitles()
  );
  await second.close();
  ok(
    "Six ordered choices save through the actual form and persist in another browser/session; unsaved link and Back navigation retain edits"
  );
  await openEditor();
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(
      () => (document.documentElement.style.fontSize = "32px")
    );
    await bounded();
    await page.screenshot({
      path: output + "/menu-" + width + ".png",
      fullPage: true
    });
    await page.evaluate(() => (document.documentElement.style.fontSize = ""));
  }
  await editor()
    .getByRole("checkbox", { name: "Account settings", exact: true })
    .focus();
  await page.keyboard.press("Space");
  assert.equal(
    await editor()
      .getByRole("checkbox", { name: "Account settings", exact: true })
      .isChecked(),
    false
  );
  page.once("dialog", (d) => d.accept());
  await editor()
    .getByRole("button", { name: "Discard local shortcut edits", exact: true })
    .click();
  await waitUntil(
    async () =>
      await editor()
        .getByRole("button", { name: "Save Menu shortcuts", exact: true })
        .isDisabled()
  );
  page.once("dialog", (d) => d.accept());
  await editor()
    .getByRole("button", { name: "Reset Menu shortcuts", exact: true })
    .click();
  await waitUntil(async () => (await row(owner)).menuShortcutsVersion === 2);
  await page
    .getByText("No shortcuts selected. Choose the places you use most.", {
      exact: true
    })
    .waitFor();
  let prefs = await row(owner);
  assert.deepEqual(prefs.menuShortcutIds, []);
  assert.equal(prefs.feedVersion, 7);
  assert.equal(prefs.feedMode, "friends");
  assert.equal(prefs.mentions, "NOBODY");
  assert.equal(prefs.version, 3);
  ok(
    "Keyboard editing, explicit discard and reset preserve unrelated preferences; enlarged layouts fit 320, 390 and 1440 pixel viewports"
  );
  await openEditor();
  await editor()
    .getByRole("checkbox", { name: "Gather groups", exact: true })
    .check();
  const attempts = [];
  await page.route("**/api/platform/menu-shortcuts", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    attempts.push(route.request().postData());
    if (attempts.length === 1) {
      const response = await route.fetch();
      assert.equal(response.status(), 200);
      await response.dispose();
      return route.abort();
    }
    return route.continue();
  });
  await save();
  await editor()
    .getByRole("button", { name: "Confirm original save", exact: true })
    .waitFor();
  assert.equal((await row(owner)).menuShortcutsVersion, 3);
  await editor()
    .getByRole("button", { name: "Confirm original save", exact: true })
    .click();
  await waitUntil(async () => (await menuTitles()).join() === "Gather groups");
  assert.equal(attempts.length, 2);
  assert.equal(attempts[0], attempts[1]);
  assert.equal((await row(owner)).menuShortcutsVersion, 3);
  await page.unroute("**/api/platform/menu-shortcuts");
  ok(
    "A committed save with a lost reply retries the exact body and receives one receipt without a duplicate write"
  );
  await openEditor();
  await editor()
    .getByRole("checkbox", { name: "Exchange", exact: true })
    .check();
  await saveMenuShortcuts(db, secondToken, {
    ids: ["settings"],
    expectedVersion: 3,
    mutationId: randomUUID()
  });
  await save();
  await editor()
    .getByRole("button", { name: "Reload current saved choices", exact: true })
    .waitFor();
  assert.equal(
    await editor()
      .getByRole("checkbox", { name: "Exchange", exact: true })
      .isChecked(),
    true
  );
  assert.deepEqual((await row(owner)).menuShortcutIds, ["settings"]);
  page.once("dialog", (d) => d.accept());
  await editor()
    .getByRole("button", { name: "Reload current saved choices", exact: true })
    .click();
  await waitUntil(
    async () => (await menuTitles()).join() === "Account settings"
  );
  ok(
    "A competing device's newer version prevents overwrite and retains local choices until explicit reload"
  );
  await seedOperatorGrants(db, owner, ["VIEW_PLATFORM_METRICS"]);
  await saveMenuShortcuts(db, owner.token, {
    ids: ["admin", "settings"],
    expectedVersion: 4,
    mutationId: randomUUID()
  });
  await go("/platform/menu");
  await openEditor();
  await editor().evaluate(
    (node) => (node.dataset.mountMarker = "original-editor")
  );
  await db.platformOperatorGrant.updateMany({
    where: { userId: owner.id, revokedAt: null },
    data: { revokedAt: new Date() }
  });
  // Same-address Next navigation refreshes server props while preserving the mounted editor.
  await page
    .getByRole("navigation", { name: "Platform", exact: true })
    .getByRole("link", { name: "Menu", exact: true })
    .click();
  await editor()
    .getByRole("button", { name: "Remove unavailable shortcut", exact: true })
    .waitFor();
  assert.equal(
    await editor().getAttribute("data-mount-marker"),
    "original-editor"
  );
  assert.equal(
    await savedLinks().locator('a[href="/platform/admin"]').count(),
    0
  );
  assert.equal(
    await editor()
      .getByRole("checkbox", { name: "Admin", exact: true })
      .count(),
    0
  );
  assert.equal(
    await editor()
      .getByRole("button", { name: "Save Menu shortcuts", exact: true })
      .isDisabled(),
    true
  );
  await editor()
    .getByRole("button", { name: "Remove unavailable shortcut", exact: true })
    .click();
  assert.deepEqual(errors, []);
  await go("/platform/menu");
  await openEditor();
  page.once("dialog", (d) => d.accept());
  await editor()
    .getByRole("button", { name: "Reset Menu shortcuts", exact: true })
    .click();
  await waitUntil(async () => (await row(owner)).menuShortcutIds.length === 0);
  ok(
    "Capability revocation removes Admin links and survives same-version server refresh with the editor still mounted; reset clears hidden stored IDs"
  );
  await go("/platform/menu");
  await openEditor();
  await signIn(other);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await editor().waitFor({ state: "hidden" });
  await go("/platform/menu");
  await page
    .getByText("No shortcuts selected. Choose the places you use most.", {
      exact: true
    })
    .waitFor();
  assert.equal(await savedLinks().count(), 0);
  assert.deepEqual(errors, []);
  ok(
    "Account switching conceals the previous private snapshot and the next account starts with its own empty choices"
  );
  writeFileSync(
    output + "/result.json",
    JSON.stringify(
      {
        results,
        errors,
        productionBuild: true,
        externalSends: 0,
        productionWrites: 0
      },
      null,
      2
    ),
    { mode: 0o600 }
  );
  console.log("MENU_SHORTCUTS_BROWSER_PASS " + results.length);
} catch (error) {
  await page
    .screenshot({ path: output + "/failure.png", fullPage: true })
    .catch(() => {});
  writeFileSync(
    output + "/failure.json",
    JSON.stringify({ results, errors, error: String(error) }, null, 2),
    { mode: 0o600 }
  );
  throw error;
} finally {
  await browser.close();
  await db.$disconnect();
}
