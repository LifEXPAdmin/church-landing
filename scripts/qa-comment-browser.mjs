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
const output = fixtureDir + "/comment-browser";
mkdirSync(output, { recursive: true });
const go = async (path) => {
  await page.goto(config.origin + path);
  await page
    .getByRole("region", { name: "Full discussion", exact: true })
    .waitFor();
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
  const p = await db.platformPost.create({
    data: { authorId: f.contact.id, content: "Thread browser fixture" }
  });
  const roots = Array.from({ length: 60 }, () => randomUUID()).sort(),
    at = new Date("2026-01-01T12:00:00Z");
  await db.platformPostComment.createMany({
    data: roots.map((id, index) => ({
      id,
      postId: p.id,
      authorId: f.memberA.id,
      content: `Root fixture ${index}`,
      createdAt: at
    }))
  });
  let parentId = roots[0];
  const replyIds = [];
  for (let i = 0; i < 45; i++) {
    const r = await db.platformPostComment.create({
      data: {
        postId: p.id,
        authorId: f.memberB.id,
        content: `Reply fixture ${i}`,
        parentId,
        rootId: roots[0],
        createdAt: new Date(at.getTime() + i + 1)
      }
    });
    replyIds.push(r.id);
    parentId = r.id;
  }
  const thread = () =>
    page.getByRole("region", { name: "Full discussion", exact: true });
  const rootRows = () => thread().locator(":scope > article[data-comment-id]");
  const ready = () =>
    thread()
      .getByRole("button", { name: "More comments", exact: true })
      .waitFor();
  await go(`/platform/posts/${p.id}`);
  await ready();
  assert.equal(
    await thread().getByLabel("Comment order").inputValue(),
    "oldest"
  );
  for (let i = 0; i < 2; i++) {
    await thread()
      .getByRole("button", { name: "More comments", exact: true })
      .click();
    await page.waitForFunction(
      (n) =>
        document.querySelectorAll("[data-comment-thread] > article").length ===
        n,
      40 + i * 20
    );
  }
  assert.deepEqual(
    await rootRows().evaluateAll((rows) =>
      rows.map((r) => r.dataset.commentId)
    ),
    roots
  );
  assert.ok((await thread().innerText()).includes("Discussion · 105"));
  await thread().getByLabel("Comment order").selectOption("newest");
  await ready();
  for (let i = 0; i < 2; i++) {
    await thread()
      .getByRole("button", { name: "More comments", exact: true })
      .click();
    await page.waitForFunction(
      (n) =>
        document.querySelectorAll("[data-comment-thread] > article").length ===
        n,
      40 + i * 20
    );
  }
  assert.deepEqual(
    await rootRows().evaluateAll((rows) =>
      rows.map((r) => r.dataset.commentId)
    ),
    [...roots].reverse()
  );
  ok(
    "Sixty roots reachable without duplicates in Oldest and Newest, with viewer-visible count"
  );
  const root = page.locator(`[data-comment-id="${roots[0]}"]`);
  await root
    .getByRole("button", { name: "Read replies (45)", exact: true })
    .click();
  await page.locator(`[data-comment-id="${replyIds[19]}"]`).waitFor();
  for (const idx of [39, 44]) {
    await root
      .getByRole("button", { name: "More replies", exact: true })
      .click();
    await page.locator(`[data-comment-id="${replyIds[idx]}"]`).waitFor();
  }
  assert.deepEqual(
    await root
      .locator("article[data-comment-id]")
      .evaluateAll((rows) => rows.map((r) => r.dataset.commentId)),
    replyIds
  );
  assert.equal(await root.locator("article article").count(), 0);
  assert.ok((await root.innerText()).includes("Replying to"));
  await bounded();
  ok(
    "Forty-five replies stay in conversation order at one visible indentation"
  );
  await go(`/platform/posts/${p.id}?comment=${replyIds[44]}`);
  await page
    .getByRole("region", { name: "Linked comment", exact: true })
    .waitFor();
  assert.equal(
    await page.locator(`[data-comment-id="${replyIds[44]}"]`).count(),
    1
  );
  await commentCommand(db, f.memberA.token, {
    operation: "delete",
    postId: p.id,
    commentId: roots[0],
    expectedVersion: 1,
    mutationId: randomUUID()
  });
  await go(`/platform/posts/${p.id}?comment=${roots[0]}`);
  await thread()
    .getByText(
      "The linked comment is unavailable. You can read the permitted discussion below.",
      { exact: true }
    )
    .waitFor();
  const tombstone = page.locator(`[data-comment-id="${roots[0]}"]`);
  assert.ok((await tombstone.innerText()).includes("Comment unavailable"));
  assert.ok(!(await tombstone.innerText()).includes(f.memberA.name));
  await tombstone
    .getByRole("button", { name: "Read replies (45)", exact: true })
    .click();
  await page.locator(`[data-comment-id="${replyIds[0]}"]`).waitFor();
  ok(
    "Exact deep-linked late reply loads without scanning; deleted root is neutral and surviving replies remain reachable"
  );
  await db.platformPost.update({
    where: { id: p.id },
    data: { audience: "CHURCH", audienceChurchId: f.churchA.id }
  });
  await page.evaluate(() => {
    window.dispatchEvent(new Event("blur"));
    window.dispatchEvent(new Event("focus"));
  });
  await thread()
    .getByRole("button", { name: "Reload discussion", exact: true })
    .waitFor();
  assert.equal(await thread().locator("[data-comment-id]").count(), 0);
  assert.deepEqual(errors, []);
  ok("Revoked guest access clears the discussion on foreground recheck");
  await db.platformPost.update({
    where: { id: p.id },
    data: { audience: "PUBLIC", audienceChurchId: null }
  });
  await signIn(f.memberA);
  await go(`/platform/posts/${p.id}`);
  const composer = () =>
    page.getByRole("form", { name: "Write a comment", exact: true });
  const text = () => composer().getByLabel("Comment text", { exact: true });
  await text().waitFor();
  await page.waitForFunction(
    () =>
      !document.querySelector('form[aria-label="Write a comment"] textarea')
        ?.disabled
  );
  const draftBodies = [];
  let loseSave = true;
  await page.route("**/api/platform/comments", async (route) => {
    const body = route.request().postData();
    if (body && JSON.parse(body).operation === "draft-save") {
      draftBodies.push(body);
      const response = await route.fetch();
      if (loseSave) {
        loseSave = false;
        await route.abort("failed");
      } else await route.fulfill({ response });
    } else await route.continue();
  });
  await text().fill("Saved before sending with exact retry");
  await composer()
    .getByRole("button", { name: "Save comment draft", exact: true })
    .click();
  await composer()
    .getByRole("button", { name: "Retry same request", exact: true })
    .click();
  await composer().getByText("Saved privately.", { exact: true }).waitFor();
  assert.equal(draftBodies[0], draftBodies[1]);
  await page.unroute("**/api/platform/comments");
  await composer()
    .getByRole("button", { name: "Send comment", exact: true })
    .click();
  await page.waitForFunction(
    () =>
      !!document.querySelector('form[aria-label="Write a comment"] textarea') &&
      !document.querySelector('form[aria-label="Write a comment"] textarea')
        .disabled &&
      document.querySelector('form[aria-label="Write a comment"] textarea')
        .value === ""
  );
  const created = await db.platformPostComment.findFirstOrThrow({
    where: { postId: p.id, content: "Saved before sending with exact retry" }
  });
  assert.equal(
    await db.platformPostComment.count({
      where: { postId: p.id, content: created.content }
    }),
    1
  );
  await thread().getByLabel("Comment order").selectOption("newest");
  await page.locator(`[data-comment-id="${created.id}"]`).waitFor();
  const createdRow = () => page.locator(`[data-comment-id="${created.id}"]`);
  await createdRow()
    .getByRole("button", { name: "Like (0)", exact: true })
    .click();
  await createdRow()
    .getByRole("button", { name: "Unlike (1)", exact: true })
    .waitFor();
  await createdRow().getByRole("button", { name: "Edit", exact: true }).click();
  const edit = page.getByRole("form", { name: "Edit comment", exact: true });
  await edit
    .getByLabel("Edited comment text", { exact: true })
    .fill("Edited with canonical version");
  await edit.getByRole("button", { name: "Save edit", exact: true }).click();
  await createdRow()
    .getByText("Edited with canonical version", { exact: true })
    .waitFor();
  assert.ok((await createdRow().innerText()).includes("Edited"));
  ok(
    "Signed-in composer saves privately, retries identical lost-response body, sends once, likes, and edits through canonical versions"
  );
  await createdRow().getByRole("button", { name: "Edit", exact: true }).click();
  await edit
    .getByLabel("Edited comment text", { exact: true })
    .fill("My unsent conflict text");
  await commentCommand(db, f.memberA.token, {
    operation: "edit",
    postId: p.id,
    commentId: created.id,
    expectedVersion: 2,
    content: "Other tab edited",
    mentionIds: [],
    mutationId: randomUUID()
  });
  await edit.getByRole("button", { name: "Save edit", exact: true }).click();
  await edit
    .getByText(
      "Your edit is preserved. Copy it before discarding and reopening the current comment; another version will not be overwritten.",
      { exact: true }
    )
    .waitFor();
  assert.equal(
    await edit.getByLabel("Edited comment text", { exact: true }).inputValue(),
    "My unsent conflict text"
  );
  await edit.getByRole("button", { name: "Discard edit", exact: true }).click();
  await createdRow().getByText("Other tab edited", { exact: true }).waitFor();
  ok(
    "Concurrent edit conflict preserves unsent text and cannot overwrite newer version"
  );
  await text().fill("A mention");
  await composer()
    .getByRole("combobox", { name: "Mention someone (optional)" })
    .fill(f.memberB.username);
  await composer()
    .getByRole("button", { name: "Find mentions", exact: true })
    .click();
  const option = composer()
    .getByRole("option")
    .filter({ hasText: f.memberB.name });
  await option.waitFor();
  await composer()
    .getByRole("combobox", { name: "Mention someone (optional)" })
    .press("Enter");
  await composer()
    .getByRole("button", { name: "Save comment draft", exact: true })
    .click();
  await composer().getByText("Saved privately.", { exact: true }).waitFor();
  const saved = await db.privateCommentDraft.findFirstOrThrow({
    where: {
      ownerId: f.memberA.id,
      postId: p.id,
      replyToId: null,
      deletedAt: null
    }
  });
  assert.deepEqual(saved.mentionIds, [f.memberB.id]);
  await bounded();
  ok(
    "Mention search selects stable eligible account IDs and preserves them in the private draft at mobile width"
  );
  const grant = await db.churchCapabilityGrant.create({
    data: {
      churchId: f.churchA.id,
      userId: f.memberA.id,
      capability: "PUBLISH_CHURCH_POSTS"
    }
  });
  await page.evaluate(() => {
    window.dispatchEvent(new Event("blur"));
    window.dispatchEvent(new Event("focus"));
  });
  await composer()
    .getByRole("option", { name: f.churchA.name, exact: true })
    .waitFor({ state: "attached" });
  await composer().getByLabel("Speaking as").selectOption(f.churchA.id);
  await text().fill("Church speaker permission checkpoint");
  await composer()
    .getByRole("button", { name: "Save comment draft", exact: true })
    .click();
  await composer().getByText("Saved privately.", { exact: true }).waitFor();
  await db.churchCapabilityGrant.delete({ where: { id: grant.id } });
  await composer()
    .getByRole("button", { name: "Send comment", exact: true })
    .click();
  await composer()
    .getByText(
      "Choose a church you currently have permission to speak for in this audience.",
      { exact: true }
    )
    .waitFor();
  assert.equal(
    await db.platformPostComment.count({
      where: { postId: p.id, content: "Church speaker permission checkpoint" }
    }),
    0
  );
  assert.equal(
    (
      await db.privateCommentDraft.findUniqueOrThrow({
        where: { ownerId_id: { ownerId: f.memberA.id, id: saved.id } }
      })
    ).authorChurchId,
    f.churchA.id
  );
  assert.equal(
    await text().inputValue(),
    "Church speaker permission checkpoint"
  );
  await db.churchCapabilityGrant.create({
    data: {
      churchId: f.churchA.id,
      userId: f.memberA.id,
      capability: "PUBLISH_CHURCH_POSTS"
    }
  });
  await composer()
    .getByRole("button", { name: "Send comment", exact: true })
    .click();
  await thread()
    .getByText("Church speaker permission checkpoint", { exact: true })
    .waitFor();
  const churchRow = thread()
    .locator("article[data-comment-id]")
    .filter({ hasText: "Church speaker permission checkpoint" });
  await churchRow.getByText("Church publisher", { exact: true }).waitFor();
  assert.ok((await churchRow.innerText()).includes(f.churchA.name));
  assert.ok(!(await churchRow.innerText()).includes(f.memberA.name));
  await churchRow.getByRole("button", { name: "Reply", exact: true }).click();
  const replyForm = page.getByRole("form", {
    name: "Write a reply",
    exact: true
  });
  await replyForm
    .getByLabel("Comment text", { exact: true })
    .fill("Reply survives deleted root");
  await replyForm
    .getByRole("button", { name: "Send comment", exact: true })
    .click();
  await churchRow
    .getByRole("button", { name: "Read replies (1)", exact: true })
    .waitFor();
  page.once("dialog", (d) => d.accept());
  await churchRow.getByRole("button", { name: "Delete", exact: true }).click();
  const tomb = thread()
    .locator("article[data-comment-id]")
    .filter({ hasText: "Comment unavailable" })
    .filter({
      has: page.getByRole("button", { name: "Read replies (1)", exact: true })
    });
  const tombId = await tomb.getAttribute("data-comment-id");
  await tomb.getByRole("button", { name: "Read replies (1)", exact: true }).click();
  await page.locator(`[data-comment-id="${tombId}"]`).getByText("Reply survives deleted root", { exact: true }).waitFor();
  ok(
    "Church speaker publish rechecks revoked grants without fallback, hides internal publisher, and UI reply survives root deletion"
  );
  assert.deepEqual(errors, []);
  writeFileSync(
    output + "/receipt.json",
    JSON.stringify(
      {
        results,
        pageErrors: errors,
        fixturePostId: p.id,
        fixtureOwner: f.memberA.id
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
