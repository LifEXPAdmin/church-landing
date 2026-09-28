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
  headless: true,
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
const output = fixtureDir + "/topic-recovery-browser-" + Date.now();
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
    username = "tr_" + label + "_" + tag,
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
try {
  // Actual committed write, lost reply, cooldown and unrelated later errors.
  const a = await actor("original"),
    other = await actor("other");
  await challenge(a);
  let { form, slug } = await formFor(a);
  const attempts = [];
  let phase = "lost";
  await intercept(async (route) => {
    attempts.push({
      body: route.request().postData(),
      owner: route.request().headers()["x-expected-account"]
    });
    if (phase === "lost") {
      const response = await route.fetch();
      assert.ok([200, 202].includes(response.status()), await response.text());
      phase = "cooldown";
      await route.abort("failed");
    } else if (phase === "cooldown") {
      phase = "unavailable";
      await route.fulfill({
        status: 429,
        headers: { "retry-after": "2" },
        json: { message: "Fictional cooldown" }
      });
    } else if (phase === "unavailable") {
      phase = "later-validation";
      await route.fulfill({
        status: 503,
        json: { message: "Fictional unavailable confirmation" }
      });
    } else if (phase === "later-validation") {
      phase = "real";
      await route.fulfill({
        status: 400,
        json: {
          message: "Fictional later validation",
          code: "TOPIC_INPUT_REJECTED"
        }
      });
    } else await route.fallback();
  });
  await start(form);
  await poll(() => Promise.resolve(phase), "cooldown");
  await retry();
  await waitMessage("Fictional cooldown");
  assert.equal(await button("Retry the same topic request").isDisabled(), true);
  assert.equal(
    await form.getByLabel("Community name", { exact: true }).isDisabled(),
    true
  );
  const cooldownCount = attempts.length;
  await new Promise((r) => setTimeout(r, 250));
  assert.equal(attempts.length, cooldownCount);
  await cancelStop();
  assert.equal(
    await form.getByLabel("Topic address", { exact: true }).inputValue(),
    slug
  );
  await retry();
  await waitMessage("Fictional unavailable confirmation");
  await retry();
  await waitMessage("Fictional later validation");
  assert.equal(
    await form.getByLabel("Community name", { exact: true }).isDisabled(),
    true
  );
  const beforeReplacement = attempts.length;
  await signIn(other);
  await retry();
  await waitMessage("Your sign-in changed");
  assert.equal(attempts.length, beforeReplacement);
  await signIn(a);
  await challenge(a);
  await page.screenshot({ path: output + "/retained-390.png", fullPage: true });
  await page.setViewportSize({ width: 320, height: 900 });
  await page.addStyleTag({ content: "html {font-size:200% !important;}" });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1
    )
  );
  await button("Retry the same topic request").focus();
  assert.equal(
    await button("Retry the same topic request").evaluate(
      (e) => e === document.activeElement
    ),
    true
  );
  await page.screenshot({
    path: output + "/retained-320-enlarged.png",
    fullPage: true
  });
  await retry();
  await saved(slug);
  await page.unroute(topicUrl);
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(new Set(attempts.map((a) => a.body)).size, 1);
  assert.ok(attempts.every((x) => x.owner === a.id));
  assert.deepEqual(await counts(a, slug), {
    topics: 1,
    createdAudits: 1,
    receipts: 1
  });
  scenarios.push({
    name: "committed-original",
    attempts: attempts.length,
    request: JSON.parse(attempts[0].body),
    counts: await counts(a, slug)
  });
  ok(
    "Committed create survives lost reply, cooldown, 503, later classified400 and account replacement with one exact request and one effect"
  );
  ok(
    "Cooldown blocks deliberate retries without automatic submission; canceling warned reload preserves original entries"
  );
  ok(
    "Retained recovery controls fit390px and320px enlarged text and remain keyboard reachable"
  );
  // An authoritative first rejection is correctable without preserving bad input forever.
  const validation = await actor("validation");
  await challenge(validation);
  ({ form, slug } = await formFor(validation));
  await form.getByLabel("Community name", { exact: true }).fill("x".repeat(81));
  const corrected = [];
  let preflightFailure = true;
  await page.route(identityUrl, async (route) => {
    if (preflightFailure) {
      preflightFailure = false;
      await route.fulfill({
        status: 503,
        json: { message: "Fictional preflight failure" }
      });
    } else await route.fallback();
  });
  await intercept(async (route) => {
    corrected.push(route.request().postData());
    await route.fallback();
  });
  await start(form);
  await waitMessage("Your sign-in could not be checked");
  assert.equal(corrected.length, 0);
  await page.unroute(identityUrl);
  const rejected = page.waitForResponse(
    (r) =>
      new URL(r.url()).pathname === "/api/platform/topics" &&
      r.request().method() === "POST"
  );
  await retry();
  const invalid = await rejected;
  assert.equal(invalid.status(), 400);
  assert.equal((await invalid.json()).code, "TOPIC_INPUT_REJECTED");
  await poll(
    () => form.getByLabel("Community name", { exact: true }).isEnabled(),
    true
  );
  await form
    .getByLabel("Community name", { exact: true })
    .fill("Fictional corrected " + slug);
  await start(form);
  await saved(slug);
  await page.unroute(topicUrl);
  assert.notEqual(
    JSON.parse(corrected[0]).mutationId,
    JSON.parse(corrected[1]).mutationId
  );
  assert.deepEqual(await counts(validation, slug), {
    topics: 1,
    createdAudits: 1,
    receipts: 1
  });
  ok(
    "Failed identity preflight sends no POST; first definitive command rejection then unlocks correction and a new successful request"
  );
  // A generic identity400 after commit says nothing about whether POST committed.
  const identity = await actor("identity");
  await challenge(identity);
  ({ form, slug } = await formFor(identity));
  const identityAttempts = [];
  let failIdentity = false;
  await page.route(identityUrl, async (route) => {
    if (failIdentity) {
      failIdentity = false;
      await route.fulfill({
        status: 400,
        json: { message: "Fictional identity read failed" }
      });
    } else await route.fallback();
  });
  await intercept(async (route) => {
    identityAttempts.push(route.request().postData());
    if (identityAttempts.length === 1) {
      const response = await route.fetch();
      assert.ok([200, 202].includes(response.status()), await response.text());
      failIdentity = true;
      await route.fulfill({ response });
    } else await route.fallback();
  });
  await start(form);
  await waitMessage("Your sign-in could not be checked");
  assert.equal(
    await form.getByLabel("Community name", { exact: true }).isDisabled(),
    true
  );
  await challenge(identity);
  await retry();
  await saved(slug);
  await page.unroute(topicUrl);
  await page.unroute(identityUrl);
  assert.equal(identityAttempts[0], identityAttempts[1]);
  assert.deepEqual(await counts(identity, slug), {
    topics: 1,
    createdAudits: 1,
    receipts: 1
  });
  ok(
    "Unclassified identity400 after a real commit retains the exact original and confirms one saved effect"
  );
  // Real version and permission denials remain enforced while recovery stays usable.
  process.env.PRIVILEGED_MFA_MODE = "off";
  const owner = await actor("owner"),
    member = await actor("member"),
    tag = randomUUID().slice(0, 8);
  const created = await topicCommand(db, owner.token, {
    operation: "create",
    mutationId: randomUUID(),
    name: "Fictional conflict " + tag,
    slug: "conflict-" + tag,
    description: "Fictional version conflict.",
    rules: "Respect one another.",
    acceptedRules: true
  });
  await signIn(member);
  await go("/platform/topics/conflict-" + tag);
  const follow = page.getByRole("form", { name: "Follow topic", exact: true }),
    conflicts = [];
  await intercept(async (route) => {
    conflicts.push(route.request().postData());
    if (conflicts.length === 1)
      await route.fulfill({
        status: 503,
        json: { message: "Fictional uncertain follow" }
      });
    else await route.fallback();
  });
  await follow
    .getByRole("button", { name: "Follow topic", exact: true })
    .click();
  await waitMessage("Fictional uncertain follow");
  await topicCommand(db, member.token, {
    operation: "join",
    mutationId: randomUUID(),
    communityId: created.id,
    expectedVersion: 0,
    rulesVersion: 1,
    acceptedRules: true
  });
  let responsePromise = page.waitForResponse(
    (r) =>
      new URL(r.url()).pathname === "/api/platform/topics" &&
      r.request().method() === "POST"
  );
  await retry();
  assert.equal((await responsePromise).status(), 409);
  assert.equal(await button("Retry the same topic request").isEnabled(), true);
  await db.topicMembership.update({
    where: {
      communityId_userId: { communityId: created.id, userId: member.id }
    },
    data: { restrictedAt: new Date(), restrictionReason: "OTHER" }
  });
  responsePromise = page.waitForResponse(
    (r) =>
      new URL(r.url()).pathname === "/api/platform/topics" &&
      r.request().method() === "POST"
  );
  await retry();
  assert.equal((await responsePromise).status(), 403);
  assert.equal(new Set(conflicts).size, 1);
  assert.equal(
    await db.socialOperation.count({
      where: {
        ownerId: member.id,
        key: "topic:" + JSON.parse(conflicts[0]).mutationId
      }
    }),
    0
  );
  await cancelStop();
  assert.equal(await button("Retry the same topic request").isEnabled(), true);
  page.once("dialog", async (d) => {
    assert.match(d.message(), /does not undo saved changes/);
    await d.accept();
  });
  const reloaded = page.waitForNavigation({ waitUntil: "commit" });
  await button("Stop retrying and reload current information").click();
  await reloaded;
  await page.unroute(topicUrl);
  const retained = await db.topicMembership.findUniqueOrThrow({
    where: {
      communityId_userId: { communityId: created.id, userId: member.id }
    }
  });
  assert.ok(retained.joined && retained.restrictedAt);
  ok(
    "Real409 and403 preserve original bytes and enforce current version/permission checks; warned stop clears only local recovery"
  );
  // A confirmed receipt survives a later identity change during navigation settlement.
  const navigation = await actor("navigation"),
    replacement = await actor("replacement");
  await challenge(navigation);
  ({ form, slug } = await formFor(navigation));
  let committed = false,
    checksAfter = 0,
    posts = 0,
    releaseIdentity;
  const held = new Promise((r) => (releaseIdentity = r));
  await intercept(async (route) => {
    posts++;
    const response = await route.fetch();
    assert.ok([200, 202].includes(response.status()), await response.text());
    committed = true;
    await route.fulfill({ response });
  });
  await page.route(identityUrl, async (route) => {
    if (committed && ++checksAfter === 2) {
      await signIn(replacement);
      const response = await route.fetch({
        headers: {
          ...route.request().headers(),
          cookie:
            sessionCookieFixtureName(config.origin) + "=" + replacement.token
        }
      });
      await route.fulfill({ response });
      releaseIdentity();
      return;
    }
    await route.fallback();
  });
  await start(form);
  await held;
  await waitMessage(
    "Your topic change was saved. Return to the original account"
  );
  assert.equal(new URL(page.url()).pathname, "/platform/topics/new");
  assert.equal(posts, 1);
  await signIn(navigation);
  await button("Continue after saved topic change").click();
  await saved(slug);
  await page.unroute(topicUrl);
  await page.unroute(identityUrl);
  assert.equal(posts, 1);
  assert.deepEqual(await counts(navigation, slug), {
    topics: 1,
    createdAudits: 1,
    receipts: 1
  });
  ok(
    "Accepted receipt survives the navigation identity gap and continues only for the original account without a second POST"
  );
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
  assert.deepEqual(routeErrors, []);
  writeFileSync(
    output + "/receipt.json",
    JSON.stringify(
      {
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
        globalLimiterReset: false
      },
      null,
      2
    )
  );
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
        routeErrors,
        errors,
        external
      },
      null,
      2
    )
  );
  throw error;
} finally {
  await page.unrouteAll({ behavior: "wait" }).catch(() => {});
  await context.close();
  await browser.close();
  await db.$disconnect();
}
