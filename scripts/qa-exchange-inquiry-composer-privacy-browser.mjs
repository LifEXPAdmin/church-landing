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
  await within(Promise.all([...routed]), "Routed inquiry requests");
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
  output = fixtureDir + "/exchange-inquiry-composer-browser-" + Date.now();
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
  throw Error("Expected current inquiry state was not observed");
};
const exact = (name) => page.getByRole("button", { name, exact: true });
const signal = (name) =>
  page.evaluate((name) => window.dispatchEvent(new Event(name)), name);
try {
  const { exchangeHandoffCommand: command, readExchangeHandoffs } =
    await import("../lib/platform/exchange-handoffs.ts");
  const owner = await createPortalActor(db, "inquirycomposerowner"),
    requester = await createPortalActor(db, "inquirycomposerrequester"),
    reviewer = await createPortalActor(db, "inquirycomposerreviewer");
  await seedOperatorGrants(db, reviewer, ["REVIEW_COMMUNITY_REPORTS"]);
  await db.socialPreferences.create({
    data: { ownerId: owner.id, contactRequests: "EVERYONE" }
  });
  const title = "Fictional inquiry composer source " + randomUUID();
  const listing = await db.exchangeListing.create({
    data: {
      ownerId: owner.id,
      creatorId: owner.id,
      state: "ACTIVE",
      title,
      description: "Fictional composer privacy fixture",
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
  const path = "/platform/exchange/" + listing.id;
  const targetRoute = (url) =>
    url.pathname === "/api/platform/exchange" &&
    url.searchParams.get("view") === "handoff-target";
  const endpoint = config.origin + "/api/platform/exchange";
  // Read the actual textarea node: a remounted controlled textarea can include
  // its initial value in Playwright's wrapping-label text matcher.
  const purpose = page.locator(
    'form[aria-label="Send a private inquiry"] textarea'
  );
  // Inspect the retained owner even when the outer listing guard conceals it.
  // Accessibility locators exclude hidden regions and can make DOM assertions vacuous.
  const composer = page.locator('section[aria-label="Listing inquiry"]');
  const localPurpose = "Fictional private purpose " + randomUUID();
  const readTarget = async (actor) =>
    (
      await readExchangeHandoffs(db, actor.token, {
        view: "target",
        listingId: listing.id
      })
    ).target;
  await signIn(requester);
  await intercept(targetRoute, (route) =>
    route.fulfill({
      status: 403,
      contentType: "application/json",
      body: JSON.stringify({ message: "Injected inquiry access denial" })
    })
  );
  await go(path);
  await composer
    .getByText("Injected inquiry access denial", { exact: true })
    .waitFor();
  assert.equal(await purpose.count(), 0);
  await clearIntercepts();
  await composer
    .getByRole("button", { name: "Recheck current access", exact: true })
    .click();
  await purpose.waitFor();
  ok(
    "Denied first target read mounts no private form; an authorized retry initializes it"
  );
  await purpose.fill(localPurpose);
  for (const event of ["blur", "pagehide", "offline"]) {
    await signal(event);
    await waitUntil(async () => (await purpose.count()) === 0);
    assert.equal(
      await composer.getByText(/Your inquiry goes privately to/).count(),
      0
    );
    await signal("online");
    await signal("social-relationships-changed");
    await page.waitForTimeout(100);
    assert.equal(await purpose.count(), 0);
    await signal("focus");
    await purpose.waitFor();
    assert.equal(await purpose.inputValue(), localPurpose);
  }
  ok(
    "Blur, pagehide and offline physically omit purpose and receiver while the mounted form retains unsent text"
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
  await waitUntil(async () => (await purpose.count()) === 0);
  await composer
    .getByText("Your sign-in could not be checked. Reconnect and try again.", {
      exact: true
    })
    .waitFor({ state: "attached" });
  await clearIntercepts();
  await signal("focus");
  await purpose.waitFor();
  assert.equal(await purpose.inputValue(), localPurpose);
  ok(
    "An unconfirmed identity conceals the composer and an authorized return retains its purpose"
  );
  await bounded();
  await page.screenshot({ path: output + "/composer-390.png", fullPage: true });
  await page.setViewportSize({ width: 320, height: 844 });
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
  });
  await bounded();
  await page.screenshot({
    path: output + "/composer-320-200.png",
    fullPage: true
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "";
  });
  if (!layoutFailures.length)
    ok("The private composer fits 390px and 320px enlarged text layouts");

  const bodies = [];
  await intercept(endpoint, async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    const body = route.request().postData();
    if (JSON.parse(body).operation !== "handoff-inquire")
      return route.continue();
    bodies.push(body);
    if (bodies.length === 1) {
      const accepted = await route.fetch({
        url: localOrigin + "/api/platform/exchange"
      });
      assert.equal(accepted.status(), 200, await accepted.text());
      return route.abort("failed");
    }
    assert.equal(body, bodies[0]);
    if (bodies.length === 2)
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: requester.id,
          version: 1,
          message: "Injected wrong receipt"
        })
      });
    if (bodies.length === 3 || bodies.length === 4)
      return route.fulfill({
        status: bodies.length === 3 ? 429 : 503,
        contentType: "application/json",
        body: JSON.stringify({ message: "Injected retry outage" })
      });
    return route.continue();
  });
  await exact("Send private inquiry").click();
  await exact("Confirm original save").waitFor();
  const original = JSON.parse(bodies[0]);
  assert.equal(original.purpose, localPurpose);
  assert.equal((await readTarget(requester)).activeId, original.id);
  await signal("blur");
  await waitUntil(async () => (await purpose.count()) === 0);
  await signal("focus");
  await composer.getByText(/This listing’s inquiry choices changed/).waitFor();
  assert.equal(await purpose.count(), 0);
  assert.equal(
    await composer.locator('a[href^="/platform/exchange/handoffs/"]').count(),
    0
  );
  for (let i = 0; i < 4; i++) {
    await exact("Confirm original save").click();
    if (i < 3) {
      await waitUntil(
        async () =>
          bodies.length === i + 2 &&
          (await exact("Confirm original save").isEnabled())
      );
      assert.equal(new URL(page.url()).pathname, path);
    }
  }
  await page.waitForURL("**/platform/exchange/handoffs/" + original.id);
  assert.equal(bodies.length, 5);
  assert.equal(new Set(bodies).size, 1);
  assert.equal(
    await db.exchangeInquiry.count({
      where: { listingId: listing.id, requesterId: requester.id }
    }),
    1
  );
  assert.equal(
    await db.exchangeInquiryAudit.count({ where: { inquiryId: original.id } }),
    1
  );
  await clearIntercepts();
  ok(
    "A lost accepted inquiry retains its exact UUID, mutation ID, versions and purpose across changed activeId, wrong receipt, 429 and 503; five attempts create one inquiry and audit"
  );
  for (const headers of [{}, { RSC: "1" }]) {
    const response = await context.request.get(config.origin + path, {
      headers
    });
    assert.equal(response.status(), 200);
    assert.match(response.headers()["cache-control"], /no-store/);
    const text = await response.text();
    assert.ok(!text.includes(original.id));
    assert.ok(!text.includes(localPurpose));
  }
  await go(path);
  const existing = composer.locator(
    `a[href="/platform/exchange/handoffs/${original.id}"]`
  );
  await existing.waitFor();
  assert.equal(
    await existing.getAttribute("href"),
    "/platform/exchange/handoffs/" + original.id
  );
  await signal("blur");
  await waitUntil(async () => (await existing.count()) === 0);
  await signal("focus");
  await existing.waitFor();
  ok(
    "HTML and RSC omit the private active inquiry ID; the current API-owned link disappears from DOM on concealment"
  );

  const late = await createPortalActor(db, "inquirycomposerlate");
  await signIn(late);
  await go(path);
  await purpose.waitFor();
  await purpose.fill(localPurpose + " late");
  let release, accepted;
  const gate = new Promise((done) => {
      release = done;
    }),
    ready = new Promise((done) => {
      accepted = done;
    });
  let lateBody,
    lateWrites = 0;
  await intercept(endpoint, async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    lateWrites++;
    lateBody = JSON.parse(route.request().postData());
    const response = await route.fetch({
      url: localOrigin + "/api/platform/exchange"
    });
    assert.equal(response.status(), 200, await response.text());
    accepted();
    await within(gate, "Held accepted inquiry reply");
    return route.fulfill({ response });
  });
  const pendingControls = composer.locator("button").filter({
    hasText: /^(Confirming save…|Confirm original save)$/
  });
  try {
    await exact("Send private inquiry").click();
    await within(ready, "Accepted inquiry acknowledgement");
    await signal("blur");
    await waitUntil(async () => (await purpose.count()) === 0);
    release();
    // Observe actual receipt consumption while the command owner stays mounted.
    await waitUntil(async () => (await pendingControls.count()) === 0);
    assert.equal(new URL(page.url()).pathname, path);
    assert.equal(await purpose.count(), 0);
  } finally {
    release();
    await clearIntercepts();
  }
  await signal("focus");
  await page.waitForURL("**/platform/exchange/handoffs/" + lateBody.id);
  assert.equal(lateWrites, 1);
  assert.equal(
    await db.exchangeInquiryAudit.count({ where: { inquiryId: lateBody.id } }),
    1
  );
  ok(
    "A late accepted response waits through concealment and navigates only after the same owner returns"
  );

  const competing = await createPortalActor(db, "inquirycomposercompeting");
  await signIn(competing);
  await go(path);
  await purpose.waitFor();
  await purpose.fill(localPurpose + " competing");
  let pendingBody;
  await intercept(endpoint, async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    pendingBody = route.request().postData();
    return route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ message: "Injected undispatched inquiry" })
    });
  });
  await exact("Send private inquiry").click();
  await exact("Confirm original save").waitFor();
  await clearIntercepts();
  const competingTarget = await readTarget(competing);
  const different = await command(
    db,
    competing.token,
    input("inquire", {
      id: randomUUID(),
      expectedVersion: 0,
      listingId: listing.id,
      listingVersion: competingTarget.listingVersion,
      contactVersion: competingTarget.contactVersion,
      purpose: "Different accepted inquiry"
    })
  );
  await signal("focus");
  await composer.getByText(/This listing’s inquiry choices changed/).waitFor();
  assert.equal(new URL(page.url()).pathname, path);
  await intercept(endpoint, (route) => {
    assert.equal(route.request().postData(), pendingBody);
    return route.continue();
  });
  await exact("Confirm original save").click();
  await exact("Reload current saved choices").waitFor();
  assert.equal(new URL(page.url()).pathname, path);
  assert.notEqual(JSON.parse(pendingBody).id, different.id);
  assert.equal(
    await db.exchangeInquiry.count({
      where: { listingId: listing.id, requesterId: competing.id }
    }),
    1
  );
  await clearIntercepts();
  ok(
    "A different active inquiry cannot substitute for the pending receipt; the original request reaches a canonical conflict without another inquiry"
  );

  const revoked = await createPortalActor(db, "inquirycomposerrevoked");
  await signIn(revoked);
  await go(path);
  await purpose.waitFor();
  await purpose.fill(localPurpose + " revoked");
  let revokedBody;
  await intercept(endpoint, (route) => {
    revokedBody = route.request().postData();
    return route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ message: "Injected undispatched inquiry" })
    });
  });
  await exact("Send private inquiry").click();
  await exact("Confirm original save").waitFor();
  await clearIntercepts();
  const { adultContactCommand } =
    await import("../lib/platform/adult-contact.ts");
  let preferences = await db.socialPreferences.findUniqueOrThrow({
    where: { ownerId: owner.id }
  });
  await adultContactCommand(
    db,
    owner.token,
    input("preferences", {
      expectedVersion: preferences.version,
      audience: "NOBODY"
    })
  );
  assert.equal(await readTarget(revoked), null);
  await signal("focus");
  await composer.getByText(/This listing’s inquiry choices changed/).waitFor();
  assert.equal(await purpose.count(), 0);
  assert.equal(await exact("Confirm original save").isEnabled(), false);
  assert.equal(
    await db.exchangeInquiry.count({
      where: { id: JSON.parse(revokedBody).id }
    }),
    0
  );
  ok(
    "Canonical contact revocation conceals the retained purpose and disables replay until current source access is restored"
  );
  // Leave the previous user's owner mounted while replacing the authenticated account.
  await signIn(requester);
  await signal("focus");
  await composer
    .getByText(
      "Your sign-in changed. Private entries were cleared. Reload for your current account.",
      { exact: true }
    )
    .waitFor({ state: "attached" });
  assert.equal(await purpose.count(), 0);
  assert.equal(
    await composer
      .locator("button")
      .filter({ hasText: /^Confirm original save$/ })
      .count(),
    0
  );
  ok(
    "A confirmed account replacement clears the old composer's pending owner and private fields"
  );
  await clearIntercepts();
  assert.deepEqual(errors, []);
  assert.deepEqual(layoutFailures, [], "No horizontal page overflow");
  ok("No browser runtime errors in the inquiry composer privacy flow");
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
        layoutFailures,
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
