import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
const fixtureDir = process.argv[2];
assert.ok(fixtureDir, "Pass the existing isolated preview artifact directory");
const config = JSON.parse(
  readFileSync(fixtureDir + "/browser-env.json", "utf8")
);
assert.match(config.origin, /^https:\/\/127\.0\.0\.1:\d+$/);
Object.assign(process.env, {
  DATABASE_URL: config.database,
  DIRECT_URL: config.database,
  ACCOUNT_ORIGIN: config.origin,
  NEXT_PUBLIC_SITE_URL: config.origin,
  ACCOUNT_TEST_ISOLATED: "1",
  ACCOUNT_DELIVERY_MODE: "test-sink",
  ACCOUNT_TEST_SINK_DIR: process.cwd() + "/" + fixtureDir + "/sink",
  AUTH_RATE_LIMIT_SECRET: "medium-fixture-only-secret-".repeat(3),
  NODE_ENV: "test",
  VERCEL: ""
});
const { PrismaClient } = await import("@prisma/client");
const { assertPortalTestDatabase, seedPortal } =
  await import("../tests/seed-portal.ts");
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
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => {
  const issue = { path: new URL(page.url()).pathname, message: e.message };
  errors.push(issue);
  console.log("BROWSER_ERROR", JSON.stringify(issue));
});
const results = [];
const ok = (s) => {
  results.push(s);
  console.log("PASS " + s);
};
const output = fixtureDir + "/draft-controller-browser";
mkdirSync(output, { recursive: true });
const go = async (path) => {
  await page.goto(config.origin + path);
  await page.waitForLoadState("networkidle");
};
const bounded = async () =>
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1
    ),
    "No horizontal page overflow"
  );

const signIn = async (actor) =>
  context.addCookies([
    {
      name: "church_platform_session",
      value: actor.token,
      domain: "127.0.0.1",
      path: "/",
      secure: true,
      httpOnly: true,
      sameSite: "Lax"
    }
  ]);

const { postWorkspaceCommand } =
  await import("../lib/platform/post-workspace.ts");
const { randomUUID } = await import("node:crypto");
const form = () =>
  page.getByRole("form", { name: "Publish post", exact: true });
const field = () => form().getByLabel("Post content", { exact: true });
const save = () =>
  form().getByRole("button", { name: "Save draft now", exact: true }).click();
const waitSaved = () =>
  page.waitForFunction(() =>
    document
      .querySelector('form[aria-label="Publish post"]')
      ?.textContent.includes("Saved privately.")
  );
