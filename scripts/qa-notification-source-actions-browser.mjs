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
  VERCEL: "",
  PUSH_ENABLED: "false",
  PERSONAL_PHOTO_LIBRARY_ENABLED: "true",
  MEDIA_STORAGE_MODE: "local-test",
  MEDIA_TEST_DIR: process.cwd() + "/" + fixtureDir + "/images",
  COMMUNITY_REPORTS_ENABLED: "true",
  RETENTION_TEST_DIR: process.cwd() + "/" + fixtureDir + "/retention"
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
await context.grantPermissions([], { origin: config.origin });
const page = await context.newPage();
let phase = "initial";
const errors = [];
page.setDefaultTimeout(30000);
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
const output =
  fixtureDir + "/notification-source-actions-browser-" + Date.now();
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

const { createPortalActor } = await import("../tests/seed-portal.ts");
const { postCommand } = await import("../lib/platform/post-commands.ts");
const { seedParticipation } =
  await import("../tests/seed-post-participation.ts");
const { relationshipCommand, readRelationships } =
  await import("../lib/platform/relationships.ts");
const { readActivity, activityCommand } =
  await import("../lib/platform/activity.ts");
const { processNotificationFanoutBatch } =
  await import("../lib/platform/notification-fanout.ts");
const badge = (n) =>
  n
    ? page
        .locator(
          `.gc-notifications-link [aria-label="${n} unread notifications"]`
        )
        .waitFor()
    : page
        .locator(".gc-notifications-link")
        .getByText("No unread notifications", { exact: true })
        .waitFor();
const rows = () =>
  page.getByRole("list", { name: "Activity updates" }).getByRole("article");
const sourceRow = (href) =>
  rows().filter({ has: page.locator(`a[href="${href}"]`) });
const openCenter = async (actor) => {
  await signIn(actor);
  await go("/platform/activity");
  await page
    .getByRole("button", { name: "Refresh activity", exact: true })
    .waitFor();
};
const { commentCommand } = await import("../lib/platform/comment-commands.ts");
const { postLikeCommand } = await import("../lib/platform/post-likes.ts");
const { friendInvitationCommand, readFriendInvitations } =
  await import("../lib/platform/friend-invitations.ts");
const { calendarCommand } =
  await import("../lib/platform/calendar-commands.ts");
