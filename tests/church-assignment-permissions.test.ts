import { calendarCommand } from "../lib/platform/calendar-commands";
import { postCommand } from "../lib/platform/post-commands";
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient, type ChurchCapability } from "@prisma/client";
import { assertPortalTestDatabase, seedPortal } from "./seed-portal";
import {
  churchStructureCommand,
  getChurchStructure
} from "../lib/platform/church-structure";
import {
  PortalError,
  portalCommand,
  portal,
  hasChurchCapability,
  getPortalSnapshot,
  publicChurches
} from "../lib/platform/portal";
import { effectiveChurchGrants } from "../lib/platform/church-permissions";
import { calendarContext, calendarHas } from "../lib/platform/calendar-access";
import { postContext } from "../lib/platform/post-access";
import { delegableChurchCapabilities } from "../lib/platform/church-assignment-permissions";
import { loginAccount } from "../lib/platform/accounts";
import { positionPlacementLabel } from "../lib/platform/church-position-placement";
const db = new PrismaClient();
before(() => assertPortalTestDatabase(db));
after(() => db.$disconnect());
const denied = (p: Promise<unknown>, status = 403) =>
  assert.rejects(
    p,
    (e: unknown) => e instanceof PortalError && e.status === status
  );

async function fixture() {
  const f = await seedPortal(db);
  const churchId = f.churchA.id;
  const seededGrant = await db.churchCapabilityGrant.findUniqueOrThrow({
    where: {
      userId_churchId_capability: {
        userId: f.coordinator.id,
        churchId,
        capability: "APPOINT_COORDINATORS"
      }
    }
  });
  await portalCommand(db, f.operator.token, {
    operation: "revoke-grant",
    churchId,
    id: seededGrant.id,
    expectedVersion: seededGrant.version
  });
  const grant = async (capability: ChurchCapability, userId = f.memberA.id) => {
    const old = await db.churchCapabilityGrant.findUnique({
      where: { userId_churchId_capability: { userId, churchId, capability } }
    });
    return portalCommand(db, f.operator.token, {
      operation: "grant",
      churchId,
      userId,
      capability,
      expectedVersion: old?.version ?? 0
    });
  };
  for (const capability of delegableChurchCapabilities) await grant(capability);
  const connection = await db.churchConnection.findUniqueOrThrow({
    where: { userId_churchId: { userId: f.coordinator.id, churchId } }
  });
  const version = async () =>
    (await db.church.findUniqueOrThrow({ where: { id: churchId } }))
      .structureVersion;
  const cmd = async (input: Record<string, unknown>, token = f.memberA.token) =>
    churchStructureCommand(db, token, {
      churchId,
      expectedVersion: await version(),
      ...input
    });
  const position = () =>
    cmd({
      operation: "create",
      name: "Fictional reviewed position",
      requestKey: randomUUID()
    });
  const save = async (
    positionId: string,
    capabilities: ChurchCapability[],
    extra: Record<string, unknown> = {},
    token = f.memberA.token
  ) => {
    const old = await db.churchPositionAssignment.findUnique({
      where: {
        positionId_connectionId: { positionId, connectionId: connection.id }
      }
    });
    return cmd(
      {
        operation: "assignment-privileges",
        positionId,
        connectionId: connection.id,
        capabilities,
        privilegesReviewed: true,
        confirmed: true,
        requestKey: randomUUID(),
        assignmentVersion: old?.version ?? 0,
        ...extra
      },
      token
    );
  };
  const effective = () =>
    effectiveChurchGrants(db, f.coordinator.id, [churchId]);
  return {
    ...f,
    churchId,
    connection,
    grant,
    version,
    cmd,
    position,
    save,
    effective
  };
}

