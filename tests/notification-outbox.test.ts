import webpush from "web-push";
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import {
  createPortalActor,
  assertPortalTestDatabase,
  seedOperatorGrants
} from "./seed-portal";
import {
  seedNotificationDevice,
  seedNotificationPair
} from "./seed-notifications";
import {
  deliverNotification,
  openNotification,
  cleanNotificationRecords,
  notificationWrite
} from "../lib/platform/notification-outbox";
import {
  requestTestNotification,
  readTestNotification
} from "../lib/platform/notification-test";
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
import { handleNotificationMaintenance } from "../lib/platform/notification-maintenance";
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
  const vapid = webpush.generateVAPIDKeys();
  Object.assign(process.env, {
    PUSH_ENABLED: "true",
    PUSH_VAPID_PUBLIC_KEY: vapid.publicKey,
    PUSH_VAPID_PRIVATE_KEY: vapid.privateKey,
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
test("secured notification inspection verifies configuration without delivery or cleanup writes", async () => {
  const prior = process.env.CRON_SECRET;
  process.env.CRON_SECRET = randomBytes(32).toString("hex");
  const request = (mode = "inspect", auth = true, method = "GET") =>
    new Request(
      `https://example.test/api/maintenance/notifications?mode=${mode}`,
      {
        method,
        headers: auth
          ? { authorization: `Bearer ${process.env.CRON_SECRET}` }
          : {}
      }
    );
  let sent = 0;
  const publish = async (id: string) => {
    assert.match(id, /^probe-[a-f0-9-]{36}$/);
    assert.equal(
      await db.notificationDelivery.findUnique({ where: { id } }),
      null
    );
    sent++;
    return { messageId: "fixture-provider-message" };
  };
  const snapshot = async () =>
    JSON.stringify(
      await Promise.all([
        db.pushSubscription.findMany({ orderBy: { id: "asc" } }),
        db.notificationDelivery.findMany({ orderBy: { id: "asc" } }),
        db.pushDeliveryAttempt.findMany({ orderBy: { id: "asc" } })
      ])
    );
  try {
    const before = await snapshot();
    assert.equal(
      (
        await handleNotificationMaintenance(
          db,
          request("inspect", false),
          publish
        )
      ).status,
      401
    );
    assert.equal(
      (
        await handleNotificationMaintenance(
          db,
          request("inspect", true, "POST"),
          publish
        )
      ).status,
      405
    );
    assert.equal(
      (await handleNotificationMaintenance(db, request("invalid"), publish))
        .status,
      400
    );
    const response = await handleNotificationMaintenance(
        db,
        request(),
        publish
      ),
      body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.configured, true);
    assert.match(body.publicKeyFingerprint, /^[a-f0-9]{16}$/);
    assert.equal(body.mode, "inspect");
    assert.equal(typeof body.devices, "number");
    assert.doesNotMatch(
      JSON.stringify(body),
      /endpoint|privateKey|auth|p256dh/
    );
    assert.equal(sent, 0);
    assert.equal(await snapshot(), before);
    process.env.PUSH_ENABLED = "false";
    const disabled = await (
      await handleNotificationMaintenance(db, request(), publish)
    ).json();
    assert.equal(disabled.configured, false);
    assert.equal(disabled.publicKeyFingerprint, null);
    const probe = await (
      await handleNotificationMaintenance(db, request("probe"), publish)
    ).json();
    assert.equal(probe.queued, 1);
    assert.equal(probe.applicationWrites, 0);
    assert.equal(probe.providerMessageId, "fixture-provider-message");
    assert.equal(sent, 1);
    assert.equal(await snapshot(), before);
  } finally {
    process.env.PUSH_ENABLED = "true";
    if (prior === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = prior;
  }
});
const device = (actor: Awaited<ReturnType<typeof createPortalActor>>) =>
  seedNotificationDevice(db, actor);
const pair = () => seedNotificationPair(db);
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
  assert.equal(
    (await readTestNotification(db, a.token, one.id)).state,
    "QUEUED"
  );
  await assert.rejects(readTestNotification(db, b.token, one.id));
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
  assert.match(
    (await readTestNotification(db, a.token, one.id)).message,
    /provider accepted.*does not confirm display/
  );
});
test("a recipient test respects a quiet window longer than its expiry and never sends afterward", async () => {
  const actor = await createPortalActor(db, "quiettest"),
    sub = await device(actor);
  const now = new Date(),
    minute = now.getUTCHours() * 60 + now.getUTCMinutes();
  await db.socialPreferences.create({
    data: {
      ownerId: actor.id,
      quietStart: (minute + 1439) % 1440,
      quietEnd: (minute + 60) % 1440,
      quietTimeZone: "UTC"
    }
  });
  const input = mutation("test", {
    ownerId: actor.id,
    id: sub.id,
    expectedVersion: sub.version
  });
  const result = await requestTestNotification(db, actor.token, input);
  assert.match(result.message, /ten-minute window/);
  assert.deepEqual(
    await requestTestNotification(db, actor.token, input),
    result
  );
  const status = await readTestNotification(db, actor.token, result.id);
  assert.equal(status.state, "FINISHED");
  assert.equal(status.outcome, "CANCELLED");
  const delivery = await db.notificationDelivery.findFirstOrThrow({
    where: { eventId: result.id }
  });
  let calls = 0;
  await deliverNotification(db, delivery.id, async () => {
    calls++;
    return 201;
  });
  assert.equal(calls, 0);
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

test("marking Activity read cancels its queued alert while newer arrivals remain deliverable", async () => {
  const { readActivity, activityCommand } =
    await import("../lib/platform/activity");
  const f = await pair();
  await db.socialPreferences.update({
    where: { ownerId: f.b.id },
    data: { messageAlerts: true }
  });
  const page = await readActivity(db, f.b.token);
  const input = mutation("read-all", {
    ownerId: f.b.id,
    boundary: page.boundary
  });
  const receipt = await activityCommand(db, f.b.token, input);
  assert.deepEqual(
    await deliverNotification(db, f.delivery.id, async () => {
      throw Error("already-read activity must not send");
    }),
    { done: true, outcome: "cancelled" }
  );
  const c = await db.adultConversation.findUniqueOrThrow({
    where: { id: f.conversation.id }
  });
  const sent = await adultMessageCommand(
    db,
    f.a.token,
    mutation("send", {
      conversationId: c.id,
      expectedVersion: c.version,
      content: "A new fixture message after the read boundary"
    })
  );
  const delivery = await db.notificationDelivery.findFirstOrThrow({
    where: { event: { messageId: sent.id }, ownerId: f.b.id }
  });
  assert.deepEqual(await activityCommand(db, f.b.token, input), receipt);
  assert.equal((await readActivity(db, f.b.token)).unread, 1);
  let sends = 0;
  assert.deepEqual(
    await deliverNotification(db, delivery.id, async () => {
      sends++;
      return 201;
    }),
    { done: true, outcome: "accepted" }
  );
  assert.equal(sends, 1);
  assert.ok(
    (await openNotification(db, f.b.token, f.delivery.id)).href.includes(
      f.conversation.id
    )
  );
});
