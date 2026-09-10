import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { seedPortal, assertPortalTestDatabase } from "./seed-portal";
import {
  churchStructureCommand,
  getChurchStructure
} from "../lib/platform/church-structure";
import { handleChurchStructureRequest } from "../lib/platform/church-structure-boundary";
import { PortalError, portalCommand } from "../lib/platform/portal";
import type { ChartChange } from "../lib/platform/church-chart-model";

const db = new PrismaClient();
before(() => assertPortalTestDatabase(db));
after(() => db.$disconnect());
const denied = (promise: Promise<unknown>, status: number) =>
  assert.rejects(
    promise,
    (error: unknown) => error instanceof PortalError && error.status === status
  );
async function fixture() {
  const f = await seedPortal(db);
  for (const actor of [f.memberA, f.coordinator])
    await portalCommand(db, f.operator.token, {
      operation: "grant",
      churchId: f.churchA.id,
      userId: actor.id,
      capability: "MANAGE_STRUCTURE",
      expectedVersion: 0
    });
  const read = () =>
    getChurchStructure(db, f.memberA.token, { churchId: f.churchA.id });
  const cmd = async (input: Record<string, unknown>, token = f.memberA.token) =>
    churchStructureCommand(db, token, {
      churchId: f.churchA.id,
      expectedVersion: (await read()).version,
      ...input
    });
  const create = (name: string) =>
    cmd({ operation: "create", requestKey: randomUUID(), name });
  const save = (changes: unknown, extra = {}, token = f.memberA.token) =>
    cmd(
      {
        operation: "chart-save",
        changes,
        requestKey: randomUUID(),
        confirmed: true,
        ...extra
      },
      token
    );
  return { ...f, read, cmd, create, save };
}
const change = (id: string, parentId: string | null = null): ChartChange => ({
  id,
  parentId,
  placement: parentId ? "REPORTING" : "ROOT",
  layout: null
});

test("chart transaction saves reporting/layout together and preserves every assignment and grant source", async () => {
  const f = await fixture();
  const a = await f.create("Leadership"),
    b = await f.create("Outreach"),
    c = await f.create("Volunteer");
  await f.cmd({
    operation: "place",
    positionId: c.id,
    placement: "REPORTING",
    parentId: b.id
  });
  const connection = await db.churchConnection.findUniqueOrThrow({
    where: {
      userId_churchId: { userId: f.coordinator.id, churchId: f.churchA.id }
    }
  });
  await f.cmd({
    operation: "assignment-privileges",
    positionId: b.id,
    connectionId: connection.id,
    requestKey: randomUUID(),
    privilegesReviewed: true,
    confirmed: true,
    capabilities: [],
    assignmentVersion: 0
  });
  const sources = async () => ({
    assignments: await db.churchPositionAssignment.findMany({
      where: { churchId: f.churchA.id },
      orderBy: { id: "asc" }
    }),
    roles: await db.churchRoleGrant.findMany({
      where: { churchId: f.churchA.id },
      orderBy: { id: "asc" }
    }),
    grants: await db.churchCapabilityGrant.findMany({
      where: { churchId: f.churchA.id },
      orderBy: { id: "asc" }
    })
  });
  const before = await sources(),
    version = (await f.read()).version;
  const result = await f.save([
    change(a.id),
    { ...change(b.id, a.id), layout: { x: 400, y: 600 } }
  ]);
  assert.equal(result.version, version + 1);
  const second = new PrismaClient();
  try {
    const saved = await getChurchStructure(second, f.coordinator.token, {
      churchId: f.churchA.id
    });
    assert.equal(saved.positions.find((p) => p.id === b.id)?.parentId, a.id);
    assert.equal(saved.positions.find((p) => p.id === c.id)?.parentId, b.id);
    assert.deepEqual(saved.positions.find((p) => p.id === b.id)?.layout, {
      x: 400,
      y: 600
    });
  } finally {
    await second.$disconnect();
  }
  assert.deepEqual(await sources(), before);
  const history = await db.churchChartSave.findFirstOrThrow({
    where: { churchId: f.churchA.id }
  });
  assert.equal(history.actorId, f.memberA.id);
  assert.equal(history.resultVersion, result.version);
  assert.equal((history.changes as unknown[]).length, 2);
  for (const secret of [f.coordinator.email, connection.id, f.coordinator.name])
    assert.equal(JSON.stringify(history.changes).includes(secret), false);
});

