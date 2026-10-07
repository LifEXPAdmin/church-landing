import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { PrismaClient } from "@prisma/client";
import {
  assertPortalTestDatabase,
  createPortalActor,
  seedOperatorGrants,
  type PortalActor
} from "./seed-portal";
import { createSessionToken, hashSessionToken } from "../lib/platform/auth";
import {
  prepareNativePush,
  registerNativePush,
  revokeNativePush,
  listNativePushDevices,
  nativeInstallationHash
} from "../lib/platform/native-push";
import { revokeCurrentAccountSession } from "../lib/platform/account-sessions";
import { loginAccount } from "../lib/platform/accounts";
import {
  notificationWrite,
  enqueueNotification,
  deliverNotification,
  openNotification
} from "../lib/platform/notification-outbox";
import type { NativePushTransport } from "../lib/platform/native-push-provider";
import { adultMessageCommand } from "../lib/platform/adult-messages";
import {
  notificationPreferenceCommand,
  readNotificationPreferences
} from "../lib/platform/notification-preferences";
import { seedParticipation } from "./seed-post-participation";
import {
  relationshipCommand,
  readRelationships
} from "../lib/platform/relationships";
import { processNotificationFanoutBatch } from "../lib/platform/notification-fanout";

const db = new PrismaClient();
const names = [
  "NATIVE_PUSH_ENABLED",
  "NATIVE_PUSH_EXPO_PROJECT_ID",
  "NATIVE_PUSH_EXPO_ACCESS_TOKEN",
  "PUSH_ENABLED",
  "COMMUNITY_REPORTS_ENABLED"
];
const old = names.map((name) => process.env[name]);
before(async () => {
  await assertPortalTestDatabase(db);
  Object.assign(process.env, {
    NATIVE_PUSH_ENABLED: "true",
    NATIVE_PUSH_EXPO_PROJECT_ID: randomUUID(),
    NATIVE_PUSH_EXPO_ACCESS_TOKEN: "fictional-provider-access-token",
    PUSH_ENABLED: "false"
  });
});
after(async () => {
  names.forEach((name, i) =>
    old[i] === undefined
      ? delete process.env[name]
      : (process.env[name] = old[i])
  );
  await db.$disconnect();
});
const actor = () => createPortalActor(db, "nativepush");
async function draft(
  a: PortalActor,
  installationSecret = createSessionToken()
) {
  const prepared = await prepareNativePush(db, a.token, a.id, {
    installationSecret
  });
  return {
    id: randomUUID(),
    mutationId: randomUUID(),
    installationSecret,
    recoveryEpoch: prepared.recoveryEpoch,
    expectedInstallationVersion: prepared.installationVersion,
    provider: "EXPO" as const,
    platform: "IOS" as const,
    token: `ExpoPushToken[${randomUUID()}]`,
    label: "Fictional iPhone"
  };
}
async function device(a: PortalActor) {
  const input = await draft(a),
    saved = await registerNativePush(db, a.token, a.id, input);
  return { input, saved };
}
async function queue(a: PortalActor, id: string) {
  return notificationWrite(db, async (tx) => {
    const event = await tx.socialEvent.create({
      data: {
        key: `push-test:${randomUUID()}`,
        kind: "PUSH_TEST",
        actorId: a.id,
        recipientId: a.id
      }
    });
    await enqueueNotification(tx, event, id);
    await enqueueNotification(tx, event, id);
    assert.equal(
      await tx.notificationDelivery.count({ where: { eventId: event.id } }),
      1
    );
    return tx.notificationDelivery.findFirstOrThrow({
      where: { eventId: event.id }
    });
  });
}
const noWeb = async () => {
  throw Error("native work must not call web transport");
};
const deliver = (id: string, provider: NativePushTransport, now = new Date()) =>
  deliverNotification(db, id, noWeb, now, undefined, undefined, provider);
