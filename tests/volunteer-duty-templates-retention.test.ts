import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import {
  assertPortalTestDatabase,
  createPortalActor,
  type PortalActor
} from "./seed-portal";
import {
  journalRetentionControls,
  protectedRetentionControls,
  recordDiscoveryControl,
  replayRetentionControls,
  type RetentionControlEntry
} from "../lib/platform/retention-controls";

const db = new PrismaClient();
let actor: PortalActor;
before(async () => {
  await assertPortalTestDatabase(db);
  actor = await createPortalActor(db, "dutyrestore");
});
after(() => db.$disconnect());

function church() {
  return db.church.create({
    data: {
      slug: `fictional-duty-retention-${randomUUID()}`,
      name: "Fictional duty retention church",
      summary: "Isolated volunteer duty template retention fixture"
    }
  });
}

async function template(options: { version?: number; removedAt?: Date } = {}) {
  const owner = await church();
  const marker = randomUUID();
  return db.volunteerDutyTemplate.create({
    data: {
      churchId: owner.id,
      version: options.version ?? 1,
      title: `Fictional retained duty ${marker}`,
      duties: `Private duty text ${marker}`,
      requirements: `Private requirement text ${marker}`,
      commitment: `Private commitment text ${marker}`,
      removedAt: options.removedAt ?? null
    }
  });
}

async function control(sourceId: string, version: number) {
  await db.$transaction((tx) =>
    recordDiscoveryControl(
      tx,
      "VOLUNTEER_DUTY_TEMPLATE",
      actor.id,
      sourceId,
      version
    )
  );
  const row = await db.retentionControl.findFirstOrThrow({
    where: { kind: "VOLUNTEER_DUTY_TEMPLATE", sourceId, version }
  });
  return row.payload as unknown as RetentionControlEntry;
}

function journal() {
  const entries = new Map<string, RetentionControlEntry>();
  return protectedRetentionControls({
    async read(key) {
      return entries.get(key) ?? null;
    },
    async write(key, entry) {
      assert.equal(entries.has(key), false);
      entries.set(key, structuredClone(entry));
    },
    async remove(key) {
      entries.delete(key);
    },
    async page() {
      return { paths: [...entries.keys()] };
    }
  });
}

const current = (id: string) =>
  db.volunteerDutyTemplate.findUniqueOrThrow({ where: { id } });

function assertQuarantined(
  row: Awaited<ReturnType<typeof current>>,
  version: number
) {
  assert.equal(row.version, version);
  assert.equal(row.recoveryRequired, true);
  assert.equal(row.title, "");
  assert.equal(row.duties, "");
  assert.equal(row.requirements, "");
  assert.equal(row.commitment, "");
}

test("duty template controls publish a content-free journal through the actual retention pipeline", async () => {
  const saved = await template();
  const entry = await control(saved.id, saved.version + 1);
  assert.deepEqual(Object.keys(entry).sort(), [
    "endedAt",
    "id",
    "kind",
    "operatorId",
    "outcome",
    "policy",
    "recordedAt",
    "reviewDueAt",
    "sourceId",
    "startedAt",
    "target",
    "targetId",
    "version"
  ]);
  assert.equal(entry.kind, "VOLUNTEER_DUTY_TEMPLATE");
  assert.equal(entry.sourceId, saved.id);
  assert.equal(entry.target, "ACCOUNT");
  assert.equal(entry.targetId, actor.id);
  assert.equal(entry.operatorId, actor.id);
  assert.equal(entry.outcome, "QUARANTINED");
  const store = journal();
  const result = await journalRetentionControls(db, store, actor.id);
  assert.equal(result.failed, 0);
  assert.equal(result.pending, 0);
  assert.ok(result.recorded >= 1);
  const page = await store.page();
  assert.deepEqual(
    page.entries.find((item) => item.id === entry.id),
    entry
  );
  await store.record(entry);
  assert.equal(
    (await store.page()).entries.filter((item) => item.id === entry.id).length,
    1
  );
  await assert.rejects(
    store.record({
      ...entry,
      id: randomUUID(),
      duties: saved.duties
    } as unknown as RetentionControlEntry)
  );
  const persisted = await db.retentionControl.findUniqueOrThrow({
    where: { id: entry.id }
  });
  assert.ok(persisted.journaledAt);
  const serialized = JSON.stringify([persisted, page.entries]);
  for (const privateValue of [
    saved.title,
    saved.duties,
    saved.requirements,
    saved.commitment,
    saved.churchId!
  ]) {
    assert.ok(!serialized.includes(privateValue));
  }
  await replayRetentionControls(db, page.entries);
  assertQuarantined(await current(saved.id), entry.version);
});

