import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
const root = process.cwd();
assert.ok(
  process.argv[2],
  "Pass an existing isolated preview fixture directory"
);
const fixture = root + "/" + process.argv[2],
  work = fixture + "/avatar-browser";
mkdirSync(work, { recursive: true, mode: 0o700 });
const config = JSON.parse(readFileSync(fixture + "/browser-env.json", "utf8"));
assert.match(config.origin, /^https:\/\/127\.0\.0\.1:\d+$/);
Object.assign(process.env, {
  DATABASE_URL: config.database,
  DIRECT_URL: config.database,
  ACCOUNT_ORIGIN: config.origin,
  NEXT_PUBLIC_SITE_URL: config.origin,
  ACCOUNT_TEST_ISOLATED: "1",
  ACCOUNT_DELIVERY_MODE: "test-sink",
  ACCOUNT_TEST_SINK_DIR: fixture + "/sink",
  AUTH_RATE_LIMIT_SECRET: "medium-fixture-only-secret-".repeat(3),
  NODE_ENV: "test",
  VERCEL: "",
  MEDIA_STORAGE_MODE: "local-test",
  MEDIA_TEST_DIR: fixture + "/images",
  BLOB_READ_WRITE_TOKEN: "",
  BLOB_STORE_ID: "",
  COMMUNITY_REPORTS_ENABLED: "true"
});
const req = createRequire(root + "/package.json"),
  { PrismaClient } = req("@prisma/client"),
  sharp = req("sharp");
const { assertPortalTestDatabase, createPortalActor, seedOperatorGrants } =
  await import(root + "/tests/seed-portal.ts");
const { postCommand } = await import(root + "/lib/platform/post-commands.ts");
const { uploadImage } = await import(root + "/lib/platform/media.ts");
const { adultContactCommand, readAdultContact } = await import(
  root + "/lib/platform/adult-contact.ts"
);
const { adultMessageCommand } = await import(
  root + "/lib/platform/adult-messages.ts"
);
const db = new PrismaClient();
await assertPortalTestDatabase(db);
const actor = await createPortalActor(db, "perfavatar");
const post = await postCommand(db, actor.token, {
  operation: "create",
  requestKey: randomUUID(),
  audience: "PUBLIC",
  content: "Fictional startup timing reference post"
});
const bytes = await sharp({
  create: { width: 256, height: 256, channels: 3, background: "cornflowerblue" }
})
  .webp()
  .toBuffer();
const avatar = await uploadImage(
  db,
  actor.token,
  { purpose: "PROFILE_AVATAR", targetId: actor.id, requestKey: randomUUID() },
  bytes
);
const f = { actor, post, avatar };
const { chromium } = createRequire(
  process.env.HOME +
    "/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json"
)("playwright");
const pub = execFileSync("openssl", [
    "x509",
    "-in",
    config.certificate,
    "-pubkey",
    "-noout"
  ]),
  der = execFileSync("openssl", ["pkey", "-pubin", "-outform", "DER"], {
    input: pub
  });
const browser = await chromium.launch({
  headless: true,
  executablePath:
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  args: [
    "--ignore-certificate-errors-spki-list=" +
      createHash("sha256").update(der).digest("base64")
  ]
});
const context = await browser.newContext({
    viewport: { width: 390, height: 844 }
  }),
  page = await context.newPage(),
  checks = [],
  errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const cookie = async (actor) =>
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
const loaded = () =>
  page.waitForFunction(() => {
    const img = document.querySelector(".gc-post-author .gc-avatar img");
    return img?.complete && img.naturalWidth > 0;
  });
