import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import {
  assertPortalTestDatabase,
  createPortalActor,
  seedOperatorGrants
} from "./seed-portal";
import {
  adultMessageCommand,
  readAdultMessages
} from "../lib/platform/adult-messages";
import {
  communityReportCommand,
  readCommunityReports
} from "../lib/platform/community-reports";
import {
  DAY,
  inspectMessagingRetention,
  runMessagingRetention,
  type PurgeRecord
} from "../lib/platform/messaging-retention";
import {
  protectedDeletionJournal,
  replayMessagingDeletions,
  type JournalEntry
} from "../lib/platform/retention-journal";

const db = new PrismaClient();
let a: Awaited<ReturnType<typeof createPortalActor>>;
let b: typeof a, reviewer: typeof a;
const priorEnabled = process.env.COMMUNITY_REPORTS_ENABLED;
const command = (
  operation: string,
  fields: Record<string, unknown>
): Record<string, unknown> => ({
  operation,
  mutationId: randomUUID(),
  ...fields
});
before(async () => {
  await assertPortalTestDatabase(db);
  a = await createPortalActor(db, "retaina");
  b = await createPortalActor(db, "retainb");
  reviewer = await createPortalActor(db, "retainer");
  await seedOperatorGrants(db, reviewer, ["REVIEW_COMMUNITY_REPORTS"]);
  process.env.COMMUNITY_REPORTS_ENABLED = "true";
});
after(async () => {
  if (priorEnabled === undefined) delete process.env.COMMUNITY_REPORTS_ENABLED;
  else process.env.COMMUNITY_REPORTS_ENABLED = priorEnabled;
  await db.$disconnect();
});
async function conversation() {
  const other = await createPortalActor(db, "retainother");
  const [participantAId, participantBId] = [a.id, other.id].sort();
  const c = await db.adultConversation.create({
    data: { participantAId, participantBId, sendingAllowed: true }
  });
  const body = command("send", {
    conversationId: c.id,
    expectedVersion: 1,
    content: "Fictional retained message " + randomUUID()
  });
  const m = await adultMessageCommand(db, a.token, body);
  return { c, m, other, body };
}
async function clear(c: { id: string }, m: { id: string }, actor: typeof a) {
  const v = await readAdultMessages(db, actor.token, {
    view: "conversation",
    conversationId: c.id
  });
  return adultMessageCommand(
    db,
    actor.token,
    command("clear", {
      conversationId: c.id,
      expectedVersion: v.conversation!.preferences.version,
      through: m.id
    })
  );
}
async function report(m: { id: string }, actor: typeof a) {
  return communityReportCommand(
    db,
    actor.token,
    command("create", {
      targetType: "MESSAGE",
      targetId: m.id,
      expectedTargetVersion: 1,
      expectedContextVersion: 0,
      reason: "PRIVACY",
      details: "Only this selected message is report evidence."
    })
  );
}
async function purge(
  ids: string[],
  now = new Date(),
  records: PurgeRecord[] = []
) {
  const plan = await inspectMessagingRetention(db, now);
  return runMessagingRetention(
    db,
    plan.candidates.filter((r) => ids.includes(r.id)),
    {
      async complete() {},
      async record(r) {
        records.push(r);
      }
    },
    now
  );
}
test("clear is participant-local; the second clear starts retention and exact retry cannot recreate a purged message", async () => {
  const { c, m, other, body } = await conversation();
  await clear(c, m, a);
  assert.equal(
    (await db.adultMessage.findUniqueOrThrow({ where: { id: m.id } }))
      .unretainedAt,
    null
  );
  assert.equal(
    (
      await readAdultMessages(db, other.token, {
        view: "conversation",
        conversationId: c.id
      })
    ).messages!.length,
    1
  );
  await clear(c, m, other);
  assert.ok(
    (await db.adultMessage.findUniqueOrThrow({ where: { id: m.id } }))
      .unretainedAt
  );
  const records: PurgeRecord[] = [];
  assert.deepEqual(await purge([m.id], new Date(), records), {
    messages: 1,
    reports: 0
  });
  assert.equal(await db.adultMessage.findUnique({ where: { id: m.id } }), null);
  assert.equal(await db.socialEvent.count({ where: { messageId: m.id } }), 0);
  assert.equal(records.length, 1);
  assert.ok(!JSON.stringify(records).includes(body.content as string));
  assert.deepEqual(await adultMessageCommand(db, a.token, body), m);
  assert.equal(await db.adultMessage.count({ where: { id: m.id } }), 0);
});
test("archive and temporary deactivation do not make participant-retained messages purgeable", async () => {
  const { c, m, other } = await conversation();
  await clear(c, m, a);
  await adultMessageCommand(
    db,
    other.token,
    command("archive", {
      conversationId: c.id,
      expectedVersion: 0,
      value: true
    })
  );
  await db.platformUser.update({
    where: { id: other.id },
    data: { deactivatedAt: new Date() }
  });
  assert.deepEqual(await purge([m.id]), { messages: 0, reports: 0 });
  assert.equal(
    (await db.adultMessage.findUniqueOrThrow({ where: { id: m.id } }))
      .unretainedAt,
    null
  );
});
test("selected report preserves its message through both clears; only selected evidence remains available to its authorized reviewer", async () => {
  const { c, m, other } = await conversation();
  const r = await report(m, other);
  await clear(c, m, a);
  await clear(c, m, other);
  assert.deepEqual(await purge([m.id]), { messages: 0, reports: 0 });
  const selected = await readCommunityReports(db, reviewer.token, {
    view: "review",
    id: r.id
  });
  assert.equal(selected.evidence?.type, "MESSAGE");
  await assert.rejects(
    readCommunityReports(db, b.token, { view: "review", id: r.id })
  );
  const closed = await communityReportCommand(
    db,
    reviewer.token,
    command("resolve", {
      id: r.id,
      expectedVersion: 1,
      resolution: "CLOSED",
      decisionReason: "Selected case review completed."
    })
  );
  const row = await db.communityReport.findUniqueOrThrow({
    where: { id: r.id }
  });
  const future = new Date(row.closedAt!.getTime() + 180 * DAY);
  assert.deepEqual(await purge([r.id], new Date(future.getTime() - 1)), {
    messages: 0,
    reports: 0
  });
  await communityReportCommand(
    db,
    reviewer.token,
    command("resolve", {
      id: r.id,
      expectedVersion: closed.version,
      resolution: "CLOSED",
      decisionReason: "Administrative note on the same closed case."
    })
  );
  assert.equal(
    (
      await db.communityReport.findUniqueOrThrow({ where: { id: r.id } })
    ).closedAt!.getTime(),
    row.closedAt!.getTime()
  );
  assert.deepEqual(await purge([r.id], future), { messages: 0, reports: 1 });
  assert.deepEqual(await purge([m.id], future), { messages: 1, reports: 0 });
  assert.equal(
    await db.communityReportDecision.count({ where: { reportId: r.id } }),
    0
  );
});
test("a reopened report invalidates the inspected plan and gets a new final-closure clock", async () => {
  const { m, other } = await conversation();
  const r = await report(m, other);
  const closed = await communityReportCommand(
    db,
    reviewer.token,
    command("resolve", {
      id: r.id,
      expectedVersion: 1,
      resolution: "CLOSED",
      decisionReason: "Initial review is complete."
    })
  );
  const future = new Date(Date.now() + 181 * DAY);
  const plan = (await inspectMessagingRetention(db, future)).candidates.filter(
    (x) => x.id === r.id
  );
  const opened = await communityReportCommand(
    db,
    reviewer.token,
    command("resolve", {
      id: r.id,
      expectedVersion: closed.version,
      resolution: "FOLLOW_UP_REQUIRED",
      decisionReason: "Concrete new evidence needs reconsideration."
    })
  );
  let writes = 0;
  assert.deepEqual(
    await runMessagingRetention(
      db,
      plan,
      {
        async complete() {},
        async record() {
          writes++;
        }
      },
      future
    ),
    { messages: 0, reports: 0 }
  );
  assert.equal(writes, 0);
  const open = await db.communityReport.findUniqueOrThrow({
    where: { id: r.id }
  });
  assert.equal(open.closedAt, null);
  await communityReportCommand(
    db,
    reviewer.token,
    command("resolve", {
      id: r.id,
      expectedVersion: opened.version,
      resolution: "CLOSED",
      decisionReason: "Reconsideration is now complete."
    })
  );
  assert.ok(
    (await db.communityReport.findUniqueOrThrow({ where: { id: r.id } }))
      .closedAt
  );
});
test("scoped holds survive overdue reviews, require current authority and release without changing the original closure date", async () => {
  const { m, other } = await conversation();
  const r = await report(m, other);
  const closed = await communityReportCommand(
    db,
    reviewer.token,
    command("resolve", {
      id: r.id,
      expectedVersion: 1,
      resolution: "CLOSED",
      decisionReason: "Closed with a specific preservation need."
    })
  );
  const body = command("preserve", {
    id: r.id,
    expectedVersion: closed.version,
    decisionReason: "Preserve only this selected report for active review."
  });
  await assert.rejects(communityReportCommand(db, b.token, body));
  const held = await communityReportCommand(db, reviewer.token, body);
  assert.deepEqual(
    await communityReportCommand(db, reviewer.token, body),
    held
  );
  const h = await db.retentionHold.findFirstOrThrow({
    where: { targetId: r.id }
  });
  const future = new Date(Date.now() + 181 * DAY);
  const inspection = await inspectMessagingRetention(db, future);
  assert.ok(inspection.overdueHolds > 0);
  assert.ok(!inspection.candidates.some((x) => x.id === r.id));
  await db.platformOperatorGrant.updateMany({
    where: { userId: reviewer.id },
    data: { revokedAt: new Date() }
  });
  await assert.rejects(communityReportCommand(db, reviewer.token, body));
  await db.platformOperatorGrant.updateMany({
    where: { userId: reviewer.id },
    data: { revokedAt: null }
  });
  await communityReportCommand(
    db,
    reviewer.token,
    command("release-hold", {
      id: r.id,
      holdId: h.id,
      expectedVersion: held.version,
      decisionReason: "The specific preservation need has ended."
    })
  );
  assert.equal(
    await db.retentionHoldEvent.count({ where: { holdId: h.id } }),
    2
  );
  assert.deepEqual(await purge([r.id], future), { messages: 0, reports: 1 });
});
test("journal failure aborts deletion; inspection omits bodies and an empty approved plan cannot purge unrelated records", async () => {
  const { c, m, other } = await conversation();
  await clear(c, m, a);
  await clear(c, m, other);
  const now = new Date();
  const plan = (await inspectMessagingRetention(db, now)).candidates.filter(
    (x) => x.id === m.id
  );
  await assert.rejects(
    runMessagingRetention(
      db,
      plan,
      {
        async complete() {},
        async record() {
          throw Error("Protected journal unavailable");
        }
      },
      now
    )
  );
  assert.ok(await db.adultMessage.findUnique({ where: { id: m.id } }));
  assert.deepEqual(
    await runMessagingRetention(
      db,
      [],
      {
        async complete() {},
        async record() {
          assert.fail("No inspected candidate");
        }
      },
      now
    ),
    { messages: 0, reports: 0 }
  );
  assert.ok(
    plan.every((x) => Object.keys(x).sort().join() === "id,target,version")
  );
});