const accepted = (): NativePushTransport => ({
  send: async () => ({
    kind: "ticket",
    ticketId: randomUUID(),
    statusCode: 200
  }),
  receipt: async () => ({ kind: "accepted", statusCode: 200 })
});
const isConflict = (e: unknown) =>
  e instanceof Error && "status" in e && e.status === 409;

function delayedClaim(milliseconds: number) {
  return new Proxy(db, {
    get(target, key, receiver) {
      if (key === "$transaction")
        return async (...args: Parameters<typeof db.$transaction>) => {
          const result = await Reflect.apply(target.$transaction, target, args);
          if (result && typeof result === "object" && "nativeIntent" in result)
            await delay(milliseconds);
          return result;
        };
      return Reflect.get(target, key, receiver);
    }
  });
}
for (const phase of ["permission lock", "committed claim"]) {
  test(`native delivery expiry during a ${phase} wait never reaches the provider`, async () => {
    const a = await actor(),
      { input } = await device(a),
      row = await queue(a, input.id);
    await db.notificationDelivery.update({
      where: { id: row.id },
      data: { expiresAt: new Date(Date.now() + 2000) }
    });
    let sends = 0;
    const transport: NativePushTransport = {
      ...accepted(),
      send: async () => {
        sends++;
        return { kind: "ticket", ticketId: randomUUID(), statusCode: 200 };
      }
    };
    let held = Promise.resolve();
    if (phase === "permission lock") {
      let entered!: () => void;
      const locked = new Promise<void>((resolve) => {
        entered = resolve;
      });
      held = notificationWrite(db, async () => {
        entered();
        await delay(2250);
      });
      await locked;
    }
    const result = await deliverNotification(
      phase === "permission lock" ? db : delayedClaim(2250),
      row.id,
      noWeb,
      new Date(),
      undefined,
      undefined,
      transport
    );
    await held;
    assert.equal(sends, 0);
    assert.deepEqual(result, { done: true, outcome: "cancelled" });
    assert.equal(
      (await db.pushSubscription.findUniqueOrThrow({ where: { id: input.id } }))
        .revokedAt,
      null
    );
  });
}
test("native delivery recomputes its remaining TTL immediately after a slow claim", async () => {
  const a = await actor(),
    { input } = await device(a),
    row = await queue(a, input.id);
  const deadline = new Date(Date.now() + 10000);
  await db.notificationDelivery.update({
    where: { id: row.id },
    data: { expiresAt: deadline }
  });
  let sends = 0,
    observed = 0,
    remaining = 0;
  await deliverNotification(
    delayedClaim(2250),
    row.id,
    noWeb,
    new Date(),
    undefined,
    undefined,
    {
      ...accepted(),
      send: async (_token, _payload, ttl) => {
        sends++;
        observed = ttl;
        remaining = Math.floor((deadline.getTime() - Date.now()) / 1000);
        return { kind: "ticket", ticketId: randomUUID(), statusCode: 200 };
      }
    }
  );
  assert.equal(sends, 1);
  assert.ok(
    observed > 0 && observed <= remaining,
    `${observed} must not exceed the current ${remaining} seconds`
  );
});

