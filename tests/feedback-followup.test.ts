import test, { beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import webpush from "web-push";
import { seedSupport } from "./seed-support";
import {
  seedOperatorGrants,
  createPortalActor,
  type PortalActor
} from "./seed-portal";
import { seedNotificationDevice } from "./seed-notifications";
import { supportCommand, readSupport } from "../lib/platform/support";
import { FEEDBACK_NOTICE } from "../lib/platform/feedback-types";
import {
  readFeedbackIdeas,
  feedbackIdeaInterestCommand
} from "../lib/platform/feedback-ideas";
import {
  readFeedbackIdeaAdministration,
  feedbackIdeaAdminCommand
} from "../lib/platform/feedback-idea-admin";
import {
  notificationPreferenceCommand,
  readNotificationPreferences
} from "../lib/platform/notification-preferences";
import { notificationSource } from "../lib/platform/notification-source";
import {
  deliverNotification,
  enqueueNotification
} from "../lib/platform/notification-outbox";
import { dispatchNotifications } from "../lib/platform/notification-queue";
import { processNotificationFanoutBatch } from "../lib/platform/notification-fanout";
import { feedbackEmailTransport } from "../lib/platform/feedback-email";
import { accountConfig } from "../lib/platform/account-config";
import { readActivity, openActivity } from "../lib/platform/activity";
import {
  replayRetentionControls,
  type RetentionControlEntry
} from "../lib/platform/retention-controls";

const db = new PrismaClient();
let f: Awaited<ReturnType<typeof seedSupport>>;
beforeEach(async () => {
  f = await seedSupport(db);
  Object.assign(process.env, {
    SUPPORT_INTAKE_ENABLED: "true",
    FEEDBACK_INTAKE_ENABLED: "true",
    FEEDBACK_IDEAS_ENABLED: "true",
    FEEDBACK_FOLLOWUP_ENABLED: "true",
    PUSH_ENABLED: "false"
  });
  await seedOperatorGrants(db, f.owner, ["MANAGE_PRODUCT_FEEDBACK"]);
});
after(() => db.$disconnect());
const noPush = async () => {
  throw Error("A feedback email must not call the push provider.");
};
async function preferences(
  actor: PortalActor,
  email: boolean,
  push = false,
  inApp = true
) {
  const old = await readNotificationPreferences(db, actor.token);
  const input = {
    operation: "preferences",
    mutationId: randomUUID(),
    ownerId: actor.id,
    expectedVersion: old.preferences.version,
    inApp: { ...old.preferences.inApp, feedback: inApp },
    pushCategories: push ? ["feedback"] : [],
    quietHours: null,
    feedbackEmail: email
  };
  const result = await notificationPreferenceCommand(db, actor.token, input);
  assert.deepEqual(
    await notificationPreferenceCommand(db, actor.token, input),
    result
  );
  return input;
}
async function submission(
  channels: string[] = [],
  kind = "GENERAL",
  actor = f.memberA
) {
  const intake = (
    await readSupport(db, actor.token, "new", { feedbackOnly: true })
  ).intake;
  return supportCommand(db, actor.token, {
    operation: "feedback-create",
    requestKey: randomUUID(),
    kind,
    rating: 1,
    description: "PRIVATE details must never enter an alert",
    ...(kind === "SUGGESTION"
      ? {
          outcome: "PRIVATE original proposed outcome",
          helps: "PRIVATE audience"
        }
      : {}),
    recipientId: intake.recipient?.id,
    recipientVersion: intake.recipient?.version,
    notice: FEEDBACK_NOTICE,
    consent: true,
    contactAllowed: !!channels.length,
    channels,
    allowIdea: kind === "SUGGESTION",
    publicAttribution: false
  });
}
async function choices(
  caseId: string,
  channels: string[],
  extra: Record<string, unknown> = {}
) {
  const c = await db.supportCase.findUniqueOrThrow({
    where: { id: caseId },
    include: { feedback: true }
  });
  return supportCommand(db, f.memberA.token, {
    operation: "feedback-choices",
    requestKey: randomUUID(),
    caseId,
    expectedVersion: c.version,
    feedbackVersion: c.feedback!.version,
    contactAllowed: !!channels.length,
    channels,
    allowIdea: c.feedback!.allowIdea,
    publicAttribution: false,
    ...extra
  });
}
async function reply(caseId: string) {
  const c = await db.supportCase.findUniqueOrThrow({ where: { id: caseId } });
  const input = {
    operation: "reply",
    requestKey: randomUUID(),
    caseId,
    expectedVersion: c.version,
    body: "PRIVATE staff question"
  };
  const receipt = await supportCommand(db, f.owner.token, input);
  const retry = await supportCommand(db, f.owner.token, input);
  assert.equal(retry.caseId, receipt.caseId);
  assert.equal(retry.version, receipt.version);
  const event = await db.socialEvent.findFirstOrThrow({
    where: {
      sourceId: caseId,
      sourceVersion: receipt.version,
      recipientId: f.memberA.id
    }
  });
  return {
    event,
    rows: await db.notificationDelivery.findMany({
      where: { eventId: event.id }
    })
  };
}
async function saveIdea(caseId: string, fields: Record<string, unknown> = {}) {
  const s = await readFeedbackIdeaAdministration(db, f.owner.token, { caseId });
  return feedbackIdeaAdminCommand(db, f.owner.token, {
    operation: "idea-save",
    requestKey: randomUUID(),
    caseId,
    ...(s.idea ? { ideaId: s.idea.id } : {}),
    grantVersion: s.grantVersion,
    expectedVersion: s.idea?.version ?? 0,
    sourceVersion: s.source.version,
    feedbackVersion: s.source.feedbackVersion,
    sharingVersion: s.source.sharingVersion,
    title: "Reviewed public idea",
    summary: "A human reviewed public summary.",
    explanation: "A clear reviewed status explanation.",
    status: "CONSIDERING",
    reviewed: true,
    ...fields
  });
}
async function subscribe(
  ideaId: string,
  actor: PortalActor,
  channels = { inApp: true, email: false, push: false }
) {
  const s = await readFeedbackIdeas(db, actor.token, { id: ideaId });
  return feedbackIdeaInterestCommand(db, actor.token, {
    operation: "idea-subscribe",
    mutationId: randomUUID(),
    ideaId,
    expectedVersion: s.detail!.version,
    interestVersion: s.interest!.subscriptionVersion,
    ...channels
  });
}
async function drain(ideaId: string) {
  const jobs = await db.notificationFanoutJob.findMany({
    where: { sourceId: ideaId, completedAt: null }
  });
  for (const job of jobs) {
    let done = false;
    for (let n = 0; n < 5 && !done; n++)
      done = (await processNotificationFanoutBatch(db, job.id)).done;
    assert.equal(done, true);
    assert.equal(
      (await processNotificationFanoutBatch(db, job.id)).processed,
      0
    );
  }
}

test("ratings create no alerts; explicit email-only follow-up uses one generic durable email and no Activity", async () => {
  await preferences(f.memberA, true);
  const c = await submission(["EMAIL"]);
  assert.equal(
    await db.socialEvent.count({ where: { sourceId: c.caseId } }),
    0
  );
  const { event, rows } = await reply(c.caseId);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].channel, "EMAIL");
  assert.equal(rows[0].subscriptionId, null);
  assert.equal(
    (await readActivity(db, f.memberA.token, { category: "feedback" })).items
      .length,
    0
  );
  assert.equal(
    (await openActivity(db, f.memberA.token, event.id)).available,
    false
  );
  assert.doesNotMatch(
    JSON.stringify([event, rows], (_, v) =>
      typeof v === "bigint" ? String(v) : v
    ),
    /PRIVATE|@example/
  );
  await db.$transaction((tx) => enqueueNotification(tx, event));
  assert.equal(
    await db.notificationDelivery.count({ where: { eventId: event.id } }),
    1
  );
  const sink = feedbackEmailTransport(accountConfig());
  const result = await deliverNotification(
    db,
    rows[0].id,
    noPush,
    new Date(),
    sink
  );
  assert.deepEqual(result, { done: true, outcome: "accepted" });
  assert.equal(
    (await deliverNotification(db, rows[0].id, noPush, new Date(), sink)).done,
    true
  );
  const payload = JSON.parse(
    await readFile(
      join(accountConfig().sinkDirectory!, `feedback-${rows[0].id}.json`),
      "utf8"
    )
  );
  assert.match(
    payload.text,
    new RegExp(`/platform/feedback/cases/${c.caseId}`)
  );
  assert.doesNotMatch(
    JSON.stringify(payload),
    /PRIVATE|1 out of 5|support_owner/
  );
  assert.equal(payload.to.length, 1);
});

