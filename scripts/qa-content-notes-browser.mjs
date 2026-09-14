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
const { assertPortalTestDatabase } = await import("../tests/seed-portal.ts");
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
  timezoneId: "America/Chicago",
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
const output = fixtureDir + "/content-notes-browser";
mkdirSync(output, { recursive: true });
const go = async (path) => {
  await page.goto(config.origin + path);
  await page.getByRole("heading", { level: 1 }).waitFor();
};
const bounded = async () =>
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1
    ),
    "No horizontal page overflow"
  );

const { seedPortal } = await import("../tests/seed-portal.ts");
const { randomUUID } = await import("node:crypto");
const { postCommand } = await import("../lib/platform/post-commands.ts");
const { relationshipCommand } =
  await import("../lib/platform/relationships.ts");
const signIn = async (actor) => {
  await context.clearCookies();
  await context.addCookies([
    {
      name: "church_platform_session",
      value: actor.token,
      url: config.origin,
      secure: true,
      httpOnly: true,
      sameSite: "Lax"
    }
  ]);
};
const resume = async () => {
  await page.evaluate(() => {
    window.dispatchEvent(new Event("blur"));
    window.dispatchEvent(new Event("focus"));
  });
};
const editForm = () =>
  page.getByRole("form", { name: "Save post changes", exact: true });
