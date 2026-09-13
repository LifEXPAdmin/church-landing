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
    createdAt: string;
    updatedAt: string;
  }[];
  decisions?: {
    fromStatus: keyof typeof communityReportStatusLabels;
    toStatus: keyof typeof communityReportStatusLabels;
    reason: string;
    version: number;
    createdAt: string;
  }[];
  evidence?: {
    type: CommunityReportTarget;
    content?: string;
    purpose?: string;
    version?: number;
    createdAt: string;
  };
  reportedVersion?: number;
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
