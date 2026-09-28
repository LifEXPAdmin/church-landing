import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { sessionCookieFixtureName } from "./session-cookie-fixture.mjs";
const fixtureDir = process.argv[2];
assert.ok(fixtureDir, "Pass the isolated session-inactivity preview directory");
const config = JSON.parse(
  readFileSync(fixtureDir + "/browser-env.json", "utf8")
);
assert.match(config.origin, /^https:\/\/127\.0\.0\.1:\d+$/);
config.localOrigin = config.origin;
assert.equal(new URL(config.database).hostname, "127.0.0.1");
Object.assign(process.env, {
  DATABASE_URL: config.database,
  DIRECT_URL: config.database,
  ACCOUNT_ORIGIN: config.localOrigin,
  NEXT_PUBLIC_SITE_URL: config.localOrigin,
  ACCOUNT_TEST_ISOLATED: "1",
  ACCOUNT_DELIVERY_MODE: "test-sink",
  ACCOUNT_TEST_SINK_DIR: resolve(fixtureDir, "sink"),
  AUTH_RATE_LIMIT_SECRET: "medium-fixture-only-secret-".repeat(3),
  NODE_ENV: "test",
  VERCEL: "",
  PRIVILEGED_MFA_MODE: "off"
});
const { PrismaClient } = await import("@prisma/client");
const { assertPortalTestDatabase, createPortalActor } =
  await import("../tests/seed-portal.ts");
const { loginAccount } = await import("../lib/platform/accounts.ts");
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
  viewport: { width: 390, height: 844 }
});
await context.route("**/*", (route) =>
  new URL(route.request().url()).hostname === "127.0.0.1"
    ? route.continue()
    : route.abort()
);
const page = await context.newPage();
const results = [],
  errors = [];
const outbound = [];
const pendingSessionRequests = new Set();
context.setDefaultTimeout(10000);
context.on("request", (request) => {
  outbound.push({ url: request.url(), body: request.postData() ?? "" });
  if (request.url().endsWith("/api/platform/session"))
    pendingSessionRequests.add(request);
});
context.on("requestfinished", (request) =>
  pendingSessionRequests.delete(request)
);
context.on("requestfailed", (request) =>
  pendingSessionRequests.delete(request)
);
context.on("page", (p) => p.on("pageerror", (e) => errors.push(e.message)));
page.on("pageerror", (e) => errors.push(e.message));
const evidenceTag = process.argv[3] ?? "";
assert.match(evidenceTag, /^[a-z0-9-]*$/);
const selectedCase = process.argv[4] ?? "all";
assert.ok(["all", "clock"].includes(selectedCase));
const output =
  fixtureDir +
  "/session-inactivity-browser" +
  (evidenceTag ? "-" + evidenceTag : "");
mkdirSync(output, { recursive: true });
const ok = (message) => {
  results.push(message);
  console.log("PASS " + message);
};
const signIn = async (actor) => {
  await context.clearCookies();
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
const go = async (path, p = page) => {
  const response = await p.goto(config.origin + path);
  assert.equal(response.status(), 200);
};
const fetchIn = (path, body, owner, p = page) =>
  p.evaluate(
    async ({ path, body, owner }) => {
      const response = await fetch(path, {
        method: body ? "POST" : "GET",
        cache: "no-store",
        headers: {
          ...(body ? { "content-type": "application/json" } : {}),
          ...(owner ? { "x-expected-account": owner } : {})
        },
        ...(body ? { body: JSON.stringify(body) } : {})
      });
      return { status: response.status, body: await response.json() };
    },
    { path, body, owner }
  );

const listing = page.getByRole("list", {
  name: "Active sign-ins",
  exact: true
});
const password = () =>
  page.getByLabel("Current password for other sign-ins", { exact: true });
const pulse = (event) =>
  page.evaluate((event) => window.dispatchEvent(new Event(event)), event);
const show = async () => {
  await page
    .getByRole("button", { name: "Show active sign-ins", exact: true })
    .click();
  await listing.waitFor();
};
const absent = async (secret) => {
  await page.waitForFunction(
    () =>
      !document.querySelector(
        'ul[aria-label="Active sign-ins"], #session-current-password'
      )
  );
  if (secret) assert.ok(!(await page.content()).includes(secret));
};
const actors = [];
async function actorWithOther(label) {
  const actor = await createPortalActor(db, label);
  actors.push(actor.id);
  const other = await loginAccount(
    db,
    actor.email,
    actor.password,
    "Mozilla/5.0 (iPhone) Version/18.0 Mobile Safari/604.1"
  );
  return { ...actor, other };
}
const { hashSessionToken } = await import("../lib/platform/auth.ts");
const row = (token) =>
  db.platformSession.findUniqueOrThrow({
    where: { tokenHash: hashSessionToken(token) }
  });
const idle = (token, value) =>
  db.platformSession.update({
    where: { tokenHash: hashSessionToken(token) },
    data: { idleExpiresAt: value }
  });
const statusRead = () =>
  page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/platform/session") &&
      r.request().method() === "GET" &&
      r.status() === 200
  );
