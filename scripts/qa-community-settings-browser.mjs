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
await context.route("**/*", (route) =>
  new URL(route.request().url()).hostname === "127.0.0.1"
    ? route.continue()
    : route.abort()
);
context.setDefaultTimeout(15000);
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
const output = fixtureDir + "/community-settings-browser-" + Date.now();
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
try {
  const a = await createPortalActor(db, "communitysettingsa");
  const b = await createPortalActor(db, "communitysettingsb");
  await signIn(a);
  const before = await db.socialPreferences.findUnique({
    where: { ownerId: a.id }
  });
  await go("/platform/settings");
  await page.locator("#folder-communities").click();
  await page.waitForURL("**/settings/communities");
  await page
    .getByRole("region", { name: "Your participation and privacy" })
    .waitFor();
  await bounded();
  const expected = {
    "#setting-communities-groups": "/platform/groups/mine",
    "#setting-communities-invitations": "/platform/groups/invitations",
    "#related-privacy-messages": "/platform/settings/privacy/messages",
    "#related-calendar-commitments": "/platform/commitments",
    "#related-calendar-sharing": "/platform/calendars",
    "#related-notifications-availability":
      "/platform/settings/notifications/availability"
  };
  for (const [selector, path] of Object.entries(expected))
    assert.equal(await page.locator(selector).getAttribute("href"), path);
  assert.equal(await page.locator("main select").count(), 0);
  assert.doesNotMatch(
    await page.locator("main").innerText(),
    /Open creator preferences|Storefront alerts|Foundry preferences/
  );
  assert.deepEqual(
    await db.socialPreferences.findUnique({ where: { ownerId: a.id } }),
    before
  );
  ok(
    "Communities folder keeps six canonical destinations, no false future controls and unchanged stored choices"
  );
  for (const [selector, path] of Object.entries(expected)) {
    await page.locator(selector).click();
    await page.waitForURL((url) => url.pathname === path);
    await page.getByRole("heading", { level: 1 }).waitFor();
    if (path === "/platform/groups/invitations")
      await page
        .getByText(
          "No groups on this page. Try another search or continue to the next page.",
          { exact: true }
        )
        .waitFor();
    await page.goBack();
    await page.waitForURL("**/settings/communities");
    await page.locator(selector).waitFor();
  }
  ok(
    "All six links and browser Back return to the same personal Settings folder"
  );
  await go("/platform/settings");
  const search = page.getByLabel("Search settings", { exact: true });
  await search.fill("group invitation audience");
  await page.locator("#setting-privacy-messages").click();
  await page
    .getByLabel("Who can send you a request", { exact: true })
    .waitFor();
  assert.equal(
    await page
      .getByLabel("Who can send you a request", { exact: true })
      .inputValue(),
    "NOBODY"
  );
  await page
    .getByLabel("Who can send you a request", { exact: true })
    .selectOption("FOLLOWED");
  const saving = page.waitForResponse(
    (r) =>
      r.request().method() === "POST" &&
      new URL(r.url()).pathname.includes("contact")
  );
  await page
    .getByRole("button", { name: "Save contact preferences", exact: true })
    .click();
  assert.equal((await saving).status(), 200);
  await page.waitForFunction(
    () =>
      document.querySelector('[aria-label="Contact preferences"] button')
        ?.disabled === true
  );
  assert.equal(
    (await db.socialPreferences.findUniqueOrThrow({ where: { ownerId: a.id } }))
      .contactRequests,
    "FOLLOWED"
  );
  await page.reload();
  await page
    .getByLabel("Who can send you a request", { exact: true })
    .waitFor();
  assert.equal(
    await page
      .getByLabel("Who can send you a request", { exact: true })
      .inputValue(),
    "FOLLOWED"
  );
  assert.match(
    await page.locator("main").innerText(),
    /also controls who may send you a group invitation/
  );
  assert.doesNotMatch(
    await page.locator("main").innerText(),
    /group invitations are unavailable/
  );
  await page.goBack();
  await search.waitFor();
  assert.equal(await search.inputValue(), "group invitation audience");
  ok(
    "Invitation-audience search reuses actual contact save and reload; Back retains the query"
  );
  await go("/platform/settings/communities");
  await page.locator("#related-notifications-availability").click();
  const groupAlerts = page
    .getByRole("group", {
      name: "Group membership and leadership",
      exact: true
    })
    .getByRole("checkbox", { name: /^Phone alerts/ });
  const eventAlerts = page
    .getByRole("group", {
      name: "Event changes, new church volunteer requests and commitments",
      exact: true
    })
    .getByRole("checkbox", { name: /^Phone alerts/ });
  await groupAlerts.waitFor();
  assert.equal(await groupAlerts.isChecked(), false);
  assert.equal(await eventAlerts.isChecked(), false);
  await page.goBack();
  await page.locator("#setting-communities-groups").waitFor();
  ok(
    "Canonical notification settings preserve separate initially-off group and event choices"
  );
  let denied = true;
  await page.route("**/api/platform/settings", (route) =>
    denied
      ? route.fulfill({
          status: 403,
          contentType: "application/json",
          body: JSON.stringify({
            error: "Current settings access is unavailable."
          })
        })
      : route.continue()
  );
  await page.reload();
  await page
    .getByRole("button", { name: "Retry settings", exact: true })
    .waitFor();
  assert.equal(await page.locator("#setting-communities-groups").count(), 0);
  denied = false;
  await page
    .getByRole("button", { name: "Retry settings", exact: true })
    .click();
  await page.locator("#setting-communities-groups").waitFor();
  await page.unroute("**/api/platform/settings");
  ok(
    "Denied Settings context conceals destinations and explicit retry restores current access"
  );
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  assert.equal(
    await page.locator("#setting-communities-groups").isVisible(),
    false
  );
  await signIn(b);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page.locator("#setting-communities-groups").waitFor();
  await page.locator("#related-privacy-messages").click();
  await page
    .getByLabel("Who can send you a request", { exact: true })
    .waitFor();
  assert.equal(
    await page
      .getByLabel("Who can send you a request", { exact: true })
      .inputValue(),
    "NOBODY"
  );
  assert.equal(
    (await db.socialPreferences.findUniqueOrThrow({ where: { ownerId: a.id } }))
      .contactRequests,
    "FOLLOWED"
  );
  ok(
    "Blur and account change conceal the old account and retain independent invitation preferences"
  );
  await go("/platform/settings/communities");
  await page.locator("#setting-communities-groups").waitFor();
  await page.setViewportSize({ width: 320, height: 844 });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.evaluate(() => (document.documentElement.style.fontSize = "24px"));
  await bounded();
  await page.screenshot({
    path: output + "/communities-320-enlarged.png",
    fullPage: true
  });
  ok(
    "Communities folder stays within 320px with enlarged text and dark preference"
  );
  await context.clearCookies();
  await go("/platform/settings/communities?ownerId=other&operation=join");
  const join = new URL(page.url());
  assert.equal(join.pathname, "/platform/join");
  assert.equal(join.searchParams.get("next"), "/platform/settings/communities");
  const body = await page.locator("main").innerText();
  assert.doesNotMatch(body, new RegExp(a.email + "|" + b.email));
  ok(
    "Guest sign-in return preserves the registered folder without private input or action replay"
  );
  assert.deepEqual(errors, []);
  writeFileSync(
    output + "/receipt.json",
    JSON.stringify(
      {
        at: new Date().toISOString(),
        results,
        errors,
        fixtureOnly: true,
        physicalDeviceVerified: false
      },
      null,
      2
    )
  );
  console.log("ACCEPTED " + JSON.stringify({ checks: results.length, output }));
} catch (error) {
  await page
    .screenshot({ path: output + "/failure.png", fullPage: true })
    .catch(() => {});
  writeFileSync(
    output + "/failure.json",
    JSON.stringify(
      {
        results,
        errors,
        message: error.message,
        path: new URL(page.url()).pathname
      },
      null,
      2
    )
  );
  throw error;
} finally {
  await browser.close();
  await db.$disconnect();
}
