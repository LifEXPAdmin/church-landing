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
const output = fixtureDir + "/notification-center-browser-" + Date.now();
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

const { createPortalActor, seedOperatorGrants } =
  await import("../tests/seed-portal.ts");
const { uploadImage } = await import("../lib/platform/media.ts");
const { default: sharp } = await import("sharp");
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
try {
  phase = "adult-tag-request";
  const a = await createPortalActor(db, "uitagowner"),
    b = await createPortalActor(db, "uitagrecipient"),
    c = await createPortalActor(db, "uitagobserver");
  const bytes = await sharp({
    create: { width: 160, height: 120, channels: 3, background: "blue" }
  })
    .png()
    .toBuffer();
  const image = await uploadImage(
    db,
    a.token,
    {
      purpose: "PROFILE_PHOTO",
      targetId: a.id,
      requestKey: randomUUID(),
      audience: "MEMBERS",
      caption: "Fictional tag acceptance photo"
    },
    bytes
  );
  await signIn(a);
  await go(`/platform/photo-tags?photo=${image.id}`);
  await page
    .getByRole("combobox", { name: "Choose an adult to tag" })
    .fill(b.username);
  await page
    .getByRole("button", { name: "Find eligible adults", exact: true })
    .click();
  await page
    .getByRole("listbox", { name: "Photo tag suggestions" })
    .getByRole("button")
    .filter({ hasText: b.name })
    .click();
  let lost = false;
  const requests = [];
  await page.route("**/api/platform/photo-tags", async (route) => {
    const body = route.request().postData();
    if (!body || JSON.parse(body).operation !== "request")
      return route.continue();
    requests.push(body);
    const response = await route.fetch();
    if (!lost) {
      lost = true;
      return route.abort("failed");
    }
    return route.fulfill({ response });
  });
  await page
    .getByRole("button", { name: "Ask for tag approval", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Retry photo tag change", exact: true })
    .click();
  await page.getByText("Awaiting approval", { exact: false }).first().waitFor();
  assert.equal(requests.length, 2);
  assert.equal(requests[0], requests[1]);
  await page.unroute("**/api/platform/photo-tags");
  const tag = await db.photoTag.findUniqueOrThrow({
    where: { assetId_recipientId: { assetId: image.id, recipientId: b.id } }
  });
  assert.equal(tag.state, "PENDING");
  assert.equal(
    await db.socialEvent.count({
      where: { kind: "PHOTO_TAG_REQUEST", sourceId: tag.id }
    }),
    1
  );
  await signIn(c);
  await go(`/platform/photo-tags?profile=${b.id}`);
  await page
    .getByText("No approved tagged photos are visible on this page.", {
      exact: true
    })
    .waitFor();
  assert.equal(
    await page
      .getByText("Fictional tag acceptance photo", { exact: true })
      .count(),
    0
  );
  ok(
    "A real photo tag request retries the exact body once and stays private until approval"
  );

  phase = "adult-tag-approval";
  await openCenter(b);
  await badge(1);
  assert.equal(await page.evaluate(() => Notification.permission), "denied");
  await sourceRow(`/platform/photo-tags?tag=${tag.id}`)
    .getByText(`${a.name} asked to tag you in a photo`, { exact: true })
    .waitFor();
  await sourceRow(`/platform/photo-tags?tag=${tag.id}`)
    .getByRole("link", { name: "Open item", exact: true })
    .click();
  await page.getByRole("button", { name: "Approve tag", exact: true }).click();
  await page
    .getByRole("heading", { name: `${b.name} · Approved`, exact: true })
    .waitFor();
  assert.equal(
    (await db.photoTag.findUniqueOrThrow({ where: { id: tag.id } })).state,
    "APPROVED"
  );
  await openCenter(a);
  await badge(1);
  await sourceRow(`/platform/photo-tags?tag=${tag.id}`)
    .getByText(`${b.name} approved your photo tag request`, { exact: true })
    .waitFor();
  await signIn(c);
  await go(`/platform/photo-tags?profile=${b.id}`);
  await page
    .getByText("Fictional tag acceptance photo", { exact: true })
    .waitFor();
  await page.locator('img[alt="Photo for tag review"]').evaluate((img) => {
    if (!img.complete || !img.naturalWidth)
      throw Error("Permissioned photo failed to render");
  });
  await signIn(b);
  await go(`/platform/photo-tags?tag=${tag.id}`);
  await page.getByRole("button", { name: "Remove tag", exact: true }).click();
  await page
    .getByText(/Removed$/)
    .first()
    .waitFor();
  await signIn(c);
  await go(`/platform/photo-tags?profile=${b.id}`);
  await page
    .getByText("No approved tagged photos are visible on this page.", {
      exact: true
    })
    .waitFor();
  assert.equal(
    await db.mediaAsset.count({ where: { id: image.id, status: "READY" } }),
    1
  );
  ok(
    "Request → notification badge → exact private review → approval alert → permitted association → removal preserves the photo"
  );

  phase = "adult-privacy-refresh";
  await signIn(b);
  await go("/platform/photo-tags?view=preferences");
  await page
    .getByRole("combobox", { name: "Photo tag requests", exact: true })
    .selectOption("NOBODY");
  await page.evaluate(() => {
    window.dispatchEvent(new Event("blur"));
    window.dispatchEvent(new Event("focus"));
  });
  await page
    .getByRole("combobox", { name: "Photo tag requests", exact: true })
    .waitFor();
  assert.equal(
    await page
      .getByRole("combobox", { name: "Photo tag requests", exact: true })
      .inputValue(),
    "NOBODY"
  );
  await page
    .getByRole("button", { name: "Save tag privacy", exact: true })
    .click();
  await page
    .getByText(
      "Photo tag choices saved. Every new tag still requires your approval.",
      { exact: true }
    )
    .waitFor();
  await page.reload();
  await page
    .getByRole("combobox", { name: "Photo tag requests", exact: true })
    .waitFor();
  assert.equal(
    await page
      .getByRole("combobox", { name: "Photo tag requests", exact: true })
      .inputValue(),
    "NOBODY"
  );
  for (const width of [320, 390, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await bounded();
  }
  await page.evaluate(() => (document.documentElement.style.fontSize = "200%"));
  await bounded();
  await page.evaluate(() => (document.documentElement.style.fontSize = ""));
  assert.equal(
    (await db.socialPreferences.findUniqueOrThrow({ where: { ownerId: b.id } }))
      .mentions,
    "EVERYONE"
  );
  ok(
    "Adult tag privacy survives focus refresh and reload, keeps text mentions independent and fits narrow/zoomed screens"
  );

  phase = "mention-read-sync";
  const author = await createPortalActor(db, "uicenterwriter"),
    reader = await createPortalActor(db, "uicenterreader");
  const publish = () =>
    postCommand(db, author.token, {
      operation: "create",
      requestKey: randomUUID(),
      content: "Fictional notification center mention " + randomUUID(),
      mentionIds: [reader.id]
    });
  const mentioned = await publish();
  await openCenter(reader);
  await badge(1);
  const href = `/platform/posts/${mentioned.id}`;
  await sourceRow(href)
    .getByRole("link", { name: "Open item", exact: true })
    .click();
  await page
    .getByText(/Fictional notification center mention/)
    .first()
    .waitFor();
  await page.goBack();
  await sourceRow(href)
    .getByRole("button", { name: "Mark group read", exact: true })
    .click();
  await badge(0);
  await page.reload();
  await badge(0);
  await sourceRow(href)
    .getByRole("button", { name: "Mark group unread", exact: true })
    .click();
  await badge(1);
  await page
    .getByRole("link", { name: "Unread notifications", exact: true })
    .click();
  await sourceRow(href).waitFor();
  const second = await context.newPage();
  await second.goto(config.origin + "/platform/activity");
  await second
    .getByRole("button", { name: "Mark all read", exact: true })
    .click();
  await page.bringToFront();
  await page
    .getByText("No unread notifications in this view.", { exact: true })
    .waitFor();
  await badge(0);
  await second.close();
  let added;
  await page
    .getByRole("link", { name: "All notifications", exact: true })
    .click();
  await sourceRow(href)
    .getByRole("button", { name: "Mark group unread", exact: true })
    .click();
  await badge(1);
  await page.route("**/api/platform/activity", async (route) => {
    const body = route.request().postData();
    if (!body || JSON.parse(body).operation !== "read-all")
      return route.continue();
    added = await publish();
    return route.continue();
  });
  await Promise.all([
    page.waitForResponse(
      (r) =>
        new URL(r.url()).pathname === "/api/platform/activity" &&
        r.request().method() === "POST" &&
        r.request().postDataJSON()?.operation === "read-all"
    ),
    page.getByRole("button", { name: "Mark all read", exact: true }).click()
  ]);
  await badge(1);
  await page.unroute("**/api/platform/activity");
  await sourceRow(`/platform/posts/${added.id}`)
    .getByRole("button", { name: "Mark group read", exact: true })
    .waitFor();
  for (const width of [320, 390, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await bounded();
    assert.equal(
      await page.locator(".gc-notifications-label").isVisible(),
      true
    );
  }
  await page.evaluate(() => (document.documentElement.style.fontSize = "200%"));
  await bounded();
  await page.evaluate(() => (document.documentElement.style.fontSize = ""));
  ok(
    "Post mentions reach the labeled header and exact post; read/unread persists, syncs across tabs and preserves arrivals after mark-all"
  );

  phase = "post-mention-composer";
  await signIn(author);
  const selectionsPath = `/api/platform/posts?view=mention-selections&id=${reader.id}`;
  for (const [suffix, expectedOwner, status] of [
    ["", undefined, 401],
    ["", reader.id, 401],
    ["&q=unexpected", author.id, 400],
    [`&id=${reader.id}`, author.id, 400],
    ["&view=mentions", author.id, 400]
  ]) {
    const response = await context.request.get(
      config.origin + selectionsPath + suffix,
      {
        headers: expectedOwner ? { "X-Expected-Account": expectedOwner } : {}
      }
    );
    assert.equal(response.status(), status);
  }
  await go("/platform");
  await page.locator("#compose-post").click();
  const form = page.getByRole("form", { name: "Publish post", exact: true });
  await form
    .getByLabel("Post content", { exact: true })
    .fill("Fictional browser-selected post mention");
  await form.locator("summary").filter({ hasText: "Mention people" }).click();
  await form
    .getByRole("combobox", { name: "Mention someone (optional)" })
    .fill(reader.username);
  await form
    .getByRole("button", { name: "Find mentions", exact: true })
    .click();
  await form
    .getByRole("listbox", { name: "Mention suggestions" })
    .getByRole("button")
    .filter({ hasText: reader.name })
    .click();
  await form.getByRole("button", { name: "Save draft", exact: true }).click();
  await form.getByText("Saved privately.", { exact: true }).waitFor();
  const savedDraft = await db.privatePostDraft.findFirstOrThrow({
    where: { ownerId: author.id },
    orderBy: { updatedAt: "desc" }
  });
  assert.deepEqual(savedDraft.payload.mentionIds, [reader.id]);
  assert.equal(
    await db.socialEvent.count({
      where: { kind: "POST_MENTION", sourceId: savedDraft.id }
    }),
    0
  );
  await go(
    `/platform/drafts?resume=${encodeURIComponent(savedDraft.id)}#resume`
  );
  await form.getByLabel("Post content", { exact: true }).waitFor();
  await form.locator("summary").filter({ hasText: "Mention people" }).click();
  await form
    .getByRole("button", { name: `Remove ${reader.name}`, exact: true })
    .waitFor();
  await form.getByRole("button", { name: "Post", exact: true }).click();
  await form
    .getByRole("link", { name: "View published post", exact: true })
    .waitFor();
  const liveMention = await db.platformPost.findFirstOrThrow({
    where: {
      authorId: author.id,
      content: "Fictional browser-selected post mention"
    }
  });
  assert.equal(
    await db.postMention.count({
      where: { postId: liveMention.id, recipientId: reader.id, active: true }
    }),
    1
  );
  await openCenter(reader);
  await sourceRow(`/platform/posts/${liveMention.id}`).waitFor();
  ok(
    "The real composer saves and reopens a chosen mention with its permitted name, then publishes its canonical notification"
  );

  phase = "church-volunteer-request";
  const f = await seedParticipation(db);
  const status = await readRelationships(db, f.morgan.token, {
    view: "status",
    kind: "church",
    targetId: f.churchA.id
  });
  await relationshipCommand(db, f.morgan.token, {
    operation: "author-bell",
    mutationId: randomUUID(),
    kind: "church",
    targetId: f.churchA.id,
    desired: true,
    expectedVersion: status.version
  });
  const before = await readActivity(db, f.morgan.token);
  await activityCommand(db, f.morgan.token, {
    operation: "read-all",
    mutationId: randomUUID(),
    ownerId: f.morgan.id,
    boundary: before.boundary
  });
  const slot = await f.slot();
  const job = await db.notificationFanoutJob.findFirstOrThrow({
    where: { kind: "VOLUNTEER_REQUEST", sourceId: slot.id }
  });
  await processNotificationFanoutBatch(db, job.id);
  await openCenter(f.morgan);
  await badge(1);
  await sourceRow(`/platform/posts/${f.post.id}#volunteer-${slot.id}`)
    .getByRole("link", { name: "Open item", exact: true })
    .click();
  await page.locator(`#volunteer-${slot.id}`).waitFor();
  assert.equal(new URL(page.url()).hash, `#volunteer-${slot.id}`);
  await page.goBack();
  await sourceRow(
    `/platform/posts/${f.post.id}#volunteer-${slot.id}`
  ).waitFor();
  ok(
    "A new opted-in church volunteer request creates the saved event, unread badge and exact role destination with Back recovery"
  );
  await sourceRow(`/platform/posts/${f.post.id}#volunteer-${slot.id}`)
    .getByRole("link", { name: "Open item", exact: true })
    .click();
  await page
    .locator(`#volunteer-${slot.id}`)
    .getByRole("button", { name: "I can help", exact: true })
    .click();
  await page.getByText("Your place is reserved.", { exact: true }).waitFor();
  const signup = await db.postVolunteerSignup.findUniqueOrThrow({
    where: { slotId_userId: { slotId: slot.id, userId: f.morgan.id } }
  });
  await openCenter(f.morgan);
  await sourceRow(`/platform/commitments?signup=${signup.id}`)
    .getByRole("link", { name: "Open item", exact: true })
    .click();
  await page
    .locator(`#signup-${signup.id}`)
    .getByRole("button", { name: "Cancel my signup", exact: true })
    .click();
  await page
    .getByText("Your reservation is canceled.", { exact: true })
    .waitFor();
  await go(`/platform/commitments?signup=${signup.id}&month=2000-01`);
  await page
    .getByText("Your reservation is canceled.", { exact: true })
    .waitFor();
  ok(
    "An actual volunteer signup and cancellation remain reachable through the exact owned confirmation outside its calendar month"
  );

  phase = "message-events";
  await seedOperatorGrants(db, f.operator, ["REVIEW_COMMUNITY_REPORTS"]);
  const { adultContactCommand, readAdultContact } =
    await import("../lib/platform/adult-contact.ts");
  const { adultMessageCommand } =
    await import("../lib/platform/adult-messages.ts");
  const messageOwner = await createPortalActor(db, "uimsgcenter"),
    sender = await createPortalActor(db, "uimsgsender");
  const input = (operation, fields) => ({
    operation,
    mutationId: randomUUID(),
    ...fields
  });
  const pref = await readAdultContact(db, sender.token, {
    view: "preferences"
  });
  await adultContactCommand(
    db,
    sender.token,
    input("preferences", {
      audience: "EVERYONE",
      expectedVersion: pref.preferences.version
    })
  );
  const target = await readAdultContact(db, messageOwner.token, {
    view: "target",
    recipientId: sender.id
  });
  const request = await adultContactCommand(
    db,
    messageOwner.token,
    input("create", {
      recipientId: sender.id,
      purpose: "Fictional notification center contact",
      expectedRecipientVersion: target.expectedRecipientVersion
    })
  );
  await openCenter(sender);
  await badge(1);
  await sourceRow(`/platform/messages/requests?id=${request.id}`)
    .getByRole("link", { name: "Open item", exact: true })
    .click();
  await page
    .getByText("Fictional notification center contact", { exact: true })
    .waitFor();
  await adultContactCommand(
    db,
    sender.token,
    input("accept", { id: request.id, expectedVersion: request.version })
  );
  const accepted = await db.adultContactRequest.findUniqueOrThrow({
    where: { id: request.id }
  });
  const prior = await readActivity(db, messageOwner.token);
  await activityCommand(db, messageOwner.token, {
    operation: "read-all",
    ownerId: messageOwner.id,
    mutationId: randomUUID(),
    boundary: prior.boundary
  });
  for (let i = 0; i < 2; i++) {
    const conv = await db.adultConversation.findUniqueOrThrow({
      where: { id: accepted.conversationId }
    });
    const body = input("send", {
      conversationId: conv.id,
      expectedVersion: conv.version,
      content: `Fictional notification message ${i}`
    });
    const receipt = await adultMessageCommand(db, sender.token, body);
    assert.deepEqual(
      await adultMessageCommand(db, sender.token, body),
      receipt
    );
  }
  await openCenter(messageOwner);
  await badge(2);
  const messageRow = rows().filter({
    has: page.locator(
      `a[href^="/platform/messages/${accepted.conversationId}?"]`
    )
  });
  await messageRow.getByText(/2 updates · 2 unread/).waitFor();
  await messageRow
    .getByRole("button", { name: "Mark group read", exact: true })
    .click();
  await badge(0);
  await page
    .locator('[aria-label="2 unread message or request alerts"]')
    .waitFor();
  const state = await db.adultConversationState.findUnique({
    where: {
      conversationId_ownerId: {
        conversationId: accepted.conversationId,
        ownerId: messageOwner.id
      }
    }
  });
  assert.equal(state?.readThrough ?? 0, 0);
  const observedRead = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/platform/messages" &&
      response.request().method() === "POST" &&
      response.request().postDataJSON()?.operation === "read"
  );
  await messageRow
    .getByRole("link", { name: "Open item", exact: true })
    .click();
  await page
    .getByLabel("Conversation", { exact: true })
    .getByText("Fictional notification message 1", { exact: true })
    .waitFor();
  assert.equal((await observedRead).ok(), true);
  assert.equal(
    (
      await db.adultConversationState.findUniqueOrThrow({
        where: {
          conversationId_ownerId: {
            conversationId: accepted.conversationId,
            ownerId: messageOwner.id
          }
        }
      })
    ).readThrough,
    2
  );
  await page.goBack();
  await page
    .locator('[aria-label="2 unread message or request alerts"]')
    .waitFor({ state: "detached" });
  await badge(0);
  ok(
    "Real contact and message actions create exact links and grouped alerts; reading notifications never falsely reads the messages"
  );

  assert.equal(
    await db.pushSubscription.count({
      where: {
        ownerId: { in: [a.id, b.id, c.id, author.id, reader.id, f.morgan.id] }
      }
    }),
    0
  );
  assert.deepEqual(errors, []);
  await page.screenshot({
    path: output + "/notifications.png",
    fullPage: true
  });
  await page.setViewportSize({ width: 320, height: 900 });
  await bounded();
  await page.screenshot({
    path: output + "/notifications-mobile.png",
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
