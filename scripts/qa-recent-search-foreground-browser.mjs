import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { sessionCookieFixtureName } from "./session-cookie-fixture.mjs";

// Run from the isolated production-build project, after its localhost HTTPS
// server is ready. This script neither builds nor starts/stops that server.
// node --import ./tests/register.mjs scripts/qa-recent-search-foreground-browser.mjs <fixture-directory>
const fixtureArgument = process.argv[2];
assert.ok(fixtureArgument, "Pass the isolated HTTPS fixture directory");
const fixture = resolve(fixtureArgument);
const config = JSON.parse(
  readFileSync(join(fixture, "browser-env.json"), "utf8")
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
  ACCOUNT_TEST_SINK_DIR: join(fixture, "sink"),
  NODE_ENV: "test",
  VERCEL: ""
});
const { PrismaClient } = await import("@prisma/client");
const { assertPortalTestDatabase, createPortalActor } =
  await import("../tests/seed-portal.ts");
const db = new PrismaClient();
await assertPortalTestDatabase(db);
const output = join(
  fixture,
  `recent-search-foreground-${Date.now()}-${randomUUID().slice(0, 8)}`
);
mkdirSync(output);
const evidence = {
  origin: config.origin,
  scriptSha256: createHash("sha256")
    .update(readFileSync(new URL(import.meta.url)))
    .digest("hex"),
  buildId: readFileSync(join(process.cwd(), ".next/BUILD_ID"), "utf8").trim(),
  scope:
    "Actual production HTTPS application and identity payloads; one fictional account. Native focus changes between two same-context Chrome windows. A second-window localStorage whitespace rewrite triggers a real storage event without injecting a search. Any resulting real identity response is delayed and then forwarded unchanged.",
  observations: [],
  identityRequests: [],
  browserErrors: [],
  blockedRequests: [],
  checks: [],
  passed: false
};
const save = () =>
  writeFileSync(
    join(output, "result.json"),
    JSON.stringify(evidence, null, 2) + "\n"
  );
