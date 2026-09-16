import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { createPortalActor, assertPortalTestDatabase } from "./seed-portal";
import { seedParticipation } from "./seed-post-participation";
import {
  postCommand,
  publishScheduledPost
} from "../lib/platform/post-commands";
import {
  postWorkspaceCommand,
  readPostWorkspace
} from "../lib/platform/post-workspace";
import {
  readActivity,
  readActivitySummary,
  openActivity
} from "../lib/platform/activity";
import { readPostMentionSuggestions } from "../lib/platform/person-mentions";
import {
  composerPayload,
  emptyComposer
} from "../lib/platform/draft-controller";
import { getPostEditor } from "../lib/platform/post-editor";

const db = new PrismaClient();
before(async () => {
  await assertPortalTestDatabase(db);
  process.env.PUSH_ENABLED = "false";
});
after(() => db.$disconnect());
const input = (operation: string, fields: object) => ({
  operation,
  mutationId: randomUUID(),
  ...fields
});
const publish = (token: string, fields: object) =>
  postCommand(db, token, {
    operation: "create",
    requestKey: randomUUID(),
    content: "Isolated post with a deliberate mention",
    ...fields
  });

test("a selected post mention creates one canonical event, exact source and summary while edits and retries do not repeat it", async () => {
  const author = await createPortalActor(db, "postmentionauthor"),
    reader = await createPortalActor(db, "postmentionreader");
  const command = {
    operation: "create",
    requestKey: randomUUID(),
    content: "Isolated selected post mention",
    mentionIds: [reader.id]
  };
  const post = await postCommand(db, author.token, command);
  assert.deepEqual(await postCommand(db, author.token, command), post);
  const view = await readActivity(db, reader.token);
  assert.equal(view.unread, 1);
  assert.equal(view.items[0].href, `/platform/posts/${post.id}`);
  assert.equal(view.items[0].summary, `${author.name} mentioned you in a post`);
  assert.deepEqual(await readActivitySummary(db, reader.token, reader.id), {
    ownerId: reader.id,
    unread: 1
  });
  const edit = await postCommand(
    db,
    author.token,
    input("edit", {
      postId: post.id,
      expectedVersion: post.version,
      content: "Edited isolated mention",
      mentionIds: []
    })
  );
  assert.equal(
    (await readActivity(db, reader.token)).items[0].available,
    false
  );
  await postCommand(
    db,
    author.token,
    input("edit", {
      postId: post.id,
      expectedVersion: edit.version,
      mentionIds: [reader.id]
    })
  );
  assert.equal(
    await db.socialEvent.count({
      where: { postId: post.id, kind: "POST_MENTION" }
    }),
    1
  );
  assert.deepEqual(
    (await getPostEditor(db, author.token, post.id)).mentionIds,
    [reader.id]
  );
  assert.equal(
    await db.notificationDelivery.count({
      where: { event: { postId: post.id } }
    }),
    0
  );
});

