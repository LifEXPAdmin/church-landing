import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import {
  assertPortalTestDatabase,
  createPortalActor,
  seedOperatorGrants,
  seedPortal
} from "./seed-portal";
import {
  communityReportCommand,
  readCommunityReports
} from "../lib/platform/community-reports";
import {
  readSupport,
  supportCommand,
  SupportError
} from "../lib/platform/support";
import { CONTENT_RECONSIDERATION_NOTICE } from "../lib/platform/moderation-support";
import { purgeMessagingCandidate } from "../lib/platform/messaging-retention";
import {
  replayRetentionControls,
  inspectRestoredModeration,
  inspectRestoredAppeals,
  type RetentionControlEntry
} from "../lib/platform/retention-controls";
const db = new PrismaClient();
before(() => assertPortalTestDatabase(db));
after(() => db.$disconnect());
const denied = (p: Promise<unknown>, status: number) =>
  assert.rejects(
    p,
    (e: unknown) => e instanceof SupportError && e.status === status
  );
async function fixture(self = false) {
  const author = await createPortalActor(db, "appealauthor"),
    reviewer = self ? author : await createPortalActor(db, "appealreviewer"),
    reporter = await createPortalActor(db, "appealreporter");
  await seedOperatorGrants(db, reviewer, ["REVIEW_COMMUNITY_REPORTS"]);
  const post = await db.platformPost.create({
    data: { authorId: author.id, content: "Selected source only" }
  });
  const report = await db.communityReport.create({
    data: {
      reporterId: reporter.id,
      targetType: "POST",
      targetId: post.id,
      targetVersion: post.version,
      reason: "PRIVACY",
      details: "Secret reporter context " + randomUUID()
    }
  });
  const internal = "Private decision explanation " + randomUUID();
  await communityReportCommand(db, reviewer.token, {
    operation: "moderate",
    mutationId: randomUUID(),
    id: report.id,
    expectedVersion: 1,
    expectedSourceVersion: 1,
    expectedContextVersion: 0,
    action: "REMOVE",
    authorReason: "PRIVATE_INFORMATION",
    decisionReason: internal
  });
  const notice = (
    await readCommunityReports(db, author.token, { view: "decisions" })
  ).notices![0];
  const view = await readCommunityReports(db, author.token, {
    view: "decisions",
    id: notice.id
  });
  const input = {
    operation: "appeal",
    requestKey: randomUUID(),
    decisionId: notice.id,
    decisionVersion: view.appeal!.decisionVersion,
    reportVersion: view.appeal!.reportVersion,
    notice: CONTENT_RECONSIDERATION_NOTICE,
    consent: true,
    description: "Please reconsider this fictional content decision."
  };
  return {
    author,
    reviewer,
    reporter,
    post,
    report,
    internal,
    notice,
    view,
    input
  };
}
test("deliberate appeal reuses a help case and canonical reviewer without opening ordinary support or private report evidence", async () => {
  const f = await fixture();
  const supportBefore = await db.supportCapabilityGrant.count({
    where: { userId: f.reviewer.id }
  });
  assert.equal(f.view.appeal?.available, true);
  assert.equal(f.view.appeal?.reviewerName, f.reviewer.name);
  const result = await supportCommand(db, f.author.token, f.input);
  const repeated = await supportCommand(db, f.author.token, f.input);
  assert.equal(repeated.caseId, result.caseId);
  assert.equal(
    await db.supportCase.count({
      where: { moderationDecisionId: f.notice.id }
    }),
    1
  );
  assert.equal(
    await db.supportAuditEvent.count({
      where: { caseId: result.caseId, action: "CREATED" }
    }),
    1
  );
  assert.equal(
    await db.supportCapabilityGrant.count({ where: { userId: f.reviewer.id } }),
    supportBefore
  );
  assert.equal(
    (await db.communityReport.findUniqueOrThrow({ where: { id: f.report.id } }))
      .status,
    "FOLLOW_UP_REQUIRED"
  );
  assert.equal(
    (await db.platformPost.findUniqueOrThrow({ where: { id: f.post.id } }))
      .moderationState,
    "REMOVED"
  );
  for (const actor of [f.author, f.reviewer]) {
    const detail = (
      await readSupport(db, actor.token, "detail", { caseId: result.caseId })
    ).detail!;
    assert.equal(detail.description, f.input.description);
    assert.equal(detail.owner?.id, f.reviewer.id);
    assert.equal(detail.reconsideration, true);
    assert.deepEqual(detail.shareOptions, []);
    assert.deepEqual(detail.ownerOptions, []);
    const serialized = JSON.stringify(detail);
    for (const secret of [
      f.report.details,
      f.reporter.id,
      f.internal,
      f.post.content
    ])
      assert.ok(!serialized.includes(secret));
  }
  assert.equal(
    (await readSupport(db, f.reviewer.token, "inbox")).rows.some(
      (r) => r.id === result.caseId
    ),
    true
  );
  assert.equal(
    (await readSupport(db, f.author.token, "requests")).rows.some(
      (r) => r.id === result.caseId
    ),
    true
  );
  await denied(
    readSupport(db, f.reporter.token, "detail", { caseId: result.caseId }),
    404
  );
  await denied(
    supportCommand(db, f.author.token, {
      ...f.input,
      description: "Changed retry explanation"
    }),
    409
  );
  await denied(
    supportCommand(db, f.author.token, {
      ...f.input,
      requestKey: randomUUID()
    }),
    409
  );
  const staff = await createPortalActor(db, "ordinarysupport");
  await db.supportCapabilityGrant.createMany({
    data: ["RESPOND", "ASSIGN", "REDACT"].map((capability) => ({
      userId: staff.id,
      capability: capability as "RESPOND" | "ASSIGN" | "REDACT"
    }))
  });
  await denied(
    readSupport(db, staff.token, "detail", { caseId: result.caseId }),
    404
  );
  assert.ok(
    !(await readSupport(db, staff.token, "routing")).routing.some(
      (r) => r.id === result.caseId
    )
  );
  for (const op of ["share", "handoff", "redact"])
    await denied(
      supportCommand(db, f.reviewer.token, {
        operation: op,
        requestKey: randomUUID(),
        caseId: result.caseId,
        expectedVersion: 1
      }),
      404
    );
});
test("revocation immediately removes reviewer text and retry access while authors retain their own case with honest missing-owner status", async () => {
  const f = await fixture();
  const created = await supportCommand(db, f.author.token, f.input);
  const reply = {
    operation: "reply",
    requestKey: randomUUID(),
    caseId: created.caseId,
    expectedVersion: 1,
    body: "I am reviewing your explanation."
  };
  await supportCommand(db, f.reviewer.token, reply);
  await db.platformOperatorGrant.updateMany({
    where: { userId: f.reviewer.id, capability: "REVIEW_COMMUNITY_REPORTS" },
    data: { revokedAt: new Date() }
  });
  await denied(
    readSupport(db, f.reviewer.token, "detail", { caseId: created.caseId }),
    404
  );
  await denied(supportCommand(db, f.reviewer.token, reply), 404);
  const own = (
    await readSupport(db, f.author.token, "detail", { caseId: created.caseId })
  ).detail!;
  assert.equal(own.owner, null);
  assert.equal(own.unassigned, true);
  assert.equal(
    (
      await readCommunityReports(db, f.author.token, {
        view: "decisions",
        id: f.notice.id
      })
    ).appeal?.available,
    false
  );
  await db.platformOperatorGrant.updateMany({
    where: { userId: f.reviewer.id, capability: "REVIEW_COMMUNITY_REPORTS" },
    data: { revokedAt: null }
  });
  assert.equal((await supportCommand(db, f.reviewer.token, reply)).version, 2);
  assert.equal(
    await db.supportMessage.count({ where: { caseId: created.caseId } }),
    1
  );
});
test("consent, account identity and current decision version are mandatory before appeal creation", async () => {
  const f = await fixture();
  await denied(
    supportCommand(db, f.author.token, { ...f.input, consent: false }),
    400
  );
  await denied(supportCommand(db, f.reporter.token, f.input), 404);
  await denied(
    supportCommand(db, f.author.token, { ...f.input, reportVersion: 1 }),
    409
  );
  await denied(
    supportCommand(db, f.author.token, {
      ...f.input,
      ownerGrantId: "injected"
    }),
    400
  );
  assert.equal(
    await db.supportCase.count({
      where: { moderationDecisionId: f.notice.id }
    }),
    0
  );
});
test("sole-reviewer self cases remain explicit and reconsideration does not automatically lift restrictions", async () => {
  const f = await fixture(true),
    created = await supportCommand(db, f.author.token, f.input);
  const detail = (
    await readSupport(db, f.author.token, "detail", { caseId: created.caseId })
  ).detail!;
  assert.equal(detail.access.requester, true);
  assert.equal(detail.access.owner, true);
  assert.equal(detail.owner?.id, f.author.id);
  const resolution = {
    operation: "transition",
    requestKey: randomUUID(),
    caseId: created.caseId,
    expectedVersion: 1,
    status: "RESOLVED",
    reason:
      "The selected restriction remains appropriate after reconsideration."
  };
  await supportCommand(db, f.author.token, resolution);
  assert.equal(
    (await db.communityReport.findUniqueOrThrow({ where: { id: f.report.id } }))
      .status,
    "CLOSED"
  );
  assert.equal(
    (await db.platformPost.findUniqueOrThrow({ where: { id: f.post.id } }))
      .moderationState,
    "REMOVED"
  );
  await supportCommand(db, f.author.token, {
    operation: "reopen",
    requestKey: randomUUID(),
    caseId: created.caseId,
    expectedVersion: 2,
    reason: "New relevant information for reconsideration."
  });
  assert.equal(
    (await db.communityReport.findUniqueOrThrow({ where: { id: f.report.id } }))
      .closedAt,
    null
  );
});
test("church appeal requester and assigned reviewer both lose private text when their required church authority ends", async () => {
  const f = await seedPortal(db);
  await db.churchCapabilityGrant.createMany({
    data: [
      {
        userId: f.memberA.id,
        churchId: f.churchA.id,
        capability: "PUBLISH_CHURCH_POSTS"
      },
      {
        userId: f.coordinator.id,
        churchId: f.churchA.id,
        capability: "MODERATE_CHURCH_POSTS"
      }
    ]
  });
  const post = await db.platformPost.create({
    data: {
      authorId: f.memberA.id,
      authorChurchId: f.churchA.id,
      audience: "CHURCH",
      audienceChurchId: f.churchA.id,
      content: "Fictional church source"
    }
  });
  const report = await db.communityReport.create({
    data: {
      reporterId: f.contact.id,
      targetType: "POST",
      targetId: post.id,
      targetVersion: 1,
      scopeChurchId: f.churchA.id,
      reason: "SPAM"
    }
  });
  await communityReportCommand(db, f.coordinator.token, {
    operation: "moderate",
    mutationId: randomUUID(),
    id: report.id,
    expectedVersion: 1,
    expectedSourceVersion: 1,
    expectedContextVersion: 0,
    action: "HIDE",
    authorReason: "SPAM",
    decisionReason: "Selected church source needs review"
  });
  const id = (
    await readCommunityReports(db, f.memberA.token, { view: "decisions" })
  ).notices![0].id;
  const offer = (
    await readCommunityReports(db, f.memberA.token, { view: "decisions", id })
  ).appeal!;
  const input = {
    operation: "appeal",
    requestKey: randomUUID(),
    decisionId: id,
    decisionVersion: offer.decisionVersion,
    reportVersion: offer.reportVersion,
    description: "Fictional church explanation for the assigned reviewer",
    notice: offer.notice,
    consent: true
  };
  const created = await supportCommand(db, f.memberA.token, input);
  await db.churchCapabilityGrant.updateMany({
    where: { userId: f.memberA.id, capability: "PUBLISH_CHURCH_POSTS" },
    data: { revokedAt: new Date() }
  });
  await denied(
    readSupport(db, f.memberA.token, "detail", { caseId: created.caseId }),
    404
  );
  await denied(supportCommand(db, f.memberA.token, input), 404);
  await db.churchCapabilityGrant.updateMany({
    where: { userId: f.coordinator.id, capability: "MODERATE_CHURCH_POSTS" },
    data: { revokedAt: new Date() }
  });
  await denied(
    readSupport(db, f.coordinator.token, "detail", { caseId: created.caseId }),
    404
  );
});
test("report purge removes linked appeal text and retry records without affecting unrelated support or lifting source restrictions", async () => {
  const f = await fixture(),
    created = await supportCommand(db, f.author.token, f.input);
  const unrelated = await db.supportCase.create({
    data: {
      requesterId: f.author.id,
      category: "ACCOUNT_WEBSITE",
      subject: "Ordinary independent help",
      description: "Keep this independently owned request"
    }
  });
  await db.retentionPurge.create({
    data: {
      target: "REPORT",
      targetId: f.report.id,
      version: 3,
      policy: "GC-MSG-RETENTION-v1"
    }
  });
  await db.$transaction((tx) =>
    purgeMessagingCandidate(tx, {
      target: "REPORT",
      id: f.report.id,
      version: 3
    })
  );
  await db.retentionPurge.update({
    where: { target_targetId: { target: "REPORT", targetId: f.report.id } },
    data: { completedAt: new Date(), journaledAt: new Date() }
  });
  assert.equal(
    await db.supportCase.count({ where: { id: created.caseId } }),
    0
  );
  assert.equal(
    await db.supportOperation.count({ where: { caseId: created.caseId } }),
    0
  );
  assert.equal(await db.supportCase.count({ where: { id: unrelated.id } }), 1);
  assert.equal(
    (await db.platformPost.findUniqueOrThrow({ where: { id: f.post.id } }))
      .moderationState,
    "REMOVED"
  );
  await denied(supportCommand(db, f.author.token, f.input), 404);
});

