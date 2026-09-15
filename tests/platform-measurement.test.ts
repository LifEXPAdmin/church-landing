import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import {
  assertPortalTestDatabase,
  createPortalActor,
  seedOperatorGrants
} from "./seed-portal";
import { handleMeasurementRequest } from "../lib/platform/measurement-boundary";
import {
  readMeasurementChoice,
  saveMeasurementChoice,
  recordMetricForeground,
  clearRestoredMeasurements,
  purgeExpiredMeasurements,
  metricConfiguration
} from "../lib/platform/platform-measurement";
import { accountConfig } from "../lib/platform/account-config";
import { metricDay } from "../lib/platform/metric-time";
const db = new PrismaClient();
before(async () => {
  await assertPortalTestDatabase(db);
  process.env.PLATFORM_MEASUREMENT_ENABLED = "true";
});
after(async () => {
  delete process.env.PLATFORM_MEASUREMENT_ENABLED;
  await db.$disconnect();
});
type Actor = Awaited<ReturnType<typeof createPortalActor>>;
const enable = async (actor: Actor, shareDevice = false) => {
  const old = await readMeasurementChoice(db, actor.token);
  const input = {
    operation: "choice",
    mutationId: randomUUID(),
    expectedVersion: old.version,
    enabled: true,
    shareDevice,
    referral: "UNKNOWN"
  };
  await saveMeasurementChoice(db, actor.token, input);
  return { state: await readMeasurementChoice(db, actor.token), input };
};
const signal = (state: Awaited<ReturnType<typeof readMeasurementChoice>>) => ({
  operation: "foreground",
  choiceVersion: state.version,
  afterForegroundAt: state.foregroundCursor,
  device: "PHONE",
  browser: "SAFARI"
});

test("new signup methods survive four later Google links; test accounts and deleted population stay distinct", async () => {
  const prefix = "metric_" + randomUUID().replaceAll("-", "").slice(0, 10),
    ids: string[] = [];
  for (let i = 0; i < 12; i++) {
    const user = await db.platformUser.create({
      data: {
        name: "Isolated metric account",
        username: prefix + "_" + i,
        email: prefix + "_" + i + "@example.test",
        metricCreationMethod: i < 6 ? "EMAIL" : "GOOGLE",
        metricExcluded: i >= 10
      }
    });
    ids.push(user.id);
  }
  for (let i = 0; i < 4; i++)
    await db.platformGoogleIdentity.create({
      data: {
        userId: ids[i],
        issuer: "https://accounts.google.com",
        subject: prefix + "_subject_" + i
      }
    });
  const methods = await db.platformUser.groupBy({
    by: ["metricCreationMethod"],
    where: { id: { in: ids }, metricExcluded: false },
    _count: true
  });
  assert.equal(
    methods.find((m) => m.metricCreationMethod === "EMAIL")?._count,
    6
  );
  assert.equal(
    methods.find((m) => m.metricCreationMethod === "GOOGLE")?._count,
    4
  );
  await assert.rejects(
    db.platformUser.update({
      where: { id: ids[0] },
      data: { metricCreationMethod: "GOOGLE" }
    })
  );
  await db.platformUser.updateMany({
    where: { id: { in: [ids[0], ids[1]] } },
    data: { deactivatedAt: new Date() }
  });
  await db.platformUser.update({
    where: { id: ids[0] },
    data: { deactivatedAt: null }
  });
  await db.platformUser.update({
    where: { id: ids[2] },
    data: { deactivatedAt: new Date(), deletionRequestedAt: new Date() }
  });
  await db.platformUser.update({
    where: { id: ids[2] },
    data: { erasedAt: new Date() }
  });
  const remaining = await db.platformUser.findMany({
    where: { id: { in: ids }, metricExcluded: false, erasedAt: null },
    select: { deactivatedAt: true, suspendedAt: true }
  });
  assert.equal(remaining.length, 9);
  assert.equal(
    remaining.filter((u) => !u.deactivatedAt && !u.suspendedAt).length,
    8
  );
  assert.equal(remaining.filter((u) => u.deactivatedAt).length, 1);
  const configuration = await db.$transaction((tx) => metricConfiguration(tx));
  const ledger = await db.platformMetricLifecycleDay.findMany({
    where: { version: configuration.version }
  });
  assert.ok(
    ledger.some((e) => e.fromState === "DEACTIVATED" && e.toState === "DELETED")
  );
  assert.ok(ledger.every((e) => !JSON.stringify(e).includes(prefix)));
  await assert.rejects(
    db.platformMetricConfiguration.update({
      where: { version: configuration.version },
      data: { zone: "UTC" }
    })
  );
});

