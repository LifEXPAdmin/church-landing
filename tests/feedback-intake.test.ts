import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { assertPortalTestDatabase } from "./seed-portal";
import { seedSupport } from "./seed-support";
import { readSupport, supportCommand } from "../lib/platform/support";
import { FEEDBACK_NOTICE } from "../lib/platform/feedback-policy";
import { handleFeedbackRequest } from "../lib/platform/feedback-boundary";
import { accountConfig } from "../lib/platform/account-config";
import {
  replayRetentionControls,
  type RetentionControlEntry
} from "../lib/platform/retention-controls";
import { eraseAdminPersonalData } from "../lib/platform/admin-privacy";

const db = new PrismaClient();
before(async () => {
  await assertPortalTestDatabase(db);
  process.env.FEEDBACK_INTAKE_ENABLED = "true";
  process.env.SUPPORT_INTAKE_ENABLED = "true";
});
after(() => db.$disconnect());
async function input(token: string, fields: Record<string, unknown> = {}) {
  const state = await readSupport(db, token, "new", { feedbackOnly: true });
  return {
    operation: "feedback-create",
    requestKey: randomUUID(),
    kind: "GENERAL",
    rating: null,
    description: "A fictional voluntary website experience.",
    recipientId: state.intake.recipient?.id,
    recipientVersion: state.intake.recipient?.version,
    notice: FEEDBACK_NOTICE,
    consent: true,
    contactAllowed: false,
    channels: [],
    allowIdea: false,
    publicAttribution: false,
    ...fields
  };
}
const deny = (promise: Promise<unknown>, status: number) =>
  assert.rejects(
    promise,
    (error: unknown) =>
      !!error &&
      typeof error === "object" &&
      "status" in error &&
      error.status === status
  );

test("rating-only and rating-free feedback create one native private case per key, with filtering before pagination", async () => {
  const f = await seedSupport(db);
  const data = await input(f.memberA.token, { rating: 2, description: "" });
  const [first, retry] = await Promise.all([
    supportCommand(db, f.memberA.token, data),
    supportCommand(db, f.memberA.token, data)
  ]);
  assert.equal(first.caseId, retry.caseId);
  assert.equal(
    await db.feedbackSubmission.count({ where: { caseId: first.caseId } }),
    1
  );
  assert.equal(
    await db.supportOperation.count({
      where: { actorId: f.memberA.id, requestKey: data.requestKey }
    }),
    1
  );
  await deny(supportCommand(db, f.memberA.token, { ...data, rating: 5 }), 409);
  const textOnly = await supportCommand(
    db,
    f.memberA.token,
    await input(f.memberA.token)
  );
  const feedback = (
    await readSupport(db, f.memberA.token, "detail", {
      caseId: first.caseId,
      feedbackOnly: true
    })
  ).detail!;
  assert.equal(feedback.feedback?.rating, 2);
  assert.equal(feedback.feedback?.notice, FEEDBACK_NOTICE);
  assert.equal(feedback.feedback?.contactAllowed, false);
  assert.equal(feedback.feedback?.allowIdea, false);
  assert.match(feedback.description, /2 out of 5/);
  assert.equal(
    (
      await db.feedbackSubmission.findUniqueOrThrow({
        where: { caseId: textOnly.caseId }
      })
    ).rating,
    null
  );
  await db.supportCase.createMany({
    data: Array.from({ length: 22 }, (_, n) => ({
      requesterId: f.memberA.id,
      ownerGrantId: f.ownerGrant.id,
      ownerGrantVersion: f.ownerGrant.version,
      category: "ACCOUNT_WEBSITE" as const,
      subject: `Fictional ordinary support ${n}`,
      description: "Not a feedback receipt."
    }))
  });
  const mine = await readSupport(db, f.memberA.token, "requests", {
    feedbackOnly: true
  });
  assert.deepEqual(
    new Set(mine.rows.map((r) => r.id)),
    new Set([first.caseId, textOnly.caseId])
  );
  assert.equal(mine.more, false);
  await deny(
    readSupport(db, f.memberB.token, "detail", {
      caseId: first.caseId,
      feedbackOnly: true
    }),
    404
  );
  assert.equal(
    (await readSupport(db, f.owner.token, "detail", { caseId: first.caseId }))
      .detail?.id,
    first.caseId
  );
  assert.equal(
    (await readSupport(db, f.owner.token, "requests", { feedbackOnly: true }))
      .rows.length,
    0
  );
});

