import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import {
  assertPortalTestDatabase,
  createPortalActor,
  seedOperatorGrants
} from "./seed-portal";
import { seedSupport, requestInput } from "./seed-support";
import { metricConfiguration } from "../lib/platform/platform-measurement";
import {
  metricWindow,
  metricDay,
  metricDayStart,
  metricAddDays
} from "../lib/platform/metric-time";
import { metricFeedback } from "../lib/platform/metric-feedback";
import { readPlatformMetrics } from "../lib/platform/metric-report";
import { metricCsv } from "../lib/platform/metric-export";
import { metricSupport } from "../lib/platform/metric-support";
import { supportCommand } from "../lib/platform/support";
import { METRIC_POLICY } from "../lib/platform/metric-policy";
import { FEEDBACK_PROMPT_POLICY } from "../lib/platform/feedback-prompt-policy";

const db = new PrismaClient();
before(() => assertPortalTestDatabase(db));
after(() => db.$disconnect());

async function fixture() {
  const config = await metricConfiguration(db);
  const day = metricAddDays(metricDay(new Date(), config.zone), 61);
  const at = new Date(
    metricDayStart(day, config.zone).getTime() + 12 * 3600000
  );
  const now = new Date(at.getTime() + 2 * 3600000);
  const window = metricWindow({ from: day, through: day }, now, config.zone);
  const ids: string[] = [];
  async function actor() {
    const a = await createPortalActor(db, "feedbackmetrics");
    ids.push(a.id);
    await db.platformMeasurementChoice.create({
      data: {
        userId: a.id,
        policy: METRIC_POLICY,
        enabledAt: new Date(at.getTime() - 86400000)
      }
    });
    return a;
  }
  async function exposure(userId: string, shownAt: Date | null = at) {
    return db.feedbackPromptClaim.create({
      data: {
        id: randomUUID(),
        userId,
        campaign: FEEDBACK_PROMPT_POLICY,
        configurationVersion: config.version,
        measurementVersion: 1,
        createdAt: at,
        expiresAt: new Date(at.getTime() + 120000),
        shownAt,
        finishedAt: new Date(at.getTime() + 60000)
      }
    });
  }
  async function receipt(
    userId: string,
    rating: number | null,
    promptClaimId?: string,
    createdAt = new Date(at.getTime() + 60000)
  ) {
    return db.supportCase.create({
      data: {
        requesterId: userId,
        category: "ACCOUNT_WEBSITE",
        subject: "SECRET feedback subject",
        description: "SECRET private body",
        createdAt,
        feedback: {
          create: {
            kind: "GENERAL",
            rating,
            createdAt,
            entryPoint: promptClaimId ? "PROMPT" : "VOLUNTARY",
            promptClaimId
          }
        }
      }
    });
  }
  return {
    config,
    day,
    at,
    now,
    window,
    actor,
    exposure,
    receipt,
    read: () => metricFeedback(db, window, config.version, now),
    cleanup: () =>
      db.platformUser.updateMany({
        where: { id: { in: ids } },
        data: { metricExcluded: true }
      })
  };
}

test("persisted A2 ratings, deduplicated prompt coverage, private-free export and complementary suppression reconcile", async () => {
  const f = await fixture();
  try {
    const actors = [];
    const exposures = [];
    for (let i = 0; i < 10; i++) {
      const a = await f.actor();
      actors.push(a);
      exposures.push(await f.exposure(a.id));
      if (i < 6)
        await f.receipt(
          a.id,
          [1, 3, 4, 5, 5, null][i],
          i < 2 ? exposures[i].id : undefined
        );
    }
    await f.exposure(actors[0].id, null);
    const r = await f.read();
    assert.equal(r.current.feedbackCount, 6);
    assert.equal(r.current.requesters, 6);
    assert.equal(r.current.ratingCount, 5);
    assert.equal(r.current.mean, 3.6);
    assert.deepEqual(r.current.prompt, {
      numerator: 2,
      denominator: 10,
      percent: 20
    });
    assert.equal(r.current.distributionSuppressed, true);
    assert.ok(r.current.distribution.every((v) => v.count === null));
    assert.ok(
      r.current.entries.every((v) => v.cases === null && v.requesters === null)
    );
    assert.equal(r.previous.feedbackCount, 0);
    assert.deepEqual(await f.read(), r);
    for (const zone of ["Asia/Tokyo", "America/Los_Angeles"]) {
      const other = await db.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`SET LOCAL TIME ZONE '${zone}'`);
        return metricFeedback(tx, f.window, f.config.version, f.now);
      });
      assert.deepEqual(other, r);
    }
    const viewer = await createPortalActor(db, "feedbackmetricsviewer");
    await assert.rejects(
      readPlatformMetrics(
        db,
        viewer.token,
        { from: f.day, through: f.day },
        f.now
      )
    );
    await seedOperatorGrants(db, viewer, ["VIEW_PLATFORM_METRICS"]);
    const full = (
      await readPlatformMetrics(
        db,
        viewer.token,
        { from: f.day, through: f.day },
        f.now
      )
    ).report;
    assert.deepEqual(full.feedback, r);
    const csv = metricCsv(full);
    assert.ok(csv.includes("feedback.current.mean,3.6"));
    assert.ok(csv.includes("feedback.current.prompt.percent,20"));
    assert.ok(
      csv.includes(
        "feedback.current.distribution.0.count,Unavailable or suppressed"
      )
    );
    for (const a of actors) {
      assert.ok(!csv.includes(a.id));
      assert.ok(!csv.includes(a.email));
    }
    assert.ok(!csv.includes("SECRET"));
    await db.platformOperatorGrant.updateMany({
      where: { userId: viewer.id },
      data: { revokedAt: new Date() }
    });
    await assert.rejects(
      readPlatformMetrics(
        db,
        viewer.token,
        { from: f.day, through: f.day },
        f.now
      )
    );
  } finally {
    await f.cleanup();
  }
});

