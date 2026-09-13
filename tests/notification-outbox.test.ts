import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { createECDH, randomBytes, randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import {
  createPortalActor,
  assertPortalTestDatabase,
  seedOperatorGrants
} from "./seed-portal";
import { createSessionToken } from "../lib/platform/auth";
import { pushSubscriptionCommand } from "../lib/platform/push-subscriptions";
import {
  deliverNotification,
  openNotification,
  cleanNotificationRecords,
  notificationWrite
} from "../lib/platform/notification-outbox";
import { requestTestNotification } from "../lib/platform/notification-test";
import { dispatchNotifications } from "../lib/platform/notification-queue";
import { handleNotificationRequest } from "../lib/platform/notification-boundary";
import { adultMessageCommand } from "../lib/platform/adult-messages";
import {
  communityReportCommand,
  readCommunityReports
} from "../lib/platform/community-reports";
import { relationshipCommand } from "../lib/platform/relationships";
import { SESSION_COOKIE } from "../lib/platform/account-boundary";
import { accountConfig } from "../lib/platform/account-config";
const db = new PrismaClient();
const names = [
  "PUSH_ENABLED",
  "PUSH_VAPID_PUBLIC_KEY",
  "PUSH_VAPID_PRIVATE_KEY",
  "PUSH_VAPID_SUBJECT",
  "COMMUNITY_REPORTS_ENABLED"
] as const;
const old = Object.fromEntries(names.map((k) => [k, process.env[k]]));
let reviewer: Awaited<ReturnType<typeof createPortalActor>>;
before(async () => {
  await assertPortalTestDatabase(db);
  const pair = createECDH("prime256v1");
  pair.generateKeys();
  Object.assign(process.env, {
    PUSH_ENABLED: "true",
    PUSH_VAPID_PUBLIC_KEY: pair.getPublicKey().toString("base64url"),
    PUSH_VAPID_PRIVATE_KEY: pair.getPrivateKey().toString("base64url"),
    PUSH_VAPID_SUBJECT: "https://example.test/contact",
    COMMUNITY_REPORTS_ENABLED: "true"
  });
  reviewer = await createPortalActor(db, "pushreview");
  await seedOperatorGrants(db, reviewer, ["REVIEW_COMMUNITY_REPORTS"]);
});
after(async () => {
  for (const name of names)
    if (old[name] === undefined) delete process.env[name];
    else process.env[name] = old[name];
  await db.$disconnect();
});
const mutation = (operation: string, fields: Record<string, unknown> = {}) => ({
  operation,
  mutationId: randomUUID(),
  ...fields
});
async function device(a: Awaited<ReturnType<typeof createPortalActor>>) {
  const pair = createECDH("prime256v1");
  pair.generateKeys();
  return pushSubscriptionCommand(
    db,
    a.token,
    mutation("subscribe", {
      ownerId: a.id,
      binding: createSessionToken(),
      label: "Fictional phone",
      subscription: {
        endpoint: "https://fcm.googleapis.com/fcm/send/" + randomUUID(),
        keys: {
          p256dh: pair.getPublicKey().toString("base64url"),
          auth: randomBytes(16).toString("base64url")
        }
      }
    })
  );
}
async function pair() {
  const a = await createPortalActor(db, "pushsend"),
    b = await createPortalActor(db, "pushread");
  const ids = [a.id, b.id].sort();
  const conversation = await db.adultConversation.create({
    data: {
      participantAId: ids[0],
      participantBId: ids[1],
      sendingAllowed: true
    }
  });
  const subscription = await device(b);
  await db.socialPreferences.create({
    data: { ownerId: b.id, messageAlerts: false, pushCategories: ["messages"] }
  });
  const input = mutation("send", {
    conversationId: conversation.id,
    expectedVersion: conversation.version,
    content: "Private canonical fixture body must never enter push"
  });
  const sent = await adultMessageCommand(db, a.token, input);
  const delivery = await db.notificationDelivery.findFirstOrThrow({
    where: { event: { messageId: sent.id }, ownerId: b.id }
  });
  return { a, b, conversation, subscription, input, sent, delivery };
}
test("message/outbox commit together, retries use one intent, workers lease once and payloads never copy private text", async () => {
  const f = await pair();
  assert.deepEqual(await adultMessageCommand(db, f.a.token, f.input), f.sent);
  assert.equal(
    await db.notificationDelivery.count({
      where: { eventId: f.delivery.eventId }
    }),
    1
  );
  let calls = 0,
    payload = "";
  const transport = async (_sub: unknown, value: unknown) => {
    calls++;
    payload = JSON.stringify(value);
    return 201;
  };
  await Promise.all([
    deliverNotification(db, f.delivery.id, transport),
    deliverNotification(db, f.delivery.id, transport)
  ]);
  assert.equal(calls, 1);
  assert.doesNotMatch(
    payload,
    /Private canonical|endpoint|p256dh|pushsend|pushread/
  );
  assert.equal(
    (
      await db.notificationDelivery.findUniqueOrThrow({
        where: { id: f.delivery.id }
      })
    ).state,
    "FINISHED"
  );
  assert.equal(
    (await openNotification(db, f.b.token, f.delivery.id)).href,
    `/platform/messages/${f.conversation.id}?message=${f.sent.id}`
  );
  await assert.rejects(openNotification(db, f.a.token, f.delivery.id));
  assert.deepEqual(await deliverNotification(db, f.delivery.id, transport), {
    done: true,
    outcome: "finished"
  });
  assert.equal(calls, 1);
  const row = await db.notificationDelivery.findUniqueOrThrow({
    where: { id: f.delivery.id }
  });
  await assert.rejects(
    db.notificationDelivery.update({
      where: { id: row.id },
      data: { state: "QUEUED", finishedAt: null }
    })
  );
  await notificationWrite(db, (tx) =>
    cleanNotificationRecords(tx, new Date(Date.now() + 15 * 86400000))
  );
  assert.equal(
    await db.pushDeliveryAttempt.count({ where: { deliveryId: row.id } }),
    0
  );
  assert.equal(
    (await db.notificationDelivery.findUniqueOrThrow({ where: { id: row.id } }))
      .outcome,
    null
  );
  await adultMessageCommand(db, f.a.token, f.input);
  assert.equal(
    await db.notificationDelivery.count({ where: { eventId: row.eventId } }),
    1
  );
});
test("temporary failures retain intent, retry delay is honored, and expired endpoints are scrubbed without another send", async () => {
  const f = await pair();
  let calls = 0;
  const first = await deliverNotification(db, f.delivery.id, async () => {
    calls++;
    return 503;
  });
  assert.ok(!first.done);
  await deliverNotification(db, f.delivery.id, async () => {
    calls++;
    return 201;
  });
  assert.equal(calls, 1);
  await db.notificationDelivery.update({
    where: { id: f.delivery.id },
    data: { availableAt: new Date(Date.now() - 1) }
  });
  const expired = await deliverNotification(db, f.delivery.id, async () => {
    calls++;
    return 410;
  });
  assert.deepEqual(expired, { done: true, outcome: "cancelled" });
  const sub = await db.pushSubscription.findUniqueOrThrow({
    where: { id: f.subscription.id }
  });
  assert.ok(sub.revokedAt);
  assert.equal(sub.endpoint, null);
  assert.equal(sub.auth, null);
  await deliverNotification(db, f.delivery.id, async () => {
    calls++;
    return 201;
  });
  assert.equal(calls, 2);
  const diagnostics = await db.pushDeliveryAttempt.findMany({
    where: { deliveryId: f.delivery.id },
    orderBy: { attempt: "asc" }
  });
  assert.deepEqual(
    diagnostics.map((d) => d.outcome),
    ["RETRY", "EXPIRED"]
  );
});
test("late blocking, muting, reading, account restriction and deleted sources cancel delivery using current policy", async () => {
  for (const change of [
    "block",
    "mute",
    "read",
    "age",
    "deleted",
    "preference",
    "logout"
  ] as const) {
    const f = await pair();
    if (change === "block")
      await relationshipCommand(
        db,
        f.b.token,
        mutation("block", {
          kind: "person",
          targetId: f.a.id,
          desired: true,
          expectedVersion: 0
        })
      );
    if (change === "mute")
      await db.adultConversationState.create({
        data: {
          ownerId: f.b.id,
          conversationId: f.conversation.id,
          muted: true
        }
      });
    if (change === "read")
      await db.adultConversationState.create({
        data: {
          ownerId: f.b.id,
          conversationId: f.conversation.id,
          readThrough: 1
        }
      });
    if (change === "age")
      await db.platformUser.update({
        where: { id: f.a.id },
        data: { adultAcknowledgedAt: null }
      });
    if (change === "deleted")
      await db.adultMessage.delete({ where: { id: f.sent.id } });
    if (change === "preference")
      await db.socialPreferences.update({
        where: { ownerId: f.b.id },
        data: { pushCategories: [] }
      });
    if (change === "logout")
      await db.platformSession.deleteMany({ where: { userId: f.b.id } });
    let calls = 0;
    const result = await deliverNotification(db, f.delivery.id, async () => {
      calls++;
      return 201;
    });
    assert.ok(result.done);
    assert.equal(calls, 0, change);
    if (
      change === "block" ||
      change === "age" ||
      change === "deleted" ||
      change === "logout"
    )
      await assert.rejects(openNotification(db, f.b.token, f.delivery.id));
  }
});
test("queue publication failure is recoverable and quiet hours recheck after creation without a provider attempt", async () => {
  const f = await pair();
  assert.deepEqual(
    await dispatchNotifications(db, f.sent.id, async () => {
      throw Error("Fictional queue outage");
    }),
    { queued: 0, failed: 1 }
  );
  const ids: string[] = [];
  assert.deepEqual(
    await dispatchNotifications(db, f.sent.id, async (id) => {
      ids.push(id);
    }),
    { queued: 1, failed: 0 }
  );
  assert.deepEqual(ids, [f.delivery.id]);
  const now = new Date(),
    minute = now.getUTCHours() * 60 + now.getUTCMinutes();
  await db.socialPreferences.update({
    where: { ownerId: f.b.id },
    data: {
      quietStart: (minute + 1439) % 1440,
      quietEnd: (minute + 60) % 1440,
      quietTimeZone: "UTC"
    }
  });
  let calls = 0;
  const deferred = await deliverNotification(
    db,
    f.delivery.id,
    async () => {
      calls++;
      return 201;
    },
    now
  );
  assert.ok(!deferred.done);
  assert.equal(calls, 0);
  assert.equal(
    await db.pushDeliveryAttempt.count({
      where: { deliveryId: f.delivery.id }
    }),
    0
  );
});
test("recipient test is current-device only, exact retries deduplicate, and HTTP origin/owner defenses apply", async () => {
  const a = await createPortalActor(db, "pushtest"),
    b = await createPortalActor(db, "pushother"),
    sub = await device(a);
  const input = mutation("test", {
    ownerId: a.id,
    id: sub.id,
    expectedVersion: sub.version
  });
  await assert.rejects(
    requestTestNotification(db, b.token, { ...input, ownerId: b.id })
  );
  const one = await requestTestNotification(db, a.token, input);
  assert.deepEqual(await requestTestNotification(db, a.token, input), one);
  assert.equal(
    await db.notificationDelivery.count({ where: { eventId: one.id } }),
    1
  );
  const origin = accountConfig().origin;
  const req = (site: string, data: Record<string, unknown> = input) =>
    new Request(origin + "/api/platform/notifications", {
      method: "POST",
      headers: {
        origin: site,
        cookie: `${SESSION_COOKIE}=${a.token}`,
        "content-type": "application/json"
      },
      body: JSON.stringify(data)
    });
  assert.equal(
    (await handleNotificationRequest(db, req("https://foreign.example")))
      .status,
    403
  );
  assert.equal(
    (
      await handleNotificationRequest(
        db,
        req(origin, { ...input, ownerId: b.id })
      )
    ).status,
    401
  );
  const response = await handleNotificationRequest(db, req(origin));
  assert.equal(response.status, 200);
  assert.match(response.headers.get("cache-control")!, /no-store/);
  let attempts = 0;
  const testDelivery = await db.notificationDelivery.findFirstOrThrow({
    where: { eventId: one.id }
  });
  assert.deepEqual(
    await deliverNotification(db, testDelivery.id, async () => {
      attempts++;
      return 201;
    }),
    { done: true, outcome: "accepted" }
  );
  assert.equal(attempts, 1);
});
test("report notifications keep selected evidence scoped and recheck the current reviewer grant", async () => {
  const f = await pair(),
    sub = await device(reviewer);
  await db.socialPreferences.upsert({
    where: { ownerId: reviewer.id },
    create: { ownerId: reviewer.id, pushCategories: ["reports"] },
    update: { pushCategories: ["reports"] }
  });
  const target = await readCommunityReports(db, f.b.token, {
    view: "target",
    targetType: "MESSAGE",
    targetId: f.sent.id
  });
  const report = await communityReportCommand(
    db,
    f.b.token,
    mutation("create", {
      targetType: "MESSAGE",
      targetId: f.sent.id,
      expectedTargetVersion: target.target!.version,
      expectedContextVersion: 0,
      reason: "HARASSMENT",
      details: "Private selected reason"
    })
  );
  const row = await db.notificationDelivery.findFirstOrThrow({
    where: { event: { reportId: report.id }, subscriptionId: sub.id }
  });
  assert.equal(
    (await openNotification(db, reviewer.token, row.id)).href,
    `/platform/reports/review?id=${report.id}`
  );
  await db.platformOperatorGrant.updateMany({
    where: {
      userId: reviewer.id,
      capability: "REVIEW_COMMUNITY_REPORTS",
      revokedAt: null
    },
    data: { revokedAt: new Date() }
  });
  let calls = 0;
  await deliverNotification(db, row.id, async () => {
    calls++;
    return 201;
  });
  assert.equal(calls, 0);
  await assert.rejects(openNotification(db, reviewer.token, row.id));
  await db.platformOperatorGrant.updateMany({
    where: { userId: reviewer.id, capability: "REVIEW_COMMUNITY_REPORTS" },
    data: { revokedAt: null }
  });
});
