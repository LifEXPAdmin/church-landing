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
const { seedPortal, assertPortalTestDatabase } =
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
const output = fixtureDir + "/composer-shell-browser";
mkdirSync(output, { recursive: true });
const go = async (path) => {
  await page.goto(config.origin + path);
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

page.setDefaultTimeout(20000);
const { randomUUID } = await import("node:crypto");
const { commentCommand } = await import("../lib/platform/comment-commands.ts");
const { postWorkspaceCommand } =
  await import("../lib/platform/post-workspace.ts");
const postForm = () =>
  page.getByRole("form", { name: "Publish post", exact: true });
const content = () => postForm().getByLabel("Post content", { exact: true });
const close = async (form) =>
  form.getByRole("button", { name: "Close composer", exact: true }).click();
const save = async (form) => {
  await form.getByRole("button", { name: "Save draft", exact: true }).click();
  await form.getByText("Saved privately.", { exact: true }).waitFor();
};
const openPost = async () => {
  await page.locator("#compose-post").click();
  await content().waitFor();
};
const choices = async () => {
  const summary = postForm().getByText("Author, audience and replies", {
    exact: true
  });
  if (!(await summary.evaluate((el) => el.parentElement.open)))
    await summary.click();
};
try {
  const f = await seedPortal(db);
  await signIn(f.memberA);
  await go("/platform");
  await openPost();
  await page
    .getByRole("dialog", { name: "Create a post", exact: true })
    .evaluate((el) => {
      const nested = document.createElement("dialog");
      nested.id = "nested-dialog-fixture";
      nested.textContent = "Nested media dialog fixture";
      el.append(nested);
      nested.showModal();
    });
  await page.keyboard.press("Escape");
  assert.equal(
    await postForm().isVisible(),
    true,
    "Nested dialog Escape must not close the composer"
  );
  await page.locator("#nested-dialog-fixture").evaluate((el) => {
    if (el.open) throw Error("Nested dialog did not close");
    el.remove();
  });
  await content().fill("  Exact draft text\n\nKeep all of it.  ");
  await choices();
  await postForm()
    .getByLabel("Also share on a church page")
    .selectOption(f.churchA.id);
  await postForm().getByLabel("Who may reply?").selectOption("CHURCH_MEMBERS");
  await close(postForm());
  await postForm()
    .getByRole("button", { name: "Keep writing", exact: true })
    .click();
  assert.equal(
    await content().inputValue(),
    "  Exact draft text\n\nKeep all of it.  "
  );
  await close(postForm());
  await postForm()
    .getByRole("button", { name: "Save and close", exact: true })
    .click();
  await postForm().waitFor({ state: "hidden" });
  assert.equal(
    await page
      .locator("#compose-post")
      .evaluate((el) => el === document.activeElement),
    true
  );
  let draft = await db.privatePostDraft.findFirstOrThrow({
    where: { ownerId: f.memberA.id, deletedAt: null }
  });
  assert.equal(draft.payload.replyAudience, "CHURCH_MEMBERS");
  await openPost();
  assert.equal(await content().inputValue(), draft.payload.content);
  await content().fill("Only these unsent changes will be discarded");
  await page.evaluate(() => history.back());
  await postForm().getByRole("group", { name: "Keep your draft" }).waitFor();
  await postForm()
    .getByRole("button", { name: "Discard unsent changes", exact: true })
    .click();
  await postForm().waitFor({ state: "hidden" });
  await openPost();
  assert.equal(await content().inputValue(), draft.payload.content);
  assert.deepEqual(
    await db.privatePostDraft.findUnique({
      where: { ownerId_id: { ownerId: f.memberA.id, id: draft.id } }
    }),
    draft
  );
  ok(
    "Close, Keep writing, Save and close, Back and discard preserve the same saved member-only draft and version"
  );

  let lostSave;
  const writes = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().includes("post-workspace"))
      writes.push(request.postData());
  });
  await page.route("**/api/platform/post-workspace", async (route) => {
    if (route.request().method() === "POST" && !lostSave) {
      lostSave = route.request().postData();
      await route.fetch();
      await route.abort("failed");
    } else await route.continue();
  });
  await content().fill("Lost response original");
  await postForm()
    .getByRole("button", { name: "Save draft", exact: true })
    .click();
  await postForm()
    .getByRole("button", { name: "Retry same request", exact: true })
    .waitFor();
  await close(postForm());
  assert.equal(
    await postForm()
      .getByRole("button", { name: "Discard unsent changes", exact: true })
      .isDisabled(),
    true
  );
  await postForm()
    .getByRole("button", { name: "Keep writing", exact: true })
    .click();
  await content().fill("Newer unsent edits survive exact retry");
  await postForm()
    .getByRole("button", { name: "Retry same request", exact: true })
    .click();
  await postForm()
    .getByRole("button", { name: "Retry same request", exact: true })
    .waitFor({ state: "hidden" });
  assert.equal(writes.at(-1), lostSave);
  assert.equal(
    await content().inputValue(),
    "Newer unsent edits survive exact retry"
  );
  await page.unroute("**/api/platform/post-workspace");
  await save(postForm());
  draft = await db.privatePostDraft.findUniqueOrThrow({
    where: { ownerId_id: { ownerId: f.memberA.id, id: draft.id } }
  });
  await postWorkspaceCommand(db, f.memberA.token, {
    operation: "save-draft",
    id: draft.id,
    expectedVersion: draft.version,
    mutationId: randomUUID(),
    payload: {
      ...draft.payload,
      content: "Other saved version",
      replyAudience: "VIEWERS"
    }
  });
  await content().fill("My conflicting member-only words");
  await postForm()
    .getByRole("button", { name: "Save draft", exact: true })
    .click();
  await page.getByRole("region", { name: "Draft conflict" }).waitFor();
  await close(postForm());
  assert.equal(
    await postForm()
      .getByRole("button", { name: "Discard unsent changes", exact: true })
      .isDisabled(),
    false
  );
  await postForm()
    .getByRole("button", { name: "Keep writing", exact: true })
    .click();
  await postForm()
    .getByRole("button", { name: "Load saved copy for review", exact: true })
    .click();
  await postForm().getByText("Other saved version", { exact: true }).waitFor();
  assert.equal(
    await content().inputValue(),
    "My conflicting member-only words"
  );
  await postForm()
    .getByRole("button", {
      name: "Save my entries as a new draft",
      exact: true
    })
    .click();
  await postForm().getByText("Saved privately.", { exact: true }).waitFor();
  await choices();
  await postForm()
    .getByLabel("Share my personal post on", { exact: false })
    .check();
  let lostPublish;
  await page.route("**/api/platform/post-workspace", async (route) => {
    const body = route.request().postData();
    if (
      body &&
      JSON.parse(body).operation === "publish-draft" &&
      !lostPublish
    ) {
      lostPublish = body;
      await route.fetch();
      await route.abort("failed");
    } else await route.continue();
  });
  await postForm().getByRole("button", { name: "Post", exact: true }).click();
  await postForm()
    .getByRole("button", { name: "Retry same request", exact: true })
    .waitFor();
  assert.equal(await content().isDisabled(), true);
  await postForm()
    .getByRole("button", { name: "Retry same request", exact: true })
    .click();
  await postForm()
    .getByRole("link", { name: "View published post", exact: true })
    .waitFor();
  assert.equal(writes.at(-1), lostPublish);
  await page.unroute("**/api/platform/post-workspace");
  const published = await db.platformPost.findFirstOrThrow({
    where: { authorId: f.memberA.id }
  });
  assert.equal(published.replyAudience, "CHURCH_MEMBERS");
  assert.equal(
    await db.platformPost.count({ where: { authorId: f.memberA.id } }),
    1
  );
  ok(
    "Save and publish retry exact bytes, newer entries survive, conflict Save as new retains reply permissions, publication occurs once"
  );

  await close(postForm());
  await go(`/platform/drafts?resume=${draft.id}`);
  await content().waitFor();
  await page.waitForFunction(
    () =>
      document.querySelector('textarea[name="content"]')?.value ===
      "Other saved version"
  );
  assert.equal(await content().inputValue(), "Other saved version");
  await choices();
  assert.equal(
    await postForm().getByLabel("Who may reply?").inputValue(),
    "VIEWERS"
  );
  await postForm()
    .getByLabel("Share my personal post on", { exact: false })
    .check();
  await postForm().getByRole("button", { name: "Post", exact: true }).click();
  await postForm()
    .getByRole("link", { name: "View published post", exact: true })
    .waitFor();
  assert.equal(
    await db.platformPost.count({
      where: { authorId: f.memberA.id, replyAudience: "VIEWERS" }
    }),
    1
  );
  await close(postForm());
  const legacyId = randomUUID();
  const { replyAudience: omitted, ...legacy } = draft.payload;
  assert.equal(omitted, "CHURCH_MEMBERS");
  await db.privatePostDraft.create({
    data: {
      id: legacyId,
      ownerId: f.memberA.id,
      version: 1,
      payload: {
        ...legacy,
        content: "Legacy requires a deliberate reply choice"
      }
    }
  });
  await go(`/platform/drafts?resume=${legacyId}`);
  await page.waitForFunction(
    () =>
      document.querySelector('textarea[name="content"]')?.value ===
      "Legacy requires a deliberate reply choice"
  );
  await choices();
  assert.equal(await postForm().getByLabel("Who may reply?").inputValue(), "");
  assert.equal(
    await postForm()
      .getByRole("button", { name: "Post", exact: true })
      .isDisabled(),
    true
  );
  await postForm().getByLabel("Who may reply?").selectOption("CHURCH_MEMBERS");
  await save(postForm());
  await db.churchConnection.updateMany({
    where: { churchId: f.churchA.id, userId: f.memberA.id },
    data: { state: "REMOVED" }
  });
  await postForm()
    .getByLabel("Share my personal post on", { exact: false })
    .check();
  const denied = page.waitForResponse(
    (r) => r.url().includes("post-workspace") && r.request().method() === "POST"
  );
  await postForm().getByRole("button", { name: "Post", exact: true }).click();
  assert.equal((await denied).status(), 403);
  assert.equal(
    await db.platformPost.count({ where: { authorId: f.memberA.id } }),
    2
  );
  assert.equal(
    (
      await db.privatePostDraft.findUniqueOrThrow({
        where: { ownerId_id: { ownerId: f.memberA.id, id: legacyId } }
      })
    ).payload.replyAudience,
    "CHURCH_MEMBERS"
  );
  const legacySaved = await db.privatePostDraft.findUniqueOrThrow({
    where: { ownerId_id: { ownerId: f.memberA.id, id: legacyId } }
  });
  await postWorkspaceCommand(db, f.memberA.token, {
    operation: "save-draft",
    id: legacyId,
    expectedVersion: legacySaved.version,
    mutationId: randomUUID(),
    payload: { ...legacySaved.payload, content: "Current saved legacy copy" }
  });
  await content().fill("Conflict may be discarded explicitly");
  await postForm()
    .getByRole("button", { name: "Save draft", exact: true })
    .click();
  await page
    .getByRole("region", { name: "Draft conflict", exact: true })
    .waitFor();
  await close(postForm());
  await postForm()
    .getByRole("button", { name: "Discard unsent changes", exact: true })
    .click();
  await postForm().waitFor({ state: "hidden" });
  assert.equal(
    (
      await db.privatePostDraft.findUniqueOrThrow({
        where: { ownerId_id: { ownerId: f.memberA.id, id: legacyId } }
      })
    ).payload.content,
    "Current saved legacy copy"
  );
  ok(
    "VIEWERS publishes explicitly; legacy snapshots demand a choice; revoked church access rejects publication without consuming the draft"
  );

  const post = await db.platformPost.create({
    data: {
      authorId: f.memberB.id,
      content: "Fictional shared composer discussion",
      publishedAt: new Date()
    }
  });
  await go(`/platform/posts/${post.id}`);
  await page
    .getByRole("button", { name: "Write a comment", exact: true })
    .click();
  const commentForm = () =>
    page.getByRole("form", { name: "Write a comment", exact: true });
  const text = () => commentForm().getByLabel("Comment text", { exact: true });
  await text().fill("Saved root reply with exact whitespace  ");
  await close(commentForm());
  await commentForm()
    .getByRole("button", { name: "Save and close", exact: true })
    .click();
  await commentForm().waitFor({ state: "hidden" });
  const savedComment = await db.privateCommentDraft.findFirstOrThrow({
    where: { ownerId: f.memberA.id, postId: post.id, deletedAt: null }
  });
  await page
    .getByRole("button", { name: "Write a comment", exact: true })
    .click();
  await page.waitForFunction(() => {
    const field = document.querySelector(
      'form[aria-label="Write a comment"] textarea'
    );
    return field && !field.disabled;
  });
  assert.equal(await text().inputValue(), savedComment.content);
  await text().fill("Unsent replacement");
  await page.keyboard.press("Escape");
  await commentForm()
    .getByRole("button", { name: "Discard unsent changes", exact: true })
    .click();
  await commentForm().waitFor({ state: "hidden" });
  await page
    .getByRole("button", { name: "Write a comment", exact: true })
    .click();
  await page.waitForFunction(() => {
    const field = document.querySelector(
      'form[aria-label="Write a comment"] textarea'
    );
    return field && !field.disabled;
  });
  assert.equal(await text().inputValue(), savedComment.content);
  let lostReply;
  const replyBodies = [];
  await page.route("**/api/platform/comments", async (route) => {
    const body = route.request().postData();
    if (body && JSON.parse(body).operation === "create") {
      replyBodies.push(body);
      if (!lostReply) {
        lostReply = body;
        await route.fetch();
        await route.abort("failed");
        return;
      }
    }
    await route.continue();
  });
  await commentForm()
    .getByRole("button", { name: "Reply", exact: true })
    .click();
  await commentForm()
    .getByRole("button", { name: "Retry same request", exact: true })
    .waitFor();
  await close(commentForm());
  assert.equal(
    await commentForm()
      .getByRole("button", { name: "Discard unsent changes", exact: true })
      .isDisabled(),
    true
  );
  await commentForm()
    .getByRole("button", { name: "Keep writing", exact: true })
    .click();
  await commentForm()
    .getByRole("button", { name: "Retry same request", exact: true })
    .click();
  await commentForm().waitFor({ state: "hidden" });
  assert.equal(replyBodies[0], replyBodies[1]);
  await page.unroute("**/api/platform/comments");
  assert.equal(
    await db.platformPostComment.count({ where: { postId: post.id } }),
    1
  );
  assert.ok(
    await db.privatePostDraft.findUnique({
      where: { ownerId_id: { ownerId: f.memberA.id, id: legacyId } }
    })
  );
  const root = await db.platformPostComment.findFirstOrThrow({
    where: { postId: post.id }
  });
  await page
    .locator(`[data-comment-id="${root.id}"]`)
    .getByRole("button", { name: "Reply", exact: true })
    .click();
  const reply = () =>
    page.getByRole("form", { name: "Write a reply", exact: true });
  await reply()
    .getByText(`Replying to ${f.memberA.name}`, { exact: true })
    .waitFor();
  await reply()
    .getByLabel("Comment text", { exact: true })
    .fill("Nested reply keeps its parent");
  await reply().getByRole("button", { name: "Reply", exact: true }).click();
  await reply().waitFor({ state: "hidden" });
  assert.equal(
    await db.platformPostComment.count({
      where: { postId: post.id, parentId: root.id }
    }),
    1
  );
  ok(
    "Comment save/resume/discard and exact publication retry preserve the target; nested Reply retains parent context and leaves the independent post draft intact"
  );

  await page
    .getByRole("button", { name: "Write a comment", exact: true })
    .click();
  await text().fill("Reply save before conflict");
  let saveDropped;
  const saveBodies = [];
  await page.route("**/api/platform/comments", async (route) => {
    const body = route.request().postData();
    if (body && JSON.parse(body).operation === "draft-save") {
      saveBodies.push(body);
      if (!saveDropped) {
        saveDropped = body;
        await route.fetch();
        await route.abort("failed");
        return;
      }
    }
    await route.continue();
  });
  await commentForm()
    .getByRole("button", { name: "Save draft", exact: true })
    .click();
  await commentForm()
    .getByRole("button", { name: "Retry same request", exact: true })
    .waitFor();
  await text().fill("Newer comment words");
  await commentForm()
    .getByRole("button", { name: "Retry same request", exact: true })
    .click();
  await commentForm()
    .getByRole("button", { name: "Retry same request", exact: true })
    .waitFor({ state: "hidden" });
  assert.equal(saveBodies[0], saveBodies[1]);
  assert.equal(await text().inputValue(), "Newer comment words");
  await page.unroute("**/api/platform/comments");
  await save(commentForm());
  const conflictDraft = await db.privateCommentDraft.findFirstOrThrow({
    where: {
      ownerId: f.memberA.id,
      postId: post.id,
      replyToId: null,
      deletedAt: null
    }
  });
  await commentCommand(db, f.memberA.token, {
    operation: "draft-save",
    postId: post.id,
    replyToId: null,
    draftId: conflictDraft.id,
    expectedVersion: conflictDraft.version,
    mutationId: randomUUID(),
    content: "New saved comment elsewhere",
    mentionIds: [],
    authorChurchId: null
  });
  await text().fill("Unsent conflict stays visible");
  await commentForm()
    .getByRole("button", { name: "Save draft", exact: true })
    .click();
  await commentForm()
    .getByRole("button", { name: "Review saved copy", exact: true })
    .click();
  await commentForm()
    .getByRole("complementary", { name: "Saved comment copy", exact: true })
    .waitFor();
  assert.equal(await text().inputValue(), "Unsent conflict stays visible");
  await close(commentForm());
  assert.equal(
    await commentForm()
      .getByRole("button", { name: "Discard unsent changes", exact: true })
      .isDisabled(),
    false
  );
  await commentForm()
    .getByRole("button", { name: "Keep writing", exact: true })
    .click();
  await commentForm()
    .getByRole("button", {
      name: "Replace my text with saved copy",
      exact: true
    })
    .click();
  assert.equal(await text().inputValue(), "New saved comment elsewhere");
  await close(commentForm());
  await commentForm().waitFor({ state: "hidden" });
  await go("/platform/comment-drafts");
  await page
    .locator(`[data-comment-draft-id="${conflictDraft.id}"]`)
    .getByRole("button", { name: "Resume comment draft", exact: true })
    .click();
  await page.waitForFunction(
    () =>
      document.querySelector('form[aria-label="Write a comment"] textarea')
        ?.value === "New saved comment elsewhere"
  );
  await close(commentForm());
  await commentForm().waitFor({ state: "hidden" });
  assert.equal(
    (
      await db.privateCommentDraft.findUniqueOrThrow({
        where: { ownerId_id: { ownerId: f.memberA.id, id: conflictDraft.id } }
      })
    ).version,
    conflictDraft.version + 1
  );
  await go(`/platform/posts/${post.id}`);
  await page
    .getByRole("button", { name: "Write a comment", exact: true })
    .click();
  await text().fill("Another local conflict");
  await commentCommand(db, f.memberA.token, {
    operation: "draft-save",
    postId: post.id,
    replyToId: null,
    draftId: conflictDraft.id,
    expectedVersion: conflictDraft.version + 1,
    mutationId: randomUUID(),
    content: "Current saved comment kept",
    mentionIds: [],
    authorChurchId: null
  });
  await commentForm()
    .getByRole("button", { name: "Save draft", exact: true })
    .click();
  await commentForm()
    .getByRole("button", { name: "Review saved copy", exact: true })
    .waitFor();
  await close(commentForm());
  await commentForm()
    .getByRole("button", { name: "Discard unsent changes", exact: true })
    .click();
  await commentForm().waitFor({ state: "hidden" });
  assert.equal(
    (
      await db.privateCommentDraft.findUniqueOrThrow({
        where: { ownerId_id: { ownerId: f.memberA.id, id: conflictDraft.id } }
      })
    ).content,
    "Current saved comment kept"
  );
  ok(
    "Comment save retries exact bytes, conflict review keeps unsent words, explicit replacement and library resume retain the same saved target/version"
  );

  // Layout and keyboard viewport simulation; physical keyboards remain a separate check.
  await page
    .getByRole("button", { name: "Write a comment", exact: true })
    .click();
  await text().fill("Visual keyboard fixture");
  for (const width of [320, 390, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    for (const theme of ["light", "dark"]) {
      await page.evaluate((theme) => {
        document.querySelectorAll(".platform-design").forEach((el) => {
          el.dataset.appearance = theme;
        });
      }, theme);
      const dialog = page.getByRole("dialog", {
        name: "Write a comment",
        exact: true
      });
      await bounded();
      assert.equal(
        await dialog.evaluate((el) => getComputedStyle(el).color),
        await page
          .locator(".platform-design")
          .last()
          .evaluate((el) => getComputedStyle(el).color)
      );
      const rect = await dialog.boundingBox(),
        closeRect = await commentForm()
          .getByRole("button", { name: "Close composer", exact: true })
          .boundingBox(),
        saveRect = await commentForm()
          .getByRole("button", { name: "Save draft", exact: true })
          .boundingBox(),
        sendRect = await commentForm()
          .getByRole("button", { name: "Reply", exact: true })
          .boundingBox();
      assert.ok(
        rect.width <= 600 && rect.x >= 0 && rect.x + rect.width <= width
      );
      assert.ok(
        closeRect.x < saveRect.x &&
          closeRect.y < sendRect.y &&
          sendRect.x > closeRect.x
      );
      await dialog.screenshot({
        path: `${output}/composer-${width}-${theme}.png`
      });
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => {
    document
      .querySelector(".platform-design")
      .style.setProperty("--gc-reader-size", "24px");
    document.documentElement.style.fontSize = "24px";
  });
  // A reduced viewport models the space left by an on-screen keyboard.
  await page.setViewportSize({ width: 390, height: 400 });
  await page.waitForTimeout(100);
  const bottom = await commentForm()
    .getByRole("button", { name: "Reply", exact: true })
    .boundingBox();
  assert.ok(
    bottom.y + bottom.height <= 400,
    "Primary action remains inside reduced keyboard viewport"
  );
  await bounded();
  await page
    .getByRole("dialog", { name: "Write a comment", exact: true })
    .screenshot({ path: `${output}/composer-large-keyboard.png` });
  await close(commentForm());
  await commentForm()
    .getByRole("button", { name: "Discard unsent changes", exact: true })
    .click();
  await commentForm().waitFor({ state: "hidden" });
  ok(
    "Close/Save/Reply placement, focus return, light/dark 320/390/1280 layouts, large text and reduced keyboard viewport remain usable"
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await go("/platform");
  await openPost();
  await content().fill("Post layout and optional controls");
  await save(postForm());
  const surfaces = [];
  for (const [width, theme] of [
    [320, "light"],
    [390, "dark"],
    [1280, "dark"]
  ]) {
    await page.setViewportSize({ width, height: 844 });
    await page.evaluate(
      (theme) =>
        document.querySelectorAll(".platform-design").forEach((el) => {
          el.dataset.appearance = theme;
        }),
      theme
    );
    const editor = page.getByRole("dialog", {
      name: "Create a post",
      exact: true
    });
    const closeBox = await postForm()
      .getByRole("button", { name: "Close composer", exact: true })
      .boundingBox();
    const saveBox = await postForm()
      .getByRole("button", { name: "Save draft", exact: true })
      .boundingBox();
    const postBox = await postForm()
      .getByRole("button", { name: "Post", exact: true })
      .boundingBox();
    assert.ok(
      closeBox.x < saveBox.x &&
        closeBox.y < postBox.y &&
        postBox.y + postBox.height <= 844
    );
    surfaces.push(
      await editor.evaluate((el) => getComputedStyle(el).backgroundColor)
    );
    await bounded();
    await editor.screenshot({ path: `${output}/post-${width}-${theme}.png` });
  }
  assert.notEqual(
    surfaces[0],
    surfaces[1],
    "Actual light and dark surfaces differ"
  );
  await close(postForm());
  await postForm().waitFor({ state: "hidden" });
  ok(
    "Post editor uses the same bounded header/footer and actual light/dark surfaces with compact optional tools"
  );
  assert.deepEqual(errors, []);
  writeFileSync(
    output + "/receipt.json",
    JSON.stringify({ results, errors, at: new Date().toISOString() }, null, 2)
  );
} catch (error) {
  await page.screenshot({ path: output + "/failure.png" }).catch(() => {});
  writeFileSync(output + "/failure.html", await page.content());
  throw error;
} finally {
  await browser.close();
  await db.$disconnect();
}
