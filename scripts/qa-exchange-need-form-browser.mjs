import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync, realpathSync } from "node:fs";
import { resolve, relative, isAbsolute } from "node:path";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { sessionCookieFixtureName } from "./session-cookie-fixture.mjs";

assert.ok(
  process.argv[2],
  "Pass the existing isolated Exchange preview directory"
);
const fixtureDir = realpathSync(resolve(process.argv[2]));
const fixtureRelative = relative(
  realpathSync(resolve(".account-test")),
  fixtureDir
);
assert.ok(
  fixtureRelative &&
    !fixtureRelative.startsWith("..") &&
    !isAbsolute(fixtureRelative)
);
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
assert.equal(new URL(config.origin).port, new URL(localOrigin).port);
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
  PRIVILEGED_MFA_MODE: process.env.PRIVILEGED_MFA_MODE ?? "off",
  COMMUNITY_REPORTS_ENABLED: "true",
  BLOB_READ_WRITE_TOKEN: "",
  RESEND_API_KEY: "",
  MAILERLITE_API_KEY: "",
  MEDIA_STORAGE_MODE: "local-test",
  RETENTION_TEST_DIR:
    process.env.RETENTION_TEST_DIR ?? fixtureDir + "/retention",
  MEDIA_TEST_DIR: process.env.MEDIA_TEST_DIR ?? fixtureDir + "/images"
});
// The parent runner serves this browser phase with MFA off and then restarts
// the same build with MFA enforce for the separate HTTPS contract suite.
assert.equal(process.env.PRIVILEGED_MFA_MODE, "off");
const { PrismaClient } = await import("@prisma/client");
const { assertPortalTestDatabase } = await import("../tests/seed-portal.ts");
const db = new PrismaClient();
await assertPortalTestDatabase(db);
const { chromium } = createRequire(
  process.env.PLAYWRIGHT_MODULE ??
    process.env.HOME +
      "/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json"
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
if (process.platform !== "darwin")
  assert.ok(
    process.env.DISPLAY && process.env.XAUTHORITY,
    "Headed fixture requires the owned authenticated display"
  );
const browser = await chromium.launch({
  headless: false,
  executablePath:
    process.env.CHROMIUM_PATH ??
    (process.platform === "darwin"
      ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
      : undefined),
  args: [
    "--ignore-certificate-errors-spki-list=" +
      createHash("sha256").update(der).digest("base64"),
    "--host-resolver-rules=MAP exchange-fixture.example.test 127.0.0.1",
    "--no-proxy-server"
  ]
});

const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  serviceWorkers: "block"
});
context.setDefaultTimeout(15000);
const output = fixtureDir + "/need-form-browser-" + Date.now();
assert.ok(!output.startsWith(resolve(process.env.ACCOUNT_TEST_SINK_DIR) + "/"));
mkdirSync(output, { mode: 0o700 });
const results = [],
  errors = [],
  layoutFailures = [],
  externalRequests = [],
  routingErrors = [];
const writes = [],
  responses = [],
  pendingRoutes = new Set();
let fault = null,
  releaseHeld = () => {},
  firstFailure = null;
