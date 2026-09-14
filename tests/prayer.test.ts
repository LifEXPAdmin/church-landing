import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import webpush from "web-push";
import { createSessionToken } from "../lib/platform/auth";
import { PrismaClient } from "@prisma/client";
import {
  assertPortalTestDatabase,
  createPortalActor,
  seedPortal,
  type PortalActor
} from "./seed-portal";
import { seedNotificationDevice } from "./seed-notifications";
import { prayerCommand } from "../lib/platform/prayer-commands";
import {
  readPrayerTarget,
  readSavedPrayers,
  readPrayerUpdates
} from "../lib/platform/prayer-reads";
import { PRAYER_GUIDE_VERSION } from "../lib/platform/prayer-types";
import { commentCommand } from "../lib/platform/comment-commands";
import { processCommentFollowerBatch } from "../lib/platform/comment-followers";
import { readActivity, openActivity } from "../lib/platform/activity";
import {
  readNotificationPreferences,
  notificationPreferenceCommand
} from "../lib/platform/notification-preferences";
import {
  deliverNotification,
  openNotification
} from "../lib/platform/notification-outbox";
import { relationshipCommand } from "../lib/platform/relationships";
import { portalCommand } from "../lib/platform/portal";
import { PortalError } from "../lib/platform/portal-policy";

const db = new PrismaClient();
const envKeys = [
  "PUSH_ENABLED",
  "PUSH_VAPID_PUBLIC_KEY",
  "PUSH_VAPID_PRIVATE_KEY",
  "PUSH_VAPID_SUBJECT"
];
const prior = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
before(async () => {
  await assertPortalTestDatabase(db);
  const keys = webpush.generateVAPIDKeys();
  Object.assign(process.env, {
    PUSH_ENABLED: "true",
    PUSH_VAPID_PUBLIC_KEY: keys.publicKey,
    PUSH_VAPID_PRIVATE_KEY: keys.privateKey,
    PUSH_VAPID_SUBJECT: "https://example.test/contact"
  });
});
after(async () => {
  await db.$disconnect();
  for (const key of envKeys)
    if (prior[key] === undefined) delete process.env[key];
    else process.env[key] = prior[key];
});
type Target = { postId: string; commentId?: string | null };
const command = (operation: string, fields: Record<string, unknown> = {}) => ({
  operation,
  mutationId: randomUUID(),
  ...fields
});
const denied = (promise: Promise<unknown>, status: number) =>
  assert.rejects(
    promise,
    (e: unknown) => e instanceof PortalError && e.status === status
  );
const post = (authorId: string, extra = {}) =>
  db.platformPost.create({
    data: {
      authorId,
      content: "Fictional prayer test source",
      publishedAt: new Date(Date.now() - 1000),
      ...extra
    }
  });
async function guide(actor: PortalActor) {
  const old = await db.prayerGuideReceipt.findUnique({
    where: { ownerId: actor.id }
  });
  return prayerCommand(
    db,
    actor.token,
    command("guide", {
      guideVersion: PRAYER_GUIDE_VERSION,
      expectedVersion: old?.version ?? 0
    })
  );
}
async function acknowledge(
  actor: PortalActor,
  target: Target,
  desired = true,
  shareName = false
) {
  const state = await readPrayerTarget(db, actor.token, target);
  return prayerCommand(
    db,
    actor.token,
    command("acknowledge", {
      ...target,
      expectedVersion: state.choice.version,
      desired,
      shareName,
      guideVersion: PRAYER_GUIDE_VERSION
    })
  );
}
async function save(actor: PortalActor, target: Target, updates = false) {
  const state = await readPrayerTarget(db, actor.token, target);
  return prayerCommand(
    db,
    actor.token,
    command("followup", {
      ...target,
      expectedVersion: state.choice.version,
      desired: true,
      updates
    })
  );
}
async function categories(actor: PortalActor, pushCategories: string[]) {
  const old = await readNotificationPreferences(db, actor.token);
  return notificationPreferenceCommand(
    db,
    actor.token,
    command("preferences", {
      ownerId: actor.id,
      expectedVersion: old.preferences.version,
      inApp: old.preferences.inApp,
      pushCategories,
      quietHours: null
    })
  );
}
async function drain(commentId: string) {
  const pages = [];
  for (let i = 0; i < 20; i++) {
    const result = await processCommentFollowerBatch(db, commentId);
    assert.ok(result.processed <= 20);
    pages.push(result);
    if (result.done) return pages;
  }
  throw Error("Prayer continuation did not finish its bounded fixture");
}
const events = (commentId: string, recipientId: string) =>
  db.socialEvent.findMany({
    where: { kind: "COMMENT_ACTIVITY", commentId, recipientId }
  });