async function nativeVolunteerRequest(boundary: "shift" | "event") {
  const f = await seedParticipation(db);
  const { input } = await device(f.morgan);
  const prefs = (await readNotificationPreferences(db, f.morgan.token))
    .preferences;
  await notificationPreferenceCommand(db, f.morgan.token, {
    operation: "preferences",
    ownerId: f.morgan.id,
    mutationId: randomUUID(),
    expectedVersion: prefs.version,
    inApp: prefs.inApp,
    quietHours: prefs.quietHours,
    pushCategories: ["commitments"]
  });
  const status = (await readRelationships(db, f.morgan.token, {
    view: "status",
    kind: "church",
    targetId: f.churchA.id
  })) as { version: number };
  await relationshipCommand(db, f.morgan.token, {
    operation: "author-bell",
    mutationId: randomUUID(),
    kind: "church",
    targetId: f.churchA.id,
    desired: true,
    expectedVersion: status.version
  });
  const slot = await f.slot();
  const start = new Date(Date.now() - 60000),
    deadline = new Date(Date.now() + 30000);
  await db.calendarOccurrence.update({
    where: { id: f.occurrence.id },
    data: {
      startAt: start,
      endAt: new Date(deadline.getTime() + (boundary === "shift" ? 60000 : 0))
    }
  });
  if (boundary === "shift")
    await db.postVolunteerSlot.update({
      where: { id: slot.id },
      data: { shiftStartAt: start, shiftEndAt: deadline }
    });
  const job = await db.notificationFanoutJob.findFirstOrThrow({
    where: { kind: "VOLUNTEER_REQUEST", sourceId: slot.id }
  });
  await processNotificationFanoutBatch(db, job.id);
  const row = await db.notificationDelivery.findFirstOrThrow({
    where: {
      event: { kind: "VOLUNTEER_REQUEST", sourceId: slot.id },
      subscriptionId: input.id
    }
  });
  return { f, slot, row, deadline };
}

test("native volunteer requests carry their shift deadline and refresh a shortened source TTL", async () => {
  const { slot, row, deadline } = await nativeVolunteerRequest("shift");
  assert.equal(row.expiresAt.getTime(), deadline.getTime());
  const shorter = new Date(Date.now() + 10000);
  await db.postVolunteerSlot.update({
    where: { id: slot.id },
    data: { shiftEndAt: shorter }
  });
  let sends = 0,
    observed = 0,
    remaining = 0;
  await deliverNotification(
    delayedClaim(2250),
    row.id,
    noWeb,
    new Date(),
    undefined,
    undefined,
    {
      ...accepted(),
      send: async (_token, _payload, ttl) => {
        sends++;
        observed = ttl;
        remaining = Math.floor((shorter.getTime() - Date.now()) / 1000);
        return { kind: "ticket", ticketId: randomUUID(), statusCode: 200 };
      }
    }
  );
  assert.equal(sends, 1);
  assert.ok(
    observed > 0 && observed <= remaining,
    `${observed} exceeds remaining source lifetime ${remaining}`
  );
});

test("native volunteer requests never send after their event ends during claim commit", async () => {
  const { f, row } = await nativeVolunteerRequest("event");
  await db.calendarOccurrence.update({
    where: { id: f.occurrence.id },
    data: { endAt: new Date(Date.now() + 2000) }
  });
  let sends = 0;
  const result = await deliverNotification(
    delayedClaim(2250),
    row.id,
    noWeb,
    new Date(),
    undefined,
    undefined,
    {
      ...accepted(),
      send: async () => {
        sends++;
        return { kind: "ticket", ticketId: randomUUID(), statusCode: 200 };
      }
    }
  );
  assert.equal(sends, 0);
  assert.deepEqual(result, { done: true, outcome: "cancelled" });
});

