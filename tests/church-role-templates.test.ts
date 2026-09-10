import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { assertPortalTestDatabase, seedPortal } from "./seed-portal";
import {
  churchStructureCommand,
  getChurchStructure
} from "../lib/platform/church-structure";
import { PortalError, portalCommand } from "../lib/platform/portal";
import { rolePresets, starterRoles } from "../lib/platform/church-role-library";
const db = new PrismaClient();
before(() => assertPortalTestDatabase(db));
after(() => db.$disconnect());
const denied = (work: Promise<unknown>, status = 403) =>
  assert.rejects(
    work,
    (error: unknown) => error instanceof PortalError && error.status === status
  );
async function fixture() {
  const f = await seedPortal(db);
  await portalCommand(db, f.operator.token, {
    operation: "grant",
    churchId: f.churchA.id,
    userId: f.memberA.id,
    capability: "MANAGE_STRUCTURE",
    expectedVersion: 0
  });
  const read = () =>
    getChurchStructure(db, f.memberA.token, {
      churchId: f.churchA.id,
      view: "roles"
    });
  const cmd = async (input: Record<string, unknown>, token = f.memberA.token) =>
    churchStructureCommand(db, token, {
      churchId: f.churchA.id,
      expectedVersion: (await read()).version,
      ...input
    });
  const create = (input: Record<string, unknown> = {}) =>
    cmd({
      operation: "template-create",
      requestKey: randomUUID(),
      name: "Drama Coordinator",
      ...input
    });
  return { ...f, read, cmd, create };
}
test("role library: 82 unique explicit title presets match the required starting mappings", () => {
  assert.equal(starterRoles.length, 82);
  assert.equal(new Set(starterRoles.map((r) => r.id)).size, 82);
  const groups: Record<string, string[]> = {
    A: ["Church Administrator", "Church Secretary"],
    P: [
      "Lead Pastor",
      "Senior Pastor",
      "Associate Pastor",
      "Assistant Pastor",
      "Executive Pastor"
    ],
    C: [
      "Ministry Director",
      "Worship Pastor",
      "Worship Leader",
      "Music Director",
      "Worship Coordinator",
      "Choir Director",
      "Outreach Director",
      "Evangelism Lead",
      "Missions Coordinator",
      "Drama Director",
      "Discipleship Director",
      "Bible Study Leader",
      "Small Group Leader",
      "Children's Ministry Director",
      "Nursery Coordinator",
      "Youth Pastor",
      "Youth Leader",
      "Young Adults Leader",
      "Family Ministry Leader"
    ],
    M: ["Media Director", "Social Media Manager", "Livestream Producer"],
    D: ["Content Editor", "Photographer", "Videographer"],
    E: [
      "Volunteer Coordinator",
      "Event Coordinator",
      "Food Service Coordinator",
      "Food Pantry Coordinator",
      "Transportation Coordinator",
      "Facilities Manager",
      "Setup Team Lead"
    ],
    W: ["Welcome Team Lead", "Membership Coordinator", "Follow-Up Coordinator"]
  };
  for (const role of starterRoles) {
    assert.ok(role.id && role.name && role.family && role.description);
    const entry = Object.entries(groups).find(([, names]) =>
      names.includes(role.name)
    );
    assert.equal(role.presetKey, entry?.[0] ?? "G");
    assert.ok(rolePresets[role.presetKey]);
  }
  for (const [key, names] of Object.entries(groups))
    assert.equal(
      starterRoles.filter((r) => r.presetKey === key).length,
      names.length
    );
  for (const preset of Object.values(rolePresets)) {
    assert.equal(
      preset.recommendations.includes("MANAGE_CHURCH_ACCESS"),
      false
    );
    assert.equal(
      preset.recommendations.includes("APPOINT_COORDINATORS"),
      false
    );
    assert.equal(
      preset.recommendations.includes("MANAGE_CHURCH_PROFILE"),
      false
    );
  }
});
test("role titles: custom defaults confer no access; revisions and multiple independent position instances persist", async () => {
  const f = await fixture();
  const grants = await db.churchCapabilityGrant.findMany({
    where: { churchId: f.churchA.id },
    orderBy: { id: "asc" }
  });
  const created = await f.create({ responsibilities: "Prepare rehearsals" });
  const role = (await f.read()).roleTemplates!.find(
    (r) => r.id === created.id
  )!;
  assert.equal(role.presetKey, "G");
  assert.deepEqual(role.recommendations, []);
  const first = await f.cmd({
    operation: "create",
    requestKey: randomUUID(),
    roleTemplateId: role.id,
    roleTemplateVersion: 1
  });
  const second = await f.cmd({
    operation: "create",
    requestKey: randomUUID(),
    roleTemplateId: role.id,
    roleTemplateVersion: 1
  });
  await f.cmd({
    operation: "place",
    positionId: second.id,
    placement: "REPORTING",
    parentId: first.id
  });
  const connection = await db.churchConnection.findUniqueOrThrow({
    where: {
      userId_churchId: { userId: f.coordinator.id, churchId: f.churchA.id }
    }
  });
  await f.cmd({
    operation: "assign",
    privilegesReviewed: true,
    confirmed: true,
    positionId: second.id,
    connectionId: connection.id
  });
  const before = await db.churchPosition.findMany({
    where: { churchId: f.churchA.id },
    include: { assignments: true },
    orderBy: { id: "asc" }
  });
  await f.cmd({
    operation: "template-edit",
    templateId: role.id,
    templateVersion: 1,
    name: "Drama Director Custom",
    responsibilities: "Plan the annual production",
    presetKey: "C",
    recommendations: ["EDIT_CHURCH_CALENDAR"]
  });
  const updated = (await f.read()).roleTemplates![0];
  assert.equal(updated.version, 2);
  assert.deepEqual(updated.recommendations, ["EDIT_CHURCH_CALENDAR"]);
  assert.deepEqual(
    await db.churchPosition.findMany({
      where: { churchId: f.churchA.id },
      include: { assignments: true },
      orderBy: { id: "asc" }
    }),
    before
  );
  assert.deepEqual(
    await db.churchCapabilityGrant.findMany({
      where: { churchId: f.churchA.id },
      orderBy: { id: "asc" }
    }),
    grants
  );
  const historical = await db.churchRoleRevision.findMany({
    where: { templateId: role.id },
    orderBy: { version: "asc" }
  });
  assert.equal(historical.length, 2);
  assert.equal(historical[0].name, "Drama Coordinator");
  assert.equal(before[0].roleTemplateVersion, 1);
  assert.notEqual(first.id, second.id);
  await denied(
    f.cmd({
      operation: "create",
      requestKey: randomUUID(),
      roleTemplateId: role.id,
      roleTemplateVersion: 1
    }),
    409
  );
});
test("role titles: normalized duplicates, archive and church isolation retain existing positions", async () => {
  const f = await fixture();
  const role = await f.create();
  await denied(f.create({ name: "  DRAMA   Coordinator  " }), 409);
  await denied(f.create({ name: "Ｄｒａｍａ Coordinator" }), 409);
  await portalCommand(db, f.operator.token, {
    operation: "grant",
    churchId: f.churchB.id,
    userId: f.memberB.id,
    capability: "MANAGE_STRUCTURE",
    expectedVersion: 0
  });
  const other = await churchStructureCommand(db, f.memberB.token, {
    churchId: f.churchB.id,
    operation: "template-create",
    expectedVersion: 0,
    name: "Drama Coordinator",
    requestKey: randomUUID()
  });
  assert.notEqual(role.id, other.id);
  await denied(
    f.cmd({
      operation: "template-edit",
      templateId: other.id,
      templateVersion: 1,
      name: "Stolen title"
    }),
    404
  );
  await denied(
    f.cmd({
      operation: "create",
      requestKey: randomUUID(),
      roleTemplateId: other.id,
      roleTemplateVersion: 1
    }),
    404
  );
  const p = await f.cmd({
    operation: "create",
    requestKey: randomUUID(),
    roleTemplateId: role.id,
    roleTemplateVersion: 1
  });
  await assert.rejects(
    db.churchPosition.update({
      where: { id: p.id },
      data: { roleTemplateId: other.id }
    }),
    (error: unknown) =>
      Boolean(
        error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "P2003"
      )
  );
  assert.equal(
    (await db.churchPosition.findUniqueOrThrow({ where: { id: p.id } }))
      .roleTemplateId,
    role.id
  );
  await denied(
    f.cmd({
      operation: "template-archive",
      templateId: role.id,
      templateVersion: 1
    }),
    400
  );
  await f.cmd({
    operation: "template-archive",
    templateId: role.id,
    templateVersion: 1,
    confirmed: true
  });
  assert.equal((await f.read()).roleTemplates!.length, 0);
  assert.equal(
    (await db.churchPosition.findUniqueOrThrow({ where: { id: p.id } }))
      .roleTemplateId,
    role.id
  );
  await denied(
    f.cmd({
      operation: "create",
      requestKey: randomUUID(),
      roleTemplateId: role.id,
      roleTemplateVersion: 1
    }),
    404
  );
  await f.create();
  assert.equal(
    await db.churchRoleTemplate.count({ where: { churchId: f.churchA.id } }),
    2
  );
  assert.equal(
    (
      await getChurchStructure(db, f.memberB.token, {
        churchId: f.churchB.id,
        view: "roles"
      })
    ).roleTemplates![0].id,
    other.id
  );
});
test("role titles: current membership and structure authority protect reads, writes and stale retries", async () => {
  const f = await fixture();
  const input = {
    operation: "template-create",
    requestKey: randomUUID(),
    name: "Private library canary"
  };
  for (const actor of [f.coordinator, f.pending, f.memberB]) {
    await denied(f.cmd(input, actor.token));
    await denied(
      getChurchStructure(db, actor.token, {
        churchId: f.churchA.id,
        view: "roles"
      })
    );
  }
  await denied(f.cmd(input, ""), 401);
  const ordinary = await getChurchStructure(db, f.coordinator.token, {
    churchId: f.churchA.id
  });
  assert.equal(ordinary.roleTemplates, undefined);
  await f.cmd(input);
  await db.churchCapabilityGrant.updateMany({
    where: {
      churchId: f.churchA.id,
      userId: f.memberA.id,
      capability: "MANAGE_STRUCTURE"
    },
    data: { revokedAt: new Date() }
  });
  await denied(
    churchStructureCommand(db, f.memberA.token, {
      churchId: f.churchA.id,
      ...input,
      expectedVersion: 0
    })
  );
  await denied(
    getChurchStructure(db, f.memberA.token, {
      churchId: f.churchA.id,
      view: "roles"
    })
  );
});
test("role titles: concurrent saves have one winner; lost create responses remain idempotent", async () => {
  const f = await fixture();
  const requestKey = randomUUID();
  const first = await f.create({ requestKey });
  const retry = await churchStructureCommand(db, f.memberA.token, {
    operation: "template-create",
    churchId: f.churchA.id,
    expectedVersion: 0,
    requestKey,
    name: "Changed retry"
  });
  assert.equal(retry.id, first.id);
  assert.equal(
    await db.churchRoleTemplate.count({ where: { churchId: f.churchA.id } }),
    1
  );
  const version = (await f.read()).version;
  const results = await Promise.allSettled(
    ["First edit", "Second edit"].map((name) =>
      churchStructureCommand(db, f.memberA.token, {
        operation: "template-edit",
        churchId: f.churchA.id,
        expectedVersion: version,
        templateId: first.id,
        templateVersion: 1,
        name
      })
    )
  );
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  const rejected = results.find(
    (r) => r.status === "rejected"
  ) as PromiseRejectedResult;
  assert.equal(rejected.reason.status, 409);
  assert.equal(
    await db.churchRoleRevision.count({ where: { templateId: first.id } }),
    2
  );
});
test("role titles: invalid recommendations, oversized fields and stale presets create no partial rows", async () => {
  const f = await fixture();
  for (const extra of [
    { presetKey: "PLATFORM_ADMIN" },
    { recommendations: ["MANAGE_CHURCH_PROFILE"] },
    { recommendations: ["EDIT_CHURCH_CALENDAR", "EDIT_CHURCH_CALENDAR"] },
    { recommendations: ["DRAFT_CHURCH_POSTS"] },
    { description: "x".repeat(501) },
    { responsibilities: "x".repeat(3001) },
    { name: "x".repeat(101) },
    { starterId: "fake-role" }
  ])
    await denied(f.create(extra), 400);
  await denied(f.create({ presetKey: "A", presetVersion: 999 }), 409);
  assert.equal(
    await db.churchRoleTemplate.count({ where: { churchId: f.churchA.id } }),
    0
  );
  const role = await f.create({ presetKey: "M", starterId: "media-director" });
  const snapshot = (await f.read()).roleTemplates![0];
  assert.equal(snapshot.id, role.id);
  assert.equal(snapshot.starterId, "media-director");
  assert.deepEqual(snapshot.recommendations, [
    "MODERATE_CHURCH_POSTS",
    "PUBLISH_CHURCH_POSTS"
  ]);
});
