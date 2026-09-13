import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
const dir = process.argv[2];
assert.ok(dir, "Pass the existing isolated HTTPS fixture directory");
const config = JSON.parse(readFileSync(dir + "/browser-env.json", "utf8"));
assert.match(config.origin, /^https:\/\/127\.0\.0\.1:\d+$/);
const disabled = process.argv.includes("--disabled");
Object.assign(process.env, {
  DATABASE_URL: config.database,
  DIRECT_URL: config.database,
  ACCOUNT_ORIGIN: config.origin,
  NEXT_PUBLIC_SITE_URL: config.origin,
  ACCOUNT_TEST_ISOLATED: "1",
  ACCOUNT_DELIVERY_MODE: "test-sink",
  ACCOUNT_TEST_SINK_DIR: process.cwd() + "/" + dir + "/sink",
  AUTH_RATE_LIMIT_SECRET: "medium-fixture-only-secret-".repeat(3),
  NODE_ENV: "test",
  VERCEL: "",
  COMMUNITY_REPORTS_ENABLED: "true"
});
const { PrismaClient } = await import("@prisma/client");
const { seedPortal, assertPortalTestDatabase, seedOperatorGrants } =
  await import("../tests/seed-portal.ts");
const { adultContactCommand: command, readAdultContact: read } =
  await import("../lib/platform/adult-contact.ts");
const db = new PrismaClient();
await assertPortalTestDatabase(db);
const f = await seedPortal(db);
await seedOperatorGrants(db, f.operator, ["REVIEW_COMMUNITY_REPORTS"]);
const input = (operation, fields) => ({
  operation,
  mutationId: randomUUID(),
  ...fields
});
async function pref(actor, audience) {
  const data = await read(db, actor.token, { view: "preferences" });
  return command(
    db,
    actor.token,
    input("preferences", {
      audience,
      expectedVersion: data.preferences.version
    })
  );
}
async function request(sender, recipient, purpose) {
  const data = await read(db, sender.token, {
    view: "target",
    recipientId: recipient.id
  });
  return command(
    db,
    sender.token,
    input("create", {
      recipientId: recipient.id,
      purpose,
      expectedRecipientVersion: data.expectedRecipientVersion
    })
  );
}
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
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  args: [
    "--ignore-certificate-errors-spki-list=" +
      createHash("sha256").update(der).digest("base64")
  ]
});
const context = await browser.newContext({
  viewport: { width: 390, height: 844 }
});
const page = await context.newPage(),
  errors = [],
  bodies = [],
  requests = [],
  groups = [];
page.on("pageerror", (error) => errors.push(String(error)));
page.on("request", (req) => {
  if (new URL(req.url()).pathname === "/api/platform/messages") {
    requests.push(req.method());
    if (req.method() === "POST") bodies.push(req.postData());
  }
});
const out = dir + "/message-browser" + (disabled ? "-disabled" : "");
mkdirSync(out, { recursive: true });
const login = (actor) =>
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
const go = (path) =>
  page.goto(config.origin + path, { waitUntil: "networkidle" });
const button = (name) => page.getByRole("button", { name, exact: true });
const { adultMessageCommand: messageCommand, readAdultMessages: messageRead } =
  await import("../lib/platform/adult-messages.ts");
const { relationshipCommand } =
  await import("../lib/platform/relationships.ts");
async function pair(sender = f.memberA, recipient = f.memberB) {
  await pref(recipient, "EVERYONE");
  const row = await request(
    sender,
    recipient,
    "Fictional browser consent purpose"
  );
  await command(
    db,
    recipient.token,
    input("accept", { id: row.id, expectedVersion: row.version })
  );
  return (
    await db.adultContactRequest.findUniqueOrThrow({ where: { id: row.id } })
  ).conversationId;
}
async function sendText(id, text, actor = f.memberB) {
  const row = await db.adultConversation.findUniqueOrThrow({ where: { id } });
  return messageCommand(
    db,
    actor.token,
    input("send", {
      conversationId: id,
      expectedVersion: row.version,
      content: text
    })
  );
}
const thread = (id) => go("/platform/messages/" + id);
const ready = () =>
  page.getByRole("form", { name: "Send a message" }).waitFor();
