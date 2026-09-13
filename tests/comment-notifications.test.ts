import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import webpush from "web-push";
import { PrismaClient } from "@prisma/client";
import {
  createPortalActor,
  assertPortalTestDatabase,
  seedPortal
} from "./seed-portal";
import { seedNotificationDevice } from "./seed-notifications";
import { commentCommand } from "../lib/platform/comment-commands";
import { relationshipCommand } from "../lib/platform/relationships";
import {
  notificationPreferenceCommand,
  readNotificationPreferences
} from "../lib/platform/notification-preferences";
import {
  deliverNotification,
  openNotification
} from "../lib/platform/notification-outbox";
import { dispatchNotifications } from "../lib/platform/notification-queue";
import { portalCommand } from "../lib/platform/portal";
import { PortalError } from "../lib/platform/portal-policy";
const db = new PrismaClient();
const envKeys = [
  "PUSH_ENABLED",
  "PUSH_VAPID_PUBLIC_KEY",
  "PUSH_VAPID_PRIVATE_KEY",
  "PUSH_VAPID_SUBJECT"
];
const previous = Object.fromEntries(envKeys.map((k) => [k, process.env[k]]));
const command = (
  operation: string,
  fields: Record<string, unknown>
): Record<string, unknown> => ({
  operation,
  mutationId: randomUUID(),
  ...fields
});
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
    if (previous[key] === undefined) delete process.env[key];
    else process.env[key] = previous[key];
});
async function preferences(
  actor: { id: string; token: string },
  pushCategories: string[],
  quietHours: unknown = null
) {
  const view = await readNotificationPreferences(db, actor.token);
  return notificationPreferenceCommand(
    db,
    actor.token,
    command("preferences", {
      ownerId: actor.id,
      expectedVersion: view.preferences.version,
      inApp: view.preferences.inApp,
      pushCategories,
      quietHours
    })
  );
}
async function fixture(categories = ["replies", "mentions"]) {
  const a = await createPortalActor(db, "commentpush"),
    b = await createPortalActor(db, "commentread");
  await seedNotificationDevice(db, b);
  await preferences(b, categories);
  const post = await db.platformPost.create({
    data: { authorId: b.id, content: "Fictional source post" }
  });
  return { a, b, post };
}
const deliveries = (commentId: string) =>
  db.notificationDelivery.findMany({
    where: { event: { commentId } },
    include: { event: true }
  });
const denied = (promise: Promise<unknown>) =>
  assert.rejects(
    promise,
    (error: unknown) => error instanceof PortalError && error.status === 404
  );
const sendComment = (f: Awaited<ReturnType<typeof fixture>>, extra = {}) =>
  commentCommand(
    db,
    f.a.token,
    command("create", {
      postId: f.post.id,
      content: "Private fixture reply",
      ...extra
    })
  );

test("one reply-plus-mention intent survives exact retries and conflicts without copying private text", async () => {
  const f = await fixture();
  const input = command("create", {
    postId: f.post.id,
    content: "Private comment body",
    mentionIds: [f.b.id]
  });
  const sent = await commentCommand(db, f.a.token, input);
  assert.deepEqual(await commentCommand(db, f.a.token, input), sent);
  await assert.rejects(
    commentCommand(db, f.a.token, { ...input, content: "Different retry" }),
    (e: unknown) => e instanceof PortalError && e.status === 409
  );
  const rows = await deliveries(sent.id);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].event.kind, "COMMENT_ACTIVITY");
  assert.equal(rows[0].ownerId, f.b.id);
  assert.equal(JSON.stringify(rows).includes(String(input.content)), false);
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
    (await openNotification(db, f.b.token, rows[0].id)).href,
    `/platform/posts/${f.post.id}?comment=${sent.id}`
  );
  await denied(openNotification(db, f.a.token, rows[0].id));
  await seedNotificationDevice(db, f.b);
  await commentCommand(
    db,
    f.a.token,
    command("edit", {
      postId: f.post.id,
      commentId: sent.id,
      expectedVersion: sent.version,
      content: "Edited private body",
      mentionIds: [f.b.id]
    })
  );
  assert.equal(
    (await deliveries(sent.id)).length,
    1,
    "Editing or a new device cannot backfill an old alert"
  );
});

test("editing a legacy mention never backfills a notification; a newly selected recipient is a new event", async () => {
  const f = await fixture(),
    newcomer = await createPortalActor(db, "newmention");
  await seedNotificationDevice(db, newcomer);
  await preferences(newcomer, ["mentions"]);
  const legacy = await db.platformPostComment.create({
    data: {
      authorId: f.a.id,
      postId: f.post.id,
      content: "Legacy comment",
      mentions: { create: { recipientId: f.b.id } }
    }
  });
  await db.socialEvent.createMany({
    data: [
      {
        key: `comment:${legacy.id}`,
        kind: "COMMENT_CREATED",
        actorId: f.a.id,
        postId: f.post.id,
        commentId: legacy.id
      },
      {
        key: `mention:${legacy.id}:${f.b.id}`,
        kind: "COMMENT_MENTIONED",
        actorId: f.a.id,
        postId: f.post.id,
        commentId: legacy.id,
        recipientId: f.b.id
      }
    ]
  });
  await commentCommand(
    db,
    f.a.token,
    command("edit", {
      postId: f.post.id,
      commentId: legacy.id,
      expectedVersion: legacy.version,
      content: "Changed text and one new mention",
      mentionIds: [f.b.id, newcomer.id]
    })
  );
  assert.deepEqual(
    (await deliveries(legacy.id)).map((r) => r.ownerId),
    [newcomer.id]
  );
});

