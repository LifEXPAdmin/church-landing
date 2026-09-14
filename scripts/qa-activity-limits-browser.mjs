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
const output = fixtureDir + "/activity-limits-browser";
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
const responses = [];
page.on("response", async (response) => {
  if (
    response.request().method() === "POST" &&
    response.url().startsWith(config.origin + "/api/platform/")
  )
    responses.push({
      path: new URL(response.url()).pathname,
      status: response.status(),
      retryAfter: response.headers()["retry-after"] ?? null
    });
});
const api = async (actor, path, data) => {
  const response = await context.request.post(config.origin + path, {
    headers: { Origin: config.origin, "X-Expected-Account": actor.id },
    data
  });
  assert.equal(response.status(), 200, await response.text());
  return response.json();
};
// Discover only the limiter row created by this isolated actor's real HTTP
// action. Never copy the server's signing secret into the browser fixture.
const fillActivity = async (actor, path, data, seconds, maximum) => {
  const prior = new Set(
    (await db.platformAuthLimit.findMany({ select: { key: true } })).map(
      (row) => row.key
    )
  );
  await api(actor, path, data);
  const rows = (await db.platformAuthLimit.findMany()).filter(
    (row) =>
      !prior.has(row.key) &&
      row.hits === 1 &&
      row.expiresAt.getTime() > Date.now() + (seconds - 30) * 1000 &&
      row.expiresAt.getTime() <= Date.now() + seconds * 1000
  );
  assert.equal(
    rows.length,
    1,
    "Exactly one new activity bucket with the expected window"
  );
  const row = rows[0];
  await db.platformAuthLimit.update({
    where: { key: row.key },
    data: { hits: maximum, expiresAt: new Date(Date.now() + 90_000) }
  });
  return row.key;
};
const expire = (key) =>
  db.platformAuthLimit.update({
    where: { key },
    data: { expiresAt: new Date(Date.now() - 1000) }
  });