const composer = () =>
  page.getByRole("textbox", { name: "Your message", exact: true });
const refresh = () => button("Refresh messages").click();
const until = async (work, message) => {
  for (let i = 0; i < 80; i++) {
    if (await work()) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw Error(message);
};
const block = async (a, b, value) => {
  const prior = await db.socialRelationship.findUnique({
    where: { ownerId_targetUserId: { ownerId: a.id, targetUserId: b.id } }
  });
  return relationshipCommand(
    db,
    a.token,
    input("block", {
      kind: "person",
      targetId: b.id,
      desired: value,
      expectedVersion: prior?.version ?? 0
    })
  );
};
const options = async (name) => {
  await button("Conversation options").click();
  await button(name).click();
};
try {
  const id = await pair();
  const original = await sendText(id, "Persisted fictional browser message");
  await login(f.memberA);
  await go("/platform/menu");
  const privateReads = [];
  page.on("request", (req) => {
    if (req.url().includes("/api/platform/messages?"))
      privateReads.push(new URL(req.url()).searchParams.get("view"));
  });
  await go("/platform");
  assert.equal(
    await page
      .getByRole("navigation", { name: "Platform", exact: true })
      .getByRole("link", { name: /Messages/ })
      .count(),
    1
  );
  assert.equal(
    await page
      .getByRole("navigation", { name: "Feed choices" })
      .getByRole("link", { name: "My feed" })
      .count(),
    1
  );
  assert.ok(
    privateReads.every((v) => v === "activity"),
    "Outside Messages navigation fetches scalar activity only"
  );
  const resources = await page.evaluate(() =>
    performance.getEntriesByType("resource").map((e) => e.name)
  );
  const manifest = JSON.parse(
    readFileSync(".next/app-build-manifest.json", "utf8")
  );
  const chunks = manifest.pages["/platform/messages/page"].filter(
    (file) =>
      file.endsWith(".js") &&
      existsSync(".next/" + file) &&
      readFileSync(".next/" + file, "utf8").includes("Retry same action")
  );
  assert.ok(
    chunks.length &&
      chunks.every((file) => !resources.some((url) => url.includes(file)))
  );
  groups.push(
    "five visible nav destinations; Home retains My feed; scalar-only activity and no message workspace chunk outside Messages"
  );
  await go("/platform/profile/" + f.memberB.username);
  await page.getByRole("link", { name: "Message", exact: true }).click();
  await page.waitForURL("**/platform/messages/" + id);
  await ready();
  await page
    .getByText("Persisted fictional browser message", { exact: true })
    .waitFor();
  assert.equal(
    await db.adultConversation.count({
      where: {
        OR: [{ participantAId: f.memberA.id }, { participantBId: f.memberA.id }]
      }
    }),
    1
  );
  groups.push(
    "profile Message resumes canonical accepted conversation and real persisted history"
  );
  if (disabled) {
    assert.equal(await button("Send message").isDisabled(), true);
    await composer().fill("Fictional text held while operations paused");
    assert.equal(await button("Send message").isDisabled(), true);
    await button("Discard unsent text").click();
    await options("Mute conversation");
    await until(
      async () =>
        !!(
          await db.adultConversationState.findUnique({
            where: {
              conversationId_ownerId: {
                conversationId: id,
                ownerId: f.memberA.id
              }
            }
          })
        )?.muted,
      "Paused mute saves"
    );
    await options("Archive conversation");
    await until(
      async () =>
        !!(
          await db.adultConversationState.findUnique({
            where: {
              conversationId_ownerId: {
                conversationId: id,
                ownerId: f.memberA.id
              }
            }
          })
        )?.archivedAt,
      "Paused archive saves"
    );
    groups.push(
      "paused sending is unavailable with retained editable text; personal mute/archive remain effective"
    );
    await go("/platform/messages?archived=true");
    await page.getByRole("link", { name: /Persisted fictional/ }).waitFor();
    groups.push(
      "archived history remains recoverable while operations are paused"
    );
  } else {
    await composer().fill("Fictional browser new send");
    await button("Send message").click();
    await page
      .getByText("Sent — saved in this conversation.", { exact: true })
      .waitFor();
    await page
      .getByText("Fictional browser new send", { exact: true })
      .waitFor();
    assert.equal(await composer().inputValue(), "");
    assert.equal(
      await db.adultMessage.count({
        where: { conversationId: id, content: "Fictional browser new send" }
      }),
      1
    );
    await page.reload();
    await ready();
    await page
      .getByText("Fictional browser new send", { exact: true })
      .waitFor();
    groups.push(
      "text send persisted once, server confirmation clears composer, reload retains history"
    );
    let lost = true;
    await page.route("**/api/platform/messages", async (route) => {
      const body = JSON.parse(route.request().postData() ?? "{}");
      if (body.operation === "send" && lost) {
        lost = false;
        await route.fetch();
        await route.abort("failed");
      } else await route.continue();
    });
    await composer().fill("Fictional uncertain send");
    await button("Send message").click();
    await button("Retry same action").waitFor();
    await until(
      async () => !(await button("Retry same action").isDisabled()),
      "Exact retry ready after failed response"
    );
    const frozen = bodies
      .filter((b) => JSON.parse(b).operation === "send")
      .at(-1);
    assert.equal(await composer().isDisabled(), true);
    await button("Retry same action").click();
    await page
      .getByText("Sent — saved in this conversation.", { exact: true })
      .waitFor();
    assert.equal(
      bodies.filter((b) => JSON.parse(b).operation === "send").at(-1),
      frozen
    );
    assert.equal(
      await db.adultMessage.count({
        where: { conversationId: id, content: "Fictional uncertain send" }
      }),
      1
    );
    await page.unroute("**/api/platform/messages");
    groups.push(
      "lost committed send keeps frozen exact retry and produces one canonical message"
    );
    let switchOnce = true;
    await page.route("**/api/platform/messages", async (route) => {
      const body = JSON.parse(route.request().postData() ?? "{}");
      if (body.operation === "send" && switchOnce) {
        switchOnce = false;
        const response = await route.fetch();
        await login(f.memberB);
        await route.fulfill({ response });
      } else await route.continue();
    });
    await composer().fill("Fictional account-change retry");
    await button("Send message").click();
    await page
      .getByText(
        "Sign in with the original account and refresh to view these messages."
      )
      .waitFor();
    assert.equal(await composer().count(), 0);
    assert.equal(
      await page
        .getByText("Persisted fictional browser message", { exact: true })
        .count(),
      0
    );
    await login(f.memberA);
    await refresh();
    await ready();
    await button("Retry same action").click();
    await page
      .getByText("Sent — saved in this conversation.", { exact: true })
      .waitFor();
    assert.equal(
      await db.adultMessage.count({
        where: { conversationId: id, content: "Fictional account-change retry" }
      }),
      1
    );
    await page.unroute("**/api/platform/messages");
    groups.push(
      "post-commit account replacement conceals history/text and original owner recovers one exact send"
    );
    await composer().fill("Fictional unsent Back guard");
    await page
      .getByRole("link", { name: "Back to Messages", exact: true })
      .click();
    assert.equal(new URL(page.url()).pathname, "/platform/messages/" + id);
    await page
      .getByText("Send, retry or discard your unsent work before leaving.")
      .waitFor();
    await button("Discard unsent text").click();
    await options("Mute conversation");
    await until(
      async () =>
        !!(
          await db.adultConversationState.findUnique({
            where: {
              conversationId_ownerId: {
                conversationId: id,
                ownerId: f.memberA.id
              }
            }
          })
        )?.muted,
      "Mute saved"
    );
    await options("Archive conversation");
    await until(
      async () =>
        !!(
          await db.adultConversationState.findUnique({
            where: {
              conversationId_ownerId: {
                conversationId: id,
                ownerId: f.memberA.id
              }
            }
          })
        )?.archivedAt,
      "Archive saved"
    );
    await go("/platform/messages?archived=true");
    await page
      .getByRole("link", { name: /Fictional account-change retry/ })
      .waitFor();
    await sendText(id, "Fictional incoming unarchives");
    await go("/platform/messages");
    await page
      .getByRole("link", { name: /Fictional incoming unarchives/ })
      .waitFor();
    const state = await db.adultConversationState.findUniqueOrThrow({
      where: {
        conversationId_ownerId: { conversationId: id, ownerId: f.memberA.id }
      }
    });
    assert.equal(state.archivedAt, null);
    assert.equal(state.muted, true);
    groups.push(
      "unsent Back guard, explicit discard, own mute/archive and new incoming restore without unmuting"
    );
    await thread(id);
    await ready();
    await options("Unmute conversation");
    await until(
      async () =>
        !(
          await db.adultConversationState.findUniqueOrThrow({
            where: {
              conversationId_ownerId: {
                conversationId: id,
                ownerId: f.memberA.id
              }
            }
          })
        ).muted,
      "Unmute saved"
    );
    const start = (
      await db.adultConversation.findUniqueOrThrow({ where: { id } })
    ).lastSequence;
    await db.adultMessage.createMany({
      data: Array.from({ length: 110 }, (_, i) => ({
        id: randomUUID(),
        conversationId: id,
        senderId: f.memberB.id,
        sequence: start + i + 1,
        content: "Fictional long history " + (i + 1)
      }))
    });
    await db.adultConversation.update({
      where: { id },
      data: { lastSequence: start + 110 }
    });
    await page.reload();
    await ready();
    await page
      .getByText("Fictional long history 110", { exact: true })
      .waitFor();
    await page
      .getByText("Fictional long history 110", { exact: true })
      .scrollIntoViewIfNeeded();
    await until(
      async () =>
        (
          await db.adultConversationState.findUniqueOrThrow({
            where: {
              conversationId_ownerId: {
                conversationId: id,
                ownerId: f.memberA.id
              }
            }
          })
        ).readThrough ===
        start + 110,
      "Visible end advances read"
    );
    await page.locator(".gc-message-history").evaluate((el) => {
      el.scrollTop = 0;
      el.dispatchEvent(new Event("scroll", { bubbles: true }));
    });
    const missed = await sendText(id, "Fictional reconnect unseen");
    await refresh();
    await button("Newer messages").waitFor();
    assert.equal(
      (
        await db.adultConversationState.findUniqueOrThrow({
          where: {
            conversationId_ownerId: {
              conversationId: id,
              ownerId: f.memberA.id
            }
          }
        })
      ).readThrough,
      start + 110
    );
    assert.equal(
      await page
        .getByText("Fictional reconnect unseen", { exact: true })
        .count(),
      0
    );
    await button("Newer messages").click();
    await page
      .getByText("Fictional reconnect unseen", { exact: true })
      .waitFor();
    await page
      .getByText("Fictional reconnect unseen", { exact: true })
      .scrollIntoViewIfNeeded();
    await until(
      async () =>
        (
          await db.adultConversationState.findUniqueOrThrow({
            where: {
              conversationId_ownerId: {
                conversationId: id,
                ownerId: f.memberA.id
              }
            }
          })
        ).readThrough === missed.version,
      "Visible catchup advances read"
    );
    groups.push(
      "bounded history and canonical catch-up keep unseen messages unread until rendered in view"
    );
    await go("/platform/messages/" + id + "?message=" + original.id);
    await ready();
    await page
      .getByText("Persisted fictional browser message", { exact: true })
      .waitFor();
    const first = page.locator("#message-" + original.id);
    await first.getByRole("button", { name: "Message options" }).click();
    await page
      .getByRole("link", { name: "Report this message", exact: true })
      .click();
    await page
      .getByRole("heading", { name: /Report/ })
      .first()
      .waitFor();
    assert.equal(new URL(page.url()).searchParams.get("targetId"), original.id);
    groups.push(
      "old selected-message link loads authorized window and contextual Report targets one item"
    );
    await thread(id);
    await ready();
    await composer().fill("Fictional blocked unsent text");
    await block(f.memberB, f.memberA, true);
    await button("Send message").click();
    await until(
      async () =>
        (await page
          .getByRole("textbox", { name: "Retained unsent message" })
          .count()) === 1,
      "Stale block hides current controls"
    );
    assert.equal(
      await db.adultMessage.count({
        where: { conversationId: id, content: "Fictional blocked unsent text" }
      }),
      0
    );
    await refresh();
    await ready();
    assert.equal(await button("Send message").isDisabled(), true);
    assert.equal(
      await composer().inputValue(),
      "Fictional blocked unsent text"
    );
    await button("Discard unsent text").click();
    assert.equal(
      await page
        .getByRole("link", { name: f.memberB.name, exact: true })
        .count(),
      0
    );
    groups.push(
      "mid-conversation block denies next send, retains unsent text and removes live profile identity"
    );
    await block(f.memberB, f.memberA, false);
    await thread(id);
    await ready();
    page.once("dialog", (dialog) => dialog.accept());
    await options("Clear this history for me");
    await until(
      async () =>
        (
          await db.adultConversationState.findUniqueOrThrow({
            where: {
              conversationId_ownerId: {
                conversationId: id,
                ownerId: f.memberA.id
              }
            }
          })
        ).hiddenThrough > 0,
      "Clear for me saved"
    );
    const remaining = await messageRead(db, f.memberB.token, {
      view: "conversation",
      conversationId: id
    });
    assert.ok(remaining.messages.length);
    groups.push(
      "clear-for-me advances only own prefix and retains the other participant’s history"
    );
    const renewed = await pair();
    assert.equal(renewed, id);
    await sendText(id, "Fictional history after fresh consent. ".repeat(20));
    groups.push(
      "new explicit acceptance after unblock resumes the same conversation without restoring cleared history"
    );
  }
  await login(f.memberA);
  const policy = (
    await db.platformUser.findUniqueOrThrow({ where: { id: f.memberA.id } })
  ).adultPolicyVersion;
  const people = Array.from({ length: 14 }, () => randomUUID());
  await db.platformUser.createMany({
    data: people.map((id, i) => ({
      id,
      name: `Fictional inbox ${i}`,
      username: "msg" + id.replaceAll("-", "").slice(0, 20),
      email: id + "@example.test",
      emailVerifiedAt: new Date(),
      adultAcknowledgedAt: new Date(),
      adultPolicyVersion: policy
    }))
  });
  const rows = people.map((other, i) => ({
    id: randomUUID(),
    participantAId: other < f.memberA.id ? other : f.memberA.id,
    participantBId: other < f.memberA.id ? f.memberA.id : other,
    sendingAllowed: true,
    updatedAt: new Date(Date.now() + i * 1000)
  }));
  await db.adultConversation.createMany({ data: rows });
  const expectedInbox = (
    await messageRead(db, f.memberA.token, { view: "inbox" })
  ).conversations.length;
  await go("/platform/messages");
  await page.locator(".gc-conversation-link").last().waitFor();
  await page.locator(".gc-conversation-link").last().scrollIntoViewIfNeeded();
  const position = await page
    .locator(".gc-message-list")
    .evaluate((el) => el.scrollTop);
  assert.ok(position > 100);
  await page.locator(".gc-conversation-link").last().click();
  await ready();
  await page
    .getByRole("link", { name: "Back to Messages", exact: true })
    .click();
  await until(
    async () =>
      (await page.locator(".gc-conversation-link").count()) === expectedInbox,
    "Inbox returns"
  );
  await until(
    async () =>
      Math.abs(
        (await page
          .locator(".gc-message-list")
          .evaluate((el) => el.scrollTop)) - position
      ) < 3,
    "Mobile inbox position restored"
  );
  groups.push(
    "mobile Back restores the existing inbox scroll position without storing message text"
  );
  await page
    .locator("summary")
    .filter({ hasText: "In-app alert choices" })
    .click();
  const requestsChoice = page.getByRole("checkbox", {
    name: "Contact request alerts",
    exact: true
  });
  await requestsChoice.click();
  await page
    .getByText(
      "Your in-app alert choices are saved. Email and push are unchanged.",
      { exact: true }
    )
    .waitFor();
  assert.equal(
    (
      await db.socialPreferences.findUniqueOrThrow({
        where: { ownerId: f.memberA.id }
      })
    ).requestAlerts,
    false
  );
  assert.equal(
    (
      await db.socialPreferences.findUniqueOrThrow({
        where: { ownerId: f.memberA.id }
      })
    ).contactRequests,
    "NOBODY"
  );
  groups.push(
    "in-app alert UI persists its independent choice without changing contact permission"
  );
  await page.setViewportSize({ width: 1440, height: 1000 });
  await thread(id);
  await ready();
  await until(
    async () =>
      (await page.locator(".gc-conversation-link").count()) === expectedInbox,
    "Desktop inbox and thread loaded together"
  );
  assert.ok(
    await page
      .getByRole("complementary", { name: "Conversation inbox" })
      .isVisible()
  );
  await page.screenshot({ path: out + "/desktop.png", fullPage: true });
  groups.push(
    "desktop list and conversation panes use one authorized bounded workspace read"
  );
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await page.reload();
    await ready();
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1
      )
    );
    await composer().scrollIntoViewIfNeeded();
    await page.screenshot({
      path: out + `/mobile-${width}.png`,
      fullPage: true
    });
  }
  await page
    .getByRole("combobox", { name: "Appearance", exact: true })
    .selectOption("dark");
  await page.evaluate(() => {
    document.querySelectorAll(".platform-design").forEach((el) => {
      el.dataset.appearance = "dark";
      el.dataset.readerSize = "largest";
    });
  });

  await page.setViewportSize({ width: 390, height: 550 });
  await composer().scrollIntoViewIfNeeded();
  await composer().focus();
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1
    )
  );
  assert.equal(
    await page
      .locator(".gc-message-columns")
      .evaluate((el) => getComputedStyle(el).backgroundColor),
    "rgb(31, 43, 36)"
  );
  await page.screenshot({
    path: out + "/dark-large-keyboard.png",
    fullPage: true
  });
  await button("Conversation options").focus();
  await page.keyboard.press("Enter");
  await page.getByRole("dialog", { name: "Conversation options" }).waitFor();
  await page.keyboard.press("Escape");
  assert.equal(
    await page.getByRole("dialog", { name: "Conversation options" }).count(),
    0
  );
  groups.push(
    "320/390/1440 reflow, dark largest text, reduced keyboard viewport and Escape focus pass"
  );
  if (!disabled) {
    const active = rows[0].id;
    await thread(active);
    await ready();
    await composer().fill("Fictional conflict kept");
    await db.adultConversation.update({
      where: { id: active },
      data: { version: { increment: 1 } }
    });
    await button("Send message").click();
    await page
      .getByRole("textbox", { name: "Retained unsent message" })
      .waitFor();
    await refresh();
    await ready();
    await button("Use current access").click();
    assert.equal(await composer().inputValue(), "Fictional conflict kept");
    await button("Send message").click();
    await page
      .getByText("Sent — saved in this conversation.", { exact: true })
      .waitFor();
    assert.equal(
      await db.adultMessage.count({
        where: { conversationId: active, content: "Fictional conflict kept" }
      }),
      1
    );
    groups.push(
      "version conflict retains text until explicit current-access review, then sends once"
    );
    await composer().fill("Fictional update-guard text");
    await page.route("**/api/platform/release", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ release: "f".repeat(40) })
      })
    );
    await button("Check for updates").click();
    await page.locator('[data-update-decision="keep-work"]').waitFor();
    assert.equal(await button("Refresh now").count(), 0);
    assert.equal(await composer().inputValue(), "Fictional update-guard text");
    await button("Discard unsent text").click();
    await page.unroute("**/api/platform/release");
    groups.push(
      "safe update notice cannot refresh away an unsent private message"
    );
    await pref(f.contact, "EVERYONE");
    await go("/platform/profile/" + f.contact.username);
    await page.getByRole("link", { name: "Message", exact: true }).click();
    await page
      .getByRole("textbox", { name: "Request purpose" })
      .fill("Fictional complete profile request");
    await button("Send contact request").click();
    await page.getByRole("link", { name: "View saved request" }).waitFor();
    const created = await db.adultContactRequest.findFirstOrThrow({
      where: {
        senderId: f.memberA.id,
        recipientId: f.contact.id,
        purpose: "Fictional complete profile request"
      }
    });
    await login(f.contact);
    await go("/platform/messages/requests?id=" + created.id);
    await button("Accept request").click();
    await page
      .getByRole("link", { name: "Open conversation", exact: true })
      .waitFor();
    await page
      .getByRole("link", { name: "Open conversation", exact: true })
      .click();
    await ready();
    const opened = (
      await db.adultContactRequest.findUniqueOrThrow({
        where: { id: created.id }
      })
    ).conversationId;
    assert.equal(new URL(page.url()).pathname, "/platform/messages/" + opened);
    await composer().fill("Fictional complete recipient reply");
    await button("Send message").click();
    await page
      .getByText("Sent — saved in this conversation.", { exact: true })
      .waitFor();
    await login(f.memberA);
    await go("/platform/messages");
    await page
      .getByRole("link", { name: /Fictional complete recipient reply/ })
      .click();
    await ready();
    await page
      .getByText("Fictional complete recipient reply", { exact: true })
      .waitFor();
    assert.equal(new URL(page.url()).pathname, "/platform/messages/" + opened);
    assert.equal(
      await db.adultMessage.count({
        where: {
          conversationId: opened,
          content: "Fictional complete recipient reply"
        }
      }),
      1
    );
    groups.push(
      "two browser accounts complete profile request, recipient acceptance, one conversation, send and persistent inbox resume"
    );
  }
  await context.clearCookies();
  await go("/platform/messages");
  assert.equal(
    await page.getByRole("heading", { name: "Messages", exact: true }).count(),
    0
  );
  assert.equal(
    await page
      .getByText("Persisted fictional browser message", { exact: true })
      .count(),
    0
  );
  groups.push("signed-out entry shows account prompt without private messages");
  assert.deepEqual(errors, []);
  writeFileSync(
    out + "/result.json",
    JSON.stringify({ groups, errors, disabled }, null, 2)
  );
  console.log(
    JSON.stringify(
      { passed: groups.length, groups, pageErrors: errors.length, disabled },
      null,
      2
    )
  );
} catch (error) {
  await page.screenshot({ path: out + "/failure.png", fullPage: true });
  writeFileSync(
    out + "/failure.txt",
    String(error) + "\n" + (await page.locator("body").innerText())
  );
  throw error;
} finally {
  await browser.close();
  await db.$disconnect();
}
