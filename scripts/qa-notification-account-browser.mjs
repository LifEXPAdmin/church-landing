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
  hasTouch: true,
  viewport: { width: 390, height: 844 }
});
const page = await context.newPage();
let phase = "initial";
const errors = [];
page.on("pageerror", (e) => {
  const issue = {
    phase,
    path: new URL(page.url()).pathname,
    message: e.message,
    stack: e.stack
  };
  errors.push(issue);
  console.log("BROWSER_ERROR", JSON.stringify(issue));
});
const results = [];
const ok = (s) => {
  results.push(s);
  console.log("PASS " + s);
};
const output = fixtureDir + "/notification-account-browser-" + Date.now();
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
const { randomUUID } = await import("node:crypto");
const signIn = (actor) =>
  context.addCookies([
    {
      name: "church_platform_session",
      value: actor.token,
      url: config.origin,
      secure: true,
      httpOnly: true,
      sameSite: "Lax"
    }
  ]);

page.setDefaultTimeout(20000);
const { createPortalActor: createActor } =
  await import("../tests/seed-portal.ts");
const { createECDH, randomBytes } = await import("node:crypto");
const key = createECDH("prime256v1");
key.generateKeys();
const fakeSubscription = {
  endpoint: "https://fcm.googleapis.com/fcm/send/fixture-" + randomUUID(),
  keys: {
    p256dh: key.getPublicKey().toString("base64url"),
    auth: randomBytes(16).toString("base64url")
  }
};
// Synthetic browser capability only: all application API/database behavior is real
// and isolated. No test registers with or sends to a real push provider.
await context.addInitScript((sub) => {
  window.__permissionRequests = Number(
    sessionStorage.getItem("fixture.permissionRequests") || "0"
  );
  Object.defineProperty(window, "Notification", {
    configurable: true,
    value: class {
      static get permission() {
        return sessionStorage.getItem("fixture.permission") || "default";
      }
      static async requestPermission() {
        window.__permissionRequests++;
        sessionStorage.setItem(
          "fixture.permissionRequests",
          String(window.__permissionRequests)
        );
        sessionStorage.setItem("fixture.permission", "granted");
        return "granted";
      }
    }
  });
  Object.defineProperty(window, "PushManager", {
    configurable: true,
    value: class {}
  });
  const subscription = {
    options: {},
    toJSON: () => sub,
    unsubscribe: async () => {
      sessionStorage.removeItem("fixture.subscription");
      return true;
    }
  };
  const registration = {
    active: { scriptURL: location.origin + "/notification-worker.js" },
    getNotifications: async () => [],
    pushManager: {
      getSubscription: async () =>
        sessionStorage.getItem("fixture.subscription") ? subscription : null,
      subscribe: async () => {
        sessionStorage.setItem("fixture.subscription", "yes");
        return subscription;
      }
    }
  };
  const sw = Object.assign(new EventTarget(), {
    ready: Promise.resolve(registration),
    register: async () => registration,
    getRegistration: async () => registration
  });
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: sw
  });
}, fakeSubscription);
await context.addInitScript(() => {
  window.__notificationOwnerWrites = [];
  const set = Storage.prototype.setItem;
  Storage.prototype.setItem = function (key, value) {
    if (key === "gc.push-device.v1")
      window.__notificationOwnerWrites.push(JSON.parse(value).owner);
    return set.call(this, key, value);
  };
});
let release;
try {
  const a = await createActor(db, "notifypendinga"),
    b = await createActor(db, "notifypendingb");
  await signIn(a);
  await go("/platform/settings/notifications/availability");
  const group = () =>
    page.getByRole("group", {
      name: "Likes on your posts and comments",
      exact: true
    });
  await group()
    .getByRole("checkbox", { name: "In-app alerts", exact: true })
    .uncheck();
  const accepted = Promise.withResolvers(),
    finished = Promise.withResolvers();
  const held = new Promise((resolve) => (release = resolve));
  await page.route("**/api/platform/notifications", async (route) => {
    const body = route.request().postData();
    if (!body || JSON.parse(body).operation !== "preferences")
      return route.continue();
    const response = await route.fetch();
    assert.equal(response.status(), 200);
    accepted.resolve();
    await held;
    await route.fulfill({ response });
    finished.resolve();
  });
  await page
    .getByRole("button", { name: "Save notification choices", exact: true })
    .click();
  await accepted.promise;
  assert.ok(
    (
      await db.socialPreferences.findUniqueOrThrow({ where: { ownerId: a.id } })
    ).mutedNotificationCategories.includes("reactions")
  );
  await signIn(b);
  // The common account boundary observes a changed session independently of the pending form.
  await page.evaluate(() => {
    window.dispatchEvent(new Event("blur"));
    window.dispatchEvent(new Event("focus"));
  });
  await page
    .getByRole("button", { name: "Save notification choices", exact: true })
    .waitFor({ state: "hidden" });
  release();
  await finished.promise;
  await page.unroute("**/api/platform/notifications");
  await go("/platform/settings/notifications/availability");
  await group()
    .getByRole("checkbox", { name: "In-app alerts", exact: true })
    .waitFor();
  assert.equal(
    await group()
      .getByRole("checkbox", { name: "In-app alerts", exact: true })
      .isChecked(),
    true
  );
  assert.equal(
    await db.socialPreferences.count({ where: { ownerId: b.id } }),
    0
  );
  assert.equal(
    await page
      .getByRole("button", {
        name: "Retry last notification action",
        exact: true
      })
      .count(),
    0
  );
  ok(
    "An account switch conceals a pending notification form; the old acknowledgement cannot restore old choices or alter the new account"
  );

  phase = "pending-device-account-switch";
  const enable = page.getByRole("button", {
    name: "Enable notifications",
    exact: true
  });
  await enable.waitFor();
  const deviceAccepted = Promise.withResolvers(),
    deviceFinished = Promise.withResolvers();
  const deviceHeld = new Promise((resolve) => (release = resolve));
  await page.route("**/api/platform/notifications", async (route) => {
    const body = route.request().postData();
    if (!body || JSON.parse(body).operation !== "subscribe")
      return route.continue();
    const response = await route.fetch();
    assert.equal(response.status(), 200);
    deviceAccepted.resolve();
    await deviceHeld;
    await route.fulfill({ response });
    deviceFinished.resolve();
  });
  await enable.click();
  await deviceAccepted.promise;
  const action = await page
    .locator("form")
    .filter({ has: page.getByRole("button", { name: "Log out", exact: true }) })
    .locator('input[name^="$ACTION_ID_"]')
    .getAttribute("name");
  assert.ok(action);
  const logout = await context.request.post(
    config.origin + "/platform/settings",
    {
      headers: { Origin: config.origin },
      multipart: { [action]: "" },
      maxRedirects: 0
    }
  );
  assert.equal(logout.status(), 303);
  await signIn(a);
  await page.evaluate(() => {
    window.dispatchEvent(new Event("blur"));
    window.dispatchEvent(new Event("focus"));
  });
  await enable.waitFor({ state: "hidden" });
  await page.evaluate(() => {
    window.__notificationOwnerWrites = [];
  });
  const replyFinished = page.waitForEvent("requestfinished", {
    predicate: (request) =>
      request.method() === "POST" &&
      request.url().endsWith("/api/platform/notifications") &&
      JSON.parse(request.postData() || "{}").operation === "subscribe"
  });
  release();
  await deviceFinished.promise;
  await replyFinished;
  assert.deepEqual(
    await page.evaluate(() => window.__notificationOwnerWrites),
    []
  );
  await page.unroute("**/api/platform/notifications");
  await go("/platform/settings/notifications/availability");
  await page
    .getByRole("button", { name: "Save notification choices", exact: true })
    .waitFor();
  assert.equal(
    await page.evaluate(() => localStorage.getItem("gc.push-device.v1")),
    null
  );
  assert.equal(
    await db.pushSubscription.count({
      where: { ownerId: b.id, revokedAt: null }
    }),
    0
  );
  assert.ok(
    (
      await db.socialPreferences.findUniqueOrThrow({ where: { ownerId: a.id } })
    ).mutedNotificationCategories.includes("reactions")
  );
  ok(
    "A delayed device acceptance after real logout cannot restore the retired browser association or an active server subscription"
  );
  assert.deepEqual(errors, []);
} finally {
  release?.();
  await page
    .screenshot({ path: output + "/last-page.png", fullPage: true })
    .catch(() => {});
  writeFileSync(output + "/result.json", JSON.stringify({ results, errors }), {
    mode: 0o600
  });
  await browser.close();
  await db.$disconnect();
}
