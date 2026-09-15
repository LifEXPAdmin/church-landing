import { Prisma, type PrismaClient } from "@prisma/client";
import { withOwnedSession } from "./account-sessions";
import {
  metricActor,
  metricConfiguration,
  measurementStateIn
} from "./platform-measurement";
import {
  METRIC_POLICY,
  METRIC_RAW_DAYS,
  METRIC_SESSION_GAP_MS
} from "./metric-policy";
import { metricSources } from "./metric-sources";
import { defaultSupportRecipient } from "./support-recipient";
import { PortalError } from "./portal-policy";
import { socialCommand, socialInput, socialKey } from "./social-operations";
import { mergeFeedbackSuppression } from "./feedback-prompt-preferences";
import {
  recordFeedbackPromptControl,
  journalRetentionControls,
  protectedRetentionControls
} from "./retention-controls";
import {
  FEEDBACK_PROMPT_POLICY,
  FEEDBACK_PROMPT_AGE_MS,
  FEEDBACK_PROMPT_RESERVATION_MS,
  type FeedbackPromptOutcome,
  type FeedbackPromptState,
  type FeedbackPromptReservation
} from "./feedback-prompt-policy";
type Tx = Prisma.TransactionClient;

async function promptEligibility(
  tx: Tx,
  userId: string,
  now: Date,
  ownClaimId?: string
): Promise<FeedbackPromptState> {
  const preference = await tx.feedbackPromptPreference.findUnique({
    where: { userId }
  });
  const deadlines = [
    preference?.shownUntil,
    preference?.dismissedUntil,
    preference?.respondedUntil
  ].filter((date): date is Date => !!date);
  const latest = deadlines.length
    ? new Date(Math.max(...deadlines.map((date) => date.getTime())))
    : null;
  const state: FeedbackPromptState = {
    ownerId: userId,
    version: preference?.version ?? 0,
    eligible: false,
    neverAsk: !!preference?.neverAskAt,
    suppressedUntil: latest && latest > now ? latest.toISOString() : null,
    message:
      "Automatic feedback prompts are off. You can still use Share feedback."
  };
  if (
    state.neverAsk ||
    state.suppressedUntil ||
    process.env.FEEDBACK_INTAKE_ENABLED !== "true"
  )
    return state;
  const measurement = await measurementStateIn(tx, userId);
  if (!measurement.collecting) return state;
  const [{ user }, choice, recipient] = await Promise.all([
    metricActor(tx, userId),
    tx.platformMeasurementChoice.findUnique({ where: { userId } }),
    defaultSupportRecipient(tx)
  ]);
  if (
    !recipient ||
    recipient.userId === userId ||
    !choice?.enabledAt ||
    choice.policy !== METRIC_POLICY ||
    user.createdAt.getTime() > now.getTime() - FEEDBACK_PROMPT_AGE_MS
  )
    return state;
  const cutoff = new Date(
    Math.max(
      choice.enabledAt.getTime(),
      now.getTime() - METRIC_RAW_DAYS * 86400000
    )
  );
  const starts = choice.sessionStarts
    .filter((at) => at >= cutoff && at <= now)
    .sort((a, b) => a.getTime() - b.getTime());
  if (
    starts.length < 3 ||
    starts.some(
      (at, i) =>
        i > 0 && at.getTime() - starts[i - 1].getTime() < METRIC_SESSION_GAP_MS
    )
  )
    return state;
  if (
    await tx.feedbackPromptClaim.findFirst({
      where: {
        userId,
        finishedAt: null,
        expiresAt: { gt: now },
        ...(ownClaimId ? { id: { not: ownClaimId } } : {})
      },
      select: { id: true }
    })
  )
    return state;
  const configuration = await metricConfiguration(tx);
  // Reuse the metric source's current visibility and revocation rules. Never use prayer acknowledgement.
  const actions = await tx.$queryRaw<
    { present: boolean }[]
  >(Prisma.sql`WITH RECURSIVE ${metricSources(configuration.version, now, cutoff)}
    SELECT EXISTS(SELECT 1 FROM actions WHERE actor=${userId} AND kind IN ('FOLLOW','POST','REPLY','RSVP','VOLUNTEER')) AS present`);
  if (actions[0]?.present)
    return {
      ...state,
      eligible: true,
      message: "Optional feedback can be offered at a quiet navigation point."
    };
  return state;
}
export function readFeedbackPromptState(db: PrismaClient, token: unknown) {
  return withOwnedSession(
    db,
    token,
    (tx, actor) => promptEligibility(tx, actor.userId, new Date()),
    "shared"
  );
}
export async function suppressFeedbackPromptIn(
  tx: Tx,
  userId: string,
  outcome: FeedbackPromptOutcome,
  now = new Date()
) {
  const saved = await mergeFeedbackSuppression(tx, userId, outcome, now);
  await recordFeedbackPromptControl(tx, userId, saved.version, outcome, now);
  if (outcome !== "SHOWN")
    await tx.feedbackPromptClaim.updateMany({
      where: { userId, finishedAt: null },
      data: { finishedAt: now }
    });
  return saved;
}
export function reserveFeedbackPrompt(
  db: PrismaClient,
  token: unknown,
  input: Record<string, unknown>
) {
  socialInput(input, ["operation", "claimId"]);
  if (input.operation !== "reserve")
    throw new PortalError(400, "Use the optional feedback prompt.");
  const id = socialKey(input.claimId);
  return withOwnedSession(
    db,
    token,
    async (tx, actor) => {
      const userId = actor.userId,
        now = new Date();
      const none = {
        ownerId: userId,
        claim: null as FeedbackPromptReservation | null
      };
      const old = await tx.feedbackPromptClaim.findUnique({ where: { id } });
      if (
        old &&
        (old.userId !== userId ||
          old.finishedAt ||
          old.shownAt ||
          old.expiresAt <= now)
      )
        return none;
      if (!(await promptEligibility(tx, userId, now, id)).eligible) return none;
      if (old)
        return {
          ownerId: userId,
          claim: {
            id,
            campaign: old.campaign,
            expiresAt: old.expiresAt.toISOString()
          }
        };
      await tx.feedbackPromptClaim.updateMany({
        where: { userId, finishedAt: null, expiresAt: { lte: now } },
        data: { finishedAt: now }
      });
      const choice = await tx.platformMeasurementChoice.findUniqueOrThrow({
        where: { userId }
      });
      const configuration = await metricConfiguration(tx);
      const claim = await tx.feedbackPromptClaim.create({
        data: {
          id,
          userId,
          campaign: FEEDBACK_PROMPT_POLICY,
          measurementVersion: choice.version,
          configurationVersion: configuration.version,
          createdAt: now,
          expiresAt: new Date(now.getTime() + FEEDBACK_PROMPT_RESERVATION_MS)
        }
      });
      return {
        ownerId: userId,
        claim: {
          id,
          campaign: claim.campaign,
          expiresAt: claim.expiresAt.toISOString()
        }
      };
    },
    "shared"
  );
}
export function confirmFeedbackPromptShown(
  db: PrismaClient,
  token: unknown,
  input: Record<string, unknown>
) {
  socialInput(input, ["operation", "claimId"]);
  if (input.operation !== "shown")
    throw new PortalError(400, "Confirm the current optional prompt.");
  const id = socialKey(input.claimId);
  return withOwnedSession(
    db,
    token,
    async (tx, actor) => {
      const now = new Date(),
        userId = actor.userId;
      const claim = await tx.feedbackPromptClaim.findFirst({
        where: {
          id,
          userId,
          finishedAt: null,
          expiresAt: { gt: now },
          campaign: FEEDBACK_PROMPT_POLICY
        }
      });
      if (!claim) return { ownerId: userId, confirmed: false };
      const choice = await tx.platformMeasurementChoice.findUnique({
        where: { userId }
      });
      if (
        !choice ||
        choice.version !== claim.measurementVersion ||
        !(await measurementStateIn(tx, userId)).collecting ||
        process.env.FEEDBACK_INTAKE_ENABLED !== "true" ||
        !(await defaultSupportRecipient(tx))
      )
        return { ownerId: userId, confirmed: false };
      if (claim.shownAt) return { ownerId: userId, confirmed: true };
      if (!(await promptEligibility(tx, userId, now, id)).eligible)
        return { ownerId: userId, confirmed: false };
      await tx.feedbackPromptClaim.update({
        where: { id },
        data: { shownAt: now }
      });
      await suppressFeedbackPromptIn(tx, userId, "SHOWN", now);
      return { ownerId: userId, confirmed: true };
    },
    "shared"
  );
}
export function saveFeedbackPromptPreference(
  db: PrismaClient,
  token: unknown,
  input: Record<string, unknown>
) {
  socialInput(input, ["operation", "mutationId"]);
  if (input.operation !== "dismiss" && input.operation !== "never-ask")
    throw new PortalError(
      400,
      "Choose a supported feedback prompt preference."
    );
  return socialCommand(
    db,
    token,
    "feedback-prompt-preference",
    input,
    async (tx, userId) => {
      const saved = await suppressFeedbackPromptIn(
        tx,
        userId,
        input.operation === "never-ask" ? "NEVER_ASK" : "DISMISSED"
      );
      return {
        id: userId,
        version: saved.version,
        message:
          input.operation === "never-ask"
            ? "Automatic feedback prompts are off for your account. Share feedback remains available."
            : "Feedback prompts are paused for thirty days. Share feedback remains available."
      };
    },
    undefined,
    "shared"
  );
}
/** Associate only a retained, actually shown, currently measurable owned exposure. */
export async function feedbackResponseSource(
  tx: Tx,
  userId: string,
  value: unknown
) {
  if (value == null) return { entryPoint: "VOLUNTARY", promptClaimId: null };
  const id = socialKey(value),
    now = new Date();
  const claim = await tx.feedbackPromptClaim.findUnique({
    where: { id },
    include: { feedback: { select: { caseId: true } } }
  });
  // Withdrawal/expiry removes the optional exposure; the user's feedback remains valid.
  if (!claim) return { entryPoint: "UNATTRIBUTED", promptClaimId: null };
  if (claim.userId !== userId || !claim.shownAt || claim.feedback)
    throw new PortalError(
      400,
      "Use your current feedback form, or return to Share feedback."
    );
  const choice = await tx.platformMeasurementChoice.findUnique({
    where: { userId }
  });
  if (
    claim.shownAt.getTime() < now.getTime() - METRIC_RAW_DAYS * 86400000 ||
    !choice?.enabledAt ||
    choice.enabledAt > claim.shownAt ||
    !(await measurementStateIn(tx, userId)).collecting
  )
    return { entryPoint: "UNATTRIBUTED", promptClaimId: null };
  return { entryPoint: "PROMPT", promptClaimId: id };
}
export async function protectFeedbackPromptPreferences(
  db: PrismaClient,
  userId: string
) {
  const result = await journalRetentionControls(
    db,
    protectedRetentionControls(),
    userId
  );
  if (result.failed || result.pending)
    throw new PortalError(
      503,
      "Your feedback preference is saved, but recovery protection is pending. Retry the same action."
    );
}
