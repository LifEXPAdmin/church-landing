import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { seedSupport } from "./seed-support";
import { assertPortalTestDatabase } from "./seed-portal";
import {
  readMeasurementChoice,
  saveMeasurementChoice,
  clearRestoredMeasurements,
  purgeExpiredMeasurements
} from "../lib/platform/platform-measurement";
import {
  readFeedbackPromptState,
  reserveFeedbackPrompt,
  confirmFeedbackPromptShown,
  saveFeedbackPromptPreference
} from "../lib/platform/feedback-prompts";
import { readSupport, supportCommand } from "../lib/platform/support";
import { FEEDBACK_NOTICE } from "../lib/platform/feedback-types";
import { handleFeedbackPromptRequest } from "../lib/platform/feedback-prompt-boundary";
import { accountConfig } from "../lib/platform/account-config";
import { loginAccount } from "../lib/platform/accounts";
import {
  replayRetentionControls,
  type RetentionControlEntry
} from "../lib/platform/retention-controls";
import { eraseAdminPersonalData } from "../lib/platform/admin-privacy";
const db = new PrismaClient(),
  day = 86400000;
before(async () => {
  await assertPortalTestDatabase(db);
  process.env.FEEDBACK_INTAKE_ENABLED = "true";
  process.env.SUPPORT_INTAKE_ENABLED = "true";
  process.env.PLATFORM_MEASUREMENT_ENABLED = "true";
});
after(() => db.$disconnect());
async function ready(now = new Date()) {
  const f = await seedSupport(db),
    userId = f.memberA.id;
  await db.platformUser.updateMany({
    where: { id: { in: [userId, f.memberB.id] } },
    data: { createdAt: new Date(now.getTime() - 8 * day) }
  });
  await saveMeasurementChoice(db, f.memberA.token, {
    operation: "choice",
    mutationId: randomUUID(),
    expectedVersion: 0,
    enabled: true,
    shareDevice: false,
    referral: "UNKNOWN"
  });
  await refreshUse(userId, f.memberB.id, now);
  await db.platformSession.updateMany({
    where: { userId },
    data: { expiresAt: new Date(now.getTime() + 365 * day) }
  });
  return f;
}
async function refreshUse(userId: string, followingId: string, now: Date) {
  await db.platformMeasurementChoice.update({
    where: { userId },
    data: {
      enabledAt: new Date(now.getTime() - 3 * day),
      sessionStarts: [3, 2, 1].map(
        (h) => new Date(now.getTime() - h * 3600000)
      ),
      eligibleSessions: 3,
      lastForegroundAt: now
    }
  });
  await db.platformFollow.upsert({
    where: { followerId_followingId: { followerId: userId, followingId } },
    create: {
      followerId: userId,
      followingId,
      createdAt: new Date(now.getTime() - day)
    },
    update: { createdAt: new Date(now.getTime() - day) }
  });
}
const reservation = (token: string, claimId: string = randomUUID()) =>
  reserveFeedbackPrompt(db, token, { operation: "reserve", claimId });
const shown = (token: string, claimId: string) =>
  confirmFeedbackPromptShown(db, token, { operation: "shown", claimId });
