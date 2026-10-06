import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { sessionCookieFixtureName } from "./session-cookie-fixture.mjs";
const fixture = process.argv[2];
assert.ok(fixture);
const config = JSON.parse(readFileSync(fixture + "/browser-env.json", "utf8"));
assert.match(config.origin, /^https:\/\/127\.0\.0\.1:\d+$/);
assert.equal(new URL(config.database).hostname, "127.0.0.1");
Object.assign(process.env, {
  DATABASE_URL: config.database,
  DIRECT_URL: config.database,
  ACCOUNT_ORIGIN: config.origin,
  NEXT_PUBLIC_SITE_URL: config.origin,
  ACCOUNT_TEST_ISOLATED: "1",
  ACCOUNT_DELIVERY_MODE: "test-sink",
  ACCOUNT_TEST_SINK_DIR: process.cwd() + "/" + fixture + "/sink",
  NODE_ENV: "test",
  VERCEL: "",
  PRIVILEGED_MFA_MODE: "off"
});
const { PrismaClient } = await import("@prisma/client");
const { featuredFixture } =
  await import("../tests/profile-featured-fixture.ts");
const { getProfileEditor } = await import("../lib/platform/profiles.ts");
const db = new PrismaClient();
const f = await featuredFixture(db);
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
  }),
  page = await context.newPage();
page.setDefaultTimeout(20000);
const errors = [],
  external = [],
  results = [];
page.on("pageerror", (error) => errors.push(error.message));
await context.route("**/*", (route) => {
  if (new URL(route.request().url()).origin === config.origin)
    return route.continue();
  external.push(route.request().url());
  return route.abort();
});
const output = fixture + "/profile-featured-" + Date.now();
mkdirSync(output);
const ok = (message) => {
  results.push(message);
  console.log("PASS " + message);
};
const signIn = async (actor) => {
  await page.goto("about:blank");
  await context.clearCookies();
  if (actor)
    await context.addCookies([
      {
        name: sessionCookieFixtureName(config.origin),
        value: actor.token,
        url: config.origin,
        secure: true,
        httpOnly: true,
        sameSite: "Lax"
      }
    ]);
};
const go = async (path) => {
  assert.equal((await page.goto(config.origin + path)).status(), 200);
  await page.bringToFront();
};
const picker = () =>
  page.getByRole("group", {
    name: "Featured resources (optional)",
    exact: true
  });
