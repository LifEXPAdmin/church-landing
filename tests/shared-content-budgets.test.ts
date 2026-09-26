import test, { after, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import {
  assertPortalTestDatabase,
  createPortalActor,
  seedOperatorGrants
} from "./seed-portal";
import { accountConfig } from "../lib/platform/account-config";
import { AccountError } from "../lib/platform/account-error";
import { PortalError } from "../lib/platform/portal-policy";
import { postCommand } from "../lib/platform/post-commands";
import { handlePostRequest } from "../lib/platform/post-boundary";
import { adultContactCommand } from "../lib/platform/adult-contact";
import { adultMessageCommand } from "../lib/platform/adult-messages";
import {
  communityReportCommand,
  readCommunityReports
} from "../lib/platform/community-reports";
import { socialWriteInput } from "../lib/platform/social-boundary";

// createPortalActor clears limiter rows. Run this file serially in its isolated
// fixture; the independent clients below deliberately contend within each test.
const db = new PrismaClient(),
  other = new PrismaClient();
const variables = [
  "COMMUNITY_REPORTS_ENABLED",
  "COMMUNITY_REPORTS_PER_10_MINUTES",
  "COMMUNITY_POSTS_PER_HOUR"
];
const initial = variables.map((name) => process.env[name]);
before(async () => {
  await assertPortalTestDatabase(db);
  await assertPortalTestDatabase(other);
});
beforeEach(() => {
  process.env.COMMUNITY_REPORTS_ENABLED = "true";
  process.env.COMMUNITY_REPORTS_PER_10_MINUTES = "2";
  process.env.COMMUNITY_POSTS_PER_HOUR = "1";
});
after(async () => {
  variables.forEach((name, index) => {
    if (initial[index] === undefined) delete process.env[name];
    else process.env[name] = initial[index];
  });
  await Promise.all([db.$disconnect(), other.$disconnect()]);
});
const input = (operation: string, fields: Record<string, unknown>) => ({
  operation,
  mutationId: randomUUID(),
  ...fields
});
const key = (ownerId: string, activity: string) =>
  createHmac("sha256", accountConfig().rateSecret)
    .update(`activity:${activity}:${ownerId}`)
    .digest("hex");
const bucket = (ownerId: string, activity: string) =>
  db.platformAuthLimit.findUnique({ where: { key: key(ownerId, activity) } });
const denied = (work: Promise<unknown>, status: number) =>
  assert.rejects(
    work,
    (error: unknown) => error instanceof PortalError && error.status === status
  );
async function oneSlot<T>(attempts: Promise<T>[], seconds: number) {
  const results = await Promise.allSettled(attempts);
  const winner = results.findIndex((result) => result.status === "fulfilled");
  assert.notEqual(winner, -1);
  assert.equal(
    results.filter((result) => result.status === "fulfilled").length,
    1
  );
  for (const result of results) {
    if (result.status === "fulfilled") continue;
    assert.ok(result.reason instanceof PortalError);
    assert.equal(result.reason.status, 429);
    assert.equal(typeof result.reason.retryAfter, "number");
    assert.ok(
      result.reason.retryAfter! > 0 && result.reason.retryAfter! <= seconds
    );
  }
  const saved = results[winner];
  assert.equal(saved.status, "fulfilled");
  return { index: winner, saved: saved.value };
}

test("two clients share the final post slot; validation rolls back and revoked sessions cannot replay", async () => {
  const actor = await createPortalActor(db, "sharedpost");
  const bodies = [0, 1].map((index) => ({
    operation: "create",
    requestKey: randomUUID(),
    content: `Fictional competing post ${index}`
  }));
  await denied(
    postCommand(db, actor.token, {
      ...bodies[0],
      content: "x".repeat(3001)
    }),
    400
  );
  assert.equal(await bucket(actor.id, "community-post"), null);
  assert.equal(
    await db.socialOperation.count({ where: { ownerId: actor.id } }),
    0
  );
  const { index, saved } = await oneSlot(
    [
      postCommand(db, actor.token, bodies[0]),
      postCommand(other, actor.token, bodies[1])
    ],
    3600
  );
  assert.equal((await bucket(actor.id, "community-post"))!.hits, 1);
  assert.equal(
    await db.platformPost.count({ where: { authorId: actor.id } }),
    1
  );
  assert.equal(
    await db.socialOperation.count({ where: { ownerId: actor.id } }),
    1
  );
  assert.deepEqual(await postCommand(other, actor.token, bodies[index]), saved);
  await denied(
    postCommand(other, actor.token, {
      ...bodies[index],
      content: "Changed receipt body"
    }),
    409
  );
  await db.platformUser.update({
    where: { id: actor.id },
    data: { credentialVersion: { increment: 1 } }
  });
  await assert.rejects(
    postCommand(other, actor.token, bodies[index]),
    (error: unknown) =>
      error instanceof AccountError && error.code === "session"
  );
  assert.equal((await bucket(actor.id, "community-post"))!.hits, 1);
});

test("two clients share final DM slots; day denial rolls back minute usage and current eligibility gates replay", async () => {
  const sender = await createPortalActor(db, "sharedsend");
  const recipient = await createPortalActor(db, "sharedrecv");
  const reviewer = await createPortalActor(db, "sharedops");
  await seedOperatorGrants(db, reviewer, ["REVIEW_COMMUNITY_REPORTS"]);
  const preference = await db.socialPreferences.upsert({
    where: { ownerId: recipient.id },
    create: { ownerId: recipient.id, contactRequests: "EVERYONE" },
    update: { contactRequests: "EVERYONE", version: { increment: 1 } }
  });
  const request = await adultContactCommand(
    db,
    sender.token,
    input("create", {
      recipientId: recipient.id,
      purpose: "Fictional consent for shared-budget verification",
      expectedRecipientVersion: preference.version
    })
  );
  await adultContactCommand(
    db,
    recipient.token,
    input("accept", {
      id: request.id,
      expectedVersion: request.version
    })
  );
  const accepted = await db.adultContactRequest.findUniqueOrThrow({
    where: { id: request.id }
  });
  const conversation = await db.adultConversation.findUniqueOrThrow({
    where: { id: accepted.conversationId! }
  });
  for (const [activity, hits, seconds] of [
    ["adult-message-minute", 29, 60],
    ["adult-message-day", 499, 86400]
  ] as const) {
    await db.platformAuthLimit.create({
      data: {
        key: key(sender.id, activity),
        hits,
        expiresAt: new Date(Date.now() + seconds * 1000)
      }
    });
  }
  const bodies = [0, 1].map((index) =>
    input("send", {
      conversationId: conversation.id,
      expectedVersion: conversation.version,
      content: `Fictional competing message ${index}`
    })
  );
  const { index, saved } = await oneSlot(
    [
      adultMessageCommand(db, sender.token, bodies[0]),
      adultMessageCommand(other, sender.token, bodies[1])
    ],
    60
  );
  assert.equal((await bucket(sender.id, "adult-message-minute"))!.hits, 30);
  assert.equal((await bucket(sender.id, "adult-message-day"))!.hits, 500);
  await db.platformAuthLimit.update({
    where: { key: key(sender.id, "adult-message-minute") },
    data: { hits: 0 }
  });
  await denied(
    adultMessageCommand(other, sender.token, bodies[1 - index]),
    429
  );
  assert.equal((await bucket(sender.id, "adult-message-minute"))!.hits, 0);
  assert.equal((await bucket(sender.id, "adult-message-day"))!.hits, 500);
  process.env.COMMUNITY_REPORTS_ENABLED = "false";
  assert.deepEqual(
    await adultMessageCommand(other, sender.token, bodies[index]),
    saved
  );
  await denied(
    adultMessageCommand(other, sender.token, {
      ...bodies[index],
      content: "Changed receipt body"
    }),
    409
  );
  await db.platformUser.update({
    where: { id: sender.id },
    data: { emailVerifiedAt: null }
  });
  await denied(adultMessageCommand(other, sender.token, bodies[index]), 403);
  assert.equal(
    await db.adultMessage.count({ where: { conversationId: conversation.id } }),
    1
  );
  assert.equal(
    await db.socialOperation.count({
      where: { ownerId: sender.id, key: { startsWith: "adult-message:" } }
    }),
    1
  );
});

test("two clients share the final report slot; bounded details and revoked review authority preserve receipts", async () => {
  const reporter = await createPortalActor(db, "sharedrep");
  const author = await createPortalActor(db, "sharedsrc");
  const reviewer = await createPortalActor(db, "sharedrev");
  await seedOperatorGrants(db, reviewer, ["REVIEW_COMMUNITY_REPORTS"]);
  const bodies = [];
  for (let index = 0; index < 3; index++) {
    const post = await db.platformPost.create({
      data: {
        authorId: author.id,
        content: `Fictional report source ${index}`
      }
    });
    const view = await readCommunityReports(db, reporter.token, {
      view: "target",
      targetType: "POST",
      targetId: post.id
    });
    assert.ok(view.target);
    bodies.push(
      input("create", {
        targetType: "POST",
        targetId: post.id,
        expectedTargetVersion: view.target.version,
        expectedContextVersion: view.target.contextVersion,
        reason: "SPAM",
        details: "x".repeat(2000)
      })
    );
  }
  await denied(
    communityReportCommand(db, reporter.token, {
      ...bodies[0],
      details: "x".repeat(2001)
    }),
    400
  );
  assert.equal(await bucket(reporter.id, "community-report"), null);
  assert.equal(
    await db.socialOperation.count({ where: { ownerId: reporter.id } }),
    0
  );
  await communityReportCommand(db, reporter.token, bodies[0]);
  const { index, saved } = await oneSlot(
    [
      communityReportCommand(db, reporter.token, bodies[1]),
      communityReportCommand(other, reporter.token, bodies[2])
    ],
    600
  );
  assert.equal((await bucket(reporter.id, "community-report"))!.hits, 2);
  assert.equal(
    await db.communityReport.count({ where: { reporterId: reporter.id } }),
    2
  );
  assert.equal(
    await db.socialOperation.count({ where: { ownerId: reporter.id } }),
    2
  );
  process.env.COMMUNITY_REPORTS_ENABLED = "false";
  assert.deepEqual(
    await communityReportCommand(other, reporter.token, bodies[index + 1]),
    saved
  );
  await denied(
    communityReportCommand(other, reporter.token, {
      ...bodies[index + 1],
      details: "Changed receipt body"
    }),
    409
  );
  const review = input("resolve", {
    id: saved.id,
    expectedVersion: saved.version,
    resolution: "CLOSED",
    decisionReason: "Fictional isolated review complete"
  });
  const resolution = await communityReportCommand(db, reviewer.token, review);
  assert.deepEqual(
    await communityReportCommand(other, reviewer.token, review),
    resolution
  );
  await db.platformOperatorGrant.updateMany({
    where: { userId: reviewer.id, capability: "REVIEW_COMMUNITY_REPORTS" },
    data: { revokedAt: new Date() }
  });
  await denied(communityReportCommand(other, reviewer.token, review), 404);
  assert.equal(
    await db.communityReportDecision.count({ where: { reportId: saved.id } }),
    1
  );
  assert.equal((await bucket(reporter.id, "community-report"))!.hits, 2);
});

test("post, DM and report boundaries cancel oversized streams before canonical writes or activity charges", async () => {
  const actor = await createPortalActor(db, "sharedbody");
  function streamed(path: string) {
    const bytes = Buffer.from(
      JSON.stringify({
        operation: "create",
        mutationId: randomUUID(),
        content: "x".repeat(50000)
      })
    );
    let offset = 0,
      cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (offset === bytes.length) return controller.close();
        controller.enqueue(bytes.subarray(offset, offset + 1024));
        offset = Math.min(bytes.length, offset + 1024);
      },
      cancel() {
        cancelled = true;
      }
    });
    const request = new Request(accountConfig().origin + path, {
      method: "POST",
      body,
      duplex: "half",
      headers: {
        origin: accountConfig().origin,
        "content-type": "application/json",
        cookie: `church_platform_session=${actor.token}`,
        "x-expected-account": actor.id
      }
    } as RequestInit & { duplex: "half" });
    return { request, wasCancelled: () => cancelled, bytesRead: () => offset };
  }
  const post = streamed("/api/platform/posts");
  const response = await handlePostRequest(db, post.request);
  assert.equal(response.status, 400);
  assert.match(response.headers.get("cache-control")!, /no-store/);
  assert.ok(post.wasCancelled());
  // At most one overflowing 1 KiB chunk and one prefetched chunk are read.
  assert.ok(post.bytesRead() > 24576 && post.bytesRead() <= 24576 + 2048);
  for (const [path, domain] of [
    ["/api/platform/messages", "adult-messages"],
    ["/api/platform/community-reports", "community-reports"]
  ]) {
    const attempt = streamed(path);
    await denied(socialWriteInput(other, attempt.request, domain), 400);
    assert.ok(attempt.wasCancelled());
    assert.ok(
      attempt.bytesRead() > 32768 && attempt.bytesRead() <= 32768 + 2048
    );
  }
  assert.equal(
    await db.platformPost.count({ where: { authorId: actor.id } }),
    0
  );
  assert.equal(
    await db.adultMessage.count({ where: { senderId: actor.id } }),
    0
  );
  assert.equal(
    await db.communityReport.count({ where: { reporterId: actor.id } }),
    0
  );
  assert.equal(
    await db.socialOperation.count({ where: { ownerId: actor.id } }),
    0
  );
  for (const activity of [
    "community-post",
    "adult-message-minute",
    "adult-message-day",
    "community-report"
  ])
    assert.equal(await bucket(actor.id, activity), null);
});
