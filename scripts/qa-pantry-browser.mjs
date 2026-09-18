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
assert.match(config.origin, /^https:\/\/127\.0\.0\.1:\d+$/);
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
  RETENTION_TEST_DIR: process.cwd() + "/" + fixtureDir + "/retention",
  MEDIA_TEST_DIR: process.cwd() + "/" + fixtureDir + "/images"
});
const { PrismaClient } = await import("@prisma/client");
const { createPortalActor, assertPortalTestDatabase, seedOperatorGrants } =
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
await context.route("**/*", (route) =>
  new URL(route.request().url()).hostname === "127.0.0.1"
    ? route.continue()
    : route.abort()
);
context.setDefaultTimeout(15000);
const page = await context.newPage(),
  errors = [],
  results = [],
  output = fixtureDir + "/pantry-browser-" + Date.now();
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
  const manager = await createPortalActor(db, "pantrybrowser"),
    a = await createPortalActor(db, "recipienta"),
    b = await createPortalActor(db, "recipientb"),
    reviewer = await createPortalActor(db, "pantryreview");
  await seedOperatorGrants(db, reviewer, ["REVIEW_COMMUNITY_REPORTS"]);
  const church = await db.church.create({
    data: {
      slug: "pantry-browser-" + randomUUID(),
      name: "Fictional pantry church",
      summary: "Isolated browser acceptance",
      communityListed: true
    }
  });
  await db.churchConnection.createMany({
    data: [manager, a, b].map((u) => ({
      userId: u.id,
      churchId: church.id,
      state: "APPROVED"
    }))
  });
  await db.churchCapabilityGrant.createMany({
    data: [
      "MANAGE_CHURCH_ASSISTANCE",
      "MANAGE_EXCHANGE_LISTINGS",
      "PUBLISH_EXCHANGE_LISTINGS"
    ].map((capability) => ({
      userId: manager.id,
      churchId: church.id,
      capability
    }))
  });
  await db.socialPreferences.create({
    data: { ownerId: manager.id, contactRequests: "EVERYONE" }
  });
  const base = `/platform/pantry/${church.id}`,
    marker = "Fictional pantry " + randomUUID();
  writeFileSync(
    fixtureDir + "/latest-pantry-actors.json",
    JSON.stringify({ manager, a, b, reviewer, churchId: church.id }),
    { mode: 0o600 }
  );
  const form = (name) => page.getByRole("form", { name, exact: true });
  const click = (name) =>
    page.getByRole("button", { name, exact: true }).click();
  const current = () =>
    db.pantryRequest.findFirstOrThrow({
      where: { hubId: church.id, requesterId: a.id },
      orderBy: { createdAt: "desc" }
    });
  await go("/platform/pantry/mine");
  await page
    .locator("main")
    .getByRole("link", { name: "Sign in", exact: true })
    .waitFor();
  assert.ok(!(await page.locator("main").innerText()).includes(marker));
  ok("Guest private entry is explicit and conceals assistance records");
  await signIn(manager);
  await go(base + "/manage");
  const hub = form("Save hub and intake choices");
  for (const [label, value] of [
    ["Hub title", marker],
    ["Public description", "Fictional food support for isolated tests"],
    ["Public hours", "Monday appointments"],
    ["Public access guidance", "Church main entrance"],
    [
      "Public eligibility and availability guidance",
      "Adults request their own pickup. Supplies vary."
    ]
  ])
    await hub.getByLabel(label, { exact: false }).fill(value);
  await hub.getByLabel("Who can find this hub").selectOption("PUBLIC");
  for (const name of [
    "Publish the hub information",
    "Accept new private assistance requests",
    "I accept named coordinator responsibility"
  ])
    await hub.getByRole("checkbox", { name: new RegExp(name) }).check();
  await hub
    .getByRole("button", { name: "Save hub and intake choices", exact: true })
    .click();
  await form("Add supply category").waitFor();
  assert.equal(
    (await db.pantryHub.findUniqueOrThrow({ where: { id: church.id } }))
      .coordinatorId,
    manager.id
  );
  ok(
    "An explicitly assigned coordinator publishes hub guidance and separately accepts private intake"
  );
  const stock = form("Add supply category");
  await stock.getByLabel("Category name").fill("Food parcels");
  await stock.getByLabel("Unit name").fill("parcels");
  await stock.getByLabel("Availability type").selectOption("EXACT");
  await stock.getByLabel("Count, only for counted stock").fill("10");
  await stock
    .getByLabel("Public contents or substitution guidance")
    .fill("Contents may change");
  await stock
    .getByLabel("Private adjustment reason")
    .fill("Fictional stock counted");
  await stock
    .getByRole("button", { name: "Add supply category", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Food parcels", exact: true })
    .waitFor();
  const category = await db.pantryCategory.findFirstOrThrow({
    where: { hubId: church.id }
  });
  assert.equal(category.quantity, 10);
  await go(base + "/sessions");
  const pickup = form("Add pickup session");
  await pickup
    .getByLabel("Pickup starts")
    .fill(new Date(Date.now() + 86400000).toISOString().slice(0, 16));
  await pickup
    .getByLabel("Pickup ends")
    .fill(new Date(Date.now() + 90000000).toISOString().slice(0, 16));
  await pickup.getByLabel("Time zone").fill("UTC");
  await pickup.getByLabel("Number of pickup places").fill("1");
  await pickup
    .getByLabel("Private pickup directions")
    .fill("Private fictional side entrance");
  await pickup
    .getByRole("button", { name: "Add pickup session", exact: true })
    .click();
  await waitUntil(() =>
    db.pantrySession.count({ where: { hubId: church.id } })
  );
  const session = await db.pantrySession.findFirstOrThrow({
    where: { hubId: church.id }
  });
  ok(
    "Counted stock and a one-place dated pickup session persist through actual forms"
  );
  await signIn(null);
  await go(base);
  await page.getByRole("heading", { name: marker, exact: true }).waitFor();
  const publicText = await page.locator("main").innerText();
  assert.match(publicText, /Counted stock: 10 parcels/);
  assert.match(publicText, /do not guarantee/);
  for (const hidden of [
    a.name,
    manager.email,
    "Private fictional side entrance",
    "Fictional stock counted"
  ])
    assert.ok(!publicText.includes(hidden));
  await bounded();
  await page.screenshot({ path: output + "/public-phone.png", fullPage: true });
  ok(
    "The phone-width public hub shows stock limits without recipient, contact, direction or audit leaks"
  );
  await signIn(a);
  await go(base);
  const request = form("Send private assistance request");
  await request.getByLabel("Food parcels (parcels)").fill("2");
  await request
    .getByLabel("Optional practical note")
    .fill("Fictional private practical note");
  await request
    .getByLabel("Optional pickup contact")
    .fill("Fictional chosen contact");
  await request
    .getByRole("checkbox", { name: /Share these selected items/ })
    .check();
  let dropped = false;
  const bodies = [];
  await page.route("**/api/platform/pantry", async (route) => {
    const req = route.request();
    if (req.method() !== "POST") {
      await route.continue();
      return;
    }
    const body = req.postDataJSON();
    if (body.operation === "request") {
      bodies.push(req.postData());
      if (!dropped) {
        dropped = true;
        const saved = await route.fetch();
        assert.ok(saved.ok());
        await route.abort("failed");
        return;
      }
    }
    await route.continue();
  });
  await request
    .getByRole("button", {
      name: "Send private assistance request",
      exact: true
    })
    .click();
  await page
    .getByRole("button", { name: "Confirm original save", exact: true })
    .waitFor();
  assert.equal(
    await db.pantryRequest.count({
      where: { hubId: church.id, requesterId: a.id }
    }),
    1
  );
  await click("Confirm original save");
  await page.waitForURL(/\/platform\/pantry\/requests\//);
  await page
    .getByRole("button", { name: "Cancel request", exact: true })
    .waitFor();
  const row = await current();
  assert.equal(bodies.length, 2);
  assert.equal(bodies[0], bodies[1]);
  await page.unroute("**/api/platform/pantry");
  await page.reload();
  await page
    .getByText("Practical note: Fictional private practical note", {
      exact: true
    })
    .waitFor();
  ok(
    "Lost submission replies retry the exact body once and the requester reloads one private record"
  );
  await signIn(b);
  await go(`/platform/pantry/requests/${row.id}`);
  assert.ok(
    !(await page.locator("main").innerText()).includes(
      "Fictional private practical note"
    )
  );
  const denied = await context.request.get(
    config.origin + `/api/platform/pantry?view=request&id=${row.id}`
  );
  assert.equal(denied.status(), 404);
  assert.equal(denied.headers()["cdn-cache-control"], "no-store");
  ok(
    "A different recipient cannot fetch or render the selected private request"
  );
  await signIn(manager);
  await go(`/platform/pantry/requests/${row.id}`);
  await page
    .getByLabel("Coordinator-only note")
    .fill("Fictional restricted coordinator note");
  await click("Save private note");
  await waitUntil(
    async () =>
      (await current()).coordinatorNote ===
      "Fictional restricted coordinator note"
  );
  await page.getByLabel("Offer a pickup session").selectOption(session.id);
  await click("Offer selected pickup");
  await waitUntil(async () => (await current()).state === "ASSIGNED");
  await signIn(a);
  await go(`/platform/pantry/requests/${row.id}`);
  await page
    .getByText("Private fictional side entrance", { exact: true })
    .waitFor();
  assert.ok(
    !(await page.locator("main").innerText()).includes(
      "Fictional restricted coordinator note"
    )
  );
  await click("Confirm this pickup offer");
  await waitUntil(async () => !!(await current()).confirmedAt);
  ok(
    "The coordinator offers a capacity-bound pickup and only its requester confirms, without seeing coordinator notes"
  );
  const startsAt = new Date(Date.now() - 7200000),
    endsAt = new Date(Date.now() - 3600000);
  await db.pantrySession.update({
    where: { id: session.id },
    data: {
      startsAt,
      endsAt,
      startLocal: startsAt.toISOString().slice(0, 16),
      endLocal: endsAt.toISOString().slice(0, 16)
    }
  });
  await signIn(manager);
  await go(`/platform/pantry/requests/${row.id}`);
  await page
    .getByLabel("Private outcome or correction reason")
    .fill("Fictional collection observed");
  await click("Record collected");
  await waitUntil(async () => (await current()).state === "COLLECTED");
  await page.getByText("Collected", { exact: true }).waitFor();
  await page.screenshot({
    path: output + "/private-phone.png",
    fullPage: true
  });
  await bounded();
  await page.emulateMedia({ colorScheme: "dark" });
  await page.evaluate(() => (document.documentElement.style.fontSize = "24px"));
  await bounded();
  await page.screenshot({
    path: output + "/private-dark-large-text.png",
    fullPage: true
  });
  ok(
    "An actual outcome save records private provenance and remains usable at phone width, dark appearance and enlarged text"
  );
  await go(base + "/manage");
  await page
    .getByRole("link", {
      name: "Create a reviewed replenishment Need",
      exact: true
    })
    .click();
  await page
    .getByLabel("Title (required to publish)", { exact: true })
    .waitFor();
  assert.equal(
    await page
      .getByLabel("Title (required to publish)", { exact: true })
      .inputValue(),
    "Food parcels replenishment"
  );
  assert.equal(
    await page
      .getByLabel("Requested items (required to publish)", { exact: true })
      .inputValue(),
    "Food parcels (parcels)"
  );
  const editorText = await page.locator("main").innerText();
  for (const hidden of [
    "Fictional private practical note",
    "Fictional chosen contact",
    "Private fictional side entrance"
  ])
    assert.ok(!editorText.includes(hidden));
  await click("Save a private draft");
  await page.waitForURL(/\/platform\/exchange\/[^/]+\/edit/);
  const listing = await db.exchangeListing.findFirstOrThrow({
    where: { ownerChurchId: church.id, title: "Food parcels replenishment" }
  });
  assert.equal(listing.intent, "CHURCH_NEED");
  assert.equal(listing.state, "DRAFT");
  assert.equal(listing.requestedItems, "Food parcels (parcels)");
  ok(
    "Replenishment creates an explicitly church-owned private Need draft from public category fields only"
  );
  await signIn(a);
  await go(`/platform/pantry/requests/${row.id}`);
  await click("Clear my private details");
  await waitUntil(async () => !!(await current()).requesterClearedAt);
  await page
    .getByText("Your private details are cleared.", { exact: true })
    .waitFor();
  assert.ok(
    !(await page.locator("main").innerText()).includes(
      "Fictional private practical note"
    )
  );
  await go("/platform/settings/notifications/availability");
  await page
    .getByText("Private assistance requests and pickup changes", {
      exact: true
    })
    .first()
    .waitFor();
  await go("/platform/settings/exchange");
  await page
    .getByRole("link", { name: /My private assistance requests/ })
    .waitFor();
  ok(
    "Ended request clearing, separate notification choices and Settings entry points render correctly"
  );
  await signIn(manager);
  await go(base + "/queue");
  await db.churchCapabilityGrant.updateMany({
    where: {
      churchId: church.id,
      userId: manager.id,
      capability: "MANAGE_CHURCH_ASSISTANCE"
    },
    data: { revokedAt: new Date(), version: { increment: 1 } }
  });
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page
    .getByText(
      "This assistance record is unavailable to your current account or duties.",
      { exact: true }
    )
    .first()
    .waitFor();
  assert.ok(!(await page.locator("main").innerText()).includes(a.name));
  ok(
    "A retained coordinator page conceals its private queue after assistance authority is revoked"
  );
  assert.deepEqual(errors, []);
  writeFileSync(
    output + "/pass.json",
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
  console.log("OUTPUT " + output);
} catch (error) {
  await page
    .screenshot({ path: output + "/failure.png", fullPage: true })
    .catch(() => {});
  writeFileSync(
    output + "/failure.txt",
    String(error) +
      "\n" +
      (await page
        .locator("main")
        .innerText()
        .catch(() => ""))
  );
  throw error;
} finally {
  writeFileSync(
    output + "/result.json",
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
