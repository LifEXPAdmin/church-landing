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
let phase = "initial";
const errors = [];
page.on("pageerror", (e) => {
  const issue = {
    phase,
    path: new URL(page.url()).pathname,
    message: e.message,
    stack: e.stack
  };
  errors.push(issue);
  console.log("BROWSER_ERROR", JSON.stringify(issue));
});
const results = [];
const ok = (s) => {
  results.push(s);
  console.log("PASS " + s);
};
const output = fixtureDir + "/four-feeds-browser";
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

const { createPortalActor } = await import("../tests/seed-portal.ts");
const { randomUUID } = await import("node:crypto");
const { loginAccount } = await import("../lib/platform/accounts.ts");
const selector = () =>
  page.getByRole("combobox", { name: "Choose feed", exact: true });
const getIds = () =>
  page
    .locator(".gc-feed [data-post]")
    .evaluateAll((nodes) => nodes.map((node) => node.dataset.post));
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
const choose = async (mode) => {
  phase = "choose-" + mode;
  // The server can paint a select before its event handler is hydrated.
  // The reader's canonical cursor is installed by its mounted client effect.
  await page.waitForFunction(
    () => !!new URL(location.href).searchParams.get("feedCursor")
  );
  await selector().selectOption(mode);
  await page.waitForURL((url) => url.searchParams.get("feed") === mode);
  await selector().waitFor();
  assert.equal(await selector().inputValue(), mode);
  await page.waitForFunction(
    () => !!new URL(location.href).searchParams.get("feedCursor")
  );
};
const resume = () =>
  page.evaluate(() => {
    window.dispatchEvent(new Event("blur"));
    window.dispatchEvent(new Event("focus"));
  });