const openEdit = async () => {
  await page.locator("#post-edit > summary").waitFor();
  if (!(await page.locator("#post-edit").evaluate((el) => el.open)))
    await page.locator("#post-edit > summary").click();
  await editForm()
    .getByText("Content note and preview", { exact: true })
    .click();
  await editForm()
    .getByLabel("Optional content note", { exact: true })
    .waitFor();
};
const bodies = [];
page.on("request", (request) => {
  if (
    request.method() === "POST" &&
    new URL(request.url()).pathname === "/api/platform/posts"
  )
    bodies.push(request.postData());
});
try {
  const f = await seedPortal(db),
    author = f.memberA,
    reader = f.contact;
  const full =
    "Fictional detailed body for content-note acceptance " + randomUUID();
  const post = await postCommand(db, author.token, {
    operation: "create",
    requestKey: randomUUID(),
    content: full,
    contentNote: "A reflection on loss <script>plain text</script>",
    safeExcerpt: "A safe introduction chosen by the author.",
    allowReposts: true
  });
  // Metadata only: the noted feed must not mount a gallery or request these bytes.
  const asset = await db.mediaAsset.create({
    data: {
      uploaderId: author.id,
      requestKey: randomUUID(),
      fingerprint: "fictional-noted-preview",
      purpose: "POST_PHOTO",
      postId: post.id,
      status: "READY",
      storagePrefix: "fictional-note-" + randomUUID(),
      leaseUntil: new Date(),
      variants: {}
    }
  });
  await signIn(reader);
  const galleryReads = [];
  page.on("request", (request) => {
    if (
      request.url().includes(post.id) &&
      /post-gallery|photos|media/.test(request.url())
    )
      galleryReads.push(request.url());
  });
  await go("/platform");
  const card = page
    .locator("article.gc-post")
    .filter({ hasText: "A safe introduction chosen by the author." });
  await card.waitFor();
  assert.ok(!(await card.innerText()).includes(full));
  assert.ok((await card.innerText()).includes("<script>plain text</script>"));
  assert.equal(await card.locator("script").count(), 0);
  assert.equal(galleryReads.length, 0);
  await bounded();
  await card.screenshot({ path: output + "/noted-feed-390.png" });
  ok(
    "Noted mobile feed shows literal author note and safe excerpt, conceals full text, and makes no hidden gallery request"
  );
  await db.mediaAsset.delete({ where: { id: asset.id } });
  await go(`/platform/posts/${post.id}`);
  await page
    .locator("article.gc-post")
    .getByText(full, { exact: true })
    .waitFor();
  await bounded();
  ok("Opening the current post reveals its full text below the author note");

  const relationshipBodies = [];
  let lostRelationship = false;
  await page.route("**/api/platform/relationships", async (route) => {
    if (route.request().method() === "POST") {
      relationshipBodies.push(route.request().postData());
      if (!lostRelationship) {
        lostRelationship = true;
        const response = await route.fetch();
        assert.equal(response.status(), 200);
        await route.abort("failed");
        return;
      }
    }
    await route.continue();
  });
  await page
    .getByRole("button", {
      name: `More options for ${author.name}'s post`,
      exact: true
    })
    .click();
  await page
    .getByRole("link", { name: "Report this post", exact: true })
    .waitFor();
  await page.getByRole("button", { name: "Follow", exact: true }).click();
  await page
    .getByRole("button", {
      name: "Retry same relationship change",
      exact: true
    })
    .waitFor();
  await resume();
  await page
    .getByRole("button", {
      name: "Retry same relationship change",
      exact: true
    })
    .click();
  await page
    .getByRole("button", {
      name: "Retry same relationship change",
      exact: true
    })
    .waitFor({ state: "hidden" });
  assert.equal(relationshipBodies.length, 2);
  assert.equal(relationshipBodies[0], relationshipBodies[1]);
  await page.unroute("**/api/platform/relationships");
  ok(
    "A retained full post preserves an uncertain relationship-menu action across text concealment and confirms the same request"
  );

  await signIn(author);
  await go(`/platform/posts/${post.id}`);
  await openEdit();
  const note = () =>
    editForm().getByLabel("Optional content note", { exact: true });
  const excerpt = () =>
    editForm().getByLabel("Optional safe excerpt", { exact: true });
  const beforeValidation = bodies.length;
  await note().fill("x".repeat(121));
  await editForm()
    .getByRole("button", { name: "Save post changes", exact: true })
    .click();
  await editForm()
    .getByText(
      "Use up to 120 characters for the content note. Your draft has not been shortened.",
      { exact: true }
    )
    .waitFor();
  assert.equal((await note().inputValue()).length, 121);
  assert.equal(bodies.length, beforeValidation);
  await note().fill("Edited note before a lost response");
  await excerpt().fill("Edited safe excerpt before a lost response");
  // The app's own navigation protection must retain both new choices.
  await page.getByRole("link", { name: "Browse posts", exact: true }).click();
  assert.ok(page.url().includes(post.id));
  assert.equal(await note().inputValue(), "Edited note before a lost response");
  let dropped;
  await page.route("**/api/platform/posts", async (route) => {
    if (route.request().method() === "POST" && !dropped) {
      dropped = route.request().postData();
      const saved = await route.fetch();
      assert.equal(saved.status(), 200);
      await route.abort("failed");
    } else await route.continue();
  });
  await editForm()
    .getByRole("button", { name: "Save post changes", exact: true })
    .click();
  await editForm()
    .getByRole("button", { name: "Retry original request", exact: true })
    .waitFor();
  assert.equal(await note().isDisabled(), true);
  await resume();
  await page
    .getByRole("button", { name: "Confirm original request", exact: true })
    .waitFor();
  assert.equal(await editForm().isVisible(), false);
  await page
    .getByRole("button", { name: "Confirm original request", exact: true })
    .click();
  await editForm()
    .getByRole("button", { name: "Make another change", exact: true })
    .waitFor();
  assert.equal(bodies.at(-1), dropped);
  assert.equal(bodies.filter((body) => body === dropped).length, 2);
  assert.equal(
    (await db.platformPost.findUniqueOrThrow({ where: { id: post.id } }))
      .version,
    2
  );
  assert.equal(
    await db.postAudit.count({ where: { postId: post.id, action: "edited" } }),
    1
  );
  await page.unroute("**/api/platform/posts");
  ok(
    "Lost committed edit freezes its exact body, conceals on blur, and confirms one original receipt after current access returns"
  );

  await go(`/platform/posts/${post.id}`);
  await openEdit();
  await note().fill("My unsent note retained through conflict");
  await postCommand(db, author.token, {
    operation: "edit",
    postId: post.id,
    expectedVersion: 2,
    safeExcerpt: "A concurrent saved excerpt"
  });
  await editForm()
    .getByRole("button", { name: "Save post changes", exact: true })
    .click();
  await editForm()
    .getByRole("button", { name: "Load latest saved post", exact: true })
    .click();
  await editForm()
    .getByRole("region", { name: "Latest saved post", exact: true })
    .waitFor();
  assert.equal(
    await note().inputValue(),
    "My unsent note retained through conflict"
  );
  assert.ok(
    (await editForm().innerText()).includes("A concurrent saved excerpt")
  );
  assert.equal(
    (await db.platformPost.findUniqueOrThrow({ where: { id: post.id } }))
      .version,
    3
  );
  await bounded();
  await editForm().screenshot({ path: output + "/edit-conflict-390.png" });
  await editForm()
    .getByRole("button", {
      name: "I reviewed this version; keep my draft",
      exact: true
    })
    .click();
  await editForm()
    .getByRole("button", { name: "Save post changes", exact: true })
    .click();
  await editForm()
    .getByRole("button", { name: "Make another change", exact: true })
    .waitFor();
  assert.equal(
    (await db.platformPost.findUniqueOrThrow({ where: { id: post.id } }))
      .contentNote,
    "My unsent note retained through conflict"
  );
  ok(
    "Concurrent edit preserves local note/excerpt, displays current choices, and requires explicit review before a new save"
  );

  await go(`/platform/posts/${post.id}`);
  await openEdit();
  await note().fill("An unsent owner-specific note");
  const beforeSwitch = bodies.length;
  await signIn(reader);
  // Exercise the retained old form before resume replaces the server snapshot.
  // Its pinned transport must reject the changed owner before a POST.
  await editForm().evaluate((form) => form.requestSubmit());
  await editForm()
    .getByText("Your sign-in changed. Reload before continuing.", {
      exact: true
    })
    .waitFor();
  assert.equal(bodies.length, beforeSwitch);
  await resume();
  await editForm().waitFor({ state: "hidden" });
  assert.equal(bodies.length, beforeSwitch);
  assert.equal(
    (await db.platformPost.findUniqueOrThrow({ where: { id: post.id } }))
      .version,
    4
  );
  ok(
    "Account switching conceals the old editor and prevents its pending choices from being submitted by another account"
  );

  await signIn(author);
  await go("/platform");
  await page
    .getByRole("button", { name: "Share what's on your heart", exact: true })
    .click();
  const composer = page.getByRole("form", {
    name: "Publish post",
    exact: true
  });
  await composer
    .getByLabel("Post content", { exact: true })
    .fill("Fictional draft note retention body");
  await composer.getByText("Content note and preview", { exact: true }).click();
  await composer
    .getByLabel("Optional content note", { exact: true })
    .fill("Draft reflection note");
  await composer
    .getByLabel("Optional safe excerpt", { exact: true })
    .fill("Draft preview chosen by the author");
  await composer
    .getByRole("button", { name: "Save draft", exact: true })
    .click();
  await page.waitForFunction(() =>
    document
      .querySelector('form[aria-label="Publish post"]')
      ?.textContent.includes("Saved privately.")
  );
  const draft = await db.privatePostDraft.findFirstOrThrow({
    where: { ownerId: author.id, deletedAt: null },
    orderBy: { updatedAt: "desc" }
  });
  assert.equal(draft.payload.contentNote, "Draft reflection note");
  assert.equal(draft.payload.safeExcerpt, "Draft preview chosen by the author");
  const reopened = await db.privatePostDraft.findUniqueOrThrow({
    where: { ownerId_id: { ownerId: author.id, id: draft.id } }
  });
  assert.equal(reopened.payload.replyAudience, "VIEWERS");
  await page.setViewportSize({ width: 320, height: 780 });
  await bounded();
  await composer.screenshot({ path: output + "/draft-notes-320.png" });
  await page.setViewportSize({ width: 1280, height: 900 });
  await bounded();
  ok(
    "Composer saves both optional choices privately with reply permission intact and fits 320/390/1280-pixel layouts"
  );

  await composer
    .getByRole("button", { name: "Close composer", exact: true })
    .click();
  await go("/platform/drafts");
  const savedDraft = page
    .getByRole("listitem")
    .filter({ hasText: "Fictional draft note retention body" });
  await savedDraft
    .getByRole("link", { name: "Resume draft", exact: true })
    .click();
  const resumed = page.getByRole("form", { name: "Publish post", exact: true });
  await resumed.getByLabel("Post content", { exact: true }).waitFor();
  await resumed.getByText("Content note and preview", { exact: true }).click();
  assert.equal(
    await resumed
      .getByLabel("Optional content note", { exact: true })
      .inputValue(),
    "Draft reflection note"
  );
  assert.equal(
    await resumed
      .getByLabel("Optional safe excerpt", { exact: true })
      .inputValue(),
    "Draft preview chosen by the author"
  );
  await resumed.getByRole("button", { name: "Post", exact: true }).click();
  const published = resumed.getByRole("link", {
    name: "View published post",
    exact: true
  });
  await published.waitFor();
  await published.click();
  await page
    .locator("article.gc-post")
    .getByText("Draft reflection note", { exact: false })
    .waitFor();
  const consumed = await db.privatePostDraft.findUniqueOrThrow({
    where: { ownerId_id: { ownerId: author.id, id: draft.id } }
  });
  assert.ok(consumed.deletedAt);
  assert.equal(consumed.payload, null);
  const publishedPost = await db.platformPost.findFirstOrThrow({
    where: {
      authorId: author.id,
      content: "Fictional draft note retention body"
    }
  });
  assert.equal(publishedPost.contentNote, "Draft reflection note");
  assert.equal(publishedPost.safeExcerpt, "Draft preview chosen by the author");
  assert.equal(publishedPost.replyAudience, "VIEWERS");
  ok(
    "A saved draft reopens through the real library and publishes both author choices exactly once with its reply permission unchanged"
  );

  const privatePost = await postCommand(db, author.token, {
    operation: "create",
    requestKey: randomUUID(),
    content: "Private body before source revocation",
    contentNote: "Private source note",
    safeExcerpt: "Private source excerpt",
    audience: "CHURCH",
    audienceChurchId: f.churchA.id
  });
  await signIn(reader);
  await go(`/platform/posts/${privatePost.id}`);
  await page
    .locator("article.gc-post")
    .getByText("Private body before source revocation", { exact: true })
    .waitFor();
  await relationshipCommand(db, reader.token, {
    operation: "block",
    mutationId: randomUUID(),
    kind: "person",
    targetId: author.id,
    desired: true,
    expectedVersion: 1
  });
  await resume();
  await page
    .locator("article.gc-post")
    .getByText("Private body before source revocation", { exact: true })
    .waitFor({ state: "hidden" });
  ok(
    "Returning to a retained private post after a block conceals its note, excerpt and full body under the current source boundary"
  );
  assert.deepEqual(errors, []);
  writeFileSync(
    output + "/results.json",
    JSON.stringify(
      { results, errors, productionWrites: 0, externalSends: 0 },
      null,
      2
    )
  );
} catch (error) {
  await page
    .screenshot({ path: output + "/failure.png", fullPage: true })
    .catch(() => {});
  writeFileSync(
    output + "/failure.txt",
    String(error) +
      "\n" +
      (await page
        .locator("body")
        .innerText()
        .catch(() => ""))
  );
  throw error;
} finally {
  await browser.close();
  await db.$disconnect();
}