const input = (operation, fields = {}) => ({
  operation,
  mutationId: randomUUID(),
  ...fields
});
async function clear(actor) {
  const view = await readActivity(db, actor.token);
  await activityCommand(
    db,
    actor.token,
    input("read-all", { ownerId: actor.id, boundary: view.boundary })
  );
}
async function drain(sourceId) {
  for (const job of await db.notificationFanoutJob.findMany({
    where: { sourceId, completedAt: null }
  })) {
    let done = false;
    for (let i = 0; i < 20 && !done; i++)
      done = (await processNotificationFanoutBatch(db, job.id)).done;
    assert.equal(done, true);
  }
}
async function openExact(href) {
  await sourceRow(href)
    .first()
    .getByRole("link", { name: "Open item", exact: true })
    .click();
  await page.waitForURL((url) => url.pathname + url.search + url.hash === href);
  await page.getByRole("heading", { level: 1 }).waitFor();
  await page.goBack();
  await sourceRow(href).first().waitFor();
}
try {
  phase = "friend-acceptance";
  const inviter = await createPortalActor(db, "uinotifyfriend"),
    friend = await createPortalActor(db, "uinotifyaccepted");
  await friendInvitationCommand(
    db,
    inviter.token,
    input("enable", {
      accountId: inviter.id,
      consent: true,
      expectedVersion: 0
    })
  );
  const invitation = await readFriendInvitations(db, inviter.token);
  const accept = input("accept", {
    accountId: friend.id,
    code: invitation.url.split("/").at(-1),
    consent: true
  });
  const accepted = await friendInvitationCommand(db, friend.token, accept);
  assert.deepEqual(
    await friendInvitationCommand(db, friend.token, accept),
    accepted
  );
  assert.equal(
    await db.socialEvent.count({
      where: { kind: "FRIEND_CONNECTED", recipientId: inviter.id }
    }),
    1
  );
  assert.equal(
    await db.socialEvent.count({
      where: { kind: "FRIEND_CONNECTED", recipientId: friend.id }
    }),
    0
  );
  await openCenter(inviter);
  await badge(1);
  await sourceRow(`/platform/profile/${friend.username}`)
    .getByText(`${friend.name} accepted your friend invitation`, {
      exact: true
    })
    .waitFor();
  await openExact(`/platform/profile/${friend.username}`);
  ok(
    "An actual consented friend acceptance creates one alert through retries, displays the unread badge and opens the accepted adult's profile"
  );

  phase = "comment-reply-mention";
  const author = await createPortalActor(db, "uinotifycomments"),
    writer = await createPortalActor(db, "uinotifywriter"),
    mentioned = await createPortalActor(db, "uinotifymention");
  const post = await postCommand(db, author.token, {
    operation: "create",
    requestKey: randomUUID(),
    content: "Fictional comment notification source"
  });
  const body = input("create", {
    postId: post.id,
    content: "Fictional selected comment mention",
    mentionIds: [mentioned.id]
  });
  const comment = await commentCommand(db, writer.token, body);
  assert.deepEqual(await commentCommand(db, writer.token, body), comment);
  for (const actor of [author, mentioned]) {
    assert.equal(
      await db.socialEvent.count({
        where: {
          kind: "COMMENT_ACTIVITY",
          recipientId: actor.id,
          commentId: comment.id
        }
      }),
      1
    );
    await openCenter(actor);
    await badge(1);
    await openExact(`/platform/posts/${post.id}?comment=${comment.id}`);
  }
  const reply = await commentCommand(
    db,
    author.token,
    input("create", {
      postId: post.id,
      replyToId: comment.id,
      content: "Fictional direct reply"
    })
  );
  await openCenter(writer);
  await badge(1);
  await openExact(`/platform/posts/${post.id}?comment=${reply.id}`);
  ok(
    "Real comments, selected comment mentions and direct replies create canonical single alerts with badges, exact thread destinations and Back recovery"
  );

  phase = "anonymous-reaction";
  await clear(author);
  const like = {
    postId: post.id,
    mutationId: randomUUID(),
    expectedVersion: 0,
    desired: true
  };
  const liked = await postLikeCommand(db, writer.token, like);
  assert.deepEqual(await postLikeCommand(db, writer.token, like), liked);
  assert.equal(
    await db.socialEvent.count({
      where: { kind: "POST_REACTION", postId: post.id, recipientId: author.id }
    }),
    1
  );
  await openCenter(author);
  await badge(1);
  assert.ok(
    !(await sourceRow(`/platform/posts/${post.id}`).innerText()).includes(
      writer.name
    )
  );
  await openExact(`/platform/posts/${post.id}`);
  ok(
    "An actual reaction creates one badge/event through exact retries and opens its post without exposing the reacting person's identity"
  );

  phase = "church-update-and-event";
  const f = await seedParticipation(db);
  const status = await readRelationships(db, f.morgan.token, {
    view: "status",
    kind: "church",
    targetId: f.churchA.id
  });
  await relationshipCommand(
    db,
    f.morgan.token,
    input("author-bell", {
      kind: "church",
      targetId: f.churchA.id,
      desired: true,
      expectedVersion: status.version
    })
  );
  await clear(f.morgan);
  const churchPost = await postCommand(db, f.ada.token, {
    operation: "create",
    requestKey: randomUUID(),
    authorChurchId: f.churchA.id,
    audience: "CHURCH",
    content: "Fictional new church update"
  });
  await drain(churchPost.id);
  await openCenter(f.morgan);
  await badge(1);
  await sourceRow(`/platform/posts/${churchPost.id}`)
    .getByText(`New posts from ${f.churchA.name}`, { exact: true })
    .waitFor();
  await openExact(`/platform/posts/${churchPost.id}`);
  await calendarCommand(db, f.morgan.token, {
    operation: "rsvp",
    eventId: f.event.id,
    occurrenceId: f.occurrence.id,
    occurrenceVersion: f.occurrence.version,
    expectedVersion: 0,
    state: "GOING"
  });
  await clear(f.morgan);
  await calendarCommand(db, f.ada.token, {
    operation: "cancel-event",
    eventId: f.event.id,
    expectedVersion: 1,
    occurrenceId: f.occurrence.id,
    occurrenceVersion: 1,
    scope: "OCCURRENCE",
    confirmed: true
  });
  await drain(f.occurrence.id);
  assert.equal(
    await db.socialEvent.count({
      where: {
        kind: "EVENT_CHANGED",
        recipientId: f.morgan.id,
        sourceId: f.occurrence.id
      }
    }),
    1
  );
  await openCenter(f.morgan);
  await badge(1);
  await sourceRow(`/platform/events/${f.occurrence.id}`)
    .first()
    .getByText(`An event from ${f.churchA.name} in your commitments changed`, {
      exact: true
    })
    .waitFor();
  await openExact(`/platform/events/${f.occurrence.id}`);
  ok(
    "An authorized church update honors the prior church bell, and an actual participating event cancellation opens its exact event with one unread alert"
  );
  assert.equal(
    await db.pushSubscription.count({
      where: {
        ownerId: {
          in: [
            inviter.id,
            friend.id,
            author.id,
            writer.id,
            mentioned.id,
            f.morgan.id
          ]
        }
      }
    }),
    0
  );
  assert.deepEqual(errors, []);
  await page.setViewportSize({ width: 320, height: 900 });
  await bounded();
  await page.screenshot({
    path: output + "/church-notifications-mobile.png",
    fullPage: true
  });
  writeFileSync(
    output + "/result.json",
    JSON.stringify(
      {
        checkedAt: new Date().toISOString(),
        results,
        errors,
        productionWrites: 0,
        externalSends: 0
      },
      null,
      2
    )
  );
} catch (error) {
  await page
    .screenshot({ path: output + "/failed.png", fullPage: true })
    .catch(() => {});
  writeFileSync(
    output + "/failed.txt",
    String(error) + "\n" + (await page.locator("body").innerText())
  );
  throw error;
} finally {
  await browser.close();
  await db.$disconnect();
}
