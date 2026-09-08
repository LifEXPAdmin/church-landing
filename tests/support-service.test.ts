import test, { before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import {
  readSupport,
  supportCommand,
  SupportError
} from "../lib/platform/support";
import { portalCommand, getPortalSnapshot } from "../lib/platform/portal";
import {
  createPortalActor,
  requestConnection,
  type PortalActor
} from "./seed-portal";
import { seedSupport, requestInput, type SupportFixture } from "./seed-support";
const db = new PrismaClient();
let f: SupportFixture;
before(async () => {
  f = await seedSupport(db);
});
beforeEach(async () => {
  await db.platformAuthLimit.deleteMany();
});
after(async () => {
  await db.$disconnect();
});
const deny = (promise: Promise<unknown>, status = 404) =>
  assert.rejects(
    promise,
    (e: unknown) => e instanceof SupportError && e.status === status
  );
const create = async (actor: PortalActor, extra = {}) =>
  supportCommand(db, actor.token, await requestInput(db, actor.token, extra));
const detail = (actor: PortalActor, caseId: string) =>
  readSupport(db, actor.token, "detail", { caseId }).then((s) => s.detail!);
const act = async (
  actor: PortalActor,
  caseId: string,
  operation: string,
  extra: Record<string, unknown> = {}
) => {
  const c = await db.supportCase.findUniqueOrThrow({
    where: { id: caseId },
    select: { version: true }
  });
  return supportCommand(db, actor.token, {
    operation,
    requestKey: randomUUID(),
    caseId,
    expectedVersion: c.version,
    ...extra
  });
};
const member = (label: string, options = {}) =>
  createPortalActor(db, label, options);

test("configured adult creates exactly once; repeat receipt and altered retries are safe", async () => {
  const a = await member("retry");
  const input = await requestInput(db, a.token);
  const [one, two] = await Promise.all([
    supportCommand(db, a.token, input),
    supportCommand(db, a.token, input)
  ]);
  assert.equal(one.caseId, two.caseId);
  assert.equal(await db.supportCase.count({ where: { requesterId: a.id } }), 1);
  assert.equal(
    await db.supportAuditEvent.count({ where: { caseId: one.caseId } }),
    1
  );
  await deny(
    supportCommand(db, a.token, { ...input, subject: "Different subject" }),
    409
  );
  const c = await detail(a, one.caseId);
  assert.equal(c.owner?.id, f.owner.id);
  assert.equal(c.coordinator, null);
  assert.equal(c.unread, false);
  await assert.rejects(
    db.supportCase.update({
      where: { id: c.id },
      data: { ownerGrantVersion: null }
    })
  );
  assert.ok(!JSON.stringify(c).includes(a.email));
});
test("unverified adults get only own ordinary account help, not church privilege", async () => {
  const a = await member("unverified", { verified: false });
  const own = await create(a);
  assert.equal((await detail(a, own.caseId)).requester.id, a.id);
  await deny(create(a, { category: "CHURCH_SETUP" }), 403);
  await deny(create(a, { churchId: f.churchA.id }));
  assert.equal(
    (await getPortalSnapshot(db, a.token, "my-church")).viewer.verified,
    false
  );
  const child = await member("no_adult", { adult: false });
  await deny(create(child), 403);
});
test("pending church context is allowed without private contacts or fabricated ownership", async () => {
  const c = await create(f.pending, {
    churchId: f.churchA.id,
    category: "CHURCH_SETUP"
  });
  const d = await detail(f.pending, c.caseId);
  assert.equal(d.church?.id, f.churchA.id);
  assert.equal(d.shareOptions.length, 0);
  assert.equal(d.owner?.id, f.owner.id);
  assert.ok(!JSON.stringify(d).includes(f.relationshipOwner.name));
  await deny(create(f.pending, { churchId: f.churchB.id }));
});
test("same-church member, other church, reviewer, unrelated staff and guessed IDs reveal nothing", async () => {
  const c = await create(f.memberA, { churchId: f.churchA.id });
  for (const a of [
    f.memberB,
    f.contact,
    f.reviewerA,
    f.reviewerB,
    f.operator,
    f.backup,
    f.manager
  ]) {
    await deny(detail(a, c.caseId));
    await deny(act(a, c.caseId, "reply", { body: "Not authorized" }));
    assert.ok(
      !(await readSupport(db, a.token, "requests")).rows.some(
        (r) => r.id === c.caseId
      )
    );
  }
  await deny(detail(f.memberA, "opaque-not-a-real-case"));
  await deny(
    act(f.memberA, c.caseId, "reply", {
      body: "Forged privilege",
      capability: "RESPOND"
    }),
    400
  );
});
test("lifecycle, resolution, waiting reply, stale versions and reopen remain independent of features", async () => {
  const a = await member("lifecycle");
  const c = await create(a, { category: "FEATURE_SUGGESTION" });
  await act(f.owner, c.caseId, "transition", {
    status: "WAITING_FOR_REQUESTER",
    reason: "Please describe the screen label."
  });
  const before = await detail(a, c.caseId);
  assert.equal(before.status, "WAITING_FOR_REQUESTER");
  await act(a, c.caseId, "reply", {
    body: "It is the directory choice label."
  });
  assert.equal((await detail(a, c.caseId)).status, "IN_PROGRESS");
  await deny(
    supportCommand(db, f.owner.token, {
      operation: "transition",
      requestKey: randomUUID(),
      caseId: c.caseId,
      expectedVersion: before.version,
      status: "CLOSED",
      reason: "Stale closure"
    }),
    409
  );
  await act(f.owner, c.caseId, "feature", {
    decision: "UNDER_CONSIDERATION",
    reason: "We will review scope first."
  });
  await act(f.owner, c.caseId, "transition", {
    status: "RESOLVED",
    reason: "The question is answered, but no feature has shipped."
  });
  let d = await detail(a, c.caseId);
  assert.equal(d.featureDecision, "UNDER_CONSIDERATION");
  assert.ok(d.resolution);
  await deny(
    act(f.owner, c.caseId, "reopen", { reason: "Owner cannot reopen" })
  );
  await deny(act(a, c.caseId, "reply", { body: "Closed reply" }), 409);
  await act(a, c.caseId, "reopen", {
    reason: "One more question about the label."
  });
  d = await detail(a, c.caseId);
  assert.equal(d.status, "RECEIVED");
  assert.equal(d.resolution, null);
  assert.equal(d.featureDecision, "UNDER_CONSIDERATION");
  await act(a, c.caseId, "transition", {
    status: "CLOSED",
    reason: "Thank you, I have what I need."
  });
  assert.equal((await detail(a, c.caseId)).status, "CLOSED");
});
test("sharing is deliberate, scoped, removable, versioned and never silently restored", async () => {
  const c = await create(f.memberA, { churchId: f.churchA.id });
  let d = await detail(f.memberA, c.caseId);
  const option = d.shareOptions[0];
  assert.ok(option);
  await deny(
    act(f.memberA, c.caseId, "share", {
      appointmentId: option.id,
      appointmentVersion: option.version
    }),
    400
  );
  await act(f.memberA, c.caseId, "share", {
    appointmentId: option.id,
    appointmentVersion: option.version,
    agreeHistory: true
  });
  const appointment = await db.churchContactAssignment.findUniqueOrThrow({
    where: { id: option.id }
  });
  const coordinator = [f.contact, f.coordinator].find(
    (a) => a.id === appointment.userId
  )!;
  assert.ok(coordinator);
  d = await detail(coordinator, c.caseId);
  assert.equal(d.description.includes("Fictional"), true);
  await act(coordinator, c.caseId, "reply", {
    body: "A fictional coordinator reply."
  });
  await deny(
    act(coordinator, c.caseId, "transition", {
      status: "RESOLVED",
      reason: "Not coordinator authority"
    })
  );
  await act(f.memberA, c.caseId, "revoke");
  await deny(detail(coordinator, c.caseId));
  await act(f.memberA, c.caseId, "share", {
    appointmentId: option.id,
    appointmentVersion: option.version,
    agreeHistory: true
  });
  // Revocation and reappointment use a new appointment version. The old share cannot revive.
  await db.churchContactAssignment.update({
    where: { id: option.id },
    data: { version: { increment: 1 }, revokedAt: new Date() }
  });
  await detail(f.memberA, c.caseId);
  await db.churchContactAssignment.update({
    where: { id: option.id },
    data: { version: { increment: 1 }, revokedAt: null }
  });
  await deny(detail(coordinator, c.caseId));
  assert.equal((await detail(f.memberA, c.caseId)).coordinator, null);
});
test("leaving removes shares immediately; rejoining never moves history or restores sharing", async () => {
  const a = await member("leaver");
  const pending = await requestConnection(db, a, f.churchA.id);
  await portalCommand(db, f.reviewerA.token, {
    operation: "transition",
    action: "APPROVE",
    churchId: f.churchA.id,
    connectionId: pending.id,
    expectedVersion: pending.version
  });
  const c = await create(a, { churchId: f.churchA.id });
  const option = (await detail(a, c.caseId)).shareOptions[0];
  await act(a, c.caseId, "share", {
    appointmentId: option.id,
    appointmentVersion: option.version,
    agreeHistory: true
  });
  const membership = await db.churchConnection.findUniqueOrThrow({
    where: { id: pending.id }
  });
  await portalCommand(db, a.token, {
    operation: "transition",
    action: "LEAVE",
    churchId: f.churchA.id,
    connectionId: pending.id,
    expectedVersion: membership.version
  });
  assert.ok(
    (
      await db.supportCoordinatorShare.findUniqueOrThrow({
        where: { caseId: c.caseId }
      })
    ).revokedAt
  );
  assert.equal((await detail(a, c.caseId)).church?.id, f.churchA.id);
  const again = await requestConnection(db, a, f.churchA.id);
  await portalCommand(db, f.reviewerA.token, {
    operation: "transition",
    action: "APPROVE",
    churchId: f.churchA.id,
    connectionId: again.id,
    expectedVersion: again.version
  });
  assert.equal((await detail(a, c.caseId)).coordinator, null);
  await deny(
    act(a, c.caseId, "reply", {
      body: "Change church",
      churchId: f.churchB.id
    }),
    400
  );
  await assert.rejects(
    db.supportCase.update({
      where: { id: c.caseId },
      data: { churchId: f.churchB.id }
    })
  );
});
test("handoff revokes old owner atomically and stale writes cannot override it", async () => {
  const a = await member("handoff");
  const c = await create(a);
  const v = (await detail(a, c.caseId)).version;
  const [handoff, reply] = await Promise.allSettled([
    supportCommand(db, f.owner.token, {
      operation: "handoff",
      requestKey: randomUUID(),
      caseId: c.caseId,
      expectedVersion: v,
      ownerGrantId: f.backupGrant.id,
      ownerGrantVersion: f.backupGrant.version
    }),
    supportCommand(db, f.owner.token, {
      operation: "reply",
      requestKey: randomUUID(),
      caseId: c.caseId,
      expectedVersion: v,
      body: "Concurrent reply"
    })
  ]);
  assert.equal(
    [handoff, reply].filter((r) => r.status === "fulfilled").length,
    1
  );
  if (handoff.status === "rejected")
    await act(f.owner, c.caseId, "handoff", {
      ownerGrantId: f.backupGrant.id,
      ownerGrantVersion: f.backupGrant.version
    });
  await deny(detail(f.owner, c.caseId));
  assert.equal((await detail(f.backup, c.caseId)).owner?.id, f.backup.id);
  await deny(
    act(f.manager, c.caseId, "handoff", {
      ownerGrantId: f.ownerGrant.id,
      ownerGrantVersion: f.ownerGrant.version
    })
  );
});
test("unassigned routing is minimal, capability removal revokes existing sessions and renewal cannot revive", async () => {
  const a = await member("unassigned");
  const c = await create(a);
  await db.supportCapabilityGrant.update({
    where: { id: f.ownerGrant.id },
    data: { revokedAt: new Date(), version: { increment: 1 } }
  });
  const d = await detail(a, c.caseId);
  assert.equal(d.owner, null);
  assert.equal(d.unassigned, true);
  await deny(detail(f.owner, c.caseId));
  await deny(detail(f.manager, c.caseId));
  const queue = await readSupport(db, f.manager.token, "routing");
  const item = queue.routing.find((r) => r.id === c.caseId)!;
  assert.ok(item);
  assert.deepEqual(
    Object.keys(item).sort(),
    ["id", "category", "status", "createdAt", "version", "churchId"].sort()
  );
  assert.ok(!JSON.stringify(queue).includes(d.subject));
  assert.ok(!JSON.stringify(queue).includes(a.name));
  await db.supportCapabilityGrant.update({
    where: { id: f.ownerGrant.id },
    data: { revokedAt: null, version: { increment: 1 } }
  });
  await deny(detail(f.owner, c.caseId));
  await act(f.manager, c.caseId, "handoff", {
    ownerGrantId: f.backupGrant.id,
    ownerGrantVersion: f.backupGrant.version
  });
  assert.equal((await detail(a, c.caseId)).owner?.id, f.backup.id);
  await deny(detail(f.manager, c.caseId));
  f.ownerGrant = await db.supportCapabilityGrant.findUniqueOrThrow({
    where: { id: f.ownerGrant.id }
  });
});
test("intake unavailable or stale recipient makes no case or fake receipt", async () => {
  const a = await member("unavailable");
  const input = await requestInput(db, a.token);
  await db.supportIntakeSetting.update({
    where: { id: "default" },
    data: { approvedNoticeVersion: null }
  });
  await deny(supportCommand(db, a.token, input), 503);
  assert.equal(await db.supportCase.count({ where: { requesterId: a.id } }), 0);
  await db.supportIntakeSetting.update({
    where: { id: "default" },
    data: { approvedNoticeVersion: "ordinary-support-v1" }
  });
  await deny(
    supportCommand(db, a.token, { ...input, recipientVersion: 999 }),
    409
  );
  process.env.SUPPORT_INTAKE_ENABLED = "false";
  await deny(supportCommand(db, a.token, input), 503);
  process.env.SUPPORT_INTAKE_ENABLED = "true";
  assert.equal(
    await db.supportOperation.count({ where: { actorId: a.id } }),
    0
  );
});
test("bounded plain text, body versions, scoped pagination and durable per-account limits", async () => {
  const a = await member("bounds");
  await deny(create(a, { subject: "x".repeat(121) }), 400);
  await deny(create(a, { description: "x".repeat(3001) }), 400);
  const c = await create(a, {
    subject: "x".repeat(120),
    description: "d".repeat(3000)
  });
  await act(a, c.caseId, "reply", { body: "r".repeat(2000) });
  await deny(act(a, c.caseId, "reply", { body: "x".repeat(2001) }), 400);
  await deny(act(a, c.caseId, "reply", { body: "text\u0000bad" }), 400);
  await deny(readSupport(db, a.token, "requests", { page: "100" }), 400);
  for (let i = 0; i < 4; i++) await create(a);
  await deny(create(a), 429);
  const count = await db.supportAuditEvent.count({ where: { actorId: a.id } });
  await db.supportAuditEvent.createMany({
    data: Array.from({ length: 100 - count }, () => ({
      actorId: a.id,
      caseId: c.caseId,
      version: 1,
      action: "FIXTURE_BUDGET"
    }))
  });
  await deny(
    act(a, c.caseId, "reply", { body: "Daily budget exhausted" }),
    429
  );
});
test("redaction is explicit, assigned and audited without retaining removed text", async () => {
  const a = await member("redaction");
  const secret = "Fictional-secret-marker-for-redaction";
  const c = await create(a, { description: secret });
  await act(a, c.caseId, "reply", { body: secret });
  await deny(act(a, c.caseId, "redact", { reason: "SECRET" }));
  await deny(act(f.backup, c.caseId, "redact", { reason: "SECRET" }));
  await act(f.owner, c.caseId, "redact", { reason: "SECRET" });
  const d = await detail(a, c.caseId);
  assert.ok(!JSON.stringify(d).includes(secret));
  assert.equal(d.messages[0].body, "[Removed for privacy.]");
  const audit = await db.supportAuditEvent.findMany({
    where: { caseId: c.caseId }
  });
  assert.ok(audit.some((e) => e.action === "REDACT_SECRET"));
  assert.ok(!JSON.stringify(audit).includes(secret));
});
test("read markers are per participant and never claim another person read a request", async () => {
  const a = await member("unread");
  const c = await create(a);
  assert.equal((await detail(f.owner, c.caseId)).unread, true);
  await act(f.owner, c.caseId, "mark-read");
  assert.equal((await detail(f.owner, c.caseId)).unread, false);
  await act(f.owner, c.caseId, "reply", {
    body: "A saved reply for the requester."
  });
  assert.equal((await detail(a, c.caseId)).unread, true);
  await act(a, c.caseId, "mark-read");
  assert.equal((await detail(a, c.caseId)).unread, false);
});
test("suspended requester cannot use an existing session or private case", async () => {
  const a = await member("suspended");
  const c = await create(a);
  await db.platformUser.update({
    where: { id: a.id },
    data: { suspendedAt: new Date() }
  });
  await deny(detail(a, c.caseId), 401);
  await deny(act(a, c.caseId, "reply", { body: "Suspended access" }), 401);
});
test("reply versus coordinator revocation has one serialized winner and never restores access", async () => {
  const a = await member("share_race");
  const pending = await requestConnection(db, a, f.churchA.id);
  await portalCommand(db, f.reviewerA.token, {
    operation: "transition",
    action: "APPROVE",
    churchId: f.churchA.id,
    connectionId: pending.id,
    expectedVersion: pending.version
  });
  const c = await create(a, { churchId: f.churchA.id });
  const option = (await detail(a, c.caseId)).shareOptions[0];
  await act(a, c.caseId, "share", {
    appointmentId: option.id,
    appointmentVersion: option.version,
    agreeHistory: true
  });
  const appointment = await db.churchContactAssignment.findUniqueOrThrow({
    where: { id: option.id }
  });
  const coordinator = [f.contact, f.coordinator].find(
    (x) => x.id === appointment.userId
  )!;
  const v = (await detail(a, c.caseId)).version;
  const command = (actor: PortalActor, operation: string, extra = {}) =>
    supportCommand(db, actor.token, {
      operation,
      caseId: c.caseId,
      expectedVersion: v,
      requestKey: randomUUID(),
      ...extra
    });
  const results = await Promise.allSettled([
    command(a, "revoke"),
    command(coordinator, "reply", { body: "Concurrent coordinator response." })
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  if (results[0].status === "rejected") await act(a, c.caseId, "revoke");
  await deny(detail(coordinator, c.caseId));
  assert.equal((await detail(a, c.caseId)).coordinator, null);
});
test("reopening without an eligible owner is honestly unassigned, preserving requester access", async () => {
  const a = await member("reopen_none");
  const c = await create(a);
  await act(a, c.caseId, "transition", {
    status: "CLOSED",
    reason: "Initially resolved by the requester."
  });
  await db.supportCapabilityGrant.update({
    where: { id: f.ownerGrant.id },
    data: { revokedAt: new Date(), version: { increment: 1 } }
  });
  await detail(a, c.caseId);
  await db.supportIntakeSetting.update({
    where: { id: "default" },
    data: { ownerGrantId: f.backupGrant.id }
  });
  const update = await act(a, c.caseId, "reopen", {
    reason: "A follow-up without an owner."
  });
  assert.match(update.message, /awaiting assignment/);
  assert.equal((await detail(a, c.caseId)).owner, null);
  await deny(detail(f.backup, c.caseId));
  await db.supportIntakeSetting.update({
    where: { id: "default" },
    data: { ownerGrantId: f.ownerGrant.id }
  });
  await db.supportCapabilityGrant.update({
    where: { id: f.ownerGrant.id },
    data: { revokedAt: null, version: { increment: 1 } }
  });
});
test("grant revoke and renewal cannot revive an assignment even without an intervening read", async () => {
  const a = await member("grant_gen");
  const c = await create(a);
  const old = await db.supportCapabilityGrant.findUniqueOrThrow({
    where: { id: f.ownerGrant.id }
  });
  await db.supportCapabilityGrant.update({
    where: { id: old.id },
    data: { revokedAt: new Date() }
  });
  const renewed = await db.supportCapabilityGrant.update({
    where: { id: old.id },
    data: { revokedAt: null }
  });
  assert.equal(renewed.version, old.version + 2);
  await deny(detail(f.owner, c.caseId));
  assert.equal((await detail(a, c.caseId)).owner, null);
  await assert.rejects(
    db.supportCapabilityGrant.update({
      where: { id: old.id },
      data: { userId: f.backup.id }
    })
  );
});
