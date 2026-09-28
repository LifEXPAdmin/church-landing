import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

// Run from the inspected application checkout with --import ./tests/register.mjs.
// Set NODE_EXTRA_CA_CERTS before starting Node. This script never starts servers.
const fixture = resolve(process.argv[2] ?? "");
assert.ok(process.argv[2], "Pass the owned isolated fixture directory");
const mode = process.argv[3] ?? "--verify";
assert.ok(["--reproduce", "--verify", "--oversize-check"].includes(mode));
const output = resolve(process.argv[4] ?? `${fixture}/scripture-browser-${mode.slice(2)}-${Date.now()}`);
mkdirSync(output, { recursive: true, mode: 0o700 });
Object.assign(process.env, JSON.parse(readFileSync(`${fixture}/environment.json`, "utf8")));
const origin = process.env.ACCOUNT_ORIGIN;
assert.match(origin, /^https:\/\/127\.0\.0\.1:\d+$/);
const root = process.cwd();
const local = (name) => import(pathToFileURL(resolve(root, name)).href);
const require = createRequire(resolve(root, "package.json"));
const { PrismaClient } = require("@prisma/client");
const { createPortalActor, assertPortalTestDatabase } = await local("tests/seed-portal.ts");
const { sessionCookieFixtureName } = await local("scripts/session-cookie-fixture.mjs");
const db = new PrismaClient();
await assertPortalTestDatabase(db);
const sourceProof = () => {
  const names = execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], { cwd: root }).toString().split("\0").filter(Boolean).sort();
  const hash = createHash("sha256");
  let count = 0;
  for (const name of new Set(names)) {
    if (!existsSync(resolve(root, name))) continue;
    const digest = createHash("sha256").update(readFileSync(resolve(root, name))).digest("hex");
    hash.update(name + "\0" + digest + "\n");
    count++;
  }
  return { head: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root }).toString().trim(), fileCount: count, sha256: hash.digest("hex") };
};
const receipt = {
  mode: mode.slice(2), startedAt: new Date().toISOString(), origin, output,
  sourceBefore: sourceProof(), sourceAfter: null, groups: [], observations: [],
  actors: [], posts: [], writes: [], requests: [], externalRequests: [], pageErrors: [], requestFailures: [], captures: [], failures: [],
  simulations: ["Synthetic blur/pagehide/offline/focus events exercise lifecycle callbacks; no physical-device claim."],
  fixturePolicy: "New fictional actors and their media/rights are modified. The existing seed helper resets the dedicated clone's auth limit rows with explicit fixture-owner authorization; counts are recorded. No provider request is allowed. Fixture records are retained for owner readback."
};
const save = () => writeFileSync(`${output}/result.json`, JSON.stringify(receipt, (_, value) => typeof value === "bigint" ? value.toString() : value, 2) + "\n", { mode: 0o600 });
save();
const { chromium } = createRequire(process.env.PLAYWRIGHT_MODULE ?? `${process.env.HOME}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json`)("playwright");
const publicKey = execFileSync("openssl", ["x509", "-in", `${fixture}/localhost-cert.pem`, "-pubkey", "-noout"]);
const der = execFileSync("openssl", ["pkey", "-pubin", "-outform", "DER"], { input: publicKey });
const browser = await chromium.launch({ headless: true,
  executablePath: process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  args: ["--ignore-certificate-errors-spki-list=" + createHash("sha256").update(der).digest("base64"), "--no-proxy-server"] });
