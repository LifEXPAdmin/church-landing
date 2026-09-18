import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import {
  createPortalActor,
  assertPortalTestDatabase,
  seedPortal
} from "./seed-portal";
import {
  readActivity,
  activityCommand,
  openActivity
} from "../lib/platform/activity";
import { handleActivityRequest } from "../lib/platform/activity-boundary";
import { commentCommand } from "../lib/platform/comment-commands";
import { portalCommand } from "../lib/platform/portal";
import { PortalError } from "../lib/platform/portal-policy";
import { SESSION_COOKIE } from "../lib/platform/account-boundary";
import { accountConfig } from "../lib/platform/account-config";

const db = new PrismaClient();
before(() => assertPortalTestDatabase(db));
after(() => db.$disconnect());
const mutation = (operation: string, fields: Record<string, unknown> = {}) => ({
  operation,
  mutationId: randomUUID(),
  ...fields
});
const denied = (action: Promise<unknown>, status: number) =>
  assert.rejects(
    action,
    (e: unknown) => e instanceof PortalError && e.status === status
  );
async function fixture(groups = 1, replies = 2, authorChurchId?: string) {
  const owner = await createPortalActor(db, "activityread"),
    author = await createPortalActor(db, "activitywrite");
  const posts = Array.from({ length: groups }, () => randomUUID());
  await db.platformPost.createMany({
    data: posts.map((id) => ({
      id,
      authorId: owner.id,
      content: "Private activity post body"
    }))
  });
  const comments = posts.flatMap((postId) =>
    Array.from({ length: replies }, () => ({
      id: randomUUID(),
      postId,
      authorId: author.id,
      authorChurchId,
      content: "Private activity comment body"
    }))
  );
  await db.platformPostComment.createMany({ data: comments });
  await db.socialEvent.createMany({
    data: comments.map((c) => ({
      key: randomUUID(),
      kind: "COMMENT_ACTIVITY",
      actorId: author.id,
      recipientId: owner.id,
      postId: c.postId,
      commentId: c.id
    }))
  });
  return { owner, author, posts, comments };
}

const request = (
  token: string | null,
  query = "",
  input?: Record<string, unknown>,
  origin = accountConfig().origin
) =>
  new Request(accountConfig().origin + "/api/platform/activity" + query, {
    method: input ? "POST" : "GET",
    headers: {
      ...(token ? { cookie: `${SESSION_COOKIE}=${token}` } : {}),
      ...(input ? { origin, "content-type": "application/json" } : {})
    },
    body: input ? JSON.stringify(input) : undefined
  });

test("activity has an exact empty state and denies guests, ineligible accounts and unsupported HTTP input without caching", async () => {
  const owner = await createPortalActor(db, "emptyactivity");
  const empty = await readActivity(db, owner.token);
  assert.equal(empty.items.length, 0);
  assert.equal(empty.unread, 0);
  assert.equal(empty.nextCursor, null);
  assert.deepEqual(empty.categories, [
    "messages",
    "requests",
    "comments",
    "reports",
    "founder",
    "posts",
    "reactions",
    "prayer",
    "church",
    "commitments",
    "feedback",
    "photos",
    "exchange",
    "handoffs",
    "needs"
  ]);
  const guest = await handleActivityRequest(db, request(null));
  assert.equal(guest.status, 401);
  assert.match(guest.headers.get("cache-control")!, /no-store/);
  for (const q of [
    "?view=nope",
    "?category=nope",
    "?cursor=invalid",
    "?view=inbox&id=bad",
    "?view=open&category=comments",
    "?view=inbox&view=open",
    "?actorId=other"
  ])
    assert.equal(
      (await handleActivityRequest(db, request(owner.token, q))).status,
      400,
      q
    );
  const unverified = await createPortalActor(db, "activityunverified", {
    verified: false
  });
  await denied(readActivity(db, unverified.token), 403);
  assert.equal(
    (
      await handleActivityRequest(
        db,
        request(
          owner.token,
          "",
          mutation("read-all", { ownerId: owner.id, boundary: empty.boundary }),
          "https://other.example.test"
        )
      )
    ).status,
    403
  );
});