test("independent current in-app, phone and email selections survive unrelated edits and stop after withdrawal", async () => {
  const keys = webpush.generateVAPIDKeys();
  Object.assign(process.env, {
    PUSH_ENABLED: "true",
    PUSH_VAPID_PUBLIC_KEY: keys.publicKey,
    PUSH_VAPID_PRIVATE_KEY: keys.privateKey,
    PUSH_VAPID_SUBJECT: "https://example.test/contact"
  });
  await seedNotificationDevice(db, f.memberA);
  await preferences(f.memberA, true, true);
  const c = await submission(["IN_APP", "EMAIL", "PUSH"]);
  const before = await db.feedbackSubmission.findUniqueOrThrow({
    where: { caseId: c.caseId }
  });
  await choices(c.caseId, ["IN_APP", "EMAIL", "PUSH"]);
  const { event, rows } = await reply(c.caseId);
  assert.deepEqual(rows.map((r) => r.channel).sort(), ["EMAIL", "PUSH"]);
  assert.equal(
    (
      await db.feedbackSubmission.findUniqueOrThrow({
        where: { caseId: c.caseId }
      })
    ).contactEmailSince!.getTime(),
    before.contactEmailSince!.getTime()
  );
  const activity = await readActivity(db, f.memberA.token, {
    category: "feedback"
  });
  assert.equal(activity.items.length, 1);
  assert.equal(activity.items[0].available, true);
  assert.equal(activity.items[0].href, `/platform/feedback/cases/${c.caseId}`);
  await choices(c.caseId, []);
  assert.equal(
    (await readActivity(db, f.memberA.token, { category: "feedback" })).items
      .length,
    0
  );
  let attempts = 0;
  for (const row of rows)
    assert.deepEqual(
      await deliverNotification(
        db,
        row.id,
        async () => {
          attempts++;
          return 201;
        },
        new Date(),
        async () => {
          attempts++;
          return 200;
        }
      ),
      { done: true, outcome: "cancelled" }
    );
  assert.equal(attempts, 0);
  await choices(c.caseId, ["IN_APP", "EMAIL", "PUSH"]);
  for (const channel of [false, true, "EMAIL"] as const)
    assert.equal(
      await db.$transaction((tx) => notificationSource(tx, event, channel)),
      null
    );
  const fresh = await reply(c.caseId),
    phone = fresh.rows.find((r) => r.channel === "PUSH")!;
  let payload: unknown;
  assert.deepEqual(
    await deliverNotification(db, phone.id, async (_subscription, sent) => {
      payload = sent;
      return 201;
    }),
    { done: true, outcome: "accepted" }
  );
  assert.deepEqual(Object.keys(payload as object).sort(), [
    "deliveryId",
    "tag"
  ]);
});

