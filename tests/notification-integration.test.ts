import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import webpush from "web-push";
import {
  assertPortalTestDatabase,
  createPortalActor,
  type PortalActor,
  requestConnection
} from "./seed-portal";
import { seedParticipation } from "./seed-post-participation";
import { seedNotificationDevice } from "./seed-notifications";
import {
  relationshipCommand,
  readRelationships
} from "../lib/platform/relationships";
import { postCommand } from "../lib/platform/post-commands";
import { postLikeCommand } from "../lib/platform/post-likes";
import { prayerCommand } from "../lib/platform/prayer-commands";
import { PRAYER_GUIDE_VERSION } from "../lib/platform/prayer-types";
import { readPrayerTarget } from "../lib/platform/prayer-reads";
import {
  notificationPreferenceCommand,
  readNotificationPreferences,
  notificationCategories
} from "../lib/platform/notification-preferences";
import {
  readActivity,
  openActivity,
  activityCommand
} from "../lib/platform/activity";
import {
  processNotificationFanoutBatch,
  advanceNotificationFanout,
  dispatchNotificationFanout
} from "../lib/platform/notification-fanout";
import {
  deliverNotification,
  openNotification
} from "../lib/platform/notification-outbox";
import {
  replayRetentionControls,
  type RetentionControlEntry
} from "../lib/platform/retention-controls";
import { calendarCommand } from "../lib/platform/calendar-commands";
import { portalCommand } from "../lib/platform/portal";