test("current guide gates post, comment and reply acknowledgments; exact concurrent set/undo stays one or zero without authority or Like changes", async () => {
  const a = await createPortalActor(db, "prayauthor"),
    b = await createPortalActor(db, "prayreader");
  const p = await post(a.id);
  const root = await commentCommand(
    db,
    a.token,
    command("create", { postId: p.id, content: "Fictional comment" })
  );
  const reply = await commentCommand(
    db,
    a.token,
    command("create", {
      postId: p.id,
      replyToId: root.id,
      content: "Fictional reply"
    })
  );
  const targets = [
    { postId: p.id },
    { postId: p.id, commentId: root.id },
    { postId: p.id, commentId: reply.id }
  ];
  for (const target of targets) await denied(acknowledge(b, target), 409);
  await guide(b);
  for (const target of targets) {
    const input = command("acknowledge", {
      ...target,
      desired: true,
      shareName: false,
      guideVersion: PRAYER_GUIDE_VERSION,
      expectedVersion: 0
    });
    const both = await Promise.all([
      prayerCommand(db, b.token, input),
      prayerCommand(db, b.token, input)
    ]);
    assert.deepEqual(both[0], both[1]);
    const state = await readPrayerTarget(db, a.token, target);
    assert.equal(state.count, 1);
    assert.deepEqual(state.names, []);
    assert.equal(
      (await readPrayerTarget(db, b.token, target)).choice.acknowledged,
      true
    );
    await denied(
      prayerCommand(db, b.token, { ...input, shareName: true }),
      409
    );
    const undo = command("acknowledge", {
      ...target,
      desired: false,
      shareName: false,
      guideVersion: PRAYER_GUIDE_VERSION,
      expectedVersion: 1
    });
    assert.deepEqual(
      await prayerCommand(db, b.token, undo),
      await prayerCommand(db, b.token, undo)
    );
    const removed = await readPrayerTarget(db, b.token, target);
    assert.equal(removed.count, 0);
    assert.equal(removed.choice.acknowledged, false);
  }
  await db.prayerGuideReceipt.update({
    where: { ownerId: b.id },
    data: { guideVersion: "old-guide" }
  });
  await denied(acknowledge(b, targets[0]), 409);
  await guide(b);
  await acknowledge(b, targets[0]);
  assert.equal(await db.platformPostLike.count({ where: { postId: p.id } }), 0);
  assert.equal(
    await db.commentLike.count({ where: { comment: { postId: p.id } } }),
    0
  );
  assert.equal(
    await db.platformOperatorGrant.count({ where: { userId: b.id } }),
    0
  );
});