test("restoration replays restrictions and fails closed when an older backup cannot prove a later restoration", async () => {
  const f = await fixture();
  const entries = async () =>
    (
      await db.retentionControl.findMany({
        where: { target: "REPORT", targetId: f.report.id },
        orderBy: { createdAt: "asc" }
      })
    ).map((r) => r.payload as RetentionControlEntry);
  const restricted = await db.platformPost.findUniqueOrThrow({
    where: { id: f.post.id }
  });
  await db.platformPost.update({
    where: { id: f.post.id },
    data: { moderationState: "VISIBLE", version: 1 }
  });
  await replayRetentionControls(db, (await entries()).reverse());
  const recovered = await db.platformPost.findUniqueOrThrow({
    where: { id: f.post.id }
  });
  assert.equal(recovered.moderationState, "REMOVED");
  assert.equal(recovered.version, restricted.version);
  assert.equal(recovered.content, f.post.content);
  assert.equal(recovered.audience, f.post.audience);
  assert.equal(recovered.replyAudience, f.post.replyAudience);
  const restore = async () => {
    const current = await readCommunityReports(db, f.reviewer.token, {
      view: "review",
      id: f.report.id
    });
    await communityReportCommand(db, f.reviewer.token, {
      operation: "moderate",
      mutationId: randomUUID(),
      id: f.report.id,
      expectedVersion: current.report!.version,
      expectedSourceVersion: current.source!.version,
      expectedContextVersion: 0,
      action: "RESTORE",
      authorReason: "CORRECTION_COMPLETE",
      decisionReason: "Current authorized source was re-inspected."
    });
  };
  await restore();
  const baseline = await inspectRestoredModeration(db);
  await db.platformPost.update({
    where: { id: f.post.id },
    data: { moderationState: "VISIBLE", version: 1 }
  });
  const protectedEntries = await entries();
  assert.doesNotMatch(
    JSON.stringify(protectedEntries),
    /Selected source only|Private decision|Secret reporter/
  );
  await replayRetentionControls(db, protectedEntries.reverse());
  assert.equal(
    (await db.platformPost.findUniqueOrThrow({ where: { id: f.post.id } }))
      .moderationState,
    "HIDDEN"
  );
  assert.equal(await inspectRestoredModeration(db), baseline + 1);
  await replayRetentionControls(db, protectedEntries);
  assert.equal(await inspectRestoredModeration(db), baseline + 1);
  await restore();
  assert.equal(await inspectRestoredModeration(db), baseline);
});

