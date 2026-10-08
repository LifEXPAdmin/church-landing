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
  hasTouch: true,
  serviceWorkers: "block"
});
context.setDefaultTimeout(15000);
const output = fixtureDir + "/need-volunteer-browser-" + Date.now();
mkdirSync(output, { mode: 0o700 });
const results = [],
  errors = [],
  layoutFailures = [],
  blockedExternal = [];
const observations = [],
  commandBodies = [],
  readRequests = [];
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
const gate = () => {
  let release;
  const promise = new Promise((resolve) => {
    release = resolve;
  });
  return { promise, release };
};
let rosterFault = null,
  commandFault = null;
const routed = new Set(),
  routingErrors = [];
// One dispatcher owns every request and every fault; later routes cannot
// bypass this fence. Only real local HTTPS responses are held or discarded.
await context.route("**/*", async (route) => {
  const request = route.request(),
    url = new URL(request.url());
  if (url.origin !== config.origin) {
    blockedExternal.push({ origin: url.origin, method: request.method() });
    return route.abort("blockedbyclient");
  }
  const roster =
    request.method() === "GET" &&
    url.pathname === "/api/platform/exchange" &&
    url.searchParams.get("view") === "need-volunteers";
  const command =
    request.method() === "POST" &&
    url.pathname === "/api/platform/exchange" &&
    JSON.parse(request.postData() ?? "{}").operation ===
      "need-complete-volunteer";
  if (roster)
    readRequests.push({
      owner: request.headers()["x-expected-account"] ?? null
    });
  if (command)
    commandBodies.push({
      owner: request.headers()["x-expected-account"] ?? null,
      body: request.postData()
    });
  const fault = roster ? rosterFault : command ? commandFault : null;
  if (!fault) return route.continue();
  const pending = Promise.resolve()
    .then(() => fault(route))
    .catch(async (error) => {
      routingErrors.push(String(error));
      await route.abort("failed").catch(() => {});
    });
  routed.add(pending);
  await pending;
  routed.delete(pending);
});
const drain = async () => {
  await within(Promise.all([...routed]), "Held volunteer requests");
  assert.deepEqual(routingErrors, []);
};
const page = await context.newPage();
page.on("pageerror", (error) =>
  errors.push({ path: new URL(page.url()).pathname, message: error.message })
);
page.on("dialog", (dialog) => dialog.accept());
const ok = (message) => {
  results.push(message);
  console.log("PASS " + message);
};
const waitUntil = async (work) => {
  for (let i = 0; i < 120; i++) {
    if (await work()) return;
    await page.waitForTimeout(100);
  }
  throw Error("Expected volunteer state was not observed");
};
const ready = async (button) => {
  await button.waitFor();
  await waitUntil(() => button.isEnabled());
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
const go = async (path) => {
  const response = await page.goto(config.origin + path);
  assert.equal(response.status(), 200);
  return response;
};
const signal = (event) =>
  page.evaluate((name) => {
    (name === "visibilitychange" ? document : window).dispatchEvent(
      new Event(name)
    );
  }, event);
const bounded = async () => {
  const measured = await page.evaluate(() => ({
    width: innerWidth,
    scroll: document.documentElement.scrollWidth,
    offenders: [...document.querySelectorAll("main *")]
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        return (
          rect.width > 0 && (rect.left < -1 || rect.right > innerWidth + 1)
        );
      })
      .slice(0, 10)
      .map((element) => ({
        tag: element.tagName,
        className: element.className
      }))
  }));
  if (measured.scroll > measured.width + 1) layoutFailures.push(measured);
  assert.deepEqual(
    layoutFailures,
    [],
    "Volunteer layout must fit the viewport"
  );
};
const panel = page.locator('section[aria-label="Volunteer completion"]');
const cards = panel.locator(":scope > section");
const card = (actor) =>
  cards.filter({
    has: page.getByRole("heading", { name: actor.name, exact: true })
  });
const correct = (actor) =>
  card(actor).getByRole("button", {
    name: "Correct completion record",
    exact: true
  });
const complete = (actor) =>
  card(actor).getByRole("button", {
    name: "Confirm help actually completed",
    exact: true
  });
const retry = () =>
  panel.getByRole("button", { name: "Confirm original save", exact: true });
const cleared = () =>
  panel.getByText(
    "Your sign-in changed. Private entries were cleared. Reload for your current account.",
    { exact: true }
  );
