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
const { createPortalActor, assertPortalTestDatabase, seedOperatorGrants } =
  await import("../tests/seed-portal.ts");
const { EXCHANGE_ITEM_POLICY } =
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
  await within(Promise.all([...routed]), "Routed saved-list requests");
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
  output = fixtureDir + "/exchange-saved-list-browser-" + Date.now();
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
  throw Error("Expected current saved-list state was not observed");
};
const exact = (name) => page.getByRole("button", { name, exact: true });
const signal = (name) =>
  page.evaluate((name) => window.dispatchEvent(new Event(name)), name);
try {
  const { exchangeSavedCommand: command, readExchangeSaved: read } =
    await import("../lib/platform/exchange-saved.ts");
  const { EXCHANGE_SAVED_SCHEMA } =
    await import("../lib/platform/exchange-options.ts");
  const owner = await createPortalActor(db, "savedlistowner"),
    other = await createPortalActor(db, "savedlistother");
  const searchName = "Private saved search " + randomUUID(),
    criteriaText = "Private criterion " + randomUUID(),
    title = "Fictional saved favorite " + randomUUID();
  const input = (operation, fields) => ({
    operation,
    mutationId: randomUUID(),
    ...fields
  });
  const listing = await db.exchangeListing.create({
    data: {
      ownerId: owner.id,
      creatorId: owner.id,
      state: "ACTIVE",
      title,
      description: "Fictional saved list source",
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
  const favorite = await command(
    db,
    owner.token,
    input("favorite-add", { listingId: listing.id, expectedVersion: 0 })
  );
  const search = await command(
    db,
    owner.token,
    input("search-save", {
      searchId: randomUUID(),
      expectedVersion: 0,
      schema: EXCHANGE_SAVED_SCHEMA,
      name: searchName,
      criteria: { q: criteriaText },
      alerts: false
    })
  );
  const endpoint = config.origin + "/api/platform/exchange";
  const listRoute = (url) =>
    url.pathname === "/api/platform/exchange" &&
    ["favorites", "searches"].includes(url.searchParams.get("view"));
  const panel = page.locator('section[aria-label="Saved Exchange choices"]');
  const rows = panel.locator("li");
  const searches = () => read(db, owner.token, { view: "searches" });
  const favorites = () => read(db, owner.token, { view: "favorites" });
  await signIn(owner);
  await intercept(listRoute, (route) =>
    route.fulfill({
      status: 403,
      contentType: "application/json",
      body: JSON.stringify({ message: "Injected saved-list access denial" })
    })
  );
  const response = await go("/platform/exchange/saved?view=searches"),
    html = await response.text();
  const rsc = await context.request.get(
      config.origin + "/platform/exchange/saved?view=searches",
      { headers: { RSC: "1" } }
    ),
    rscBody = await rsc.text();
  for (const text of [html, rscBody]) {
    assert.ok(!text.includes(searchName));
    assert.ok(!text.includes(search.id));
    assert.ok(!text.includes(criteriaText));
  }
  await panel
    .getByText("Injected saved-list access denial", { exact: true })
    .waitFor();
  assert.equal(await rows.count(), 0);
  await clearIntercepts();
  await panel
    .getByRole("button", { name: "Recheck current access", exact: true })
    .click();
  await panel.getByText(searchName, { exact: true }).waitFor();
  ok(
    "Saved-list HTML/RSC omit names, criteria and associations; denied first read mounts no private rows"
  );
  for (const event of ["blur", "pagehide", "offline"]) {
    await signal(event);
    assert.equal(await rows.count(), 0);
    assert.ok(!(await panel.textContent()).includes(searchName));
    assert.equal(await panel.locator('a[href*="savedSearch="]').count(), 0);
    await signal("social-relationships-changed");
    await signal("online");
    assert.equal(await rows.count(), 0);
    await signal("focus");
    await panel.getByText(searchName, { exact: true }).waitFor();
  }
  await bounded();
  await page.screenshot({ path: output + "/saved-390.png", fullPage: true });
  await page.setViewportSize({ width: 320, height: 800 });
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
  });
  await bounded();
  await page.screenshot({
    path: output + "/saved-320-200.png",
    fullPage: true
  });
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "";
  });
  await page.setViewportSize({ width: 390, height: 844 });
  ok(
    "Concealment physically omits saved choices and private links; current-owner resume restores them and both mobile text sizes fit"
  );
  // Three independently versioned rows exercise sequential receipt ownership.
  for (let i = 0; i < 2; i++)
    await command(
      db,
      owner.token,
      input("search-save", {
        searchId: randomUUID(),
        expectedVersion: 0,
        schema: EXCHANGE_SAVED_SCHEMA,
        name: searchName + " " + i,
        criteria: { q: criteriaText },
        alerts: false
      })
    );
  await go("/platform/exchange/saved?view=searches");
  await waitUntil(async () => (await rows.count()) === 3);
  const beforeRows = (await searches()).searches;
  await rows
    .nth(0)
    .getByRole("button", { name: "Remove search", exact: true })
    .click();
  await waitUntil(async () => (await rows.count()) === 2);
  await waitUntil(
    async () =>
      !(await rows
        .nth(0)
        .getByRole("button", { name: "Remove search", exact: true })
        .isDisabled())
  );
  let releaseRead,
    readStarted,
    holdRead = false;
  const readGate = new Promise((resolve) => {
      releaseRead = resolve;
    }),
    readReady = new Promise((resolve) => {
      readStarted = resolve;
    });
  await intercept(listRoute, async (route) => {
    const response = await route.fetch();
    if (holdRead) {
      readStarted();
      await within(readGate, "Second removal readback");
    }
    return route.fulfill({ response });
  });
  await intercept(endpoint, async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    const response = await route.fetch();
    holdRead = true;
    return route.fulfill({ response });
  });
  await rows
    .nth(0)
    .getByRole("button", { name: "Remove search", exact: true })
    .click();
  try {
    await within(readReady, "Second removal receipt readback");
    assert.equal(await rows.count(), 0);
    assert.equal((await searches()).searches.length, 1);
  } finally {
    releaseRead();
  }
  await clearIntercepts();
  await waitUntil(async () => (await rows.count()) === 1);
  await waitUntil(async () => !(await exact("Remove search").isDisabled()));
  for (const row of beforeRows.slice(0, 2))
    assert.equal(
      (
        await db.exchangeSavedSearch.findUniqueOrThrow({
          where: { id: row.id }
        })
      ).version,
      2
    );
  ok(
    "Two rows with equal receipt version 2 each require their own fresh readback before another removal"
  );
  const bodies = [];
  let step = 0;
  await intercept(endpoint, async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    const body = route.request().postData();
    bodies.push(body);
    step++;
    if (step === 1) {
      const response = await route.fetch();
      assert.equal(response.status(), 200);
      return route.abort("failed");
    }
    if (step === 2)
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: beforeRows[0].id,
          version: 2,
          message: "Wrong target receipt"
        })
      });
    if (step === 3)
      return route.fulfill({
        status: 429,
        contentType: "application/json",
        body: JSON.stringify({ message: "Injected retry limit" })
      });
    if (step === 4)
      return route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ message: "Injected temporary failure" })
      });
    return route.continue();
  });
  await exact("Remove search").click();
  await exact("Confirm original save").waitFor();
  await signal("blur");
  await signal("focus");
  await waitUntil(
    async () => !(await exact("Confirm original save").isDisabled())
  );
  assert.equal(await rows.count(), 0);
  for (let i = 0; i < 4; i++) {
    await exact("Confirm original save").click();
    if (i < 3)
      await waitUntil(
        async () =>
          (await exact("Confirm original save").count()) === 1 &&
          !(await exact("Confirm original save").isDisabled())
      );
  }
  await panel
    .getByText("No named searches on this page.", { exact: false })
    .waitFor();
  await clearIntercepts();
  assert.equal(bodies.length, 5);
  assert.ok(bodies.every((body) => body === bodies[0]));
  const deletedId = JSON.parse(bodies[0]).searchId;
  assert.equal(
    (
      await db.exchangeSavedSearch.findUniqueOrThrow({
        where: { id: deletedId }
      })
    ).version,
    2
  );
  assert.equal((await searches()).searches.length, 0);
  ok(
    "Lost search deletion, absent row, wrong-target receipt, 429 and 503 recover five identical requests with one version increment"
  );
  // A favorite may be re-added after the accepted removal but before its replay.
  await go("/platform/exchange/saved?view=favorites");
  await panel.getByText(title, { exact: true }).waitFor();
  const favoriteHtml = await (
    await context.request.get(config.origin + "/platform/exchange/saved")
  ).text();
  assert.ok(!favoriteHtml.includes(favorite.id));
  assert.ok(!favoriteHtml.includes(title));
  const favoriteBodies = [];
  await intercept(endpoint, async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    favoriteBodies.push(route.request().postData());
    if (favoriteBodies.length === 1) {
      const response = await route.fetch();
      assert.equal(response.status(), 200);
      return route.abort("failed");
    }
    return route.continue();
  });
  await exact("Remove favorite").click();
  await exact("Confirm original save").waitFor();
  const tombstone = await db.exchangeFavorite.findUniqueOrThrow({
    where: { id: favorite.id }
  });
  await command(
    db,
    owner.token,
    input("favorite-add", {
      listingId: listing.id,
      expectedVersion: tombstone.version
    })
  );
  await signal("blur");
  await signal("focus");
  await waitUntil(
    async () => !(await exact("Confirm original save").isDisabled())
  );
  assert.equal(await rows.count(), 0);
  await exact("Confirm original save").click();
  await panel.getByText(title, { exact: true }).waitFor();
  await waitUntil(async () => !(await exact("Remove favorite").isDisabled()));
  await clearIntercepts();
  assert.equal(favoriteBodies.length, 2);
  assert.equal(favoriteBodies[0], favoriteBodies[1]);
  assert.equal((await favorites()).favorites[0].version, 3);
  ok(
    "An original favorite removal replays exactly after a separate re-add; the newly authorized version remains available"
  );
  // The current source can be redacted while the owned saved reference stays removable.
  await db.exchangeListing.update({
    where: { id: listing.id },
    data: { state: "ARCHIVED", publishedAt: null }
  });
  await go("/platform/exchange/saved?view=favorites");
  await panel.getByText("Listing unavailable", { exact: true }).waitFor();
  let releaseReply, replyStarted;
  const replyGate = new Promise((resolve) => {
      releaseReply = resolve;
    }),
    replyReady = new Promise((resolve) => {
      replyStarted = resolve;
    });
  await intercept(endpoint, async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    const response = await route.fetch();
    assert.equal(response.status(), 200);
    replyStarted();
    await within(replyGate, "Hidden accepted removal");
    return route.fulfill({ response });
  });
  await exact("Remove favorite").click();
  try {
    await within(replyReady, "Accepted removal response");
    assert.equal(
      await panel
        .locator("button")
        .filter({ hasText: /^Confirming save…$/ })
        .count(),
      1
    );
    await signal("blur");
    assert.equal(await rows.count(), 0);
  } finally {
    releaseReply();
  }
  await clearIntercepts();
  await waitUntil(
    async () =>
      (await panel
        .locator("button")
        .filter({ hasText: /^Confirming save…$/ })
        .count()) === 0
  );
  assert.equal(await rows.count(), 0);
  await signal("focus");
  await panel
    .getByText("No favorite listings on this page.", { exact: false })
    .waitFor();
  assert.equal((await favorites()).favorites.length, 0);
  ok(
    "Redacted saved references remain removable and a late accepted response cannot reopen concealed content"
  );
  // A deleted previous-page anchor must not strand the immutable current-page command.
  for (let i = 0; i < 21; i++)
    await command(
      db,
      owner.token,
      input("search-save", {
        searchId: randomUUID(),
        expectedVersion: 0,
        schema: EXCHANGE_SAVED_SCHEMA,
        name: "Private cursor choice " + i,
        criteria: { q: criteriaText },
        alerts: false
      })
    );
  const firstPage = await searches(),
    anchor = firstPage.searches.find((row) => row.id === firstPage.after);
  const cursorPath =
    "/platform/exchange/saved?view=searches&after=" + firstPage.after;
  await go(cursorPath);
  await waitUntil(async () => (await rows.count()) === 1);
  const cursorBodies = [];
  await intercept(endpoint, async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    cursorBodies.push(route.request().postData());
    if (cursorBodies.length === 1) {
      const response = await route.fetch();
      assert.equal(response.status(), 200);
      return route.abort("failed");
    }
    return route.continue();
  });
  await exact("Remove search").click();
  await exact("Confirm original save").waitFor();
  await command(
    db,
    owner.token,
    input("search-delete", {
      searchId: anchor.id,
      expectedVersion: anchor.version
    })
  );
  await signal("blur");
  await signal("focus");
  await waitUntil(
    async () => !(await exact("Confirm original save").isDisabled())
  );
  assert.equal(await rows.count(), 0);
  await panel
    .getByRole("link", { name: "Open first page", exact: true })
    .click();
  await page
    .getByText("Save or resolve your private choice before leaving.", {
      exact: true
    })
    .waitFor();
  assert.equal(
    new URL(page.url()).search,
    "?view=searches&after=" + firstPage.after
  );
  await exact("Confirm original save").click();
  await waitUntil(
    async () => (await exact("Confirm original save").count()) === 0
  );
  await clearIntercepts();
  assert.equal(cursorBodies.length, 2);
  assert.equal(cursorBodies[0], cursorBodies[1]);
  assert.equal(await rows.count(), 0);
  await panel
    .getByRole("link", { name: "Open first page", exact: true })
    .click();
  await waitUntil(async () => (await rows.count()) === 19);
  assert.equal(new URL(page.url()).search, "?view=searches");
  ok(
    "Deleted cursor anchor uses first-page authorization only for exact replay, blocks pending navigation and offers deliberate first-page recovery"
  );
  const retainedName = (await searches()).searches[0].name;
  await signIn(other);
  await signal("focus");
  await panel
    .getByText(
      "Your sign-in changed. Private entries were cleared. Reload for your current account.",
      { exact: true }
    )
    .waitFor();
  assert.equal(await rows.count(), 0);
  assert.ok(!(await panel.textContent()).includes(retainedName));
  assert.equal(
    (await read(db, other.token, { view: "searches" })).searches.length,
    0
  );
  assert.equal(
    (await read(db, other.token, { view: "favorites" })).favorites.length,
    0
  );
  ok(
    "Confirmed account replacement clears the retained list/command owner; canonical reads never return another account's choices"
  );
  assert.deepEqual(layoutFailures, []);
  assert.deepEqual(errors, []);
  writeFileSync(
    output + "/results.json",
    JSON.stringify(
      {
        results,
        errors,
        layoutFailures,
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
    JSON.stringify(
      { results, errors, layoutFailures, error: String(error) },
      null,
      2
    )
  );
  throw error;
} finally {
  await context.close();
  await browser.close();
  await db.$disconnect();
}
