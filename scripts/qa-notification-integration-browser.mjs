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
  hasTouch: true,
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
page.on("console", (message) => {
  if (["error", "warning"].includes(message.type()))
    console.log("BROWSER_CONSOLE", message.type(), message.text());
});
page.on("response", async (response) => {
  if (response.status() >= 400)
    console.log(
      "HTTP_ERROR",
      response.status(),
      new URL(response.url()).pathname
    );
});
const results = [];
const ok = (s) => {
  results.push(s);
  console.log("PASS " + s);
};
const output = fixtureDir + "/notification-integration-browser-" + Date.now();
mkdirSync(output, { recursive: true });
const go = async (path) => {
  const response = await page.goto(config.origin + path);
  console.log("BROWSER_NAV", path, response?.status());
  await page.getByRole("heading", { level: 1 }).waitFor();
};
const bounded = async () =>
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1
    ),
    "No horizontal page overflow"
  );

const { randomUUID } = await import("node:crypto");
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

const { seedPortal } = await import("../tests/seed-portal.ts");
const { portalCommand } = await import("../lib/platform/portal.ts");
const { postCommand, publishScheduledPost } =
  await import("../lib/platform/post-commands.ts");
const { processNotificationFanoutBatch } =
  await import("../lib/platform/notification-fanout.ts");
const form = () =>
  page.getByRole("form", { name: "Publish post", exact: true });
