import test, { before, beforeEach, after } from "node:test";
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
  communityReportCommand as command,
  readCommunityReports as read
} from "../lib/platform/community-reports";
import { updateAccountProfile } from "../lib/platform/accounts";
import { PortalError } from "../lib/platform/portal-policy";
import { workspaceError } from "../lib/platform/post-workspace-boundary";
import { commentCommand } from "../lib/platform/comment-commands";
import { relationshipCommand } from "../lib/platform/relationships";
import {
  prepareAccountExport,
  downloadAccountExport
} from "../lib/platform/account-export";

const db = new PrismaClient();
let f: Awaited<ReturnType<typeof seedPortal>>;
let reviewer: Awaited<ReturnType<typeof createPortalActor>>;
let ids: string[];
const oldEnabled = process.env.COMMUNITY_REPORTS_ENABLED;
const oldLimit = process.env.COMMUNITY_REPORTS_PER_10_MINUTES;
const input = (
  operation: string,
  fields: Record<string, unknown> = {}
): Record<string, unknown> => ({
  operation,
  mutationId: randomUUID(),
  ...fields
});
const denied = (promise: Promise<unknown>, status: number) =>
  assert.rejects(
    promise,
    (error: unknown) => error instanceof PortalError && error.status === status
  );
before(async () => {
  await assertPortalTestDatabase(db);
  f = await seedPortal(db);
  reviewer = await createPortalActor(db, "reports");
  await seedOperatorGrants(db, reviewer, ["REVIEW_COMMUNITY_REPORTS"]);
  await db.supportCapabilityGrant.create({
    data: { userId: f.operator.id, capability: "RESPOND" }
  });
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
  ids = [
    f.contact.id,
    f.memberA.id,
    f.memberB.id,
    f.coordinator.id,
    reviewer.id
  ];
});
beforeEach(async () => {
  process.env.COMMUNITY_REPORTS_ENABLED = "true";
  process.env.COMMUNITY_REPORTS_PER_10_MINUTES = "5";
  await db.communityReportDecision.deleteMany({
    where: { report: { reporterId: { in: ids } } }
  });
  await db.communityReport.deleteMany({ where: { reporterId: { in: ids } } });
  await db.platformAuthLimit.deleteMany();
  await db.platformOperatorGrant.updateMany({
    where: { userId: reviewer.id },
    data: { revokedAt: null }
  });
  await db.churchCapabilityGrant.updateMany({
    where: { userId: { in: ids }, capability: "MODERATE_CHURCH_POSTS" },
    data: { revokedAt: null }
  });
  await db.churchConnection.updateMany({
    where: { userId: { in: ids } },
    data: { state: "APPROVED" }
  });
  await db.socialRelationship.deleteMany({ where: { ownerId: { in: ids } } });
});
after(async () => {
  if (oldEnabled === undefined) delete process.env.COMMUNITY_REPORTS_ENABLED;
  else process.env.COMMUNITY_REPORTS_ENABLED = oldEnabled;
  if (oldLimit === undefined)
    delete process.env.COMMUNITY_REPORTS_PER_10_MINUTES;
  else process.env.COMMUNITY_REPORTS_PER_10_MINUTES = oldLimit;
  await db.$disconnect();
});
const post = (churchId?: string) =>
  db.platformPost.create({
    data: {
      authorId: f.memberA.id,
      content: "Private source body must not be copied " + randomUUID(),
      ...(churchId ? { audience: "CHURCH", audienceChurchId: churchId } : {})
    }
  });
async function creation(type: string, id: string, token = f.contact.token) {
  const view = await read(db, token, {
    view: "target",
    targetType: type,
    targetId: id
  });
  assert.ok(view.target);
  return input("create", {
    targetType: type,
    targetId: id,
    expectedTargetVersion: view.target.version,
    expectedContextVersion: view.target.contextVersion,
    reason: "PRIVACY",
    details: "Deliberately submitted report context"
  });
}
const review = (id: string, token = reviewer.token) =>
  read(db, token, { view: "review", id });

test("exact concurrent retries create one private record; changed bodies conflict and new-key duplicates retain original context", async () => {
  const p = await post(),
    body = await creation("POST", p.id);
  const [a, b] = await Promise.all([
    command(db, f.contact.token, body),
    command(db, f.contact.token, body)
  ]);
  assert.deepEqual(a, b);
  assert.equal(
    await db.communityReport.count({ where: { reporterId: f.contact.id } }),
    1
  );
  await denied(
    command(db, f.contact.token, { ...body, details: "Changed context" }),
    409
  );
  const duplicate = await command(db, f.contact.token, {
    ...body,
    mutationId: randomUUID(),
    details: "Do not replace original"
  });
  assert.equal(duplicate.id, a.id);
  const row = await db.communityReport.findUniqueOrThrow({
    where: { id: a.id }
  });
  assert.equal(row.details, body.details);
  assert.ok(!JSON.stringify(row).includes(p.content));
  assert.equal(
    (await db.platformAuthLimit.findMany()).reduce((n, r) => n + r.hits, 0),
    1
  );
  await denied(read(db, f.memberA.token, { view: "receipt", id: a.id }), 404);
  await denied(review(a.id, f.memberA.token), 404);
  await denied(review(a.id, f.operator.token), 404);
  const visible = JSON.stringify(await review(a.id));
  assert.ok(!visible.includes(f.contact.id));
  assert.ok(!visible.includes(f.contact.email));
  assert.ok(!visible.includes(p.content));
});