const postCount = () =>
  outbound.filter((r) => r.url.endsWith("/api/platform/session") && r.body)
    .length;
const sessionRequestCount = () =>
  outbound.filter((r) => r.url.endsWith("/api/platform/session")).length;
const sessionUrl = config.origin + "/api/platform/session";
const settleSessionRequests = async () => {
  for (let i = 0; i < 100 && pendingSessionRequests.size; i++)
    await page.waitForTimeout(50);
  assert.equal(
    pendingSessionRequests.size,
    0,
    "Finish foreground activity before installing a fixture deadline"
  );
};
const openSessions = async (actor) => {
  await signIn(actor);
  const loaded = statusRead();
  await go("/platform/settings/account/sessions");
  await page.bringToFront();
  await loaded;
  await show();
  await password().fill(actor.password);
  // The show button is deliberate foreground activity. Finish that request
  // before a test installs its own short deadline or snapshots the session.
  await settleSessionRequests();
};
const refreshDeadline = async (token, milliseconds) => {
  await settleSessionRequests();
  const deadline = new Date(Date.now() + milliseconds);
  await idle(token, deadline);
  const refreshed = statusRead();
  await pulse("blur");
  await pulse("focus");
  await refreshed;
  await page.getByText(/Your sign-in ends soon/).waitFor();
  return deadline;
};
const noteEvidence = {};

async function frozenClockRegression() {
  const actor = await actorWithOther("idlesleep");
  await openSessions(actor);
  const deadline = await refreshDeadline(actor.token, 6000);
  await listing.waitFor();
  assert.equal(await password().inputValue(), actor.password);
  const before = postCount();
  await page.evaluate(() => {
    // Model the documented non-Windows sleep behavior without changing real
    // timers or the database clock. No lifecycle event is injected on wake.
    const original = Object.getOwnPropertyDescriptor(performance, "now");
    const frozen = performance.now();
    Object.defineProperty(performance, "now", {
      configurable: true,
      value: () => frozen
    });
    window.__restoreSessionPerformance = () => {
      if (original) Object.defineProperty(performance, "now", original);
      else delete performance.now;
      delete window.__restoreSessionPerformance;
    };
  });
  try {
    await page.waitForTimeout(
      Math.max(0, deadline.getTime() - Date.now() + 500)
    );
    const server = await fetchIn("/api/platform/session", null, actor.id);
    assert.equal(server.status, 401, "The real server must have expired first");
    // Give the already-scheduled deadline callback time to commit its UI, but
    // do not dispatch focus/visibility to make a broken clock check pass.
    await page.waitForTimeout(250);
    const observed = {
      serverStatus: server.status,
      privateControlsVisible: await listing.isVisible(),
      expiredNoticeVisible: await page
        .getByText(/This sign-in has ended/)
        .isVisible(),
      activityPostsBefore: before,
      activityPostsAfter: postCount(),
      realServerDeadline: deadline.toISOString(),
      frozenPerformanceOnly: true,
      lifecycleEventInjected: false
    };
    writeFileSync(
      output + "/frozen-clock-observation.json",
      JSON.stringify(observed, null, 2),
      { mode: 0o600 }
    );
    await page.screenshot({
      path: output + "/frozen-clock-after-expiry.png",
      fullPage: true
    });
    assert.equal(
      observed.privateControlsVisible,
      false,
      "Frozen performance clock must not keep private controls visible past actual server expiry"
    );
    assert.equal(observed.expiredNoticeVisible, true);
    assert.equal(observed.activityPostsAfter, before);
    await absent(actor.password);
    assert.equal(
      (await row(actor.token)).idleExpiresAt.getTime(),
      deadline.getTime()
    );
    ok(
      "A frozen performance clock cannot retain private presentation after real server expiry; wake detection only reads and never renews"
    );
  } finally {
    await page.evaluate(() => window.__restoreSessionPerformance?.());
  }
}