test("direct replies target personal post and parent owners once; church publishers and ordinary followers are not implicit recipients", async () => {
  const f = await fixture(["replies"]),
    c = await createPortalActor(db, "parentread"),
    follower = await createPortalActor(db, "followread");
  for (const actor of [c, follower]) {
    await seedNotificationDevice(db, actor);
    await preferences(actor, ["replies"]);
  }
  await relationshipCommand(
    db,
    follower.token,
    command("follow", {
      kind: "person",
      targetId: f.a.id,
      expectedVersion: 0,
      desired: true
    })
  );
  const parent = await commentCommand(
    db,
    c.token,
    command("create", {
      postId: f.post.id,
      content: "Fictional parent comment"
    })
  );
  const sent = await sendComment(f, { replyToId: parent.id });
  assert.deepEqual(
    (await deliveries(sent.id)).map((row) => row.ownerId).sort(),
    [f.b.id, c.id].sort()
  );
  const same = await commentCommand(
    db,
    f.b.token,
    command("create", { postId: f.post.id, content: "Self comment" })
  );
  assert.equal((await deliveries(same.id)).length, 0);
  const church = await db.church.create({
    data: {
      name: "Fictional notification church",
      city: "Fiction",
      region: "TX",
      slug: "notification-fixture-" + randomUUID(),
      summary: "Isolated fictional church"
    }
  });
  const churchPost = await db.platformPost.create({
    data: {
      authorId: f.b.id,
      authorChurchId: church.id,
      audienceChurchId: church.id,
      content: "A church speaks independently"
    }
  });
  const churchReply = await commentCommand(
    db,
    f.a.token,
    command("create", { postId: churchPost.id, content: "Reply to the church" })
  );
  assert.equal((await deliveries(churchReply.id)).length, 0);
});

test("reply and mention opt-ins are independent, legacy preference bodies preserve ordinary choices, and no old comments are backfilled", async () => {
  const f = await fixture([]),
    old = await sendComment(f);
  assert.equal((await deliveries(old.id)).length, 0);
  await preferences(f.b, ["mentions"]);
  assert.equal((await deliveries((await sendComment(f)).id)).length, 0);
  assert.equal(
    (await deliveries((await sendComment(f, { mentionIds: [f.b.id] })).id))
      .length,
    1
  );
  await preferences(f.b, ["replies"]);
  assert.equal((await deliveries((await sendComment(f)).id)).length, 1);
  assert.equal((await deliveries(old.id)).length, 0);
  const view = await readNotificationPreferences(db, f.b.token);
  assert.deepEqual(view.preferences.inApp, {
    messages: true,
    requests: true,
    reports: true,
    founder: true
  });
  assert.equal(
    (
      await db.socialPreferences.findUniqueOrThrow({
        where: { ownerId: f.b.id }
      })
    ).contactRequests,
    "NOBODY"
  );
});

test("mute, snooze, preference removal, blocks, deleted comments and withdrawn posts stop queued replies at delivery", async () => {
  for (const change of [
    "thread",
    "mute",
    "snooze",
    "preference",
    "block",
    "delete",
    "withdraw",
    "deactivate"
  ]) {
    const f = await fixture(),
      sent = await sendComment(f),
      [row] = await deliveries(sent.id);
    assert.ok(row);
    if (change === "thread")
      await commentCommand(
        db,
        f.b.token,
        command("conversation", {
          postId: f.post.id,
          expectedVersion: 0,
          mode: "MUTE"
        })
      );
    if (["mute", "snooze", "block"].includes(change))
      await relationshipCommand(
        db,
        f.b.token,
        command(change, {
          kind: "person",
          targetId: f.a.id,
          expectedVersion: 0,
          ...(change === "snooze" ? { days: 1 } : { desired: true })
        })
      );
    if (change === "preference") await preferences(f.b, []);
    if (change === "delete")
      await commentCommand(
        db,
        f.a.token,
        command("delete", {
          postId: f.post.id,
          commentId: sent.id,
          expectedVersion: sent.version
        })
      );
    if (change === "withdraw")
      await db.platformPost.update({
        where: { id: f.post.id },
        data: { withdrawnAt: new Date() }
      });
    if (change === "deactivate")
      await db.platformUser.update({
        where: { id: f.b.id },
        data: { deactivatedAt: new Date() }
      });
    let calls = 0;
    assert.deepEqual(
      await deliverNotification(db, row.id, async () => {
        calls++;
        return 201;
      }),
      {
        done: true,
        outcome: change === "deactivate" ? "finished" : "cancelled"
      },
      change
    );
    assert.equal(calls, 0, change);
    assert.equal(
      (
        await db.notificationDelivery.findUniqueOrThrow({
          where: { id: row.id }
        })
      ).outcome,
      "CANCELLED",
      change
    );
    if (["block", "delete", "withdraw"].includes(change))
      await denied(openNotification(db, f.b.token, row.id));
    assert.equal(
      await db.platformPostComment.count({ where: { id: sent.id } }),
      1
    );
  }
});