const reader = () => page.locator('[data-profile-featured="reader"]');
const waitFor = async (work) => {
  for (let i = 0; i < 100; i++) {
    if (await work()) return;
    await page.waitForTimeout(100);
  }
  assert.fail("Timed out waiting for current resource state");
};
const nativeOtherWindow = async () => {
  const cdp = await browser.newBrowserCDPSession();
  const pageCdp = await context.newCDPSession(page);
  await pageCdp.send("Emulation.setFocusEmulationEnabled", { enabled: false });
  await page.bringToFront();
  await page.waitForFunction(() => document.hasFocus());
  const { targetInfo } = await pageCdp.send("Target.getTargetInfo");
  const created = context.waitForEvent("page");
  await cdp.send("Target.createTarget", {
    url: "about:blank",
    browserContextId: targetInfo.browserContextId,
    newWindow: true,
    background: false
  });
  const other = await created;
  const otherCdp = await context.newCDPSession(other);
  await otherCdp.send("Emulation.setFocusEmulationEnabled", { enabled: false });
  await other.bringToFront();
  await page.waitForFunction(() => !document.hasFocus());
  assert.equal(await other.evaluate(() => document.hasFocus()), true);
  return other;
};
try {
  await signIn(f.owner);
  await go("/platform/profile/me");
  await picker().waitFor();
  await picker().scrollIntoViewIfNeeded();
  for (const href of [
    `/platform/exchange/${f.listing.id}`,
    `/platform/serve/${f.opportunity.id}`,
    `/platform/media/${f.media.id}`
  ]) {
    await page
      .getByLabel("Existing resource page link", { exact: true })
      .fill(config.origin + href);
    await page
      .getByRole("button", { name: "Check and add resource", exact: true })
      .click();
    await waitFor(() =>
      page
        .getByRole("status")
        .filter({ hasText: "Resource selected. Save profile" })
        .isVisible()
    );
  }
  assert.equal(
    (await getProfileEditor(db, f.owner.token)).presentation.modules
      .featuredResources,
    undefined
  );
  await page
    .getByRole("button", { name: "Move featured resource 3 up", exact: true })
    .focus();
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "Save profile", exact: true }).click();
  await page.waitForURL("**/platform/profile/" + f.owner.username);
  await reader().scrollIntoViewIfNeeded();
  await reader()
    .getByRole("link", { name: f.media.title, exact: true })
    .waitFor();
  assert.deepEqual(
    (await getProfileEditor(db, f.owner.token)).presentation.modules
      .featuredResources,
    [f.references[0], f.references[2], f.references[1]]
  );
  ok(
    "Actual editor checks, adds and keyboard-reorders all three kinds, saves once and displays a featured-only profile"
  );
  await go("/platform/profile/me");
  await picker().waitFor();
  await page
    .getByRole("button", { name: "Move featured resource 3 up", exact: true })
    .click();
  const priorVersion = (await getProfileEditor(db, f.owner.token)).presentation
    .version;
  const savedBodies = [];
  const loseReply = async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    savedBodies.push(route.request().postData());
    const response = await route.fetch();
    if (savedBodies.length === 1) return route.abort("failed");
    return route.fulfill({ response });
  };
  await page.route("**/api/platform/account", loseReply);
  await page.getByRole("button", { name: "Save profile", exact: true }).click();
  await page
    .getByRole("button", { name: "Retry original save", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Review latest saved profile", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Latest saved version", exact: true })
    .waitFor();
  assert.equal(savedBodies.length, 2);
  assert.equal(savedBodies[0], savedBodies[1]);
  assert.equal(
    (await getProfileEditor(db, f.owner.token)).presentation.version,
    priorVersion + 1
  );
  await page.unroute("**/api/platform/account", loseReply);
  await page
    .getByRole("button", {
      name: "Keep my edits and use this version",
      exact: true
    })
    .click();
  await page
    .getByRole("button", { name: "Move featured resource 3 up", exact: true })
    .click();
  await page.getByRole("button", { name: "Save profile", exact: true }).click();
  await page.waitForURL("**/platform/profile/" + f.owner.username);
  assert.deepEqual(
    (await getProfileEditor(db, f.owner.token)).presentation.modules
      .featuredResources,
    [f.references[0], f.references[2], f.references[1]]
  );
  ok(
    "Committed-but-lost collection save retains identical retry bytes, avoids a second commit and requires explicit version review"
  );
  await signIn(f.outsider);
  await go("/platform/profile/" + f.owner.username);
  await reader().scrollIntoViewIfNeeded();
  await reader()
    .getByRole("link", { name: f.listing.title, exact: true })
    .waitFor();
  assert.equal(
    await reader()
      .getByRole("link", { name: f.opportunity.title, exact: true })
      .count(),
    0
  );
  await signIn(f.owner);
  await go("/platform/profile/" + f.owner.username + "?preview=member");
  await reader().scrollIntoViewIfNeeded();
  await reader()
    .getByRole("link", { name: f.listing.title, exact: true })
    .waitFor();
  assert.equal(
    await reader()
      .getByRole("link", { name: f.opportunity.title, exact: true })
      .count(),
    0
  );
  ok(
    "Different-member and generic member preview omit inaccessible church resource titles and links"
  );
  await signIn(f.member);
  await go("/platform/profile/" + f.owner.username);
  await reader().scrollIntoViewIfNeeded();
  await reader()
    .getByRole("link", { name: f.opportunity.title, exact: true })
    .waitFor();
  await db.mediaCatalogItem.update({
    where: { id: f.media.id },
    data: { state: "DRAFT" }
  });
  // The interval runs in real browser time; active revocation must not depend on navigation.
  await waitFor(async () => {
    await page.waitForTimeout(350);
    return (
      (await reader()
        .getByRole("link", { name: f.media.title, exact: true })
        .count()) === 0
    );
  });
  assert.equal(
    await reader()
      .getByRole("link", { name: f.listing.title, exact: true })
      .count(),
    1
  );
  ok(
    "Focused profile removes withdrawn media on its bounded current-access refresh"
  );
  const other = await nativeOtherWindow();
  await waitFor(
    async () =>
      !(await reader()
        .getByRole("link", { name: f.listing.title, exact: true })
        .count())
  );
  await page.bringToFront();
  await reader()
    .getByRole("link", { name: f.listing.title, exact: true })
    .waitFor();
  await other.close();
  await context.setOffline(true);
  await waitFor(
    async () =>
      !(await reader()
        .getByRole("link", { name: f.listing.title, exact: true })
        .count())
  );
  await context.setOffline(false);
  await reader()
    .getByRole("link", { name: f.listing.title, exact: true })
    .waitFor();
  ok(
    "Native foreground loss and offline conceal cards; restoring current access fetches them afresh"
  );
  await signIn(f.owner);
  await go("/platform/profile/me");
  await picker().waitFor();
  await picker().scrollIntoViewIfNeeded();
  await page
    .getByLabel("Existing resource page link", { exact: true })
    .fill("/platform/media/unfinished-draft");
  const other2 = await nativeOtherWindow();
  await page.bringToFront();
  await picker().waitFor();
  assert.equal(
    await page
      .getByLabel("Existing resource page link", { exact: true })
      .inputValue(),
    "/platform/media/unfinished-draft"
  );
  assert.equal(
    await picker()
      .getByRole("button", { name: /Remove featured resource/ })
      .count(),
    3
  );
  await other2.close();
  await page
    .getByRole("button", { name: "Remove featured resource 2", exact: true })
    .click();
  await page.getByRole("button", { name: "Save profile", exact: true }).click();
  await page.waitForURL("**/platform/profile/" + f.owner.username);
  assert.deepEqual(
    (await getProfileEditor(db, f.owner.token)).presentation.modules
      .featuredResources,
    [f.references[0], f.references[1]]
  );
  ok(
    "Concealment preserves the unsent link and selected references; withdrawn selection can be removed and saved"
  );
  await go("/platform/profile/me");
  await picker().waitFor();
  await picker().scrollIntoViewIfNeeded();
  await page.setViewportSize({ width: 320, height: 740 });
  await page.addStyleTag({ content: "html{font-size:32px !important}" });
  await picker().scrollIntoViewIfNeeded();
  const dimensions = await page.evaluate(() => ({
    width: innerWidth,
    scroll: document.documentElement.scrollWidth
  }));
  assert.ok(dimensions.scroll <= dimensions.width, JSON.stringify(dimensions));
  await page.screenshot({
    path: output + "/editor-320-enlarged.png",
    fullPage: true
  });
  ok("Featured controls fit a 320-pixel enlarged-text viewport");
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
  writeFileSync(
    output + "/PASS.json",
    JSON.stringify(
      {
        results,
        errors,
        external,
        source: execFileSync("git", ["rev-parse", "HEAD"], {
          encoding: "utf8"
        }).trim(),
        buildId: readFileSync(".next/BUILD_ID", "utf8").trim()
      },
      null,
      2
    )
  );
} catch (error) {
  writeFileSync(
    output + "/FAILED.json",
    JSON.stringify(
      {
        results,
        errors,
        external,
        message: String(error),
        focus: await page
          .evaluate(() => ({
            focused: document.hasFocus(),
            visibility: document.visibilityState,
            online: navigator.onLine
          }))
          .catch(() => null)
      },
      null,
      2
    )
  );
  await page
    .screenshot({ path: output + "/failed.png", fullPage: true })
    .catch(() => {});
  throw error;
} finally {
  await context.close();
  await browser.close();
  await db.$disconnect();
}
