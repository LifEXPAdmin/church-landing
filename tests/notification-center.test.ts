import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { assertPortalTestDatabase, createPortalActor } from "./seed-portal";
import {
  readActivity,
  readActivitySummary,
  activityCommand
} from "../lib/platform/activity";
import { handleActivityRequest } from "../lib/platform/activity-boundary";
import { commentCommand } from "../lib/platform/comment-commands";
import { notificationSources } from "../lib/platform/notification-source";
import { SESSION_COOKIE } from "../lib/platform/account-boundary";
import { accountConfig } from "../lib/platform/account-config";

const db = new PrismaClient();
const priorPush = process.env.PUSH_ENABLED;
before(async () => {
  await assertPortalTestDatabase(db);
  process.env.PUSH_ENABLED = "false";
});
after(async () => {
  await db.$disconnect();
  if (priorPush === undefined) delete process.env.PUSH_ENABLED;
  else process.env.PUSH_ENABLED = priorPush;
});
const change = (operation: string, fields: Record<string, unknown>) => ({
  operation,
  mutationId: randomUUID(),
  ...fields
});
async function fixture() {
  const owner = await createPortalActor(db, "centerviewer");
  const author = await createPortalActor(db, "centerauthor");
  const post = await db.platformPost.create({
    data: { authorId: owner.id, content: "Isolated notification center source" }
  });
  const reply = () =>
    commentCommand(
      db,
      author.token,
      change("create", {
        postId: post.id,
        content: "Isolated canonical reply"
      })
    );
  await reply();
  return { owner, author, post, reply };
}

test("manual unread survives a global read boundary, filters correctly and exact retries do not undo later read choices", async () => {
  const f = await fixture();
  const first = await readActivity(db, f.owner.token);
  await activityCommand(
    db,
    f.owner.token,
    change("read-all", {
      ownerId: f.owner.id,
      boundary: first.boundary
    })
  );
  const prefs = await db.socialPreferences.findUniqueOrThrow({
    where: { ownerId: f.owner.id }
  });
  assert.equal(
    (await readActivity(db, f.owner.token, { filter: "unread" })).items.length,
    0
  );
  const input = change("unread", {
    ownerId: f.owner.id,
    boundary: first.boundary,
    id: first.items[0].id
  });
  const receipt = await activityCommand(db, f.owner.token, input);
  const unread = await readActivity(db, f.owner.token, {
    filter: "unread",
    category: "comments"
  });
  assert.equal(unread.unread, 1);
  assert.equal(unread.items.length, 1);
  assert.equal(
    (
      await readActivity(db, f.owner.token, {
        filter: "unread",
        category: "messages"
      })
    ).items.length,
    0
  );
  assert.equal(
    (
      await db.socialPreferences.findUniqueOrThrow({
        where: { ownerId: f.owner.id }
      })
    ).activityReadThrough,
    prefs.activityReadThrough
  );
  assert.deepEqual(await readActivitySummary(db, f.owner.token, f.owner.id), {
    ownerId: f.owner.id,
    unread: 1
  });
  await activityCommand(
    db,
    f.owner.token,
    change("read", {
      ownerId: f.owner.id,
      boundary: unread.boundary,
      id: unread.items[0].id
    })
  );
  assert.deepEqual(await activityCommand(db, f.owner.token, input), receipt);
  assert.equal(
    (await readActivitySummary(db, f.owner.token, f.owner.id)).unread,
    0
  );
});

test("mark-all clears personal reminders only through the captured allocation boundary and leaves later arrivals unread", async () => {
  const f = await fixture();
  const first = await readActivity(db, f.owner.token);
  await activityCommand(
    db,
    f.owner.token,
    change("read", {
      ownerId: f.owner.id,
      boundary: first.boundary,
      id: first.items[0].id
    })
  );
  await activityCommand(
    db,
    f.owner.token,
    change("unread", {
      ownerId: f.owner.id,
      boundary: first.boundary,
      id: first.items[0].id
    })
  );
  const later = await f.reply();
  await activityCommand(
    db,
    f.owner.token,
    change("read-all", { ownerId: f.owner.id, boundary: first.boundary })
  );
  const page = await readActivity(db, f.owner.token, { filter: "unread" });
  assert.equal(page.items.length, 1);
  assert.equal(page.items[0].count, 2);
  assert.equal(page.items[0].unread, 1);
  assert.equal(page.unread, 1);
  assert.equal(
    (
      await db.socialEvent.findUniqueOrThrow({
        where: { id: first.items[0].id }
      })
    ).activityMarkedUnreadAt,
    null
  );
  assert.ok(
    await db.socialEvent.findFirst({
      where: { commentId: later.id, activityReadAt: null }
    })
  );
});

