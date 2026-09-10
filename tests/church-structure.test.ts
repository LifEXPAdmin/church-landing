import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import {
  assertPortalTestDatabase,
  createPortalActor,
  requestConnection,
  seedPortal,
  type PortalActor
} from "./seed-portal";
import {
  churchStructureCommand,
  getChurchStructure
} from "../lib/platform/church-structure";
import {
  PortalError,
  portalCommand,
  publicChurches
} from "../lib/platform/portal";
import { loginAccount } from "../lib/platform/accounts";
import {
  deactivateAccount,
  AccountLifecycleError
} from "../lib/platform/account-lifecycle";
import { handleChurchStructureRequest } from "../lib/platform/church-structure-boundary";
import { safeAccountReturn } from "../lib/platform/account-entry";
const db = new PrismaClient();
before(() => assertPortalTestDatabase(db));
after(() => db.$disconnect());
const denied = (work: Promise<unknown>, status = 403) =>
  assert.rejects(
    work,
    (e: unknown) => e instanceof PortalError && e.status === status
  );
async function fixture() {
  const f = await seedPortal(db);
  const ada = f.memberA,
    lee = f.coordinator,
    val = f.contact,
    blake = f.memberB,
    pat = f.pending;
  const morgan = await createPortalActor(db, "morgan");
  const c = await requestConnection(db, morgan, f.churchA.id);
  await portalCommand(db, f.reviewerA.token, {
    operation: "transition",
    action: "APPROVE",
    churchId: f.churchA.id,
    connectionId: c.id,
    expectedVersion: c.version
  });
  const connection = (a: PortalActor) =>
    db.churchConnection.findUniqueOrThrow({
      where: { userId_churchId: { userId: a.id, churchId: f.churchA.id } }
    });
  for (const capability of [
    "MANAGE_CHURCH_ACCESS",
    "MANAGE_STRUCTURE",
    "REVIEW_CONNECTIONS"
  ])
    await portalCommand(db, f.operator.token, {
      operation: "grant",
      churchId: f.churchA.id,
      userId: ada.id,
      capability,
      expectedVersion: 0
    });
  for (const [actor, displayName, listed] of [
    [lee, "Lee Ministry", true],
    [val, "Val Outreach", true],
    [morgan, "Morgan Private Identity", false]
  ] as const) {
    const c = await connection(actor);
    await portalCommand(db, actor.token, {
      operation: "share",
      connectionId: c.id,
      expectedVersion: c.version,
      listed,
      displayName,
      contactEmail: `${actor.username}.contact@example.test`,
      phone: "+1 202 555 0187",
      emailAudience: "SAME_CHURCH",
      phoneAudience: "ONLY_ME"
    });
  }
  const read = (actor = ada, opts = {}) =>
    getChurchStructure(db, actor.token, { churchId: f.churchA.id, ...opts });
  const cmd = async (actor: PortalActor, input: Record<string, unknown>) =>
    churchStructureCommand(db, actor.token, {
      churchId: f.churchA.id,
      expectedVersion: (await read()).version,
      ...input
    });
  const create = async (name: string, parentId?: string) => {
    const row = await cmd(ada, {
      operation: "create",
      requestKey: randomUUID(),
      name,
      description: `Responsibilities for ${name}`
    });
    if (parentId)
      await cmd(ada, {
        operation: "place",
        positionId: row.id,
        placement: "REPORTING",
        parentId
      });
    return row;
  };
  return {
    ...f,
    ada,
    lee,
    val,
    morgan,
    blake,
    pat,
    connection,
    read,
    cmd,
    create
  };
}
async function team(f: Awaited<ReturnType<typeof fixture>>) {
  const leadership = await f.create("Leadership");
  const outreach = await f.create("Outreach", leadership.id);
  const coordinator = await f.create("Volunteer Coordinator", outreach.id);
  const worship = await f.create("Worship");
  for (const [position, actor] of [
    [outreach, f.lee],
    [coordinator, f.val],
    [leadership, f.morgan]
  ] as const)
    await f.cmd(f.ada, {
      operation: "assign",
      privilegesReviewed: true,
      confirmed: true,
      positionId: position.id,
      connectionId: (await f.connection(actor)).id
    });
  return { leadership, outreach, coordinator, worship };
}

