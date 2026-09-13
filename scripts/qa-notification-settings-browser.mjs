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
page.on("response", async (response) => {
  if (
    response.url().endsWith("/api/platform/notifications") &&
    response.request().method() === "POST"
  ) {
    const body = await response.json().catch(() => ({}));
    console.log("NOTIFICATION_RESULT", response.status(), body.message);
  }
});
const results = [];
const ok = (s) => {
  results.push(s);
  console.log("PASS " + s);
};
const output = fixtureDir + "/notification-settings-browser";
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
try {
  const actor = await createPortalActor(db, "pushui");
  await signIn(actor);
  await go("/platform/settings/notifications/availability");
  const enable = page.getByRole("button", {
    name: "Enable notifications",
    exact: true
  });
  await enable.waitFor({ state: "visible" });
  await page.waitForFunction(
    () =>
      ![...document.querySelectorAll("button")].find(
        (b) => b.textContent === "Enable notifications"
      )?.disabled
  );
  assert.equal(await page.evaluate(() => window.__permissionRequests), 0);
  assert.equal(
    await db.pushSubscription.count({ where: { ownerId: actor.id } }),
    0
  );
  ok("Settings loads without asking permission or creating a device");

  await page
    .getByRole("checkbox", { name: "Pause phone alerts during quiet hours" })
    .check();
  await page.getByLabel("Time zone", { exact: true }).fill("America/Chicago");
  await page
    .getByText(/22:00 to 07:00 the next day in America\/Chicago/)
    .waitFor();
  await page
    .getByRole("button", { name: "Save notification choices", exact: true })
    .click();
  await page.getByText(/Your notification choices are saved/).waitFor();
  assert.equal(
    (
      await db.socialPreferences.findUniqueOrThrow({
        where: { ownerId: actor.id }
      })
    ).quietStart,
    1320
  );
  ok(
    "Overnight quiet-hour interpretation is visible before saving and persists through the real API"
  );

  await page
    .getByRole("checkbox", { name: "Pause phone alerts during quiet hours" })
    .uncheck();
  let lost = false;
  const bodies = [];
  await page.route("**/api/platform/notifications", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    const body = route.request().postData();
    if (JSON.parse(body).operation !== "preferences") return route.continue();
    bodies.push(body);
    const response = await route.fetch();
    if (!lost) {
      lost = true;
      return route.abort("failed");
    }
    return route.fulfill({ response });
  });
  await page
    .getByRole("button", { name: "Save notification choices", exact: true })
    .click();
  await page
    .getByRole("button", {
      name: "Retry last notification action",
      exact: true
    })
    .click();
  await page.getByText(/Your notification choices are saved/).waitFor();
  assert.equal(bodies.length, 2);
  assert.equal(bodies[0], bodies[1]);
  await page.unroute("**/api/platform/notifications");
  ok(
    "A lost save acknowledgement retries the exact body and mutation identity"
  );

  const personal = page.getByRole("group", {
    name: "Personal messages and replies",
    exact: true
  });
  await personal
    .getByRole("checkbox", { name: "In-app alerts", exact: true })
    .uncheck();
  await db.socialPreferences.update({
    where: { ownerId: actor.id },
    data: { version: { increment: 1 }, founderAnnouncements: false }
  });
  await page
    .getByRole("button", { name: "Save notification choices", exact: true })
    .click();
  await page
    .getByText(
      "These choices changed elsewhere. Your selections are preserved.",
      { exact: true }
    )
    .waitFor();
  assert.equal(
    await personal
      .getByRole("checkbox", { name: "In-app alerts", exact: true })
      .isChecked(),
    false
  );
  await page
    .getByRole("button", {
      name: "Discard unsaved notification choices",
      exact: true
    })
    .click();
  await page.waitForFunction(
    () =>
      [...document.querySelectorAll("button")].find(
        (b) => b.textContent === "Save notification choices"
      )?.disabled
  );
  assert.equal(
    await page
      .getByRole("checkbox", {
        name: "Receive founder announcements",
        exact: true
      })
      .isChecked(),
    false
  );
  ok(
    "Conflicts keep unsaved choices and discard reads the current founder opt-out"
  );

  await enable.click();
  await page
    .getByRole("button", { name: "Renew this device", exact: true })
    .waitFor();
  assert.equal(await page.evaluate(() => window.__permissionRequests), 1);
  let device = await db.pushSubscription.findFirstOrThrow({
    where: { ownerId: actor.id, revokedAt: null }
  });
  const preferences = await db.socialPreferences.findUniqueOrThrow({
    where: { ownerId: actor.id }
  });
  assert.deepEqual(preferences.pushCategories.sort(), ["messages", "requests"]);
  assert.equal(preferences.founderAnnouncements, false);
  for (const name of [
    "Replies to your posts and comments",
    "Mentions in comments"
  ]) {
    const group = page.getByRole("group", { name, exact: true });
    const phone = group.getByRole("checkbox", {
      name: "Phone alerts",
      exact: true
    });
    assert.equal(await phone.isChecked(), false);
    assert.equal(
      await group
        .getByRole("checkbox", { name: "In-app alerts", exact: true })
        .count(),
      0
    );
    await phone.check();
  }
  await page
    .getByRole("button", { name: "Save notification choices", exact: true })
    .click();
  await page.getByText(/Your notification choices are saved/).waitFor();
  assert.deepEqual(
    (
      await db.socialPreferences.findUniqueOrThrow({
        where: { ownerId: actor.id }
      })
    ).pushCategories.sort(),
    ["mentions", "messages", "replies", "requests"]
  );
  const commenter = await createPortalActor(db, "commentpushui");
  const post = await db.platformPost.create({
    data: { authorId: actor.id, content: "Fictional phone comment destination" }
  });
  const commentResponse = await context.request.post(
    config.origin + "/api/platform/comments",
    {
      headers: {
        Origin: config.origin,
        Cookie: "church_platform_session=" + commenter.token
      },
      data: {
        operation: "create",
        mutationId: randomUUID(),
        postId: post.id,
        content: "Fictional exact notification reply",
        mentionIds: [actor.id]
      }
    }
  );
  assert.equal(commentResponse.status(), 200);
  const commentReceipt = await commentResponse.json();
  const commentAlerts = await db.notificationDelivery.findMany({
    where: { event: { commentId: commentReceipt.id }, ownerId: actor.id }
  });
  assert.equal(commentAlerts.length, 1);
  await go("/platform/notifications/" + commentAlerts[0].id);
  await page
    .getByText("Fictional exact notification reply", { exact: true })
    .waitFor();
  assert.equal(new URL(page.url()).pathname, "/platform/posts/" + post.id);
  assert.equal(
    new URL(page.url()).searchParams.get("comment"),
    commentReceipt.id
  );
  await bounded();
  await go("/platform/settings/notifications/availability");
  ok(
    "Reply/mention opt-ins persist and one real comment API intent opens the exact authorized comment on a narrow screen"
  );
  await page
    .getByRole("button", { name: "Send me a test notification", exact: true })
    .click();
  await page.getByText(/Test notification queued for this device/).waitFor();
  assert.equal(
    await db.socialEvent.count({
      where: { recipientId: actor.id, kind: "PUSH_TEST" }
    }),
    1
  );
  await page
    .getByRole("button", { name: "Check test delivery status", exact: true })
    .click();
  await page
    .getByText(/Queued for delivery; quiet hours still apply/)
    .waitFor();
  ok(
    "Explicit enable associates one device and preserves founder opt-out; recipient test remains honestly queued without a provider send"
  );

  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(
      () => (document.documentElement.style.fontSize = "32px")
    );
    await bounded();
    await page.screenshot({
      path: output + "/notifications-" + width + ".png",
      fullPage: true
    });
    await page.evaluate(() => (document.documentElement.style.fontSize = ""));
  }
  ok("Notification controls fit 320/390/1440-pixel layouts with enlarged text");

  await page.evaluate(() => {
    sessionStorage.setItem("fixture.permission", "denied");
    dispatchEvent(new Event("focus"));
  });
  await page.waitForFunction(
    () => localStorage.getItem("gc.push-device.v1") === null
  );
  device = await db.pushSubscription.findUniqueOrThrow({
    where: { id: device.id }
  });
  assert.ok(device.revokedAt);
  assert.equal(device.endpoint, null);
  assert.equal(device.auth, null);
  assert.equal(await page.evaluate(() => window.__permissionRequests), 1);
  ok(
    "Observed browser permission revocation removes server keys and never asks permission again"
  );
  await go("/platform");
  await page.getByRole("button", { name: "Share a post", exact: true }).click();
  const composer = page.getByRole("form", {
    name: "Publish post",
    exact: true
  });
  const content = composer.getByLabel("Post content", { exact: true });
  await content.fill(
    "Keep this private draft when a phone notification opens."
  );
  await page.evaluate(() =>
    navigator.serviceWorker.dispatchEvent(
      new MessageEvent("message", {
        data: {
          type: "open-gc-notification",
          id: "fixture-expired-notification"
        }
      })
    )
  );
  await page
    .getByText(
      "Finish or save your open work before opening this notification."
    )
    .waitFor();
  assert.equal(new URL(page.url()).pathname, "/platform");
  assert.equal(
    await content.inputValue(),
    "Keep this private draft when a phone notification opens."
  );
  await composer
    .getByRole("button", { name: "Save draft", exact: true })
    .click();
  await composer.getByText("Saved privately.", { exact: false }).waitFor();
  await composer
    .getByRole("button", { name: "Close composer", exact: true })
    .click();
  await page
    .getByRole("link", { name: "Open notification", exact: true })
    .click();
  await page
    .getByRole("heading", {
      name: "This notification is no longer available",
      exact: true
    })
    .waitFor();
  ok(
    "A notification click preserves the shared composer until its private draft is saved, then rechecks the source at the authenticated destination"
  );
  assert.deepEqual(errors, []);
  writeFileSync(
    output + "/result.json",
    JSON.stringify(
      { results, errors, providerSends: 0, physicalDeliveryObserved: false },
      null,
      2
    )
  );
  console.log("NOTIFICATION_SETTINGS_BROWSER_PASS " + results.length);
} catch (error) {
  console.log(
    "FIXTURE_UI",
    (await page.locator("main").innerText()).slice(-5000)
  );
  await page.screenshot({ path: output + "/failure.png", fullPage: true });
  throw error;
} finally {
  await browser.close();
  await db.$disconnect();
}