test("stale and missing duty templates replay idempotently and out of order without reviving content or ownership", async () => {
  const active = await template();
  const removed = await template({
    version: 2,
    removedAt: new Date("2026-01-02T03:04:05.000Z")
  });
  const activeEntry = await control(active.id, 7);
  const removedEntry = await control(removed.id, 9);
  await replayRetentionControls(db, [activeEntry, removedEntry]);
  const activeAfter = await current(active.id);
  const removedAfter = await current(removed.id);
  assertQuarantined(activeAfter, 7);
  assertQuarantined(removedAfter, 9);
  for (const [before, after] of [
    [active, activeAfter],
    [removed, removedAfter]
  ]) {
    assert.equal(after.churchId, before.churchId);
    assert.deepEqual(after.removedAt, before.removedAt);
    assert.deepEqual(after.createdAt, before.createdAt);
  }
  const olderActive = await control(active.id, 6);
  const olderRemoved = await control(removed.id, 8);
  await replayRetentionControls(db, [
    removedEntry,
    olderActive,
    activeEntry,
    olderRemoved
  ]);
  assert.deepEqual(await current(active.id), activeAfter);
  assert.deepEqual(await current(removed.id), removedAfter);
  assert.equal(
    await db.retentionControl.count({
      where: {
        kind: "VOLUNTEER_DUTY_TEMPLATE",
        sourceId: active.id,
        version: 7
      }
    }),
    1
  );
  const ascendingId = randomUUID();
  const descendingId = randomUUID();
  const ascendingLow = await control(ascendingId, 4);
  const ascendingHigh = await control(ascendingId, 8);
  const descendingLow = await control(descendingId, 4);
  const descendingHigh = await control(descendingId, 8);
  assert.equal(
    await db.volunteerDutyTemplate.count({
      where: { id: { in: [ascendingId, descendingId] } }
    }),
    0
  );
  await replayRetentionControls(db, [
    ascendingLow,
    ascendingHigh,
    descendingHigh,
    descendingLow
  ]);
  const ascending = await current(ascendingId);
  const descending = await current(descendingId);
  for (const row of [ascending, descending]) {
    assertQuarantined(row, 8);
    assert.equal(row.churchId, null);
  }
  await replayRetentionControls(db, [
    descendingLow,
    ascendingHigh,
    ascendingLow,
    descendingHigh
  ]);
  assert.deepEqual(await current(ascendingId), ascending);
  assert.deepEqual(await current(descendingId), descending);
});

test("current duty templates remain untouched and deleted church ownership cannot be reconstructed", async () => {
  const equal = await template({ version: 5 });
  const newer = await template({ version: 6 });
  const equalEntry = await control(equal.id, 5);
  const olderEntry = await control(newer.id, 5);
  await replayRetentionControls(db, [equalEntry, olderEntry]);
  await replayRetentionControls(db, [olderEntry, equalEntry]);
  assert.deepEqual(await current(equal.id), equal);
  assert.deepEqual(await current(newer.id), newer);
  assert.equal(equal.recoveryRequired, false);
  assert.equal(newer.recoveryRequired, false);
  const saved = await template();
  const entry = await control(saved.id, 3);
  assert.ok(saved.churchId);
  await db.church.delete({ where: { id: saved.churchId } });
  assert.equal((await current(saved.id)).churchId, null);
  await replayRetentionControls(db, [entry]);
  const restored = await current(saved.id);
  assertQuarantined(restored, 3);
  assert.equal(restored.churchId, null);
  assert.deepEqual(restored.removedAt, saved.removedAt);
  await replayRetentionControls(db, [entry]);
  assert.deepEqual(await current(saved.id), restored);
  assert.equal(
    await db.church.findUnique({ where: { id: saved.churchId } }),
    null
  );
});