test("bug and suggestion choices preserve safe context, separate publication and contact permission, and the native conversation", async () => {
  const f = await seedSupport(db);
  const saved = await supportCommand(
    db,
    f.memberA.token,
    await input(f.memberA.token, {
      kind: "BUG",
      actual: "The fictional button stayed busy.",
      expected: "The fictional operation should finish.",
      steps: "Open the fictional form.",
      technicalContext: {
        release: "2026.09.15.7",
        device: "PHONE",
        browser: "SAFARI",
        errorReference: "SAVE_UNCONFIRMED"
      }
    })
  );
  const row = await db.supportCase.findUniqueOrThrow({
    where: { id: saved.caseId },
    include: { feedback: true }
  });
  assert.equal(row.bugActual, "The fictional button stayed busy.");
  assert.equal(row.feedback?.contextDevice, "PHONE");
  await deny(
    supportCommand(db, f.owner.token, {
      operation: "reply",
      requestKey: randomUUID(),
      caseId: saved.caseId,
      expectedVersion: 1,
      body: "A fictional follow-up question."
    }),
    403
  );
  const choices = {
    operation: "feedback-choices",
    requestKey: randomUUID(),
    caseId: saved.caseId,
    expectedVersion: 1,
    feedbackVersion: 1,
    contactAllowed: true,
    channels: ["IN_APP"],
    allowIdea: false,
    publicAttribution: false
  };
  await deny(supportCommand(db, f.owner.token, choices), 404);
  await supportCommand(db, f.memberA.token, choices);
  const reply = await supportCommand(db, f.owner.token, {
    operation: "reply",
    requestKey: randomUUID(),
    caseId: saved.caseId,
    expectedVersion: 2,
    body: "A fictional follow-up question."
  });
  assert.equal(reply.version, 3);
  assert.equal(
    (await readSupport(db, f.memberA.token, "detail", { caseId: saved.caseId }))
      .detail?.messages.length,
    1
  );
  await supportCommand(db, f.memberA.token, {
    ...choices,
    requestKey: randomUUID(),
    expectedVersion: 3,
    feedbackVersion: 2,
    contactAllowed: false,
    channels: []
  });
  await deny(
    supportCommand(db, f.owner.token, {
      operation: "reply",
      requestKey: randomUUID(),
      caseId: saved.caseId,
      expectedVersion: 4,
      body: "This must not bypass withdrawal."
    }),
    403
  );
  const suggestion = await supportCommand(
    db,
    f.memberA.token,
    await input(f.memberA.token, {
      kind: "SUGGESTION",
      outcome: "Find the fictional gathering more easily.",
      helps: "Members choosing a fictional event.",
      allowIdea: true,
      publicAttribution: false
    })
  );
  const idea = await db.feedbackSubmission.findUniqueOrThrow({
    where: { caseId: suggestion.caseId }
  });
  assert.equal(idea.allowIdea, true);
  assert.equal(idea.publicAttribution, false);
  assert.equal(idea.contactAllowed, false);
});

