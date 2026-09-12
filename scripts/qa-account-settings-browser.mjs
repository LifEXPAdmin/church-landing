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
const output = fixtureDir + "/account-settings-browser";
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
try {
  const a = await createPortalActor(db, "accountfolder", { verified: false });
  const { loginAccount, readAccountSession } =
    await import("../lib/platform/accounts.ts");
  const { requestEmailChange } =
    await import("../lib/platform/account-email-change.ts");
  let other = await loginAccount(db, a.email, a.password, null);
  await signIn(a);
  await go("/platform/settings/account");
  const summary = page.getByRole("region", {
    name: "Private account summary",
    exact: true
  });
  await summary.waitFor();
  assert.ok((await summary.innerText()).includes(a.name));
  assert.ok((await summary.innerText()).includes("@" + a.username));
  assert.ok(!(await summary.innerText()).includes(a.email));
  await summary.getByText("Not verified", { exact: true }).waitFor();
  await summary
    .getByRole("link", { name: "Review email verification", exact: true })
    .waitFor();
  await page
    .getByText(/Username changes are not available after signup/)
    .waitFor();
  assert.equal(await page.locator('input[name="username"]').count(), 0);
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(
      () => (document.documentElement.style.fontSize = "32px")
    );
    await bounded();
    await page.screenshot({
      path: output + "/account-" + width + ".png",
      fullPage: true
    });
    await page.evaluate(() => (document.documentElement.style.fontSize = ""));
  }
  await page.setViewportSize({ width: 390, height: 844 });
  ok(
    "Account folder identifies the account with masked sign-in contact, truthful verification and usable links at narrow/enlarged widths"
  );

  await page.locator("#setting-account-sessions").focus();
  await page.keyboard.press("Enter");
  await page.waitForURL("**/settings/account/sessions");
  await page
    .getByRole("button", { name: "Show active sign-ins", exact: true })
    .click();
  const list = page.getByRole("list", { name: "Active sign-ins", exact: true });
  await list.waitFor();
  assert.match(await list.locator("li").first().innerText(), /This sign-in/);
  assert.match(await list.innerText(), /Browser on unknown device/);
  await page
    .getByText(/Location and last-used information are unavailable/)
    .waitFor();
  const pw = page.getByLabel("Current password for other sign-ins", {
    exact: true
  });
  await pw.fill("Wrong-password-1");
  await page
    .getByRole("button", { name: "Sign out other sessions", exact: true })
    .click();
  await page.locator("#session-feedback[role=alert]").waitFor();
  assert.ok(await readAccountSession(db, other));
  await page
    .getByRole("button", { name: "Refresh sign-in list", exact: true })
    .click();
  await list.waitFor();
  await pw.fill(a.password);
  await page
    .getByRole("button", { name: "Sign out other sessions", exact: true })
    .click();
  await page
    .getByText("Only this sign-in is active.", { exact: true })
    .waitFor();
  assert.equal(await readAccountSession(db, other), null);
  assert.ok(await readAccountSession(db, a.token));
  await page
    .getByRole("link", { name: "change your password", exact: true })
    .click();
  await page.waitForURL("**/settings/security/password");
  await page.goBack();
  await page
    .getByRole("heading", {
      level: 1,
      name: "Devices and sessions",
      exact: true
    })
    .waitFor();
  ok(
    "Current-first safe session labels, wrong-password preservation, confirmed revoke refresh and real password-folder link"
  );

  other = await loginAccount(db, a.email, a.password, null);
  let revokeCount = 0;
  await page.route("**/api/platform/account", async (route) => {
    const body = route.request().postDataJSON();
    if (body?.operation !== "revoke-other-sessions") return route.continue();
    revokeCount++;
    const r = await route.fetch();
    assert.equal(r.status(), 200);
    return route.abort("failed");
  });
  await pw.fill(a.password);
  await page
    .getByRole("button", { name: "Sign out other sessions", exact: true })
    .click();
  await page.locator("#session-feedback[role=alert]").waitFor();
  assert.match(
    await page.locator("#session-feedback").innerText(),
    /could not confirm|Refresh the sign-in list/
  );
  assert.equal(await readAccountSession(db, other), null);
  await page
    .getByRole("button", { name: "Refresh sign-in list", exact: true })
    .click();
  await page
    .getByText("Only this sign-in is active.", { exact: true })
    .waitFor();
  assert.equal(revokeCount, 1);
  await page.unroute("**/api/platform/account");
  ok(
    "Lost revoke acknowledgement offers a fresh read and never automatically repeats revocation"
  );

  other = await loginAccount(db, a.email, a.password, null);
  let committed = false;
  revokeCount = 0;
  await page.route("**/api/platform/account", async (route) => {
    const body = route.request().postDataJSON();
    if (body?.operation === "revoke-other-sessions") {
      revokeCount++;
      const r = await route.fetch();
      assert.equal(r.status(), 200);
      committed = true;
      return route.fulfill({ response: r });
    }
    if (committed && body?.operation === "list-sessions")
      return route.fulfill({
        status: 503,
        json: { message: "Fixture list unavailable." }
      });
    return route.continue();
  });
  await pw.fill(a.password);
  await page
    .getByRole("button", { name: "Sign out other sessions", exact: true })
    .click();
  await page
    .getByText(
      "Other sessions were signed out, but the updated list could not be loaded. Refresh the sign-in list to check.",
      { exact: true }
    )
    .waitFor();
  assert.equal(await readAccountSession(db, other), null);
  assert.ok(await readAccountSession(db, a.token));
  await page.unroute("**/api/platform/account");
  await page
    .getByRole("button", { name: "Refresh sign-in list", exact: true })
    .click();
  await page
    .getByText("Only this sign-in is active.", { exact: true })
    .waitFor();
  assert.equal(revokeCount, 1);
  ok(
    "A confirmed revoke followed by failed list read keeps truthful distinct status and an independent read retry"
  );

  const before = await db.platformUser.findUniqueOrThrow({
    where: { id: a.id }
  });
  let sent = 0;
  const delivery = await requestEmailChange(
    db,
    a.token,
    a.password,
    "changed_" + randomUUID().slice(0, 8) + "@example.test",
    async () => {
      sent++;
    }
  );
  await delivery();
  assert.equal(sent, 1);
  assert.deepEqual(
    await db.platformUser.findUniqueOrThrow({ where: { id: a.id } }),
    before
  );
  assert.ok(
    await readAccountSession(
      db,
      await loginAccount(db, a.email, a.password, null)
    )
  );
  await go("/platform/settings/account/email");
  await page
    .getByText(
      "Sign-in email changes are not available until email delivery is ready. Your existing sign-in email is unchanged.",
      { exact: true }
    )
    .waitFor();
  assert.equal(await page.locator('input[name="newEmail"]').count(), 0);
  await page
    .getByText(
      /Your existing sign-in email keeps working until you confirm the new address/
    )
    .waitFor();
  await page
    .getByRole("link", { name: "Back to Account", exact: true })
    .click();
  await summary.waitFor();
  await page.locator("#setting-account-identity").click();
  await page.waitForURL("**/settings/account/identity");
  await page
    .getByRole("button", { name: "Log out on this device", exact: true })
    .waitFor();
  assert.ok(!(await summary.innerText()).includes(a.email));
  ok(
    "Pending email request preserves old sign-in/profile data; disabled delivery has honest folder guidance and account-summary return"
  );
  assert.deepEqual(errors, []);
  writeFileSync(
    output + "/result.json",
    JSON.stringify({ results, errors }, null, 2)
  );
  console.log("ACCOUNT_SETTINGS_BROWSER_PASS " + results.length);
} finally {
  await browser.close();
  await db.$disconnect();
}
