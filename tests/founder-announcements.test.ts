import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, createECDH, randomBytes } from "node:crypto";
import webpush from "web-push";
import { PrismaClient } from "@prisma/client";
import {
  createPortalActor,
  assertPortalTestDatabase,
  seedOperatorGrants
} from "./seed-portal";
import { deliverFounderWelcome } from "../lib/platform/founder-welcome";
import {
  founderAnnouncementCommand as command,
  readFounderAnnouncements as read,
  deliverAnnouncementRecipient as deliver,
  cleanFounderAnnouncements
} from "../lib/platform/founder-announcements";
import { dispatchFounderAnnouncements } from "../lib/platform/founder-announcement-queue";
import { handleFounderAnnouncementRequest } from "../lib/platform/founder-announcement-boundary";
import {
  adultMessageCommand,
  readAdultMessages
} from "../lib/platform/adult-messages";
import { relationshipCommand } from "../lib/platform/relationships";
import { pushSubscriptionCommand } from "../lib/platform/push-subscriptions";
import { createSessionToken } from "../lib/platform/auth";
import {
  deliverNotification,
  openNotification,
  notificationWrite
} from "../lib/platform/notification-outbox";
import { accountConfig } from "../lib/platform/account-config";
import { SESSION_COOKIE } from "../lib/platform/account-boundary";
const db = new PrismaClient();
const names = [
  "FOUNDER_ACCOUNT_ID",
  "FOUNDER_WELCOME_ENABLED",
  "COMMUNITY_REPORTS_ENABLED",
  "PUSH_ENABLED",
  "PUSH_VAPID_PUBLIC_KEY",
  "PUSH_VAPID_PRIVATE_KEY",
  "PUSH_VAPID_SUBJECT"
];
const old = Object.fromEntries(names.map((k) => [k, process.env[k]]));
let founder: Awaited<ReturnType<typeof createPortalActor>>,
  outsider: typeof founder;
before(async () => {
  await assertPortalTestDatabase(db);
  process.env.FOUNDER_WELCOME_ENABLED = "false";
  founder = await createPortalActor(db, "announceowner");
  outsider = await createPortalActor(db, "announceother");
  await seedOperatorGrants(db, founder, ["REVIEW_COMMUNITY_REPORTS"]);
  const keys = webpush.generateVAPIDKeys();
  Object.assign(process.env, {
    FOUNDER_ACCOUNT_ID: founder.id,
    FOUNDER_WELCOME_ENABLED: "true",
    COMMUNITY_REPORTS_ENABLED: "true",
    PUSH_ENABLED: "true",
    PUSH_VAPID_PUBLIC_KEY: keys.publicKey,
    PUSH_VAPID_PRIVATE_KEY: keys.privateKey,
    PUSH_VAPID_SUBJECT: "https://example.test/contact"
  });
});
after(async () => {
  for (const k of names)
    if (old[k] === undefined) delete process.env[k];
    else process.env[k] = old[k];
  await db.$disconnect();
});
const input = (operation: string, fields: Record<string, unknown> = {}) => ({
  operation,
  ownerId: founder.id,
  mutationId: randomUUID(),
  ...fields
});
async function recipient() {
  const member = await createPortalActor(db, "announcejoin");
  await deliverFounderWelcome(db, member.id);
  const welcome = await db.founderWelcome.findUniqueOrThrow({
    where: { recipientId: member.id }
  });
  return { member, welcome };
}
async function preview(ids: string[]) {
  const saved = await command(
    db,
    founder.token,
    input("save", {
      expectedVersion: 0,
      content: "A fixture platform update. No real announcement."
    })
  );
  return command(
    db,
    founder.token,
    input("preview", {
      id: saved.id,
      expectedVersion: saved.version,
      recipientIds: ids
    })
  );
}
const send = (p: { id: string; version: number }) =>
  input("send", { id: p.id, expectedVersion: p.version, confirmed: true });