try {
  const f = await seedPortal(db),
    reader = f.contact,
    author = f.memberA;
  const source = await postCommand(db, author.token, {
    operation: "create",
    requestKey: randomUUID(),
    content: "Fictional activity limit discussion " + randomUUID()
  });
  await signIn(reader);
  const postKey = await fillActivity(
    reader,
    "/api/platform/posts",
    {
      operation: "create",
      requestKey: randomUUID(),
      content: "Fictional transport quota seed"
    },
    3600,
    10
  );
  await go("/platform");
  await page
    .getByRole("button", { name: "Share what's on your heart", exact: true })
    .click();
  const composer = page.getByRole("form", {
    name: "Publish post",
    exact: true
  });
  const postText =
    "Fictional draft retained through a posting wait " + randomUUID();
  await composer.getByLabel("Post content", { exact: true }).fill(postText);
  await composer.getByText("Content note and preview", { exact: true }).click();
  await composer
    .getByLabel("Optional content note", { exact: true })
    .fill("Fictional retained note");
  await composer
    .getByLabel("Optional safe excerpt", { exact: true })
    .fill("Fictional retained excerpt");
  await composer
    .getByRole("button", { name: "Save draft", exact: true })
    .click();
  await composer.getByText("Saved privately.", { exact: true }).waitFor();
  const draft = await db.privatePostDraft.findFirstOrThrow({
    where: { ownerId: reader.id, deletedAt: null },
    orderBy: { updatedAt: "desc" }
  });
  await composer.getByRole("button", { name: "Post", exact: true }).click();
  await composer.getByText(/You have reached the posting limit/).waitFor();
  assert.equal(
    await composer.getByLabel("Post content", { exact: true }).inputValue(),
    postText
  );
  assert.equal(
    await composer
      .getByLabel("Optional content note", { exact: true })
      .inputValue(),
    "Fictional retained note"
  );
  assert.equal(
    await composer
      .getByLabel("Optional safe excerpt", { exact: true })
      .inputValue(),
    "Fictional retained excerpt"
  );
  assert.equal(
    (
      await db.privatePostDraft.findUniqueOrThrow({
        where: { ownerId_id: { ownerId: reader.id, id: draft.id } }
      })
    ).deletedAt,
    null
  );
  for (const width of [320, 390, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await bounded();
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await composer.screenshot({ path: output + "/posting-wait-390.png" });
  ok(
    "Actual posting 429 shows a waiting time, preserves saved body/note/excerpt/reply choices, and fits 320/390/1280 pixels"
  );
  await expire(postKey);
  await composer.getByRole("button", { name: "Post", exact: true }).click();
  await composer
    .getByRole("link", { name: "View published post", exact: true })
    .waitFor();
  assert.equal(
    await db.platformPost.count({
      where: { authorId: reader.id, content: postText }
    }),
    1
  );
  assert.ok(
    (
      await db.privatePostDraft.findUniqueOrThrow({
        where: { ownerId_id: { ownerId: reader.id, id: draft.id } }
      })
    ).deletedAt
  );
  ok(
    "After quota expiry the same saved draft publishes once without losing its choices"
  );

  const commentKey = await fillActivity(
    reader,
    "/api/platform/comments",
    {
      operation: "create",
      mutationId: randomUUID(),
      postId: source.id,
      content: "Fictional comment quota seed"
    },
    600,
    30
  );
  await go(`/platform/posts/${source.id}`);
  await page
    .getByRole("button", { name: "Write a comment", exact: true })
    .click();
  const comment = page.getByRole("form", {
    name: "Write a comment",
    exact: true
  });
  let commentText = "Fictional comment retained while waiting " + randomUUID();
  await comment.getByLabel("Comment text", { exact: true }).fill(commentText);
  await comment.getByRole("button", { name: "Reply", exact: true }).click();
  await comment.getByText(/You have reached the comment limit/).waitFor();
  assert.equal(
    await comment.getByLabel("Comment text", { exact: true }).inputValue(),
    commentText
  );
  assert.equal(
    await db.platformPostComment.count({
      where: { authorId: reader.id, content: commentText }
    }),
    0
  );
  await bounded();
  await comment.screenshot({ path: output + "/comment-wait-390.png" });
  // Send deliberately saves first; the unchanged draft is already acknowledged.
  const savedComment = await db.privateCommentDraft.findFirstOrThrow({
    where: {
      ownerId: reader.id,
      postId: source.id,
      content: commentText,
      deletedAt: null
    }
  });
  assert.equal(savedComment.content, commentText);
  commentText += " Edited during the waiting period.";
  await comment.getByLabel("Comment text", { exact: true }).fill(commentText);
  await comment
    .getByRole("button", { name: "Save draft", exact: true })
    .click();
  await comment.getByText("Saved privately.", { exact: true }).waitFor();
  assert.equal(
    (
      await db.privateCommentDraft.findUniqueOrThrow({
        where: { ownerId_id: { ownerId: reader.id, id: savedComment.id } }
      })
    ).content,
    commentText
  );
  ok(
    "Actual comment 429 preserves unsent text and still allows private saving"
  );
  await expire(commentKey);
  await comment.getByRole("button", { name: "Reply", exact: true }).click();
  await comment.waitFor({ state: "hidden" });
  await page.getByText(commentText, { exact: true }).waitFor();
  assert.equal(
    await db.platformPostComment.count({
      where: { authorId: reader.id, content: commentText }
    }),
    1
  );
  ok("The preserved comment can be sent once after its waiting period");

  const followKey = await fillActivity(
    reader,
    "/api/platform/relationships",
    {
      operation: "follow",
      mutationId: randomUUID(),
      kind: "person",
      targetId: f.memberB.id,
      expectedVersion: 0,
      desired: true
    },
    3600,
    30
  );
  await go(`/platform/posts/${source.id}`);
  await page
    .getByRole("button", {
      name: `More options for ${author.name}'s post`,
      exact: true
    })
    .click();
  await page.getByRole("button", { name: "Follow", exact: true }).click();
  await page.getByText(/You have reached the follow limit/).waitFor();
  assert.equal(
    await db.platformFollow.count({
      where: { followerId: reader.id, followingId: author.id }
    }),
    0
  );
  assert.equal(
    await db.platformFollow.count({
      where: { followerId: reader.id, followingId: f.memberB.id }
    }),
    1
  );
  await bounded();
  await page
    .getByRole("group", {
      name: `Relationship choices for ${author.name}`,
      exact: true
    })
    .screenshot({ path: output + "/follow-wait-390.png" });
  await expire(followKey);
  const followed = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/platform/relationships" &&
      response.request().method() === "POST"
  );
  await page.getByRole("button", { name: "Follow", exact: true }).click();
  assert.equal((await followed).status(), 200);
  await page
    .getByRole("group", {
      name: `Relationship choices for ${author.name}`,
      exact: true
    })
    .waitFor({ state: "hidden" });
  assert.equal(
    await db.platformFollow.count({
      where: { followerId: reader.id, followingId: author.id }
    }),
    1
  );
  ok(
    "Actual follow 429 preserves existing relationships and succeeds after expiry"
  );

  const limitedResponses = responses.filter((row) => row.status === 429);
  assert.equal(limitedResponses.length, 3);
  assert.ok(limitedResponses.every((row) => Number(row.retryAfter) > 0));
  assert.deepEqual(errors, []);
  writeFileSync(
    output + "/results.json",
    JSON.stringify(
      { results, responses, errors, productionWrites: 0, externalSends: 0 },
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
