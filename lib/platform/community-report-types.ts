export const communityReportTargets = [
  "TOPIC",
  "POST",
  "COMMENT",
  "PROFILE",
  "CHURCH",
  "CONTACT_REQUEST",
  "MESSAGE",
  "FEEDBACK_ATTACHMENT",
  "FEEDBACK_IDEA"
] as const;
export type CommunityReportTarget = (typeof communityReportTargets)[number];
export const communityReportTargetLabels = {
  TOPIC: "topic community",
  POST: "post",
  COMMENT: "comment",
  PROFILE: "profile",
  CHURCH: "church representation",
  CONTACT_REQUEST: "contact request",
  MESSAGE: "private message",
  FEEDBACK_ATTACHMENT: "private feedback attachment",
  FEEDBACK_IDEA: "reviewed public idea"
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

export type CommunityReportReceipt = {
  id: string;
  target: { type: CommunityReportTarget; id: string };
  reason: CommunityReportReason;
  details: string;
  status: keyof typeof communityReportStatusLabels;
  version: number;
  createdAt: string;
  updatedAt: string;
  relatedReview?: string;
};
export type CommunityReviewPage = {
  report?: CommunityReportReceipt;
  reviews?: {
    id: string;
    type: CommunityReportTarget;
    reason: CommunityReportReason;
    status: keyof typeof communityReportStatusLabels;
    version: number;
    churchScoped: boolean;
    topicScoped?: boolean;
    createdAt: string;
    updatedAt: string;
  }[];
  decisions?: {
    action?: string | null;
    authorReason?: string | null;
    fromVisibility?: string | null;
    toVisibility?: string | null;
    sourceVersion?: number | null;
    contextVersion?: number | null;
    fromStatus: keyof typeof communityReportStatusLabels;
    toStatus: keyof typeof communityReportStatusLabels;
    reason: string;
    version: number;
    createdAt: string;
  }[];
  evidence?: {
    attachment?: import("./media").ImageView;
    type: CommunityReportTarget;
    content?: string;
    contentNote?: string | null;
    safeExcerpt?: string | null;
    purpose?: string;
    version?: number;
    createdAt: string;
  };
  reportedVersion?: number;
  source?: import("./content-moderation-types").ContentSourceReview | null;
  reconsiderationCases?: { id: string; status: string; version: number }[];
  after?: string | null;
};
export function reportReviewHref(id?: string, closed = false, after?: string) {
  const q = new URLSearchParams({
    ...(id ? { id } : {}),
    ...(after ? { after } : {}),
    ...(closed ? { status: "CLOSED" } : {})
  });
  return "/platform/reports/review" + (q.size ? "?" + q : "");
}
