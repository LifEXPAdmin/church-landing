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
const output = fixtureDir + "/friend-invitations-browser";
mkdirSync(output, { recursive: true });
const go = async (path) => {
  await page.goto(config.origin + path);
};
const bounded = async () =>
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1
    ),
    "No horizontal page overflow"
  );

const signIn = async (actor) =>
  context.addCookies([
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

const { randomUUID } = await import("node:crypto");
const { default: jsQR } = await import("jsqr");
await context.addInitScript(() => {
  window.__shareMode = "cancel";
  window.__copied = [];
  window.__shared = [];
  window.__clipboardFail = false;
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: {
      writeText: async (text) => {
        if (window.__clipboardFail)
          throw new DOMException("Denied", "NotAllowedError");
        window.__copied.push(text);
      }
    }
  });
  Object.defineProperty(navigator, "share", {
    configurable: true,
    value: location.pathname.includes("/churches/")
      ? undefined
      : async (data) => {
          if (window.__shareMode === "cancel")
            throw new DOMException("Canceled", "AbortError");
          window.__shared.push(data);
        }
  });
});
const { createPortalActor } = await import("../tests/seed-portal.ts");
const { friendInvitationCommand, readFriendInvitations } =
  await import("../lib/platform/friend-invitations.ts");
const { requestAccountGrant } = await import("../lib/platform/accounts.ts");
const { handleAccountRequest } =
  await import("../lib/platform/account-boundary.ts");
const { relationshipCommand, readRelationships } =
  await import("../lib/platform/relationships.ts");
const sharp = (await import("sharp")).default;
const edges = (a, b) =>
  db.platformFollow.count({
    where: {
      OR: [
        { followerId: a, followingId: b },
        { followerId: b, followingId: a }
      ]
    }
  });