test("concurrent receipt workers lease a captured ticket once", async () => {
  const a = await actor(),
    { input } = await device(a),
    row = await queue(a, input.id);
  let polls = 0;
  const provider: NativePushTransport = {
    ...accepted(),
    receipt: async () => {
      polls++;
      await delay(50);
      return { kind: "pending", statusCode: 200 };
    }
  };
  await deliver(row.id, provider);
  const queued = await db.notificationDelivery.findUniqueOrThrow({
    where: { id: row.id }
  });
  await Promise.all([
    deliver(row.id, provider, queued.availableAt),
    deliver(row.id, provider, queued.availableAt)
  ]);
  assert.equal(polls, 1);
  assert.equal(
    (await db.notificationDelivery.findUniqueOrThrow({ where: { id: row.id } }))
      .nativeReceiptChecks,
    1
  );
});
for (const receiptRateLimit of [false, true])
  test(`native ${receiptRateLimit ? "receipt rate limit" : "send transient failure"} retries one logical event with a bounded send budget`, async () => {
    const a = await actor(),
      { input } = await device(a),
      row = await queue(a, input.id);
    let sends = 0,
      polls = 0;
    const provider: NativePushTransport = {
      send: async () => {
        sends++;
        return !receiptRateLimit && sends === 1
          ? { kind: "retry", statusCode: 503 }
          : { kind: "ticket", ticketId: randomUUID(), statusCode: 200 };
      },
      receipt: async () => {
        polls++;
        return receiptRateLimit && polls === 1
          ? { kind: "retry-delivery", statusCode: 200 }
          : { kind: "accepted", statusCode: 200 };
      }
    };
    let next = row;
    for (let i = 0; i < 5 && next.state !== "FINISHED"; i++) {
      await deliver(row.id, provider, next.availableAt);
      next = await db.notificationDelivery.findUniqueOrThrow({
        where: { id: row.id }
      });
    }
    assert.equal(next.outcome, "ACCEPTED");
    assert.equal(next.attempts, 2);
    assert.equal(sends, 2);
    assert.equal(
      await db.notificationDelivery.count({ where: { eventId: row.eventId } }),
      1
    );
  });
test("native test notification honors quiet hours beyond its source lifetime", async () => {
  const a = await actor(),
    { input } = await device(a),
    now = new Date();
  const minutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  await db.socialPreferences.create({
    data: {
      ownerId: a.id,
      quietStart: (minutes + 1439) % 1440,
      quietEnd: (minutes + 30) % 1440,
      quietTimeZone: "UTC"
    }
  });
  const row = await queue(a, input.id);
  assert.equal(row.state, "FINISHED");
  assert.equal(row.outcome, "CANCELLED");
  let sends = 0;
  await deliver(row.id, {
    ...accepted(),
    send: async () => {
      sends++;
      throw Error();
    }
  });
  assert.equal(sends, 0);
});

