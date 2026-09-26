import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { assertPortalTestDatabase } from "./seed-portal";
import { seedParticipation } from "./seed-post-participation";
import {
  seedVolunteerApplications,
  volunteerAction
} from "./seed-volunteer-applications";
import { volunteerCommand } from "../lib/platform/volunteer-commands";
import { calendarCommand } from "../lib/platform/calendar-commands";
import { readActivity } from "../lib/platform/activity";
import { processNotificationFanoutBatch } from "../lib/platform/notification-fanout";
const db = new PrismaClient();
before(() => assertPortalTestDatabase(db));
after(() => db.$disconnect());

test("owned cancellation has one explicit targeted notice even after source membership is lost", async () => {
  const f = await seedParticipation(db),
    slot = await f.slot();
  const signup = await f.command(f.lee, {
    operation: "volunteer",
    slotId: slot.id,
    slotVersion: 1,
    expectedVersion: 0
  });
  await db.churchConnection.update({
    where: { userId_churchId: { userId: f.lee.id, churchId: f.churchA.id } },
    data: { state: "REMOVED" }
  });
  const command = {
    operation: "cancel-volunteer",
    signupId: signup.id,
    expectedVersion: signup.version
  };
  await f.command(f.lee, command);
  await f.command(f.lee, command);
  const notices = await db.socialEvent.findMany({
    where: {
      kind: "VOLUNTEER_CONFIRMATION",
      sourceId: signup.id,
      sourceVersion: 2
    }
  });
  assert.equal(notices.length, 1);
  assert.equal(notices[0].recipientId, f.lee.id);
  const view = await readActivity(db, f.lee.token, { category: "commitments" });
  const item = view.items.find((item) => item.id === notices[0].id);
  assert.equal(item?.summary, "Your volunteer signup is canceled");
  assert.equal(item?.href, `/platform/commitments?signup=${signup.id}`);
  assert.doesNotMatch(JSON.stringify(item), /Fictional|Welcome neighbors/);
  assert.equal(
    (await readActivity(db, f.val.token)).items.some(
      (item) => item.id === notices[0].id
    ),
    false
  );
});

test("coordinator cancellation targets the affected assignment and preserves application history", async () => {
  const f = await seedVolunteerApplications(db);
  const submitted = await volunteerCommand(db, f.lee.token, f.application());
  await volunteerCommand(
    db,
    f.ada.token,
    volunteerAction("accept", {
      id: submitted.id,
      expectedVersion: 1,
      ...f.snapshot
    })
  );
  const accepted = await db.volunteerApplication.findUniqueOrThrow({
    where: { id: submitted.id },
    include: { signup: true }
  });
  const input = volunteerAction("cancel", {
    id: accepted.id,
    expectedVersion: accepted.version
  });
  await volunteerCommand(db, f.ada.token, input);
  await volunteerCommand(db, f.ada.token, input);
  const row = await db.volunteerApplication.findUniqueOrThrow({
    where: { id: accepted.id },
    include: { signup: true, events: true }
  });
  assert.equal(row.state, "WITHDRAWN");
  assert.equal(row.signup?.state, "CANCELED");
  assert.equal(row.events.filter((e) => e.action === "CANCELED").length, 1);
  const notice = await db.socialEvent.findFirstOrThrow({
    where: {
      kind: "VOLUNTEER_CONFIRMATION",
      sourceId: row.signupId!,
      sourceVersion: row.signup!.version
    }
  });
  assert.equal(notice.actorId, f.ada.id);
  assert.equal(notice.recipientId, f.lee.id);
  const item = (await readActivity(db, f.lee.token)).items.find(
    (item) => item.id === notice.id
  );
  assert.equal(item?.summary, "Your volunteer signup is canceled");
  assert.doesNotMatch(JSON.stringify(item), /private application/);
});

test("event cancellation notice reaches active volunteer participants but not canceled or unrelated members", async () => {
  const f = await seedParticipation(db),
    slot = await f.slot({ capacity: 2 });
  await f.command(f.lee, {
    operation: "volunteer",
    slotId: slot.id,
    slotVersion: 1,
    expectedVersion: 0
  });
  const canceled = await f.command(f.val, {
    operation: "volunteer",
    slotId: slot.id,
    slotVersion: 1,
    expectedVersion: 0
  });
  await f.command(f.val, {
    operation: "cancel-volunteer",
    signupId: canceled.id,
    expectedVersion: 1
  });
  await calendarCommand(db, f.ada.token, {
    operation: "cancel-event",
    eventId: f.event.id,
    expectedVersion: 1,
    occurrenceId: f.occurrence.id,
    occurrenceVersion: 1,
    scope: "OCCURRENCE",
    confirmed: true
  });
  const job = await db.notificationFanoutJob.findFirstOrThrow({
    where: { kind: "EVENT_CHANGED", sourceId: f.occurrence.id }
  });
  for (let i = 0; i < 4; i++)
    if ((await processNotificationFanoutBatch(db, job.id)).done) break;
  const notices = await db.socialEvent.findMany({
    where: { kind: "EVENT_CHANGED", sourceId: f.occurrence.id }
  });
  assert.deepEqual(
    notices.map((n) => n.recipientId),
    [f.lee.id]
  );
  const item = (await readActivity(db, f.lee.token)).items.find(
    (item) => item.id === notices[0].id
  );
  assert.equal(item?.summary, "An event in your commitments was canceled");
  assert.equal(item?.href, `/platform/events/${f.occurrence.id}`);
});
