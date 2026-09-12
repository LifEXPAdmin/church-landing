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
const output = fixtureDir + "/comment-recovery-browser";
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

const { randomUUID } = await import("node:crypto");
const { commentCommand } = await import("../lib/platform/comment-commands.ts");
try {
  const f = await seedPortal(db);
  await signIn(f.memberA);
  const post = await db.platformPost.create({
    data: { authorId: f.contact.id, content: "Private recovery target" }
  });
  const id = randomUUID(),
    exact = "  exact whitespace\n\ncomment recovery  ";
  await commentCommand(db, f.memberA.token, {
    operation: "draft-save",
    mutationId: randomUUID(),
    draftId: id,
    postId: post.id,
    expectedVersion: 0,
    content: exact,
    mentionIds: [],
    authorChurchId: null
  });
  await go("/platform/comment-drafts");
  const row = () => page.locator(`[data-comment-draft-id="${id}"]`),
    form = () =>
      page.getByRole("form", { name: "Write a comment", exact: true });
  await row().waitFor();
  assert.equal(
    await row().getByLabel("Saved draft text", { exact: true }).inputValue(),
    exact
  );
  await row()
    .getByRole("button", { name: "Resume comment draft", exact: true })
    .click();
  await form().getByLabel("Comment text", { exact: true }).waitFor();
  await page.waitForFunction(
    () =>
      !document.querySelector('form[aria-label="Write a comment"] textarea')
        .disabled
  );
  assert.equal(
    await form().getByLabel("Comment text", { exact: true }).inputValue(),
    exact
  );
  await form()
    .getByLabel("Comment text", { exact: true })
    .fill("My unsent recovery change");
  await commentCommand(db, f.memberA.token, {
    operation: "draft-save",
    mutationId: randomUUID(),
    draftId: id,
    postId: post.id,
    expectedVersion: 1,
    content: "Other tab saved",
    mentionIds: [],
    authorChurchId: null
  });
  await form().getByRole("button", { name: "Save draft", exact: true }).click();
  await form()
    .getByRole("button", { name: "Review saved copy", exact: true })
    .click();
  await form()
    .getByRole("button", {
      name: "Replace my text with saved copy",
      exact: true
    })
    .waitFor();
  assert.equal(
    await form().getByLabel("Comment text", { exact: true }).inputValue(),
    "My unsent recovery change"
  );
  await form()
    .getByRole("button", {
      name: "Replace my text with saved copy",
      exact: true
    })
    .click();
  assert.equal(
    await form().getByLabel("Comment text", { exact: true }).inputValue(),
    "Other tab saved"
  );
  await form().getByRole("button", { name: "Reply", exact: true }).click();
  await row().waitFor({ state: "detached" });
  assert.equal(
    await db.platformPostComment.count({
      where: { postId: post.id, content: "Other tab saved" }
    }),
    1
  );
  assert.ok(
    (
      await db.privateCommentDraft.findUniqueOrThrow({
        where: { ownerId_id: { ownerId: f.memberA.id, id } }
      })
    ).deletedAt
  );
  ok(
    "Exact whitespace resumes; stale saves retain unsent text; explicit saved-copy review publishes and consumes once"
  );
  const orphan = randomUUID();
  await commentCommand(db, f.memberA.token, {
    operation: "draft-save",
    mutationId: randomUUID(),
    draftId: orphan,
    postId: post.id,
    expectedVersion: 0,
    content: "My own withdrawn-target text",
    mentionIds: [],
    authorChurchId: null
  });
  await db.platformPost.update({
    where: { id: post.id },
    data: { status: "WITHDRAWN", withdrawnAt: new Date() }
  });
  await page
    .getByRole("button", { name: "Refresh comment drafts", exact: true })
    .click();
  const orphanRow = () => page.locator(`[data-comment-draft-id="${orphan}"]`);
  await orphanRow().waitFor();
  await orphanRow()
    .getByRole("button", { name: "Resume comment draft", exact: true })
    .click();
  await page
    .getByRole("region", { name: "Unavailable comment target", exact: true })
    .waitFor();
  assert.equal(
    await page
      .getByLabel("Your unsent comment text", { exact: true })
      .inputValue(),
    "My own withdrawn-target text"
  );
  assert.ok(
    !(await page.locator("main").innerText()).includes(
      "Private recovery target"
    )
  );
  const bodies = [];
  let lose = true;
  await page.route("**/api/platform/comments", async (route) => {
    const body = route.request().postData();
    if (body && JSON.parse(body).operation === "draft-delete") {
      bodies.push(body);
      const response = await route.fetch();
      if (lose) {
        lose = false;
        await route.abort("failed");
      } else await route.fulfill({ response });
    } else await route.continue();
  });
  page.once("dialog", (d) => d.accept());
  await orphanRow()
    .getByRole("button", { name: "Discard comment draft", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Retry same discard", exact: true })
    .click();
  await orphanRow().waitFor({ state: "detached" });
  assert.equal(bodies[0], bodies[1]);
  await page.unroute("**/api/platform/comments");
  ok(
    "Withdrawal preserves only owner text; discard retries exact body and never restores its tombstone"
  );
  const another = await db.platformPost.create({
    data: { authorId: f.memberA.id, content: "Other account guard target" }
  });
  const guarded = randomUUID();
  await commentCommand(db, f.memberA.token, {
    operation: "draft-save",
    mutationId: randomUUID(),
    draftId: guarded,
    postId: another.id,
    expectedVersion: 0,
    content: "Account A secret draft",
    mentionIds: [],
    authorChurchId: null
  });
  await page
    .getByRole("button", { name: "Refresh comment drafts", exact: true })
    .click();
  await page.locator(`[data-comment-draft-id="${guarded}"]`).waitFor();
  await signIn(f.memberB);
  await page.evaluate(() => {
    window.dispatchEvent(new Event("blur"));
    window.dispatchEvent(new Event("focus"));
  });
  await page
    .getByText("Your sign-in changed. Reload before continuing.", {
      exact: true
    })
    .waitFor();
  assert.equal(await page.locator("[data-comment-draft-id]").count(), 0);
  assert.ok(
    !(await page.locator("main").innerText()).includes("Account A secret draft")
  );
  await bounded();
  assert.deepEqual(errors, []);
  ok(
    "Account switching conceals all previous-owner drafts before any new-account read"
  );
  writeFileSync(
    output + "/receipt.json",
    JSON.stringify({ results, pageErrors: errors }, null, 2)
  );
} finally {
  await context.close();
  await browser.close();
  await db.$disconnect();
}
