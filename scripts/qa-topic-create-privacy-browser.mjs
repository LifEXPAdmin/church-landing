import { request as httpsRequest } from "node:https";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { sessionCookieFixtureName } from "./session-cookie-fixture.mjs";
const fixtureDir = process.argv[2];
assert.ok(fixtureDir, "Pass the isolated fixture directory");
const config = JSON.parse(
  readFileSync(fixtureDir + "/browser-env.json", "utf8")
);
assert.match(config.origin, /^https:\/\/127\.0\.0\.1:\d+$/);
assert.equal(new URL(config.database).hostname, "127.0.0.1");
Object.assign(process.env, {
  DATABASE_URL: config.database,
  DIRECT_URL: config.database,
  ACCOUNT_ORIGIN: config.origin,
  NEXT_PUBLIC_SITE_URL: config.origin,
  NODE_ENV: "test",
  VERCEL: "",
  ACCOUNT_TEST_ISOLATED: "1",
  ACCOUNT_DELIVERY_MODE: "test-sink",
  ACCOUNT_TEST_SINK_DIR: process.cwd() + "/" + fixtureDir + "/sink",
  AUTH_RATE_LIMIT_SECRET: "medium-fixture-only-secret-".repeat(3),
  PRIVILEGED_MFA_MODE: "off"
});
const { PrismaClient } = await import("@prisma/client");
const { assertPortalTestDatabase } = await import("../tests/seed-portal.ts");
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
  headless: process.env.TOPIC_PRIVACY_HEADFUL !== "1",
  executablePath:
    process.env.CHROMIUM_PATH ??
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  args: [
    "--ignore-certificate-errors-spki-list=" +
      createHash("sha256").update(der).digest("base64")
  ]
});
const context = await browser.newContext({
  viewport: { width: 390, height: 844 }
});
const output = fixtureDir + "/topic-create-privacy-browser-" + Date.now();
mkdirSync(output, { recursive: true });
const external = [],
  errors = [],
  results = [],
  startedAt = new Date().toISOString();
await context.route(
  (url) => url.origin !== config.origin,
  (route) => {
    external.push(route.request().url());
    return route.abort();
  }
);
const page = await context.newPage();
page.setDefaultTimeout(20000);
page.on("pageerror", (error) => errors.push(error.message));
const ok = (message) => {
  results.push(message);
  console.log("PASS " + message);
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
  const r = await page.goto(config.origin + path);
  assert.equal(r.status(), 200);
};

const { registerAccount, loginAccount } =
  await import("../lib/platform/accounts.ts");
const { ADULT_POLICY } = await import("../lib/platform/portal-types.ts");
const { topicCommand } = await import("../lib/platform/topic-communities.ts");
const { privilegedAuthenticatorCommand } =
  await import("../lib/platform/privileged-auth.ts");
const { openAuthenticator, authenticatorTotp } =
  await import("../lib/platform/admin-authenticator-crypto.ts");
const routeErrors = [],
  scenarios = [],
  actors = [];
const pendingRouteReleases = new Set();
const button = (name) => page.getByRole("button", { name, exact: true });
const topicUrl = (url) => url.pathname === "/api/platform/topics";
const identityUrl = (url) =>
  url.pathname === "/api/platform/profile" &&
  url.searchParams.get("view") === "identity";
