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
await context.route("**/*", async (route) => {
  const url = new URL(route.request().url());
  if (url.origin !== config.origin) return route.abort();
  await route.continue();
});
const page = await context.newPage(),
  errors = [],
  results = [],
  output = fixtureDir + "/need-incoming-browser-" + Date.now();
mkdirSync(output, { recursive: true });
page.on("pageerror", (e) =>
  errors.push({ path: new URL(page.url()).pathname, message: e.message })
);
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
  throw Error("Expected current contribution state was not observed");
};
const signal = (name) =>
  page.evaluate((name) => window.dispatchEvent(new Event(name)), name);
try {
  const { exchangeNeedCommand: command } =
    await import("../lib/platform/exchange-need-commands.ts");
  const { exchangeListingCommand } =
    await import("../lib/platform/exchange-listings.ts");
  const { EXCHANGE_ITEM_POLICY } =
    await import("../lib/platform/exchange-options.ts");
  const { NEED_SCHEMA } =
    await import("../lib/platform/exchange-need-options.ts");
  const manager = await createPortalActor(db, "needprivmgr"),
    owner = await createPortalActor(db, "needprivowner"),
    other = await createPortalActor(db, "needprivother");
  await db.socialPreferences.create({
    data: { ownerId: manager.id, contactRequests: "EVERYONE" }
  });
  const church = await db.church.create({
    data: {
      slug: "fixture-private-needs-" + randomUUID(),
      name: "Fictional private needs church",
      summary: "Isolated privacy acceptance",
      communityListed: true
    }
  });
  await db.churchConnection.createMany({
    data: [manager, owner, other].map((a) => ({
      userId: a.id,
      churchId: church.id,
      state: "APPROVED"
    }))
  });
  await db.churchCapabilityGrant.createMany({
    data: ["MANAGE_EXCHANGE_LISTINGS", "MODERATE_EXCHANGE_LISTINGS"].map(
      (capability) => ({ churchId: church.id, userId: manager.id, capability })
    )
  });
  const marker = "Private need source " + randomUUID(),
    note = "Private contribution note " + randomUUID();
  const listing = await db.exchangeListing.create({
    data: {
      ownerChurchId: church.id,
      creatorId: manager.id,
      intent: "CHURCH_NEED",
      category: "HOUSEHOLD",
      audience: "CHURCH",
      audienceChurchId: church.id,
      title: marker,
      description: "Isolated private contribution acceptance",
      requestedItems: "Fictional equipment",
      country: "US",
      placeId: 4887398,
      placeLabel: "Chicago",
      itemPolicy: EXCHANGE_ITEM_POLICY
    }
  });
  const input = (operation, values) => ({
    operation,
    mutationId: randomUUID(),
    ...values
  });
  const date = (days) =>
    new Date(Date.now() + days * 86400000).toISOString().slice(0, 16);
  const configured = await command(
    db,
    manager.token,
    input("configure", {
      listingId: listing.id,
      listingVersion: listing.version,
      expectedVersion: 0,
      deadlineLocal: date(3),
      timeZone: "UTC",
      acceptCoordinator: true
    })
  );
  const slot = await command(
    db,
    manager.token,
    input("slot", {
      needId: configured.id,
      slotId: randomUUID(),
      expectedVersion: 0,
      schema: NEED_SCHEMA,
      fields: {
        action: "SELL",
        label: "Fictional private offer",
        unit: "items",
        target: 10,
        loan: false,
        returnLocal: null,
        returnTimeZone: null,
        returnResponsibility: "",
        volunteerSlotId: null
      }
    })
  );
  const readyListing = await db.exchangeListing.findUniqueOrThrow({
    where: { id: listing.id }
  });
  await exchangeListingCommand(
    db,
    manager.token,
    input("status", {
      listingId: listing.id,
      expectedVersion: readyListing.version,
      state: "ACTIVE",
      itemPolicy: EXCHANGE_ITEM_POLICY,
      itemConfirmed: true
    })
  );
  const need = await db.exchangeNeed.findUniqueOrThrow({
    where: { id: configured.id }
  });
  const contribution = await command(
    db,
    owner.token,
    input("claim", {
      needId: configured.id,
      slotId: slot.id,
      slotVersion: slot.version,
      consentVersion: need.consentVersion,
      id: randomUUID(),
      expectedVersion: 0,
      quantity: 2,
      note,
      price: "125.00",
      currency: "USD",
      shareName: false,
      loanAccepted: false,
      waitlist: false
    })
  );
  const loanNote = "Private loan note " + randomUUID();
  const loanSlot = await command(
    db,
    manager.token,
    input("slot", {
      needId: configured.id,
      slotId: randomUUID(),
      expectedVersion: 0,
      schema: NEED_SCHEMA,
      fields: {
        action: "DONATE",
        label: "Fictional loan",
        unit: "items",
        target: 10,
        loan: true,
        returnLocal: date(7),
        returnTimeZone: "UTC",
        returnResponsibility: "Fictional contributor collects equipment",
        volunteerSlotId: null
      }
    })
  );
  const loan = await command(
    db,
    owner.token,
    input("claim", {
      needId: configured.id,
      slotId: loanSlot.id,
      slotVersion: loanSlot.version,
      consentVersion: need.consentVersion,
      id: randomUUID(),
      expectedVersion: 0,
      quantity: 2,
      note: loanNote,
      price: null,
      currency: null,
      shareName: false,
      loanAccepted: true,
      waitlist: false
    })
  );
  await command(
    db,
    manager.token,
    input("receive", {
      id: loan.id,
      expectedVersion: loan.version,
      quantity: 2,
      reason: ""
    })
  );
  const path = `/platform/exchange/${listing.id}/needs?view=contributors`;
  const cards = page.locator('article[aria-label="Private contribution"]');
  const equipment = cards.filter({ hasText: loanNote });
  await signIn(manager);
  const html = await (await go(path)).text();
  const rsc = await (
    await context.request.get(config.origin + path, { headers: { RSC: "1" } })
  ).text();
  for (const body of [html, rsc])
    for (const marker of [note, loanNote, contribution.id, loan.id, owner.name])
      assert.ok(
        !body.includes(marker),
        "Incoming contribution leaked into the initial HTML/RSC"
      );
  ok(
    "Coordinator incoming HTML and RSC omit contribution IDs, notes and nonshared contributor names"
  );
  const receive = equipment.getByRole("button", {
    name: "Record actual receipt",
    exact: true
  });
  await receive.waitFor();
  await waitUntil(() => receive.isEnabled());
  assert.equal(await cards.count(), 2);
  assert.equal(await page.getByText(owner.name, { exact: true }).count(), 0);
  await bounded();
  assert.deepEqual(layoutFailures, []);
  await page.screenshot({
    path: output + "/incoming-visible-390.png",
    fullPage: true
  });
  await page.setViewportSize({ width: 320, height: 800 });
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
  });
  await bounded();
  assert.deepEqual(layoutFailures, []);
  await page.screenshot({
    path: output + "/incoming-visible-320-200.png",
    fullPage: true
  });
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "";
  });
  await page.setViewportSize({ width: 390, height: 844 });
  const unsent = "Private retained correction " + randomUUID();
  await equipment.locator("textarea").fill(unsent);
  await equipment
    .getByLabel("Total equipment actually returned", { exact: true })
    .fill("1");
  await signal("blur");
  await waitUntil(async () => (await cards.count()) === 0);
  assert.equal(await equipment.isVisible(), false);
  assert.equal(
    await page
      .locator('section[aria-label="Incoming private contributions"] textarea')
      .count(),
    0
  );
  assert.equal(
    await page
      .locator('section[aria-label="Incoming private contributions"] input')
      .count(),
    0
  );
  for (const marker of [note, loanNote, contribution.id, loan.id, unsent])
    assert.ok(!(await page.locator("body").innerText()).includes(marker));
  // Controlled browser focus state. This is not a native-window focus test.
  const unfocusedReads = [];
  const observeForegroundRead = (request) => {
    const url = new URL(request.url());
    if (
      request.method() === "GET" &&
      url.pathname === "/api/platform/exchange" &&
      url.searchParams.get("view") === "need-contributors"
    )
      unfocusedReads.push(request.url());
  };
  page.on("request", observeForegroundRead);
  await page.evaluate(() => {
    if (document.visibilityState !== "visible")
      throw Error("Foreground regression requires a visible document");
    const descriptor = Object.getOwnPropertyDescriptor(document, "hasFocus");
    window.__gcRestoreTestFocus = () => {
      if (descriptor) Object.defineProperty(document, "hasFocus", descriptor);
      else delete document.hasFocus;
      delete window.__gcRestoreTestFocus;
    };
    Object.defineProperty(document, "hasFocus", {
      configurable: true,
      value: () => false
    });
  });
  try {
    for (const event of ["pageshow", "visibilitychange"]) {
      await page.evaluate((event) => {
        (event === "visibilitychange" ? document : window).dispatchEvent(
          new Event(event)
        );
      }, event);
      await page.waitForTimeout(150);
      assert.equal(await cards.count(), 0);
      assert.equal(
        await page
          .locator('section[aria-label="Incoming private contributions"]')
          .locator("textarea,input")
          .count(),
        0
      );
      for (const marker of [note, loanNote, unsent])
        assert.ok(!(await page.locator("body").innerText()).includes(marker));
      assert.deepEqual(
        unfocusedReads,
        [],
        "Unfocused return must not start a private incoming read"
      );
    }
  } finally {
    page.off("request", observeForegroundRead);
    await page.evaluate(() => window.__gcRestoreTestFocus());
  }
  ok(
    "Blur physically removes incoming notes and unsent correction/return controls; unfocused return cannot reopen them"
  );
  await signal("focus");
  await waitUntil(
    async () => (await cards.count()) === 2 && (await equipment.isVisible())
  );
  assert.equal(await equipment.locator("textarea").inputValue(), unsent);
  assert.equal(
    await equipment
      .getByLabel("Total equipment actually returned", { exact: true })
      .inputValue(),
    "1"
  );
  assert.ok((await equipment.textContent()).includes(loanNote));
  assert.equal(await page.getByText(owner.name, { exact: true }).count(), 0);
  ok(
    "A current coordinator read restores its retained correction and return drafts"
  );
  await signIn(other);
  await signal("focus");
  await waitUntil(
    async () =>
      (await cards.count()) === 0 &&
      (await page
        .getByText(
          "Your sign-in changed. Private entries were cleared. Reload for your current account.",
          { exact: true }
        )
        .count()) === 1
  );
  for (const marker of [note, loanNote, contribution.id, loan.id, unsent])
    assert.ok(!(await page.locator("body").innerText()).includes(marker));
  ok(
    "Confirmed account replacement clears the prior coordinator's contribution owners"
  );
  await signIn(manager);
  await go(path);
  await waitUntil(async () => (await cards.count()) === 2);
  // Change only the isolated fixture database to model an appointment ending;
  // all browser reads still go through the canonical HTTPS endpoint.
  await db.exchangeNeed.update({
    where: { id: need.id },
    data: {
      coordinatorId: null,
      coordinatorKey: null,
      consentVersion: { increment: 1 }
    }
  });
  await signal("focus");
  await waitUntil(async () => (await cards.count()) === 0);
  for (const marker of [note, loanNote, contribution.id, loan.id])
    assert.ok(!(await page.locator("body").innerText()).includes(marker));
  ok(
    "Revoking the current coordinator appointment conceals private contributions after recheck"
  );
  await page.screenshot({
    path: output + "/incoming-concealed-after-revocation.png",
    fullPage: true
  });
  assert.deepEqual(errors, []);
  assert.deepEqual(layoutFailures, []);
  writeFileSync(
    output + "/results.json",
    JSON.stringify(
      {
        baseline: false,
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
    JSON.stringify({ results, errors, error: String(error) }, null, 2)
  );
  throw error;
} finally {
  await context.close();
  await browser.close();
  await db.$disconnect();
}
