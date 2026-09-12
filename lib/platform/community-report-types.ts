export const communityReportTargets = [
  "POST",
  "COMMENT",
  "PROFILE",
  "CHURCH",
  "CONTACT_REQUEST",
  "MESSAGE"
] as const;
export type CommunityReportTarget = (typeof communityReportTargets)[number];
export const communityReportTargetLabels = {
  POST: "post",
  COMMENT: "comment",
  PROFILE: "profile",
  CHURCH: "church representation",
  CONTACT_REQUEST: "contact request",
  MESSAGE: "private message"
} as const;
export function reportEntryHref(type: CommunityReportTarget, id: string) {
  return `/platform/reports?${new URLSearchParams({ targetType: type, targetId: id })}`;
}
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