const poll = async (read, expected) => {
  for (let i = 0; i < 200; i++) {
    const value = await read();
    if (value === expected) return;
    await new Promise((r) => setTimeout(r, 50));
  }
  assert.equal(await read(), expected);
};
async function actor(label) {
  const tag = randomUUID().replaceAll("-", "").slice(0, 10),
    username = "tr_" + label.slice(0, 8) + "_" + tag,
    password = "Fictional-only-" + randomUUID();
  const made = await registerAccount(db, {
    name: "Fictional topic " + label + " " + tag,
    username,
    email: username + "@example.test",
    password,
    confirmPassword: password,
    role: "BELIEVER"
  });
  await db.platformUser.update({
    where: { id: made.id },
    data: {
      emailVerifiedAt: new Date(),
      adultAcknowledgedAt: new Date(),
      adultPolicyVersion: ADULT_POLICY,
      metricExcluded: true
    }
  });
  const token = await loginAccount(
    db,
    username + "@example.test",
    password,
    "topic-recovery-" + tag
  );
  actors.push(made.id);
  return { id: made.id, token, password };
}
async function challenge(a) {
  process.env.PRIVILEGED_MFA_MODE = "enforce";
  let factor = await db.adminAuthenticator.findUnique({
    where: { userId: a.id }
  });
  if (!factor) {
    await privilegedAuthenticatorCommand(
      db,
      a.token,
      { operation: "mfa-start", requestKey: randomUUID(), expectedVersion: 0 },
      a.password
    );
    factor = await db.adminAuthenticator.findUniqueOrThrow({
      where: { userId: a.id }
    });
    const secret = openAuthenticator(a.id, factor.secretCiphertext),
      counter = BigInt(Math.floor(Date.now() / 30000));
    await privilegedAuthenticatorCommand(db, a.token, {
      operation: "mfa-confirm",
      requestKey: randomUUID(),
      expectedVersion: factor.version,
      code: authenticatorTotp(secret, counter - 1n)
    });
    factor = await db.adminAuthenticator.findUniqueOrThrow({
      where: { userId: a.id }
    });
  }
  const current = BigInt(Math.floor(Date.now() / 30000)),
    counter = current > factor.lastCounter ? current : factor.lastCounter + 1n;
  assert.ok(
    counter <= current + 1n,
    "Use only a currently valid fictional authenticator code"
  );
  await privilegedAuthenticatorCommand(db, a.token, {
    operation: "mfa-challenge",
    requestKey: randomUUID(),
    expectedVersion: factor.version,
    purpose: "change-access",
    code: authenticatorTotp(
      openAuthenticator(a.id, factor.secretCiphertext),
      counter
    )
  });
}
async function formFor(a) {
  await signIn(a);
  await go("/platform/topics/new");
  const form = page.getByRole("form", {
    name: "Create public topic",
    exact: true
  });
  const tag = randomUUID().slice(0, 8),
    slug = "retry-" + tag;
  await form
    .getByLabel("Community name", { exact: true })
    .fill("Fictional retry " + tag);
  await form.getByLabel("Topic address", { exact: true }).fill(slug);
  await form
    .getByLabel("What is this community about?", { exact: true })
    .fill("Fictional original request recovery.");
  await form
    .getByLabel("Community rules", { exact: true })
    .fill("Respect one another and protect private information.");
  await form
    .getByLabel(
      "I understand the topic, its posts and its rules will be public. I accept responsibility for managing this community.",
      { exact: true }
    )
    .check();
  return { form, slug };
}
async function start(form) {
  await form
    .getByRole("button", { name: "Create public topic", exact: true })
    .click();
}
async function retry() {
  const direct = button("Retry the same topic request");
  if (await direct.isVisible()) await direct.click();
  else await button("Confirm original request").click();
}
async function waitMessage(text) {
  await page.getByRole("status").filter({ hasText: text }).first().waitFor();
}
async function intercept(handler) {
  await page.route(topicUrl, async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    try {
      await handler(route);
    } catch (error) {
      routeErrors.push(error.message);
      await route.abort().catch(() => {});
    }
  });
}
async function counts(a, slug) {
  const topic = await db.topicCommunity.findUniqueOrThrow({ where: { slug } });
  assert.equal(topic.ownerId, a.id);
  return {
    topics: await db.topicCommunity.count({ where: { ownerId: a.id } }),
    createdAudits: await db.topicAudit.count({
      where: { communityId: topic.id, action: "CREATED" }
    }),
    receipts: await db.socialOperation.count({
      where: { ownerId: a.id, key: { startsWith: "topic:" } }
    })
  };
}
async function saved(slug) {
  await page.waitForURL(config.origin + "/platform/topics/" + slug, {
    waitUntil: "commit"
  });
  await page.getByRole("heading", { level: 1 }).waitFor();
}
async function cancelStop() {
  page.once("dialog", async (dialog) => {
    assert.match(dialog.message(), /may already be saved/);
    await dialog.dismiss();
  });
  await button("Stop retrying and reload current information").click();
}