test("grouped pages retain an owned snapshot, exact unread totals and all twenty-five groups through concurrent arrivals", async () => {
  const f = await fixture(25, 2);
  const first = await readActivity(db, f.owner.token);
  assert.equal(first.items.length, 20);
  assert.equal(first.unread, 50);
  assert.ok(first.nextCursor);
  assert.ok(
    first.items.every((i) => i.count === 2 && i.unread === 2 && i.available)
  );
  assert.doesNotMatch(
    JSON.stringify(first),
    /Private activity|password|actorId|authorId|groupKey/
  );
  const newer = await commentCommand(
    db,
    f.author.token,
    mutation("create", {
      postId: f.posts[0],
      content: "Later canonical comment"
    })
  );
  assert.ok(newer.id);
  const second = await readActivity(db, f.owner.token, {
    cursor: first.nextCursor
  });
  assert.equal(second.items.length, 5);
  assert.equal(second.nextCursor, null);
  assert.equal(second.unread, 50);
  assert.equal(
    new Set([...first.items, ...second.items].map((i) => i.id)).size,
    25
  );
  assert.equal((await readActivity(db, f.owner.token)).unread, 51);
  assert.equal(
    (await readActivity(db, f.owner.token, { category: "requests" })).items
      .length,
    0
  );
  const other = await createPortalActor(db, "activityother");
  await denied(
    readActivity(db, other.token, { cursor: first.nextCursor }),
    401
  );
  await denied(openActivity(db, other.token, first.items[0].id), 404);
});

test("mark-all uses an allocation boundary, preserving old-timestamp and simultaneous arrivals through exact retries", async () => {
  const f = await fixture();
  const old = await readActivity(db, f.owner.token);
  const input = mutation("read-all", {
    ownerId: f.owner.id,
    boundary: old.boundary
  });
  const [receipt, added] = await Promise.all([
    activityCommand(db, f.owner.token, input),
    commentCommand(
      db,
      f.author.token,
      mutation("create", {
        postId: f.posts[0],
        content: "Arrived after the captured boundary"
      })
    )
  ]);
  await db.socialEvent.updateMany({
    where: { commentId: added.id, kind: "COMMENT_ACTIVITY" },
    data: { createdAt: new Date("2000-01-01T00:00:00Z") }
  });
  const after = await readActivity(db, f.owner.token);
  assert.equal(after.unread, 1);
  assert.equal(after.items[0].count, 3);
  assert.equal(after.items[0].unread, 1);
  assert.equal(after.items[0].createdAt, "2000-01-01T00:00:00.000Z");
  assert.deepEqual(await activityCommand(db, f.owner.token, input), receipt);
  assert.equal((await readActivity(db, f.owner.token)).unread, 1);
  await denied(
    activityCommand(db, f.owner.token, { ...input, boundary: after.boundary }),
    409
  );
  const fresh = mutation("read-all", {
    ownerId: f.owner.id,
    boundary: after.boundary
  });
  await activityCommand(db, f.owner.token, fresh);
  await activityCommand(
    db,
    f.owner.token,
    mutation("read-all", { ownerId: f.owner.id, boundary: old.boundary })
  );
  assert.equal((await readActivity(db, f.owner.token)).unread, 0);
  const prefs = await db.socialPreferences.findUniqueOrThrow({
    where: { ownerId: f.owner.id }
  });
  assert.equal(prefs.version, 1);
  assert.equal(
    await db.socialEvent.count({ where: { recipientId: f.owner.id } }),
    3
  );
  const forged = Buffer.from(
    JSON.stringify({ owner: f.owner.id, through: "9223372036854775807" })
  ).toString("base64url");
  await denied(
    activityCommand(
      db,
      f.owner.token,
      mutation("read-all", { ownerId: f.owner.id, boundary: forged })
    ),
    409
  );
});