let priorActiveLikes = [];
const bodies = [];
page.on("request", (request) => {
  if (
    request.method() === "POST" &&
    new URL(request.url()).pathname === "/api/platform/feed"
  )
    bodies.push(request.postData());
});
page.setDefaultTimeout(25000);
try {
  // Fictional fixture isolation: preserve and restore pre-existing Like states.
  priorActiveLikes = await db.platformPostLike.findMany({
    where: { active: true },
    select: { id: true }
  });
  await db.platformPostLike.updateMany({
    where: { id: { in: priorActiveLikes.map((row) => row.id) } },
    data: { active: false }
  });
  const a = await createPortalActor(db, "feedbrowser"),
    b = await createPortalActor(db, "feedfriend"),
    c = await createPortalActor(db, "feedvoter");
  await db.friendAcceptance.create({
    data: {
      inviterId: a.id,
      recipientId: b.id,
      invitationVersion: 1,
      state: "CONNECTED"
    }
  });
  await db.platformFollow.createMany({
    data: [
      { followerId: a.id, followingId: b.id },
      { followerId: b.id, followingId: a.id }
    ]
  });
  const at = new Date(Date.now() - 1000),
    rows = [];
  for (let i = 0; i < 35; i++)
    rows.push(
      await db.platformPost.create({
        data: {
          authorId: b.id,
          publishedAt: at,
          content: "Fictional browser feed " + randomUUID()
        }
      })
    );
  const order = rows
    .map((p) => p.id)
    .sort()
    .reverse();
  const mine = await db.platformPost.create({
    data: { authorId: a.id, content: "Fictional feed own post " + randomUUID() }
  });
  for (const p of rows)
    await db.platformPostLike.create({
      data: {
        postId: p.id,
        userId: a.id,
        firstLikedAt: new Date(Date.now() - 3600000)
      }
    });
  await go("/platform?mode=list");
  assert.equal(await selector().inputValue(), "latest");
  assert.deepEqual(await selector().locator("option").allTextContents(), [
    "Latest",
    "Friends",
    "Top This Week",
    "Trending"
  ]);
  await choose("friends");
  await page
    .getByRole("heading", {
      name: "No posts from your friends yet",
      exact: true
    })
    .waitFor();
  assert.deepEqual(await getIds(), []);
  await page
    .getByRole("link", { name: "Sign in", exact: true })
    .last()
    .waitFor();
  await go("/platform");
  assert.equal(await selector().inputValue(), "friends");
  ok(
    "Guest Friends has no stranger filler and the guest choice survives reload"
  );

  await signIn(a);
  await page.reload();
  await selector().waitFor();
  assert.equal(await selector().inputValue(), "latest");
  assert.ok((await getIds()).includes(mine.id));
  await choose("friends");
  assert.deepEqual(await getIds(), order.slice(0, 30));
  await go("/platform");
  assert.equal(await selector().inputValue(), "friends");
  const token = await loginAccount(
    db,
    a.email,
    a.password,
    "fictional-new-feed-session"
  );
  const freshContext = await browser.newContext({
    viewport: { width: 390, height: 844 }
  });
  await freshContext.addCookies([
    {
      name: "church_platform_session",
      value: token,
      url: config.origin,
      secure: true,
      httpOnly: true,
      sameSite: "Lax"
    }
  ]);
  const freshPage = await freshContext.newPage();
  await freshPage.goto(config.origin + "/platform");
  assert.equal(
    await freshPage.getByRole("combobox", { name: "Choose feed" }).inputValue(),
    "friends"
  );
  await freshContext.close();
  ok(
    "Signed-in accounts ignore the guest choice, include own Latest posts and restore their saved Friends choice in a new session"
  );

  await page.getByRole("button", { name: "List", exact: true }).click();
  const before = await getIds();
  await page.getByRole("button", { name: "Open My feed", exact: true }).click();
  await page.waitForURL((url) => url.pathname === "/platform/feed");
  assert.equal(await selector().inputValue(), "friends");
  assert.deepEqual(await getIds(), before);
  for (const width of [320, 390, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    await bounded();
    await page.screenshot({ path: output + `/focused-${width}.png` });
    await selector().screenshot({ path: output + `/selector-${width}.png` });
  }
  await page
    .getByRole("button", { name: "Close My feed", exact: true })
    .click();
  await page.waitForURL((url) => url.pathname === "/platform");
  assert.equal(
    await page.locator(".gc-feed").getAttribute("data-mode"),
    "list"
  );
  ok(
    "Home and My feed retain one selected mode, mounted order and List preference; the selector fits 320, 390 and 1280 pixels"
  );

  await choose("weekly");
  const rankedFirst = await getIds();
  assert.deepEqual(rankedFirst, order.slice(0, 30));
  const firstUrl = page.url();
  await db.platformPostLike.create({
    data: {
      postId: order[34],
      userId: c.id,
      firstLikedAt: new Date(Date.now() - 1000)
    }
  });
  phase = "weekly-next";
  await page
    .getByRole("link", { name: "Read more posts", exact: true })
    .click();
  await page.waitForFunction(
    (first) =>
      new URL(location.href).searchParams.get("feedCursor") !==
      new URL(first).searchParams.get("feedCursor"),
    firstUrl
  );
  assert.deepEqual(await getIds(), order.slice(30));
  phase = "weekly-back";
  await page.goBack();
  await page.waitForFunction(
    (ids) =>
      JSON.stringify(
        [...document.querySelectorAll(".gc-feed [data-post]")].map(
          (node) => node.dataset.post
        )
      ) === JSON.stringify(ids),
    rankedFirst
  );
  await selector().waitFor();
  assert.deepEqual(await getIds(), rankedFirst);
  phase = "refresh-ranked";
  await page
    .getByRole("button", { name: "Refresh posts", exact: true })
    .click();
  await page.waitForFunction(
    (id) =>
      document
        .querySelector(".gc-feed [data-post]")
        ?.getAttribute("data-post") === id,
    order[34]
  );
  ok(
    "Ranked paging stays disjoint after a new Like, Back restores its page, and deliberate Refresh recalculates the order"
  );

  let dropped;
  await page.route("**/api/platform/feed", async (route) => {
    if (route.request().method() === "POST" && !dropped) {
      dropped = route.request().postData();
      const response = await route.fetch();
      assert.equal(response.status(), 200);
      await route.abort("failed");
    } else await route.continue();
  });
  await selector().selectOption("trending");
  await page
    .getByRole("button", { name: "Retry the same feed choice", exact: true })
    .waitFor();
  assert.equal(await selector().inputValue(), "weekly");
  assert.equal(await selector().isDisabled(), true);
  const version = (
    await db.socialPreferences.findUniqueOrThrow({ where: { ownerId: a.id } })
  ).feedVersion;
  await page
    .getByRole("button", { name: "Retry the same feed choice", exact: true })
    .click();
  await page.waitForURL((url) => url.searchParams.get("feed") === "trending");
  assert.equal(bodies.at(-1), dropped);
  assert.equal(
    (await db.socialPreferences.findUniqueOrThrow({ where: { ownerId: a.id } }))
      .feedVersion,
    version
  );
  await page.unroute("**/api/platform/feed");
  ok(
    "A lost preference acknowledgement retains identical retry bytes and keeps the previous label with its previous posts until confirmation"
  );

  await choose("friends");
  const card = page.locator(`[data-post="${order[0]}"]`);
  await card.scrollIntoViewIfNeeded();
  await db.friendAcceptance.updateMany({
    where: { inviterId: a.id, recipientId: b.id },
    data: { state: "REMOVED" }
  });
  await db.platformFollow.deleteMany({
    where: {
      OR: [
        { followerId: a.id, followingId: b.id },
        { followerId: b.id, followingId: a.id }
      ]
    }
  });
  await resume();
  await card.getByText("Original post unavailable.", { exact: true }).waitFor();
  assert.equal(
    await card
      .getByText(rows.find((p) => p.id === order[0]).content, { exact: true })
      .isVisible(),
    false
  );
  await page
    .getByRole("button", { name: "Refresh posts", exact: true })
    .click();
  await page
    .getByRole("heading", {
      name: "No posts from your friends yet",
      exact: true
    })
    .waitFor();
  await page.getByRole("button", { name: "Open Latest", exact: true }).click();
  await page.waitForURL((url) => url.searchParams.get("feed") === "latest");
  assert.equal(
    (await db.socialPreferences.findUniqueOrThrow({ where: { ownerId: a.id } }))
      .feedMode,
    "latest"
  );
  ok(
    "Removing a friendship hides retained public friend cards; the empty-state Latest action saves the new choice"
  );

  await choose("weekly");
  const oldScope = new URL(page.url()).searchParams.get("feedScope");
  await signIn(c);
  await page.reload();
  await selector().waitFor();
  assert.equal(await selector().inputValue(), "latest");
  await page.waitForFunction(
    (scope) => new URL(location.href).searchParams.get("feedScope") !== scope,
    oldScope
  );
  assert.notEqual(new URL(page.url()).searchParams.get("feedScope"), oldScope);
  assert.equal(
    await db.socialPreferences.count({ where: { ownerId: c.id } }),
    0
  );
  ok(
    "An account switch resets the old account-bound URL to the new account default without copying preferences"
  );

  await signIn(a);
  await go("/platform?feed=weekly&mode=list");
  const firstId = (await getIds())[0];
  const firstCard = page.locator(`[data-post="${firstId}"]`);
  await firstCard.scrollIntoViewIfNeeded();
  await firstCard
    .getByRole("button", { name: /^Comment, \d+ comments$/ })
    .click();
  const discussion = page.getByRole("dialog", {
    name: "Post discussion",
    exact: true
  });
  await discussion
    .getByRole("button", { name: "Write a comment", exact: true })
    .click();
  const draft = discussion
    .getByRole("form", { name: "Write a comment", exact: true })
    .getByLabel("Comment text", { exact: true });
  await draft.fill("Fictional unsent feed recovery entry");
  assert.equal(
    await selector().evaluate((el) => {
      const modal = document.querySelector("dialog:modal");
      return !!modal && !modal.contains(el);
    }),
    true
  );
  assert.equal(
    await selector().evaluate((el) => {
      el.focus();
      return document.activeElement === el;
    }),
    false
  );
  await db.feedSnapshot.updateMany({
    where: { ownerId: a.id },
    data: { expiresAt: new Date(Date.now() - 1) }
  });
  await db.platformPostLike.updateMany({
    where: { postId: firstId, userId: a.id },
    data: { active: false }
  });
  await resume();
  await draft.waitFor();
  assert.equal(
    await draft.inputValue(),
    "Fictional unsent feed recovery entry"
  );
  await page
    .getByText(
      "This ranking set has expired. Your current page is still here. Finish or save your entries, then refresh posts for a new set.",
      { exact: true }
    )
    .waitFor({ state: "attached" });
  await draft.fill("");
  ok(
    "The native discussion protects unsent work from feed changes, and expiry plus live-count refresh preserves the current-page draft"
  );

  await discussion
    .getByRole("button", { name: "Close composer", exact: true })
    .click();
  await discussion
    .getByRole("button", { name: "Close discussion", exact: true })
    .click();
  await db.platformPostLike.updateMany({
    where: { postId: { in: order } },
    data: { active: false }
  });
  await choose("latest");
  await choose("weekly");
  await page
    .getByRole("heading", {
      name: "No liked posts in the last 7 days yet",
      exact: true
    })
    .waitFor();
  await choose("trending");
  await page
    .getByRole("heading", { name: "No trending posts yet", exact: true })
    .waitFor();
  await page
    .getByRole("button", { name: "Open Latest", exact: true })
    .waitFor();
  ok(
    "Both ranked empty states are explicit and provide a working Latest action"
  );
  await bounded();
  assert.deepEqual(errors, []);
  writeFileSync(
    output + "/RESULT.json",
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
  if (priorActiveLikes.length)
    await db.platformPostLike.updateMany({
      where: { id: { in: priorActiveLikes.map((row) => row.id) } },
      data: { active: true }
    });
  await db.$disconnect();
}