async function complete(id: string) {
  for (let i = 0; i < 102; i++) if ((await deliver(db, id)).done) return;
  assert.fail("Bounded campaign did not finish");
}
test("only the current founder can draft and preview; preview sends nothing and send needs the exact current preview", async () => {
  const { member } = await recipient();
  const body = input("save", {
    expectedVersion: 0,
    content: "Draft-only fixture update"
  });
  await assert.rejects(
    command(db, outsider.token, { ...body, ownerId: outsider.id }),
    /unavailable for this account/
  );
  await assert.rejects(
    read(db, outsider.token, {}),
    /unavailable for this account/
  );
  const saved = await command(db, founder.token, body);
  assert.deepEqual(await command(db, founder.token, body), saved);
  await assert.rejects(
    command(db, founder.token, send(saved)),
    /fresh preview/
  );
  const before = await db.adultMessage.count({
    where: { senderId: founder.id }
  });
  const prepared = await command(
    db,
    founder.token,
    input("preview", {
      id: saved.id,
      expectedVersion: saved.version,
      recipientIds: [member.id]
    })
  );
  assert.equal(
    await db.adultMessage.count({ where: { senderId: founder.id } }),
    before
  );
  assert.equal(
    await db.founderAnnouncementRecipient.count({
      where: { announcementId: saved.id, status: "SELECTED" }
    }),
    1
  );
  const candidates = await read(db, founder.token, { view: "audience" });
  assert.ok(candidates.audience!.some((a) => a.id === member.id));
  assert.doesNotMatch(
    JSON.stringify(candidates),
    /private-login@example|password|token|endpoint/
  );
  const changed = await command(
    db,
    founder.token,
    input("save", {
      id: prepared.id,
      expectedVersion: prepared.version,
      content: "Revised fixture update"
    })
  );
  await assert.rejects(command(db, founder.token, send(prepared)), /changed/);
  await assert.rejects(
    command(db, founder.token, send(changed)),
    /fresh preview/
  );
  await assert.rejects(
    command(
      db,
      founder.token,
      input("preview", {
        id: changed.id,
        expectedVersion: changed.version,
        recipientIds: Array(101).fill(member.id)
      })
    ),
    /100 members/
  );
  await assert.rejects(
    command(
      db,
      founder.token,
      input("preview", {
        id: changed.id,
        expectedVersion: changed.version,
        recipientIds: [outsider.id]
      })
    ),
    /no longer eligible/
  );
});
test("deliberate sends and concurrent workers create one canonical message per selected recipient; replay and progress stay durable", async () => {
  const a = await recipient(),
    b = await recipient();
  const prepared = await preview([a.member.id, b.member.id]),
    request = send(prepared);
  const sent = await command(db, founder.token, request);
  assert.deepEqual(await command(db, founder.token, request), sent);
  await assert.rejects(
    command(
      db,
      founder.token,
      input("save", {
        id: sent.id,
        expectedVersion: sent.version,
        content: "Cannot change a committed send"
      })
    ),
    /left draft mode/
  );
  assert.deepEqual(
    await dispatchFounderAnnouncements(db, sent.id, async () => {
      throw Error("Fixture queue failure");
    }),
    { queued: 0, failed: 1 }
  );
  await Promise.all([
    deliver(db, sent.id),
    deliver(db, sent.id),
    deliver(db, sent.id)
  ]);
  await complete(sent.id);
  const view = await read(db, founder.token, { id: sent.id });
  assert.equal(view.announcement!.sentCount, 2);
  assert.equal(view.announcement!.status, "COMPLETE");
  assert.equal(view.announcement!.content, null);
  for (const person of [a, b]) {
    assert.equal(
      await db.adultMessage.count({
        where: {
          conversationId: person.welcome.conversationId,
          kind: "FOUNDER_ANNOUNCEMENT"
        }
      }),
      1
    );
    assert.equal(
      (
        await db.adultConversation.findUniqueOrThrow({
          where: { id: person.welcome.conversationId }
        })
      ).sendingAllowed,
      false
    );
  }
  const first = view.announcement!.recipients[0];
  await db.adultMessage.delete({ where: { id: first.messageId! } });
  await notificationWrite(db, (tx) =>
    cleanFounderAnnouncements(tx, new Date(Date.now() + 15 * 86400000))
  );
  assert.equal(
    await db.founderAnnouncementRecipient.count({
      where: { announcementId: sent.id }
    }),
    0
  );
  assert.deepEqual(await command(db, founder.token, request), sent);
  assert.deepEqual(await deliver(db, sent.id), { done: true });
  assert.equal(
    (await read(db, founder.token, { id: sent.id })).announcement!.sentCount,
    2
  );
});
test("changed opt-out and blocks are rechecked at send and worker time without enabling contact", async () => {
  for (const phase of ["before-send", "before-worker"]) {
    const { member, welcome } = await recipient(),
      p = await preview([member.id]);
    if (phase === "before-worker") await command(db, founder.token, send(p));
    await db.socialPreferences.upsert({
      where: { ownerId: member.id },
      create: { ownerId: member.id, founderAnnouncements: false },
      update: { founderAnnouncements: false }
    });
    if (phase === "before-send") await command(db, founder.token, send(p));
    await complete(p.id);
    assert.equal(
      await db.adultMessage.count({
        where: {
          conversationId: welcome.conversationId,
          kind: "FOUNDER_ANNOUNCEMENT"
        }
      }),
      0
    );
    assert.equal(
      (await read(db, founder.token, { id: p.id })).announcement!.skippedCount,
      1
    );
  }
  const { member, welcome } = await recipient(),
    p = await preview([member.id]);
  await command(db, founder.token, send(p));
  await relationshipCommand(db, member.token, {
    operation: "block",
    mutationId: randomUUID(),
    kind: "person",
    targetId: founder.id,
    desired: true,
    expectedVersion: 0
  });
  const protectedView = (await read(db, founder.token, { id: p.id }))
    .announcement!;
  assert.equal(
    protectedView.recipients[0].recipient.name,
    "Unavailable account"
  );
  assert.equal(protectedView.recipients[0].recipient.username, null);
  assert.equal(protectedView.recipients[0].href, null);
  assert.equal(typeof protectedView.createdAt, "string");
  await complete(p.id);
  assert.equal(
    await db.adultMessage.count({
      where: {
        conversationId: welcome.conversationId,
        kind: "FOUNDER_ANNOUNCEMENT"
      }
    }),
    0
  );
});
test("announcement alerts are independent of personal-message alerts and opt-out preserves explicit replies after a cleared welcome", async () => {
  const { member, welcome } = await recipient();
  const view = await readAdultMessages(db, member.token, {
    view: "conversation",
    conversationId: welcome.conversationId
  });
  await adultMessageCommand(db, member.token, {
    operation: "clear",
    mutationId: randomUUID(),
    conversationId: welcome.conversationId,
    expectedVersion: view.conversation!.preferences.version,
    through: welcome.messageId
  });
  await db.adultMessage.delete({ where: { id: welcome.messageId! } });
  await db.socialPreferences.create({
    data: {
      ownerId: member.id,
      messageAlerts: false,
      founderAnnouncements: true,
      pushCategories: ["founder"]
    }
  });
  const pair = createECDH("prime256v1");
  pair.generateKeys();
  await pushSubscriptionCommand(db, member.token, {
    operation: "subscribe",
    mutationId: randomUUID(),
    ownerId: member.id,
    binding: createSessionToken(),
    label: "Fixture update phone",
    subscription: {
      endpoint: "https://fcm.googleapis.com/fcm/send/" + randomUUID(),
      keys: {
        p256dh: pair.getPublicKey().toString("base64url"),
        auth: randomBytes(16).toString("base64url")
      }
    }
  });
  const p = await preview([member.id]);
  await command(db, founder.token, send(p));
  await complete(p.id);
  const announcement = await db.adultMessage.findFirstOrThrow({
    where: {
      conversationId: welcome.conversationId,
      kind: "FOUNDER_ANNOUNCEMENT"
    }
  });
  assert.equal(
    (await readAdultMessages(db, member.token, { view: "activity" })).activity!
      .messageAlerts,
    1
  );
  const delivery = await db.notificationDelivery.findFirstOrThrow({
    where: { event: { messageId: announcement.id } }
  });
  assert.equal(
    (await openNotification(db, member.token, delivery.id)).href,
    `/platform/messages/${welcome.conversationId}?message=${announcement.id}`
  );
  await db.socialPreferences.update({
    where: { ownerId: member.id },
    data: { founderAnnouncements: false, messageAlerts: true }
  });
  let calls = 0;
  await deliverNotification(db, delivery.id, async () => {
    calls++;
    return 201;
  });
  assert.equal(calls, 0);
  assert.equal(
    (await readAdultMessages(db, member.token, { view: "activity" })).activity!
      .messageAlerts,
    0
  );
  const current = await readAdultMessages(db, member.token, {
    view: "conversation",
    conversationId: welcome.conversationId
  });
  assert.equal(current.conversation!.welcome!.canReply, true);
  await adultMessageCommand(db, member.token, {
    operation: "send",
    mutationId: randomUUID(),
    conversationId: welcome.conversationId,
    expectedVersion: current.conversation!.version,
    content: "My personal reply stays separate",
    welcomeReply: true
  });
  assert.equal(
    (
      await db.socialPreferences.findUniqueOrThrow({
        where: { ownerId: member.id }
      })
    ).founderAnnouncements,
    false
  );
});
test("revoked founder authority pauses unsent work; account restriction cancels it and diagnostics expire without replay", async () => {
  const { member, welcome } = await recipient(),
    p = await preview([member.id]);
  const request = send(p);
  await command(db, founder.token, request);
  await db.platformOperatorGrant.updateMany({
    where: { userId: founder.id },
    data: { revokedAt: new Date() }
  });
  assert.deepEqual(await deliver(db, p.id), { done: false, paused: true });
  await assert.rejects(
    command(db, founder.token, request),
    /unavailable for this account/
  );
  await db.platformOperatorGrant.updateMany({
    where: { userId: founder.id },
    data: { revokedAt: null }
  });
  await db.platformUser.update({
    where: { id: member.id },
    data: { deactivatedAt: new Date() }
  });
  await complete(p.id);
  assert.equal(
    await db.adultMessage.count({
      where: {
        conversationId: welcome.conversationId,
        kind: "FOUNDER_ANNOUNCEMENT"
      }
    }),
    0
  );
  const fresh = await recipient(),
    expired = await preview([fresh.member.id]);
  await command(db, founder.token, send(expired));
  await notificationWrite(db, (tx) =>
    cleanFounderAnnouncements(tx, new Date(Date.now() + 8 * 86400000))
  );
  assert.deepEqual(await deliver(db, expired.id), { done: true });
  assert.equal(
    (await read(db, founder.token, { id: expired.id })).announcement!
      .skippedCount,
    1
  );
});
test("the HTTP boundary retains origin/owner protections and a scheduling failure does not disguise a committed send", async () => {
  const { member } = await recipient(),
    p = await preview([member.id]),
    request = send(p),
    origin = accountConfig().origin;
  const req = (site: string, data = request) =>
    new Request(origin + "/api/platform/founder-announcements", {
      method: "POST",
      headers: {
        origin: site,
        cookie: `${SESSION_COOKIE}=${founder.token}`,
        "content-type": "application/json"
      },
      body: JSON.stringify(data)
    });
  assert.equal(
    (await handleFounderAnnouncementRequest(db, req("https://foreign.example")))
      .status,
    403
  );
  assert.equal(
    (
      await handleFounderAnnouncementRequest(
        db,
        req(origin, { ...request, ownerId: outsider.id })
      )
    ).status,
    401
  );
  const response = await handleFounderAnnouncementRequest(
    db,
    req(origin),
    () => {
      throw Error("Fixture scheduler unavailable");
    }
  );
  assert.equal(response.status, 200);
  assert.match(response.headers.get("cache-control")!, /no-store/);
  assert.equal(
    (await read(db, founder.token, { id: p.id })).announcement!.status,
    "SENDING"
  );
  await db.platformUser.update({
    where: { id: founder.id },
    data: { deactivatedAt: new Date() }
  });
  const row = await db.founderAnnouncement.findUniqueOrThrow({
    where: { id: p.id }
  });
  assert.equal(row.status, "CANCELLED");
  assert.equal(row.content, null);
  assert.deepEqual(await deliver(db, p.id), { done: true });
});