test("removed mentions or revoked mention permission cancel a mention-only alert without exposing its post", async () => {
  for (const change of ["remove", "permission"]) {
    const f = await fixture(),
      other = await createPortalActor(db, "otherpost");
    await db.platformPost.update({
      where: { id: f.post.id },
      data: { authorId: other.id }
    });
    const sent = await sendComment(f, { mentionIds: [f.b.id] }),
      [row] = await deliveries(sent.id);
    if (change === "remove")
      await commentCommand(
        db,
        f.a.token,
        command("edit", {
          postId: f.post.id,
          commentId: sent.id,
          expectedVersion: sent.version,
          content: "Mention removed",
          mentionIds: []
        })
      );
    else {
      const prefs = await db.socialPreferences.findUniqueOrThrow({
        where: { ownerId: f.b.id }
      });
      await relationshipCommand(
        db,
        f.b.token,
        command("privacy", {
          expectedVersion: prefs.version,
          mentions: "NOBODY",
          showRelationships: true
        })
      );
    }
    await denied(openNotification(db, f.b.token, row.id));
    assert.equal(
      (
        await deliverNotification(db, row.id, async () => {
          throw Error("must not send");
        })
      ).done,
      true
    );
  }
});

test("quiet hours and transient queue/provider failures reuse the canonical reply and exact post link", async () => {
  const f = await fixture(["replies"]),
    now = new Date(),
    minute = now.getUTCHours() * 60 + now.getUTCMinutes();
  await preferences(f.b, ["replies"], {
    start: (minute + 1439) % 1440,
    end: (minute + 60) % 1440,
    timeZone: "UTC"
  });
  const sent = await sendComment(f),
    [row] = await deliveries(sent.id);
  assert.ok(row.availableAt > new Date());
  assert.deepEqual(
    await dispatchNotifications(db, sent.id, async () => {
      throw Error("local queue unavailable");
    }),
    { queued: 0, failed: 1 }
  );
  const queued: string[] = [];
  assert.deepEqual(
    await dispatchNotifications(db, sent.id, async (id) => {
      queued.push(id);
    }),
    { queued: 1, failed: 0 }
  );
  assert.deepEqual(queued, [row.id]);
  let sends = 0;
  const send = async () => {
    sends++;
    return sends === 1 ? 503 : 201;
  };
  assert.equal((await deliverNotification(db, row.id, send)).done, false);
  assert.equal(sends, 0);
  assert.equal(
    (await deliverNotification(db, row.id, send, row.availableAt)).done,
    false
  );
  const retry = await db.notificationDelivery.findUniqueOrThrow({
    where: { id: row.id }
  });
  assert.deepEqual(
    await deliverNotification(db, row.id, send, retry.availableAt),
    { done: true, outcome: "accepted" }
  );
  assert.equal(sends, 2);
  assert.equal(
    (await openNotification(db, f.b.token, row.id)).href,
    `/platform/posts/${f.post.id}?comment=${sent.id}`
  );
  assert.equal(
    await db.platformPostComment.count({ where: { id: sent.id } }),
    1
  );
});

test("revoked church access prevents both creation for an old owner and delivery/opening of an earlier private reply", async () => {
  const f = await seedPortal(db);
  await seedNotificationDevice(db, f.memberA);
  await preferences(f.memberA, ["replies"]);
  const post = await db.platformPost.create({
    data: {
      authorId: f.memberA.id,
      audience: "CHURCH",
      audienceChurchId: f.churchA.id,
      content: "Church-only source"
    }
  });
  const sent = await commentCommand(
    db,
    f.contact.token,
    command("create", { postId: post.id, content: "Private church reply" })
  );
  const [row] = await deliveries(sent.id);
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
  await denied(openNotification(db, f.memberA.token, row.id));
  assert.deepEqual(
    await deliverNotification(db, row.id, async () => {
      throw Error("must not send");
    }),
    { done: true, outcome: "cancelled" }
  );
  const later = await commentCommand(
    db,
    f.contact.token,
    command("create", {
      postId: post.id,
      content: "After old owner lost church access"
    })
  );
  assert.equal(
    await db.socialEvent.count({
      where: {
        commentId: later.id,
        kind: "COMMENT_ACTIVITY",
        recipientId: f.memberA.id
      }
    }),
    0
  );
});