async function nativeBackgroundCheck() {
  const actor = await actorWithOther("idlehidden");
  await openSessions(actor);
  const before = await row(actor.token),
    posts = postCount();
  await page.evaluate(() => {
    window.__sessionNativeBlur = 0;
    window.addEventListener("blur", (event) => {
      if (event.isTrusted) window.__sessionNativeBlur++;
    });
  });
  const otherTab = await context.newPage();
  try {
    await otherTab.bringToFront();
    await page.waitForFunction(() => !document.hasFocus());
    assert.ok(
      await page.evaluate(() => window.__sessionNativeBlur > 0),
      "Exercise a trusted browser blur, not pulse()"
    );
    await absent(actor.password);
    await page.evaluate(() => {
      window.dispatchEvent(new PointerEvent("pointerdown"));
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "a" }));
      window.scrollTo(0, 100);
    });
    await page.waitForTimeout(350);
    assert.equal(postCount(), posts);
    assert.deepEqual(await row(actor.token), before);
    const returned = statusRead();
    await page.bringToFront();
    await returned;
    await listing.waitFor();
    assert.equal(await password().inputValue(), actor.password);
    assert.equal(postCount(), posts);
    assert.deepEqual(await row(actor.token), before);
    ok(
      "A native second-tab blur conceals dirty fields; background events and returning focus only read, preserving the session and original field"
    );
  } finally {
    await otherTab.close();
    await page.bringToFront();
  }
}

async function delayedIdentityCheck() {
  const actor = await actorWithOther("idlelatea"),
    other = await actorWithOther("idlelateb");
  await openSessions(actor);
  const beforeOther = await row(other.token),
    posts = postCount();
  let held = false;
  const captured = Promise.withResolvers(),
    released = Promise.withResolvers();
  const handler = async (route) => {
    if (held || route.request().method() !== "GET") return route.continue();
    held = true;
    let response;
    try {
      response = await route.fetch();
      assert.equal(response.status(), 200);
      assert.equal((await response.json()).owner, actor.id);
      assert.equal(route.request().headers()["x-expected-account"], actor.id);
      captured.resolve();
      await released.promise;
      await route.fulfill({ response });
    } catch (error) {
      captured.reject(error);
      throw error;
    } finally {
      await response?.dispose();
    }
  };
  await page.route(sessionUrl, handler);
  try {
    await pulse("blur");
    await pulse("focus");
    await Promise.race([
      captured.promise,
      page.waitForTimeout(9000).then(() => {
        throw new Error("The delayed session GET was not captured");
      })
    ]);
    await signIn(other);
    released.resolve();
    await page.getByText(/The signed-in account changed/).waitFor();
    await absent(actor.password);
    await page.keyboard.press("Tab");
    await pulse("focus");
    await page.waitForTimeout(250);
    assert.equal(postCount(), posts);
    assert.deepEqual(await row(other.token), beforeOther);
    assert.equal(
      await page
        .getByRole("button", { name: "Recheck this sign-in", exact: true })
        .count(),
      0
    );
    ok(
      "An actual delayed account-A status response followed by account-B cookies cannot adopt B, reveal A or restart activity; reload remains required"
    );
  } finally {
    released.resolve();
    await page.unroute(sessionUrl, handler);
  }
}

