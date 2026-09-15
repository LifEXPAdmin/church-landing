/** Public form labels and version; no database or authorization imports. */
export const FEEDBACK_NOTICE = "confidential-feedback-v1";
export const feedbackKinds = {
  GENERAL: "Share feedback",
  BUG: "Report a problem",
  SUGGESTION: "Suggest an improvement"
} as const;
export type FeedbackKind = keyof typeof feedbackKinds;
export const feedbackChannels = ["IN_APP", "EMAIL", "PUSH"] as const;
export const feedbackChannelLabels = {
  IN_APP: "Updates in this website",
  EMAIL: "Email updates",
  PUSH: "Device notifications"
} as const;