test("chart rejects forged fields, missing targets and invalid final graphs with no partial writes", async () => {
  const f = await fixture();
  const a = await f.create("A"),
    b = await f.create("B");
  const other = await db.churchPosition.create({
    data: {
      churchId: f.churchB.id,
      name: "Other church",
      requestKey: randomUUID()
    }
  });
  const before = await f.read();
  for (const changes of [
    [change(a.id), change(b.id, "missing")],
    [change(a.id), change(b.id, other.id)],
    [change(other.id)],
    [change(a.id, a.id)],
    [change(a.id, b.id), change(b.id, a.id)],
    [change(a.id), change(a.id)],
    [{ ...change(a.id), capabilities: ["MANAGE_STRUCTURE"] }],
    [{ ...change(a.id), layout: { x: 1, y: 20 } }]
  ])
    await denied(f.save(changes), 400);
  await denied(
    f.save([change(a.id)], { capabilities: ["MANAGE_STRUCTURE"] }),
    400
  );
  await denied(f.save([change(a.id)], { confirmed: false }), 400);
  assert.deepEqual(await f.read(), before);
  assert.equal(
    await db.churchChartSave.count({ where: { churchId: f.churchA.id } }),
    0
  );
});

test("opposing chart saves have one winner; retrying a stale editor cannot form a cycle", async () => {
  const f = await fixture();
  const a = await f.create("A"),
    b = await f.create("B");
  await f.save([change(a.id), change(b.id)]);
  const expectedVersion = (await f.read()).version;
  const results = await Promise.allSettled([
    f.save([change(a.id, b.id)], { expectedVersion }),
    f.save([change(b.id, a.id)], { expectedVersion }, f.coordinator.token)
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(
    results.filter(
      (r) =>
        r.status === "rejected" &&
        r.reason instanceof PortalError &&
        r.reason.status === 409
    ).length,
    1
  );
  const current = await f.read();
  const savedA = current.positions.find((p) => p.id === a.id)!,
    savedB = current.positions.find((p) => p.id === b.id)!;
  assert.equal(Boolean(savedA.parentId && savedB.parentId), false);
  const rejectedMove = savedA.parentId
    ? change(b.id, a.id)
    : change(a.id, b.id);
  await denied(f.save([rejectedMove]), 400);
  assert.deepEqual(await f.read(), current);
});

test("multi-edge inversion commits a valid final graph with the database cycle guard enabled", async () => {
  const f = await fixture();
  const a = await f.create("A"),
    b = await f.create("B");
  await f.save([change(a.id), change(b.id, a.id)]);
  await f.save([change(a.id, b.id), change(b.id)]);
  const current = await f.read();
  assert.equal(current.positions.find((p) => p.id === a.id)?.parentId, b.id);
  assert.equal(current.positions.find((p) => p.id === b.id)?.placement, "ROOT");
  await assert.rejects(
    db.churchPosition.update({
      where: { id: b.id },
      data: { parentId: a.id, placement: "REPORTING" }
    })
  );
  assert.deepEqual(await f.read(), current);
});

test("lost-response retry uses one exact receipt and rechecks current manager authority", async () => {
  const f = await fixture();
  const a = await f.create("A");
  const input = {
    operation: "chart-save",
    churchId: f.churchA.id,
    requestKey: randomUUID(),
    expectedVersion: (await f.read()).version,
    changes: [change(a.id)],
    confirmed: true
  };
  const result = await churchStructureCommand(db, f.memberA.token, input);
  assert.deepEqual(
    await churchStructureCommand(db, f.memberA.token, input),
    result
  );
  assert.equal(
    await db.churchChartSave.count({ where: { churchId: f.churchA.id } }),
    1
  );
  assert.equal(
    await db.churchAuditEvent.count({
      where: { churchId: f.churchA.id, action: "SAVE_CHURCH_CHART" }
    }),
    1
  );
  await denied(
    churchStructureCommand(db, f.memberA.token, {
      ...input,
      changes: [{ ...change(a.id), layout: { x: 20, y: 40 } }]
    }),
    409
  );
  await denied(churchStructureCommand(db, f.coordinator.token, input), 409);
  const grant = await db.churchCapabilityGrant.findUniqueOrThrow({
    where: {
      userId_churchId_capability: {
        userId: f.memberA.id,
        churchId: f.churchA.id,
        capability: "MANAGE_STRUCTURE"
      }
    }
  });
  await portalCommand(db, f.operator.token, {
    operation: "revoke-grant",
    churchId: f.churchA.id,
    id: grant.id,
    expectedVersion: grant.version
  });
  await denied(churchStructureCommand(db, f.memberA.token, input), 403);
  await f.save(
    [{ ...change(a.id), layout: { x: 60, y: 80 } }],
    {},
    f.coordinator.token
  );
  await denied(
    churchStructureCommand(db, f.coordinator.token, {
      ...input,
      requestKey: randomUUID()
    }),
    409
  );
});

test("200-change HTTP payload is bounded and honors session, origin and church scope", async () => {
  const f = await fixture();
  const ids = Array.from({ length: 200 }, () => randomUUID());
  await db.churchPosition.createMany({
    data: ids.map((id) => ({
      id,
      churchId: f.churchA.id,
      name: "Fictional chart capacity",
      requestKey: id
    }))
  });
  const input = {
    operation: "chart-save",
    churchId: f.churchA.id,
    requestKey: randomUUID(),
    expectedVersion: (await f.read()).version,
    confirmed: true,
    changes: ids.map((id, index) => ({
      ...change(id),
      layout: { x: index * 320, y: 20 }
    }))
  };
  const body = JSON.stringify(input);
  assert.ok(Buffer.byteLength(body) > 8192 && Buffer.byteLength(body) < 96_000);
  const origin = process.env.ACCOUNT_ORIGIN!;
  const request = (token: string, value = body, sender = origin) =>
    handleChurchStructureRequest(
      db,
      new Request(origin + "/api/platform/church-structure", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: sender,
          cookie: "church_platform_session=" + token
        },
        body: value
      })
    );
  assert.equal((await request("")).status, 401);
  assert.equal(
    (await request(f.memberA.token, body, "https://other.example")).status,
    403
  );
  assert.equal((await request(f.memberB.token)).status, 403);
  assert.equal((await request(f.pending.token)).status, 403);
  assert.equal(
    (
      await request(
        f.memberA.token,
        JSON.stringify({ ...input, padding: "x".repeat(96_000) })
      )
    ).status,
    400
  );
  const response = await request(f.memberA.token);
  assert.equal(response.status, 200, await response.clone().text());
  assert.match(response.headers.get("cache-control")!, /private, no-store/);
  assert.equal(
    (await f.read()).positions.filter((p) => p.layout !== null).length,
    200
  );
});

test("database rejects half coordinates and out-of-grid layouts without changing saved placement", async () => {
  const f = await fixture();
  const a = await f.create("A");
  for (const data of [
    { chartX: 20, chartY: null },
    { chartX: 1, chartY: 20 },
    { chartX: -20, chartY: 0 },
    { chartX: 0, chartY: 100020 }
  ])
    await assert.rejects(
      db.churchPosition.update({ where: { id: a.id }, data })
    );
  assert.equal((await f.read()).positions[0].layout, null);
  assert.equal((await f.read()).positions[0].placement, "UNCONNECTED");
});