const timeout = async (promise, name) => {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(Error(name + " timed out")), 15000);
      })
    ]);
  } finally {
    clearTimeout(timer);
  }
};
const deferred = () => {
  let release;
  const promise = new Promise((r) => {
    release = r;
  });
  return { promise, release };
};
await context.route("**/*", async (route) => {
  const request = route.request(),
    url = new URL(request.url());
  if (url.origin !== config.origin) {
    externalRequests.push({ method: request.method(), origin: url.origin });
    return route.abort("blockedbyclient");
  }
  if (request.method() !== "POST" || url.pathname !== "/api/platform/exchange")
    return route.continue();
  const body = request.postData();
  assert.ok(body);
  writes.push({ body, owner: request.headers()["x-expected-account"] ?? null });
  if (!fault) return route.continue();
  const operation = Promise.resolve()
    .then(() => fault(route))
    .catch(async (error) => {
      routingErrors.push(String(error));
      await route.abort("failed").catch(() => {});
    });
  pendingRoutes.add(operation);
  await operation;
  pendingRoutes.delete(operation);
});
const page = await context.newPage();
page.on("pageerror", (error) => errors.push(String(error)));
page.on("dialog", (dialog) => dialog.accept());
const until = async (work) => {
  for (let i = 0; i < 100; i++) {
    if (await work()) return;
    await page.waitForTimeout(100);
  }
  throw Error("Current form state was not observed");
};
const ready = async (locator) => {
  await locator.waitFor({ state: "visible" });
  await until(() => locator.isEnabled());
};
const signal = (event) =>
  page.evaluate((event) => window.dispatchEvent(new Event(event)), event);
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
const visit = async (path) => {
  await page.bringToFront();
  const response = await page.goto(config.origin + path);
  assert.equal(response.status(), 200);
  assert.equal(new URL(page.url()).origin, config.origin);
};
const resume = async () => {
  await page.bringToFront();
  const recheck = page.getByRole("button", {
    name: "Recheck this sign-in",
    exact: true
  });
  if (await recheck.isVisible()) await recheck.click();
  await signal("focus");
};
const absentInputs = async () => {
  // Check actual descendant DOM, not merely visibility of the outer hidden wrapper.
  await until(
    async () =>
      (await page
        .locator("main form input,main form textarea,main form select")
        .count()) === 0
  );
};
const bounded = async () => {
  const value = await page.evaluate(() => ({
    width: innerWidth,
    scroll: document.documentElement.scrollWidth
  }));
  if (value.scroll > value.width + 1) layoutFailures.push(value);
  assert.ok(value.scroll <= value.width + 1, "No horizontal page overflow");
};
const screenshot = async (name) => {
  await bounded();
  await page.screenshot({ path: output + "/" + name + ".png", fullPage: true });
};
const ok = (name) => {
  results.push(name);
  console.log("PASS " + name);
};
const privateFile = (name, data) =>
  writeFileSync(output + "/" + name, JSON.stringify(data, null, 2) + "\n", {
    flag: "wx",
    mode: 0o600
  });