test("notification reminders never change canonical message reads or revive a suppressed outbound event", async () => {
  const owner = await createPortalActor(db, "centermessage");
  const author = await createPortalActor(db, "centermessagesender");
  const ids = [owner.id, author.id].sort();
  const conversation = await db.adultConversation.create({
    data: {
      participantAId: ids[0],
      participantBId: ids[1],
      sendingAllowed: true,
      lastSequence: 1
    }
  });
  const message = await db.adultMessage.create({
    data: {
      conversationId: conversation.id,
      senderId: author.id,
      sequence: 1,
      content: "Private fixture message"
    }
  });
  const event = await db.socialEvent.create({
    data: {
      key: randomUUID(),
      kind: "ADULT_MESSAGE_CREATED",
      actorId: author.id,
      recipientId: owner.id,
      conversationId: conversation.id,
      messageId: message.id
    }
  });
  await db.adultConversationState.create({
    data: { ownerId: owner.id, conversationId: conversation.id, readThrough: 0 }
  });
  const page = await readActivity(db, owner.token);
  await activityCommand(
    db,
    owner.token,
    change("read", { ownerId: owner.id, boundary: page.boundary, id: event.id })
  );
  const read = await db.socialEvent.findUniqueOrThrow({
    where: { id: event.id }
  });
  await activityCommand(
    db,
    owner.token,
    change("unread", {
      ownerId: owner.id,
      boundary: page.boundary,
      id: event.id
    })
  );
  const unread = await db.socialEvent.findUniqueOrThrow({
    where: { id: event.id }
  });
  assert.deepEqual(unread.activityReadAt, read.activityReadAt);
  assert.equal(
    (
      await db.adultConversationState.findUniqueOrThrow({
        where: {
          conversationId_ownerId: {
            ownerId: owner.id,
            conversationId: conversation.id
          }
        }
      })
    ).readThrough,
    0
  );
  assert.equal(
    (await db.$transaction((tx) => notificationSources(tx, [unread], true)))
      .size,
    0
  );
  await db.adultConversationState.update({
    where: {
      conversationId_ownerId: {
        ownerId: owner.id,
        conversationId: conversation.id
      }
    },
    data: { readThrough: 1 }
  });
  assert.equal(
    (await readActivitySummary(db, owner.token, owner.id)).unread,
    1
  );
  await db.socialPreferences.create({
    data: { ownerId: owner.id, messageAlerts: false }
  });
  assert.equal(
    (await readActivitySummary(db, owner.token, owner.id)).unread,
    0
  );
  assert.equal(
    await db.notificationDelivery.count({ where: { eventId: event.id } }),
    0
  );
});

test("scalar summary is account-bound, private and rejects filter ambiguity or foreign read changes", async () => {
  const f = await fixture();
  const request = (query: string, expected: string | null = f.owner.id) =>
    new Request(accountConfig().origin + "/api/platform/activity" + query, {
      headers: {
        cookie: `${SESSION_COOKIE}=${f.owner.token}`,
        ...(expected ? { "x-expected-account": expected } : {})
      }
    });
  const response = await handleActivityRequest(db, request("?view=summary"));
  assert.equal(response.status, 200);
  assert.match(response.headers.get("cache-control")!, /no-store/);
  assert.deepEqual(await response.json(), { ownerId: f.owner.id, unread: 1 });
  for (const expected of [null, f.author.id])
    assert.equal(
      (await handleActivityRequest(db, request("?view=summary", expected)))
        .status,
      401
    );
  for (const query of [
    "?view=summary&id=x",
    "?view=summary&filter=unread",
    "?view=open&filter=unread&id=x",
    "?filter=bad",
    "?filter=all&filter=unread"
  ])
    assert.equal(
      (await handleActivityRequest(db, request(query))).status,
      400,
      query
    );
  const page = await readActivity(db, f.owner.token);
  await assert.rejects(
    activityCommand(
      db,
      f.author.token,
      change("unread", {
        ownerId: f.owner.id,
        boundary: page.boundary,
        id: page.items[0].id
      })
    ),
    { status: 401 }
  );
});
