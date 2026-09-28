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
const output = fixtureDir + "/topic-management-privacy-browser-" + Date.now();
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
  writeFileSync(
    output + "/progress.json",
    JSON.stringify(
      { at: new Date().toISOString(), results, scenarios },
      null,
      2
    )
  );
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
async function refreshAs(owner) {
  await signIn(owner);
  const completed = Promise.withResolvers();
  const requests = [];
  const observe = (r) =>
    requests.push({
      path: new URL(r.url()).pathname,
      rsc: r.headers().rsc ?? null,
      method: r.method()
    });
  page.on("request", observe);
  let handled = false;
  let phase = "awaiting RSC request";
  const match = (u) => u.pathname === managementPath;
  const handler = async (route) => {
    if (handled || route.request().headers().rsc !== "1")
      return route.fallback();
    handled = true;
    phase = "forwarding RSC";
    try {
      const r = await forwarded(route);
      assert.equal(r.status, 200);
      assert.match(r.headers["content-type"], /text\/x-component/);
      assert.ok(
        r.body.toString("utf8").includes(owner.id),
        "RSC must identify the actual cookie owner"
      );
      for (const marker of privateMarkers)
        assert.equal(
          r.body.toString("utf8").includes(marker),
          false,
          "Private management data must not enter RSC"
        );
      phase = "fulfilling RSC";
      await route.fulfill(r);
      phase = "RSC fulfilled";
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
    let timer;
    const receipt = await Promise.race([
      completed.promise,
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(Error("Account refresh did not settle: " + phase)),
          25000
        );
      })
    ]).finally(() => clearTimeout(timer));
    scenarios.push({ name: "actual-owner-rsc", ...receipt });
  } finally {
    writeFileSync(
      output + "/refresh-" + owner.id + ".json",
      JSON.stringify(
        { at: new Date().toISOString(), phase, requests, url: page.url() },
        null,
        2
      )
    );
    page.off("request", observe);
    await page.unroute(match, handler);
  }
}
const { topicCommand } = await import("../lib/platform/topic-communities.ts");
let managementPath;
let privateMarkers = [];
const main = page.getByRole("main");
const edit = () =>
  main.getByRole("form", { name: "Save topic details", exact: true });
const managementUrl = (u) =>
  topicUrl(u) && u.searchParams.get("view") === "management";
