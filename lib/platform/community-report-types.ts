export const communityReportTargets = [
  "POST",
  "COMMENT",
  "PROFILE",
  "CHURCH"
] as const;
export type CommunityReportTarget = (typeof communityReportTargets)[number];
export const communityReportReasons = {
  SPAM: "Spam or misleading promotion",
  HARASSMENT: "Harassment or bullying",
  PRIVACY: "Private information shared without permission",
  SAFETY: "Threats or a safety concern",
  IMPERSONATION: "Impersonation or disputed representation",
  OTHER: "Something else"
} as const;
export type CommunityReportReason = keyof typeof communityReportReasons;
export const communityReportStatusLabels = {
  RECEIVED: "Received for review",
  CLOSED: "Review closed",
  FOLLOW_UP_REQUIRED: "Further review required"
} as const;