try {
  await cookie(f.actor);
  await page.goto(config.origin + "/platform/posts/" + f.post.id);
  await loaded();
  await page.waitForLoadState("networkidle");
  let original = await page
    .locator(".gc-post-author .gc-avatar img")
    .getAttribute("src");
  assert.match(original, /^blob:/);
  const direct = await context.request.get(
    config.origin + "/api/platform/avatars/" + f.actor.id,
    { headers: { "X-Expected-Account": f.actor.id } }
  );
  assert.equal(direct.status(), 200);
  assert.equal(direct.headers()["content-type"], "image/webp");
  assert.match(direct.headers()["cache-control"], /private.*no-store/);
  assert.ok((await direct.body()).length > 0);
  checks.push(
    "Real production-mode endpoint serves authorized private WebP thumbnail bytes with no-store headers"
  );
  const comment = await db.platformPostComment.create({
    data: {
      postId: f.post.id,
      authorId: f.actor.id,
      content: "Fictional shared avatar comment"
    }
  });
  await page.reload();
  await page
    .locator(`[data-comment-id="${comment.id}"]`)
    .scrollIntoViewIfNeeded();
  await page.waitForFunction((id) => {
    const img = document.querySelector(
      `[data-comment-id="${id}"] .gc-avatar img`
    );
    return img?.complete && img.naturalWidth > 0;
  }, comment.id);
  const recipient = await createPortalActor(db, "avatarrecipient");
  const operator = await createPortalActor(db, "avataroperator");
  await seedOperatorGrants(db, operator, ["REVIEW_COMMUNITY_REPORTS"]);
  const preference = await readAdultContact(db, f.actor.token, {
    view: "preferences"
  });
  await adultContactCommand(db, f.actor.token, {
    operation: "preferences",
    audience: "EVERYONE",
    expectedVersion: preference.preferences.version,
    mutationId: randomUUID()
  });
  const target = await readAdultContact(db, recipient.token, {
    view: "target",
    recipientId: f.actor.id
  });
  const invitation = await adultContactCommand(db, recipient.token, {
    operation: "create",
    recipientId: f.actor.id,
    purpose: "Fictional avatar regression",
    expectedRecipientVersion: target.expectedRecipientVersion,
    mutationId: randomUUID()
  });
  await adultContactCommand(db, f.actor.token, {
    operation: "accept",
    id: invitation.id,
    expectedVersion: invitation.version,
    mutationId: randomUUID()
  });
  const accepted = await db.adultContactRequest.findUniqueOrThrow({
    where: { id: invitation.id }
  });
  const conversation = await db.adultConversation.findUniqueOrThrow({
    where: { id: accepted.conversationId }
  });
  await adultMessageCommand(db, f.actor.token, {
    operation: "send",
    conversationId: conversation.id,
    expectedVersion: conversation.version,
    content: "Fictional avatar message",
    mutationId: randomUUID()
  });
  await cookie(recipient);
  await page.goto(config.origin + "/platform/messages/" + conversation.id);
  await page.locator(".gc-message-thread").scrollIntoViewIfNeeded();
  await page.waitForFunction(() => {
    const img = document.querySelector(".gc-message-thread .gc-avatar img");
    return img?.complete && img.naturalWidth > 0;
  });
  checks.push(
    "Post comments and an accepted private conversation render the shared authorized avatar through their actual built interfaces"
  );
  await cookie(f.actor);
  await page.goto(config.origin + "/platform/posts/" + f.post.id);
  await loaded();
  await page.waitForLoadState("networkidle");
  original = await page
    .locator(".gc-post-author .gc-avatar img")
    .getAttribute("src");
  let avatarRequests = 0;
  page.on("request", (r) => {
    if (new URL(r.url()).pathname === "/api/platform/avatars/" + f.actor.id)
      avatarRequests++;
  });
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  assert.equal(await page.locator(".gc-post-author .gc-avatar img").count(), 0);
  await page.evaluate(() => {
    window.dispatchEvent(new Event("focus"));
    document.dispatchEvent(new Event("visibilitychange"));
    window.dispatchEvent(new Event("focus"));
  });
  await loaded();
  await page.waitForLoadState("networkidle");
  assert.equal(avatarRequests, 1);
  assert.notEqual(
    await page.locator(".gc-post-author .gc-avatar img").getAttribute("src"),
    original
  );
  assert.equal(
    await page.evaluate(async (url) => {
      try {
        await fetch(url);
        return true;
      } catch {
        return false;
      }
    }, original),
    false
  );
  checks.push(
    "Blur conceals and releases the old object URL; repeated focus/visibility signals perform one fresh avatar read"
  );
  let release, arrived;
  const responseReady = new Promise((r) => (arrived = r)),
    gate = new Promise((r) => (release = r));
  let held = false;
  await page.route("**/api/platform/avatars/*", async (route) => {
    if (held) return route.continue();
    held = true;
    const response = await route.fetch();
    arrived();
    await gate;
    await route.fulfill({ response });
  });
  await page.evaluate(() => {
    window.dispatchEvent(new Event("blur"));
    window.dispatchEvent(new Event("focus"));
  });
  await responseReady;
  const other = await createPortalActor(db, "avatarother");
  await db.socialRelationship.create({
    data: { ownerId: other.id, targetUserId: f.actor.id, blocked: true }
  });
  await cookie(other);
  release();
  await page.waitForLoadState("networkidle");
  assert.equal(await page.locator(".gc-post-author .gc-avatar img").count(), 0);
  checks.push(
    "An already-delivered response held across an account switch never becomes visible after the final identity check"
  );
  await page.unroute("**/api/platform/avatars/*");
  await cookie(f.actor);
  await page.goto(config.origin + "/platform/posts/" + f.post.id);
  await loaded();
  await page.setViewportSize({ width: 320, height: 900 });
  await page.addStyleTag({ content: "html{font-size:200% !important}" });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1
    )
  );
  await page.screenshot({ path: work + "/perf-avatar-320.png" });
  const viewer = await createPortalActor(db, "avatarblocked");
  await cookie(viewer);
  await page.goto(config.origin + "/platform/posts/" + f.post.id);
  await loaded();
  await db.socialRelationship.create({
    data: { ownerId: f.actor.id, targetUserId: viewer.id, blocked: true }
  });
  const denied = page.waitForResponse(
    (r) => r.url().includes("/api/platform/avatars/") && r.status() === 404
  );
  await page.evaluate(() =>
    window.dispatchEvent(new Event("social-relationships-changed"))
  );
  assert.equal(await page.locator(".gc-post-author .gc-avatar img").count(), 0);
  await denied;
  assert.equal(await page.locator(".gc-post-author .gc-avatar img").count(), 0);
  checks.push(
    "A relationship change immediately conceals the visible avatar and the blocked request cannot restore it; enlarged mobile layout stays bounded"
  );
  assert.deepEqual(errors, []);
  writeFileSync(
    work + "/perf-browser-acceptance.json",
    JSON.stringify(
      {
        checkedAt: new Date().toISOString(),
        checks,
        errors,
        productionWrites: 0
      },
      null,
      2
    ),
    { mode: 0o600 }
  );
  console.log("PASS " + checks.length + " avatar browser acceptance groups");
} finally {
  await context.close();
  await browser.close();
  await db.$disconnect();
}
