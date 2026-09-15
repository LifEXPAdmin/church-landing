import test, { beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { seedSupport } from "./seed-support";
import { seedOperatorGrants } from "./seed-portal";
import { supportCommand, readSupport } from "../lib/platform/support";
import { FEEDBACK_NOTICE } from "../lib/platform/feedback-policy";
import {
  readFeedbackIdeas,
  feedbackIdeaInterestCommand
} from "../lib/platform/feedback-ideas";
import {
  readFeedbackIdeaAdministration,
  readFeedbackIdeaModeration,
  feedbackIdeaAdminCommand
} from "../lib/platform/feedback-idea-admin";
import {
  readCommunityReports,
  communityReportCommand
} from "../lib/platform/community-reports";
import { readAdminQueue } from "../lib/platform/admin-queue";
import { handleFeedbackIdeasRequest } from "../lib/platform/feedback-idea-boundary";
import { handleAdminRequest } from "../lib/platform/admin-boundary";
import { handleSupportRequest } from "../lib/platform/support-boundary";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { accountConfig } from "../lib/platform/account-config";
import { currentRelease } from "../lib/platform/release-content";
import {
  replayRetentionControls,
  type RetentionControlEntry
} from "../lib/platform/retention-controls";
import { eraseAdminPersonalData } from "../lib/platform/admin-privacy";
const db = new PrismaClient();
let f: Awaited<ReturnType<typeof seedSupport>>;
beforeEach(async () => {
  f = await seedSupport(db);
  process.env.FEEDBACK_INTAKE_ENABLED = "true";
  process.env.SUPPORT_INTAKE_ENABLED = "true";
  process.env.FEEDBACK_IDEAS_ENABLED = "true";
  await seedOperatorGrants(db, f.owner, ["MANAGE_PRODUCT_FEEDBACK"]);
  await seedOperatorGrants(db, f.backup, ["MANAGE_PRODUCT_FEEDBACK"]);
});
after(() => db.$disconnect());
const deny = (p: Promise<unknown>, status = 404) =>
  assert.rejects(
    p,
    (e: unknown) =>
      !!e && typeof e === "object" && "status" in e && e.status === status
  );
async function suggestion(token = f.memberA.token, allowIdea = true) {
  const intake = (await readSupport(db, token, "new", { feedbackOnly: true }))
    .intake;
  return supportCommand(db, token, {
    operation: "feedback-create",
    requestKey: randomUUID(),
    kind: "SUGGESTION",
    rating: null,
    outcome: "PRIVATE original description should never be published",
    helps: "PRIVATE helped audience",
    recipientId: intake.recipient?.id,
    recipientVersion: intake.recipient?.version,
    notice: FEEDBACK_NOTICE,
    consent: true,
    contactAllowed: false,
    channels: [],
    allowIdea,
    publicAttribution: false
  });
}
async function publication(
  caseId: string,
  extra: Record<string, unknown> = {}
) {
  const s = await readFeedbackIdeaAdministration(db, f.owner.token, { caseId });
  return {
    operation: "idea-save",
    requestKey: randomUUID(),
    caseId,
    ...(s.idea ? { ideaId: s.idea.id } : {}),
    grantVersion: s.grantVersion,
    expectedVersion: s.idea?.version ?? 0,
    sourceVersion: s.source.version,
    feedbackVersion: s.source.feedbackVersion,
    sharingVersion: s.source.sharingVersion,
    title: "A reviewed public improvement",
    summary: "A separate public summary describing a useful improvement.",
    explanation:
      "Considering the practical benefits and implementation requirements.",
    status: "CONSIDERING",
    reviewed: true,
    ...extra
  };
}
async function publish(caseId: string, extra: Record<string, unknown> = {}) {
  return feedbackIdeaAdminCommand(
    db,
    f.owner.token,
    await publication(caseId, extra)
  );
}
async function interest(
  ideaId: string,
  token: string,
  operation: "idea-vote" | "idea-subscribe",
  extra: Record<string, unknown>
) {
  const s = await readFeedbackIdeas(db, token, { id: ideaId });
  return {
    operation,
    mutationId: randomUUID(),
    ideaId,
    expectedVersion: s.detail!.version,
    interestVersion:
      operation === "idea-vote"
        ? s.interest!.voteVersion
        : s.interest!.subscriptionVersion,
    ...extra
  };
}
async function choices(
  caseId: string,
  token: string,
  extra: Record<string, unknown>
) {
  const c = await db.supportCase.findUniqueOrThrow({
    where: { id: caseId },
    include: { feedback: true }
  });
  return supportCommand(db, token, {
    operation: "feedback-choices",
    requestKey: randomUUID(),
    caseId,
    expectedVersion: c.version,
    feedbackVersion: c.feedback!.version,
    contactAllowed: false,
    channels: [],
    allowIdea: true,
    publicAttribution: false,
    ...extra
  });
}
async function adminChange(
  id: string,
  operation: string,
  extra: Record<string, unknown> = {}
) {
  const s = await readFeedbackIdeaAdministration(db, f.owner.token, {
    ideaId: id
  });
  return {
    operation,
    requestKey: randomUUID(),
    ideaId: id,
    grantVersion: s.grantVersion,
    expectedVersion: s.idea!.version,
    explanation: "Reviewed a public grouping change with a reversible history.",
    reviewed: true,
    ...extra
  };
}

test("only current product reviewers with native private-source access can publish a separately reviewed opted-in idea", async () => {
  const c = await suggestion(f.memberA.token, false);
  const input = await publication(c.caseId);
  await deny(feedbackIdeaAdminCommand(db, f.owner.token, input), 409);
  await choices(c.caseId, f.memberA.token, {});
  const ready = await publication(c.caseId);
  await deny(feedbackIdeaAdminCommand(db, f.memberA.token, ready));
  await deny(feedbackIdeaAdminCommand(db, f.backup.token, ready));
  await deny(
    feedbackIdeaAdminCommand(db, f.owner.token, { ...ready, reviewed: false }),
    400
  );
  const [a, b] = await Promise.all([
    feedbackIdeaAdminCommand(db, f.owner.token, ready),
    feedbackIdeaAdminCommand(db, f.owner.token, ready)
  ]);
  assert.equal(a.id, b.id);
  assert.equal(
    await db.feedbackIdeaEvent.count({ where: { ideaId: a.id } }),
    1
  );
  const publicData = await readFeedbackIdeas(db, null, { id: a.id });
  assert.equal(publicData.ownerId, null);
  assert.equal(publicData.detail?.attribution, null);
  const rendered = JSON.stringify(publicData);
  for (const secret of [
    c.caseId,
    f.memberA.id,
    f.memberA.name,
    "PRIVATE",
    "sourceCaseId",
    "reviewedGrantId"
  ])
    assert.ok(!rendered.includes(secret), secret);
  assert.equal(publicData.interest?.canVote, false);
  await deny(
    feedbackIdeaAdminCommand(db, f.owner.token, {
      ...ready,
      title: "Altered duplicate retry"
    }),
    409
  );
  await db.supportCapabilityGrant.update({
    where: { id: f.ownerGrant.id },
    data: { revokedAt: new Date() }
  });
  await deny(feedbackIdeaAdminCommand(db, f.owner.token, ready));
  const revived = await db.supportCapabilityGrant.update({
    where: { id: f.ownerGrant.id },
    data: { revokedAt: null }
  });
  f.ownerGrant = revived;
  await db.supportCase.update({
    where: { id: c.caseId },
    data: { ownerGrantVersion: revived.version }
  });
});

test("released states require a compiled real release entry and public search never searches private text", async () => {
  const c = await suggestion();
  await deny(
    publish(c.caseId, {
      status: "RELEASED",
      releaseId: "https://example.test/future"
    }),
    400
  );
  await deny(publish(c.caseId, { status: "RELEASED" }), 400);
  await deny(
    publish(c.caseId, { status: "PLANNED", releaseId: currentRelease.id }),
    400
  );
  const idea = await publish(c.caseId, {
    status: "RELEASED",
    releaseId: currentRelease.id
  });
  assert.equal(
    (await readFeedbackIdeas(db, null, { id: idea.id })).detail?.releaseId,
    currentRelease.id
  );
  assert.equal(
    (await readFeedbackIdeas(db, null, { q: "PRIVATE" })).ideas.length,
    0
  );
  assert.equal((await readFeedbackIdeas(db, null, { q: "%" })).ideas.length, 0);
});

test("concurrent exact vote retry is one vote; distinct people and merged groups stay truthful and reversible", async () => {
  const a = await publish((await suggestion()).caseId),
    b = await publish((await suggestion()).caseId);
  const vote = await interest(a.id, f.memberA.token, "idea-vote", {
    active: true
  });
  await Promise.all(
    Array.from({ length: 4 }, () =>
      feedbackIdeaInterestCommand(db, f.memberA.token, vote)
    )
  );
  assert.equal(
    await db.feedbackIdeaVote.count({ where: { ideaId: a.id, active: true } }),
    1
  );
  await feedbackIdeaInterestCommand(
    db,
    f.memberA.token,
    await interest(b.id, f.memberA.token, "idea-vote", { active: true })
  );
  await feedbackIdeaInterestCommand(
    db,
    f.memberB.token,
    await interest(b.id, f.memberB.token, "idea-vote", { active: true })
  );
  await feedbackIdeaAdminCommand(
    db,
    f.owner.token,
    await adminChange(a.id, "idea-merge", {
      destinationId: b.id,
      destinationVersion: b.version
    })
  );
  const merged = await readFeedbackIdeas(db, f.memberA.token, { id: a.id });
  assert.equal(merged.destination?.id, b.id);
  assert.equal(merged.detail?.votes, 2);
  await deny(
    feedbackIdeaInterestCommand(db, f.memberA.token, {
      ...vote,
      mutationId: randomUUID()
    }),
    409
  );
  await feedbackIdeaInterestCommand(
    db,
    f.memberA.token,
    await interest(b.id, f.memberA.token, "idea-vote", { active: true })
  );
  assert.equal(
    await db.feedbackIdeaVote.count({
      where: {
        userId: f.memberA.id,
        ideaId: { in: [a.id, b.id] },
        active: true
      }
    }),
    2
  );
  await feedbackIdeaInterestCommand(
    db,
    f.memberA.token,
    await interest(b.id, f.memberA.token, "idea-vote", { active: false })
  );
  assert.equal(
    (await readFeedbackIdeas(db, null, { id: b.id })).detail?.votes,
    1
  );
  const destination = (await readFeedbackIdeas(db, null, { id: b.id })).detail!;
  await feedbackIdeaAdminCommand(
    db,
    f.owner.token,
    await adminChange(a.id, "idea-unmerge", {
      destinationVersion: destination.version
    })
  );
  assert.equal(
    (await readFeedbackIdeas(db, null, { id: a.id })).detail?.votes,
    0
  );
  assert.equal(
    (await readFeedbackIdeas(db, null, { id: b.id })).detail?.votes,
    1
  );
  await db.platformUser.update({
    where: { id: f.memberB.id },
    data: { suspendedAt: new Date() }
  });
  assert.equal(
    (await readFeedbackIdeas(db, null, { id: b.id })).detail?.votes,
    0
  );
  await db.platformUser.update({
    where: { id: f.memberB.id },
    data: { suspendedAt: null }
  });
});

test("merge subscriptions keep original channel dates and reversal; unsubscribe replay cannot revive older consent", async () => {
  const a = await publish((await suggestion()).caseId),
    b = await publish((await suggestion()).caseId);
  await feedbackIdeaInterestCommand(
    db,
    f.memberA.token,
    await interest(a.id, f.memberA.token, "idea-subscribe", {
      inApp: true,
      email: false,
      push: false
    })
  );
  const original = await db.feedbackIdeaSubscription.findUniqueOrThrow({
    where: { ideaId_userId: { ideaId: a.id, userId: f.memberA.id } }
  });
  await feedbackIdeaAdminCommand(
    db,
    f.owner.token,
    await adminChange(a.id, "idea-merge", {
      destinationId: b.id,
      destinationVersion: b.version
    })
  );
  await feedbackIdeaInterestCommand(
    db,
    f.memberA.token,
    await interest(b.id, f.memberA.token, "idea-subscribe", {
      inApp: true,
      email: true,
      push: false
    })
  );
  const kept = await db.feedbackIdeaSubscription.findUniqueOrThrow({
    where: { id: original.id }
  });
  assert.deepEqual(kept.inAppSince, original.inAppSince);
  assert.equal(kept.emailSince, null);
  const root = await db.feedbackIdeaSubscription.findUniqueOrThrow({
    where: { ideaId_userId: { ideaId: b.id, userId: f.memberA.id } }
  });
  assert.equal(root.inAppSince, null);
  assert.ok(root.emailSince);
  await feedbackIdeaInterestCommand(
    db,
    f.memberA.token,
    await interest(b.id, f.memberA.token, "idea-subscribe", {
      inApp: false,
      email: false,
      push: false
    })
  );
  const controls = (
    await db.retentionControl.findMany({
      where: {
        kind: "FEEDBACK_SUBSCRIPTION",
        sourceId: { in: [root.id, original.id] }
      },
      orderBy: { version: "desc" }
    })
  ).map((r) => r.payload as unknown as RetentionControlEntry);
  for (const old of [original, root])
    await db.feedbackIdeaSubscription.update({
      where: { id: old.id },
      data: {
        version: old.version,
        inAppSince: old.inAppSince,
        emailSince: old.emailSince
      }
    });
  await replayRetentionControls(db, controls);
  await replayRetentionControls(db, controls);
  const restored = (await readFeedbackIdeas(db, f.memberA.token, { id: b.id }))
    .interest!;
  assert.equal(restored.inApp, false);
  assert.equal(restored.email, false);
  assert.equal(restored.push, false);
  assert.ok(!JSON.stringify(controls).includes(f.memberA.email));
});

test("attribution is separate; publication withdrawal hides immediately, requires review to republish, and recovers privately", async () => {
  const c = await suggestion(),
    a = await publish(c.caseId);
  await choices(c.caseId, f.memberA.token, { publicAttribution: true });
  assert.equal(
    (await readFeedbackIdeas(db, null, { id: a.id })).detail?.attribution,
    f.memberA.name
  );
  await choices(c.caseId, f.memberA.token, { publicAttribution: false });
  assert.equal(
    (await readFeedbackIdeas(db, null, { id: a.id })).detail?.attribution,
    null
  );
  const beforeChoice = await db.feedbackSubmission.findUniqueOrThrow({
    where: { caseId: c.caseId }
  });
  const beforeIdea = await db.feedbackIdea.findUniqueOrThrow({
    where: { id: a.id }
  });
  await choices(c.caseId, f.memberA.token, { allowIdea: false });
  await deny(readFeedbackIdeas(db, null, { id: a.id }));
  await choices(c.caseId, f.memberA.token, { allowIdea: true });
  await deny(readFeedbackIdeas(db, null, { id: a.id }));
  const again = await publish(c.caseId);
  assert.equal(
    (await readFeedbackIdeas(db, null, { id: again.id })).history?.length,
    1
  );
  await choices(c.caseId, f.memberA.token, { allowIdea: false });
  const controls = (
    await db.retentionControl.findMany({
      where: { kind: "FEEDBACK_CHOICES", sourceId: c.caseId },
      orderBy: { version: "desc" }
    })
  ).map((r) => r.payload as unknown as RetentionControlEntry);
  await db.feedbackSubmission.update({
    where: { caseId: c.caseId },
    data: {
      version: beforeChoice.version,
      sharingVersion: beforeChoice.sharingVersion,
      allowIdea: true,
      contactAllowed: true,
      contactInApp: true
    }
  });
  await db.feedbackIdea.update({
    where: { id: a.id },
    data: { version: beforeIdea.version, withdrawnAt: null }
  });
  await replayRetentionControls(db, controls);
  await replayRetentionControls(db, controls);
  await deny(readFeedbackIdeas(db, null, { id: a.id }));
  const restored = await db.feedbackSubmission.findUniqueOrThrow({
    where: { caseId: c.caseId }
  });
  assert.equal(restored.contactAllowed, false);
  assert.equal(restored.allowIdea, false);
});

test("product moderation can withdraw without private case access and protected recovery retains the withdrawal", async () => {
  const c = await suggestion(),
    a = await publish(c.caseId);
  const old = await db.feedbackIdea.findUniqueOrThrow({ where: { id: a.id } });
  await deny(
    readFeedbackIdeaAdministration(db, f.backup.token, { ideaId: a.id })
  );
  const grant = await db.platformOperatorGrant.findUniqueOrThrow({
    where: {
      userId_capability: {
        userId: f.backup.id,
        capability: "MANAGE_PRODUCT_FEEDBACK"
      }
    }
  });
  const input = {
    operation: "idea-withdraw",
    ideaId: a.id,
    requestKey: randomUUID(),
    expectedVersion: a.version,
    grantVersion: grant.version,
    explanation: "Retracted for an authorized public-content review."
  };
  await feedbackIdeaAdminCommand(db, f.backup.token, input);
  await deny(readFeedbackIdeas(db, null, { id: a.id }));
  const controls = (
    await db.retentionControl.findMany({
      where: { kind: "FEEDBACK_IDEA", sourceId: a.id }
    })
  ).map((r) => r.payload as unknown as RetentionControlEntry);
  await db.feedbackIdea.update({
    where: { id: a.id },
    data: { withdrawnAt: null, version: old.version }
  });
  await replayRetentionControls(db, controls);
  await deny(readFeedbackIdeas(db, null, { id: a.id }));
  assert.equal(
    (await readSupport(db, f.memberA.token, "detail", { caseId: c.caseId }))
      .detail?.id,
    c.caseId
  );
});

test("HTTP owner/origin checks, private caching, protected acknowledgment, and erased source cleanup", async () => {
  const c = await suggestion(),
    a = await publish(c.caseId);
  const config = accountConfig(),
    url = config.origin + "/api/platform/feedback/ideas";
  const headers = {
    cookie: `church_platform_session=${f.memberA.token}`,
    origin: config.origin,
    "x-expected-account": f.memberA.id,
    "content-type": "application/json"
  };
  const read = await handleFeedbackIdeasRequest(
    db,
    new Request(url + "?id=" + a.id)
  );
  assert.equal(read.status, 200);
  assert.match(read.headers.get("cache-control")!, /no-store/);
  const body = JSON.stringify(
    await interest(a.id, f.memberA.token, "idea-subscribe", {
      inApp: true,
      email: false,
      push: false
    })
  );
  assert.equal(
    (
      await handleFeedbackIdeasRequest(
        db,
        new Request(url, {
          method: "POST",
          headers: { ...headers, origin: "https://foreign.example.test" },
          body
        })
      )
    ).status,
    403
  );
  assert.equal(
    (
      await handleFeedbackIdeasRequest(
        db,
        new Request(url, {
          method: "POST",
          headers: { ...headers, "x-expected-account": f.memberB.id },
          body
        })
      )
    ).status,
    401
  );
  const saved = await handleFeedbackIdeasRequest(
    db,
    new Request(url, { method: "POST", headers, body })
  );
  assert.equal(saved.status, 200);
  assert.equal(
    await db.retentionControl.count({
      where: {
        targetId: f.memberA.id,
        kind: "FEEDBACK_SUBSCRIPTION",
        journaledAt: null
      }
    }),
    0
  );
  const admin = await handleAdminRequest(
    db,
    new Request(
      config.origin +
        "/api/platform/admin?view=feedback-idea&caseId=" +
        c.caseId,
      {
        headers: {
          cookie: `church_platform_session=${f.owner.token}`,
          "x-expected-account": f.owner.id
        }
      }
    )
  );
  assert.equal(admin.status, 200);
  await db.$transaction((tx) =>
    eraseAdminPersonalData(tx, f.memberA.id, new Date())
  );
  await deny(readFeedbackIdeas(db, null, { id: a.id }));
  assert.equal(
    await db.feedbackIdeaSubscription.count({
      where: { userId: f.memberA.id }
    }),
    0
  );
  assert.equal(
    await db.feedbackIdeaVote.count({ where: { userId: f.memberA.id } }),
    0
  );
  const erased = await db.feedbackIdea.findUniqueOrThrow({
    where: { id: a.id }
  });
  assert.equal(erased.summary, "[Removed for privacy.]");
});

test("native public-idea reports expose only current public text and product moderation never opens the private source", async () => {
  const c = await suggestion(),
    a = await publish(c.caseId);
  await seedOperatorGrants(db, f.backup, ["REVIEW_COMMUNITY_REPORTS"]);
  const target = await readCommunityReports(db, f.memberB.token, {
    view: "target",
    targetType: "FEEDBACK_IDEA",
    targetId: a.id
  });
  assert.ok(target.target);
  const input = {
    operation: "create",
    mutationId: randomUUID(),
    targetType: "FEEDBACK_IDEA",
    targetId: a.id,
    expectedTargetVersion: target.target.version,
    expectedContextVersion: target.target.contextVersion,
    reason: "PRIVACY",
    details: "A deliberate fictional concern about the public summary."
  };
  const [report, retry] = await Promise.all([
    communityReportCommand(db, f.memberB.token, input),
    communityReportCommand(db, f.memberB.token, input)
  ]);
  assert.equal(report.id, retry.id);
  const reviewed = await readCommunityReports(db, f.backup.token, {
    view: "review",
    id: report.id
  });
  assert.match(reviewed.evidence?.content ?? "", /separate public summary/);
  assert.ok(!JSON.stringify(reviewed).includes(c.caseId));
  assert.ok(!JSON.stringify(reviewed).includes("PRIVATE original"));
  await deny(
    readFeedbackIdeaAdministration(db, f.backup.token, { ideaId: a.id })
  );
  const moderated = await readFeedbackIdeaModeration(db, f.backup.token, {
    ideaId: a.id
  });
  assert.equal(moderated.ideas[0].id, a.id);
  assert.ok(!JSON.stringify(moderated).includes(c.caseId));
  await feedbackIdeaAdminCommand(db, f.backup.token, {
    operation: "idea-withdraw",
    requestKey: randomUUID(),
    ideaId: a.id,
    grantVersion: moderated.grantVersion,
    expectedVersion: a.version,
    explanation: "Withdrawn after current public review."
  });
  const after = await readCommunityReports(db, f.backup.token, {
    view: "review",
    id: report.id
  });
  assert.equal(after.evidence, undefined);
  assert.equal(after.report?.details, input.details);
  await deny(
    readCommunityReports(db, f.memberB.token, {
      view: "target",
      targetType: "FEEDBACK_IDEA",
      targetId: a.id
    })
  );
});

test("the admin Feedback filter includes all native feedback kinds and still filters current private access", async () => {
  const suggestionCase = await suggestion();
  const intake = (
    await readSupport(db, f.memberA.token, "new", { feedbackOnly: true })
  ).intake;
  const common = {
    operation: "feedback-create",
    recipientId: intake.recipient?.id,
    recipientVersion: intake.recipient?.version,
    notice: FEEDBACK_NOTICE,
    consent: true,
    contactAllowed: false,
    channels: [],
    allowIdea: false,
    publicAttribution: false
  };
  const general = await supportCommand(db, f.memberA.token, {
    ...common,
    requestKey: randomUUID(),
    kind: "GENERAL",
    rating: 2,
    description: ""
  });
  const bug = await supportCommand(db, f.memberA.token, {
    ...common,
    requestKey: randomUUID(),
    kind: "BUG",
    actual: "The fictional view was delayed.",
    expected: "The fictional view should open.",
    rating: null
  });
  const own = await readAdminQueue(db, f.owner.token, {
    type: "FEEDBACK",
    state: "ALL"
  });
  assert.deepEqual(
    new Set(own.rows.map((r) => r.sourceId)),
    new Set([suggestionCase.caseId, general.caseId, bug.caseId])
  );
  assert.equal(
    (
      await readAdminQueue(db, f.backup.token, {
        type: "FEEDBACK",
        state: "ALL"
      })
    ).rows.length,
    0
  );
  assert.ok(!JSON.stringify(own).includes("PRIVATE original description"));
});

test("an authorized merge reversal remains possible after destination withdrawal and does not revive the withdrawn source", async () => {
  const first = await suggestion(),
    second = await suggestion();
  const a = await publish(first.caseId),
    b = await publish(second.caseId);
  await feedbackIdeaAdminCommand(
    db,
    f.owner.token,
    await adminChange(a.id, "idea-merge", {
      destinationId: b.id,
      destinationVersion: b.version
    })
  );
  await choices(second.caseId, f.memberA.token, { allowIdea: false });
  await deny(readFeedbackIdeas(db, null, { id: a.id }));
  const review = await readFeedbackIdeaAdministration(db, f.owner.token, {
    ideaId: a.id
  });
  assert.equal(review.destination?.id, b.id);
  await feedbackIdeaAdminCommand(
    db,
    f.owner.token,
    await adminChange(a.id, "idea-unmerge", {
      destinationVersion: review.destination!.version
    })
  );
  assert.equal(
    (await readFeedbackIdeas(db, null, { id: a.id })).detail?.id,
    a.id
  );
  await deny(readFeedbackIdeas(db, null, { id: b.id }));
  assert.equal(
    (
      await db.feedbackSubmission.findUniqueOrThrow({
        where: { caseId: second.caseId }
      })
    ).allowIdea,
    false
  );
});

test("native support choices retain the same pending receipt until recovery protection succeeds", async () => {
  const c = await suggestion(),
    a = await publish(c.caseId);
  const config = accountConfig(),
    body = JSON.stringify({
      operation: "feedback-choices",
      requestKey: randomUUID(),
      caseId: c.caseId,
      expectedVersion: 1,
      feedbackVersion: 1,
      contactAllowed: false,
      channels: [],
      allowIdea: false,
      publicAttribution: false
    });
  const request = () =>
    new Request(config.origin + "/api/platform/support", {
      method: "POST",
      headers: {
        origin: config.origin,
        "content-type": "application/json",
        cookie: `church_platform_session=${f.memberA.token}`,
        "x-expected-account": f.memberA.id
      },
      body
    });
  const directory = await mkdtemp(join(tmpdir(), "feedback-recovery-")),
    badStore = join(directory, "not-a-directory"),
    previous = process.env.RETENTION_TEST_DIR;
  await writeFile(badStore, "isolated failure injection", { mode: 0o600 });
  try {
    process.env.RETENTION_TEST_DIR = badStore;
    assert.equal((await handleSupportRequest(db, request())).status, 503);
    await deny(readFeedbackIdeas(db, null, { id: a.id }));
    assert.equal(
      await db.retentionControl.count({
        where: {
          sourceId: c.caseId,
          kind: "FEEDBACK_CHOICES",
          journaledAt: null
        }
      }),
      1
    );
  } finally {
    if (previous === undefined) delete process.env.RETENTION_TEST_DIR;
    else process.env.RETENTION_TEST_DIR = previous;
    await rm(directory, { recursive: true, force: true });
  }
  const retry = await handleSupportRequest(db, request());
  assert.equal(retry.status, 200);
  assert.equal((await retry.json()).version, 2);
  assert.equal(
    await db.supportOperation.count({
      where: { actorId: f.memberA.id, requestKey: JSON.parse(body).requestKey }
    }),
    1
  );
  assert.equal(
    await db.retentionControl.count({
      where: { sourceId: c.caseId, kind: "FEEDBACK_CHOICES", journaledAt: null }
    }),
    0
  );
});
