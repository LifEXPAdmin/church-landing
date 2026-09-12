import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import {
  seedPortal,
  assertPortalTestDatabase,
  createPortalActor,
  type PortalActor
} from "./seed-portal";
import { portalCommand, PortalError } from "../lib/platform/portal";
import {
  postCommand,
  publishScheduledPost,
  postSchedule
} from "../lib/platform/post-commands";
import {
  getPost,
  listPosts,
  getProfilePosts
} from "../lib/platform/post-reads";
import { communityCommand } from "./community-fixture";
import { calendarCommand } from "../lib/platform/calendar-commands";

const db = new PrismaClient();
before(() => assertPortalTestDatabase(db));
after(() => db.$disconnect());
const denied = (p: Promise<unknown>, status = 403) =>
  assert.rejects(
    p,
    (e: unknown) => e instanceof PortalError && e.status === status
  );
async function fixture() {
  const f = await seedPortal(db),
    ada = f.memberA,
    lee = f.coordinator,
    val = f.contact,
    blake = f.memberB;
  await portalCommand(db, f.operator.token, {
    operation: "grant",
    churchId: f.churchA.id,
    userId: ada.id,
    capability: "PUBLISH_CHURCH_POSTS",
    expectedVersion: 0
  });
  const command = (actor: PortalActor, input: Record<string, unknown>) =>
    postCommand(db, actor.token, input);
  const create = (actor: PortalActor, input: Record<string, unknown> = {}) =>
    command(actor, {
      operation: "create",
      requestKey: randomUUID(),
      content: "A fictional community update.",
      ...input
    });
  const churchPost = (input: Record<string, unknown> = {}) =>
    create(ada, { authorChurchId: f.churchA.id, ...input });
  return { ...f, ada, lee, val, blake, command, create, churchPost };
}
test("post authorship, church audience and projections apply across direct, feed, search and profile reads", async () => {
  const f = await fixture();
  const legacy = await db.platformPost.create({
    data: { authorId: f.lee.id, content: "Legacy public meaning is retained." }
  });
  assert.equal((await getPost(db, undefined, legacy.id))?.audience, "PUBLIC");
  const marker = "Distinctive private church update " + randomUUID();
  const post = await f.churchPost({ content: marker });
  assert.equal(await getPost(db, undefined, post.id), null);
  assert.equal(await getPost(db, f.blake.token, post.id), null);
  const member = await getPost(db, f.lee.token, post.id);
  assert.equal(member?.author.name, f.churchA.name);
  assert.equal(member?.author.churchId, f.churchA.id);
  assert.equal(member?.author.username, null);
  for (const hidden of [
    f.ada.email,
    f.ada.username,
    f.ada.id,
    "requestKey",
    "scheduledById"
  ])
    assert.ok(!JSON.stringify(member).includes(hidden), hidden);
  assert.ok(
    (await listPosts(db, f.lee.token, { feed: true })).some(
      (p) => p.id === post.id
    ),
    "church posts do not require following the acting person"
  );
  assert.equal(
    (await listPosts(db, f.blake.token, { search: marker })).length,
    0
  );
  assert.equal(
    (await listPosts(db, undefined, { churchId: f.churchA.id })).length,
    0
  );
  assert.equal((await getProfilePosts(db, f.lee.token, f.ada.id)).count, 0);
  await denied(f.create(f.lee, { authorChurchId: f.churchA.id }));
  await denied(
    communityCommand(db, f.lee.token, "post", {
      authorChurchId: f.churchA.id,
      content: "Forged church author"
    })
  );
  const categorized = await createPortalActor(db, "category", {
    role: "CHURCH"
  });
  await denied(f.create(categorized, { authorChurchId: f.churchA.id }));
  await denied(
    communityCommand(db, f.blake.token, "like", { postId: post.id }),
    404
  );
  await denied(
    communityCommand(db, f.blake.token, "comment", {
      postId: post.id,
      content: "Forbidden outsider reply"
    }),
    404
  );
  assert.equal(
    await db.platformPostLike.count({ where: { postId: post.id } }),
    0
  );
  assert.equal(
    await db.platformPostComment.count({ where: { postId: post.id } }),
    0
  );
  const personal = await f.create(f.lee, { audienceChurchId: f.churchA.id });
  assert.equal(
    (await getPost(db, f.val.token, personal.id))?.author.id,
    f.lee.id
  );
  assert.equal(await getPost(db, undefined, personal.id), null);
});
test("post creation retries are stable and excessive text/topics are rejected without truncation", async () => {
  const f = await fixture(),
    key = randomUUID();
  const input = {
    operation: "create",
    requestKey: key,
    content: "文".repeat(3000),
    scripture: "John 3:16",
    topics: ["scripture", "encouragement"]
  };
  const [a, b] = await Promise.all([
    f.command(f.lee, input),
    f.command(f.lee, input)
  ]);
  assert.equal(a.id, b.id);
  assert.equal(
    await db.platformPost.count({
      where: { authorId: f.lee.id, requestKey: key }
    }),
    1
  );
  assert.equal((await getPost(db, undefined, a.id))?.content.length, 3000);
  const multiline = "文".repeat(1499) + "\n\n" + "字".repeat(1499);
  const normalized = await f.create(f.lee, {
    content: multiline.replace(/\n/g, "\r\n")
  });
  assert.equal(
    (await getPost(db, undefined, normalized.id))?.content,
    multiline
  );
  const count = await db.platformPost.count({ where: { authorId: f.lee.id } });
  await denied(
    f.create(f.lee, { content: multiline.replace(/\n/g, "\r\n") + "字" }),
    400
  );
  await denied(f.create(f.lee, { content: "文".repeat(3001) }), 400);
  await denied(
    communityCommand(db, f.lee.token, "post", { content: "a".repeat(3001) }),
    400
  );
  await denied(f.create(f.lee, { scripture: "x".repeat(121) }), 400);
  await denied(f.create(f.lee, { topics: ["prayer", "prayer"] }), 400);
  await denied(f.create(f.lee, { topics: ["inferred-denomination"] }), 400);
  await denied(f.create(f.lee, { authorId: f.ada.id }), 400);
  assert.equal(
    await db.platformPost.count({ where: { authorId: f.lee.id } }),
    count
  );
});
test("competing post edits conflict; withdrawal hides dependent discussion and retains metadata-only audit", async () => {
  const f = await fixture(),
    p = await f.create(f.lee);
  await communityCommand(db, f.val.token, "comment", {
    postId: p.id,
    content: "A reply retained under the withdrawn post."
  });
  const saves = await Promise.allSettled(
    ["First correction", "Second correction"].map((content) =>
      f.command(f.lee, {
        operation: "edit",
        postId: p.id,
        expectedVersion: 1,
        content
      })
    )
  );
  assert.equal(saves.filter((r) => r.status === "fulfilled").length, 1);
  const failed = saves.find((r) => r.status === "rejected");
  assert.ok(
    failed?.status === "rejected" &&
      failed.reason instanceof PortalError &&
      failed.reason.status === 409
  );
  const edited = await getPost(db, undefined, p.id);
  assert.ok(edited?.editedAt);
  assert.equal(edited.commentCount, 1);
  await denied(
    f.command(f.val, {
      operation: "withdraw",
      postId: p.id,
      expectedVersion: 2,
      confirmed: true
    })
  );
  await denied(
    f.command(f.lee, {
      operation: "withdraw",
      postId: p.id,
      expectedVersion: 2
    }),
    400
  );
  await communityCommand(db, f.lee.token, "delete-post", {
    postId: p.id,
    expectedVersion: 2,
    confirmed: true
  });
  assert.equal(await getPost(db, f.lee.token, p.id), null);
  assert.equal(
    (await listPosts(db, undefined, { authorId: f.lee.id })).length,
    0
  );
  const row = await db.platformPost.findUniqueOrThrow({
    where: { id: p.id },
    include: { audit: true }
  });
  assert.equal(row.status, "WITHDRAWN");
  assert.equal(row.content, "");
  assert.equal(row.audit.length, 3);
  assert.ok(
    row.audit.every(
      (a) =>
        Object.keys(a).sort().join() ===
        [
          "id",
          "createdAt",
          "postId",
          "actorId",
          "action",
          "version",
          "targetId"
        ]
          .sort()
          .join()
    )
  );
  assert.ok(
    row.audit.every((a) => a.targetId === null),
    "Ordinary post changes do not acquire participation references"
  );
  await denied(
    communityCommand(db, f.val.token, "comment", {
      postId: p.id,
      content: "Cannot append after withdrawal"
    }),
    404
  );
  assert.equal(
    await db.platformPostComment.count({ where: { postId: p.id } }),
    1
  );
});
test("closed and narrower replies enforce current church membership and explicit moderation grants", async () => {
  const f = await fixture(),
    p = await f.churchPost({
      audience: "PUBLIC",
      replyAudience: "CHURCH_MEMBERS"
    });
  assert.ok(await getPost(db, undefined, p.id));
  await denied(
    communityCommand(db, f.blake.token, "comment", {
      postId: p.id,
      content: "Outsider may read but not reply"
    })
  );
  await communityCommand(db, f.lee.token, "comment", {
    postId: p.id,
    content: "Approved member reply"
  });
  await denied(
    f.command(f.val, {
      operation: "discussion",
      postId: p.id,
      expectedVersion: 1,
      closed: true
    })
  );
  await portalCommand(db, f.operator.token, {
    operation: "grant",
    churchId: f.churchA.id,
    userId: f.val.id,
    capability: "MODERATE_CHURCH_POSTS",
    expectedVersion: 0
  });
  await f.command(f.val, {
    operation: "discussion",
    postId: p.id,
    expectedVersion: 1,
    closed: true
  });
  await denied(
    communityCommand(db, f.lee.token, "comment", {
      postId: p.id,
      content: "A closed discussion cannot accept this"
    })
  );
  await denied(
    f.command(f.val, {
      operation: "edit",
      postId: p.id,
      expectedVersion: 2,
      content: "Moderation is not church authorship"
    })
  );
  await f.command(f.ada, {
    operation: "discussion",
    postId: p.id,
    expectedVersion: 2,
    closed: false
  });
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
  await denied(
    communityCommand(db, f.lee.token, "comment", {
      postId: p.id,
      content: "Previously approved member"
    })
  );
});
test("church pins are bounded, expire on reads and leave the original post intact", async () => {
  const f = await fixture(),
    posts = [];
  for (let i = 0; i < 4; i++)
    posts.push(await f.churchPost({ audience: "PUBLIC" }));
  const until = new Date(Date.now() + 86400000).toISOString();
  for (const p of posts.slice(0, 3))
    await f.command(f.ada, {
      operation: "pin",
      postId: p.id,
      expectedVersion: 1,
      until
    });
  await denied(
    f.command(f.ada, {
      operation: "pin",
      postId: posts[3].id,
      expectedVersion: 1,
      until
    }),
    409
  );
  assert.equal(
    (await listPosts(db, undefined, { churchId: f.churchA.id, pinned: true }))
      .length,
    3
  );
  await db.platformPost.update({
    where: { id: posts[0].id },
    data: { pinUntil: new Date(Date.now() - 1) }
  });
  assert.equal((await getPost(db, undefined, posts[0].id))?.pinned, false);
  assert.equal(
    (await listPosts(db, undefined, { churchId: f.churchA.id, pinned: true }))
      .length,
    2
  );
  await f.command(f.ada, {
    operation: "pin",
    postId: posts[3].id,
    expectedVersion: 1,
    until
  });
});
test("scheduled church plans reject ambiguous time, publish once, cancel safely and recheck revoked authority", async () => {
  const f = await fixture();
  assert.throws(
    () =>
      postSchedule(
        "2026-11-01T01:30",
        "America/Chicago",
        new Date("2026-09-01T00:00:00Z")
      ),
    (e: unknown) => e instanceof PortalError && e.status === 400
  );
  assert.throws(
    () =>
      postSchedule(
        "2027-03-14T02:30",
        "America/Chicago",
        new Date("2026-09-01T00:00:00Z")
      ),
    (e: unknown) => e instanceof PortalError && e.status === 400
  );
  const future = new Date(Date.now() + 3 * 86400000),
    local = future.toISOString().slice(0, 16);
  await denied(f.create(f.lee, { scheduleLocal: local, scheduleZone: "UTC" }));
  const p = await f.churchPost({
    audience: "PUBLIC",
    scheduleLocal: local,
    scheduleZone: "UTC"
  });
  assert.equal(await getPost(db, f.ada.token, p.id), null);
  assert.deepEqual(await publishScheduledPost(db, p.id, 1), {
    published: false,
    changed: false
  });
  const due = new Date(future.getTime() + 60000);
  assert.deepEqual(await publishScheduledPost(db, p.id, 1, due), {
    published: true,
    changed: true
  });
  assert.deepEqual(await publishScheduledPost(db, p.id, 1, due), {
    published: false,
    changed: false
  });
  assert.equal(
    await db.postAudit.count({
      where: { postId: p.id, action: "schedule-published" }
    }),
    1
  );
  const canceled = await f.churchPost({
    scheduleLocal: local,
    scheduleZone: "UTC"
  });
  await f.command(f.ada, {
    operation: "cancel-schedule",
    postId: canceled.id,
    expectedVersion: 1
  });
  assert.equal(
    (await publishScheduledPost(db, canceled.id, 1, due)).published,
    false
  );
  const blocked = await f.churchPost({
    scheduleLocal: local,
    scheduleZone: "UTC"
  });
  const grant = await db.churchCapabilityGrant.findUniqueOrThrow({
    where: {
      userId_churchId_capability: {
        userId: f.ada.id,
        churchId: f.churchA.id,
        capability: "PUBLISH_CHURCH_POSTS"
      }
    }
  });
  await portalCommand(db, f.operator.token, {
    operation: "revoke-grant",
    churchId: f.churchA.id,
    id: grant.id,
    expectedVersion: grant.version
  });
  await denied(
    f.command(f.ada, {
      operation: "edit",
      postId: blocked.id,
      expectedVersion: 1,
      content: "Revoked editor must not save"
    })
  );
  assert.deepEqual(await publishScheduledPost(db, blocked.id, 1, due), {
    published: false,
    changed: true
  });
  assert.equal(
    (await db.platformPost.findUniqueOrThrow({ where: { id: blocked.id } }))
      .status,
    "DRAFT"
  );
});
test("one event discussion uses the intersection of post and current calendar audiences", async () => {
  const f = await fixture();
  for (const capability of ["EDIT_CHURCH_CALENDAR", "PUBLISH_CHURCH_EVENTS"])
    await portalCommand(db, f.operator.token, {
      operation: "grant",
      churchId: f.churchA.id,
      userId: f.ada.id,
      capability,
      expectedVersion: 0
    });
  const calendar = await calendarCommand(db, f.ada.token, {
    operation: "create-calendar",
    churchId: f.churchA.id,
    requestKey: randomUUID(),
    name: "Outreach calendar",
    timeZone: "America/Chicago"
  });
  const event = await calendarCommand(db, f.ada.token, {
    operation: "create-event",
    calendarId: calendar.id,
    expectedVersion: 1,
    requestKey: randomUUID(),
    title: "Church outreach",
    allDay: false,
    startLocal: "2026-11-01T09:00",
    endLocal: "2026-11-01T10:00",
    timeZone: "America/Chicago",
    visibility: "CHURCH"
  });
  const occurrence = await db.calendarOccurrence.findFirstOrThrow({
    where: { eventId: event.id }
  });
  const post = await f.churchPost({
    audience: "PUBLIC",
    eventOccurrenceId: occurrence.id,
    content: "Questions about our outreach"
  });
  assert.equal((await getPost(db, f.lee.token, post.id))?.audience, "CHURCH");
  assert.equal(await getPost(db, f.blake.token, post.id), null);
  assert.equal(await getPost(db, undefined, post.id), null);
  await denied(f.churchPost({ eventOccurrenceId: occurrence.id }), 409);
  await calendarCommand(db, f.ada.token, {
    operation: "set-visibility",
    eventId: event.id,
    expectedVersion: 1,
    visibility: "PUBLIC",
    confirmed: true
  });
  assert.ok(await getPost(db, undefined, post.id));
  await calendarCommand(db, f.ada.token, {
    operation: "set-visibility",
    eventId: event.id,
    expectedVersion: 2,
    visibility: "PRIVATE",
    confirmed: true
  });
  assert.equal(await getPost(db, f.lee.token, post.id), null);
  await denied(
    communityCommand(db, f.lee.token, "comment", {
      postId: post.id,
      content: "No longer visible through its event"
    }),
    404
  );
  assert.equal(
    await db.platformPostComment.count({ where: { postId: post.id } }),
    0
  );
});
