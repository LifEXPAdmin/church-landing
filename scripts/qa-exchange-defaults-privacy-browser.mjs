import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { sessionCookieFixtureName } from "./session-cookie-fixture.mjs";
const fixtureDir = process.argv[2];
assert.ok(fixtureDir, "Pass the existing isolated Exchange preview directory");
const config = JSON.parse(
  readFileSync(fixtureDir + "/browser-env.json", "utf8")
);
assert.match(
  config.origin,
  /^https:\/\/(?:exchange-fixture\.example\.test|127\.0\.0\.1):\d+$/
);
const localOrigin = config.localOrigin ?? config.origin;
assert.match(localOrigin, /^https:\/\/127\.0\.0\.1:\d+$/);
assert.equal(new URL(config.database).hostname, "127.0.0.1");
Object.assign(process.env, {
  DATABASE_URL: config.database,
  DIRECT_URL: config.database,
  ACCOUNT_ORIGIN: localOrigin,
  NEXT_PUBLIC_SITE_URL: localOrigin,
  ACCOUNT_TEST_ISOLATED: "1",
  ACCOUNT_DELIVERY_MODE: "test-sink",
  ACCOUNT_TEST_SINK_DIR:
    process.env.ACCOUNT_TEST_SINK_DIR ?? fixtureDir + "/sink",
  AUTH_RATE_LIMIT_SECRET:
    process.env.AUTH_RATE_LIMIT_SECRET ??
    "medium-fixture-only-secret-".repeat(3),
  NODE_ENV: "test",
  VERCEL: "",
  PRIVILEGED_MFA_MODE: process.env.PRIVILEGED_MFA_MODE ?? "enroll",
  COMMUNITY_REPORTS_ENABLED: "true",
  BLOB_READ_WRITE_TOKEN: "",
  RESEND_API_KEY: "",
  MAILERLITE_API_KEY: "",
  MEDIA_STORAGE_MODE: "local-test",
  RETENTION_TEST_DIR:
    process.env.RETENTION_TEST_DIR ?? fixtureDir + "/retention",
  MEDIA_TEST_DIR: process.env.MEDIA_TEST_DIR ?? fixtureDir + "/images"
});
const { PrismaClient } = await import("@prisma/client");
const { createPortalActor, assertPortalTestDatabase } =
  await import("../tests/seed-portal.ts");
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
      createHash("sha256").update(der).digest("base64"),
    "--host-resolver-rules=MAP exchange-fixture.example.test 127.0.0.1",
    "--no-proxy-server"
  ]
});
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  hasTouch: true
});
// One dispatcher owns each request. Keep the origin fence mounted while
// changing fault injections, so page/context routing cannot race for ownership.
let intercepts = [];
const routed = new Set(),
  routingErrors = [];
const intercept = async (match, handle) => {
  intercepts.push({ match, handle });
};
const clearIntercepts = async () => {
  intercepts = [];
  await Promise.all([...routed]);
  assert.deepEqual(routingErrors, []);
};
await context.route("**/*", async (route) => {
  const url = new URL(route.request().url());
  if (url.origin !== config.origin) return route.abort();
  const rule = [...intercepts]
    .reverse()
    .find(({ match }) =>
      typeof match === "string" ? url.href === match : match(url)
    );
  if (!rule) return route.continue();
  const pending = Promise.resolve()
    .then(() => rule.handle(route))
    .catch((error) => {
      routingErrors.push(error.message);
    });
  routed.add(pending);
  await pending;
  routed.delete(pending);
});
const page = await context.newPage(),
  errors = [],
  results = [],
  output = fixtureDir + "/exchange-defaults-browser-" + Date.now();
mkdirSync(output, { recursive: true });
page.on("pageerror", (e) =>
  errors.push({ path: new URL(page.url()).pathname, message: e.message })
);
page.on("dialog", (dialog) => dialog.accept());
const ok = (message) => {
  results.push(message);
  console.log("PASS " + message);
};
const go = async (path) => {
  const response = await page.goto(config.origin + path);
  assert.equal(response.status(), 200);
  return response;
};
const signIn = async (actor) => {
  await context.clearCookies();
  if (actor)
    await context.addCookies([
      {
        name: sessionCookieFixtureName(config.origin),
        value: actor.token,
        url: config.origin,
        secure: true,
        httpOnly: true,
        sameSite: "Lax"
      }
    ]);
};
const bounded = async () =>
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1
    ),
    "No horizontal page overflow"
  );