test("placement: new role instances remain independently unconnected; placement, vacancy and duties preserve grants across sessions", async () => {
  const f = await fixture();
  const title = await f.cmd({
    operation: "template-create",
    requestKey: randomUUID(),
    name: "Placement ministry",
    presetKey: "G"
  });
  const create = () =>
    f.cmd({
      operation: "create",
      requestKey: randomUUID(),
      roleTemplateId: title.id,
      roleTemplateVersion: 1
    });
  const a = await create(),
    b = await create();
  const assignment = await f.save(a.id, ["PUBLISH_CHURCH_POSTS"]);
  await f.save(b.id, ["PUBLISH_CHURCH_POSTS"]);
  const secondSession = await loginAccount(
    db,
    f.memberA.email,
    f.memberA.password,
    null
  );
  const read = () =>
    getChurchStructure(db, secondSession, { churchId: f.churchId });
  let snapshot = await read();
  for (const id of [a.id, b.id]) {
    const row = snapshot.positions.find((p) => p.id === id)!;
    assert.equal(row.placement, "UNCONNECTED");
    assert.equal(row.parentId, null);
    assert.equal(row.assignments.length, 1);
  }
  const grants = await db.churchRoleGrant.findMany({
    where: { churchId: f.churchId },
    orderBy: { id: "asc" }
  });
  const direct = await db.churchCapabilityGrant.findMany({
    where: { churchId: f.churchId },
    orderBy: { id: "asc" }
  });
  await f.cmd({ operation: "place", positionId: a.id, placement: "ROOT" });
  snapshot = await read();
  assert.equal(
    snapshot.positions.find((p) => p.id === a.id)!.placement,
    "ROOT"
  );
  assert.equal(
    snapshot.positions.find((p) => p.id === b.id)!.placement,
    "UNCONNECTED"
  );
  await f.cmd({
    operation: "place",
    positionId: b.id,
    placement: "REPORTING",
    parentId: a.id
  });
  await f.cmd({
    operation: "edit",
    positionId: b.id,
    name: "Updated duties title",
    description: "Keep the saved reporting line"
  });
  assert.equal(
    (await read()).positions.find((p) => p.id === b.id)!.parentId,
    a.id
  );
  await f.cmd({
    operation: "place",
    positionId: a.id,
    placement: "UNCONNECTED"
  });
  snapshot = await read();
  const child = snapshot.positions.find((p) => p.id === b.id)!;
  assert.equal(child.parentId, a.id);
  assert.equal(
    positionPlacementLabel(child, snapshot.positions),
    "In a branch not connected yet"
  );
  assert.deepEqual(
    await db.churchRoleGrant.findMany({
      where: { churchId: f.churchId },
      orderBy: { id: "asc" }
    }),
    grants
  );
  assert.deepEqual(
    await db.churchCapabilityGrant.findMany({
      where: { churchId: f.churchId },
      orderBy: { id: "asc" }
    }),
    direct
  );
  for (const input of [
    {
      operation: "place",
      positionId: a.id,
      placement: "REPORTING",
      parentId: b.id
    },
    { operation: "place", positionId: a.id, placement: "ROOT", parentId: b.id },
    { operation: "place", positionId: a.id, placement: ["ROOT"] },
    { operation: "place", positionId: a.id, placement: "REPORTING" },
    {
      operation: "create",
      requestKey: randomUUID(),
      name: "Cannot infer",
      parentId: a.id
    },
    {
      operation: "create",
      requestKey: randomUUID(),
      name: "Cannot assume root",
      placement: "ROOT"
    },
    {
      operation: "edit",
      positionId: b.id,
      name: "Cannot silently detach",
      parentId: ""
    }
  ])
    await denied(f.cmd(input), 400);
  await denied(
    f.cmd(
      { operation: "place", positionId: b.id, placement: "ROOT" },
      f.coordinator.token
    )
  );
  await assert.rejects(
    db.churchPosition.update({
      where: { id: b.id },
      data: { placement: "UNCONNECTED" }
    })
  );
  await f.cmd({
    operation: "unassign",
    positionId: a.id,
    id: assignment.id,
    confirmed: true
  });
  snapshot = await read();
  assert.equal(
    snapshot.positions.find((p) => p.id === a.id)!.assignments.length,
    0
  );
  assert.equal(snapshot.positions.find((p) => p.id === b.id)!.parentId, a.id);
  const refill = await f.save(a.id, []);
  assert.equal(refill.id, assignment.id);
  assert.equal((await read()).positions.length, 2);
});