save();
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
let browser;
let releaseIdentity = () => {};
try {
  const actor = await createPortalActor(db, "histfocus");
  const key = `godschurches:recent-searches:v1:${encodeURIComponent(actor.id)}`;
  const marker = `Foreground ${randomUUID().slice(0, 8)}`;
  browser = await chromium.launch({
    headless: process.env.RECENT_FOREGROUND_HEADED !== "1",
    executablePath:
      process.env.CHROMIUM_PATH ??
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    args: [
      "--ignore-certificate-errors-spki-list=" +
        createHash("sha256").update(der).digest("base64")
    ]
  });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    timezoneId: "America/Chicago"
  });
  await context.route("**/*", (route) => {
    if (new URL(route.request().url()).origin === config.origin)
      return route.continue();
    evidence.blockedRequests.push(route.request().url());
    return route.abort();
  });
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
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  page.on("pageerror", (error) => evidence.browserErrors.push(error.message));
  const response = await page.goto(
    config.origin + "/platform/search?kind=posts"
  );
  assert.equal(response.status(), 200);
  await page.bringToFront();
  await page.waitForFunction(() => document.hasFocus());
  const history = page.getByRole("region", { name: "Recent searches" });
  const entry = () =>
    history.getByRole("link", { name: `${marker} (posts)`, exact: true });
  const toggle = history.getByRole("checkbox", {
    name: "Remember my searches in this browser"
  });
  await toggle.waitFor();
  assert.equal(await toggle.isChecked(), false);
  // Preference commits after the real current-identity read.
  await toggle.click();
  await page.waitForFunction(
    (key) => JSON.parse(localStorage.getItem(key) ?? "null")?.enabled === true,
    key
  );
  await page.getByLabel("Search the community", { exact: true }).fill(marker);
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await page.waitForURL(
    (url) =>
      url.pathname === "/platform/search" &&
      url.searchParams.get("q") === marker
  );
  await entry().waitFor();
  await page.waitForFunction(
    ({ key, marker }) => {
      const state = JSON.parse(localStorage.getItem(key) ?? "null");
      return (
        state?.enabled &&
        state.items.length === 1 &&
        state.items[0].q === marker &&
        state.items[0].kind === "posts"
      );
    },
    { key, marker }
  );
  evidence.checks.push(
    "The actual opt-in control and explicit form submission stored one query"
  );

  // The observer records browser facts; it does not replace focus, visibility,
  // identity, storage APIs or application payloads.
  await page.evaluate((key) => {
    window.__recentForegroundProbe = { blurEvents: 0, storageEvents: 0 };
    window.addEventListener("blur", (event) => {
      if (event.isTrusted) window.__recentForegroundProbe.blurEvents++;
    });
    window.addEventListener("storage", (event) => {
      if (event.key === key) window.__recentForegroundProbe.storageEvents++;
    });
  }, key);
  const observe = async (phase) => {
    const observed = {
      phase,
      at: new Date().toISOString(),
      ...(await page.evaluate(
        (key) => ({
          focused: document.hasFocus(),
          visibility: document.visibilityState,
          online: navigator.onLine,
          storageItems:
            JSON.parse(localStorage.getItem(key) ?? "null")?.items.length ??
            null,
          ...window.__recentForegroundProbe
        }),
        key
      )),
      historyVisible: await entry()
        .isVisible()
        .catch(() => false)
    };
    evidence.observations.push(observed);
    save();
    console.log(JSON.stringify(observed));
    return observed;
  };
  await observe("recorded-in-focused-window");

  const cdp = await browser.newBrowserCDPSession();
  const pageCdp = await context.newCDPSession(page);
  // Disable Playwright's forced focus so native browser facts drive this check.
  await pageCdp.send("Emulation.setFocusEmulationEnabled", { enabled: false });
  await page.bringToFront();
  await page.waitForFunction(() => document.hasFocus());
  const { targetInfo } = await pageCdp.send("Target.getTargetInfo");
  assert.ok(
    targetInfo.browserContextId,
    "The second window must share this fictional browser context"
  );
  const created = context.waitForEvent("page");
  const target = await cdp.send("Target.createTarget", {
    url: config.origin + "/platform/search?kind=posts",
    browserContextId: targetInfo.browserContextId,
    newWindow: true,
    background: false
  });
  const other = await created;
  other.setDefaultTimeout(20000);
  other.on("pageerror", (error) => evidence.browserErrors.push(error.message));
  await other.waitForLoadState("domcontentloaded");
  // Keep both headed windows unoccluded where Chrome supports native bounds.
  // Assertions below require real unfocused+visible state regardless of mode.
  try {
    for (const [targetId, left] of [
      [targetInfo.targetId, 10],
      [target.targetId, 540]
    ]) {
      const { windowId } = await cdp.send("Browser.getWindowForTarget", {
        targetId
      });
      await cdp.send("Browser.setWindowBounds", {
        windowId,
        bounds: {
          left,
          top: 20,
          width: 510,
          height: 890,
          windowState: "normal"
        }
      });
    }
  } catch (error) {
    evidence.windowPositionNote = String(error.message);
  }
  const otherCdp = await context.newCDPSession(other);
  await otherCdp.send("Emulation.setFocusEmulationEnabled", { enabled: false });
  await other.bringToFront();
  try {
    await page.waitForFunction(
      () =>
        !document.hasFocus() &&
        document.visibilityState === "visible" &&
        window.__recentForegroundProbe.blurEvents > 0,
      undefined,
      { timeout: 5000 }
    );
  } catch {
    await observe("native-background-state-unavailable");
    throw Error(
      "Probe setup could not establish a visible, genuinely unfocused first window. Retry with RECENT_FOREGROUND_HEADED=1; this is not a privacy regression result."
    );
  }
  await entry().waitFor({ state: "hidden" });
  const concealed = await observe("after-native-blur");
  assert.equal(concealed.historyVisible, false);
  assert.equal(concealed.storageItems, 1);

  let hold = true;
  let identityStarted;
  const started = new Promise((resolve) => {
    identityStarted = resolve;
  });
  const gate = new Promise((resolve) => {
    releaseIdentity = resolve;
  });
  const held = [];
  await page.route("**/api/platform/profile?view=identity", async (route) => {
    if (!hold) return route.continue();
    const request = {
      startedAt: new Date().toISOString(),
      status: null,
      released: false
    };
    evidence.identityRequests.push(request);
    let finished;
    held.push(
      new Promise((resolve) => {
        finished = resolve;
      })
    );
    identityStarted();
    try {
      const actual = await route.fetch({ timeout: 15000, maxRedirects: 0 });
      request.status = actual.status();
      await gate;
      await route.fulfill({ response: actual });
      request.released = true;
    } catch (error) {
      request.error = String(error.message);
      await route.abort().catch(() => {});
    } finally {
      finished();
    }
  });
  await other.evaluate((key) => {
    const raw = localStorage.getItem(key);
    if (!raw)
      throw Error("The actual submitted recent-search record is missing");
    // JSON whitespace changes storage bytes and emits a native cross-window
    // StorageEvent while preserving every stored query, timestamp and setting.
    localStorage.setItem(key, raw.endsWith(" ") ? raw.trimEnd() : raw + " ");
  }, key);
  await page.waitForFunction(
    () => window.__recentForegroundProbe.storageEvents > 0
  );
  await Promise.race([
    started,
    new Promise((resolve) => setTimeout(resolve, 1500))
  ]);
  await observe("background-storage-event-before-identity-release");
  hold = false;
  releaseIdentity();
  await Promise.all(held);
  // The unchanged real response has reached the hook. Let its React state
  // update render while this first window remains visibly in the background.
  await page.waitForTimeout(300);
  const background = await observe(
    "background-storage-event-after-identity-release"
  );
  // Preserve observed facts before the regression assertion. On the baseline,
  // continue through focus/clear so their separate behavior is also recorded.
  await page.screenshot({
    path: join(output, "background-after-storage.png"),
    fullPage: true
  });
  await page.bringToFront();
  await page.waitForFunction(() => document.hasFocus());
  await entry().waitFor();
  await observe("deliberate-focus-restores-history");
  evidence.checks.push(
    "Deliberate native focus restores the original stored query"
  );
  await history
    .getByRole("button", { name: "Clear all recent searches", exact: true })
    .click();
  await page.waitForFunction(
    (key) =>
      JSON.parse(localStorage.getItem(key) ?? "null")?.items.length === 0,
    key
  );
  await entry().waitFor({ state: "hidden" });
  const cleared = await observe("explicit-clear");
  assert.equal(cleared.historyVisible, false);
  assert.equal(cleared.storageItems, 0);
  evidence.checks.push("The actual clear action removes the submitted query");
  save();

  assert.equal(
    background.focused,
    false,
    "Background evidence requires actual focus loss"
  );
  assert.equal(
    background.visibility,
    "visible",
    "This probes the unfocused-window path, not hidden-tab handling"
  );
  assert.equal(
    background.historyVisible,
    false,
    "A storage refresh must not reveal recent queries in an unfocused window"
  );
  assert.ok(
    evidence.identityRequests.every(
      (request) => request.status === 200 && request.released && !request.error
    ),
    "Any intercepted identity must be a successfully forwarded real HTTPS response"
  );
  assert.deepEqual(evidence.browserErrors, []);
  assert.deepEqual(evidence.blockedRequests, []);
  evidence.checks.push(
    "Background storage refresh leaves recent queries concealed"
  );
  evidence.passed = true;
  save();
  console.log("PASS " + output);
} catch (error) {
  evidence.error = String(error.stack ?? error);
  save();
  console.error("FAIL " + output);
  throw error;
} finally {
  releaseIdentity();
  await browser?.close();
  await db.$disconnect();
}
