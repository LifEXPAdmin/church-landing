import type { Prisma } from "@prisma/client";
import {
  FEEDBACK_PROMPT_DISMISS_DAYS,
  FEEDBACK_PROMPT_RESPONSE_DAYS,
  type FeedbackPromptOutcome
} from "./feedback-prompt-policy";

/** Called under the account or policy lock. Each update can only suppress more. */
export async function mergeFeedbackSuppression(
  tx: Prisma.TransactionClient,
  userId: string,
  outcome: FeedbackPromptOutcome,
  at: Date,
  versionFloor = 0
) {
  const previous = await tx.feedbackPromptPreference.findUnique({
    where: { userId }
  });
  const data = {
    neverAskAt: previous?.neverAskAt ?? null,
    shownUntil: previous?.shownUntil ?? null,
    dismissedUntil: previous?.dismissedUntil ?? null,
    respondedUntil: previous?.respondedUntil ?? null
  };
  if (outcome === "NEVER_ASK") data.neverAskAt ??= at;
  else {
    const key =
      outcome === "SHOWN"
        ? "shownUntil"
        : outcome === "DISMISSED"
          ? "dismissedUntil"
          : "respondedUntil";
    const until = new Date(
      at.getTime() +
        (outcome === "RESPONDED"
          ? FEEDBACK_PROMPT_RESPONSE_DAYS
          : FEEDBACK_PROMPT_DISMISS_DAYS) *
          86400000
    );
    if (!data[key] || data[key]! < until) data[key] = until;
  }
  if (
    previous &&
    previous.version >= versionFloor &&
    Object.entries(data).every(
      ([key, value]) =>
        value?.getTime() === previous[key as keyof typeof data]?.getTime()
    )
  )
    return previous;
  return tx.feedbackPromptPreference.upsert({
    where: { userId },
    create: { userId, ...data, version: Math.max(1, versionFloor) },
    update: {
      ...data,
      version: Math.max((previous?.version ?? 0) + 1, versionFloor)
    }
  });
}