const waitUntil = async (work) => {
  for (let i = 0; i < 100; i++) {
    if (await work()) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw Error("Expected current defaults state was not observed");
};
const exact = (name) => page.getByRole("button", { name, exact: true });
const signal = (name) =>
  page.evaluate((name) => window.dispatchEvent(new Event(name)), name);
const defaultsRoute = (url) =>
  url.pathname === "/api/platform/exchange" &&
  url.searchParams.get("view") === "defaults";
try {
  const { exchangeDefaultsCommand } =
    await import("../lib/platform/exchange-defaults.ts");
  const { EXCHANGE_DEFAULTS_SCHEMA, emptyExchangeDefaults } =
    await import("../lib/platform/exchange-handoff-options.ts");
  const owner = await createPortalActor(db, "defaultsprivacyowner");
  const other = await createPortalActor(db, "defaultsprivacyother");
  const marker = "Fictional private defaults " + randomUUID();
  await exchangeDefaultsCommand(db, owner.token, {
    operation: "defaults-save",
    mutationId: randomUUID(),
    expectedVersion: 0,
    schema: EXCHANGE_DEFAULTS_SCHEMA,
    fields: { ...emptyExchangeDefaults(), pickupDetails: marker }
  });
  const saved = () =>
    db.exchangeDefaults.findUniqueOrThrow({ where: { ownerId: owner.id } });
  await signIn(owner);
  for (const headers of [{}, { RSC: "1" }]) {
    const response = await context.request.get(
      config.origin + "/platform/exchange/defaults",
      { headers }
    );
    assert.equal(response.status(), 200);
    assert.match(response.headers()["cache-control"], /no-store/);
    assert.ok(
      !(await response.text()).includes(marker),
      "Initial HTML/RSC must omit private defaults"
    );
  }
  ok("Initial owner HTML and RSC omit the saved private pickup marker");
  await intercept(defaultsRoute, (route) =>
    route.fulfill({
      status: 403,
      contentType: "application/json",
      body: JSON.stringify({ message: "Injected defaults access denial" })
    })
  );
  await go("/platform/exchange/defaults");
  const pickup = page.getByLabel(
    "Reusable private pickup instructions (optional)",
    { exact: false }
  );
  await page
    .getByText("Injected defaults access denial", { exact: true })
    .waitFor();
  assert.equal(await pickup.count(), 0);
  assert.ok(
    !(await page.locator("script").allTextContents()).join("").includes(marker)
  );
  await clearIntercepts();
  await exact("Recheck current access").click();
  await pickup.waitFor();
  assert.equal(await pickup.inputValue(), marker);
  ok(
    "Denied first read never presents a private form and a current retry initializes saved defaults"
  );
  await pickup.fill(marker + " unsaved");
  await page.getByLabel("Country", { exact: true }).selectOption("US");
  const town = page.getByLabel("Find a town or area", { exact: true });
  await town.fill("Unselected private town");
  for (const event of ["blur", "pagehide", "offline"]) {
    await signal(event);
    await waitUntil(async () => (await pickup.count()) === 0);
    assert.equal(await town.count(), 0);
    await signal("online");
    await signal("social-relationships-changed");
    await page.waitForTimeout(100);
    assert.equal(await pickup.count(), 0);
    await signal("focus");
    await pickup.waitFor();
    assert.equal(await pickup.inputValue(), marker + " unsaved");
    assert.equal(await town.inputValue(), "Unselected private town");
  }
  ok(
    "Blur, pagehide and offline remove private fields; same-owner return retains pickup and unselected town text"
  );
  await intercept(
    (url) =>
      url.pathname === "/api/platform/profile" &&
      url.searchParams.get("view") === "identity",
    (route) =>
      route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ message: "Injected identity outage" })
      })
  );
  await signal("focus");
  await waitUntil(async () => (await pickup.count()) === 0);
  await page
    .getByText("Your sign-in could not be checked. Reconnect and try again.", {
      exact: true
    })
    .first()
    .waitFor();
  await clearIntercepts();
  await exact("Recheck current access").click();
  await pickup.waitFor();
  assert.equal(await pickup.inputValue(), marker + " unsaved");
  ok(
    "Failed identity read conceals private fields and retains local entries for a successful retry"
  );
  const endpoint = config.origin + "/api/platform/exchange";
  // Definitive validation failure clears only this rejected command.
  let rejectedBody;
  await intercept(endpoint, async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    rejectedBody = route.request().postData();
    await route.fulfill({
      status: 400,
      contentType: "application/json",
      body: JSON.stringify({
        message: "Injected defaults validation rejection"
      })
    });
  });
  await exact("Save personal defaults").click();
  await page
    .getByText("Injected defaults validation rejection", { exact: true })
    .waitFor();
  assert.equal(await exact("Confirm original save").count(), 0);
  assert.equal(await pickup.inputValue(), marker + " unsaved");
  await clearIntercepts();
  ok(
    "Definitive validation rejection preserves editable entries without an uncertain retry"
  );
  const before = (await saved()).version,
    bodies = [];
  let attempt = 0;
  await intercept(endpoint, async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    bodies.push(route.request().postData());
    attempt++;
    if (attempt === 1) {
      const result = await route.fetch();
      assert.ok([200, 202].includes(result.status()));
      await route.abort("failed");
    } else if (attempt === 2) {
      await route.fulfill({
        status: 429,
        headers: { "retry-after": "1" },
        contentType: "application/json",
        body: JSON.stringify({ message: "Injected defaults cooldown" })
      });
    } else if (attempt === 3) {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ message: "Injected defaults retry outage" })
      });
    } else await route.continue();
  });
  await exact("Save personal defaults").click();
  await exact("Confirm original save").waitFor();
  assert.notEqual(
    JSON.parse(rejectedBody).mutationId,
    JSON.parse(bodies[0]).mutationId
  );
  await signal("blur");
  await waitUntil(async () => (await pickup.count()) === 0);
  assert.equal(await exact("Confirm original save").isEnabled(), false);
  await signal("focus");
  await page
    .getByText(
      "Your saved defaults changed. Your local entries are retained and concealed. Confirm any original save, then reload to review current choices.",
      { exact: true }
    )
    .waitFor();
  assert.equal(await pickup.count(), 0);
  for (let i = 0; i < 3; i++) {
    await exact("Confirm original save").click();
    if (i < 2)
      await waitUntil(
        async () =>
          attempt === i + 2 &&
          (await exact("Confirm original save").isEnabled())
      );
  }
  await pickup.waitFor();
  await waitUntil(
    async () => await exact("Save personal defaults").isEnabled()
  );
  assert.equal(await pickup.inputValue(), marker + " unsaved");
  assert.equal(await town.inputValue(), "");
  assert.equal(bodies.length, 4);
  assert.equal(new Set(bodies).size, 1);
  assert.equal((await saved()).version, before + 1);
  assert.equal((await saved()).pickupDetails, marker + " unsaved");
  await clearIntercepts();
  ok(
    "Lost accepted save survives concealment and 429/503; four byte-identical attempts increment defaults once"
  );
  let release, accepted;
  const gate = new Promise((done) => {
      release = done;
    }),
    ready = new Promise((done) => {
      accepted = done;
    });
  const lateBefore = (await saved()).version;
  let lateWrites = 0;
  await intercept(endpoint, async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    lateWrites++;
    const result = await route.fetch();
    assert.ok([200, 202].includes(result.status()));
    accepted();
    await gate;
    await route.fulfill({ response: result });
  });
  await pickup.fill(marker + " late confirmation");
  await exact("Save personal defaults").click();
  await ready;
  await signal("blur");
  await waitUntil(async () => (await pickup.count()) === 0);
  release();
  await page.waitForTimeout(150);
  assert.equal(await pickup.count(), 0);
  await clearIntercepts();
  await signal("focus");
  await pickup.waitFor();
  await waitUntil(
    async () => await exact("Save personal defaults").isEnabled()
  );
  assert.equal(await pickup.inputValue(), marker + " late confirmation");
  assert.equal(lateWrites, 1);
  assert.equal((await saved()).version, lateBefore + 1);
  ok(
    "A late confirmed save cannot reopen a concealed form and resumes once after current owner return"
  );
  await pickup.fill(marker + " local conflict");
  await db.exchangeDefaults.update({
    where: { ownerId: owner.id },
    data: { pickupDetails: marker + " newer saved", version: { increment: 1 } }
  });
  await signal("focus");
  await page
    .getByText(
      "Your saved defaults changed. Your local entries are retained and concealed. Confirm any original save, then reload to review current choices.",
      { exact: true }
    )
    .waitFor();
  assert.equal(await pickup.count(), 0);
  assert.equal(await exact("Confirm original save").count(), 0);
  await exact("Reload current information").click();
  await pickup.waitFor();
  assert.equal(await pickup.inputValue(), marker + " newer saved");
  ok(
    "A separately changed saved version requires deliberate reload before replacing local entries"
  );
  await pickup.fill(marker + " account change");
  await signIn(other);
  await signal("focus");
  await page
    .getByText(
      "Your sign-in changed. Private entries were cleared. Reload for your current account.",
      { exact: true }
    )
    .waitFor();
  assert.equal(await pickup.count(), 0);
  ok(
    "Confirmed account replacement clears the previous account's private defaults owner"
  );
  await signIn(owner);
  await go("/platform/exchange/defaults");
  await pickup.waitFor();
  await bounded();
  await page.screenshot({ path: output + "/defaults-390.png", fullPage: true });
  await page.setViewportSize({ width: 320, height: 844 });
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
  });
  await bounded();
  await page.screenshot({
    path: output + "/defaults-320-200.png",
    fullPage: true
  });
  ok("Private defaults fit 390px and 320px enlarged text layouts");
  await clearIntercepts();
  assert.deepEqual(errors, []);
  ok("No browser runtime errors in the personal defaults privacy flow");
} catch (error) {
  await page
    .screenshot({ path: output + "/failure.png", fullPage: true })
    .catch(() => {});
  writeFileSync(
    output + "/failure.txt",
    await page
      .locator("body")
      .innerText()
      .catch(() => "")
  );
  throw error;
} finally {
  writeFileSync(
    output + "/results.json",
    JSON.stringify(
      {
        results,
        errors,
        at: new Date().toISOString(),
        productionWrites: 0,
        externalSends: 0
      },
      null,
      2
    )
  );
  await browser.close();
  await db.$disconnect();
}