test("structure: positions, reporting lines, multiple appointments and unlisted occupancy persist across sessions", async () => {
  const f = await fixture();
  const t = await team(f);
  await f.cmd(f.ada, {
    operation: "assign",
    privilegesReviewed: true,
    confirmed: true,
    positionId: t.leadership.id,
    connectionId: (await f.connection(f.val)).id
  });
  const first = await f.read();
  const token = await loginAccount(
    db,
    f.ada.email,
    f.ada.password,
    "second-structure-session"
  );
  assert.deepEqual(
    (await getChurchStructure(db, token, { churchId: f.churchA.id })).positions,
    first.positions
  );
  assert.equal(
    first.positions.find((p) => p.id === t.coordinator.id)!.parentId,
    t.outreach.id
  );
  assert.equal(
    first.positions.find((p) => p.id === t.worship.id)!.assignments.length,
    0
  );
  const assigned = first.positions.find(
    (p) => p.id === t.leadership.id
  )!.assignments;
  assert.equal(assigned.length, 2);
  assert.equal(assigned.filter((a) => !a.name).length, 1);
  assert.equal(JSON.stringify(first).includes(f.morgan.name), false);
  assert.equal(
    JSON.stringify(first).includes("Morgan Private Identity"),
    false
  );
  assert.equal(JSON.stringify(first).includes(f.morgan.id), false);
  assert.equal(
    JSON.stringify(first).includes((await f.connection(f.morgan)).id),
    false
  );
  assert.equal(
    (await f.read(f.val, { view: "responsibilities" })).positions.filter((p) =>
      p.assignments.some((a) => a.isSelf)
    ).length,
    2
  );
  assert.equal(
    (await f.read(f.val)).capabilities.includes("MANAGE_STRUCTURE"),
    false
  );
});

test("structure: contact projections enforce directory consent for members, managers, outsiders and pending applicants", async () => {
  const f = await fixture();
  await team(f);
  const valId = (await f.connection(f.val)).id;
  const card = await f.read(f.ada, { view: "person", connectionId: valId });
  assert.equal(card.person!.email, `${f.val.username}.contact@example.test`);
  assert.equal(card.person!.phone, undefined);
  const serialized = JSON.stringify(card);
  for (const secret of [
    f.val.email,
    "+1 202 555 0187",
    f.morgan.name,
    "Morgan Private Identity",
    f.morgan.email
  ])
    assert.equal(serialized.includes(secret), false);
  await denied(
    f.read(f.ada, {
      view: "person",
      connectionId: (await f.connection(f.morgan)).id
    }),
    404
  );
  for (const actor of [f.blake, f.pat]) {
    await denied(f.read(actor));
    await denied(f.read(actor, { view: "person", connectionId: valId }));
    await denied(f.read(actor, { view: "access" }));
  }
  const c = await f.connection(f.val);
  await portalCommand(db, f.val.token, {
    operation: "share",
    connectionId: c.id,
    expectedVersion: c.version,
    listed: false,
    displayName: "Hidden Val",
    contactEmail: "hidden@example.test",
    phone: "",
    emailAudience: "SAME_CHURCH",
    phoneAudience: "ONLY_ME"
  });
  await denied(f.read(f.ada, { view: "person", connectionId: valId }), 404);
  const tree = await f.read();
  assert.equal(JSON.stringify(tree).includes("Hidden Val"), false);
  assert.equal(
    tree.positions.find((p) => p.name === "Volunteer Coordinator")!.assignments
      .length,
    1
  );
  const publicData = JSON.stringify(await publicChurches(db, f.churchA.id));
  assert.equal(publicData.includes("Leadership"), false);
  assert.equal(publicData.includes(valId), false);
});

