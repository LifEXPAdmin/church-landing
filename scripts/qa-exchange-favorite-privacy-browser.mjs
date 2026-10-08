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
  const panel = page.locator('section[aria-label="Private listing favorite"]');
  const stateButton = panel.locator("button[aria-pressed]");
  const remove = () => exact("Remove favorite"),
    save = () => exact("Save favorite");
  const ready = async (button) => {
    await button.waitFor();
    await waitUntil(async () => !(await button.isDisabled()));
  };
  const retry = () => exact("Confirm original save");
  const details = () =>
    read(db, owner.token, { view: "favorite", listingId: listing.id });
  const endpoint = config.origin + "/api/platform/exchange";
  const favoriteRoute = (url) =>
    url.pathname === "/api/platform/exchange" &&
    url.searchParams.get("view") === "favorite";
  await signIn(owner);
  await intercept(favoriteRoute, (route) =>
    route.fulfill({
      status: 403,
      contentType: "application/json",
      body: JSON.stringify({
        message: "Injected current favorite access denial"
      })
    })
  );
  const html = await (await go(path)).text();
  const rsc = await (
    await context.request.get(config.origin + path, { headers: { RSC: "1" } })
  ).text();
  for (const body of [html, rsc]) assert.ok(!body.includes(favorite.id));
  await panel
    .getByText("Injected current favorite access denial", { exact: true })
    .waitFor();
  assert.equal(await stateButton.count(), 0);
  ok(
    "HTML/RSC omit the favorite association and denied canonical access leaves no saved-state button in the DOM"
  );
  await clearIntercepts();
  await go(path);
  await ready(remove());
  for (const event of ["blur", "pagehide", "offline"]) {
    await signal(event);
    assert.equal(await stateButton.count(), 0);
    await signal("online");
    await signal("social-relationships-changed");
    assert.equal(await stateButton.count(), 0);
    await signal("focus");
    await ready(remove());
    assert.equal(await remove().getAttribute("aria-pressed"), "true");
  }
  ok(
    "Blur, pagehide and offline physically omit favorite state; passive events cannot reopen it"
  );
  await bounded();
  await page.screenshot({ path: output + "/favorite-390.png", fullPage: true });

  const bodies = [];
  await intercept(endpoint, async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    bodies.push(route.request().postData());
    if (bodies.length <= 2)
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: bodies.length === 1 ? randomUUID() : favorite.id,
          version: bodies.length === 1 ? 2 : 1,
          message: "Injected malformed receipt"
        })
      });
    return route.continue();
  });
  await remove().click();
  await ready(retry());
  await retry().click();
  await ready(retry());
  assert.equal(bodies.length, 2);
  assert.equal(bodies[0], bodies[1]);
  assert.equal((await details()).favorite.version, 1);
  await retry().click();
  await ready(save());
  assert.equal(bodies.length, 3);
  assert.equal(bodies[0], bodies[2]);
  assert.equal((await details()).favorite.version, 2);
  await clearIntercepts();
  ok(
    "Wrong-target and stale-version responses retain one exact request until its genuine receipt and canonical readback"
  );

  const lost = [];
  await intercept(endpoint, async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    lost.push(route.request().postData());
    if (lost.length === 1) {
      const response = await route.fetch();
      assert.equal(response.status(), 200);
      return route.abort("failed");
    }
    return route.continue();
  });
  await save().click();
  await ready(retry());
  const beforeDeparture = page.url();
  await page
    .getByRole("link", { name: "Return to listing results", exact: true })
    .click();
  assert.equal(page.url(), beforeDeparture);
  await command(db, owner.token, {
    operation: "favorite-remove",
    mutationId: randomUUID(),
    favoriteId: favorite.id,
    expectedVersion: 3
  });
  await command(db, owner.token, {
    operation: "favorite-add",
    mutationId: randomUUID(),
    listingId: listing.id,
    expectedVersion: 4
  });
  await signal("blur");
  await signal("focus");
  await ready(retry());
  assert.equal(await stateButton.count(), 0);
  await retry().click();
  await ready(remove());
  assert.equal(lost.length, 2);
  assert.equal(lost[0], lost[1]);
  assert.equal((await details()).favorite.version, 5);
  await remove().click();
  await ready(save());
  assert.equal(JSON.parse(lost[2]).expectedVersion, 5);
  assert.equal((await details()).favorite.version, 6);
  await clearIntercepts();
  ok(
    "A lost save blocks departure and replays its exact body; only its receipt permits adopting a newer favorite and a version-six removal"
  );

  // Keep canonical acknowledgement in flight across concealment, then allow a fresh read.
  let releaseRead,
    readStarted,
    hold = true;
  const gate = new Promise((resolve) => {
      releaseRead = resolve;
    }),
    started = new Promise((resolve) => {
      readStarted = resolve;
    });
  await intercept(favoriteRoute, async (route) => {
    const response = await route.fetch();
    if (hold) {
      readStarted();
      await within(gate, "Favorite readback");
    }
    return route.fulfill({ response });
  });
  await save().click();
  try {
    await within(started, "Favorite acknowledgement");
    assert.equal(await stateButton.count(), 0);
    await signal("blur");
  } finally {
    hold = false;
    releaseRead();
  }
  await clearIntercepts();
  assert.equal(await stateButton.count(), 0);
  await signal("focus");
  await ready(remove());
  assert.equal((await details()).favorite.version, 7);
  ok(
    "A held canonical read and hidden receipt cannot expose or rearm favorite state before a fresh visible acknowledgement"
  );

  const withdrawn = [];
  let releaseReplay;
  const replayGate = new Promise((resolve) => {
    releaseReplay = resolve;
  });
  await intercept(endpoint, async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    withdrawn.push(route.request().postData());
    if (withdrawn.length === 1) {
      const response = await route.fetch();
      assert.equal(response.status(), 200);
      return route.abort("failed");
    }
    await within(replayGate, "Withdrawn favorite replay");
    return route.continue();
  });
  await remove().click();
  await ready(retry());
  await db.exchangeListing.update({
    where: { id: listing.id },
    data: { state: "DRAFT", publishedAt: null, version: { increment: 1 } }
  });
  await signal("blur");
  await signal("focus");
  const outerRetry = exact("Confirm original request");
  await ready(outerRetry);
  assert.equal(await stateButton.count(), 0);
  const pendingRecovery = page.locator("button").filter({
    hasText:
      /^(?:Confirm original request|Confirming original request…|Confirm original save|Confirming save…)$/
  });
  await outerRetry.click();
  try {
    await exact("Confirming original request…").waitFor();
    await waitUntil(async () => withdrawn.length === 2);
    // A busy label is still a pending request, including the hidden leaf.
    assert.ok((await pendingRecovery.count()) >= 2);
  } finally {
    releaseReplay();
  }
  await waitUntil(
    async () => withdrawn.length === 2 && (await pendingRecovery.count()) === 0
  );
  await clearIntercepts();
  assert.equal(withdrawn[0], withdrawn[1]);
  assert.deepEqual((await details()).favorite, {
    id: favorite.id,
    version: 8,
    saved: false
  });
  assert.equal(await stateButton.count(), 0);
  ok(
    "A withdrawn listing stays concealed while a current eligible account can confirm only its retained original request"
  );

  await db.exchangeListing.update({
    where: { id: listing.id },
    data: {
      state: "ACTIVE",
      publishedAt: new Date(),
      version: { increment: 1 }
    }
  });
  await go(path);
  await ready(save());
  await signIn(other);
  await signal("blur");
  await signal("focus");
  await panel
    .getByText(
      "Your sign-in changed. Private choices were cleared. Reload for your current account.",
      { exact: true }
    )
    .waitFor({ state: "attached" });
  assert.equal(await stateButton.count(), 0);
  assert.equal(
    await db.exchangeFavorite.count({ where: { ownerId: other.id } }),
    0
  );
  ok(
    "Confirmed account replacement clears favorite ownership and never transfers the original choice"
  );
  const foreign = await (await go(path)).text();
  assert.ok(!foreign.includes(favorite.id));
  await ready(save());
  assert.equal(
    (await read(db, other.token, { view: "favorite", listingId: listing.id }))
      .favorite,
    null
  );
  await bounded();
  await page.setViewportSize({ width: 320, height: 844 });
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
  });
  await bounded();
  await page.screenshot({
    path: output + "/favorite-320-200.png",
    fullPage: true
  });
  assert.deepEqual(layoutFailures, []);
  ok(
    "Another account starts unsaved without writes; favorite controls fit 390px and 320px with 200 percent text"
  );
  assert.deepEqual(errors, []);
  writeFileSync(
    output + "/results.json",
    JSON.stringify(
      {
        baseline: false,
        layoutFailures,
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
