import test, { beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import {
  assertPortalTestDatabase,
  createPortalActor,
  seedPortal,
  type PortalActor
} from "./seed-portal";
import {
  notificationPreferenceCommand,
  readNotificationPreferences,
  notificationEmailAllowed
} from "../lib/platform/notification-preferences";
import { commentCommand } from "../lib/platform/comment-commands";
import { postLikeCommand } from "../lib/platform/post-likes";
import { postCommand } from "../lib/platform/post-commands";
import { portalCommand } from "../lib/platform/portal";
import { groupCommand } from "../lib/platform/group-commands";
import {
  deliverNotification,
  enqueueNotification,
  openNotification
} from "../lib/platform/notification-outbox";
import { dispatchNotifications } from "../lib/platform/notification-queue";
import {
  socialEmailTransport,
  socialEmailCategory
} from "../lib/platform/social-email";
import { accountConfig } from "../lib/platform/account-config";
import {
  replayRetentionControls,
  type RetentionControlEntry
} from "../lib/platform/retention-controls";
import { PortalError } from "../lib/platform/portal-policy";
const db = new PrismaClient();
const keys = [
  "SOCIAL_EMAIL_ENABLED",
  "PUSH_ENABLED",
  "FEEDBACK_FOLLOWUP_ENABLED"
];
const original = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
beforeEach(async () => {
  await assertPortalTestDatabase(db);
  Object.assign(process.env, {
    SOCIAL_EMAIL_ENABLED: "true",
    PUSH_ENABLED: "false",
    FEEDBACK_FOLLOWUP_ENABLED: "false"
  });
});
after(async () => {
  for (const key of keys)
    if (original[key] === undefined) delete process.env[key];
    else process.env[key] = original[key];
  await db.$disconnect();
});
const denied = (status: number) => (error: unknown) =>
  error instanceof PortalError && error.status === status;
const noOtherChannel = async () => {
  throw Error("Social email must not use phone or feedback transport");
};
async function preferences(
  actor: PortalActor,
  emailCategories?: string[],
  extra = {}
) {
  const view = await readNotificationPreferences(db, actor.token);
  const input = {
    operation: "preferences",
    mutationId: randomUUID(),
    ownerId: actor.id,
    expectedVersion: view.preferences.version,
    inApp: view.preferences.inApp,
    pushCategories: view.preferences.pushCategories,
    quietHours: null,
    ...(emailCategories === undefined ? {} : { emailCategories }),
    ...extra
  };
  const result = await notificationPreferenceCommand(db, actor.token, input);
  assert.deepEqual(
    await notificationPreferenceCommand(db, actor.token, input),
    result
  );
  return input;
}
async function fixture(categories: string[] = ["replies", "reactions"]) {
  const owner = await createPortalActor(db, "mailowner"),
    actor = await createPortalActor(db, "mailactor");
  assert.deepEqual(
    (await readNotificationPreferences(db, owner.token)).preferences
      .emailCategories,
    []
  );
  await preferences(owner, categories);
  const post = await db.platformPost.create({
    data: { authorId: owner.id, content: "PRIVATE source body never in email" }
  });
  return { owner, actor, post };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
async function reply(f: Fixture, parentId?: string) {
  const result = await commentCommand(db, f.actor.token, {
    operation: "create",
    mutationId: randomUUID(),
    postId: f.post.id,
    content: "PRIVATE reply body",
    ...(parentId ? { replyToId: parentId } : {})
  });
  return db.socialEvent.findFirstOrThrow({
    where: {
      commentId: result.id,
      recipientId: f.owner.id,
      kind: "COMMENT_ACTIVITY"
    }
  });
}
async function like(f: Fixture) {
  const input = {
    postId: f.post.id,
    mutationId: randomUUID(),
    expectedVersion: 0,
    desired: true
  };
  const result = await postLikeCommand(db, f.actor.token, input);
  assert.deepEqual(await postLikeCommand(db, f.actor.token, input), result);
  return db.socialEvent.findFirstOrThrow({
    where: { postId: f.post.id, kind: "POST_REACTION" }
  });
}
const rows = (eventId: string) =>
  db.notificationDelivery.findMany({ where: { eventId, channel: "EMAIL" } });
const send = (
  id: string,
  transport = socialEmailTransport(accountConfig()),
  now = new Date()
) =>
  deliverNotification(db, id, noOtherChannel, now, noOtherChannel, transport);

test("declined email performs one preference read without resolving source authority or creating work", async () => {
  const f = await fixture([]),
    event = await reply(f);
  const measured = new PrismaClient({
    log: [{ level: "query", emit: "event" }]
  });
  const queries: string[] = [];
  measured.$on("query", (e) => queries.push(e.query));
  try {
    await measured.$transaction((tx) => enqueueNotification(tx, event));
    const reads = queries.filter((q) => /^SELECT\b/.test(q));
    console.log(
      JSON.stringify({
        optionalEmailOptOutSelects: reads.length,
        scope: "isolated enqueue, push disabled"
      })
    );
    assert.equal(reads.length, 1);
    assert.equal((await rows(event.id)).length, 0);
  } finally {
    await measured.$disconnect();
  }
});

test("likes email can be turned off independently; direct replies still send without push or feedback configuration", async () => {
  const f = await fixture();
  await preferences(f.owner, ["replies"]);
  const reaction = await like(f),
    direct = await reply(f);
  assert.equal((await rows(reaction.id)).length, 0);
  const [delivery] = await rows(direct.id);
  assert.ok(delivery);
  assert.equal(delivery.subscriptionId, null);
  const queued: string[] = [];
  assert.deepEqual(
    await dispatchNotifications(db, direct.id, async (id) => {
      queued.push(id);
    }),
    { queued: 1, failed: 0 }
  );
  assert.deepEqual(queued, [delivery.id]);
  assert.deepEqual(await send(delivery.id), {
    done: true,
    outcome: "accepted"
  });
  assert.deepEqual(await send(delivery.id), {
    done: true,
    outcome: "finished"
  });
  const body = await readFile(
    join(accountConfig().sinkDirectory!, `social-${delivery.id}.json`),
    "utf8"
  );
  assert.doesNotMatch(body, /PRIVATE/);
  assert.ok(!body.includes(f.actor.name) && !body.includes(f.actor.email));
  assert.ok(body.includes(`/platform/notifications/${delivery.id}`));
  assert.equal(
    (await openNotification(db, f.owner.token, delivery.id, false)).href,
    `/platform/posts/${f.post.id}?comment=${direct.commentId}`
  );
  await assert.rejects(
    openNotification(db, f.actor.token, delivery.id, false),
    denied(404)
  );
  const choices = (await readNotificationPreferences(db, f.owner.token))
    .preferences;
  assert.equal(choices.inApp.reactions, true);
  assert.equal(choices.inApp.replies, true);
  assert.equal(choices.feedbackEmail, false);
});

test("dated opt-in prevents backfill, old clients preserve choices, and renewed consent cannot revive pending email", async () => {
  const f = await fixture([]),
    old = await reply(f);
  assert.equal((await rows(old.id)).length, 0);
  await preferences(f.owner, ["replies", "reactions"]);
  await db.$transaction((tx) => enqueueNotification(tx, old));
  assert.equal((await rows(old.id)).length, 0);
  const before = (
    await db.socialPreferences.findUniqueOrThrow({
      where: { ownerId: f.owner.id }
    })
  ).notificationEmailSince;
  await preferences(f.owner); // A deployed older form never included emailCategories.
  assert.deepEqual(
    (
      await db.socialPreferences.findUniqueOrThrow({
        where: { ownerId: f.owner.id }
      })
    ).notificationEmailSince,
    before
  );
  const pending = await reply(f),
    [delivery] = await rows(pending.id);
  await preferences(f.owner, []);
  await preferences(f.owner, ["replies"]);
  let calls = 0;
  assert.deepEqual(
    await send(delivery.id, async () => {
      calls++;
      return 200;
    }),
    { done: true, outcome: "cancelled" }
  );
  await db.$transaction((tx) => enqueueNotification(tx, pending));
  assert.equal((await rows(pending.id)).length, 1);
  assert.equal(calls, 0);
});

test("provider unavailability rejects only new opt-ins and still permits withdrawal; unsupported categories fail closed", async () => {
  const f = await fixture(["replies"]);
  process.env.SOCIAL_EMAIL_ENABLED = "false";
  assert.equal(
    (await readNotificationPreferences(db, f.owner.token)).channels.socialEmail,
    false
  );
  await preferences(f.owner); // Existing consent survives unrelated edits.
  await assert.rejects(
    preferences(f.owner, ["replies", "reactions"]),
    denied(503)
  );
  await preferences(f.owner, []);
  for (const categories of [
    ["messages"],
    ["replies", "replies"],
    ["prayer"],
    ["feedback"]
  ])
    await assert.rejects(preferences(f.owner, categories), denied(400));
  assert.equal(
    socialEmailCategory({
      kind: "PRAYER_ACK",
      notificationCategory: "reactions"
    }),
    null
  );
  const unverified = await createPortalActor(db, "mailunver", {
    verified: false
  });
  process.env.SOCIAL_EMAIL_ENABLED = "true";
  await assert.rejects(preferences(unverified, ["replies"]), denied(503));
});

test("comment likes and nested direct replies use their own consent; mentions keep established single-intent precedence", async () => {
  const f = await fixture();
  const own = await commentCommand(db, f.owner.token, {
    operation: "create",
    mutationId: randomUUID(),
    postId: f.post.id,
    content: "PRIVATE owner comment"
  });
  await commentCommand(db, f.actor.token, {
    operation: "like",
    mutationId: randomUUID(),
    commentId: own.id,
    postId: f.post.id,
    expectedVersion: 0,
    desired: true
  });
  const reaction = await db.socialEvent.findFirstOrThrow({
    where: { commentId: own.id, kind: "COMMENT_REACTION" }
  });
  assert.equal((await rows(reaction.id)).length, 1);
  const nested = await reply(f, own.id);
  assert.equal((await rows(nested.id)).length, 1);
  const mentioned = await commentCommand(db, f.actor.token, {
    operation: "create",
    mutationId: randomUUID(),
    postId: f.post.id,
    content: "PRIVATE mentioned reply",
    mentionIds: [f.owner.id]
  });
  const intents = await db.socialEvent.findMany({
    where: {
      commentId: mentioned.id,
      recipientId: f.owner.id,
      kind: "COMMENT_ACTIVITY"
    }
  });
  assert.equal(intents.length, 1);
  assert.equal(intents[0].notificationCategory, "mentions");
  assert.equal((await rows(intents[0].id)).length, 0);
  const owner = await db.platformUser.findUniqueOrThrow({
    where: { id: f.owner.id }
  });
  await assert.rejects(
    db.notificationDelivery.create({
      data: {
        eventId: intents[0].id,
        ownerId: f.owner.id,
        channel: "EMAIL",
        emailCredentialVersion: owner.credentialVersion,
        expiresAt: new Date(Date.now() + 60000)
      }
    })
  );
});

test("recovery quarantine clears email consent and cannot resurrect sends or inherit malformed consent", async () => {
  const f = await fixture(),
    pending = await reply(f),
    [delivery] = await rows(pending.id);
  const snapshot = await db.socialPreferences.findUniqueOrThrow({
    where: { ownerId: f.owner.id }
  });
  await preferences(f.owner, []);
  const control = await db.retentionControl.findFirstOrThrow({
    where: { kind: "NOTIFICATION_PREFERENCES", sourceId: f.owner.id },
    orderBy: { version: "desc" }
  });
  assert.ok(control.journaledAt);
  await db.socialPreferences.update({
    where: { ownerId: f.owner.id },
    data: {
      notificationVersion: snapshot.notificationVersion,
      notificationEmailSince: snapshot.notificationEmailSince!
    }
  });
  await replayRetentionControls(db, [
    control.payload as unknown as RetentionControlEntry
  ]);
  const restored = await db.socialPreferences.findUniqueOrThrow({
    where: { ownerId: f.owner.id }
  });
  assert.equal(restored.notificationEmailSince, null);
  assert.equal(restored.notificationRecoveryRequired, true);
  assert.deepEqual(
    (await readNotificationPreferences(db, f.owner.token)).preferences
      .emailCategories,
    []
  );
  assert.deepEqual(await send(delivery.id, noOtherChannel), {
    done: true,
    outcome: "cancelled"
  });
  for (const consent of [
    null,
    [],
    { replies: true },
    { replies: "invalid" },
    { replies: new Date().toISOString() }
  ])
    assert.equal(
      notificationEmailAllowed(
        { ...snapshot, notificationEmailSince: consent },
        new Date(0),
        "replies"
      ),
      false
    );
});

test("current undo, mute, read state, account changes and removed source stop queued email and private links", async () => {
  for (const change of [
    "undo",
    "mute",
    "read",
    "credentials",
    "delete",
    "provider"
  ] as const) {
    const f = await fixture();
    const event = change === "undo" ? await like(f) : await reply(f);
    const [delivery] = await rows(event.id);
    assert.ok(delivery, change);
    if (change === "undo")
      await postLikeCommand(db, f.actor.token, {
        postId: f.post.id,
        mutationId: randomUUID(),
        desired: false,
        expectedVersion: 1
      });
    if (change === "mute")
      await commentCommand(db, f.owner.token, {
        operation: "conversation",
        mutationId: randomUUID(),
        postId: f.post.id,
        mode: "MUTE",
        expectedVersion: 0
      });
    if (change === "read")
      await db.socialEvent.update({
        where: { id: event.id },
        data: { activityReadAt: new Date() }
      });
    if (change === "credentials")
      await db.platformUser.update({
        where: { id: f.owner.id },
        data: { credentialVersion: { increment: 1 } }
      });
    if (change === "delete")
      await db.platformPost.update({
        where: { id: f.post.id },
        data: { status: "WITHDRAWN", withdrawnAt: new Date() }
      });
    if (change === "provider") process.env.SOCIAL_EMAIL_ENABLED = "false";
    const result = await send(delivery.id, noOtherChannel);
    assert.ok(
      result.done && ["cancelled", "finished"].includes(result.outcome),
      change
    );
    if (change === "undo" || change === "delete")
      await assert.rejects(
        openNotification(db, f.owner.token, delivery.id, false),
        denied(404)
      );
    process.env.SOCIAL_EMAIL_ENABLED = "true";
  }
});

async function pendingMemberEmail(
  recipient: PortalActor,
  author: PortalActor,
  postId: string
) {
  await preferences(recipient, ["replies", "reactions"]);
  const parent = await commentCommand(db, recipient.token, {
    operation: "create",
    mutationId: randomUUID(),
    postId,
    content: "PRIVATE member comment on another member's post"
  });
  const reply = await commentCommand(db, author.token, {
    operation: "create",
    mutationId: randomUUID(),
    postId,
    replyToId: parent.id,
    content: "PRIVATE direct reply to the member"
  });
  await commentCommand(db, author.token, {
    operation: "like",
    mutationId: randomUUID(),
    postId,
    commentId: parent.id,
    expectedVersion: 0,
    desired: true
  });
  const deliveries = await db.notificationDelivery.findMany({
    where: {
      ownerId: recipient.id,
      channel: "EMAIL",
      event: { postId, commentId: { in: [parent.id, reply.id] } }
    },
    include: { event: true }
  });
  assert.equal(deliveries.length, 2);
  assert.deepEqual(
    deliveries.map((row) => row.event.notificationCategory).sort(),
    ["reactions", "replies"]
  );
  for (const row of deliveries) {
    assert.equal(row.state, "QUEUED");
    assert.equal(
      (await openNotification(db, recipient.token, row.id, false)).href,
      `/platform/posts/${postId}?comment=${row.event.commentId}`
    );
  }
  return deliveries;
}
async function assertRevokedMemberEmail(
  recipient: PortalActor,
  deliveries: Awaited<ReturnType<typeof pendingMemberEmail>>
) {
  let sends = 0;
  for (const row of deliveries) {
    await assert.rejects(
      openNotification(db, recipient.token, row.id, false),
      denied(404)
    );
    const result = await send(row.id, async () => {
      sends++;
      return 200;
    });
    assert.ok(
      result.done && ["cancelled", "finished"].includes(result.outcome)
    );
    const final = await db.notificationDelivery.findUniqueOrThrow({
      where: { id: row.id }
    });
    assert.equal(final.state, "FINISHED");
    assert.equal(final.outcome, "CANCELLED");
  }
  assert.equal(sends, 0);
}

test("church membership removal cancels pending reply and Like email and denies the old authenticated links", async () => {
  const f = await seedPortal(db);
  const post = await db.platformPost.create({
    data: {
      authorId: f.contact.id,
      audience: "CHURCH",
      audienceChurchId: f.churchA.id,
      content: "PRIVATE church post owned by another member"
    }
  });
  const deliveries = await pendingMemberEmail(f.memberA, f.contact, post.id);
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
  await assertRevokedMemberEmail(f.memberA, deliveries);
});

test("leaving a group cancels pending reply and Like email and denies the old authenticated links", async () => {
  const author = await createPortalActor(db, "mailgroupowner"),
    recipient = await createPortalActor(db, "mailgroupmember");
  const group = await groupCommand(db, author.token, {
    operation: "create",
    mutationId: randomUUID(),
    schema: 1,
    slug: `email-group-${randomUUID()}`,
    fields: {
      name: "Fictional email group",
      purpose: "Verify private notification access",
      rules: "Respect each member's privacy.",
      kind: "INTEREST",
      discovery: "LISTED",
      joinPolicy: "OPEN",
      format: "LOCAL",
      area: "Fictional town",
      topic: "Music",
      churchId: null
    },
    acceptedRules: true,
    leaderDisclosure: true
  });
  const joined = await groupCommand(db, recipient.token, {
    operation: "join",
    mutationId: randomUUID(),
    groupId: group.id,
    expectedVersion: 0,
    rulesVersion: 1,
    acceptedRules: true,
    rosterVisible: false
  });
  const post = await postCommand(db, author.token, {
    operation: "create",
    requestKey: randomUUID(),
    groupId: group.id,
    audience: "GROUP",
    groupThreadKind: "DISCUSSION",
    groupCategory: "GENERAL",
    content: "PRIVATE group post owned by another member"
  });
  const deliveries = await pendingMemberEmail(recipient, author, post.id);
  await groupCommand(db, recipient.token, {
    operation: "leave",
    mutationId: randomUUID(),
    groupId: group.id,
    expectedVersion: joined.version,
    confirmed: true
  });
  await assertRevokedMemberEmail(recipient, deliveries);
});

test("quiet hours defer optional email; expiry and credential boundaries prevent late or changed-recipient retries", async () => {
  const f = await fixture(),
    event = await reply(f),
    [delivery] = await rows(event.id);
  const now = new Date(),
    minute = now.getUTCHours() * 60 + now.getUTCMinutes();
  await preferences(f.owner, ["replies"], {
    quietHours: {
      start: (minute + 1439) % 1440,
      end: (minute + 60) % 1440,
      timeZone: "UTC"
    }
  });
  const paused = await send(delivery.id, noOtherChannel, now);
  assert.equal(paused.done, false);
  await preferences(f.owner, ["replies"]);
  const expired = new Date(event.createdAt.getTime() + 24 * 3600000);
  assert.deepEqual(await send(delivery.id, noOtherChannel, expired), {
    done: true,
    outcome: "cancelled"
  });
});

test("duplicate dispatch and transient provider retry keep the same content-free identity and request body", async () => {
  const f = await fixture(),
    event = await reply(f),
    [delivery] = await rows(event.id);
  await db.$transaction((tx) => enqueueNotification(tx, event));
  assert.equal((await rows(event.id)).length, 1);
  const bodies: string[] = [],
    idempotency: string[] = [];
  const transport = socialEmailTransport(
    {
      ...accountConfig(),
      delivery: "resend",
      resend: { apiKey: "fixture-stub-only", from: "fixture@example.test" }
    },
    (async (_url, options) => {
      bodies.push(String(options?.body));
      idempotency.push(new Headers(options?.headers).get("Idempotency-Key")!);
      return bodies.length === 1
        ? new Response("", { status: 503 })
        : Response.json({ id: "fixture-accepted" });
    }) as typeof fetch
  );
  assert.equal((await send(delivery.id, transport)).done, false);
  const retry = await db.notificationDelivery.findUniqueOrThrow({
    where: { id: delivery.id }
  });
  assert.deepEqual(await send(delivery.id, transport, retry.availableAt), {
    done: true,
    outcome: "accepted"
  });
  assert.equal(bodies.length, 2);
  assert.equal(bodies[0], bodies[1]);
  assert.deepEqual(idempotency, [
    `social/v1/${delivery.id}`,
    `social/v1/${delivery.id}`
  ]);
  const snapshot = JSON.stringify(
    await db.notificationDelivery.findUnique({ where: { id: delivery.id } })
  );
  assert.doesNotMatch(snapshot, /PRIVATE|@/);
  await assert.rejects(
    db.notificationDelivery.update({
      where: { id: delivery.id },
      data: { ownerId: f.actor.id }
    })
  );
  await assert.rejects(
    db.notificationDelivery.update({
      where: { id: delivery.id },
      data: { state: "QUEUED" }
    })
  );
});