async function forwarded(route) {
  const request = route.request(),
    url = new URL(request.url());
  assert.equal(url.origin, config.origin);
  const headers = { ...(await request.allHeaders()) };
  delete headers["accept-encoding"];
  return new Promise((resolveResponse, reject) => {
    const outgoing = httpsRequest(
      url,
      {
        method: request.method(),
        headers,
        ca: readFileSync(config.certificate),
        agent: false,
        timeout: 20000
      },
      (incoming) => {
        const chunks = [];
        incoming.on("data", (chunk) => chunks.push(chunk));
        incoming.on("error", reject);
        incoming.on("end", () => {
          const responseHeaders = Object.fromEntries(
            Object.entries(incoming.headers)
              .filter(
                ([name]) =>
                  ![
                    "connection",
                    "transfer-encoding",
                    "content-length"
                  ].includes(name)
              )
              .map(([name, value]) => [
                name,
                Array.isArray(value) ? value.join(", ") : String(value)
              ])
          );
          resolveResponse({
            status: incoming.statusCode,
            headers: responseHeaders,
            body: Buffer.concat(chunks)
          });
        });
      }
    );
    outgoing.on("timeout", () =>
      outgoing.destroy(new Error("Local forwarded response timeout"))
    );
    outgoing.on("error", reject);
    outgoing.end(request.postDataBuffer() ?? undefined);
  });
}
const pulse = (name) =>
  page.evaluate((n) => window.dispatchEvent(new Event(n)), name);
const formSelector = 'form[aria-label="Create public topic"]';
const values = () =>
  page
    .locator(formSelector + " input," + formSelector + " textarea")
    .evaluateAll((es) =>
      es.map((e) => ({ name: e.name, value: e.value, checked: e.checked }))
    );
