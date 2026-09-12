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
const output = fixtureDir + "/privacy-settings-browser";
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
const { readSettingsContext } =
  await import("../lib/platform/settings-context.ts");
try {
  const a = await createPortalActor(db, "privacyoverview"),
    b = await createPortalActor(db, "otheroverview");
  await signIn(a);
  await go("/platform/settings/privacy");
  const overview = page.getByRole("region", {
    name: "Current privacy choices",
    exact: true
  });
  await overview.waitFor();
  await overview
    .getByText("Any eligible member who can view the conversation", {
      exact: true
    })
    .waitFor();
  await overview
    .getByText("Visible to permitted signed-in members", { exact: true })
    .waitFor();
  assert.equal(await overview.locator("input,select").count(), 0);
  for (const required of [
    "Search opt-out",
    "Church-private content",
    "reply permissions",
    "Family-managed and QR-only",
    "sign-in email stays private"
  ])
    assert.ok((await overview.innerText()).includes(required));
  assert.ok(!(await overview.innerText()).includes(a.email));
  ok(
    "Overview shows effective existing defaults, scope boundaries and unavailable extensions without fabricated switches or private contact"
  );

  for (const mentions of ["FOLLOWED", "NOBODY"]) {
    await overview
      .getByRole("link", {
        name: "Edit mention and relationship choices",
        exact: true
      })
      .click();
    await page
      .getByLabel("Who may mention you", { exact: true })
      .selectOption(mentions);
    await page
      .getByLabel("Show relationship counts on my profile", { exact: true })
      .uncheck();
    await page
      .getByRole("button", { name: "Save privacy choices", exact: true })
      .click();
    await page.getByText("Privacy choices saved.", { exact: true }).waitFor();
    await page
      .getByRole("link", {
        name: "Back to Privacy and interactions",
        exact: true
      })
      .click();
    await overview.waitFor();
    await overview
      .getByText(
        mentions === "FOLLOWED"
          ? "People you follow who can view the conversation"
          : "No one",
        { exact: true }
      )
      .waitFor();
    await overview
      .getByText("Hidden from other members", { exact: true })
      .waitFor();
    assert.equal(
      (await readSettingsContext(db, a.token)).privacy.mentions,
      mentions
    );
  }
  ok(
    "Actual versioned privacy editor saves both restricted mention modes and hidden counts; return shows confirmed values"
  );

  await page.route("**/api/platform/settings", async (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ message: "Fictional failed privacy refresh" })
    })
  );
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  assert.equal(await overview.isVisible(), false);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page
    .getByText("Fictional failed privacy refresh", { exact: true })
    .waitFor();
  assert.equal(await overview.isVisible(), false);
  await page.unroute("**/api/platform/settings");
  await page
    .getByRole("button", { name: "Retry settings", exact: true })
    .click();
  await overview.getByText("No one", { exact: true }).waitFor();
  await page.route("**/api/platform/settings", async (route) => {
    const response = await route.fetch();
    const data = await response.json();
    data.privacy = { ...data.privacy, mentions: "UNKNOWN" };
    await route.fulfill({ response, json: data });
  });
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page
    .getByText("Privacy choices could not be checked. Retry settings.", {
      exact: true
    })
    .waitFor();
  assert.equal(await overview.isVisible(), false);
  await page.unroute("**/api/platform/settings");
  await page
    .getByRole("button", { name: "Retry settings", exact: true })
    .click();
  await overview.getByText("No one", { exact: true }).waitFor();
  ok(
    "Failed and unrecognized context reads conceal prior values; retry restores the actual restricted choices without a permissive fallback"
  );

  await page.setViewportSize({ width: 390, height: 844 });
  await overview.scrollIntoViewIfNeeded();
  await page.screenshot({ path: output + "/privacy-390.png" });
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(
      () => (document.documentElement.style.fontSize = "32px")
    );
    await bounded();
    await page.evaluate(() => (document.documentElement.style.fontSize = ""));
  }
  await overview
    .getByRole("link", {
      name: "Review profile and optional contacts",
      exact: true
    })
    .focus();
  await page.keyboard.press("Enter");
  await page.waitForURL("**/platform/settings/profile");
  await page.locator("#setting-profile-contacts").waitFor();
  await page.goBack();
  await overview.waitFor();
  ok(
    "Overview reflows at phone and desktop doubled text; keyboard profile link and Back retain the actual Privacy destination"
  );

  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await signIn(b);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await overview
    .getByText("Any eligible member who can view the conversation", {
      exact: true
    })
    .waitFor();
  assert.equal(await overview.getByText("No one", { exact: true }).count(), 0);
  assert.equal(
    (await readSettingsContext(db, a.token)).privacy.mentions,
    "NOBODY"
  );
  assert.equal(
    (await readSettingsContext(db, b.token)).privacy.mentions,
    "EVERYONE"
  );
  await context.clearCookies();
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page.waitForURL("**/platform/join?**");
  assert.equal(
    new URL(page.url()).searchParams.get("next"),
    "/platform/settings/privacy"
  );
  assert.equal(await overview.count(), 0);
  ok(
    "Replacement account receives only its own effective privacy; an ended sign-in clears the overview and preserves the sign-in return"
  );
  assert.deepEqual(errors, []);
  writeFileSync(
    output + "/result.json",
    JSON.stringify({ passed: results.length, results, errors }, null, 2)
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
