import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { sessionCookieFixtureName } from "./session-cookie-fixture.mjs";
const fixtureDir = process.argv[2];
assert.ok(fixtureDir, "Pass the isolated account-session preview directory");
const config = JSON.parse(readFileSync(fixtureDir + "/browser-env.json", "utf8"));
assert.match(config.origin, /^https:\/\/127\.0\.0\.1:\d+$/);
config.localOrigin = config.origin;
assert.equal(new URL(config.database).hostname, "127.0.0.1");
Object.assign(process.env, {
  DATABASE_URL: config.database, DIRECT_URL: config.database,
  ACCOUNT_ORIGIN: config.localOrigin, NEXT_PUBLIC_SITE_URL: config.localOrigin,
  ACCOUNT_TEST_ISOLATED: "1", ACCOUNT_DELIVERY_MODE: "test-sink",
  ACCOUNT_TEST_SINK_DIR: resolve(fixtureDir, "sink"),
  AUTH_RATE_LIMIT_SECRET: "medium-fixture-only-secret-".repeat(3),
  NODE_ENV: "test", VERCEL: "", PRIVILEGED_MFA_MODE: "off"
});
const { PrismaClient } = await import("@prisma/client");
const { assertPortalTestDatabase, createPortalActor } = await import("../tests/seed-portal.ts");
const { loginAccount } = await import("../lib/platform/accounts.ts");
const db = new PrismaClient();
await assertPortalTestDatabase(db);
const { chromium } = createRequire(process.env.PLAYWRIGHT_MODULE ??
  `${process.env.HOME}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json`)("playwright");
const pub = execFileSync("openssl", ["x509", "-in", config.certificate, "-pubkey", "-noout"]);
const der = execFileSync("openssl", ["pkey", "-pubin", "-outform", "DER"], { input: pub });
const browser = await chromium.launch({ headless: true,
  executablePath: process.env.CHROMIUM_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  args: ["--ignore-certificate-errors-spki-list=" + createHash("sha256").update(der).digest("base64"),
    "--no-proxy-server"] });
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
await context.route("**/*", route => new URL(route.request().url()).hostname === "127.0.0.1" ? route.continue() : route.abort());
const page = await context.newPage();
const results = [], errors = [];
const outbound = [];
context.setDefaultTimeout(10000);
context.on("request", request => outbound.push({ url: request.url(), body: request.postData() ?? "" }));
context.on("page", p => p.on("pageerror", e => errors.push(e.message)));
page.on("pageerror", e => errors.push(e.message));
const evidenceTag = process.argv[3] ?? "";
assert.match(evidenceTag, /^[a-z0-9-]*$/);
const output = fixtureDir + "/account-session-privacy-browser" + (evidenceTag ? "-" + evidenceTag : "");
mkdirSync(output, { recursive: true });
const ok = message => { results.push(message); console.log("PASS " + message); };
const signIn = async actor => {
  await context.clearCookies();
  await context.addCookies([{ name: sessionCookieFixtureName(config.origin), value: actor.token,
    url: config.origin, secure: true, httpOnly: true, sameSite: "Lax" }]);
};
const go = async (path, p = page) => {
  const response = await p.goto(config.origin + path);
  assert.equal(response.status(), 200);
};
const fetchIn = (path, body, owner, p = page) => p.evaluate(async ({ path, body, owner }) => {
  const response = await fetch(path, { method: body ? "POST" : "GET", cache: "no-store",
    headers: { ...(body ? { "content-type": "application/json" } : {}), ...(owner ? { "x-expected-account": owner } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}) });
  return { status: response.status, body: await response.json() };
}, { path, body, owner });