test("mention consent, bilateral blocks, adult eligibility, source revocation and category muting remain authoritative", async () => {
  const a = await createPortalActor(db, "mentionpolicyactor"),
    b = await createPortalActor(db, "mentionpolicyreader");
  for (const mentionIds of [[a.id], [b.id, b.id]])
    await assert.rejects(publish(a.token, { mentionIds }));
  await db.socialPreferences.create({
    data: { ownerId: b.id, mentions: "NOBODY" }
  });
  await assert.rejects(publish(a.token, { mentionIds: [b.id] }));
  assert.equal(
    (await readPostMentionSuggestions(db, a.token, b.username)).items.length,
    0
  );
  await db.socialPreferences.update({
    where: { ownerId: b.id },
    data: { mentions: "FOLLOWED" }
  });
  await assert.rejects(publish(a.token, { mentionIds: [b.id] }));
  await db.platformFollow.create({
    data: { followerId: b.id, followingId: a.id }
  });
  const post = await publish(a.token, { mentionIds: [b.id] });
  const event = (await readActivity(db, b.token)).items[0];
  await db.socialPreferences.update({
    where: { ownerId: b.id },
    data: { mutedNotificationCategories: ["mentions"] }
  });
  assert.equal((await readActivitySummary(db, b.token, b.id)).unread, 0);
  await db.socialPreferences.update({
    where: { ownerId: b.id },
    data: { mutedNotificationCategories: [] }
  });
  await db.socialRelationship.create({
    data: {
      ownerId: b.id,
      targetUserId: a.id,
      blocked: true
    }
  });
  await assert.rejects(publish(a.token, { mentionIds: [b.id] }));
  assert.deepEqual(await openActivity(db, b.token, event.id), {
    ownerId: b.id,
    available: false,
    href: null
  });
  assert.equal((await readActivity(db, b.token)).items[0].summary, null);
  await db.socialRelationship.deleteMany({ where: { ownerId: b.id } });
  await db.platformPost.update({
    where: { id: post.id },
    data: { status: "WITHDRAWN" }
  });
  assert.deepEqual(await openActivity(db, b.token, event.id), {
    ownerId: b.id,
    available: false,
    href: null
  });
  await db.platformUser.update({
    where: { id: b.id },
    data: { adultAcknowledgedAt: null }
  });
  await assert.rejects(publish(a.token, { mentionIds: [b.id] }));
});

test("private drafts retain selected mentions without events and an older client cannot silently drop them", async () => {
  const author = await createPortalActor(db, "mentiondraftauthor"),
    reader = await createPortalActor(db, "mentiondraftreader");
  const id = randomUUID(),
    payload = composerPayload({
      ...emptyComposer(),
      content: "Private work with selected mention",
      mentionIds: [reader.id]
    });
  assert.deepEqual(payload.mentionIds, [reader.id]);
  const saved = await postWorkspaceCommand(
    db,
    author.token,
    input("save-draft", { id, expectedVersion: 0, payload })
  );
  const read = await readPostWorkspace(db, author.token, { view: "draft", id });
  assert.match(JSON.stringify(read), new RegExp(reader.id));
  assert.equal((await readActivity(db, reader.token)).items.length, 0);
  const { mentionIds: ignored, ...oldPayload } = payload;
  void ignored;
  await assert.rejects(
    postWorkspaceCommand(
      db,
      author.token,
      input("save-draft", {
        id,
        expectedVersion: saved.version,
        payload: oldPayload
      })
    ),
    /selected mentions/
  );
  const post = await postWorkspaceCommand(
    db,
    author.token,
    input("publish-draft", { id, expectedVersion: saved.version })
  );
  assert.equal(
    (await readActivity(db, reader.token)).items[0].href,
    `/platform/posts/${post.postId}`
  );
});

test("church-only and scheduled mentions never widen membership and scheduled publication rechecks current consent", async () => {
  const f = await seedParticipation(db);
  await assert.rejects(
    publish(f.ada.token, {
      authorChurchId: f.churchA.id,
      audience: "CHURCH",
      mentionIds: [f.blake.id]
    })
  );
  const schedule = new Date(Date.now() + 3600000);
  const post = await publish(f.ada.token, {
    authorChurchId: f.churchA.id,
    audience: "CHURCH",
    mentionIds: [f.morgan.id, f.lee.id],
    scheduleLocal: schedule.toISOString().slice(0, 16),
    scheduleZone: "UTC"
  });
  assert.equal(
    await db.socialEvent.count({
      where: { postId: post.id, kind: "POST_MENTION" }
    }),
    0
  );
  await db.socialPreferences.upsert({
    where: { ownerId: f.lee.id },
    create: { ownerId: f.lee.id, mentions: "NOBODY" },
    update: { mentions: "NOBODY" }
  });
  await db.platformPost.update({
    where: { id: post.id },
    data: { scheduleAt: new Date(Date.now() - 1000) }
  });
  const result = await publishScheduledPost(
    db,
    post.id,
    post.version,
    new Date()
  );
  assert.equal(result.published, true);
  const events = await db.socialEvent.findMany({
    where: { postId: post.id, kind: "POST_MENTION" }
  });
  assert.deepEqual(
    events.map((e) => e.recipientId),
    [f.morgan.id]
  );
});
