import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { PrismaClient } from "@prisma/client";
import webpush from "web-push";
import { assertPortalTestDatabase, createPortalActor } from "./seed-portal";
import {
  seedNotificationPair,
  seedNotificationDevice
} from "./seed-notifications";
import {
  cleanNotificationRecords,
  deliverNotification
} from "../lib/platform/notification-outbox";
import { hashSessionToken } from "../lib/platform/auth";
import { LEGACY_IDLE_ENDS_AT } from "../lib/platform/account-session-policy";
import { readPushSubscriptions } from "../lib/platform/push-subscriptions";
import { loginAccount } from "../lib/platform/accounts";

const db = new PrismaClient();
const keys = [
  "PUSH_ENABLED",
  "PUSH_VAPID_PUBLIC_KEY",
  "PUSH_VAPID_PRIVATE_KEY",
  "PUSH_VAPID_SUBJECT"
];
const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
before(async () => {
  await assertPortalTestDatabase(db);
  const vapid = webpush.generateVAPIDKeys();
  Object.assign(process.env, {
    PUSH_ENABLED: "true",
    PUSH_VAPID_PUBLIC_KEY: vapid.publicKey,
    PUSH_VAPID_PRIVATE_KEY: vapid.privateKey,
    PUSH_VAPID_SUBJECT: "https://example.test/contact"
  });
});
after(async () => {
  for (const key of keys)
    if (previous[key] == null) delete process.env[key];
    else process.env[key] = previous[key];
  await db.$disconnect();
});

test("idle push admission cancels without provider calls or renewal and clears endpoint keys", async () => {
  const fixture = await seedNotificationPair(db);
  await db.platformSession.update({
    where: { tokenHash: hashSessionToken(fixture.b.token) },
    data: { idleExpiresAt: new Date(0) }
  });
  const before = await db.platformSession.findUniqueOrThrow({
    where: { tokenHash: hashSessionToken(fixture.b.token) }
  });
  let sends = 0;
  const result = await deliverNotification(
    db,
    fixture.delivery.id,
    async () => {
      sends++;
      return 201;
    }
  );
  assert.deepEqual(result, { done: true, outcome: "cancelled" });
  assert.equal(sends, 0);
  assert.deepEqual(
    await db.platformSession.findUniqueOrThrow({ where: { id: before.id } }),
    before
  );
  const device = await db.pushSubscription.findUniqueOrThrow({
    where: { id: fixture.subscription.id }
  });
  assert.ok(device.revokedAt);
  assert.equal(device.endpoint, null);
  assert.equal(device.p256dh, null);
  assert.equal(device.auth, null);
});

test("expiry between admission and transport skips provider submission and settles its own lease", async () => {
  const fixture = await seedNotificationPair(db);
  await db.platformSession.update({
    where: { tokenHash: hashSessionToken(fixture.b.token) },
    data: { idleExpiresAt: new Date(Date.now() + 1500) }
  });
  let waited = false,
    sends = 0;
  // Trusted test-only transaction wrapper delays the already committed claim.
  // It exercises the real DB admission, then the real final dispatch check.
  const delayed = new Proxy(db, {
    get(target, property) {
      if (property === "$transaction")
        return async (...args: unknown[]) => {
          const result = await Reflect.apply(target.$transaction, target, args);
          if (
            !waited &&
            result &&
            typeof result === "object" &&
            "sessionDeadline" in result &&
            typeof result.sessionDeadline === "number"
          ) {
            waited = true;
            await delay(Math.max(0, result.sessionDeadline - Date.now() + 5));
          }
          return result;
        };
      const value = Reflect.get(target, property, target);
      return typeof value === "function" ? value.bind(target) : value;
    }
  });
  const result = await deliverNotification(
    delayed,
    fixture.delivery.id,
    async () => {
      sends++;
      return 201;
    }
  );
  assert.equal(waited, true);
  assert.equal(sends, 0);
  assert.deepEqual(result, { done: true, outcome: "cancelled" });
  const row = await db.notificationDelivery.findUniqueOrThrow({
    where: { id: fixture.delivery.id }
  });
  assert.equal(row.state, "FINISHED");
  assert.equal(row.outcome, "CANCELLED");
  assert.equal(row.leaseToken, null);
  assert.equal(
    (
      await db.pushDeliveryAttempt.findUniqueOrThrow({
        where: { deliveryId_attempt: { deliveryId: row.id, attempt: 1 } }
      })
    ).outcome,
    "EXPIRED"
  );
});

test("device listing revokes an idle sibling without shortening an active subscription deadline", async () => {
  const actor = await createPortalActor(db, "idledev");
  const device = await seedNotificationDevice(db, actor);
  const before = await db.pushSubscription.findUniqueOrThrow({
    where: { id: device.id }
  });
  const current = await loginAccount(
    db,
    actor.email,
    actor.password,
    "Active fictional sibling"
  );
  await db.platformSession.update({
    where: { tokenHash: hashSessionToken(actor.token) },
    data: { idleExpiresAt: new Date(0) }
  });
  const list = await readPushSubscriptions(db, current);
  assert.equal(
    list.devices.some((item) => item.id === device.id),
    false
  );
  const removed = await db.pushSubscription.findUniqueOrThrow({
    where: { id: device.id }
  });
  assert.ok(removed.revokedAt);
  assert.equal(removed.endpoint, null);
  assert.equal(removed.expiresAt.getTime(), before.expiresAt.getTime());
});

test("cutoff cleanup catches null legacy deadlines and scrubs keys inside a rolled-back rehearsal", async () => {
  const actor = await createPortalActor(db, "idlelegacy");
  const device = await seedNotificationDevice(db, actor);
  const cutoff = new Date(LEGACY_IDLE_ENDS_AT);
  await db.platformSession.update({
    where: { tokenHash: hashSessionToken(actor.token) },
    data: {
      idleExpiresAt: null,
      expiresAt: new Date(cutoff.getTime() + 86400000)
    }
  });
  await db.pushSubscription.update({
    where: { id: device.id },
    data: { expiresAt: new Date(cutoff.getTime() + 86400000) }
  });
  const before = await db.pushSubscription.findUniqueOrThrow({
    where: { id: device.id }
  });
  const rollback = new Error("intentional isolated rehearsal rollback");
  await assert.rejects(
    db.$transaction(
      async (tx) => {
        await cleanNotificationRecords(tx, cutoff);
        const scrubbed = await tx.pushSubscription.findUniqueOrThrow({
          where: { id: device.id }
        });
        assert.ok(scrubbed.revokedAt);
        assert.equal(scrubbed.endpoint, null);
        assert.equal(scrubbed.p256dh, null);
        assert.equal(scrubbed.auth, null);
        throw rollback;
      },
      { timeout: 15000 }
    ),
    (error) => error === rollback
  );
  assert.deepEqual(
    await db.pushSubscription.findUniqueOrThrow({ where: { id: device.id } }),
    before
  );
});
