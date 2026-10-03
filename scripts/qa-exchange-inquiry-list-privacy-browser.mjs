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
  output = fixtureDir + "/exchange-inquiry-list-browser-" + Date.now();
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
const exact = (name) => page.getByRole("button", { name, exact: true });
const signal = (name) =>
  page.evaluate((name) => window.dispatchEvent(new Event(name)), name);
const waitUntil = async (work) => {
  for (let i = 0; i < 100; i++) {
    if (await work()) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw Error("Expected current inquiry list state was not observed");
};
const listRoute = (url) =>
  url.pathname === "/api/platform/exchange" &&
  ["handoff-incoming", "handoff-outgoing"].includes(
    url.searchParams.get("view")
  );
const rows = () => page.locator('a[href^="/platform/exchange/handoffs/"]');
const ids = () =>
  rows().evaluateAll((links) =>
    links.map((link) => link.getAttribute("href").split("/").at(-1))
  );
try {
  const { exchangeHandoffCommand: command, readExchangeHandoffs } =
    await import("../lib/platform/exchange-handoffs.ts");
  const owner = await createPortalActor(db, "inquirylistowner"),
    requester = await createPortalActor(db, "inquirylistrequester"),
    reviewer = await createPortalActor(db, "inquirylistreviewer");
  await seedOperatorGrants(db, reviewer, ["REVIEW_COMMUNITY_REPORTS"]);
  await db.socialPreferences.create({
    data: { ownerId: owner.id, contactRequests: "EVERYONE" }
  });
  const title = "Fictional inquiry list source " + randomUUID();
  const listing = await db.exchangeListing.create({
    data: {
      ownerId: owner.id,
      creatorId: owner.id,
      state: "ACTIVE",
      title,
      description: "Fictional list privacy fixture",
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
  const input = (operation, data) => ({
    operation,
    mutationId: randomUUID(),
    ...data
  });
  await command(
    db,
    owner.token,
    input("contact", {
      listingId: listing.id,
      listingVersion: listing.version,
      expectedVersion: listing.inquiryContactVersion,
      enabled: true
    })
  );
  const target = (
    await readExchangeHandoffs(db, requester.token, {
      view: "target",
      listingId: listing.id
    })
  ).target;
  assert.ok(target?.available);
  const receipt = await command(
    db,
    requester.token,
    input("inquire", {
      id: randomUUID(),
      expectedVersion: 0,
      listingId: listing.id,
      listingVersion: target.listingVersion,
      contactVersion: target.contactVersion,
      purpose: "Private fictional purpose omitted from summaries"
    })
  );
  const original = await db.exchangeInquiry.findUniqueOrThrow({
    where: { id: receipt.id }
  });
  // Historical fixtures exercise the existing seek cursor without inventing
  // duplicate active inquiries (the database separately prohibits those).
  for (let i = 1; i <= 21; i++)
    await db.exchangeInquiry.create({
      data: {
        ...original,
        id: randomUUID(),
        state: "EXPIRED",
        endedAt: new Date(),
        createdAt: new Date(original.createdAt.getTime() - i * 1000),
        wakeAt: null
      }
    });
  const otherListing = await db.exchangeListing.create({
    data: {
      ...listing,
      id: randomUUID(),
      title: "Other fictional inquiry source"
    }
  });
  await db.exchangeInquiry.create({
    data: {
      ...original,
      id: randomUUID(),
      listingId: otherListing.id,
      state: "EXPIRED",
      endedAt: new Date(),
      createdAt: new Date(original.createdAt.getTime() - 30000),
      wakeAt: null
    }
  });
  for (const [view, actor, person] of [
    ["incoming", owner, requester],
    ["outgoing", requester, owner]
  ]) {
    await signIn(actor);
    const path = "/platform/exchange/handoffs?view=" + view;
    const canonical = await readExchangeHandoffs(db, actor.token, { view });
    assert.equal(canonical.inquiries.length, 20);
    assert.ok(canonical.after);
    for (const headers of [{}, { RSC: "1" }]) {
      const response = await context.request.get(config.origin + path, {
        headers
      });
      assert.equal(response.status(), 200);
      assert.match(response.headers()["cache-control"], /no-store/);
      const body = await response.text();
      for (const marker of [person.name, title, receipt.id, canonical.after])
        assert.ok(
          !body.includes(marker),
          "Initial HTML/RSC omits private participant, listing and returned cursor"
        );
    }
    await go(path);
    await rows().first().waitFor();
    assert.deepEqual(
      await ids(),
      canonical.inquiries.map((row) => row.id)
    );
    await bounded();
    ok(
      view +
        " HTML/RSC omit private summaries and the current read presents the canonical first 20 rows"
    );
  }
  await signIn(owner);
  await intercept(listRoute, (route) =>
    route.fulfill({
      status: 403,
      contentType: "application/json",
      body: JSON.stringify({ message: "Injected inquiry access denial" })
    })
  );
  await go("/platform/exchange/handoffs?view=incoming");
  await page
    .getByText("Injected inquiry access denial", { exact: true })
    .waitFor();
  assert.equal(await rows().count(), 0);
  assert.ok(
    !(await page.locator("script").allTextContents())
      .join("")
      .includes(requester.name)
  );
  await clearIntercepts();
  await exact("Recheck current access").click();
  await rows().first().waitFor();
  ok("Denied first read exposes no private rows and current retry recovers");

  for (const event of ["blur", "pagehide", "offline"]) {
    await signal(event);
    await waitUntil(async () => (await rows().count()) === 0);
    assert.ok(
      !(await page.locator("body").textContent()).includes(requester.name)
    );
    await signal("online");
    await signal("social-relationships-changed");
    await page.waitForTimeout(100);
    assert.equal(await rows().count(), 0);
    await signal("focus");
    await rows().first().waitFor();
  }
  ok(
    "Blur, pagehide and offline physically remove rows; passive events cannot reopen the list"
  );

  let releaseHeld;
  await intercept(listRoute, async (route) => {
    await new Promise((resolve) => {
      releaseHeld = resolve;
    });
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ message: "Injected delayed list failure" })
    });
  });
  await signal("social-relationships-changed");
  await waitUntil(() => !!releaseHeld);
  assert.equal(await rows().count(), 0);
  await signal("blur");
  releaseHeld();
  await clearIntercepts();
  await page.waitForTimeout(100);
  assert.equal(await rows().count(), 0);
  await signal("focus");
  await rows().first().waitFor();
  ok("A delayed failed read cannot reinsert private rows after concealment");

  await intercept(
    (url) =>
      url.pathname === "/api/platform/profile" &&
      url.searchParams.get("view") === "identity",
    (route) =>
      route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ message: "Injected identity failure" })
      })
  );
  await signal("social-relationships-changed");
  await waitUntil(async () => (await rows().count()) === 0);
  await exact("Recheck current access")
    .locator("..")
    .getByRole("status")
    .filter({ hasText: "Your sign-in could not be checked" })
    .waitFor();
  await clearIntercepts();
  await exact("Recheck current access").click();
  await rows().first().waitFor();
  ok(
    "Unavailable identity conceals all summaries and a current retry recovers"
  );

  const filteredPath =
    "/platform/exchange/handoffs?" +
    new URLSearchParams({ view: "incoming", listingId: listing.id });
  const first = await readExchangeHandoffs(db, owner.token, {
    view: "incoming",
    listingId: listing.id
  });
  await go(filteredPath);
  await rows().first().waitFor();
  assert.deepEqual(
    await ids(),
    first.inquiries.map((row) => row.id)
  );
  const older = page.getByRole("link", {
    name: "Older inquiries",
    exact: true
  });
  const next = new URL(await older.getAttribute("href"), config.origin);
  assert.equal(next.searchParams.get("view"), "incoming");
  assert.equal(next.searchParams.get("listingId"), listing.id);
  assert.equal(next.searchParams.get("after"), first.after);
  await older.click();
  await page.waitForURL((url) => url.searchParams.get("after") === first.after);
  const second = await readExchangeHandoffs(db, owner.token, {
    view: "incoming",
    listingId: listing.id,
    after: first.after
  });
  await waitUntil(async () => (await rows().count()) === 2);
  assert.deepEqual(
    await ids(),
    second.inquiries.map((row) => row.id)
  );
  assert.equal(
    new Set([...first.inquiries, ...second.inquiries].map((row) => row.id))
      .size,
    22
  );
  assert.equal(await older.count(), 0);
  ok(
    "Listing filter and last-returned cursor preserve exactly 22 historical rows across two pages without duplication"
  );

  await go(filteredPath);
  await rows().first().waitFor();
  await db.exchangeListing.update({
    where: { id: listing.id },
    data: { title: title + " revised", version: { increment: 1 } }
  });
  await signal("social-relationships-changed");
  await page
    .getByText(
      "Your inquiry list changed. Reload to review current information.",
      { exact: true }
    )
    .waitFor();
  assert.equal(await rows().count(), 0);
  await exact("Recheck current access").click();
  await page
    .getByText(
      "Your inquiry list changed. Reload to review current information.",
      { exact: true }
    )
    .waitFor();
  assert.equal(await rows().count(), 0);
  await exact("Reload current information").click();
  await rows().first().waitFor();
  await page
    .getByRole("heading", { name: title + " revised", exact: true })
    .waitFor();
  ok(
    "Changed list checksum stays concealed through rechecks until explicit reload adopts the current snapshot"
  );
  await page.screenshot({
    path: output + "/inquiries-390.png",
    fullPage: true
  });
  await page.setViewportSize({ width: 320, height: 844 });
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
  });
  await bounded();
  await page.screenshot({
    path: output + "/inquiries-320-enlarged.png",
    fullPage: true
  });
  ok("Inquiry list fits narrow and enlarged mobile views");

  await signIn(requester);
  await go("/platform/exchange/handoffs?view=incoming");
  await page
    .getByText("No retained inquiries in this view.", { exact: true })
    .waitFor();
  assert.equal(await rows().count(), 0);
  await page.getByRole("link", { name: "Outgoing", exact: true }).click();
  await page.waitForURL((url) => url.searchParams.get("view") === "outgoing");
  await rows().first().waitFor();
  await signIn(reviewer);
  await signal("social-relationships-changed");
  await page
    .getByText("Your sign-in changed. Reload before continuing.", {
      exact: true
    })
    .waitFor();
  assert.equal(await rows().count(), 0);
  await exact("Recheck current access").click();
  await page.waitForTimeout(100);
  assert.equal(await rows().count(), 0);
  ok(
    "Empty incoming view and direction navigation work; account replacement cannot restore another participant list"
  );
  await clearIntercepts();
  assert.deepEqual(errors, []);
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