test("assignment permissions: overlapping roles and direct grants survive independent removal", async () => {
  const f = await fixture();
  const a = await f.position(),
    b = await f.position();
  await f.grant("EDIT_CHURCH_CALENDAR", f.coordinator.id);
  const directBefore = await db.churchCapabilityGrant.findMany({
    where: { userId: f.coordinator.id }
  });
  const first = await f.save(a.id, [
    "EDIT_CHURCH_CALENDAR",
    "PUBLISH_CHURCH_POSTS"
  ]);
  await f.save(b.id, ["PUBLISH_CHURCH_POSTS"]);
  assert.equal(
    (await f.effective()).filter((g) => g.capability === "PUBLISH_CHURCH_POSTS")
      .length,
    2
  );
  await f.cmd({
    operation: "unassign",
    positionId: a.id,
    id: first.id,
    confirmed: true
  });
  assert.deepEqual((await f.effective()).map((g) => g.capability).sort(), [
    "EDIT_CHURCH_CALENDAR",
    "PUBLISH_CHURCH_POSTS"
  ]);
  assert.deepEqual(
    await db.churchCapabilityGrant.findMany({
      where: { userId: f.coordinator.id }
    }),
    directBefore
  );
  await f.cmd({ operation: "archive", positionId: b.id, confirmed: true });
  assert.deepEqual(
    (await f.effective()).map((g) => g.capability),
    ["EDIT_CHURCH_CALENDAR"]
  );
  const firstAgain = await f.save(a.id, []);
  assert.equal(firstAgain.id, first.id);
  assert.deepEqual(
    (await f.effective()).map((g) => g.capability),
    ["EDIT_CHURCH_CALENDAR"]
  );
});

test("assignment permissions: explicit role-only review works for a structure-only editor; presets cannot elevate", async () => {
  const f = await fixture(),
    p = await f.position();
  await f.grant("MANAGE_STRUCTURE", f.contact.id);
  await denied(
    f.cmd({
      operation: "assign",
      positionId: p.id,
      connectionId: f.connection.id
    }),
    400
  );
  await denied(
    f.save(p.id, [], { privilegesReviewed: false }, f.contact.token),
    400
  );
  await denied(f.save(p.id, [], { confirmed: false }, f.contact.token), 400);
  await denied(f.save(p.id, ["PUBLISH_CHURCH_POSTS"], {}, f.contact.token));
  await denied(f.save(p.id, [], { presetKey: "P" }, f.contact.token), 400);
  await denied(f.save(p.id, ["MANAGE_CHURCH_PROFILE"]), 400);
  await denied(f.save(p.id, ["MANAGE_STRUCTURE", "MANAGE_STRUCTURE"]), 400);
  await denied(
    f.cmd({
      operation: "assign",
      privilegesReviewed: true,
      confirmed: true,
      positionId: p.id,
      connectionId: f.connection.id,
      capabilities: ["MANAGE_STRUCTURE"]
    }),
    400
  );
  const saved = await f.save(p.id, [], {}, f.contact.token);
  assert.ok(saved.id);
  assert.equal(
    await db.churchRoleGrant.count({ where: { assignmentId: saved.id } }),
    0
  );
  const review = await getChurchStructure(db, f.contact.token, {
    churchId: f.churchId,
    view: "privileges",
    positionId: p.id,
    connectionId: f.connection.id
  });
  assert.deepEqual(review.privileges?.grantable, []);
  assert.equal(review.privileges?.assigned, true);
});

test("assignment permissions: identity, church, claim, ordinary-member and stale authority boundaries", async () => {
  const f = await fixture(),
    p = await f.position();
  const own = await db.churchConnection.findUniqueOrThrow({
    where: { userId_churchId: { userId: f.memberA.id, churchId: f.churchId } }
  });
  await denied(f.save(p.id, ["MANAGE_STRUCTURE"], { connectionId: own.id }));
  for (const token of [f.coordinator.token, f.memberB.token, f.pending.token])
    await denied(f.save(p.id, [], {}, token));
  await denied(f.save(p.id, [], {}, ""), 401);
  await denied(
    getChurchStructure(db, f.coordinator.token, {
      churchId: f.churchId,
      view: "privileges",
      positionId: p.id,
      connectionId: own.id
    })
  );
  const other = await db.churchConnection.findUniqueOrThrow({
    where: { userId_churchId: { userId: f.memberB.id, churchId: f.churchB.id } }
  });
  await denied(f.save(p.id, [], { connectionId: other.id }), 404);
  const oldVersion = await f.version();
  const grant = await db.churchCapabilityGrant.findUniqueOrThrow({
    where: {
      userId_churchId_capability: {
        userId: f.memberA.id,
        churchId: f.churchId,
        capability: "MANAGE_CHURCH_ACCESS"
      }
    }
  });
  await portalCommand(db, f.operator.token, {
    operation: "revoke-grant",
    churchId: f.churchId,
    id: grant.id,
    expectedVersion: grant.version
  });
  await denied(
    f.save(p.id, ["MANAGE_STRUCTURE"], { expectedVersion: oldVersion })
  );
  assert.equal(
    await db.churchPositionAssignment.count({ where: { positionId: p.id } }),
    0
  );
  assert.equal(
    await db.churchRoleGrant.count({ where: { churchId: f.churchId } }),
    0
  );
});