test("foreground collection is opt-in, cursor-idempotent across tabs, and excludes replay from a former consent version", async () => {
  const actor = await createPortalActor(db, "measure");
  const original = await readMeasurementChoice(db, actor.token);
  assert.equal(original.enabled, false);
  assert.equal(original.foregroundCursor, null);
  assert.deepEqual(
    await recordMetricForeground(db, actor.token, signal(original)),
    { accepted: false }
  );
  const { state, input } = await enable(actor, true);
  const duplicate = await saveMeasurementChoice(db, actor.token, input);
  assert.equal(duplicate.version, state.version);
  const event = signal(state);
  const results = await Promise.all([
    recordMetricForeground(db, actor.token, event),
    recordMetricForeground(db, actor.token, event)
  ]);
  assert.ok(results.every((r) => r.accepted));
  assert.equal(
    await db.platformMetricActivityDay.count({
      where: { userId: state.ownerId }
    }),
    1
  );
  let choice = await db.platformMeasurementChoice.findUniqueOrThrow({
    where: { userId: state.ownerId }
  });
  assert.equal(choice.eligibleSessions, 1);
  assert.equal(choice.cohortEligible, true);
  const now = Date.now();
  await db.platformMeasurementChoice.update({
    where: { userId: state.ownerId },
    data: {
      lastForegroundAt: new Date(now - 31 * 60000),
      sessionStarts: [new Date(now - 65 * 60000), new Date(now - 31 * 60000)],
      eligibleSessions: 2
    }
  });
  await recordMetricForeground(db, actor.token, event); // Old null cursor cannot count another session.
  assert.equal(
    (
      await db.platformMeasurementChoice.findUniqueOrThrow({
        where: { userId: state.ownerId }
      })
    ).eligibleSessions,
    2
  );
  await recordMetricForeground(
    db,
    actor.token,
    signal(await readMeasurementChoice(db, actor.token))
  );
  choice = await db.platformMeasurementChoice.findUniqueOrThrow({
    where: { userId: state.ownerId }
  });
  assert.equal(choice.eligibleSessions, 3);
  assert.equal(choice.sessionStarts.length, 3);
  const day = await db.platformMetricActivityDay.findFirstOrThrow({
    where: { userId: state.ownerId }
  });
  assert.equal(day.device, "PHONE");
  assert.equal(day.browser, "SAFARI");
  await saveMeasurementChoice(db, actor.token, {
    operation: "choice",
    mutationId: randomUUID(),
    expectedVersion: state.version,
    enabled: true,
    shareDevice: false,
    referral: "CHURCH"
  });
  assert.equal(
    (
      await db.platformMetricActivityDay.findFirstOrThrow({
        where: { userId: state.ownerId }
      })
    ).device,
    "UNKNOWN"
  );
  assert.equal(
    (
      await db.platformMeasurementChoice.findUniqueOrThrow({
        where: { userId: state.ownerId }
      })
    ).cohortEligible,
    true
  );
  const current = await readMeasurementChoice(db, actor.token);
  await saveMeasurementChoice(db, actor.token, {
    operation: "choice",
    mutationId: randomUUID(),
    expectedVersion: current.version,
    enabled: false,
    shareDevice: false,
    referral: "UNKNOWN"
  });
  assert.equal(
    await db.platformMetricActivityDay.count({
      where: { userId: state.ownerId }
    }),
    0
  );
  choice = await db.platformMeasurementChoice.findUniqueOrThrow({
    where: { userId: state.ownerId }
  });
  assert.equal(choice.lastForegroundAt, null);
  assert.deepEqual(choice.sessionStarts, []);
  assert.equal(choice.cohortEligible, false);
  const restarted = await enable(actor);
  assert.equal(
    (
      await db.platformMeasurementChoice.findUniqueOrThrow({
        where: { userId: state.ownerId }
      })
    ).cohortEligible,
    false
  );
  assert.deepEqual(await recordMetricForeground(db, actor.token, event), {
    accepted: false
  });
  assert.equal(
    await db.platformMetricActivityDay.count({
      where: { userId: state.ownerId }
    }),
    0
  );
  assert.equal(
    (await recordMetricForeground(db, actor.token, signal(restarted.state)))
      .accepted,
    true
  );
});

test("HTTP collection rejects private payloads, guests, cross-site requests and mismatched accounts", async () => {
  const actor = await createPortalActor(db, "measurehttp"),
    { state } = await enable(actor);
  const config = accountConfig();
  const post = (
    body: Record<string, unknown>,
    owner = state.ownerId,
    origin = config.origin,
    token = actor.token
  ) =>
    handleMeasurementRequest(
      db,
      new Request(config.origin + "/api/platform/measurement", {
        method: "POST",
        headers: {
          Origin: origin,
          "Content-Type": "application/json",
          "x-expected-account": owner,
          Cookie: "church_platform_session=" + token
        },
        body: JSON.stringify(body)
      })
    );
  assert.equal((await post(signal(state))).status, 200);
  for (const extra of [
    { userId: "other" },
    { path: "/private/prayer" },
    { text: "secret" },
    { occurredAt: new Date().toISOString() },
    { targetId: "post" }
  ])
    assert.equal((await post({ ...signal(state), ...extra })).status, 400);
  assert.equal((await post(signal(state), "wrong-account")).status, 401);
  assert.equal(
    (await post(signal(state), state.ownerId, "https://example.test")).status,
    403
  );
  assert.equal(
    (await post(signal(state), state.ownerId, config.origin, "invalid")).status,
    401
  );
  const guest = await handleMeasurementRequest(
    db,
    new Request(config.origin + "/api/platform/measurement")
  );
  assert.ok(guest.status >= 400);
  assert.match(guest.headers.get("cache-control") ?? "", /no-store/);
  assert.ok(!JSON.stringify(await guest.json()).includes(state.ownerId));
});