test("invalid or unready intake leaves no receipt and a metadata failure rolls back the native case atomically", async () => {
  const f = await seedSupport(db);
  const base = await input(f.memberA.token);
  for (const invalid of [
    { rating: null, description: "" },
    { rating: 0 },
    { rating: "4" },
    {
      technicalContext: {
        release: "2026.09.15.7",
        device: "PHONE",
        browser: "SAFARI",
        url: "https://example.invalid/private?secret=fixture"
      }
    },
    { publicAttribution: true },
    { contactAllowed: false, channels: ["EMAIL"] }
  ])
    await deny(
      supportCommand(db, f.memberA.token, { ...base, ...invalid }),
      400
    );
  process.env.FEEDBACK_INTAKE_ENABLED = "false";
  try {
    assert.equal(
      (await readSupport(db, f.memberA.token, "new", { feedbackOnly: true }))
        .intake.available,
      false
    );
    await deny(supportCommand(db, f.memberA.token, base), 503);
  } finally {
    process.env.FEEDBACK_INTAKE_ENABLED = "true";
  }
  await deny(
    supportCommand(db, f.memberA.token, { ...base, recipientVersion: 999 }),
    409
  );
  const before = await db.supportCase.count({
    where: { requesterId: f.memberA.id }
  });
  await db.$executeRawUnsafe(
    "ALTER TABLE \"FeedbackSubmission\" ADD CONSTRAINT feedback_test_rejection CHECK (kind <> 'BUG') NOT VALID"
  );
  try {
    await assert.rejects(
      supportCommand(db, f.memberA.token, {
        ...base,
        kind: "BUG",
        actual: "Fictional failed save.",
        expected: "Save both records."
      })
    );
  } finally {
    await db.$executeRawUnsafe(
      'ALTER TABLE "FeedbackSubmission" DROP CONSTRAINT feedback_test_rejection'
    );
  }
  assert.equal(
    await db.supportCase.count({ where: { requesterId: f.memberA.id } }),
    before
  );
  assert.equal(
    await db.supportOperation.count({ where: { actorId: f.memberA.id } }),
    0
  );
});

test("whole-case privacy recovery clears restored feedback and source text without treating ordinary admin edits as full redaction", async () => {
  const f = await seedSupport(db);
  const saved = await supportCommand(
    db,
    f.memberA.token,
    await input(f.memberA.token, {
      rating: 4,
      contactAllowed: true,
      channels: ["IN_APP"],
      technicalContext: {
        release: "2026.09.15.7",
        device: "COMPUTER",
        browser: "CHROME"
      }
    })
  );
  const original = await db.feedbackSubmission.findUniqueOrThrow({
    where: { caseId: saved.caseId }
  });
  await supportCommand(db, f.owner.token, {
    operation: "redact",
    requestKey: randomUUID(),
    caseId: saved.caseId,
    expectedVersion: 1,
    reason: "PRIVATE_INFORMATION"
  });
  let row = await db.feedbackSubmission.findUniqueOrThrow({
    where: { caseId: saved.caseId }
  });
  assert.equal(row.rating, null);
  assert.equal(row.contactAllowed, false);
  assert.equal(row.contextRelease, null);
  assert.ok(row.redactedAt);
  const controls = await db.retentionControl.findMany({
    where: { kind: "ADMIN_SUPPORT", sourceId: saved.caseId }
  });
  assert.equal(controls.length, 1);
  assert.equal(
    (controls[0].payload as RetentionControlEntry).outcome,
    "CASE_REDACTED"
  );
  // Emulate old private rows restored under their older native/admin versions.
  await db.feedbackSubmission.update({
    where: { caseId: saved.caseId },
    data: original
  });
  await db.supportCase.update({
    where: { id: saved.caseId },
    data: {
      subject: "Fictional old private subject",
      description: "Fictional old private description",
      version: 1,
      adminVersion: 0
    }
  });
  const removed = controls[0].payload as RetentionControlEntry;
  await replayRetentionControls(db, [
    {
      ...removed,
      id: randomUUID(),
      version: removed.version + 1,
      outcome: "QUARANTINED"
    },
    removed
  ]);
  row = await db.feedbackSubmission.findUniqueOrThrow({
    where: { caseId: saved.caseId }
  });
  assert.equal(row.rating, null);
  assert.equal(row.contextRelease, null);
  assert.equal(
    (await db.supportCase.findUniqueOrThrow({ where: { id: saved.caseId } }))
      .description,
    "[Removed for privacy.]"
  );
  const other = await supportCommand(
    db,
    f.memberB.token,
    await input(f.memberB.token, { rating: 5 })
  );
  await db.$transaction((tx) =>
    eraseAdminPersonalData(tx, f.memberB.id, new Date())
  );
  assert.equal(
    (
      await db.feedbackSubmission.findUniqueOrThrow({
        where: { caseId: other.caseId }
      })
    ).rating,
    null
  );
});