test("coverage uses the displayed cohort, later responses, current consent and redaction without mislabeling lost proof as voluntary", async () => {
  const f = await fixture();
  try {
    const actors = [],
      receipts = [];
    for (let i = 0; i < 6; i++) {
      const a = await f.actor();
      actors.push(a);
      const e = await f.exposure(a.id);
      receipts.push(await f.receipt(a.id, 4, e.id));
    }
    let r = await f.read();
    assert.equal(r.current.distributionSuppressed, false);
    assert.equal(r.current.distribution.find((v) => v.rating === 4)?.count, 6);
    assert.equal(r.current.entries.find((v) => v.key === "PROMPT")?.cases, 6);
    // An unrelated choice edit must not destroy a still-consented shown exposure.
    await db.platformMeasurementChoice.update({
      where: { userId: actors[0].id },
      data: { version: { increment: 1 }, shareDevice: true }
    });
    r = await f.read();
    assert.equal(r.current.prompt.denominator, 6);
    await db.platformMeasurementChoice.updateMany({
      where: { userId: { in: actors.map((a) => a.id) } },
      data: { enabledAt: null, version: { increment: 1 } }
    });
    r = await f.read();
    assert.equal(r.current.feedbackCount, 6);
    assert.deepEqual(r.current.prompt, {
      numerator: 0,
      denominator: 0,
      percent: null
    });
    assert.equal(
      r.current.entries.find((v) => v.key === "UNATTRIBUTED")?.cases,
      6
    );
    assert.equal(
      r.current.entries.find((v) => v.key === "VOLUNTARY")?.cases,
      0
    );
    await db.feedbackSubmission.update({
      where: { caseId: receipts[0].id },
      data: { redactedAt: f.now, rating: null }
    });
    await db.platformUser.update({
      where: { id: actors[1].id },
      data: { metricExcluded: true }
    });
    r = await f.read();
    assert.equal(r.current.feedbackCount, 4);
    assert.equal(r.current.limitedResponses, true);
    assert.equal(r.current.entriesSuppressed, true);
  } finally {
    await f.cleanup();
  }
});

test("the exposure window owns late responses and stale, unseen and future claims add no denominator", async () => {
  const f = await fixture();
  try {
    const a = await f.actor();
    const shown = new Date(f.at.getTime() - 86400000);
    await db.platformMeasurementChoice.update({
      where: { userId: a.id },
      data: { enabledAt: new Date(shown.getTime() - 3600000) }
    });
    const e = await f.exposure(a.id);
    await db.feedbackPromptClaim.update({
      where: { id: e.id },
      data: {
        createdAt: shown,
        shownAt: shown,
        expiresAt: new Date(shown.getTime() + 120000),
        finishedAt: new Date(shown.getTime() + 60000)
      }
    });
    await f.receipt(a.id, null, e.id);
    await f.exposure(a.id, null);
    const future = await f.exposure(a.id);
    await db.feedbackPromptClaim.update({
      where: { id: future.id },
      data: { shownAt: new Date(f.now.getTime() + 1000) }
    });
    const stale = await f.exposure(a.id);
    await db.feedbackPromptClaim.update({
      where: { id: stale.id },
      data: { configurationVersion: f.config.version + 1 }
    });
    const r = await f.read();
    assert.equal(r.current.feedbackCount, 1);
    assert.equal(r.current.prompt.denominator, 0);
    assert.equal(r.previous.feedbackCount, 0);
    assert.deepEqual(r.previous.prompt, {
      numerator: 1,
      denominator: 1,
      percent: 100
    });
  } finally {
    await f.cleanup();
  }
});

test("an authorized resolution-only reply stops first human response time while an acknowledgment and requester reply do not", async () => {
  const f = await seedSupport(db);
  const input = await requestInput(db, f.memberA.token);
  const result = await supportCommand(db, f.memberA.token, input);
  const config = await metricConfiguration(db);
  const day = metricDay(new Date(), config.zone);
  const current = () =>
    metricSupport(db, metricWindow({ from: day, through: day }), new Date());
  const before = (await current()).find((r) => r.type === "SUPPORT")!;
  await supportCommand(db, f.memberA.token, {
    operation: "reply",
    requestKey: randomUUID(),
    caseId: result.caseId,
    expectedVersion: result.version,
    body: "Fictional requester clarification"
  });
  assert.equal(
    (await current()).find((r) => r.type === "SUPPORT")!.responded,
    before.responded
  );
  const c = await db.supportCase.findUniqueOrThrow({
    where: { id: result.caseId }
  });
  await supportCommand(db, f.owner.token, {
    operation: "transition",
    requestKey: randomUUID(),
    caseId: c.id,
    expectedVersion: c.version,
    status: "RESOLVED",
    reason: "Fictional authorized resolution explanation"
  });
  const after = (await current()).find((r) => r.type === "SUPPORT")!;
  assert.equal(after.responded, before.responded + 1);
});
