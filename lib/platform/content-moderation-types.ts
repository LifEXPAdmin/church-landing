export const contentReviewActions = {
  NO_VIOLATION: "Close without a content restriction",
  REQUEST_CORRECTION: "Request a correction",
  HIDE: "Hide pending review",
  REMOVE: "Remove from community view",
  RESTORE: "Lift the content restriction"
} as const;
export type ContentReviewAction = keyof typeof contentReviewActions;
export const contentDecisionReasons = {
  SPAM: "Spam or misleading promotion",
  HARASSMENT: "Harassment or bullying",
  PRIVATE_INFORMATION: "Personal information or a privacy concern",
  SAFETY: "Threats or a safety concern",
  MISREPRESENTATION: "Misrepresentation of a person or church",
  NO_VIOLATION: "Review found no reason for a content restriction",
  CORRECTION_COMPLETE: "The concern has been addressed"
} as const;
export type ContentDecisionReason = keyof typeof contentDecisionReasons;
export const contentVisibilityLabels = {
  VISIBLE: "No moderation restriction",
  HIDDEN: "Hidden pending review",
  REMOVED: "Removed from community view"
} as const;
export type ContentSourceReview = {
  type: "POST" | "COMMENT" | "TOPIC" | "EXCHANGE_LISTING";
  version: number;
  contextVersion: number;
  visibility: keyof typeof contentVisibilityLabels;
  authorWithdrawn: boolean;
};
export type ContentDecisionNotice = {
  id: string;
  type: "POST" | "COMMENT" | "TOPIC" | "EXCHANGE_LISTING";
  action: ContentReviewAction;
  reason: ContentDecisionReason;
  visibility: keyof typeof contentVisibilityLabels;
  createdAt: string;
  church: boolean;
};
export type ContentAppealOffer = {
  available: boolean;
  reviewerName: string | null;
  decisionVersion: number;
  reportVersion: number;
  notice: string;
  caseId: string | null;
  alreadyRequested: boolean;
  message: string;
};

export function contentNoticeHref(id?: string, after?: string) {
  const q = new URLSearchParams({
    ...(id ? { id } : {}),
    ...(after ? { after } : {})
  });
  return "/platform/reports/decisions" + (q.size ? "?" + q : "");
}