test("staff, explicit test classification, paused configuration and suspended accounts add no optional activity", async () => {
  const actor = await createPortalActor(db, "measurestaff"),
    { state } = await enable(actor);
  await recordMetricForeground(db, actor.token, signal(state));
  assert.equal(
    await db.platformMetricActivityDay.count({ where: { userId: actor.id } }),
    1
  );
  await seedOperatorGrants(db, actor, ["VIEW_PLATFORM_METRICS"]);
  assert.equal(
    await db.platformMetricActivityDay.count({ where: { userId: actor.id } }),
    0
  );
  assert.equal((await readMeasurementChoice(db, actor.token)).enabled, false);
  assert.deepEqual(
    await recordMetricForeground(db, actor.token, signal(state)),
    { accepted: false }
  );
  assert.equal((await readMeasurementChoice(db, actor.token)).available, false);
  await db.platformOperatorGrant.updateMany({
    where: { userId: state.ownerId },
    data: { revokedAt: new Date() }
  });
  assert.equal((await readMeasurementChoice(db, actor.token)).enabled, false);
  const { state: restarted } = await enable(actor);
  assert.equal(
    (
      await db.platformMeasurementChoice.findUniqueOrThrow({
        where: { userId: actor.id }
      })
    ).cohortEligible,
    false
  );
  process.env.PLATFORM_MEASUREMENT_ENABLED = "false";
  try {
    assert.deepEqual(
      await recordMetricForeground(db, actor.token, signal(restarted)),
      { accepted: false }
    );
  } finally {
    process.env.PLATFORM_MEASUREMENT_ENABLED = "true";
  }
  await recordMetricForeground(db, actor.token, signal(restarted));
  assert.equal(
    await db.platformMetricActivityDay.count({ where: { userId: actor.id } }),
    1
  );
  await db.platformUser.update({
    where: { id: state.ownerId },
    data: { suspendedAt: new Date() }
  });
  assert.equal(
    await db.platformMetricActivityDay.count({
      where: { userId: state.ownerId }
    }),
    0
  );
  assert.equal(
    (
      await db.platformMeasurementChoice.findUniqueOrThrow({
        where: { userId: state.ownerId }
      })
    ).enabledAt,
    null
  );
  await assert.rejects(recordMetricForeground(db, actor.token, signal(state)));
  const excluded = await createPortalActor(db, "measuretest");
  const excludedState = await readMeasurementChoice(db, excluded.token);
  await db.platformUser.update({
    where: { id: excludedState.ownerId },
    data: { metricExcluded: true }
  });
  assert.equal(
    (await readMeasurementChoice(db, excluded.token)).available,
    false
  );
});

test("ninety-day expiry prunes session proof and invalidates old cursors; restored backups retire all optional choices", async () => {
  const actor = await createPortalActor(db, "measureexpiry"),
    { state } = await enable(actor);
  const old = new Date(Date.now() - 91 * 86400000),
    configuration = await db.$transaction((tx) => metricConfiguration(tx));
  await db.platformMeasurementChoice.update({
    where: { userId: state.ownerId },
    data: {
      lastForegroundAt: old,
      eligibleSessions: 1,
      sessionStarts: [old],
      onboardingStartedAt: old,
      onboardingSkippedAt: old
    }
  });
  await db.platformMetricActivityDay.create({
    data: {
      userId: state.ownerId,
      version: configuration.version,
      day: new Date(metricDay(old) + "T00:00:00Z"),
      firstAt: old,
      lastAt: old
    }
  });
  assert.equal(
    (await readMeasurementChoice(db, actor.token)).foregroundCursor,
    null
  );
  assert.equal(
    (await readMeasurementChoice(db, actor.token)).collecting,
    false
  );
  assert.deepEqual(
    await recordMetricForeground(db, actor.token, {
      ...signal(state),
      afterForegroundAt: old.toISOString()
    }),
    { accepted: false }
  );
  const removed = await db.$transaction((tx) => purgeExpiredMeasurements(tx));
  assert.ok(removed.days >= 1);
  const choice = await db.platformMeasurementChoice.findUniqueOrThrow({
    where: { userId: state.ownerId }
  });
  assert.equal(choice.lastForegroundAt, null);
  assert.equal(choice.onboardingStartedAt, null);
  assert.deepEqual(choice.sessionStarts, []);
  assert.ok(choice.version > state.version);
  await recordMetricForeground(
    db,
    actor.token,
    signal(await readMeasurementChoice(db, actor.token))
  );
  const retired = await db.$transaction((tx) => clearRestoredMeasurements(tx));
  assert.ok(retired.days > 0);
  assert.equal(await db.platformMetricActivityDay.count(), 0);
  assert.equal(
    await db.platformMeasurementChoice.count({
      where: { enabledAt: { not: null } }
    }),
    0
  );
});