test("one shared lease retries a lost email acknowledgment with a stable key and cancels after credential change", async () => {
  await preferences(f.memberA, true);
  const c = await submission(["EMAIL"]),
    first = await reply(c.caseId),
    row = first.rows[0];
  const payloads: Array<{ body: string; key: string }> = [];
  const config = {
    ...accountConfig(),
    delivery: "resend" as const,
    resend: { apiKey: "re_synthetic_never_sent", from: "accounts@example.test" }
  };
  const transport = feedbackEmailTransport(config, (async (_url, options) => {
    payloads.push({
      body: String(options!.body),
      key: (options!.headers as Record<string, string>)["Idempotency-Key"]
    });
    return payloads.length === 1
      ? new Response("not-readable", { status: 200 })
      : Response.json({ id: "fixture-accepted" });
  }) as typeof fetch);
  const result = await deliverNotification(
    db,
    row.id,
    noPush,
    new Date(),
    transport
  );
  assert.equal(result.done, false);
  const queued = await db.notificationDelivery.findUniqueOrThrow({
    where: { id: row.id }
  });
  assert.deepEqual(
    await deliverNotification(
      db,
      row.id,
      noPush,
      new Date(queued.availableAt.getTime() + 1),
      transport
    ),
    { done: true, outcome: "accepted" }
  );
  assert.deepEqual(payloads[0], payloads[1]);
  const next = await reply(c.caseId);
  await db.platformUser.update({
    where: { id: f.memberA.id },
    data: { credentialVersion: { increment: 1 } }
  });
  assert.deepEqual(
    await deliverNotification(
      db,
      next.rows[0].id,
      noPush,
      new Date(),
      transport
    ),
    { done: true, outcome: "finished" }
  );
  assert.equal(
    (
      await db.notificationDelivery.findUniqueOrThrow({
        where: { id: next.rows[0].id }
      })
    ).outcome,
    "CANCELLED"
  );
  assert.equal(payloads.length, 2);
});

