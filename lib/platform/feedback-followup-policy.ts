import type { FeedbackSubmission } from "@prisma/client";

export const feedbackFollowupEnabled = () =>
  process.env.FEEDBACK_FOLLOWUP_ENABLED === "true";
export type FeedbackChannel = "IN_APP" | "EMAIL" | "PUSH" | "ANY";
export function feedbackContactDates(
  choices: Pick<
    FeedbackSubmission,
    "contactInApp" | "contactEmail" | "contactPush"
  >,
  prior?: Pick<
    FeedbackSubmission,
    "contactInAppSince" | "contactEmailSince" | "contactPushSince"
  >,
  now = new Date()
) {
  return {
    contactInAppSince: choices.contactInApp
      ? (prior?.contactInAppSince ?? now)
      : null,
    contactEmailSince: choices.contactEmail
      ? (prior?.contactEmailSince ?? now)
      : null,
    contactPushSince: choices.contactPush
      ? (prior?.contactPushSince ?? now)
      : null
  };
}
export function feedbackChannelAllowed(
  row: {
    inAppSince: Date | null;
    emailSince: Date | null;
    pushSince: Date | null;
  },
  channel: FeedbackChannel,
  sourceAt: Date
) {
  const before = (date: Date | null) => !!date && date < sourceAt;
  return channel === "ANY"
    ? [row.inAppSince, row.emailSince, row.pushSince].some(before)
    : before(
        channel === "IN_APP"
          ? row.inAppSince
          : channel === "EMAIL"
            ? row.emailSince
            : row.pushSince
      );
}
