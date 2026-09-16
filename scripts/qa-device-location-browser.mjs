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
const output = fixtureDir + "/device-location-browser";
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

const form = () =>
  page.getByRole("form", { name: "Save feed settings", exact: true });
const helper = () =>
  page.getByRole("region", { name: "Optional device location" });
const start = async () => {
  await page.evaluate(() => {
    window.__lateLocation = null;
  });
  await helper()
    .getByRole("button", { name: "Use device location once", exact: true })
    .click();
};
const mode = (value) =>
  page.evaluate((v) => {
    window.__geoMode = v;
  }, value);
const save = async () => {
  await form()
    .getByRole("button", { name: "Save feed settings", exact: true })
    .click();
  await page.waitForFunction(
    () =>
      document
        .querySelector('form[aria-label="Save feed settings"]')
        ?.getAttribute("data-reader-dirty") === "false"
  );
};
const lookupPosts = [],
  unexpectedCoordinateUrls = [];
page.on("request", (request) => {
  const u = new URL(request.url());
  if (
    u.pathname === "/api/platform/discovery/device" &&
    request.method() === "POST"
  )
    lookupPosts.push(JSON.parse(request.postData()));
  if (/41\.8781234|87\.6299876|latitudeCell|longitudeCell/.test(u.search))
    unexpectedCoordinateUrls.push(u.href);
});
await context.addInitScript(() => {
  const native = navigator.geolocation.getCurrentPosition.bind(
    navigator.geolocation
  );
  window.__geoMode = "native";
  window.__geoCalls = 0;
  window.__watchCalls = 0;
  window.__lateLocation = null;
  window.__geoOptions = null;
  const position = () => ({
    timestamp: Date.now(),
    coords: {
      latitude: 41.8781234,
      longitude: -87.6299876,
      accuracy: window.__geoMode === "inaccurate" ? 50000 : 20
    }
  });
  navigator.geolocation.getCurrentPosition = (success, failure, options) => {
    window.__geoCalls++;
    window.__geoOptions = options;
    if (window.__geoMode === "native") return native(success, failure, options);
    if (window.__geoMode === "pending") {
      window.__lateLocation = () => success(position());
      return;
    }
    if (window.__geoMode === "inaccurate") return success(position());
    failure({
      code: { denied: 1, unavailable: 2, timeout: 3 }[window.__geoMode] ?? 2,
      message: "Fixture error contains no user location"
    });
  };
  navigator.geolocation.watchPosition = () => {
    window.__watchCalls++;
    throw Error("Watching location is forbidden");
  };
});
page.on("dialog", (dialog) => dialog.accept());
let phase = "explicit request and layout";
try {
  const a = await createPortalActor(db, "devicebrowser"),
    b = await createPortalActor(db, "devicebrowserother");
  await db.platformUser.update({
    where: { id: a.id },
    data: {
      location: "Fictional owner-only location",
      locationAudience: "ONLY_ME"
    }
  });
  await signIn(a);
  await go("/platform/settings/feed/discovery");
  await form()
    .getByLabel("Saved feed", { exact: true })
    .selectOption("for-you");
  await form().getByLabel("Country", { exact: true }).selectOption("US");
  await helper().waitFor();
  assert.equal(await page.evaluate(() => window.__geoCalls), 0);
  assert.equal(lookupPosts.length, 0);
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "32px";
    });
    await helper().scrollIntoViewIfNeeded();
    await bounded();
    await page.screenshot({
      path: output + `/device-${width}.png`,
      fullPage: true
    });
  }
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "";
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await form().getByRole("button", { name: "Clear area", exact: true }).count();
  await helper()
    .getByRole("button", { name: "Use device location once", exact: true })
    .focus();
  assert.equal(
    await page.evaluate(() => document.activeElement?.textContent),
    "Use device location once"
  );
  ok(
    "No location request on load; optional purpose copy, phone/desktop doubled-text layouts and keyboard focus are available"
  );

  phase = "browser geolocation grant and separate save";
  const before = await db.socialPreferences.findUnique({
    where: { ownerId: a.id }
  });
  const priorCommands = await db.socialOperation.count({
    where: { ownerId: a.id }
  });
  await context.grantPermissions(["geolocation"], { origin: config.origin });
  await context.setGeolocation({
    latitude: 41.8781234,
    longitude: -87.6299876,
    accuracy: 20
  });
  await page.keyboard.press("Enter");
  await helper()
    .getByText(/Approximate suggestions in your selected country/)
    .waitFor();
  assert.equal(await page.evaluate(() => window.__geoCalls), 1);
  assert.deepEqual(await page.evaluate(() => window.__geoOptions), {
    enableHighAccuracy: false,
    timeout: 10000,
    maximumAge: 0
  });
  assert.deepEqual(lookupPosts, [
    { country: "US", latitudeCell: 527, longitudeCell: 369 }
  ]);
  assert.deepEqual(
    await db.socialPreferences.findUnique({ where: { ownerId: a.id } }),
    before
  );
  assert.equal(
    await db.socialOperation.count({ where: { ownerId: a.id } }),
    priorCommands
  );
  await helper()
    .getByRole("button", { name: /^Chicago,/ })
    .first()
    .click();
  assert.deepEqual(
    await db.socialPreferences.findUnique({ where: { ownerId: a.id } }),
    before
  );
  await save();
  const saved = await db.socialPreferences.findUniqueOrThrow({
    where: { ownerId: a.id }
  });
  assert.equal(saved.discovery.filters.country, "US");
  assert.ok(Number.isSafeInteger(saved.discovery.filters.placeId));
  assert.ok(
    !/latitude|longitude|accuracy|41\.8781234|87\.6299876/.test(
      JSON.stringify(saved, (_key, value) =>
        typeof value === "bigint" ? String(value) : value
      )
    )
  );
  const profile = await db.platformUser.findUniqueOrThrow({
    where: { id: a.id }
  });
  assert.equal(profile.location, "Fictional owner-only location");
  assert.equal(profile.locationAudience, "ONLY_ME");
  ok(
    "Actual browser Geolocation API with an emulated grant sends coarse cells only; lookup and selection do not save until the existing Save, and profile disclosure stays private"
  );

  phase = "denial and manual recovery";
  await mode("denied");
  await start();
  await helper()
    .getByText(/Location permission was not granted/)
    .waitFor();
  assert.equal(lookupPosts.length, 1);
  await form()
    .getByLabel("Find a town or area", { exact: true })
    .fill("Madison");
  await form().getByRole("button", { name: "Find area", exact: true }).click();
  await form()
    .getByRole("button", { name: /^Madison, Wisconsin/ })
    .click();
  await save();
  const manual = await db.socialPreferences.findUniqueOrThrow({
    where: { ownerId: a.id }
  });
  assert.notEqual(
    manual.discovery.filters.placeId,
    saved.discovery.filters.placeId
  );
  for (const [state, text] of [
    ["unavailable", /could not find your location/],
    ["timeout", /device timed out/],
    ["inaccurate", /recent enough or accurate enough/]
  ]) {
    await mode(state);
    await start();
    await helper().getByText(text).waitFor();
  }
  assert.equal(lookupPosts.length, 1);
  assert.deepEqual(
    await db.socialPreferences.findUniqueOrThrow({ where: { ownerId: a.id } }),
    manual
  );
  ok(
    "Denied, unavailable, timed-out and inaccurate results never send an area or change choices; manual town editing and saving remain usable"
  );

  phase = "cancel and stale callbacks";
  await mode("pending");
  await start();
  await page.waitForFunction(() => !!window.__lateLocation);
  await helper()
    .getByRole("button", { name: "Cancel location lookup" })
    .click();
  await page.evaluate(() => window.__lateLocation());
  await helper()
    .getByText(/lookup cancelled/)
    .waitFor();
  assert.equal(lookupPosts.length, 1);
  await start();
  await page.waitForFunction(() => !!window.__lateLocation);
  await form()
    .getByLabel("Find a town or area", { exact: true })
    .fill("Denver");
  await page.evaluate(() => window.__lateLocation());
  assert.equal(
    await form()
      .getByLabel("Find a town or area", { exact: true })
      .inputValue(),
    "Denver"
  );
  assert.equal(lookupPosts.length, 1);
  await start();
  await page.waitForFunction(() => !!window.__lateLocation);
  await form().getByLabel("Country", { exact: true }).selectOption("CA");
  await page.evaluate(() => window.__lateLocation());
  assert.equal(
    await form().getByLabel("Country", { exact: true }).inputValue(),
    "CA"
  );
  assert.equal(lookupPosts.length, 1);
  ok(
    "Cancellation, manual typing and country changes discard late native callbacks without replacing the user's newer choices"
  );

  phase = "permission wait total timeout";
  await form().getByLabel("Country", { exact: true }).selectOption("US");
  await page.evaluate(() => {
    window.__lateLocation = null;
  });
  await start();
  await page.waitForFunction(() => !!window.__lateLocation);
  await helper()
    .getByText(/location request took too long/)
    .waitFor({ timeout: 30000 });
  await page.evaluate(() => window.__lateLocation());
  assert.equal(lookupPosts.length, 1);
  assert.deepEqual(
    await db.socialPreferences.findUniqueOrThrow({ where: { ownerId: a.id } }),
    manual
  );
  ok(
    "The total request limit covers an unanswered permission prompt and ignores a result that arrives after timeout"
  );

  phase = "unsupported browser and account pinning";
  await page.evaluate(() => {
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: undefined
    });
  });
  await start();
  await helper()
    .getByText(/Device location is unavailable here/)
    .waitFor();
  await go("/platform/settings/feed/discovery");
  await form().getByLabel("Country", { exact: true }).waitFor();
  await mode("pending");
  await start();
  await page.waitForFunction(() => !!window.__lateLocation);
  await signIn(b);
  await page.evaluate(() => window.__lateLocation());
  await helper()
    .getByText(/sign-in changed/)
    .waitFor();
  assert.deepEqual(
    await db.socialPreferences.findUnique({ where: { ownerId: b.id } }),
    null
  );
  assert.deepEqual(
    await db.socialPreferences.findUniqueOrThrow({ where: { ownerId: a.id } }),
    manual
  );
  await page.evaluate(() => {
    window.dispatchEvent(new Event("blur"));
    window.dispatchEvent(new Event("focus"));
  });
  await helper().waitFor({ state: "hidden" });
  await db.platformUser.update({
    where: { id: b.id },
    data: { adultAcknowledgedAt: null }
  });
  await go("/platform/settings/feed/discovery");
  await form()
    .getByLabel("Saved feed", { exact: true })
    .selectOption("for-you");
  await form().getByLabel("Country", { exact: true }).selectOption("US");
  await start();
  await helper()
    .getByText(/confirm adult eligibility/)
    .waitFor();
  assert.equal(await page.evaluate(() => window.__geoCalls), 0);
  await context.clearCookies();
  await go("/platform/settings/feed/discovery");
  assert.equal(await helper().count(), 0);
  ok(
    "Unsupported browsers keep manual entry; switched, restricted and signed-out accounts cannot use or save another account's result"
  );

  phase = "translation and real HTTP privacy boundary";
  await signIn(a);
  await go("/platform/settings/language/interface");
  assert.equal(
    await page
      .getByRole("button", { name: "Translation is not available yet" })
      .isDisabled(),
    true
  );
  assert.match(
    await page.locator("body").innerText(),
    /would not guarantee a translation for every/
  );
  const checks = await page.evaluate(
    async ({ owner, other }) => {
      const call = async (method, body, expected = owner, query = "") => {
        const r = await fetch("/api/platform/discovery/device" + query, {
          method,
          headers: {
            "X-Expected-Account": expected,
            ...(body ? { "Content-Type": "application/json" } : {})
          },
          ...(body ? { body: JSON.stringify(body) } : {})
        });
        return {
          status: r.status,
          cache: r.headers.get("cache-control"),
          body: await r.json()
        };
      };
      return [
        await call("GET"),
        await call("GET", null, other),
        await call("POST", { country: "US", latitude: 41.8, longitude: -87.6 }),
        await call("GET", null, owner, "?area=unsupported")
      ];
    },
    { owner: a.id, other: b.id }
  );
  assert.deepEqual(
    checks.map((c) => c.status),
    [200, 401, 400, 400]
  );
  for (const c of checks) assert.match(c.cache, /no-store/);
  assert.deepEqual(unexpectedCoordinateUrls, []);
  assert.equal(await page.evaluate(() => window.__watchCalls), 0);
  assert.deepEqual(errors, []);
  ok(
    "Translation remains explicitly unavailable, and actual HTTPS checks reject wrong owners, precise-coordinate bodies and query parameters with private responses"
  );
  writeFileSync(
    output + "/result.json",
    JSON.stringify(
      {
        passed: results.length,
        errors,
        results,
        productionWrites: 0,
        externalSends: 0,
        physicalDeviceVerified: false
      },
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