test("concurrent consumers send once; expiry, current owner authority and read receipts cancel before transport", async () => {
  await preferences(f.memberA, true);
  const c = await submission(["EMAIL"]),
    first = await reply(c.caseId);
  let calls = 0;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let started!: () => void;
  const began = new Promise<void>((resolve) => {
    started = resolve;
  });
  const sending = deliverNotification(
    db,
    first.rows[0].id,
    noPush,
    new Date(),
    async () => {
      calls++;
      started();
      await gate;
      return 200;
    }
  );
  await began;
  assert.equal(
    (
      await deliverNotification(
        db,
        first.rows[0].id,
        noPush,
        new Date(),
        async () => {
          calls++;
          return 200;
        }
      )
    ).done,
    false
  );
  release();
  assert.equal((await sending).done, true);
  assert.equal(calls, 1);
  const expired = await reply(c.caseId);
  assert.deepEqual(
    await deliverNotification(
      db,
      expired.rows[0].id,
      noPush,
      new Date(expired.rows[0].expiresAt.getTime() + 1),
      async () => {
        calls++;
        return 200;
      }
    ),
    { done: true, outcome: "cancelled" }
  );
  const read = await reply(c.caseId);
  await supportCommand(db, f.memberA.token, {
    operation: "mark-read",
    requestKey: randomUUID(),
    caseId: c.caseId,
    expectedVersion: read.event.sourceVersion
  });
  assert.deepEqual(
    await deliverNotification(
      db,
      read.rows[0].id,
      noPush,
      new Date(),
      async () => {
        calls++;
        return 200;
      }
    ),
    { done: true, outcome: "cancelled" }
  );
  const revoked = await reply(c.caseId);
  await db.supportCapabilityGrant.update({
    where: { id: f.ownerGrant.id },
    data: { revokedAt: new Date() }
  });
  assert.deepEqual(
    await deliverNotification(
      db,
      revoked.rows[0].id,
      noPush,
      new Date(),
      async () => {
        calls++;
        return 200;
      }
    ),
    { done: true, outcome: "cancelled" }
  );
  assert.equal(calls, 1);
});