test("structure: explicit scoped delegation denies self-promotion, unrelated powers, cross-church writes and cycles atomically", async () => {
  const f = await fixture();
  const t = await team(f);
  await f.cmd(f.ada, {
    operation: "grant",
    connectionId: (await f.connection(f.lee)).id,
    capability: "MANAGE_STRUCTURE"
  });
  await f.cmd(f.lee, {
    operation: "edit",
    positionId: t.outreach.id,
    name: "Outreach ministry",
    description: "Allowed structure edit",
    parentId: t.leadership.id
  });
  for (const capability of [
    "MANAGE_CHURCH_ACCESS",
    "MANAGE_STRUCTURE",
    "EDIT_CALENDAR",
    "PUBLISH_CHURCH_POSTS"
  ])
    await denied(
      f.cmd(f.lee, {
        operation: "grant",
        connectionId: (await f.connection(f.lee)).id,
        capability
      })
    );
  await denied(
    f.cmd(f.ada, {
      operation: "grant",
      connectionId: (await f.connection(f.ada)).id,
      capability: "MANAGE_STRUCTURE"
    })
  );
  await denied(
    f.cmd(f.val, {
      operation: "create",
      name: "Pastor",
      requestKey: randomUUID(),
      role: "CHURCH",
      capability: "MANAGE_STRUCTURE"
    })
  );
  const blake = await db.churchConnection.findUniqueOrThrow({
    where: { userId_churchId: { userId: f.blake.id, churchId: f.churchB.id } }
  });
  const other = await db.churchPosition.create({
    data: {
      churchId: f.churchB.id,
      name: "Other church",
      requestKey: randomUUID()
    }
  });
  const version = (await f.read()).version;
  await denied(
    f.cmd(f.lee, {
      operation: "assign",
      privilegesReviewed: true,
      confirmed: true,
      positionId: t.outreach.id,
      connectionId: blake.id
    }),
    404
  );
  await denied(
    f.cmd(f.lee, {
      operation: "assign",
      privilegesReviewed: true,
      confirmed: true,
      positionId: t.outreach.id,
      connectionId: (await f.connection(f.pat)).id
    }),
    404
  );
  await denied(
    f.cmd(f.lee, {
      operation: "place",
      placement: "REPORTING",
      positionId: t.leadership.id,
      parentId: t.coordinator.id
    }),
    400
  );
  await denied(
    f.cmd(f.lee, {
      operation: "place",
      placement: "REPORTING",
      positionId: t.leadership.id,
      parentId: other.id
    }),
    400
  );
  await denied(
    f.cmd(f.lee, {
      operation: "edit",
      positionId: other.id,
      name: "Unauthorized"
    }),
    404
  );
  assert.equal((await f.read()).version, version);
  assert.equal(
    (await f.read()).positions.find((p) => p.id === t.leadership.id)!.parentId,
    null
  );
  await assert.rejects(
    db.churchPosition.update({
      where: { id: t.leadership.id },
      data: { parentId: t.coordinator.id, placement: "REPORTING" }
    })
  );
  await assert.rejects(
    db.churchPositionAssignment.create({
      data: {
        churchId: f.churchA.id,
        positionId: t.outreach.id,
        connectionId: blake.id
      }
    })
  );
  await assert.rejects(
    db.churchPosition.update({
      where: { id: t.leadership.id },
      data: { parentId: other.id, placement: "REPORTING" }
    })
  );
});

