import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { seedSupport } from "./seed-support";
import {
  assertPortalTestDatabase,
  createPortalActor,
  seedOperatorGrants
} from "./seed-portal";
import {
  readFeedbackWeekly,
  saveFeedbackWeekly,
  feedbackReviewWindow,
  feedbackBuildUrl
} from "../lib/platform/feedback-weekly";
import {
  replayRetentionControls,
  type RetentionControlEntry
} from "../lib/platform/retention-controls";
import {
  eraseAdminPersonalData,
  protectAdminCaseChanges
} from "../lib/platform/admin-privacy";
import { metricConfiguration } from "../lib/platform/platform-measurement";
import { metricDayStart } from "../lib/platform/metric-time";
const db = new PrismaClient();
before(() => assertPortalTestDatabase(db));
after(() => db.$disconnect());

test("weekly themes separate cases, messages and people, filter scope before counts and links, and preserve native ownership boundaries", async () => {
  const f = await seedSupport(db);
  await seedOperatorGrants(db, f.owner, ["MANAGE_PRODUCT_FEEDBACK"]);
  await seedOperatorGrants(db, f.backup, ["MANAGE_PRODUCT_FEEDBACK"]);
  const config = await metricConfiguration(db),
    window = feedbackReviewWindow(undefined, config.zone, new Date());
  const at = new Date(
    metricDayStart(window.from, config.zone).getTime() + 3600000
  );
  const group = await db.adminCaseGroup.create({
    data: {
      createdById: f.owner.id,
      title: "SECRET unauthorized group text",
      engineeringUrl: "https://github.com/example/private/issues/99"
    }
  });
  const created = [];
  for (let i = 0; i < 4; i++) {
    const hidden = i === 3,
      kind = i === 0 ? "BUG" : "SUGGESTION";
    const c = await db.supportCase.create({
      data: {
        requesterId: i === 2 ? f.memberB.id : f.memberA.id,
        category: kind === "BUG" ? "ACCOUNT_WEBSITE" : "FEATURE_SUGGESTION",
        featureDecision: kind === "SUGGESTION" ? "RECEIVED" : null,
        subject: hidden
          ? "SECRET unassigned case"
          : "Authorized weekly source " + i,
        description: "PRIVATE source body is not part of a theme summary",
        ownerGrantId: hidden ? f.backupGrant.id : f.ownerGrant.id,
        ownerGrantVersion: 1,
        createdAt: at,
        triageTags: ["navigation"],
        adminGroupId: group.id,
        priority: i === 0 ? "HIGH" : "NORMAL",
        feedback: { create: { kind, rating: null, createdAt: at } }
      }
    });
    created.push(c);
  }
  await db.supportMessage.create({
    data: {
      caseId: created[0].id,
      authorId: f.memberA.id,
      kind: "REPLY",
      body: "PRIVATE clarification",
      version: 2,
      createdAt: at
    }
  });
  await db.supportMessage.create({
    data: {
      caseId: created[0].id,
      authorId: f.owner.id,
      kind: "REPLY",
      body: "PRIVATE staff answer",
      version: 3,
      createdAt: at
    }
  });
  await db.supportAuditEvent.createMany({
    data: [
      {
        caseId: created[0].id,
        actorId: f.owner.id,
        action: "RESOLUTION",
        version: 4,
        toState: "RESOLVED",
        createdAt: at
      },
      {
        caseId: created[0].id,
        actorId: f.memberA.id,
        action: "REOPEN",
        version: 5,
        fromState: "RESOLVED",
        toState: "RECEIVED",
        createdAt: new Date(at.getTime() + 1000)
      }
    ]
  });
  const read = () => readFeedbackWeekly(db, f.owner.token, window.from);
  const r = await read();
  assert.equal(r.weekly.cases.cases, 3);
  assert.equal(r.weekly.cases.messages, 5);
  assert.equal(r.weekly.cases.requesters, 2);
  assert.equal(r.weekly.cases.themeCount, 2);
  assert.equal(r.weekly.cases.themes[0].cases, 3);
  assert.equal(r.weekly.cases.themes[0].messages, 5);
  assert.equal(r.weekly.cases.highImpactCount, 1);
  assert.equal(r.weekly.cases.reopenedCount, 1);
  assert.equal(r.weekly.cases.repeatedSuggestions.length, 2);
  assert.equal(r.weekly.growth, null);
  assert.equal(r.weekly.feedback, null);
  assert.ok(!JSON.stringify(r).includes("SECRET"));
  assert.ok(!JSON.stringify(r).includes("PRIVATE"));
  assert.ok(!JSON.stringify(r).includes(created[3].id));
  const outsider = await createPortalActor(db, "weeklyproductonly");
  await seedOperatorGrants(db, outsider, ["MANAGE_PRODUCT_FEEDBACK"]);
  assert.equal(
    (await readFeedbackWeekly(db, outsider.token, window.from)).weekly.cases
      .cases,
    0
  );
  await assert.rejects(readFeedbackWeekly(db, f.memberA.token, window.from));
  await seedOperatorGrants(db, f.owner, ["VIEW_PLATFORM_METRICS"]);
  assert.ok((await read()).weekly.feedback);
  await db.supportCapabilityGrant.update({
    where: { id: f.ownerGrant.id },
    data: { revokedAt: new Date(), version: { increment: 1 } }
  });
  const lost = await read();
  assert.equal(lost.weekly.cases.cases, 0);
  assert.equal(lost.weekly.cases.highImpactCount, 0);
  assert.equal(lost.weekly.cases.themes.length, 0);
  assert.ok(!JSON.stringify(lost).includes(created[0].subject));
});

