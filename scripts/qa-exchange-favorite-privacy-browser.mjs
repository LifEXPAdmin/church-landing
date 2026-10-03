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
const within = async (promise, label) => {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(Error(label + " timed out")), 15000);
      })
    ]);
  } finally {
    clearTimeout(timer);
  }
};
let intercepts = [];
const routed = new Set(),
  routingErrors = [];
const intercept = async (match, handle) => {
  intercepts.push({ match, handle });
};
const clearIntercepts = async () => {
  intercepts = [];
  await within(Promise.all([...routed]), "Routed favorite requests");
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
  output = fixtureDir + "/exchange-favorite-browser-" + Date.now();
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
const layoutFailures = [];
const bounded = async () => {
  const layout = await page.evaluate(() => ({
    viewport: innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    offenders: [...document.querySelectorAll("body *")]
      .filter(
        (element) => element.getBoundingClientRect().right > innerWidth + 1
      )
      .map((element) => ({
        tag: element.tagName,
        className: element.className,
        text: element.textContent.slice(0, 100),
        right: element.getBoundingClientRect().right,
        width: element.getBoundingClientRect().width,
        whiteSpace: getComputedStyle(element).whiteSpace
      }))
      .slice(0, 20)
  }));
  if (layout.scrollWidth > layout.viewport + 1) {
    layoutFailures.push(layout);
    console.log("LAYOUT DIAGNOSTIC " + JSON.stringify(layout));
  }
};
const waitUntil = async (work) => {
  for (let i = 0; i < 100; i++) {
    if (await work()) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw Error("Expected current favorite state was not observed");
};
const exact = (name) => page.getByRole("button", { name, exact: true });
const signal = (name) =>
  page.evaluate((name) => window.dispatchEvent(new Event(name)), name);
try {
  const { exchangeSavedCommand: command, readExchangeSaved: read } =
    await import("../lib/platform/exchange-saved.ts");
  const { EXCHANGE_ITEM_POLICY } =
    await import("../lib/platform/exchange-options.ts");
  const owner = await createPortalActor(db, "favoriteowner"),
    publisher = await createPortalActor(db, "favoritepublisher"),
    other = await createPortalActor(db, "favoriteother");
  const listing = await db.exchangeListing.create({
    data: {
      ownerId: publisher.id,
      creatorId: publisher.id,
      state: "ACTIVE",
      title: "Fictional favorite listing " + randomUUID(),
      description: "Fictional standalone favorite privacy source",
      category: "FURNITURE",
      condition: "GOOD",
      country: "US",
      placeId: 4887398,
      placeLabel: "Chicago",
      itemPolicy: EXCHANGE_ITEM_POLICY,
      confirmedAt: new Date(),
      publishedAt: new Date()
    }
  });
  const favorite = await command(db, owner.token, {
    operation: "favorite-add",
    mutationId: randomUUID(),
    listingId: listing.id,
    expectedVersion: 0
  });
  const path = `/platform/exchange/${listing.id}`;
  const remove = page
    .locator("button")
    .filter({ hasText: /^Remove favorite$/ });
  await signIn(owner);
  await intercept(
    (url) =>
      url.pathname === "/api/platform/exchange" &&
      url.searchParams.get("view") === "listing",
    (route) =>
      route.fulfill({
        status: 403,
        contentType: "application/json",
        body: JSON.stringify({
          message: "Injected current listing access denial"
        })
      })
  );
  const html = await (await go(path)).text();
  const rsc = await (
    await context.request.get(config.origin + path, { headers: { RSC: "1" } })
  ).text();
  for (const body of [html, rsc]) assert.ok(body.includes(favorite.id));
  await page
    .getByText("Injected current listing access denial", { exact: true })
    .waitFor();
  assert.equal(await remove.count(), 1);
  assert.equal(await remove.getAttribute("aria-pressed"), "true");
  assert.equal(await remove.isVisible(), false);
  ok(
    "BASELINE: private favorite association is serialized in HTML/RSC and retained in concealed DOM despite denied current listing access"
  );
  await clearIntercepts();
  await go(path);
  await remove.waitFor();
  await page.screenshot({
    path: output + "/favorite-baseline-390.png",
    fullPage: true
  });
  for (const event of ["blur", "pagehide", "offline"]) {
    await signal(event);
    assert.equal(await remove.count(), 1);
    assert.equal(await remove.getAttribute("aria-pressed"), "true");
    const visible = await remove.isVisible();
    ok(
      `BASELINE: ${event} retains private favorite state in DOM, visible=${visible}`
    );
    await signal("focus");
    await remove.waitFor();
  }
  const bodies = [];
  await intercept(config.origin + "/api/platform/exchange", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    bodies.push(route.request().postData());
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: randomUUID(),
        version: 999,
        message: "Injected wrong favorite receipt"
      })
    });
  });
  await remove.click();
  await page
    .getByText("Injected wrong favorite receipt", { exact: true })
    .waitFor();
  await waitUntil(async () => !(await remove.isDisabled()));
  assert.equal(bodies.length, 1);
  assert.equal(
    await page
      .getByRole("button", { name: "Confirm original save", exact: true })
      .count(),
    0
  );
  assert.equal(
    (await read(db, owner.token, { view: "favorite", listingId: listing.id }))
      .favorite.version,
    1
  );
  assert.equal(await remove.getAttribute("aria-pressed"), "true");
  await clearIntercepts();
  ok(
    "BASELINE: a wrong-target/version response discards the original pending favorite request without a canonical write"
  );
  await signIn(other);
  const foreign = await (await go(path)).text();
  assert.ok(!foreign.includes(favorite.id));
  await page
    .getByRole("button", { name: "Save favorite", exact: true })
    .waitFor();
  assert.equal(
    (await read(db, other.token, { view: "favorite", listingId: listing.id }))
      .favorite,
    null
  );
  assert.equal(
    await db.exchangeFavorite.count({ where: { ownerId: other.id } }),
    0
  );
  ok(
    "CONTROL: canonical favorite state and rendered listing exclude another account's saved association"
  );
  assert.deepEqual(errors, []);
  writeFileSync(
    output + "/results.json",
    JSON.stringify(
      {
        baseline: true,
        results,
        errors,
        productionWrites: 0,
        externalSends: 0
      },
      null,
      2
    )
  );
} catch (error) {
  await page
    .screenshot({ path: output + "/failure.png", fullPage: true })
    .catch(() => {});
  writeFileSync(
    output + "/failure.txt",
    String(error.stack) +
      "\n" +
      (await page
        .locator("body")
        .innerText()
        .catch(() => ""))
  );
  writeFileSync(
    output + "/results.json",
    JSON.stringify({ results, errors, error: String(error) }, null, 2)
  );
  throw error;
} finally {
  await context.close();
  await browser.close();
  await db.$disconnect();
}
