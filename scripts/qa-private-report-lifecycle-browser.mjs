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
const output = resolve(outputArgument ?? resolve(fixture, "private-report-lifecycle-" + Date.now() + ".json"));
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
  limitations: [
    "Only fictional isolated local data; one own reviewer grant makes intake available.",
    "Browser lifecycle events are synthetic document signals; no physical-device or operating-system snapshot claim.",
    "Held replies and explicitly tagged503/429 responses are controlled transport tests around actual local services.",
    "Actor setup clears isolated PlatformAuthLimit rows; deletion counts are recorded. Use exclusive fixture ownership.",
    "Owned fictional rows and the unchanged intake reviewer grant remain for readback. No production writes or external delivery."
  ]
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
let browser, context, page, reporter, author, replacement, reviewer, current, failure, routeReject;
const cases = [], rules = [], sinksBefore = new Set(readdirSync(resolve(fixture, "sink")));
const routeFailure = new Promise((_, reject) => { routeReject = reject; });
void routeFailure.catch(() => {});
const button = (name) => page.getByRole("button", { name, exact: true });
const details = () => page.getByLabel("Report details", { exact: true });
const reason = () => page.getByLabel("Report reason", { exact: true });
const command = (request) => new URL(request.url()).pathname === "/api/platform/community-reports" && request.method() === "POST";
const login = async (actor) => { await context.clearCookies(); await context.addCookies([{ name: "church_platform_session", value: actor.token,
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
  const marker = "Fictional private report lifecycle " + label + " " + randomUUID();
  const post = await db.platformPost.create({ data: { authorId: author.id, audience: "PUBLIC", content: marker + " source", replyAudience: "VIEWERS", discussionClosed: true } });
  current = { marker, post, reason: "PRIVACY", details: marker + " private submitted context" }; cases.push(current);
  await page.goto(config.origin + "/platform/reports?targetType=POST&targetId=" + post.id, { waitUntil: "domcontentloaded" });
  await page.evaluate((marker) => { window.__intakeRetryDocument = marker; }, marker);
  await ready(); await reason().selectOption(current.reason); await details().fill(current.details); await enabled("Send private report");
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
const event = async (name) => { await page.evaluate((name) => window.dispatchEvent(new Event(name)), name); receipt.simulations.push({ type: "browser lifecycle event", event: name }); };
const frame = () => page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
const receiptLink = () => page.getByRole("link", { name: "View your private receipt", exact: true });
const ownedLinks = () => page.locator('a[href^="/platform/reports?receipt="]');
const reportArticle = () => page.locator('article[aria-label="Private report receipt"]');
const holds = new Set();
const bounded = async (promise, label) => {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(label + " exceeded30 seconds")), 30000); })]); }
  finally { clearTimeout(timer); }
};
const hold = (matches, label) => {
  let used = false, capture, release, delivered;
  const captured = new Promise((done) => { capture = done; }), gate = new Promise((done) => { release = done; }), completed = new Promise((done) => { delivered = done; });
  const rule = { matches: (request) => !used && matches(request), handler: async (route) => {
    used = true; const response = await route.fetch(); assert.equal(response.status(), 200, await response.text());
    const result = await response.json();
    if (command(route.request())) current.reportId = result.id;
    receipt.simulations.push({ type: "held actual response", label, path: new URL(route.request().url()).pathname, status: response.status(), resultId: result.id ?? result.report?.id });
    capture(); await gate; await route.fulfill({ response }); delivered();
  } };
  rules.unshift(rule);
  const item = { captured, completed, release: () => { release(); const i = rules.indexOf(rule); if (i >= 0) rules.splice(i, 1); holds.delete(item); } };
  holds.add(item); return item;
};
const targetRead = (request) => {
  const url = new URL(request.url());
  return request.method() === "GET" && url.pathname === "/api/platform/community-reports" && url.searchParams.get("view") === "target" && url.searchParams.get("targetId") === current.post.id;
};
const observe = async (label) => {
  const actual = await page.evaluate(({ marker, postId, reportId }) => ({
    markerInText: document.body.textContent.includes(marker),
    markerInLiveValues: [...document.querySelectorAll("input,textarea,select")].some((node) => String(node.value).includes(marker)),
    privateInputCount: document.querySelectorAll('[aria-label="Report details"],[aria-label="Report reason"]').length,
    targetLinks: [...document.querySelectorAll("a[href]")].filter((node) => node.getAttribute("href").includes(postId)).length,
    selectedReceiptLinks: reportId ? [...document.querySelectorAll("a[href]")].filter((node) => node.getAttribute("href").includes("receipt=" + reportId)).length : 0,
    reportArticles: document.querySelectorAll('article[aria-label="Private report receipt"]').length,
    ownReceiptLinks: document.querySelectorAll('a[href^="/platform/reports?receipt="]').length
  }), { marker: current.marker, postId: current.post.id, reportId: current.reportId });
  receipt.observations.push({ label, ...actual }); save(); return actual;
};
const identityRead = (request) => {
  const url = new URL(request.url());
  return request.method() === "GET" && url.pathname === "/api/platform/profile" && url.searchParams.get("view") === "identity";
};
const reportRead = (view, id) => (request) => {
  const url = new URL(request.url());
  return request.method() === "GET" && url.pathname === "/api/platform/community-reports" && url.searchParams.get("view") === view && (!id || url.searchParams.get("id") === id);
};
const oneRead = (matches, handler) => {
  let used = false;
  const rule = { matches: (request) => !used && matches(request), handler: async (route) => { used = true; await handler(route); } };
  rules.unshift(rule);
  return () => { const i = rules.indexOf(rule); if (i >= 0) rules.splice(i, 1); };
};
const documentUnchanged = async () => assert.equal(await page.evaluate(() => window.__intakeRetryDocument), current.marker);
const stamp = () => page.evaluate((marker) => { window.__intakeRetryDocument = marker; }, current.marker);
const attempts = () => receipt.browserWrites.filter((row) => row.path === "/api/platform/community-reports" && JSON.parse(row.body).targetId === current.post.id);
const countReads = (view) => receipt.requests.filter((row) => row.method === "GET" && row.path.startsWith("/api/platform/community-reports?") && new URL(row.path, config.origin).searchParams.get("view") === view).length;
const absent = async (label) => {
  await page.waitForFunction(({ marker, postId, reportId }) => {
    const body = document.body;
    return !body.textContent.includes(marker) && !body.querySelector('[aria-label="Report details"],[aria-label="Report reason"],[aria-label="Selected report evidence"],article[aria-label="Private report receipt"],a[href^="/platform/reports?receipt="]') &&
      ![...body.querySelectorAll("input,textarea,select")].some((node) => String(node.value).includes(marker)) &&
      ![...body.querySelectorAll("a[href]")].some((node) => node.getAttribute("href").includes(postId) || (reportId && node.getAttribute("href").includes(reportId))) &&
      ![...body.querySelectorAll("*")].some((node) => [...node.attributes].some((attr) => attr.value.includes(marker)));
  }, { marker: current.marker, postId: current.post.id, reportId: current.reportId });
  await documentUnchanged();
  const actual = await observe(label);
  assert.equal(actual.markerInText, false); assert.equal(actual.markerInLiveValues, false);
  assert.equal(actual.privateInputCount + actual.targetLinks + actual.selectedReceiptLinks + actual.reportArticles + actual.ownReceiptLinks, 0);
};
const visibility = async (state) => {
  await page.evaluate((state) => { Object.defineProperty(document, "visibilityState", { configurable: true, value: state }); document.dispatchEvent(new Event("visibilitychange")); }, state);
  receipt.simulations.push({ type: "document visibility override and event", state });
};
const lateGuard = async (label, release) => {
  await page.evaluate(() => {
    window.__privateLifecycleLeaks = [];
    window.__privateLifecycleObserver = new MutationObserver(() => {
      if (document.querySelector('[aria-label="Report details"],[aria-label="Report reason"],[aria-label="Selected report evidence"],article[aria-label="Private report receipt"],a[href^="/platform/reports?receipt="]')) window.__privateLifecycleLeaks.push("private element attached");
    });
    window.__privateLifecycleObserver.observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true });
  });
  try {
    const checked = page.waitForResponse((response) => identityRead(response.request()));
    release(); await checked; await frame(); await absent(label);
    assert.deepEqual(await page.evaluate(() => window.__privateLifecycleLeaks), []);
  } finally { await page.evaluate(() => { window.__privateLifecycleObserver.disconnect(); delete window.__privateLifecycleObserver; }); }
};
const unchangedDraft = async () => {
  await ready(current.details); await documentUnchanged(); assert.equal(await reason().inputValue(), current.reason);
};
const exactPending = async (original, count) => {
  await enabled("Retry same report"); await unchangedDraft();
  assert.equal(await details().isDisabled(), true); assert.equal(await reason().isDisabled(), true); assert.equal(await button("Send private report").isDisabled(), true);
  assert.equal(attempts().length, count);
  for (const attempt of attempts()) { assert.equal(attempt.body, original); assert.equal(attempt.owner, reporter.id); }
};
const oneEffect = async () => {
  const actual = await effects(); assert.equal(actual.reports.length, 1); assert.equal(actual.operations.length, 1);
  assert.equal(actual.reports[0].id, current.reportId); assert.equal(actual.reports[0].details, current.details);
  return actual;
};
const withdraw = async () => {
  const { postCommand } = await load("lib/platform/post-commands.ts");
  const body = { operation: "withdraw", mutationId: randomUUID(), postId: current.post.id, expectedVersion: current.post.version, confirmed: true };
  const result = await postCommand(db, author.token, body); receipt.serviceCommands.push({ owner: author.id, body, result });
  assert.equal((await db.platformPost.findUniqueOrThrow({ where: { id: current.post.id } })).status, "WITHDRAWN");
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
async function reproduce() {
  await newTarget("baseline-private"); stage("draft and target offline/pagehide retention");
  for (const signal of ["offline", "pagehide"]) {
    await event(signal); await frame(); const actual = await observe("baseline draft " + signal);
    assert.equal(actual.privateInputCount, 2); assert.equal(actual.markerInLiveValues, true); assert.ok(actual.targetLinks > 0);
  }
  pass("Unchanged intake retains draft live values and target links after offline and pagehide");
  stage("success receipt link offline/pagehide retention");
  const received = page.waitForResponse((response) => command(response.request()) && response.status() === 200);
  await button("Send private report").click(); current.reportId = (await (await received).json()).id; await receiptLink().waitFor();
  for (const signal of ["offline", "pagehide"]) {
    await event(signal); await frame(); const actual = await observe("baseline success receipt " + signal); assert.equal(actual.selectedReceiptLinks, 1);
  }
  pass("Unchanged successful intake retains private receipt link after offline and pagehide");
  stage("own receipt list and detail offline/pagehide retention");
  await page.goto(config.origin + "/platform/reports", { waitUntil: "domcontentloaded" }); await ownedLinks().first().waitFor();
  for (const signal of ["offline", "pagehide"]) {
    await event(signal); await frame(); const actual = await observe("baseline own list " + signal); assert.equal(actual.selectedReceiptLinks, 1);
  }
  pass("Unchanged own receipt list retains private receipt links after offline and pagehide");
  await page.goto(config.origin + "/platform/reports?receipt=" + current.reportId, { waitUntil: "domcontentloaded" }); await reportArticle().waitFor();
  for (const signal of ["offline", "pagehide"]) {
    await event(signal); await frame(); const actual = await observe("baseline own detail " + signal); assert.equal(actual.reportArticles, 1); assert.equal(actual.markerInText, true);
  }
  pass("Unchanged own receipt detail retains submitted private body after offline and pagehide");
  await newTarget("baseline-late-save"); stage("queued refresh from accepted response reopens after second blur");
  const submission = hold(command, "accepted intake response"), source = hold(targetRead, "queued target read after second blur");
  try {
    await button("Send private report").click(); await bounded(submission.captured, "accepted submission capture");
    await event("blur"); await details().waitFor({ state: "detached" });
    await event("focus"); await event("blur"); await frame();
    const concealed = await observe("second blur before late save release"); assert.equal(concealed.privateInputCount, 0);
    submission.release(); await bounded(submission.completed, "accepted response release");
    await bounded(source.captured, "unwanted queued target read while blurred");
    source.release(); await ready(current.details); await enabled("Retry same report");
    const reopened = await observe("late accepted response queued refresh reopens while blurred");
    assert.equal(reopened.privateInputCount, 2); assert.equal(reopened.markerInLiveValues, true); assert.ok(reopened.targetLinks > 0);
    const actual = await effects(); assert.equal(actual.reports.length, 1); assert.equal(actual.operations.length, 1);
  } finally { submission.release(); source.release(); }
  assert.equal(receipt.browserWrites.length, 2);
  pass("Accepted response finally starts queued refresh after second blur and physically re-reveals retained private draft");
}
async function verifyDraft() {
  await newTarget("controlled-draft"); stage("controlled draft lifecycle and held owner/source reads");
  for (const [hide, resume] of [["offline", "online"], ["pagehide", "pageshow"], ["blur", "focus"]]) {
    await event(hide); await absent("draft " + hide);
    const reads = countReads("target"), writes = receipt.browserWrites.length;
    await button("Check reporting access").evaluate((node) => node.click()); await frame();
    assert.equal(countReads("target"), reads, "Inactive refresh does not start a target read"); assert.equal(receipt.browserWrites.length, writes);
    const identity = hold(identityRead, "draft owner validation on " + resume);
    try {
      await event(resume); await bounded(identity.captured, "draft owner capture"); await absent("draft held owner on " + resume);
      identity.release(); await unchangedDraft(); await enabled("Send private report");
    } finally { identity.release(); }
  }
  await visibility("hidden"); await absent("draft hidden visibility"); await visibility("visible"); await unchangedDraft();
  await page.evaluate(() => { delete document.visibilityState; });
  pass("Draft, live values and target physically conceal on lifecycle signals; same owner restores controlled entries only after revalidation");

  await event("blur"); await absent("draft before held source read");
  const source = hold(targetRead, "draft source read concealed before late response"), readCount = countReads("target");
  try {
    await event("focus"); await bounded(source.captured, "draft source capture"); await absent("draft source held");
    await event("focus"); await event("online"); await frame(); assert.equal(countReads("target"), readCount + 1, "Overlapping resume signals coalesce the active source read");
    await event("pagehide"); await absent("draft pagehide during held source");
    await lateGuard("draft late source cannot attach private fields", source.release);
  } finally { source.release(); }
  await event("pageshow"); await unchangedDraft();
  await event("blur"); await absent("draft before failed source owner fallback");
  let identityCount = 0;
  const fallback = hold((request) => identityRead(request) && ++identityCount === 3, "same owner fallback after source503");
  const remove = oneRead(targetRead, async (route) => {
    receipt.simulations.push({ type: "injected source503", forwardedToService: false });
    await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ message: "Fictional source temporarily unavailable" }) });
  });
  try {
    await event("focus"); await bounded(fallback.captured, "source error fallback owner capture"); await absent("source503 held final owner validation");
    fallback.release(); await unchangedDraft(); await enabled("Check reporting access");
    assert.equal(await button("Send private report").isDisabled(), true);
    assert.equal((await observe("source503 restores only own controlled draft")).targetLinks, 0);
  } finally { fallback.release(); remove(); }
  await event("blur"); await absent("draft before same-page account replacement"); await login(replacement); await event("focus");
  await page.getByText("Your sign-in changed. Reload before continuing.", { exact: true }).waitFor(); await absent("replacement owner cannot reveal original draft");
  await login(reporter); await event("focus"); await unchangedDraft(); await enabled("Send private report");
  assert.equal(receipt.browserWrites.length, 0);
  pass("Held and failed source reads do not reveal stale data; owner fallback keeps only own draft and replacement account stays concealed");
  await button("Discard report").click(); await ready();
}
async function verifyPendingAndSuccess() {
  await newTarget("accepted-pending"); stage("late accepted submission clears queued refresh on second conceal");
  const submission = hold(command, "accepted intake held across two conceal cycles");
  try {
    await button("Send private report").click(); await bounded(submission.captured, "accepted submission");
    await event("blur"); await absent("pending first blur"); await event("focus"); await event("blur"); await absent("pending second blur");
    const reads = countReads("target");
    await lateGuard("late accepted submission remains concealed after second blur", submission.release);
    assert.equal(countReads("target"), reads, "Conceal cancels queued refresh; completion must not start a background target read");
  } finally { submission.release(); }
  const original = attempts()[0].body; await oneEffect();
  await event("focus"); await exactPending(original, 1);
  pass("Late accepted submission cannot restart a cleared queued read or reveal fields; same owner retains the exact pending body");

  stage("pending cooldown, same-page replacement and withdrawn target receipt recovery");
  const remove = oneRoute(async (route) => {
    receipt.simulations.push({ type: "injected429 cooldown around accepted original receipt", retryAfter: 60, forwardedToService: false });
    await route.fulfill({ status: 429, headers: { "Retry-After": "60" }, contentType: "application/json", body: JSON.stringify({ message: "Fictional lifecycle cooldown" }) });
  });
  try { await button("Retry same report").click(); await page.getByText(/^Try again in \d+ seconds\. Your entries are kept\.$/).waitFor(); }
  finally { remove(); }
  await event("offline"); await absent("cooldown offline"); await event("online"); await unchangedDraft();
  assert.equal(await button("Retry same report").isDisabled(), true);
  assert.equal(await button("Send private report").isDisabled(), true);
  const writes = receipt.browserWrites.length;
  await details().evaluate((node) => node.form.requestSubmit()); await button("Retry same report").evaluate((node) => node.click()); await frame(); assert.equal(receipt.browserWrites.length, writes);
  receipt.observations.push({ label: "cooldown preserved across offline and owner recheck", kind: "control state", retryDisabled: true, freshDisabled: true, noAdditionalPost: true });
  await event("pagehide"); await absent("cooldown pagehide"); await event("pageshow"); await unchangedDraft();
  assert.equal(await button("Retry same report").isDisabled(), true);
  await event("blur"); await absent("pending before replacement account"); await login(replacement); await event("focus");
  await page.getByText("Your sign-in changed. Reload before continuing.", { exact: true }).waitFor(); await absent("pending replacement account");
  await login(reporter); await event("focus"); await unchangedDraft();
  await page.evaluate(() => { window.__privateLifecycleNow = Date.now; Date.now = () => window.__privateLifecycleNow() + 61000; });
  receipt.simulations.push({ type: "browser Date.now advance", milliseconds: 61000, serverClockChanged: false, reason: "Expire the explicitly injected60-second cooldown without a minute wait" });
  try { await exactPending(original, 2); }
  finally { await page.evaluate(() => { Date.now = window.__privateLifecycleNow; delete window.__privateLifecycleNow; }); }
  await withdraw();
  const denied = page.waitForResponse((response) => targetRead(response.request()) && response.status() === 404);
  await button("Check reporting access").click(); await denied; await exactPending(original, 2);
  assert.equal((await observe("withdrawn target leaves own original retry without a target link")).targetLinks, 0);
  await keyboardFit();
  pass("Cooldown, account replacement and source withdrawal preserve original pending bytes with no fresh submission; four actual narrow/enlarged keyboard captures pass");
  await button("Retry same report").click(); await receiptLink().waitFor();
  assert.equal(new URL(await receiptLink().getAttribute("href"), config.origin).searchParams.get("receipt"), current.reportId);
  await oneEffect(); assert.equal(attempts().length, 3);
  for (const attempt of attempts()) { assert.equal(attempt.body, original); assert.equal(attempt.owner, reporter.id); }

  stage("acknowledged receipt resume uses own receipt instead of withdrawn source");
  for (const [hide, resume] of [["offline", "online"], ["pagehide", "pageshow"]]) {
    await event(hide); await absent("success " + hide);
    const held = hold(reportRead("receipt", current.reportId), "success own receipt recheck " + resume), targetReads = countReads("target");
    try {
      await event(resume); await bounded(held.captured, "success receipt capture"); await absent("success held receipt " + resume);
      held.release(); await receiptLink().waitFor(); assert.equal(countReads("target"), targetReads);
      assert.equal(new URL(await receiptLink().getAttribute("href"), config.origin).searchParams.get("receipt"), current.reportId);
      assert.equal(await details().count(), 0);
    } finally { held.release(); }
  }
  await event("blur"); await absent("success before failed receipt read");
  const failReceipt = oneRead(reportRead("receipt", current.reportId), async (route) => {
    receipt.simulations.push({ type: "injected success receipt503", forwardedToService: false });
    await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ message: "Fictional own receipt temporarily unavailable" }) });
  });
  try { await event("focus"); await page.getByText("Fictional own receipt temporarily unavailable", { exact: true }).waitFor(); await absent("success failed receipt remains concealed"); }
  finally { failReceipt(); }
  await event("focus"); await receiptLink().waitFor();
  await event("blur"); await absent("success before replacement account"); await login(replacement); await event("focus");
  await page.getByText("Your sign-in changed. Reload before continuing.", { exact: true }).waitFor(); await absent("success replacement account");
  await login(reporter); await event("focus"); await receiptLink().waitFor(); await documentUnchanged();
  assert.equal(attempts().length, 3); await oneEffect();
  receipt.recoveries.push({ type: "accepted original receipt survives all lifecycle recovery", reportId: current.reportId, bodySha256: sha(original), mutationId: JSON.parse(original).mutationId, postAttempts: 3, reports: 1, reporterSocialOperations: 1, sourceStatus: "WITHDRAWN" });
  pass("Acknowledged success ID stays concealed until own receipt revalidates, survives source withdrawal and temporary failures, and never becomes a fresh report");
}
async function verifyReceipts() {
  stage("own receipt detail lifecycle, held reads and account replacement");
  await page.goto(config.origin + "/platform/reports?receipt=" + current.reportId, { waitUntil: "domcontentloaded" }); await stamp(); await reportArticle().waitFor();
  for (const [hide, resume] of [["offline", "online"], ["pagehide", "pageshow"]]) {
    await event(hide); await absent("own detail " + hide); await event(resume); await reportArticle().waitFor(); assert.match(await reportArticle().innerText(), new RegExp(current.marker));
  }
  await event("blur"); await absent("own detail before held receipt");
  const held = hold(reportRead("receipt", current.reportId), "own detail late read"), reads = countReads("receipt");
  try {
    await event("focus"); await bounded(held.captured, "own detail response capture"); await absent("own detail held response");
    await event("focus"); await event("online"); await frame(); assert.equal(countReads("receipt"), reads + 1);
    await event("pagehide"); await absent("own detail pagehide with response held");
    await lateGuard("own detail late response cannot attach private body", held.release);
  } finally { held.release(); }
  await event("pageshow"); await reportArticle().waitFor();
  await event("blur"); await absent("own detail before failed recheck");
  const remove = oneRead(reportRead("receipt", current.reportId), async (route) => {
    receipt.simulations.push({ type: "injected own detail503", forwardedToService: false });
    await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ message: "Fictional detail temporarily unavailable" }) });
  });
  try { await event("focus"); await page.getByText("Fictional detail temporarily unavailable", { exact: true }).waitFor(); await absent("own detail failed recheck"); }
  finally { remove(); }
  await event("focus"); await reportArticle().waitFor();
  await event("blur"); await absent("own detail before replacement"); await login(replacement); await event("focus");
  await page.getByText("Your sign-in changed. Reload before continuing.", { exact: true }).waitFor(); await absent("own detail replacement account");
  await login(reporter); await event("focus"); await reportArticle().waitFor(); await documentUnchanged();
  pass("Own receipt detail physically clears on lifecycle loss; stale, failed and replacement-account reads cannot reveal its private body");

  stage("actual31-row own receipt pagination with lifecycle recovery");
  const post = await db.platformPost.create({ data: { authorId: author.id, audience: "PUBLIC", content: current.marker + " pagination fixture", replyAudience: "VIEWERS", discussionClosed: true } });
  const pagination = { marker: current.marker + " pagination", post, fixtureOnly: true }; cases.push(pagination);
  const previousCount = await db.communityReport.count({ where: { reporterId: reporter.id } });
  assert.equal(previousCount, 1);
  receipt.paginationFixture = { targetId: post.id, rows: [], purpose: "Thirty explicit metadata rows for actual30-row API paging, not user submissions or receipt-producing commands" };
  for (let version = 1; version <= 30; version++) {
    const row = await db.communityReport.create({ data: { reporterId: reporter.id, targetType: "POST", targetId: post.id, targetVersion: version, reason: "PRIVACY", details: "Fictional pagination metadata " + version,
      createdAt: new Date(Date.now() - (version + 1) * 60000) } });
    receipt.paginationFixture.rows.push({ id: row.id, targetVersion: row.targetVersion });
  }
  await page.goto(config.origin + "/platform/reports", { waitUntil: "domcontentloaded" }); await stamp();
  await page.waitForFunction(() => document.querySelectorAll('a[href^="/platform/reports?receipt="]').length === 30);
  const first = await ownedLinks().evaluateAll((nodes) => nodes.map((node) => node.getAttribute("href")));
  const older = page.getByRole("link", { name: "Older private reports", exact: true }), olderHref = await older.getAttribute("href");
  for (const [hide, resume] of [["offline", "online"], ["pagehide", "pageshow"]]) {
    await event(hide); await absent("own list " + hide); assert.equal(await older.count(), 0);
    await event(resume); await older.waitFor(); assert.deepEqual(await ownedLinks().evaluateAll((nodes) => nodes.map((node) => node.getAttribute("href"))), first);
  }
  await event("blur"); await absent("own list before held read");
  const list = hold(reportRead("mine"), "own list read released after offline");
  try {
    await event("focus"); await bounded(list.captured, "own list response"); await absent("own list held response");
    await event("offline"); await lateGuard("own list late response cannot attach private links", list.release);
  } finally { list.release(); }
  await event("online"); await older.waitFor(); await older.click();
  await page.waitForURL((url) => url.searchParams.get("after") === new URL(olderHref, config.origin).searchParams.get("after")); await stamp();
  await page.waitForFunction(() => document.querySelectorAll('a[href^="/platform/reports?receipt="]').length === 1);
  const second = await ownedLinks().evaluateAll((nodes) => nodes.map((node) => node.getAttribute("href")));
  assert.equal(new Set([...first, ...second]).size, 31); assert.equal(await older.count(), 0);
  const cursor = new URL(page.url()).searchParams.get("after");
  await event("pagehide"); await absent("own older page pagehide"); await event("pageshow"); await ownedLinks().waitFor();
  assert.deepEqual(await ownedLinks().evaluateAll((nodes) => nodes.map((node) => node.getAttribute("href"))), second);
  assert.equal(new URL(page.url()).searchParams.get("after"), cursor);
  await event("blur"); await absent("own older page before replacement"); await login(replacement); await event("focus");
  await page.getByText("Your sign-in changed. Reload before continuing.", { exact: true }).waitFor(); await absent("own older page replacement account");
  await login(reporter); await event("focus"); await ownedLinks().waitFor(); await documentUnchanged();
  assert.deepEqual(await ownedLinks().evaluateAll((nodes) => nodes.map((node) => node.getAttribute("href"))), second);
  receipt.pagination = { firstPage: first, secondPage: second, totalDistinct: 31, cursor, finalUrl: page.url(), preservedAfterResume: true };
  assert.equal(receipt.browserWrites.length, 3);
  pass("Actual own list uses30-row paging with31 distinct scoped receipts; conceal, late reads and account replacement preserve the selected cursor without exposing rows");
}
async function run() {
  await setup();
  if (baseline) await reproduce(); else { await verifyDraft(); await verifyPendingAndSuccess(); await verifyReceipts(); }
  assert.deepEqual(receipt.errors, []); assert.deepEqual(receipt.routeErrors, []); assert.deepEqual(receipt.externalRequests, []);
}
try { await Promise.race([run(), routeFailure]); }
catch (error) {
  failure = error; receipt.failure = { message: String(error), stack: error?.stack };
  if (page) await page.screenshot({ path: output.replace(/\.json$/, "") + "-failure.png", fullPage: true }).catch(() => {});
} finally {
  for (const item of holds) item.release();
  rules.length = 0;
  if (browser) await browser.close().catch((error) => receipt.errors.push(String(error)));
  try {
    for (const row of cases) receipt.effects.push({ marker: row.marker, postId: row.post.id, final: await effects(row) });
    receipt.finalGrants = reviewer ? await db.platformOperatorGrant.findMany({ where: { userId: reviewer.id } }) : [];
    receipt.sinkFiles = readdirSync(resolve(fixture, "sink")).filter((file) => !sinksBefore.has(file));
    receipt.sourceAfter = source(); receipt.sourceUnchanged = JSON.stringify(receipt.sourceBefore) === JSON.stringify(receipt.sourceAfter);
    assert.ok(receipt.sourceUnchanged, "All tracked candidate source and checkout status must remain unchanged");
  } catch (error) { failure ??= error; receipt.readbackError = String(error); }
  await client.$disconnect(); receipt.finishedAt = new Date().toISOString(); receipt.status = failure ? "failed" : "passed"; save();
}
if (failure) throw failure;
console.log("PRIVATE_REPORT_LIFECYCLE_BROWSER_PASS " + receipt.groups.length + " " + output);
