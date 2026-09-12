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
const output = fixtureDir + "/safety-settings-browser";
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
const { randomUUID } = await import("node:crypto");
const { relationshipCommand, readRelationships } =
  await import("../lib/platform/relationships.ts");
try {
  const owner = await createPortalActor(db, "safetyowner"),
    other = await createPortalActor(db, "safetyother");
  await signIn(owner);
  await go("/platform/settings/safety");
  await page
    .getByRole("region", { name: "Safety choices", exact: true })
    .waitFor();
  await page.getByText("Block a personal account", { exact: true }).waitFor();
  await page.getByText("Mute or snooze", { exact: true }).waitFor();
  assert.equal(
    await page.getByRole("link", { name: "My reports", exact: true }).count(),
    0
  );
  await page
    .getByRole("link", { name: "Help and support", exact: true })
    .click();
  await page.getByRole("link", { name: "Get help", exact: true }).waitFor();
  await go("/platform/settings/safety");
  await page.locator("#setting-safety-blocked").click();
  await page
    .getByText(
      "You haven’t blocked any accounts. Open a person’s profile and their Connections controls to block them.",
      { exact: true }
    )
    .waitFor();
  ok(
    "Safety separates blocks, mutes, mentions and unavailable reporting; real Help and existing blocked list are reachable with useful empty guidance"
  );

  const targets = [];
  for (let i = 0; i < 24; i++) {
    const suffix = randomUUID().replaceAll("-", "").slice(0, 15);
    const u = await db.platformUser.create({
      data: {
        name: "Safety find " + i,
        username: "safe_" + suffix,
        email: suffix + "@example.test"
      }
    });
    targets.push(u);
    await db.socialRelationship.create({
      data: {
        ownerId: owner.id,
        targetUserId: u.id,
        blocked: true,
        muted: i < 2
      }
    });
  }
  await db.platformUser.update({
    where: { id: targets[23].id },
    data: { deactivatedAt: new Date(), name: "Hidden inactive safety name" }
  });
  await go("/platform/relationships?view=blocked");
  const library = page.getByRole("region", {
    name: "Private relationship library",
    exact: true
  });
  const search = page.getByLabel("Search blocked accounts", { exact: true });
  await search.fill("Safety find");
  await page
    .getByRole("button", { name: "Search this list", exact: true })
    .click();
  await library.locator("article").first().waitFor();
  assert.equal(await library.locator("article").count(), 20);
  await library
    .getByRole("link", { name: "More connections", exact: true })
    .click();
  await page.waitForURL("**after=**");
  await library.locator("article").first().waitFor();
  assert.equal(await library.locator("article").count(), 3);
  assert.equal(new URL(page.url()).searchParams.get("q"), "Safety find");
  await library.getByRole("link", { name: "First page", exact: true }).click();
  await page.waitForURL(
    (url) =>
      !url.searchParams.has("after") &&
      url.searchParams.get("q") === "Safety find"
  );
  await library.locator("article").first().waitFor();
  assert.equal(await library.locator("article").count(), 20);
  assert.equal(new URL(page.url()).searchParams.has("after"), false);
  await search.fill(targets[22].username);
  await page
    .getByRole("button", { name: "Search this list", exact: true })
    .click();
  await library
    .getByRole("heading", { name: targets[22].name, exact: true })
    .waitFor();
  assert.equal(await library.locator("article").count(), 1);
  await search.fill("Hidden inactive safety name");
  await page
    .getByRole("button", { name: "Search this list", exact: true })
    .click();
  await page
    .getByText(
      "No matching accounts in this list. Try another name or clear your search.",
      { exact: true }
    )
    .waitFor();
  await page
    .getByRole("link", { name: "Clear list search", exact: true })
    .click();
  await library.locator("article").first().waitFor();
  await library
    .getByRole("link", { name: "More connections", exact: true })
    .click();
  await page.getByText("Account unavailable", { exact: true }).waitFor();
  assert.equal(
    await page
      .getByText("Hidden inactive safety name", { exact: true })
      .count(),
    0
  );
  assert.equal(
    await page
      .getByText("Account unavailable", { exact: true })
      .locator("..")
      .locator("button,a,summary")
      .count(),
    0
  );
  ok(
    "Owner-scoped full-list search filters before pagination, preserves query across pages, searches usernames and never matches or exposes inactive account labels"
  );

  await go(
    "/platform/relationships?view=blocked&q=" +
      encodeURIComponent(targets[0].username)
  );
  const row = library.locator("article").first();
  await row.waitFor();
  await row
    .getByText("Connections with " + targets[0].name, { exact: true })
    .click();
  const unblock = row.getByRole("button", { name: "Unblock", exact: true });
  await unblock.waitFor();
  let confirmation = "";
  page.once("dialog", async (d) => {
    confirmation = d.message();
    await d.dismiss();
  });
  await unblock.click();
  assert.match(
    confirmation,
    /following, favorites, friendship and conversation subscriptions will not be restored/
  );
  assert.equal(
    (
      await readRelationships(db, owner.token, {
        view: "status",
        kind: "person",
        targetId: targets[0].id
      })
    ).blocked,
    true
  );
  const bodies = [];
  let fail = true;
  await page.route("**/api/platform/relationships", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    bodies.push(route.request().postData());
    if (fail)
      return route.fulfill({
        status: 503,
        json: { message: "Fixture temporary save failure" }
      });
    return route.continue();
  });
  page.once("dialog", (d) => d.accept());
  await unblock.click();
  await page
    .getByRole("button", {
      name: "Retry same relationship change",
      exact: true
    })
    .waitFor();
  assert.equal(await row.count(), 1);
  assert.equal(
    (
      await readRelationships(db, owner.token, {
        view: "status",
        kind: "person",
        targetId: targets[0].id
      })
    ).blocked,
    true
  );
  fail = false;
  await page
    .getByRole("button", {
      name: "Retry same relationship change",
      exact: true
    })
    .click();
  await page
    .getByText(
      "No matching accounts in this list. Try another name or clear your search.",
      { exact: true }
    )
    .waitFor();
  assert.equal(bodies.length, 2);
  assert.equal(bodies[0], bodies[1]);
  const current = await readRelationships(db, owner.token, {
    view: "status",
    kind: "person",
    targetId: targets[0].id
  });
  assert.equal(current.blocked, false);
  assert.equal(current.following, false);
  assert.equal(current.friends, false);
  assert.equal(current.favorite, false);
  await page.unroute("**/api/platform/relationships");
  ok(
    "Canceling unblock leaves the block; failed writes leave its row; confirmed exact retry removes the block only without restoring any connection"
  );

  await go(
    "/platform/relationships?view=blocked&q=" +
      encodeURIComponent(targets[1].username)
  );
  await row.waitFor();
  await row
    .getByText("Connections with " + targets[1].name, { exact: true })
    .click();
  await unblock.waitFor();
  const before = await readRelationships(db, owner.token, {
    view: "status",
    kind: "person",
    targetId: targets[1].id
  });
  await relationshipCommand(db, owner.token, {
    operation: "mute",
    kind: "person",
    targetId: targets[1].id,
    desired: false,
    expectedVersion: before.version,
    mutationId: randomUUID()
  });
  page.once("dialog", (d) => d.accept());
  await unblock.click();
  await page
    .getByRole("button", { name: "Refresh relationship choices", exact: true })
    .click();
  await unblock.waitFor();
  assert.equal(
    (
      await readRelationships(db, owner.token, {
        view: "status",
        kind: "person",
        targetId: targets[1].id
      })
    ).blocked,
    true
  );
  assert.equal(await row.count(), 1);
  await page.route("**/api/platform/relationships?**", (route) =>
    route.fulfill({
      status: 503,
      json: { message: "Fixture list read unavailable" }
    })
  );
  await page
    .getByRole("button", { name: "Refresh connections", exact: true })
    .click();
  await page
    .getByText("Fixture list read unavailable", { exact: true })
    .waitFor();
  assert.equal(await library.locator("article").count(), 0);
  await page.unroute("**/api/platform/relationships?**");
  await page
    .getByRole("button", { name: "Refresh connections", exact: true })
    .click();
  await row.waitFor();
  ok(
    "A stale unblock cannot overwrite a newer relationship; failed list reads conceal stale labels and explicit refresh recovers current data"
  );

  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(
      () => (document.documentElement.style.fontSize = "200%")
    );
    await bounded();
    await search.focus();
    assert.equal(
      await search.evaluate((e) => e.matches(":focus-visible")),
      true
    );
  }
  await page.evaluate(() => (document.documentElement.style.fontSize = ""));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: output + "/blocked-list-390.png",
    fullPage: true
  });
  await signIn(other);
  await page.evaluate(() => {
    dispatchEvent(new Event("blur"));
    dispatchEvent(new Event("focus"));
  });
  await page
    .getByText(
      "No matching accounts in this list. Try another name or clear your search.",
      { exact: true }
    )
    .waitFor();
  assert.equal(await library.locator("article").count(), 0);
  await context.clearCookies();
  await go("/platform/relationships?view=blocked&q=Safety");
  await page
    .locator("main")
    .getByRole("link", { name: "Sign in", exact: true })
    .click();
  await page.waitForURL("**/platform/login?**");
  const returned = new URL(
    new URL(page.url()).searchParams.get("next"),
    config.origin
  );
  assert.equal(returned.searchParams.get("q"), "Safety");
  assert.equal(returned.searchParams.get("view"), "blocked");
  const denied = await context.request.get(
    config.origin + "/api/platform/relationships?view=blocked&q=Safety"
  );
  assert.equal(denied.status(), 401);
  assert.match(denied.headers()["cache-control"], /no-store/);
  ok(
    "Large text and keyboard search fit phone/desktop layouts; account replacement conceals the old list and guests retain a bounded search return with private API denial"
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