function journalFixture() {
  const files = new Map<string, JournalEntry>();
  const journal = protectedDeletionJournal({
    async read(path) {
      return files.get(path) ?? null;
    },
    async write(path, entry) {
      if (files.has(path)) throw Error("Immutable record already exists");
      files.set(path, structuredClone(entry));
    },
    async remove(path) {
      files.delete(path);
    },
    async page() {
      return { paths: [...files.keys()] };
    }
  });
  return { files, journal };
}
test("interrupted completion is retried without another purge; concurrent runners keep one immutable completion clock", async () => {
  const { c, m, other } = await conversation();
  await clear(c, m, a);
  await clear(c, m, other);
  const now = new Date();
  const plan = (await inspectMessagingRetention(db, now)).candidates.filter(
    (x) => x.id === m.id
  );
  const { journal } = journalFixture();
  await assert.rejects(
    runMessagingRetention(
      db,
      plan,
      {
        record: journal.record,
        async complete() {
          throw Error("Completion acknowledgement lost");
        }
      },
      now
    )
  );
  assert.equal(await db.adultMessage.findUnique({ where: { id: m.id } }), null);
  const pending = (await inspectMessagingRetention(db)).candidates.filter(
    (x) => x.id === m.id
  );
  assert.equal(pending.length, 1);
  const results = await Promise.all([
    runMessagingRetention(db, pending, journal),
    runMessagingRetention(db, pending, journal)
  ]);
  assert.ok(results.every((r) => r.messages === 0));
  const page = await journal.page();
  assert.equal(page.entries.length, 1);
  assert.ok(page.entries[0].completedAt);
  assert.equal(
    (await inspectMessagingRetention(db)).candidates.filter(
      (x) => x.id === m.id
    ).length,
    0
  );
});
test("restoration replays separately protected decisions and removes restored text/events; completed journal receipts expire at 90 days", async () => {
  const { c, m, other } = await conversation();
  const saved = await db.adultMessage.findUniqueOrThrow({
    where: { id: m.id }
  });
  await clear(c, m, a);
  await clear(c, m, other);
  const { journal, files } = journalFixture();
  const plan = (await inspectMessagingRetention(db)).candidates.filter(
    (x) => x.id === m.id
  );
  await runMessagingRetention(db, plan, journal);
  const [entry] = (await journal.page()).entries;
  // Simulate an older backup on this isolated fixture. Its old participant view
  // cannot make a journaled deleted message readable after restoration replay.
  await db.adultMessage.create({ data: saved });
  await db.adultConversationState.updateMany({
    where: { conversationId: c.id },
    data: { hiddenThrough: 0 }
  });
  await replayMessagingDeletions(db, [entry]);
  assert.equal(await db.adultMessage.findUnique({ where: { id: m.id } }), null);
  assert.equal(
    (
      await readAdultMessages(db, other.token, {
        view: "conversation",
        conversationId: c.id
      })
    ).messages!.length,
    0
  );
  const expiry = new Date(new Date(entry.completedAt!).getTime() + 90 * DAY);
  assert.equal(
    await journal.expire(entry, new Date(expiry.getTime() - 1)),
    false
  );
  assert.equal(await journal.expire(entry, expiry), true);
  assert.equal(files.size, 0);
});
test("a sealed purge cannot acquire a late hold or reopen after external journal failure", async () => {
  const { m, other } = await conversation();
  const r = await report(m, other);
  const closed = await communityReportCommand(
    db,
    reviewer.token,
    command("resolve", {
      id: r.id,
      expectedVersion: 1,
      resolution: "CLOSED",
      decisionReason: "Final scoped review complete."
    })
  );
  const future = new Date(Date.now() + 181 * DAY);
  const plan = (await inspectMessagingRetention(db, future)).candidates.filter(
    (x) => x.id === r.id
  );
  await assert.rejects(
    runMessagingRetention(
      db,
      plan,
      {
        async record() {
          throw Error("Storage offline");
        },
        async complete() {}
      },
      future
    )
  );
  await assert.rejects(
    communityReportCommand(
      db,
      reviewer.token,
      command("preserve", {
        id: r.id,
        expectedVersion: closed.version,
        decisionReason: "Too late to alter a sealed purge."
      })
    )
  );
  await assert.rejects(
    communityReportCommand(
      db,
      reviewer.token,
      command("resolve", {
        id: r.id,
        expectedVersion: closed.version,
        resolution: "FOLLOW_UP_REQUIRED",
        decisionReason: "Too late to reopen a sealed purge."
      })
    )
  );
  assert.ok(await db.communityReport.findUnique({ where: { id: r.id } }));
  const { journal } = journalFixture();
  assert.deepEqual(await runMessagingRetention(db, plan, journal, future), {
    messages: 0,
    reports: 1
  });
});
