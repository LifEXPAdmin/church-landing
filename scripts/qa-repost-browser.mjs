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
const output = fixtureDir + "/repost-browser";
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

const signIn = async (actor) => {
  await context.clearCookies();
  await context.addCookies([
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
  await page.goto("about:blank");
};

page.setDefaultTimeout(20000);

const { randomUUID } = await import("node:crypto");
const { portalCommand } = await import("../lib/platform/portal.ts");
const { postWorkspaceCommand } =
  await import("../lib/platform/post-workspace.ts");
const pop = () =>
  page.getByRole("dialog", { name: "Repost choices", exact: true });
const postForm = () =>
  page.getByRole("form", { name: "Publish post", exact: true });
const content = () => postForm().getByLabel("Post content", { exact: true });
const check = async (predicate) => {
  for (let i = 0; i < 100; i++) {
    if (await predicate()) return;
    await page.waitForTimeout(100);
  }
  throw Error("Fixture state did not reach its expected value");
};
try {
  const f = await seedPortal(db);
  await portalCommand(db, f.operator.token, {
    operation: "grant",
    churchId: f.churchA.id,
    userId: f.memberA.id,
    capability: "PUBLISH_CHURCH_POSTS",
    expectedVersion: 0
  });
  const source = await db.platformPost.create({
    data: {
      authorId: f.memberB.id,
      content: "Original browser repost marker",
      publishedAt: new Date(Date.now() - 3600000)
    }
  });
  await signIn(f.memberA);
  await go(`/platform/posts/${source.id}`);
  await page
    .getByRole("button", { name: "Repost choices", exact: true })
    .click();
  await pop()
    .getByText("This source is currently unavailable for reposting.", {
      exact: true
    })
    .waitFor();
  assert.equal(
    await pop()
      .getByRole("button", { name: "Repost", exact: true })
      .isDisabled(),
    true
  );
  await page.keyboard.press("Escape");
  await signIn(f.memberB);
  await go(`/platform/posts/${source.id}#post-edit`);
  const edit = page.locator("#post-edit");
  await edit.getByLabel(/Allow people to repost this public post/).check();
  await edit
    .getByRole("button", { name: "Save post changes", exact: true })
    .click();
  await check(
    async () =>
      (await db.platformPost.findUnique({ where: { id: source.id } }))
        .allowReposts
  );
  await signIn(f.memberA);
  await go(`/platform/posts/${source.id}`);
  await page
    .getByRole("button", { name: "Repost choices", exact: true })
    .click();
  await pop().getByRole("button", { name: "Repost", exact: true }).waitFor();
  await check(
    async () =>
      !(await pop()
        .getByRole("button", { name: "Repost", exact: true })
        .isDisabled())
  );
  for (const appearance of ["light", "dark"]) {
    await page.evaluate(
      (theme) =>
        document
          .querySelectorAll(".platform-design")
          .forEach((el) => (el.dataset.appearance = theme)),
      appearance
    );
    const select = pop().getByRole("combobox", {
      name: "Repost destination",
      exact: true
    });
    await select.waitFor();
    const colors = await select.evaluate((el) => ({
      text: getComputedStyle(el).color,
      background: getComputedStyle(el).backgroundColor
    }));
    assert.notEqual(colors.text, colors.background);
    await pop().screenshot({ path: output + `/choices-${appearance}.png` });
  }
  await page.evaluate(() =>
    document
      .querySelectorAll(".platform-design")
      .forEach((el) => (el.dataset.appearance = "light"))
  );
  let lost;
  const bodies = [];
  page.on("request", (r) => {
    if (r.method() === "POST" && r.url().endsWith("/api/platform/reposts"))
      bodies.push(r.postData());
  });
  await page.route("**/api/platform/reposts", async (route) => {
    if (route.request().method() === "POST" && !lost) {
      lost = route.request().postData();
      await route.fetch();
      await route.abort("failed");
    } else await route.continue();
  });
  await pop().getByRole("button", { name: "Repost", exact: true }).click();
  await pop()
    .getByRole("button", { name: "Retry same action", exact: true })
    .click();
  await pop()
    .getByRole("button", { name: "Retry same action", exact: true })
    .waitFor({ state: "hidden" });
  assert.equal(bodies.at(-1), lost);
  let plain = await db.platformPost.findFirstOrThrow({
    where: {
      authorId: f.memberA.id,
      repostKind: "PLAIN",
      repostSourceId: source.id,
      status: "PUBLISHED"
    }
  });
  assert.equal(
    await db.platformPost.count({
      where: {
        authorId: f.memberA.id,
        repostKind: "PLAIN",
        repostSourceId: source.id,
        status: "PUBLISHED"
      }
    }),
    1
  );
  await page.unroute("**/api/platform/reposts");
  await pop()
    .getByRole("button", { name: "Refresh choices", exact: true })
    .click();
  await pop()
    .getByRole("button", { name: "Undo repost", exact: true })
    .waitFor();
  await page.keyboard.press("Escape");
  await pop().waitFor({ state: "hidden" });
  ok(
    "Author opt-in is explicit; lost-response plain repost retries the exact bytes and leaves one entry with Undo available"
  );

  await go(`/platform/profile/${f.memberA.username}`);
  await page
    .getByRole("region", { name: `Reposted by ${f.memberA.name}`, exact: true })
    .waitFor();
  const entry = page.getByRole("region", {
    name: `Reposted by ${f.memberA.name}`,
    exact: true
  });
  await entry
    .getByText("Original browser repost marker", { exact: true })
    .waitFor();
  assert.ok(
    await entry.getByRole("link", { name: new RegExp(f.memberB.name) }).count()
  );
  assert.equal(
    await entry.locator('input[name="postId"]').inputValue(),
    source.id
  );
  await bounded();
  await page.screenshot({ path: output + "/plain-mobile.png", fullPage: true });
  ok(
    "Reposter profile shows the reposter banner, separate original author and original interaction target without a copied post body"
  );
  await entry
    .getByRole("button", { name: "Comment, 0 comments", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "Post discussion", exact: true })
    .getByRole("button", { name: "Write a comment", exact: true })
    .click();
  const commentForm = page.getByRole("form", {
    name: "Write a comment",
    exact: true
  });
  await commentForm
    .getByLabel("Comment text", { exact: true })
    .fill("Unsent reply survives source refresh");
  await page.evaluate(() => {
    window.dispatchEvent(new Event("blur"));
    window.dispatchEvent(new Event("focus"));
  });
  await commentForm.getByLabel("Comment text", { exact: true }).waitFor();
  assert.equal(
    await commentForm.getByLabel("Comment text", { exact: true }).inputValue(),
    "Unsent reply survives source refresh"
  );
  await commentForm
    .getByRole("button", { name: "Close composer", exact: true })
    .click();
  await commentForm
    .getByRole("button", { name: "Save and close", exact: true })
    .click();
  await commentForm.waitFor({ state: "hidden" });
  await page
    .getByRole("button", { name: "Close discussion", exact: true })
    .click();
  ok(
    "Refreshing a plain repost source preserves the mounted unsent comment and its existing Save and close flow"
  );

  await go(`/platform/posts/${source.id}`);
  await page
    .getByRole("button", { name: "Repost choices", exact: true })
    .click();
  await check(
    async () =>
      !(await pop()
        .getByRole("button", { name: "Add your thoughts", exact: true })
        .isDisabled())
  );
  await pop()
    .getByRole("button", { name: "Add your thoughts", exact: true })
    .click();
  await content().waitFor();
  await postForm().getByLabel("Original post preview").waitFor();
  let quoteDraft = await db.privatePostDraft.findFirstOrThrow({
    where: { ownerId: f.memberA.id, deletedAt: null }
  });
  assert.equal(quoteDraft.payload.quoteSourceId, source.id);
  assert.equal(quoteDraft.payload.replyAudience, "VIEWERS");
  await content().fill("My thoughts above the source");
  const textBox = await content().boundingBox(),
    previewBox = await postForm()
      .getByLabel("Original post preview")
      .boundingBox();
  assert.ok(textBox.y < previewBox.y);
  await postForm()
    .getByRole("button", { name: "Save draft", exact: true })
    .click();
  await postForm().getByText("Saved privately.", { exact: true }).waitFor();
  await postForm()
    .getByRole("button", { name: "Close composer", exact: true })
    .click();
  await postForm().waitFor({ state: "hidden" });
  await go(`/platform/drafts?resume=${quoteDraft.id}`);
  await content().waitFor();
  await check(
    async () =>
      (await content().inputValue()) === "My thoughts above the source"
  );
  await postForm().getByLabel("Original post preview").waitFor();
  await postForm().getByRole("button", { name: "Post", exact: true }).click();
  await check(
    async () =>
      !!(await db.platformPost.findFirst({
        where: {
          authorId: f.memberA.id,
          repostKind: "QUOTE",
          content: "My thoughts above the source"
        }
      }))
  );
  const quote = await db.platformPost.findFirstOrThrow({
    where: {
      authorId: f.memberA.id,
      repostKind: "QUOTE",
      content: "My thoughts above the source"
    }
  });
  assert.equal(quote.repostSourceId, source.id);
  assert.equal(quote.replyAudience, "VIEWERS");
  await go(`/platform/posts/${quote.id}`);
  await page
    .locator(".gc-post-body")
    .getByText("My thoughts above the source", { exact: true })
    .waitFor();
  await page
    .getByLabel("Original post preview")
    .getByText("Original browser repost marker", { exact: true })
    .waitFor();
  await bounded();
  await page.screenshot({ path: output + "/quote-mobile.png", fullPage: true });
  ok(
    "Add your thoughts creates one private reference draft, resumes it in the shared composer and publishes words above the bordered original"
  );

  await db.platformPost.update({
    where: { id: source.id },
    data: {
      content: "Edited current source marker",
      version: { increment: 1 },
      editedAt: new Date()
    }
  });
  await page.evaluate(() => {
    window.dispatchEvent(new Event("blur"));
    window.dispatchEvent(new Event("focus"));
  });
  await page
    .getByLabel("Original post preview")
    .getByText("Edited current source marker", { exact: true })
    .waitFor();
  await db.platformPost.update({
    where: { id: source.id },
    data: { allowReposts: false, version: { increment: 1 } }
  });
  await page.evaluate(() => {
    window.dispatchEvent(new Event("blur"));
    window.dispatchEvent(new Event("focus"));
  });
  await page.getByText("Original post unavailable.", { exact: true }).waitFor();
  assert.equal(
    await page
      .getByText("Edited current source marker", { exact: true })
      .count(),
    0
  );
  assert.equal(
    await page
      .locator(".gc-post-body")
      .getByText("My thoughts above the source", { exact: true })
      .isVisible(),
    true
  );
  await context.clearCookies();
  await go(`/platform/posts/${quote.id}`);
  await page.getByText("Original post unavailable.", { exact: true }).waitFor();
  assert.equal(await page.getByLabel("Original post preview").count(), 0);
  const crawler = await page.request.get(
    `${config.origin}/api/platform/share-preview?kind=post&id=${plain.id}`
  );
  assert.equal((await crawler.json()).available, false);
  ok(
    "Source edits refresh by version; opt-out conceals the embedded source for the active member, guest and crawler while retaining quote commentary"
  );

  await signIn(f.memberA);
  await go(`/platform/posts/${plain.id}`);
  await page.getByRole("button", { name: "Undo repost", exact: true }).click();
  await page
    .getByRole("dialog", { name: "Undo repost", exact: true })
    .getByRole("button", { name: "Undo repost", exact: true })
    .click();
  await check(
    async () =>
      (await db.platformPost.findUnique({ where: { id: plain.id } })).status ===
      "WITHDRAWN"
  );
  assert.equal(
    (await db.platformPost.findUnique({ where: { id: source.id } })).status,
    "PUBLISHED"
  );
  ok(
    "Undo remains available after source permission is revoked and leaves the original intact"
  );

  await db.platformPost.update({
    where: { id: source.id },
    data: { allowReposts: true, version: { increment: 1 } }
  });

  const memberDraft = randomUUID();
  await postWorkspaceCommand(db, f.memberA.token, {
    operation: "save-draft",
    mutationId: randomUUID(),
    id: memberDraft,
    expectedVersion: 0,
    payload: {
      content: "Member reply quote retained",
      quoteSourceId: source.id,
      replyAudience: "CHURCH_MEMBERS",
      authorChurchId: f.churchA.id,
      audienceChurchId: f.churchA.id,
      audience: "PUBLIC"
    }
  });
  await go(`/platform/drafts?resume=${memberDraft}`);
  await content().waitFor();
  await check(
    async () => (await content().inputValue()) === "Member reply quote retained"
  );
  await postForm().getByLabel("Original post preview").waitFor();
  await db.churchCapabilityGrant.update({
    where: {
      userId_churchId_capability: {
        userId: f.memberA.id,
        churchId: f.churchA.id,
        capability: "PUBLISH_CHURCH_POSTS"
      }
    },
    data: { revokedAt: new Date() }
  });
  await postForm().getByRole("button", { name: "Post", exact: true }).click();
  await postForm()
    .getByText(/approved church publisher/)
    .waitFor();
  const retained = await db.privatePostDraft.findUniqueOrThrow({
    where: { ownerId_id: { ownerId: f.memberA.id, id: memberDraft } }
  });
  assert.equal(retained.payload.replyAudience, "CHURCH_MEMBERS");
  assert.equal(retained.deletedAt, null);
  assert.equal(
    await db.platformPost.count({
      where: { authorId: f.memberA.id, content: "Member reply quote retained" }
    }),
    0
  );
  ok(
    "A saved church quote keeps CHURCH_MEMBERS and remains unconsumed when current publisher access is revoked before Post"
  );

  await go(`/platform/posts/${quote.id}`);
  await page.getByLabel("Original post preview").waitFor();
  for (const width of [320, 390, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await bounded();
    await page
      .getByRole("button", { name: "Repost choices", exact: true })
      .click();
    await pop().waitFor();
    const b = await pop().boundingBox();
    assert.ok(b.x >= 0 && b.x + b.width <= width + 1);
    await page.keyboard.press("Escape");
    await pop().waitFor({ state: "hidden" });
  }
  await page.screenshot({
    path: output + "/quote-desktop.png",
    fullPage: true
  });
  ok(
    "Compact controls and bordered quote fit 320/390/1280 layouts; Escape closes the action popover without opening or publishing a composer"
  );
  assert.deepEqual(errors, []);
  writeFileSync(
    output + "/result.json",
    JSON.stringify(
      {
        passed: results.length,
        results,
        browserErrors: errors,
        environment: "isolated",
        productionWrites: 0
      },
      null,
      2
    )
  );
  console.log(
    JSON.stringify({
      passed: results.length,
      browserErrors: errors.length,
      productionWrites: 0
    })
  );
} catch (e) {
  await page.screenshot({ path: output + "/failure.png", fullPage: true });
  writeFileSync(
    output + "/failure.txt",
    String(e) + "\n" + (await page.locator("body").innerText())
  );
  throw e;
} finally {
  await browser.close();
  await db.$disconnect();
}