const db = new PrismaClient();
const original = {
  PUSH_ENABLED: process.env.PUSH_ENABLED,
  PUSH_VAPID_PUBLIC_KEY: process.env.PUSH_VAPID_PUBLIC_KEY,
  PUSH_VAPID_PRIVATE_KEY: process.env.PUSH_VAPID_PRIVATE_KEY,
  PUSH_VAPID_SUBJECT: process.env.PUSH_VAPID_SUBJECT
};
before(async () => {
  await assertPortalTestDatabase(db);
  const vapid = webpush.generateVAPIDKeys();
  Object.assign(process.env, {
    PUSH_ENABLED: "true",
    PUSH_VAPID_PUBLIC_KEY: vapid.publicKey,
    PUSH_VAPID_PRIVATE_KEY: vapid.privateKey,
    PUSH_VAPID_SUBJECT: "https://example.test/contact"
  });
});
after(async () => {
  for (const [key, value] of Object.entries(original)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  await db.$disconnect();
});
const input = (operation: string, fields: object = {}) => ({
  operation,
  mutationId: randomUUID(),
  ...fields
});
async function bell(
  owner: PortalActor,
  targetId: string,
  on: boolean,
  kind = "person"
) {
  const status = (await readRelationships(db, owner.token, {
    view: "status",
    kind,
    targetId
  })) as { version: number };
  const command = input("author-bell", {
    kind,
    targetId,
    desired: on,
    expectedVersion: status.version
  });
  const saved = await relationshipCommand(db, owner.token, command);
  assert.deepEqual(await relationshipCommand(db, owner.token, command), saved);
  return saved;
}
async function preferences(
  owner: PortalActor,
  push: string[],
  inApp: Partial<Record<(typeof notificationCategories)[number], boolean>> = {}
) {
  const view = await readNotificationPreferences(db, owner.token);
  const command = input("preferences", {
    ownerId: owner.id,
    expectedVersion: view.preferences.version,
    inApp: { ...view.preferences.inApp, ...inApp },
    pushCategories: push,
    quietHours: null
  });
  const saved = await notificationPreferenceCommand(db, owner.token, command);
  assert.deepEqual(
    await notificationPreferenceCommand(db, owner.token, command),
    saved
  );
  return command;
}
async function publish(owner: PortalActor, fields: object = {}) {
  return postCommand(db, owner.token, {
    operation: "create",
    requestKey: randomUUID(),
    content: "Fictional canonical source content never belongs in an alert",
    ...fields
  });
}
async function drain(sourceId: string) {
  const jobs = await db.notificationFanoutJob.findMany({
    where: { sourceId, completedAt: null }
  });
  for (const job of jobs) {
    let done = false;
    for (let page = 0; page < 20 && !done; page++)
      done = (await processNotificationFanoutBatch(db, job.id)).done;
    assert.equal(done, true);
  }
}

test("author bells are explicit and independent of follows; publication, retries and current revocation share one source", async () => {
  const author = await createPortalActor(db, "bellauthor"),
    reader = await createPortalActor(db, "bellread");
  await relationshipCommand(
    db,
    reader.token,
    input("follow", {
      kind: "person",
      targetId: author.id,
      desired: true,
      expectedVersion: 0
    })
  );
  const first = await publish(author);
  assert.equal(
    await db.notificationFanoutJob.count({ where: { sourceId: first.id } }),
    0
  );
  await bell(reader, author.id, true);
  let status = (await readRelationships(db, reader.token, {
    view: "status",
    kind: "person",
    targetId: author.id
  })) as { version: number; following: boolean; authorBell: boolean };
  await relationshipCommand(
    db,
    reader.token,
    input("follow", {
      kind: "person",
      targetId: author.id,
      desired: false,
      expectedVersion: status.version
    })
  );
  status = (await readRelationships(db, reader.token, {
    view: "status",
    kind: "person",
    targetId: author.id
  })) as typeof status;
  assert.equal(status.following, false);
  assert.equal(status.authorBell, true);
  const second = await publish(author);
  await drain(second.id);
  await drain(second.id);
  const events = await db.socialEvent.findMany({
    where: { recipientId: reader.id, kind: "AUTHOR_POST" }
  });
  assert.equal(events.length, 1);
  assert.equal(events[0].postId, second.id);
  assert.equal((await readActivity(db, reader.token)).items[0].available, true);
  assert.equal(
    await db.notificationDelivery.count({ where: { ownerId: reader.id } }),
    0
  );
  await bell(reader, author.id, false);
  assert.equal(
    (await readActivity(db, reader.token)).items[0].available,
    false
  );
  assert.deepEqual(await openActivity(db, reader.token, events[0].id), {
    ownerId: reader.id,
    available: false,
    href: null
  });
  const oldBell = await db.socialRelationship.findFirstOrThrow({
    where: { ownerId: reader.id, targetUserId: author.id }
  });
  const bellControl = await db.retentionControl.findFirstOrThrow({
    where: { kind: "AUTHOR_BELL", sourceId: oldBell.id },
    orderBy: { version: "desc" }
  });
  assert.ok(bellControl.journaledAt);
  assert.doesNotMatch(
    JSON.stringify(bellControl.payload),
    /authorBellSince|desired|muted|followed/
  );
  // Restore an older on-choice alongside unrelated newer relationship edits.
  await db.socialRelationship.update({
    where: { id: oldBell.id },
    data: {
      authorBellSince: new Date(Date.now() - 10000),
      authorBellVersion: bellControl.version - 1,
      version: 100
    }
  });
  await replayRetentionControls(db, [
    bellControl.payload as unknown as RetentionControlEntry
  ]);
  const protectedBell = await db.socialRelationship.findUniqueOrThrow({
    where: { id: oldBell.id }
  });
  assert.equal(protectedBell.authorBellSince, null);
  assert.equal(protectedBell.authorBellVersion, bellControl.version);
  await replayRetentionControls(db, [
    bellControl.payload as unknown as RetentionControlEntry
  ]);
  assert.equal(
    (
      await db.socialRelationship.findUniqueOrThrow({
        where: { id: oldBell.id }
      })
    ).version,
    protectedBell.version
  );
  await bell(reader, author.id, true);
  await bell(author, reader.id, true);
  status = (await readRelationships(db, reader.token, {
    view: "status",
    kind: "person",
    targetId: author.id
  })) as typeof status;
  await relationshipCommand(
    db,
    reader.token,
    input("block", {
      kind: "person",
      targetId: author.id,
      desired: true,
      expectedVersion: status.version
    })
  );
  assert.equal(
    await db.socialRelationship.count({
      where: {
        OR: [
          { ownerId: reader.id, targetUserId: author.id },
          { ownerId: author.id, targetUserId: reader.id }
        ],
        authorBellSince: { not: null }
      }
    }),
    0
  );
});

test("expanded independent channels preserve old clients, exact retries and newer protected preference revisions", async () => {
  const owner = await createPortalActor(db, "newprefs");
  const command = await preferences(owner, ["posts", "reactions"], {
    posts: false,
    mentions: false
  });
  let view = await readNotificationPreferences(db, owner.token);
  assert.equal(view.preferences.inApp.posts, false);
  assert.deepEqual(view.preferences.pushCategories, ["posts", "reactions"]);
  const legacy = input("preferences", {
    ownerId: owner.id,
    expectedVersion: view.preferences.version,
    inApp: { messages: false, requests: true, reports: true, founder: true },
    pushCategories: [],
    quietHours: null
  });
  await notificationPreferenceCommand(db, owner.token, legacy);
  view = await readNotificationPreferences(db, owner.token);
  assert.equal(view.preferences.inApp.posts, false);
  assert.equal(view.preferences.inApp.mentions, false);
  assert.deepEqual(view.preferences.pushCategories, ["posts", "reactions"]);
  await assert.rejects(
    notificationPreferenceCommand(db, owner.token, {
      ...command,
      quietHours: { start: 10, end: 20, timeZone: "UTC" }
    })
  );
  const controls = await db.retentionControl.findMany({
    where: { kind: "NOTIFICATION_PREFERENCES", sourceId: owner.id },
    orderBy: { version: "desc" },
    take: 1
  });
  assert.equal(controls.length, 1);
  assert.ok(controls[0].journaledAt);
  const receipt = controls[0].payload as unknown as RetentionControlEntry;
  assert.doesNotMatch(
    JSON.stringify(receipt),
    /mentions|pushCategories|quietHours|reactions/
  );
  await db.socialPreferences.update({
    where: { ownerId: owner.id },
    data: {
      notificationVersion: receipt.version - 1,
      version: 100,
      notificationRecoveryRequired: false
    }
  });
  await replayRetentionControls(db, [receipt]);
  view = await readNotificationPreferences(db, owner.token);
  assert.equal(view.preferences.recoveryRequired, true);
  assert.deepEqual(view.preferences.pushCategories, []);
  assert.ok(Object.values(view.preferences.inApp).every((v) => !v));
  await assert.rejects(
    notificationPreferenceCommand(db, owner.token, {
      ...legacy,
      mutationId: randomUUID(),
      expectedVersion: view.preferences.version
    })
  );
  await preferences(owner, [], { messages: true });
  assert.equal(
    (await readNotificationPreferences(db, owner.token)).preferences
      .recoveryRequired,
    false
  );
});

test("multi-page fanout commits its cursor, excludes late bells/devices/phone opt-in and deduplicates competing workers", async () => {
  const author = await createPortalActor(db, "manybell"),
    reader = await createPortalActor(db, "bellphone"),
    late = await createPortalActor(db, "latebell");
  const laterPhone = await createPortalActor(db, "laterphone"),
    laterDevice = await createPortalActor(db, "laterdevice");
  await bell(laterPhone, author.id, true);
  await seedNotificationDevice(db, laterPhone);
  await bell(laterDevice, author.id, true);
  await preferences(laterDevice, ["posts"]);
  await bell(reader, author.id, true);
  await preferences(reader, ["posts"], { posts: false });
  await seedNotificationDevice(db, reader);
  const now = new Date(Date.now() - 60000),
    template = await db.platformUser.findUniqueOrThrow({
      where: { id: reader.id }
    });
  const recipients: string[] = [];
  for (let i = 0; i < 24; i++) {
    const id = randomUUID(),
      username = `fanout_${randomUUID().replaceAll("-", "").slice(0, 20)}`;
    await db.platformUser.create({
      data: {
        id,
        username,
        email: `${username}@example.test`,
        name: "Fictional continuation recipient",
        passwordHash: template.passwordHash,
        emailVerifiedAt: now,
        adultAcknowledgedAt: now,
        adultPolicyVersion: template.adultPolicyVersion,
        role: "BELIEVER"
      }
    });
    await db.socialRelationship.create({
      data: {
        ownerId: id,
        targetUserId: author.id,
        authorBellSince: now,
        authorBellVersion: 1
      }
    });
    recipients.push(id);
  }
  const post = await publish(author),
    job = await db.notificationFanoutJob.findFirstOrThrow({
      where: { sourceId: post.id }
    });
  await bell(late, author.id, true);
  await preferences(late, ["posts"]);
  await seedNotificationDevice(db, late);
  await preferences(laterPhone, ["posts"]);
  await seedNotificationDevice(db, laterDevice);
  const before = await processNotificationFanoutBatch(db, job.id);
  assert.deepEqual(
    { done: before.done, processed: before.processed },
    { done: false, processed: 20 }
  );
  assert.ok(
    (
      await db.notificationFanoutJob.findUniqueOrThrow({
        where: { id: job.id }
      })
    ).cursor
  );
  await Promise.all([
    processNotificationFanoutBatch(db, job.id),
    processNotificationFanoutBatch(db, job.id)
  ]);
  assert.equal(
    await db.socialEvent.count({
      where: { postId: post.id, kind: "AUTHOR_POST" }
    }),
    27
  );
  assert.equal(
    await db.socialEvent.count({
      where: { postId: post.id, recipientId: late.id }
    }),
    0
  );
  assert.equal(
    await db.notificationDelivery.count({
      where: {
        ownerId: { in: [laterPhone.id, laterDevice.id] },
        event: { postId: post.id }
      }
    }),
    0,
    "Independent late phone opt-in and later device cannot backfill an earlier publication"
  );
  assert.equal(
    (await readActivity(db, reader.token)).items.length,
    0,
    "In-app off is independent of phone on"
  );
  const delivery = await db.notificationDelivery.findFirstOrThrow({
    where: { ownerId: reader.id, event: { postId: post.id } }
  });
  let calls = 0;
  await deliverNotification(db, delivery.id, async (_sub, payload) => {
    calls++;
    assert.doesNotMatch(
      JSON.stringify(payload),
      /Fictional|canonical|name|content/
    );
    return 201;
  });
  assert.equal(calls, 1);
  assert.equal(
    (await openNotification(db, reader.token, delivery.id)).href,
    `/platform/posts/${post.id}`
  );
  const newer = await publish(author);
  await bell(reader, author.id, false);
  await drain(newer.id);
  assert.equal(
    await db.socialEvent.count({
      where: { postId: newer.id, recipientId: reader.id }
    }),
    0
  );
  let dispatched = 0;
  await dispatchNotificationFanout(db, author.id, async () => {
    dispatched++;
  });
  assert.equal(dispatched, 0);
  assert.deepEqual(
    await advanceNotificationFanout(db, "probe-fictional-unused"),
    { done: true, processed: 0, sourceId: null, failed: 0 }
  );
});

test("reactions and private prayer acknowledgments retain one intent, never expose a participant, and preserve read-all boundaries", async () => {
  const author = await createPortalActor(db, "reactown"),
    reader = await createPortalActor(db, "reactuser");
  const post = await publish(author);
  const like = {
    postId: post.id,
    mutationId: randomUUID(),
    expectedVersion: 0,
    desired: true
  };
  const liked = await postLikeCommand(db, reader.token, like);
  assert.deepEqual(await postLikeCommand(db, reader.token, like), liked);
  const off = await postLikeCommand(db, reader.token, {
    ...like,
    mutationId: randomUUID(),
    expectedVersion: liked.version,
    desired: false
  });
  await postLikeCommand(db, reader.token, {
    ...like,
    mutationId: randomUUID(),
    expectedVersion: off.version
  });
  assert.equal(
    await db.socialEvent.count({
      where: { postId: post.id, kind: "POST_REACTION" }
    }),
    1
  );
  const page = await readActivity(db, author.token);
  assert.equal(page.unread, 1);
  await prayerCommand(
    db,
    reader.token,
    input("guide", { expectedVersion: 0, guideVersion: PRAYER_GUIDE_VERSION })
  );
  const acknowledgment = input("acknowledge", {
    postId: post.id,
    expectedVersion: 0,
    desired: true,
    shareName: false,
    guideVersion: PRAYER_GUIDE_VERSION
  });
  await prayerCommand(db, reader.token, acknowledgment);
  await prayerCommand(db, reader.token, acknowledgment);
  await activityCommand(
    db,
    author.token,
    input("read-all", { ownerId: author.id, boundary: page.boundary })
  );
  const next = await readActivity(db, author.token);
  assert.equal(next.unread, 1);
  assert.equal(next.items.filter((i) => i.category === "prayer").length, 1);
  assert.doesNotMatch(
    JSON.stringify(next),
    new RegExp(`${reader.id}|${reader.username}|${reader.name}`)
  );
  assert.equal(
    (await readPrayerTarget(db, author.token, { postId: post.id })).names
      .length,
    0
  );
  const retainedIntents = await db.socialEvent.count({ where: { postId: post.id, recipientId: author.id } });
  await relationshipCommand(db, author.token, input("mute", {
    kind: "person", targetId: reader.id, desired: true, expectedVersion: 0
  }));
  assert.equal((await readActivity(db, author.token, { category: "prayer" })).items.length, 0);
  assert.equal((await readActivity(db, author.token, { category: "reactions" })).items.length, 0);
  assert.equal(await db.socialEvent.count({ where: { postId: post.id, recipientId: author.id } }), retainedIntents);
});

test("church requests, changed events and volunteer confirmations use current domain access and keep canonical outcomes", async () => {
  const f = await seedParticipation(db);
  const newcomer = await createPortalActor(db, "newchurch"),
    connection = await requestConnection(db, newcomer, f.churchA.id);
  await drain(connection.id);
  assert.ok(
    await db.socialEvent.findFirst({
      where: {
        kind: "CHURCH_REVIEW",
        sourceId: connection.id,
        recipientId: f.reviewerA.id
      }
    })
  );
  await portalCommand(db, f.reviewerA.token, {
    operation: "transition",
    action: "APPROVE",
    churchId: f.churchA.id,
    connectionId: connection.id,
    expectedVersion: connection.version
  });
  assert.ok(
    (await readActivity(db, newcomer.token)).items.some(
      (i) => i.available && i.href === "/platform/my-church"
    )
  );
  const slot = await f.slot({ capacity: 3 });
  const signup = await f.command(f.lee, {
    operation: "volunteer",
    slotId: slot.id,
    slotVersion: slot.version,
    expectedVersion: 0
  });
  await calendarCommand(db, f.lee.token, {
    operation: "rsvp",
    eventId: f.event.id,
    occurrenceId: f.occurrence.id,
    occurrenceVersion: f.occurrence.version,
    expectedVersion: 0,
    state: "GOING"
  });
  await preferences(f.lee, [], { commitments: false });
  await calendarCommand(db, f.ada.token, {
    operation: "cancel-event",
    eventId: f.event.id,
    expectedVersion: 1,
    occurrenceId: f.occurrence.id,
    occurrenceVersion: 1,
    scope: "OCCURRENCE",
    confirmed: true
  });
  await drain(f.occurrence.id);
  const events = await db.socialEvent.findMany({
    where: {
      recipientId: f.lee.id,
      kind: "EVENT_CHANGED",
      sourceId: f.occurrence.id
    }
  });
  assert.equal(
    events.length,
    1,
    "RSVP plus volunteer participation still means one recipient intent"
  );
  assert.equal(
    (await readActivity(db, f.lee.token, { category: "commitments" })).items
      .length,
    0
  );
  assert.equal(
    (
      await db.postVolunteerSignup.findUniqueOrThrow({
        where: { id: signup.id }
      })
    ).state,
    "ACTIVE"
  );
  await preferences(f.lee, [], { commitments: true });
  assert.equal(
    (await openActivity(db, f.lee.token, events[0].id)).href,
    `/platform/events/${f.occurrence.id}`
  );
  const ownConnection = await db.churchConnection.findUniqueOrThrow({
    where: { userId_churchId: { userId: f.lee.id, churchId: f.churchA.id } }
  });
  await portalCommand(db, f.lee.token, {
    operation: "transition",
    action: "LEAVE",
    churchId: f.churchA.id,
    connectionId: ownConnection.id,
    expectedVersion: ownConnection.version
  });
  assert.deepEqual(await openActivity(db, f.lee.token, events[0].id), {
    ownerId: f.lee.id,
    available: false,
    href: null
  });
  const cancelled = await f.command(f.lee, {
    operation: "cancel-volunteer",
    signupId: signup.id,
    expectedVersion: signup.version
  });
  assert.match(cancelled.message, /canceled/);
  assert.ok(
    (
      await readActivity(db, f.lee.token, { category: "commitments" })
    ).items.some((i) => i.available && i.href === "/platform/commitments")
  );
});
