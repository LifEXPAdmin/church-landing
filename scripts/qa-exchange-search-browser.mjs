import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
const fixtureDir = process.argv[2];
assert.ok(fixtureDir, "Pass the existing isolated Exchange preview directory");
const config = JSON.parse(
  readFileSync(fixtureDir + "/browser-env.json", "utf8")
);
assert.match(config.origin, /^https:\/\/exchange-fixture\.example\.test:\d+$/);
assert.match(config.localOrigin, /^https:\/\/127\.0\.0\.1:\d+$/);
assert.equal(new URL(config.database).hostname, "127.0.0.1");
Object.assign(process.env, {
  DATABASE_URL: config.database,
  DIRECT_URL: config.database,
  ACCOUNT_ORIGIN: config.localOrigin,
  NEXT_PUBLIC_SITE_URL: config.localOrigin,
  ACCOUNT_TEST_ISOLATED: "1",
  ACCOUNT_DELIVERY_MODE: "test-sink",
  ACCOUNT_TEST_SINK_DIR: process.cwd() + "/" + fixtureDir + "/sink",
  AUTH_RATE_LIMIT_SECRET: "medium-fixture-only-secret-".repeat(3),
  NODE_ENV: "test",
  VERCEL: "",
  PRIVILEGED_MFA_MODE: "enroll",
  COMMUNITY_REPORTS_ENABLED: "true",
  BLOB_READ_WRITE_TOKEN: "",
  RESEND_API_KEY: "",
  MAILERLITE_API_KEY: "",
  MEDIA_STORAGE_MODE: "local-test",
  MEDIA_TEST_DIR: process.cwd() + "/" + fixtureDir + "/images"
});
const { PrismaClient } = await import("@prisma/client");
const { createPortalActor, assertPortalTestDatabase, seedOperatorGrants } =
  await import("../tests/seed-portal.ts");
const { exchangeListingCommand } =
  await import("../lib/platform/exchange-listings.ts");
