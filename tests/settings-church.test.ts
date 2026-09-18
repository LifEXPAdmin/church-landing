import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient, type ChurchConnectionState } from "@prisma/client";
import { assertPortalTestDatabase, createPortalActor } from "./seed-portal";
import { readSettingsContext } from "../lib/platform/settings-context";
import { PortalError } from "../lib/platform/portal-policy";

const db = new PrismaClient({ log: [{ emit: "event", level: "query" }] });
let grantQueries = 0;
db.$on("query", (e) => {
  if (/FROM "public"\."Church(?:Capability|Role)Grant"/.test(e.query))
    grantQueries++;
});
before(() => assertPortalTestDatabase(db));
after(() => db.$disconnect());
async function connection(
  userId: string,
  state: ChurchConnectionState = "APPROVED"
) {
  const church = await db.church.create({
    data: { name: "Fictional settings church", slug: randomUUID(), summary: "" }
  });
  const member = await db.churchConnection.create({
    data: { userId, churchId: church.id, state }
  });
  return { church, member };
}
async function grant(
  userId: string,
  churchId: string,
  dependencyConnectionId?: string
) {
  return db.churchCapabilityGrant.create({
    data: {
      userId,
      churchId,
      capability: "MANAGE_STRUCTURE",
      dependencyConnectionId
    }
  });
}

test("church overview reads only the signed-in account, retaining all canonical lifecycle states without private contact fields", async () => {
  const a = await createPortalActor(db, "churchstates"),
    b = await createPortalActor(db, "churchforeign");
  const { church, member } = await connection(a.id, "PENDING");
  for (const state of [
    "PENDING",
    "APPROVED",
    "DECLINED",
    "WITHDRAWN",
    "LEFT",
    "REMOVED"
  ] as const) {
    await db.churchConnection.update({
      where: { id: member.id },
      data: { state }
    });
    const own = await readSettingsContext(db, a.token, a.id, true);
    assert.deepEqual(own.church?.connections, [
      { id: church.id, name: church.name, state }
    ]);
    assert.equal(own.churches.length, state === "APPROVED" ? 1 : 0);
    assert.deepEqual(own.church?.organizations, []);
    assert.doesNotMatch(
      JSON.stringify(own.church),
      /contactEmail|phone|password|grant|requestedAt/
    );
    assert.deepEqual(
      (await readSettingsContext(db, b.token, b.id, true)).church?.connections,
      []
    );
  }
  await assert.rejects(
    readSettingsContext(db, a.token, b.id, true),
    (e) => e instanceof PortalError && e.status === 401
  );
});

test("personal settings do not perform church grant reads; church scope batches permission reads for the current connection", async () => {
  const a = await createPortalActor(db, "churchcost");
  const { church } = await connection(a.id);
  await grant(a.id, church.id);
  grantQueries = 0;
  assert.equal((await readSettingsContext(db, a.token, a.id)).church, null);
  assert.equal(grantQueries, 0);
  grantQueries = 0;
  assert.deepEqual(
    (await readSettingsContext(db, a.token, a.id, true)).church?.organizations,
    [{ id: church.id, name: church.name }]
  );
  assert.equal(grantQueries, 2);
});

test("ordinary members and pending requests never become administrators; direct grant revocation takes effect on the next read", async () => {
  const a = await createPortalActor(db, "churchgrant");
  const { church, member } = await connection(a.id, "PENDING");
  const g = await grant(a.id, church.id, member.id);
  const read = async () =>
    (await readSettingsContext(db, a.token, a.id, true)).church!;
  assert.equal((await read()).organizations.length, 0);
  await db.churchConnection.update({
    where: { id: member.id },
    data: { state: "APPROVED" }
  });
  assert.equal((await read()).organizations.length, 1);
  await db.churchCapabilityGrant.update({
    where: { id: g.id },
    data: { revokedAt: new Date() }
  });
  assert.equal((await read()).organizations.length, 0);
  assert.equal((await read()).connections[0].state, "APPROVED");
});

