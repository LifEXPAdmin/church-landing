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
const output = fixtureDir + "/profile-pin-browser";
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

const { randomUUID } = await import("node:crypto");
const { loginAccount } = await import("../lib/platform/accounts.ts");
const { saveProfilePin } = await import("../lib/platform/profile-pin.ts");
page.setDefaultTimeout(20000);
const signIn = (actor) =>
  context.addCookies([
    {
      name: "church_platform_session",
      value: actor.token,
      url: config.origin,
      secure: true,
      httpOnly: true,
      sameSite: "Lax"
    }
  ]);
const profile = async (actor) => {
  await go("/platform/profile/" + actor.username);
  await page.locator("#posts").waitFor({ state: "visible" });
};
const menu = () =>
  page.getByRole("dialog", { name: "More post options", exact: true });
const openPostMenu = async (post) => {
  await go("/platform/posts/" + post.id);
  await page
    .getByRole("button", { name: "More post options", exact: true })
    .first()
    .click();
  await menu()
    .getByRole("button", {
      name: /^(Pin to profile|Unpin from profile)$/,
      exact: true
    })
    .waitFor();
  await page.waitForFunction(() =>
    Array.from(document.querySelectorAll('[role="dialog"] button')).some(
      (b) =>
        /^(Pin to profile|Unpin from profile)$/.test(b.textContent.trim()) &&
        !b.disabled
    )
  );
};
const pinId = async (owner) =>
  (await db.socialPreferences.findUnique({ where: { ownerId: owner.id } }))
    ?.profilePinPostId ?? null;