async function absent() {
  await poll(() => page.locator(formSelector).count(), 0);
  assert.equal(await page.locator('textarea,input[name="slug"]').count(), 0);
}
async function resume() {
  await page
    .getByRole("main")
    .getByRole("button", { name: "Recheck current access", exact: true })
    .click();
  await page.locator(formSelector).waitFor();
}
async function refreshAs(owner) {
  await signIn(owner);
  const completed = Promise.withResolvers();
  let handled = false;
  const match = (u) => u.pathname === "/platform/topics/new";
  const handler = async (route) => {
    if (handled || route.request().headers().rsc !== "1")
      return route.fallback();
    handled = true;
    try {
      const r = await forwarded(route);
      assert.equal(r.status, 200);
      assert.match(r.headers["content-type"], /text\/x-component/);
      assert.ok(
        r.body.toString("utf8").includes(owner.id),
        "RSC must identify the actual cookie owner"
      );
      await route.fulfill(r);
      completed.resolve({
        owner: owner.id,
        bytes: r.body.length,
        sha256: createHash("sha256").update(r.body).digest("hex")
      });
    } catch (e) {
      routeErrors.push(e.message);
      await route.abort();
      completed.reject(e);
    }
  };
  await page.route(match, handler);
  try {
    await page.evaluate(() => {
      if (typeof window.next?.router?.refresh !== "function")
        throw Error("Actual Next router required");
      window.next.router.refresh();
    });
    const receipt = await completed.promise;
    scenarios.push({ name: "actual-owner-rsc", ...receipt });
  } finally {
    await page.unroute(match, handler);
  }
}
try {
  const a = await actor("privacy"),
    b = await actor("other");
  let { form, slug } = await formFor(a);
  const draft = await values();
  const html = await context.request.get(
    config.origin + "/platform/topics/new"
  );
  assert.equal(html.status(), 200);
  assert.ok(
    !/<form[^>]+aria-label="Create public topic"/.test(await html.text()),
    "Create controls are not serialized into initial private HTML"
  );
  assert.equal(draft.find((e) => e.name === "acceptedRules").checked, true);
  for (const event of ["blur", "pagehide", "offline"]) {
    await pulse(event);
    await absent();
    await resume();
    assert.deepEqual(await values(), draft);
  }
  ok(
    "Initial HTML excludes private create controls; text, rules, address and acceptance survive blur, pagehide and offline with zero concealed form elements"
  );
  if (process.env.TOPIC_PRIVACY_HEADFUL === "1") {
    const background = await context.newPage();
    await background.goto("about:blank");
    await background.bringToFront();
    await poll(() => page.evaluate(() => document.visibilityState), "hidden");
    await absent();
    await page.bringToFront();
    await page.locator(formSelector).waitFor();
    assert.deepEqual(await values(), draft);
    await background.close();
    scenarios.push({
      name: "native-browser-tab-concealment",
      passed: true,
      physicalDevice: false
    });
  }
  await pulse("blur");
  await absent();
  let identityAttempts = 0;
  const unavailable = async (route) => {
    identityAttempts++;
    await route.fulfill({
      status: 503,
      json: { message: "Fictional unavailable identity" }
    });
  };
  await page.route(identityUrl, unavailable);
  await page
    .getByRole("main")
    .getByRole("button", { name: "Recheck current access", exact: true })
    .click();
  await poll(() => identityAttempts > 0, true);
  await page
    .getByRole("status")
    .filter({ hasText: "Your sign-in could not be checked" })
    .first()
    .waitFor();
  await absent();
  await page.unroute(identityUrl, unavailable);
  await resume();
  assert.deepEqual(await values(), draft);
  ok(
    "Unavailable identity and native tab concealment preserve drafts without rendering private controls or saving"
  );
  const documentId = randomUUID();
  await page.evaluate(
    (x) => (window.__topicCreatePrivacyDocument = x),
    documentId
  );
  let writes = 0;
  const watch = (r) => {
    if (
      new URL(r.url()).pathname === "/api/platform/topics" &&
      r.method() === "POST"
    )
      writes++;
  };
  page.on("request", watch);
  await refreshAs(b);
  await page
    .getByText(
      "This topic draft belongs to the account that opened it. Return to that account to continue, or reload to start with the current account.",
      { exact: true }
    )
    .waitFor();
  await absent();
  await refreshAs(a);
  await page.locator(formSelector).waitFor();
  assert.deepEqual(await values(), draft);
  assert.equal(
    await page.evaluate(() => window.__topicCreatePrivacyDocument),
    documentId
  );
  assert.equal(writes, 0);
  page.off("request", watch);
  assert.equal(await db.topicCommunity.count({ where: { ownerId: a.id } }), 0);
  ok(
    "Actual A-to-B-to-A RSC refresh keeps the same document and restores the original complete draft without a save"
  );
  const eligibility = (u) =>
    u.pathname === "/api/platform/topics" &&
    u.searchParams.get("view") === "eligibility";
  let reads = 0,
    readReady = false,
    readDone = false,
    releaseRead;
  const hold = new Promise((r) => (releaseRead = r));
  pendingRouteReleases.add(releaseRead);
  await page.route(eligibility, async (route) => {
    reads++;
    if (reads !== 1) return route.fallback();
    try {
      const r = await forwarded(route);
      assert.equal(r.status, 200);
      readReady = true;
      await hold;
      await route.fulfill(r);
    } catch (e) {
      routeErrors.push(e.message);
      await route.abort();
    } finally {
      readDone = true;
    }
  });
  await pulse("focus");
  await poll(() => readReady, true);
  await pulse("focus");
  await pulse("blur");
  await absent();
  releaseRead();
  await poll(() => readDone, true);
  await page.waitForTimeout(300);
  await absent();
  assert.equal(reads, 1, "Concealment cancels the queued recheck");
  await resume();
  assert.deepEqual(await values(), draft);
  assert.equal(reads, 2);
  pendingRouteReleases.delete(releaseRead);
  await page.unroute(eligibility);
  ok(
    "A queued access read cannot restart or reveal after concealment; explicit current access restores the same draft"
  );
  for (const [width, size] of [
    [390, "100%"],
    [320, "100%"],
    [320, "200%"]
  ]) {
    await page.setViewportSize({ width, height: 844 });
    await page.evaluate(
      (s) => (document.documentElement.style.fontSize = s),
      size
    );
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1
      )
    );
    await page.screenshot({
      path: output + "/draft-" + width + "-" + size.replace("%", "") + ".png",
      fullPage: true
    });
  }
  await page.evaluate(() => (document.documentElement.style.fontSize = "100%"));
  await page
    .getByRole("navigation", { name: "Topic navigation" })
    .getByRole("link", { name: "Discover topics", exact: true })
    .focus();
  await page.keyboard.press("Enter");
  await page
    .getByRole("dialog", { name: "Keep your unsaved changes?", exact: true })
    .waitFor();
  await button("Keep editing").click();
  assert.deepEqual(await values(), draft);
  await pulse("blur");
  await absent();
  page.once("dialog", async (d) => {
    assert.match(d.message(), /may already be saved/);
    await d.dismiss();
  });
  await button("Reload current information").click();
  await absent();
  await resume();
  assert.deepEqual(await values(), draft);
  ok(
    "Retained draft fits 390px/320px/200% text; keyboard navigation and concealed reload warn before discarding it"
  );
  const focused = await actor("focused");
  await challenge(focused);
  ({ form, slug } = await formFor(focused));
  const focusedDraft = await values();
  let focusedPosts = 0;
  const focusedObserver = (request) => {
    if (
      new URL(request.url()).pathname === "/api/platform/topics" &&
      request.method() === "POST"
    )
      focusedPosts++;
  };
  page.on("request", focusedObserver);
  await signIn(b);
  await start(form);
  await absent();
  assert.equal(focusedPosts, 0);
  await signIn(focused);
  await resume();
  assert.deepEqual(await values(), focusedDraft);
  await button("Retry the same topic request").waitFor();
  await retry();
  await saved(slug);
  assert.equal(focusedPosts, 1);
  page.off("request", focusedObserver);
  assert.deepEqual(await counts(focused, slug), {
    topics: 1,
    createdAudits: 1,
    receipts: 1
  });
  ok(
    "A focused account denial conceals controls, preserves the original draft/request and requires explicit retry by its original account"
  );
  const late = await actor("late");
  await challenge(late);
  ({ form, slug } = await formFor(late));
  let committed = false,
    posts = 0,
    identityHeld = false,
    identityDone = false,
    ready = false,
    releaseIdentity;
  const held = new Promise((r) => (releaseIdentity = r));
  pendingRouteReleases.add(releaseIdentity);
  await intercept(async (route) => {
    posts++;
    const r = await forwarded(route);
    assert.ok([200, 202].includes(r.status));
    committed = true;
    await route.fulfill(r);
  });
  await page.route(identityUrl, async (route) => {
    if (
      !committed ||
      identityHeld ||
      (await button("Continue after saved topic change").count()) !== 1
    )
      return route.fallback();
    identityHeld = true;
    try {
      const r = await forwarded(route);
      assert.equal(r.status, 200);
      assert.equal(JSON.parse(r.body.toString("utf8")).id, late.id);
      ready = true;
      await held;
      await route.fulfill(r);
    } catch (e) {
      routeErrors.push(e.message);
      await route.abort();
    } finally {
      identityDone = true;
    }
  });
  await start(form);
  await poll(() => ready, true);
  await pulse("blur");
  await absent();
  releaseIdentity();
  await poll(() => identityDone, true);
  await page.waitForTimeout(300);
  assert.equal(new URL(page.url()).pathname, "/platform/topics/new");
  await absent();
  assert.equal(posts, 1);
  await resume();
  await button("Continue after saved topic change").click();
  await saved(slug);
  assert.equal(posts, 1);
  assert.deepEqual(await counts(late, slug), {
    topics: 1,
    createdAudits: 1,
    receipts: 1
  });
  pendingRouteReleases.delete(releaseIdentity);
  await page.unroute(identityUrl);
  await page.unroute(topicUrl);
  ok(
    "A late accepted same-owner reply stays concealed and requires explicit continuation without another POST"
  );
  const uncertain = await actor("uncertain");
  await challenge(uncertain);
  ({ form, slug } = await formFor(uncertain));
  const originalDraft = await values(),
    bodies = [];
  let lost = false;
  await intercept(async (route) => {
    bodies.push(route.request().postData());
    const r = await forwarded(route);
    assert.ok([200, 202].includes(r.status));
    if (!lost) {
      lost = true;
      await route.abort("failed");
    } else await route.fulfill(r);
  });
  await start(form);
  await poll(() => lost, true);
  await button("Retry the same topic request").waitFor();
  await poll(() => button("Retry the same topic request").isEnabled(), true);
  const uncertainDoc = randomUUID();
  await page.evaluate(
    (x) => (window.__topicCreatePrivacyDocument = x),
    uncertainDoc
  );
  await refreshAs(b);
  await page
    .getByText(
      "This topic draft belongs to the account that opened it. Return to that account to continue, or reload to start with the current account.",
      { exact: true }
    )
    .waitFor();
  await absent();
  assert.equal(bodies.length, 1);
  await refreshAs(uncertain);
  await button("Retry the same topic request").waitFor();
  assert.deepEqual(await values(), originalDraft);
  assert.equal(
    await page.evaluate(() => window.__topicCreatePrivacyDocument),
    uncertainDoc
  );
  assert.equal(bodies.length, 1);
  await retry();
  await saved(slug);
  assert.equal(bodies.length, 2);
  assert.equal(new Set(bodies).size, 1);
  assert.deepEqual(await counts(uncertain, slug), {
    topics: 1,
    createdAudits: 1,
    receipts: 1
  });
  await page.unroute(topicUrl);
  ok(
    "Committed lost reply survives actual account-changing refresh and retries identical bytes once with one topic, audit and receipt"
  );
  await signIn(null);
  await go("/platform/topics/new");
  await page
    .getByRole("link", {
      name: "Create an account to participate",
      exact: true
    })
    .waitFor();
  assert.equal(await page.locator(formSelector).count(), 0);
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
  assert.deepEqual(routeErrors, []);
  ok(
    "Guest creation remains an account-entry surface with no private draft controls or automatic writes"
  );
  const receipt = {
    source: execFileSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8"
    }).trim(),
    buildId: readFileSync(".next/BUILD_ID", "utf8").trim(),
    startedAt,
    finishedAt: new Date().toISOString(),
    results,
    scenarios,
    actors,
    errors,
    external,
    routeErrors,
    productionWrites: 0,
    externalSends: 0,
    globalLimiterReset: false
  };
  writeFileSync(output + "/receipt.json", JSON.stringify(receipt, null, 2));
  console.log(
    JSON.stringify({
      passed: results.length,
      output,
      productionWrites: 0,
      errors,
      external,
      routeErrors
    })
  );
} catch (error) {
  writeFileSync(
    output + "/failure.json",
    JSON.stringify(
      {
        at: new Date().toISOString(),
        error: error.stack,
        results,
        scenarios,
        actors,
        errors,
        external,
        routeErrors
      },
      null,
      2
    )
  );
  throw error;
} finally {
  for (const release of pendingRouteReleases) release();
  await page.unrouteAll({ behavior: "wait" }).catch(() => {});
  await context.close();
  await browser.close();
  await db.$disconnect();
}