test("titles alone confer no administration; effective assignment grants require a current connection and nonarchived position", async () => {
  const a = await createPortalActor(db, "churchroles");
  const { church, member } = await connection(a.id);
  const position = await db.churchPosition.create({
    data: {
      churchId: church.id,
      name: "Fictional pastor",
      requestKey: randomUUID()
    }
  });
  const assignment = await db.churchPositionAssignment.create({
    data: {
      churchId: church.id,
      connectionId: member.id,
      positionId: position.id
    }
  });
  const read = async () =>
    (await readSettingsContext(db, a.token, a.id, true)).church!;
  assert.equal((await read()).organizations.length, 0);
  await db.churchRoleGrant.create({
    data: {
      churchId: church.id,
      connectionId: member.id,
      assignmentId: assignment.id,
      capability: "MANAGE_STRUCTURE",
      grantedById: a.id
    }
  });
  assert.equal((await read()).organizations.length, 1);
  await db.churchPosition.update({
    where: { id: position.id },
    data: { archivedAt: new Date() }
  });
  assert.equal((await read()).organizations.length, 0);
  await db.churchPosition.update({
    where: { id: position.id },
    data: { archivedAt: null }
  });
  await db.churchPositionAssignment.update({
    where: { id: assignment.id },
    data: { revokedAt: new Date() }
  });
  assert.equal((await read()).organizations.length, 0);
});

test("ending a connection removes its organization and preserves the single-active-church contract when changing churches", async () => {
  const a = await createPortalActor(db, "churchswitch");
  const old = await connection(a.id);
  await grant(a.id, old.church.id);
  const next = await connection(a.id, "LEFT");
  await assert.rejects(
    db.churchConnection.update({
      where: { id: next.member.id },
      data: { state: "APPROVED" }
    })
  );
  await db.churchConnection.update({
    where: { id: old.member.id },
    data: { state: "REMOVED" }
  });
  await db.churchConnection.update({
    where: { id: next.member.id },
    data: { state: "APPROVED" }
  });
  await grant(a.id, next.church.id);
  const value = (await readSettingsContext(db, a.token, a.id, true)).church!;
  assert.deepEqual(value.organizations, [
    { id: next.church.id, name: next.church.name }
  ]);
  assert.ok(
    value.connections.some(
      (c) => c.id === old.church.id && c.state === "REMOVED"
    )
  );
});

test("ineligible accounts keep personal settings while church details and privileged projections fail closed", async () => {
  const a = await createPortalActor(db, "churchdenied");
  const { church } = await connection(a.id);
  await grant(a.id, church.id);
  const before = process.env.PRIVILEGED_MFA_MODE;
  try {
    process.env.PRIVILEGED_MFA_MODE = "enforce";
    const challenged = await readSettingsContext(db, a.token, a.id, true);
    assert.equal(challenged.church?.connections.length, 1);
    assert.deepEqual(challenged.church?.organizations, []);
  } finally {
    if (before === undefined) delete process.env.PRIVILEGED_MFA_MODE;
    else process.env.PRIVILEGED_MFA_MODE = before;
  }
  await db.platformUser.update({
    where: { id: a.id },
    data: { emailVerifiedAt: null }
  });
  const personal = await readSettingsContext(db, a.token, a.id, true);
  assert.equal(personal.ownerId, a.id);
  assert.deepEqual(personal.church, {
    eligible: false,
    connections: [],
    organizations: []
  });
});

test("oversized church history fails closed with useful personal-settings recovery", async () => {
  const a = await createPortalActor(db, "churchbound");
  const rows = Array.from({ length: 201 }, () => ({
    id: randomUUID(),
    slug: randomUUID(),
    name: "Fictional former church",
    summary: ""
  }));
  await db.church.createMany({ data: rows });
  await db.churchConnection.createMany({
    data: rows.map((c) => ({
      userId: a.id,
      churchId: c.id,
      state: "LEFT" as const
    }))
  });
  const value = await readSettingsContext(db, a.token, a.id, true);
  assert.match(value.churchError!, /size review/);
  assert.equal(value.ownerId, a.id);
  assert.deepEqual(value.church?.connections, []);
  assert.deepEqual(value.church?.organizations, []);
});