async function failedCheckRecovery() {
  const actor = await actorWithOther("idlefailed");
  await openSessions(actor);
  const before = await row(actor.token),
    posts = postCount();
  const fail = (route) =>
    route.request().method() === "GET"
      ? route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ message: "Fictional unavailable check" })
        })
      : route.continue();
  await page.route(sessionUrl, fail);
  try {
    await pulse("blur");
    await pulse("focus");
    await page
      .getByText(/Your sign-in could not be checked\. Your entries stay/)
      .waitFor();
    await absent(actor.password);
  } finally {
    await page.unroute(sessionUrl, fail);
  }
  const requests = sessionRequestCount();
  await pulse("focus");
  await pulse("online");
  await page.evaluate(() => {
    const channel = new BroadcastChannel("platform-session-activity");
    channel.postMessage("activity");
    channel.close();
  });
  await page.keyboard.press("Tab");
  await page.waitForTimeout(300);
  assert.equal(
    sessionRequestCount(),
    requests,
    "A failed check cannot silently restart on focus, online, a tab hint or input"
  );
  assert.equal(postCount(), posts);
  assert.deepEqual(await row(actor.token), before);
  await page
    .getByRole("button", { name: "Recheck this sign-in", exact: true })
    .click();
  await listing.waitFor();
  await page
    .getByText(/Your sign-in could not be checked\. Your entries stay/)
    .waitFor({ state: "hidden" });
  assert.equal(await password().inputValue(), actor.password);
  assert.equal(postCount(), posts);
  assert.deepEqual(await row(actor.token), before);
  ok(
    "A failed status check pauses automatic activity and checks; explicit same-owner recovery reads only and restores the retained dirty entry"
  );
}