test("marking a group leaves other groups and later events unread and rejects changed-account replay", async () => {
  const f = await fixture(2, 2);
  const page = await readActivity(db, f.owner.token);
  const event = await db.socialEvent.findUniqueOrThrow({
    where: { id: page.items[0].id }
  });
  const input = mutation("read", {
    ownerId: f.owner.id,
    id: event.id,
    boundary: page.boundary
  });
  await commentCommand(
    db,
    f.author.token,
    mutation("create", { postId: event.postId, content: "Later group event" })
  );
  const receipt = await activityCommand(db, f.owner.token, input);
  const next = await readActivity(db, f.owner.token);
  assert.equal(next.unread, 3);
  assert.deepEqual(next.items.map((i) => i.unread).sort(), [1, 2]);
  assert.deepEqual(await activityCommand(db, f.owner.token, input), receipt);
  await denied(activityCommand(db, f.author.token, input), 401);
  await denied(
    activityCommand(db, f.owner.token, { ...input, id: page.items[1].id }),
    409
  );
  const switched = request(f.owner.token, "", input);
  switched.headers.set("x-expected-account", f.author.id);
  assert.equal((await handleActivityRequest(db, switched)).status, 401);
  await db.platformSession.deleteMany({ where: { userId: f.owner.id } });
  assert.equal(
    (await handleActivityRequest(db, request(f.owner.token, "", input))).status,
    401
  );
});

test("source removal and current church revocation leave only generic owned history, never a private link or body", async () => {
  const f = await seedPortal(db);
  // This source-access scenario isolates replies; connection outcomes now have
  // their own independent, separately covered Activity category.
  await db.socialPreferences.upsert({
    where: { ownerId: f.memberA.id },
    create: { ownerId: f.memberA.id, mutedNotificationCategories: ["church"] },
    update: { mutedNotificationCategories: ["church"] }
  });
  const post = await db.platformPost.create({
    data: {
      authorId: f.memberA.id,
      audience: "CHURCH",
      audienceChurchId: f.churchA.id,
      content: "Private church activity source"
    }
  });
  const sent = await commentCommand(
    db,
    f.contact.token,
    mutation("create", { postId: post.id, content: "Private church reply" })
  );
  const before = await readActivity(db, f.memberA.token);
  assert.equal(before.items.length, 1);
  assert.equal(before.items[0].available, true);
  const connection = await db.churchConnection.findUniqueOrThrow({
    where: { userId_churchId: { userId: f.memberA.id, churchId: f.churchA.id } }
  });
  await portalCommand(db, f.reviewerA.token, {
    operation: "transition",
    action: "REMOVE",
    churchId: f.churchA.id,
    connectionId: connection.id,
    expectedVersion: connection.version
  });
  const removed = await readActivity(db, f.memberA.token);
  assert.equal(removed.unread, 1);
  assert.equal(removed.items[0].available, false);
  assert.equal(removed.items[0].href, null);
  assert.doesNotMatch(
    JSON.stringify(removed),
    new RegExp(
      `${post.id}|Private church|${f.contact.username}|${f.churchA.id}`
    )
  );
  assert.deepEqual(
    await openActivity(db, f.memberA.token, removed.items[0].id),
    { ownerId: f.memberA.id, available: false, href: null }
  );
  await activityCommand(
    db,
    f.memberA.token,
    mutation("read", {
      ownerId: f.memberA.id,
      id: removed.items[0].id,
      boundary: removed.boundary
    })
  );
  assert.equal((await readActivity(db, f.memberA.token)).unread, 0);
  await commentCommand(
    db,
    f.contact.token,
    mutation("delete", {
      postId: post.id,
      commentId: sent.id,
      expectedVersion: sent.version
    })
  );
  assert.equal((await readActivity(db, f.memberA.token)).items[0].href, null);
});