try {
  const f = await seedPortal(db),
    a = f.memberA,
    b = f.memberB;
  await signIn(a);
  await go("/platform");
  await page.locator("#compose-post > summary").click();
  await field().waitFor({ state: "visible" });
  const writes = [];
  page.on("request", (r) => {
    if (r.method() === "POST" && r.url().includes("/post-workspace"))
      writes.push(r.postData());
  });
  await form()
    .getByLabel("Also share on a church page")
    .selectOption(f.churchA.id);
  await form().getByLabel("Who may reply?").selectOption("CHURCH_MEMBERS");
  await field().fill("  Composer autosave fixture\n\nKeep exact text.  ");
  await page.waitForTimeout(1200);
  assert.equal(writes.length, 0);
  await waitSaved();
  let row = await db.privatePostDraft.findFirstOrThrow({
    where: { ownerId: a.id, deletedAt: null }
  });
  assert.equal(
    row.payload.content,
    "  Composer autosave fixture\n\nKeep exact text.  "
  );
  assert.equal(row.payload.replyAudience, "CHURCH_MEMBERS");
  assert.ok(!("linkReceipt" in row.payload));
  await bounded();
  ok("Debounced private autosave retains exact text and member-only replies");
  let dropped;
  await page.route("**/api/platform/post-workspace", async (route) => {
    if (route.request().method() === "POST" && !dropped) {
      dropped = route.request().postData();
      await route.fetch();
      await route.abort("failed");
    } else await route.continue();
  });
  await field().fill("Uncertain save original");
  await save();
  await form().getByRole("button", { name: "Retry same request" }).waitFor();
  await field().fill("New unsent work after response loss");
  await form().getByRole("button", { name: "Retry same request" }).click();
  await page.waitForFunction(
    () =>
      !document
        .querySelector('form[aria-label="Publish post"]')
        ?.textContent.includes("Retry same request")
  );
  assert.equal(writes.at(-1), dropped);
  assert.equal(
    await field().inputValue(),
    "New unsent work after response loss"
  );
  await page.unroute("**/api/platform/post-workspace");
  await save();
  await waitSaved();
  ok(
    "Lost save acknowledgment retries identical body and keeps newer unsent edits"
  );
  row = await db.privatePostDraft.findFirstOrThrow({
    where: { ownerId: a.id, deletedAt: null }
  });
  await postWorkspaceCommand(db, a.token, {
    operation: "save-draft",
    id: row.id,
    expectedVersion: row.version,
    mutationId: randomUUID(),
    payload: {
      ...row.payload,
      content: "Saved elsewhere",
      replyAudience: "VIEWERS"
    }
  });
  await field().fill("My conflicting member-only version");
  await save();
  await page.getByRole("region", { name: "Draft conflict" }).waitFor();
  await form()
    .getByRole("button", { name: "Load saved copy for review" })
    .click();
  await form().getByText("Saved elsewhere", { exact: true }).waitFor();
  assert.equal(
    await field().inputValue(),
    "My conflicting member-only version"
  );
  await form()
    .getByRole("button", { name: "Save my entries as a new draft" })
    .click();
  await waitSaved();
  assert.equal(
    await db.privatePostDraft.count({
      where: { ownerId: a.id, deletedAt: null }
    }),
    2
  );
  ok(
    "Conflict review preserves unsent work and Save as new preserves permissions"
  );
  await form()
    .getByLabel("Share my personal post on", { exact: false })
    .check();
  let publishBody;
  await page.route("**/api/platform/post-workspace", async (route) => {
    const body = route.request().postData();
    if (
      body &&
      JSON.parse(body).operation === "publish-draft" &&
      !publishBody
    ) {
      publishBody = body;
      await route.fetch();
      await route.abort("failed");
    } else await route.continue();
  });
  await form()
    .getByRole("button", { name: "Publish post", exact: true })
    .click();
  await form().getByRole("button", { name: "Retry same request" }).waitFor();
  assert.equal(await field().isDisabled(), true);
  await form().getByRole("button", { name: "Retry same request" }).click();
  await form().getByRole("link", { name: "View published post" }).waitFor();
  assert.equal(writes.at(-1), publishBody);
  assert.equal(await db.platformPost.count({ where: { authorId: a.id } }), 1);
  assert.equal(
    (await db.platformPost.findFirstOrThrow({ where: { authorId: a.id } }))
      .replyAudience,
    "CHURCH_MEMBERS"
  );
  await page.unroute("**/api/platform/post-workspace");
  ok(
    "Draft publication retries once, freezes uncertain publication, and retains reply audience"
  );
  await page.getByRole("button", { name: "Write another post" }).click();
  await field().fill("Keep my current unsent draft");
  await form().getByRole("link", { name: "Your drafts" }).click();
  await page
    .getByRole("link", { name: "Resume draft", exact: true })
    .first()
    .click();
  await page.getByRole("region", { name: "Replace current draft" }).waitFor();
  assert.equal(await field().inputValue(), "Keep my current unsent draft");
  await page
    .getByRole("button", { name: "Keep current draft", exact: true })
    .click();
  assert.equal(await field().inputValue(), "Keep my current unsent draft");
  await page.getByRole("button", { name: "Open selected draft again" }).click();
  await page
    .getByRole("button", { name: "Replace with selected draft" })
    .click();
  await page.waitForFunction(
    () =>
      document.querySelector('textarea[name="content"]')?.value ===
      "Saved elsewhere"
  );
  assert.equal(
    await form().getByLabel("Who may reply?").inputValue(),
    "VIEWERS"
  );
  const resumeUrl = page.url();
  const second = await browser.newContext();
  await second.addCookies(await context.cookies());
  const other = await second.newPage();
  await other.goto(resumeUrl);
  await other.waitForFunction(
    () =>
      document.querySelector('textarea[name="content"]')?.value ===
      "Saved elsewhere"
  );
  assert.equal(
    await other.getByLabel("Who may reply?").inputValue(),
    "VIEWERS"
  );
  await second.close();
  await page.bringToFront();
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  ok(
    "Resume protects dirty work and reopens the saved VIEWERS snapshot in a second context"
  );
  await postWorkspaceCommand(db, a.token, {
    operation: "delete-draft",
    id: row.id,
    expectedVersion: row.version + 1,
    mutationId: randomUUID()
  });
  await page.getByRole("button", { name: "Open selected draft again" }).click();
  await form()
    .getByText(
      "This draft is no longer available. Your current entries are unchanged."
    )
    .waitFor();
  assert.equal(await field().inputValue(), "Saved elsewhere");
  ok("Draft deleted elsewhere leaves the current resumed entries intact");
  const richId = randomUUID();
  const richPayload = {
    ...row.payload,
    content: "Resume all supported fields",
    scripture: "Psalm 23",
    topics: ["prayer"],
    linkUrl: "https://example.com/",
    replyAudience: "CHURCH_MEMBERS"
  };
  await postWorkspaceCommand(db, a.token, {
    operation: "save-draft",
    id: richId,
    expectedVersion: 0,
    mutationId: randomUUID(),
    payload: richPayload
  });
  await go(`/platform/drafts?resume=${richId}#resume`);
  await page.waitForFunction(
    () =>
      document.querySelector('textarea[name="content"]')?.value ===
      "Resume all supported fields"
  );
  assert.equal(
    await form().getByLabel("Who may reply?").inputValue(),
    "CHURCH_MEMBERS"
  );
  assert.equal(
    await form().getByLabel("Optional public HTTPS link").inputValue(),
    "https://example.com/"
  );
  assert.equal(
    await form()
      .getByRole("button", { name: "Remove preview", exact: true })
      .count(),
    0
  );
  let previewRequest;
  await page.route("**/api/platform/posts", async (route) => {
    previewRequest = JSON.parse(route.request().postData());
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        url: "https://example.com/",
        receipt: "synthetic-new-preview",
        preview: {
          title: "Renewed preview",
          description: "Preview fixture",
          sourceUrl: "https://example.com/"
        }
      })
    });
  });
  await form()
    .getByRole("button", { name: "Get link preview", exact: true })
    .click();
  await form()
    .getByRole("button", { name: "Remove preview", exact: true })
    .waitFor();
  assert.equal(previewRequest.operation, "preview-link");
  await form()
    .getByRole("button", { name: "Remove preview", exact: true })
    .click();
  await page.unroute("**/api/platform/posts");
  await db.churchConnection.updateMany({
    where: { userId: a.id, churchId: f.churchA.id },
    data: { state: "REMOVED" }
  });
  await form()
    .getByLabel("Share my personal post on", { exact: false })
    .check();
  const deniedResponse = page.waitForResponse(
    (r) => r.url().includes("post-workspace") && r.request().method() === "POST"
  );
  await form()
    .getByRole("button", { name: "Publish post", exact: true })
    .click();
  assert.equal((await deniedResponse).status(), 403);
  assert.equal(await db.platformPost.count({ where: { authorId: a.id } }), 1);
  assert.deepEqual(
    (await db.privatePostDraft.findFirstOrThrow({ where: { id: richId } }))
      .payload,
    richPayload
  );
  ok(
    "Resumed link previews are renewed explicitly; revoked church access prevents publication and preserves the complete snapshot"
  );
  await field().fill("Private old-account unsent text");
  await signIn(b);
  await page.evaluate(() => {
    window.dispatchEvent(new Event("blur"));
    window.dispatchEvent(new Event("focus"));
  });
  await page.waitForFunction(
    () =>
      !document.body.textContent.includes("Private old-account unsent text") &&
      !document.querySelector('textarea[name="content"]')?.value
  );
  await page.waitForURL(config.origin + "/platform/drafts");
  await go("/platform");
  await page.locator("#compose-post > summary").click();
  await field().waitFor();
  assert.equal(await field().inputValue(), "");
  assert.equal(
    await db.privatePostDraft.count({ where: { ownerId: b.id } }),
    0
  );
  assert.ok(
    !(await page.content()).includes("Private old-account unsent text")
  );
  assert.equal(
    await page.evaluate(() =>
      Object.values(localStorage).some((v) => v.includes("Private old-account"))
    ),
    false
  );
  ok(
    "Account switch clears old draft and pending work without copying it to the new owner"
  );
  const notice = () =>
    page.getByRole("complementary", { name: "Updates and connection" });
  const loaded = await page
    .locator(".platform-design[data-release]")
    .first()
    .getAttribute("data-release");
  assert.match(loaded, /^[a-f0-9]{40}$/);
  let available = "2".repeat(40),
    checks = 0,
    offlineTest = false;
  await page.route("**/api/platform/release", async (route) => {
    checks++;
    if (offlineTest) {
      await route.abort("internetdisconnected");
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ release: available })
    });
  });
  const checkUpdate = async () => {
    await notice()
      .getByRole("button", { name: "Check for updates", exact: true })
      .click();
    await page.waitForFunction(
      () =>
        !document
          .querySelector('[aria-label="Updates and connection"]')
          ?.textContent.includes("Checking for updates")
    );
  };
  await checkUpdate();
  assert.equal(
    await notice().getAttribute("data-update-decision"),
    "offer-refresh"
  );
  await page.getByRole("link", { name: "Menu", exact: true }).first().click();
  await checkUpdate();
  assert.equal(
    await notice().getAttribute("data-update-decision"),
    "offer-refresh"
  );
  const countBefore = checks;
  await page.evaluate(() => {
    for (let i = 0; i < 5; i++) window.dispatchEvent(new Event("focus"));
  });
  await page.waitForTimeout(200);
  assert.equal(checks, countBefore);
  available = loaded;
  await checkUpdate();
  assert.equal(await notice().getAttribute("data-update-decision"), "current");
  available = null;
  await checkUpdate();
  assert.equal(await notice().getAttribute("data-update-decision"), "unknown");
  available = "2".repeat(40);
  await checkUpdate();
  const navigation = page.waitForEvent("domcontentloaded");
  await notice()
    .getByRole("button", { name: "Refresh now", exact: true })
    .click();
  await navigation;
  ok(
    "Rendered build identity survives navigation, compares current/unknown/new releases, throttles foreground checks and refreshes only on explicit clean action"
  );
  await go("/platform");
  await page.locator("#compose-post > summary").click();
  await field().waitFor();
  await field().fill("Retain me through connection loss");
  await checkUpdate();
  assert.equal(
    await notice().getAttribute("data-update-decision"),
    "keep-work"
  );
  assert.equal(
    await notice().getByRole("button", { name: "Refresh now" }).count(),
    0
  );
  await notice().getByRole("button", { name: "See what’s new" }).click();
  await page
    .getByRole("dialog")
    .getByText("Release notes are unavailable for this build.", {
      exact: false
    })
    .waitFor();
  assert.equal(await field().inputValue(), "Retain me through connection loss");
  await page.getByRole("button", { name: "Close notes", exact: true }).click();
  assert.equal(await field().inputValue(), "Retain me through connection loss");
  assert.equal(
    await notice().getByRole("button", { name: "Refresh now" }).count(),
    0
  );
  offlineTest = true;
  await context.setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event("offline")));
  await notice().getByRole("button", { name: "Retry connection" }).click();
  await page.waitForTimeout(200);
  assert.equal(await notice().getAttribute("data-update-decision"), "unknown");
  offlineTest = false;
  await context.setOffline(false);
  await notice().getByRole("button", { name: "Retry connection" }).click();
  await field().waitFor();
  assert.equal(await field().inputValue(), "Retain me through connection loss");
  let releaseSave;
  const holdSave = new Promise((resolve) => {
    releaseSave = resolve;
  });
  await page.route("**/api/platform/post-workspace", async (route) => {
    if (route.request().method() === "POST") await holdSave;
    await route.continue();
  });
  await save();
  await page.waitForFunction(() =>
    document
      .querySelector('form[aria-label="Publish post"]')
      ?.textContent.includes("Saving…")
  );
  assert.equal(
    await notice().getAttribute("data-update-decision"),
    "keep-work"
  );
  releaseSave();
  await waitSaved();
  await page.unroute("**/api/platform/post-workspace");
  const bDraft = await db.privatePostDraft.findFirstOrThrow({
    where: { ownerId: b.id }
  });
  await postWorkspaceCommand(db, b.token, {
    operation: "save-draft",
    id: bDraft.id,
    expectedVersion: bDraft.version,
    mutationId: randomUUID(),
    payload: { ...bDraft.payload, content: "Other tab B" }
  });
  await field().fill("My conflict B");
  await save();
  await page.getByRole("region", { name: "Draft conflict" }).waitFor();
  assert.equal(
    await notice().getAttribute("data-update-decision"),
    "keep-work"
  );
  assert.equal(
    await notice().getByRole("button", { name: "Refresh now" }).count(),
    0
  );
  assert.equal(
    await page.evaluate(
      async () => (await navigator.serviceWorker.getRegistrations()).length
    ),
    0
  );
  assert.equal(
    await page.evaluate(async () => (await caches.keys()).length),
    0
  );
  ok(
    "Update notice retains dirty/offline/in-flight/conflicted work and recovers in the open tab without worker or cache storage"
  );
  assert.deepEqual(errors, []);
  writeFileSync(
    output + "/receipt.json",
    JSON.stringify(
      {
        results,
        pageErrors: errors,
        applicationWrites: "isolated fictional fixtures only"
      },
      null,
      2
    )
  );
} finally {
  await context.close();
  await browser.close();
  await db.$disconnect();
}