test("prepare is read-only and never reveals another account or routing material", async () => {
  const a = await actor(),
    b = await actor(),
    input = await draft(a);
  assert.equal(
    await db.nativePushInstallation.findUnique({
      where: { id: nativeInstallationHash(input.installationSecret) }
    }),
    null
  );
  await registerNativePush(db, a.token, a.id, input);
  const prepared = await prepareNativePush(db, b.token, b.id, {
    installationSecret: input.installationSecret
  });
  assert.equal(prepared.association, null);
  assert.equal(prepared.installationVersion, 1);
  const list = await listNativePushDevices(db, a.token, a.id);
  assert.equal(list.devices[0].isCurrentSession, true);
  for (const key of [
    input.token,
    input.installationSecret,
    nativeInstallationHash(input.installationSecret),
    a.id
  ])
    assert.ok(!JSON.stringify(list).includes(key));
});
test("exact registration retry retains one association and changed retry conflicts", async () => {
  const a = await actor(),
    { input, saved } = await device(a);
  assert.deepEqual(await registerNativePush(db, a.token, a.id, input), saved);
  await assert.rejects(
    registerNativePush(db, a.token, a.id, { ...input, label: "Changed" }),
    isConflict
  );
  assert.equal(
    await db.pushSubscription.count({ where: { ownerId: a.id } }),
    1
  );
  assert.equal(
    (
      await db.nativePushInstallation.findUniqueOrThrow({
        where: { id: nativeInstallationHash(input.installationSecret) }
      })
    ).version,
    1
  );
});
test("A to B replacement, removal and fresh A intent reject old retained requests", async () => {
  const a = await actor(),
    b = await actor(),
    neverCommittedA = await draft(a);
  const bInput = await draft(b, neverCommittedA.installationSecret);
  const bSaved = await registerNativePush(db, b.token, b.id, bInput);
  await assert.rejects(
    registerNativePush(db, a.token, a.id, neverCommittedA),
    isConflict
  );
  await revokeNativePush(db, b.token, b.id, {
    id: bSaved.id,
    expectedVersion: 1,
    mutationId: randomUUID()
  });
  await assert.rejects(
    registerNativePush(db, a.token, a.id, neverCommittedA),
    isConflict
  );
  const fresh = await draft(a, neverCommittedA.installationSecret);
  assert.equal(fresh.expectedInstallationVersion, 2);
  await registerNativePush(db, a.token, a.id, fresh);
  await assert.rejects(
    registerNativePush(db, b.token, b.id, bInput),
    isConflict
  );
});
test("same token from a different installation conflicts without changing its owner", async () => {
  const a = await actor(),
    b = await actor(),
    { input } = await device(a);
  const other = { ...(await draft(b)), token: input.token };
  await assert.rejects(
    registerNativePush(db, b.token, b.id, other),
    isConflict
  );
  assert.equal(
    (await db.pushSubscription.findUniqueOrThrow({ where: { id: input.id } }))
      .revokedAt,
    null
  );
  assert.equal(
    await db.nativePushInstallation.findUnique({
      where: { id: nativeInstallationHash(other.installationSecret) }
    }),
    null
  );
});
test("token rotation creates one fresh association and cancels the predecessor outbox", async () => {
  const a = await actor(),
    { input } = await device(a),
    delivery = await queue(a, input.id);
  const rotated = await draft(a, input.installationSecret);
  const saved = await registerNativePush(db, a.token, a.id, rotated);
  assert.equal(saved.installationVersion, 2);
  const retired = await db.pushSubscription.findUniqueOrThrow({
    where: { id: input.id }
  });
  assert.ok(retired.revokedAt);
  for (const key of [
    "nativeToken",
    "nativePlatform",
    "nativeProjectId",
    "nativeRecoveryEpoch",
    "bindingHash",
    "endpointHash",
    "installationHash",
    "installationVersion"
  ] as const)
    assert.equal(retired[key], null);
  assert.equal(
    (
      await db.notificationDelivery.findUniqueOrThrow({
        where: { id: delivery.id }
      })
    ).state,
    "FINISHED"
  );
  await assert.rejects(
    registerNativePush(db, a.token, a.id, input),
    isConflict
  );
});
test("historical revoke retry cannot remove a later registration", async () => {
  const a = await actor(),
    { input } = await device(a),
    removal = { id: input.id, expectedVersion: 1, mutationId: randomUUID() };
  const receipt = await revokeNativePush(db, a.token, a.id, removal);
  const next = await draft(a, input.installationSecret);
  await registerNativePush(db, a.token, a.id, next);
  assert.deepEqual(await revokeNativePush(db, a.token, a.id, removal), receipt);
  assert.equal(
    (await db.pushSubscription.findUniqueOrThrow({ where: { id: next.id } }))
      .revokedAt,
    null
  );
});
test("logout triggers scrub native material, advance its fence and retire a provider ticket", async () => {
  const a = await actor(),
    { input } = await device(a),
    row = await queue(a, input.id);
  await deliver(row.id, accepted());
  assert.ok(
    (await db.notificationDelivery.findUniqueOrThrow({ where: { id: row.id } }))
      .nativeTicketId
  );
  await revokeCurrentAccountSession(db, a.token, a.id);
  const sub = await db.pushSubscription.findUniqueOrThrow({
    where: { id: input.id }
  });
  assert.equal(sub.nativeToken, null);
  assert.equal(sub.installationHash, null);
  const retired = await db.notificationDelivery.findUniqueOrThrow({
    where: { id: row.id }
  });
  assert.equal(retired.state, "FINISHED");
  assert.equal(retired.nativeTicketId, null);
  assert.equal(
    (
      await db.nativePushInstallation.findUniqueOrThrow({
        where: { id: nativeInstallationHash(input.installationSecret) }
      })
    ).version,
    2
  );
});
test("old account logout after replacement cannot advance the replacement fence", async () => {
  const a = await actor(),
    b = await actor(),
    { input } = await device(a);
  const next = await draft(b, input.installationSecret);
  await registerNativePush(db, b.token, b.id, next);
  await revokeCurrentAccountSession(db, a.token, a.id);
  assert.equal(
    (
      await db.nativePushInstallation.findUniqueOrThrow({
        where: { id: nativeInstallationHash(input.installationSecret) }
      })
    ).version,
    2
  );
  assert.equal(
    (await db.pushSubscription.findUniqueOrThrow({ where: { id: next.id } }))
      .revokedAt,
    null
  );
});
test("new sign-in cannot replay an old session's successful registration", async () => {
  const a = await actor(),
    { input } = await device(a);
  const token = await loginAccount(
    db,
    a.email,
    a.password,
    "fictional native second sign-in"
  );
  await assert.rejects(registerNativePush(db, token, a.id, input), isConflict);
  await assert.rejects(
    prepareNativePush(db, token, "another-owner", {
      installationSecret: input.installationSecret
    })
  );
});
test("concurrent registration at the same generation admits one association", async () => {
  const a = await actor(),
    b = await actor(),
    first = await draft(a),
    second = await draft(b, first.installationSecret);
  const results = await Promise.allSettled([
    registerNativePush(db, a.token, a.id, first),
    registerNativePush(db, b.token, b.id, second)
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(
    await db.pushSubscription.count({
      where: {
        installationHash: nativeInstallationHash(first.installationSecret),
        revokedAt: null
      }
    }),
    1
  );
});
test("capacity failure rolls back new fence and leaves the eight existing devices", async () => {
  const a = await actor();
  for (let n = 0; n < 8; n++) await device(a);
  const ninth = await draft(a);
  await assert.rejects(
    registerNativePush(db, a.token, a.id, ninth),
    isConflict
  );
  assert.equal(
    await db.nativePushInstallation.findUnique({
      where: { id: nativeInstallationHash(ninth.installationSecret) }
    }),
    null
  );
  assert.equal(
    (await listNativePushDevices(db, a.token, a.id)).devices.length,
    8
  );
});
test("ticket is pending, receipt is acceptance, and repeated delivery never resends the logical event", async () => {
  const a = await actor(),
    { input } = await device(a),
    row = await queue(a, input.id);
  let sends = 0,
    receipts = 0;
  const ticketId = randomUUID();
  const provider: NativePushTransport = {
    send: async (token, payload, ttl) => {
      sends++;
      assert.equal(token, input.token);
      assert.deepEqual(Object.keys(payload).sort(), ["deliveryId", "tag"]);
      assert.ok(ttl > 0 && ttl <= 300);
      return { kind: "ticket", ticketId, statusCode: 200 };
    },
    receipt: async (ticket) => {
      receipts++;
      assert.equal(ticket, ticketId);
      return { kind: "accepted", statusCode: 200 };
    }
  };
  const first = await deliver(row.id, provider);
  assert.equal(first.done, false);
  let pending = await db.notificationDelivery.findUniqueOrThrow({
    where: { id: row.id }
  });
  assert.equal(pending.state, "QUEUED");
  assert.equal(pending.outcome, null);
  assert.equal(pending.attempts, 1);
  assert.ok(pending.availableAt < pending.expiresAt);
  assert.deepEqual(await deliver(row.id, provider, pending.availableAt), {
    done: true,
    outcome: "accepted"
  });
  await deliver(row.id, provider, pending.availableAt);
  pending = await db.notificationDelivery.findUniqueOrThrow({
    where: { id: row.id }
  });
  assert.equal(pending.nativeTicketId, null);
  assert.equal(sends, 1);
  assert.equal(receipts, 1);
});
test("pending and transient receipt polls retain the ticket without another send", async () => {
  const a = await actor(),
    { input } = await device(a),
    row = await queue(a, input.id);
  let sends = 0,
    polls = 0;
  const ticketId = randomUUID();
  const provider: NativePushTransport = {
    send: async () => {
      sends++;
      return { kind: "ticket", ticketId, statusCode: 200 };
    },
    receipt: async () =>
      ++polls === 1
        ? { kind: "pending", statusCode: 200 }
        : { kind: "retry", statusCode: 503 }
  };
  await deliver(row.id, provider);
  for (let i = 0; i < 2; i++) {
    const pending = await db.notificationDelivery.findUniqueOrThrow({
      where: { id: row.id }
    });
    assert.equal(
      (await deliver(row.id, provider, pending.availableAt)).done,
      false
    );
  }
  const pending = await db.notificationDelivery.findUniqueOrThrow({
    where: { id: row.id }
  });
  assert.equal(pending.nativeTicketId, ticketId);
  assert.equal(pending.attempts, 1);
  assert.equal(pending.nativeReceiptChecks, 2);
  assert.equal(sends, 1);
});
test("eighth send still polls its ticket for definitive acceptance", async () => {
  const a = await actor(),
    { input } = await device(a),
    row = await queue(a, input.id);
  await db.notificationDelivery.update({
    where: { id: row.id },
    data: { attempts: 7 }
  });
  await deliver(row.id, accepted());
  const pending = await db.notificationDelivery.findUniqueOrThrow({
    where: { id: row.id }
  });
  assert.equal(pending.attempts, 8);
  assert.deepEqual(await deliver(row.id, accepted(), pending.availableAt), {
    done: true,
    outcome: "accepted"
  });
});
test("late invalid-token callback cannot revoke a replacement association", async () => {
  const a = await actor(),
    b = await actor(),
    { input } = await device(a),
    row = await queue(a, input.id);
  let replacementId = "";
  const provider: NativePushTransport = {
    ...accepted(),
    send: async () => {
      const next = await draft(b, input.installationSecret);
      replacementId = next.id;
      await registerNativePush(db, b.token, b.id, next);
      return { kind: "invalid", statusCode: 200 };
    }
  };
  assert.deepEqual(await deliver(row.id, provider), {
    done: true,
    outcome: "cancelled"
  });
  assert.equal(
    (
      await db.pushSubscription.findUniqueOrThrow({
        where: { id: replacementId }
      })
    ).revokedAt,
    null
  );
});
test("invalid provider receipt revokes exactly its association and scrubs the ticket", async () => {
  const a = await actor(),
    { input } = await device(a),
    row = await queue(a, input.id);
  await deliver(row.id, accepted());
  const pending = await db.notificationDelivery.findUniqueOrThrow({
    where: { id: row.id }
  });
  assert.equal(
    (
      await deliver(
        row.id,
        {
          ...accepted(),
          receipt: async () => ({ kind: "invalid", statusCode: 200 })
        },
        pending.availableAt
      )
    ).done,
    true
  );
  assert.equal(
    (await db.pushSubscription.findUniqueOrThrow({ where: { id: input.id } }))
      .nativeToken,
    null
  );
  assert.equal(
    (await db.notificationDelivery.findUniqueOrThrow({ where: { id: row.id } }))
      .nativeTicketId,
    null
  );
});
test("disabled provider cancels work while device listing and removal remain usable", async () => {
  const a = await actor(),
    { input } = await device(a),
    row = await queue(a, input.id);
  process.env.NATIVE_PUSH_ENABLED = "false";
  try {
    const preferences = await readNotificationPreferences(db, a.token);
    assert.equal(preferences.channels.push, false);
    assert.equal(preferences.channels.browserPush, false);
    assert.equal(preferences.channels.devices, true);
    let calls = 0;
    const provider: NativePushTransport = {
      ...accepted(),
      send: async () => {
        calls++;
        throw Error();
      }
    };
    assert.deepEqual(await deliver(row.id, provider), {
      done: true,
      outcome: "cancelled"
    });
    assert.equal(calls, 0);
    assert.equal(
      (await listNativePushDevices(db, a.token, a.id)).devices.length,
      1
    );
    await revokeNativePush(db, a.token, a.id, {
      id: input.id,
      expectedVersion: 1,
      mutationId: randomUUID()
    });
  } finally {
    process.env.NATIVE_PUSH_ENABLED = "true";
  }
});
test("idle session cancels delivery and background work never renews it", async () => {
  const a = await actor(),
    { input } = await device(a),
    row = await queue(a, input.id);
  const session = await db.platformSession.findUniqueOrThrow({
    where: { tokenHash: hashSessionToken(a.token) }
  });
  const before = session.idleExpiresAt;
  await prepareNativePush(db, a.token, a.id, {
    installationSecret: input.installationSecret
  });
  await listNativePushDevices(db, a.token, a.id);
  assert.deepEqual(
    (await db.platformSession.findUniqueOrThrow({ where: { id: session.id } }))
      .idleExpiresAt,
    before
  );
  await db.platformSession.update({
    where: { id: session.id },
    data: { idleExpiresAt: new Date(Date.now() - 1000) }
  });
  assert.deepEqual(await deliver(row.id, accepted()), {
    done: true,
    outcome: "cancelled"
  });
});
test("native open resolves current authority for the expected account and exact session", async () => {
  const a = await actor(),
    b = await actor(),
    { input } = await device(a),
    row = await queue(a, input.id);
  assert.equal(
    (await openNotification(db, a.token, row.id, true, a.id, true)).href,
    "/platform/settings/notifications"
  );
  await assert.rejects(openNotification(db, a.token, row.id, true, b.id, true));
  await assert.rejects(openNotification(db, b.token, row.id, true, b.id, true));
  const another = await loginAccount(
    db,
    a.email,
    a.password,
    "fictional native other device"
  );
  await assert.rejects(openNotification(db, another, row.id, true, a.id, true));
});
test("existing dated consent and read activity checks still govern native message delivery", async () => {
  process.env.COMMUNITY_REPORTS_ENABLED = "true";
  await seedOperatorGrants(db, await actor(), ["REVIEW_COMMUNITY_REPORTS"]);
  const a = await actor(),
    b = await actor(),
    { input } = await device(b),
    ids = [a.id, b.id].sort();
  const conversation = await db.adultConversation.create({
    data: {
      participantAId: ids[0],
      participantBId: ids[1],
      sendingAllowed: true
    }
  });
  const message = () =>
    adultMessageCommand(db, a.token, {
      operation: "send",
      mutationId: randomUUID(),
      conversationId: conversation.id,
      expectedVersion: 1,
      content: "Private fictional body must not enter native payloads."
    });
  const first = await message();
  assert.equal(
    await db.notificationDelivery.count({
      where: { event: { messageId: first.id } }
    }),
    0
  );
  const prefs = (await readNotificationPreferences(db, b.token)).preferences;
  await notificationPreferenceCommand(db, b.token, {
    operation: "preferences",
    ownerId: b.id,
    mutationId: randomUUID(),
    expectedVersion: prefs.version,
    inApp: prefs.inApp,
    quietHours: prefs.quietHours,
    pushCategories: ["messages"]
  });
  const second = await message();
  const row = await db.notificationDelivery.findFirstOrThrow({
    where: { event: { messageId: second.id }, subscriptionId: input.id }
  });
  await db.socialEvent.update({
    where: { id: row.eventId },
    data: { activityReadAt: new Date() }
  });
  assert.deepEqual(await deliver(row.id, accepted()), {
    done: true,
    outcome: "cancelled"
  });
});
