import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import {
  assertPortalTestDatabase,
  createPortalActor,
  seedOperatorGrants
} from "./seed-portal";
import {
  aggregateMetrics,
  readPlatformMetrics
} from "../lib/platform/metric-report";
import { metricConfiguration } from "../lib/platform/platform-measurement";
import {
  metricDay,
  metricDayStart,
  metricAddDays
} from "../lib/platform/metric-time";
import { METRIC_POLICY } from "../lib/platform/metric-policy";
import { exportPlatformMetrics } from "../lib/platform/metric-export";
import {
  readMeasurementChoice,
  saveMeasurementChoice,
  recordMetricForeground,
  recordOnboardingPresentation
} from "../lib/platform/platform-measurement";
import { saveOnboarding } from "../lib/platform/onboarding";
import {
  prepareAccountExport,
  downloadAccountExport
} from "../lib/platform/account-export";
import { accountConfig } from "../lib/platform/account-config";
import { seedSupport, requestInput } from "./seed-support";
import { supportCommand } from "../lib/platform/support";
import { metricSupport } from "../lib/platform/metric-support";
import { metricWindow } from "../lib/platform/metric-time";
import { seedManagedChurch } from "./seed-church-management";
const db = new PrismaClient();
before(async () => {
  await assertPortalTestDatabase(db);
  // Retained fixtures from an interrupted prior attempt must not join this frozen cohort.
  await db.platformUser.updateMany({
    where: { username: { startsWith: "p_metriccoh_" } },
    data: { metricExcluded: true }
  });
});
after(() => db.$disconnect());
test("actual aggregate queries resolve A2's 10/8/6/4/2 cohort, exact-day maturity, distinct windows and current-source withdrawal", async () => {
  const viewer = await createPortalActor(db, "metricviewer");
  await seedOperatorGrants(db, viewer, ["VIEW_PLATFORM_METRICS"]);
  const target = await createPortalActor(db, "metrictarget");
  const config = await metricConfiguration(db),
    day = metricAddDays(metricDay(new Date(), config.zone), 1);
  const at = (offset: number) =>
    new Date(
      metricDayStart(metricAddDays(day, offset), config.zone).getTime() +
        12 * 3600000
    );
  const actors = [];
  for (let i = 0; i < 10; i++) {
    const actor = await createPortalActor(db, "metriccohort");
    actors.push(actor);
    await db.platformUser.update({
      where: { id: actor.id },
      data: { createdAt: at(0) }
    });
    await db.platformMeasurementChoice.create({
      data: {
        userId: actor.id,
        policy: METRIC_POLICY,
        enabledAt: at(0),
        cohortEligible: true
      }
    });
    for (const n of [
      i < 8 ? 0 : null,
      i < 4 ? 7 : null,
      i < 2 ? 30 : null
    ].filter((d): d is number => d !== null)) {
      await db.platformMetricActivityDay.create({
        data: {
          userId: actor.id,
          version: config.version,
          day: metricDayStart(metricAddDays(day, n), "UTC"),
          firstAt: at(n),
          lastAt: at(n)
        }
      });
    }
    if (i < 6)
      await db.platformFollow.create({
        data: { followerId: actor.id, followingId: target.id, createdAt: at(2) }
      });
  }
  const report = (
    await readPlatformMetrics(
      db,
      viewer.token,
      { from: day, through: metricAddDays(day, 31) },
      at(31)
    )
  ).report;
  assert.equal(report.current.registrations, 10);
  assert.deepEqual(report.funnel.foreground, {
    numerator: 8,
    denominator: 10,
    percent: 80
  });
  assert.deepEqual(report.funnel.firstValue, {
    numerator: 6,
    denominator: 10,
    percent: 60
  });
  assert.deepEqual(report.returns.d7, {
    numerator: 4,
    denominator: 10,
    percent: 40
  });
  assert.deepEqual(report.returns.d30, {
    numerator: 2,
    denominator: 10,
    percent: 20
  });
  assert.equal(report.current.active, 8);
  assert.equal(report.current.returning, 0);
  for (const zone of ["America/Los_Angeles", "Asia/Tokyo"]) {
    const other = await db.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL TIME ZONE '${zone}'`);
      return aggregateMetrics(
        tx,
        { from: day, through: metricAddDays(day, 31) },
        at(31)
      );
    });
    assert.deepEqual(other.current, report.current);
    assert.deepEqual(other.series, report.series);
    assert.deepEqual(other.funnel, report.funnel);
  }
  assert.equal(report.series.find((s) => s.day === day)?.active, 8);
  assert.equal(
    report.series.find((s) => s.day === metricAddDays(day, 1))?.active,
    0
  );
  const ten = (
    await readPlatformMetrics(
      db,
      viewer.token,
      { from: day, through: metricAddDays(day, 9) },
      at(9)
    )
  ).report;
  assert.equal(ten.returns.d7.percent, 40);
  assert.equal(ten.returns.d30.denominator, 0);
  assert.equal(ten.returns.d30.percent, null);
  assert.equal(ten.returns.d30Immature, 10);
  const returned = (
    await readPlatformMetrics(
      db,
      viewer.token,
      { from: metricAddDays(day, 7), through: metricAddDays(day, 7) },
      at(9)
    )
  ).report;
  assert.equal(returned.current.registrations, 0);
  assert.equal(returned.current.returning, 4);
  await db.platformFollow.deleteMany({ where: { followerId: actors[0].id } });
  const removed = (
    await readPlatformMetrics(
      db,
      viewer.token,
      { from: day, through: metricAddDays(day, 31) },
      at(31)
    )
  ).report;
  assert.equal(removed.funnel.firstValue.percent, 50);
  assert.equal(JSON.stringify(report).includes(actors[0].id), false);
  await assert.rejects(readPlatformMetrics(db, target.token, {}));
  await db.platformOperatorGrant.updateMany({
    where: { userId: viewer.id },
    data: { revokedAt: new Date() }
  });
  await assert.rejects(readPlatformMetrics(db, viewer.token, {}));
});
test("canonical successful-state timestamps survive edits and retries, clear on withdrawal, and begin again on a real new action", async () => {
  const actor = await createPortalActor(db, "metrictimes");
  const church = await db.church.create({
    data: {
      slug: randomUUID(),
      name: "Fictional timestamp church",
      summary: "Isolated",
      communityListed: true
    }
  });
  const row = await db.socialRelationship.create({
    data: { ownerId: actor.id, churchId: church.id, followingChurch: true }
  });
  assert.ok(row.followingSince);
  const edit = await db.socialRelationship.update({
    where: { id: row.id },
    data: { favorite: true }
  });
  assert.equal(
    edit.followingSince?.toISOString(),
    row.followingSince.toISOString()
  );
  const off = await db.socialRelationship.update({
    where: { id: row.id },
    data: { followingChurch: false, favorite: false }
  });
  assert.equal(off.followingSince, null);
  const on = await db.socialRelationship.update({
    where: { id: row.id },
    data: { followingChurch: true }
  });
  assert.ok(on.followingSince! >= row.followingSince);
});

test("two existing church activations add management without duplicate listings, and reapproval or unavailable topic owners cannot inflate growth", async () => {
  const owner = await createPortalActor(db, "metricorg");
  const config = await metricConfiguration(db);
  const day = metricDay(new Date(), config.zone);
  const now = () => new Date();
  const report = () => aggregateMetrics(db, { from: day, through: day }, now());
  const baseline = (await report()).organizations;
  const churches = [
    await seedManagedChurch(db, owner),
    await seedManagedChurch(db, await createPortalActor(db, "metricorgtwo"))
  ];
  const old = new Date(
    metricDayStart(metricAddDays(day, -20), config.zone).getTime() + 3600000
  );
  // These existing-directory fixtures were listed before this reporting day.
  await db.church.updateMany({
    where: { id: { in: churches.map((c) => c.church.id) } },
    data: { createdAt: old }
  });
  const activated = (await report()).organizations;
  assert.equal(activated.listings, baseline.listings + 2);
  assert.equal(activated.newListings, baseline.newListings);
  assert.equal(activated.managedChurches, baseline.managedChurches + 2);
  assert.equal(activated.newManagedChurches, baseline.newManagedChurches + 2);
  const original = churches[0].claim;
  await db.churchClaim.update({
    where: { id: original.id },
    data: { status: "REVOKED", activatedAt: old }
  });
  await db.churchClaim.create({
    data: {
      ownerId: original.ownerId,
      requestKey: randomUUID(),
      churchId: original.churchId,
      kind: "ACCESS",
      authority: {},
      profile: {},
      status: "APPROVED",
      approvedAt: now(),
      activatedAt: now()
    }
  });
  const reapproved = (await report()).organizations;
  assert.equal(reapproved.managedChurches, activated.managedChurches);
  assert.equal(reapproved.newManagedChurches, activated.newManagedChurches - 1);
  const topicOwner = await createPortalActor(db, "metricorgtopic");
  const key = randomUUID();
  await db.topicCommunity.create({
    data: {
      name: "Fictional metric topic",
      nameKey: key,
      slug: key,
      description: "Isolated source visibility fixture",
      rules: "Be kind",
      createdAt: new Date(Date.now() - 1000),
      ownerId: topicOwner.id,
      creatorId: topicOwner.id
    }
  });
  const visible = (await report()).organizations;
  assert.equal(visible.topicSpaces, baseline.topicSpaces + 1);
  assert.equal(visible.newTopicSpaces, baseline.newTopicSpaces + 1);
  await db.platformUser.update({
    where: { id: topicOwner.id },
    data: { suspendedAt: now() }
  });
  const hidden = (await report()).organizations;
  assert.equal(hidden.topicSpaces, baseline.topicSpaces);
  assert.equal(hidden.newTopicSpaces, baseline.newTopicSpaces);
});

test("aggregate export needs separate current authority, contains definitions and suppression, and each downloadable snapshot has its own content hash receipt", async () => {
  const viewer = await createPortalActor(db, "metricexport");
  await seedOperatorGrants(db, viewer, ["VIEW_PLATFORM_METRICS"]);
  const input = {
    operation: "metrics-export",
    requestKey: randomUUID(),
    preset: "7"
  };
  await assert.rejects(exportPlatformMetrics(db, viewer.token, input));
  await seedOperatorGrants(db, viewer, ["EXPORT_PLATFORM_METRICS"]);
  const result = await exportPlatformMetrics(db, viewer.token, input);
  assert.ok(result.csv.includes("definitions.activity"));
  assert.ok(result.csv.includes("configuration.zone,America/Chicago"));
  assert.ok(!result.csv.includes(viewer.email));
  assert.ok(!result.csv.includes(viewer.id));
  const audit = await db.adminOperation.findUniqueOrThrow({
    where: {
      actorId_requestKey: { actorId: viewer.id, requestKey: input.requestKey }
    }
  });
  assert.equal(audit.sourceType, "METRICS_EXPORT");
  assert.equal((audit.result as { sha256: string }).sha256, result.sha256);
  await assert.rejects(
    exportPlatformMetrics(db, viewer.token, input),
    /already recorded/
  );
  assert.equal(
    await db.adminOperation.count({
      where: { actorId: viewer.id, requestKey: input.requestKey }
    }),
    1
  );
  await db.platformOperatorGrant.updateMany({
    where: { userId: viewer.id, capability: "EXPORT_PLATFORM_METRICS" },
    data: { revokedAt: new Date() }
  });
  await assert.rejects(
    exportPlatformMetrics(db, viewer.token, {
      ...input,
      requestKey: randomUUID()
    })
  );
});

test("measured onboarding starts require the current choice; native completion, owner export and withdrawal preserve the privacy boundary", async () => {
  const previous = process.env.PLATFORM_MEASUREMENT_ENABLED;
  process.env.PLATFORM_MEASUREMENT_ENABLED = "true";
  try {
    const a = await createPortalActor(db, "metriconboard"),
      b = await createPortalActor(db, "metricprivate");
    const choice = {
      operation: "choice",
      mutationId: randomUUID(),
      expectedVersion: 0,
      enabled: true,
      shareDevice: false,
      referral: "UNKNOWN"
    };
    await saveMeasurementChoice(db, a.token, choice);
    let state = await readMeasurementChoice(db, a.token);
    await recordOnboardingPresentation(db, a.token, {
      operation: "onboarding-start",
      choiceVersion: state.version + 1
    });
    assert.equal(
      (
        await db.platformMeasurementChoice.findUniqueOrThrow({
          where: { userId: a.id }
        })
      ).onboardingStartedAt,
      null
    );
    await recordOnboardingPresentation(db, a.token, {
      operation: "onboarding-start",
      choiceVersion: state.version
    });
    const done = {
      operation: "onboarding",
      step: "all",
      dismissed: true,
      completion: true,
      expectedVersion: 0,
      mutationId: randomUUID()
    };
    await saveOnboarding(db, a.token, done);
    await saveOnboarding(db, a.token, done);
    const row = await db.platformMeasurementChoice.findUniqueOrThrow({
      where: { userId: a.id }
    });
    assert.ok(row.onboardingStartedAt);
    assert.ok(row.onboardingCompletedAt);
    assert.equal(row.onboardingSkippedAt, null);
    await recordMetricForeground(db, a.token, {
      operation: "foreground",
      choiceVersion: state.version,
      afterForegroundAt: state.foregroundCursor,
      device: "UNKNOWN",
      browser: "UNKNOWN"
    });
    const secret = accountConfig().rateSecret,
      proof = await prepareAccountExport(db, a.token, a.password, secret);
    const exported = JSON.parse(
      await downloadAccountExport(db, a.token, proof.authorization, secret)
    );
    assert.equal(exported.account.metricCreationMethod, "EMAIL");
    assert.equal(exported.measurementChoice.length, 1);
    assert.equal(exported.measuredForegroundDays.length, 1);
    assert.ok(!JSON.stringify(exported).includes(b.email));
    const foreign = await prepareAccountExport(db, b.token, b.password, secret),
      other = JSON.parse(
        await downloadAccountExport(db, b.token, foreign.authorization, secret)
      );
    assert.equal(other.measurementChoice.length, 0);
    assert.equal(other.measuredForegroundDays.length, 0);
    state = await readMeasurementChoice(db, a.token);
    await saveMeasurementChoice(db, a.token, {
      ...choice,
      mutationId: randomUUID(),
      expectedVersion: state.version,
      enabled: false
    });
    assert.equal(
      await db.platformMetricActivityDay.count({ where: { userId: a.id } }),
      0
    );
    assert.equal(
      (
        await db.platformMeasurementChoice.findUniqueOrThrow({
          where: { userId: a.id }
        })
      ).onboardingCompletedAt,
      null
    );
    await saveMeasurementChoice(db, b.token, {
      ...choice,
      mutationId: randomUUID()
    });
    const bState = await readMeasurementChoice(db, b.token);
    await recordOnboardingPresentation(db, b.token, {
      operation: "onboarding-start",
      choiceVersion: bState.version
    });
    // Invalid optional configuration must roll back only measurement, not the native walkthrough choice.
    const zone = process.env.PLATFORM_METRICS_ZONE;
    process.env.PLATFORM_METRICS_ZONE = "invalid-zone";
    try {
      const native = await saveOnboarding(db, b.token, {
        operation: "onboarding",
        step: "all",
        dismissed: true,
        expectedVersion: 0,
        mutationId: randomUUID()
      });
      assert.equal(native.version, 1);
      assert.equal(
        (
          await db.platformMeasurementChoice.findUniqueOrThrow({
            where: { userId: b.id }
          })
        ).onboardingSkippedAt,
        null
      );
    } finally {
      if (zone === undefined) delete process.env.PLATFORM_METRICS_ZONE;
      else process.env.PLATFORM_METRICS_ZONE = zone;
    }
  } finally {
    if (previous === undefined) delete process.env.PLATFORM_MEASUREMENT_ENABLED;
    else process.env.PLATFORM_MEASUREMENT_ENABLED = previous;
  }
});

test("case retries and extra acknowledgments add no cases or human responses; unlike request types keep separate denominators", async () => {
  const f = await seedSupport(db),
    window = metricWindow({ preset: "7" });
  const before = (await metricSupport(db, window, new Date())).find(
    (x) => x.type === "SUPPORT"
  );
  const input = await requestInput(db, f.memberA.token),
    first = await supportCommand(db, f.memberA.token, input);
  await supportCommand(db, f.memberA.token, input);
  await supportCommand(db, f.memberA.token, {
    ...input,
    requestKey: randomUUID()
  });
  await assert.rejects(
    db.supportMessage.create({
      data: {
        caseId: first.caseId,
        authorId: f.owner.id,
        body: "Automatic fixture acknowledgment",
        kind: "ACKNOWLEDGMENT",
        version: 1
      }
    })
  );
  await db.supportMessage.create({
    data: {
      caseId: first.caseId,
      authorId: f.owner.id,
      body: "Unconfirmed imported fixture reply",
      kind: "REPLY",
      version: 999
    }
  });
  let rows = await metricSupport(db, metricWindow({ preset: "7" }), new Date()),
    current = rows.find((x) => x.type === "SUPPORT")!;
  assert.equal(current.cases - (before?.cases ?? 0), 2);
  assert.equal(current.requesters - (before?.requesters ?? 0), 1);
  assert.equal(current.responded, before?.responded ?? 0);
  const reply = {
    operation: "reply",
    requestKey: randomUUID(),
    caseId: first.caseId,
    expectedVersion: first.version,
    body: "A substantive authorized fixture response."
  };
  await supportCommand(db, f.owner.token, reply);
  await supportCommand(db, f.owner.token, reply);
  rows = await metricSupport(db, metricWindow({ preset: "7" }), new Date());
  current = rows.find((x) => x.type === "SUPPORT")!;
  assert.equal(current.responded - (before?.responded ?? 0), 1);
  assert.equal(current.cases - (before?.cases ?? 0), 2);
  assert.ok(current.meanFirstResponseHours !== null);
});