test("eligibility, closed reactions, same-post targets and deliberate name sharing remain current", async () => {
  const a = await createPortalActor(db, "praysrc"),
    b = await createPortalActor(db, "prayname"),
    c = await createPortalActor(db, "prayview");
  const unverified = await createPortalActor(db, "prayunver", {
    verified: false
  });
  const p = await post(a.id),
    other = await post(a.id);
  const comment = await commentCommand(
    db,
    a.token,
    command("create", { postId: other.id, content: "Other source" })
  );
  await denied(readPrayerTarget(db, null, { postId: p.id }), 401);
  await denied(readPrayerTarget(db, unverified.token, { postId: p.id }), 403);
  await denied(
    readPrayerTarget(db, b.token, { postId: p.id, commentId: comment.id }),
    404
  );
  await guide(b);
  await acknowledge(b, { postId: p.id });
  let state = await readPrayerTarget(db, c.token, { postId: p.id });
  assert.equal(state.count, 1);
  assert.deepEqual(state.names, []);
  await acknowledge(b, { postId: p.id }, true, true);
  state = await readPrayerTarget(db, c.token, { postId: p.id });
  assert.deepEqual(state.names, [{ name: b.name, username: b.username }]);
  await relationshipCommand(
    db,
    b.token,
    command("block", {
      kind: "person",
      targetId: c.id,
      expectedVersion: 0,
      desired: true
    })
  );
  state = await readPrayerTarget(db, c.token, { postId: p.id });
  assert.equal(state.count, 0);
  assert.deepEqual(state.names, []);
  await db.platformPost.update({
    where: { id: p.id },
    data: { discussionClosed: true }
  });
  await guide(c);
  await denied(acknowledge(c, { postId: p.id }), 403);
  await db.prayerGuideReceipt.update({
    where: { ownerId: b.id },
    data: { guideVersion: "superseded" }
  });
  await acknowledge(b, { postId: p.id }, true, false);
  assert.equal(
    (await readPrayerTarget(db, b.token, { postId: p.id })).choice.shareName,
    false
  );
  await acknowledge(b, { postId: p.id }, false);
  assert.equal(
    (await readPrayerTarget(db, b.token, { postId: p.id })).choice.acknowledged,
    false
  );
  await denied(
    prayerCommand(
      db,
      b.token,
      command("guide", {
        ownerId: a.id,
        expectedVersion: 1,
        guideVersion: PRAYER_GUIDE_VERSION
      })
    ),
    400
  );
});

test("private saves paginate for their owner, conceal withdrawn sources and remove independently of acknowledgments", async () => {
  const a = await createPortalActor(db, "praysave"),
    b = await createPortalActor(db, "prayother");
  const p = await post(b.id);
  await guide(a);
  await acknowledge(a, { postId: p.id });
  await save(a, { postId: p.id });
  const own = await readPrayerTarget(db, a.token, { postId: p.id });
  assert.equal(own.choice.saved, true);
  assert.equal(own.choice.updates, false);
  assert.equal(own.choice.acknowledged, true);
  for (let i = 0; i < 25; i++) {
    const source = await post(b.id);
    await db.prayerRecord.create({
      data: {
        ownerId: a.id,
        postId: source.id,
        targetKey: `post:${source.id}`,
        savedAt: new Date(Date.now() + i)
      }
    });
  }
  const first = await readSavedPrayers(db, a.token),
    second = await readSavedPrayers(db, a.token, first.nextCursor);
  assert.equal(first.items.length, 20);
  assert.equal(second.items.length, 6);
  assert.equal(second.nextCursor, null);
  assert.equal(
    new Set([...first.items, ...second.items].map((row) => row.id)).size,
    26
  );
  assert.equal((await readSavedPrayers(db, b.token)).items.length, 0);
  await denied(readSavedPrayers(db, b.token, first.nextCursor), 400);
  await db.platformPost.update({
    where: { id: p.id },
    data: { withdrawnAt: new Date(), status: "WITHDRAWN" }
  });
  const hidden = (
    await readSavedPrayers(db, a.token, first.nextCursor)
  ).items.find((row) => row.postId === p.id)!;
  assert.equal(hidden.available, false);
  assert.equal(hidden.href, null);
  assert.equal(hidden.label, null);
  assert.equal(hidden.latestUpdate, null);
  await prayerCommand(
    db,
    a.token,
    command("followup", {
      postId: p.id,
      expectedVersion: own.choice.version,
      desired: false,
      updates: false
    })
  );
  const record = await db.prayerRecord.findUniqueOrThrow({
    where: { ownerId_targetKey: { ownerId: a.id, targetKey: `post:${p.id}` } }
  });
  assert.equal(record.savedAt, null);
  assert.equal(record.updatesSince, null);
  assert.ok(record.acknowledgedAt);
});