let topicPosts = 0;
page.on("request", (request) => {
  if (
    new URL(request.url()).pathname === "/api/platform/topics" &&
    request.method() === "POST"
  )
    topicPosts++;
});
async function setup(label, state) {
  process.env.PRIVILEGED_MFA_MODE = "off";
  const a = await actor(label),
    m = await actor(label + "member"),
    tag = randomUUID().slice(0, 8);
  const topic = await topicCommand(db, a.token, {
    operation: "create",
    mutationId: randomUUID(),
    name: "Private management " + tag,
    slug: "manage-" + tag,
    description: "Fictional private management.",
    rules: "Respect one another.",
    acceptedRules: true
  });
  await topicCommand(db, m.token, {
    operation: "join",
    communityId: topic.id,
    mutationId: randomUUID(),
    desired: true,
    expectedVersion: 0,
    rulesVersion: 1,
    acceptedRules: true
  });
  if (state === "ARCHIVED")
    await db.topicCommunity.update({
      where: { id: topic.id },
      data: { lifecycle: "ARCHIVED", version: { increment: 1 } }
    });
  if (state === "HIDDEN")
    await db.topicCommunity.update({
      where: { id: topic.id },
      data: { moderationState: "HIDDEN", version: { increment: 1 } }
    });
  if (state === "RECOVERY")
    await db.topicCommunity.update({
      where: { id: topic.id },
      data: { recoveryRequired: true, version: { increment: 1 } }
    });
  if (state === "MODERATOR")
    await db.topicMembership.update({
      where: { communityId_userId: { communityId: topic.id, userId: m.id } },
      data: { moderator: true, version: { increment: 1 } }
    });
  const member = await db.platformUser.findUniqueOrThrow({
    where: { id: m.id }
  });
  managementPath = "/platform/topics/manage-" + tag + "/manage";
  privateMarkers = [member.name, "Private management " + tag];
  await challenge(a);
  await signIn(a);
  const response = await page.goto(config.origin + managementPath);
  assert.equal(response.status(), 200);
  const html = await response.text();
  assert.equal(html.includes(member.name), false);
  assert.equal(html.includes("Private management " + tag), false);
  if (state === "RECOVERY")
    await main
      .getByText(/Protected recovery requires current ownership verification/)
      .waitFor();
  else {
    await main
      .getByText("Edit topic details and rules", { exact: true })
      .click();
    await edit().waitFor();
  }
  return { a, m, member, topic, tag };
}
async function draft(tag) {
  await edit()
    .getByLabel("Community name", { exact: true })
    .fill("Unsaved name " + tag);
  await edit()
    .getByLabel("What is this community about?", { exact: true })
    .fill("Unsaved description " + tag);
  await edit()
    .getByLabel("Community rules", { exact: true })
    .fill("Unsaved rules " + tag);
  await main.getByText("Archive this topic", { exact: true }).click();
  await main
    .getByLabel("I confirm this topic visibility change.", { exact: true })
    .check();
  await main.getByText("Role and ownership offers", { exact: true }).click();
  await main.getByLabel("Role to offer", { exact: true }).selectOption("OWNER");
  await main
    .getByLabel("I intend to offer this responsibility to this member.", {
      exact: true
    })
    .check();
  await main.getByText("Restrict participation", { exact: true }).click();
  await main.getByLabel("Reason", { exact: true }).selectOption("RULES");
  await main
    .getByLabel("I confirm this participation change.", { exact: true })
    .check();
}
const fieldValues = () =>
  main.locator("form input,form textarea,form select").evaluateAll((es) =>
    es.map((e) => ({
      name: e.name,
      value: e.value,
      checked: e.checked ?? null
    }))
  );
