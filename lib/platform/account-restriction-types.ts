// Deliberate operational reasons; private report evidence stays with its owner.
export const suspensionReasons = {
  SPAM_OR_ABUSE: "Spam or abusive activity",
  SAFETY_REVIEW: "Safety review",
  ACCOUNT_SECURITY: "Account security concern",
  ELIGIBILITY_REVIEW: "Account eligibility review"
} as const;
export const accountRestorationReasons = {
  REVIEW_COMPLETE: "Review completed; access may resume",
  ACCOUNT_RECOVERED: "Account ownership and security recovered"
} as const;
export const accountRestrictionReasons = {
  ...suspensionReasons,
  ...accountRestorationReasons
} as const;

export type AccountRestrictionAudit = {
  id: string;
  actorId: string;
  targetId: string;
  action: string;
  fromState: string | null;
  toState: string | null;
  reason: string | null;
  version: number | null;
  createdAt: string;
};
