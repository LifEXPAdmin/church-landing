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
const built = JSON.parse(readFileSync(join(fixture, "duty-templates-build-receipt.json"), "utf8"));
const runtime = JSON.parse(readFileSync(join(fixture, "runtime.json"), "utf8"));
assert.equal(readFileSync(join(root, ".next/BUILD_ID"), "utf8").trim(), built.buildId);
assert.equal(runtime.buildId, built.buildId);
assert.equal(runtime.origin, config.origin);
assert.equal(runtime.source, root);
assert.ok(built.files && Object.keys(built.files).length > 0, "Build receipt must bind actual source files");
const buildSourceHashes = () => Object.fromEntries(Object.keys(built.files).map(path => [path, createHash("sha256").update(readFileSync(join(root, path))).digest("hex")]));
assert.deepEqual(buildSourceHashes(), built.files, "Source changed after the pinned build");
const { PrismaClient } = await import("@prisma/client");
const { assertPortalTestDatabase } = await import("../tests/seed-portal.ts");
const { seedVolunteerApplications } = await import("../tests/seed-volunteer-applications.ts");
const db = new PrismaClient();
await assertPortalTestDatabase(db);
const output = join(fixture, `volunteer-duty-templates-browser-${Date.now()}`);
mkdirSync(output, { recursive: true, mode: 0o700 });
const hash = value => createHash("sha256").update(value).digest("hex");
const sourceNames = Object.keys(built.files);
const sources = () => Object.fromEntries(sourceNames.map(name => [name, hash(readFileSync(name))]));
const receipt = { startedAt: new Date().toISOString(), origin: config.origin, head: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(), buildId: existsSync(".next/BUILD_ID") ? readFileSync(".next/BUILD_ID", "utf8").trim() : null, runnerSha256: hash(readFileSync(new URL(import.meta.url))), boundBuild: { buildId: built.buildId, files: built.files, runtimeOrigin: runtime.origin, runtimeSource: runtime.source }, sourceBefore: sources(), groups: [], captures: [], observations: [], requests: [], externalRequests: [], pageErrors: [], failures: [], actors: [], simulations: ["Synthetic blur/pagehide/offline/focus events exercise existing concealment callbacks, not physical-device lifecycle.", "320px is a bounded narrow layout check, not device or accessibility conformance."], fixturePolicy: "Only new fictional actors, churches, duty templates and opportunities are mutated. Existing createPortalActor clears auth-limit rows only inside this dedicated isolated clone. No provider request is permitted. Records remain for owner readback." };
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
page.on("request", request => { if (request.method() === "POST" && request.url() === config.origin + "/api/platform/volunteer-duty-templates") receipt.requests.push({ body: request.postData(), at: new Date().toISOString() }); });
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
    const state = await locator.evaluate(node => ({ active: node === document.activeElement, preceding: !!(document.activeElement?.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_PRECEDING) }));
    if (state.active) { receipt.observations.push({ label: "keyboard reached " + label, tabCount: i }); return; }
    // Choose real backward navigation for earlier controls rather than wrapping through browser chrome.
    await page.keyboard.press(state.preceding ? "Shift+Tab" : "Tab");
  }
  throw Error("Keyboard could not reach " + label);
};
const keyboardActivate = async (locator, label) => { await keyboardTo(locator, label); await page.keyboard.press("Enter"); };
const signal = name => page.evaluate(event => window.dispatchEvent(new Event(event)), name);
const go = async path => { await page.goto(config.origin + path); await page.bringToFront(); await signal("focus"); };
const cookie = actor => ({ name: sessionCookieFixtureName(config.origin), value: actor.token, url: config.origin, httpOnly: true, secure: true, sameSite: "Lax" });
const login = async actor => { await context.clearCookies(); await context.addCookies([cookie(actor)]); };
const group = async (name, work) => { try { await work(); receipt.groups.push({ name, passed: true }); console.log("PASS " + name); } catch (error) { receipt.groups.push({ name, passed: false }); receipt.failures.push({ name, error: String(error), stack: error.stack, url: page.url() }); await capture("failure-" + receipt.failures.length).catch(() => {}); throw error; } finally { save(); } };
const title = "Fictional duty browser " + randomUUID(), secret = "private-duty-" + randomUUID();
const descriptions = { title, duties: secret + " Welcome visitors at the meeting point.", requirements: "Read the ordinary duty instructions.", commitment: "One hour by arrangement." };
const label = { title: "Template title", duties: "Purpose and duties", requirements: "Requirements", commitment: "Commitment" };
const field = key => page.getByRole("textbox", { name: label[key], exact: true });
const ready = async () => { await field("title").waitFor(); await wait(() => button("Save duty template").isEnabled(), "template editor ready"); };
const resultFocus = async (label, text) => {
  await wait(() => page.evaluate(expected => document.activeElement?.getAttribute("role") === "status" && document.activeElement?.textContent?.includes(expected), text), label);
  await focusReceipt(label);
};
const fillFields = async values => { for (const key of Object.keys(label)) await field(key).fill(values[key]); };
let f, templateId, sourcePost, opportunityId;
const template = () => db.volunteerDutyTemplate.findUniqueOrThrow({ where: { id: templateId } });
const findTemplate = () => db.volunteerDutyTemplate.findFirst({ where: { churchId: f.churchA.id, title }, orderBy: { createdAt: "desc" } });
const sourceState = async () => ({ post: await db.platformPost.findUniqueOrThrow({ where: { id: sourcePost.id } }), occurrence: await db.calendarOccurrence.findUniqueOrThrow({ where: { id: f.occurrence.id } }), opportunities: await db.volunteerOpportunity.findMany({ where: { postId: sourcePost.id }, orderBy: { id: "asc" } }), slots: await db.postVolunteerSlot.findMany({ where: { postId: sourcePost.id }, orderBy: { id: "asc" } }) });
const absentPrivate = async () => { assert.equal(await field("title").count(), 0); const view = await page.evaluate(() => ({ text: document.body.textContent, values: [...document.querySelectorAll("input,textarea,select")].map(node => node.value) })); assert.ok(!view.text.includes(secret)); assert.ok(!view.values.some(value => value.includes(secret))); };
try {
  f = await seedVolunteerApplications(db, true, 3);
  sourcePost = f.post; // One existing discussion per event; add a new opportunity to it.
  receipt.actors = [f.ada, f.blake].map(({ id, username }) => ({ id, username })); receipt.sourcePostId = sourcePost.id; save();
  await login(f.ada); await go("/platform/serve/templates");
  await group("coordinator creates a reusable duty through keyboard save and reloads the saved description", async () => {
    await ready(); await fillFields(descriptions);
    await keyboardActivate(button("Save duty template"), "save duty template");
    await wait(async () => !!await findTemplate(), "created duty template"); templateId = (await findTemplate()).id;
    await ready(); await resultFocus("successful template save before helpers", "Duty template saved.");
    const saved = await template(); for (const key of Object.keys(label)) assert.equal(saved[key], descriptions[key]);
    await page.reload(); await signal("focus"); await button("Edit " + title).waitFor();
    await keyboardActivate(button("Edit " + title), "open saved duty template"); await ready();
    for (const key of Object.keys(label)) assert.equal(await field(key).inputValue(), descriptions[key]);
    await capture("template-editor-desktop");
  });
  await group("genuinely unsaved duty fields survive each concealment and reauthorization without writes", async () => {
    const before = await template(), draft = { title: title + " unsaved", duties: descriptions.duties + " Unsaved duties.", requirements: "Unsaved requirements.", commitment: "Unsaved commitment." };
    await fillFields(draft);
    for (const event of ["blur", "pagehide", "offline"]) {
      await signal(event); await wait(async () => await field("title").count() === 0, "private duty form concealed"); await absentPrivate();
      if (event === "offline") await signal("online"); await signal("focus"); await ready();
      for (const key of Object.keys(label)) assert.equal(await field(key).inputValue(), draft[key], `${event} preserves ${key}`);
      assert.deepEqual(await template(), before, `${event} causes no persistence`);
    }
    await fillFields(descriptions);
  });
  await group("an accepted lost reply is concealed on owner replacement and retries only the original request", async () => {
    await field("duties").fill(descriptions.duties + " Reviewed revision.");
    const before = await template(), attempts = []; let dropped = false;
    const lose = async route => {
      if (route.request().method() !== "POST") return route.continue();
      attempts.push(route.request().postData());
      if (dropped) return route.continue(); dropped = true;
      const response = await route.fetch(); assert.ok([200, 202].includes(response.status())); await route.abort();
    };
    await context.route("**/api/platform/volunteer-duty-templates", lose);
    await keyboardActivate(button("Save duty template"), "save reviewed duty revision");
    await button("Confirm original template request").waitFor();
    await wait(async () => (await template()).version === before.version + 1, "accepted duty revision"); await focusReceipt("uncertain template save before helpers");
    await context.addCookies([cookie(f.blake)]); await signal("blur"); await signal("focus");
    await wait(async () => await field("title").count() === 0, "replacement account concealed"); await absentPrivate();
    const count = receipt.requests.length; await button("Check template access").first().click();
    await page.waitForTimeout(300); assert.equal(receipt.requests.length, count, "Wrong owner access check must not replay original mutation");
    await context.addCookies([cookie(f.ada)]); await signal("focus"); await button("Confirm original template request").waitFor();
    await keyboardActivate(button("Confirm original template request"), "confirm original duty request");
    await wait(async () => await button("Confirm original template request").count() === 0, "original duty receipt recovered"); await ready();
    await context.unroute("**/api/platform/volunteer-duty-templates", lose);
    assert.equal(attempts.length, 2); assert.equal(attempts[0], attempts[1]); assert.equal((await template()).version, before.version + 1);
    const mutationId = JSON.parse(attempts[0]).mutationId;
    assert.equal(await db.socialOperation.count({ where: { ownerId: f.ada.id, key: `volunteer-duty-template:${mutationId}` } }), 1);
    receipt.observations.push({ label: "exact lost reply", requestSha256: hash(attempts[0]), mutationId, oneOperation: true });
  });
  await group("explicit template apply preserves contact capacity and shift choices and cannot replace edits made while loading", async () => {
    await go(`/platform/serve/new?postId=${sourcePost.id}`);
    await page.getByRole("combobox", { name: "Duty template", exact: true }).waitFor();
    const contact = page.getByRole("textbox", { name: "Published coordinator contact or contact instructions", exact: true }), capacity = page.getByRole("spinbutton", { name: "Places available in total", exact: true });
    await contact.fill("Keep this manually entered contact instruction."); await capacity.fill("7");
    await page.getByLabel("Use a shorter shift within this event", { exact: true }).check();
    const start = page.getByLabel(/^Shift starts/), end = page.getByLabel(/^Shift ends/);
    const startValue = await start.inputValue(), endValue = await end.inputValue();
    await page.getByRole("combobox", { name: "Duty template", exact: true }).selectOption(templateId);
    const before = await sourceState();
    await keyboardActivate(button("Use template in draft"), "apply reusable duty");
    await page.getByText("Template copied into this unsaved opportunity. Review all details before saving.", { exact: true }).waitFor(); await resultFocus("template apply result before helpers", "Template copied into this unsaved opportunity.");
    const current = await template();
    assert.equal(await page.getByRole("textbox", { name: "Role title", exact: true }).inputValue(), current.title);
    assert.equal(await page.getByRole("textbox", { name: "Purpose and duties", exact: true }).inputValue(), current.duties);
    assert.equal(await page.getByRole("textbox", { name: "Requirements", exact: true }).inputValue(), current.requirements);
    assert.equal(await page.getByRole("textbox", { name: "Additional commitment details", exact: true }).inputValue(), current.commitment);
    assert.equal(await contact.inputValue(), "Keep this manually entered contact instruction."); assert.equal(await capacity.inputValue(), "7");
    assert.equal(await start.inputValue(), startValue); assert.equal(await end.inputValue(), endValue); assert.equal(await page.getByLabel("Use a shorter shift within this event", { exact: true }).isChecked(), true);
    assert.deepEqual(await sourceState(), before, "Applying only projects a draft");
    let release, responseSeen = false; const held = new Promise(resolve => release = resolve);
    const delay = async route => { if (new URL(route.request().url()).searchParams.get("view") !== "apply") return route.continue(); const response = await route.fetch(); responseSeen = true; await held; await route.fulfill({ response }); };
    await context.route("**/api/platform/volunteer-duty-templates?**", delay);
    try {
      await wait(() => button("Use template in draft").isEnabled(), "picker ready for deliberate second apply");
      await keyboardActivate(button("Use template in draft"), "start delayed template apply"); await wait(() => responseSeen, "actual apply response held");
      await page.getByRole("textbox", { name: "Purpose and duties", exact: true }).fill("Manual duty edit made while a template was loading."); release();
      await page.getByText("Your opportunity changed while the template loaded. Review your edits and choose the template again.", { exact: true }).waitFor();
      assert.equal(await page.getByRole("textbox", { name: "Purpose and duties", exact: true }).inputValue(), "Manual duty edit made while a template was loading.");
    } finally { release(); await context.unroute("**/api/platform/volunteer-duty-templates?**", delay); }
    assert.deepEqual(await sourceState(), before);
    await keyboardActivate(button("Use template in draft"), "explicitly accept current template after race"); await page.getByText("Template copied into this unsaved opportunity. Review all details before saving.", { exact: true }).waitFor();
    await capture("template-applied-unsaved");
  });
  await group("only the ordinary explicit opportunity save persists applied duties and editing omits the new-only picker", async () => {
    await keyboardActivate(button("Save opportunity"), "save reviewed opportunity draft");
    await wait(async () => !!await db.volunteerOpportunity.findFirst({ where: { postId: sourcePost.id, title } }), "saved opportunity");
    const saved = await db.volunteerOpportunity.findFirstOrThrow({ where: { postId: sourcePost.id, title }, include: { slot: true } }); opportunityId = saved.id;
    const current = await template(); for (const key of Object.keys(label)) assert.equal(saved[key], current[key]);
    assert.equal(saved.contact, "Keep this manually entered contact instruction."); assert.equal(saved.slot.capacity, 7);
    await go(`/platform/serve/${saved.id}/edit`); await page.getByRole("form", { name: "Edit volunteer opportunity", exact: true }).waitFor();
    assert.equal(await page.getByRole("combobox", { name: "Duty template", exact: true }).count(), 0);
  });
  await group("keyboard removal scrubs the reusable template while the separately saved opportunity stays unchanged", async () => {
    const before = await db.volunteerOpportunity.findUniqueOrThrow({ where: { id: opportunityId } });
    await go("/platform/serve/templates"); await button("Edit " + title).waitFor(); await keyboardActivate(button("Edit " + title), "open saved template for removal"); await ready();
    await page.setViewportSize({ width: 320, height: 900 });
    await keyboardTo(button("Remove duty template"), "remove at narrow viewport");
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)); await capture("template-editor-320-keyboard");
    await page.evaluate(() => document.documentElement.style.fontSize = "32px");
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await capture("template-editor-320-double-text");
    await page.evaluate(() => document.documentElement.style.fontSize = "");
    await page.keyboard.press("Enter");
    await wait(async () => !!(await template()).removedAt, "removed duty template");
    const removed = await template(); for (const key of Object.keys(label)) assert.equal(removed[key], "");
    assert.deepEqual(await db.volunteerOpportunity.findUniqueOrThrow({ where: { id: opportunityId } }), before);
    await ready(); await resultFocus("template removal before helpers", "Duty template removed.");
  });
  await group("current coordinator revocation removes an unsaved private template form", async () => {
    await fillFields({ ...descriptions, title: title + " revoked unsaved", duties: secret + " unsaved after removal" });
    const before = await template();
    await db.churchCapabilityGrant.deleteMany({ where: { churchId: f.churchA.id, userId: f.ada.id, capability: "MANAGE_CHURCH_VOLUNTEERS" } });
    await signal("blur"); await signal("focus"); await wait(async () => await field("title").count() === 0, "revoked coordinator concealed"); await absentPrivate();
    await page.getByText("No churches are currently available for you to coordinate volunteer templates.", { exact: true }).waitFor();
    assert.deepEqual(await template(), before);
  });
} catch (error) {
  if (!receipt.failures.length) receipt.failures.push({ name: "runner setup", error: String(error), stack: error.stack }); process.exitCode = 1;
} finally {
  receipt.finishedAt = new Date().toISOString(); receipt.templateId = templateId ?? null; receipt.opportunityId = opportunityId ?? null;
  receipt.sourceAfter = sources(); receipt.sourceUnchanged = JSON.stringify(receipt.sourceBefore) === JSON.stringify(receipt.sourceAfter);
  if (!receipt.sourceUnchanged || JSON.stringify(buildSourceHashes()) !== JSON.stringify(built.files)) receipt.failures.push({ name: "frozen built sources changed" });
  if (receipt.externalRequests.length) receipt.failures.push({ name: "external requests", count: receipt.externalRequests.length });
  if (receipt.pageErrors.length) receipt.failures.push({ name: "page errors", errors: receipt.pageErrors });
  if (receipt.groups.length !== 7 || !receipt.groups.every(group => group.passed)) receipt.failures.push({ name: "incomplete browser journeys" });
  receipt.passed = receipt.failures.length === 0; if (!receipt.passed) process.exitCode = 1;
  save(); console.log(JSON.stringify({ output, groups: receipt.groups.length, passed: receipt.passed, failures: receipt.failures.length }));
  await browser.close(); await db.$disconnect();
}