test("all target kinds use exact current identity and versions; blocks and eligibility deny new reports", async () => {
  const p = await post();
  const c = await commentCommand(
    db,
    f.memberA.token,
    input("create", { postId: p.id, content: "Reportable comment" })
  );
  for (const [kind, id] of [
    ["POST", p.id],
    ["COMMENT", c.id],
    ["PROFILE", f.memberA.id],
    ["CHURCH", f.churchA.id]
  ]) {
    const result = await command(db, f.contact.token, await creation(kind, id));
    assert.equal(
      (await db.communityReport.findUniqueOrThrow({ where: { id: result.id } }))
        .targetId,
      id
    );
  }
  await denied(
    read(db, f.contact.token, {
      view: "target",
      targetType: "PROFILE",
      targetId: randomUUID()
    }),
    404
  );
  for (const actor of [f.unverified, f.unacknowledged])
    await denied(
      read(db, actor.token, {
        view: "target",
        targetType: "POST",
        targetId: p.id
      }),
      403
    );
  const old = await creation("PROFILE", f.memberA.id);
  await updateAccountProfile(db, f.memberA.token, {
    name: f.memberA.name,
    bio: "Profile changed",
    expectedVersion: old.expectedTargetVersion
  });
  await denied(command(db, f.contact.token, old), 409);
  await relationshipCommand(
    db,
    f.contact.token,
    input("block", {
      kind: "person",
      targetId: f.memberA.id,
      desired: true,
      expectedVersion: 0
    })
  );
  for (const [kind, id] of [
    ["POST", p.id],
    ["COMMENT", c.id],
    ["PROFILE", f.memberA.id]
  ])
    await denied(
      read(db, f.contact.token, {
        view: "target",
        targetType: kind,
        targetId: id
      }),
      404
    );
  await denied(
    Promise.resolve().then(() =>
      command(db, f.contact.token, { ...old, reporterId: f.memberA.id })
    ),
    400
  );
});

test("comment source changes conflict, and private receipts survive deletion and membership loss without source disclosure", async () => {
  const p = await post(f.churchA.id);
  const c = await commentCommand(
    db,
    f.memberA.token,
    input("create", {
      postId: p.id,
      content: "Private prayer comment not report evidence"
    })
  );
  const stale = await creation("COMMENT", c.id);
  await db.platformPost.update({
    where: { id: p.id },
    data: { version: { increment: 1 } }
  });
  await denied(command(db, f.contact.token, stale), 409);
  const body = await creation("COMMENT", c.id),
    receipt = await command(db, f.contact.token, body);
  await commentCommand(
    db,
    f.memberA.token,
    input("delete", { postId: p.id, commentId: c.id, expectedVersion: 1 })
  );
  await db.churchConnection.updateMany({
    where: { userId: f.contact.id, churchId: f.churchA.id },
    data: { state: "LEFT" }
  });
  assert.deepEqual(await command(db, f.contact.token, body), receipt);
  const owned = JSON.stringify(
    await read(db, f.contact.token, { view: "receipt", id: receipt.id })
  );
  assert.ok(owned.includes(body.details as string));
  assert.ok(!owned.includes("Private prayer comment"));
  await denied(
    read(db, f.memberB.token, { view: "receipt", id: receipt.id }),
    404
  );
  await denied(review(receipt.id), 404);
  assert.ok(await review(receipt.id, f.coordinator.token));
  await db.platformPostComment.delete({ where: { id: c.id } });
  assert.ok(await review(receipt.id, f.coordinator.token));
});

