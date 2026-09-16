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
const output = fixtureDir + "/language-location-browser";
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

let phase = "entry";
try {
  const a = await createPortalActor(db, "langplace");
  const sharedLocation = "Fictional shared profile area";
  await db.platformUser.update({
    where: { id: a.id },
    data: { location: sharedLocation }
  });
  await context.addInitScript(() => {
    window.__locationRequests = 0;
    const deny = (_success, failure) => {
      window.__locationRequests++;
      failure?.({ code: 1, message: "Fixture device location denied" });
    };
    Object.defineProperty(navigator.geolocation, "getCurrentPosition", {
      value: deny
    });
    Object.defineProperty(navigator.geolocation, "watchPosition", {
      value: deny
    });
    const query = navigator.permissions.query.bind(navigator.permissions);
    navigator.permissions.query = (value) =>
      value.name === "geolocation"
        ? Promise.resolve({
            state: "denied",
            onchange: null,
            addEventListener() {},
            removeEventListener() {}
          })
        : query(value);
  });
  await signIn(a);
  await go("/platform/settings");
  await page
    .getByRole("searchbox", { name: "Search settings", exact: true })
    .fill("city");
  const result = page.locator("#setting-language-discovery");
  await result.waitFor();
  assert.equal(
    await result.getAttribute("href"),
    "/platform/settings/feed/discovery"
  );
  await go("/platform/settings/language");
  await page
    .getByRole("heading", { name: "Language and location", exact: true })
    .waitFor();
  await page.locator("#setting-language-interface").focus();
  await page.keyboard.press("Enter");
  await page.waitForURL("**/settings/language/interface");
  const choices = page.getByRole("region", {
    name: "Language and location choices",
    exact: true
  });
  await choices.waitFor();
  assert.match(await choices.innerText(), /currently available in English/);
  assert.match(await choices.innerText(), /Filtering does not translate/);
  assert.match(
    await choices.innerText(),
    /Only me or permitted signed-in members/s
  );
  assert.equal(await choices.locator("select").count(), 2);
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(
      () => (document.documentElement.style.fontSize = "32px")
    );
    await bounded();
    await page.screenshot({
      path: output + `/language-${width}.png`,
      fullPage: true
    });
    await page.evaluate(() => (document.documentElement.style.fontSize = ""));
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: output + "/language-phone.png",
    fullPage: true
  });
  ok(
    "Settings search, folder and keyboard detail expose English-only guidance and canonical controls at phone and doubled-text sizes"
  );

  phase = "manual-save";
  await choices
    .getByRole("link", {
      name: "Choose discovery area and languages",
      exact: true
    })
    .click();
  await page.waitForURL("**/settings/feed/discovery");
  const form = () =>
    page.getByRole("form", { name: "Save feed settings", exact: true });
  await form().waitFor();
  await form().getByLabel("Saved feed", { exact: true }).selectOption("local");
  await form().getByLabel("Country", { exact: true }).selectOption("US");
  await form()
    .getByLabel("Find a town or area", { exact: true })
    .fill("Chicago");
  await form().getByRole("button", { name: "Find area", exact: true }).click();
  await form()
    .getByRole("button", { name: /^Chicago,/ })
    .first()
    .click();
  await form()
    .getByLabel("Approximate distance between town centers", { exact: true })
    .selectOption("50");
  await form()
    .getByLabel("Reading languages", { exact: true })
    .selectOption(["en", "es"]);
  assert.equal(await page.evaluate(() => window.__locationRequests), 0);
  const save = form().getByRole("button", {
    name: "Save feed settings",
    exact: true
  });
  await save.click();
  await page.waitForFunction(() => {
    const f = document.querySelector('form[aria-label="Save feed settings"]');
    return f && f.getAttribute("data-reader-dirty") === "false";
  });
  let saved = await db.socialPreferences.findUniqueOrThrow({
    where: { ownerId: a.id }
  });
  assert.equal(saved.feedMode, "local");
  assert.equal(saved.discovery.filters.country, "US");
  assert.ok(saved.discovery.filters.placeId);
  assert.equal(saved.discovery.filters.radiusKm, 50);
  assert.deepEqual(saved.discovery.filters.languages, ["en", "es"]);
  assert.equal(
    (await db.platformUser.findUniqueOrThrow({ where: { id: a.id } })).location,
    sharedLocation
  );
  await go("/platform/settings/feed/discovery");
  await form().getByLabel("Reading languages", { exact: true }).waitFor();
  assert.deepEqual(
    await form()
      .getByLabel("Reading languages", { exact: true })
      .evaluate((n) => Array.from(n.selectedOptions, (o) => o.value)),
    ["en", "es"]
  );
  assert.equal(
    await form()
      .getByLabel("Approximate distance between town centers", { exact: true })
      .inputValue(),
    "50"
  );
  assert.equal(await page.evaluate(() => window.__locationRequests), 0);
  ok(
    "Denied device location permits manual town/radius and content-language saving, reload persistence and unchanged shared profile location"
  );

  phase = "lost-response";
  await form()
    .getByLabel("Approximate distance between town centers", { exact: true })
    .selectOption("100");
  const bodies = [];
  let dropped;
  await page.route("**/api/platform/discovery", async (route) => {
    if (route.request().method() === "POST") {
      bodies.push(route.request().postData());
      if (!dropped) {
        dropped = route.request().postData();
        const r = await route.fetch();
        assert.ok([200, 202].includes(r.status()));
        await route.abort("failed");
        return;
      }
    }
    await route.continue();
  });
  await save.click();
  await form()
    .getByRole("button", { name: "Retry the same feed settings", exact: true })
    .waitFor();
  await page.waitForFunction(() =>
    [...document.querySelectorAll('form[aria-label="Save feed settings"] button')].some(
      (button) => button.textContent === "Retry the same feed settings" && !button.disabled
    )
  );
  saved = await db.socialPreferences.findUniqueOrThrow({
    where: { ownerId: a.id }
  });
  await page.evaluate(() => {
    window.dispatchEvent(new Event("blur"));
    window.dispatchEvent(new Event("focus"));
  });
  await page
    .getByRole("button", { name: "Confirm original request", exact: true })
    .click();
  await form().waitFor({ state: "detached" });
  await form().waitFor();
  assert.equal(bodies.at(-1), dropped);
  const retried = await db.socialPreferences.findUniqueOrThrow({
    where: { ownerId: a.id }
  });
  assert.equal(retried.discoveryVersion, saved.discoveryVersion);
  assert.equal(retried.discovery.filters.radiusKm, 100);
  assert.equal(
    (await db.platformUser.findUniqueOrThrow({ where: { id: a.id } })).location,
    sharedLocation
  );
  await page.unroute("**/api/platform/discovery");
  ok(
    "An accepted location save with a lost response retains the exact request through focus revalidation and does not repeat the mutation"
  );

  phase = "current-account";
  await go("/platform/settings/language/interface");
  await choices.waitFor();
  await page.route("**/api/platform/settings", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        message: "Fixture settings temporarily unavailable"
      })
    })
  );
  await page.evaluate(() => {
    window.dispatchEvent(new Event("blur"));
    window.dispatchEvent(new Event("focus"));
  });
  await choices.waitFor({ state: "hidden" });
  await page.unroute("**/api/platform/settings");
  await context.clearCookies();
  const response = await page.goto(
    config.origin + "/platform/settings/language/interface"
  );
  assert.equal(response.status(), 200);
  assert.equal(new URL(page.url()).pathname, "/platform/join");
  assert.equal(
    new URL(page.url()).searchParams.get("next"),
    "/platform/settings/language/interface"
  );
  assert.equal(await choices.count(), 0);
  ok(
    "Settings read failures conceal controls; signed-out entry preserves only the registered language return route"
  );

  assert.deepEqual(errors, []);
  writeFileSync(
    output + "/result.json",
    JSON.stringify(
      {
        at: new Date().toISOString(),
        checks: results.length,
        results,
        errors,
        externalSends: 0
      },
      null,
      2
    )
  );
  console.log(
    JSON.stringify(
      { passed: results.length, errors: errors.length, output },
      null,
      2
    )
  );
} catch (error) {
  writeFileSync(
    output + "/failure.txt",
    `${phase}\n${String(error.stack ?? error)}\n${await page.locator("body").innerText()}`
  );
  await page.screenshot({ path: output + "/failure.png", fullPage: true });
  throw error;
} finally {
  await browser.close();
  await db.$disconnect();
}