const listing = page.getByRole("list", { name: "Active sign-ins", exact: true });
const password = () => page.getByLabel("Current password for other sign-ins", { exact: true });
const pulse = event => page.evaluate(event => window.dispatchEvent(new Event(event)), event);
const show = async () => { await page.getByRole("button", { name: "Show active sign-ins", exact: true }).click(); await listing.waitFor(); };
const absent = async secret => {
  await page.waitForFunction(() => !document.querySelector('ul[aria-label="Active sign-ins"], #session-current-password'));
  if (secret) assert.ok(!(await page.content()).includes(secret));
};
const actors = [];
async function actorWithOther(label) {
  const actor = await createPortalActor(db, label); actors.push(actor.id);
  const other = await loginAccount(db, actor.email, actor.password, "Mozilla/5.0 (iPhone) Version/18.0 Mobile Safari/604.1");
  return { ...actor, other };
}
const count = actor => db.platformSession.count({ where: { userId: actor.id } });
try {
  const actor = await actorWithOther("sessionprivate");
  await signIn(actor); await go("/platform/settings/account/sessions");
  await show(); assert.equal(await count(actor), 2);
  assert.match(await listing.textContent(), /Safari on iPhone/);
  await password().fill(actor.password);
  for (const [hide, resume] of [["blur", "focus"], ["offline", "online"], ["pagehide", "pageshow"]]) {
    await pulse(hide); await absent(actor.password);
    await pulse(resume); await listing.waitFor();
    assert.equal(await password().inputValue(), actor.password);
  }
  const bodies = outbound.filter(r => r.url.endsWith("/api/platform/account") && r.body).map(r => JSON.parse(r.body));
  assert.ok(bodies.every(b => b.operation === "list-sessions"));
  assert.equal(await count(actor), 2);
  ok("List labels/dates and password controls leave concealed DOM; current owner recovery restores the entry and fresh list without revocation");

  let releaseRead, readArrived, intercepted = false;
  const readReady = new Promise(resolve => { readArrived = resolve; });
  const hold = new Promise(resolve => { releaseRead = resolve; });
  await page.route("**/api/platform/account", async route => {
    if (route.request().method() !== "POST" || route.request().postDataJSON().operation !== "list-sessions" || intercepted) return route.continue();
    intercepted = true;
    assert.equal(route.request().headers()["x-expected-account"], actor.id);
    const result = await route.fetch(); assert.equal(result.status(), 200);
    readArrived(); await hold; await route.fulfill({ response: result }); await result.dispose();
  });
  await page.getByRole("button", { name: "Refresh sign-in list", exact: true }).click();
  await readReady; await pulse("blur"); releaseRead();
  await page.waitForTimeout(100); await absent(actor.password);
  await page.unroute("**/api/platform/account"); await pulse("focus"); await listing.waitFor();
  ok("An account-bound list response arriving after concealment cannot repopulate private DOM");

  for (const status of [401, 403, 429, 503]) {
    await page.route("**/api/platform/account", route => route.request().method() === "POST" && route.request().postDataJSON().operation === "list-sessions"
      ? route.fulfill({ status, contentType: "application/json", body: JSON.stringify({ message: "Fictional sign-in list unavailable" }) }) : route.continue());
    await page.getByRole("button", { name: "Refresh sign-in list", exact: true }).click();
    await page.getByText(/Fictional sign-in list unavailable/).waitFor(); await absent(actor.password);
    await page.unroute("**/api/platform/account");
    await page.getByRole("button", { name: "Recheck current account", exact: true }).click();
    await listing.waitFor(); assert.equal(await password().inputValue(), actor.password);
  }
  ok("Failed, denied and throttled list reads remove private presentation and preserve the password for valid current-account recovery");

  await context.setOffline(true); await pulse("offline"); await absent(actor.password);
  // The integrated Settings workspace also conceals the session component.
  // Its local recovery control is unavailable until the outer account check.
  assert.equal(await page.getByRole("button", { name: "Recheck current account", exact: true }).count(), 0);
  assert.equal(await count(actor), 2);
  await context.setOffline(false); await pulse("online");
  await page.getByRole("button", { name: "Recheck this sign-in", exact: true }).click();
  await listing.waitFor();
  assert.equal(await password().inputValue(), actor.password);
  assert.equal(await count(actor), 2);
  ok("Actual offline mode conceals session controls; explicit same-account recheck after reconnect restores the entry without revocation");

  const changed = await actorWithOther("sessionchanged");
  await signIn(changed);
  const wrongList = await fetchIn("/api/platform/account", { operation: "list-sessions" }, actor.id);
  const wrongRevoke = await fetchIn("/api/platform/account", { operation: "revoke-other-sessions", currentPassword: changed.password }, actor.id);
  assert.equal(wrongList.status, 401); assert.equal(wrongRevoke.status, 401);
  assert.equal(await count(changed), 2); assert.equal(await count(actor), 2);
  assert.equal((await fetchIn("/api/platform/account", { operation: "list-sessions" }, changed.id)).status, 200);
  assert.equal((await fetchIn("/api/platform/account", { operation: "list-sessions" })).status, 200);
  await pulse("blur"); await pulse("focus");
  await page.waitForFunction(secret => ![...document.querySelectorAll("input")].some(n => n.value === secret), actor.password);
  assert.ok(!(await page.content()).includes(actor.password));
  await signIn(actor); await go("/platform/settings/account/sessions"); await show();
  ok("The server rejects a different expected account despite valid cookie-owner credentials, preserves both owners, and keeps older headerless reads compatible");

  await password().fill("Fictional-wrong-password");
  await page.getByRole("button", { name: "Sign out other sessions", exact: true }).click();
  await page.getByText(/Your current password did not match/).waitFor();
  await listing.waitFor(); assert.equal(await count(actor), 2);
  assert.equal(await password().inputValue(), "Fictional-wrong-password");
  ok("Rejected credentials preserve the local entry and current list without changing any session");

  // Do not open the list first: outcome recovery must work from the initial form.
  const uncertain = await actorWithOther("sessionuncertain");
  await signIn(uncertain); await go("/platform/settings/account/sessions");
  await password().fill(uncertain.password);
  let revocations = 0, replacementToken;
  await page.route("**/api/platform/account", async route => {
    if (route.request().method() !== "POST" || route.request().postDataJSON().operation !== "revoke-other-sessions") return route.continue();
    revocations++;
    assert.equal(route.request().headers()["x-expected-account"], uncertain.id);
    const result = await route.fetch(); assert.equal(result.status(), 200); await result.dispose();
    assert.equal(await count(uncertain), 1);
    replacementToken = await loginAccount(db, uncertain.email, uncertain.password, "Mozilla/5.0 (Windows NT 10.0) Firefox/142.0");
    return route.abort();
  });
  await page.getByRole("button", { name: "Sign out other sessions", exact: true }).click();
  await page.getByText(/We could not confirm the response. Refresh the sign-in list/).waitFor();
  await listing.waitFor(); assert.match(await listing.textContent(), /Firefox on Windows/);
  for (const [hide, resume] of [["blur", "focus"], ["pagehide", "pageshow"]]) {
    await pulse(hide); await absent(uncertain.password); await pulse(resume); await listing.waitFor();
  }
  assert.equal(revocations, 1); assert.equal(await count(uncertain), 2);
  const { readAccountSession } = await import("../lib/platform/accounts.ts");
  assert.ok(await readAccountSession(db, replacementToken));
  await page.unroute("**/api/platform/account");
  ok("Lost accepted sign-out before opening the list recovers through a read only; a newer sign-in survives and the mutation is never repeated automatically");

  await password().fill(uncertain.password);
  await page.getByRole("button", { name: "Sign out other sessions", exact: true }).click();
  await page.getByText("Other sign-ins have been removed. This sign-in stays active.", { exact: true }).waitFor();
  assert.equal(await count(uncertain), 1); assert.equal(await password().inputValue(), "");
  assert.equal(await readAccountSession(db, replacementToken), null);
  await page.getByText("Only this sign-in is active.", { exact: true }).waitFor();
  for (const width of [320, 390, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(() => { document.documentElement.style.fontSize = "32px"; });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await page.getByRole("button", { name: "Sign out other sessions", exact: true }).focus();
    await page.keyboard.press("Shift+Tab");
    await page.keyboard.press("Shift+Tab");
    assert.equal(await password().evaluate(element => document.activeElement === element), true);
    await password().scrollIntoViewIfNeeded();
    assert.equal(await password().evaluate(element => {
      const rect = element.getBoundingClientRect();
      const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
      return hit === element || element.contains(hit);
    }), true);
    await page.screenshot({ path: output + "/sessions-" + width + ".png", fullPage: true });
    await page.evaluate(() => { document.documentElement.style.fontSize = ""; });
  }
  const stored = await page.evaluate(() => JSON.stringify({ history: history.state, local: { ...localStorage }, session: { ...sessionStorage }, url: location.href }));
  for (const token of [actor.password, uncertain.password, actor.token, uncertain.token]) assert.ok(!stored.includes(token));
  assert.deepEqual(errors, []);
  ok("Deliberate confirmed revocation clears the password, retains this session and fits narrow/enlarged layouts without storing private credentials");
  writeFileSync(output + "/result.json", JSON.stringify({ at: new Date().toISOString(), results, errors, source: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(), actorIds: actors, productionBuild: true, productionWrites: 0, externalSends: 0 }, null, 2), { mode: 0o600 });
  console.log("ACCOUNT_SESSION_PRIVACY_BROWSER_PASS " + results.length);
} catch (error) {
  const failure = output + "/failure-" + Date.now();
  writeFileSync(failure + ".json", JSON.stringify({ results, errors, error: String(error),
    state: await page.evaluate(() => ({ online: navigator.onLine, visibility: document.visibilityState, text: document.body.innerText })),
    requests: outbound }, null, 2), { mode: 0o600 });
  await page.screenshot({ path: failure + ".png", fullPage: true });
  throw error;
} finally { await browser.close(); await db.$disconnect(); }