test("church review requires matching current authority; revoked decision retries fail and concurrent resolutions audit one winner", async () => {
  const p = await post(f.churchA.id);
  const receipt = await command(
    db,
    f.contact.token,
    await creation("POST", p.id)
  );
  for (const actor of [f.memberA, f.memberB, f.operator, reviewer])
    await denied(review(receipt.id, actor.token), 404);
  const first = input("resolve", {
    id: receipt.id,
    expectedVersion: 1,
    resolution: "CLOSED",
    decisionReason: "Reviewed this exact report"
  });
  const second = {
    ...first,
    mutationId: randomUUID(),
    resolution: "FOLLOW_UP_REQUIRED"
  };
  const race = await Promise.allSettled([
    command(db, f.coordinator.token, first),
    command(db, f.coordinator.token, second)
  ]);
  assert.equal(race.filter((r) => r.status === "fulfilled").length, 1);
  assert.ok(
    race.some((r) => r.status === "rejected" && r.reason.status === 409)
  );
  const winner = race[0].status === "fulfilled" ? first : second;
  const decisions = await db.communityReportDecision.findMany({
    where: { reportId: receipt.id }
  });
  assert.equal(decisions.length, 1);
  assert.equal(decisions[0].actorId, f.coordinator.id);
  assert.equal(decisions[0].fromStatus, "RECEIVED");
  assert.equal(decisions[0].version, 2);
  assert.equal(decisions[0].reason, first.decisionReason);
  const source = await db.platformPost.findUniqueOrThrow({
    where: { id: p.id }
  });
  assert.equal(source.version, p.version);
  assert.equal(source.status, "PUBLISHED");
  assert.equal(source.audience, "CHURCH");
  await command(db, f.coordinator.token, winner);
  assert.equal(
    await db.communityReportDecision.count({ where: { reportId: receipt.id } }),
    1
  );
  await db.churchCapabilityGrant.updateMany({
    where: { userId: f.coordinator.id, capability: "MODERATE_CHURCH_POSTS" },
    data: { revokedAt: new Date() }
  });
  await denied(review(receipt.id, f.coordinator.token), 404);
  await denied(command(db, f.coordinator.token, winner), 404);
});

test("audience changes cannot transfer old private evidence to an unrelated church reviewer", async () => {
  const p = await post(f.churchA.id);
  const receipt = await command(
    db,
    f.contact.token,
    await creation("POST", p.id)
  );
  await db.platformPost.update({
    where: { id: p.id },
    data: { audienceChurchId: f.churchB.id, version: { increment: 1 } }
  });
  await denied(review(receipt.id, f.coordinator.token), 404);
  await denied(review(receipt.id, f.memberB.token), 404);
  // The canonical connection policy permits one approved church at a time.
  // Old private context stays pinned instead of inventing cross-church access.
  await db.platformPost.update({
    where: { id: p.id },
    data: {
      audience: "PUBLIC",
      audienceChurchId: null,
      version: { increment: 1 }
    }
  });
  await denied(review(receipt.id), 404);
  assert.ok(await review(receipt.id, f.coordinator.token));
});

test("intake defaults and absent reviewer coverage fail honestly while old creation acknowledgements remain replayable", async () => {
  const p = await post(),
    body = await creation("POST", p.id);
  for (const enabled of [undefined, "false"]) {
    if (enabled === undefined) delete process.env.COMMUNITY_REPORTS_ENABLED;
    else process.env.COMMUNITY_REPORTS_ENABLED = enabled;
    await denied(command(db, f.contact.token, body), 503);
  }
  process.env.COMMUNITY_REPORTS_ENABLED = "true";
  process.env.COMMUNITY_REPORTS_PER_10_MINUTES = "invalid";
  await denied(command(db, f.contact.token, body), 503);
  process.env.COMMUNITY_REPORTS_PER_10_MINUTES = "5";
  // Only this test's explicit platform reviewer is considered: remove grants
  // from earlier isolated runs, never production (guarded before hook).
  const grants = await db.platformOperatorGrant.findMany({
    where: { capability: "REVIEW_COMMUNITY_REPORTS", revokedAt: null }
  });
  await db.platformOperatorGrant.updateMany({
    where: { id: { in: grants.map((g) => g.id) } },
    data: { revokedAt: new Date() }
  });
  await denied(command(db, f.contact.token, body), 503);
  assert.equal(
    await db.communityReport.count({ where: { reporterId: f.contact.id } }),
    0
  );
  await db.platformOperatorGrant.updateMany({
    where: { id: { in: grants.map((g) => g.id) } },
    data: { revokedAt: null }
  });
  const result = await command(db, f.contact.token, body);
  process.env.COMMUNITY_REPORTS_ENABLED = "false";
  await db.platformPost.update({
    where: { id: p.id },
    data: { status: "WITHDRAWN", withdrawnAt: new Date() }
  });
  assert.deepEqual(await command(db, f.contact.token, body), result);
  await denied(
    command(db, f.contact.token, { ...body, mutationId: randomUUID() }),
    404
  );
});

