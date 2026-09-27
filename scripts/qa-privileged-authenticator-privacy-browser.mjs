import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
const fixtureDir = process.argv[2];
assert.ok(fixtureDir, "Pass the isolated MFA preview directory");
const config = JSON.parse(readFileSync(fixtureDir + "/browser-env.json", "utf8"));
assert.match(config.origin, /^https:\/\/mfa-fixture\.example\.test:\d+$/);
assert.match(config.localOrigin, /^https:\/\/127\.0\.0\.1:\d+$/);
assert.equal(new URL(config.database).hostname, "127.0.0.1");
Object.assign(process.env, {
  DATABASE_URL: config.database, DIRECT_URL: config.database,
  ACCOUNT_ORIGIN: config.localOrigin, NEXT_PUBLIC_SITE_URL: config.localOrigin,
  ACCOUNT_TEST_ISOLATED: "1", ACCOUNT_DELIVERY_MODE: "test-sink",
  ACCOUNT_TEST_SINK_DIR: process.cwd() + "/" + fixtureDir + "/sink",
  AUTH_RATE_LIMIT_SECRET: "medium-fixture-only-secret-".repeat(3),
  NODE_ENV: "test", VERCEL: "", PRIVILEGED_MFA_MODE: "off"
});
const { PrismaClient } = await import("@prisma/client");
const { assertPortalTestDatabase, createPortalActor, seedOperatorGrants } = await import("../tests/seed-portal.ts");
const { openAuthenticator, authenticatorTotp, authenticatorBase32 } = await import("../lib/platform/admin-authenticator-crypto.ts");
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
    "--host-resolver-rules=MAP mfa-fixture.example.test 127.0.0.1", "--no-proxy-server"] });
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
await context.route("**/*", route => new URL(route.request().url()).hostname === "mfa-fixture.example.test" ? route.continue() : route.abort());
const page = await context.newPage();
const results = [], errors = [];
const outbound = [];
context.setDefaultTimeout(10000);
context.on("request", request => outbound.push({ url: request.url(), body: request.postData() ?? "" }));
context.on("page", p => p.on("pageerror", e => errors.push(e.message)));
page.on("pageerror", e => errors.push(e.message));
const output = fixtureDir + "/authenticator-privacy-browser";
mkdirSync(output, { recursive: true });
const ok = message => { results.push(message); console.log("PASS " + message); };
const signIn = async actor => {
  await context.clearCookies();
  await context.addCookies([{ name: "church_platform_session", value: actor.token,
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
const nextCode = async userId => {
  const factor = await db.adminAuthenticator.findUniqueOrThrow({ where: { userId } });
  const now = BigInt(Math.floor(Date.now() / 30000));
  const counter = factor.lastCounter >= now ? factor.lastCounter + BigInt(1) : now;
  const wait = Number(counter - now - BigInt(1)) * 30000;
  if (wait > 0) await new Promise(resolve => setTimeout(resolve, Math.min(wait + 100, 31000)));
  return authenticatorTotp(openAuthenticator(userId, factor.secretCiphertext), counter);
};
const challenge = async (actor, purpose, p = page) => {
  const form = p.getByRole("form", { name: "Confirm protected work", exact: true });
  await form.waitFor();
  await form.getByLabel("Protected action", { exact: true }).selectOption(purpose);
  await form.getByLabel("Six-digit authenticator code", { exact: true }).fill(await nextCode(actor.id));
  await form.getByRole("button", { name: "Confirm protected work", exact: true }).click();
  await form.getByText(purpose === "privileged-work" ? /Assigned duties are confirmed/ : /This protected action is confirmed once/).waitFor();
};
const setup = page.getByRole("region", { name: "Private authenticator setup", exact: true });
const recovery = page.getByRole("region", { name: "Private recovery codes", exact: true });
const start = () => page.getByRole("form", { name: /^(Start|Restart) authenticator setup$/ });
const confirm = () => page.getByRole("form", { name: "Confirm authenticator", exact: true });
const protectedForm = () => page.getByRole("form", { name: "Confirm protected work", exact: true });
const pulse = event => page.evaluate(event => window.dispatchEvent(new Event(event)), event);
const privateAbsent = async (tokens = []) => {
  await page.waitForFunction(() => !document.querySelector('input[type="password"], input[name="code"], select[name="purpose"], img[alt="Private authenticator setup QR code"], [aria-label="Private recovery codes"], [aria-label="Authenticator security notices"]'));
  const html = await page.content();
  for (const token of tokens) assert.ok(!html.includes(token), "Concealed private value is absent from DOM");
};
const privateStorage = async tokens => {
  const stored = await page.evaluate(() => JSON.stringify({ history: history.state, local: { ...localStorage }, session: { ...sessionStorage }, url: location.href }));
  for (const token of tokens) assert.ok(!stored.includes(token), "No private entry in URL, history or browser storage");
};
const lostResponse = async operation => {
  let lost = false;
  const bodies = [];
  await page.route("**/api/platform/authenticator", async route => {
    if (route.request().method() === "POST" && route.request().postDataJSON().operation === operation) {
      bodies.push(route.request().postData());
      if (!lost) {
        lost = true;
        const response = await route.fetch({ url: config.localOrigin + new URL(route.request().url()).pathname });
        assert.equal(response.status(), 200);
        await response.dispose(); return route.abort();
      }
    }
    return route.continue();
  });
  return bodies;
};
try {
  const actor = await createPortalActor(db, "mfaprivacy");
  await seedOperatorGrants(db, actor, ["VIEW_OPERATIONAL_HEALTH"]);
  await signIn(actor);
  let response = await page.goto(config.origin + "/platform/account/authenticator");
  assert.equal(response.status(), 200);
  let html = await response.text();
  assert.ok(!html.includes('\"factor\"') && !html.includes('\"notices\"'));
  await start().waitFor();
  await start().getByLabel("Confirm your current sign-in for this action", { exact: true }).fill(actor.password);
  for (const [hide, show] of [["blur", "focus"], ["offline", "online"], ["pagehide", "pageshow"]]) {
    await pulse(hide); await privateAbsent([actor.password]);
    await pulse(show); await start().waitFor();
    assert.equal(await start().getByLabel("Confirm your current sign-in for this action", { exact: true }).inputValue(), actor.password);
  }
  assert.equal(outbound.filter(r => r.body.includes('"operation":"mfa-')).length, 0);
  ok("Fresh snapshot reads gate presentation; concealment removes password fields and same-session recovery restores the draft without a write");

  let releaseRead, readArrived;
  const arrived = new Promise(resolve => { readArrived = resolve; });
  const hold = new Promise(resolve => { releaseRead = resolve; });
  await page.route("**/api/platform/authenticator", async route => {
    if (route.request().method() !== "GET") return route.continue();
    const result = await route.fetch({ url: config.localOrigin + "/api/platform/authenticator" });
    readArrived(); await hold;
    await route.fulfill({ response: result }); await result.dispose();
  });
  await pulse("focus"); await arrived; await pulse("blur"); releaseRead();
  await page.waitForTimeout(100); await privateAbsent([actor.password]);
  await page.unroute("**/api/platform/authenticator");
  await pulse("focus"); await start().waitFor();
  ok("A successful read arriving after concealment cannot restore private DOM");

  const startBodies = await lostResponse("mfa-start");
  await start().getByRole("button", { name: "Start authenticator setup", exact: true }).click();
  await start().getByRole("button", { name: "Retry original action", exact: true }).waitFor();
  const initialFactor = await db.adminAuthenticator.findUniqueOrThrow({ where: { userId: actor.id } });
  await pulse("blur"); await privateAbsent([actor.password]);
  await pulse("focus"); await start().getByRole("button", { name: "Retry original action", exact: true }).click();
  await setup.waitFor(); await setup.getByRole("img").waitFor();
  assert.equal(startBodies.length, 2); assert.equal(startBodies[0], startBodies[1]);
  assert.deepEqual(await db.adminAuthenticator.findUniqueOrThrow({ where: { userId: actor.id } }), initialFactor);
  await page.unroute("**/api/platform/authenticator");
  const secret = await setup.locator("code").textContent();
  for (const [hide, show] of [["blur", "focus"], ["offline", "online"], ["pagehide", "pageshow"]]) {
    await pulse(hide); await privateAbsent([secret]);
    await pulse(show); await setup.waitFor();
    assert.equal(await setup.locator("code").textContent(), secret);
  }
  ok("A lost setup response retains exact request bytes across a newer saved factor; key and QR leave concealed DOM and recover for the original session");

  const confirmBodies = await lostResponse("mfa-confirm");
  const code = authenticatorTotp(openAuthenticator(actor.id, initialFactor.secretCiphertext), BigInt(Math.floor(Date.now() / 30000)) - 1n);
  await confirm().getByLabel("Six-digit authenticator code", { exact: true }).fill(code);
  await confirm().getByRole("button", { name: "Confirm authenticator", exact: true }).click();
  await confirm().getByRole("button", { name: "Retry original action", exact: true }).waitFor();
  const confirmedFactor = await db.adminAuthenticator.findUniqueOrThrow({ where: { userId: actor.id } });
  assert.ok(confirmedFactor.confirmedAt);
  await pulse("blur"); await privateAbsent([secret, code]);
  await pulse("focus");
  await confirm().getByRole("button", { name: "Retry original action", exact: true }).click();
  await recovery.waitFor();
  const codes = await recovery.locator("code").allTextContents(); assert.equal(codes.length, 8);
  assert.equal(confirmBodies.length, 2); assert.equal(confirmBodies[0], confirmBodies[1]);
  assert.deepEqual(await db.adminAuthenticator.findUniqueOrThrow({ where: { userId: actor.id } }), confirmedFactor);
  assert.equal(await db.privilegedSecurityNotice.count({ where: { userId: actor.id } }), 1);
  await page.unroute("**/api/platform/authenticator");
  ok("A lost confirmation response survives the confirmed-factor read and recovers the original eight codes without a second confirmation or notice");

  await protectedForm().getByLabel("Protected action", { exact: true }).selectOption("export-metrics");
  await protectedForm().getByLabel("Six-digit authenticator code", { exact: true }).fill("123456");
  for (const [hide, show] of [["blur", "focus"], ["offline", "online"], ["pagehide", "pageshow"]]) {
    await pulse(hide); await privateAbsent([...codes, "123456"]);
    await pulse(show); await recovery.waitFor();
    assert.deepEqual(await recovery.locator("code").allTextContents(), codes);
    assert.equal(await protectedForm().getByLabel("Protected action", { exact: true }).inputValue(), "export-metrics");
    assert.equal(await protectedForm().getByLabel("Six-digit authenticator code", { exact: true }).inputValue(), "123456");
  }
  await privateStorage([secret, ...codes, actor.password, "123456"]);
  ok("Recovery codes, notices, selected purpose and typed code leave concealed DOM, restore only after a fresh read and never enter persistent browser state");

  for (const status of [401, 403, 429, 503]) {
    await page.route("**/api/platform/authenticator", route => route.request().method() === "GET" ? route.fulfill({ status, contentType: "application/json", body: JSON.stringify({ error: "Fictional authority read failure" }) }) : route.continue());
    await pulse("focus"); await page.getByText("Fictional authority read failure", { exact: true }).waitFor();
    await privateAbsent(codes);
    await page.unroute("**/api/platform/authenticator");
    await page.getByRole("button", { name: "Recheck current sign-in", exact: true }).click();
    await recovery.waitFor(); assert.deepEqual(await recovery.locator("code").allTextContents(), codes);
  }
  ok("Denied, throttled and unavailable reads conceal all private fields without deleting original-session recovery");

  const changed = await createPortalActor(db, "mfaprivacyother");
  await pulse("blur"); await signIn(changed); await pulse("focus");
  await page.getByRole("button", { name: "Recheck current sign-in", exact: true }).waitFor();
  await page.waitForTimeout(150); await privateAbsent(codes);
  await signIn(actor); await pulse("focus"); await recovery.waitFor();
  const otherToken = await loginAccount(db, actor.email, actor.password, "fictional alternate privacy session");
  await pulse("blur"); await signIn({ token: otherToken }); await pulse("focus");
  await page.getByText("Your sign-in changed. Restore the original sign-in to recover local entries, or reload authenticator settings.", { exact: true }).waitFor();
  await privateAbsent(codes);
  await signIn(actor); await pulse("focus"); await recovery.waitFor();
  assert.equal(await protectedForm().getByLabel("Protected action", { exact: true }).inputValue(), "export-metrics");
  ok("Another account and a different sign-in for the same account cannot expose original drafts or codes; restoring the original session can");

  await protectedForm().getByRole("button", { name: "Discard local entries", exact: true }).click();
  await recovery.waitFor();
  await recovery.getByRole("button", { name: "I saved my recovery codes; hide them", exact: true }).click();
  const acknowledged = page.getByRole("status").filter({ hasText: "Recovery codes hidden from this page." });
  await acknowledged.waitFor();
  assert.equal(await acknowledged.evaluate(node => node === document.activeElement), true);
  await privateStorage([secret, ...codes, actor.password]);
  for (const width of [320, 390, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(() => { document.documentElement.style.fontSize = "32px"; });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await page.screenshot({ path: output + "/acknowledged-" + width + ".png", fullPage: true });
    await page.evaluate(() => { document.documentElement.style.fontSize = ""; });
  }
  response = await page.goto(config.origin + "/platform/account/authenticator"); html = await response.text();
  for (const key of ["recoveryCodesRemaining", "confirmedForWork", "notices", confirmedFactor.id]) assert.ok(!html.includes(key), "No privileged snapshot in server page payload");
  await protectedForm().waitFor();
  assert.equal(await recovery.count(), 0); assert.equal(await setup.count(), 0);
  assert.deepEqual(await db.adminAuthenticator.findUniqueOrThrow({ where: { userId: actor.id } }), confirmedFactor);
  assert.equal(await db.platformOperatorGrant.count({ where: { userId: actor.id } }), 1);
  assert.equal(await db.privilegedSessionProof.count({ where: { session: { userId: actor.id } } }), 0);
  ok("Acknowledgment erases codes with accessible focus, confirmed pages serialize no private snapshot, narrow layouts fit, and reading grants no duties or MFA proof");
  assert.deepEqual(errors, []);
  writeFileSync(output + "/result.json", JSON.stringify({ results, errors, source: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(), productionBuild: true, actorIds: [actor.id, changed.id], provider: "fictional local stub", productionWrites: 0, externalSends: 0 }, null, 2), { mode: 0o600 });
  console.log("PRIVILEGED_AUTHENTICATOR_PRIVACY_BROWSER_PASS " + results.length);
} finally {
  await browser.close(); await db.$disconnect();
}
