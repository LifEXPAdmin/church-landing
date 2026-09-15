export const FEEDBACK_PROMPT_POLICY = "website-experience-v1";
export const FEEDBACK_PROMPT_RESERVATION_MS = 120000;
export const FEEDBACK_PROMPT_AGE_MS = 7 * 86400000;
export const FEEDBACK_PROMPT_DISMISS_DAYS = 30;
export const FEEDBACK_PROMPT_RESPONSE_DAYS = 90;
export const feedbackPromptOutcomes = [
  "SHOWN",
  "DISMISSED",
  "RESPONDED",
  "NEVER_ASK"
] as const;
export type FeedbackPromptOutcome = (typeof feedbackPromptOutcomes)[number];
export type FeedbackPromptState = {
  ownerId: string;
  version: number;
  eligible: boolean;
  neverAsk: boolean;
  suppressedUntil: string | null;
  message: string;
};
export type FeedbackPromptReservation = {
  id: string;
  campaign: string;
  expiresAt: string;
};