try {
  const { createPortalActor } = await import("../tests/seed-portal.ts");
  const { exchangeNeedCommand: command } =
    await import("../lib/platform/exchange-need-commands.ts");
  const { exchangeListingCommand } =
    await import("../lib/platform/exchange-listings.ts");
  const { EXCHANGE_ITEM_POLICY } =
    await import("../lib/platform/exchange-options.ts");
  const { NEED_SCHEMA } =
    await import("../lib/platform/exchange-need-options.ts");
  const manager = await createPortalActor(db, "formmanager"),
    a = await createPortalActor(db, "formowner"),
    other = await createPortalActor(db, "formother");
  const church = await db.church.create({
    data: {
      slug: "fixture-form-" + randomUUID(),
      name: "Fictional form church",
      summary: "Isolated form privacy",
      communityListed: true
    }
  });
  await db.churchConnection.createMany({
    data: [manager, a, other].map((actor) => ({
      userId: actor.id,
      churchId: church.id,
      state: "APPROVED"
    }))
  });
  await db.churchCapabilityGrant.createMany({
    data: ["MANAGE_EXCHANGE_LISTINGS", "MODERATE_EXCHANGE_LISTINGS"].map(
      (capability) => ({ userId: manager.id, churchId: church.id, capability })
    )
  });
  await db.socialPreferences.create({
    data: { ownerId: manager.id, contactRequests: "EVERYONE" }
  });
  const listing = await db.exchangeListing.create({
    data: {
      ownerChurchId: church.id,
      creatorId: manager.id,
      intent: "CHURCH_NEED",
      category: "HOUSEHOLD",
      audience: "PUBLIC",
      title: "Fictional form context " + randomUUID(),
      description: "Isolated real application form acceptance",
      requestedItems: "Fictional donations and quotations",
      country: "US",
      placeId: 4887398,
      placeLabel: "Chicago",
      itemPolicy: EXCHANGE_ITEM_POLICY
    }
  });
  const input = (operation, fields) => ({
    operation,
    mutationId: randomUUID(),
    ...fields
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
  const createSlot = (action, label) =>
    command(
      db,
      manager.token,
      input("slot", {
        needId: configured.id,
        slotId: randomUUID(),
        expectedVersion: 0,
        schema: NEED_SCHEMA,
        fields: {
          action,
          label,
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
  await createSlot("DONATE", "Fictional donations");
  const quote = await createSlot("SELL", "Fictional quotes");
  const currentListing = await db.exchangeListing.findUniqueOrThrow({
    where: { id: listing.id }
  });
  await exchangeListingCommand(
    db,
    manager.token,
    input("status", {
      listingId: listing.id,
      expectedVersion: currentListing.version,
      state: "ACTIVE",
      itemPolicy: EXCHANGE_ITEM_POLICY,
      itemConfirmed: true
    })
  );
  const need = await db.exchangeNeed.findUniqueOrThrow({
    where: { id: configured.id }
  });
  const hiddenNote = "Fictional other private quote " + randomUUID();
  const hidden = await command(
    db,
    other.token,
    input("claim", {
      needId: need.id,
      slotId: quote.id,
      slotVersion: quote.version,
      consentVersion: need.consentVersion,
      id: randomUUID(),
      expectedVersion: 0,
      quantity: 1,
      note: hiddenNote,
      price: "17.00",
      currency: "USD",
      shareName: false,
      loanAccepted: false,
      waitlist: false
    })
  );
  const path = "/platform/exchange/" + listing.id + "/needs";
  const donationForm = () =>
    page.getByRole("form", {
      name: "Offer help for Fictional donations",
      exact: true
    });
  const quoteForm = () =>
    page.getByRole("form", {
      name: "Offer help for Fictional quotes",
      exact: true
    });
  const note = () =>
    donationForm().getByRole("textbox", {
      name: "Optional private note to the coordinator",
      exact: true
    });
  const quoteNote = () =>
    quoteForm().getByRole("textbox", {
      name: "Exact scope of this quote",
      exact: true
    });
  const setup = () =>
    page.getByRole("form", {
      name: "Need deadline and coordinator",
      exact: true
    });
  const slotSection = () =>
    page.getByRole("region", { name: "Manage need action slots", exact: true });
  const slotForm = () =>
    slotSection().getByRole("form", {
      name: "Edit slot Fictional donations",
      exact: true
    });
  const openSlotEditor = async () => {
    const details = slotSection()
      .locator("details")
      .filter({
        has: page.locator('form[aria-label="Edit slot Fictional donations"]')
      });
    assert.equal(await details.count(), 1);
    if (!(await details.evaluate((el) => el.open)))
      await details.locator("summary").click();
    await slotForm().waitFor({ state: "visible" });
  };
  const organizer = () =>
    page.getByRole("textbox", { name: "Public organizer update", exact: true });
  // Whole-document assertion applies to denied/non-owner data. The existing
  // authorized own contribution row remains allowed; recipient minimization
  // itself is covered by the exact source-executing projection tests.
  for (const actor of [null, a]) {
    await signIn(actor);
    for (const rsc of [false, true]) {
      const response = await context.request.get(
        config.origin + path + (rsc ? "?_rsc=form-fixture" : ""),
        { maxRedirects: 0, headers: rsc ? { RSC: "1", "Next-Url": path } : {} }
      );
      assert.equal(response.status(), 200);
      const text = (await response.text()).replaceAll("\\", "");
      assert.ok(
        !text.includes(hiddenNote),
        "Another person's private quote escaped HTML/RSC"
      );
      assert.ok(
        !text.includes(hidden.id),
        "Another person's contribution ID escaped HTML/RSC"
      );
      if (!actor)
        for (const marker of [
          "Need deadline and coordinator",
          "Manage need action slots",
          "Public organizer update"
        ])
          assert.ok(
            !text.includes(marker),
            "Guest received private manager controls"
          );
    }
  }
  await signIn(other);
  const own = await context.request.get(config.origin + path, {
    maxRedirects: 0
  });
  assert.equal(own.status(), 200);
  assert.ok(
    (await own.text()).replaceAll("\\", "").includes(hiddenNote),
    "Positive control: authorized own inline row remains supported"
  );
  ok(
    "Initial HTML/RSC excludes another person's private quote and manager controls while permitting the explicit own row"
  );

  await signIn(manager);
  await visit(path);
  await ready(
    setup().getByRole("textbox", {
      name: "Time zone, for example America/Chicago",
      exact: true
    })
  );
  await openSlotEditor();
  const zone = () =>
    setup().getByRole("textbox", {
      name: "Time zone, for example America/Chicago",
      exact: true
    });
  const slotLabel = () =>
    slotForm().getByRole("textbox", {
      name: "Item or help description",
      exact: true
    });
  await zone().fill("America/Chicago");
  await slotLabel().fill("Fictional unsent slot");
  await organizer().fill("Fictional unsent organizer update");
  const beforeManager = writes.length;
  for (const event of ["blur", "pagehide"]) {
    await signal(event);
    await absentInputs();
    assert.equal(writes.length, beforeManager);
    await resume();
    await ready(zone());
    await openSlotEditor();
    assert.equal(await zone().inputValue(), "America/Chicago");
    assert.equal(await slotLabel().inputValue(), "Fictional unsent slot");
    assert.equal(
      await organizer().inputValue(),
      "Fictional unsent organizer update"
    );
  }
  await screenshot("forms-manager-390");
  // Actual visible-document controlled unfocused return, not a native window claim.
  await page.evaluate(() => {
    window.formFocusDescriptor = Object.getOwnPropertyDescriptor(
      document,
      "hasFocus"
    );
    Object.defineProperty(document, "hasFocus", {
      configurable: true,
      value: () => false
    });
    window.dispatchEvent(new Event("blur"));
    window.dispatchEvent(new Event("pageshow"));
    document.dispatchEvent(new Event("visibilitychange"));
  });
  try {
    assert.equal(
      await page.evaluate(() => document.visibilityState),
      "visible"
    );
    await absentInputs();
    assert.equal(writes.length, beforeManager);
  } finally {
    await page.evaluate(() => {
      const d = window.formFocusDescriptor;
      if (d) Object.defineProperty(document, "hasFocus", d);
      else delete document.hasFocus;
      delete window.formFocusDescriptor;
    });
  }
  await resume();
  await ready(zone());
  assert.equal(await zone().inputValue(), "America/Chicago");
  ok(
    "Real parent guards remove setup, slot and organizer controls on departure and preserve unsent values only after current owner confirmation"
  );

  await signIn(a);
  await visit(path);
  await ready(note());
  await note().fill("Fictional original donation");
  await quoteNote().fill("Fictional unsent quote");
  await quoteForm()
    .getByRole("textbox", {
      name: "Total quoted amount for this quantity",
      exact: true
    })
    .fill("29.00");
  const beforeOffline = writes.length;
  await context.setOffline(true);
  try {
    await absentInputs();
    assert.equal(writes.length, beforeOffline);
  } finally {
    await context.setOffline(false);
  }
  await resume();
  await ready(note());
  assert.equal(await note().inputValue(), "Fictional original donation");
  assert.equal(await quoteNote().inputValue(), "Fictional unsent quote");
  await note().focus();
  await page.keyboard.press("Tab");
  assert.ok(
    await page.evaluate(() => document.activeElement?.tagName === "INPUT"),
    "Keyboard reaches the next labeled choice"
  );
  await screenshot("forms-offers-390");
  await page.setViewportSize({ width: 320, height: 844 });
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
  });
  await screenshot("forms-offers-320-200");
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "";
  });
  await page.setViewportSize({ width: 390, height: 844 });
  ok(
    "Donation and quote drafts survive offline concealment; labeled keyboard controls fit 390px and 320px enlarged text"
  );

  const saved = deferred(),
    held = deferred();
  releaseHeld = held.release;
  fault = async (route) => {
    assert.equal(
      JSON.parse(route.request().postData()).operation,
      "need-claim"
    );
    const response = await route.fetch({ maxRedirects: 0 });
    assert.equal(response.status(), 200);
    responses.push(await response.json());
    saved.release();
    await timeout(held.promise, "Original committed reply");
    return route.abort("failed");
  };
  await donationForm()
    .getByRole("button", { name: "Commit this quantity", exact: true })
    .click();
  await timeout(saved.promise, "Canonical donation commit");
  const original = writes.at(-1),
    parsed = JSON.parse(original.body);
  assert.equal(parsed.note, "Fictional original donation");
  assert.equal(original.owner, a.id);
  await signal("blur");
  await absentInputs();
  held.release();
  await timeout(Promise.all([...pendingRoutes]), "Lost reply");
  fault = null;
  assert.deepEqual(routingErrors, []);
  await resume();
  const confirm = page.getByRole("button", {
    name: "Confirm original request",
    exact: true
  });
  await ready(confirm);
  assert.equal(
    await note().count(),
    0,
    "Changed snapshot keeps original form concealed"
  );
  assert.equal(
    writes.filter((w) => JSON.parse(w.body).operation === "need-claim").length,
    1,
    "No automatic replay"
  );
  const currentRow = await db.exchangeNeedContribution.findUniqueOrThrow({
    where: { id: parsed.id }
  });
  assert.equal(currentRow.note, parsed.note);
  assert.equal(currentRow.version, responses[0].version);
  await confirm.click();
  await until(() =>
    Promise.resolve(
      writes.filter((w) => JSON.parse(w.body).operation === "need-claim")
        .length === 2
    )
  );
  await until(
    async () =>
      (await page
        .getByRole("region", {
          name: "Your contributions to this need",
          exact: true
        })
        .count()) === 1
  );
  const sent = writes.filter(
    (w) => JSON.parse(w.body).operation === "need-claim"
  );
  assert.equal(sent[0].body, sent[1].body);
  assert.equal(sent[1].owner, a.id);
  const replayed = await db.exchangeNeedContribution.findUniqueOrThrow({
    where: { id: parsed.id }
  });
  assert.equal(replayed.version, currentRow.version);
  assert.equal(replayed.note, parsed.note);
  assert.equal(
    await db.exchangeNeedContribution.count({ where: { id: parsed.id } }),
    1
  );
  ok(
    "A lost real committed reply stays concealed until deliberate byte-identical original replay and produces one canonical contribution"
  );

  await signIn(manager);
  await visit(path);
  await ready(zone());
  await zone().fill("Fictional retained pending zone");
  const beforeRevocation = writes.length;
  await db.churchCapabilityGrant.update({
    where: {
      userId_churchId_capability: {
        userId: manager.id,
        churchId: church.id,
        capability: "MANAGE_EXCHANGE_LISTINGS"
      }
    },
    data: { revokedAt: new Date(), version: { increment: 1 } }
  });
  await signal("blur");
  await resume();
  await absentInputs();
  assert.equal(writes.length, beforeRevocation);
  const denied = await context.request.get(
    config.origin +
      "/api/platform/exchange?view=need-roles&listingId=" +
      listing.id,
    { maxRedirects: 0, headers: { "X-Expected-Account": manager.id } }
  );
  assert.equal(denied.status(), 404);
  await screenshot("forms-revoked");
  ok(
    "Current duty revocation conceals stale manager drafts and denies the matching canonical role read without automatic writes"
  );

  assert.equal(results.length, 5);
  assert.deepEqual(errors, []);
  assert.deepEqual(routingErrors, []);
  assert.deepEqual(externalRequests, []);
  assert.deepEqual(layoutFailures, []);
} catch (error) {
  firstFailure = String(error.stack ?? error);
  // Record the original error before any secondary screenshot/DOM work.
  writeFileSync(output + "/first-failure.txt", firstFailure, {
    flag: "wx",
    mode: 0o600
  });
  await page
    .screenshot({ path: output + "/failure.png", fullPage: true })
    .catch(() => {});
  throw error;
} finally {
  releaseHeld();
  await timeout(Promise.allSettled([...pendingRoutes]), "Route cleanup").catch(
    (error) => routingErrors.push(String(error))
  );
  privateFile("observations.json", {
    writes,
    responses,
    routingErrors,
    externalRequests
  });
  privateFile("results.json", {
    source: execFileSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8"
    }).trim(),
    buildId: readFileSync(".next/BUILD_ID", "utf8").trim(),
    results,
    errors,
    layoutFailures,
    complete:
      !firstFailure &&
      results.length === 5 &&
      errors.length === 0 &&
      layoutFailures.length === 0 &&
      routingErrors.length === 0 &&
      externalRequests.length === 0,
    routingErrorCount: routingErrors.length,
    externalRequestCount: externalRequests.length,
    productionWrites: 0,
    externalSends: 0,
    scopeEvidence:
      "full-application-https-with-fictional-database-and-controlled-faults",
    limitations: [
      "Browser serving mode off; existing separate HTTPS phase enforces MFA.",
      "Controlled browser lifecycle signals are not native-window evidence.",
      "Minimal form recipients do not establish routing-only bootstrap or removal of the authorized own inline row.",
      "This layer does not assert later multi-save/rearm, permanent A-B-A clearing or sibling draft survival after accepted RSC replacement."
    ]
  });
  await context.close();
  await browser.close();
  await db.$disconnect();
}
