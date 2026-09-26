// Run from the inspected candidate with its TypeScript resolver registered.
// node --import ./tests/register.mjs <script> <fixture> [receipt.json] [--baseline]
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";

const root = process.cwd(), baseline = process.argv.includes("--baseline");
assert.ok(process.argv[2], "Pass an existing isolated HTTPS fixture directory");
const fixture = resolve(process.argv[2]);
assert.ok(fixture.startsWith(resolve(root, ".account-test") + "/"));
const outputArgument = process.argv[3]?.startsWith("--") ? undefined : process.argv[3];
const output = resolve(outputArgument ?? resolve(fixture, "report-review-retry-" + Date.now() + ".json"));
const config = JSON.parse(readFileSync(resolve(fixture, "browser-env.json"), "utf8"));
assert.match(config.origin, /^https:\/\/127\.0\.0\.1:\d+$/);
assert.equal(new URL(config.database).hostname, "127.0.0.1");
assert.match(new URL(config.database).pathname, /^\/godschurches_security_test(?:_restore)?$/);
Object.assign(process.env, {
  DATABASE_URL: config.database, DIRECT_URL: config.database,
  ACCOUNT_ORIGIN: config.origin, NEXT_PUBLIC_SITE_URL: config.origin,
  ACCOUNT_TEST_ISOLATED: "1", ACCOUNT_DELIVERY_MODE: "test-sink",
  ACCOUNT_TEST_SINK_DIR: resolve(fixture, "sink"), RETENTION_TEST_DIR: resolve(fixture, "retention"),
  AUTH_RATE_LIMIT_SECRET: "medium-fixture-only-secret-".repeat(3),
  NODE_ENV: "test", VERCEL: "", PRIVILEGED_MFA_MODE: "off", COMMUNITY_REPORTS_ENABLED: "true",
  SOCIAL_EMAIL_ENABLED: "false", PUSH_ENABLED: "false", FOUNDER_WELCOME_ENABLED: "false",
  FOUNDER_ANNOUNCEMENTS_ENABLED: "false", ACCOUNT_GOOGLE_ENABLED: "false",
  RESEND_API_KEY: "", MAILERLITE_API_KEY: "", GOOGLE_CLIENT_ID: "", GOOGLE_CLIENT_SECRET: "",
  BLOB_READ_WRITE_TOKEN: "", BLOB_STORE_ID: "", VAPID_PRIVATE_KEY: "", VAPID_PUBLIC_KEY: ""
});
const require = createRequire(resolve(root, "package.json"));
const load = (path) => import(pathToFileURL(resolve(root, path)).href);
const sha = (value) => createHash("sha256").update(value).digest("hex");
const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
const source = () => {
  const files = git("ls-files", "-z").split("\0").filter(Boolean);
  return { head: git("rev-parse", "HEAD").trim(), status: git("status", "--porcelain").trim(),
    fileCount: files.length, sha256: sha(JSON.stringify(files.map((path) => [path, sha(readFileSync(resolve(root, path)))]))) };
};
const receipt = {
  startedAt: new Date().toISOString(), mode: baseline ? "baseline" : "verification", status: "running",
  root, fixture, origin: config.origin, runnerSha256: sha(readFileSync(fileURLToPath(import.meta.url))),
  sourceBefore: source(), groups: [], actors: [], grants: [], fixtureMutations: [], requests: [], responses: [],
  browserWrites: [], errors: [], consoleErrors: [], routeErrors: [], externalRequests: [], requestFailures: [], observations: [],
  effects: [], simulations: [], recoveries: [], dialogs: [], captures: [], serviceCommands: [], productionWrites: 0, externalSends: 0,
  limitations: ["Only fictional isolated local data and current legitimate platform report authority.",
    "Rate-limit and service-error responses are transport injections; accepted decisions use real local services.",
    "Actor setup clears isolated PlatformAuthLimit rows; deletion counts are recorded. Run with exclusive fixture ownership.",
    "Lifecycle signals and same-page cookie replacement run in Chromium; no physical-device or operating-system snapshot claim.",
    "Owned fictional records remain in the isolated fixture for readback. Only this run's report-review grant is revoked and renewed."]
};
if (process.env.QA_EXPECTED_SOURCE) assert.equal(receipt.sourceBefore.head, process.env.QA_EXPECTED_SOURCE);
if (process.env.QA_EXPECTED_FILE_COUNT) assert.equal(receipt.sourceBefore.fileCount, Number(process.env.QA_EXPECTED_FILE_COUNT));
mkdirSync(dirname(output), { recursive: true, mode: 0o700 });
const save = () => writeFileSync(output, JSON.stringify(receipt, null, 2), { mode: 0o600 });
const stage = (name) => { receipt.stage = name; save(); console.log("STAGE " + name); };
const pass = (name) => { receipt.groups.push(name); save(); console.log("PASS " + name); };
save();
const { PrismaClient } = require("@prisma/client");
const { assertPortalTestDatabase, createPortalActor, seedOperatorGrants } = await load("tests/seed-portal.ts");
const client = new PrismaClient();
const db = client.$extends({ query: { $allModels: { async $allOperations({ model, operation, args, query }) {
  const result = await query(args);
  if (/^(create|update|delete|upsert)/.test(operation)) receipt.fixtureMutations.push({ model, operation,
    id: typeof result?.id === "string" ? result.id : undefined, count: typeof result?.count === "number" ? result.count : undefined,
    authLimitClear: model === "PlatformAuthLimit" && operation === "deleteMany" && !args?.where });
  return result;
} } } });
let browser, context, page, operator, reporter, replacement, grant, current, failure, routeReject, grantRevoked = false;
const cases = [], rules = [], holds = new Set(), sinksBefore = new Set(readdirSync(resolve(fixture, "sink")));
const routeFailure = new Promise((_, reject) => { routeReject = reject; });
void routeFailure.catch(() => {});
const button = (name) => page.getByRole("button", { name, exact: true });
const reason = () => page.locator("#review-reason");
const selected = () => page.locator('article[aria-label="Selected report"]');
const command = (request) => new URL(request.url()).pathname === "/api/platform/community-reports" && request.method() === "POST";
const login = async (actor) => { await context.clearCookies(); await context.addCookies([{ name: "church_platform_session", value: actor.token,
  url: config.origin, secure: true, httpOnly: true, sameSite: "Lax" }]); };
