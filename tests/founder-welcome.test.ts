import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import {
  createPortalActor,
  assertPortalTestDatabase,
  seedOperatorGrants
} from "./seed-portal";
import { deliverFounderWelcome } from "../lib/platform/founder-welcome";
import {
  FOUNDER_WELCOME_BODY,
  FOUNDER_WELCOME_LABEL
} from "../lib/platform/founder-welcome-content";
import {
  adultMessageCommand,
  readAdultMessages
} from "../lib/platform/adult-messages";
import { relationshipCommand } from "../lib/platform/relationships";
import {
  dispatchPendingFounderWelcomes,
  scheduleFounderWelcome
} from "../lib/platform/founder-welcome-queue";
import { loginAccount } from "../lib/platform/accounts";
const db = new PrismaClient();
const names = [
  "FOUNDER_WELCOME_ENABLED",
  "FOUNDER_ACCOUNT_ID",
  "COMMUNITY_REPORTS_ENABLED",
  "PUSH_ENABLED"
];
const prior = Object.fromEntries(names.map((k) => [k, process.env[k]]));
let founder: Awaited<ReturnType<typeof createPortalActor>>,
  existing: typeof founder;
before(async () => {
  await assertPortalTestDatabase(db);
  process.env.FOUNDER_WELCOME_ENABLED = "false";
  founder = await createPortalActor(db, "founder");
  existing = await createPortalActor(db, "oldmember");
  await seedOperatorGrants(db, founder, ["REVIEW_COMMUNITY_REPORTS"]);
  Object.assign(process.env, {
    FOUNDER_WELCOME_ENABLED: "true",
    FOUNDER_ACCOUNT_ID: founder.id,
    COMMUNITY_REPORTS_ENABLED: "true",
    PUSH_ENABLED: "false"
  });
});
after(async () => {
  for (const k of names)
    if (prior[k] === undefined) delete process.env[k];
    else process.env[k] = prior[k];
  await db.$disconnect();
});
const command = (operation: string, fields: Record<string, unknown> = {}) => ({
  operation,
  mutationId: randomUUID(),
  ...fields
});
async function welcomed() {
  const member = await createPortalActor(db, "welcomed");
  await db.socialPreferences.create({
    data: {
      ownerId: member.id,
      contactRequests: "NOBODY",
      founderAnnouncements: false
    }
  });
  const delivered = await deliverFounderWelcome(db, member.id);
  assert.equal(delivered.status, "delivered");
  const welcome = await db.founderWelcome.findUniqueOrThrow({
    where: { recipientId: member.id }
  });
  const row = await db.adultConversation.findUniqueOrThrow({
    where: { id: welcome.conversationId }
  });
  return { member, welcome, row };
}
test("only new eligible accounts receive one exact approved canonical welcome across concurrent retries and repeated logins", async () => {
  assert.equal(
    (await deliverFounderWelcome(db, existing.id)).status,
    "ineligible"
  );
  const member = await createPortalActor(db, "onceonly");
  const results = await Promise.all([
    deliverFounderWelcome(db, member.id),
    deliverFounderWelcome(db, member.id),
    deliverFounderWelcome(db, member.id)
  ]);
  assert.equal(results.filter((r) => r.status === "delivered").length, 1);
  const welcome = await db.founderWelcome.findUniqueOrThrow({
    where: { recipientId: member.id },
    include: { message: true, conversation: true }
  });
  assert.equal(welcome.message!.content, FOUNDER_WELCOME_BODY);
  assert.equal(
    FOUNDER_WELCOME_LABEL,
    "Automatic welcome from Andrew. Replies go directly to him."
  );
  assert.equal(
    createHash("sha256").update(FOUNDER_WELCOME_BODY).digest("hex"),
    "755254c9da06c9d529073d0e1569a38bff0a9ceaa24c15354ba9eba6f852fee5"
  );
  assert.equal(welcome.conversation.sendingAllowed, false);
  assert.equal(
    (await db.platformUser.findUniqueOrThrow({ where: { id: member.id } }))
      .pendingFounderWelcomeAt,
    null
  );
  await loginAccount(db, member.email, member.password, null);
  assert.equal(
    (await deliverFounderWelcome(db, member.id)).status,
    "already-sent"
  );
  assert.equal(
    await db.adultMessage.count({
      where: { conversationId: welcome.conversationId }
    }),
    1
  );
  assert.equal(
    await db.socialEvent.count({ where: { messageId: welcome.messageId } }),
    1
  );
});
test("welcome is initially unread to its member but absent from founder main inbox; explicit reply preserves NOBODY and surfaces canonical history", async () => {
  const { member, welcome, row } = await welcomed();
  const memberView = await readAdultMessages(db, member.token, {
    view: "conversation",
    conversationId: row.id
  });
  assert.equal(memberView.conversation!.unread, 1);
  assert.equal(memberView.conversation!.welcome!.canReply, true);
  assert.equal(memberView.conversation!.sendingAllowed, false);
  assert.equal(
    (await readAdultMessages(db, member.token, { view: "activity" })).activity!
      .messageAlerts,
    1
  );
  assert.ok(
    !(await readAdultMessages(db, founder.token, {})).conversations!.some(
      (c) => c.id === row.id
    )
  );
  assert.ok(
    (
      await readAdultMessages(db, founder.token, { filter: "sent-welcomes" })
    ).conversations!.some((c) => c.id === row.id)
  );
  const input = command("send", {
    conversationId: row.id,
    expectedVersion: row.version,
    content: "How can I serve locally?"
  });
  await assert.rejects(
    adultMessageCommand(db, member.token, input),
    /unavailable/
  );
  await assert.rejects(
    adultMessageCommand(db, founder.token, { ...input, welcomeReply: true }),
    /no longer open/
  );
  const consent = { ...input, welcomeReply: true };
  const sent = await adultMessageCommand(db, member.token, consent);
  assert.deepEqual(await adultMessageCommand(db, member.token, consent), sent);
  assert.ok(
    (await db.founderWelcome.findUniqueOrThrow({ where: { id: welcome.id } }))
      .replyConsentAt
  );
  const choices = await db.socialPreferences.findUniqueOrThrow({
    where: { ownerId: member.id }
  });
  assert.equal(choices.contactRequests, "NOBODY");
  assert.equal(choices.founderAnnouncements, false);
  assert.equal(
    await db.platformFollow.count({
      where: { OR: [{ followerId: member.id }, { followingId: member.id }] }
    }),
    0
  );
  assert.equal(
    await db.socialRelationship.count({
      where: { OR: [{ ownerId: member.id }, { targetUserId: member.id }] }
    }),
    0
  );
  for (const filter of ["all", "welcome-replies", "unanswered"])
    assert.ok(
      (
        await readAdultMessages(db, founder.token, { filter })
      ).conversations!.some((c) => c.id === row.id)
    );
  const founderView = await readAdultMessages(db, founder.token, {
    view: "conversation",
    conversationId: row.id
  });
  assert.equal(founderView.messages!.at(-1)!.id, sent.id);
  assert.equal(founderView.conversation!.welcome!.unanswered, true);
  await adultMessageCommand(
    db,
    founder.token,
    command("read", {
      conversationId: row.id,
      expectedVersion: 0,
      through: sent.id
    })
  );
  assert.ok(
    (
      await readAdultMessages(db, founder.token, { filter: "unanswered" })
    ).conversations!.some((c) => c.id === row.id)
  );
  await adultMessageCommand(
    db,
    founder.token,
    command("send", {
      conversationId: row.id,
      expectedVersion: founderView.conversation!.version,
      content: "I would love to hear more."
    })
  );
  assert.ok(
    !(
      await readAdultMessages(db, founder.token, { filter: "unanswered" })
    ).conversations!.some((c) => c.id === row.id)
  );
  await assert.rejects(
    readAdultMessages(db, member.token, { filter: "welcome-replies" }),
    /only available/
  );
});
test("a block before first reply permanently retires the welcome exception, including after unblock", async () => {
  const { member, row } = await welcomed();
  const input = command("block", {
    kind: "person",
    targetId: founder.id,
    desired: true,
    expectedVersion: 0
  });
  const blocked = await relationshipCommand(db, member.token, input);
  await relationshipCommand(
    db,
    member.token,
    command("block", {
      kind: "person",
      targetId: founder.id,
      desired: false,
      expectedVersion: blocked.version
    })
  );
  const view = await readAdultMessages(db, member.token, {
    view: "conversation",
    conversationId: row.id
  });
  assert.equal(view.conversation!.welcome!.canReply, false);
  await assert.rejects(
    adultMessageCommand(
      db,
      member.token,
      command("send", {
        conversationId: row.id,
        expectedVersion: view.conversation!.version,
        content: "Not consented",
        welcomeReply: true
      })
    ),
    /no longer open/
  );
});
test("unverified/underage/restricted accounts and missing founder authorization cannot activate a welcome; signup and pending work survive outages", async () => {
  for (const options of [{ verified: false }, { adult: false }]) {
    const member = await createPortalActor(db, "ineligible", options);
    assert.equal(
      (await deliverFounderWelcome(db, member.id)).status,
      "ineligible"
    );
    assert.equal(
      await db.founderWelcome.count({ where: { recipientId: member.id } }),
      0
    );
  }
  const member = await createPortalActor(db, "outage");
  process.env.FOUNDER_ACCOUNT_ID = "missing-verified-founder";
  assert.equal(
    (await deliverFounderWelcome(db, member.id)).status,
    "unavailable"
  );
  assert.deepEqual(
    await dispatchPendingFounderWelcomes(db, member.id, async () => {
      throw Error("Fixture queue offline");
    }),
    { queued: 0, failed: 1 }
  );
  assert.ok(
    (await db.platformUser.findUniqueOrThrow({ where: { id: member.id } }))
      .pendingFounderWelcomeAt
  );
  assert.doesNotThrow(() =>
    scheduleFounderWelcome(db, member.token, () => {
      throw Error("Fixture post-response unavailable");
    })
  );
  process.env.FOUNDER_ACCOUNT_ID = founder.id;
  await db.platformOperatorGrant.updateMany({
    where: { userId: founder.id },
    data: { revokedAt: new Date() }
  });
  assert.equal(
    (await deliverFounderWelcome(db, member.id)).status,
    "unavailable"
  );
  await db.platformOperatorGrant.updateMany({
    where: { userId: founder.id },
    data: { revokedAt: null }
  });
  const queued: string[] = [];
  assert.deepEqual(
    await dispatchPendingFounderWelcomes(db, member.id, async (id) => {
      queued.push(id);
    }),
    { queued: 1, failed: 0 }
  );
  assert.deepEqual(queued, [member.id]);
  assert.equal(
    (await deliverFounderWelcome(db, member.id)).status,
    "delivered"
  );
  const restricted = await createPortalActor(db, "restrict");
  await db.platformUser.update({
    where: { id: restricted.id },
    data: { deactivatedAt: new Date() }
  });
  assert.equal(
    (await db.platformUser.findUniqueOrThrow({ where: { id: restricted.id } }))
      .pendingFounderWelcomeAt,
    null
  );
});
test("clear/purge never causes welcome replay; consent, mapping and revocation receipts cannot be rewritten", async () => {
  const { member, row, welcome } = await welcomed();
  await adultMessageCommand(
    db,
    member.token,
    command("clear", {
      conversationId: row.id,
      expectedVersion: 0,
      through: welcome.messageId
    })
  );
  assert.equal(
    (
      await readAdultMessages(db, member.token, {
        view: "conversation",
        conversationId: row.id
      })
    ).conversation!.welcome!.canReply,
    false
  );
  await db.adultMessage.delete({ where: { id: welcome.messageId! } });
  assert.equal(
    (await deliverFounderWelcome(db, member.id)).status,
    "already-sent"
  );
  assert.equal(
    (await db.founderWelcome.findUniqueOrThrow({ where: { id: welcome.id } }))
      .messageId,
    null
  );
  await assert.rejects(
    db.founderWelcome.update({
      where: { id: welcome.id },
      data: { founderId: existing.id }
    })
  );
  await db.founderWelcome.update({
    where: { id: welcome.id },
    data: { revokedAt: new Date() }
  });
  await assert.rejects(
    db.founderWelcome.update({
      where: { id: welcome.id },
      data: { revokedAt: null }
    })
  );
});
test("welcome and reply use the existing outbox; provider failure never loses or duplicates the reply", async () => {
  const webpush = (await import("web-push")).default;
  const { createECDH, randomBytes } = await import("node:crypto");
  const { createSessionToken } = await import("../lib/platform/auth");
  const { pushSubscriptionCommand } =
    await import("../lib/platform/push-subscriptions");
  const { deliverNotification, openNotification } =
    await import("../lib/platform/notification-outbox");
  const keys = webpush.generateVAPIDKeys();
  const names = [
    "PUSH_VAPID_PUBLIC_KEY",
    "PUSH_VAPID_PRIVATE_KEY",
    "PUSH_VAPID_SUBJECT"
  ];
  const old = Object.fromEntries(names.map((k) => [k, process.env[k]]));
  Object.assign(process.env, {
    PUSH_ENABLED: "true",
    PUSH_VAPID_PUBLIC_KEY: keys.publicKey,
    PUSH_VAPID_PRIVATE_KEY: keys.privateKey,
    PUSH_VAPID_SUBJECT: "https://example.test/contact"
  });
  try {
    const member = await createPortalActor(db, "welcomepush");
    for (const actor of [member, founder]) {
      const pair = createECDH("prime256v1");
      pair.generateKeys();
      await pushSubscriptionCommand(
        db,
        actor.token,
        command("subscribe", {
          ownerId: actor.id,
          binding: createSessionToken(),
          label: "Fixture welcome device",
          subscription: {
            endpoint: "https://fcm.googleapis.com/fcm/send/" + randomUUID(),
            keys: {
              p256dh: pair.getPublicKey().toString("base64url"),
              auth: randomBytes(16).toString("base64url")
            }
          }
        })
      );
      await db.socialPreferences.upsert({
        where: { ownerId: actor.id },
        create: { ownerId: actor.id, pushCategories: ["messages"] },
        update: { pushCategories: ["messages"] }
      });
    }
    await deliverFounderWelcome(db, member.id);
    const welcome = await db.founderWelcome.findUniqueOrThrow({
      where: { recipientId: member.id },
      include: { conversation: true }
    });
    const notification = await db.notificationDelivery.findFirstOrThrow({
      where: { ownerId: member.id, event: { messageId: welcome.messageId } }
    });
    assert.equal(
      (await openNotification(db, member.token, notification.id)).href,
      `/platform/messages/${welcome.conversationId}?message=${welcome.messageId}`
    );
    let preview = "";
    await deliverNotification(db, notification.id, async (_sub, payload) => {
      preview = JSON.stringify(payload);
      return 201;
    });
    assert.doesNotMatch(preview, /Andrew|mustard|Matthew|Fictional/);
    const input = command("send", {
      conversationId: welcome.conversationId,
      expectedVersion: welcome.conversation.version,
      content: "A private welcome reply",
      welcomeReply: true
    });
    const sent = await adultMessageCommand(db, member.token, input);
    const reply = await db.notificationDelivery.findFirstOrThrow({
      where: { ownerId: founder.id, event: { messageId: sent.id } }
    });
    await deliverNotification(db, reply.id, async () => 503);
    assert.deepEqual(await adultMessageCommand(db, member.token, input), sent);
    assert.equal(
      await db.adultMessage.count({
        where: { conversationId: welcome.conversationId, kind: "TEXT" }
      }),
      1
    );
    assert.equal(
      await db.notificationDelivery.count({
        where: { eventId: reply.eventId }
      }),
      1
    );
    assert.equal(
      (await openNotification(db, founder.token, reply.id)).href,
      `/platform/messages/${welcome.conversationId}?message=${sent.id}`
    );
  } finally {
    process.env.PUSH_ENABLED = "false";
    for (const k of names)
      if (old[k] === undefined) delete process.env[k];
      else process.env[k] = old[k];
  }
});
test("founder filters run before pagination and automatic announcements never answer a personal reply", async () => {
  const { member, row } = await welcomed();
  const reply = await adultMessageCommand(
    db,
    member.token,
    command("send", {
      conversationId: row.id,
      expectedVersion: row.version,
      content: "Waiting for a personal answer",
      welcomeReply: true
    })
  );
  // Fixture-only marker; no campaign or real recipient send.
  await db.$transaction(async (tx) => {
    const current = await tx.adultConversation.update({
      where: { id: row.id },
      data: { lastSequence: { increment: 1 } }
    });
    await tx.adultMessage.create({
      data: {
        conversationId: row.id,
        senderId: founder.id,
        sequence: current.lastSequence,
        content: "Fixture automatic announcement",
        kind: "FOUNDER_ANNOUNCEMENT"
      }
    });
  });
  const { ADULT_POLICY } = await import("../lib/platform/portal-types");
  for (let i = 0; i < 32; i++) {
    const id = randomUUID();
    await db.platformUser.create({
      data: {
        id,
        username: "fw_" + id.replaceAll("-", "").slice(0, 18),
        name: "Fixture silent welcome",
        email: id + "@example.test",
        adultAcknowledgedAt: new Date(),
        adultPolicyVersion: ADULT_POLICY,
        emailVerifiedAt: new Date(),
        pendingFounderWelcomeAt: new Date()
      }
    });
    await deliverFounderWelcome(db, id);
  }
  for (const filter of ["all", "welcome-replies", "unanswered"])
    assert.ok(
      (
        await readAdultMessages(db, founder.token, { filter })
      ).conversations!.some((c) => c.id === row.id)
    );
  const first = await readAdultMessages(db, founder.token, {
    filter: "sent-welcomes"
  });
  assert.equal(first.conversations!.length, 30);
  assert.ok(first.after);
  const next = await readAdultMessages(db, founder.token, {
    filter: "sent-welcomes",
    after: first.after
  });
  assert.ok(next.conversations!.length > 0);
  assert.ok(
    !next.conversations!.some((c) =>
      first.conversations!.some((p) => p.id === c.id)
    )
  );
  const view = await readAdultMessages(db, founder.token, {
    view: "conversation",
    conversationId: row.id
  });
  assert.equal(view.conversation!.welcome!.unanswered, true);
  await adultMessageCommand(
    db,
    founder.token,
    command("clear", {
      conversationId: row.id,
      expectedVersion: view.conversation!.preferences.version,
      through: reply.id
    })
  );
  assert.ok(
    !(
      await readAdultMessages(db, founder.token, { filter: "unanswered" })
    ).conversations!.some((c) => c.id === row.id)
  );
});
