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
const { createPortalActor, assertPortalTestDatabase } =
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
  hasTouch: true,
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
const output = fixtureDir + "/topic-browser";
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
const { topicCommand } = await import("../lib/platform/topic-communities.ts");
const cmd = (operation, fields = {}) => ({
  operation,
  mutationId: randomUUID(),
  ...fields
});
const clickForm = async (name) =>
  page
    .getByRole("form", { name, exact: true })
    .getByRole("button", { name, exact: true })
    .click();
const waitDb = async (work) => {
  const deadline = Date.now() + 15000;
  while (!(await work())) {
    if (Date.now() > deadline)
      throw Error("Expected isolated database state did not arrive");
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
};
const memberVersion = async (actor, id) =>
  (
    await db.topicMembership.findUniqueOrThrow({
      where: { communityId_userId: { communityId: id, userId: actor.id } }
    })
  ).version;
try {
  const owner = await createPortalActor(db, "topicbrowserowner"),
    member = await createPortalActor(db, "topicbrowsermember"),
    outsider = await createPortalActor(db, "topicbrowserother"),
    tag = randomUUID().slice(0, 8);
  const slug = `browser-${tag}`,
    name = `Fictional browser topic ${tag}`;
  await signIn(owner);
  await go("/platform/topics/new");
  await page.getByLabel("Community name", { exact: true }).fill(name);
  await page.getByLabel("Topic address", { exact: true }).fill(slug);
  await page
    .getByLabel("What is this community about?", { exact: true })
    .fill("Fictional browser discussion community.");
  await page
    .getByLabel("Community rules", { exact: true })
    .fill("Discuss kindly and protect personal information.");
  await page
    .getByLabel(
      "I understand the topic, its posts and its rules will be public. I accept responsibility for managing this community.",
      { exact: true }
    )
    .check();
  await clickForm("Create public topic");
  await page.getByRole("heading", { name, exact: true }).waitFor();
  const topic = await db.topicCommunity.findUniqueOrThrow({ where: { slug } });
  assert.equal(topic.ownerId, owner.id);
  await bounded();
  ok(
    "Verified member creates a persistent public topic through the touch-sized form"
  );
  const second = await topicCommand(
    db,
    owner.token,
    cmd("create", {
      name: `Fictional browser second ${tag}`,
      slug: `second-${tag}`,
      description: "Second isolated community",
      rules: "Respect privacy and one another.",
      acceptedRules: true
    })
  );
  await context.clearCookies();
  const before = await db.topicMembership.count({
    where: { communityId: { in: [topic.id, second.id] } }
  });
  await go(`/platform/topics?q=${tag}`);
  await page.getByRole("link", { name, exact: true }).waitFor();
  await page
    .getByRole("link", { name: `Fictional browser second ${tag}`, exact: true })
    .waitFor();
  await page.getByRole("link", { name, exact: true }).click();
  await page.getByRole("heading", { name, exact: true }).waitFor();
  await page
    .getByRole("link", {
      name: "Create an account to participate",
      exact: true
    })
    .waitFor();
  const signup = await page
    .getByRole("link", {
      name: "Create an account to participate",
      exact: true
    })
    .getAttribute("href");
  assert.equal(
    new URL(signup, config.origin).searchParams.get("next"),
    `/platform/topics/${slug}`
  );
  assert.equal(
    await db.topicMembership.count({
      where: { communityId: { in: [topic.id, second.id] } }
    }),
    before
  );
  await page.screenshot({
    path: output + "/guest-topic-390.png",
    fullPage: true
  });
  ok(
    "Guests discover two communities, read their rules and receive a safe signup return without a membership write"
  );
  await signIn(member);
  await go(`/platform/topics/${slug}`);
  await page
    .getByLabel("I have read and accept the community rules shown above.", {
      exact: true
    })
    .check();
  await page
    .getByRole("form", { name: "Join this topic", exact: true })
    .getByRole("button", { name: "Join this topic", exact: true })
    .focus();
  await page.keyboard.press("Enter");
  await page
    .getByText("You have joined and accepted the current rules.", {
      exact: true
    })
    .waitFor();
  await clickForm("Follow topic");
  await page
    .getByRole("button", { name: "Unfollow topic", exact: true })
    .waitFor();
  await page.reload();
  await page
    .getByRole("button", { name: "Unfollow topic", exact: true })
    .waitFor();
  assert.equal(
    await db.pushSubscription.count({ where: { ownerId: member.id } }),
    0
  );
  ok(
    "Keyboard joining explicitly accepts rules; independent following persists after reload without phone opt-in"
  );
  await page
    .getByRole("button", { name: "Start a topic discussion", exact: true })
    .click();
  const composer = page.getByRole("dialog", {
    name: "Create a post",
    exact: true
  });
  await composer
    .getByLabel("Post content", { exact: true })
    .fill(`Fictional browser discussion ${tag}`);
  assert.equal(
    await composer.getByLabel("Topic community", { exact: true }).inputValue(),
    topic.id
  );
  await composer
    .getByLabel(
      "I understand this topic post is public, including for guests. I am posting as myself.",
      { exact: true }
    )
    .check();
  await composer.getByRole("button", { name: "Post", exact: true }).click();
  await waitDb(() =>
    db.platformPost.count({
      where: {
        authorId: member.id,
        topicCommunityId: topic.id,
        content: `Fictional browser discussion ${tag}`
      }
    })
  );
  const post = await db.platformPost.findFirstOrThrow({
    where: { authorId: member.id, topicCommunityId: topic.id }
  });
  await go(`/platform/topics/${slug}`);
  await page
    .getByText(`Fictional browser discussion ${tag}`, { exact: true })
    .waitFor();
  await go("/platform/topics/following");
  await page
    .getByText(`Fictional browser discussion ${tag}`, { exact: true })
    .waitFor();
  ok(
    "The canonical composer preserves the topic destination and public confirmation; the saved post appears in the followed stream"
  );
  await signIn(owner);
  await go(`/platform/topics/${slug}/manage`);
  const row = page
    .getByRole("article")
    .filter({
      has: page.getByRole("link", { name: member.name, exact: true })
    });
  await row.getByText("Role and ownership offers", { exact: true }).click();
  await row
    .getByLabel("Role to offer", { exact: true })
    .selectOption("MODERATOR");
  await row
    .getByLabel("I intend to offer this responsibility to this member.", {
      exact: true
    })
    .check();
  await row
    .getByRole("button", { name: "Offer topic role", exact: true })
    .click();
  await waitDb(
    async () =>
      (
        await db.topicMembership.findUniqueOrThrow({
          where: {
            communityId_userId: { communityId: topic.id, userId: member.id }
          }
        })
      ).pendingRole === "MODERATOR"
  );
  assert.equal(
    (
      await db.topicMembership.findUniqueOrThrow({
        where: {
          communityId_userId: { communityId: topic.id, userId: member.id }
        }
      })
    ).moderator,
    false
  );
  await signIn(member);
  await go(`/platform/topics/${slug}`);
  await page
    .getByLabel("I agree to take on these responsibilities.", { exact: true })
    .check();
  await clickForm("Accept moderator role");
  await page
    .getByRole("link", { name: "Manage this topic", exact: true })
    .waitFor();
  await page
    .getByRole("link", { name: "Manage this topic", exact: true })
    .click();
  await page
    .getByRole("heading", { name: `Manage ${name}`, exact: true })
    .waitFor();
  assert.equal(
    await page
      .getByText("Edit topic details and rules", { exact: true })
      .count(),
    0
  );
  await topicCommand(
    db,
    owner.token,
    cmd("revoke-role", {
      communityId: topic.id,
      targetId: member.id,
      expectedVersion: await memberVersion(member, topic.id)
    })
  );
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page
    .getByRole("heading", { name: `Manage ${name}`, exact: true })
    .waitFor({ state: "hidden" });
  ok(
    "Owner offers grant no power until explicit acceptance; moderator tools disappear after current-role revocation"
  );
  await signIn(owner);
  await go(`/platform/topics/${slug}/manage`);
  await page.getByText("Edit topic details and rules", { exact: true }).click();
  await page
    .getByLabel("Community rules", { exact: true })
    .fill("Changed rules require fresh consent. Protect privacy.");
  await clickForm("Save topic details");
  await waitDb(
    async () =>
      (await db.topicCommunity.findUniqueOrThrow({ where: { id: topic.id } }))
        .rulesVersion === 2
  );
  await signIn(member);
  await go(`/platform/topics/${slug}`);
  await page
    .getByRole("button", { name: "Accept current topic rules", exact: true })
    .waitFor();
  assert.equal(
    await page
      .getByRole("button", { name: "Start a topic discussion", exact: true })
      .count(),
    0
  );
  ok(
    "Changed community rules disable new publication until fresh member acceptance"
  );
  await signIn(owner);
  await go(`/platform/topics/${slug}/manage`);
  const restrictRow = page
    .getByRole("article")
    .filter({
      has: page.getByRole("link", { name: member.name, exact: true })
    });
  await restrictRow
    .getByText("Restrict participation", { exact: true })
    .click();
  await restrictRow
    .getByLabel("Reason", { exact: true })
    .selectOption("PRIVACY");
  await restrictRow
    .getByLabel("I confirm this participation change.", { exact: true })
    .check();
  await restrictRow
    .getByRole("button", { name: "Restrict this member", exact: true })
    .click();
  await waitDb(
    async () =>
      !!(
        await db.topicMembership.findUniqueOrThrow({
          where: {
            communityId_userId: { communityId: topic.id, userId: member.id }
          }
        })
      ).restrictedAt
  );
  await context.clearCookies();
  await go(`/platform/topics/${slug}`);
  assert.equal(
    (await page.locator("body").innerText()).includes(post.content),
    false
  );
  await page.getByRole("heading", { name, exact: true }).waitFor();
  await db.topicCommunity.update({
    where: { id: topic.id },
    data: { moderationState: "HIDDEN", version: { increment: 1 } }
  });
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page
    .getByRole("heading", { name, exact: true })
    .waitFor({ state: "hidden" });
  ok(
    "Restrictions remove source posts from guest reads; retained public topic details hide after moderation changes"
  );
  await db.topicCommunity.update({
    where: { id: topic.id },
    data: { moderationState: "VISIBLE", version: { increment: 1 } }
  });
  await signIn(owner);
  await go(`/platform/topics/${slug}/manage`);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page
    .getByRole("heading", { name: `Manage ${name}`, exact: true })
    .waitFor();
  await bounded();
  await page.screenshot({
    path: output + "/owner-management-1280.png",
    fullPage: true
  });
  await signIn(outsider);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page
    .getByRole("heading", { name: `Manage ${name}`, exact: true })
    .waitFor({ state: "hidden" });
  ok(
    "Desktop management fits the viewport; account switching conceals the prior owner's controls"
  );
  assert.deepEqual(errors, []);
  writeFileSync(
    output + "/result.json",
    JSON.stringify(
      {
        passed: results,
        pageErrors: errors,
        fixtureOnly: true,
        realMessages: 0,
        realPhoneSends: 0,
        physicalDevice: false
      },
      null,
      2
    )
  );
} catch (error) {
  writeFileSync(
    output + "/failure.txt",
    String(error) + "\n" + (await page.locator("body").innerText())
  );
  await page.screenshot({ path: output + "/failure.png", fullPage: true });
  throw error;
} finally {
  await browser.close();
  await db.$disconnect();
}
