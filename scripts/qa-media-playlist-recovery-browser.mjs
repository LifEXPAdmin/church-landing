import assert from "node:assert/strict";
import { createHash, randomUUID, randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

// Run from the inspected checkout with --import ./tests/register.mjs.
// Set NODE_EXTRA_CA_CERTS to the fixture certificate before starting Node.
assert.ok(process.argv[2] && process.argv[3], "Pass owned fixture and output directories");
const root = process.cwd(), fixture = resolve(process.argv[2]), out = resolve(process.argv[3]);
mkdirSync(out, { recursive: true, mode: 0o700 });
Object.assign(process.env, JSON.parse(readFileSync(resolve(fixture, "environment.json"), "utf8")));
process.env.ACCOUNT_TEST_SINK_DIR = resolve(out, "mail");
const origin = process.env.ACCOUNT_ORIGIN, local = (name) => import(pathToFileURL(resolve(root, name)).href);
assert.match(origin, /^https:\/\/127\.0\.0\.1:\d+$/);
const require = createRequire(resolve(root, "package.json")), { PrismaClient } = require("@prisma/client");
const db = new PrismaClient();
const { assertPortalTestDatabase } = await local("tests/seed-portal.ts");
await assertPortalTestDatabase(db);
const { registerAccount, requestAccountGrant, consumeAccountGrant, loginAccount } = await local("lib/platform/accounts.ts");
const { deliverAccountGrant } = await local("lib/platform/account-delivery.ts");
const { ADULT_POLICY, getPortalSnapshot, portalCommand } = await local("lib/platform/portal.ts");
const { mediaCatalogCommand } = await local("lib/platform/media-catalog-commands.ts");
const { MEDIA_POLICY } = await local("lib/platform/media-catalog-options.ts");
const { sessionCookieFixtureName } = await local("scripts/session-cookie-fixture.mjs");
const files = execFileSync("git", ["ls-files", "-z"], { cwd: root }).toString().split("\0").filter(Boolean);
const proof = () => {
  const manifest = Object.fromEntries(files.map((name) => [name, createHash("sha256").update(readFileSync(resolve(root, name))).digest("hex")]));
  const critical = Object.fromEntries(Object.entries(manifest).filter(([name]) => /(?:media-playlist|social-client|social-operations|social-boundary|account-read|account-sessions|use-unsaved-social-work|use-photo-back-guard)/.test(name) && /^(app|components|lib)\//.test(name)));
  return { head: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root }).toString().trim(), fileCount: files.length, manifest, critical, criticalHash: createHash("sha256").update(JSON.stringify(critical)).digest("hex") };
};
const receipt = { startedAt: new Date().toISOString(), origin, sourceBefore: proof(), groups: [], writes: [], browserPosts: [], externalRequests: [], pageErrors: [], requestFailures: [], dialogs: [], observations: [], failures: [] };
const save = () => writeFileSync(resolve(out, "result.json"), JSON.stringify(receipt, (_, v) => typeof v === "bigint" ? v.toString() : v, 2) + "\n", { mode: 0o600 });
save();
const { chromium } = createRequire(process.env.PLAYWRIGHT_MODULE ?? `${process.env.HOME}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json`)("playwright");
const cert = resolve(fixture, "localhost-cert.pem");
const key = execFileSync("openssl", ["x509", "-in", cert, "-pubkey", "-noout"]), der = execFileSync("openssl", ["pkey", "-pubin", "-outform", "DER"], { input: key });
const browser = await chromium.launch({ headless: true, executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", args: ["--ignore-certificate-errors-spki-list=" + createHash("sha256").update(der).digest("base64"), "--no-proxy-server"] });
const context = await browser.newContext({ viewport: { width: 320, height: 844 } });
context.setDefaultTimeout(15000);
await context.route("**/*", (route) => { if (new URL(route.request().url()).origin === origin) return route.continue(); receipt.externalRequests.push(route.request().url()); return route.abort(); });
const page = await context.newPage();
page.on("pageerror", (e) => receipt.pageErrors.push(e.message));
page.on("requestfailed", (r) => receipt.requestFailures.push({ method: r.method(), url: r.url(), error: r.failure()?.errorText }));
let acceptDialog = false;
page.on("dialog", async (d) => { receipt.dialogs.push({ type: d.type(), message: d.message(), accepted: acceptDialog }); if (acceptDialog) await d.accept(); else await d.dismiss(); });
page.on("request", (r) => { if (r.method() === "POST" && r.url() === origin + "/api/platform/media-playlists") receipt.browserPosts.push({ body: r.postData(), status: null }); });
page.on("response", (r) => { if (r.request().method() === "POST" && r.url() === origin + "/api/platform/media-playlists") { const entry = receipt.browserPosts.findLast((v) => v.body === r.request().postData() && v.status === null); if (entry) entry.status = r.status(); } });
const wait = async (fn) => { for (let i = 0; i < 150; i++) { if (await fn()) return; await page.waitForTimeout(100); } throw Error("Expected state timed out"); };
const button = (name) => page.getByRole("button", { name, exact: true });
const group = async (label, work) => { try { await work(); receipt.groups.push({ label, passed: true }); console.log("PASS " + label); } catch (error) { receipt.groups.push({ label, passed: false }); throw error; } finally { save(); } };
const state = async (label) => {
  const observation = await page.evaluate(() => ({ url: location.href, text: document.body.innerText, buttons: [...document.querySelectorAll("button")].map((b) => ({ text: b.innerText, disabled: b.disabled })), inputs: [...document.querySelectorAll("input,textarea,select")].map((n) => ({ value: n.value, disabled: n.disabled })) }));
  receipt.observations.push({ label, ...observation }); save(); return observation;
};
const input = (operation, more = {}) => ({ operation, mutationId: randomUUID(), ...more });
let actor, sourceId, savedId, title;
try {
  // Same production account path as createPortalActor, without its global auth-limit deletion.
  const suffix = randomBytes(5).toString("hex"), username = "p_retry_" + suffix, email = username + ".private-login@example.test", password = "Fictional-only-" + randomBytes(12).toString("hex");
  await registerAccount(db, { name: "Fictional retry " + suffix, username, email, password, confirmPassword: password, role: "BELIEVER" });
  const user = await db.platformUser.findUniqueOrThrow({ where: { username } });
  receipt.actor = { id: user.id, username, email };
  receipt.writes.push({ action: "register-new-fictional-account", id: user.id, globalAuthLimitDeletion: false }); save();
  await requestAccountGrant(db, email, "VERIFY_EMAIL", deliverAccountGrant);
  const mail = readdirSync(process.env.ACCOUNT_TEST_SINK_DIR).map((f) => JSON.parse(readFileSync(resolve(process.env.ACCOUNT_TEST_SINK_DIR, f), "utf8"))).find((m) => m.email === email && m.purpose === "VERIFY_EMAIL");
  assert.ok(mail);
  await consumeAccountGrant(db, new URLSearchParams(new URL(mail.url).hash.slice(1)).get("token"), "VERIFY_EMAIL");
  const token = await loginAccount(db, email, password, "fictional-retry-" + suffix);
  const snapshot = await getPortalSnapshot(db, token, "discover");
  await portalCommand(db, token, { operation: "ack-adult", acknowledged: true, policy: ADULT_POLICY, expectedVersion: snapshot.viewer.version });
  actor = { id: user.id, token };
  receipt.writes.push({ action: "verify-login-adult-own-account", id: actor.id, sink: process.env.ACCOUNT_TEST_SINK_DIR });
  title = "Fictional lost save " + randomUUID();
  const fields = { title, description: "Isolated private retry reproduction", format: "SERMON", presentation: "VIDEO", audience: "PUBLIC", sourceUrl: "https://www.youtube.com/watch?v=abcdefghijk", details: { preachedOn: null } };
  const reviewed = { fields, acknowledgment: { policy: MEDIA_POLICY, sourceUrl: fields.sourceUrl, audience: fields.audience, accepted: true }, rights: { basis: "OWN", reviewed: true, publicRecording: true, textRights: true } };
  const draft = await mediaCatalogCommand(db, token, input("create", { ownerChurchId: null, ...reviewed })); sourceId = draft.id;
  await mediaCatalogCommand(db, token, input("publish", { itemId: draft.id, expectedVersion: draft.version, ...reviewed }));
  receipt.writes.push({ action: "service-create-publish-owned-media", sourceId, commands: 2 }); save();
  await context.addCookies([{ name: sessionCookieFixtureName(origin), value: token, url: origin, secure: true, httpOnly: true, sameSite: "Lax" }]);
  await page.goto(origin + "/platform/media/saved"); await page.bringToFront(); await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await button("Find media to add").click();
  await page.getByLabel("Media title", { exact: true }).fill(title);
  await button("Search media").click();
  await page.getByRole("heading", { name: title, exact: true }).waitFor();
  await group("lost accepted save followed by same-owner unsave produces actual409 with the original request retained", async () => {
  let dropped = false;
  await page.route("**/api/platform/media-playlists", async (route) => {
    if (route.request().method() !== "POST" || dropped) return route.continue();
    dropped = true;
    const response = await route.fetch();
    receipt.acceptedSave = { body: route.request().postData(), status: response.status(), response: await response.json(), simulation: "Drop actual accepted response before browser receives it" };
    assert.equal(response.status(), 200); savedId = receipt.acceptedSave.response.id; save();
    await route.abort("failed");
  });
  await button("Add this recording").click();
  await button("Retry same change").waitFor(); await wait(() => button("Retry same change").isEnabled());
  assert.ok(savedId); await state("accepted save with lost response");
  const saved = await db.mediaSavedItem.findUniqueOrThrow({ where: { id: savedId } });
  const unsaveBody = input("unsave-media", { savedId, expectedVersion: saved.version });
  const unsave = await context.request.post(origin + "/api/platform/media-playlists", { headers: { Origin: origin, "X-Expected-Account": actor.id }, data: unsaveBody });
  receipt.elsewhereUnsave = { transport: "separate authenticated HTTP request sharing the original account cookie", body: unsaveBody, status: unsave.status(), response: await unsave.json() };
  assert.equal(unsave.status(), 200); save();
  const responsePromise = page.waitForResponse((r) => r.url() === origin + "/api/platform/media-playlists" && r.request().method() === "POST");
  await button("Retry same change").click();
  const retry = await responsePromise;
  receipt.retry = { status: retry.status(), response: await retry.json(), body: retry.request().postData() }; save();
  assert.equal(retry.status(), 409);
  assert.equal(receipt.retry.body, receipt.acceptedSave.body);
  await wait(() => button("Retry same change").isEnabled());
  await button("Refresh current access").click();
  await page.getByText("No saved media yet. Find a recording to save privately.", { exact: true }).waitFor();
  await state("same owner current saved view after definitive409 and refresh");
  assert.equal(await button("Retry same change").count(), 1);
  assert.equal(await page.getByRole("button", { name: /^(Find media to add|Close media picker)$/ }).isDisabled(), true);
  assert.equal(await button("Stop retrying and reload").isEnabled(), true);
  assert.equal(await db.socialOperation.count({ where: { ownerId: actor.id, key: { startsWith: "media-playlists:" } } }), 2);
  });
  await group("canceling the warning retains the exact original retry and makes no extra mutation", async () => {
    const beforePosts = receipt.browserPosts.length, beforeDialogs = receipt.dialogs.length;
    acceptDialog = false;
    await button("Stop retrying and reload").focus();
    await page.keyboard.press("Shift+Tab"); await page.keyboard.press("Tab");
    assert.equal(await button("Stop retrying and reload").evaluate((n) => n === document.activeElement), true);
    receipt.recoveryControlGeometry = await button("Stop retrying and reload").evaluate((node) => { const r = node.getBoundingClientRect(), nav = document.querySelector("#platform-navigation")?.getBoundingClientRect(), hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return { rect: r.toJSON(), nav: nav?.toJSON(), centerHits: hit === node || node.contains(hit) }; });
    assert.ok(!receipt.recoveryControlGeometry.nav || receipt.recoveryControlGeometry.rect.bottom <= receipt.recoveryControlGeometry.nav.top);
    assert.equal(receipt.recoveryControlGeometry.centerHits, true);
    await page.screenshot({ path: resolve(out, "warning-control-320.png"), fullPage: false });
    await button("Stop retrying and reload").click();
    await wait(() => receipt.dialogs.length === beforeDialogs + 1);
    assert.equal(receipt.dialogs.at(-1).type, "confirm");
    assert.match(receipt.dialogs.at(-1).message, /already|undo|completed/i);
    assert.equal(receipt.browserPosts.length, beforePosts);
    assert.equal(await button("Retry same change").isEnabled(), true);
    const pending = page.waitForResponse((r) => r.url() === origin + "/api/platform/media-playlists" && r.request().method() === "POST");
    await button("Retry same change").click();
    const retry = await pending;
    receipt.retryAfterCancel = { status: retry.status(), body: retry.request().postData(), response: await retry.json() };
    assert.equal(retry.status(), 409);
    assert.equal(receipt.retryAfterCancel.body, receipt.acceptedSave.body);
    await wait(() => button("Retry same change").isEnabled());
    assert.equal(await db.socialOperation.count({ where: { ownerId: actor.id, key: { startsWith: "media-playlists:" } } }), 2);
  });
  await group("explicit stop and current-state reload clears local pending without sending a write", async () => {
    await button("Stop retrying and reload").waitFor();
    const beforePosts = receipt.browserPosts.length, beforeDialogs = receipt.dialogs.length;
    acceptDialog = true;
    const fresh = page.waitForResponse((r) => r.request().method() === "GET" && r.url().includes("/api/platform/media-playlists?") && new URL(r.url()).searchParams.get("view") === "saved");
    await button("Stop retrying and reload").click();
    const response = await fresh;
    receipt.reconciledRead = { status: response.status(), body: await response.json() };
    assert.equal(response.status(), 200);
    assert.equal(receipt.reconciledRead.body.actorId, actor.id);
    assert.equal(receipt.reconciledRead.body.total, 0);
    await page.getByText("No saved media yet. Find a recording to save privately.", { exact: true }).waitFor();
    await wait(async () => await button("Retry same change").count() === 0);
    assert.equal(receipt.dialogs.length, beforeDialogs + 1);
    assert.equal(receipt.dialogs.at(-1).accepted, true);
    assert.equal(receipt.browserPosts.length, beforePosts);
    assert.equal(await button("Stop retrying and reload").count(), 0);
    assert.equal(await page.getByRole("button", { name: /^(Find media to add|Close media picker)$/ }).isEnabled(), true);
    assert.equal(await db.socialOperation.count({ where: { ownerId: actor.id, key: { startsWith: "media-playlists:" } } }), 2);
    await state("explicitly abandoned local retry after fresh authorized read");
    await page.getByRole("button", { name: /^(Find media to add|Close media picker)$/ }).focus();
    await page.screenshot({ path: resolve(out, "reconciled-320.png"), fullPage: false });
  });
  await group("subsequent deliberate save uses a new key and keeps one canonical saved row", async () => {
    if (await button("Find media to add").count()) await button("Find media to add").click();
    await page.getByLabel("Media title", { exact: true }).fill(title);
    await button("Search media").click();
    await page.getByRole("heading", { name: title, exact: true }).waitFor();
    const next = page.waitForResponse((r) => r.url() === origin + "/api/platform/media-playlists" && r.request().method() === "POST");
    await button("Add this recording").click();
    const response = await next;
    receipt.deliberateSave = { status: response.status(), body: response.request().postData(), response: await response.json() };
    assert.equal(response.status(), 200);
    const original = JSON.parse(receipt.acceptedSave.body), current = JSON.parse(receipt.deliberateSave.body);
    assert.notEqual(current.mutationId, original.mutationId);
    assert.equal(current.mediaId, sourceId);
    assert.equal(receipt.deliberateSave.response.id, savedId);
    assert.equal(receipt.deliberateSave.response.version, 3);
    await page.getByRole("link", { name: title, exact: true }).waitFor();
    assert.equal(await db.mediaSavedItem.count({ where: { userId: actor.id, mediaId: sourceId } }), 1);
    const saved = await db.mediaSavedItem.findUniqueOrThrow({ where: { id: savedId } });
    assert.equal(saved.removedAt, null);
    assert.equal(saved.version, 3);
    assert.equal(await db.socialOperation.count({ where: { ownerId: actor.id, key: { startsWith: "media-playlists:" } } }), 3);
    await state("new deliberate save complete");
  });
  assert.deepEqual(receipt.externalRequests, []);
  assert.deepEqual(receipt.pageErrors, []);
} catch (error) {
  receipt.failures.push({ error: String(error), stack: error.stack, url: page.url() }); process.exitCode = 1;
  await page.screenshot({ path: resolve(out, "failure.png"), fullPage: true }).catch(() => {});
} finally {
  if (actor) receipt.effects = {
    media: await db.mediaCatalogItem.findMany({ where: { ownerId: actor.id }, select: { id: true, version: true, state: true } }),
    saved: await db.mediaSavedItem.findMany({ where: { userId: actor.id }, select: { id: true, userId: true, mediaId: true, version: true, removedAt: true } }),
    operations: await db.socialOperation.findMany({ where: { ownerId: actor.id }, select: { key: true, result: true } }),
    mediaEvents: await db.mediaCatalogEvent.findMany({ where: { actorId: actor.id }, select: { itemId: true, action: true, version: true } }),
    playlistEvents: await db.mediaPlaylistEvent.count({ where: { actorId: actor.id } }),
    rights: await db.mediaCatalogRights.count({ where: { actorId: actor.id } }),
    controls: await db.retentionControl.findMany({ where: { targetId: actor.id, sourceId: { in: [sourceId, savedId].filter(Boolean) } }, select: { kind: true, sourceId: true, version: true } })
  };
  receipt.sourceAfter = proof();
  receipt.criticalSourceUnchanged = receipt.sourceBefore.criticalHash === receipt.sourceAfter.criticalHash;
  receipt.changedFiles = Object.keys(receipt.sourceBefore.manifest).filter((f) => receipt.sourceBefore.manifest[f] !== receipt.sourceAfter.manifest[f]);
  receipt.finishedAt = new Date().toISOString(); save();
  receipt.passed = receipt.groups.filter((g) => g.passed).length;
  save();
  console.log(JSON.stringify({ passed: receipt.passed, failures: receipt.failures.length, browserPosts: receipt.browserPosts.length, criticalSourceUnchanged: receipt.criticalSourceUnchanged, changedFiles: receipt.changedFiles }));
  await browser.close(); await db.$disconnect();
}