test("global email withdrawal is protected, older clients preserve new choices, and recovery cannot restore sends", async () => {
  await preferences(f.memberA, true);
  const c = await submission(["EMAIL"]),
    pending = await reply(c.caseId);
  const old = await readNotificationPreferences(db, f.memberA.token);
  // Pin the historical form instead of deriving an impossible old client from
  // future categories that it never displayed.
  const inApp = Object.fromEntries(
    [
      "messages", "requests", "reports", "founder", "replies", "mentions",
      "conversations", "prayer", "posts", "reactions", "church",
      "commitments", "photos", "exchange"
    ].map((category) => [
      category,
      old.preferences.inApp[category as keyof typeof old.preferences.inApp]
    ])
  );
  await notificationPreferenceCommand(db, f.memberA.token, {
    operation: "preferences",
    mutationId: randomUUID(),
    ownerId: f.memberA.id,
    expectedVersion: old.preferences.version,
    inApp,
    pushCategories: [],
    quietHours: null
  });
  assert.equal(
    (await readNotificationPreferences(db, f.memberA.token)).preferences
      .feedbackEmail,
    true
  );
  await preferences(f.memberA, false);
  const control = await db.retentionControl.findFirstOrThrow({
    where: { kind: "NOTIFICATION_PREFERENCES", sourceId: f.memberA.id },
    orderBy: { version: "desc" }
  });
  assert.ok(control.journaledAt);
  await db.socialPreferences.update({
    where: { ownerId: f.memberA.id },
    data: {
      notificationVersion: control.version - 1,
      feedbackEmailSince: new Date(0)
    }
  });
  await replayRetentionControls(db, [
    control.payload as unknown as RetentionControlEntry
  ]);
  const restored = await readNotificationPreferences(db, f.memberA.token);
  assert.equal(restored.preferences.feedbackEmail, false);
  assert.equal(restored.preferences.recoveryRequired, true);
  let calls = 0;
  assert.deepEqual(
    await deliverNotification(
      db,
      pending.rows[0].id,
      noPush,
      new Date(),
      async () => {
        calls++;
        return 200;
      }
    ),
    { done: true, outcome: "cancelled" }
  );
  assert.equal(calls, 0);
  await preferences(f.memberA, true);
  assert.equal(
    (await db.$transaction((tx) =>
      notificationSource(tx, pending.event, "EMAIL")
    )) !== null,
    true
  );
  await db.$transaction((tx) => enqueueNotification(tx, pending.event));
  assert.equal(
    await db.notificationDelivery.count({
      where: { eventId: pending.event.id }
    }),
    1
  );
});

test("reviewed status fanout preserves original subscriptions, excludes late merges, and stops on unmerge or privacy withdrawal", async () => {
  const a = await submission([], "SUGGESTION"),
    b = await submission([], "SUGGESTION", f.memberB);
  const root = await saveIdea(a.caseId),
    child = await saveIdea(b.caseId);
  await subscribe(child.id, f.memberA);
  await saveIdea(a.caseId, { status: "PLANNED" });
  const s = await readFeedbackIdeaAdministration(db, f.owner.token, {
    caseId: b.caseId
  });
  const currentRoot = await db.feedbackIdea.findUniqueOrThrow({
    where: { id: root.id }
  });
  await feedbackIdeaAdminCommand(db, f.owner.token, {
    operation: "idea-merge",
    reviewed: true,
    requestKey: randomUUID(),
    ideaId: child.id,
    expectedVersion: s.idea!.version,
    grantVersion: s.grantVersion,
    destinationId: root.id,
    destinationVersion: currentRoot.version,
    explanation: "These ideas describe the same useful change."
  });
  await drain(root.id);
  assert.equal(
    await db.socialEvent.count({
      where: { sourceId: root.id, recipientId: f.memberA.id }
    }),
    0
  );
  await saveIdea(a.caseId, { status: "BUILDING" });
  await drain(root.id);
  const event = await db.socialEvent.findFirstOrThrow({
    where: { sourceId: root.id, recipientId: f.memberA.id }
  });
  assert.equal(
    (await readActivity(db, f.memberA.token, { category: "feedback" })).items
      .length,
    1
  );
  const merged = await readFeedbackIdeaAdministration(db, f.owner.token, {
    caseId: b.caseId
  });
  await feedbackIdeaAdminCommand(db, f.owner.token, {
    operation: "idea-unmerge",
    reviewed: true,
    requestKey: randomUUID(),
    ideaId: child.id,
    expectedVersion: merged.idea!.version,
    grantVersion: merged.grantVersion,
    destinationVersion: (
      await db.feedbackIdea.findUniqueOrThrow({ where: { id: root.id } })
    ).version,
    explanation: "These ideas now need separate consideration."
  });
  assert.equal(
    (await openActivity(db, f.memberA.token, event.id)).available,
    false
  );
  assert.equal(
    (await readActivity(db, f.memberA.token, { category: "feedback" })).items
      .length,
    0
  );
  await subscribe(root.id, f.memberA);
  await saveIdea(a.caseId, { status: "TESTING" });
  await drain(root.id);
  assert.equal(
    (await readActivity(db, f.memberA.token, { category: "feedback" })).items
      .length,
    1
  );
  await choices(a.caseId, [], { allowIdea: false });
  assert.equal(
    (await readActivity(db, f.memberA.token, { category: "feedback" })).items
      .length,
    0
  );
});