const assertConcealed = async (markers) => {
  assert.equal(await cards.count(), 0);
  assert.equal(await panel.locator("textarea,input").count(), 0);
  const body = await page.locator("body").innerText();
  for (const marker of markers)
    assert.ok(!body.includes(marker), "Concealed volunteer value reappeared");
};
try {
  const { seedParticipation } =
    await import("../tests/seed-post-participation.ts");
  const { exchangeNeedCommand: command } =
    await import("../lib/platform/exchange-need-commands.ts");
  const { exchangeListingCommand } =
    await import("../lib/platform/exchange-listings.ts");
  const { EXCHANGE_ITEM_POLICY } =
    await import("../lib/platform/exchange-options.ts");
  const { NEED_SCHEMA } =
    await import("../lib/platform/exchange-need-options.ts");
  const f = await seedParticipation(db),
    manager = f.ada,
    a = f.val,
    b = f.morgan,
    other = f.blake;
  const input = (operation, values) => ({
    operation,
    mutationId: randomUUID(),
    ...values
  });
  await db.churchCapabilityGrant.createMany({
    data: [
      {
        userId: manager.id,
        churchId: f.churchA.id,
        capability: "MANAGE_EXCHANGE_LISTINGS"
      },
      {
        userId: manager.id,
        churchId: f.churchA.id,
        capability: "MODERATE_EXCHANGE_LISTINGS"
      }
    ]
  });
  await db.socialPreferences.upsert({
    where: { ownerId: manager.id },
    create: { ownerId: manager.id, contactRequests: "EVERYONE" },
    update: { contactRequests: "EVERYONE" }
  });
  const role = await f.slot({ capacity: 2 });
  const listing = await db.exchangeListing.create({
    data: {
      ownerChurchId: f.churchA.id,
      creatorId: manager.id,
      intent: "CHURCH_NEED",
      category: "HOUSEHOLD",
      title: "Fictional completion privacy " + randomUUID(),
      description: "Isolated canonical event volunteer receipts",
      requestedItems: "Two event volunteers",
      audience: "CHURCH",
      audienceChurchId: f.churchA.id,
      country: "US",
      placeId: 4887398,
      placeLabel: "Chicago"
    }
  });
  const configured = await command(
    db,
    manager.token,
    input("configure", {
      listingId: listing.id,
      listingVersion: listing.version,
      expectedVersion: 0,
      deadlineLocal: new Date(Date.now() + 3 * 86400000)
        .toISOString()
        .slice(0, 16),
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
        action: "VOLUNTEER",
        label: "Fictional event help",
        unit: "places",
        target: 2,
        loan: false,
        returnLocal: null,
        returnTimeZone: null,
        returnResponsibility: "",
        volunteerSlotId: role.id
      }
    })
  );
  const listingReady = await db.exchangeListing.findUniqueOrThrow({
    where: { id: listing.id }
  });
  await exchangeListingCommand(
    db,
    manager.token,
    input("status", {
      listingId: listing.id,
      expectedVersion: listingReady.version,
      state: "ACTIVE",
      itemPolicy: EXCHANGE_ITEM_POLICY,
      itemConfirmed: true
    })
  );
  const need = await db.exchangeNeed.findUniqueOrThrow({
    where: { id: configured.id }
  });
  for (const actor of [a, b]) {
    await command(
      db,
      actor.token,
      input("volunteer", {
        needId: need.id,
        slotId: slot.id,
        slotVersion: slot.version,
        expectedVersion: need.consentVersion,
        signupVersion: 0
      })
    );
    const signup = await db.postVolunteerSignup.findUniqueOrThrow({
      where: { slotId_userId: { slotId: role.id, userId: actor.id } }
    });
    await command(
      db,
      manager.token,
      input("complete-volunteer", {
        needId: need.id,
        signupId: signup.id,
        expectedVersion: signup.version,
        completed: true,
        reason: ""
      })
    );
  }
  const row = (actor) =>
    db.postVolunteerSignup.findUniqueOrThrow({
      where: { slotId_userId: { slotId: role.id, userId: actor.id } }
    });
  const originalA = await row(a),
    originalB = await row(b);
  const path =
    "/platform/exchange/" +
    listing.id +
    "/needs?volunteers=" +
    encodeURIComponent(slot.id);
  const rosterPath =
    "/api/platform/exchange?view=need-volunteers&id=" +
    encodeURIComponent(slot.id);
  const markers = [a.name, b.name, originalA.id, originalB.id];
  writeFileSync(
    output + "/fixture.json",
    JSON.stringify(
      {
        ownerId: manager.id,
        otherId: other.id,
        needId: need.id,
        listingId: listing.id,
        slotId: slot.id,
        roleId: role.id,
        signupIds: [originalA.id, originalB.id]
      },
      null,
      2
    ),
    { mode: 0o600, flag: "wx" }
  );

  // Group 1: production HTML/RSC and a pinned read, held before first display.
  const initialGate = gate(),
    initialStarted = gate();
  let holdInitial = true;
  rosterFault = async (route) => {
    const response = await route.fetch();
    assert.equal(response.status(), 200);
    assert.equal(route.request().headers()["x-expected-account"], manager.id);
    if (holdInitial) {
      initialStarted.release();
      await within(initialGate.promise, "Initial roster");
    }
    return route.fulfill({ response });
  };
  await signIn(manager);
  try {
    const html = await (await go(path)).text();
    await within(initialStarted.promise, "Initial pinned roster request");
    const rscResponse = await context.request.get(config.origin + path, {
      headers: { RSC: "1" }
    });
    assert.equal(rscResponse.status(), 200);
    const rsc = await rscResponse.text();
    for (const value of [html, rsc])
      for (const marker of markers)
        assert.ok(
          !value.includes(marker),
          "Private volunteer data leaked into HTML/RSC"
        );
    await assertConcealed(markers);
    const wrongOwner = await context.request.get(config.origin + rosterPath, {
      headers: { "x-expected-account": other.id }
    });
    assert.equal(wrongOwner.status(), 401);
    for (const header of [
      "cache-control",
      "cdn-cache-control",
      "vercel-cdn-cache-control"
    ])
      assert.match(wrongOwner.headers()[header], /no-store/);
  } finally {
    holdInitial = false;
    initialGate.release();
  }
  await drain();
  rosterFault = null;
  await ready(card(a).locator("textarea"));
  await ready(card(b).locator("textarea"));
  assert.equal(await cards.count(), 2);
  assert.ok(
    readRequests.length > 0 &&
      readRequests.every((request) => request.owner === manager.id)
  );
  await bounded();
  await page.screenshot({
    path: output + "/volunteers-visible-390.png",
    fullPage: true
  });
  await page.setViewportSize({ width: 320, height: 800 });
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
  });
  await bounded();
  await page.screenshot({
    path: output + "/volunteers-visible-320-200.png",
    fullPage: true
  });
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "";
  });
  await page.setViewportSize({ width: 390, height: 844 });
  ok(
    "Routing-only HTML/RSC omits private volunteers; pinned current reads reveal the roster and fit 390px and 320px at 200 percent text"
  );

  // Group 2: controlled document focus, not a native-window/device claim.
  const reasonA = "Fictional retained correction " + randomUUID();
  const reasonB = "Independent sibling correction " + randomUUID();
  await card(a).locator("textarea").fill(reasonA);
  await card(b).locator("textarea").fill(reasonB);
  await signal("blur");
  await waitUntil(async () => (await cards.count()) === 0);
  await assertConcealed([...markers, reasonA, reasonB]);
  await page.screenshot({
    path: output + "/volunteers-concealed.png",
    fullPage: true
  });
  await page.evaluate(() => {
    if (document.visibilityState !== "visible")
      throw Error("Expected a visible document");
    const own = Object.getOwnPropertyDescriptor(document, "hasFocus");
    window.__gcRestoreVolunteerFocus = () => {
      if (own) Object.defineProperty(document, "hasFocus", own);
      else delete document.hasFocus;
      delete window.__gcRestoreVolunteerFocus;
    };
    Object.defineProperty(document, "hasFocus", {
      configurable: true,
      value: () => false
    });
  });
  const unfocusedCount = readRequests.length;
  try {
    for (const event of ["pageshow", "visibilitychange"]) {
      await signal(event);
      await page.waitForTimeout(200);
      await assertConcealed([...markers, reasonA, reasonB]);
      assert.equal(
        readRequests.length,
        unfocusedCount,
        "Unfocused return started a private read"
      );
    }
  } finally {
    await page.evaluate(() => window.__gcRestoreVolunteerFocus());
  }
  await signal("focus");
  await ready(correct(a));
  assert.equal(await card(a).locator("textarea").inputValue(), reasonA);
  assert.equal(await card(b).locator("textarea").inputValue(), reasonB);
  await context.setOffline(true);
  await signal("offline");
  await waitUntil(async () => (await cards.count()) === 0);
  await assertConcealed([...markers, reasonA, reasonB]);
  await context.setOffline(false);
  await signal("focus");
  await ready(correct(a));
  assert.equal(await card(a).locator("textarea").inputValue(), reasonA);
  assert.equal(await card(b).locator("textarea").inputValue(), reasonB);
  ok(
    "Blur and offline physically conceal names and drafts; controlled unfocused return cannot read or reveal them and same-owner focus restores both drafts"
  );

  // Group 3: the real POST commits; only its network reply is lost.
  const beforeCorrection = await row(a);
  const beforeAudit = await db.postAudit.count({
    where: {
      targetId: originalA.id,
      action: "volunteer-completion-corrected"
    }
  });
  const correctionStart = commandBodies.length;
  let lostOnce = false;
  commandFault = async (route) => {
    if (!lostOnce) {
      lostOnce = true;
      const response = await route.fetch();
      assert.equal(response.status(), 200);
      const receipt = await response.json();
      assert.equal(receipt.id, originalA.id);
      assert.equal(receipt.version, beforeCorrection.version + 1);
      return route.abort("failed");
    }
    return route.continue();
  };
  await correct(a).click();
  await ready(retry());
  const committed = await row(a);
  assert.equal(committed.version, beforeCorrection.version + 1);
  assert.equal(committed.completedAt, null);
  await signal("blur");
  await signal("focus");
  await ready(retry());
  await panel
    .getByText(
      "Your volunteers changed. The original entries are retained and concealed. Confirm any original request, then reload to review current information.",
      { exact: true }
    )
    .waitFor();
  await assertConcealed([...markers, reasonA, reasonB]);
  await retry().click();
  await ready(complete(a));
  await ready(correct(b));
  commandFault = null;
  await drain();
  const correctionBodies = commandBodies.slice(correctionStart);
  assert.equal(correctionBodies.length, 2);
  assert.equal(correctionBodies[0].body, correctionBodies[1].body);
  assert.ok(correctionBodies.every((request) => request.owner === manager.id));
  const sent = JSON.parse(correctionBodies[0].body);
  assert.equal(sent.signupId, originalA.id);
  assert.equal(sent.expectedVersion, beforeCorrection.version);
  assert.equal(sent.reason, reasonA);
  assert.equal(sent.completed, false);
  assert.equal((await row(a)).version, committed.version);
  assert.equal(
    await db.postAudit.count({
      where: {
        targetId: originalA.id,
        action: "volunteer-completion-corrected"
      }
    }),
    beforeAudit + 1
  );
  assert.equal(
    await db.exchangeNeedEvent.count({
      where: {
        needId: need.id,
        targetId: originalA.id,
        action: "VOLUNTEER-COMPLETION-CORRECTED",
        text: reasonA
      }
    }),
    1
  );
  assert.equal(await card(b).locator("textarea").inputValue(), reasonB);
  observations.push({
    kind: "exact-retry",
    firstVersion: beforeCorrection.version,
    committedVersion: committed.version,
    postCount: 2,
    auditDelta: 1
  });
  ok(
    "A lost committed correction retries identical original ID, version and reason bytes with one canonical mutation and preserves the sibling draft"
  );

  // Group 4: old-owner roster responses cannot cross blur or account identity.
  for (const replacement of [false, true]) {
    const held = gate(),
      started = gate();
    let first = true;
    rosterFault = async (route) => {
      const response = await route.fetch();
      assert.equal(response.status(), 200);
      if (first) {
        first = false;
        started.release();
        await within(held.promise, "Old roster response");
      }
      return route.fulfill({ response });
    };
    await signal("focus");
    try {
      await within(started.promise, "Held roster read");
      if (replacement) await signIn(other);
      else await signal("blur");
    } finally {
      held.release();
    }
    await drain();
    rosterFault = null;
    if (replacement) await cleared().waitFor();
    else {
      await page.waitForTimeout(200);
      await assertConcealed([...markers, reasonB]);
      await signal("focus");
      await ready(correct(b));
      assert.equal(await card(b).locator("textarea").inputValue(), reasonB);
    }
  }
  await assertConcealed([...markers, reasonB]);
  await signIn(manager);
  await signal("focus");
  await page.waitForTimeout(200);
  await assertConcealed([...markers, reasonB]);
  await cleared().waitFor();
  await panel
    .getByRole("button", { name: "Reload current information", exact: true })
    .click();
  await ready(card(b).locator("textarea"));
  await ready(complete(a));
  assert.equal(await card(b).locator("textarea").inputValue(), "");
  ok(
    "Held roster reads cannot reopen a blurred page or replace owner; confirmed A to B to A clears old drafts until deliberate reload"
  );

  // Group 5: committed receipts cannot restore another account's controls.
  const beforeCompletion = await row(a);
  const completionAudits = await db.postAudit.count({
    where: {
      targetId: originalA.id,
      action: "volunteer-completed"
    }
  });
  const heldReceipt = gate(),
    completionStarted = gate();
  commandFault = async (route) => {
    const response = await route.fetch();
    assert.equal(response.status(), 200);
    const receipt = await response.json();
    assert.equal(receipt.id, originalA.id);
    assert.equal(receipt.version, beforeCompletion.version + 1);
    completionStarted.release();
    await within(heldReceipt.promise, "Held completion receipt");
    return route.fulfill({ response });
  };
  await complete(a).click();
  try {
    await within(completionStarted.promise, "Committed completion");
    await signIn(other);
    await signal("blur");
    await signal("focus");
    await cleared().waitFor();
  } finally {
    heldReceipt.release();
  }
  await drain();
  commandFault = null;
  await page.waitForTimeout(200);
  await assertConcealed(markers);
  assert.equal(await retry().count(), 0);
  await signIn(manager);
  await signal("focus");
  await page.waitForTimeout(200);
  await assertConcealed(markers);
  await panel
    .getByRole("button", { name: "Reload current information", exact: true })
    .click();
  await ready(card(a).locator("textarea"));
  assert.equal(await card(a).locator("textarea").inputValue(), "");
  assert.equal((await row(a)).version, beforeCompletion.version + 1);
  assert.equal(
    await db.postAudit.count({
      where: {
        targetId: originalA.id,
        action: "volunteer-completed"
      }
    }),
    completionAudits + 1
  );
  // Fixture-only authority revocation. The UI subsequently uses real HTTPS.
  await db.churchCapabilityGrant.update({
    where: {
      userId_churchId_capability: {
        userId: manager.id,
        churchId: f.churchA.id,
        capability: "MANAGE_CHURCH_VOLUNTEERS"
      }
    },
    data: { revokedAt: new Date(), version: { increment: 1 } }
  });
  await signal("focus");
  await waitUntil(async () => (await cards.count()) === 0);
  await panel
    .getByText(/unavailable/i)
    .first()
    .waitFor();
  await assertConcealed(markers);
  const denied = await context.request.get(config.origin + rosterPath, {
    headers: { "x-expected-account": manager.id }
  });
  assert.equal(denied.status(), 404);
  ok(
    "A late committed receipt cannot resurrect another owner's controls; returning A reads the one saved completion and revoked organizer duty conceals the roster"
  );

  assert.equal(results.length, 5);
  assert.deepEqual(errors, []);
  assert.deepEqual(layoutFailures, []);
  assert.deepEqual(routingErrors, []);
  assert.deepEqual(blockedExternal, []);
  writeFileSync(
    output + "/observations.json",
    JSON.stringify(
      {
        observations,
        commandBodies,
        readRequests,
        blockedExternal
      },
      null,
      2
    ),
    { mode: 0o600, flag: "wx" }
  );
  writeFileSync(
    output + "/results.json",
    JSON.stringify(
      {
        baseline: false,
        results,
        errors,
        layoutFailures,
        productionWrites: 0,
        externalSends: 0,
        scope:
          "Full application HTTPS with fictional canonical database fixtures and controlled focus/fault injection",
        limitations: [
          "Browser server MFA is off; current session MFA enforce is covered by the separate HTTPS suite.",
          "Focus/blur and return events are controlled in the real browser, not native-window or physical-device acceptance.",
          "Only loopback fictional database writes and local account delivery sinks are used; no real provider delivery is tested."
        ]
      },
      null,
      2
    ),
    { mode: 0o600, flag: "wx" }
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
        .catch(() => "")),
    { mode: 0o600 }
  );
  writeFileSync(
    output + "/results.json",
    JSON.stringify(
      {
        results,
        errors,
        layoutFailures,
        routingErrors,
        blockedExternal,
        observations,
        error: String(error),
        productionWrites: 0,
        externalSends: 0
      },
      null,
      2
    ),
    { mode: 0o600 }
  );
  throw error;
} finally {
  await context.close();
  await browser.close();
  await db.$disconnect();
}