test("thread and logical author mutes suppress optional activity without deleting source history", async () => {
  const f = await fixture(2, 2);
  await db.conversationPreference.create({
    data: { ownerId: f.owner.id, postId: f.posts[0], mode: "MUTE" }
  });
  assert.equal((await readActivity(db, f.owner.token)).unread, 2);
  await db.socialRelationship.create({
    data: { ownerId: f.owner.id, targetUserId: f.author.id, muted: true }
  });
  assert.equal((await readActivity(db, f.owner.token)).unread, 0);
  assert.equal(
    await db.socialEvent.count({ where: { recipientId: f.owner.id } }),
    4
  );
  assert.equal(
    await db.platformPostComment.count({ where: { postId: { in: f.posts } } }),
    4
  );
});

test("canonical conversation reads and independent message/founder choices govern activity without rewriting messages", async () => {
  const owner = await createPortalActor(db, "activitymessage"),
    sender = await createPortalActor(db, "activitysender");
  const ids = [owner.id, sender.id].sort();
  const c = await db.adultConversation.create({
    data: {
      participantAId: ids[0],
      participantBId: ids[1],
      sendingAllowed: true,
      lastSequence: 3
    }
  });
  const messages = [];
  for (let i = 1; i <= 3; i++)
    messages.push(
      await db.adultMessage.create({
        data: {
          conversationId: c.id,
          senderId: sender.id,
          sequence: i,
          kind: i === 3 ? "FOUNDER_ANNOUNCEMENT" : "TEXT",
          content: "Canonical fixture body"
        }
      })
    );
  await db.socialEvent.createMany({
    data: messages.map((m) => ({
      key: randomUUID(),
      kind: "ADULT_MESSAGE_CREATED",
      actorId: sender.id,
      recipientId: owner.id,
      conversationId: c.id,
      messageId: m.id
    }))
  });
  let page = await readActivity(db, owner.token);
  assert.equal(page.unread, 3);
  assert.equal(page.items.length, 2);
  await db.adultConversationState.create({
    data: { ownerId: owner.id, conversationId: c.id, readThrough: 1 }
  });
  assert.equal((await readActivity(db, owner.token)).unread, 2);
  await db.socialPreferences.create({
    data: {
      ownerId: owner.id,
      messageAlerts: false,
      founderAnnouncements: true
    }
  });
  page = await readActivity(db, owner.token);
  assert.equal(page.unread, 1);
  assert.deepEqual(
    page.items.map((i) => i.category),
    ["founder"]
  );
  await activityCommand(
    db,
    owner.token,
    mutation("read-all", { ownerId: owner.id, boundary: page.boundary })
  );
  assert.equal(
    (
      await db.adultConversationState.findUniqueOrThrow({
        where: {
          conversationId_ownerId: { conversationId: c.id, ownerId: owner.id }
        }
      })
    ).readThrough,
    1
  );
  assert.equal(
    await db.adultMessage.count({ where: { conversationId: c.id } }),
    3
  );
  await db.socialPreferences.update({
    where: { ownerId: owner.id },
    data: { messageAlerts: true }
  });
  assert.equal((await readActivity(db, owner.token)).unread, 0);
  await db.adultConversationState.update({
    where: {
      conversationId_ownerId: { conversationId: c.id, ownerId: owner.id }
    },
    data: { hiddenThrough: 3, readThrough: 3 }
  });
  assert.equal((await readActivity(db, owner.token)).items.length, 0);
});

test("activity names a logical church speaker without exposing its internal publisher", async () => {
  const church = await db.church.create({
    data: {
      slug: "activity-church-" + randomUUID(),
      name: "Fictional Activity Church",
      summary: "Isolated display fixture"
    }
  });
  const f = await fixture(1, 2, church.id);
  const page = await readActivity(db, f.owner.token);
  assert.equal(page.items[0].summary, "Latest from Fictional Activity Church");
  assert.ok(!JSON.stringify(page).includes(f.author.name));
});