test("author updates are canonical comments with exact retries, independent subscriptions, normal correction/deletion and no automatic acknowledgment", async () => {
  const a = await createPortalActor(db, "prayupsrc"),
    b = await createPortalActor(db, "prayupsub");
  const p = await post(a.id);
  await save(b, { postId: p.id }, true);
  await denied(
    prayerCommand(
      db,
      b.token,
      command("update", {
        postId: p.id,
        kind: "UPDATE",
        content: "Unauthorized update"
      })
    ),
    403
  );
  await denied(
    prayerCommand(
      db,
      a.token,
      command("update", {
        postId: p.id,
        kind: "PRAISE",
        content: "Do not copy this outside its source",
        audience: "PUBLIC"
      })
    ),
    400
  );
  const ordinary = await commentCommand(
    db,
    a.token,
    command("create", { postId: p.id, content: "Ordinary discussion reply" })
  );
  await drain(ordinary.id);
  assert.equal((await events(ordinary.id, b.id)).length, 0);
  const input = command("update", {
    postId: p.id,
    kind: "PRAISE",
    content: "Fictional author-written praise update"
  });
  const update = await prayerCommand(db, a.token, input);
  assert.deepEqual(await prayerCommand(db, a.token, input), update);
  await denied(
    prayerCommand(db, a.token, { ...input, content: "Changed retry" }),
    409
  );
  assert.equal(
    await db.prayerUpdate.count({ where: { commentId: update.id } }),
    1
  );
  assert.equal(
    await db.platformPostComment.count({ where: { id: update.id } }),
    1
  );
  const pages = await drain(update.id);
  assert.deepEqual(
    pages.map((row) => row.processed),
    [0, 1]
  );
  const [event] = await events(update.id, b.id);
  assert.ok(event);
  assert.equal(
    (await readActivity(db, b.token)).items.some((row) =>
      row.href?.includes(update.id)
    ),
    true
  );
  assert.equal(
    (await openActivity(db, b.token, event.id)).href,
    `/platform/posts/${p.id}?comment=${update.id}`
  );
  assert.equal(
    await db.notificationDelivery.count({
      where: { event: { commentId: update.id } }
    }),
    0
  );
  assert.equal(
    (await readPrayerTarget(db, b.token, { postId: p.id })).choice.acknowledged,
    false
  );
  assert.equal(
    (await readSavedPrayers(db, b.token)).items[0].latestUpdate?.kind,
    "PRAISE"
  );
  await commentCommand(
    db,
    a.token,
    command("edit", {
      postId: p.id,
      commentId: update.id,
      expectedVersion: 1,
      content: "Corrected author update"
    })
  );
  const corrected = await readPrayerUpdates(db, b.token, { postId: p.id });
  assert.equal(corrected.items[0].content, "Corrected author update");
  assert.equal(corrected.items[0].edited, true);
  assert.equal((await events(update.id, b.id)).length, 1);
  await commentCommand(
    db,
    a.token,
    command("delete", {
      postId: p.id,
      commentId: update.id,
      expectedVersion: 2
    })
  );
  assert.equal(
    (await readPrayerUpdates(db, b.token, { postId: p.id })).items.length,
    0
  );
  assert.equal((await openActivity(db, b.token, event.id)).available, false);
});

test("prayer phone consent and existing devices are independent; overlapping conversation subscriptions deduplicate", async () => {
  const a = await createPortalActor(db, "praypush"),
    b = await createPortalActor(db, "prayphone");
  const p = await post(a.id);
  await seedNotificationDevice(db, b);
  await categories(b, ["prayer"]);
  await save(b, { postId: p.id }, true);
  await commentCommand(
    db,
    b.token,
    command("conversation", {
      postId: p.id,
      mode: "FOLLOW",
      expectedVersion: 0
    })
  );
  const update = await prayerCommand(
    db,
    a.token,
    command("update", {
      postId: p.id,
      kind: "UPDATE",
      content: "Fictional prayer-only source text"
    })
  );
  await drain(update.id);
  await drain(update.id);
  assert.equal((await events(update.id, b.id)).length, 1);
  const rows = await db.notificationDelivery.findMany({
    where: { event: { commentId: update.id }, ownerId: b.id }
  });
  assert.equal(rows.length, 1);
  const payloads: object[] = [];
  assert.deepEqual(
    await deliverNotification(db, rows[0].id, async (_, payload) => {
      payloads.push(payload);
      return 201;
    }),
    { done: true, outcome: "accepted" }
  );
  assert.deepEqual(Object.keys(payloads[0]).sort(), ["deliveryId", "tag"]);
  assert.equal(
    JSON.stringify(payloads).includes("prayer-only source text"),
    false
  );
  assert.equal(
    (await openNotification(db, b.token, rows[0].id)).href,
    `/platform/posts/${p.id}?comment=${update.id}`
  );
  const pending = await prayerCommand(
    db,
    a.token,
    command("update", {
      postId: p.id,
      kind: "RESOLVED",
      content: "Fictional follow-up complete"
    })
  );
  await drain(pending.id);
  const delivery = await db.notificationDelivery.findFirstOrThrow({
    where: { event: { commentId: pending.id }, ownerId: b.id }
  });
  await commentCommand(
    db,
    b.token,
    command("conversation", { postId: p.id, mode: "MUTE", expectedVersion: 1 })
  );
  assert.deepEqual(
    await deliverNotification(db, delivery.id, async () => {
      throw Error("Muted prayer reached provider");
    }),
    { done: true, outcome: "cancelled" }
  );
});

