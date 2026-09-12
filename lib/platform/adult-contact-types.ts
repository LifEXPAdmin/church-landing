export const contactAudiences = {
  NOBODY: "No one",
  FOLLOWED: "Adults I follow",
  EVERYONE: "Any eligible adult"
} as const;
export type ContactAudience = keyof typeof contactAudiences;
export const contactStatusLabels = {
  PENDING: "Awaiting a decision",
  ACCEPTED: "Accepted",
  DECLINED: "Declined",
  WITHDRAWN: "Withdrawn",
  EXPIRED: "Expired",
  REVOKED: "Contact no longer available"
} as const;