async function privateAbsent(marker) {
  await poll(
    () => main.locator("form input,form textarea,form select").count(),
    0
  );
  assert.equal((await page.content()).includes(marker), false);
  assert.equal(
    await main
      .getByRole("heading", { name: "Management history", exact: true })
      .count(),
    0
  );
  assert.equal(await main.locator('a[href*="/platform/profile/"]').count(), 0);
}
async function recheck() {
  await main
    .getByRole("button", { name: "Recheck current access", exact: true })
    .click();
}
async function originalRetry() {
  const recovery = main.getByRole("button", {
    name: "Confirm original request",
    exact: true
  });
  if (await recovery.isVisible()) await recovery.click();
  else
    await main
      .getByRole("button", {
        name: "Retry the same topic request",
        exact: true
      })
      .click();
}
try {
  const first = await setup("privacy"),
    other = await actor("alternate");
  await draft(first.tag);
  const expected = await fieldValues(),
    before = topicPosts;
  for (const event of ["blur", "pagehide", "offline"]) {
    await pulse(event);
    await privateAbsent(first.member.name);
    await pulse(event === "pagehide" ? "pageshow" : "focus");
    await edit().waitFor();
    assert.deepEqual(await fieldValues(), expected);
  }
  assert.equal(topicPosts, before);
  ok(
    "Authorized initial HTML omits management data; all text, selects, consent and disclosure state survive concealment with no private DOM or writes"
  );
  const documentId = randomUUID();
  await page.evaluate(
    (id) => (window.__topicManagementDocument = id),
    documentId
  );
  await refreshAs(other);
  await privateAbsent(first.member.name);
  assert.equal(
    await page.evaluate(() => window.__topicManagementDocument),
    documentId
  );
  await refreshAs(first.a);
  await edit().waitFor();
  assert.equal(
    await page.evaluate(() => window.__topicManagementDocument),
    documentId
  );
  assert.deepEqual(await fieldValues(), expected);
  assert.equal(topicPosts, before);
  ok(
    "Actual same-document A-to-B-to-A RSC refresh retains the complete original management draft"
  );
  let reads = 0;
  const held = Promise.withResolvers(),
    release = Promise.withResolvers();
  pendingRouteReleases.add(release.resolve);
  const holdRead = async (route) => {
    try {
      reads++;
      const response = await forwarded(route);
      held.resolve();
      await release.promise;
      await route.fulfill(response);
    } catch (e) {
      routeErrors.push(e.message);
      await route.abort().catch(() => {});
    }
  };
  await page.route(managementUrl, holdRead);
  await pulse("focus");
  await held.promise;
  await pulse("online");
  await pulse("blur");
  release.resolve();
  await page.waitForTimeout(200);
  await pulse("online");
  await page.waitForTimeout(150);
  await privateAbsent(first.member.name);
  assert.equal(reads, 1);
  await page.unroute(managementUrl, holdRead);
  await pulse("focus");
  await edit().waitFor();
  assert.deepEqual(await fieldValues(), expected);
  ok(
    "Held management reads and passive online hints cannot reveal concealed data or drop drafts"
  );
  assert.equal(process.env.TOPIC_PRIVACY_HEADFUL, "1");
  const otherTab = await context.newPage(),
    foreground = await context.newCDPSession(page),
    background = await context.newCDPSession(otherTab);
  try {
    await foreground.send("Emulation.setFocusEmulationEnabled", {
      enabled: false
    });
    await background.send("Emulation.setFocusEmulationEnabled", {
      enabled: false
    });
    await page.bringToFront();
    await page.waitForFunction(() => document.hasFocus());
    await edit().waitFor();
    await page.evaluate(() => {
      window.__topicNativeBlur = 0;
      window.addEventListener("blur", (e) => {
        if (e.isTrusted) window.__topicNativeBlur++;
      });
    });
    await otherTab.bringToFront();
    await page.waitForFunction(() => !document.hasFocus(), undefined, {
      polling: 100
    });
    assert.ok(await page.evaluate(() => window.__topicNativeBlur > 0));
    await privateAbsent(first.member.name);
    await page.bringToFront();
    await edit().waitFor();
    assert.deepEqual(await fieldValues(), expected);
  } finally {
    await foreground.send("Emulation.setFocusEmulationEnabled", {
      enabled: true
    });
    await foreground.detach();
    await background.detach();
    await otherTab.close();
  }
  ok(
    "Actual native tab blur removes private management DOM and foreground return restores complete drafts"
  );
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(
      () => (document.documentElement.style.fontSize = "200%")
    );
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1
      ),
      true
    );
    await edit()
      .getByRole("button", { name: "Save topic details", exact: true })
      .scrollIntoViewIfNeeded();
    await page.screenshot({
      path: output + "/management-" + width + "-200.png"
    });
  }
  page.once("dialog", async (d) => {
    assert.match(d.message(), /discard local entries/);
    await d.dismiss();
  });
  await pulse("blur");
  await main
    .getByRole("button", { name: "Reload current information", exact: true })
    .click();
  await recheck();
  await edit().waitFor();
  assert.deepEqual(await fieldValues(), expected);
  ok(
    "320px and 390px enlarged-text controls fit; deliberate reload warns and cancellation preserves drafts"
  );
  await page.evaluate(() => (document.documentElement.style.fontSize = ""));
  const uncertain = await setup("uncertain");
  await edit()
    .getByLabel("Community name", { exact: true })
    .fill("Saved exact " + uncertain.tag);
  const bodies = [];
  let committed;
  await intercept(async (route) => {
    bodies.push(route.request().postData());
    if (bodies.length === 1) {
      const r = await forwarded(route);
      assert.ok([200, 202].includes(r.status));
      committed = JSON.parse(r.body.toString());
      await route.fulfill({
        status: 503,
        json: { message: "Fictional committed lost reply" }
      });
    } else if (bodies.length === 2)
      await route.fulfill({
        status: 429,
        headers: { "retry-after": "1" },
        json: { message: "Fictional original cooldown" }
      });
    else await route.fallback();
  });
  await edit()
    .getByRole("button", { name: "Save topic details", exact: true })
    .click();
  await main
    .getByText("Fictional committed lost reply", { exact: true })
    .waitFor();
  assert.ok(committed);
  await pulse("blur");
  const deniedManagement = page.waitForResponse(
    (r) => managementUrl(new URL(r.url())) && r.status() === 403
  );
  await pulse("focus");
  await deniedManagement;
  await privateAbsent(uncertain.member.name);
  await challenge(uncertain.a);
  await recheck();
  await main
    .getByRole("button", { name: "Confirm original request", exact: true })
    .waitFor();
  await privateAbsent(uncertain.member.name);
  await originalRetry();
  await main
    .getByRole("button", { name: "Confirm original request", exact: true })
    .waitFor();
  await refreshAs(other);
  await privateAbsent(uncertain.member.name);
  await refreshAs(uncertain.a);
  await main
    .getByRole("button", { name: "Confirm original request", exact: true })
    .waitFor();
  await poll(
    () =>
      main
        .getByRole("button", { name: "Confirm original request", exact: true })
        .isEnabled(),
    true
  );
  await originalRetry();
  await main
    .getByRole("heading", {
      name: "Manage Saved exact " + uncertain.tag,
      exact: true
    })
    .waitFor();
  assert.equal(new Set(bodies).size, 1);
  assert.equal(bodies.length, 3);
  const request = JSON.parse(bodies[0]);
  assert.equal(
    await db.socialOperation.count({
      where: { ownerId: uncertain.a.id, key: "topic:" + request.mutationId }
    }),
    1
  );
  assert.equal(
    await db.topicAudit.count({
      where: { communityId: uncertain.topic.id, action: "EDITED" }
    }),
    1
  );
  await page.unroute(topicUrl);
  ok(
    "A committed lost management reply survives changed snapshot, cooldown and actual account refresh; concealed recovery sends identical bytes with one effect"
  );
  const late = await setup("late");
  await edit()
    .getByLabel("Community name", { exact: true })
    .fill("Late saved " + late.tag);
  const accepted = Promise.withResolvers(),
    unlock = Promise.withResolvers();
  pendingRouteReleases.add(unlock.resolve);
  let latePosts = 0;
  await intercept(async (route) => {
    latePosts++;
    const r = await forwarded(route);
    assert.ok([200, 202].includes(r.status));
    accepted.resolve();
    await unlock.promise;
    await route.fulfill(r);
  });
  await edit()
    .getByRole("button", { name: "Save topic details", exact: true })
    .click();
  await accepted.promise;
  await pulse("blur");
  unlock.resolve();
  await page.waitForTimeout(300);
  await privateAbsent(late.member.name);
  assert.equal(latePosts, 1);
  await challenge(late.a);
  await pulse("focus");
  await main
    .getByRole("button", { name: "Confirm original request", exact: true })
    .waitFor();
  await originalRetry();
  await main
    .getByRole("heading", {
      name: "Manage Late saved " + late.tag,
      exact: true
    })
    .waitFor();
  assert.equal(latePosts, 1);
  await page.unroute(topicUrl);
  ok(
    "Late accepted management replies remain concealed and require deliberate cached continuation without a second POST"
  );
  const sibling = await setup("sibling");
  await draft(sibling.tag);
  const siblingValues = await fieldValues();
  await main
    .getByRole("form", { name: "Offer topic role", exact: true })
    .getByRole("button", { name: "Offer topic role", exact: true })
    .click();
  await main
    .getByText(/This topic management information or its access changed/)
    .waitFor();
  await privateAbsent(sibling.member.name);
  // A changed current snapshot must remain concealed while a sibling has
  // unsent work. Rechecking may not silently discard it or adopt new versions.
  await recheck();
  await main
    .getByText(/This topic management information or its access changed/)
    .waitFor();
  await privateAbsent(sibling.member.name);
  assert.equal(
    siblingValues.some((v) => v.value === "Unsaved name " + sibling.tag),
    true
  );
  ok(
    "A successful sibling form preserves the frozen workspace and conceals changed authority/history rather than silently rebasing dirty forms"
  );
  const multiple = await setup("multiple");
  await draft(multiple.tag);
  const originalBodies = new Map(),
    attemptsByOperation = new Map();
  await intercept(async (route) => {
    const body = route.request().postData(),
      request = JSON.parse(body);
    const count = (attemptsByOperation.get(request.operation) ?? 0) + 1;
    attemptsByOperation.set(request.operation, count);
    if (count === 1) {
      originalBodies.set(request.operation, body);
      await route.fulfill({
        status: 503,
        json: { message: "Fictional pending " + request.operation }
      });
    } else {
      assert.equal(body, originalBodies.get(request.operation));
      await route.fallback();
    }
  });
  await main
    .getByRole("form", { name: "Offer topic role", exact: true })
    .getByRole("button", { name: "Offer topic role", exact: true })
    .click();
  await main
    .getByText("Fictional pending offer-role", { exact: true })
    .waitFor();
  await main
    .getByRole("form", { name: "Restrict this member", exact: true })
    .getByRole("button", { name: "Restrict this member", exact: true })
    .click();
  await main.getByText("Fictional pending restrict", { exact: true }).waitFor();
  await db.topicMembership.update({
    where: {
      communityId_userId: {
        communityId: multiple.topic.id,
        userId: multiple.m.id
      }
    },
    data: { joined: false, version: { increment: 1 } }
  });
  await pulse("blur");
  await pulse("focus");
  await poll(
    () =>
      main
        .getByRole("button", { name: "Confirm original request", exact: true })
        .count(),
    2
  );
  await privateAbsent(multiple.member.name);
  const firstDenial = page.waitForResponse(
    (r) => topicUrl(new URL(r.url())) && r.request().method() === "POST"
  );
  await main
    .getByRole("button", { name: "Confirm original request", exact: true })
    .nth(0)
    .click();
  assert.ok([403, 409].includes((await firstDenial).status()));
  await recheck();
  await poll(
    () =>
      main
        .getByRole("button", { name: "Confirm original request", exact: true })
        .count(),
    2
  );
  const secondDenial = page.waitForResponse(
    (r) => topicUrl(new URL(r.url())) && r.request().method() === "POST"
  );
  await main
    .getByRole("button", { name: "Confirm original request", exact: true })
    .nth(0)
    .click();
  assert.ok([403, 409].includes((await secondDenial).status()));
  for (const body of originalBodies.values())
    assert.equal(
      await db.socialOperation.count({
        where: {
          ownerId: multiple.a.id,
          key: "topic:" + JSON.parse(body).mutationId
        }
      }),
      0
    );
  assert.deepEqual([...attemptsByOperation.values()], [2, 2]);
  await page.unroute(topicUrl);
  ok(
    "Two pending member forms survive removal from the current list, retain distinct exact commands and receive current authority/version denials without a saved effect"
  );
  const pages = await setup("paging");
  // Unique fictional actors and history belong only to this isolated community.
  for (let i = 0; i < 19; i++) {
    const u = await actor("page" + i);
    await db.topicMembership.create({
      data: {
        communityId: pages.topic.id,
        userId: u.id,
        joined: true,
        rulesVersion: 1
      }
    });
  }
  await db.topicAudit.createMany({
    data: Array.from({ length: 21 }, (_, i) => ({
      communityId: pages.topic.id,
      actorId: pages.a.id,
      action: "EDITED",
      version: i + 10
    }))
  });
  await page.reload();
  await main
    .getByRole("heading", { name: "Topic members", exact: true })
    .waitFor();
  const memberRegion = main.getByRole("region", {
    name: "Topic members",
    exact: true
  });
  const idsFirst = await memberRegion
    .locator("h3 a")
    .evaluateAll((es) => es.map((e) => e.getAttribute("href")));
  assert.equal(idsFirst.length, 20);
  await main
    .getByRole("link", { name: "More topic members", exact: true })
    .click();
  await poll(() => memberRegion.locator("h3 a").count(), 1);
  const idsNext = await memberRegion
    .locator("h3 a")
    .evaluateAll((es) => es.map((e) => e.getAttribute("href")));
  assert.equal(
    idsNext.some((id) => idsFirst.includes(id)),
    false
  );
  await main
    .getByRole("link", { name: "First member page", exact: true })
    .click();
  await poll(() => memberRegion.locator("h3 a").count(), 20);
  const history = main.getByRole("region", {
    name: "Topic management history",
    exact: true
  });
  assert.equal(await history.locator("li").count(), 20);
  await main
    .getByRole("link", { name: "Older management history", exact: true })
    .click();
  await poll(() => history.locator("li").count(), 2);
  assert.equal(await memberRegion.locator("h3 a").count(), 20);
  await main.getByRole("link", { name: "Latest history", exact: true }).click();
  await poll(() => history.locator("li").count(), 20);
  ok(
    "Actual member20+1 and independent history20+2 paging remain bounded and return to the correct first pages"
  );
  const archived = await setup("archived", "ARCHIVED");
  assert.equal(
    await main
      .getByRole("region", { name: "Topic members", exact: true })
      .count(),
    0
  );
  await main
    .getByRole("heading", { name: "Management history", exact: true })
    .waitFor();
  await main.getByText("Reopen this topic", { exact: true }).click();
  await main
    .getByLabel("I confirm this topic visibility change.", { exact: true })
    .check();
  await main.getByRole("button", { name: "Reopen topic", exact: true }).click();
  await poll(
    async () =>
      (
        await db.topicCommunity.findUniqueOrThrow({
          where: { id: archived.topic.id }
        })
      ).lifecycle,
    "ACTIVE"
  );
  await challenge(archived.a);
  await pulse("focus");
  await main.getByText("Archive this topic", { exact: true }).waitFor();
  await setup("hidden", "HIDDEN");
  await main
    .getByText("Topic visibility is restricted by moderation", { exact: false })
    .waitFor();
  assert.equal(
    await main
      .getByRole("region", { name: "Topic members", exact: true })
      .count(),
    0
  );
  await main
    .getByRole("heading", { name: "Management history", exact: true })
    .waitFor();
  await setup("recovery", "RECOVERY");
  assert.equal(await main.locator("form").count(), 0);
  assert.equal(
    await main
      .getByRole("region", { name: "Topic members", exact: true })
      .count(),
    0
  );
  assert.equal(
    await main
      .getByRole("heading", { name: "Management history", exact: true })
      .count(),
    0
  );
  ok(
    "Archived owners can reopen after current verification; hidden and protected-recovery views retain their distinct controls, member and history boundaries"
  );
  const moderator = await setup("moderator", "MODERATOR");
  await challenge(moderator.m);
  await signIn(moderator.m);
  await go(managementPath);
  await main
    .getByRole("heading", { name: "Topic members", exact: true })
    .waitFor();
  await main
    .getByRole("heading", { name: "Management history", exact: true })
    .waitFor();
  assert.equal(
    await main
      .getByText("Edit topic details and rules", { exact: true })
      .count(),
    0
  );
  assert.equal(
    await main.getByText("Archive this topic", { exact: true }).count(),
    0
  );
  await signIn(null);
  await go(managementPath);
  assert.equal(await main.locator("form").count(), 0);
  assert.equal((await page.content()).includes(moderator.member.name), false);
  ok(
    "Current moderators receive scoped management without owner controls; guests see account entry with no private payload or mutation"
  );
  assert.equal(errors.length, 0);
  assert.equal(external.length, 0);
  assert.equal(routeErrors.length, 0);
  const receipt = {
    at: new Date().toISOString(),
    source: execFileSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8"
    }).trim(),
    results,
    scenarios,
    errors,
    external,
    routeErrors,
    actors,
    topicPosts,
    productionWrites: 0,
    externalSends: 0
  };
  writeFileSync(output + "/receipt.json", JSON.stringify(receipt, null, 2));
  console.log(JSON.stringify({ output, groups: results.length }));
} catch (error) {
  writeFileSync(output + "/failure-dom.html", await page.content());
  await page.screenshot({ path: output + "/failure.png" }).catch(() => {});
  writeFileSync(
    output + "/failure.json",
    JSON.stringify(
      {
        at: new Date().toISOString(),
        error: error.stack,
        results,
        scenarios,
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
  await context.close();
  await browser.close();
  await db.$disconnect();
}
