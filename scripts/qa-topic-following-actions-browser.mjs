// Run from the inspected application checkout with Node 24 and tests/register.mjs.
// Arguments: isolated fixture directory, optional new evidence directory.
import assert from "node:assert/strict";
import { createHash, createHmac, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { request as httpsRequest } from "node:https";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { sessionCookieFixtureName } from "./session-cookie-fixture.mjs";

assert.ok(process.argv[2], "Pass an existing isolated fixture directory");
const cwd = process.cwd(), fixture = resolve(process.argv[2]);
const config = JSON.parse(readFileSync(join(fixture, "browser-env.json"), "utf8"));
assert.match(config.origin, /^https:\/\/127\.0\.0\.1:\d+$/);
assert.equal(new URL(config.database).hostname, "127.0.0.1");
assert.match(new URL(config.database).pathname, /^\/godschurches_security_test(?:_restore)?$/);
const certificate = existsSync(resolve(config.certificate))
  ? resolve(config.certificate) : resolve(fixture, config.certificate);
const output = resolve(process.argv[3] ?? join(fixture, `topic-following-actions-${Date.now()}`));
assert.equal(existsSync(output), false, "Use a new output directory to preserve prior attempts");
mkdirSync(output, { recursive: true, mode: 0o700 });
const sink = join(output, "sink");
mkdirSync(sink, { mode: 0o700 });
Object.assign(process.env, {
  DATABASE_URL: config.database, DIRECT_URL: config.database,
  ACCOUNT_ORIGIN: config.origin, NEXT_PUBLIC_SITE_URL: config.origin,
  NODE_ENV: "test", VERCEL: "", ACCOUNT_TEST_ISOLATED: "1",
  ACCOUNT_DELIVERY_MODE: "test-sink", ACCOUNT_TEST_SINK_DIR: sink,
  AUTH_RATE_LIMIT_SECRET: process.env.AUTH_RATE_LIMIT_SECRET ?? "medium-fixture-only-secret-".repeat(3),
  PRIVILEGED_MFA_MODE: "off"
});
const require = createRequire(join(cwd, "package.json"));
const { PrismaClient } = require("@prisma/client");
const moduleAt = (path) => import(pathToFileURL(join(cwd, path)).href);
const { assertPortalTestDatabase } = await moduleAt("tests/seed-portal.ts");
const { registerAccount, loginAccount } = await moduleAt("lib/platform/accounts.ts");
const { accountConfig } = await moduleAt("lib/platform/account-config.ts");
const { ADULT_POLICY } = await moduleAt("lib/platform/portal-types.ts");
const { topicCommand } = await moduleAt("lib/platform/topic-communities.ts");
const { postCommand } = await moduleAt("lib/platform/post-commands.ts");
const { participationCommand } = await moduleAt("lib/platform/post-participation.ts");
const { getPostParticipation } = await moduleAt("lib/platform/post-participation-reads.ts");
const db = new PrismaClient();
const sha = (value) => createHash("sha256").update(value).digest("hex");
const json = (value) => JSON.stringify(value, (_, item) => typeof item === "bigint" ? String(item) : item, 2);
const save = (name, value) => writeFileSync(join(output, name), json(value) + "\n", { mode: 0o600 });
function sourceProof() {
  const source = execFileSync("git", ["rev-parse", "HEAD"], { cwd, encoding: "utf8" }).trim();
  const files = execFileSync("git", ["ls-files", "-z"], { cwd, encoding: "utf8" })
    .split("\0").filter(Boolean).sort();
  const hashes = Object.fromEntries(files.map(path => [path, sha(readFileSync(join(cwd, path)))]));
  return { source, files: files.length, manifest: sha(JSON.stringify(hashes)), hashes };
}
const before = sourceProof();
if (process.env.QA_EXPECTED_SOURCE) assert.equal(before.source, process.env.QA_EXPECTED_SOURCE);
if (process.env.QA_EXPECTED_FILE_COUNT) assert.equal(before.files, Number(process.env.QA_EXPECTED_FILE_COUNT));
save("source-before.json", before);
const startedAt = new Date().toISOString(), results = [], observations = [], rsc = [], requests = [],
  posts = [], errors = [], external = [], routeErrors = [], requestFailures = [], fixtureWrites = [], captures = [];
let browser, page, context, current, privateMarkers = [], sourceAfter, effectReadback;
const releases = new Set();
const path = "/platform/topics/following";
const participationURL = url => url.pathname === "/api/platform/participation";
const prayerURL = url => url.pathname === "/api/platform/prayers";
const button = name => page.getByRole("button", { name, exact: true });
const pulse = name => page.evaluate(n => window.dispatchEvent(new Event(n)), name);
const waitUntil = async (predicate, label, timeout = 20000) => {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (await predicate()) return;
    await new Promise(resolveWait => setTimeout(resolveWait, 50));
  }
  throw Error(label);
};
const bounded = (promise, label, timeout = 25000) => {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => {
    timer = setTimeout(() => reject(Error(label)), timeout);
  })]).finally(() => clearTimeout(timer));
};
function pass(message) {
  results.push(message);
  console.log("PASS " + message);
  save("progress.json", { at: new Date().toISOString(), results, observations, rsc, posts, fixtureWrites });
}
async function actor(label) {
  const tag = randomUUID().replaceAll("-", "").slice(0, 10), username = `ta_${label}_${tag}`,
    password = `Fictional-only-${randomUUID()}`, email = username + "@example.test";
  const made = await registerAccount(db, {
    name: `Fictional participation ${label} ${tag}`, username, email,
    password, confirmPassword: password, role: "BELIEVER"
  });
  fixtureWrites.push({ operation: "register fictional account", owner: made.id });
  await db.platformUser.update({ where: { id: made.id }, data: {
    emailVerifiedAt: new Date(), adultAcknowledgedAt: new Date(),
    adultPolicyVersion: ADULT_POLICY, metricExcluded: true
  } });
  fixtureWrites.push({ operation: "fixture-only verification/adult/metric flags", owner: made.id, rows: 1 });
  const token = await loginAccount(db, email, password, "following-actions-" + tag);
  fixtureWrites.push({ operation: "login fictional account", owner: made.id });
  return { id: made.id, token };
}
async function signIn(actor) {
  await context.clearCookies();
  await context.addCookies([{
    name: sessionCookieFixtureName(config.origin), value: actor.token, url: config.origin,
    secure: true, httpOnly: true, sameSite: "Lax"
  }]);
}
async function forwarded(route) {
  const request = route.request(), url = new URL(request.url());
  assert.equal(url.origin, config.origin);
  const headers = { ...await request.allHeaders() };
  delete headers["accept-encoding"];
  return new Promise((resolveResponse, reject) => {
    const outgoing = httpsRequest(url, {
      method: request.method(), headers, ca: readFileSync(certificate), agent: false, timeout: 20000
    }, incoming => {
      const chunks = [];
      incoming.on("data", chunk => chunks.push(chunk));
      incoming.on("error", reject);
      incoming.on("end", () => resolveResponse({
        status: incoming.statusCode,
        headers: Object.fromEntries(Object.entries(incoming.headers)
          .filter(([name]) => !["connection", "transfer-encoding", "content-length"].includes(name))
          .map(([name, value]) => [name, Array.isArray(value) ? value.join(", ") : String(value)])),
        body: Buffer.concat(chunks)
      }));
    });
    outgoing.on("timeout", () => outgoing.destroy(Error("Owned HTTPS forwarding timeout")));
    outgoing.on("error", reject);
    outgoing.end(request.postDataBuffer() ?? undefined);
  });
}
async function absent(label, extra = []) {
  const markers = [...privateMarkers, ...extra];
  await waitUntil(() => page.evaluate(values => {
    const html = document.documentElement.outerHTML;
    const inputs = [...document.querySelectorAll("input, textarea, select")].map(n => n.value);
    return !values.some(value => html.includes(value) || inputs.some(input => input.includes(value)));
  }, markers), `Private DOM or live input remains: ${label}`);
  const found = await page.evaluate(() => ({
    pollInputs: document.querySelectorAll('input[name="optionIds"]').length,
    prayerInputs: document.querySelectorAll('dialog textarea').length,
    openDialogs: document.querySelectorAll("dialog[open]").length
  }));
  assert.equal(found.pollInputs, 0);
  assert.equal(found.prayerInputs, 0);
  observations.push({ label, physicalDOM: true, checkedMarkers: markers.length, ...found });
}
const pollChoice = () => page.getByRole("radio", { name: new RegExp("^" + current.optionB) });
async function resume(name = "focus") {
  await pulse(name);
  await page.getByRole("heading", { name: current.question, exact: true }).waitFor();
}
async function refreshAs(owner) {
  await signIn(owner);
  const completed = Promise.withResolvers();
  let handled = false;
  const match = url => url.pathname === path;
  const handler = async route => {
    if (handled || route.request().headers().rsc !== "1") return route.fallback();
    handled = true;
    try {
      const response = await forwarded(route), body = response.body.toString("utf8");
      assert.equal(response.status, 200);
      assert.match(response.headers["content-type"], /text\/x-component/);
      assert.ok(body.includes(owner.id), "Actual cookie owner must be represented in RSC");
      for (const marker of privateMarkers) assert.equal(body.includes(marker), false, "Private selection must not enter RSC");
      await route.fulfill(response);
      completed.resolve({ owner: owner.id, bytes: response.body.length, sha256: sha(response.body) });
    } catch (error) { routeErrors.push(String(error)); await route.abort().catch(() => {}); completed.reject(error); }
  };
  await page.route(match, handler);
  try {
    await page.evaluate(() => {
      if (typeof window.next?.router?.refresh !== "function") throw Error("Actual Next router required");
      window.next.router.refresh();
    });
    rsc.push(await bounded(completed.promise, "Actual account-changing RSC refresh did not settle"));
  } finally { await page.unroute(match, handler); }
}
async function effects() {
  if (!current) return null;
  const ids = [current.a.id, current.b.id];
  return {
    actors: await db.platformUser.count({ where: { id: { in: ids } } }),
    topic: await db.topicCommunity.count({ where: { id: current.topic.id } }),
    posts: await db.platformPost.count({ where: { id: current.post.id } }),
    memberships: await db.topicMembership.count({ where: { communityId: current.topic.id, userId: { in: ids } } }),
    poll: await db.postPoll.count({ where: { postId: current.post.id } }),
    pollOptions: await db.postPollOption.count({ where: { pollId: current.pollId } }),
    ballots: await db.postPollBallot.findMany({ where: { pollId: current.pollId }, select: { id: true, userId: true, optionIds: true, version: true } }),
    ballotAudits: await db.postAudit.findMany({ where: { postId: current.post.id, action: "ballot-saved" }, select: { id: true, actorId: true, targetId: true, version: true } }),
    postAudits: await db.postAudit.groupBy({ by: ["action"], where: { postId: current.post.id }, _count: { _all: true } }),
    comments: await db.platformPostComment.count({ where: { postId: current.post.id } }),
    prayerRecords: await db.prayerRecord.count({ where: { postId: current.post.id } }),
    prayerUpdates: await db.prayerUpdate.count({ where: { postId: current.post.id } }),
    socialOperations: await db.socialOperation.count({ where: { ownerId: { in: ids } } }),
    localSinkFiles: readdirSync(sink).length
  };
}
async function capture(name) {
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "No horizontal page overflow");
  await page.screenshot({ path: join(output, name), fullPage: true });
  captures.push(name);
}
async function retryOriginal() {
  const candidates = [button("Retry original participation request"), button("Confirm original request")];
  await waitUntil(async () => {
    for (const candidate of candidates)
      if (await candidate.count() && await candidate.first().isVisible() && await candidate.first().isEnabled()) return true;
    return false;
  }, "Retained original participation request has no reachable retry control");
  for (const candidate of candidates) {
    if (await candidate.count() && await candidate.first().isVisible() && await candidate.first().isEnabled()) {
      await candidate.first().click();
      return;
    }
  }
}
try {
  await assertPortalTestDatabase(db);
  const { chromium } = createRequire(process.env.PLAYWRIGHT_MODULE ??
    `${process.env.HOME}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json`)("playwright");
  const pub = execFileSync("openssl", ["x509", "-in", certificate, "-pubkey", "-noout"]);
  const der = execFileSync("openssl", ["pkey", "-pubin", "-outform", "DER"], { input: pub });
  browser = await chromium.launch({ headless: true,
    executablePath: process.env.CHROMIUM_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    args: ["--ignore-certificate-errors-spki-list=" + createHash("sha256").update(der).digest("base64")] });
  context = await browser.newContext({ viewport: { width: 320, height: 844 }, timezoneId: "America/Chicago" });
  await context.route(url => url.origin !== config.origin, route => { external.push(route.request().url()); return route.abort(); });
  page = await context.newPage();
  page.setDefaultTimeout(20000);
  page.on("pageerror", error => errors.push(error.message));
  page.on("requestfailed", request => requestFailures.push({ url: request.url(), method: request.method(), error: request.failure()?.errorText }));
  page.on("request", request => { const u = new URL(request.url()); if (u.pathname.startsWith("/api/platform/")) requests.push({ path: u.pathname, query: u.search, method: request.method() }); });
  const a = await actor("owner"), b = await actor("other"), tag = randomUUID().slice(0, 8);
  const topic = await topicCommand(db, a.token, { operation: "create", mutationId: randomUUID(),
    name: "Action selection " + tag, slug: "actions-" + tag, description: "Fictional action privacy fixture.",
    rules: "Respect private choices.", acceptedRules: true });
  fixtureWrites.push({ operation: "create owned topic", id: topic.id, owner: a.id });
  const membership = await db.topicMembership.findUniqueOrThrow({ where: { communityId_userId: { communityId: topic.id, userId: a.id } } });
  await topicCommand(db, a.token, { operation: "follow", mutationId: randomUUID(), communityId: topic.id, desired: true, expectedVersion: membership.version });
  fixtureWrites.push({ operation: "follow owned topic", id: topic.id, owner: a.id });
  const content = "Action source marker " + tag, question = "Fictional preparation " + tag,
    optionA = "Welcome " + tag, optionB = "Setup " + tag;
  const post = await postCommand(db, a.token, { operation: "create", requestKey: randomUUID(), topicCommunityId: topic.id, content });
  fixtureWrites.push({ operation: "create owned topic post", id: post.id, owner: a.id });
  await participationCommand(db, a.token, { operation: "configure-poll", postId: post.id, expectedVersion: 0,
    question, options: [optionA, optionB], multiple: false,
    closesLocal: new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 16), timeZone: "UTC" });
  fixtureWrites.push({ operation: "configure owned poll", postId: post.id, owner: a.id });
  const view = await getPostParticipation(db, a.token, post.id);
  assert.ok(view.eligible && view.poll);
  current = { a, b, tag, topic, post, content, question, optionA, optionB,
    pollId: view.poll.id, chosenOptionId: view.poll.options.find(o => o.label === optionB).id };
  privateMarkers = [content, question, optionA, optionB, topic.id, post.id, current.chosenOptionId, "Action selection " + tag];
  save("fixture.json", { ...current, a: { id: a.id }, b: { id: b.id }, grants: [], fixtureWrites });
  await signIn(a);
  const initial = await page.goto(config.origin + path);
  assert.equal(initial.status(), 200);
  const html = await initial.text();
  for (const marker of privateMarkers) assert.equal(html.includes(marker), false, "No selected poll/source in initial HTML");
  observations.push({ label: "initial HTML", bytes: Buffer.byteLength(html), sha256: sha(html), checkedMarkers: privateMarkers.length });
  await pollChoice().waitFor();
  await pollChoice().check();
  for (const event of ["blur", "pagehide", "offline"]) {
    await pulse(event);
    await absent("dirty poll " + event);
    await pulse("online");
    await absent("dirty poll passive online after " + event);
    await resume(event === "pagehide" ? "pageshow" : "focus");
    assert.equal(await pollChoice().isChecked(), true);
  }
  await page.evaluate(() => { window.__followingActionsDocument = "same-document"; });
  await refreshAs(b);
  await absent("dirty poll actual account B");
  await refreshAs(a);
  await resume();
  assert.equal(await pollChoice().isChecked(), true);
  assert.equal(await page.evaluate(() => window.__followingActionsDocument), "same-document");
  assert.equal((await effects()).ballots.length, 0);
  await capture("poll-draft-320.png");
  pass("Controlled poll choice survives blur/pagehide/offline and actual same-document A to B to A refresh, with private DOM absent while concealed");
  page.once("dialog", dialog => dialog.accept());
  await button("Discard entries and check saved state").click();
  await pollChoice().waitFor();
  assert.equal(await pollChoice().isChecked(), false);

  await page.getByRole("button", { name: "Pray for this post", exact: true }).click();
  const prayerText = () => page.getByLabel("Your prayer update", { exact: true });
  await prayerText().waitFor();
  const draft = `  Unsent prayer marker ${tag}\n\nComplete original wording  `;
  await prayerText().fill(draft);
  await capture("prayer-draft-320.png");
  await pulse("blur"); await absent("prayer draft blur", [draft]);
  await resume(); await prayerText().waitFor();
  assert.equal(await prayerText().inputValue(), draft);
  const entered = Promise.withResolvers(), released = Promise.withResolvers(), hold = Promise.withResolvers();
  releases.add(() => hold.resolve());
  let heldOnce = false;
  const heldPrayer = async route => {
    if (heldOnce || route.request().method() !== "GET") return route.fallback();
    heldOnce = true;
    try {
      const response = await forwarded(route);
      assert.equal(response.status, 200);
      entered.resolve();
      await hold.promise;
      await route.fulfill(response);
      released.resolve();
    } catch (error) { routeErrors.push(String(error)); entered.reject(error); released.reject(error); await route.abort().catch(() => {}); }
  };
  await page.route(prayerURL, heldPrayer);
  await button("Refresh prayer choices").click();
  await bounded(entered.promise, "Prayer read did not reach hold");
  await pulse("pagehide"); await absent("prayer held read pagehide", [draft]);
  hold.resolve(); await bounded(released.promise, "Prayer held response did not release");
  await page.unroute(prayerURL, heldPrayer);
  await absent("prayer held response released while page hidden", [draft]);
  await resume("pageshow"); await prayerText().waitFor();
  assert.equal(await prayerText().inputValue(), draft);
  assert.equal(requests.filter(r => r.path === "/api/platform/prayers" && r.method !== "GET").length, 0);
  page.once("dialog", dialog => dialog.accept());
  await button("Discard unsent prayer update").click();
  await button("Close prayer").click();
  pass("Prayer draft stays mounted outside the card, is physically absent during concealment and held-read release, and restores only after pageshow without a prayer write");

  let dropFirst = true;
  const participationPOST = async route => {
    if (route.request().method() !== "POST") return route.fallback();
    try {
      const body = route.request().postData(), response = await forwarded(route);
      const entry = { body, sha256: sha(body), expectedAccount: route.request().headers()["x-expected-account"],
        status: response.status, response: JSON.parse(response.body.toString("utf8")), at: new Date().toISOString(), droppedAcknowledgment: dropFirst };
      posts.push(entry); save("participation-posts.json", posts);
      assert.equal(entry.expectedAccount, a.id);
      if (dropFirst) { dropFirst = false; assert.equal(response.status, 200); await route.abort("failed"); }
      else await route.fulfill(response);
    } catch (error) { routeErrors.push(String(error)); await route.abort().catch(() => {}); }
  };
  await page.route(participationURL, participationPOST);
  await pollChoice().check();
  await button("Submit vote").click();
  await waitUntil(() => posts.length === 1, "First participation POST missing");
  await button("Retry original participation request").waitFor();
  const accepted = await effects();
  assert.equal(accepted.ballots.length, 1);
  assert.equal(accepted.ballotAudits.length, 1);
  assert.equal(accepted.ballots[0].version, 1);
  assert.deepEqual(accepted.ballots[0].optionIds, [current.chosenOptionId]);
  save("after-lost-ack.json", accepted);
  const key = createHmac("sha256", accountConfig().rateSecret + ":participation").update(`vote:${a.id}`).digest("hex");
  const limiterBefore = await db.platformAuthLimit.findUniqueOrThrow({ where: { key } });
  const expiresAt = new Date(Date.now() + 15 * 60000);
  await db.platformAuthLimit.update({ where: { key }, data: { hits: 10, expiresAt } });
  fixtureWrites.push({ operation: "arm only owned vote limiter", owner: a.id, key, hits: 10, expiresAt, prior: limiterBefore });
  await retryOriginal();
  await waitUntil(() => posts.length === 2, "Actual throttled retry did not dispatch");
  assert.equal(posts[1].status, 429, "The actual owned transport limiter must refuse the retry");
  assert.equal(posts[1].body, posts[0].body);
  const throttled = await effects();
  assert.deepEqual(throttled.ballots, accepted.ballots);
  assert.deepEqual(throttled.ballotAudits, accepted.ballotAudits);
  const limit = await db.platformAuthLimit.findUniqueOrThrow({ where: { key } });
  assert.equal(limit.hits, 11);
  save("after-real-429.json", { effects: throttled, limiter: limit, posts, currentDOM: await page.locator("body").innerText() });
  await capture("poll-recovery-429-320.png");
  // Avoid a fifteen-minute idle wait. Only this new actor's limiter is expired;
  // the next real request runs the endpoint's ordinary cooldown-reset behavior.
  await db.platformAuthLimit.update({ where: { key }, data: { expiresAt: new Date(Date.now() - 1000) } });
  fixtureWrites.push({ operation: "simulate elapsed cooldown only for owned vote limiter", owner: a.id, key, rows: 1 });
  await retryOriginal();
  await waitUntil(() => posts.length === 3, "Original retry after owned cooldown expiry missing");
  assert.equal(posts[2].status, 200);
  assert.equal(posts[2].body, posts[0].body);
  await button("Save changed vote").waitFor();
  assert.equal(await pollChoice().isChecked(), true);
  effectReadback = await effects();
  assert.deepEqual(effectReadback.ballots, accepted.ballots);
  assert.deepEqual(effectReadback.ballotAudits, accepted.ballotAudits);
  assert.equal(effectReadback.comments, 0);
  assert.equal(effectReadback.prayerUpdates, 0);
  await capture("poll-confirmed-320.png");
  pass("Accepted lost vote, actual owner limiter 429, and simulated cooldown expiry retain identical original bytes and one ballot/audit under existing state-version checks");
  assert.deepEqual(errors, []); assert.deepEqual(external, []); assert.deepEqual(routeErrors, []);
  sourceAfter = sourceProof(); save("source-after.json", sourceAfter);
  assert.deepEqual(sourceAfter, before, "Application tracked source stayed unchanged");
  save("receipt.json", { startedAt, completedAt: new Date().toISOString(), passed: results.length, results,
    source: { before: { source: before.source, files: before.files, manifest: before.manifest }, after: { source: sourceAfter.source, files: sourceAfter.files, manifest: sourceAfter.manifest } },
    qaSha256: sha(readFileSync(new URL(import.meta.url))), observations, rsc, posts, requests, errors, external, routeErrors, requestFailures,
    fixtureWrites, effects: effectReadback, captures, simulations: ["Lost acknowledgment after actual accepted POST", "Only new actor vote limiter armed, then expired instead of waiting fifteen minutes", "Lifecycle DOM events are synthetic; account cookies and Next RSC refresh are actual"],
    limitation: "Participation uses existing state/version checks, not an operation receipt ledger. No retry timer UI is claimed.", productionWrites: 0, externalSends: 0 });
  console.log("RECEIPT " + join(output, "receipt.json"));
} catch (error) {
  for (const release of releases) release();
  effectReadback = await effects().catch(e => ({ readbackError: String(e) }));
  sourceAfter = sourceProof(); save("source-after.json", sourceAfter);
  if (page) await page.screenshot({ path: join(output, "failure.png"), fullPage: true }).catch(() => {});
  save("failure.json", { startedAt, at: new Date().toISOString(), error: String(error), stack: error.stack,
    results, observations, rsc, posts, requests, errors, external, routeErrors, requestFailures, fixtureWrites,
    effects: effectReadback, captures, sourceUnchanged: JSON.stringify(before) === JSON.stringify(sourceAfter),
    currentDOM: page ? await page.locator("body").innerText().catch(() => null) : null });
  console.error("FAILURE " + join(output, "failure.json"));
  throw error;
} finally {
  for (const release of releases) release();
  if (page) await pulse("pageshow").catch(() => {});
  await browser?.close();
  await db.$disconnect();
}
