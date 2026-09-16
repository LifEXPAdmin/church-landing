import { portalCommand } from "../lib/platform/portal";
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { assertPortalTestDatabase } from "./seed-portal";
import { seedParticipation } from "./seed-post-participation";
import {
  relationshipCommand,
  readRelationships
} from "../lib/platform/relationships";
import { processNotificationFanoutBatch } from "../lib/platform/notification-fanout";
import {
  readActivity,
  readActivitySummary,
  activityCommand,
  openActivity
} from "../lib/platform/activity";
const db = new PrismaClient();
before(async () => {
  await assertPortalTestDatabase(db);
  process.env.PUSH_ENABLED = "false";
});
after(() => db.$disconnect());
async function bell(token: string, churchId: string) {
  const status = (await readRelationships(db, token, {
    view: "status",
    kind: "church",
    targetId: churchId
  })) as { version: number };
  await relationshipCommand(db, token, {
    operation: "author-bell",
    mutationId: randomUUID(),
    kind: "church",
    targetId: churchId,
    desired: true,
    expectedVersion: status.version
  });
}
test("a real new volunteer role alerts only prior church-bell members once and opens its exact signup control", async () => {
  const f = await seedParticipation(db);
  await bell(f.morgan.token, f.churchA.id);
  const earlier = await readActivity(db, f.morgan.token);
  await activityCommand(db, f.morgan.token, {
    operation: "read-all",
    ownerId: f.morgan.id,
    boundary: earlier.boundary,
    mutationId: randomUUID()
  });
  await bell(f.blake.token, f.churchA.id); // Opt-in never substitutes for source membership.
  await bell(f.ada.token, f.churchA.id); // No self notification.
  const requestKey = randomUUID(),
    slot = await f.slot({ requestKey });
  assert.equal((await f.slot({ requestKey })).id, slot.id);
  await bell(f.lee.token, f.churchA.id); // Too late for this request.
  const jobs = await db.notificationFanoutJob.findMany({
    where: { sourceId: slot.id, kind: "VOLUNTEER_REQUEST" }
  });
  assert.equal(jobs.length, 1);
  assert.equal(
    (await processNotificationFanoutBatch(db, jobs[0].id)).done,
    true
  );
  assert.equal(
    (await processNotificationFanoutBatch(db, jobs[0].id)).processed,
    0
  );
  const events = await db.socialEvent.findMany({
    where: { kind: "VOLUNTEER_REQUEST", sourceId: slot.id }
  });
  assert.deepEqual(
    events.map((e) => e.recipientId),
    [f.morgan.id]
  );
  const view = await readActivity(db, f.morgan.token);
  assert.equal(view.unread, 1);
  assert.equal(
    view.items[0].href,
    `/platform/posts/${f.post.id}#volunteer-${slot.id}`
  );
  assert.equal(
    view.items[0].summary,
    `${f.churchA.name} has a new volunteer request`
  );
  assert.deepEqual(await readActivitySummary(db, f.morgan.token, f.morgan.id), {
    ownerId: f.morgan.id,
    unread: 1
  });
  assert.equal(
    await db.notificationDelivery.count({
      where: { eventId: { in: events.map((e) => e.id) } }
    }),
    0
  );
  await db.socialPreferences.upsert({
    where: { ownerId: f.morgan.id },
    create: {
      ownerId: f.morgan.id,
      mutedNotificationCategories: ["commitments"]
    },
    update: { mutedNotificationCategories: ["commitments"] }
  });
  assert.equal(
    (await readActivitySummary(db, f.morgan.token, f.morgan.id)).unread,
    0
  );
  await db.socialPreferences.update({
    where: { ownerId: f.morgan.id },
    data: { mutedNotificationCategories: [] }
  });
  const connection = await db.churchConnection.findUniqueOrThrow({
    where: { userId_churchId: { userId: f.morgan.id, churchId: f.churchA.id } }
  });
  await portalCommand(db, f.reviewerA.token, {
    operation: "transition",
    action: "REMOVE",
    churchId: f.churchA.id,
    connectionId: connection.id,
    expectedVersion: connection.version
  });
  assert.deepEqual(await openActivity(db, f.morgan.token, events[0].id), {
    ownerId: f.morgan.id,
    available: false,
    href: null
  });
  const removed = (await readActivity(db, f.morgan.token)).items.find(
    (item) => item.id === events[0].id
  );
  assert.ok(removed);
  assert.equal(removed.available, false);
  assert.equal(removed.summary, null);
  assert.equal(removed.href, null);
});

test("closed roles and revoked/muted subscriptions do not produce a new volunteer request or reveal old details", async () => {
  const f = await seedParticipation(db);
  await bell(f.morgan.token, f.churchA.id);
  const closed = await f.slot({ closed: true });
  assert.equal(
    await db.notificationFanoutJob.count({
      where: { kind: "VOLUNTEER_REQUEST", sourceId: closed.id }
    }),
    0
  );
  const slot = await f.slot();
  const job = await db.notificationFanoutJob.findFirstOrThrow({
    where: { kind: "VOLUNTEER_REQUEST", sourceId: slot.id }
  });
  await db.socialRelationship.updateMany({
    where: { ownerId: f.morgan.id, churchId: f.churchA.id },
    data: { muted: true }
  });
  await processNotificationFanoutBatch(db, job.id);
  assert.equal(
    await db.socialEvent.count({
      where: { kind: "VOLUNTEER_REQUEST", sourceId: slot.id }
    }),
    0
  );
  await db.socialRelationship.updateMany({
    where: { ownerId: f.morgan.id, churchId: f.churchA.id },
    data: { muted: false }
  });
  const next = await f.slot();
  const nextJob = await db.notificationFanoutJob.findFirstOrThrow({
    where: { kind: "VOLUNTEER_REQUEST", sourceId: next.id }
  });
  await processNotificationFanoutBatch(db, nextJob.id);
  const event = await db.socialEvent.findFirstOrThrow({
    where: { kind: "VOLUNTEER_REQUEST", sourceId: next.id }
  });
  await f.slot({
    slotId: next.id,
    expectedVersion: next.version,
    closed: true
  });
  assert.deepEqual(await openActivity(db, f.morgan.token, event.id), {
    ownerId: f.morgan.id,
    available: false,
    href: null
  });
});
