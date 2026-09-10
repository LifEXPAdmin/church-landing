import test, { after, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { loginAccount, readAccountSession } from "../lib/platform/accounts";
import { verifyPassword } from "../lib/platform/auth";
import {
  ADULT_POLICY,
  getPortalSnapshot,
  portalCommand,
  PortalError
} from "../lib/platform/portal";
import {
  assertPortalTestDatabase,
  createPortalActor,
  requestConnection,
  seedOperatorGrants,
  seedPortal,
  type PortalActor,
  type PortalFixture
} from "./seed-portal";

const db = new PrismaClient();
let f: PortalFixture;
before(async () => {
  await assertPortalTestDatabase(db);
  f = await seedPortal(db);
});
beforeEach(async () => {
  await db.platformAuthLimit.deleteMany();
});
after(async () => {
  await db.$disconnect();
});
const denied = (promise: Promise<unknown>, status = 403) =>
  assert.rejects(
    promise,
    (error: unknown) => error instanceof PortalError && error.status === status
  );
const command = (actor: PortalActor, body: Record<string, unknown>) =>
  portalCommand(db, actor.token, body);
const connection = (actor: PortalActor, churchId = f.churchA.id) =>
  db.churchConnection.findUniqueOrThrow({
    where: { userId_churchId: { userId: actor.id, churchId } }
  });
async function approve(actor: PortalActor) {
  const row = await requestConnection(db, actor, f.churchA.id);
  await command(f.reviewerA, {
    operation: "transition",
    action: "APPROVE",
    churchId: f.churchA.id,
    connectionId: row.id,
    expectedVersion: row.version
  });
  return connection(actor);
}

test("requests require a different eligible assigned reviewer and never fake pending setup", async () => {
  const actor = await createPortalActor(db, "setup_member");
  const reviewer = await createPortalActor(db, "setup_review");
  const church = await db.church.create({ data: {
    name: "Fictional setup-pending church", slug: `setup-${actor.id}`,
    summary: "Isolated test fixture only."
  }});
  const request = () => command(actor, { operation: "request", churchId: church.id, expectedVersion: 0 });
  await denied(request(), 503);
  const selfGrant = await db.churchCapabilityGrant.create({ data: {
    churchId: church.id, userId: actor.id, capability: "REVIEW_CONNECTIONS"
  }});
  await denied(request(), 503);
  const grant = await db.churchCapabilityGrant.create({ data: {
    churchId: church.id, userId: reviewer.id, capability: "REVIEW_CONNECTIONS", revokedAt: new Date()
  }});
  await denied(request(), 503);
  await db.churchCapabilityGrant.update({ where: { id: grant.id }, data: { revokedAt: null } });
  await db.platformUser.update({ where: { id: reviewer.id }, data: { suspendedAt: new Date() } });
  await denied(request(), 503);
  await db.platformUser.update({ where: { id: reviewer.id }, data: { suspendedAt: null, emailVerifiedAt: null } });
  await denied(request(), 503);
  assert.equal(await db.churchConnection.count({ where: { churchId: church.id } }), 0);
  assert.equal(await db.churchAuditEvent.count({ where: { churchId: church.id, action: "REQUEST" } }), 0);
  // All identity setup in this file is guarded, fictional and loopback-only.
  await db.platformUser.update({ where: { id: reviewer.id }, data: { emailVerifiedAt: new Date() } });
  await request();
  assert.equal((await connection(actor, church.id)).state, "PENDING");
  assert.equal((await db.churchCapabilityGrant.findUniqueOrThrow({ where: { id: selfGrant.id } })).revokedAt, null);
});

test("church upgrade preserves Stage2A credentials, sessions and grants without invented verification", async () => {
  const user = await db.platformUser.findUniqueOrThrow({
    where: { id: "fixture-stage2a" }
  });
  assert.match(user.passwordHash!, /^scrypt-v2:/);
  assert.ok(
    await verifyPassword("Fictional-stage2a-password-1", user.passwordHash)
  );
  assert.equal(user.emailVerifiedAt, null);
  assert.equal(user.adultAcknowledgedAt, null);
  assert.equal(user.suspendedAt, null);
  assert.equal(user.portalVersion, 0);
  assert.equal(
    await db.platformSession.count({
      where: { id: "fixture-stage2a-session", userId: user.id }
    }),
    1
  );
  assert.equal(
    await db.platformAccountGrant.count({
      where: { id: "fixture-stage2a-grant", userId: user.id, consumedAt: null }
    }),
    1
  );
  assert.equal(
    await db.churchConnection.count({ where: { userId: user.id } }),
    0
  );
});

test("unverified and unacknowledged actors cannot request, share, view directory or receive grants", async () => {
  for (const actor of [f.unverified, f.unacknowledged]) {
    const snapshot = await getPortalSnapshot(db, actor.token, "discover");
    assert.equal(snapshot.operatorCapabilities.length, 0);
    await denied(
      command(actor, {
        operation: "request",
        churchId: f.churchA.id,
        expectedVersion: 0
      })
    );
    await denied(getPortalSnapshot(db, actor.token, "directory", f.churchA.id));
    await denied(
      command(actor, {
        operation: "share",
        connectionId: (await connection(f.memberA)).id
      })
    );
    await denied(
      command(f.operator, {
        operation: "grant",
        churchId: f.churchA.id,
        userId: actor.id,
        capability: "REVIEW_CONNECTIONS",
        expectedVersion: 0
      })
    );
  }
  await denied(
    command(f.unacknowledged, {
      operation: "ack-adult",
      expectedVersion: 0,
      acknowledged: false,
      policy: ADULT_POLICY
    }),
    400
  );
  await denied(
    command(f.unacknowledged, {
      operation: "ack-adult",
      expectedVersion: 0,
      acknowledged: true,
      policy: "forged-policy"
    }),
    400
  );
  assert.equal(
    await db.churchConnection.count({
      where: { userId: { in: [f.unverified.id, f.unacknowledged.id] } }
    }),
    0
  );
});

test("account category, forged actor/grant fields and ordinary membership never grant authority", async () => {
  for (const actor of [f.memberA, f.memberB]) {
    const own = await getPortalSnapshot(db, actor.token, "my-church");
    assert.deepEqual(own.operatorCapabilities, []);
    assert.deepEqual(own.reviewerChurches, []);
    await denied(getPortalSnapshot(db, actor.token, "operator"));
    await denied(
      command(actor, {
        operation: "grant",
        churchId: f.churchA.id,
        userId: actor.id,
        actorId: f.operator.id,
        role: "ADMIN",
        operatorCapabilities: ["MANAGE_CHURCH_ACCESS"],
        capability: "REVIEW_CONNECTIONS",
        expectedVersion: 0
      })
    );
    await denied(
      command(actor, {
        operation: "establish",
        name: "Forged",
        slug: "forged",
        summary: "Fictional forgery",
        expectedVersion: 0
      })
    );
  }
  assert.equal(
    await db.churchCapabilityGrant.count({
      where: { userId: { in: [f.memberA.id, f.memberB.id] } }
    }),
    0
  );
  await denied(getPortalSnapshot(db, "forged-session", "discover"), 401);
});

test("one combined pending/approved affiliation survives service races and all DB constraint combinations", async () => {
  const actor = await createPortalActor(db, "race");
  const attempts = await Promise.allSettled(
    [f.churchA, f.churchB].map((church) =>
      command(actor, {
        operation: "request",
        churchId: church.id,
        expectedVersion: 0
      })
    )
  );
  assert.equal(attempts.filter((r) => r.status === "fulfilled").length, 1);
  for (const r of attempts)
    if (r.status === "rejected") {
      assert.ok(r.reason instanceof PortalError);
      assert.equal(r.reason.status, 409);
    }
  const active = await db.churchConnection.findFirstOrThrow({
    where: { userId: actor.id, state: "PENDING" }
  });
  const reviewer = active.churchId === f.churchA.id ? f.reviewerA : f.reviewerB;
  await command(reviewer, {
    operation: "transition",
    action: "APPROVE",
    churchId: active.churchId,
    connectionId: active.id,
    expectedVersion: active.version
  });
  await denied(
    command(actor, {
      operation: "request",
      expectedVersion: 0,
      churchId: active.churchId === f.churchA.id ? f.churchB.id : f.churchA.id
    }),
    409
  );
  const rawActor = await createPortalActor(db, "db_race");
  for (const first of ["PENDING", "APPROVED"] as const) {
    for (const second of ["PENDING", "APPROVED"] as const) {
      await assert.rejects(
        db.$transaction([
          db.churchConnection.create({
            data: { userId: rawActor.id, churchId: f.churchA.id, state: first }
          }),
          db.churchConnection.create({
            data: { userId: rawActor.id, churchId: f.churchB.id, state: second }
          })
        ]),
        (e: unknown) =>
          !!e && typeof e === "object" && "code" in e && e.code === "P2002"
      );
      assert.equal(
        await db.churchConnection.count({ where: { userId: rawActor.id } }),
        0
      );
    }
  }
});

test("self review, cross-church review, ordinary/contact decisions and forged sharing targets are denied", async () => {
  const pending = await connection(f.pending);
  for (const actor of [
    f.memberA,
    f.coordinator,
    f.contact,
    f.relationshipOwner,
    f.reviewerB
  ]) {
    await denied(
      command(actor, {
        operation: "transition",
        action: "APPROVE",
        churchId: f.churchA.id,
        connectionId: pending.id,
        expectedVersion: pending.version
      })
    );
  }
  await denied(
    command(f.reviewerA, {
      operation: "transition",
      action: "APPROVE",
      churchId: f.churchB.id,
      connectionId: pending.id,
      expectedVersion: pending.version
    })
  );
  await denied(
    command(f.memberB, {
      operation: "share",
      connectionId: (await connection(f.memberA)).id,
      expectedVersion: 3,
      ...f.sharing
    })
  );
  await denied(
    command(f.memberA, {
      operation: "transition",
      action: "WITHDRAW",
      churchId: f.churchA.id,
      connectionId: pending.id,
      expectedVersion: pending.version
    })
  );
  const selfReviewer = await createPortalActor(db, "selfrev");
  await command(f.operator, {
    operation: "grant",
    churchId: f.churchA.id,
    userId: selfReviewer.id,
    capability: "REVIEW_CONNECTIONS",
    expectedVersion: 0
  });
  const grant = await db.churchCapabilityGrant.findFirstOrThrow({
    where: {
      userId: selfReviewer.id,
      churchId: f.churchA.id,
      capability: "REVIEW_CONNECTIONS",
      revokedAt: null
    }
  });
  assert.equal(grant.dependencyConnectionId, null);
  const self = await requestConnection(db, selfReviewer, f.churchA.id);
  assert.deepEqual(
    await db.churchCapabilityGrant.findUnique({ where: { id: grant.id } }),
    grant,
    "A first connection request preserves an independently assigned review grant"
  );
  assert.ok(
    (
      await getPortalSnapshot(db, selfReviewer.token, "review", f.churchA.id)
    ).queue?.some((row) => row.id === self.id),
    "Self-review denial must test an actor with a live review grant"
  );
  await assert.rejects(
    command(selfReviewer, {
      operation: "transition",
      action: "APPROVE",
      churchId: f.churchA.id,
      connectionId: self.id,
      expectedVersion: self.version
    }),
    (error: unknown) =>
      error instanceof PortalError &&
      error.status === 403 &&
      /cannot review your own connection/i.test(error.message)
  );
  assert.equal((await connection(f.pending)).state, "PENDING");
  assert.deepEqual(await connection(selfReviewer), self);
  const other = await createPortalActor(db, "selfother");
  const otherRequest = await requestConnection(db, other, f.churchA.id);
  await command(selfReviewer, {
    operation: "transition",
    action: "APPROVE",
    churchId: f.churchA.id,
    connectionId: otherRequest.id,
    expectedVersion: otherRequest.version
  });
  assert.equal((await connection(other)).state, "APPROVED");
  assert.ok(
    (await getPortalSnapshot(db, f.reviewerA.token, "review", f.churchA.id))
      .queue,
    "Shared reviewer remains authorized for subsequent scenarios"
  );
});

test("array sharing audiences are rejected without mutating consent or connection version", async () => {
  const row = await connection(f.memberA);
  const before = await db.churchDirectoryPreference.findUniqueOrThrow({
    where: { connectionId: row.id }
  });
  for (const audience of [
    { emailAudience: ["SAME_CHURCH"] },
    { phoneAudience: ["ONLY_ME"] }
  ]) {
    await denied(
      command(f.memberA, {
        operation: "share",
        connectionId: row.id,
        expectedVersion: row.version,
        ...f.sharing,
        ...audience
      }),
      400
    );
    assert.deepEqual(await connection(f.memberA), row);
    assert.deepEqual(
      await db.churchDirectoryPreference.findUnique({
        where: { connectionId: row.id }
      }),
      before
    );
  }
});

test("stale review transitions cannot overwrite the single concurrent winner", async () => {
  const row = await connection(f.pending);
  const results = await Promise.allSettled(
    ["APPROVE", "DECLINE"].map((action) =>
      command(f.reviewerA, {
        operation: "transition",
        action,
        churchId: f.churchA.id,
        connectionId: row.id,
        expectedVersion: row.version
      })
    )
  );
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  const rejected = results.find(
    (r) => r.status === "rejected"
  ) as PromiseRejectedResult;
  assert.ok(rejected.reason instanceof PortalError);
  assert.equal(rejected.reason.status, 409);
  const updated = await connection(f.pending);
  assert.equal(updated.version, row.version + 1);
  await denied(
    command(f.reviewerA, {
      operation: "transition",
      action: "REMOVE",
      churchId: f.churchA.id,
      connectionId: row.id,
      expectedVersion: row.version
    }),
    409
  );
});

test("array actions cannot bypass target eligibility to approve a suspended pending request", async () => {
  const actor = await createPortalActor(db, "array");
  await requestConnection(db, actor, f.churchA.id);
  const version = (await getPortalSnapshot(db, actor.token, "my-church")).viewer
    .version;
  await command(f.operator, {
    operation: "suspend",
    userId: actor.id,
    suspended: true,
    expectedVersion: version
  });
  const row = await connection(actor);
  assert.equal(row.state, "PENDING");
  await denied(
    command(f.reviewerA, {
      operation: "transition",
      action: ["APPROVE"],
      churchId: f.churchA.id,
      connectionId: row.id,
      expectedVersion: row.version
    }),
    400
  );
  assert.deepEqual(await connection(actor), row);
});

test("operator DTOs obey per-capability least privilege and scoped appointment visibility", async () => {
  const establish = await createPortalActor(db, "establish");
  await seedOperatorGrants(db, establish, ["ESTABLISH_CHURCH"]);
  const minimal = await getPortalSnapshot(db, establish.token, "operator");
  assert.deepEqual(minimal.operator, {
    users: [],
    grants: [],
    assignments: []
  });
  const access = await createPortalActor(db, "access");
  await seedOperatorGrants(db, access, ["MANAGE_CHURCH_ACCESS"]);
  const grants = (await getPortalSnapshot(db, access.token, "operator"))
    .operator!;
  assert.ok(grants.users.some((u) => u.id === f.memberA.id));
  assert.ok(grants.users.every((u) => u.eligible));
  assert.ok(
    grants.users.every((u) => !("suspended" in u) && !("version" in u))
  );
  assert.ok(grants.grants.length > 0);
  assert.deepEqual(grants.assignments, []);
  assert.ok(!JSON.stringify(grants).includes(f.memberA.email));
  const owner = await createPortalActor(db, "ownerops");
  await seedOperatorGrants(db, owner, ["ASSIGN_RELATIONSHIP_OWNER"]);
  const owners = (await getPortalSnapshot(db, owner.token, "operator"))
    .operator!;
  assert.ok(owners.assignments.length > 0);
  assert.ok(owners.assignments.every((a) => a.slot === "RELATIONSHIP_OWNER"));
  assert.deepEqual(owners.grants, []);
  assert.ok(
    owners.users.every((u) => !("suspended" in u) && !("version" in u))
  );
  const scoped = (await getPortalSnapshot(db, f.coordinator.token, "operator"))
    .operator!;
  assert.ok(scoped.assignments.length > 0);
  assert.ok(
    scoped.assignments.every(
      (a) =>
        a.churchId === f.churchA.id && ["PRIMARY", "BACKUP"].includes(a.slot)
    )
  );
  assert.deepEqual(scoped.grants, []);
  assert.ok(!scoped.users.some((u) => u.id === f.memberB.id));
  assert.ok(
    scoped.users.every((u) => !("suspended" in u) && !("version" in u))
  );
  const full = (await getPortalSnapshot(db, f.operator.token, "operator"))
    .operator!;
  assert.ok(
    full.users.every(
      (u) => typeof u.suspended === "boolean" && typeof u.version === "number"
    )
  );
});

test("safe server DTOs expose only consented contact fields and never authentication contacts", async () => {
  const directory = await getPortalSnapshot(
    db,
    f.contact.token,
    "directory",
    f.churchA.id
  );
  assert.deepEqual(directory.directory, [
    { name: f.sharing.displayName, email: f.sharing.contactEmail }
  ]);
  for (const view of ["directory", "help", "my-church"] as const) {
    const serialized = JSON.stringify(
      await getPortalSnapshot(db, f.contact.token, view, f.churchA.id)
    );
    for (const actor of [
      f.memberA,
      f.contact,
      f.relationshipOwner,
      f.operator
    ]) {
      assert.ok(!serialized.includes(actor.email));
      assert.ok(!serialized.includes(actor.token));
    }
    assert.ok(!serialized.includes(f.sharing.phone));
    assert.doesNotMatch(serialized, /passwordHash|tokenHash|credentialVersion/);
  }
  for (const actor of [f.operator, f.coordinator]) {
    const serialized = JSON.stringify(
      await getPortalSnapshot(db, actor.token, "operator")
    );
    assert.ok(!serialized.includes(f.memberA.email));
    assert.ok(!serialized.includes(f.sharing.contactEmail));
    assert.ok(!serialized.includes(f.sharing.phone));
  }
  const own = await getPortalSnapshot(
    db,
    f.memberA.token,
    "sharing",
    f.churchA.id
  );
  assert.equal(own.sharing?.phone, f.sharing.phone);
  assert.deepEqual(own.sharing?.preview, directory.directory![0]);
  await denied(
    getPortalSnapshot(db, f.memberB.token, "directory", f.churchA.id)
  );
  const row = await connection(f.memberA);
  await command(f.memberA, {
    operation: "share",
    connectionId: row.id,
    expectedVersion: row.version,
    ...f.sharing,
    listed: false
  });
  const hidden = await getPortalSnapshot(
    db,
    f.contact.token,
    "directory",
    f.churchA.id
  );
  assert.deepEqual(hidden.directory, []);
  const draft = (
    await getPortalSnapshot(db, f.memberA.token, "sharing", f.churchA.id)
  ).sharing!;
  assert.equal(draft.emailAudience, "ONLY_ME");
  assert.equal(draft.phoneAudience, "ONLY_ME");
  assert.equal(draft.preview, null);
  assert.equal(draft.contactEmail, f.sharing.contactEmail);
});

test("explicit contact titles do not grant approval, directory access, or relationship-owner membership", async () => {
  const help = await getPortalSnapshot(
    db,
    f.memberA.token,
    "help",
    f.churchA.id
  );
  assert.deepEqual(help.contacts?.map((c) => c.slot).sort(), [
    "PRIMARY",
    "RELATIONSHIP_OWNER"
  ]);
  assert.equal(
    await db.churchConnection.count({
      where: { userId: f.relationshipOwner.id }
    }),
    0
  );
  assert.equal(
    await db.churchCapabilityGrant.count({
      where: { userId: { in: [f.relationshipOwner.id, f.contact.id] } }
    }),
    0
  );
  for (const actor of [f.relationshipOwner, f.reviewerB, f.operator]) {
    await denied(getPortalSnapshot(db, actor.token, "directory", f.churchA.id));
    await denied(getPortalSnapshot(db, actor.token, "help", f.churchA.id));
    const outside = await getPortalSnapshot(db, actor.token, "help");
    assert.equal(outside.contacts, undefined);
  }
  await denied(
    command(f.coordinator, {
      operation: "assign-contact",
      churchId: f.churchA.id,
      slot: "BACKUP",
      userId: f.relationshipOwner.id,
      audience: "SAME_CHURCH",
      expectedVersion: 0
    })
  );
  await denied(
    command(f.coordinator, {
      operation: "assign-contact",
      churchId: f.churchA.id,
      slot: "RELATIONSHIP_OWNER",
      userId: f.memberA.id,
      audience: "SAME_CHURCH",
      expectedVersion: 1
    })
  );
});

test("sharing/removal concurrency cannot restore access or leak a removed member", async () => {
  const actor = await createPortalActor(db, "remove");
  await approve(actor);
  for (let attempt = 0; attempt < 2; attempt++) {
    const row = await connection(actor);
    const results = await Promise.allSettled([
      command(actor, {
        operation: "share",
        connectionId: row.id,
        expectedVersion: row.version,
        ...f.sharing,
        displayName: actor.name
      }),
      command(f.reviewerA, {
        operation: "transition",
        action: "REMOVE",
        churchId: f.churchA.id,
        connectionId: row.id,
        expectedVersion: row.version
      })
    ]);
    assert.ok(results.some((r) => r.status === "fulfilled"));
    for (const result of results)
      if (result.status === "rejected") {
        assert.ok(result.reason instanceof PortalError);
        assert.ok([403, 409].includes(result.reason.status));
      }
    const current = await connection(actor);
    if (current.state === "APPROVED")
      await command(f.reviewerA, {
        operation: "transition",
        action: "REMOVE",
        churchId: f.churchA.id,
        connectionId: current.id,
        expectedVersion: current.version
      });
    assert.equal((await connection(actor)).state, "REMOVED");
    assert.equal(
      await db.churchDirectoryPreference.count({
        where: { connectionId: row.id }
      }),
      0
    );
    await denied(
      command(actor, {
        operation: "share",
        connectionId: row.id,
        expectedVersion: row.version,
        ...f.sharing
      })
    );
    assert.ok(
      !(
        await getPortalSnapshot(db, f.memberA.token, "directory", f.churchA.id)
      ).directory?.some((e) => e.name === actor.name)
    );
    if (attempt === 0) await approve(actor);
  }
});

test("leave/rejoin clears consent while dependent grants and contact appointments stay revoked", async () => {
  const actor = f.contact;
  await command(f.operator, {
    operation: "grant",
    churchId: f.churchA.id,
    userId: actor.id,
    capability: "REVIEW_CONNECTIONS",
    expectedVersion: 0
  });
  let row = await connection(actor);
  await command(actor, {
    operation: "share",
    connectionId: row.id,
    expectedVersion: row.version,
    ...f.sharing,
    displayName: actor.name
  });
  row = await connection(actor);
  await command(actor, {
    operation: "transition",
    action: "LEAVE",
    churchId: f.churchA.id,
    connectionId: row.id,
    expectedVersion: row.version
  });
  assert.ok(
    await readAccountSession(db, actor.token),
    "Leaving is not account deletion"
  );
  await denied(getPortalSnapshot(db, actor.token, "directory", f.churchA.id));
  await denied(getPortalSnapshot(db, actor.token, "review", f.churchA.id));
  const grant = await db.churchCapabilityGrant.findFirstOrThrow({
    where: { userId: actor.id }
  });
  const appointment = await db.churchContactAssignment.findFirstOrThrow({
    where: { userId: actor.id }
  });
  assert.ok(grant.revokedAt);
  assert.ok(appointment.revokedAt);
  await approve(actor);
  const own = await getPortalSnapshot(db, actor.token, "sharing", f.churchA.id);
  assert.equal(own.sharing?.listed, false);
  assert.equal(own.sharing?.contactEmail, "");
  assert.equal(own.sharing?.phone, "");
  assert.equal(own.sharing?.preview, null);
  assert.deepEqual(
    await db.churchCapabilityGrant.findUnique({ where: { id: grant.id } }),
    grant
  );
  assert.deepEqual(
    await db.churchContactAssignment.findUnique({
      where: { id: appointment.id }
    }),
    appointment
  );
  await denied(getPortalSnapshot(db, actor.token, "review", f.churchA.id));
  assert.ok(
    !(
      await getPortalSnapshot(db, f.memberA.token, "help", f.churchA.id)
    ).contacts?.some((c) => c.name === actor.name)
  );
});

test("suspension ends sessions and grants; restoring the account does not restore prior sharing", async () => {
  const actor = await createPortalActor(db, "suspend");
  const row = await approve(actor);
  await command(actor, {
    operation: "share",
    connectionId: row.id,
    expectedVersion: row.version,
    ...f.sharing,
    displayName: actor.name
  });
  await command(f.operator, {
    operation: "grant",
    churchId: f.churchA.id,
    userId: actor.id,
    capability: "REVIEW_CONNECTIONS",
    expectedVersion: 0
  });
  await command(f.coordinator, {
    operation: "assign-contact",
    churchId: f.churchA.id,
    userId: actor.id,
    slot: "BACKUP",
    audience: "SAME_CHURCH",
    expectedVersion: 0,
    contactEmail: "fictional-backup@example.test"
  });
  const version = (await getPortalSnapshot(db, actor.token, "my-church")).viewer
    .version;
  await command(f.operator, {
    operation: "suspend",
    userId: actor.id,
    suspended: true,
    expectedVersion: version
  });
  assert.equal(await readAccountSession(db, actor.token), null);
  await denied(
    getPortalSnapshot(db, actor.token, "directory", f.churchA.id),
    401
  );
  await assert.rejects(loginAccount(db, actor.email, actor.password, null));
  assert.equal(
    await db.churchDirectoryPreference.count({
      where: { connectionId: row.id }
    }),
    0
  );
  assert.equal(
    await db.churchCapabilityGrant.count({
      where: { userId: actor.id, revokedAt: null }
    }),
    0
  );
  assert.equal(
    await db.churchContactAssignment.count({
      where: { userId: actor.id, revokedAt: null }
    }),
    0
  );
  assert.ok(
    !(
      await getPortalSnapshot(db, f.memberA.token, "directory", f.churchA.id)
    ).directory?.some((e) => e.name === actor.name)
  );
  await command(f.operator, {
    operation: "suspend",
    userId: actor.id,
    suspended: false,
    expectedVersion: version + 1
  });
  const newToken = await loginAccount(db, actor.email, actor.password, null);
  assert.equal(
    (await getPortalSnapshot(db, newToken, "sharing", f.churchA.id)).sharing
      ?.listed,
    false
  );
  await denied(getPortalSnapshot(db, newToken, "review", f.churchA.id));
  assert.equal(await readAccountSession(db, actor.token), null);
});

test("decline, withdrawal, leave and removal each require fresh approval on re-request", async () => {
  for (const [action, state] of [
    ["DECLINE", "DECLINED"],
    ["WITHDRAW", "WITHDRAWN"],
    ["LEAVE", "LEFT"],
    ["REMOVE", "REMOVED"]
  ] as const) {
    const actor = await createPortalActor(db, action.toLowerCase());
    let row = await requestConnection(db, actor, f.churchA.id);
    if (action === "LEAVE" || action === "REMOVE") {
      await command(f.reviewerA, {
        operation: "transition",
        action: "APPROVE",
        churchId: f.churchA.id,
        connectionId: row.id,
        expectedVersion: row.version
      });
      row = await connection(actor);
    }
    await command(
      action === "WITHDRAW" || action === "LEAVE" ? actor : f.reviewerA,
      {
        operation: "transition",
        action,
        churchId: f.churchA.id,
        connectionId: row.id,
        expectedVersion: row.version
      }
    );
    const terminal = await connection(actor);
    assert.equal(terminal.state, state);
    assert.equal(terminal.version, row.version + 1);
    await denied(getPortalSnapshot(db, actor.token, "directory", f.churchA.id));
    const requested = await requestConnection(db, actor, f.churchA.id);
    assert.equal(requested.id, terminal.id);
    assert.equal(requested.state, "PENDING");
    assert.equal(requested.version, terminal.version + 1);
    await denied(getPortalSnapshot(db, actor.token, "directory", f.churchA.id));
    await command(f.reviewerA, {
      operation: "transition",
      action: "APPROVE",
      churchId: f.churchA.id,
      connectionId: requested.id,
      expectedVersion: requested.version
    });
    assert.equal((await connection(actor)).state, "APPROVED");
    const sharing = (
      await getPortalSnapshot(db, actor.token, "sharing", f.churchA.id)
    ).sharing!;
    assert.equal(sharing.listed, false);
    assert.equal(sharing.preview, null);
    assert.equal(sharing.contactEmail, "");
    assert.equal(sharing.phone, "");
    assert.equal(
      await db.churchDirectoryPreference.count({
        where: { connectionId: requested.id }
      }),
      0
    );
  }
});

test("scoped grant and contact revocation applies to already authenticated sessions", async () => {
  const token = f.reviewerB.token;
  assert.ok((await getPortalSnapshot(db, token, "review", f.churchB.id)).queue);
  const grant = await db.churchCapabilityGrant.findFirstOrThrow({
    where: { userId: f.reviewerB.id }
  });
  await command(f.operator, {
    operation: "revoke-grant",
    churchId: f.churchB.id,
    id: grant.id,
    expectedVersion: grant.version
  });
  assert.ok(await readAccountSession(db, token));
  await denied(getPortalSnapshot(db, token, "review", f.churchB.id));
  assert.deepEqual(
    (await getPortalSnapshot(db, token, "my-church")).reviewerChurches,
    []
  );
  const owner = await db.churchContactAssignment.findFirstOrThrow({
    where: { userId: f.relationshipOwner.id }
  });
  await command(f.operator, {
    operation: "revoke-contact",
    churchId: f.churchA.id,
    id: owner.id,
    expectedVersion: owner.version
  });
  assert.ok(
    !(
      await getPortalSnapshot(db, f.memberA.token, "help", f.churchA.id)
    ).contacts?.some((c) => c.slot === "RELATIONSHIP_OWNER")
  );
  const coordinatorGrant = await db.churchCapabilityGrant.findFirstOrThrow({
    where: { userId: f.coordinator.id }
  });
  await command(f.operator, {
    operation: "revoke-grant",
    churchId: f.churchA.id,
    id: coordinatorGrant.id,
    expectedVersion: coordinatorGrant.version
  });
  await denied(
    command(f.coordinator, {
      operation: "assign-contact",
      churchId: f.churchA.id,
      slot: "PRIMARY",
      userId: f.memberA.id,
      audience: "SAME_CHURCH",
      expectedVersion: 2
    })
  );
});

test("church tools and scoped detail access remain independent from discovery searches", async () => {
  const reviewer = await createPortalActor(db, "search_reviewer");
  const church = await db.church.create({data:{
    slug: `late-${reviewer.id}`, name: "ZZZZZ Fictional assigned church", summary: "Assigned outside the current search."
  }});
  await db.church.createMany({data:Array.from({length:101},(_,i)=>({
    slug:`earlier-${reviewer.id}-${i}`, name:`! Earlier search fixture ${i}`, summary:"Public only."
  }))});
  const grant = await db.churchCapabilityGrant.create({data:{
    userId:reviewer.id, churchId:church.id, capability:"REVIEW_CONNECTIONS"
  }});
  const snapshot = await getPortalSnapshot(db, reviewer.token, "discover", undefined, "no matching church " + reviewer.id);
  assert.deepEqual(snapshot.churches, []);
  assert.deepEqual(snapshot.reviewerChurches.map(c=>c.id), [church.id]);
  const review = await getPortalSnapshot(db, reviewer.token, "review", church.id);
  assert.equal(review.church?.id, church.id);
  await denied(getPortalSnapshot(db, f.memberB.token, "review", church.id));
  await db.churchCapabilityGrant.update({where:{id:grant.id},data:{revokedAt:new Date()}});
  await denied(getPortalSnapshot(db, reviewer.token, "review", church.id));
  const revoked = await getPortalSnapshot(db, reviewer.token, "discover", undefined, "no matching church " + reviewer.id);
  assert.deepEqual(revoked.reviewerChurches, []);
});
