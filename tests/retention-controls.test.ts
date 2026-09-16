import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import {
  assertPortalTestDatabase,
  createPortalActor,
  seedOperatorGrants
} from "./seed-portal";
import { communityReportCommand as reportCommand } from "../lib/platform/community-reports";
import { adultMessageCommand } from "../lib/platform/adult-messages";
import {
  journalRetentionControls,
  protectedRetentionControls,
  replayRetentionControls,
  inspectRestoredHolds,
  type RetentionControlEntry
} from "../lib/platform/retention-controls";
import {
  inspectMessagingRetention,
  runMessagingRetention,
  DAY
} from "../lib/platform/messaging-retention";
const db = new PrismaClient();
const old = process.env.COMMUNITY_REPORTS_ENABLED;
let reviewer: Awaited<ReturnType<typeof createPortalActor>>;
before(async () => {
  await assertPortalTestDatabase(db);
  reviewer = await createPortalActor(db, "controlreview");
  await seedOperatorGrants(db, reviewer, ["REVIEW_COMMUNITY_REPORTS"]);
  process.env.COMMUNITY_REPORTS_ENABLED = "true";
});
after(async () => {
  if (old === undefined) delete process.env.COMMUNITY_REPORTS_ENABLED;
  else process.env.COMMUNITY_REPORTS_ENABLED = old;
  await db.$disconnect();
});
const command = (operation: string, fields: Record<string, unknown> = {}) => ({
  operation,
  mutationId: randomUUID(),
  ...fields
});
async function selectedReport() {
  const a = await createPortalActor(db, "controlsender"),
    b = await createPortalActor(db, "controlmember");
  const [participantAId, participantBId] = [a.id, b.id].sort();
  const conversation = await db.adultConversation.create({
    data: { participantAId, participantBId, sendingAllowed: true }
  });
  const message = await adultMessageCommand(
    db,
    a.token,
    command("send", {
      conversationId: conversation.id,
      expectedVersion: 1,
      content: "Private fixture message must never enter the recovery journal."
    })
  );
  const body = command("create", {
    targetType: "MESSAGE",
    targetId: message.id,
    expectedTargetVersion: 1,
    expectedContextVersion: 0,
    reason: "PRIVACY",
    details: "Private case text stays out of minimal restoration records."
  });
  return { report: await reportCommand(db, b.token, body), body, b, message };
}
async function entries(id: string) {
  return (
    await db.retentionControl.findMany({
      where: { targetId: id },
      orderBy: { createdAt: "asc" }
    })
  ).map((r) => r.payload as RetentionControlEntry);
}
function memory() {
  const values = new Map<string, unknown>();
  return {
    values,
    store: {
      async read(key: string) {
        return values.get(key) ?? null;
      },
      async write(key: string, value: RetentionControlEntry) {
        if (values.has(key)) throw Error("Immutable");
        values.set(key, structuredClone(value));
      },
      async remove(key: string) {
        values.delete(key);
      },
      async page() {
        return { paths: [...values.keys()] };
      }
    }
  };
}
test("report and hold controls are immutable, content-free, and exact retries do not create another control", async () => {
  const { report, b, body } = await selectedReport();
  assert.deepEqual(await reportCommand(db, b.token, body), report);
  await reportCommand(
    db,
    reviewer.token,
    command("preserve", {
      id: report.id,
      expectedVersion: report.version,
      decisionReason:
        "A private preservation reason never belongs in the opaque journal."
    })
  );
  const rows = await entries(report.id);
  assert.equal(rows.length, 3);
  assert.equal(rows.filter((r) => r.kind === "HOLD").length, 1);
  assert.doesNotMatch(
    JSON.stringify(rows),
    /Private fixture|Private case|private preservation|@|password|endpoint/
  );
  const fixture = memory(),
    journal = protectedRetentionControls(fixture.store);
  await Promise.all([journal.record(rows[0]), journal.record(rows[0])]);
  assert.equal(fixture.values.size, 1);
  await assert.rejects(journal.record({ ...rows[0], version: 999 }), /changed/);
  await assert.rejects(
    journal.record({ ...rows[0], content: "private" } as RetentionControlEntry),
    /Invalid/
  );
  await assert.rejects(
    db.retentionControl.update({
      where: { id: rows[0].id },
      data: { payload: {} }
    }),
    /immutable/
  );
});
test("failed protection retains a recoverable decision and prevents a report purge until the current control is protected", async () => {
  const { report } = await selectedReport();
  await reportCommand(
    db,
    reviewer.token,
    command("resolve", {
      id: report.id,
      expectedVersion: report.version,
      resolution: "CLOSED",
      decisionReason: "Fixture case is fully resolved."
    })
  );
  const row = await db.communityReport.findUniqueOrThrow({
    where: { id: report.id }
  });
  const now = new Date(row.closedAt!.getTime() + 181 * DAY),
    failing = {
      async record() {
        throw Error("Fixture provider unavailable");
      }
    };
  const result = await journalRetentionControls(db, failing, report.id);
  assert.equal(result.pending, 2);
  assert.equal(result.failed, 2);
  const candidates = (
    await inspectMessagingRetention(db, now)
  ).candidates.filter((r) => r.id === report.id);
  await assert.rejects(
    runMessagingRetention(
      db,
      candidates,
      { async record() {}, async complete() {} },
      now,
      failing
    ),
    /controls must finish/
  );
  assert.ok(await db.communityReport.findUnique({ where: { id: report.id } }));
  const fixture = memory(),
    journal = protectedRetentionControls(fixture.store);
  assert.equal(
    (await journalRetentionControls(db, journal, report.id)).pending,
    0
  );
  assert.equal(
    (await journalRetentionControls(db, journal, report.id)).recorded,
    0
  );
  assert.deepEqual(
    await runMessagingRetention(
      db,
      candidates,
      { async record() {}, async complete() {} },
      now,
      journal
    ),
    { reports: 1, messages: 0, inquiries: 0 }
  );
});
test("newer hold release and case clocks replay in any page order without reviving a hold or restarting final closure", async () => {
  const { report } = await selectedReport();
  let current = await reportCommand(
    db,
    reviewer.token,
    command("resolve", {
      id: report.id,
      expectedVersion: report.version,
      resolution: "CLOSED",
      decisionReason: "Fixture review complete."
    })
  );
  const original = await db.communityReport.findUniqueOrThrow({
    where: { id: report.id }
  });
  current = await reportCommand(
    db,
    reviewer.token,
    command("preserve", {
      id: report.id,
      expectedVersion: current.version,
      decisionReason: "Fixture narrowly scoped preservation."
    })
  );
  const held = await db.retentionHold.findFirstOrThrow({
    where: { targetId: report.id }
  });
  await reportCommand(
    db,
    reviewer.token,
    command("release-hold", {
      id: report.id,
      holdId: held.id,
      expectedVersion: current.version,
      decisionReason: "The specific preservation requirement ended."
    })
  );
  const controls = await entries(report.id),
    release = controls.find((r) => r.outcome === "RELEASE")!;
  await db.retentionHold.update({
    where: { id: held.id },
    data: { version: held.version, releasedAt: null }
  });
  await db.communityReport.update({
    where: { id: report.id },
    data: { version: 1, status: "RECEIVED", closedAt: null }
  });
  for (const entry of [...controls].reverse())
    assert.deepEqual(await replayRetentionControls(db, [entry]), {
      missingReports: []
    });
  const restored = await db.retentionHold.findUniqueOrThrow({
    where: { id: held.id }
  });
  assert.equal(restored.releasedAt?.toISOString(), release.endedAt);
  assert.equal(restored.version, release.version);
  assert.equal(
    (
      await db.communityReport.findUniqueOrThrow({ where: { id: report.id } })
    ).closedAt?.toISOString(),
    original.closedAt?.toISOString()
  );
});
test("a new preserved scope missing from an older snapshot is restored conservatively and requires reason review", async () => {
  const { report } = await selectedReport();
  await reportCommand(
    db,
    reviewer.token,
    command("preserve", {
      id: report.id,
      expectedVersion: report.version,
      decisionReason:
        "Specific new evidence preservation after this recovery snapshot."
    })
  );
  const held = (await entries(report.id)).find((r) => r.kind === "HOLD")!;
  await db.retentionHold.delete({ where: { id: held.sourceId } });
  const baseline = await inspectRestoredHolds(db);
  await replayRetentionControls(db, [held]);
  assert.equal(await inspectRestoredHolds(db), baseline + 1);
  const restored = await db.retentionHold.findUniqueOrThrow({
    where: { id: held.sourceId }
  });
  assert.equal(restored.targetId, report.id);
  assert.equal(restored.releasedAt, null);
  assert.match(
    restored.reason,
    /original case reason requires authorized review/
  );
  assert.equal(restored.createdAt.toISOString(), held.startedAt);
});
test("missing reports are explicit recovery discrepancies, while sealed deletions cannot be resurrected by older controls", async () => {
  const { report } = await selectedReport(),
    [entry] = await entries(report.id);
  await db.socialEvent.deleteMany({ where: { reportId: report.id } });
  await db.communityReport.delete({ where: { id: report.id } });
  assert.deepEqual(await replayRetentionControls(db, [entry]), {
    missingReports: [report.id]
  });
  await db.retentionPurge.create({
    data: {
      target: "REPORT",
      targetId: report.id,
      version: report.version,
      policy: entry.policy,
      completedAt: new Date()
    }
  });
  assert.deepEqual(await replayRetentionControls(db, [entry]), {
    missingReports: []
  });
  assert.equal(
    await db.communityReport.findUnique({ where: { id: report.id } }),
    null
  );
});
test("protected controls expire only 90 days after actual corresponding purge completion", async () => {
  const { report } = await selectedReport(),
    [entry] = await entries(report.id);
  const fixture = memory(),
    journal = protectedRetentionControls(fixture.store),
    completed = new Date();
  await journal.record(entry);
  assert.equal(
    await journal.expire(
      entry,
      completed,
      new Date(completed.getTime() + 90 * DAY - 1)
    ),
    false
  );
  assert.equal(fixture.values.size, 1);
  assert.equal(
    await journal.expire(
      entry,
      completed,
      new Date(completed.getTime() + 90 * DAY)
    ),
    true
  );
  assert.equal(fixture.values.size, 0);
});