try {
  const owner = await createPortalActor(db, "personal_qr"),
    member = await createPortalActor(db, "friend_member");
  await signIn(owner);
  await go("/platform/menu");
  await page
    .getByRole("list", { name: "Quick sharing" })
    .getByRole("link", { name: /My QR code/ })
    .click();
  await page.getByLabel(/I agree to become friends automatically/).check();
  await page
    .getByRole("button", { name: "Enable my invitation", exact: true })
    .click();
  await page.getByLabel("Your invitation link", { exact: true }).waitFor();
  const url = await page
    .getByLabel("Your invitation link", { exact: true })
    .inputValue();
  assert.equal(url, (await readFriendInvitations(db, owner.token)).url);
  const qr = page.getByRole("region", { name: "Personal invitation QR code" });
  await page.waitForFunction(
    () =>
      !document.querySelector(
        'section[aria-label="Personal invitation QR code"] button'
      )?.disabled
  );
  const pixels = await qr.locator("canvas").evaluate((c) => ({
    data: Array.from(
      c.getContext("2d").getImageData(0, 0, c.width, c.height).data
    ),
    width: c.width,
    height: c.height
  }));
  assert.equal(
    jsQR(new Uint8ClampedArray(pixels.data), pixels.width, pixels.height)?.data,
    url
  );
  const box = await qr.locator("canvas").boundingBox();
  assert.ok(Math.abs(box.width - box.height) < 1, "Displayed QR stays square");
  await page.locator("h1").click();
  const visiblePng = await qr.locator("canvas").screenshot();
  const visible = await sharp(visiblePng)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  assert.equal(
    jsQR(
      new Uint8ClampedArray(visible.data),
      visible.info.width,
      visible.info.height
    )?.data,
    url
  );
  const downloadP = page.waitForEvent("download");
  await qr.getByRole("button", { name: "Download QR PNG" }).click();
  const download = await downloadP;
  await download.saveAs(output + "/personal-qr.png");
  const raw = await sharp(output + "/personal-qr.png")
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  assert.equal(
    jsQR(new Uint8ClampedArray(raw.data), raw.info.width, raw.info.height)
      ?.data,
    url
  );
  // The outermost four-module quiet zone stays opaque white.
  assert.deepEqual([...raw.data.subarray(0, 4)], [255, 255, 255, 255]);
  await page
    .getByRole("button", { name: "Copy invitation link", exact: true })
    .click();
  await page.getByText("Invitation link copied.", { exact: true }).waitFor();
  assert.equal((await page.evaluate(() => window.__copied)).at(-1), url);
  await page
    .getByRole("button", { name: "Share invitation", exact: true })
    .click();
  await page.getByText("Sharing canceled.", { exact: true }).waitFor();
  await page.evaluate(() => (window.__shareMode = "success"));
  await page
    .getByRole("button", { name: "Share invitation", exact: true })
    .click();
  await page.getByText("Share dialog completed.", { exact: true }).waitFor();
  assert.equal((await page.evaluate(() => window.__shared)).at(-1).url, url);
  await page.evaluate(() => (window.__clipboardFail = true));
  await page
    .getByRole("button", { name: "Copy invitation link", exact: true })
    .click();
  await page.getByText(/Sharing could not be confirmed/).waitFor();
  assert.equal(
    await page.getByLabel("Your invitation link", { exact: true }).inputValue(),
    url
  );
  await page.locator("h1").click();
  await page.screenshot({
    path: output + "/personal-qr-phone.png",
    fullPage: true
  });
  ok(
    "Explicit enable; displayed and downloaded personal QR decode to the same server URL as Copy/Share; cancellation and clipboard fallback are honest"
  );
  for (const signedIn of [true, false]) {
    if (!signedIn) await context.clearCookies();
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 844 });
      await go("/platform/menu");
      const link = page
        .getByRole("list", { name: "Quick sharing" })
        .getByRole("link");
      assert.match(
        await link.innerText(),
        signedIn ? /My QR code/ : /Share Godschurches/
      );
      const rect = await link.boundingBox();
      assert.ok(rect.y + rect.height < 844);
      await link.focus();
      await page.keyboard.press("Enter");
      await page
        .getByRole("region", {
          name: signedIn ? "Personal invitation QR code" : "Public link QR code"
        })
        .waitFor();
      await bounded();
      await page.evaluate(
        () => (document.documentElement.style.fontSize = "200%")
      );
      await bounded();
      await page.goBack();
      await page.waitForURL("**/platform/menu");
    }
  }
  ok(
    "Signed-in and guest Menu shortcuts are visible at 320/390, open QR in one tap, support keyboard/Back and enlarged text"
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(url);
  await page
    .getByRole("link", { name: "Join without connecting", exact: true })
    .click();
  assert.equal(new URL(page.url()).searchParams.has("friendInvitation"), false);
  await page.goto(url);
  await page
    .getByRole("link", { name: /Create account and connect with/ })
    .click();
  const username = "qr_" + randomUUID().replaceAll("-", "").slice(0, 14),
    email = username + "@example.test",
    password = "Fictional-" + randomUUID();
  const form = page.locator("#account-register-form");
  for (const [name, value] of Object.entries({
    name: "Fictional invited newcomer",
    username,
    email,
    password,
    confirmPassword: password
  }))
    await form.locator(`[name=${name}]`).fill(value);
  await form
    .getByRole("button", { name: /Create account and connect with/ })
    .click();
  await page.locator("#account-login-form").waitFor();
  const newcomer = await db.platformUser.findUniqueOrThrow({
    where: { email }
  });
  assert.equal(
    (
      await db.friendAcceptance.findUnique({
        where: { signupRecipientId: newcomer.id }
      })
    ).inviterId,
    owner.id
  );
  assert.equal(await edges(owner.id, newcomer.id), 0);
  await page.locator("#account-login-email").fill(email);
  await page.locator("#account-login-password").fill(password);
  await page.locator("#account-login-form button[type=submit]").click();
  await page.waitForURL("**/platform/invitations");
  await page
    .getByRole("region", { name: "Signup connection" })
    .getByText(/Your signup invitation from/)
    .waitFor();
  await page
    .getByLabel("I confirm that I am at least 18 years old.", { exact: true })
    .check();
  await page
    .getByRole("button", { name: "Confirm adult eligibility", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirm adult eligibility", exact: true })
    .waitFor({ state: "hidden" });
  assert.equal(await edges(owner.id, newcomer.id), 0);
  // Same real verification boundary, invoked in test-sink mode without a browser
  // cookie. Production-mode fixture intentionally has external mail disabled.
  let grant = "";
  await requestAccountGrant(db, email, "VERIFY_EMAIL", async (_e, _p, t) => {
    grant = t;
  });
  const otherBrowser = await browser.newContext();
  const otherPage = await otherBrowser.newPage();
  await otherPage.goto(
    config.origin +
      "/platform/account/verify#token=" +
      grant +
      "&purpose=VERIFY_EMAIL"
  );
  assert.equal(await edges(owner.id, newcomer.id), 0);
  const verified = await handleAccountRequest(
    db,
    new Request(config.origin + "/api/platform/account", {
      method: "POST",
      headers: { Origin: config.origin, "Content-Type": "application/json" },
      body: JSON.stringify({ operation: "consume-verification", token: grant })
    })
  );
  assert.equal(verified.status, 200);
  await otherBrowser.close();
  await page.reload();
  await page
    .getByRole("heading", { name: `You’re connected with ${owner.name}` })
    .waitFor();
  assert.equal(await edges(owner.id, newcomer.id), 2);
  await page
    .getByRole("region", { name: "Signup connection" })
    .getByRole("link", { name: "Open profile" })
    .click();
  await page
    .getByText(`Connections with ${owner.name}`, { exact: true })
    .click();
  await page
    .getByRole("button", { name: "Friends — remove friendship", exact: true })
    .waitFor();
  ok(
    "Real signup and adult acknowledgement preserve chosen inviter; independent-browser verification boundary connects atomically and profile confirms friendship"
  );
  await context.clearCookies();
  await signIn(member);
  await page.goto(url);
  assert.equal(await edges(owner.id, member.id), 0);
  await page
    .getByRole("button", { name: `Connect with ${owner.name}`, exact: true })
    .click();
  await page
    .getByRole("heading", { name: `You’re connected with ${owner.name}` })
    .waitFor();
  assert.equal(await edges(owner.id, member.id), 2);
  await page.reload();
  await page
    .getByRole("heading", { name: `You’re connected with ${owner.name}` })
    .waitFor();
  const current = await readRelationships(db, member.token, {
    view: "status",
    kind: "person",
    targetId: owner.id
  });
  await relationshipCommand(db, member.token, {
    operation: "follow",
    kind: "person",
    targetId: owner.id,
    expectedVersion: current.version,
    desired: false,
    mutationId: randomUUID()
  });
  await page.reload();
  await page
    .getByRole("button", { name: `Connect with ${owner.name}`, exact: true })
    .click();
  await page.getByText(/This connection was removed/).waitFor();
  assert.equal(await edges(owner.id, member.id), 0);
  ok(
    "Existing account scanning is inert; explicit acceptance confirms both sides, reload rechecks status, and removed friendship cannot return"
  );
  const retryMember = await createPortalActor(db, "retry_member");
  await context.clearCookies();
  await signIn(retryMember);
  await page.goto(url);
  const bodies = [];
  let loseResponse = true;
  await page.route("**/api/platform/friend-invitations", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }
    bodies.push(route.request().postData());
    const response = await route.fetch();
    assert.equal(response.status(), 200);
    if (loseResponse) {
      loseResponse = false;
      await route.abort("failed");
    } else await route.fulfill({ response });
  });
  await page
    .getByRole("button", { name: `Connect with ${owner.name}`, exact: true })
    .click();
  await page
    .getByRole("button", { name: "Retry unchanged request", exact: true })
    .waitFor();
  await page
    .getByRole("button", { name: "Retry unchanged request", exact: true })
    .click({ trial: true });
  assert.equal(await edges(owner.id, retryMember.id), 2);
  await page
    .getByRole("link", {
      name: "Share the general website instead",
      exact: true
    })
    .click();
  await page
    .getByText("Resolve the pending invitation request before leaving.", {
      exact: true
    })
    .waitFor();
  assert.equal(page.url(), url);
  await page
    .getByRole("button", { name: "Retry unchanged request", exact: true })
    .click();
  await page
    .getByRole("heading", { name: `You’re connected with ${owner.name}` })
    .waitFor();
  assert.equal(bodies.length, 2);
  assert.equal(bodies[0], bodies[1]);
  assert.equal(await edges(owner.id, retryMember.id), 2);
  await page.unroute("**/api/platform/friend-invitations");
  ok(
    "Lost acceptance response retains the exact body, guards navigation and retries without duplicating either friendship edge"
  );
  // An old page must not mutate or display the next signed-in owner's invitation.
  await context.clearCookies();
  await signIn(owner);
  await go("/platform/invitations");
  await page.getByLabel("Your invitation link", { exact: true }).waitFor();
  await context.clearCookies();
  await signIn(member);
  await page
    .getByRole("button", { name: "Revoke invitation", exact: true })
    .click();
  await page.getByText(/Your sign-in changed/).waitFor();
  assert.equal((await readFriendInvitations(db, owner.token)).url, url);
  assert.equal(
    await db.friendInvitation.count({ where: { ownerId: member.id } }),
    0
  );
  const forged = await context.request.post(
    config.origin + "/api/platform/friend-invitations",
    {
      headers: { Origin: config.origin },
      data: {
        operation: "enable",
        mutationId: randomUUID(),
        accountId: owner.id,
        expectedVersion: 0,
        consent: true
      }
    }
  );
  assert.equal(forged.status(), 409);
  const cross = await context.request.post(
    config.origin + "/api/platform/friend-invitations",
    {
      headers: { Origin: "https://elsewhere.invalid" },
      data: {
        operation: "enable",
        mutationId: randomUUID(),
        accountId: member.id,
        expectedVersion: 0,
        consent: true
      }
    }
  );
  assert.equal(cross.status(), 403);
  ok(
    "Changed-account page cannot revoke another invitation; HTTP boundary rejects forged account and cross-origin writes"
  );
  await context.clearCookies();
  await signIn(owner);
  await go("/platform/invitations");
  await page.getByLabel("Your invitation link", { exact: true }).waitFor();
  await friendInvitationCommand(db, owner.token, {
    operation: "revoke",
    mutationId: randomUUID(),
    accountId: owner.id,
    expectedVersion: 1
  });
  await page.getByRole("button", { name: "Download QR PNG" }).click();
  await page
    .getByText("Your invitation changed. Use the current code shown here.", {
      exact: true
    })
    .waitFor();
  assert.equal(
    await page
      .getByRole("region", { name: "Personal invitation QR code" })
      .count(),
    0
  );
  await context.clearCookies();
  await page.goto(url);
  await page
    .getByRole("heading", { name: "This invitation is unavailable" })
    .waitFor();
  await go("/platform/share?qr=1");
  await page.getByRole("region", { name: "Public link QR code" }).waitFor();
  assert.equal(
    await page.getByLabel("Public link", { exact: true }).inputValue(),
    config.origin + "/platform"
  );
  ok(
    "Fresh PNG validation conceals revoked personal codes; invalid welcome and generic sharing remain usable"
  );
  assert.deepEqual(errors, []);
  writeFileSync(
    output + "/results.json",
    JSON.stringify(
      {
        checkedAt: new Date().toISOString(),
        results,
        errors,
        productionWrites: 0,
        physicalDevice: false
      },
      null,
      2
    )
  );
} catch (e) {
  await page.screenshot({ path: output + "/failure.png", fullPage: true });
  writeFileSync(
    output + "/failure.txt",
    await page.locator("body").innerText()
  );
  throw e;
} finally {
  await browser.close();
  await db.$disconnect();
}