async function uncertainCommandRecovery() {
  const owner = await createPortalActor(db, "idle_note_owner"),
    requester = await createPortalActor(db, "idle_note_requester");
  actors.push(owner.id, requester.id);
  // Seed one owned source and grant. Do not replace the fixture's global
  // intake configuration or invoke the broad seedSupport setup.
  const grant = await db.supportCapabilityGrant.create({
    data: { userId: owner.id, capability: "RESPOND" }
  });
  const source = await db.supportCase.create({
    data: {
      requesterId: requester.id,
      ownerGrantId: grant.id,
      ownerGrantVersion: grant.version,
      category: "ACCOUNT_WEBSITE",
      subject: "Fictional session recovery " + randomUUID(),
      description:
        "Isolated source for the existing Admin internal-note retry contract."
    }
  });
  const note = "Private fictional expiry retry note " + randomUUID();
  await signIn(owner);
  const loaded = statusRead();
  await go("/platform/admin/cases/SUPPORT/" + source.id);
  await loaded;
  const form = page.getByRole("form", {
    name: "Save internal note",
    exact: true
  });
  const field = form.getByLabel("Internal note", { exact: true });
  const retry = form.getByRole("button", {
    name: "Retry original action",
    exact: true
  });
  await field.fill(note);
  const attempts = [];
  let receipt;
  const handler = async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    const body = route.request().postData(),
      parsed = JSON.parse(body);
    assert.equal(parsed.operation, "note");
    assert.equal(parsed.sourceId, source.id);
    attempts.push({
      body,
      owner: route.request().headers()["x-expected-account"]
    });
    const response = await route.fetch();
    try {
      assert.equal(response.status(), 200);
      const accepted = await response.json();
      if (attempts.length === 1) {
        receipt = accepted;
        return await route.abort("failed");
      }
      assert.deepEqual(accepted, receipt);
      await route.fulfill({ response });
    } finally {
      await response.dispose();
    }
  };
  const adminUrl = config.origin + "/api/platform/admin";
  await page.route(adminUrl, handler);
  const oneEffect = async () => {
    assert.equal(
      await db.adminCaseNote.count({
        where: { supportCaseId: source.id, body: note }
      }),
      1
    );
    assert.equal(
      await db.adminOperation.count({
        where: { actorId: owner.id, sourceId: source.id, action: "note" }
      }),
      1
    );
    const current = await db.supportCase.findUniqueOrThrow({
      where: { id: source.id }
    });
    assert.equal(current.version, source.version + 1);
    assert.equal(current.adminVersion, source.adminVersion + 1);
  };
  try {
    await form
      .getByRole("button", { name: "Save internal note", exact: true })
      .click();
    await retry.waitFor();
    assert.equal(await field.inputValue(), note);
    assert.equal(await field.isEnabled(), false);
    await oneEffect();
    await refreshDeadline(owner.token, 5000);
    await page.getByText(/This sign-in has ended/).waitFor({ timeout: 12000 });
    await form.waitFor({ state: "hidden" });
    assert.equal(attempts.length, 1);
    await oneEffect();
    const replacement = await loginAccount(
      db,
      owner.email,
      owner.password,
      "Same owner original note recovery"
    );
    await signIn({ ...owner, token: replacement });
    await page
      .getByRole("button", { name: "Recheck this sign-in", exact: true })
      .click();
    await retry.waitFor();
    assert.equal(await field.inputValue(), note);
    assert.equal(await field.isEnabled(), false);
    assert.equal(
      attempts.length,
      1,
      "Reauthentication and passive recheck must not replay the pending command"
    );
    await retry.click();
    await form
      .getByRole("button", { name: "Save internal note", exact: true })
      .waitFor();
    assert.equal(attempts.length, 2);
    assert.equal(attempts[1].body, attempts[0].body);
    assert.ok(attempts.every((attempt) => attempt.owner === owner.id));
    const key = JSON.parse(attempts[0].body).requestKey;
    assert.equal(
      await db.adminOperation.count({
        where: { actorId: owner.id, requestKey: key }
      }),
      1
    );
    await oneEffect();
    assert.equal(await field.inputValue(), "");
    Object.assign(noteEvidence, {
      attempts: 2,
      identicalBodiesAndKey: true,
      effects: 1,
      bodySha256: createHash("sha256").update(attempts[0].body).digest("hex")
    });
    ok(
      "An actually saved Admin note with a lost response survives expiry and same-owner sign-in; only explicit byte-identical retry recovers its one receipt and one effect"
    );
  } finally {
    await page.unroute(adminUrl, handler);
  }
}
try {
  await frozenClockRegression();
  if (selectedCase === "all") {
    await nativeBackgroundCheck();
    await delayedIdentityCheck();
    await failedCheckRecovery();
    await uncertainCommandRecovery();
    const actor = await actorWithOther("idlebrowser");
    await signIn(actor);
    const initial = await row(actor.token);
    const initialPosts = postCount();
    const loaded = statusRead();
    await go("/platform/settings/account/sessions");
    await page.bringToFront();
    await loaded;
    await page.waitForTimeout(150);
    for (let i = 0; i < 3; i++)
      assert.equal(
        (await fetchIn("/api/platform/session", null, actor.id)).status,
        200
      );
    await page.evaluate(() => {
      window.dispatchEvent(new PointerEvent("pointerdown"));
      window.scrollTo(0, 100);
    });
    await page.waitForTimeout(150);
    assert.equal(postCount(), initialPosts);
    assert.deepEqual(await row(actor.token), initial);
    ok(
      "Actual HTTPS status, identity, passive reads and synthetic/programmatic events do not renew the session"
    );

    const activity = page.waitForResponse(
      (r) =>
        r.url().endsWith("/api/platform/session") &&
        r.request().method() === "POST"
    );
    await page.keyboard.press("Tab");
    assert.equal((await activity).status(), 200);
    const renewed = await row(actor.token);
    assert.ok(renewed.idleExpiresAt > initial.idleExpiresAt);
    assert.equal(renewed.expiresAt.getTime(), initial.expiresAt.getTime());
    for (let i = 0; i < 5; i++) await page.keyboard.press("Tab");
    await page.waitForTimeout(100);
    assert.equal(postCount(), initialPosts + 1);
    ok(
      "Trusted foreground interaction renews once; repeated input is throttled and the absolute expiry is unchanged"
    );

    await show();
    await password().fill(actor.password);
    const soon = new Date(Date.now() + 4000);
    await idle(actor.token, soon);
    const refreshed = statusRead();
    await pulse("blur");
    await pulse("focus");
    await refreshed;
    await page.getByText(/Your sign-in ends soon/).waitFor();
    await page.screenshot({
      path: output + "/idle-warning-390.png",
      fullPage: true
    });
    await page.getByText(/This sign-in has ended/).waitFor({ timeout: 12000 });
    await absent(actor.password);
    assert.equal(postCount(), initialPosts + 1);
    const expiredResponse = await fetchIn(
      "/api/platform/session",
      { activity: "foreground" },
      actor.id
    );
    assert.equal(expiredResponse.status, 401);
    assert.equal(
      (await row(actor.token)).idleExpiresAt.getTime(),
      soon.getTime()
    );
    ok(
      "Actual server deadline expires without background keepalive, conceals private controls and rejects attempted resurrection"
    );

    const replacement = await loginAccount(
      db,
      actor.email,
      actor.password,
      "Same owner recovery"
    );
    await signIn({ ...actor, token: replacement });
    await page
      .getByRole("button", { name: "Recheck this sign-in", exact: true })
      .click();
    await listing.waitFor();
    assert.equal(await password().inputValue(), actor.password);
    assert.equal(await page.getByText(/This sign-in has ended/).count(), 0);
    ok(
      "Same-owner fresh sign-in and explicit passive recheck restore the original dirty entry without unmounting its owner"
    );

    const other = await actorWithOther("idlechanged");
    await signIn(other);
    await pulse("blur");
    await pulse("focus");
    await page.getByText(/The signed-in account changed/).waitFor();
    await absent(actor.password);
    const changedBefore = await row(other.token);
    await page.keyboard.press("Tab");
    await page.waitForTimeout(150);
    assert.deepEqual(await row(other.token), changedBefore);
    ok(
      "A retained page cannot adopt or renew a replacement account and keeps its old private fields concealed"
    );

    const legacy = await actorWithOther("idlelegacy");
    await idle(legacy.token, null);
    await signIn(legacy);
    const legacyRead = statusRead();
    await go("/platform/settings/account/sessions");
    await legacyRead;
    await page
      .getByText(
        /This existing sign-in keeps its current expiration until you interact/
      )
      .waitFor();
    assert.equal((await row(legacy.token)).idleExpiresAt, null);
    const legacyActivity = page.waitForResponse(
      (r) =>
        r.url().endsWith("/api/platform/session") &&
        r.request().method() === "POST"
    );
    await page.keyboard.press("Tab");
    assert.equal((await legacyActivity).status(), 200);
    assert.ok((await row(legacy.token)).idleExpiresAt);
    ok(
      "Legacy status reads preserve the old expiry; the first deliberate interaction adopts the separate idle deadline"
    );

    await idle(legacy.token, new Date(Date.now() + 3000));
    const last = statusRead();
    await pulse("blur");
    await pulse("focus");
    await last;
    await page.getByText(/This sign-in has ended/).waitFor({ timeout: 12000 });
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      await page.evaluate(() => {
        document.documentElement.style.fontSize = "32px";
      });
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1
        )
      );
      await page.screenshot({
        path: output + "/idle-expired-" + width + ".png",
        fullPage: true
      });
      await page.evaluate(() => {
        document.documentElement.style.fontSize = "";
      });
    }
    const stored = await page.evaluate(() =>
      JSON.stringify({
        local: { ...localStorage },
        session: { ...sessionStorage },
        history: history.state,
        url: location.href
      })
    );
    for (const secret of [
      actor.password,
      actor.token,
      replacement,
      other.token,
      legacy.token
    ])
      assert.ok(!stored.includes(secret));
    assert.deepEqual(errors, []);
    ok(
      "Expired-state recovery fits narrow enlarged layouts and adds none of the checked passwords or session tokens to browser storage, history or URL"
    );
  }
  assert.deepEqual(errors, []);
  writeFileSync(
    output + "/receipt.json",
    JSON.stringify(
      {
        at: new Date().toISOString(),
        source: execFileSync("git", ["rev-parse", "HEAD"], {
          encoding: "utf8"
        }).trim(),
        results,
        selectedCase,
        uncertainCommand: noteEvidence,
        errors,
        actorIds: actors,
        syntheticShortDeadlines: true,
        realThirtyMinuteWait: false,
        frozenPerformanceSimulation: true,
        physicalSleepTested: false,
        productionWrites: 0,
        externalSends: 0
      },
      null,
      2
    ),
    { mode: 0o600 }
  );
  console.log("SESSION_INACTIVITY_BROWSER_PASS " + results.length);
} catch (error) {
  writeFileSync(
    output + "/failure-" + Date.now() + ".json",
    JSON.stringify(
      { at: new Date().toISOString(), results, errors, error: String(error) },
      null,
      2
    ),
    { mode: 0o600 }
  );
  throw error;
} finally {
  await browser.close();
  await db.$disconnect();
}