test("later subscriptions, phone choices and devices never backfill an earlier prayer update", async () => {
  const a = await createPortalActor(db, "praylate"),
    b = await createPortalActor(db, "praylater"),
    c = await createPortalActor(db, "praydev");
  const p = await post(a.id);
  await save(b, { postId: p.id }, true);
  await save(c, { postId: p.id }, true);
  const update = await prayerCommand(
    db,
    a.token,
    command("update", {
      postId: p.id,
      kind: "UPDATE",
      content: "Earlier fictional update"
    })
  );
  const state = await readPrayerTarget(db, b.token, { postId: p.id });
  await prayerCommand(
    db,
    b.token,
    command("followup", {
      postId: p.id,
      expectedVersion: state.choice.version,
      desired: true,
      updates: false
    })
  );
  await save(b, { postId: p.id }, true);
  await categories(b, ["prayer"]);
  await seedNotificationDevice(db, b);
  await categories(c, ["prayer"]);
  await seedNotificationDevice(db, c);
  await drain(update.id);
  assert.equal((await events(update.id, b.id)).length, 0);
  assert.equal((await events(update.id, c.id)).length, 1);
  assert.equal(
    await db.notificationDelivery.count({
      where: { event: { commentId: update.id } }
    }),
    0
  );
});

test("church revocation hides prayer names, saved source, updates and pending Activity or phone delivery", async () => {
  const f = await seedPortal(db);
  const p = await post(f.contact.id, {
    audience: "CHURCH",
    audienceChurchId: f.churchA.id
  });
  await guide(f.memberA);
  await acknowledge(f.memberA, { postId: p.id }, true, true);
  await save(f.memberA, { postId: p.id }, true);
  await seedNotificationDevice(db, f.memberA);
  await categories(f.memberA, ["prayer"]);
  assert.equal(
    (await readPrayerTarget(db, f.contact.token, { postId: p.id })).names
      .length,
    1
  );
  const queued = await prayerCommand(
    db,
    f.contact.token,
    command("update", {
      postId: p.id,
      kind: "UPDATE",
      content: "Fictional private church update"
    })
  );
  await drain(queued.id);
  const delivery = await db.notificationDelivery.findFirstOrThrow({
    where: { event: { commentId: queued.id }, ownerId: f.memberA.id }
  });
  const pending = await prayerCommand(
    db,
    f.contact.token,
    command("update", {
      postId: p.id,
      kind: "PRAISE",
      content: "Fictional private church praise"
    })
  );
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
  await denied(readPrayerTarget(db, f.memberA.token, { postId: p.id }), 404);
  assert.deepEqual(
    (await readPrayerTarget(db, f.contact.token, { postId: p.id })).names,
    []
  );
  const saved = (await readSavedPrayers(db, f.memberA.token)).items[0];
  assert.equal(saved.available, false);
  assert.equal(saved.label, null);
  assert.equal(saved.latestUpdate, null);
  await drain(pending.id);
  assert.equal((await events(pending.id, f.memberA.id)).length, 0);
  assert.deepEqual(
    await deliverNotification(db, delivery.id, async () => {
      throw Error("Revoked member reached prayer provider");
    }),
    { done: true, outcome: "cancelled" }
  );
  await denied(openNotification(db, f.memberA.token, delivery.id), 404);
});