const ready = async (value) => { await selected().waitFor(); await page.waitForFunction((value) => document.querySelector("#review-reason")?.value === value, value); };
const enabled = async (name) => { await button(name).waitFor(); await page.waitForFunction((name) => [...document.querySelectorAll("button")].some((node) => node.textContent === name && !node.disabled), name); };
const oneRoute = (handler) => {
  let used = false;
  const rule = { matches: (request) => !used && command(request), handler: async (route) => { used = true; await handler(route); } };
  rules.unshift(rule);
  return () => { const i = rules.indexOf(rule); if (i >= 0) rules.splice(i, 1); };
};
const effects = async (row = current) => ({
  report: await db.communityReport.findUniqueOrThrow({ where: { id: row.report.id }, select: { id: true, version: true, status: true } }),
  decisions: await db.communityReportDecision.findMany({ where: { reportId: row.report.id }, select: { id: true, actorId: true, reason: true, action: true, version: true, fromStatus: true, toStatus: true } }),
  operations: (await db.socialOperation.findMany({ where: { ownerId: operator.id }, select: { key: true, result: true } }))
    .filter((operation) => operation.result && typeof operation.result === "object" && operation.result.id === row.report.id),
  source: await db.platformPost.findUniqueOrThrow({ where: { id: row.post.id } })
});
const newCase = async (label, embedded = false) => {
  const marker = "Fictional review retry " + label + " " + randomUUID();
  const post = await db.platformPost.create({ data: { authorId: reporter.id, audience: "PUBLIC", content: marker + " source", replyAudience: "VIEWERS", discussionClosed: true } });
  const report = await db.communityReport.create({ data: { reporterId: reporter.id, targetType: "POST", targetId: post.id, targetVersion: post.version, reason: "PRIVACY", details: marker + " private report" } });
  current = { marker, post, report, reason: marker + " private decision", embedded }; cases.push(current);
  await page.goto(config.origin + (embedded ? "/platform/admin/cases/REPORT/" + report.id : "/platform/reports/review?id=" + report.id), { waitUntil: "domcontentloaded" });
  await page.evaluate((marker) => { window.__reviewRetryDocument = marker; }, marker);
  await ready("");
  return current;
};
const lose = async () => {
  const remove = oneRoute(async (route) => {
    const response = await route.fetch(); assert.equal(response.status(), 200, await response.text());
    receipt.simulations.push({ type: "lost acknowledgment", actualStatus: response.status(), result: await response.json() });
    await route.abort("failed");
  });
  try { await button("Record review").click(); await enabled("Retry same review"); await ready(current.reason); }
  finally { remove(); }
};
const injected = async (status, retryAfter = 2) => {
  const remove = oneRoute(async (route) => {
    receipt.simulations.push({ type: "transport response", status, retryAfter: status === 429 ? retryAfter : undefined, forwardedToService: false });
    await route.fulfill({ status, contentType: "application/json", headers: { "Cache-Control": "no-store", ...(status === 429 ? { "Retry-After": String(retryAfter) } : {}) },
      body: JSON.stringify({ message: "Fictional review retry response " + status }) });
  });
  try {
    const received = page.waitForResponse((response) => command(response.request()) && response.status() === status);
    await button("Retry same review").click(); await received;
    // A 503 immediately starts a current read and replaces the notice with the
    // busy message. The held-read caller observes concealment instead of racing
    // that transient copy. A 429 keeps its notice throughout the cooldown.
    if (status === 429) await page.getByText("Fictional review retry response " + status, { exact: true }).waitFor();
  }
  finally { remove(); }
};
async function setup() {
  stage("seed guarded local report reviewer"); await assertPortalTestDatabase(db);
  receipt.database = await db.$queryRaw`SELECT current_database() AS name, host(inet_server_addr()) AS address, inet_server_port() AS port`;
  for (const label of ["retry_op", "retry_src", "retry_new"]) {
    const actor = await createPortalActor(db, label);
    receipt.actors.push({ id: actor.id, username: actor.username, name: actor.name, email: actor.email });
    if (label === "retry_op") operator = actor; else if (label === "retry_src") reporter = actor; else replacement = actor;
    save();
  }
  await seedOperatorGrants(db, operator, ["REVIEW_COMMUNITY_REPORTS"]);
  grant = await db.platformOperatorGrant.findFirstOrThrow({ where: { userId: operator.id, capability: "REVIEW_COMMUNITY_REPORTS" } }); receipt.grants.push(grant);
  assert.equal(await db.platformOperatorGrant.count({ where: { userId: replacement.id } }), 0);
  const { chromium } = createRequire(process.env.PLAYWRIGHT_MODULE ?? process.env.HOME + "/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json")("playwright");
  const publicKey = execFileSync("openssl", ["x509", "-in", config.certificate, "-pubkey", "-noout"]);
  const der = execFileSync("openssl", ["pkey", "-pubin", "-outform", "DER"], { input: publicKey });
  browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    args: ["--ignore-certificate-errors-spki-list=" + createHash("sha256").update(der).digest("base64")] });
  context = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: "America/Chicago", serviceWorkers: "block" });
  page = await context.newPage(); page.setDefaultTimeout(30000);
  await context.route(/^https?:\/\//, async (route) => {
    try {
      const request = route.request(), url = new URL(request.url());
      if (url.origin !== config.origin) { receipt.externalRequests.push(url.origin + url.pathname); return await route.abort("blockedbyclient"); }
      const rule = rules.find((rule) => rule.matches(request));
      if (rule) await rule.handler(route); else await route.continue();
    } catch (error) { receipt.routeErrors.push(String(error)); routeReject(error); }
  });
  context.on("request", (request) => {
    const url = new URL(request.url()), row = { path: url.pathname + url.search, method: request.method(), owner: request.headers()["x-expected-account"] ?? null };
    receipt.requests.push(row);
    if (!["GET", "HEAD"].includes(request.method())) receipt.browserWrites.push({ ...row, body: request.postData() });
  });
  context.on("response", (response) => { const url = new URL(response.url()); if (url.pathname.startsWith("/api/platform/")) receipt.responses.push({ path: url.pathname + url.search, method: response.request().method(), status: response.status() }); });
  context.on("requestfailed", (request) => receipt.requestFailures.push({ path: new URL(request.url()).pathname, method: request.method(), error: request.failure()?.errorText }));
  page.on("pageerror", (error) => receipt.errors.push(String(error)));
  page.on("console", (message) => { if (message.type() === "error") receipt.consoleErrors.push({ text: message.text(), location: message.location() }); });
  await login(operator);
}
async function reproduce() {
  await newCase("baseline");
  stage("first accepted FOLLOW_UP_REQUIRED loses acknowledgment");
  await reason().fill(current.reason); await page.locator("#review-resolution").selectOption("FOLLOW_UP_REQUIRED");
  await lose();
  receipt.before429 = await effects(); assert.equal(receipt.before429.decisions.length, 1);
  stage("429 on original retry"); await injected(429);
  await enabled("Record review");
  receipt.after429 = { originalRetryButtons: await button("Retry same review").count(), freshSubmitButtons: await button("Record review").count(), reason: await reason().inputValue(), effects: await effects() };
  assert.equal(receipt.after429.originalRetryButtons, 0); assert.equal(receipt.after429.freshSubmitButtons, 1);
  stage("attempt fresh submit after original retry was lost");
  const freshResponse = page.waitForResponse((response) => command(response.request()));
  await button("Record review").click(); const response = await freshResponse;
  receipt.freshSubmit = { status: response.status(), result: await response.json() };
  if (response.status() === 200) await ready("");
  receipt.afterFresh = await effects();
  const attempts = receipt.browserWrites.filter((row) => row.path === "/api/platform/community-reports");
  assert.equal(attempts.length, 3); assert.equal(attempts[0].body, attempts[1].body);
  const first = JSON.parse(attempts[0].body), fresh = JSON.parse(attempts[2].body);
  assert.notEqual(first.mutationId, fresh.mutationId);
  receipt.reproduced = { lostOriginalRetry: true, freshMutationIdCreated: true, duplicateDecision: receipt.afterFresh.decisions.length === 2,
    firstMutationId: first.mutationId, freshMutationId: fresh.mutationId, firstVersion: first.expectedVersion, freshVersion: fresh.expectedVersion,
    decisionCount: receipt.afterFresh.decisions.length, operationCount: receipt.afterFresh.operations.length };
  pass(receipt.reproduced.duplicateDecision ? "429 loses the original key and a fresh submit records duplicate intent" : "429 loses the original key; fresh submit outcome recorded without claiming a duplicate");
}
const event = (name) => page.evaluate((name) => window.dispatchEvent(new Event(name)), name);
const frame = () => page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
const documentUnchanged = async () => assert.equal(await page.evaluate(() => window.__reviewRetryDocument), current.marker);
const absent = async (label) => {
  await page.waitForFunction((marker) => {
    const body = document.body;
    return !body.textContent.includes(marker) &&
      !body.querySelector('#review-reason,#review-resolution,#content-action,#author-reason,article[aria-label="Selected report"]') &&
      ![...body.querySelectorAll("input,textarea,select")].some((node) => String(node.value).includes(marker)) &&
      ![...body.querySelectorAll("*")].some((node) => [...node.attributes].some((attr) => attr.value.includes(marker)));
  }, current.marker);
  await documentUnchanged();
  receipt.observations.push({ label, physicalReportDomAbsent: true, privateLiveValuesAbsent: true, privateAttributesAbsent: true, writes: receipt.browserWrites.length });
  save();
};
const heldReview = () => {
  let captured, released, completed, used = false;
  const capture = new Promise((done) => { captured = done; }), gate = new Promise((done) => { released = done; }), delivery = new Promise((done) => { completed = done; });
  const id = current.report.id;
  const rule = { matches: (request) => {
    const url = new URL(request.url());
    return !used && request.method() === "GET" && url.pathname === "/api/platform/community-reports" && url.searchParams.get("view") === "review" && url.searchParams.get("id") === id;
  }, handler: async (route) => {
    used = true; const response = await route.fetch(); assert.equal(response.status(), 200);
    assert.equal((await response.json()).report.id, id); captured(); await gate; await route.fulfill({ response }); completed();
  } };
  rules.unshift(rule);
  const hold = { capture, delivery, release: () => {
    released(); const index = rules.indexOf(rule); if (index >= 0) rules.splice(index, 1); holds.delete(hold);
  } };
  holds.add(hold); return hold;
};
const bounded = async (promise, label) => {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(label + " exceeded 30 seconds")), 30000); })]); }
  finally { clearTimeout(timer); }
};
const attemptsFor = (id = current.report.id) => receipt.browserWrites.filter((row) => {
  if (row.path !== "/api/platform/community-reports") return false;
  return JSON.parse(row.body).id === id;
});
const unchangedEffect = async (count = 1) => {
  const actual = await effects(); assert.equal(actual.decisions.length, count); assert.equal(actual.operations.length, count); return actual;
};
const exactPending = async (original, expectedAttempts) => {
  await enabled("Retry same review"); await ready(current.reason); await documentUnchanged();
  assert.equal(await button("Record review").count(), 0);
  const attempts = attemptsFor(); assert.equal(attempts.length, expectedAttempts);
  for (const attempt of attempts) { assert.equal(attempt.body, original); assert.equal(attempt.owner, operator.id); }
  return unchangedEffect();
};
const restore = async (name = "focus") => { await event(name); await ready(current.reason); await enabled("Retry same review"); };
const cooldown = async (original, expectedAttempts) => {
  await injected(429, 3);
  assert.equal(await button("Retry same review").count(), 1); assert.equal(await button("Record review").count(), 0);
  assert.equal(await button("Retry same review").isDisabled(), true);
  assert.equal(await reason().isDisabled(), true);
  const before = receipt.browserWrites.length;
  await reason().evaluate((node) => node.form.requestSubmit());
  await button("Retry same review").evaluate((node) => node.click());
  await frame(); assert.equal(receipt.browserWrites.length, before, "Cooldown prevents fresh or original submission");
  await exactPending(original, expectedAttempts);
};
const serviceFailure = async (original, expectedAttempts) => {
  const hold = heldReview();
  try {
    await injected(503);
    await bounded(hold.capture, "503 current review revalidation");
    await absent("503 and held fresh read");
    hold.release(); await bounded(hold.delivery, "held review delivery");
    await exactPending(original, expectedAttempts);
  } finally { hold.release(); }
};
const replacementCycle = async (original, expectedAttempts) => {
  const before = receipt.browserWrites.length;
  await event("pagehide"); await absent("pending pagehide");
  await login(replacement); await event("pageshow");
  await page.getByText("Your sign-in changed. Reload before continuing.", { exact: true }).waitFor();
  await absent("same-page replacement account");
  assert.equal(receipt.browserWrites.length, before);
  await login(operator); await restore(); await exactPending(original, expectedAttempts);
};
const revokeCycle = async (original, expectedAttempts) => {
  const prior = await db.platformOperatorGrant.findUniqueOrThrow({ where: { id: grant.id } });
  await db.platformOperatorGrant.update({ where: { id: grant.id }, data: { revokedAt: new Date() } }); grantRevoked = true;
  const denied = page.waitForResponse((response) => command(response.request()) && [401, 403, 404].includes(response.status()));
  await button("Retry same review").click(); const response = await denied;
  await absent("actual revoked review authority denies original receipt replay");
  await button("Refresh review access").click();
  await page.getByText("This report is unavailable.", { exact: true }).waitFor();
  await absent("actual revoked review authority denies fresh read");
  await unchangedEffect();
  const renewed = await db.platformOperatorGrant.update({ where: { id: grant.id }, data: { revokedAt: null } }); grantRevoked = false;
  assert.equal(renewed.version, prior.version + 2);
  receipt.recoveries.push({ type: "own grant revoke and legitimate renewal", grantId: grant.id, beforeVersion: prior.version, renewedVersion: renewed.version, retryStatus: response.status() });
  await restore(); await exactPending(original, expectedAttempts);
};
const keyboardFit = async () => {
  await page.setViewportSize({ width: 320, height: 844 });
  for (const enlarged of [false, true]) {
    const style = enlarged ? await page.addStyleTag({ content: "html{font-size:200%!important}" }) : null;
    try {
      for (const name of ["Retry same review", "Discard local review"]) {
        const target = button(name);
        await target.focus(); await page.keyboard.press("Tab"); await page.keyboard.press("Shift+Tab");
        await target.evaluate((node) => node.scrollIntoView({ block: "center", inline: "nearest" }));
        const geometry = await target.evaluate((node) => {
          const box = node.getBoundingClientRect(), nav = document.querySelector('nav[aria-label="Platform"]')?.getBoundingClientRect(), style = getComputedStyle(node);
          const hit = document.elementFromPoint((box.left + box.right) / 2, (box.top + box.bottom) / 2);
          return { focused: document.activeElement === node, focusVisible: node.matches(":focus-visible"),
            outlineStyle: style.outlineStyle, outlineWidth: style.outlineWidth, boxShadow: style.boxShadow,
            centerHit: node === hit || node.contains(hit), top: box.top, bottom: box.bottom, availableBottom: nav?.top ?? innerHeight,
            viewport: innerWidth, scrollWidth: document.documentElement.scrollWidth };
        });
        const path = output.replace(/\.json$/, "") + "-320-" + (enlarged ? "200-" : "100-") + (name.startsWith("Retry") ? "retry" : "discard") + ".png";
        await page.screenshot({ path }); receipt.captures.push({ path, target: name, enlarged, geometry }); save();
        assert.ok(geometry.focused && geometry.focusVisible && geometry.centerHit);
        assert.ok(geometry.top >= 0 && geometry.bottom <= geometry.availableBottom);
        assert.ok((geometry.outlineStyle !== "none" && parseFloat(geometry.outlineWidth) > 0) || geometry.boxShadow !== "none");
        assert.ok(geometry.scrollWidth <= 321, "No horizontal overflow at narrow/enlarged viewport");
      }
    } finally { if (style) await style.evaluate((node) => node.remove()); }
  }
  await page.setViewportSize({ width: 390, height: 844 });
};
async function verifyFamily(family) {
  await newCase(family, family === "moderate"); stage(family + " accepted effect and exact cooldown recovery");
  await reason().fill(current.reason);
  if (family === "resolve") await page.locator("#review-resolution").selectOption("FOLLOW_UP_REQUIRED");
  else {
    await page.getByLabel("Content action", { exact: true }).selectOption("HIDE");
    await page.getByLabel("Apply this decision to the selected content and create this author notice.", { exact: true }).check();
  }
  await lose();
  const original = attemptsFor()[0].body;
  assert.equal(JSON.parse(original).operation, family);
  await unchangedEffect(); await cooldown(original, 2); await serviceFailure(original, 3);
  if (family === "resolve") {
    await replacementCycle(original, 3); await revokeCycle(original, 4); await keyboardFit();
    pass("Status retry keeps exact owner/body/key through cooldown, 503, concealment, account replacement and real grant renewal");
    pass("Actual Tab and Shift+Tab preserve visible, reachable retry/discard at 320px and 200% text");
  } else {
    await event("pagehide"); await absent("content pending pagehide"); await restore("pageshow");
    await exactPending(original, 3);
  }
  await button("Retry same review").click(); await button("Retry same review").waitFor({ state: "detached" }); await ready("");
  const actual = await unchangedEffect(), attempts = attemptsFor();
  assert.equal(attempts.length, family === "resolve" ? 5 : 4);
  for (const attempt of attempts) { assert.equal(attempt.body, original); assert.equal(attempt.owner, operator.id); }
  assert.equal(actual.operations[0].key.split(":").at(-1), JSON.parse(original).mutationId);
  assert.equal(actual.decisions[0].reason, current.reason);
  if (family === "resolve") assert.deepEqual(actual.source, current.post);
  else { assert.equal(actual.decisions[0].action, "HIDE"); assert.equal(actual.source.moderationState, "HIDDEN");
    assert.equal(actual.source.replyAudience, current.post.replyAudience); assert.equal(actual.source.discussionClosed, current.post.discussionClosed); }
  receipt.recoveries.push({ family, entryPoint: current.embedded ? "embedded Admin REPORT" : "standalone report review", reportId: current.report.id, attempts: attempts.length, bodySha256: sha(original), mutationId: JSON.parse(original).mutationId,
    decisionId: actual.decisions[0].id, decisions: 1, socialOperations: 1 });
  pass(family + " confirmation replays exactly one existing Decision and SocialOperation through " + (current.embedded ? "embedded Admin REPORT" : "standalone report review"));
}
async function verifyDiscard() {
  await newCase("discard"); stage("warned pending discard after cooldown");
  await reason().fill(current.reason); await page.locator("#review-resolution").selectOption("FOLLOW_UP_REQUIRED");
  await lose(); const original = attemptsFor()[0].body; await cooldown(original, 2);
  for (const accepted of [false, true]) {
    const dialogSeen = page.waitForEvent("dialog");
    const click = button("Discard local review").click(); const dialog = await dialogSeen;
    receipt.dialogs.push({ type: dialog.type(), message: dialog.message(), accepted });
    assert.equal(dialog.type(), "confirm"); assert.match(dialog.message(), /may already be recorded/);
    if (accepted) await dialog.accept(); else await dialog.dismiss(); await click;
    if (!accepted) await exactPending(original, 2);
  }
  await ready(""); assert.equal(await button("Retry same review").count(), 0);
  await page.getByText("Local review entries discarded. Recorded decisions are unchanged.", { exact: true }).waitFor();
  assert.equal(attemptsFor().length, 2); await unchangedEffect();
  pass("Cancelled warned discard retains original retry; accepted local discard preserves its one durable decision");
}
async function verifyConflict() {
  await newCase("definitive-conflict"); stage("definitive409 requires explicit current-version adoption");
  await reason().fill(current.reason); await page.locator("#review-resolution").selectOption("FOLLOW_UP_REQUIRED");
  const { communityReportCommand } = await load("lib/platform/community-reports.ts");
  const body = { operation: "resolve", mutationId: randomUUID(), id: current.report.id, expectedVersion: 1, resolution: "FOLLOW_UP_REQUIRED", decisionReason: current.marker + " deliberate concurrent decision" };
  const result = await communityReportCommand(db, operator.token, body); receipt.serviceCommands.push({ body, result });
  const conflict = page.waitForResponse((response) => command(response.request()) && response.status() === 409);
  await button("Record review").click(); await conflict; await absent("definitive409 conceals stale review");
  await button("Refresh review access").click(); await ready(current.reason);
  await button("Use this current review version").waitFor();
  assert.equal(await button("Retry same review").count(), 0); assert.equal(await button("Record review").isDisabled(), true);
  const writes = receipt.browserWrites.length;
  await reason().evaluate((node) => node.form.requestSubmit()); await frame(); assert.equal(receipt.browserWrites.length, writes);
  await unchangedEffect();
  await button("Use this current review version").click(); await button("Record review").click(); await ready("");
  const actual = await unchangedEffect(2), attempts = attemptsFor();
  assert.equal(attempts.length, 2); assert.notEqual(JSON.parse(attempts[0].body).mutationId, JSON.parse(attempts[1].body).mutationId);
  assert.equal(JSON.parse(attempts[0].body).expectedVersion, 1); assert.equal(JSON.parse(attempts[1].body).expectedVersion, 2);
  assert.equal(actual.report.version, 3); assert.deepEqual(actual.source, current.post);
  pass("Definitive409 clears failed retry but retains draft and blocks fresh submission until explicit version adoption");
}
async function run() {
  await setup();
  if (baseline) await reproduce();
  else { await verifyFamily("resolve"); await verifyFamily("moderate"); await verifyDiscard(); await verifyConflict(); }
  assert.deepEqual(receipt.errors, []); assert.deepEqual(receipt.routeErrors, []); assert.deepEqual(receipt.externalRequests, []);
}
try { await Promise.race([run(), routeFailure]); }
catch (error) {
  failure = error; receipt.failure = { message: String(error), stack: error?.stack };
  if (page) await page.screenshot({ path: output.replace(/\.json$/, "") + "-failure.png", fullPage: true }).catch(() => {});
} finally {
  for (const hold of holds) hold.release();
  rules.length = 0;
  if (browser) await browser.close().catch((error) => receipt.errors.push(String(error)));
  try {
    if (grantRevoked) {
      await db.platformOperatorGrant.update({ where: { id: grant.id }, data: { revokedAt: null } });
      grantRevoked = false; receipt.grantRestoredInFinally = true;
    }
    for (const row of cases) receipt.effects.push({ marker: row.marker, postId: row.post.id, reportId: row.report.id, final: await effects(row) });
    receipt.finalGrant = grant ? await db.platformOperatorGrant.findUnique({ where: { id: grant.id } }) : null;
    receipt.sinkFiles = readdirSync(resolve(fixture, "sink")).filter((file) => !sinksBefore.has(file));
    receipt.sourceAfter = source(); receipt.sourceUnchanged = JSON.stringify(receipt.sourceBefore) === JSON.stringify(receipt.sourceAfter);
    assert.ok(receipt.sourceUnchanged, "All tracked candidate source and checkout status must remain unchanged");
  } catch (error) { failure ??= error; receipt.readbackError = String(error); }
  await client.$disconnect(); receipt.finishedAt = new Date().toISOString(); receipt.status = failure ? "failed" : "passed"; save();
}
if (failure) throw failure;
console.log("REPORT_REVIEW_RETRY_BROWSER_PASS " + receipt.groups.length + " " + output);