test("assignment permissions: replay is bound to actor, content and resulting version; concurrent updates are atomic", async () => {
  const f = await fixture(),
    p = await f.position();
  const input = {
    requestKey: randomUUID(),
    assignmentVersion: 0,
    expectedVersion: await f.version()
  };
  const results = await Promise.all([
    f.save(p.id, ["PUBLISH_CHURCH_POSTS"], input),
    f.save(p.id, ["PUBLISH_CHURCH_POSTS"], input)
  ]);
  assert.equal(results[0].id, results[1].id);
  assert.equal(
    await db.churchAssignmentSave.count({
      where: { requestKey: input.requestKey }
    }),
    1
  );
  assert.equal(
    await db.churchAuditEvent.count({
      where: {
        churchId: f.churchId,
        targetId: results[0].id,
        action: "SAVE_ASSIGNMENT_PRIVILEGES"
      }
    }),
    1
  );
  await denied(f.save(p.id, ["EDIT_CHURCH_CALENDAR"], input), 409);
  const next = { assignmentVersion: 1, expectedVersion: await f.version() };
  const competing = await Promise.allSettled([
    f.save(p.id, ["EDIT_CHURCH_CALENDAR"], next),
    f.save(p.id, ["PUBLISH_CHURCH_EVENTS"], next)
  ]);
  assert.equal(competing.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal((await f.effective()).length, 1);
  const rejected = competing.find(
    (r) => r.status === "rejected"
  ) as PromiseRejectedResult;
  assert.equal(rejected.reason.status, 409);
  await denied(f.save(p.id, ["PUBLISH_CHURCH_POSTS"], input), 409);
  const managerGrant = await db.churchCapabilityGrant.findUniqueOrThrow({
    where: {
      userId_churchId_capability: {
        userId: f.memberA.id,
        churchId: f.churchId,
        capability: "MANAGE_STRUCTURE"
      }
    }
  });
  await portalCommand(db, f.operator.token, {
    operation: "revoke-grant",
    churchId: f.churchId,
    id: managerGrant.id,
    expectedVersion: managerGrant.version
  });
  await denied(f.save(p.id, ["PUBLISH_CHURCH_POSTS"], input));
});

test("assignment permissions: effective readers enforce calendar, post, moderation, volunteering and member tools", async () => {
  const f = await fixture(),
    p = await f.position();
  const caps = [...delegableChurchCapabilities];
  const a = await f.save(p.id, caps);
  await portal(db, f.coordinator.token, async (tx, actor) => {
    for (const cap of caps)
      assert.equal(await hasChurchCapability(tx, actor, f.churchId, cap), true);
    assert.equal(
      await hasChurchCapability(tx, actor, f.churchId, "MANAGE_CHURCH_PROFILE"),
      false
    );
    assert.equal(
      await hasChurchCapability(tx, actor, f.churchB.id, "MANAGE_STRUCTURE"),
      false
    );
    const calendar = await calendarContext(tx, actor);
    assert.equal(
      calendarHas(calendar, f.churchId, "EDIT_CHURCH_CALENDAR"),
      true
    );
    assert.equal(
      calendarHas(calendar, f.churchId, "PUBLISH_CHURCH_EVENTS"),
      true
    );
    const post = await postContext(tx, actor.id);
    assert.equal(post.publishers.has(f.churchId), true);
    assert.equal(post.moderators.has(f.churchId), true);
    assert.equal(post.volunteers.has(f.churchId), true);
  });
  const calendarInput = {
    operation: "create-calendar",
    churchId: f.churchId,
    requestKey: randomUUID(),
    name: "Role supplied calendar",
    timeZone: "America/Chicago"
  };
  const postInput = {
    operation: "create",
    authorChurchId: f.churchId,
    requestKey: randomUUID(),
    content: "Fictional role supplied church update"
  };
  assert.ok((await calendarCommand(db, f.coordinator.token, calendarInput)).id);
  assert.ok((await postCommand(db, f.coordinator.token, postInput)).id);
  const portalView = await getPortalSnapshot(
    db,
    f.coordinator.token,
    "my-church"
  );
  assert.ok(portalView.reviewerChurches.some((c) => c.id === f.churchId));
  assert.ok(portalView.coordinatorChurches.some((c) => c.id === f.churchId));
  await f.cmd(
    { operation: "step-down", positionId: p.id, id: a.id, confirmed: true },
    f.coordinator.token
  );
  await denied(
    calendarCommand(db, f.coordinator.token, {
      ...calendarInput,
      requestKey: randomUUID()
    })
  );
  await denied(
    postCommand(db, f.coordinator.token, {
      ...postInput,
      requestKey: randomUUID()
    })
  );
  const post = await postContext(db, f.coordinator.id);
  assert.equal(post.publishers.has(f.churchId), false);
  await portal(db, f.coordinator.token, async (tx, actor) => {
    assert.equal(
      calendarHas(
        await calendarContext(tx, actor),
        f.churchId,
        "EDIT_CHURCH_CALENDAR"
      ),
      false
    );
  });
});

test("assignment permissions: reviewer availability includes eligible role sources and current removal", async () => {
  const f = await fixture(),
    p = await f.position();
  await f.save(p.id, ["REVIEW_CONNECTIONS"]);
  await db.churchCapabilityGrant.updateMany({
    where: { churchId: f.churchId, capability: "REVIEW_CONNECTIONS" },
    data: { revokedAt: new Date() }
  });
  assert.equal(
    (
      (await publicChurches(db, f.churchId))[0] as {
        connectionsAvailable?: boolean;
      }
    ).connectionsAvailable,
    true
  );
  const pending = await db.churchConnection.findUnique({
    where: {
      userId_churchId: { userId: f.relationshipOwner.id, churchId: f.churchId }
    }
  });
  await portalCommand(db, f.relationshipOwner.token, {
    operation: "request",
    churchId: f.churchId,
    expectedVersion: pending?.version ?? 0
  });
  await f.cmd({ operation: "archive", positionId: p.id, confirmed: true });
  assert.equal(
    (
      (await publicChurches(db, f.churchId))[0] as {
        connectionsAvailable?: boolean;
      }
    ).connectionsAvailable,
    false
  );
});

test("assignment permissions: membership removal and suspension permanently end role sources; graph edits never change them", async () => {
  const f = await fixture(),
    p = await f.position();
  const a = await f.save(p.id, ["PUBLISH_CHURCH_POSTS"]);
  const before = await db.churchRoleGrant.findMany({
    where: { assignmentId: a.id }
  });
  await f.cmd({
    operation: "edit",
    positionId: p.id,
    name: "Renamed pastor title",
    description: "New duties",
    parentId: null
  });
  assert.deepEqual(
    await db.churchRoleGrant.findMany({ where: { assignmentId: a.id } }),
    before
  );
  const conn = await db.churchConnection.findUniqueOrThrow({
    where: { id: f.connection.id }
  });
  await portalCommand(db, f.memberA.token, {
    operation: "transition",
    action: "REMOVE",
    churchId: f.churchId,
    connectionId: conn.id,
    expectedVersion: conn.version
  });
  assert.equal((await f.effective()).length, 0);
  assert.ok(
    (
      await db.churchRoleGrant.findUniqueOrThrow({
        where: { id: before[0].id }
      })
    ).revokedAt
  );
  // A later approved membership cannot revive the revoked appointment.
  await db.churchConnection.update({
    where: { id: conn.id },
    data: { state: "APPROVED" }
  });
  assert.equal((await f.effective()).length, 0);
  await f.save(p.id, ["PUBLISH_CHURCH_POSTS"]);
  const user = await db.platformUser.findUniqueOrThrow({
    where: { id: f.coordinator.id }
  });
  await portalCommand(db, f.operator.token, {
    operation: "suspend",
    userId: user.id,
    suspended: true,
    expectedVersion: user.portalVersion
  });
  assert.equal((await f.effective()).length, 0);
  assert.equal(
    await db.churchRoleGrant.count({
      where: { assignmentId: a.id, revokedAt: null }
    }),
    0
  );
});

test("assignment permissions: database binds contributions to church/connection and rejects profile-claim substitution", async () => {
  const f = await fixture(),
    p = await f.position();
  const a = await f.save(p.id, []);
  const data = {
    assignmentId: a.id,
    churchId: f.churchId,
    connectionId: f.connection.id,
    grantedById: f.memberA.id,
    capability: "MANAGE_STRUCTURE" as const
  };
  await assert.rejects(
    db.churchRoleGrant.create({ data: { ...data, churchId: f.churchB.id } }),
    (e: unknown) =>
      !!e && typeof e === "object" && "code" in e && e.code === "P2003"
  );
  await assert.rejects(
    db.churchRoleGrant.create({
      data: { ...data, capability: "MANAGE_CHURCH_PROFILE" }
    })
  );
  assert.equal(
    await db.churchRoleGrant.count({ where: { assignmentId: a.id } }),
    0
  );
});
