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
context.on("page", p => p.on("pageerror", e => errors.push(e.message)));
page.on("pageerror", e => errors.push(e.message));
const output = fixtureDir + "/authenticator-browser";
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
try {
  if (process.argv.includes("--enroll")) {
    const actor = await createPortalActor(db, "mfastaged");
    await seedOperatorGrants(db, actor, ["VIEW_OPERATIONAL_HEALTH"]);
    await signIn(actor); await go("/platform/account/authenticator");
    await page.getByText("Enrollment is being prepared. Broader enforcement is not active yet.", { exact: true }).waitFor();
    await page.getByRole("form", { name: "Start authenticator setup", exact: true }).waitFor();
    const state = await fetchIn("/api/platform/authenticator", undefined, actor.id);
    assert.equal(state.status, 200); assert.equal(state.body.mode, "enroll");
    assert.equal(state.body.available, true); assert.equal(state.body.factor, null);
    assert.equal((await fetchIn("/api/platform/admin?view=navigation")).status, 200);
    assert.equal(await db.adminAuthenticator.count({ where: { userId: actor.id } }), 0);
    assert.equal(await db.privilegedSessionProof.count({ where: { session: { userId: actor.id } } }), 0);
    ok("Enrollment mode offers explicit setup while an existing assigned operator retains access without invented factor or confirmation proof");
    assert.deepEqual(errors, []);
    writeFileSync(output + "/enrollment-result.json", JSON.stringify({ results, errors, productionBuild: true, provider: "fictional local stub", productionWrites: 0, externalSends: 0 }, null, 2), { mode: 0o600 });
    console.log("PRIVILEGED_ENROLLMENT_BROWSER_PASS " + results.length);
  } else {
  await go("/platform/account/authenticator");
  await page.getByRole("link", { name: "Sign in", exact: true }).first().waitFor();
  assert.equal((await fetchIn("/api/platform/authenticator")).status, 401);
  const unverified = await createPortalActor(db, "mfaunverified", { verified: false });
  await signIn(unverified); await go("/platform/account/authenticator");
  await page.getByText("Verify your account email and adult eligibility before setting up an authenticator.", { exact: false }).waitFor();
  assert.equal(await page.getByRole("button", { name: "Start authenticator setup", exact: true }).count(), 0);
  ok("Guest and unverified accounts cannot access enrollment controls or factor data");

  const actor = await createPortalActor(db, "mfabrowser");
  await seedOperatorGrants(db, actor, ["VIEW_OPERATIONAL_HEALTH"]);
  await signIn(actor); await go("/platform/admin");
  await page.getByRole("link", { name: /authenticator/i }).waitFor();
  assert.equal((await fetchIn("/api/platform/admin?view=navigation")).status, 403);
  await go("/platform/account/authenticator");
  const start = page.getByRole("form", { name: "Start authenticator setup", exact: true });
  await start.waitFor();
  await start.getByLabel("Confirm your current sign-in for this action", { exact: true }).fill(actor.password);
  let lost = false;
  await page.route("**/api/platform/authenticator", async route => {
    if (route.request().method() === "POST" && route.request().postDataJSON().operation === "mfa-start" && !lost) {
      lost = true;
      const response = await route.fetch({ url: config.localOrigin + new URL(route.request().url()).pathname });
      assert.equal(response.status(), 200); await response.dispose(); return route.abort();
    }
    return route.continue();
  });
  await start.getByRole("button", { name: "Start authenticator setup", exact: true }).click();
  await start.getByRole("button", { name: "Retry original action", exact: true }).click();
  const setup = page.getByRole("region", { name: "Private authenticator setup", exact: true });
  await setup.waitFor();
  await page.unroute("**/api/platform/authenticator");
  let factor = await db.adminAuthenticator.findUniqueOrThrow({ where: { userId: actor.id } });
  const setupSecret = openAuthenticator(actor.id, factor.secretCiphertext);
  assert.equal(await setup.locator("code").innerText(), authenticatorBase32(setupSecret));
  const qrImage = setup.getByRole("img", { name: "Private authenticator setup QR code", exact: true });
  await qrImage.waitFor();
  const { default: sharp } = await import("sharp");
  const { default: jsQR } = await import("jsqr");
  const png = Buffer.from((await qrImage.getAttribute("src")).split(",")[1], "base64");
  const raw = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const decoded = jsQR(new Uint8ClampedArray(raw.data), raw.info.width, raw.info.height);
  assert.ok(decoded); assert.equal(new URL(decoded.data).searchParams.get("secret"), authenticatorBase32(setupSecret));
  ok("Lost enrollment response retries the exact setup; locally rendered QR decodes to its actual factor");

  const confirm = page.getByRole("form", { name: "Confirm authenticator", exact: true });
  await confirm.getByLabel("Six-digit authenticator code", { exact: true }).fill(authenticatorTotp(setupSecret, BigInt(Math.floor(Date.now() / 30000)) - BigInt(1)));
  await confirm.getByRole("button", { name: "Confirm authenticator", exact: true }).click();
  const recovery = page.getByRole("region", { name: "Private recovery codes", exact: true });
  await recovery.waitFor();
  const codes = await recovery.locator("code").allTextContents(); assert.equal(codes.length, 8);
  assert.equal(await setup.count(), 0);
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  assert.equal(await recovery.isVisible(), false);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await recovery.waitFor();
  assert.deepEqual(await recovery.locator("code").allTextContents(), codes);
  assert.equal((await fetchIn("/api/platform/admin?view=navigation")).status, 403);
  await recovery.getByRole("button", { name: "I saved my recovery codes; hide them", exact: true }).click();
  await challenge(actor, "privileged-work");
  assert.equal((await fetchIn("/api/platform/admin?view=navigation")).status, 200);
  assert.equal(await db.platformOperatorGrant.count({ where: { userId: actor.id } }), 1);
  ok("Confirmation produces eight private codes; blur conceals them, same-session focus restores them, and only a separate challenge unlocks existing duties");

  await go("/platform/topics/new");
  const topic = page.getByRole("form", { name: "Create public topic", exact: true }); await topic.waitFor();
  const slug = "mfa-browser-" + randomUUID();
  await topic.getByLabel("Community name", { exact: true }).fill("Fictional MFA browser " + slug.slice(-8));
  await topic.getByLabel("Topic address", { exact: true }).fill(slug);
  await topic.getByLabel("What is this community about?", { exact: true }).fill("Fictional isolated confirmation recovery.");
  await topic.getByLabel("Community rules", { exact: true }).fill("Respect people and protect private information.");
  await topic.locator('input[name="acceptedRules"]').check();
  await db.privilegedSessionProof.updateMany({ where: { session: { userId: actor.id } }, data: { expiresAt: new Date(Date.now() - 1) } });
  await topic.getByRole("button", { name: "Create public topic", exact: true }).click();
  const help = page.getByRole("link", { name: "Confirm in another tab", exact: true }); await help.waitFor();
  assert.equal(await topic.getByLabel("Topic address", { exact: true }).inputValue(), slug);
  assert.equal(await topic.getByRole("button", { name: "Retry the same topic request", exact: true }).isEnabled(), true);
  const popupPromise = context.waitForEvent("page"); await help.click(); const popup = await popupPromise;
  await challenge(actor, "change-access", popup);
  await popup.close(); await page.bringToFront();
  await topic.getByRole("button", { name: "Retry the same topic request", exact: true }).click();
  await page.waitForURL("**/topics/" + slug);
  assert.equal(await db.topicCommunity.count({ where: { slug } }), 1);
  const consumed = await db.privilegedSessionProof.findFirstOrThrow({ where: { session: { userId: actor.id }, purpose: "change-access" } });
  assert.ok(consumed.consumedAt);
  ok("An expired confirmation retains the complete topic form and exact request, confirms in another tab, then creates exactly once and consumes the sensitive proof");

  await go("/platform/account/authenticator");
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(() => { document.documentElement.style.fontSize = "32px"; });
    await page.getByRole("heading", { name: "Your authenticator", exact: true }).waitFor();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    assert.ok(await page.locator(".gc-primary-nav a > span:not(.gc-message-count)").evaluateAll(labels => labels.every(label => {
      const text = label.getBoundingClientRect(), link = label.parentElement.getBoundingClientRect();
      return text.left >= link.left - 1 && text.right <= link.right + 1;
    })), "Every enlarged navigation label stays inside its own link");
    await page.screenshot({ path: output + "/confirmed-" + width + ".png", fullPage: true });
    await page.evaluate(() => { document.documentElement.style.fontSize = ""; });
  }
  ok("Confirmed controls fit 320px, 390px and desktop at doubled text size; screenshots contain no setup key or recovery code");

  const otherToken = await loginAccount(db, actor.email, actor.password, "fictional alternate browser");
  await page.getByText("Recover a lost authenticator", { exact: true }).click();
  const recover = page.getByRole("form", { name: "Replace using my recovery code", exact: true });
  await recover.getByLabel("Confirm your current sign-in for this action", { exact: true }).fill(actor.password);
  await recover.getByLabel("One unused recovery code", { exact: true }).fill("00000-00000-00000-00000");
  await recover.getByRole("button", { name: "Replace using my recovery code", exact: true }).click();
  await recover.getByText("That recovery code is invalid or already used.", { exact: true }).waitFor();
  assert.equal(await recover.getByLabel("One unused recovery code", { exact: true }).isEnabled(), true);
  await recover.getByLabel("One unused recovery code", { exact: true }).fill(codes[0]);
  await recover.getByRole("button", { name: "Replace using my recovery code", exact: true }).click();
  await setup.waitFor();
  factor = await db.adminAuthenticator.findUniqueOrThrow({ where: { userId: actor.id } });
  assert.equal(factor.confirmedAt, null); assert.deepEqual(factor.recoveryHashes, []);
  const { readAccountSession } = await import("../lib/platform/accounts.ts");
  assert.equal(await readAccountSession(db, otherToken), null);
  assert.equal((await fetchIn("/api/platform/admin?view=navigation")).status, 403);
  const second = await createPortalActor(db, "mfachanged");
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await signIn(second); await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page.getByRole("link", { name: "Reload authenticator settings", exact: true }).waitFor();
  assert.equal(await setup.count(), 0);
  assert.equal(await page.locator('input[name="currentPassword"]').count(), 0);
  ok("Recovery retires old codes and other sessions; switching accounts removes retained setup secrets and password forms");

  assert.deepEqual(errors, []);
  writeFileSync(output + "/result.json", JSON.stringify({ results, errors, productionBuild: true, provider: "fictional local stub", productionWrites: 0, externalSends: 0 }, null, 2), { mode: 0o600 });
  console.log("PRIVILEGED_AUTHENTICATOR_BROWSER_PASS " + results.length);
  }
} finally { await browser.close(); await db.$disconnect(); }