test("comment and nested-reply authors publish scoped updates; racing bounded subscriber pages deduplicate overlaps", async () => {
  const a = await createPortalActor(db, "praypages"),
    b = await createPortalActor(db, "prayroot");
  const p = await post(a.id);
  const root = await commentCommand(
    db,
    b.token,
    command("create", { postId: p.id, content: "Request in comment" })
  );
  const reply = await commentCommand(
    db,
    b.token,
    command("create", {
      postId: p.id,
      replyToId: root.id,
      content: "Request in reply"
    })
  );
  const actors = [];
  for (let i = 0; i < 23; i++)
    actors.push(await createPortalActor(db, "praypage"));
  const at = new Date(Date.now() - 5000);
  await db.prayerRecord.createMany({
    data: actors.map((actor) => ({
      ownerId: actor.id,
      postId: p.id,
      commentId: reply.id,
      targetKey: `comment:${reply.id}`,
      savedAt: at,
      updatesSince: at
    }))
  });
  await db.conversationPreference.createMany({
    data: actors.map((actor) => ({
      ownerId: actor.id,
      postId: p.id,
      mode: "FOLLOW",
      followedAt: at
    }))
  });
  await denied(
    prayerCommand(
      db,
      a.token,
      command("update", {
        postId: p.id,
        commentId: reply.id,
        kind: "PRAISE",
        content: "Wrong author"
      })
    ),
    403
  );
  const update = await prayerCommand(
    db,
    b.token,
    command("update", {
      postId: p.id,
      commentId: reply.id,
      kind: "PRAISE",
      content: "Reply author praise update"
    })
  );
  const racing = await Promise.all([
    processCommentFollowerBatch(db, update.id),
    processCommentFollowerBatch(db, update.id),
    processCommentFollowerBatch(db, update.id)
  ]);
  assert.ok(racing.every((row) => row.processed <= 20));
  await drain(update.id);
  for (const actor of actors)
    assert.equal((await events(update.id, actor.id)).length, 1);
  assert.equal(
    await db.socialEvent.count({
      where: {
        commentId: update.id,
        recipientId: { in: actors.map((actor) => actor.id) }
      }
    }),
    23
  );
  const persisted = await db.platformPostComment.findUniqueOrThrow({
    where: { id: update.id }
  });
  assert.equal(persisted.parentId, reply.id);
  assert.equal(persisted.rootId, root.id);
  const own = await readPrayerUpdates(db, b.token, {
    postId: p.id,
    commentId: reply.id
  });
  assert.equal(own.items[0].kind, "PRAISE");
  assert.deepEqual(
    (await readPrayerUpdates(db, b.token, { postId: p.id, commentId: root.id }))
      .items,
    []
  );
  await denied(
    readPrayerTarget(db, a.token, {
      postId: (await post(a.id)).id,
      commentId: update.id
    }),
    404
  );
  assert.equal(
    await db.notificationDelivery.count({
      where: { event: { commentId: update.id } }
    }),
    0
  );
});

test("event audience changes remove ineligible named participants even when its discussion row stays public", async () => {
  const f = await seedPortal(db);
  const outsider = await createPortalActor(db, "prayevent");
  const calendar = await db.platformCalendar.create({
    data: {
      churchId: f.churchA.id,
      creatorId: f.reviewerA.id,
      requestKey: randomUUID(),
      name: "Fictional prayer calendar",
      timeZone: "UTC"
    }
  });
  const event = await db.calendarEvent.create({
    data: {
      calendarId: calendar.id,
      requestKey: randomUUID(),
      title: "Fictional prayer event",
      visibility: "PUBLIC",
      timeZone: "UTC",
      startLocal: "2027-01-01T12:00",
      endLocal: "2027-01-01T13:00"
    }
  });
  const occurrence = await db.calendarOccurrence.create({
    data: {
      eventId: event.id,
      ordinal: 0,
      title: event.title,
      allDay: false,
      timeZone: "UTC",
      startLocal: event.startLocal,
      endLocal: event.endLocal,
      startAt: new Date("2027-01-01T12:00:00Z"),
      endAt: new Date("2027-01-01T13:00:00Z")
    }
  });
  const p = await post(f.reviewerA.id, {
    authorChurchId: f.churchA.id,
    audienceChurchId: f.churchA.id,
    eventOccurrenceId: occurrence.id
  });
  await guide(outsider);
  await acknowledge(outsider, { postId: p.id }, true, true);
  await guide(f.memberA);
  await acknowledge(f.memberA, { postId: p.id }, true, true);
  assert.equal(
    (await readPrayerTarget(db, f.memberA.token, { postId: p.id })).count,
    2
  );
  await db.calendarEvent.update({
    where: { id: event.id },
    data: { visibility: "CHURCH" }
  });
  const visible = await readPrayerTarget(db, f.memberA.token, { postId: p.id });
  assert.equal(visible.count, 1);
  assert.deepEqual(
    visible.names.map((person) => person.username),
    [f.memberA.username]
  );
  await denied(readPrayerTarget(db, outsider.token, { postId: p.id }), 404);
});