test("multi-page idea fanout deduplicates recipients and ignores late subscriptions and unreviewed edits", async () => {
  const c = await submission([], "SUGGESTION"),
    idea = await saveIdea(c.caseId);
  const people = [];
  for (let n = 0; n < 22; n++) {
    const actor = await createPortalActor(db, "idearead");
    people.push(actor);
    await subscribe(idea.id, actor);
  }
  await saveIdea(c.caseId, {
    explanation: "A revised explanation, with the same status."
  });
  assert.equal(
    await db.notificationFanoutJob.count({ where: { sourceId: idea.id } }),
    0
  );
  await saveIdea(c.caseId, { status: "PLANNED" });
  const late = await createPortalActor(db, "idealateread");
  await subscribe(idea.id, late);
  const job = await db.notificationFanoutJob.findFirstOrThrow({
    where: { sourceId: idea.id }
  });
  const work = await Promise.all([
    processNotificationFanoutBatch(db, job.id),
    processNotificationFanoutBatch(db, job.id)
  ]);
  assert.equal(
    work.reduce((sum, r) => sum + r.processed, 0),
    22
  );
  await drain(idea.id);
  assert.equal(
    await db.socialEvent.count({ where: { sourceId: idea.id } }),
    22
  );
  assert.equal(
    await db.socialEvent.count({
      where: { sourceId: idea.id, recipientId: late.id }
    }),
    0
  );
  assert.equal(
    await db.notificationDelivery.count({
      where: { event: { sourceId: idea.id } }
    }),
    0
  );
});

test("email queue works without phone configuration and feature disable prevents requester transport", async () => {
  await preferences(f.memberA, true);
  const c = await submission(["EMAIL"]),
    { rows } = await reply(c.caseId);
  const ids: string[] = [];
  assert.deepEqual(
    await dispatchNotifications(db, c.caseId, async (id) => {
      ids.push(id);
    }),
    { queued: 1, failed: 0 }
  );
  assert.deepEqual(ids, [rows[0].id]);
  process.env.FEEDBACK_FOLLOWUP_ENABLED = "false";
  let attempts = 0;
  assert.deepEqual(
    await deliverNotification(db, rows[0].id, noPush, new Date(), async () => {
      attempts++;
      return 200;
    }),
    { done: true, outcome: "cancelled" }
  );
  assert.equal(attempts, 0);
});

test("delivery identities cannot be reassigned, email requires its current recipient, and unconsented status changes create no alerts", async () => {
  await preferences(f.memberA, true);
  const c = await submission(["EMAIL"]),
    { event, rows } = await reply(c.caseId);
  await assert.rejects(
    db.notificationDelivery.update({
      where: { id: rows[0].id },
      data: { emailCredentialVersion: rows[0].emailCredentialVersion! + 1 }
    })
  );
  await assert.rejects(
    db.notificationDelivery.update({
      where: { id: rows[0].id },
      data: { channel: "PUSH" }
    })
  );
  await assert.rejects(
    db.notificationDelivery.create({
      data: {
        eventId: event.id,
        ownerId: f.memberB.id,
        channel: "EMAIL",
        emailCredentialVersion: 1,
        expiresAt: rows[0].expiresAt
      }
    })
  );
  const privateOnly = await submission();
  await assert.rejects(
    supportCommand(db, f.owner.token, {
      operation: "reply",
      requestKey: randomUUID(),
      caseId: privateOnly.caseId,
      expectedVersion: 1,
      body: "A question without permission"
    })
  );
  await supportCommand(db, f.owner.token, {
    operation: "transition",
    requestKey: randomUUID(),
    caseId: privateOnly.caseId,
    expectedVersion: 1,
    status: "RESOLVED",
    reason: "A reviewed explanation retained with this private case."
  });
  assert.equal(
    await db.socialEvent.count({ where: { sourceId: privateOnly.caseId } }),
    0
  );
});
