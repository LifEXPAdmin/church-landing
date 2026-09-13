import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
const dir = process.argv[2];
assert.ok(dir, "Pass the existing isolated HTTPS preview directory");
const config = JSON.parse(readFileSync(dir + "/browser-env.json", "utf8"));
assert.match(config.origin, /^https:\/\/127\.0\.0\.1:\d+$/);
Object.assign(process.env, {
  DATABASE_URL: config.database,
  DIRECT_URL: config.database,
  ACCOUNT_ORIGIN: config.origin,
  NEXT_PUBLIC_SITE_URL: config.origin,
  ACCOUNT_TEST_ISOLATED: "1",
  ACCOUNT_DELIVERY_MODE: "test-sink",
  ACCOUNT_TEST_SINK_DIR: resolve(dir, "sink"),
  AUTH_RATE_LIMIT_SECRET: "medium-fixture-only-secret-".repeat(3),
  NODE_ENV: "test",
  VERCEL: "",
  PUSH_ENABLED: "false",
  FOUNDER_WELCOME_ENABLED: "false"
});
const { PrismaClient } = await import("@prisma/client");
const { assertPortalTestDatabase, createPortalActor } =
  await import("../tests/seed-portal.ts");
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
const page = await context.newPage(),
  errors = [],
  results = [],
  bodies = [];
page.setDefaultTimeout(20000);
page.on("pageerror", (e) => errors.push(e.message));
page.on("request", (r) => {
  if (
    new URL(r.url()).pathname === "/api/platform/activity" &&
    r.method() === "POST"
  )
    bodies.push(r.postData());
});
const output = dir + "/activity-browser";
mkdirSync(output, { recursive: true, mode: 0o700 });
const ok = (text) => {
  results.push(text);
  console.log("PASS " + text);
};
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
const go = (path) => page.goto(config.origin + path);
const total = (n) =>
  page
    .getByText(
      `${n} unread update${n === 1 ? "" : "s"} across all categories`,
      { exact: true }
    )
    .waitFor();
const rows = () =>
  page.getByRole("list", { name: "Activity updates" }).getByRole("article");
const bounded = async () =>
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1
    )
  );