const preference = (
  token: string,
  operation = "dismiss",
  mutationId = randomUUID()
) => saveFeedbackPromptPreference(db, token, { operation, mutationId });
async function feedbackInput(token: string, promptClaimId?: string) {
  const s = await readSupport(db, token, "new", { feedbackOnly: true });
  return {
    operation: "feedback-create",
    requestKey: randomUUID(),
    kind: "GENERAL",
    rating: 1,
    description: "",
    recipientId: s.intake.recipient?.id,
    recipientVersion: s.intake.recipient?.version,
    notice: FEEDBACK_NOTICE,
    consent: true,
    contactAllowed: false,
    channels: [],
    allowIdea: false,
    publicAttribution: false,
    ...(promptClaimId ? { promptClaimId } : {})
  };
}
test("frozen six/seven-day, two/three-session and ordinary-action thresholds require reliable opted-in use and ready intake", async (t) => {
  const now = new Date();
  const f = await ready(now);
  t.mock.timers.enable({ apis: ["Date"], now: now.getTime() });
  const userId = f.memberA.id,
    token = f.memberA.token;
  await db.platformUser.update({
    where: { id: userId },
    data: { createdAt: new Date(now.getTime() - 6 * day) }
  });
  assert.equal((await readFeedbackPromptState(db, token)).eligible, false);
  await db.platformUser.update({
    where: { id: userId },
    data: { createdAt: new Date(now.getTime() - 7 * day) }
  });
  assert.equal((await readFeedbackPromptState(db, token)).eligible, true);
  await db.platformMeasurementChoice.update({
    where: { userId },
    data: {
      sessionStarts: [2, 1].map((h) => new Date(now.getTime() - h * 3600000)),
      eligibleSessions: 2
    }
  });
  assert.equal((await readFeedbackPromptState(db, token)).eligible, false);
  await refreshUse(userId, f.memberB.id, now);
  await db.platformFollow.deleteMany({ where: { followerId: userId } });
  await db.platformPost.create({
    data: {
      authorId: userId,
      type: "PRAYER",
      status: "PUBLISHED",
      audience: "PUBLIC",
      content: "Fictional prayer is never a prompt eligibility score.",
      publishedAt: new Date(now.getTime() - 1000)
    }
  });
  assert.equal((await readFeedbackPromptState(db, token)).eligible, false);
  await refreshUse(userId, f.memberB.id, now);
  process.env.FEEDBACK_INTAKE_ENABLED = "false";
  assert.equal((await readFeedbackPromptState(db, token)).eligible, false);
  process.env.FEEDBACK_INTAKE_ENABLED = "true";
  await db.supportIntakeSetting.update({
    where: { id: "default" },
    data: { enabled: false }
  });
  assert.equal((await readFeedbackPromptState(db, token)).eligible, false);
  await db.supportIntakeSetting.update({
    where: { id: "default" },
    data: { enabled: true }
  });
  const choice = await readMeasurementChoice(db, token);
  await saveMeasurementChoice(db, token, {
    operation: "choice",
    mutationId: randomUUID(),
    expectedVersion: choice.version,
    enabled: false,
    shareDevice: false,
    referral: "UNKNOWN"
  });
  assert.equal((await readFeedbackPromptState(db, token)).eligible, false);
  assert.equal(
    (await readSupport(db, token, "new", { feedbackOnly: true })).intake
      .available,
    true
  );
});
test("two devices and concurrent tabs reserve one account-wide claim; unseen expiry counts no exposure and shown retry counts once", async (t) => {
  const now = new Date(),
    f = await ready(now),
    token = f.memberA.token;
  const other = await loginAccount(
    db,
    f.memberA.email,
    f.memberA.password,
    "fictional-second-prompt-device"
  );
  t.mock.timers.enable({ apis: ["Date"], now: now.getTime() });
  const attempts = await Promise.all([
    reservation(token),
    reservation(other),
    reservation(token),
    reservation(other)
  ]);
  assert.equal(attempts.filter((r) => r.claim).length, 1);
  const first = attempts.find((r) => r.claim)!.claim!;
  assert.equal(
    await db.feedbackPromptClaim.count({
      where: { userId: f.memberA.id, shownAt: { not: null } }
    }),
    0
  );
  assert.equal((await reservation(token, first.id)).claim?.id, first.id);
  t.mock.timers.setTime(now.getTime() + 120001);
  assert.equal((await shown(token, first.id)).confirmed, false);
  const next = (await reservation(other)).claim!;
  assert.ok(next);
  assert.notEqual(next.id, first.id);
  const exposure = await Promise.all([
    shown(token, next.id),
    shown(other, next.id)
  ]);
  assert.ok(exposure.every((r) => r.confirmed));
  assert.equal(
    await db.feedbackPromptClaim.count({
      where: { userId: f.memberA.id, shownAt: { not: null } }
    }),
    1
  );
  assert.equal((await reservation(other)).claim, null);
  assert.equal(
    await db.retentionControl.count({
      where: { kind: "FEEDBACK_PROMPT", sourceId: f.memberA.id }
    }),
    1
  );
});
test("dismissal expires exactly at day thirty; never-ask survives concurrent weaker writes and a changed campaign", async (t) => {
  const now = new Date(),
    f = await ready(now),
    token = f.memberA.token;
  t.mock.timers.enable({ apis: ["Date"], now: now.getTime() });
  const key = randomUUID();
  const saved = await preference(token, "dismiss", key);
  assert.deepEqual(await preference(token, "dismiss", key), saved);
  t.mock.timers.setTime(now.getTime() + 30 * day - 1);
  await refreshUse(f.memberA.id, f.memberB.id, new Date());
  assert.equal((await readFeedbackPromptState(db, token)).eligible, false);
  t.mock.timers.setTime(now.getTime() + 30 * day);
  assert.equal((await readFeedbackPromptState(db, token)).eligible, true);
  await Promise.all([
    preference(token),
    preference(token, "never-ask"),
    preference(token)
  ]);
  await db.feedbackPromptClaim.create({
    data: {
      id: randomUUID(),
      userId: f.memberA.id,
      campaign: "future-campaign",
      measurementVersion: 1,
      configurationVersion: 1,
      expiresAt: new Date(Date.now() + 120000)
    }
  });
  t.mock.timers.setTime(now.getTime() + 120 * day);
  await refreshUse(f.memberA.id, f.memberB.id, new Date());
  assert.equal((await readFeedbackPromptState(db, token)).neverAsk, true);
  assert.equal((await reservation(token)).claim, null);
});
test("a displayed prompt joins one real rating response atomically; ninety-day response cooldown includes voluntary feedback", async (t) => {
  const now = new Date(),
    f = await ready(now),
    token = f.memberA.token;
  t.mock.timers.enable({ apis: ["Date"], now: now.getTime() });
  const claim = (await reservation(token)).claim!;
  await shown(token, claim.id);
  const input = await feedbackInput(token, claim.id);
  const [a, b] = await Promise.all([
    supportCommand(db, token, input),
    supportCommand(db, token, input)
  ]);
  assert.equal(a.caseId, b.caseId);
  const row = await db.feedbackSubmission.findUniqueOrThrow({
    where: { caseId: a.caseId }
  });
  assert.equal(row.entryPoint, "PROMPT");
  assert.equal(row.promptClaimId, claim.id);
  assert.equal(row.rating, 1);
  await assert.rejects(
    supportCommand(db, f.memberB.token, {
      ...(await feedbackInput(f.memberB.token)),
      promptClaimId: claim.id
    })
  );
  t.mock.timers.setTime(now.getTime() + 90 * day - 1);
  await refreshUse(f.memberA.id, f.memberB.id, new Date());
  assert.equal((await readFeedbackPromptState(db, token)).eligible, false);
  t.mock.timers.setTime(now.getTime() + 90 * day);
  assert.equal((await readFeedbackPromptState(db, token)).eligible, true);
  const ordinary = await supportCommand(db, token, await feedbackInput(token));
  assert.equal(
    (
      await db.feedbackSubmission.findUniqueOrThrow({
        where: { caseId: ordinary.caseId }
      })
    ).entryPoint,
    "VOLUNTARY"
  );
  assert.equal((await readFeedbackPromptState(db, token)).eligible, false);
});
test("withdrawal removes exposure facts without losing refusal or blocking retained feedback; restore replays strongest preferences", async () => {
  const f = await ready(),
    token = f.memberA.token,
    userId = f.memberA.id;
  const claim = (await reservation(token)).claim!;
  await shown(token, claim.id);
  await preference(token, "never-ask");
  const input = await feedbackInput(token, claim.id),
    state = await readMeasurementChoice(db, token);
  await saveMeasurementChoice(db, token, {
    operation: "choice",
    mutationId: randomUUID(),
    expectedVersion: state.version,
    enabled: false,
    shareDevice: false,
    referral: "UNKNOWN"
  });
  assert.equal(await db.feedbackPromptClaim.count({ where: { userId } }), 0);
  assert.equal((await readFeedbackPromptState(db, token)).neverAsk, true);
  const receipt = await supportCommand(db, token, input);
  assert.equal(
    (
      await db.feedbackSubmission.findUniqueOrThrow({
        where: { caseId: receipt.caseId }
      })
    ).entryPoint,
    "UNATTRIBUTED"
  );
  const entries = (
    await db.retentionControl.findMany({
      where: { kind: "FEEDBACK_PROMPT", sourceId: userId },
      orderBy: { version: "desc" }
    })
  ).map((r) => r.payload as unknown as RetentionControlEntry);
  await db.feedbackPromptPreference.delete({ where: { userId } });
  await replayRetentionControls(db, entries);
  const first = await db.feedbackPromptPreference.findUniqueOrThrow({
    where: { userId }
  });
  await replayRetentionControls(db, [...entries].reverse());
  const again = await db.feedbackPromptPreference.findUniqueOrThrow({
    where: { userId }
  });
  assert.deepEqual(again, first);
  assert.ok(again.neverAskAt);
  assert.ok(again.respondedUntil);
  await db.$transaction((tx) => clearRestoredMeasurements(tx));
  assert.equal((await readFeedbackPromptState(db, token)).neverAsk, true);
});
test("private prompt HTTP rejects account/origin changes and protects the saved refusal before returning success", async () => {
  const f = await ready(),
    origin = accountConfig().origin;
  const req = (owner = f.memberA.id, source = origin) =>
    new Request(origin + "/api/platform/feedback/prompts", {
      method: "POST",
      headers: {
        origin: source,
        "content-type": "application/json",
        "x-expected-account": owner,
        cookie: `church_platform_session=${f.memberA.token}`
      },
      body: JSON.stringify({ operation: "never-ask", mutationId: randomUUID() })
    });
  assert.equal(
    (await handleFeedbackPromptRequest(db, req(f.memberB.id))).status,
    401
  );
  assert.equal(
    (
      await handleFeedbackPromptRequest(
        db,
        req(f.memberA.id, "https://elsewhere.invalid")
      )
    ).status,
    403
  );
  const saved = await handleFeedbackPromptRequest(db, req());
  assert.equal(saved.status, 200, await saved.clone().text());
  assert.match(saved.headers.get("cache-control") ?? "", /no-store/);
  assert.ok(
    (
      await db.retentionControl.findFirstOrThrow({
        where: { kind: "FEEDBACK_PROMPT", sourceId: f.memberA.id }
      })
    ).journaledAt
  );
});
test("raw prompt history expires at ninety days and erasure removes history/preferences without resurrecting an erased refusal", async () => {
  const f = await ready(),
    userId = f.memberA.id;
  const claim = (await reservation(f.memberA.token)).claim!;
  await shown(f.memberA.token, claim.id);
  await preference(f.memberA.token, "never-ask");
  const entries = (
    await db.retentionControl.findMany({
      where: { kind: "FEEDBACK_PROMPT", sourceId: userId }
    })
  ).map((r) => r.payload as unknown as RetentionControlEntry);
  await db.$transaction((tx) =>
    purgeExpiredMeasurements(tx, new Date(Date.now() + 91 * day))
  );
  assert.equal(await db.feedbackPromptClaim.count({ where: { userId } }), 0);
  assert.ok(
    (await db.feedbackPromptPreference.findUniqueOrThrow({ where: { userId } }))
      .neverAskAt
  );
  await db.$transaction(async (tx) => {
    await eraseAdminPersonalData(tx, userId, new Date());
    await tx.platformUser.update({
      where: { id: userId },
      data: { erasedAt: new Date() }
    });
  });
  await replayRetentionControls(db, entries);
  assert.equal(
    await db.feedbackPromptPreference.count({ where: { userId } }),
    0
  );
});
