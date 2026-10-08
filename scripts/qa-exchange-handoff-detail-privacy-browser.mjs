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
  output = fixtureDir + "/exchange-handoff-detail-browser-" + Date.now();
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
  const { EXCHANGE_HANDOFF_SCHEMA } =
    await import("../lib/platform/exchange-handoff-options.ts");
  const owner = await createPortalActor(db, "detailprivacyowner"),
    requester = await createPortalActor(db, "detailprivacyrequester");
  await db.socialPreferences.create({
    data: { ownerId: owner.id, contactRequests: "EVERYONE" }
  });
  const purpose = "Private fictional detail purpose " + randomUUID(),
    pickup = "Private fictional pickup code " + randomUUID(),
    note = "Unsent private cancellation " + randomUUID();
  const listing = await db.exchangeListing.create({
    data: {
      ownerId: owner.id,
      creatorId: owner.id,
      state: "ACTIVE",
      title: "Fictional handoff source",
      description: "Isolated private detail",
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
  const input = (operation, fields) => ({
    operation,
    mutationId: randomUUID(),
    ...fields
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
  const created = await command(
    db,
    requester.token,
    input("inquire", {
      id: randomUUID(),
      expectedVersion: 0,
      listingId: listing.id,
      listingVersion: target.listingVersion,
      contactVersion: target.contactVersion,
      purpose
    })
  );
  const start = new Date(Date.now() + 3 * 86400000);
  start.setUTCSeconds(0, 0);
  const plan = {
    startLocal: start.toISOString().slice(0, 16),
    endLocal: new Date(start.getTime() + 3600000).toISOString().slice(0, 16),
    timeZone: "UTC",
    pickupDetails: pickup
  };
  await command(
    db,
    owner.token,
    input("select", {
      id: created.id,
      expectedVersion: created.version,
      schema: EXCHANGE_HANDOFF_SCHEMA,
      plan
    })
  );
  const path = "/platform/exchange/handoffs/" + created.id;
  const detailRoute = (url) =>
    url.pathname === "/api/platform/exchange" &&
    url.searchParams.get("view") === "handoff-detail";
  const endpoint = config.origin + "/api/platform/exchange";
  const details = page.locator('section[aria-label="Private handoff details"]');
  const pickupField = page.getByLabel(
    "Private pickup instructions (optional)",
    { exact: false }
  );
  const noteField = page.getByLabel("Private explanation (optional)", {
    exact: false
  });
  const read = async (actor = owner) =>
    (
      await readExchangeHandoffs(db, actor.token, {
        view: "detail",
        id: created.id
      })
    ).inquiry;
  await signIn(owner);
  await intercept(detailRoute, (route) =>
    route.fulfill({
      status: 403,
      contentType: "application/json",
      body: JSON.stringify({ message: "Injected detail access denial" })
    })
  );
  const response = await go(path),
    html = await response.text();
  assert.ok(!html.includes(purpose));
  assert.ok(!html.includes(pickup));
  const rsc = await context.request.get(config.origin + path, {
      headers: { RSC: "1" }
    }),
    rscBody = await rsc.text();
  assert.ok(!rscBody.includes(purpose));
  assert.ok(!rscBody.includes(pickup));
  await details
    .getByText("Injected detail access denial", { exact: true })
    .waitFor();
  assert.equal(await details.locator("textarea").count(), 0);
  await clearIntercepts();
  await details
    .getByRole("button", { name: "Recheck current access", exact: true })
    .click();
  await pickupField.waitFor();
  await noteField.fill(note);
  ok(
    "Private detail HTML/RSC omit purpose and pickup; a denied first read mounts no private controls"
  );
  for (const event of ["blur", "pagehide", "offline"]) {
    await signal(event);
    assert.equal(await details.locator("textarea").count(), 0);
    assert.ok(!(await details.textContent()).includes(purpose));
    assert.ok(!(await details.textContent()).includes(pickup));
    await signal("social-relationships-changed");
    await signal("online");
    assert.equal(await details.locator("textarea").count(), 0);
    await signal("focus");
    await noteField.waitFor();
    assert.equal(await noteField.inputValue(), note);
  }
  ok(
    "Blur, pagehide and offline physically omit saved details and draft inputs; passive events cannot reopen them and current-owner focus restores drafts"
  );
  await bounded();
  await page.screenshot({ path: output + "/detail-390.png", fullPage: true });
  await page.setViewportSize({ width: 320, height: 800 });
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
  });
  await bounded();
  await page.screenshot({
    path: output + "/detail-320-200.png",
    fullPage: true
  });
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "";
  });
  await page.setViewportSize({ width: 390, height: 844 });
  const replacement = pickup + " revised";
  await pickupField.fill(replacement);
  const before = (await read()).version;
  await exact("Replace proposed plan").click();
  await waitUntil(async () => (await read()).version === before + 1);
  await noteField.waitFor();
  assert.equal(await noteField.inputValue(), note);
  await waitUntil(
    async () => !(await exact("Replace proposed plan").isDisabled())
  );
  assert.equal(await pickupField.inputValue(), replacement);
  ok(
    "A confirmed plan replacement re-arms the same action owner and preserves its unsent cancellation note"
  );
  // Defaults response held beyond concealment cannot replace the retained draft.
  let releaseDefault, defaultStarted;
  const defaultGate = new Promise((resolve) => {
      releaseDefault = resolve;
    }),
    defaultReady = new Promise((resolve) => {
      defaultStarted = resolve;
    });
  await intercept(
    (url) =>
      url.pathname === "/api/platform/exchange" &&
      url.searchParams.get("view") === "defaults",
    async (route) => {
      const response = await route.fetch();
      defaultStarted();
      await within(defaultGate, "Held default response");
      await route.fulfill({ response });
    }
  );
  await exact("Copy my private pickup default").click();
  try {
    await within(defaultReady, "Default read start");
    await signal("blur");
    assert.equal(await details.locator("textarea").count(), 0);
  } finally {
    releaseDefault();
  }
  await clearIntercepts();
  await signal("focus");
  await pickupField.waitFor();
  assert.equal(await pickupField.inputValue(), replacement);
  ok(
    "A defaults read released after concealment cannot overwrite retained pickup text"
  );
  const uncertain = replacement + " original uncertain request";
  await pickupField.fill(uncertain);
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
          id: owner.id,
          version: 999,
          message: "Wrong fictional receipt"
        })
      });
    if (step >= 3 && step <= 5) {
      const sent = JSON.parse(body);
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: sent.id,
          version: [0, sent.expectedVersion, sent.expectedVersion + 99][
            step - 3
          ],
          message: "Wrong fictional revision"
        })
      });
    }
    if (step === 6)
      return route.fulfill({
        status: 429,
        contentType: "application/json",
        body: JSON.stringify({ message: "Injected bounded retry" })
      });
    if (step === 7)
      return route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ message: "Injected unavailable reply" })
      });
    return route.continue();
  });
  await exact("Replace proposed plan").click();
  await exact("Confirm original save").waitFor();
  await signal("blur");
  await signal("focus");
  await waitUntil(
    async () => !(await exact("Confirm original save").isDisabled())
  );
  assert.equal(await details.locator("textarea").count(), 0);
  for (let i = 0; i < 7; i++) {
    await exact("Confirm original save").click();
    if (i < 6)
      await waitUntil(
        async () =>
          (await exact("Confirm original save").count()) === 1 &&
          !(await exact("Confirm original save").isDisabled())
      );
  }
  await noteField.waitFor();
  assert.equal(await noteField.inputValue(), note);
  assert.equal(await pickupField.inputValue(), uncertain);
  await clearIntercepts();
  assert.equal(bodies.length, 8);
  assert.ok(bodies.every((body) => body === bodies[0]));
  const original = JSON.parse(bodies[0]);
  assert.equal((await read()).version, original.expectedVersion + 1);
  assert.equal(
    await db.exchangeInquiryAudit.count({
      where: {
        inquiryId: created.id,
        action: "PLAN",
        version: original.expectedVersion + 1
      }
    }),
    1
  );
  ok(
    "Lost accepted plan plus changed snapshot, wrong target, zero/stale/future revisions, 429 and 503 recover eight byte-identical requests with one plan audit and the sibling draft intact"
  );
  // Cancellation acknowledges only its note; retain an unrelated private plan draft.
  const unsentPlan = uncertain + " UNSENT sibling";
  await pickupField.fill(unsentPlan);
  await exact("Cancel handoff").click();
  await waitUntil(async () => (await read()).state === "CANCELED");
  await exact("Clear from my history").waitFor();
  await details
    .getByText(unsentPlan, { exact: true })
    .waitFor({ state: "attached" });
  await page
    .getByRole("link", { name: "Open current listing", exact: true })
    .click();
  await page
    .getByText("Save or resolve your private choice before leaving.", {
      exact: true
    })
    .waitFor();
  assert.equal(new URL(page.url()).pathname, path);
  await exact("Discard unsaved handoff choices").click();
  ok(
    "Cancellation preserves the unsent sibling plan and navigation guard until deliberate discard"
  );
  const clearBodies = [];
  await intercept(endpoint, async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    clearBodies.push(route.request().postData());
    if (clearBodies.length === 1) {
      const response = await route.fetch();
      assert.equal(response.status(), 200);
      return route.abort("failed");
    }
    return route.continue();
  });
  await exact("Clear from my history").click();
  await exact("Confirm original save").waitFor();
  await assert.rejects(
    () => read(),
    (error) => error.status === 404
  );
  await signal("blur");
  await signal("focus");
  await waitUntil(
    async () => !(await exact("Confirm original save").isDisabled())
  );
  assert.equal(await details.locator("textarea").count(), 0);
  await exact("Confirm original save").click();
  await details
    .getByText("This inquiry was cleared from your history.", { exact: true })
    .waitFor();
  assert.equal(await exact("Clear from my history").count(), 0);
  assert.equal(clearBodies.length, 2);
  assert.equal(clearBodies[0], clearBodies[1]);
  await clearIntercepts();
  assert.equal((await read(requester)).state, "CANCELED");
  ok(
    "Lost successful history-clear recovers its exact original request after detail 404 and leaves the other participant's history intact"
  );
  await signIn(requester);
  await go(path);
  await details.getByText(purpose, { exact: true }).waitFor();
  await signIn(owner);
  await signal("focus");
  await details
    .getByText(
      "Your sign-in changed. Private entries were cleared. Reload for your current account.",
      { exact: true }
    )
    .waitFor();
  assert.equal(await details.locator("textarea").count(), 0);
  assert.ok(!(await details.textContent()).includes(purpose));
  ok(
    "Confirmed replacement account clears retained private detail and command ownership"
  );
  assert.deepEqual(layoutFailures, []);
  assert.deepEqual(errors, []);
  writeFileSync(
    output + "/results.json",
    JSON.stringify(
      { results, errors, productionWrites: 0, externalSends: 0 },
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
