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
const output = fixtureDir + "/media-settings-browser";
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
const external = [];
const writes = [];
page.on("request", (request) => {
  if (new URL(request.url()).origin !== config.origin)
    external.push(request.url());
  if (request.method() !== "GET") writes.push(request.url());
});
try {
  const actor = await createPortalActor(db, "mediasettings");
  await signIn(actor);
  const privacy = await db.socialPreferences.findUnique({
    where: { ownerId: actor.id }
  });
  const appearance = await db.profilePresentation.findUnique({
    where: { userId: actor.id }
  });
  await go("/platform/settings");
  await page.locator("#folder-media").waitFor();
  await page.getByLabel("Search settings", { exact: true }).fill("captions");
  const result = page
    .getByRole("region", { name: "Settings search results" })
    .getByRole("link", { name: /^Captions/ });
  await result.focus();
  await page.keyboard.press("Enter");
  await page.getByRole("region", { name: "Captions", exact: true }).waitFor();
  assert.match(page.url(), /\/settings\/media$/);
  const main = page.locator(".gc-settings-main");
  assert.deepEqual(
    await main.getByRole("heading", { level: 2 }).allTextContents(),
    ["Playback and audio", "Captions", "Quality and data use"]
  );
  assert.equal(
    await main.locator("input, select, video, audio, iframe").count(),
    0
  );
  assert.doesNotMatch(
    await main.innerText(),
    /upload quality|download preference|saved off/i
  );
  assert.match(
    await main
      .getByRole("region", { name: "Captions", exact: true })
      .innerText(),
    /not available here yet/
  );
  ok(
    "Settings search opens separate caption and playback explanations without unsupported controls, uploads or provider embeds"
  );

  await page.goBack();
  await page.getByLabel("Search settings", { exact: true }).waitFor();
  assert.equal(
    await page.getByLabel("Search settings", { exact: true }).inputValue(),
    "captions"
  );
  await page.getByLabel("Search settings", { exact: true }).fill("data saver");
  await page.locator("#setting-media-quality").click();
  const dataLink = page.getByRole("link", {
    name: "Choose Data saver in Appearance and reading",
    exact: true
  });
  await dataLink.waitFor();
  await dataLink.focus();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Shift+Tab");
  assert.equal(
    await dataLink.evaluate((element) => element.matches(":focus-visible")),
    true
  );
  await page.keyboard.press("Enter");
  await page.locator("#reduce-data").waitFor();
  assert.match(page.url(), /\/settings\/display\/reading$/);
  assert.equal(await page.locator("#reduce-data").isChecked(), false);
  await page.locator("#reduce-data").check();
  await page
    .getByRole("button", { name: "Save display choices", exact: true })
    .click();
  await page.waitForFunction(() =>
    decodeURIComponent(document.cookie).includes('"reduceData":true')
  );
  await page.reload();
  await page.locator("#reduce-data:checked").waitFor();
  assert.deepEqual(
    await db.socialPreferences.findUnique({ where: { ownerId: actor.id } }),
    privacy
  );
  assert.deepEqual(
    await db.profilePresentation.findUnique({ where: { userId: actor.id } }),
    appearance
  );
  ok(
    "Data saver reuses the existing keyboard-accessible browser editor, survives reload and leaves account privacy and profile unchanged"
  );

  await go("/platform/settings/media");
  await dataLink.waitFor();
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "32px";
    });
    await bounded();
    await page.screenshot({
      path: output + "/media-" + width + ".png",
      fullPage: true
    });
  }
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "";
  });
  ok(
    "Media layout stays within 320, 390 and 1440 pixel widths with doubled root text"
  );

  await page.route("**/api/platform/settings", (route) =>
    route.fulfill({
      status: 503,
      json: { message: "Fixture settings unavailable." }
    })
  );
  await page.evaluate(() => {
    dispatchEvent(new Event("blur"));
    dispatchEvent(new Event("focus"));
  });
  await page
    .getByRole("button", { name: "Retry settings", exact: true })
    .waitFor();
  assert.equal(await dataLink.isVisible(), false);
  await page.unroute("**/api/platform/settings");
  await page
    .getByRole("button", { name: "Retry settings", exact: true })
    .click();
  await dataLink.waitFor();
  assert.equal(
    await page
      .locator(".gc-settings-main input, .gc-settings-main select")
      .count(),
    0
  );
  ok(
    "Failed access refresh conceals the settings body and retry restores truthful availability without defaulting a missing value"
  );

  await context.clearCookies();
  await go("/platform/settings/media");
  assert.match(page.url(), /\/platform\/(join|login|signup)/);
  assert.equal(
    new URL(page.url()).searchParams.get("next"),
    "/platform/settings/media"
  );
  assert.equal(
    await page.getByRole("region", { name: "Captions", exact: true }).count(),
    0
  );
  ok(
    "Signed-out direct media settings entry preserves its safe return destination and exposes no settings body"
  );

  assert.deepEqual(external, []);
  assert.deepEqual(writes, []);
  assert.deepEqual(errors, []);
  ok(
    "Zero application mutation requests, external provider requests or browser errors"
  );
  writeFileSync(
    output + "/results.json",
    JSON.stringify(
      {
        passed: results.length,
        results,
        errors,
        externalRequests: external.length,
        mutationRequests: writes.length
      },
      null,
      2
    )
  );
} finally {
  await browser.close();
  await db.$disconnect();
}
