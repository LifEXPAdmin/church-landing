import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";

const fixture = process.argv[2];
assert.ok(fixture, "Pass the isolated password-policy fixture directory");
const config = JSON.parse(readFileSync(fixture + "/browser-env.json", "utf8"));
Object.assign(process.env, JSON.parse(readFileSync(fixture + "/test-env.json", "utf8")));
assert.match(config.origin, /^https:\/\/mfa-fixture\.example\.test:\d+$/);
assert.equal(new URL(process.env.DATABASE_URL).hostname, "127.0.0.1");
assert.equal(process.env.ACCOUNT_TEST_ISOLATED, "1");
const { PrismaClient } = await import("@prisma/client");
const { assertPortalTestDatabase, createPortalActor } = await import("../tests/seed-portal.ts");
const { createSessionToken, hashSessionToken, hashPassword, verifyPassword } = await import("../lib/platform/auth.ts");
const { requestAccountGrant } = await import("../lib/platform/accounts.ts");
const db = new PrismaClient();
await assertPortalTestDatabase(db);
const { chromium } = createRequire(process.env.PLAYWRIGHT_MODULE)("playwright");
const pub = execFileSync("openssl", ["x509", "-in", config.certificate, "-pubkey", "-noout"]);
const der = execFileSync("openssl", ["pkey", "-pubin", "-outform", "DER"], { input: pub });
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROMIUM_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  args: ["--ignore-certificate-errors-spki-list=" + createHash("sha256").update(der).digest("base64"), "--host-resolver-rules=MAP mfa-fixture.example.test 127.0.0.1", "--no-proxy-server"]
});
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const external = [], errors = [], requests = [], results = [];
await context.route("**/*", async (route) => {
  const url = new URL(route.request().url());
  if (url.origin === config.origin) await route.continue();
  else { external.push(url.origin); await route.abort(); }
});
context.on("request", (r) => requests.push({ method: r.method(), url: r.url() }));
const page = await context.newPage();
page.on("pageerror", (e) => errors.push(e.message));
const output = fixture + "/password-policy-browser-" + Date.now();
mkdirSync(output, { recursive: true });
let stage = "startup";
const passed = (name) => { results.push(name); console.log("PASS " + name); };
const unique = () => "pp_" + randomBytes(6).toString("hex");
const strong = "Fictional-violet-moon-comet-97!";
async function go(path) {
  await page.bringToFront();
  const response = await page.goto(config.origin + path);
  assert.equal(response.status(), 200);
}
async function signIn(actor, proof) {
  await context.clearCookies();
  await context.addCookies([
    { name: "church_platform_session", value: actor.token, url: config.origin, httpOnly: true, secure: true, sameSite: "Lax" },
    ...(proof ? [{ name: "__Host-gc_google_recent", value: proof, url: config.origin, httpOnly: true, secure: true, sameSite: "Lax" }] : [])
  ]);
  await db.platformAuthLimit.deleteMany();
}
async function postBy(button) {
  const wait = page.waitForResponse((r) => new URL(r.url()).pathname === "/api/platform/account" && r.request().method() === "POST");
  await page.getByRole("button", { name: button, exact: true }).click();
  const response = await wait;
  // Accepted changes can immediately replace the document. Their route status,
  // navigation and database result are checked below; read JSON for rejections.
  return { response, body: response.ok() ? null : await response.json() };
}
async function rejection(button) {
  const { response, body } = await postBy(button);
  assert.equal(response.status(), 400);
  assert.equal(body.code, "ACCOUNT_PASSWORD_UNSAFE");
  assert.match(body.message, /Choose a more unique password/);
  assert.equal(response.headers()["set-cookie"], undefined);
  await page.getByText(/Choose a more unique password/).waitFor();
  await page.waitForFunction(() => document.activeElement?.textContent?.includes("Choose a more unique password"));
}
async function credentialState(id) {
  return {
    user: await db.platformUser.findUniqueOrThrow({ where: { id }, select: { passwordHash: true, credentialVersion: true } }),
    sessions: await db.platformSession.findMany({ where: { userId: id }, orderBy: { id: "asc" } }),
    grants: await db.platformAccountGrant.findMany({ where: { userId: id }, orderBy: { id: "asc" } }),
    proofs: await db.platformRecentAuthentication.findMany({ where: { userId: id }, orderBy: { id: "asc" } })
  };
}
try {
  stage = "Registration rejection and retained correction";
  await go("/platform/signup");
  const username = unique(), email = username + "@example.test";
  for (const [field, value] of [["name", "Fictional Password Browser"], ["username", username], ["email", email], ["password", "password123"], ["confirmPassword", "password123"]])
    await page.locator(`#account-register-form [name="${field}"]`).fill(value);
  await rejection("Create account");
  assert.equal(await page.locator("#account-register-password").inputValue(), "password123");
  assert.equal(await page.locator('#account-register-form [name="username"]').inputValue(), username);
  assert.equal(await db.platformUser.count({ where: { email } }), 0);
  passed("Signup rejects common choice with focused feedback and retains all inputs without creating an account");
  await page.locator("#account-register-password").fill(username + "2026!");
  await page.locator("#account-register-confirmation").fill(username + "2026!");
  await rejection("Create account");
  passed("Signup checks submitted account context before registration");
  await page.locator("#account-register-password").fill(strong);
  await page.locator("#account-register-confirmation").fill(strong);
  assert.equal((await postBy("Create account")).response.status(), 200);
  await page.locator("#account-login-email").waitFor();
  const registered = await db.platformUser.findUniqueOrThrow({ where: { email } });
  assert.ok(await verifyPassword(strong, registered.passwordHash));
  passed("Corrected signup succeeds through the actual built account route and normal sign-in handoff");

  stage = "Password change rejection, concealment and correction";
  const actor = await createPortalActor(db, "pwpolicy");
  let reset;
  await requestAccountGrant(db, actor.email, "RESET_PASSWORD", async (_e, _p, t) => { reset = t; });
  await signIn(actor);
  await go("/platform/settings/security/password");
  await page.locator("#account-change-password-current-password").fill(actor.password);
  await page.locator("#account-change-password-password").fill("God's Churches2026!");
  await page.locator("#account-change-password-confirmation").fill("God's Churches2026!");
  const beforeChange = await credentialState(actor.id);
  await rejection("Change password");
  assert.deepEqual(await credentialState(actor.id), beforeChange);
  assert.equal(await page.locator("#account-change-password-current-password").inputValue(), actor.password);
  passed("Built authenticated change rejects product context and preserves credential, sessions and reset grant");
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await page.waitForFunction(() => document.querySelector("#account-change-password-password") === null);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page.locator("#account-change-password-password").waitFor();
  assert.equal(await page.locator("#account-change-password-password").inputValue(), "God's Churches2026!");
  passed("Rejected credential draft leaves concealed DOM and returns after current-owner validation");
  await page.locator("#account-change-password-password").fill(strong);
  await page.locator("#account-change-password-confirmation").fill(strong);
  assert.equal((await postBy("Change password")).response.status(), 200);
  await page.waitForURL(/\/platform\/login/);
  assert.equal(await db.platformSession.count({ where: { userId: actor.id } }), 0);
  assert.ok(await verifyPassword(strong, (await credentialState(actor.id)).user.passwordHash));
  assert.ok((await db.platformAccountGrant.findUniqueOrThrow({ where: { tokenHash: hashSessionToken(reset) } })).consumedAt);
  passed("Corrected password change succeeds and revokes all original access");

  stage = "Reset link rejection and reuse";
  const recovery = await createPortalActor(db, "pwreset");
  let resetToken;
  await requestAccountGrant(db, recovery.email, "RESET_PASSWORD", async (_e, _p, t) => { resetToken = t; });
  await context.clearCookies(); await db.platformAuthLimit.deleteMany();
  await go("/platform/account/recover#token=" + resetToken);
  await page.getByRole("heading", { name: "Choose a new password" }).waitFor();
  assert.equal(new URL(page.url()).hash, "");
  await page.locator('input[name="password"]').fill("password123");
  await page.locator('input[name="confirmPassword"]').fill("password123");
  const beforeReset = await credentialState(recovery.id);
  await rejection("Reset password");
  assert.deepEqual(await credentialState(recovery.id), beforeReset);
  assert.equal(await page.locator('input[name="password"]').inputValue(), "password123");
  passed("Actual reset route leaves rejected entries and the same one-use link usable with focused feedback");
  await page.locator('input[name="password"]').fill(strong);
  await page.locator('input[name="confirmPassword"]').fill(strong);
  assert.equal((await postBy("Reset password")).response.status(), 200);
  await page.waitForURL(/\/platform\/login/);
  assert.ok((await db.platformAccountGrant.findUniqueOrThrow({ where: { tokenHash: hashSessionToken(resetToken) } })).consumedAt);
  assert.equal(await db.platformSession.count({ where: { userId: recovery.id } }), 0);
  passed("Corrected reset consumes the original grant once and revokes old sessions");

  stage = "Google-only password addition and preserved confirmation";
  const google = await createPortalActor(db, "pwgoogle");
  await db.platformUser.update({ where: { id: google.id }, data: { passwordHash: null } });
  const identity = await db.platformGoogleIdentity.create({ data: { userId: google.id, issuer: "https://accounts.google.com", subject: "fictional-password-" + randomBytes(12).toString("hex") } });
  const session = await db.platformSession.findUniqueOrThrow({ where: { tokenHash: hashSessionToken(google.token) } });
  const proof = createSessionToken();
  await db.platformRecentAuthentication.create({ data: { userId: google.id, sessionId: session.id, googleIdentityId: identity.id, credentialVersion: session.credentialVersion, purpose: "change-password", tokenHash: hashSessionToken(proof), expiresAt: new Date(Date.now() + 300000) } });
  await signIn(google, proof);
  await go("/platform/settings/account/methods");
  await page.getByText("Google confirmation received for this action. Continue below.", { exact: true }).waitFor();
  await page.locator("#account-change-password-password").fill("password123");
  await page.locator("#account-change-password-confirmation").fill("password123");
  const beforeGoogle = await credentialState(google.id);
  await rejection("Add password");
  assert.deepEqual(await credentialState(google.id), beforeGoogle);
  assert.ok(await page.getByText("Google confirmation received for this action. Continue below.", { exact: true }).isVisible());
  assert.ok(await page.getByRole("button", { name: "Add password", exact: true }).isEnabled());
  assert.equal((await context.cookies()).find((c) => c.name === "__Host-gc_google_recent")?.value, proof);
  passed("Built Google-only add-password rejection retains both browser readiness and the exact server proof/cookie");
  await page.locator("#account-change-password-password").fill(strong);
  await page.locator("#account-change-password-confirmation").fill(strong);
  assert.equal((await postBy("Add password")).response.status(), 200);
  await page.waitForURL(/\/platform\/login/);
  assert.equal(await db.platformRecentAuthentication.count({ where: { userId: google.id } }), 0);
  assert.ok(await verifyPassword(strong, (await credentialState(google.id)).user.passwordHash));
  passed("Corrected Google-only password addition succeeds without a second provider confirmation");

  stage = "Existing password compatibility";
  const legacy = await createPortalActor(db, "pwlegacy");
  await db.platformUser.update({ where: { id: legacy.id }, data: { passwordHash: await hashPassword("password123") } });
  await context.clearCookies(); await db.platformAuthLimit.deleteMany();
  await go("/platform/login");
  await page.locator("#account-login-email").fill(legacy.email);
  await page.locator("#account-login-password").fill("password123");
  assert.equal((await postBy("Sign in")).response.status(), 200);
  await page.waitForURL((url) => url.pathname === "/platform");
  passed("Existing common-password account still signs in through the built route without forced rotation");

  stage = "Responsive guidance and local storage";
  await context.clearCookies(); await go("/platform/signup");
  for (const width of [320, 390, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(() => { document.documentElement.style.fontSize = "32px"; });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
    const help = await page.locator("#account-register-password").getAttribute("aria-describedby");
    assert.ok(help);
    assert.match(await page.locator(`[id="${help}"]`).innerText(), /15 or more/);
    await page.locator("#account-register-password").focus();
    await page.keyboard.type("Fictional-pasted-orbit-97!");
    await page.keyboard.press("Tab");
    assert.ok(await page.getByRole("button", { name: "Show password", exact: true }).evaluate((el) => el === document.activeElement));
    await page.screenshot({ path: `${output}/${width}-enlarged.png`, fullPage: true });
  }
  const stored = await page.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } }));
  for (const value of [strong, actor.password, resetToken, proof, legacy.password]) assert.equal(stored.includes(value), false);
  assert.ok(requests.every((r) => !r.url.includes(resetToken) && !r.url.includes(proof)));
  assert.deepEqual(external, []);
  assert.deepEqual(errors, []);
  passed("320/390/1280 enlarged-text guidance, keyboard show control and no credential/grant browser storage or external requests");
  writeFileSync(output + "/result.json", JSON.stringify({ at: new Date().toISOString(), results, errors, externalRequests: external, productionWrites: 0, realRecipientSends: 0, googleScope: "Actual built status/account routes with fictional linked identity and one-use proof rows; no Google authorization/provider exchange." }, null, 2));
} catch (error) {
  await page.screenshot({ path: output + "/failure.png", fullPage: true }).catch(() => {});
  writeFileSync(output + "/failure.json", JSON.stringify({ stage, results, errors, error: String(error) }, null, 2));
  throw error;
} finally {
  await browser.close();
  await db.$disconnect();
}
