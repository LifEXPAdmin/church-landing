import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { createECDH, randomBytes, randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { createPortalActor, assertPortalTestDatabase } from "./seed-portal";
import { createSessionToken, hashSessionToken } from "../lib/platform/auth";
import {
  pushSubscriptionCommand as command,
  readPushSubscriptions,
  parsePushSubscription
} from "../lib/platform/push-subscriptions";
import {
  notificationPreferenceCommand,
  readNotificationPreferences,
  quietHoursEnd,
  parseQuietHours
} from "../lib/platform/notification-preferences";
import { pushServerConfig } from "../lib/platform/push-config";
const db = new PrismaClient();
const envKeys = [
  "PUSH_ENABLED",
  "PUSH_VAPID_PUBLIC_KEY",
  "PUSH_VAPID_PRIVATE_KEY",
  "PUSH_VAPID_SUBJECT"
] as const;
const previous = Object.fromEntries(envKeys.map((k) => [k, process.env[k]]));
before(async () => {
  await assertPortalTestDatabase(db);
  const pair = createECDH("prime256v1");
  pair.generateKeys();
  Object.assign(process.env, {
    PUSH_ENABLED: "true",
    PUSH_VAPID_PUBLIC_KEY: pair.getPublicKey().toString("base64url"),
    PUSH_VAPID_PRIVATE_KEY: pair.getPrivateKey().toString("base64url"),
    PUSH_VAPID_SUBJECT: "https://example.test/contact"
  });
});
after(async () => {
  for (const k of envKeys) {
    if (previous[k] === undefined) delete process.env[k];
    else process.env[k] = previous[k];
  }
  await db.$disconnect();
});
function subscription() {
  const pair = createECDH("prime256v1");
  pair.generateKeys();
  return {
    endpoint: "https://fcm.googleapis.com/fcm/send/" + randomUUID(),
    expirationTime: null,
    keys: {
      p256dh: pair.getPublicKey().toString("base64url"),
      auth: randomBytes(16).toString("base64url")
    }
  };
}
const actor = () => createPortalActor(db, "push");
function body(
  ownerId: string,
  sub = subscription(),
  binding = createSessionToken()
) {
  return {
    operation: "subscribe",
    mutationId: randomUUID(),
    ownerId,
    binding,
    label: "Fictional phone",
    subscription: sub
  };
}
test("only valid configured VAPID and supported browser service keys are accepted", () => {
  assert.ok(pushServerConfig());
  const original = process.env.PUSH_VAPID_PRIVATE_KEY;
  process.env.PUSH_VAPID_PRIVATE_KEY = randomBytes(32).toString("base64url");
  assert.equal(pushServerConfig(), null);
  process.env.PUSH_VAPID_PRIVATE_KEY = original;
  const sub = subscription();
  assert.equal(parsePushSubscription(sub).endpoint, sub.endpoint);
  for (const endpoint of [
    "http://fcm.googleapis.com/path",
    "https://localhost/path",
    "https://127.0.0.1/path",
    "https://fcm.googleapis.com.evil.test/path",
    "https://user:secret@fcm.googleapis.com/path",
    "https://fcm.googleapis.com:444/path",
    "https://fcm.googleapis.com/path#fragment"
  ])
    assert.throws(() => parsePushSubscription({ ...sub, endpoint }));
  for (const change of [
    { keys: { ...sub.keys, auth: "a".repeat(22) } },
    { extra: true },
    { expirationTime: Date.now() - 1 },
    { expirationTime: 9000000000000000 }
  ])
    assert.throws(() => parsePushSubscription({ ...sub, ...change }));
});
test("same-body subscriptions deduplicate, retry cannot resurrect removal, and reads never expose endpoints or keys", async () => {
  const a = await actor(),
    input = body(a.id);
  const [one, two] = await Promise.all([
    command(db, a.token, input),
    command(db, a.token, input)
  ]);
  assert.deepEqual(one, two);
  assert.equal(
    await db.pushSubscription.count({ where: { ownerId: a.id } }),
    1
  );
  const view = await readPushSubscriptions(db, a.token);
  assert.equal(view.devices.length, 1);
  assert.doesNotMatch(
    JSON.stringify(view),
    /fcm.googleapis|p256dh|bindingHash|endpointHash/
  );
  await assert.rejects(
    command(db, a.token, { ...input, label: "Changed retry" })
  );
  const remove = {
    operation: "unsubscribe",
    mutationId: randomUUID(),
    ownerId: a.id,
    id: one.id,
    expectedVersion: one.version
  };
  const saved = await command(db, a.token, remove);
  assert.deepEqual(await command(db, a.token, remove), saved);
  await assert.rejects(command(db, a.token, input));
  const revoked = await db.pushSubscription.findUniqueOrThrow({
    where: { id: one.id }
  });
  assert.ok(revoked.revokedAt);
  assert.equal(revoked.endpoint, null);
  assert.equal(revoked.auth, null);
});
test("account switching replaces the browser association, cancels queued work, and rejects stale-owner commands", async () => {
  const a = await actor(),
    b = await actor(),
    input = body(a.id),
    first = await command(db, a.token, input);
  const event = await db.socialEvent.create({
    data: {
      key: randomUUID(),
      kind: "ADULT_MESSAGE_CREATED",
      actorId: b.id,
      recipientId: a.id,
      conversationId: randomUUID(),
      messageId: randomUUID()
    }
  });
  await db.notificationDelivery.create({
    data: {
      eventId: event.id,
      ownerId: a.id,
      subscriptionId: first.id,
      subscriptionVersion: first.version,
      expiresAt: new Date(Date.now() + 60000)
    }
  });
  await assert.rejects(
    command(db, b.token, { ...input, mutationId: randomUUID() })
  );
  await assert.rejects(
    command(db, b.token, {
      ...body(b.id),
      subscription: { ...subscription(), endpoint: input.subscription.endpoint }
    }),
    "Knowing only an endpoint cannot revoke another account's device"
  );
  const switched = await command(db, b.token, {
    ...input,
    ownerId: b.id,
    mutationId: randomUUID()
  });
  assert.notEqual(switched.id, first.id);
  assert.equal((await readPushSubscriptions(db, a.token)).devices.length, 0);
  const pending = await db.notificationDelivery.findFirstOrThrow({
    where: { eventId: event.id }
  });
  assert.equal(pending.state, "FINISHED");
  assert.equal(pending.outcome, "CANCELLED");
  await assert.rejects(command(db, a.token, input));
  await assert.rejects(
    db.pushSubscription.update({
      where: { id: first.id },
      data: { ownerId: b.id }
    })
  );
});
test("session revocation, account deactivation, expired devices and age restrictions remove delivery eligibility", async () => {
  for (const change of ["logout", "deactivate", "expiry"] as const) {
    const a = await actor(),
      first = await command(db, a.token, body(a.id));
    if (change === "logout")
      await db.platformSession.deleteMany({
        where: { tokenHash: hashSessionToken(a.token) }
      });
    if (change === "deactivate")
      await db.platformUser.update({
        where: { id: a.id },
        data: { deactivatedAt: new Date() }
      });
    if (change === "expiry") {
      await db.pushSubscription.update({
        where: { id: first.id },
        data: { expiresAt: new Date(Date.now() - 1) }
      });
      await readPushSubscriptions(db, a.token);
    }
    const row = await db.pushSubscription.findUniqueOrThrow({
      where: { id: first.id }
    });
    assert.ok(row.revokedAt);
    assert.equal(row.endpoint, null);
    assert.equal(row.p256dh, null);
    assert.equal(row.auth, null);
    assert.equal(row.label, "Removed device");
  }
  for (const options of [{ adult: false }, { verified: false }]) {
    const a = await createPortalActor(db, "push", options);
    await assert.rejects(command(db, a.token, body(a.id)));
    assert.equal(
      (await readNotificationPreferences(db, a.token)).channels.push,
      false
    );
  }
});
test("category choices and quiet hours preserve ordinary DM defaults and exact retry/version protection", async () => {
  const a = await actor(),
    preferences = {
      operation: "preferences",
      ownerId: a.id,
      mutationId: randomUUID(),
      expectedVersion: 0,
      inApp: { messages: true, requests: false, reports: true, founder: false },
      pushCategories: ["messages"],
      quietHours: { start: 1320, end: 420, timeZone: "America/Chicago" }
    };
  const saved = await notificationPreferenceCommand(db, a.token, preferences);
  assert.deepEqual(
    await notificationPreferenceCommand(db, a.token, preferences),
    saved
  );
  assert.equal(
    (await db.socialPreferences.findUniqueOrThrow({ where: { ownerId: a.id } }))
      .contactRequests,
    "NOBODY"
  );
  const view = await readNotificationPreferences(db, a.token);
  assert.equal(view.preferences.inApp.founder, false);
  assert.equal(view.preferences.inApp.messages, true);
  assert.deepEqual(view.preferences.quietHours, preferences.quietHours);
  await assert.rejects(
    notificationPreferenceCommand(db, a.token, {
      ...preferences,
      mutationId: randomUUID()
    })
  );
  await assert.rejects(
    notificationPreferenceCommand(db, a.token, {
      ...preferences,
      ownerId: randomUUID(),
      mutationId: randomUUID(),
      expectedVersion: saved.version
    })
  );
  process.env.PUSH_ENABLED = "false";
  try {
    await assert.rejects(
      notificationPreferenceCommand(db, a.token, {
        ...preferences,
        mutationId: randomUUID(),
        expectedVersion: saved.version,
        pushCategories: ["messages", "requests"]
      })
    );
    await notificationPreferenceCommand(db, a.token, {
      ...preferences,
      mutationId: randomUUID(),
      expectedVersion: saved.version,
      pushCategories: []
    });
  } finally {
    process.env.PUSH_ENABLED = "true";
  }
  await assert.rejects(
    db.socialPreferences.update({
      where: { ownerId: a.id },
      data: { quietEnd: null }
    })
  );
});
test("quiet hours cover overnight windows and both DST gap/fold instants without delaying in-app state", () => {
  const at = (start: number, end: number, iso: string) =>
    quietHoursEnd(
      { start, end, timeZone: "America/Chicago" },
      new Date(iso)
    )?.toISOString() ?? null;
  assert.equal(
    at(1320, 420, "2026-09-13T04:00:00Z"),
    "2026-09-13T12:00:00.000Z"
  );
  assert.equal(at(1320, 420, "2026-09-13T12:00:00Z"), null);
  assert.equal(at(60, 150, "2026-03-08T07:30:00Z"), "2026-03-08T08:30:00.000Z");
  assert.equal(at(60, 90, "2026-11-01T06:40:00Z"), "2026-11-01T07:30:00.000Z");
  assert.equal(at(60, 90, "2026-11-01T07:20:00Z"), "2026-11-01T07:30:00.000Z");
  assert.equal(at(60, 90, "2026-11-01T07:30:00Z"), null);
  for (const value of [
    { start: 0, end: 0, timeZone: "UTC" },
    { start: 0, end: 4, timeZone: "Mars/Time" },
    { start: 0, end: 1440, timeZone: "UTC" }
  ])
    assert.throws(() => parseQuietHours(value));
});