test("weekly notes are actor-bound, exact-retry safe, concurrency checked, protected without retaining text in audits, and erased", async () => {
  const f = await seedSupport(db);
  await seedOperatorGrants(db, f.owner, ["MANAGE_PRODUCT_FEEDBACK"]);
  await seedOperatorGrants(db, f.backup, ["MANAGE_PRODUCT_FEEDBACK"]);
  const initial = await readFeedbackWeekly(db, f.owner.token);
  const input = {
    operation: "feedback-review",
    requestKey: randomUUID(),
    week: initial.weekly.window.from,
    expectedVersion: 0,
    learned: "PRIVATE operator learning",
    tryNext: "Test navigation clarity",
    checkNext: "Compare distinct reporters",
    buildUrl: "https://github.com/example/website/issues/12"
  };
  const [saved, retry] = await Promise.all([
    saveFeedbackWeekly(db, f.owner.token, input),
    saveFeedbackWeekly(db, f.owner.token, input)
  ]);
  assert.deepEqual(retry, saved);
  assert.equal(saved.version, 1);
  await assert.rejects(
    saveFeedbackWeekly(db, f.owner.token, {
      ...input,
      learned: "changed payload"
    })
  );
  assert.equal(
    (await readFeedbackWeekly(db, f.backup.token)).weekly.notes.learned,
    ""
  );
  await assert.rejects(saveFeedbackWeekly(db, f.memberA.token, input));
  const clear = {
    ...input,
    requestKey: randomUUID(),
    expectedVersion: 1,
    learned: "",
    tryNext: "",
    checkNext: "",
    buildUrl: ""
  };
  const writes = await Promise.allSettled([
    saveFeedbackWeekly(db, f.owner.token, clear),
    saveFeedbackWeekly(db, f.owner.token, {
      ...clear,
      requestKey: randomUUID(),
      learned: "different tab"
    })
  ]);
  assert.equal(writes.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(writes.filter((r) => r.status === "rejected").length, 1);
  const beforeProtection = await db.feedbackWeeklyReview.findUniqueOrThrow({
    where: { id: saved.id }
  });
  await assert.rejects(
    protectAdminCaseChanges(db, [saved.id], {
      record: async () => {
        throw Error("Fixture recovery store unavailable");
      }
    })
  );
  let protectedCount = 0;
  await protectAdminCaseChanges(db, [saved.id], {
    record: async () => {
      protectedCount++;
    }
  });
  assert.equal(protectedCount, 2);
  const controls = (
    await db.retentionControl.findMany({
      where: { kind: "FEEDBACK_REVIEW", sourceId: saved.id },
      orderBy: { version: "desc" }
    })
  ).map((c) => c.payload as unknown as RetentionControlEntry);
  const audits = await db.adminOperation.findMany({
    where: { sourceType: "FEEDBACK_REVIEW", sourceId: saved.id }
  });
  assert.ok(!JSON.stringify({ controls, audits }).includes("PRIVATE"));
  await db.feedbackWeeklyReview.update({
    where: { id: saved.id },
    data: {
      version: 1,
      learned: "PRIVATE stale restored learning",
      tryNext: "old text"
    }
  });
  await replayRetentionControls(db, controls);
  await replayRetentionControls(db, controls);
  const restored = await db.feedbackWeeklyReview.findUniqueOrThrow({
    where: { id: saved.id }
  });
  assert.equal(restored.version, beforeProtection.version);
  assert.equal(restored.learned, "");
  assert.equal(restored.tryNext, "");
  await db.platformOperatorGrant.updateMany({
    where: { userId: f.owner.id },
    data: { revokedAt: new Date() }
  });
  await assert.rejects(saveFeedbackWeekly(db, f.owner.token, input));
  await assert.rejects(readFeedbackWeekly(db, f.owner.token));
  await db.$transaction((tx) =>
    eraseAdminPersonalData(tx, f.owner.id, new Date())
  );
  assert.equal(
    await db.feedbackWeeklyReview.count({ where: { userId: f.owner.id } }),
    0
  );
});

test("weekly dates include DST's whole completed calendar week and canonical links reject secrets, embedded credentials and executable schemes", () => {
  const w = feedbackReviewWindow(
    undefined,
    "America/Chicago",
    new Date("2026-03-09T18:00:00Z")
  );
  assert.equal(w.from, "2026-03-02");
  assert.equal(w.through, "2026-03-08");
  assert.equal((Date.parse(w.end) - Date.parse(w.start)) / 3600000, 167);
  assert.throws(() =>
    feedbackReviewWindow(
      "2026-03-09",
      "America/Chicago",
      new Date("2026-03-09T18:00:00Z")
    )
  );
  assert.throws(() =>
    feedbackReviewWindow(
      "2026-03-03",
      "America/Chicago",
      new Date("2026-03-09T18:00:00Z")
    )
  );
  for (const url of [
    "javascript:alert(1)",
    "https://github.com/example/website/issues/1?token=secret",
    "https://owner:secret@github.com/example/website/issues/1",
    "https://untrusted.invalid/spec",
    "https://app.todoist.com/app/task/123#private"
  ])
    assert.throws(() => feedbackBuildUrl(url));
  for (const url of [
    "https://github.com/example/website/issues/1",
    "https://app.notion.com/p/0123456789abcdef0123456789abcdef",
    "https://app.todoist.com/app/task/ABC123"
  ])
    assert.equal(feedbackBuildUrl(url), url);
});