test("feedback HTTP reads and writes require the current owner, reject cross-site changes and return private responses", async () => {
  const f = await seedSupport(db);
  const headers = {
    cookie: `church_platform_session=${f.memberA.token}`,
    "x-expected-account": f.memberA.id
  };
  const origin = accountConfig().origin;
  const read = await handleFeedbackRequest(
    db,
    new Request(origin + "/api/platform/feedback?view=new", { headers })
  );
  assert.equal(read.status, 200);
  assert.match(read.headers.get("cache-control")!, /no-store/);
  assert.match(read.headers.get("x-robots-tag")!, /noindex/);
  const body = JSON.stringify(
    await input(f.memberA.token, { rating: 3, description: "" })
  );
  const foreign = await handleFeedbackRequest(
    db,
    new Request(origin + "/api/platform/feedback", {
      method: "POST",
      headers: {
        ...headers,
        origin: "https://example.invalid",
        "content-type": "application/json"
      },
      body
    })
  );
  assert.equal(foreign.status, 403);
  const switched = await handleFeedbackRequest(
    db,
    new Request(origin + "/api/platform/feedback?view=new", {
      headers: { ...headers, "x-expected-account": f.memberB.id }
    })
  );
  assert.equal(switched.status, 401);
  const sent = await handleFeedbackRequest(
    db,
    new Request(origin + "/api/platform/feedback", {
      method: "POST",
      headers: { ...headers, origin, "content-type": "application/json" },
      body
    })
  );
  assert.equal(sent.status, 200);
  const receipt = await sent.json();
  assert.equal(typeof receipt.caseId, "string");
  assert.equal(
    (
      await db.feedbackSubmission.findUniqueOrThrow({
        where: { caseId: receipt.caseId }
      })
    ).rating,
    3
  );
});

test("selected-message redaction replays privately while preserving a newer resolution and exact native versions", async () => {
  const f = await seedSupport(db);
  const saved = await supportCommand(
    db,
    f.memberA.token,
    await input(f.memberA.token, {
      contactAllowed: true,
      channels: ["IN_APP"]
    })
  );
  await supportCommand(db, f.owner.token, {
    operation: "transition",
    requestKey: randomUUID(),
    caseId: saved.caseId,
    expectedVersion: 1,
    status: "RESOLVED",
    reason: "Fictional earlier resolution."
  });
  const earlier = await db.supportMessage.findFirstOrThrow({
    where: { caseId: saved.caseId, kind: "RESOLUTION" }
  });
  await supportCommand(db, f.memberA.token, {
    operation: "reopen",
    requestKey: randomUUID(),
    caseId: saved.caseId,
    expectedVersion: 2,
    reason: "The fictional issue needs another check."
  });
  await supportCommand(db, f.owner.token, {
    operation: "transition",
    requestKey: randomUUID(),
    caseId: saved.caseId,
    expectedVersion: 3,
    status: "RESOLVED",
    reason: "Fictional newer safe resolution."
  });
  await supportCommand(db, f.owner.token, {
    operation: "redact",
    requestKey: randomUUID(),
    caseId: saved.caseId,
    expectedVersion: 4,
    messageId: earlier.id,
    reason: "PRIVATE_INFORMATION"
  });
  let source = await db.supportCase.findUniqueOrThrow({
    where: { id: saved.caseId }
  });
  assert.equal(source.version, 5);
  assert.equal(source.resolution, "Fictional newer safe resolution.");
  const control = await db.retentionControl.findFirstOrThrow({
    where: {
      kind: "SUPPORT_MESSAGE",
      sourceId: saved.caseId,
      targetId: earlier.id
    }
  });
  assert.equal(JSON.stringify(control.payload).includes("Fictional"), false);
  await db.supportMessage.update({
    where: { id: earlier.id },
    data: { body: earlier.body, redactedAt: null }
  });
  await replayRetentionControls(db, [control.payload as RetentionControlEntry]);
  await replayRetentionControls(db, [control.payload as RetentionControlEntry]);
  const removed = await db.supportMessage.findUniqueOrThrow({
    where: { id: earlier.id }
  });
  assert.equal(removed.body, "[Removed for privacy.]");
  assert.ok(removed.redactedAt);
  source = await db.supportCase.findUniqueOrThrow({
    where: { id: saved.caseId }
  });
  assert.equal(source.version, 5);
  assert.equal(source.resolution, "Fictional newer safe resolution.");
});
