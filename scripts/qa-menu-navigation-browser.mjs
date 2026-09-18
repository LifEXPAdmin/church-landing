import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";

const fixtureDir = process.argv[2];
assert.match(fixtureDir ?? "", /^\.account-test\/[a-z0-9-]+$/);
const config = JSON.parse(
  readFileSync(fixtureDir + "/browser-env.json", "utf8")
);
assert.match(config.origin, /^https:\/\/127\.0\.0\.1:\d+$/);
assert.equal(new URL(config.database).hostname, "127.0.0.1");
assert.equal(new URL(config.database).pathname, "/godschurches_security_test");
assert.ok(
  process.env.AUTH_RATE_LIMIT_SECRET,
  "Use the isolated preview environment"
);
Object.assign(process.env, {
  DATABASE_URL: config.database,
  DIRECT_URL: config.database,
  ACCOUNT_ORIGIN: config.origin,
  NEXT_PUBLIC_SITE_URL: config.origin,
  ACCOUNT_TEST_ISOLATED: "1",
  ACCOUNT_DELIVERY_MODE: "test-sink",
  ACCOUNT_TEST_SINK_DIR: process.cwd() + "/" + fixtureDir + "/sink",
  NODE_ENV: "test",
  VERCEL: "",
  PRIVILEGED_MFA_MODE: "off",
  COMMUNITY_REPORTS_ENABLED: "true",
  SOCIAL_EMAIL_ENABLED: "false",
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
const { EXCHANGE_ITEM_POLICY, EXCHANGE_EDITOR_SCHEMA, emptyExchangeFields } =
  await import("../lib/platform/exchange-options.ts");
const { searchDiscoveryPlaces } =
  await import("../lib/platform/discovery-places.ts");
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
    "--no-proxy-server"
  ]
});
const context = await browser.newContext({
  viewport: { width: 320, height: 844 },
  hasTouch: true
});
await context.route("**/*", (route) =>
  new URL(route.request().url()).origin === config.origin
    ? route.continue()
    : route.abort()
);
const page = await context.newPage(),
  errors = [],
  results = [];
