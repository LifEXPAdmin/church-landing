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
const output = fixtureDir + "/compact-actions-browser";
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
await context.addInitScript(() => {
  window.__copied = [];
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: async (value) => window.__copied.push(value) }
  });
});
try {
  const f = await seedPortal(db);
  const post = await db.platformPost.create({
    data: {
      authorId: f.memberB.id,
      content: "Fictional compact action source " + f.memberB.id,
      publishedAt: new Date()
    }
  });
  const own = await db.platformPost.create({
    data: {
      authorId: f.memberA.id,
      content: "Fictional own management source " + f.memberA.id,
      publishedAt: new Date()
    }
  });
  const comment = await db.platformPostComment.create({
    data: {
      postId: post.id,
      authorId: f.memberA.id,
      content: "Fictional compact comment " + f.memberA.id
    }
  });
  const counts = async () => ({
    posts: await db.platformPost.count({
      where: { authorId: { in: [f.memberA.id, f.memberB.id] } }
    }),
    comments: await db.platformPostComment.count({
      where: { authorId: { in: [f.memberA.id, f.memberB.id] } }
    })
  });
  const original = await counts();
  await go("/platform/posts/" + post.id);
  const guest = page.getByRole("link", {
    name: "Sign in to bookmark this post",
    exact: true
  });
  await guest.waitFor();
  assert.equal(
    new URL(await guest.getAttribute("href"), config.origin).searchParams.get(
      "next"
    ),
    "/platform/posts/" + post.id
  );
  assert.equal(
    await page.getByRole("button", { name: "Repost", exact: true }).count(),
    0
  );
  await signIn(f.memberA);
  await go("/platform/posts/" + post.id);
  await page.getByRole("button", { name: "Like post", exact: true }).click();
  await page
    .getByRole("button", { name: "Unlike post", exact: true })
    .waitFor();
  assert.equal(
    await db.platformPostLike.count({
      where: { postId: post.id, userId: f.memberA.id }
    }),
    1
  );
  const more = page.getByRole("button", {
    name: `More options for ${f.memberB.name}'s post`,
    exact: true
  });
  await more.click();
  const menu = page.getByRole("dialog", {
    name: `More options for ${f.memberB.name}'s post`,
    exact: true
  });
  await menu.getByRole("button", { name: "Follow", exact: true }).waitFor();
  await menu.focus();
  await page.keyboard.press("Tab");
  assert.equal(
    await page.evaluate(() => document.activeElement.textContent.trim()),
    "Follow"
  );
  await page.keyboard.press("Escape");
  await menu.waitFor({ state: "detached" });
  assert.equal(
    await more.evaluate((el) => el === document.activeElement),
    true
  );
  await more.click();
  await menu.getByRole("button", { name: "Follow", exact: true }).click();
  await menu.waitFor({ state: "detached" });
  await more.click();
  await menu.getByRole("button", { name: "Unfollow", exact: true }).waitFor();
  assert.equal(
    await db.platformFollow.count({
      where: { followerId: f.memberA.id, followingId: f.memberB.id }
    }),
    1
  );
  page.once("dialog", (d) => d.dismiss());
  await menu.getByRole("button", { name: "Block", exact: true }).click();
  assert.equal(
    await db.socialRelationship.count({
      where: {
        ownerId: f.memberA.id,
        targetUserId: f.memberB.id,
        blocked: true
      }
    }),
    0
  );
  await page.keyboard.press("Escape");
  ok(
    "Guest bookmark return, real Like/Follow state, capability-aware More, keyboard focus and canceled block retain the existing contracts"
  );
  for (const appearance of ["light", "dark"]) {
    await context.addCookies([
      {
        name: "godschurches_reading",
        value: encodeURIComponent(
          JSON.stringify({
            appearance,
            mode: "pages",
            size: "comfortable",
            reduceMotion: false,
            reduceData: false
          })
        ),
        domain: "127.0.0.1",
        path: "/platform",
        secure: true
      }
    ]);
    for (const width of [320, 390, 1280]) {
      await page.setViewportSize({ width, height: 844 });
      await go("/platform/posts/" + post.id);
      await more.click();
      await menu
        .getByRole("button", { name: "Unfollow", exact: true })
        .waitFor();
      await bounded();
      assert.equal(
        await menu.evaluate((el) => getComputedStyle(el).backgroundColor),
        await page
          .locator(".gc-post")
          .first()
          .evaluate((el) => getComputedStyle(el).backgroundColor)
      );
      const rect = await menu.boundingBox();
      assert.ok(
        rect.x >= 0 &&
          rect.x + rect.width <= width + 1 &&
          rect.y >= 0 &&
          rect.y + rect.height <= 845
      );
      await page.screenshot({
        path: output + `/menu-${appearance}-${width}.png`
      });
      await page.keyboard.press("Escape");
      await page
        .getByRole("button", { name: "Share post", exact: true })
        .click();
      const share = page.getByRole("dialog", {
        name: "Share post",
        exact: true
      });
      await share
        .getByRole("button", { name: "Copy link", exact: true })
        .waitFor();
      if (width === 320) {
        await page.evaluate(
          () => (document.documentElement.style.fontSize = "32px")
        );
        await page.evaluate(
          () =>
            new Promise((resolve) =>
              requestAnimationFrame(() => requestAnimationFrame(resolve))
            )
        );
        await bounded();
        const box = await share.boundingBox();
        assert.ok(
          box.x >= 0 &&
            box.x + box.width <= 321 &&
            box.y >= 0 &&
            box.y + box.height <= 845
        );
        await page.screenshot({
          path: output + `/share-${appearance}-large.png`
        });
      }
      await share
        .getByRole("button", { name: "Copy link", exact: true })
        .click();
      await share.waitFor({ state: "detached" });
      assert.equal(
        await page
          .getByRole("button", { name: "Share post", exact: true })
          .evaluate((el) => el === document.activeElement),
        true
      );
      await page.evaluate(() => (document.documentElement.style.fontSize = ""));
    }
  }
  assert.deepEqual(await counts(), original);
  ok(
    "Phone/desktop, both themes and doubled text menus fit the viewport; external copy closes with restored focus and creates no post/comment"
  );
  await go("/platform/posts/" + own.id);
  await page
    .getByRole("button", { name: "More post options", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "More post options", exact: true })
    .getByRole("link", { name: "Edit", exact: true })
    .click();
  await page.locator("#post-edit textarea").waitFor();
  assert.equal(
    await page.locator("#post-edit").evaluate((el) => el.open),
    true
  );
  await page
    .getByRole("button", { name: "More post options", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "More post options", exact: true })
    .getByRole("link", { name: "Delete", exact: true })
    .click();
  await page
    .getByRole("form", { name: "Confirm removal", exact: true })
    .waitFor();
  assert.equal(
    await page.locator("#post-remove input[type=checkbox]").isChecked(),
    false
  );
  assert.equal(
    (await db.platformPost.findUniqueOrThrow({ where: { id: own.id } })).status,
    "PUBLISHED"
  );
  ok(
    "Own Edit/Delete open only the existing authorized editor and explicit removal confirmation; opening either performs no mutation"
  );
  await go("/platform?post=" + post.id);
  const card = page.locator(`[data-post="${post.id}"]`);
  await card.getByRole("button", { name: /^Comment, / }).click();
  const discussion = page.getByRole("dialog", {
    name: "Post discussion",
    exact: true
  });
  await discussion.locator(`[data-comment-id="${comment.id}"]`).waitFor();
  await discussion
    .locator(`[data-comment-id="${comment.id}"]`)
    .getByRole("button", { name: /More comment options/ })
    .click();
  const cm = page.getByRole("dialog", {
    name: `More comment options for ${f.memberA.name}`,
    exact: true
  });
  await cm.getByRole("button", { name: "Edit", exact: true }).waitFor();
  assert.equal(await cm.evaluate((el) => !!el.closest("dialog")), true);
  await cm.getByRole("button", { name: "Edit", exact: true }).click();
  await discussion
    .getByRole("form", { name: "Edit comment", exact: true })
    .waitFor();
  await discussion
    .getByRole("button", { name: "Discard edit", exact: true })
    .click();
  await discussion
    .getByRole("button", { name: "Close discussion", exact: true })
    .click();
  await discussion.waitFor({ state: "detached" });
  assert.deepEqual(await counts(), original);
  assert.deepEqual(errors, []);
  ok(
    "Comment More works inside the native discussion dialog and opens the retained editor without losing its enclosing discussion"
  );
  writeFileSync(
    output + "/receipt.json",
    JSON.stringify({ results, pageErrors: errors }, null, 2)
  );
} catch (error) {
  await page.screenshot({ path: output + "/failure.png" }).catch(() => {});
  writeFileSync(
    output + "/failure.txt",
    await page
      .locator("body")
      .innerText()
      .catch(() => "")
  );
  throw error;
} finally {
  await context.close();
  await browser.close();
  await db.$disconnect();
}