test("protected appeal versions detect missing replies without inventing or copying private text", async () => {
  const f = await fixture(),
    created = await supportCommand(db, f.author.token, f.input);
  await supportCommand(db, f.reviewer.token, {
    operation: "reply",
    requestKey: randomUUID(),
    caseId: created.caseId,
    expectedVersion: 1,
    body: "Private latest reply held only in the canonical help case."
  });
  const entries = (
    await db.retentionControl.findMany({
      where: { target: "REPORT", targetId: f.report.id }
    })
  ).map((r) => r.payload as RetentionControlEntry);
  assert.equal(entries.filter((r) => r.kind === "APPEAL").length, 2);
  assert.doesNotMatch(
    JSON.stringify(entries),
    /Please reconsider|Private latest reply/
  );
  const original = await db.supportCase.findUniqueOrThrow({
    where: { id: created.caseId }
  });
  const messages = await db.supportMessage.findMany({
    where: { caseId: created.caseId }
  });
  const baseline = await inspectRestoredAppeals(db);
  try {
    await db.supportMessage.deleteMany({
      where: { caseId: created.caseId, version: { gt: 1 } }
    });
    await db.supportCase.update({
      where: { id: created.caseId },
      data: { version: 1 }
    });
    await replayRetentionControls(db, entries);
    assert.equal(await inspectRestoredAppeals(db), baseline + 1);
    assert.equal(
      await db.supportMessage.count({ where: { caseId: created.caseId } }),
      0
    );
  } finally {
    await db.supportCase.update({
      where: { id: created.caseId },
      data: { version: original.version }
    });
    await db.supportMessage.createMany({ data: messages });
  }
  assert.equal(await inspectRestoredAppeals(db), baseline);
});