const output = fixtureDir + "/navigation-browser-" + Date.now();
mkdirSync(output, { recursive: true });
page.on("pageerror", (e) =>
  errors.push({ path: new URL(page.url()).pathname, message: e.message })
);
const ok = (message) => {
  results.push(message);
  console.log("PASS " + message);
};
const go = async (path) =>
  assert.equal((await page.goto(config.origin + path)).status(), 200);
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
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw Error("Expected current navigation state was not observed");
};
const menu = () => page.locator(".gc-menu-page");
const menuLink = (href) => menu().locator(`a[href="${href}"]`);
try {
  const publisher = await createPortalActor(db, "navpub"),
    viewer = await createPortalActor(db, "navview"),
    reviewer = await createPortalActor(db, "navreview");
  await seedOperatorGrants(db, reviewer, ["REVIEW_COMMUNITY_REPORTS"]);
  const place = (await searchDiscoveryPlaces("US", "Chicago")).places[0];
  const marker = "Navigation fixture " + randomUUID(),
    listings = [];
  for (const price of ["1.00", "2.00", "3.00"]) {
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
        description: "Fictional navigation fixture",
        category: "FURNITURE",
        condition: "GOOD",
        country: "US",
        placeId: place.id,
        currency: "USD",
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
  await signIn(null);
  await go("/platform/menu");
  const nav = page.getByRole("navigation", { name: "Platform", exact: true });
  assert.deepEqual(await nav.locator("a span").allTextContents(), [
    "Home",
    "Churches",
    "Explore",
    "Messages",
    "Menu"
  ]);
  for (const name of ["Community", "Discover", "My activity", "Account"])
    await menu().getByRole("heading", { name, exact: true }).waitFor();
  for (const href of [
    "/platform/admin",
    "/platform/drafts",
    "/platform/messages/requests",
    "/platform/activity"
  ])
    assert.equal(await menuLink(href).count(), 0, href);
  const guestLinks = await menu()
    .locator("a")
    .evaluateAll((nodes) =>
      nodes
        .filter((node) => node.getClientRects().length > 0)
        .map((node) => node.href)
    );
  assert.ok(
    !guestLinks.some((href) =>
      /\/platform\/(media|businesses|foundry)(\/|$)/.test(href)
    )
  );
  await menu().locator("a").first().focus();
  const visited = new Set();
  for (let i = 0; i < guestLinks.length + 20; i++) {
    const href = await page.evaluate(
      () =>
        document.activeElement?.closest(".gc-menu-page") &&
        document.activeElement.href
    );
    if (href) visited.add(href);
    await page.keyboard.press("Tab");
  }
  for (const href of guestLinks)
    assert.ok(visited.has(href), "Keyboard reaches " + href);
  const bookmarkHelp = menu().getByRole("button", {
    name: /^Bookmark God’s Churches/
  });
  await bookmarkHelp.focus();
  await page.keyboard.press("Enter");
  await page
    .getByRole("dialog")
    .getByRole("heading", { name: "Bookmark God’s Churches", exact: true })
    .waitFor();
  await page.keyboard.press("Escape");
  assert.equal(await page.getByRole("dialog").count(), 0);
  assert.equal(
    await bookmarkHelp.evaluate((node) => node === document.activeElement),
    true
  );
  await bounded();
  await page.screenshot({ path: output + "/guest-320.png", fullPage: true });
  await menuLink("/platform/exchange").focus();
  await page.keyboard.press("Enter");
  await page.waitForURL("**/platform/exchange");
  await page.getByRole("heading", { name: "Exchange", exact: true }).waitFor();
  await nav.getByRole("link", { name: "Menu", exact: true }).click();
  await menuLink("/platform/groups").click();
  await page.waitForURL("**/platform/groups");
  assert.equal(await page.locator("h1").count(), 1);
  ok(
    "Guest Menu retains five primary links, four groups, keyboard-reachable real Exchange/Gather pages and no private or future-module entries"
  );

  await go("/platform/menu");
  await menuLink("/platform/settings").click();
  await page.waitForURL("**/platform/settings");
  await page
    .getByRole("link", { name: "Sign in", exact: true })
    .first()
    .waitFor();
  assert.equal(await page.locator('input[type="password"]').count(), 0);
  await signIn(viewer);
  await go("/platform/menu");
  await menuLink("/platform/profile/" + viewer.username).waitFor();
  await menuLink("/platform/invitations").waitFor();
  for (const href of [
    "/platform/drafts",
    "/platform/messages/requests",
    "/platform/activity"
  ])
    assert.equal(await menuLink(href).count(), 1, href);
  assert.equal(await menuLink("/platform/admin").count(), 0);
  assert.equal(
    await nav.getByRole("link", { name: "My church", exact: true }).count(),
    1
  );
  await menuLink("/platform/profile/" + viewer.username).click();
  await page.waitForURL("**/platform/profile/" + viewer.username);
  await nav.getByRole("link", { name: "Menu", exact: true }).click();
  await menuLink("/platform/calendars").click();
  await page.waitForURL("**/platform/calendars");
  await page
    .getByRole("navigation", { name: "Account and website", exact: true })
    .getByRole("link", { name: "Settings", exact: true })
    .click();
  await page.waitForURL("**/platform/settings");
  await page.goBack();
  await page.waitForURL("**/platform/calendars");
  ok(
    "Guest account gates and member profile, QR, private entries, calendars and header Settings remain reachable with browser Back"
  );

  await signIn(reviewer);
  await go("/platform/menu");
  await menuLink("/platform/admin").waitFor();
  await menuLink("/platform/admin").click();
  await page.waitForURL("**/platform/admin");
  await db.platformOperatorGrant.updateMany({
    where: {
      userId: reviewer.id,
      capability: "REVIEW_COMMUNITY_REPORTS",
      revokedAt: null
    },
    data: { revokedAt: new Date(), version: { increment: 1 } }
  });
  await go("/platform/menu");
  assert.equal(await menuLink("/platform/admin").count(), 0);
  await signIn(publisher);
  await go("/platform/menu");
  assert.equal(
    await menuLink("/platform/profile/" + viewer.username).count(),
    0
  );
  await menuLink("/platform/profile/" + publisher.username).waitFor();
  ok(
    "Administration follows current server authority; revoked operators and switched accounts do not inherit previous Menu entries"
  );

  await signIn(viewer);
  await go(
    "/platform/exchange?q=" +
      encodeURIComponent(marker) +
      "&currency=USD&basis=item&maxPrice=2.00&sort=price-high"
  );
  const resultLinks = page.locator('h2 a[href^="/platform/exchange/"]');
  await page
    .getByRole("link", { name: marker + " 2.00", exact: true })
    .waitFor();
  assert.deepEqual(await resultLinks.allTextContents(), [
    marker + " 2.00",
    marker + " 1.00"
  ]);
  const criteriaUrl = page.url();
  await resultLinks.first().scrollIntoViewIfNeeded();
  const scrollBefore = await page.evaluate(() => scrollY);
  await resultLinks.first().click();
  await page.waitForURL(
    (url) => url.pathname === "/platform/exchange/" + listings[1].id
  );
  await page
    .getByRole("heading", { name: marker + " 2.00", exact: true, level: 1 })
    .waitFor();
  await page.goBack();
  await page
    .getByRole("link", { name: marker + " 2.00", exact: true })
    .waitFor();
  await waitUntil(
    async () =>
      Math.abs((await page.evaluate(() => scrollY)) - scrollBefore) < 50
  );
  assert.equal(page.url(), criteriaUrl);
  await bounded();
  ok(
    "Exchange list-to-detail browser Back preserves filters, result order and scroll through the shared navigation shell"
  );

  await go("/platform/menu");
  await page.setViewportSize({ width: 1280, height: 900 });
  await bounded();
  await page.screenshot({
    path: output + "/member-desktop.png",
    fullPage: true
  });
  await page.setViewportSize({ width: 320, height: 844 });
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
  });
  await bounded();
  await menuLink("/platform/settings").scrollIntoViewIfNeeded();
  await page.screenshot({
    path: output + "/member-320-large-text.png",
    fullPage: true
  });
  assert.equal(await page.locator("nextjs-portal").count(), 0);
  assert.deepEqual(errors, []);
  ok(
    "Desktop, 320px and doubled-root-text Menu stay bounded with no runtime errors or development overlays"
  );
  writeFileSync(
    output + "/result.json",
    JSON.stringify({ passed: results.length, results, errors }, null, 2)
  );
  console.log(JSON.stringify({ output, passed: results.length, errors }));
} catch (error) {
  await page
    .screenshot({ path: output + "/failure.png", fullPage: true })
    .catch(() => {});
  writeFileSync(
    output + "/failure.json",
    JSON.stringify(
      { error: String(error), url: page.url(), results, errors },
      null,
      2
    )
  );
  throw error;
} finally {
  await browser.close();
  await db.$disconnect();
}
