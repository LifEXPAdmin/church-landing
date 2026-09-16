import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Prisma, PrismaClient } from "@prisma/client";
import { assertPortalTestDatabase } from "./seed-portal";
import { seedParticipation } from "./seed-post-participation";
import { communityCommand } from "./community-fixture";
import { postCommand } from "../lib/platform/post-commands";
import { commentCommand } from "../lib/platform/comment-commands";
import { calendarCommand } from "../lib/platform/calendar-commands";
import {
  metricConfiguration,
  saveMeasurementChoice
} from "../lib/platform/platform-measurement";
import { metricSources } from "../lib/platform/metric-sources";

const db = new PrismaClient();
before(async () => {
  await assertPortalTestDatabase(db);
  process.env.PLATFORM_MEASUREMENT_ENABLED = "true";
});
after(() => db.$disconnect());

test("aggregate adoption uses all six canonical sources, excludes prayer and reposts, and rechecks current visibility and withdrawal", async () => {
  const f = await seedParticipation(db);
  const config = await metricConfiguration(db);
  await saveMeasurementChoice(db, f.morgan.token, {
    operation: "choice",
    mutationId: randomUUID(),
    expectedVersion: 0,
    enabled: true,
    shareDevice: false,
    referral: "UNKNOWN"
  });
  const counts = async () => {
    const now = new Date();
    const rows = await db.$queryRaw<{ kind: string; n: number }[]>(Prisma.sql`
      WITH RECURSIVE ${metricSources(config.version, now, new Date(now.getTime() - 90 * 86400000))}
      SELECT kind,count(*)::int AS n FROM actions WHERE actor=${f.morgan.id} GROUP BY kind
    `);
    return Object.fromEntries(rows.map((row) => [row.kind, row.n]));
  };
  assert.deepEqual(await counts(), {}, "Existing fixture activity predates consent.");
  await communityCommand(db, f.morgan.token, "follow", {
    followingId: f.blake.id
  });
  const post = await postCommand(db, f.morgan.token, {
    operation: "create",
    requestKey: randomUUID(),
    content: "A fictional ordinary community update.",
    audience: "PUBLIC",
    allowReposts: true
  });
  const root = await commentCommand(db, f.ada.token, {
    operation: "create",
    mutationId: randomUUID(),
    postId: f.post.id,
    content: "Fictional outreach preparation."
  });
  await commentCommand(db, f.morgan.token, {
    operation: "create",
    mutationId: randomUUID(),
    postId: f.post.id,
    replyToId: root.id,
    content: "A fictional reply to the preparation."
  });
  await calendarCommand(db, f.morgan.token, {
    operation: "rsvp",
    eventId: f.event.id,
    occurrenceId: f.occurrence.id,
    occurrenceVersion: f.occurrence.version,
    expectedVersion: 0,
    state: "GOING"
  });
  const slot = await f.slot();
  const signup = await f.command(f.morgan, {
    operation: "volunteer",
    slotId: slot.id,
    slotVersion: 1,
    expectedVersion: 0
  });
  const calendar = await calendarCommand(db, f.morgan.token, {
    operation: "create-calendar",
    requestKey: randomUUID(),
    name: "Fictional personal schedule",
    timeZone: "UTC"
  });
  const start = new Date(Date.now() + 10 * 86400000);
  const event = await calendarCommand(db, f.morgan.token, {
    operation: "create-event",
    calendarId: calendar.id,
    expectedVersion: 1,
    requestKey: randomUUID(),
    title: "Fictional personal appointment",
    allDay: false,
    startLocal: start.toISOString().slice(0, 16),
    endLocal: new Date(start.getTime() + 3600000).toISOString().slice(0, 16),
    timeZone: "UTC"
  });
  const expected = {
    FOLLOW: 1,
    POST: 1,
    REPLY: 1,
    RSVP: 1,
    VOLUNTEER: 1,
    EVENT: 1
  };
  assert.deepEqual(await counts(), expected);

  const prayer = await postCommand(db, f.morgan.token, {
    operation: "create",
    requestKey: randomUUID(),
    type: "PRAYER",
    content: "A fictional prayer fixture.",
    audience: "PUBLIC"
  });
  await commentCommand(db, f.morgan.token, {
    operation: "create",
    mutationId: randomUUID(),
    postId: prayer.id,
    content: "A fictional prayer reply fixture."
  });
  // Relational fixtures cover both canonical repost kinds without conflating
  // their separate sharing flow with an original-post adoption event.
  for (const repostKind of ["PLAIN", "QUOTE"] as const)
    await db.platformPost.create({
      data: {
        authorId: f.morgan.id,
        content: "Fictional repost fixture.",
        repostKind,
        repostSourceId: post.id
      }
    });
  assert.deepEqual(await counts(), expected);

  await db.platformPostComment.update({
    where: { id: root.id },
    data: { moderationState: "HIDDEN" }
  });
  assert.deepEqual(
    await counts(),
    { FOLLOW: 1, POST: 1, RSVP: 1, VOLUNTEER: 1, EVENT: 1 },
    "A hidden ancestor conceals its reply branch."
  );
  await db.churchConnection.updateMany({
    where: { userId: f.morgan.id, churchId: f.churchA.id },
    data: { state: "LEFT" }
  });
  assert.deepEqual(await counts(), { FOLLOW: 1, POST: 1, EVENT: 1 }, "Church-only participation requires a current approved connection.");
  await calendarCommand(db, f.morgan.token, {
    operation: "withdraw-response",
    occurrenceId: f.occurrence.id,
    expectedVersion: 1
  });
  await f.command(f.morgan, {
    operation: "cancel-volunteer",
    signupId: signup.id,
    expectedVersion: 1
  });
  await communityCommand(db, f.morgan.token, "unfollow", {
    followingId: f.blake.id
  });
  await postCommand(db, f.morgan.token, {
    operation: "withdraw",
    postId: post.id,
    expectedVersion: post.version,
    confirmed: true
  });
  const currentEvent = await db.calendarEvent.findUniqueOrThrow({
    where: { id: event.id }
  });
  await calendarCommand(db, f.morgan.token, {
    operation: "cancel-event",
    eventId: event.id,
    expectedVersion: currentEvent.version,
    scope: "SERIES",
    confirmed: true
  });
  assert.deepEqual(await counts(), {}, "Withdrawn sources never remain adoption events.");
  const rsvp = await db.calendarResponse.findFirstOrThrow({
    where: { userId: f.morgan.id, occurrenceId: f.occurrence.id }
  });
  const volunteer = await db.postVolunteerSignup.findUniqueOrThrow({
    where: { id: signup.id }
  });
  assert.equal(rsvp.goingSince, null);
  assert.equal(volunteer.activeSince, null);
});
