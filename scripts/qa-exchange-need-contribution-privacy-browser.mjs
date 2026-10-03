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
  await within(Promise.all([...routed]), "Routed contribution requests");
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
  output = fixtureDir + "/need-contribution-browser-" + Date.now();
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
  throw Error("Expected current contribution state was not observed");
};
const exact = (name) => page.getByRole("button", { name, exact: true });
const signal = (name) =>
  page.evaluate((name) => window.dispatchEvent(new Event(name)), name);
try {
  const { exchangeNeedCommand: command } =
    await import("../lib/platform/exchange-need-commands.ts");
  const { readExchangeNeeds: read } =
    await import("../lib/platform/exchange-need-reads.ts");
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
  const path = "/platform/exchange/needs";
  const cards = page.locator('article[aria-label="Your need contribution"]');
  const offer = cards.filter({ hasText: note }),
    equipment = cards.filter({ hasText: loanNote });
  const panel = page.getByRole("region", {
    name: "My contributions",
    exact: true
  });
  const detail = (url) =>
    url.pathname === "/api/platform/exchange" &&
    url.searchParams.get("view") === "need-mine";
  const endpoint = config.origin + "/api/platform/exchange";
  const details = () => read(db, owner.token, { view: "mine" });
  const row = async (id) =>
    (await details()).contributions.find((r) => r.id === id);
  const ready = async (button) => {
    await button.waitFor();
    await waitUntil(() => button.isEnabled());
  };
  const allow = (card) =>
    card.getByRole("button", {
      name: "Allow my contributor name to be shown",
      exact: true
    });
  const revoke = (card) =>
    card.getByRole("button", {
      name: "Stop showing my contributor name",
      exact: true
    });
  const retry = () => exact("Confirm original save");
  await signIn(owner);
  await intercept(detail, (route) =>
    route.fulfill({
      status: 403,
      contentType: "application/json",
      body: JSON.stringify({
        message: "Injected current contribution access denial"
      })
    })
  );
  const html = await (await go(path)).text(),
    rsc = await (
      await context.request.get(config.origin + path, { headers: { RSC: "1" } })
    ).text();
  for (const body of [html, rsc])
    for (const privateValue of [
      note,
      loanNote,
      contribution.id,
      loan.id,
      marker
    ])
      assert.ok(!body.includes(privateValue));
  await panel
    .getByText("Injected current contribution access denial", { exact: true })
    .waitFor();
  assert.equal(await cards.count(), 0);
  ok(
    "HTML/RSC omit contribution identifiers, private notes and source titles; denied current access initializes no private cards"
  );
  await clearIntercepts();
  await go(path);
  await ready(allow(offer));
  await ready(allow(equipment));
  const unsent = "Private unsent dispute " + randomUUID(),
    sibling = "Private equipment dispute " + randomUUID();
  await offer.locator("textarea").fill(unsent);
  await equipment.locator("textarea").fill(sibling);
  await equipment
    .getByLabel("Total equipment actually returned", { exact: true })
    .fill("1");
  for (const event of ["blur", "pagehide", "offline"]) {
    await signal(event);
    assert.equal(await cards.count(), 0);
    assert.equal(await panel.locator("textarea,input").count(), 0);
    assert.ok(!(await panel.textContent()).includes(note));
    await signal("online");
    await signal("social-relationships-changed");
    assert.equal(await cards.count(), 0);
    await signal("focus");
    await ready(allow(offer));
    assert.equal(await offer.locator("textarea").inputValue(), unsent);
    assert.equal(await equipment.locator("textarea").inputValue(), sibling);
    assert.equal(
      await equipment
        .getByLabel("Total equipment actually returned", { exact: true })
        .inputValue(),
      "1"
    );
  }
  ok(
    "Blur, pagehide and offline physically omit notes and unsent fields; passive signals cannot reopen them and current foreground reads restore each draft"
  );
  const bodies = [];
  await intercept(endpoint, async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    bodies.push(route.request().postData());
    if (bodies.length <= 2)
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: bodies.length === 1 ? loan.id : contribution.id,
          version: bodies.length === 1 ? 2 : 1,
          message: "Injected malformed receipt"
        })
      });
    return route.continue();
  });
  await allow(offer).click();
  await ready(retry());
  await retry().click();
  await ready(retry());
  assert.equal(bodies.length, 2);
  assert.equal(bodies[0], bodies[1]);
  assert.equal((await row(contribution.id)).version, 1);
  await retry().click();
  await ready(revoke(offer));
  assert.equal(bodies.length, 3);
  assert.equal(bodies[0], bodies[2]);
  assert.equal(await offer.locator("textarea").inputValue(), unsent);
  assert.equal(await equipment.locator("textarea").inputValue(), sibling);
  assert.equal(
    await equipment
      .getByLabel("Total equipment actually returned", { exact: true })
      .inputValue(),
    "1"
  );
  await clearIntercepts();
  ok(
    "Wrong-target and stale-version receipts retain one immutable request; exact acknowledgement preserves same-card and sibling drafts"
  );
  await offer
    .getByRole("button", { name: "Flag a private dispute", exact: true })
    .click();
  await ready(revoke(offer));
  await waitUntil(
    async () => (await offer.locator("textarea").inputValue()) === ""
  );
  assert.equal((await row(contribution.id)).disputeNote, unsent);
  const returnButton = equipment.getByRole("button", {
    name: "Confirm equipment returned to me",
    exact: true
  });
  await returnButton.click();
  await ready(returnButton);
  await waitUntil(async () => (await row(loan.id)).returned === 1);
  assert.equal(await equipment.locator("textarea").inputValue(), sibling);
  await equipment
    .getByRole("button", { name: "Flag a private dispute", exact: true })
    .click();
  await ready(allow(equipment));
  await waitUntil(
    async () => (await equipment.locator("textarea").inputValue()) === ""
  );
  assert.equal((await row(loan.id)).disputeNote, sibling);
  ok(
    "Sequential attribution, dispute and equipment-return commands use current versions and acknowledge only their own submitted fields"
  );

  let releaseRead,
    readStarted,
    hold = true;
  const gate = new Promise((resolve) => {
      releaseRead = resolve;
    }),
    started = new Promise((resolve) => {
      readStarted = resolve;
    });
  await intercept(detail, async (route) => {
    const response = await route.fetch();
    if (hold) {
      readStarted();
      await within(gate, "Contribution readback");
    }
    return route.fulfill({ response });
  });
  await revoke(offer).click();
  try {
    await within(started, "Contribution acknowledgement");
    assert.equal(await cards.count(), 0);
    await signal("blur");
  } finally {
    hold = false;
    releaseRead();
  }
  await clearIntercepts();
  assert.equal(await cards.count(), 0);
  await signal("focus");
  await ready(allow(offer));
  ok(
    "A held canonical read and hidden receipt cannot expose or rearm retained cards until a fresh foreground acknowledgement"
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
  await allow(offer).click();
  await ready(retry());
  const committedVersion = (await row(contribution.id)).version;
  await signal("blur");
  await signal("focus");
  await ready(retry());
  assert.equal(await cards.count(), 0);
  await retry().click();
  await ready(revoke(offer));
  assert.equal(lost.length, 2);
  assert.equal(lost[0], lost[1]);
  assert.equal((await row(contribution.id)).version, committedVersion);
  await clearIntercepts();
  ok(
    "A committed request with a lost reply remains concealed after a changed read and replays byte-for-byte exactly once"
  );

  // Both cards may have an in-flight command. A receipt for one cannot adopt
  // the changed sibling even when both canonical versions are already visible.
  let releaseOffer, releaseLoan, offerSent, loanSent;
  const offerGate = new Promise((resolve) => {
      releaseOffer = resolve;
    }),
    loanGate = new Promise((resolve) => {
      releaseLoan = resolve;
    });
  const offerStarted = new Promise((resolve) => {
      offerSent = resolve;
    }),
    loanStarted = new Promise((resolve) => {
      loanSent = resolve;
    });
  await intercept(endpoint, async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    const body = JSON.parse(route.request().postData()),
      response = await route.fetch();
    assert.equal(response.status(), 200);
    if (body.id === contribution.id) {
      offerSent();
      await within(offerGate, "Offer receipt");
    } else {
      loanSent();
      await within(loanGate, "Loan receipt");
    }
    return route.fulfill({ response });
  });
  try {
    await revoke(offer).click();
    await within(offerStarted, "Offer command");
    await allow(equipment).click();
    await within(loanStarted, "Loan command");
    releaseOffer();
    await panel
      .getByText(
        "Your contributions changed. The original entries are retained and concealed. Confirm any original request, then reload to review current information.",
        { exact: true }
      )
      .waitFor();
    assert.equal(await cards.count(), 0);
    releaseLoan();
    await ready(allow(offer));
    await ready(revoke(equipment));
  } finally {
    releaseOffer();
    releaseLoan();
  }
  await clearIntercepts();
  ok(
    "Concurrent row saves remain concealed until each changed contribution supplies its own exact receipt"
  );

  const retained = "Never silently replace this dispute " + randomUUID();
  await offer.locator("textarea").fill(retained);
  const current = await row(contribution.id);
  await command(
    db,
    owner.token,
    input("attribution", {
      id: contribution.id,
      expectedVersion: current.version,
      shareName: true
    })
  );
  await signal("social-relationships-changed");
  await panel
    .getByText(
      "Your contributions changed. The original entries are retained and concealed. Confirm any original request, then reload to review current information.",
      { exact: true }
    )
    .waitFor();
  assert.equal(await cards.count(), 0);
  assert.equal(await panel.locator("textarea").count(), 0);
  await panel
    .getByRole("button", { name: "Reload current information", exact: true })
    .click();
  await ready(revoke(offer));
  assert.equal(await offer.locator("textarea").inputValue(), "");
  ok(
    "Unconfirmed canonical row changes freeze the entire list and retain drafts until deliberate warned reload"
  );
  await bounded();
  await page.screenshot({
    path: output + "/contribution-390.png",
    fullPage: true
  });
  await page.setViewportSize({ width: 320, height: 760 });
  await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
  await bounded();
  await page.screenshot({
    path: output + "/contribution-320-200.png",
    fullPage: true
  });
  assert.deepEqual(layoutFailures, []);
  ok(
    "My Needs layout fits 390px and 320px at 200 percent text without horizontal overflow"
  );
  await signIn(other);
  await signal("blur");
  await signal("focus");
  await panel
    .getByText(
      "Your sign-in changed. Private entries were cleared. Reload for your current account.",
      { exact: true }
    )
    .waitFor();
  assert.equal(await cards.count(), 0);
  assert.equal(await panel.locator("textarea,input").count(), 0);
  const foreign = await (await go(path)).text();
  for (const privateValue of [note, loanNote, contribution.id, loan.id])
    assert.ok(!foreign.includes(privateValue));
  await page.getByText("No contributions yet.", { exact: true }).waitFor();
  assert.equal(
    (await read(db, other.token, { view: "mine" })).contributions.length,
    0
  );
  ok(
    "Confirmed account replacement clears retained drafts and requests; another account receives no private contribution rows"
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