const context = await browser.newContext({ viewport: { width: 320, height: 844 } });
context.setDefaultTimeout(15000);
await context.route("**/*", (route) => {
  if (new URL(route.request().url()).origin === origin) return route.continue();
  receipt.externalRequests.push({ url: route.request().url(), method: route.request().method(), blocked: true });
  return route.abort();
});
const page = await context.newPage();
page.on("pageerror", (error) => receipt.pageErrors.push(error.message));
page.on("requestfailed", (request) => receipt.requestFailures.push({ url: request.url(), method: request.method(), error: request.failure()?.errorText }));
page.on("request", (request) => {
  if (request.method() === "POST" && request.url() === origin + "/api/platform/media-catalog")
    receipt.requests.push({ at: new Date().toISOString(), body: request.postData(), status: null });
});
page.on("response", (response) => {
  const request = response.request();
  if (request.method() === "POST" && request.url() === origin + "/api/platform/media-catalog") {
    const entry = receipt.requests.findLast((r) => r.body === request.postData() && r.status === null);
    if (entry) entry.status = response.status();
  }
});
page.on("dialog", (dialog) => dialog.accept());
const wait = async (fn, label = "expected state") => {
  for (let i = 0; i < 150; i++) {
    if (await fn()) return;
    await page.waitForTimeout(100);
  }
  throw Error(`Timed out: ${label}`);
};
const capture = async (name, fullPage = true) => {
  const path = `${output}/${name}.png`;
  await page.screenshot({ path, fullPage });
  receipt.captures.push(path);
  save();
};
const group = async (label, work) => {
  try {
    await work();
    receipt.groups.push({ label, passed: true });
    console.log("PASS " + label);
  } catch (error) {
    receipt.groups.push({ label, passed: false });
    receipt.failures.push({ label, error: String(error), stack: error.stack, url: page.url() });
    await capture(`failure-${receipt.failures.length}`).catch(() => {});
    if (mode !== "--reproduce") throw error;
  } finally { save(); }
};
const cookie = (actor) => ({ name: sessionCookieFixtureName(origin), value: actor.token, url: origin, httpOnly: true, secure: true, sameSite: "Lax" });
const login = async (actor) => { await context.clearCookies(); await context.addCookies([cookie(actor)]); };
const signal = (name) => page.evaluate((event) => window.dispatchEvent(new Event(event)), name);
const go = async (path) => { await page.goto(origin + path); await page.bringToFront(); await signal("focus"); };
const passage = () => page.getByRole("textbox", { name: /^Passage text 1(?:\s|$)/ });
const button = (name) => page.getByRole("button", { name, exact: true });
const acknowledge = () => page.getByLabel("I understand this source and catalog audience.").check();
const review = () => page.getByLabel("I reviewed this exact source", { exact: false }).check();
const run = "Scripture fixture " + randomUUID();
let owner, other, itemId;
const seedActor = async (label) => {
  const removedLimits = await db.platformAuthLimit.count();
  const actor = await createPortalActor(db, label);
  receipt.writes.push({ action: "existing-seed-helper-auth-limit-reset", count: removedLimits, dedicatedCloneOnly: true });
  return actor;
};
const row = () => itemId ? db.mediaCatalogItem.findUniqueOrThrow({ where: { id: itemId } }) : db.mediaCatalogItem.findFirst({ where: { ownerId: owner.id, title: run }, orderBy: { createdAt: "desc" } });
const settled = async () => {
  await passage().waitFor();
  await wait(async () => await button((await row())?.state === "PUBLISHED" ? "Save reviewed publication" : "Save private draft").isEnabled(), "editor ready");
};
const saveDraft = async () => {
  const prior = await row();
  await button("Save private draft").click();
  await wait(async () => { const current = await row(); return current && current.version > (prior?.version ?? 0); }, "private media saved");
  itemId = (await row()).id;
  await settled();
};
const observePrivateDom = async (label) => {
  const observation = await page.evaluate(() => ({
    passageInputs: [...document.querySelectorAll("textarea")].filter((node) => node.closest("label")?.textContent?.includes("Passage text")).map((node) => ({ value: node.value, hiddenAncestor: !!node.closest("[hidden]") })),
    values: [...document.querySelectorAll("input,textarea,select")].map((node) => node.value),
    text: document.body.textContent
  }));
  receipt.observations.push({ label, ...observation });
  save();
  return observation;
};
const assertConcealed = async (label) => {
  const observation = await observePrivateDom(label);
  assert.equal(observation.passageInputs.length, 0, "Concealment removes passage controls physically");
  assert.ok(!observation.values.some((value) => value.includes(run)), "Private live input values are absent");
  assert.ok(!observation.text.includes(run), "Private entry text is absent from the physical DOM");
};
const assertKeyboardVisible = async (label) => {
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
  const measured = await page.evaluate(() => {
    const active = document.activeElement, rect = active.getBoundingClientRect();
    const nav = document.querySelector("#platform-navigation"), navRect = nav?.getBoundingClientRect();
    const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
    return { fontSize: getComputedStyle(document.documentElement).fontSize, activeTag: active.tagName,
      activeRect: rect.toJSON(), navRect: navRect?.toJSON(), viewport: { width: innerWidth, height: innerHeight },
      centerHitsActive: !!hit && (hit === active || active.contains(hit)), hitTag: hit?.tagName,
      scrollMargin: getComputedStyle(active).scrollMargin, scrollY };
  });
  receipt.observations.push({ label, ...measured });
  save();
  assert.ok(measured.activeRect.top >= 0 && measured.activeRect.bottom <= measured.viewport.height, "Focused control lies inside viewport");
  assert.ok(!measured.navRect || measured.activeRect.bottom <= measured.navRect.top, "Focused control lies fully above fixed navigation");
  assert.equal(measured.centerHitsActive, true, "Focused control center is not obscured by another element");
};
try {
  owner = await seedActor("scrbrowser");
  if (mode !== "--oversize-check") other = await seedActor("scrother");
  receipt.actors = [owner, other].filter(Boolean).map(({ id, username }) => ({ id, username }));
  receipt.writes.push({ action: "fictional-register-verify-adult-login", actorIds: receipt.actors.map((a) => a.id), sink: process.env.ACCOUNT_TEST_SINK_DIR });
  save();
  await login(owner);
  await go("/platform/media/new");
  await page.getByLabel("Title", { exact: true }).fill(run);
  await page.getByLabel("Description", { exact: true }).fill("Private draft " + run);
  await button("Add Scripture passage").click();
  await page.getByRole("combobox", { name: /^Reference system 1/ }).selectOption("sil-eng");
  await passage().fill("John 3:16;Jn 3:16");

  if (mode === "--oversize-check") {
    await group("actual oversized UTF8 command records transport status and edit/retry recovery", async () => {
      const originals = ["\u2003".repeat(3500) + "John 3:16", " " + "\u2003".repeat(3499) + "John 3:16"];
      await page.getByLabel("Description", { exact: true }).fill("界".repeat(5000));
      await passage().fill(originals[0]);
      await button("Add Scripture passage").click();
      await page.getByRole("combobox", { name: /^Reference system 2/ }).selectOption("sil-eng");
      await page.getByRole("textbox", { name: /^Passage text 2(?:\s|$)/ }).fill(originals[1]);
      const response = page.waitForResponse((r) => r.request().method() === "POST" && r.url() === origin + "/api/platform/media-catalog");
      await button("Save private draft").click();
      const actual = await response;
      const body = await actual.json();
      await page.getByText(body.message, { exact: true }).waitFor();
      await wait(async () => !(await page.getByRole("button", { name: "Saving…", exact: true }).count()), "oversize catch settled");
      receipt.oversize = { status: actual.status(), response: body, commandBytes: Buffer.byteLength(actual.request().postData()), originalLengths: originals.map((value) => value.length), descriptionLength: 5000,
        titleEditable: await page.getByLabel("Title", { exact: true }).isEditable(),
        passageEditable: await passage().isEditable(), discardEnabled: await button("Discard unsent changes").isEnabled(),
        retryCount: await button("Retry original request").count(), mediaRows: await db.mediaCatalogItem.count({ where: { ownerId: owner.id } }) };
      assert.ok(receipt.oversize.commandBytes > 32768);
      assert.ok([400, 413].includes(actual.status()));
      assert.equal(receipt.oversize.mediaRows, 0);
      if (actual.status() === 400) {
        assert.equal(receipt.oversize.titleEditable, true);
        assert.equal(receipt.oversize.passageEditable, true);
        assert.equal(receipt.oversize.discardEnabled, true);
        assert.equal(receipt.oversize.retryCount, 0);
      }
      await capture("actual-oversize-recovery");
    });
  } else {
  await group(mode === "--reproduce" ? "reproduce physical private passage retention after concealment" : "private passages leave DOM on blur, pagehide and offline and return with original entries", async () => {
    const findings = [];
    for (const event of ["blur", "pagehide", "offline"]) {
      await signal(event);
      await page.getByText("Checking current media access.", { exact: false }).waitFor();
      const observation = await observePrivateDom(event);
      findings.push({ event, retained: observation.passageInputs.some((entry) => entry.value === "John 3:16;Jn 3:16") });
      if (mode === "--verify") await assertConcealed(event + " asserted");
      if (event === "offline") await signal("online");
      await signal("focus");
      await passage().waitFor();
      assert.equal(await passage().inputValue(), "John 3:16;Jn 3:16");
    }
    receipt.reproducedConcealment = findings;
    if (mode === "--reproduce") assert.ok(findings.every((finding) => finding.retained));
  });

  await group("invalid reference prevents a write; correction saves and reloads canonical tags", async () => {
    await passage().fill("John 3:99");
    const before = receipt.requests.length;
    await button("Save private draft").click();
    await page.getByText(/John 3 has verses 1 to/).first().waitFor();
    assert.equal(receipt.requests.length, before);
    await passage().fill("John 3:16;Jn 3:16");
    await saveDraft();
    const current = await row();
    receipt.posts.push({ id: itemId, purpose: "passage editor/search/recovery", initialReferences: current.scriptureRanges });
    assert.equal(current.scriptureRanges.length, 1);
    assert.equal(current.scriptureRanges[0].bookId, "JHN");
    assert.deepEqual(current.scriptureRanges[0].originals, ["John 3:16", "Jn 3:16"]);
  });

  await group(mode === "--reproduce" ? "reproduce original-input drift after unchanged passage reload and unrelated save" : "unrelated edits preserve exact original passage strings across reload", async () => {
    assert.ok(itemId, "Private draft was created");
    const before = (await row()).scriptureRanges;
    await page.getByLabel("Description", { exact: true }).fill("Unrelated changed description " + run);
    await saveDraft();
    const after = (await row()).scriptureRanges;
    receipt.provenanceRoundTrip = { before, after, loadedText: await passage().inputValue(), changed: JSON.stringify(before) !== JSON.stringify(after) };
    if (mode === "--reproduce") assert.notDeepEqual(after, before);
    else assert.deepEqual(after, before);
  });
  if (mode === "--reproduce") {
    await capture("reproduced-editor-320");
  } else {
    await group("merged originals longer than one input limit survive an unrelated save without truncation", async () => {
      const originals = [" ".repeat(2100) + "John 3:16", "Jn 3:16" + " ".repeat(2100)];
      await passage().fill(originals[0]);
      await button("Add Scripture passage").click();
      await page.getByRole("combobox", { name: /^Reference system 2/ }).selectOption("sil-eng");
      await page.getByRole("textbox", { name: /^Passage text 2(?:\s|$)/ }).fill(originals[1]);
      await saveDraft();
      const before = (await row()).scriptureRanges;
      assert.equal(before.length, 1);
      assert.deepEqual(before[0].originals, originals);
      assert.ok((await passage().inputValue()).length > 4000);
      await page.getByLabel("Description", { exact: true }).fill("Preserved long provenance " + run);
      await saveDraft();
      const after = (await row()).scriptureRanges;
      assert.deepEqual(after, before);
      receipt.longProvenanceRoundTrip = { originalLengths: originals.map((value) => value.length), displayLength: (await passage().inputValue()).length, unchanged: true };
    });
    await group("current reviewed publication displays only same-system publisher Scripture tags", async () => {
      await passage().fill("John 3:16-18;Jn 3:16-18");
      await page.getByLabel("Format", { exact: true }).selectOption("SERMON");
      await page.getByLabel("Audio or video", { exact: true }).selectOption("VIDEO");
      await page.getByLabel("Catalog audience").selectOption("MEMBERS");
      await page.getByLabel("Public source URL", { exact: true }).fill("https://youtu.be/abcdefghijk");
      await acknowledge(); await review();
      await button("Publish media").click();
      await wait(async () => (await row()).state === "PUBLISHED", "publication");
      await settled();
      assert.equal((await row()).scriptureRanges[0].endKey, 3018);
    });

    await group("lost accepted write and account replacement retain one original request and conceal private input values", async () => {
      await page.getByLabel("Description", { exact: true }).fill("Exact pending " + run);
      await acknowledge(); await review();
      const before = await row();
      const attempts = [];
      let lost = false;
      const lose = async (route) => {
        if (route.request().method() !== "POST") return route.continue();
        attempts.push(route.request().postData());
        if (lost) return route.continue();
        lost = true;
        const response = await route.fetch();
        receipt.simulations.push(`Dropped an actual accepted media response with HTTP ${response.status()}.`);
        assert.equal(response.status(), 200);
        await route.abort();
      };
      await context.route("**/api/platform/media-catalog", lose);
      await button("Save reviewed publication").click();
      await button("Retry original request").waitFor();
      await wait(async () => (await row()).version === before.version + 1, "accepted uncertain write");
      await context.addCookies([cookie(other)]);
      await signal("blur"); await signal("focus");
      await page.getByText("Your sign-in changed.", { exact: false }).first().waitFor();
      await assertConcealed("account replacement with exact pending write");
      const postCount = receipt.requests.length;
      await button("Retry original request").click();
      await wait(async () => await button("Retry original request").isEnabled(), "wrong-owner retry settled");
      assert.equal(receipt.requests.length, postCount, "A replacement account cannot send the original request");
      await context.addCookies([cookie(owner)]);
      await signal("focus");
      await passage().waitFor();
      await button("Retry original request").click();
      await wait(async () => await button("Retry original request").count() === 0, "original receipt confirmed");
      await settled();
      await context.unroute("**/api/platform/media-catalog", lose);
      assert.equal(attempts.length, 2);
      assert.equal(attempts[0], attempts[1]);
      const mutationId = JSON.parse(attempts[0]).mutationId;
      assert.equal(await db.socialOperation.count({ where: { ownerId: owner.id, key: `media-catalog:${mutationId}` } }), 1);
      assert.equal(await db.mediaCatalogEvent.count({ where: { itemId, version: before.version + 1 } }), 1);
      assert.equal((await row()).version, before.version + 1);
      receipt.exactRetry = { originalBody: attempts[0], replayBody: attempts[1], ownerId: owner.id, mutationId, mediaVersion: before.version + 1, operations: 1, events: 1 };
    });

    await go("/platform/media");
    const search = async (text, system = "sil-eng") => {
      await page.getByLabel("Keywords", { exact: true }).fill(run);
      await page.getByRole("combobox", { name: /^Scripture reference system/ }).selectOption(system);
      await page.getByLabel("Scripture passage", { exact: true }).fill(text);
      const response = page.waitForResponse((r) => r.request().method() === "GET" && r.url().includes("/api/platform/media-catalog?view=library") && new URL(r.url()).searchParams.get("scripture") === text);
      await button("Search media").click();
      const result = await response;
      const body = await result.json();
      receipt.observations.push({ label: "passage search", text, system, status: result.status(), total: body.total, itemIds: body.items?.map((item) => item.id) });
      return { response: result, body };
    };
    await group("overlap search separates books and systems and recovers after invalid input", async () => {
      for (const [text, system, expected] of [["John 3:18-20", "sil-eng", 1], ["John 3:19", "sil-eng", 0], ["1 John 3:16", "sil-eng", 0], ["John 3:16", "sil-org", 0], ["John", "sil-eng", 1]]) {
        const { response, body } = await search(text, system);
        assert.equal(response.status(), 200);
        assert.equal(body.total, expected);
        await wait(async () => await page.getByRole("link", { name: run, exact: true }).count() === expected, "search rendered");
      }
      const bad = await search("John 3:99");
      assert.equal(bad.response.status(), 400);
      await page.getByText(/John 3 has verses 1 to/).first().waitFor();
      assert.equal(await page.getByRole("link", { name: run, exact: true }).count(), 0);
      assert.equal((await search("John 3:16")).body.total, 1);
      await page.getByRole("link", { name: run, exact: true }).waitFor();
    });
    await group("320 pixel and enlarged search/reader remain usable with actual keyboard focus", async () => {
      for (const size of [16, 32]) {
        await page.evaluate((pixels) => { document.documentElement.style.fontSize = `${pixels}px`; }, size);
        await page.getByLabel("Scripture passage", { exact: true }).focus();
        await page.keyboard.press("Shift+Tab");
        assert.equal(await page.getByRole("combobox", { name: /^Scripture reference system/ }).evaluate((node) => node === document.activeElement), true);
        await page.keyboard.press("Tab");
        assert.equal(await page.getByLabel("Scripture passage", { exact: true }).evaluate((node) => node === document.activeElement), true);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
        await assertKeyboardVisible(`search keyboard at ${size}px root font`);
        await capture(`search-320-${size === 16 ? "normal" : "double"}-keyboard`, false);
      }
      await page.getByRole("link", { name: run, exact: true }).click();
      await page.getByRole("heading", { name: run, exact: true }).waitFor();
      await page.getByRole("region", { name: "Scripture passages", exact: true }).waitFor();
      assert.match(await page.locator("body").innerText(), /John 3:16 to 3:18/);
      for (const size of [16, 32]) {
        await page.evaluate((pixels) => { document.documentElement.style.fontSize = `${pixels}px`; }, size);
        await button("Open source").focus();
        await page.keyboard.press("Shift+Tab"); await page.keyboard.press("Tab");
        assert.equal(await button("Open source").evaluate((node) => node === document.activeElement), true);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
        await assertKeyboardVisible(`reader keyboard at ${size}px root font`);
        await capture(`reader-320-${size === 16 ? "normal" : "double"}-keyboard`, false);
      }
    });
    await group("rights revocation removes Scripture detail and search results before redisplay", async () => {
      await db.mediaCatalogRights.update({ where: { itemId }, data: { revokedAt: new Date() } });
      receipt.writes.push({ action: "revoke-owned-media-rights", itemId, count: 1 });
      await signal("blur"); await signal("focus");
      await page.getByText("This media item is unavailable.", { exact: true }).waitFor();
      assert.equal(await page.getByRole("region", { name: "Scripture passages", exact: true }).count(), 0);
      assert.ok(!(await page.content()).includes("John 3:16 to 3:18"));
      await go("/platform/media");
      assert.equal((await search("John 3:16")).body.total, 0);
    });
    assert.deepEqual(receipt.pageErrors, []);
    assert.deepEqual(receipt.externalRequests, []);
  }
  }
} catch (error) {
  if (!receipt.failures.some((failure) => failure.error === String(error))) receipt.failures.push({ label: "runner", error: String(error), stack: error.stack, url: page.url() });
  await capture("runner-failure").catch(() => {});
  process.exitCode = 1;
} finally {
  try {
    const ids = receipt.actors.map((actor) => actor.id);
    const media = await db.mediaCatalogItem.findMany({ where: { ownerId: { in: ids } }, select: { id: true, ownerId: true, version: true, state: true, scriptureRanges: true } });
    receipt.effects = { media,
      events: await db.mediaCatalogEvent.findMany({ where: { itemId: { in: media.map((item) => item.id) } }, select: { itemId: true, actorId: true, version: true, action: true } }),
      operations: await db.socialOperation.findMany({ where: { ownerId: { in: ids }, key: { startsWith: "media-catalog:" } }, select: { ownerId: true, key: true, result: true } }),
      rights: await db.mediaCatalogRights.findMany({ where: { itemId: { in: media.map((item) => item.id) } }, select: { itemId: true, actorId: true, revokedAt: true } }) };
    receipt.sourceAfter = sourceProof();
    receipt.sourceUnchanged = JSON.stringify(receipt.sourceBefore) === JSON.stringify(receipt.sourceAfter);
    if (!receipt.sourceUnchanged) receipt.failures.push({ label: "source proof", error: "Application source changed during the run; inspect manifest before claiming immutable acceptance." });
  } catch (error) { receipt.failures.push({ label: "final readback", error: String(error) }); }
  receipt.finishedAt = new Date().toISOString();
  receipt.passed = receipt.groups.filter((result) => result.passed).length;
  if (receipt.failures.length) process.exitCode = 1;
  save();
  console.log(JSON.stringify({ output, mode: receipt.mode, passed: receipt.passed, failures: receipt.failures.length, posts: receipt.requests.length, sourceUnchanged: receipt.sourceUnchanged }));
  await browser.close(); await db.$disconnect();
}
