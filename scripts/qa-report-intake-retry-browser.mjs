// Run from the inspected candidate with its TypeScript resolver registered.
// node --import ./tests/register.mjs <script> <fixture> [receipt.json] [--baseline]
import assert from "node:assert/strict";
import { createHash, createHmac, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { sessionCookieFixtureName } from "./session-cookie-fixture.mjs";

const root = process.cwd(), baseline = process.argv.includes("--baseline");
assert.ok(process.argv[2], "Pass an existing isolated HTTPS fixture directory");
const fixture = resolve(process.argv[2]);
assert.ok(fixture.startsWith(resolve(root, ".account-test") + "/"));
const outputArgument = process.argv[3]?.startsWith("--") ? undefined : process.argv[3];
const output = resolve(outputArgument ?? resolve(fixture, "report-intake-retry-" + Date.now() + ".json"));
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
  effects: [], limiterChanges: [], simulations: [], recoveries: [], dialogs: [], captures: [], serviceCommands: [], productionWrites: 0, externalSends: 0,
  limitations: ["Only fictional isolated local data; one own reviewer grant makes intake available.",
    "429 responses come from the real local endpoint after saturating only this reporter's transport limiter. Only explicitly tagged503 responses and lost acknowledgments are injected.",
    "Actor setup clears isolated PlatformAuthLimit rows; deletion counts are recorded. Run with exclusive fixture ownership.",
    "Lifecycle signals and same-page cookie replacement run in Chromium; no physical-device or operating-system snapshot claim.",
    "Owned fictional records remain in the isolated fixture for readback. The own intake reviewer grant is never revoked or changed.",
    "Verification shortens no server Retry-After header: only the owned limiter expiry and browser Date.now are advanced explicitly to avoid a fifteen-minute test wait."]
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
let browser, context, page, reporter, author, replacement, reviewer, current, failure, routeReject, limiterBefore;
const cases = [], rules = [], sinksBefore = new Set(readdirSync(resolve(fixture, "sink")));
const routeFailure = new Promise((_, reject) => { routeReject = reject; });
void routeFailure.catch(() => {});
const button = (name) => page.getByRole("button", { name, exact: true });
const details = () => page.getByLabel("Report details", { exact: true });
const reason = () => page.getByLabel("Report reason", { exact: true });
const command = (request) => new URL(request.url()).pathname === "/api/platform/community-reports" && request.method() === "POST";
const login = async (actor) => { await context.clearCookies(); await context.addCookies([{ name: sessionCookieFixtureName(config.origin), value: actor.token,
  url: config.origin, secure: true, httpOnly: true, sameSite: "Lax" }]); };
const enabled = async (name) => { await button(name).waitFor(); await page.waitForFunction((name) => [...document.querySelectorAll("button")].some((node) => node.textContent === name && !node.disabled), name); };
const ready = async (value = "") => { await details().waitFor(); await page.waitForFunction((value) => document.querySelector('[aria-label="Report details"]')?.value === value, value); };
const oneRoute = (handler) => {
  let used = false;
  const rule = { matches: (request) => !used && command(request), handler: async (route) => { used = true; await handler(route); } };
  rules.unshift(rule);
  return () => { const i = rules.indexOf(rule); if (i >= 0) rules.splice(i, 1); };
};
const effects = async (row = current) => {
  const reports = await db.communityReport.findMany({ where: { reporterId: reporter.id, targetId: row.post.id }, orderBy: { targetVersion: "asc" } });
  const ids = reports.map((report) => report.id);
  return {
    reports,
    operations: (await db.socialOperation.findMany({ where: { ownerId: reporter.id }, select: { key: true, result: true } }))
      .filter((operation) => operation.result && typeof operation.result === "object" && ids.includes(operation.result.id)),
    events: await db.socialEvent.findMany({ where: { reportId: { in: ids } }, select: { id: true, key: true, kind: true, actorId: true, recipientId: true, reportId: true } }),
    retentionControls: await db.retentionControl.findMany({ where: { target: "REPORT", targetId: { in: ids } }, select: { id: true, kind: true, sourceId: true, targetId: true, version: true, journaledAt: true } }),
    source: await db.platformPost.findUniqueOrThrow({ where: { id: row.post.id } })
  };
};
const newTarget = async (label) => {
  const marker = "Fictional intake retry " + label + " " + randomUUID();
  const post = await db.platformPost.create({ data: { authorId: author.id, audience: "PUBLIC", content: marker + " source", replyAudience: "VIEWERS", discussionClosed: true } });
  current = { marker, post, reason: "PRIVACY", details: marker + " private submitted context" }; cases.push(current);
  await page.goto(config.origin + "/platform/reports?targetType=POST&targetId=" + post.id, { waitUntil: "domcontentloaded" });
  await page.evaluate((marker) => { window.__intakeRetryDocument = marker; }, marker);
  await ready(); await reason().selectOption(current.reason); await details().fill(current.details); await enabled("Send private report");
};
const lose = async () => {
  const remove = oneRoute(async (route) => {
    const response = await route.fetch(); assert.equal(response.status(), 200, await response.text());
    const result = await response.json(); current.reportId = result.id;
    receipt.simulations.push({ type: "lost accepted create acknowledgment", actualStatus: response.status(), result });
    await route.abort("failed");
  });
  try { await button("Send private report").click(); await enabled("Retry same report"); await ready(current.details); }
  finally { remove(); }
};
const limiterKey = () => createHmac("sha256", process.env.AUTH_RATE_LIMIT_SECRET + ":community-reports").update("post-workspace:" + reporter.id).digest("hex");
const restoreLimiter = async () => {
  if (!limiterBefore) return;
  const restored = await db.platformAuthLimit.update({ where: { key: limiterBefore.key }, data: { hits: limiterBefore.hits, expiresAt: limiterBefore.expiresAt } });
  assert.deepEqual(restored, limiterBefore); receipt.limiterChanges.push({ stage: "restore original owned limiter", restored }); limiterBefore = null;
};
const real429 = async () => {
  assert.ok(!limiterBefore);
  limiterBefore = await db.platformAuthLimit.findUniqueOrThrow({ where: { key: limiterKey() } });
  const seeded = await db.platformAuthLimit.update({ where: { key: limiterBefore.key }, data: { hits: 240, expiresAt: new Date(Date.now() + 900000) } });
  receipt.limiterChanges.push({ stage: "saturate only owned report transport limit", before: limiterBefore, seeded });
  const response = page.waitForResponse((response) => command(response.request()));
  await button("Retry same report").click(); const received = await response;
  const result = await received.json();
  receipt.simulations.push({ type: "actual server transport limiter", status: received.status(), retryAfter: received.headers()["retry-after"], result, responseInjected: false });
  assert.equal(received.status(), 429); assert.equal(received.headers()["retry-after"], "900");
  await page.getByText(result.message, { exact: true }).waitFor();
  receipt.limiterChanges.push({ stage: "actual endpoint limiter readback", actual: await db.platformAuthLimit.findUniqueOrThrow({ where: { key: limiterBefore.key } }) });
  assert.equal(receipt.limiterChanges.at(-1).actual.hits, 241);
};
async function setup() {
  stage("seed scoped intake actors and one own reviewer"); await assertPortalTestDatabase(db);
  receipt.database = await db.$queryRaw`SELECT current_database() AS name, host(inet_server_addr()) AS address, inet_server_port() AS port`;
  for (const label of ["intake", "intake_src", "intake_new", "intake_rev"]) {
    const actor = await createPortalActor(db, label);
    receipt.actors.push({ id: actor.id, username: actor.username, name: actor.name, email: actor.email });
    if (label === "intake") reporter = actor; else if (label === "intake_src") author = actor; else if (label === "intake_new") replacement = actor; else reviewer = actor;
    save();
  }
  await seedOperatorGrants(db, reviewer, ["REVIEW_COMMUNITY_REPORTS"]);
  receipt.grants = await db.platformOperatorGrant.findMany({ where: { userId: reviewer.id } });
  assert.equal(await db.platformOperatorGrant.count({ where: { userId: { in: [reporter.id, author.id, replacement.id] } } }), 0);
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
  await login(reporter);
}
async function reproduce() {
  await newTarget("baseline"); stage("accepted create loses acknowledgment"); await lose();
  receipt.before429 = await effects(); assert.equal(receipt.before429.reports.length, 1); assert.equal(receipt.before429.operations.length, 1);
  stage("actual owned transport limiter429"); await real429();
  receipt.after429 = { retryButtons: await button("Retry same report").count(), discardButtons: await button("Discard report").count(), details: await details().inputValue(), effects: await effects() };
  assert.equal(receipt.after429.retryButtons, 0); assert.equal(receipt.after429.discardButtons, 1);
  page.on("dialog", async (dialog) => { receipt.dialogs.push({ type: dialog.type(), message: dialog.message() }); await dialog.dismiss(); });
  stage("discard reports unsent despite accepted durable case"); await button("Discard report").click();
  await page.getByText("Unsent report details discarded.", { exact: true }).waitFor(); await ready();
  receipt.afterDiscard = { message: "Unsent report details discarded.", dialogs: receipt.dialogs.length, effects: await effects() };
  assert.equal(receipt.dialogs.length, 0); assert.equal(receipt.afterDiscard.effects.reports.length, 1); assert.equal(receipt.afterDiscard.effects.operations.length, 1);
  assert.equal(receipt.browserWrites.length, 2); assert.equal(receipt.browserWrites[0].body, receipt.browserWrites[1].body);
  receipt.reproduced = { actualHttp429: true, retryAfter: 900, originalRetryLost: true, unwarnedDiscardClaimsUnsent: true, reports: 1, socialOperations: 1, browserPostAttempts: 2 };
  pass("Actual429 loses accepted create retry and permits false unwarned unsent discard");
}
const event = (name) => page.evaluate((name) => window.dispatchEvent(new Event(name)), name);
const frame = () => page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
const documentUnchanged = async () => assert.equal(await page.evaluate(() => window.__intakeRetryDocument), current.marker);
const attempts = () => receipt.browserWrites.filter((row) => row.path === "/api/platform/community-reports" && JSON.parse(row.body).targetId === current.post.id);
const oneEffect = async () => {
  const actual = await effects(); assert.equal(actual.reports.length, 1); assert.equal(actual.operations.length, 1);
  assert.equal(actual.reports[0].id, current.reportId); assert.equal(actual.reports[0].details, current.details);
  return actual;
};
const exactPending = async (original, count) => {
  await enabled("Retry same report"); await ready(current.details); await documentUnchanged();
  assert.equal(await reason().inputValue(), current.reason);
  assert.equal(await reason().isDisabled(), true); assert.equal(await details().isDisabled(), true);
  assert.equal(await button("Send private report").isDisabled(), true);
  await button("Stop retrying").waitFor();
  assert.equal(attempts().length, count);
  for (const attempt of attempts()) { assert.equal(attempt.body, original); assert.equal(attempt.owner, reporter.id); }
  return oneEffect();
};
const assertCooldown = async () => {
  await page.getByText(/^Try again in \d+ seconds\. Your entries are kept\.$/).waitFor();
  assert.equal(await button("Retry same report").count(), 1);
  assert.equal(await button("Retry same report").isDisabled(), true);
  assert.equal(await button("Send private report").isDisabled(), true);
  assert.equal(await details().isDisabled(), true); assert.equal(await reason().isDisabled(), true);
  const before = receipt.browserWrites.length;
  await details().evaluate((node) => node.form.requestSubmit());
  await button("Retry same report").evaluate((node) => node.click());
  await frame(); assert.equal(receipt.browserWrites.length, before, "Cooldown must prevent original and fresh submissions");
  receipt.observations.push({ label: "actual900-second cooldown enforced", retryDisabled: true, freshDisabled: true, fieldsRetained: true, noAdditionalPost: true }); save();
};
const advanceOwnedCooldown = async () => {
  const expired = await db.platformAuthLimit.update({ where: { key: limiterBefore.key }, data: { expiresAt: new Date(Date.now() - 1000) } });
  receipt.limiterChanges.push({ stage: "expire only owned limiter for fixture continuation", expired });
  await page.evaluate(() => { window.__intakeNativeNow = Date.now; Date.now = () => window.__intakeNativeNow() + 901000; });
  receipt.simulations.push({ type: "browser Date.now advance", milliseconds: 901000, serverClockChanged: false, retryAfterHeaderChanged: false, reason: "Avoid a fifteen-minute test wait after proving the real cooldown" });
  try { await enabled("Retry same report"); await frame(); }
  finally { await page.evaluate(() => { Date.now = window.__intakeNativeNow; delete window.__intakeNativeNow; }); }
};
const absent = async (label) => {
  await page.waitForFunction((marker) => {
    const body = document.body;
    return !body.textContent.includes(marker) &&
      !body.querySelector('[aria-label="Report details"],[aria-label="Report reason"]') &&
      ![...body.querySelectorAll("input,textarea,select")].some((node) => String(node.value).includes(marker)) &&
      ![...body.querySelectorAll("*")].some((node) => [...node.attributes].some((attr) => attr.value.includes(marker)));
  }, current.marker);
  await documentUnchanged();
  receipt.observations.push({ label, physicalFieldsAbsent: true, privateLiveValuesAbsent: true, privateAttributesAbsent: true }); save();
};
const identityCycle = async (original, count) => {
  const before = receipt.browserWrites.length;
  await event("blur"); await absent("existing blur signal conceals pending intake");
  await login(replacement); await event("focus");
  await page.getByText("Your sign-in changed. Reload before continuing.", { exact: true }).waitFor();
  await absent("same-page replacement owner cannot see original private form");
  assert.equal(receipt.browserWrites.length, before);
  await login(reporter); await event("focus"); await exactPending(original, count);
};
const transientFailure = async (original, count) => {
  const remove = oneRoute(async (route) => {
    receipt.simulations.push({ type: "injected unconfirmed503", forwardedToService: false });
    await route.fulfill({ status: 503, contentType: "application/json", headers: { "Cache-Control": "no-store" }, body: JSON.stringify({ message: "Fictional intake response503" }) });
  });
  try { await button("Retry same report").click(); await page.getByText("Fictional intake response503", { exact: true }).waitFor(); }
  finally { remove(); }
  await exactPending(original, count);
};
const keyboardFit = async () => {
  await page.setViewportSize({ width: 320, height: 844 });
  for (const enlarged of [false, true]) {
    const style = enlarged ? await page.addStyleTag({ content: "html{font-size:200%!important}" }) : null;
    try {
      for (const name of ["Retry same report", "Stop retrying"]) {
        const target = button(name);
        await target.focus(); await page.keyboard.press("Tab"); await page.keyboard.press("Shift+Tab");
        await target.evaluate((node) => node.scrollIntoView({ block: "center", inline: "nearest" }));
        const geometry = await target.evaluate((node) => {
          const box = node.getBoundingClientRect(), nav = document.querySelector('nav[aria-label="Platform"]')?.getBoundingClientRect(), style = getComputedStyle(node);
          const hit = document.elementFromPoint((box.left + box.right) / 2, (box.top + box.bottom) / 2);
          return { focused: document.activeElement === node, focusVisible: node.matches(":focus-visible"), outlineStyle: style.outlineStyle, outlineWidth: style.outlineWidth, boxShadow: style.boxShadow,
            centerHit: node === hit || node.contains(hit), top: box.top, bottom: box.bottom, availableBottom: nav?.top ?? innerHeight, viewport: innerWidth, scrollWidth: document.documentElement.scrollWidth };
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
async function verifyOriginal() {
  await newTarget("withdrawal-recovery"); stage("real intake429 preserves original receipt owner"); await lose();
  const original = attempts()[0].body; await oneEffect();
  await real429(); await assertCooldown(); await advanceOwnedCooldown(); await exactPending(original, 2);
  pass("Real429/Retry-After900 preserves original body, owner and private fields with enforced cooldown");
  const { postCommand } = await load("lib/platform/post-commands.ts");
  const body = { operation: "withdraw", mutationId: randomUUID(), postId: current.post.id, expectedVersion: current.post.version, confirmed: true };
  const result = await postCommand(db, author.token, body); receipt.serviceCommands.push({ owner: author.id, body, result });
  const withdrawn = await db.platformPost.findUniqueOrThrow({ where: { id: current.post.id } });
  assert.equal(withdrawn.status, "WITHDRAWN");
  const denied = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/platform/community-reports" && response.request().method() === "GET" && response.status() === 404);
  await button("Check reporting access").click(); const response = await denied;
  receipt.observations.push({ label: "withdrawn source target read", status: response.status(), result: await response.json(), broaderAccessErrorCopyNotChanged: true });
  await exactPending(original, 2);
  await identityCycle(original, 2); await transientFailure(original, 3); await keyboardFit();
  pass("Withdrawn source and changed identity preserve original retry; same owner restores concealed fields without a fresh submission");
  pass("Actual Tab and Shift+Tab reach retry/discard at320px and200-percent text without overflow");
  await button("Retry same report").click();
  const link = page.getByRole("link", { name: "View your private receipt", exact: true }); await link.waitFor();
  assert.equal(new URL(await link.getAttribute("href"), config.origin).searchParams.get("receipt"), current.reportId);
  const actual = await oneEffect(); assert.equal(attempts().length, 4);
  for (const attempt of attempts()) { assert.equal(attempt.body, original); assert.equal(attempt.owner, reporter.id); }
  assert.equal(actual.operations[0].key, "community-report:" + JSON.parse(original).mutationId);
  assert.equal(actual.source.status, "WITHDRAWN"); assert.equal(actual.reports[0].targetVersion, current.post.version);
  receipt.recoveries.push({ type: "original receipt after withdrawal", targetId: current.post.id, reportId: current.reportId, postAttempts: 4, bodySha256: sha(original), originalMutationId: JSON.parse(original).mutationId, reports: 1, reporterSocialOperations: 1 });
  await restoreLimiter();
  pass("Exact original receipt confirms after withdrawal with one report and one reporter SocialOperation");
}
async function verifyDiscard() {
  await newTarget("warned-discard"); stage("warned discard of rate-limited accepted intake"); await lose();
  const original = attempts()[0].body; await real429(); await assertCooldown();
  for (const accepted of [false, true]) {
    const seen = page.waitForEvent("dialog"), click = button("Stop retrying").click(); const dialog = await seen;
    receipt.dialogs.push({ type: dialog.type(), message: dialog.message(), accepted });
    assert.equal(dialog.type(), "confirm"); assert.match(dialog.message(), /may already have been received/);
    if (accepted) await dialog.accept(); else await dialog.dismiss(); await click;
    if (!accepted) { await ready(current.details); assert.equal(await button("Retry same report").count(), 1); assert.equal(await button("Retry same report").isDisabled(), true); }
  }
  await page.getByText("Local retry cleared. Check your private reports to confirm whether it was received.", { exact: true }).waitFor();
  await ready(); assert.equal(await reason().inputValue(), ""); assert.equal(await button("Retry same report").count(), 0);
  assert.equal(await page.getByText("Unsent report details discarded.", { exact: true }).count(), 0);
  assert.equal(attempts().length, 2); assert.equal(attempts()[0].body, original); assert.equal(attempts()[1].body, original);
  await oneEffect(); await restoreLimiter();
  pass("Cancelled warning retains rate-limited retry; accepted discard truthfully clears only the local retry and leaves its report");
}
async function verifyConflict() {
  await newTarget("definitive-conflict"); stage("definitive409 keeps entries until deliberate current target check");
  const changed = await db.platformPost.update({ where: { id: current.post.id }, data: { content: current.marker + " updated source", version: { increment: 1 } } });
  receipt.observations.push({ label: "controlled owned source revision fixture", postId: changed.id, beforeVersion: current.post.version, afterVersion: changed.version });
  const response = page.waitForResponse((response) => command(response.request()) && response.status() === 409);
  await button("Send private report").click();
  const conflict = await (await response).json();
  // The fresh button is already disabled during transport. Observe the actual
  // 409 message after the final identity check, then inspect settled controls.
  await page.getByText(conflict.message, { exact: true }).waitFor();
  await enabled("Check reporting access");
  assert.equal(await button("Send private report").isDisabled(), true);
  await ready(current.details); assert.equal(await reason().inputValue(), current.reason); assert.equal(await button("Retry same report").count(), 0);
  const before = receipt.browserWrites.length; await details().evaluate((node) => node.form.requestSubmit()); await frame(); assert.equal(receipt.browserWrites.length, before);
  assert.equal((await effects()).reports.length, 0); assert.equal((await effects()).operations.length, 0);
  await button("Check reporting access").click(); await ready(current.details); await enabled("Send private report");
  await button("Send private report").click(); const link = page.getByRole("link", { name: "View your private receipt", exact: true }); await link.waitFor();
  current.reportId = new URL(await link.getAttribute("href"), config.origin).searchParams.get("receipt");
  const actual = await oneEffect(); assert.equal(actual.reports[0].targetVersion, changed.version);
  const bodies = attempts().map((attempt) => JSON.parse(attempt.body)); assert.equal(bodies.length, 2);
  assert.notEqual(bodies[0].mutationId, bodies[1].mutationId); assert.equal(bodies[0].expectedTargetVersion, current.post.version); assert.equal(bodies[1].expectedTargetVersion, changed.version);
  pass("Definitive409 keeps details and prevents fresh submission until explicit current-target refresh; intentional new key creates one case");
}
async function run() {
  await setup();
  if (baseline) await reproduce(); else { await verifyOriginal(); await verifyDiscard(); await verifyConflict(); }
  assert.deepEqual(receipt.errors, []); assert.deepEqual(receipt.routeErrors, []); assert.deepEqual(receipt.externalRequests, []);
}
try { await Promise.race([run(), routeFailure]); }
catch (error) {
  failure = error; receipt.failure = { message: String(error), stack: error?.stack };
  if (page) await page.screenshot({ path: output.replace(/\.json$/, "") + "-failure.png", fullPage: true }).catch(() => {});
} finally {
  rules.length = 0;
  if (browser) await browser.close().catch((error) => receipt.errors.push(String(error)));
  try {
    await restoreLimiter();
    for (const row of cases) receipt.effects.push({ marker: row.marker, postId: row.post.id, final: await effects(row) });
    receipt.finalGrants = reviewer ? await db.platformOperatorGrant.findMany({ where: { userId: reviewer.id } }) : [];
    receipt.sinkFiles = readdirSync(resolve(fixture, "sink")).filter((file) => !sinksBefore.has(file));
    receipt.sourceAfter = source(); receipt.sourceUnchanged = JSON.stringify(receipt.sourceBefore) === JSON.stringify(receipt.sourceAfter);
    assert.ok(receipt.sourceUnchanged, "All tracked candidate source and checkout status must remain unchanged");
  } catch (error) { failure ??= error; receipt.readbackError = String(error); }
  await client.$disconnect(); receipt.finishedAt = new Date().toISOString(); receipt.status = failure ? "failed" : "passed"; save();
}
if (failure) throw failure;
console.log("REPORT_INTAKE_RETRY_BROWSER_PASS " + receipt.groups.length + " " + output);
