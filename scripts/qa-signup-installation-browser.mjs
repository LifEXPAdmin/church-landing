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
const output = fixtureDir + "/signup-installation-browser";
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
const { friendInvitationCommand, readFriendInvitations } =
  await import("../lib/platform/friend-invitations.ts");
const help = (p) =>
  p.getByRole("complementary", {
    name: "Keep God’s Churches handy",
    exact: true
  });
const settled = async (p) => p.waitForLoadState("networkidle");
const actorCookie = (token) => ({
  name: "church_platform_session",
  value: token,
  domain: "127.0.0.1",
  path: "/",
  secure: true,
  httpOnly: true,
  sameSite: "Lax"
});
const credentials = () => {
  const username = "help_" + randomUUID().replaceAll("-", "").slice(0, 13);
  return {
    name: "Fictional invited reader",
    username,
    email: username + "@example.test",
    password: "Fictional-reader-password-17"
  };
};
const fillSignup = async (p, input) => {
  await settled(p);
  const form = p.locator("#account-register-form");
  for (const [name, value] of Object.entries({
    ...input,
    confirmPassword: input.password
  }))
    await form.locator(`[name=${name}]`).fill(value);
};
const logIn = async (p, input, destination) => {
  await p.locator("#account-login-email").fill(input.email);
  await p.locator("#account-login-password").fill(input.password);
  await p.locator("#account-login-form button[type=submit]").click();
  await p.waitForURL(config.origin + destination);
  await settled(p);
};
const promptOffer = async (p) =>
  p.evaluate(() => {
    window.installCalls = 0;
    const event = new Event("beforeinstallprompt", { cancelable: true });
    event.prompt = async () => {
      window.installCalls++;
    };
    event.userChoice = Promise.resolve({ outcome: "dismissed" });
    window.dispatchEvent(event);
  });