const { EXCHANGE_ITEM_POLICY, EXCHANGE_EDITOR_SCHEMA } =
  await import("../lib/platform/exchange-options.ts");
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
await context.route("**/*", (route) =>
  new URL(route.request().url()).hostname === "exchange-fixture.example.test"
    ? route.continue()
    : route.abort()
);
const page = await context.newPage(),
  errors = [],
  results = [],
  output = fixtureDir + "/exchange-browser-" + Date.now();
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
        name: "church_platform_session",
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
  for (let i = 0; i < 80; i++) {
    if (await work()) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw Error("Expected saved state was not observed");
};
try {
  const { emptyExchangeFields } =
    await import("../lib/platform/exchange-options.ts");
  const { searchDiscoveryPlaces } =
    await import("../lib/platform/discovery-places.ts");
  const publisher = await createPortalActor(db, "exsearchpub"),
    viewer = await createPortalActor(db, "exsearchview"),
    stranger = await createPortalActor(db, "exsearchother");
  const reviewer = await createPortalActor(db, "exsearchreview");
  await seedOperatorGrants(db, reviewer, ["REVIEW_COMMUNITY_REPORTS"]);
  const place = (await searchDiscoveryPlaces("US", "Chicago")).places[0];
  const marker = "Browser search " + randomUUID();
  const listings = [];
  for (const price of ["1.001", "2.000", "3.000"]) {
    const draft = await exchangeListingCommand(db, publisher.token, {
      operation: "create",
      mutationId: randomUUID(),
      expectedVersion: 0,
      ownerChurchId: null,
      schema: EXCHANGE_EDITOR_SCHEMA,
      fields: {
        ...emptyExchangeFields(),
        intent: "SALE",
        title: marker + " " + price,
        description: "Fictional search fixture",
        category: "FURNITURE",
        condition: "GOOD",
        country: "US",
        placeId: place.id,
        currency: "KWD",
        price
      }
    });
    listings.push(
      await exchangeListingCommand(db, publisher.token, {
        operation: "status",
        mutationId: randomUUID(),
        listingId: draft.id,
        expectedVersion: draft.version,
        state: "ACTIVE",
        itemPolicy: EXCHANGE_ITEM_POLICY,
        itemConfirmed: true
      })
    );
  }
  await signIn(viewer);
  await go("/platform/exchange?q=" + encodeURIComponent(marker));
  const filters = page.getByRole("form", {
    name: "Filter Exchange listings",
    exact: true
  });
  await filters.getByText("More filters and sorting", { exact: true }).click();
  await filters.getByLabel("Currency", { exact: true }).selectOption("KWD");
  await filters.getByLabel("Price basis", { exact: true }).selectOption("item");
  await filters.getByLabel("Maximum price", { exact: true }).fill("2.000");
  await filters
    .getByLabel("Sort listings", { exact: true })
    .selectOption("price-high");
  await filters
    .getByRole("button", { name: "Show listings", exact: true })
    .click();
  await page.waitForURL((url) => url.searchParams.get("sort") === "price-high");
  await page
    .getByRole("link", { name: marker + " 2.000", exact: true })
    .waitFor();
  assert.equal(
    await page
      .getByRole("link", { name: marker + " 3.000", exact: true })
      .count(),
    0
  );
  const resultLinks = page.locator('h2 a[href^="/platform/exchange/"]');
  assert.deepEqual(await resultLinks.allTextContents(), [
    marker + " 2.000",
    marker + " 1.001"
  ]);
  const criteriaUrl = page.url();
  await resultLinks.first().scrollIntoViewIfNeeded();
  const scrollBefore = await page.evaluate(() => scrollY);
  await resultLinks.first().click();
  await page
    .getByRole("heading", { name: marker + " 2.000", exact: true })
    .waitFor();
  const back = page.getByRole("link", {
    name: "Return to listing results",
    exact: true
  });
  assert.equal(
    new URL(await back.getAttribute("href"), config.origin).searchParams.get(
      "maxPrice"
    ),
    "2.000"
  );
  await page.goBack();
  await page
    .getByRole("link", { name: marker + " 2.000", exact: true })
    .waitFor();
  await waitUntil(
    async () =>
      Math.abs((await page.evaluate(() => scrollY)) - scrollBefore) < 50
  );
  assert.equal(page.url(), criteriaUrl);
  await bounded();
  ok(
    "Exact price-basis filtering, stable price order and browser Back preserve criteria and scroll position"
  );

  await go("/platform/exchange?q=" + encodeURIComponent(marker));
  await filters.getByText("More filters and sorting", { exact: true }).click();
  await filters.getByLabel("Country", { exact: true }).selectOption("US");
  await filters
    .getByLabel("Find a town or area", { exact: true })
    .fill("Chicago");
  await filters.getByRole("button", { name: "Find area", exact: true }).click();
  await filters.getByRole("button", { name: place.label, exact: true }).click();
  await filters
    .getByLabel("Distance from selected town", { exact: true })
    .selectOption("25");
  await filters
    .getByLabel("Sort listings", { exact: true })
    .selectOption("nearest");
  await filters
    .getByRole("button", { name: "Show listings", exact: true })
    .click();
  await page.waitForURL((url) => url.searchParams.get("sort") === "nearest");
  await page
    .getByText("Within about 10 km of the selected town center", {
      exact: true
    })
    .first()
    .waitFor();
  await filters
    .getByRole("link", {
      name: "Remove filter: Within about 25 km",
      exact: true
    })
    .click();
  await page.waitForURL((url) => !url.searchParams.has("radiusKm"));
  assert.equal(new URL(page.url()).searchParams.has("sort"), false);
  assert.equal(
    new URL(page.url()).searchParams.get("placeId"),
    String(place.id)
  );
  ok(
    "Country and named-area controls produce approximate distance results; removing a radius safely resets nearest sorting"
  );

  await go(`/platform/exchange/${listings[0].id}`);
  let lost = false,
    originalBody;
  await page.route("**/api/platform/exchange", async (route) => {
    const request = route.request();
    if (request.method() !== "POST") return route.continue();
    if (!lost) {
      lost = true;
      originalBody = request.postData();
      const response = await route.fetch({
        url: config.localOrigin + new URL(request.url()).pathname
      });
      assert.equal(response.status(), 200, await response.text());
      return route.abort("failed");
    }
    assert.equal(request.postData(), originalBody);
    return route.continue();
  });
  await page
    .getByRole("button", { name: "Save favorite", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirm original save", exact: true })
    .waitFor();
  await page.evaluate(() => {
    window.dispatchEvent(new Event("blur"));
    window.dispatchEvent(new Event("focus"));
  });
  await page
    .getByRole("button", { name: "Confirm original request", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Remove favorite", exact: true })
    .waitFor();
  await page.unroute("**/api/platform/exchange");
  assert.equal(
    await db.exchangeFavorite.count({
      where: { ownerId: viewer.id, listingId: listings[0].id, deletedAt: null }
    }),
    1
  );
  await signIn(null);
  await go("/platform/exchange/saved");
  assert.equal(
    await page.getByText(marker + " 1.001", { exact: true }).count(),
    0
  );
  await signIn(stranger);
  await go("/platform/exchange/saved");
  assert.equal(
    await page.getByText(marker + " 1.001", { exact: true }).count(),
    0
  );
  await signIn(viewer);
  await go("/platform/exchange/saved");
  await page
    .getByRole("link", { name: marker + " 1.001", exact: true })
    .waitFor();
  await exchangeListingCommand(db, publisher.token, {
    operation: "status",
    mutationId: randomUUID(),
    listingId: listings[0].id,
    expectedVersion: listings[0].version,
    state: "ARCHIVED"
  });
  await page.reload();
  await page
    .getByRole("heading", { name: "Listing unavailable", exact: true })
    .waitFor();
  assert.equal(
    await page.getByText(marker + " 1.001", { exact: true }).count(),
    0
  );
  await page
    .getByRole("button", { name: "Remove favorite", exact: true })
    .click();
  await waitUntil(
    async () =>
      (await db.exchangeFavorite.count({
        where: { ownerId: viewer.id, deletedAt: null }
      })) === 0
  );
  ok(
    "Favorites confirm a lost successful reply after tab resume once, survive sign-out, stay owner-only and conceal unavailable sources before removal"
  );

  await go("/platform/exchange?q=" + encodeURIComponent(marker));
  await page.getByText("Save this search", { exact: true }).click();
  const saveForm = page.getByRole("form", {
    name: "Save current search",
    exact: true
  });
  const alertLabel = "Alert me about new matching available listings";
  assert.equal(
    await saveForm.getByLabel(alertLabel, { exact: true }).isChecked(),
    false
  );
  await saveForm
    .getByLabel("Search name", { exact: true })
    .fill("Fictional saved search");
  await saveForm
    .getByRole("button", { name: "Save search", exact: true })
    .click();
  await waitUntil(
    async () =>
      (await db.exchangeSavedSearch.count({
        where: {
          ownerId: viewer.id,
          name: "Fictional saved search",
          alertsSince: null,
          deletedAt: null
        }
      })) === 1
  );
  await page
    .getByRole("link", { name: "Manage saved searches", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Fictional saved search", exact: true })
    .waitFor();
  await page
    .getByRole("link", { name: "Edit filters, name or alerts", exact: true })
    .click();
  const editForm = page.getByRole("form", {
    name: "Update saved search",
    exact: true
  });
  await editForm
    .getByLabel("Search name", { exact: true })
    .fill("Fictional saved search updated");
  await editForm.getByLabel(alertLabel, { exact: true }).check();
  await editForm
    .getByRole("button", { name: "Update saved search", exact: true })
    .click();
  await waitUntil(
    async () =>
      (await db.exchangeSavedSearch.count({
        where: {
          ownerId: viewer.id,
          name: "Fictional saved search updated",
          alertsSince: { not: null },
          version: 2
        }
      })) === 1
  );
  await page.getByRole("link", { name: "Clear filters", exact: true }).click();
  await editForm.waitFor();
  assert.ok(new URL(page.url()).searchParams.get("savedSearch"));
  assert.equal(new URL(page.url()).searchParams.has("q"), false);
  await editForm.getByLabel(alertLabel, { exact: true }).uncheck();
  await editForm
    .getByRole("button", { name: "Update saved search", exact: true })
    .click();
  await waitUntil(
    async () =>
      (await db.exchangeSavedSearch.count({
        where: { ownerId: viewer.id, alertsSince: null, version: 3 }
      })) === 1
  );
  await editForm
    .getByLabel("Search name", { exact: true })
    .fill("Unsent private search name");
  await signIn(stranger);
  await page.evaluate(() => {
    window.dispatchEvent(new Event("blur"));
    window.dispatchEvent(new Event("focus"));
  });
  await waitUntil(async () => !(await editForm.isVisible()));
  assert.equal(
    await db.exchangeSavedSearch.count({ where: { ownerId: stranger.id } }),
    0
  );
  await signIn(viewer);
  await go("/platform/exchange/saved?view=searches");
  await page
    .getByRole("heading", {
      name: "Fictional saved search updated",
      exact: true
    })
    .waitFor();
  ok(
    "Changed sign-in conceals the saved-search editor and never transfers unsent entries to another account"
  );
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await bounded();
  }
  await page.emulateMedia({ colorScheme: "dark" });
  await page.addStyleTag({ content: "html{font-size:24px!important}" });
  await bounded();
  await page.screenshot({
    path: output + "/saved-search-dark-large-mobile.png",
    fullPage: true
  });
  await page
    .getByRole("button", { name: "Remove search", exact: true })
    .click();
  await waitUntil(
    async () =>
      (await db.exchangeSavedSearch.count({
        where: { ownerId: viewer.id, deletedAt: null }
      })) === 0
  );
  ok(
    "Named searches default to alerts off; editing filters and explicit consent preserves ownership and versions; removal stops alerts; narrow, dark and enlarged layouts fit"
  );
  await go("/platform/exchange?q=NoMatchingFixture" + randomUUID());
  await page
    .getByText(
      "No available listings match these choices. Clear the filters or check again later.",
      { exact: true }
    )
    .waitFor();
  await go("/platform/exchange?q=" + encodeURIComponent(marker));
  const currentCard = page.getByRole("link", {
    name: marker + " 2.000",
    exact: true
  });
  await currentCard.waitFor();
  await page.route("**/api/platform/exchange?*", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        message: "Fictional search temporarily unavailable"
      })
    })
  );
  await page.evaluate(() => {
    window.dispatchEvent(new Event("blur"));
    window.dispatchEvent(new Event("focus"));
  });
  await page
    .getByText("Fictional search temporarily unavailable", { exact: true })
    .first()
    .waitFor();
  assert.equal(await currentCard.isVisible(), false);
  await page.unroute("**/api/platform/exchange?*");
  await page
    .getByRole("button", { name: "Recheck current access", exact: true })
    .first()
    .click();
  await currentCard.waitFor();
  const longTitle =
    "LongFixture" + randomUUID().replaceAll("-", "") + "w".repeat(77);
  const longDraft = await exchangeListingCommand(db, publisher.token, {
    operation: "create",
    mutationId: randomUUID(),
    expectedVersion: 0,
    ownerChurchId: null,
    schema: EXCHANGE_EDITOR_SCHEMA,
    fields: {
      ...emptyExchangeFields(),
      title: longTitle,
      description: "Fictional long-title card without a photo",
      category: "FURNITURE",
      condition: "GOOD",
      country: "US",
      placeId: place.id
    }
  });
  await exchangeListingCommand(db, publisher.token, {
    operation: "status",
    mutationId: randomUUID(),
    listingId: longDraft.id,
    expectedVersion: longDraft.version,
    state: "ACTIVE",
    itemPolicy: EXCHANGE_ITEM_POLICY,
    itemConfirmed: true
  });
  await go("/platform/exchange?q=" + encodeURIComponent(longTitle));
  await page.getByRole("link", { name: longTitle, exact: true }).waitFor();
  await page.setViewportSize({ width: 320, height: 844 });
  await page.addStyleTag({ content: "html{font-size:24px!important}" });
  await bounded();
  await page.screenshot({
    path: output + "/long-title-search-mobile.png",
    fullPage: true
  });
  ok(
    "Empty searches explain recovery, failed access rechecks conceal stale rows and retry, and a 120-character unbroken title fits enlarged 320px results without a photo"
  );
  assert.deepEqual(errors, []);
  ok("No browser errors in saved-search and favorite flows");
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
