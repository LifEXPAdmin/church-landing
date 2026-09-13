import test, { before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import {
  seedPortal,
  createPortalActor,
  seedOperatorGrants,
  assertPortalTestDatabase
} from "./seed-portal";
import {
  readCommunityReports as read,
  communityReportCommand as command
} from "../lib/platform/community-reports";
import { PortalError } from "../lib/platform/portal-policy";
const db = new PrismaClient({ log: [{ emit: "event", level: "query" }] });
let queries = 0;
db.$on("query", () => queries++);
let f: Awaited<ReturnType<typeof seedPortal>>,
  operator: Awaited<ReturnType<typeof createPortalActor>>;
const denied = (p: Promise<unknown>, status: number) =>
  assert.rejects(
    p,
    (e: unknown) => e instanceof PortalError && e.status === status
  );
before(async () => {
  await assertPortalTestDatabase(db);
  f = await seedPortal(db);
  operator = await createPortalActor(db, "reviewqueue");
  await seedOperatorGrants(db, operator, ["REVIEW_COMMUNITY_REPORTS"]);
  await db.churchCapabilityGrant.createMany({
    data: [
      {
        userId: f.coordinator.id,
        churchId: f.churchA.id,
        capability: "MODERATE_CHURCH_POSTS"
      },
      {
        userId: f.memberB.id,
        churchId: f.churchB.id,
        capability: "MODERATE_CHURCH_POSTS"
      }
    ]
  });
});
beforeEach(async () => {
  await db.communityReportDecision.deleteMany({
    where: { report: { reporterId: f.contact.id } }
  });
  await db.communityReport.deleteMany({ where: { reporterId: f.contact.id } });
  await db.platformOperatorGrant.updateMany({
    where: { userId: operator.id },
    data: { revokedAt: null }
  });
  await db.platformOperatorGrant.deleteMany({
    where: { userId: f.coordinator.id, capability: "REVIEW_COMMUNITY_REPORTS" }
  });
  await db.churchCapabilityGrant.updateMany({
    where: {
      userId: { in: [f.coordinator.id, f.memberB.id] },
      capability: "MODERATE_CHURCH_POSTS"
    },
    data: { revokedAt: null }
  });
});
after(() => db.$disconnect());
const post = (churchId?: string) =>
  db.platformPost.create({
    data: {
      authorId: f.memberA.id,
      content: "Selected private body " + randomUUID(),
      ...(churchId ? { audience: "CHURCH", audienceChurchId: churchId } : {})
    }
  });
const report = (
  targetId: string,
  scopeChurchId: string | null = null,
  type: "POST" | "COMMENT" = "POST"
) =>
  db.communityReport.create({
    data: {
      reporterId: f.contact.id,
      targetType: type,
      targetId,
      targetVersion: 1,
      scopeChurchId,
      reason: "PRIVACY",
      details: "Deliberate report details " + randomUUID()
    }
  });
const queue = async (
  token = operator.token,
  fields: Record<string, unknown> = {}
) => read(db, token, { view: "queue", ...fields });
const review = (id: string, token = operator.token) =>
  read(db, token, { view: "review", id });

test("queue filters original and current scopes before bounded pagination and never reads case bodies", async () => {
  const visible = await post(f.churchA.id),
    secret = await post(f.churchB.id),
    stamp = new Date();
  for (let i = 0; i < 35; i++) {
    await db.communityReport.create({
      data: {
        reporterId: f.contact.id,
        targetType: "POST",
        targetId: visible.id,
        targetVersion: i + 1,
        scopeChurchId: f.churchA.id,
        reason: "SPAM",
        details: "Never list reporter context",
        createdAt: new Date(stamp.getTime() - Math.floor(i / 2) * 1000)
      }
    });
    await db.communityReport.create({
      data: {
        reporterId: f.contact.id,
        targetType: "POST",
        targetId: secret.id,
        targetVersion: i + 1,
        scopeChurchId: i % 2 ? f.churchB.id : null,
        reason: "PRIVACY",
        details: "Never list private church context",
        createdAt: new Date(stamp.getTime() + i * 1000)
      }
    });
  }
  const a = await queue(f.coordinator.token);
  assert.equal(a.reviews?.length, 30);
  assert.ok(a.after);
  const b = await queue(f.coordinator.token, { after: a.after });
  assert.equal(b.reviews?.length, 5);
  assert.equal(b.after, null);
  assert.equal(
    new Set([...a.reviews!, ...b.reviews!].map((r) => r.id)).size,
    35
  );
  const text = JSON.stringify(a);
  for (const marker of [
    visible.content,
    secret.content,
    visible.id,
    secret.id,
    f.contact.id,
    "Never list"
  ])
    assert.ok(
      !text.includes(marker),
      "Queue contains no source/reporter body or target identity"
    );
  for (const actor of [f.memberA, f.operator, f.contact])
    await denied(queue(actor.token), 403);
  await denied(read(db, undefined, { view: "queue" }), 401);
});

test("queue and individual decisions share the pinned/current church and global authority boundary", async () => {
  const source = await post(),
    r = await report(source.id);
  assert.equal(
    (await queue()).reviews?.some((x) => x.id === r.id),
    true
  );
  await db.platformPost.update({
    where: { id: source.id },
    data: { audience: "CHURCH", audienceChurchId: f.churchA.id }
  });
  for (const actor of [operator, f.coordinator, f.memberB]) {
    assert.ok(!(await queue(actor.token)).reviews?.some((x) => x.id === r.id));
    await denied(review(r.id, actor.token), 404);
  }
  await seedOperatorGrants(db, f.coordinator, ["REVIEW_COMMUNITY_REPORTS"]);
  assert.equal(
    (await queue(f.coordinator.token)).reviews?.some((x) => x.id === r.id),
    true
  );
  assert.ok((await review(r.id, f.coordinator.token)).report);
  await db.platformPost.update({
    where: { id: source.id },
    data: { audienceChurchId: f.churchB.id }
  });
  assert.ok(
    !(await queue(f.coordinator.token)).reviews?.some((x) => x.id === r.id)
  );
  await denied(review(r.id, f.coordinator.token), 404);
});

test("comment scope follows its current parent and removed sources retain their original review boundary", async () => {
  const source = await post(f.churchA.id),
    comment = await db.platformPostComment.create({
      data: {
        postId: source.id,
        authorId: f.memberA.id,
        content: "Selected comment"
      }
    }),
    r = await report(comment.id, f.churchA.id, "COMMENT");
  assert.ok(
    (await queue(f.coordinator.token)).reviews?.some((x) => x.id === r.id)
  );
  await db.platformPost.update({
    where: { id: source.id },
    data: { audienceChurchId: f.churchB.id }
  });
  for (const actor of [f.coordinator, f.memberB]) {
    assert.ok(!(await queue(actor.token)).reviews?.some((x) => x.id === r.id));
    await denied(review(r.id, actor.token), 404);
  }
  await db.platformPostComment.delete({ where: { id: comment.id } });
  assert.ok(
    (await queue(f.coordinator.token)).reviews?.some((x) => x.id === r.id)
  );
  assert.equal((await review(r.id, f.coordinator.token)).evidence, undefined);
  await denied(review(r.id, f.memberB.token), 404);
});

test("cursor access and current status are checked before returning any queue page", async () => {
  const r = await report((await post(f.churchA.id)).id, f.churchA.id),
    privateCase = await report((await post(f.churchB.id)).id, f.churchB.id);
  await denied(queue(f.coordinator.token, { after: privateCase.id }), 409);
  await denied(queue(f.coordinator.token, { after: "unknown-case" }), 409);
  await db.communityReport.update({
    where: { id: r.id },
    data: { status: "CLOSED" }
  });
  await denied(queue(f.coordinator.token, { after: r.id }), 409);
  assert.ok(
    (await queue(f.coordinator.token, { status: "CLOSED" })).reviews?.some(
      (x) => x.id === r.id
    )
  );
  assert.equal(
    (await queue(f.coordinator.token, { status: "CLOSED", after: r.id }))
      .reviews?.length,
    0
  );
  await denied(queue(f.coordinator.token, { status: "ALL" }), 400);
  await denied(queue(f.coordinator.token, { ownerId: operator.id }), 400);
});

test("selected current evidence is not copied or included in reporter receipts and missing sources remain honest", async () => {
  const source = await post(),
    unrelated = await post(),
    r = await report(source.id);
  const first = await review(r.id);
  assert.equal(
    first.evidence && "content" in first.evidence
      ? first.evidence.content
      : undefined,
    source.content
  );
  assert.equal(first.reportedVersion, 1);
  await db.platformPost.update({
    where: { id: source.id },
    data: { content: "Changed selected content", version: { increment: 1 } }
  });
  const next = await review(r.id);
  assert.equal(
    next.evidence && "content" in next.evidence
      ? next.evidence.content
      : undefined,
    "Changed selected content"
  );
  assert.equal(
    next.evidence && "version" in next.evidence
      ? next.evidence.version
      : undefined,
    2
  );
  assert.equal(next.reportedVersion, 1);
  assert.ok(!JSON.stringify(next).includes(unrelated.content));
  assert.ok(!JSON.stringify(next).includes(f.contact.email));
  const stored = await db.communityReport.findUniqueOrThrow({
    where: { id: r.id }
  });
  for (const v of [
    source.content,
    "Changed selected content",
    unrelated.content
  ]) {
    assert.ok(!JSON.stringify(stored).includes(v));
    assert.ok(
      !JSON.stringify(
        await read(db, f.contact.token, { view: "receipt", id: r.id })
      ).includes(v)
    );
  }
  await db.platformPost.delete({ where: { id: source.id } });
  assert.equal((await review(r.id)).evidence, undefined);
});

test("privileged uncertain retries remain denied after revocation and replay exactly after legitimate restoration", async () => {
  const r = await report((await post()).id),
    body = {
      operation: "resolve",
      mutationId: randomUUID(),
      id: r.id,
      expectedVersion: 1,
      resolution: "CLOSED",
      decisionReason: "Only this selected case is closed"
    };
  const saved = await command(db, operator.token, body);
  await db.platformOperatorGrant.updateMany({
    where: { userId: operator.id },
    data: { revokedAt: new Date() }
  });
  await denied(queue(), 403);
  await denied(review(r.id), 404);
  await denied(command(db, operator.token, body), 404);
  assert.equal(
    (await read(db, operator.token, { view: "mine" })).canReview,
    false
  );
  await db.platformOperatorGrant.updateMany({
    where: { userId: operator.id },
    data: { revokedAt: null }
  });
  assert.deepEqual(await command(db, operator.token, body), saved);
  assert.equal(
    await db.communityReportDecision.count({ where: { reportId: r.id } }),
    1
  );
  assert.equal(
    (await read(db, operator.token, { view: "mine" })).canReview,
    true
  );
});

test("one and thirty queue rows use the same bounded query count without per-case source reads", async () => {
  const source = await post(f.churchA.id);
  await report(source.id, f.churchA.id);
  queries = 0;
  await queue(f.coordinator.token);
  const one = queries;
  assert.equal((await queue(f.coordinator.token)).reviews?.length, 1);
  await db.communityReport.createMany({
    data: Array.from({ length: 29 }, (_, i) => ({
      reporterId: f.contact.id,
      targetType: "POST" as const,
      targetId: source.id,
      targetVersion: i + 2,
      scopeChurchId: f.churchA.id,
      reason: "SPAM" as const
    }))
  });
  queries = 0;
  const many = await queue(f.coordinator.token);
  assert.equal(many.reviews?.length, 30);
  assert.equal(queries, one);
  assert.ok(one > 0);
  console.log(`Review queue query count: 1 row=${one},30 rows=${queries}`);
});