test("structure: stale edits and concurrent moves have one winner, create retries do not duplicate positions", async () => {
  const f = await fixture();
  const t = await team(f);
  const version = (await f.read()).version;
  const input = {
    churchId: f.churchA.id,
    operation: "place",
    placement: "REPORTING",
    expectedVersion: version,
    positionId: t.worship.id,
    parentId: t.leadership.id
  };
  const results = await Promise.allSettled([
    churchStructureCommand(db, f.ada.token, input),
    churchStructureCommand(db, f.ada.token, {
      ...input,
      parentId: t.outreach.id
    })
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  const failure = results.find(
    (r) => r.status === "rejected"
  ) as PromiseRejectedResult;
  assert.equal(failure.reason.status, 409);
  const key = randomUUID();
  const create = {
    churchId: f.churchA.id,
    operation: "create",
    expectedVersion: (await f.read()).version,
    name: "Welcome",
    requestKey: key
  };
  const one = await churchStructureCommand(db, f.ada.token, create);
  const two = await churchStructureCommand(db, f.ada.token, create);
  assert.equal(one.id, two.id);
  assert.equal(
    await db.churchPosition.count({
      where: { churchId: f.churchA.id, requestKey: key }
    }),
    1
  );
  const g = await f.cmd(f.ada, {
    operation: "grant",
    connectionId: (await f.connection(f.lee)).id,
    capability: "MANAGE_STRUCTURE"
  });
  await denied(
    f.cmd(f.ada, {
      operation: "grant",
      connectionId: (await f.connection(f.lee)).id,
      capability: "MANAGE_STRUCTURE"
    }),
    409
  );
  assert.equal(
    (await db.churchCapabilityGrant.findUniqueOrThrow({ where: { id: g.id } }))
      .sourceClaimId,
    null
  );
});

test("structure: permission revocation stops an already-open editor without removing ministry positions", async () => {
  const f = await fixture();
  const t = await team(f);
  const grant = await f.cmd(f.ada, {
    operation: "grant",
    connectionId: (await f.connection(f.lee)).id,
    capability: "MANAGE_STRUCTURE"
  });
  const leeOld = await f.read(f.lee);
  const record = await db.churchCapabilityGrant.findUniqueOrThrow({
    where: { id: grant.id }
  });
  await f.cmd(f.ada, {
    operation: "revoke",
    id: grant.id,
    grantVersion: record.version,
    confirmed: true
  });
  await denied(
    churchStructureCommand(db, f.lee.token, {
      operation: "edit",
      churchId: f.churchA.id,
      expectedVersion: leeOld.version,
      positionId: t.outreach.id,
      name: "Stale edit"
    })
  );
  const now = await f.read(f.lee);
  assert.equal(now.capabilities.includes("MANAGE_STRUCTURE"), false);
  assert.equal(
    now.positions
      .find((p) => p.id === t.outreach.id)!
      .assignments.some((a) => a.isSelf),
    true
  );
  await denied(f.read(f.lee, { view: "access" }));
  assert.equal(
    now.positions.find((p) => p.id === t.outreach.id)!.name,
    "Outreach"
  );
});

test("structure: connection removal and suspension end appointments; rejoining never restores sharing, grants or duties", async () => {
  const f = await fixture();
  const t = await team(f);
  await f.cmd(f.ada, {
    operation: "grant",
    connectionId: (await f.connection(f.val)).id,
    capability: "MANAGE_STRUCTURE"
  });
  const old = await f.connection(f.val);
  await portalCommand(db, f.ada.token, {
    operation: "transition",
    action: "REMOVE",
    churchId: f.churchA.id,
    connectionId: old.id,
    expectedVersion: old.version
  });
  await denied(f.read(f.val));
  assert.equal(
    await db.churchPositionAssignment.count({
      where: { connectionId: old.id, revokedAt: null }
    }),
    0
  );
  const pending = await requestConnection(db, f.val, f.churchA.id);
  await portalCommand(db, f.ada.token, {
    operation: "transition",
    action: "APPROVE",
    churchId: f.churchA.id,
    connectionId: pending.id,
    expectedVersion: pending.version
  });
  const after = await f.read(f.val);
  assert.equal(
    after.positions.find((p) => p.id === t.coordinator.id)!.assignments.length,
    0
  );
  assert.equal(after.capabilities.length, 0);
  assert.equal(
    await db.churchDirectoryPreference.findUnique({
      where: { connectionId: old.id }
    }),
    null
  );
  const m = await db.platformUser.findUniqueOrThrow({
    where: { id: f.morgan.id }
  });
  await portalCommand(db, f.operator.token, {
    operation: "suspend",
    userId: m.id,
    expectedVersion: m.portalVersion,
    suspended: true
  });
  assert.equal(
    await db.churchPositionAssignment.count({
      where: {
        connectionId: (await f.connection(f.morgan)).id,
        revokedAt: null
      }
    }),
    0
  );
});

test("structure: members can step down from their own duty; archive and depth limits preserve a coherent tree", async () => {
  const f = await fixture();
  const t = await team(f);
  await assert.rejects(
    deactivateAccount(db, f.val.token, f.val.password, true),
    (e: unknown) => e instanceof AccountLifecycleError && e.code === "handoff"
  );
  await assert.rejects(
    deactivateAccount(db, f.morgan.token, f.morgan.password, true),
    (e: unknown) => e instanceof AccountLifecycleError && e.code === "handoff"
  );
  const ownDuty = (await f.read(f.morgan)).positions
    .find((p) => p.id === t.leadership.id)!
    .assignments.find((a) => a.isSelf)!;
  await f.cmd(f.morgan, {
    operation: "step-down",
    positionId: t.leadership.id,
    id: ownDuty.id,
    confirmed: true
  });
  await deactivateAccount(db, f.morgan.token, f.morgan.password, true);
  assert.ok(
    (await db.platformUser.findUniqueOrThrow({ where: { id: f.morgan.id } }))
      .deactivatedAt
  );
  const assignment = (await f.read(f.val)).positions.find(
    (p) => p.id === t.coordinator.id
  )!.assignments[0];
  await denied(
    f.cmd(f.lee, {
      operation: "step-down",
      positionId: t.coordinator.id,
      id: assignment.id,
      confirmed: true
    })
  );
  await f.cmd(f.val, {
    operation: "step-down",
    positionId: t.coordinator.id,
    id: assignment.id,
    confirmed: true
  });
  assert.equal(
    (await f.read()).positions.find((p) => p.id === t.coordinator.id)!
      .assignments.length,
    0
  );
  await denied(
    f.cmd(f.ada, {
      operation: "archive",
      positionId: t.leadership.id,
      confirmed: true
    }),
    409
  );
  await f.cmd(f.ada, {
    operation: "archive",
    positionId: t.coordinator.id,
    confirmed: true
  });
  await f.cmd(f.ada, {
    operation: "archive",
    positionId: t.outreach.id,
    confirmed: true
  });
  assert.equal(
    await db.churchPositionAssignment.count({
      where: { positionId: t.outreach.id, revokedAt: null }
    }),
    0
  );
  let parent = t.leadership.id;
  for (let level = 2; level <= 12; level++)
    parent = (await f.create(`Depth ${level}`, parent)).id;
  const unconnected = await f.create("Too deep");
  const version = (await f.read()).version;
  await denied(
    f.cmd(f.ada, {
      operation: "place",
      positionId: unconnected.id,
      placement: "REPORTING",
      parentId: parent
    }),
    400
  );
  assert.equal((await f.read()).version, version);
  assert.equal(
    (await f.read()).positions.find((p) => p.id === unconnected.id)!.placement,
    "UNCONNECTED"
  );
  await denied(
    f.cmd(f.ada, {
      operation: "create",
      name: "x".repeat(101),
      requestKey: randomUUID()
    }),
    400
  );
});

test("structure: real boundary rejects anonymous/origin/body faults and keeps safe known return links", async () => {
  const f = await fixture();
  const t = await team(f);
  const origin = process.env.ACCOUNT_ORIGIN!;
  const request = (input: unknown, token = f.ada.token, sentOrigin = origin) =>
    handleChurchStructureRequest(
      db,
      new Request(origin + "/api/platform/church-structure", {
        method: "POST",
        headers: {
          Origin: sentOrigin,
          "Content-Type": "application/json",
          Cookie: "church_platform_session=" + token
        },
        body: JSON.stringify(input)
      })
    );
  const command = {
    operation: "edit",
    churchId: f.churchA.id,
    positionId: t.worship.id,
    name: "Worship",
    expectedVersion: (await f.read()).version
  };
  assert.equal((await request(command, "")).status, 401);
  assert.equal(
    (await request(command, f.ada.token, "https://invalid.example.test"))
      .status,
    403
  );
  assert.equal(
    (await request({ ...command, description: "x".repeat(3001) })).status,
    400
  );
  const response = await request(command);
  assert.equal(response.status, 200);
  assert.match(response.headers.get("Cache-Control")!, /private, no-store/);
  const snapshot = await handleChurchStructureRequest(
    db,
    new Request(
      origin + `/api/platform/church-structure?churchId=${f.churchA.id}`,
      { headers: { Cookie: "church_platform_session=" + f.ada.token } }
    )
  );
  assert.equal(snapshot.status, 200);
  assert.equal((await snapshot.text()).includes(f.morgan.name), false);
  for (const suffix of [
    "overview",
    "structure",
    "structure/new",
    "structure/fixture",
    "responsibilities",
    "access",
    "people/fixture"
  ])
    assert.equal(
      safeAccountReturn(`/platform/churches/fixture/${suffix}`),
      `/platform/churches/fixture/${suffix}`
    );
  assert.equal(
    safeAccountReturn(
      "/platform/churches/fixture/structure?mode=outline&secret=hidden"
    ),
    "/platform/churches/fixture/structure?mode=outline"
  );
  assert.equal(
    safeAccountReturn(
      "https://invalid.example.test/platform/churches/fixture/structure"
    ),
    "/platform"
  );
});

test("structure: listed-member search and pagination are complete without revealing unlisted matches", async () => {
  const f = await fixture();
  const p = await f.create("Directory pagination");
  const prefix = randomUUID().slice(0, 8);
  for (let i = 0; i < 105; i++) {
    const username = `page_${prefix}_${i}`;
    // Bounded synthetic roster for pagination, not a sign-in or delivery test.
    const u = await db.platformUser.create({
      data: {
        username,
        name: "Never disclose account identity " + i,
        email: `${username}@example.test`,
        emailVerifiedAt: new Date(),
        adultAcknowledgedAt: new Date(),
        adultPolicyVersion: "adult-preview-v1"
      }
    });
    const c = await db.churchConnection.create({
      data: { userId: u.id, churchId: f.churchA.id, state: "APPROVED" }
    });
    await db.churchDirectoryPreference.create({
      data: {
        connectionId: c.id,
        listed: true,
        displayName: "Listed pagination " + i
      }
    });
  }
  const first = await f.read(f.ada, {
    positionId: p.id,
    query: "Listed pagination"
  });
  assert.equal(first.candidates!.length, 100);
  assert.ok(first.candidatesCursor);
  const second = await f.read(f.ada, {
    positionId: p.id,
    query: "Listed pagination",
    candidateCursor: first.candidatesCursor
  });
  assert.equal(second.candidates!.length, 5);
  assert.equal(second.candidatesCursor, undefined);
  assert.equal(
    new Set([...first.candidates!, ...second.candidates!].map((c) => c.id))
      .size,
    105
  );
  assert.equal(
    (
      await f.read(f.ada, {
        positionId: p.id,
        query: "Morgan Private Identity"
      })
    ).candidates!.length,
    0
  );
  assert.equal(
    (
      await f.read(f.ada, {
        positionId: p.id,
        query: "Never disclose account identity"
      })
    ).candidates!.length,
    0
  );
  assert.equal(
    (await f.read(f.lee, { positionId: p.id })).candidates,
    undefined
  );
  const byAccess = await f.read(f.ada, {
    view: "access",
    query: "Listed pagination",
    candidateCursor: first.candidatesCursor
  });
  assert.equal(byAccess.candidates!.length, 5);
});