const waitDb = async (query) => {
  const deadline = Date.now() + 20000;
  while (!(await query())) {
    assert.ok(Date.now() < deadline, "Expected isolated state did not arrive");
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
};
page.setDefaultTimeout(25000);
try {
  phase = "guest-schedule-return";
  for (const path of [
    "/platform/scheduled-posts",
    "/platform/scheduled-posts/fictional-plan"
  ]) {
    await go(path);
    for (const name of ["Join Godschurches", "Sign in"]) {
      const href = await page
        .locator("main")
        .getByRole("link", { name, exact: true })
        .getAttribute("href");
      assert.equal(new URL(href, config.origin).searchParams.get("next"), path);
    }
    assert.equal(
      await page
        .getByRole("region", { name: "Publication plan", exact: true })
        .count(),
      0
    );
  }
  ok(
    "Signed-out scheduled-post routes retain exact signup/sign-in destinations without exposing a private plan"
  );
  const f = await seedPortal(db);
  await portalCommand(db, f.operator.token, {
    operation: "grant",
    churchId: f.churchA.id,
    userId: f.memberA.id,
    capability: "PUBLISH_CHURCH_POSTS",
    expectedVersion: 0
  });
  phase = "explicit-person-bell";
  await signIn(f.coordinator);
  await go(`/platform/profile/${f.memberA.username}`);
  const personChoices = () =>
    page.locator(`[aria-label="Relationship choices for ${f.memberA.name}"]`);
  const openPerson = async () => {
    if (!(await personChoices().isVisible()))
      await page
        .locator(".gc-profile-header summary")
        .filter({ hasText: `Connections with ${f.memberA.name}` })
        .click();
    await personChoices()
      .getByRole("button", {
        name: "Refresh relationship choices",
        exact: true
      })
      .waitFor();
  };
  await openPerson();
  const bodies = [];
  let lost = false;
  await page.route("**/api/platform/relationships", async (route) => {
    const body = route.request().postData();
    if (!body || JSON.parse(body).operation !== "author-bell")
      return route.continue();
    bodies.push(body);
    const response = await route.fetch();
    if (!lost) {
      lost = true;
      return route.abort("failed");
    }
    return route.fulfill({ response });
  });
  await personChoices()
    .getByRole("button", { name: "Notify me of new posts", exact: true })
    .click();
  await personChoices()
    .getByRole("button", {
      name: "Retry same relationship change",
      exact: true
    })
    .click();
  await personChoices().waitFor({ state: "detached" });
  assert.equal(bodies.length, 2);
  assert.equal(bodies[0], bodies[1]);
  await page.unroute("**/api/platform/relationships");
  await openPerson();
  await personChoices()
    .getByRole("button", { name: "New post bell on", exact: true })
    .waitFor();
  const relationship = await db.socialRelationship.findFirstOrThrow({
    where: { ownerId: f.coordinator.id, targetUserId: f.memberA.id }
  });
  assert.ok(relationship.authorBellSince);
  assert.equal(
    await db.platformFollow.count({
      where: { followerId: f.coordinator.id, followingId: f.memberA.id }
    }),
    0
  );
  assert.equal(
    await db.pushSubscription.count({ where: { ownerId: f.coordinator.id } }),
    0
  );
  ok(
    "The person bell uses an exact lost-response retry without following, registering a device or enabling phone alerts"
  );

  phase = "author-activity";
  const published = await postCommand(db, f.memberA.token, {
    operation: "create",
    requestKey: randomUUID(),
    content: "Fictional explicit bell destination " + randomUUID()
  });
  const job = await db.notificationFanoutJob.findFirstOrThrow({
    where: { sourceId: published.id }
  });
  await processNotificationFanoutBatch(db, job.id);
  await go("/platform/activity");
  await page
    .getByText(`New posts from ${f.memberA.name}`, { exact: true })
    .waitFor();
  await page
    .locator("li")
    .filter({
      has: page.getByText(`New posts from ${f.memberA.name}`, { exact: true })
    })
    .getByRole("link", { name: "Open item", exact: true })
    .click();
  await page.waitForURL(
    (url) => url.pathname === `/platform/posts/${published.id}`
  );
  await page.goBack();
  await page.getByRole("heading", { level: 1 }).waitFor();
  ok(
    "Actual Activity groups author posts with current attribution and opens the canonical post with browser return intact"
  );

  phase = "church-bell";
  await go(`/platform/churches/${f.churchA.id}`);
  await page
    .getByText(`Connections with ${f.churchA.name}`, { exact: true })
    .click();
  await page
    .getByRole("button", { name: "Notify me of new posts", exact: true })
    .click();
  await waitDb(
    async () =>
      !!(await db.socialRelationship.findFirst({
        where: {
          ownerId: f.coordinator.id,
          churchId: f.churchA.id,
          authorBellSince: { not: null }
        }
      }))
  );
  ok("Church new-post consent is a separate explicit choice");

  phase = "scheduled-composer";
  await signIn(f.memberA);
  await go("/platform?feed=latest");
  await page.locator("#compose-post").click();
  await form().getByLabel("Post content", { exact: true }).waitFor();
  const marker = "Fictional scheduled browser notice " + randomUUID();
  await form().getByLabel("Post content", { exact: true }).fill(marker);
  await form()
    .locator("summary")
    .filter({ hasText: /^Author, audience and replies$/ })
    .click();
  await form()
    .getByLabel("Speaking as", { exact: true })
    .selectOption(f.churchA.id);
  await form()
    .getByRole("checkbox", { name: "Schedule publication", exact: true })
    .check();
  const local = new Date(Date.now() + 7200000).toISOString().slice(0, 16);
  await form()
    .getByLabel("Publication date and time", { exact: true })
    .fill(local);
  await form().getByLabel("Publication time zone", { exact: true }).fill("UTC");
  const save = form().getByRole("button", { name: "Save draft", exact: true });
  if (await save.isEnabled()) await save.click();
  await waitDb(
    async () =>
      !!(await db.privatePostDraft.findFirst({
        where: {
          ownerId: f.memberA.id,
          deletedAt: null,
          payload: { path: ["scheduleLocal"], equals: local }
        }
      }))
  );
  const privateDraft = await db.privatePostDraft.findFirstOrThrow({
    where: { ownerId: f.memberA.id, deletedAt: null }
  });
  assert.equal(privateDraft.payload.scheduleZone, "UTC");
  await page.setViewportSize({ width: 320, height: 568 });
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "20px";
  });
  await bounded();
  await form().screenshot({ path: output + "/scheduled-composer-320.png" });
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "";
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await form()
    .getByRole("button", { name: "Schedule post", exact: true })
    .click();
  await form()
    .getByRole("link", { name: /scheduled post/i })
    .waitFor();
  const post = await db.platformPost.findFirstOrThrow({
    where: { content: marker }
  });
  assert.equal(post.status, "SCHEDULED");
  assert.equal(post.publishedAt, null);
  assert.equal(
    await db.notificationFanoutJob.count({ where: { sourceId: post.id } }),
    0
  );
  const guest = await browser.newContext();
  const response = await guest.request.get(
    config.origin + `/platform/posts/${post.id}`
  );
  assert.equal(response.status(), 404);
  await guest.close();
  ok(
    "The production composer saves a private time-zone plan, fits enlarged 320px layout, and creates a hidden scheduled post without premature fanout"
  );

  phase = "manage-schedule";
  await go(`/platform/scheduled-posts/${post.id}`);
  const plan = () =>
    page.getByRole("region", { name: "Publication plan", exact: true });
  await plan()
    .getByLabel("Publication date and time", { exact: true })
    .waitFor();
  const revised = new Date(Date.now() + 10800000).toISOString().slice(0, 16);
  await plan()
    .getByLabel("Publication date and time", { exact: true })
    .fill(revised);
  const saves = [];
  let missed = false;
  await page.route("**/api/platform/posts", async (route) => {
    const body = route.request().postData();
    if (!body || JSON.parse(body).operation !== "schedule")
      return route.continue();
    saves.push(body);
    const response = await route.fetch();
    if (!missed) {
      missed = true;
      return route.abort("failed");
    }
    return route.fulfill({ response });
  });
  await plan()
    .getByRole("button", { name: "Reschedule publication", exact: true })
    .click();
  await plan()
    .getByRole("button", { name: "Retry original request", exact: true })
    .click();
  await plan()
    .getByText("The revised publication plan is saved.", { exact: true })
    .waitFor();
  assert.equal(saves.length, 2);
  assert.equal(saves[0], saves[1]);
  await page.unroute("**/api/platform/posts");
  let current = await db.platformPost.findUniqueOrThrow({
    where: { id: post.id }
  });
  assert.equal(current.scheduleLocal, revised);
  assert.equal(current.version, post.version + 1);
  await go(`/platform/scheduled-posts/${post.id}`);
  await plan()
    .getByRole("button", { name: "Cancel publication schedule", exact: true })
    .click();
  await waitDb(
    async () =>
      (await db.platformPost.findUniqueOrThrow({ where: { id: post.id } }))
        .status === "DRAFT"
  );
  current = await db.platformPost.findUniqueOrThrow({ where: { id: post.id } });
  assert.equal(current.content, marker);
  assert.equal(current.scheduleAt, null);
  assert.equal(
    (
      await publishScheduledPost(
        db,
        post.id,
        post.version,
        new Date(Date.now() + 14400000)
      )
    ).published,
    false
  );
  ok(
    "Rescheduling retries the exact request and cancellation preserves content while invalidating old queued revisions"
  );

  phase = "draft-edit-and-conflict";
  await go(`/platform/scheduled-posts/${post.id}`);
  await page.locator("#post-edit > summary").click();
  const edit = page.getByRole("form", {
    name: "Save post changes",
    exact: true
  });
  await edit
    .getByLabel("Post content", { exact: true })
    .fill(marker + " edited");
  await edit
    .getByRole("button", { name: "Save post changes", exact: true })
    .click();
  await waitDb(async () =>
    (
      await db.platformPost.findUniqueOrThrow({ where: { id: post.id } })
    ).content.endsWith(" edited")
  );
  await go(`/platform/scheduled-posts/${post.id}`);
  await plan()
    .getByLabel("Publication date and time", { exact: true })
    .fill(revised);
  await plan().getByLabel("Publication time zone", { exact: true }).fill("UTC");
  current = await db.platformPost.findUniqueOrThrow({ where: { id: post.id } });
  const externalTime = new Date(Date.now() + 18000000)
    .toISOString()
    .slice(0, 16);
  await postCommand(db, f.memberA.token, {
    operation: "schedule",
    mutationId: randomUUID(),
    postId: post.id,
    expectedVersion: current.version,
    scheduleLocal: externalTime,
    scheduleZone: "UTC"
  });
  await plan()
    .getByRole("button", { name: "Schedule publication", exact: true })
    .click();
  await plan()
    .getByRole("button", { name: "Load latest saved post", exact: true })
    .click();
  await plan()
    .getByText(`Publication: ${externalTime.replace("T", " ")} in UTC.`, {
      exact: true
    })
    .waitFor();
  assert.equal(
    await plan()
      .getByLabel("Publication date and time", { exact: true })
      .inputValue(),
    revised
  );
  await plan()
    .getByRole("button", {
      name: "I reviewed this version; keep my draft",
      exact: true
    })
    .click();
  await plan()
    .getByRole("button", { name: "Schedule publication", exact: true })
    .click();
  await waitDb(
    async () =>
      (await db.platformPost.findUniqueOrThrow({ where: { id: post.id } }))
        .scheduleLocal === revised
  );
  ok(
    "Canceled drafts remain editable, and conflicting plans show the saved time while retaining unsaved entries for explicit review"
  );

  phase = "scheduled-ownership";
  await go("/platform/scheduled-posts");
  await page.getByText(marker + " edited", { exact: true }).waitFor();
  await page.setViewportSize({ width: 320, height: 568 });
  await bounded();
  await page.screenshot({ path: output + "/scheduled-library-320.png" });
  await signIn(f.coordinator);
  const forbidden = await context.request.get(
    config.origin + `/platform/scheduled-posts/${post.id}`
  );
  assert.equal(forbidden.status(), 404);
  assert.ok(!(await forbidden.text()).includes(marker));
  await page.evaluate(() => {
    window.dispatchEvent(new Event("blur"));
    window.dispatchEvent(new Event("focus"));
  });
  await page
    .getByText(marker + " edited", { exact: true })
    .waitFor({ state: "hidden" });
  await signIn(f.memberA);
  await go(`/platform/scheduled-posts/${post.id}`);
  await plan()
    .getByLabel("Publication date and time", { exact: true })
    .waitFor();
  await db.churchCapabilityGrant.updateMany({
    where: {
      userId: f.memberA.id,
      churchId: f.churchA.id,
      capability: "PUBLISH_CHURCH_POSTS",
      revokedAt: null
    },
    data: { revokedAt: new Date(), version: { increment: 1 } }
  });
  const denied = await context.request.get(
    config.origin + `/api/platform/posts?postId=${post.id}`
  );
  assert.equal(denied.status(), 404);
  current = await db.platformPost.findUniqueOrThrow({ where: { id: post.id } });
  const held = await publishScheduledPost(
    db,
    post.id,
    current.version,
    new Date(current.scheduleAt.getTime() + 1000)
  );
  assert.equal(held.published, false);
  assert.equal(held.changed, true);
  assert.equal(
    (await db.platformPost.findUniqueOrThrow({ where: { id: post.id } }))
      .status,
    "DRAFT"
  );
  ok(
    "Scheduled content is concealed across accounts, and lost publisher access prevents management and publication"
  );
  assert.deepEqual(errors, []);
  ok("All exercised production browser flows finish without page errors");
} finally {
  await page
    .screenshot({ path: output + "/last-page.png", fullPage: true })
    .catch(() => {});
  writeFileSync(
    output + "/last-page.txt",
    await page
      .locator("body")
      .innerText()
      .catch(() => ""),
    { mode: 0o600 }
  );
  writeFileSync(
    output + "/results.json",
    JSON.stringify({ phase, results, errors }, null, 2),
    { mode: 0o600 }
  );
  await browser.close();
  await db.$disconnect();
}