test("account export includes only the owner's prayer records and labels; erasure removes guide, names, saves and authored update metadata", async () => {
  const { prepareAccountExport, downloadAccountExport } =
    await import("../lib/platform/account-export");
  const { requestPermanentAccountDeletion } =
    await import("../lib/platform/account-deletion");
  const { eraseRequestedAccountData } =
    await import("../lib/platform/account-erasure");
  const a = await createPortalActor(db, "prayerase"),
    b = await createPortalActor(db, "praykeep");
  const p = await post(a.id),
    other = await post(b.id, {
      content: "Private foreign source body excluded from export"
    });
  for (const actor of [a, b]) {
    await guide(actor);
    await acknowledge(actor, { postId: other.id }, true, true);
    await save(actor, { postId: other.id }, true);
  }
  const update = await prayerCommand(
    db,
    a.token,
    command("update", {
      postId: p.id,
      kind: "RESOLVED",
      content: "Owned author follow-up"
    })
  );
  const secret = process.env.AUTH_RATE_LIMIT_SECRET!;
  const proof = await prepareAccountExport(db, a.token, a.password, secret);
  const exported = await downloadAccountExport(
    db,
    a.token,
    proof.authorization,
    secret
  );
  const data = JSON.parse(exported);
  assert.equal(data.prayerGuide.length, 1);
  assert.equal(data.prayerChoices.length, 1);
  assert.equal(data.prayerUpdates.length, 1);
  assert.equal(data.prayerChoices[0].shareName, true);
  assert.equal(data.prayerChoices[0].postId, other.id);
  assert.equal(data.prayerUpdates[0].commentId, update.id);
  assert.equal(data.prayerUpdates[0].kind, "RESOLVED");
  assert.equal(exported.includes(other.content), false);
  const journal = { async recordAccount() {}, async completeAccount() {} };
  await requestPermanentAccountDeletion(
    db,
    a.token,
    a.password,
    true,
    createSessionToken(),
    journal
  );
  const deletion = await db.accountDeletion.findUniqueOrThrow({
    where: { userId: a.id }
  });
  await eraseRequestedAccountData(db, deletion.id, journal);
  assert.equal(
    await db.prayerGuideReceipt.count({ where: { ownerId: a.id } }),
    0
  );
  assert.equal(await db.prayerRecord.count({ where: { ownerId: a.id } }), 0);
  assert.equal(
    await db.prayerUpdate.count({ where: { commentId: update.id } }),
    0
  );
  assert.equal(await db.prayerRecord.count({ where: { ownerId: b.id } }), 1);
  const remaining = await readPrayerTarget(db, b.token, { postId: other.id });
  assert.equal(remaining.count, 1);
  assert.deepEqual(
    remaining.names.map((person) => person.username),
    [b.username]
  );
});

test("prayer account entry preserves the private list destination while dropping another account's pagination and arbitrary input", async () => {
  const { safeAccountReturn, accountEntryHref } =
    await import("../lib/platform/account-entry");
  assert.equal(
    safeAccountReturn(
      "/platform/prayers?after=private-owner-cursor&token=secret&q=private"
    ),
    "/platform/prayers"
  );
  assert.equal(
    safeAccountReturn("/platform/prayers/?cursor=secret"),
    "/platform/prayers"
  );
  assert.equal(
    safeAccountReturn("/platform/prayers/unregistered"),
    "/platform"
  );
  assert.equal(
    new URL(
      accountEntryHref("login", "/platform/prayers"),
      "https://example.test"
    ).searchParams.get("next"),
    "/platform/prayers"
  );
});
