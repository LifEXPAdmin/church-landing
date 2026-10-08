import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { sessionCookieFixtureName } from "./session-cookie-fixture.mjs";

// Use the parent's pinned production build and fictional HTTPS/DB fixture.
// Run with --import ./tests/register.mjs and NODE_EXTRA_CA_CERTS set before Node starts.
assert.ok(process.argv[2], "Pass the owned ready HTTPS fixture directory.");
const root = realpathSync(process.cwd()), fixture = realpathSync(resolve(process.argv[2]));
assert.ok(fixture.startsWith(realpathSync(join(root, ".account-test")) + "/"));
const supplied = JSON.parse(readFileSync(join(fixture, "test-env.json"), "utf8"));
const config = JSON.parse(readFileSync(join(fixture, "browser-env.json"), "utf8"));
assert.equal(config.database, supplied.DATABASE_URL);
assert.equal(supplied.ACCOUNT_TEST_ISOLATED, "1");
assert.equal(supplied.ACCOUNT_DELIVERY_MODE, "test-sink");
assert.match(config.origin, /^https:\/\/127\.0\.0\.1:\d+$/);
assert.ok(realpathSync(config.certificate).startsWith(fixture + "/"));
assert.equal(process.env.NODE_EXTRA_CA_CERTS, config.certificate);
assert.notEqual(process.env.NODE_TLS_REJECT_UNAUTHORIZED, "0");
Object.assign(process.env, supplied, { ACCOUNT_ORIGIN: config.origin, NEXT_PUBLIC_SITE_URL: config.origin, NODE_ENV: "test", VERCEL: "", VERCEL_ENV: "", ACCOUNT_TEST_ISOLATED: "1", ACCOUNT_DELIVERY_MODE: "test-sink", PRIVILEGED_MFA_MODE: "off", COMMUNITY_REPORTS_ENABLED: "true", PUSH_ENABLED: "false", SOCIAL_EMAIL_ENABLED: "false", FOUNDER_WELCOME_ENABLED: "false", FOUNDER_ANNOUNCEMENTS_ENABLED: "false", RESEND_API_KEY: "", MAILERLITE_API_KEY: "", ACCOUNT_GOOGLE_ENABLED: "false", GOOGLE_CLIENT_ID: "", GOOGLE_CLIENT_SECRET: "", BLOB_READ_WRITE_TOKEN: "", BLOB_STORE_ID: "" });
const built = JSON.parse(readFileSync(join(fixture, "transcripts-build-receipt.json"), "utf8"));
const runtime = JSON.parse(readFileSync(join(fixture, "runtime.json"), "utf8"));
assert.equal(readFileSync(join(root, ".next/BUILD_ID"), "utf8").trim(), built.buildId);
assert.equal(runtime.buildId, built.buildId);
assert.equal(runtime.origin, config.origin);
assert.equal(runtime.source, root);
assert.ok(built.files && Object.keys(built.files).length > 0, "Build receipt must bind actual source files");
const buildSourceHashes = () => Object.fromEntries(Object.keys(built.files).map(path => [path, createHash("sha256").update(readFileSync(join(root, path))).digest("hex")]));
assert.deepEqual(buildSourceHashes(), built.files, "Source changed after the pinned build");
const { PrismaClient } = await import("@prisma/client");
const { assertPortalTestDatabase, createPortalActor } = await import("../tests/seed-portal.ts");
const db = new PrismaClient();
await assertPortalTestDatabase(db);
const output = join(fixture, `media-transcripts-browser-${Date.now()}`);
mkdirSync(output, { recursive: true, mode: 0o700 });
const hash = value => createHash("sha256").update(value).digest("hex");
const sourceNames = ["lib/platform/media-transcript.ts", "lib/platform/media-catalog-input.ts", "lib/platform/media-catalog-commands.ts", "lib/platform/media-catalog-reads.ts", "lib/platform/media-catalog-retention.ts", "lib/platform/social-boundary.ts", "lib/platform/social-operations.ts", "components/platform/media-catalog-editor.tsx", "components/platform/media-catalog-reader.tsx", "components/platform/media-catalog-library.tsx", "components/platform/media-transcript-reader.tsx", "prisma/schema.prisma", "prisma/migrations/20261007234500_media_transcripts/migration.sql"];
const sources = () => Object.fromEntries(sourceNames.map(name => [name, hash(readFileSync(name))]));
const receipt = { startedAt: new Date().toISOString(), origin: config.origin, head: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(), buildId: existsSync(".next/BUILD_ID") ? readFileSync(".next/BUILD_ID", "utf8").trim() : null, runnerSha256: hash(readFileSync(new URL(import.meta.url))), boundBuild: { buildId: built.buildId, files: built.files, runtimeOrigin: runtime.origin, runtimeSource: runtime.source }, sourceBefore: sources(), groups: [], captures: [], observations: [], requests: [], externalRequests: [], pageErrors: [], failures: [], actors: [], simulations: ["Synthetic blur/pagehide/offline/focus events exercise existing concealment callbacks, not physical-device lifecycle.", "32px root text is a bounded 200% text enlargement check, not browser-zoom conformance."], fixturePolicy: "Only new fictional actors and their media are mutated. Existing createPortalActor clears auth-limit rows only inside this dedicated isolated clone. No provider request is permitted. Records remain for owner readback." };
const save = () => writeFileSync(join(output, "result.json"), JSON.stringify(receipt, null, 2) + "\n", { mode: 0o600 });
save();
const { chromium } = createRequire(process.env.PLAYWRIGHT_MODULE ?? `${process.env.HOME}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json`)("playwright");
const pub = execFileSync("openssl", ["x509", "-in", config.certificate, "-pubkey", "-noout"]);
const der = execFileSync("openssl", ["pkey", "-pubin", "-outform", "DER"], { input: pub });
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", args: ["--no-proxy-server", "--ignore-certificate-errors-spki-list=" + createHash("sha256").update(der).digest("base64")] });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: "reduce" });
context.setDefaultTimeout(15000);
context.setDefaultNavigationTimeout(15000);
await context.route("**/*", route => {
  if (new URL(route.request().url()).origin === config.origin) return route.continue();
  receipt.externalRequests.push({ url: route.request().url(), method: route.request().method() });
  return route.abort();
});
const page = await context.newPage();
page.on("pageerror", error => receipt.pageErrors.push(error.message));
page.on("dialog", dialog => dialog.accept());
page.on("request", request => { if (request.method() === "POST" && request.url() === config.origin + "/api/platform/media-catalog") receipt.requests.push({ body: request.postData(), at: new Date().toISOString() }); });
const wait = async (condition, label) => {
  for (let i = 0; i < 150; i++) { if (await condition()) return; await page.waitForTimeout(100); }
  throw new Error("Timed out: " + label);
};
const capture = async name => { const path = join(output, name + ".png"); await page.screenshot({ path, fullPage: true }); receipt.captures.push(path); save(); };
const focusReceipt = async label => { receipt.observations.push({ label, focus: await page.evaluate(() => { const node = document.activeElement; return { tag: node?.tagName, id: node?.id, text: node?.textContent?.slice(0,300), label: node?.getAttribute("aria-label"), describedBy: node?.getAttribute("aria-describedby"), invalid: node?.getAttribute("aria-invalid") }; }) }); save(); };
const button = name => page.getByRole("button", { name, exact: true });
// Real tab movement only: never use locator.focus(), HTMLElement.focus() or tabindex mutation.
const keyboardTo = async (locator, label) => {
  for (let i = 0; i < 180; i++) {
    if (await locator.evaluate(node => node === document.activeElement)) { receipt.observations.push({ label: "keyboard reached " + label, tabCount: i }); return; }
    await page.keyboard.press("Tab");
  }
  throw Error("Keyboard could not reach " + label);
};
const keyboardActivate = async (locator, label) => { await keyboardTo(locator, label); await page.keyboard.press("Enter"); };
const signal = name => page.evaluate(event => window.dispatchEvent(new Event(event)), name);
const go = async path => { await page.goto(config.origin + path); await page.bringToFront(); await signal("focus"); };
const cookie = actor => ({ name: sessionCookieFixtureName(config.origin), value: actor.token, url: config.origin, httpOnly: true, secure: true, sameSite: "Lax" });
const login = async actor => { await context.clearCookies(); await context.addCookies([cookie(actor)]); };
const transcript = () => page.getByRole("textbox", { name: "Transcript text", exact: true });
const chapterStart = index => page.getByLabel(`Chapter ${index} start in seconds`, { exact: true });
const chapterTitle = index => page.getByLabel(`Chapter ${index} title`, { exact: true });
const group = async (name, work) => { try { await work(); receipt.groups.push({ name, passed: true }); console.log("PASS " + name); } catch (error) { receipt.groups.push({ name, passed: false }); receipt.failures.push({ name, error: String(error), stack: error.stack, url: page.url() }); await capture("failure-" + receipt.failures.length).catch(() => {}); throw error; } finally { save(); } };
const run = "Transcript browser " + randomUUID(), needle = "transcriptneedle" + randomUUID().replaceAll("-", "");
const text = `A fictional opening.\n${needle}: patient kindness.\nLiteral query [a+b]? stays searchable.\nLiteral markup <img src=x onerror=alert(1)> stays text.`;
let owner, other, itemId;
const row = () => itemId ? db.mediaCatalogItem.findUniqueOrThrow({ where: { id: itemId } }) : db.mediaCatalogItem.findFirst({ where: { ownerId: owner.id, title: run }, orderBy: { createdAt: "desc" } });
const ready = async () => { await transcript().waitFor(); await wait(async () => await button((await row())?.state === "PUBLISHED" ? "Save reviewed publication" : "Save private draft").isEnabled(), "editor ready"); };
const reviewed = async () => { await page.getByLabel("I understand this source and catalog audience.").check(); await page.getByLabel("I reviewed this exact source", { exact: false }).check(); };
const concealed = async label => {
  const values = await page.evaluate(() => ({ text: document.body.textContent, values: [...document.querySelectorAll("input,textarea")].map(node => node.value) }));
  assert.equal(await transcript().count(), 0, "Transcript control must be removed, not only CSS-hidden");
  assert.ok(!values.text.includes(needle)); assert.ok(!values.values.some(value => value.includes(needle)));
  receipt.observations.push({ label, privateTranscriptAbsent: true });
};
try {
  owner = await createPortalActor(db, "transcriptbrowser"); other = await createPortalActor(db, "transcriptswitch");
  receipt.actors = [owner, other].map(({ id, username }) => ({ id, username })); save();
  await login(owner); await go("/platform/media/new");
  await group("author transcript and ordered chapters through the actual editor and reload persisted values", async () => {
    await page.getByLabel("Title", { exact: true }).fill(run);
    await page.getByLabel("Description", { exact: true }).fill("Fictional description without the search marker.");
    await transcript().fill(text);
    await keyboardActivate(button("Add chapter"), "add chapter");
    await chapterStart(1).fill("0"); await chapterTitle(1).fill("Opening");
    await keyboardActivate(button("Add chapter"), "add second chapter");
    await chapterStart(2).fill("60"); await chapterTitle(2).fill("Kindness");
    await page.getByText("Optional catalog details", { exact: true }).click();
    await page.getByLabel("Duration in seconds", { exact: true }).fill("120");
    await keyboardActivate(button("Save private draft"), "save private transcript");
    await wait(async () => !!await row(), "private draft exists"); itemId = (await row()).id;
    await ready(); await focusReceipt("private save focus before keyboard helpers");
    assert.equal((await row()).transcriptText, text); assert.deepEqual((await row()).chapters, [{ startSeconds: 0, title: "Opening" }, { startSeconds: 60, title: "Kindness" }]);
    // Saving a new draft preserves the new-item route; explicitly open its canonical editor before reload.
    await go(`/platform/media/${itemId}/edit`); await ready();
    await page.reload(); await signal("focus"); await ready();
    assert.equal(await transcript().inputValue(), text); assert.equal(await chapterStart(2).inputValue(), "60");
    await capture("author-desktop");
  });
  await group("equal-duration chapter error retains the draft and correction remains usable", async () => {
    const prior = await row(); await chapterStart(2).fill("120");
    await keyboardActivate(button("Save private draft"), "submit invalid chapter");
    await page.getByText("Chapter 2 must start before the known recording duration.", { exact: true }).first().waitFor();
    await focusReceipt("invalid chapter focus before keyboard helpers");
    assert.equal(await chapterStart(2).evaluate(node => node === document.activeElement), true, "Explicit invalid submit focuses the offending chapter start");
    const described = await chapterStart(2).evaluate(node => ({ invalid: node.getAttribute("aria-invalid"), text: (node.getAttribute("aria-describedby") ?? "").split(/\s+/).map(id => document.getElementById(id)?.textContent ?? "").join(" ") }));
    assert.equal(described.invalid, "true"); assert.match(described.text, /Chapter 2 must start before the known recording duration/);
    assert.equal((await row()).version, prior.version); assert.equal(await chapterStart(2).inputValue(), "120");
    await capture("chapter-error");
    await chapterStart(2).fill("60");
    await keyboardActivate(button("Save private draft"), "corrected chapter save");
    await wait(async () => (await row()).version === prior.version + 1, "corrected save"); await ready();
  });
  await group("new transcript inputs conceal on lifecycle events and retain the original unsaved draft", async () => {
    const prior = await row(), unsavedText = text + "\nDistinct unsaved transcript draft.";
    await transcript().fill(unsavedText); await chapterStart(2).fill("6x");
    for (const event of ["blur", "pagehide", "offline"]) {
      await signal(event); await wait(async () => await transcript().count() === 0, "concealed editor"); await concealed(event);
      if (event === "offline") await signal("online"); await signal("focus"); await ready();
      assert.equal(await transcript().inputValue(), unsavedText, `${event} must retain the unsaved transcript draft`);
      assert.equal(await chapterStart(2).inputValue(), "6x", `${event} must retain the raw invalid chapter draft`);
      const current = await row();
      assert.equal(current.transcriptText, prior.transcriptText, `${event} must not save the transcript`);
      assert.deepEqual(current.chapters, prior.chapters, `${event} must not save chapter edits`);
      assert.equal(current.version, prior.version, `${event} must not mutate the media version`);
    }
    await transcript().fill(text); await chapterStart(2).fill("60");
  });
  await group("reviewed publication includes supplied text and chapters without external playback", async () => {
    await page.getByLabel("Format", { exact: true }).selectOption("SERMON");
    await page.getByLabel("Audio or video", { exact: true }).selectOption("VIDEO");
    await page.getByLabel("Catalog audience").selectOption("MEMBERS");
    await page.getByLabel("Public source URL", { exact: true }).fill("https://youtu.be/abcdefghijk");
    await reviewed(); await keyboardActivate(button("Publish media"), "publish media");
    await wait(async () => (await row()).state === "PUBLISHED", "published media"); await ready(); await focusReceipt("publication focus before helpers");
  });
  await group("accepted response loss plus account replacement retries one unchanged original transcript request", async () => {
    await transcript().fill(text + "\nReviewed revision."); await reviewed(); const before = await row(), attempts = []; let dropped = false;
    const lose = async route => {
      if (route.request().method() !== "POST") return route.continue();
      attempts.push(route.request().postData());
      if (dropped) return route.continue(); dropped = true;
      const response = await route.fetch(); assert.equal(response.status(), 200);
      receipt.simulations.push("Dropped one actual accepted media save response."); await route.abort();
    };
    await context.route("**/api/platform/media-catalog", lose);
    await keyboardActivate(button("Save reviewed publication"), "save reviewed revision");
    await button("Retry original request").waitFor();
    await wait(async () => (await row()).version === before.version + 1, "accepted uncertain revision");
    await focusReceipt("uncertain save focus before helpers");
    await context.addCookies([cookie(other)]); await signal("blur"); await signal("focus");
    await page.getByText("Your sign-in changed.", { exact: false }).first().waitFor(); await concealed("account replacement");
    const count = receipt.requests.length; await button("Retry original request").click();
    await wait(async () => await button("Retry original request").isEnabled(), "replacement retry settled");
    assert.equal(receipt.requests.length, count, "Replacement actor cannot dispatch original request");
    await context.addCookies([cookie(owner)]); await signal("focus"); await transcript().waitFor();
    await button("Retry original request").click(); await wait(async () => await button("Retry original request").count() === 0, "receipt recovered"); await ready();
    await context.unroute("**/api/platform/media-catalog", lose);
    assert.equal(attempts.length, 2); assert.equal(attempts[0], attempts[1]);
    const mutationId = JSON.parse(attempts[0]).mutationId;
    assert.equal(await db.socialOperation.count({ where: { ownerId: owner.id, key: `media-catalog:${mutationId}` } }), 1);
    assert.equal(await db.mediaCatalogEvent.count({ where: { itemId, version: before.version + 1 } }), 1);
    assert.equal((await row()).version, before.version + 1);
    receipt.observations.push({ label: "exact lost response retry", requestSha256: hash(attempts[0]), mutationId, oneOperationAndEvent: true });
  });
  await group("transcript-only keyword search leads to readable text and narrow enlarged keyboard navigation", async () => {
    await go("/platform/media"); await page.getByLabel("Keywords", { exact: true }).fill(needle);
    const searchResponse = page.waitForResponse(response => response.request().method() === "GET" && response.url().includes("/api/platform/media-catalog?") && new URL(response.url()).searchParams.get("q") === needle);
    await keyboardActivate(button("Search media"), "transcript keyword search");
    const response = await searchResponse; assert.equal(response.status(), 200); const result = await response.json();
    assert.equal(result.total, 1); assert.equal(result.items[0].id, itemId);
    assert.equal(Object.hasOwn(result.items[0], "transcriptText"), false); assert.equal(Object.hasOwn(result.items[0], "chapters"), false);
    await keyboardActivate(page.getByRole("link", { name: run, exact: true }), "matching recording");
    await page.getByRole("heading", { name: run, exact: true }).waitFor();
    await page.getByRole("region", { name: "Transcript", exact: true }).waitFor();
    assert.ok((await page.locator("body").innerText()).includes(needle));
    assert.ok((await page.locator("body").innerText()).includes("Kindness"));
    assert.equal(await page.locator('img[src="x"]').count(), 0);
    const transcriptRegion = page.getByRole("region", { name: "Transcript", exact: true });
    const localSearch = () => page.getByLabel("Search this transcript", { exact: true });
    const localStatus = () => transcriptRegion.getByRole("status");
    const localResults = () => transcriptRegion.getByRole("list", { name: "Transcript search results", exact: true });
    const chapterRegion = page.getByRole("region", { name: "Chapters", exact: true });
    assert.match(await chapterRegion.innerText(), /Known duration: 120 seconds/);
    assert.equal(await chapterRegion.getByText("0 seconds from the beginning", { exact: true }).count(), 1);
    assert.equal(await chapterRegion.getByText("60 seconds from the beginning", { exact: true }).count(), 1);
    await keyboardTo(localSearch(), "reader-local transcript search");
    await page.keyboard.type(needle);
    await wait(async () => (await localStatus().innerText()) === "1 match in this transcript.", "literal transcript match");
    assert.equal(await localResults().locator("mark").innerText(), needle);
    await localSearch().fill("[a+b]?");
    await wait(async () => (await localStatus().innerText()) === "1 match in this transcript.", "escaped literal metacharacter search");
    assert.equal(await localResults().locator("mark").innerText(), "[a+b]?");
    await localSearch().fill("no-match-" + randomUUID());
    await wait(async () => (await localStatus().innerText()) === "No matches in this transcript.", "no-match transcript search");
    assert.equal(await localResults().count(), 0);
    await keyboardActivate(button("Clear transcript search"), "clear reader-local search");
    await focusReceipt("clear transcript search focus before keyboard helpers");
    assert.equal(await localSearch().evaluate(node => node === document.activeElement), true, "Clearing transcript search returns focus to the search input");
    assert.equal(await localSearch().inputValue(), ""); assert.equal(await localResults().count(), 0);
    assert.match(await localStatus().innerText(), /Enter text to find matches/);
    await localSearch().fill(needle);
    await wait(async () => await localResults().count() === 1, "reader search before concealment");
    await signal("blur");
    await wait(async () => await localSearch().count() === 0, "reader local search concealed");
    assert.equal(await transcriptRegion.count(), 0); assert.equal(await chapterRegion.count(), 0);
    const concealedReader = await page.evaluate(() => ({ text: document.body.textContent, values: [...document.querySelectorAll("input,textarea")].map(node => node.value) }));
    assert.ok(!concealedReader.text.includes(needle)); assert.ok(!concealedReader.values.some(value => value.includes(needle)));
    await signal("focus"); await localSearch().waitFor();
    assert.equal(await localSearch().inputValue(), "", "A newly authorized reader must not revive the concealed search query");
    assert.equal(await localResults().count(), 0); assert.match(await localStatus().innerText(), /Enter text to find matches/);
    receipt.observations.push({ label: "reader-local search", literalQuery: "[a+b]?", matchingMark: "[a+b]?", noMatchAndClear: true, concealedQueryRemovedAndReset: true });
    await capture("reader-desktop");
    await page.setViewportSize({ width: 320, height: 900 });
    for (const font of [16, 32]) {
      await page.evaluate(size => { document.documentElement.style.fontSize = `${size}px`; }, font);
      await keyboardTo(button("Open source"), `reader source control at ${font}px`);
      const view = await page.evaluate(() => { const node = document.activeElement, rect = node.getBoundingClientRect(), hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2); return { width: innerWidth, scrollWidth: document.documentElement.scrollWidth, font: getComputedStyle(document.documentElement).fontSize, rect: rect.toJSON(), height: innerHeight, unobscured: hit === node || node.contains(hit), reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches }; });
      assert.ok(view.scrollWidth <= view.width + 1); assert.ok(view.rect.top >= 0 && view.rect.bottom <= view.height); assert.equal(view.unobscured, true); assert.equal(view.reducedMotion, true);
      receipt.observations.push({ label: `320px reader ${font}px root text`, ...view }); await capture(`reader-320-${font}px-keyboard`);
      // Step backward inside the document instead of wrapping through browser chrome and triggering concealment.
      await page.keyboard.press("Shift+Tab");
    }
  });
  await group("revoked rights remove transcript detail and transcript-only search matches", async () => {
    await db.mediaCatalogRights.update({ where: { itemId }, data: { revokedAt: new Date() } });
    await signal("blur"); await signal("focus"); await page.getByText("This media item is unavailable.", { exact: true }).waitFor();
    assert.equal(await page.getByRole("region", { name: "Transcript", exact: true }).count(), 0); assert.ok(!(await page.locator("body").innerText()).includes(needle));
    const response = await page.request.get(config.origin + `/api/platform/media-catalog?q=${encodeURIComponent(needle)}`, { headers: { "x-expected-account": owner.id } });
    assert.equal(response.status(), 200); assert.equal((await response.json()).total, 0);
  });
  assert.deepEqual(receipt.externalRequests, []); assert.deepEqual(receipt.pageErrors, []);
} catch (error) {
  if (!receipt.failures.length) receipt.failures.push({ name: "runner setup", error: String(error), stack: error.stack });
  process.exitCode = 1;
} finally {
  receipt.sourceAfter = sources(); receipt.sourceUnchanged = JSON.stringify(receipt.sourceBefore) === JSON.stringify(receipt.sourceAfter);
  if (!receipt.sourceUnchanged) { receipt.failures.push({ name: "source changed during browser run" }); process.exitCode = 1; }
  receipt.finishedAt = new Date().toISOString(); receipt.itemId = itemId ?? null;
  if (receipt.externalRequests.length) receipt.failures.push({ name: "external requests", count: receipt.externalRequests.length });
  if (receipt.pageErrors.length) receipt.failures.push({ name: "page errors", errors: receipt.pageErrors });
  if (receipt.groups.length !== 7 || !receipt.groups.every(group => group.passed)) receipt.failures.push({ name: "incomplete browser journey matrix" });
  if (JSON.stringify(buildSourceHashes()) !== JSON.stringify(built.files)) receipt.failures.push({ name: "built source changed during browser run" });
  receipt.passed = receipt.failures.length === 0;
  if (!receipt.passed) process.exitCode = 1;
  save(); console.log(JSON.stringify({ output, groups: receipt.groups.length, passed: receipt.passed, failures: receipt.failures.length }));
  await browser.close(); await db.$disconnect();
}