try {
  const owner = await createPortalActor(db, "activityui"),
    author = await createPortalActor(db, "activityuisource"),
    other = await createPortalActor(db, "activityuiempty");
  const posts = Array.from({ length: 25 }, () => randomUUID());
  await db.platformPost.createMany({
    data: posts.map((id) => ({
      id,
      authorId: owner.id,
      content: "Fictional Activity browser post"
    }))
  });
  const add = async (postId) => {
    const c = await db.platformPostComment.create({
      data: {
        postId,
        authorId: author.id,
        content: "Fictional private comment body"
      }
    });
    return db.socialEvent.create({
      data: {
        key: randomUUID(),
        kind: "COMMENT_ACTIVITY",
        actorId: author.id,
        recipientId: owner.id,
        postId,
        commentId: c.id
      }
    });
  };
  for (const p of posts) {
    await add(p);
    await add(p);
  }
  await signIn(owner);
  await go("/platform/menu");
  const menuLinks = await page
    .locator(".gc-menu-page a")
    .evaluateAll((a) => a.map((l) => l.getAttribute("href")));
  assert.equal(menuLinks[0], "/platform/invitations");
  await page.locator('a[href="/platform/activity"]').click();
  await total(50);
  assert.equal(await rows().count(), 20);
  assert.equal(
    await page.getByText("Latest from " + author.name, { exact: true }).count(),
    20
  );
  assert.ok(
    !(await page.locator("#platform-content").innerText()).includes(
      "Fictional private comment body"
    )
  );
  await bounded();
  for (const width of [320, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await bounded();
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: output + "/activity-phone.png",
    fullPage: true
  });
  ok(
    "Menu keeps QR first; Activity shows twenty grouped updates, names, local timestamps and exact unread counts without source bodies"
  );

  await page.getByRole("link", { name: "Older activity", exact: true }).click();
  await total(50);
  assert.equal(await rows().count(), 5);
  await page.goBack();
  await total(50);
  assert.equal(await rows().count(), 20);
  await rows().first().getByRole("link", { name: "Open item" }).click();
  await page.waitForURL(/\/platform\/posts\//);
  await page
    .getByText("Fictional Activity browser post", { exact: true })
    .first()
    .waitFor();
  await page.goBack();
  await total(50);
  ok("Older activity and Activity to source to Back preserve grouped state");
  await page
    .getByRole("navigation", { name: "Activity categories" })
    .getByRole("link", { name: "Messages", exact: true })
    .click();
  await total(50);
  await page
    .getByText("No activity in this category yet.", { exact: true })
    .waitFor();
  await page
    .getByRole("navigation", { name: "Activity categories" })
    .getByRole("link", { name: "All", exact: true })
    .click();
  await total(50);
  await rows().first().getByRole("button", { name: "Mark group read" }).click();
  await total(48);
  ok(
    "Categories preserve the all-category count; marking one group changes only its two events"
  );

  let lost = false;
  await page.route("**/api/platform/activity", async (route) => {
    if (route.request().method() !== "POST" || lost) return route.continue();
    lost = true;
    const response = await route.fetch();
    assert.equal(response.status(), 200);
    await add(posts.at(-1));
    await route.abort("failed");
  });
  await page
    .getByRole("button", { name: "Mark all read", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Retry read change", exact: true })
    .waitFor();
  const uncertain = bodies.at(-1);
  await page.getByRole("link", { name: "Open Messages", exact: true }).click();
  await page
    .getByText("Retry or stop retrying this read change before leaving.", {
      exact: true
    })
    .waitFor();
  assert.equal(new URL(page.url()).pathname, "/platform/activity");
  await page
    .getByRole("button", { name: "Retry read change", exact: true })
    .click();
  await total(1);
  assert.equal(bodies.at(-1), uncertain);
  await page.unroute("**/api/platform/activity");
  ok(
    "A committed but lost read acknowledgement blocks unsafe navigation and retries the identical body; the later arrival stays unread"
  );

  const second = await context.newPage();
  await second.goto(config.origin + "/platform/activity");
  await second
    .getByText("1 unread update across all categories", { exact: true })
    .waitFor();
  await second.close();
  await page.bringToFront();
  await total(1);
  ok("A second browser page sees persisted read state");

  await page.route("**/api/platform/activity", async (route) =>
    route.request().method() === "POST"
      ? route.fulfill({
          status: 409,
          json: { message: "Fixture conflict: refresh current activity." }
        })
      : route.continue()
  );
  await page
    .getByRole("button", { name: "Mark all read", exact: true })
    .click();
  await page
    .getByText("Fixture conflict: refresh current activity.", { exact: true })
    .waitFor();
  assert.equal(await rows().count(), 0);
  assert.equal(
    await page.getByRole("button", { name: "Retry read change" }).count(),
    0
  );
  await page.unroute("**/api/platform/activity");
  await page
    .getByRole("button", { name: "Refresh activity", exact: true })
    .click();
  await total(1);
  ok(
    "A terminal read conflict conceals the old view and requires refresh without an optimistic unread change"
  );

  await page.route("**/api/platform/activity", (route) =>
    route.fulfill({
      status: 503,
      json: { message: "Fixture disconnected. Reconnect and refresh." }
    })
  );
  await page
    .getByRole("button", { name: "Refresh activity", exact: true })
    .click();
  await page
    .getByText("Fixture disconnected. Reconnect and refresh.", { exact: true })
    .waitFor();
  assert.equal(await rows().count(), 0);
  await page.unroute("**/api/platform/activity");
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await total(1);
  ok(
    "Failed reads clear the prior private view and reconnect reloads current data"
  );

  let completeRead,
    captureRead,
    reads = 0;
  const captured = new Promise((resolve) => {
    captureRead = resolve;
  });
  await page.route("**/api/platform/activity", async (route) => {
    reads++;
    const response = await route.fetch();
    completeRead = () => route.fulfill({ response });
    captureRead();
  });
  await page.evaluate(() => {
    window.dispatchEvent(new Event("focus"));
    window.dispatchEvent(new Event("online"));
  });
  await captured;
  assert.equal(reads, 1);
  await completeRead();
  await total(1);
  await page.unroute("**/api/platform/activity");
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "hidden"
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  assert.equal(await rows().count(), 0);
  await page.evaluate(() => {
    delete document.visibilityState;
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await total(1);
  ok(
    "Concurrent focus and connection events share one read; backgrounding conceals private activity and returning reloads it"
  );

  await db.platformPost.update({
    where: { id: posts.at(-1) },
    data: { status: "WITHDRAWN", withdrawnAt: new Date() }
  });
  await page
    .getByRole("button", { name: "Refresh activity", exact: true })
    .click();
  await total(1);
  assert.equal(
    await rows()
      .first()
      .getByRole("heading", { name: "Activity unavailable" })
      .count(),
    1
  );
  assert.equal(await rows().first().getByRole("link").count(), 0);
  assert.ok(!(await rows().first().innerText()).includes(author.name));
  ok(
    "A withdrawn source becomes generic unavailable activity with no source name or link"
  );

  const beforeSwitch = bodies.length;
  let releaseOldRead, captureOldRead;
  const oldReadCaptured = new Promise((resolve) => {
    captureOldRead = resolve;
  });
  await page.route("**/api/platform/activity", async (route) => {
    await page.unroute("**/api/platform/activity");
    const response = await route.fetch();
    releaseOldRead = () => route.fulfill({ response });
    captureOldRead();
  });
  await page
    .getByRole("button", { name: "Refresh activity", exact: true })
    .click();
  await oldReadCaptured;
  assert.equal(await rows().count(), 0);
  await signIn(other);
  await releaseOldRead();
  await page.getByText("No activity yet.", { exact: true }).waitFor();
  await total(0);
  assert.equal(bodies.length, beforeSwitch);
  assert.ok(
    !(await page.locator("#platform-content").innerText()).includes(author.name)
  );
  ok(
    "Account switching removes prior private updates and renders the new owner's empty state without a read write"
  );
  for (const width of [320, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await bounded();
  }
  await go("/platform/messages");
  await page.getByRole("link", { name: "Activity", exact: true }).click();
  await total(0);
  await go("/platform/features");
  await page
    .getByRole("searchbox", { name: "Search features" })
    .fill("Your Activity");
  await page
    .getByRole("heading", { name: "Your Activity", exact: true })
    .waitFor();
  await go("/platform/releases/personal-activity");
  await page.getByRole("heading", { name: "Version 2026.09.13.31" }).waitFor();
  ok(
    "Messages entry, Explore features and retained release content work at narrow and desktop widths"
  );
  assert.deepEqual(errors, []);
} catch (error) {
  await page
    .screenshot({ path: output + "/failure.png", fullPage: true })
    .catch(() => {});
  throw error;
} finally {
  writeFileSync(
    output + "/result.json",
    JSON.stringify(
      {
        results,
        errors,
        checkedAt: new Date().toISOString(),
        productionWrites: 0
      },
      null,
      2
    ),
    { mode: 0o600 }
  );
  await browser.close();
  await db.$disconnect();
}