test("five new reports exhaust only that account's quota; exact and duplicate retries are free and expiry restores intake", async () => {
  const bodies = [];
  for (let i = 0; i < 6; i++)
    bodies.push(await creation("POST", (await post()).id));
  const first = await command(db, f.contact.token, bodies[0]);
  const budget = await db.platformAuthLimit.findFirstOrThrow();
  for (const body of bodies.slice(1, 5))
    await command(db, f.contact.token, body);
  assert.deepEqual(await command(db, f.contact.token, bodies[0]), first);
  assert.equal(
    (
      await command(db, f.contact.token, {
        ...bodies[0],
        mutationId: randomUUID()
      })
    ).id,
    first.id
  );
  try {
    await command(db, f.contact.token, bodies[5]);
    assert.fail("Expected report quota");
  } catch (error) {
    assert.ok(error instanceof PortalError);
    assert.equal(error.status, 429);
    assert.ok(error.retryAfter! >= 1 && error.retryAfter! <= 600);
    assert.equal(
      workspaceError(error).headers.get("retry-after"),
      String(error.retryAfter)
    );
  }
  assert.equal(
    (
      await db.platformAuthLimit.findUniqueOrThrow({
        where: { key: budget.key }
      })
    ).hits,
    5
  );
  await command(db, f.memberA.token, bodies[5]);
  await db.platformAuthLimit.update({
    where: { key: budget.key },
    data: { expiresAt: new Date(Date.now() - 1) }
  });
  await command(db, f.contact.token, bodies[5]);
  assert.equal(
    await db.communityReport.count({ where: { reporterId: f.contact.id } }),
    6
  );
});

test("private receipts paginate without duplicates or foreign cursor access; export omits reviewer notes and other reports", async () => {
  process.env.COMMUNITY_REPORTS_PER_10_MINUTES = "50";
  const seen = [];
  for (let i = 0; i < 32; i++)
    seen.push(
      (
        await command(
          db,
          f.contact.token,
          await creation("POST", (await post()).id)
        )
      ).id
    );
  const foreign = await command(
    db,
    f.memberA.token,
    await creation("POST", (await post()).id)
  );
  const page = await read(db, f.contact.token, { view: "mine" });
  assert.ok(page.reports);
  assert.equal(page.reports.length, 30);
  const tail = await read(db, f.contact.token, {
    view: "mine",
    after: page.after
  });
  assert.ok(tail.reports);
  assert.equal(tail.reports.length, 2);
  assert.equal(tail.after, null);
  assert.deepEqual(
    new Set([...page.reports, ...tail.reports].map((r) => r.id)),
    new Set(seen)
  );
  await denied(
    read(db, f.contact.token, { view: "mine", after: foreign.id }),
    409
  );
  await command(
    db,
    reviewer.token,
    input("resolve", {
      id: seen[0],
      expectedVersion: 1,
      resolution: "CLOSED",
      decisionReason: "Internal reviewer marker must not export"
    })
  );
  const secret = process.env.AUTH_RATE_LIMIT_SECRET!;
  const proof = await prepareAccountExport(
    db,
    f.contact.token,
    f.contact.password,
    secret
  );
  const exported = await downloadAccountExport(
    db,
    f.contact.token,
    proof.authorization,
    secret
  );
  const data = JSON.parse(exported);
  assert.equal(data.communityReports.length, 32);
  assert.ok(!exported.includes(foreign.id));
  assert.ok(!exported.includes("Internal reviewer marker"));
  assert.ok(!exported.includes(reviewer.id));
  assert.ok(!JSON.stringify(data.communityReports).includes("reporterId"));
});

test("representation reports route to existing claims without creating claims or authority", async () => {
  const claims = await db.churchClaim.count(),
    grants = await db.platformOperatorGrant.count();
  const body = {
    ...(await creation("CHURCH", f.churchA.id)),
    reason: "IMPERSONATION"
  };
  const result = await command(db, f.contact.token, body);
  const view = await read(db, f.contact.token, {
    view: "receipt",
    id: result.id
  });
  assert.ok(view.report);
  assert.equal(
    view.report.relatedReview,
    `/platform/church-claims/new?churchId=${f.churchA.id}`
  );
  assert.equal(await db.churchClaim.count(), claims);
  assert.equal(await db.platformOperatorGrant.count(), grants);
});

test("platform authority and session revocation apply to privileged exact retries", async () => {
  const body = await creation("POST", (await post()).id);
  const report = await command(db, f.contact.token, body);
  const resolution = input("resolve", {
    id: report.id,
    expectedVersion: 1,
    resolution: "CLOSED",
    decisionReason: "Explicit platform review"
  });
  await command(db, reviewer.token, resolution);
  await db.platformOperatorGrant.updateMany({
    where: { userId: reviewer.id },
    data: { revokedAt: new Date() }
  });
  await denied(review(report.id), 404);
  await denied(command(db, reviewer.token, resolution), 404);
  await db.platformSession.deleteMany({ where: { userId: reviewer.id } });
  await assert.rejects(command(db, reviewer.token, resolution));
});