const noInstallBeforeSignup = async (p) => {
  await settled(p);
  assert.equal(await help(p).count(), 0);
  assert.equal(
    await p
      .getByRole("complementary", { name: "Home Screen installation" })
      .count(),
    0
  );
  assert.equal(await p.getByRole("dialog").count(), 0);
  assert.equal(
    await p
      .getByRole("button", { name: /Install.*app|How to bookmark/ })
      .count(),
    0
  );
};
await context.addInitScript(() => {
  window.copied = [];
  window.clipboardFail = false;
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: {
      writeText: async (value) => {
        if (window.clipboardFail)
          throw new DOMException("Denied", "NotAllowedError");
        window.copied.push(value);
      }
    }
  });
});
try {
  const inviter = await createPortalActor(db, "signup_help_inviter");
  await friendInvitationCommand(db, inviter.token, {
    operation: "enable",
    accountId: inviter.id,
    expectedVersion: 0,
    mutationId: randomUUID(),
    consent: true
  });
  const invitation = await readFriendInvitations(db, inviter.token);
  const url = invitation.url;
  assert.ok(url);
  await page.goto(url);
  await page.locator("#account-register-form").waitFor();
  await page
    .getByRole("heading", { name: `${inviter.name} invited you`, exact: true })
    .waitFor();
  await promptOffer(page);
  await noInstallBeforeSignup(page);
  assert.equal(await page.evaluate(() => window.installCalls), 0);
  const existing = page.getByRole("link", {
    name: "Already have an account? Sign in",
    exact: true
  });
  const existingHref = await existing.getAttribute("href");
  const headerSignIn = page
    .getByRole("navigation", { name: "Account and website", exact: true })
    .getByRole("link", { name: "Sign in", exact: true });
  assert.equal(
    new URL(
      await headerSignIn.getAttribute("href"),
      config.origin
    ).searchParams.get("next"),
    new URL(url).pathname
  );
  assert.equal(
    new URL(existingHref, config.origin).searchParams.get("next"),
    new URL(url).pathname
  );
  await existing.click();
  await page.locator("#account-login-form").waitFor();
  await page.goBack();
  await page.locator("#account-register-form").waitFor();
  for (const width of [320, 390, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    await bounded();
  }
  await page.setViewportSize({ width: 320, height: 844 });
  await page.evaluate(() => (document.documentElement.style.fontSize = "200%"));
  await bounded();
  await page.evaluate(() => (document.documentElement.style.fontSize = ""));
  await page.locator("#account-register-name").focus();
  await page.keyboard.press("Tab");
  assert.equal(
    await page
      .locator("#account-register-handle")
      .evaluate((el) => el === document.activeElement),
    true
  );
  await page.screenshot({
    path: output + "/qr-signup-320.png",
    fullPage: true
  });
  ok(
    "QR opens the actual signup form first, even with install capability; inviter, existing-account return, Back, keyboard and 320/390/1280/200% layouts work"
  );

  const input = credentials();
  await fillSignup(page, input);
  await page.route(
    "**/api/platform/account",
    async (route) =>
      route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ message: "Fictional retryable signup outage." })
      }),
    { times: 1 }
  );
  await page.locator("#account-register-form button[type=submit]").click();
  await page
    .getByText("Fictional retryable signup outage.", { exact: true })
    .waitFor();
  assert.equal(
    await page.locator("#account-register-email").inputValue(),
    input.email
  );
  assert.equal(
    await db.platformUser.count({ where: { email: input.email } }),
    0
  );
  await noInstallBeforeSignup(page);
  await page.reload();
  await page.locator("#account-register-form").waitFor();
  await noInstallBeforeSignup(page);
  await fillSignup(page, input);
  await page.locator("#account-register-form button[type=submit]").click();
  await page.locator("#account-login-form").waitFor();
  await noInstallBeforeSignup(page);
  const newcomer = await db.platformUser.findUniqueOrThrow({
    where: { email: input.email }
  });
  const consent = await db.friendAcceptance.findUniqueOrThrow({
    where: { signupRecipientId: newcomer.id }
  });
  assert.equal(consent.inviterId, inviter.id);
  assert.equal(newcomer.emailVerifiedAt, null);
  assert.equal(newcomer.adultAcknowledgedAt, null);
  assert.equal(
    await db.platformFollow.count({
      where: { OR: [{ followerId: newcomer.id }, { followingId: newcomer.id }] }
    }),
    0
  );
  assert.equal(
    await db.platformSession.count({ where: { userId: newcomer.id } }),
    0
  );
  await page.reload();
  await page.locator("#account-login-form").waitFor();
  await noInstallBeforeSignup(page);
  await logIn(page, input, "/platform/invitations");
  await help(page).waitFor();
  await help(page)
    .getByText(/Email verification is still pending/)
    .waitFor();
  await page
    .getByRole("region", { name: "Signup connection" })
    .getByText(/Your signup invitation from/)
    .waitFor();
  const createdCookies = await context.cookies();
  const presentation = createdCookies.find(
    (cookie) => cookie.name === "__Host-gc_signup_completion"
  );
  assert.ok(presentation?.httpOnly && presentation.secure);
  assert.equal(presentation.sameSite, "Lax");
  assert.equal((await page.content()).includes(presentation.value), false);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: output + "/post-signup-390.png" });
  await help(page)
    .getByRole("link", {
      name: "Check account and invitation status",
      exact: true
    })
    .click();
  await page.waitForURL(
    config.origin + "/platform/invitations#account-and-invitation-status"
  );
  await page.waitForFunction(() => {
    const heading = document.getElementById("account-and-invitation-status");
    const bounds = heading?.getBoundingClientRect();
    return bounds && bounds.top >= 0 && bounds.bottom < innerHeight;
  });
  await page.goBack();
  await page.waitForURL(config.origin + "/platform/invitations");
  await page.setViewportSize({ width: 320, height: 844 });
  ok(
    "Failed signup and reload preserve safe invitation entry; real creation remains anonymous until sign-in, then optional help appears without verification, adult eligibility or premature friendship"
  );

  const bookmarkButton = help(page).getByRole("button", {
    name: "How to bookmark this page",
    exact: true
  });
  await bookmarkButton.click();
  const bookmark = page.getByRole("dialog", {
    name: "Bookmark God’s Churches",
    exact: true
  });
  await bookmark.waitFor();
  const close = bookmark.getByRole("button", { name: "Close", exact: true });
  assert.equal(
    await close.evaluate((el) => {
      const range = document.createRange();
      range.selectNodeContents(el);
      return [...range.getClientRects()].filter(
        (rect) => rect.width > 0 && rect.height > 0
      ).length;
    }),
    1,
    "The phone dialog Close label fits on one line"
  );
  await page.screenshot({ path: output + "/bookmark-open-320.png" });
  await bookmark
    .getByText(/This website cannot save a bookmark for you/)
    .waitFor();
  const clean = config.origin + "/platform";
  assert.equal(
    await bookmark
      .getByRole("textbox", { name: "App link", exact: true })
      .inputValue(),
    clean
  );
  const appLink = bookmark.getByRole("link", {
    name: "Open app page in a new tab",
    exact: true
  });
  assert.equal(await appLink.getAttribute("href"), clean);
  assert.equal(await appLink.getAttribute("target"), "_blank");
  await bookmark
    .getByRole("button", { name: "Copy app link", exact: true })
    .click();
  await bookmark.getByText(/App link copied/).waitFor();
  assert.equal((await page.evaluate(() => window.copied)).at(-1), clean);
  await page.evaluate(() => (window.clipboardFail = true));
  await bookmark
    .getByRole("button", { name: "Copy app link", exact: true })
    .click();
  await bookmark
    .getByText("Select and copy the app link below.", { exact: true })
    .waitFor();
  for (const heading of [
    "iPhone · Safari bookmarks",
    "Android or iPhone · Chrome bookmarks",
    "Computer · Chrome or Edge bookmarks",
    "Android · Firefox bookmarks"
  ])
    await bookmark.getByText(heading, { exact: true }).click();
  await bounded();
  await page.screenshot({ path: output + "/bookmark-320.png", fullPage: true });
  await page.keyboard.press("Escape");
  assert.equal(
    await bookmarkButton.evaluate((el) => el === document.activeElement),
    true
  );
  assert.notEqual(
    await page.evaluate(() => document.body.style.overflow),
    "hidden"
  );
  assert.equal(page.url(), config.origin + "/platform/invitations");
  ok(
    "Bookmark help offers verified browser controls, clean app URL and truthful copy fallback; Escape restores focus and preserves the invitation destination"
  );

  await promptOffer(page);
  await help(page)
    .getByRole("button", { name: "Install the app", exact: true })
    .click();
  const install = page.getByRole("dialog", {
    name: "Install Godschurches",
    exact: true
  });
  await install.waitFor();
  assert.equal(await page.evaluate(() => window.installCalls), 0);
  await install
    .getByRole("button", { name: "Install app", exact: true })
    .click();
  await install
    .getByText("Installation dismissed. You can keep using this browser.", {
      exact: true
    })
    .waitFor();
  assert.equal(await page.evaluate(() => window.installCalls), 1);
  await page.keyboard.press("Escape");
  await help(page)
    .getByRole("button", { name: "Continue in browser", exact: true })
    .click();
  await help(page).waitFor({ state: "hidden" });
  await page.waitForFunction(
    () => document.activeElement?.id === "platform-content"
  );
  assert.equal(
    await page
      .locator("#platform-content")
      .evaluate((el) => el === document.activeElement),
    true
  );
  await page.reload();
  await settled(page);
  assert.equal(await help(page).count(), 0);
  assert.deepEqual(
    await db.friendAcceptance.findUnique({
      where: { signupRecipientId: newcomer.id }
    }),
    consent
  );
  await go("/platform/menu");
  await settled(page);
  assert.equal(await help(page).count(), 0);
  assert.equal(
    await page
      .getByRole("complementary", { name: "Home Screen installation" })
      .count(),
    0
  );
  await page
    .getByRole("button", { name: /Bookmark God’s Churches Save the app page/ })
    .click();
  await page
    .getByRole("dialog", { name: "Bookmark God’s Churches", exact: true })
    .waitFor();
  await page.keyboard.press("Escape");
  ok(
    "Installation uses an explicit capability-backed click; dismissal and Continue persist through navigation/reload while consent and permanent Menu help remain intact"
  );

  const installed = await browser.newContext();
  await installed.addCookies(createdCookies);
  await installed.addInitScript(() =>
    Object.defineProperty(navigator, "standalone", {
      configurable: true,
      value: true
    })
  );
  const installedPage = await installed.newPage();
  installedPage.on("pageerror", (e) =>
    errors.push({
      path: new URL(installedPage.url()).pathname,
      message: e.message
    })
  );
  await installedPage.goto(config.origin + "/platform/invitations");
  await settled(installedPage);
  assert.equal(await help(installedPage).count(), 0);
  await installed.close();
  const other = await createPortalActor(db, "signup_help_other");
  const wrongOwner = await browser.newContext();
  await wrongOwner.addCookies(createdCookies);
  await wrongOwner.addCookies([actorCookie(other.token)]);
  const otherPage = await wrongOwner.newPage();
  otherPage.on("pageerror", (e) =>
    errors.push({ path: new URL(otherPage.url()).pathname, message: e.message })
  );
  await otherPage.goto(config.origin + "/platform?registered=1#created=true");
  await settled(otherPage);
  assert.equal(await help(otherPage).count(), 0);
  await wrongOwner.clearCookies();
  await otherPage.goto(
    config.origin + "/platform/signup?registered=1#created=true"
  );
  await noInstallBeforeSignup(otherPage);
  await wrongOwner.close();
  ok(
    "Installed-mode signal suppresses optional help; a different signed-in owner or forged URL cannot establish signup completion"
  );

  const duplicateContext = await browser.newContext();
  const duplicatePage = await duplicateContext.newPage();
  duplicatePage.on("pageerror", (e) =>
    errors.push({
      path: new URL(duplicatePage.url()).pathname,
      message: e.message
    })
  );
  await duplicatePage.goto(url);
  await fillSignup(duplicatePage, { ...credentials(), email: input.email });
  await duplicatePage
    .locator("#account-register-form button[type=submit]")
    .click();
  await duplicatePage.locator("#account-login-form").waitFor();
  await logIn(duplicatePage, input, "/platform/invitations");
  assert.equal(await help(duplicatePage).count(), 0);
  const retained = await db.platformUser.findUniqueOrThrow({
    where: { id: newcomer.id }
  });
  assert.equal(retained.name, newcomer.name);
  assert.equal(retained.username, newcomer.username);
  assert.equal(retained.passwordHash, newcomer.passwordHash);
  assert.deepEqual(
    await db.friendAcceptance.findUnique({
      where: { signupRecipientId: newcomer.id }
    }),
    consent
  );
  await duplicateContext.close();
  ok(
    "Duplicate registration cannot change the existing account, overwrite accepted consent or masquerade as newly created after sign-in"
  );

  const declinedContext = await browser.newContext({
    viewport: { width: 390, height: 844 }
  });
  const declinedPage = await declinedContext.newPage();
  declinedPage.on("pageerror", (e) =>
    errors.push({
      path: new URL(declinedPage.url()).pathname,
      message: e.message
    })
  );
  await declinedPage.goto(url);
  await declinedPage
    .getByRole("link", { name: "Join without connecting", exact: true })
    .click();
  assert.equal(declinedPage.url(), config.origin + "/platform/signup");
  const declinedInput = credentials();
  await fillSignup(declinedPage, declinedInput);
  await declinedPage
    .locator("#account-register-form button[type=submit]")
    .click();
  await declinedPage.locator("#account-login-form").waitFor();
  await logIn(declinedPage, declinedInput, "/platform");
  await help(declinedPage).waitFor();
  const declined = await db.platformUser.findUniqueOrThrow({
    where: { email: declinedInput.email }
  });
  assert.equal(
    await db.friendAcceptance.count({
      where: { signupRecipientId: declined.id }
    }),
    0
  );
  assert.equal(
    await db.platformFollow.count({
      where: { OR: [{ followerId: declined.id }, { followingId: declined.id }] }
    }),
    0
  );
  await help(declinedPage)
    .getByRole("button", { name: "Continue in browser", exact: true })
    .click();
  await declinedContext.close();
  ok(
    "Join without connecting creates an ordinary account with optional post-signup help and no invitation acceptance or friendship"
  );
  assert.deepEqual(errors, []);
  writeFileSync(
    output + "/results.json",
    JSON.stringify(
      { results, errors, origin: config.origin, isolated: true },
      null,
      2
    )
  );
} finally {
  await browser.close();
  await db.$disconnect();
}