const waitPin = async (owner, id) => {
  for (let i = 0; i < 100; i++) {
    if ((await pinId(owner)) === id) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  assert.equal(await pinId(owner), id);
};
let phase = "setup";
try {
  const f = await seedPortal(db),
    owner = f.memberA,
    visitor = f.memberB;
  const posts = await Promise.all(
    Array.from({ length: 35 }, (_, i) =>
      db.platformPost.create({
        data: {
          authorId: owner.id,
          content: `Fictional profile pin candidate ${i} ${randomUUID()}`,
          publishedAt: new Date(Date.now() - (i + 1) * 10000)
        }
      })
    )
  );
  const old = posts.at(-1),
    next = posts[0];
  await db.profilePresentation.create({
    data: {
      userId: owner.id,
      introduction: "Fictional introduction stays in place"
    }
  });
  await db.platformPostLike.create({
    data: { postId: old.id, userId: visitor.id }
  });
  await db.platformPostComment.create({
    data: {
      postId: old.id,
      authorId: visitor.id,
      content: "Fictional canonical reply"
    }
  });
  const requests = [];
  let pinStatusReads = 0;
  page.on("request", (r) => {
    if (
      r.method() === "GET" &&
      new URL(r.url()).pathname === "/api/platform/profile-pin"
    )
      pinStatusReads++;
    if (
      r.method() === "POST" &&
      new URL(r.url()).pathname === "/api/platform/profile-pin"
    )
      requests.push(r.postData());
  });
  await signIn(owner);
  phase = "owner-pin";
  await profile(owner);
  assert.equal(await page.locator("#posts article.gc-post").count(), 30);
  assert.equal(pinStatusReads, 0, "Rendering 30 cards does not request pin status");
  await openPostMenu(old);
  assert.equal(pinStatusReads, 1, "Only the opened owner menu requests pin status");
  await menu()
    .getByRole("button", { name: "Pin to profile", exact: true })
    .click();
  await waitPin(owner, old.id);
  await menu()
    .getByRole("button", { name: "Unpin from profile", exact: true })
    .waitFor();
  await profile(owner);
  assert.equal(
    await page.locator('#posts [data-profile-pin="true"]').count(),
    1
  );
  await page
    .locator('#posts [data-profile-pin="true"]')
    .getByText(old.content, { exact: true })
    .waitFor();
  await page
    .getByText("Fictional introduction stays in place", { exact: true })
    .waitFor();
  assert.equal(await page.locator("#posts article.gc-post").count(), 31);
  await page.getByRole("link", { name: "Older posts", exact: true }).click();
  await page.waitForURL((u) => !!u.searchParams.get("before"));
  await page.locator("#posts").waitFor({ state: "visible" });
  assert.equal(
    await page.locator('#posts [data-profile-pin="true"]').count(),
    0
  );
  assert.equal(await page.locator("#posts article.gc-post").count(), 4);
  assert.equal(await page.getByText(old.content, { exact: true }).count(), 0);
  ok(
    "An old canonical post pins once above 30 posts; Older posts has four remaining cards without gaps or a duplicate pin"
  );

  phase = "member-and-sizes";
  await signIn(visitor);
  for (const width of [320, 390, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await profile(owner);
    await bounded();
    await page
      .locator('#posts [data-profile-pin="true"]')
      .getByText(old.content, { exact: true })
      .waitFor();
    await page.locator('#posts [data-profile-pin="true"]').scrollIntoViewIfNeeded();
    await page.screenshot({
      path: `${output}/profile-pin-${width}.png`,
      fullPage: false
    });
  }
  assert.equal(
    await db.platformPostLike.count({
      where: { postId: old.id, active: true }
    }),
    1
  );
  assert.equal(
    await db.platformPostComment.count({ where: { postId: old.id } }),
    1
  );
  await page
    .locator('#posts [data-profile-pin="true"]')
    .getByRole("button", {
      name: `More options for ${owner.name}'s post`,
      exact: true
    })
    .click();
  assert.equal(
    await page
      .getByRole("dialog", {
        name: `More options for ${owner.name}'s post`,
        exact: true
      })
      .getByRole("button", { name: /Pin to profile|Unpin from profile/ })
      .count(),
    0
  );
  ok(
    "Member visitors see the same canonical card and counts at phone and desktop widths, with no owner pin control"
  );
  await page.keyboard.press("Escape");

  phase = "canonical-pin-interactions";
  const pinnedCard = page.locator('#posts [data-profile-pin="true"]');
  await pinnedCard
    .getByRole("button", { name: "Unlike post", exact: true })
    .click();
  await pinnedCard
    .getByRole("button", { name: "Like post", exact: true })
    .click();
  await pinnedCard
    .getByRole("button", { name: "Unlike post", exact: true })
    .waitFor();
  await pinnedCard
    .getByRole("button", { name: "Comment, 1 comments", exact: true })
    .click();
  const discussion = page.getByRole("dialog", {
    name: "Post discussion",
    exact: true
  });
  await discussion
    .getByRole("button", { name: "Write a comment", exact: true })
    .click();
  const replyText = "Fictional reply through the pinned card " + randomUUID();
  const composer = page.getByRole("form", {
    name: "Write a comment",
    exact: true
  });
  await composer.getByLabel("Comment text", { exact: true }).fill(replyText);
  await composer.getByRole("button", { name: "Reply", exact: true }).click();
  await composer.waitFor({ state: "hidden" });
  await discussion.getByText(replyText, { exact: true }).waitFor();
  await discussion
    .getByRole("button", { name: "Close discussion", exact: true })
    .click();
  assert.equal(
    await db.platformPostComment.count({
      where: { postId: old.id, authorId: visitor.id, content: replyText }
    }),
    1
  );
  assert.equal(
    await db.platformPostLike.count({
      where: { postId: old.id, userId: visitor.id, active: true }
    }),
    1
  );
  await profile(owner);
  await pinnedCard
    .getByRole("button", { name: "Comment, 2 comments", exact: true })
    .waitFor();
  ok(
    "A visitor can undo and restore a Like and publish one reply through the pinned card, updating only the original post's canonical engagement"
  );

  phase = "lost-ack-profile-recovery";
  await signIn(owner);
  await page.setViewportSize({ width: 390, height: 844 });
  await profile(owner);
  const target = page.locator("#posts > div").filter({ hasText: next.content });
  await target
    .getByRole("button", { name: "More post options", exact: true })
    .click();
  await menu()
    .getByText("Replaces your current pinned post.", { exact: true })
    .waitFor();
  const beforeRetry = requests.length;
  let dropped = false;
  await page.route("**/api/platform/profile-pin", async (route) => {
    if (route.request().method() === "POST" && !dropped) {
      dropped = true;
      const response = await route.fetch();
      assert.equal(response.status(), 200);
      await route.abort("failed");
    } else await route.continue();
  });
  await menu()
    .getByRole("button", { name: "Pin to profile", exact: true })
    .click();
  await menu()
    .getByRole("button", {
      name: "Retry the same profile pin choice",
      exact: true
    })
    .waitFor();
  await waitPin(owner, next.id);
  await page.keyboard.press("Escape");
  const pendingUrl = page.url();
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  assert.equal(page.url(), pendingUrl);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page
    .getByRole("button", { name: "Confirm original request", exact: true })
    .waitFor();
  await page
    .getByRole("button", { name: "Confirm original request", exact: true })
    .click();
  await page
    .locator('#posts [data-profile-pin="true"]')
    .getByText(next.content, { exact: true })
    .waitFor();
  await page.unroute("**/api/platform/profile-pin");
  assert.equal(requests.length, beforeRetry + 2);
  assert.equal(requests.at(-1), requests.at(-2));
  const prefAfterRetry = await db.socialPreferences.findUniqueOrThrow({
    where: { ownerId: owner.id }
  });
  assert.equal(prefAfterRetry.profilePinVersion, 2);
  ok(
    "A committed replacement with a lost response preserves identical retry bytes through closed menus and concealed profile recovery"
  );

  phase = "reload-and-unpin";
  await page.reload();
  await page.locator("#posts").waitFor({ state: "visible" });
  await page
    .locator('#posts [data-profile-pin="true"]')
    .getByText(next.content, { exact: true })
    .waitFor();
  const newToken = await loginAccount(
    db,
    owner.email,
    owner.password,
    "fictional-profile-pin-new-session"
  );
  await signIn({ ...owner, token: newToken });
  await profile(owner);
  await page
    .locator('#posts [data-profile-pin="true"]')
    .getByRole("button", { name: "More post options", exact: true })
    .click();
  await menu()
    .getByRole("button", { name: "Unpin from profile", exact: true })
    .click();
  await waitPin(owner, null);
  await page.waitForFunction(
    () => !document.querySelector('#posts [data-profile-pin="true"]')
  );
  await page.locator("#posts").waitFor({ state: "visible" });
  assert.equal(await page.locator("#posts article.gc-post").count(), 30);
  ok(
    "Saved pin survives reload and a new signed-in session; unpin restores the ordinary chronological listing"
  );

  phase = "account-switch";
  await openPostMenu(old);
  const beforeSwitch = requests.length;
  await signIn(visitor);
  await menu()
    .getByRole("button", { name: "Pin to profile", exact: true })
    .click();
  await menu()
    .getByText(/Your sign-in changed/)
    .waitFor();
  assert.equal(requests.length, beforeSwitch);
  assert.equal(await pinId(owner), null);
  assert.equal(await pinId(visitor), null);
  ok(
    "Switching accounts after the menu loads rejects the stale owner action before a mutation request"
  );

  phase = "saved-comment-draft";
  await signIn({ ...owner, token: newToken });
  await go("/platform/posts/" + old.id);
  await page
    .getByRole("button", { name: "Write a comment", exact: true })
    .click();
  const draft = page.getByRole("textbox", {
    name: "Comment text",
    exact: true
  });
  const marker = "Fictional saved pin safety draft " + randomUUID();
  await draft.fill(marker);
  await page
    .getByRole("button", { name: "Close composer", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Save and close", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "Write a comment", exact: true })
    .waitFor({ state: "hidden" });
  await openPostMenu(old);
  await menu()
    .getByRole("button", { name: "Pin to profile", exact: true })
    .click();
  await waitPin(owner, old.id);
  await menu()
    .getByRole("button", { name: "Unpin from profile", exact: true })
    .waitFor();
  await page.keyboard.press("Escape");
  await page
    .getByRole("button", { name: "Write a comment", exact: true })
    .click();
  await page.waitForFunction(
    (text) =>
      document.querySelector('textarea[aria-label="Comment text"]')?.value ===
      text,
    marker
  );
  assert.equal(await draft.inputValue(), marker);
  assert.equal(
    await db.platformPostComment.count({ where: { postId: old.id } }),
    2
  );
  await page
    .getByRole("button", { name: "Close composer", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "Write a comment", exact: true })
    .waitFor({ state: "hidden" });
  ok(
    "Explicitly saved private comment text survives pinning and reopening, without publishing another comment"
  );

  phase = "current-audience";
  const secret = await db.platformPost.create({
    data: {
      authorId: owner.id,
      content: "Fictional church pin secret " + randomUUID(),
      audience: "CHURCH",
      audienceChurchId: f.churchA.id
    }
  });
  const version = (
    await db.socialPreferences.findUniqueOrThrow({
      where: { ownerId: owner.id }
    })
  ).profilePinVersion;
  await saveProfilePin(db, newToken, {
    postId: secret.id,
    desired: true,
    expectedVersion: version,
    mutationId: randomUUID()
  });
  await profile(owner);
  await page
    .locator('#posts [data-profile-pin="true"]')
    .getByText(secret.content, { exact: true })
    .waitFor();
  await signIn(visitor);
  await profile(owner);
  assert.equal(await page.locator('[data-profile-pin="true"]').count(), 0);
  assert.ok(!(await page.content()).includes(secret.content));
  await context.clearCookies();
  await go("/platform/profile/" + owner.username);
  assert.ok(!(await page.content()).includes(secret.content));
  await signIn({ ...owner, token: newToken });
  await profile(owner);
  await db.platformPost.update({
    where: { id: secret.id },
    data: { moderationState: "HIDDEN" }
  });
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page.getByText(/This member profile or its access changed/).waitFor();
  assert.equal(
    await page.getByText(secret.content, { exact: true }).isVisible(),
    false
  );
  await page.reload();
  await page.locator("#posts").waitFor({ state: "visible" });
  assert.equal(await page.locator('[data-profile-pin="true"]').count(), 0);
  ok(
    "Church-only pins stay out of outsider and guest HTML, and retained profiles conceal a newly moderated pin before reloading safely"
  );

  phase = "preview-content-note";
  const noted = await db.platformPost.create({
    data: {
      authorId: owner.id,
      content: "Fictional full noted body " + randomUUID(),
      contentNote: "Fictional sensitive topic",
      safeExcerpt: "Fictional safe pinned excerpt"
    }
  });
  await saveProfilePin(db, newToken, {
    postId: noted.id,
    desired: true,
    expectedVersion: version + 1,
    mutationId: randomUUID()
  });
  await go("/platform/profile/" + owner.username + "?preview=member");
  await page.locator("#posts").waitFor({ state: "visible" });
  await page
    .getByText("Fictional safe pinned excerpt", { exact: true })
    .waitFor();
  assert.equal(await page.getByText(noted.content, { exact: true }).count(), 0);
  ok(
    "Pinned post member previews retain the content note and safe excerpt without opening the full body"
  );
  phase = "confirmed-write-status-outage";
  await profile(owner);
  await page
    .locator('#posts [data-profile-pin="true"]')
    .getByRole("button", { name: "More post options", exact: true })
    .click();
  await menu()
    .getByRole("button", { name: "Unpin from profile", exact: true })
    .waitFor();
  await page.waitForFunction(() =>
    Array.from(document.querySelectorAll('[role="dialog"] button')).some(
      (b) => b.textContent.trim() === "Unpin from profile" && !b.disabled
    )
  );
  let statusFailures = 0;
  const statusRoute = "**/api/platform/profile-pin?postId=*";
  await page.route(statusRoute, (route) => {
    statusFailures++;
    return route.abort("failed");
  });
  await menu()
    .getByRole("button", { name: "Unpin from profile", exact: true })
    .click();
  await waitPin(owner, null);
  await page.waitForFunction(
    () => !document.querySelector('#posts [data-profile-pin="true"]'),
    undefined,
    { timeout: 10000 }
  );
  await page.locator("#posts").waitFor({ state: "visible" });
  assert.equal(statusFailures, 1);
  await page.unroute(statusRoute);
  await page.keyboard.press("Escape");
  ok(
    "A confirmed unpin refreshes the profile even when its subsequent status read fails, without replaying the saved change"
  );
  assert.deepEqual(errors, []);
  writeFileSync(
    output + "/RESULT.json",
    JSON.stringify(
      {
        completedAt: new Date().toISOString(),
        source: execFileSync("git", ["rev-parse", "HEAD"], {
          encoding: "utf8"
        }).trim(),
        results,
        errors,
        productionWrites: 0,
        outboundSends: 0
      },
      null,
      2
    )
  );
} catch (error) {
  console.error("FAILED PHASE", phase);
  await page
    .screenshot({ path: output + "/failure.png", fullPage: true })
    .catch(() => {});
  throw error;
} finally {
  await context.close();
  await browser.close();
  await db.$disconnect();
}
