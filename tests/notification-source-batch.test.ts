import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { createPortalActor, assertPortalTestDatabase } from "./seed-portal";
import {
  notificationSource,
  notificationSources
} from "../lib/platform/notification-source";

const db = new PrismaClient({ log: [{ level: "query", emit: "event" }] });
let capture = false;
let queries: string[] = [];
db.$on("query", (event) => {
  if (capture && /^SELECT\b/.test(event.query)) queries.push(event.query);
});
before(() => assertPortalTestDatabase(db));
after(() => db.$disconnect());
async function measured<T>(work: () => Promise<T>) {
  queries = [];
  capture = true;
  try {
    return { value: await work(), queries: queries };
  } finally {
    capture = false;
  }
}

test("one and thirty message sources use the same bounded metadata reads and current source checks", async () => {
  const owner = await createPortalActor(db, "batchread");
  const sender = await createPortalActor(db, "batchsend");
  const ids = [owner.id, sender.id].sort();
  const c = await db.adultConversation.create({
    data: {
      participantAId: ids[0],
      participantBId: ids[1],
      sendingAllowed: true,
      lastSequence: 30
    }
  });
  const messageIds = Array.from({ length: 30 }, () => randomUUID());
  await db.adultMessage.createMany({
    data: messageIds.map((id, i) => ({
      id,
      conversationId: c.id,
      senderId: sender.id,
      sequence: i + 1,
      content: "Canonical private body must not be selected by activity"
    }))
  });
  await db.socialEvent.createMany({
    data: messageIds.map((id) => ({
      key: randomUUID(),
      kind: "ADULT_MESSAGE_CREATED",
      actorId: sender.id,
      recipientId: owner.id,
      conversationId: c.id,
      messageId: id
    }))
  });
  const events = await db.socialEvent.findMany({
    where: { recipientId: owner.id },
    orderBy: { id: "asc" }
  });
  const one = await measured(() =>
    db.$transaction((tx) => notificationSources(tx, events.slice(0, 1), false))
  );
  const page = await measured(() =>
    db.$transaction((tx) => notificationSources(tx, events, false))
  );
  const serial = await measured(() =>
    db.$transaction(async (tx) => {
      const result = new Map();
      for (const e of events)
        result.set(e.id, await notificationSource(tx, e, false));
      return result;
    })
  );
  assert.equal(one.value.size, 1);
  assert.equal(page.value.size, 30);
  assert.deepEqual(page.value, serial.value);
  assert.equal(one.queries.length, page.queries.length);
  assert.ok(page.queries.length < serial.queries.length / 10);
  assert.ok(
    !page.queries.some((q) => /"content"|"purpose"|"passwordHash"/.test(q))
  );
  for (const e of events)
    assert.deepEqual(page.value.get(e.id), {
      category: "messages",
      href: `/platform/messages/${c.id}?message=${e.messageId}`,
      group: c.id
    });
  console.log(
    JSON.stringify({
      messageSourceQueries: {
        one: one.queries.length,
        thirty: page.queries.length,
        serialThirty: serial.queries.length
      }
    })
  );
  await db.adultConversationState.create({
    data: {
      ownerId: owner.id,
      conversationId: c.id,
      readThrough: 10,
      hiddenThrough: 5
    }
  });
  assert.equal(
    (await db.$transaction((tx) => notificationSources(tx, events, true))).size,
    20
  );
  assert.equal(
    (await db.$transaction((tx) => notificationSources(tx, events, false)))
      .size,
    25
  );
  await db.adultConversationState.update({
    where: {
      conversationId_ownerId: { conversationId: c.id, ownerId: owner.id }
    },
    data: { muted: true }
  });
  assert.equal(
    (await db.$transaction((tx) => notificationSources(tx, events, true))).size,
    0
  );
  assert.equal(
    (await db.$transaction((tx) => notificationSources(tx, events, false)))
      .size,
    25
  );
  await db.socialRelationship.create({
    data: { ownerId: sender.id, targetUserId: owner.id, blocked: true }
  });
  assert.equal(
    (await db.$transaction((tx) => notificationSources(tx, events, false)))
      .size,
    0
  );
  const unowned = events.map((e) => ({ ...e, recipientId: sender.id }));
  assert.equal(
    (await db.$transaction((tx) => notificationSources(tx, unowned, false)))
      .size,
    0
  );
  const mixed = await measured(() =>
    db.$transaction((tx) =>
      notificationSources(tx, [...events, unowned[0]], false)
    )
  );
  assert.equal(mixed.value.size, 0);
  assert.equal(mixed.queries.length, 0);
  assert.equal(
    (
      await db.$transaction((tx) =>
        notificationSources(tx, Array(51).fill(events[0]), false)
      )
    ).size,
    0
  );
});

test("thirty comment sources batch existing reader predicates, preserve mute controls and reject mismatched references", async () => {
  const owner = await createPortalActor(db, "batchcommentread");
  const author = await createPortalActor(db, "batchcommentwrite");
  const postIds = Array.from({ length: 30 }, () => randomUUID());
  const commentIds = postIds.map(() => randomUUID());
  await db.platformPost.createMany({
    data: postIds.map((id) => ({
      id,
      authorId: owner.id,
      content: "Private post content must not be selected"
    }))
  });
  await db.platformPostComment.createMany({
    data: commentIds.map((id, i) => ({
      id,
      postId: postIds[i],
      authorId: author.id,
      content: "Private comment content must not be selected"
    }))
  });
  await db.socialEvent.createMany({
    data: commentIds.map((id, i) => ({
      key: randomUUID(),
      kind: "COMMENT_ACTIVITY",
      actorId: author.id,
      recipientId: owner.id,
      postId: postIds[i],
      commentId: id
    }))
  });
  const events = await db.socialEvent.findMany({
    where: { recipientId: owner.id },
    orderBy: { id: "asc" }
  });
  const one = await measured(() =>
    db.$transaction((tx) => notificationSources(tx, events.slice(0, 1), true))
  );
  const page = await measured(() =>
    db.$transaction((tx) => notificationSources(tx, events, true))
  );
  assert.equal(page.value.size, 30);
  assert.equal(one.queries.length, page.queries.length);
  assert.ok(!page.queries.some((q) => /"content"|"passwordHash"/.test(q)));
  console.log(
    JSON.stringify({
      commentSourceQueries: {
        one: one.queries.length,
        thirty: page.queries.length
      }
    })
  );
  for (const e of events)
    assert.deepEqual(page.value.get(e.id), {
      category: "replies",
      href: `/platform/posts/${e.postId}?comment=${e.commentId}`,
      group: e.postId
    });
  const mismatch = {
    ...events[0],
    id: randomUUID(),
    postId: postIds.find((id) => id !== events[0].postId)!
  };
  const current = await db.$transaction((tx) =>
    notificationSources(tx, [events[0], mismatch], false)
  );
  assert.equal(current.size, 1);
  assert.ok(current.has(events[0].id));
  await db.conversationPreference.create({
    data: { ownerId: owner.id, postId: events[0].postId!, mode: "MUTE" }
  });
  assert.equal(
    (await db.$transaction((tx) => notificationSources(tx, events, true))).size,
    29
  );
  assert.equal(
    (await db.$transaction((tx) => notificationSources(tx, events, false)))
      .size,
    30
  );
  // Withdraw through the source status: no activity reference may bypass it.
  await db.platformPost.updateMany({
    where: { id: { in: postIds } },
    data: { status: "WITHDRAWN", withdrawnAt: new Date() }
  });
  assert.equal(
    (await db.$transaction((tx) => notificationSources(tx, events, false)))
      .size,
    0
  );
});
