import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { assertPortalTestDatabase } from "./seed-portal";
import { seedParticipation } from "./seed-post-participation";
import { PortalError, portalCommand } from "../lib/platform/portal";
import { postCommand } from "../lib/platform/post-commands";
import {
  getPostParticipation,
  getVolunteerRoster
} from "../lib/platform/post-participation-reads";
import { getCalendarCommitments } from "../lib/platform/calendar-reads";
import { calendarCommand } from "../lib/platform/calendar-commands";
import { handleParticipationRequest } from "../lib/platform/post-participation-boundary";
const db = new PrismaClient();
before(() => assertPortalTestDatabase(db));
after(() => db.$disconnect());
const denied = (p: Promise<unknown>, status: number) =>
  assert.rejects(
    p,
    (e: unknown) => e instanceof PortalError && e.status === status
  );
const range = {
  from: new Date().toISOString().slice(0, 10),
  until: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
  timeZone: "UTC"
};
test("single ballots persist once, change before closing and lock structure without exposing other voters", async () => {
  const f = await seedParticipation(db);
  await f.poll();
  const view = await getPostParticipation(db, f.lee.token, f.post.id),
    poll = view.poll!;
  const input = {
    operation: "vote",
    pollVersion: poll.version,
    expectedVersion: 0,
    optionIds: [poll.options[0].id]
  };
  const [a, b] = await Promise.all([
    f.command(f.lee, input),
    f.command(f.lee, input)
  ]);
  await denied(
    f.command(f.val, {
      ...input,
      optionIds: [poll.options[0].id, poll.options[1].id]
    }),
    400
  );
  assert.equal(a.version, b.version);
  assert.equal(
    await db.postPollBallot.count({
      where: { pollId: poll.id, userId: f.lee.id }
    }),
    1
  );
  const before = (await getPostParticipation(db, f.val.token, f.post.id)).poll!;
  assert.equal(before.total, 1);
  assert.equal(before.options[0].count, 1);
  assert.equal(before.ballot, null);
  assert.ok(!JSON.stringify(before).includes(f.lee.id));
  assert.ok(!JSON.stringify(before).includes(f.lee.email));
  await denied(
    f.poll({
      expectedVersion: 1,
      question: "A changed question after participation"
    }),
    409
  );
  await f.command(f.lee, {
    ...input,
    expectedVersion: 1,
    optionIds: [poll.options[1].id]
  });
  const after = (await getPostParticipation(db, f.lee.token, f.post.id)).poll!;
  assert.equal(after.total, 1);
  assert.equal(after.options[0].count, 0);
  assert.equal(after.options[1].count, 1);
  assert.equal(after.ballot?.version, 2);
  await denied(f.command(f.lee, { ...input, expectedVersion: 1 }), 409);
  await f.command(f.ada, { operation: "close-poll", expectedVersion: 1 });
  await denied(
    f.command(f.lee, { ...input, pollVersion: 2, expectedVersion: 2 }),
    409
  );
  assert.deepEqual(
    (await getPostParticipation(db, f.lee.token, f.post.id)).poll?.ballot,
    after.ballot
  );
  await db.postPoll.update({
    where: { id: poll.id },
    data: { closedAt: null, closesAt: new Date(Date.now() - 1000) }
  });
  await denied(
    f.command(f.lee, { ...input, pollVersion: 2, expectedVersion: 2 }),
    409
  );
});
test("poll choices, current eligibility and post/event audiences are enforced for every participant", async () => {
  const f = await seedParticipation(db);
  await f.poll({ multiple: true });
  const poll = (await getPostParticipation(db, f.lee.token, f.post.id)).poll!;
  const vote = {
    operation: "vote",
    pollVersion: 1,
    expectedVersion: 0,
    optionIds: [poll.options[0].id, poll.options[2].id]
  };
  await f.command(f.lee, vote);
  await denied(
    f.command(f.val, {
      ...vote,
      optionIds: [poll.options[0].id, poll.options[0].id]
    }),
    400
  );
  await denied(f.command(f.val, { ...vote, optionIds: [randomUUID()] }), 400);
  await denied(f.command(f.val, { ...vote, userId: f.lee.id }), 400);
  await denied(f.command(f.blake, vote), 404);
  await denied(f.command(f.unverified, vote), 404);
  await denied(getPostParticipation(db, undefined, f.post.id), 404);
  const connection = await db.churchConnection.findUniqueOrThrow({
    where: { userId_churchId: { userId: f.lee.id, churchId: f.churchA.id } }
  });
  await portalCommand(db, f.reviewerA.token, {
    operation: "transition",
    action: "REMOVE",
    churchId: f.churchA.id,
    connectionId: connection.id,
    expectedVersion: connection.version
  });
  assert.equal(
    (await getPostParticipation(db, f.val.token, f.post.id)).poll?.total,
    0
  );
  await denied(f.command(f.lee, vote), 404);
  await calendarCommand(db, f.ada.token, {
    operation: "set-visibility",
    eventId: f.event.id,
    expectedVersion: 1,
    visibility: "PRIVATE",
    confirmed: true
  });
  await denied(f.command(f.val, vote), 404);
  await denied(getPostParticipation(db, f.val.token, f.post.id), 404);
});
test("a concurrent final volunteer place has one winner, safe retries and cancellation frees exactly one place", async () => {
  const f = await seedParticipation(db),
    slot = await f.slot();
  const input = {
    operation: "volunteer",
    slotId: slot.id,
    slotVersion: 1,
    expectedVersion: 0
  };
  const results = await Promise.allSettled([
    f.command(f.val, input),
    f.command(f.morgan, input)
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  const loser = results.find((r) => r.status === "rejected");
  assert.ok(loser?.status === "rejected" && loser.reason.status === 409);
  const winner = results[0].status === "fulfilled" ? f.val : f.morgan,
    other = winner === f.val ? f.morgan : f.val;
  const saved = await f.command(winner, input);
  await denied(f.command(other, input), 409);
  assert.equal(
    await db.postVolunteerSignup.count({
      where: { slotId: slot.id, state: "ACTIVE" }
    }),
    1
  );
  assert.equal(
    await db.calendarResponse.count({
      where: { occurrenceId: f.occurrence.id }
    }),
    0,
    "Volunteering does not submit an RSVP"
  );
  const mine = await getCalendarCommitments(db, winner.token, range);
  assert.equal(mine.volunteerCommitments.length, 1);
  assert.equal(mine.volunteerCommitments[0].id, saved.id);
  const roster = await getVolunteerRoster(db, f.ada.token, slot.id);
  assert.equal(roster.total, 1);
  assert.equal(roster.people[0].id, saved.id);
  assert.ok(!JSON.stringify(roster).includes(winner.email));
  await denied(getVolunteerRoster(db, f.lee.token, slot.id), 403);
  await denied(
    f.command(other, {
      operation: "cancel-volunteer",
      signupId: saved.id,
      expectedVersion: 1
    }),
    404
  );
  await f.command(winner, {
    operation: "cancel-volunteer",
    signupId: saved.id,
    expectedVersion: 1
  });
  await f.command(winner, {
    operation: "cancel-volunteer",
    signupId: saved.id,
    expectedVersion: 1
  });
  assert.equal(
    (await getCalendarCommitments(db, winner.token, range)).volunteerCommitments
      .length,
    0
  );
  await f.command(other, input);
  assert.equal((await getVolunteerRoster(db, f.ada.token, slot.id)).total, 1);
});
test("volunteer edits preserve signups, reject overfill and label event changes and cancellation", async () => {
  const f = await seedParticipation(db),
    slot = await f.slot({ capacity: 2 });
  const input = {
    operation: "volunteer",
    slotId: slot.id,
    slotVersion: 1,
    expectedVersion: 0
  };
  await f.command(f.val, input);
  await f.command(f.morgan, input);
  const edit = {
    operation: "configure-slot",
    slotId: slot.id,
    requestKey: randomUUID(),
    expectedVersion: 1,
    role: "Welcome neighbors",
    capacity: 2,
    closed: false
  };
  await denied(f.command(f.ada, { ...edit, capacity: 1 }), 409);
  await denied(
    f.command(f.ada, { ...edit, role: "An entirely different responsibility" }),
    409
  );
  await f.command(f.ada, { ...edit, closed: true });
  await denied(f.command(f.lee, { ...input, slotVersion: 2 }), 409);
  await f.command(f.ada, { ...edit, expectedVersion: 2, capacity: 3 });
  await denied(f.command(f.lee, input), 409);
  await f.command(f.lee, { ...input, slotVersion: 3 });
  await calendarCommand(db, f.ada.token, {
    operation: "cancel-event",
    eventId: f.event.id,
    expectedVersion: 1,
    scope: "OCCURRENCE",
    occurrenceId: f.occurrence.id,
    occurrenceVersion: 1,
    confirmed: true
  });
  await denied(f.command(f.ada, { ...edit, expectedVersion: 3 }), 409);
  const commitments = await getCalendarCommitments(db, f.val.token, range);
  assert.equal(commitments.volunteerCommitments[0].event?.canceled, true);
  assert.equal(commitments.volunteerCommitments[0].detailsChanged, true);
  const own = (await getPostParticipation(db, f.val.token, f.post.id)).slots[0]
    .signup!;
  await f.command(f.val, {
    operation: "cancel-volunteer",
    signupId: own.id,
    expectedVersion: own.version
  });
  await denied(
    f.command(f.val, { ...input, expectedVersion: 2, slotVersion: 3 }),
    409
  );
});
test("withdrawn posts and revoked organizer grants hide participation while owner cancellation stays possible", async () => {
  const f = await seedParticipation(db),
    slot = await f.slot();
  await f.poll();
  const saved = await f.command(f.val, {
    operation: "volunteer",
    slotId: slot.id,
    slotVersion: 1,
    expectedVersion: 0
  });
  const grant = await db.churchCapabilityGrant.findUniqueOrThrow({
    where: {
      userId_churchId_capability: {
        userId: f.ada.id,
        churchId: f.churchA.id,
        capability: "MANAGE_CHURCH_VOLUNTEERS"
      }
    }
  });
  await portalCommand(db, f.operator.token, {
    operation: "revoke-grant",
    churchId: f.churchA.id,
    id: grant.id,
    expectedVersion: grant.version
  });
  await denied(getVolunteerRoster(db, f.ada.token, slot.id), 403);
  await denied(f.slot(), 403);
  await postCommand(db, f.ada.token, {
    operation: "withdraw",
    postId: f.post.id,
    expectedVersion: 1,
    confirmed: true
  });
  await denied(getPostParticipation(db, f.val.token, f.post.id), 404);
  const mine = (await getCalendarCommitments(db, f.val.token, range))
    .volunteerCommitments[0];
  assert.equal(mine.id, saved.id);
  assert.equal(mine.role, "Unavailable volunteer commitment");
  assert.equal(mine.event, null);
  assert.equal(mine.postId, null);
  assert.ok(!JSON.stringify(mine).includes(f.occurrence.title));
  await f.command(f.val, {
    operation: "cancel-volunteer",
    signupId: saved.id,
    expectedVersion: 1
  });
  assert.equal(
    await db.postVolunteerSignup.count({
      where: { slotId: slot.id, state: "ACTIVE" }
    }),
    0
  );
});
test("participation boundary rejects forged origins and actors, limits body size and returns recoverable private responses", async () => {
  const f = await seedParticipation(db);
  await f.poll();
  const poll = (await getPostParticipation(db, f.lee.token, f.post.id)).poll!;
  const origin = process.env.ACCOUNT_ORIGIN!,
    input = {
      operation: "vote",
      postId: f.post.id,
      pollVersion: 1,
      expectedVersion: 0,
      optionIds: [poll.options[0].id]
    };
  const invoke = (payload: unknown, source = origin, token = f.lee.token) =>
    handleParticipationRequest(
      db,
      new Request(origin + "/api/platform/participation", {
        method: "POST",
        headers: {
          Origin: source,
          Cookie: "church_platform_session=" + token,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      })
    );
  assert.equal((await invoke(input, "https://wrong.example")).status, 403);
  assert.equal((await invoke({ ...input, userId: f.val.id })).status, 400);
  assert.equal((await invoke(input, origin, "")).status, 401);
  assert.equal(
    (await invoke({ ...input, junk: "x".repeat(17000) })).status,
    400
  );
  assert.equal(
    await db.postPollBallot.count({ where: { pollId: poll.id } }),
    0
  );
  const success = await invoke(input);
  assert.equal(success.status, 200);
  assert.match(success.headers.get("Cache-Control")!, /no-store/);
  assert.equal(success.headers.get("Vary"), "Cookie");
  const absent = await handleParticipationRequest(
    db,
    new Request(origin + "/api/platform/participation?postId=" + f.post.id)
  );
  assert.equal(absent.status, 404);
  assert.ok(!(await absent.text()).includes(f.occurrence.title));
});
