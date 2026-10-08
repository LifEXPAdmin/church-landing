import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { resolve, join } from "node:path";
import { sessionCookieFixtureName } from "./session-cookie-fixture.mjs";

// This observes the real website. It does not claim native/device acceptance.
const fixture = process.argv[2];
assert.match(fixture ?? "", /^\.account-test\/[a-z0-9-]+$/);
const config = JSON.parse(readFileSync(join(fixture, "browser-env.json"), "utf8"));
assert.match(config.origin, /^https:\/\/127\.0\.0\.1:\d+$/);
assert.equal(process.env.DATABASE_URL, config.database);
assert.equal(new URL(config.database).hostname, "127.0.0.1");
assert.equal(new URL(config.database).pathname, "/godschurches_security_test");
const { PrismaClient } = await import("@prisma/client");
const { assertPortalTestDatabase, seedPortal, createPortalActor } =
  await import("../tests/seed-portal.ts");
const { hashSessionToken } = await import("../lib/platform/auth.ts");
const db = new PrismaClient();
await assertPortalTestDatabase(db);
const { chromium } = createRequire(
  process.env.PLAYWRIGHT_MODULE ??
    `${process.env.HOME}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json`
)("playwright");
const publicKey = execFileSync("openssl", [
  "x509", "-in", config.certificate, "-pubkey", "-noout"
]);
const der = execFileSync("openssl", ["pkey", "-pubin", "-outform", "DER"], {
  input: publicKey
});
const output = resolve(fixture, "mobile-website-parity-" + Date.now());
mkdirSync(output, { mode: 0o700 });
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROMIUM_PATH ??
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  args: ["--no-proxy-server", "--ignore-certificate-errors-spki-list=" +
    createHash("sha256").update(der).digest("base64")]
});
const context = await browser.newContext({
  viewport: { width: 390, height: 844 }, hasTouch: true
});
const external = [], errors = [], results = [], screens = [];
await context.route("**/*", async route => {
  const url = new URL(route.request().url());
  if (url.origin === config.origin) await route.continue();
  else { external.push(url.origin); await route.abort(); }
});
const page = await context.newPage();
page.setDefaultTimeout(15000);
page.on("pageerror", error => errors.push(error.message));
let stage = "fixture";
const pass = message => { results.push(message); console.log("PASS " + message); };
const go = async path => {
  stage = path;
  assert.equal((await page.goto(config.origin + path)).status(), 200, path);
};
const bounded = async () => assert.ok(await page.evaluate(
  () => document.documentElement.scrollWidth <= innerWidth + 1
), "Phone layout has no horizontal overflow: " + stage);
async function capture(name) {
  await bounded();
  const path = join(output, name + ".png");
  await page.screenshot({ path, fullPage: true });
  screens.push({ name, path, route: new URL(page.url()).pathname,
    viewport: page.viewportSize(), headings: await page.locator("h1, h2").allTextContents() });
}
async function fillLogin(actor) {
  await page.locator("#account-login-email").fill(actor.email);
  await page.locator("#account-login-password").fill(actor.password);
}
async function submitLogin() {
  const response = page.waitForResponse(r =>
    new URL(r.url()).pathname === "/api/platform/account" && r.request().method() === "POST");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  return response;
}
const identity = () => page.evaluate(async () => {
  const r = await fetch("/api/platform/profile?view=identity", { cache: "no-store" });
  return { status: r.status, body: await r.json() };
});
try {
  const f = await seedPortal(db);
  const actor = f.memberA;
  const post = await db.platformPost.create({ data: {
    authorId: actor.id, content: "Fictional phone walkthrough post. A bounded reading journey.",
    publishedAt: new Date()
  } });
  await context.clearCookies();
  await go("/platform/login?next=%2Fplatform%2Fsettings&reason=account");
  await page.getByRole("heading", { name: "Your God’s Churches account", exact: true }).waitFor();
  await capture("sign-in-390");
  await fillLogin(actor);
  const before = await db.platformSession.count({ where: { userId: actor.id } });
  let intercepted = 0;
  await page.route("**/api/platform/account", async route => {
    if (route.request().method() === "POST" && route.request().postDataJSON().operation === "login") {
      intercepted++;
      return route.abort("internetdisconnected");
    }
    return route.continue();
  });
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByRole("alert").filter({ hasText: "We could not confirm the response" }).waitFor();
  assert.equal(intercepted, 1);
  assert.equal(await page.locator("#account-login-email").inputValue(), actor.email);
  assert.equal(await page.locator("#account-login-password").inputValue(), actor.password);
  assert.equal(await db.platformSession.count({ where: { userId: actor.id } }), before);
  await page.unroute("**/api/platform/account");
  assert.equal((await submitLogin()).status(), 200);
  await page.waitForURL(url => url.pathname === "/platform/settings");
  assert.equal((await identity()).body.id, actor.id);
  pass("Interrupted sign-in preserves entries and creates no session; explicit retry signs in and returns to the requested Settings screen");

  const routes = [
    ["home", "/platform?feed=latest&mode=list", "Home"],
    ["churches", "/platform/churches", "Find your church"],
    ["profile", "/platform/profile/" + actor.username, actor.name],
    ["post", "/platform/posts/" + post.id, "Post and discussion"],
    ["search", "/platform/search", "Find your community."],
    ["messages", "/platform/messages", "Messages"],
    ["menu", "/platform/menu", "Menu"],
    ["settings", "/platform/settings", "Settings"],
    ["calendars", "/platform/calendars", "My calendars"],
    ["notifications", "/platform/activity", "Notifications"]
  ];
  async function ready(name, heading) {
    if (heading) await page.getByRole("heading", { name: heading, exact: true }).waitFor();
    if (name === "churches") await page.getByText(f.churchA.name, { exact: true }).first().waitFor();
    // The author also has a hidden editor textarea containing the same text.
    // Wait for the reader's rendered paragraph, not that retained edit field.
    if (name === "post" || name === "home") await page.locator("p").filter({ hasText: post.content }).waitFor();
    if (name === "search") await page.getByText("Enter words to search this category.", { exact: true }).waitFor();
    if (name === "menu") await page.getByText("No shortcuts selected. Choose the places you use most.", { exact: true }).waitFor();
    if (name === "messages") await page.getByText("No conversations yet", { exact: true }).waitFor();
    if (name === "settings") {
      await page.getByLabel("Search settings", { exact: true }).waitFor();
      await page.locator(".gc-settings-account").getByText(actor.name, { exact: true }).waitFor();
    }
    if (name === "notifications") await page.getByRole("button", { name: "Mark all read", exact: true }).waitFor();
  }
  for (const [name, path, heading] of routes) {
    await go(path);
    await ready(name, heading);
    await capture(name + "-390");
    assert.equal((await identity()).body.id, actor.id);
  }
  pass("Authenticated phone walkthrough observes all ten destinations with the same account and bounded 390px layouts");
  for (const [name, path, heading] of routes.filter(([name]) => ["home", "post", "menu"].includes(name))) {
    await page.setViewportSize({ width: 320, height: 844 });
    await go(path);
    await ready(name, heading);
    await capture(name + "-320");
  }
  pass("Home, post detail and Menu remain within a 320px phone viewport");

  stage = "safe-sign-out";
  const cookieName = sessionCookieFixtureName(config.origin);
  const signedInCookie = (await context.cookies()).find(c => c.name === cookieName);
  assert.ok(signedInCookie);
  await page.getByRole("button", { name: "Log out", exact: true }).first().click();
  await page.waitForURL(url => url.pathname === "/platform/login");
  assert.equal((await context.cookies()).some(c => c.name === cookieName), false);
  assert.equal(await db.platformSession.findUnique({ where: { tokenHash: hashSessionToken(signedInCookie.value) } }), null);
  assert.ok(await db.platformSession.findUnique({ where: { tokenHash: hashSessionToken(actor.token) } }));
  assert.equal((await identity()).status, 401);
  await go("/platform/settings");
  await page.getByRole("heading", { name: "Join or sign in to manage your account settings.", exact: true }).waitFor();
  assert.equal(await page.getByRole("button", { name: "Log out", exact: true }).count(), 0);
  pass("Real website sign-out revokes only this browser session; Settings returns to guest presentation and another fictional device session survives");

  stage = "older-passwordless-account";
  const legacy = await createPortalActor(db, "parityold");
  await db.platformUser.update({ where: { id: legacy.id }, data: { passwordHash: null } });
  const legacyBefore = await db.platformSession.count({ where: { userId: legacy.id } });
  await go("/platform/login");
  await fillLogin(legacy);
  assert.equal((await submitLogin()).status(), 400);
  await page.getByRole("alert").filter({ hasText: /.+/ }).waitFor();
  assert.equal((await context.cookies()).some(c => c.name === cookieName), false);
  assert.equal(await db.platformSession.count({ where: { userId: legacy.id } }), legacyBefore);
  assert.equal((await db.platformUser.findUniqueOrThrow({ where: { id: legacy.id } })).passwordHash, null);
  await page.getByText(/Older accounts without passwords require verified ownership recovery/).waitFor();
  // Clear fictional entered credentials before taking a retained screenshot.
  await page.locator("#account-login-email").fill("");
  await page.locator("#account-login-password").fill("");
  await capture("older-account-refusal-320");
  pass("An older passwordless account cannot sign in with an arbitrary password; the account is unchanged and ownership-recovery guidance is visible");
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
  writeFileSync(join(output, "receipt.json"), JSON.stringify({
    at: new Date().toISOString(), results, screens, errors, external,
    source: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
    buildId: readFileSync(".next/BUILD_ID", "utf8").trim(),
    scope: "Observed isolated production-build website with fictional accounts; native and real-provider acceptance remain separate",
    productionWrites: 0, externalSends: 0
  }, null, 2) + "\n", { mode: 0o600 });
  console.log("MOBILE_WEBSITE_PARITY_PASS " + results.length);
} catch (error) {
  writeFileSync(join(output, "failure.json"), JSON.stringify({ stage, results, screens,
    errors, external, error: String(error) }, null, 2), { mode: 0o600 });
  throw error;
} finally {
  await browser.close();
  await db.$disconnect();
}
