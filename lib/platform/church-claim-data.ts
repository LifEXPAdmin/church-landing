export const claimScopes = {
  MANAGE_CHURCH_PROFILE: "Manage the public church profile",
  MANAGE_CHURCH_ACCESS: "Manage church access and review requests",
  MANAGE_STRUCTURE: "Manage church positions and assignments",
  EDIT_CHURCH_CALENDAR: "Edit church calendars and events",
  PUBLISH_CHURCH_EVENTS: "Publish church events",
  PUBLISH_CHURCH_POSTS: "Publish church posts",
  MODERATE_CHURCH_POSTS: "Moderate church posts",
  MANAGE_CHURCH_VOLUNTEERS: "Manage church volunteer roles and rosters",
  REVIEW_CONNECTIONS: "Review church connection requests",
  APPOINT_COORDINATORS: "Appoint church help coordinators"
} as const;
export type ClaimScope = keyof typeof claimScopes;
export const authorityFields = {
  position: { label: "Your position or responsibility", max: 200 },
  leader: { label: "Person and role who can confirm your authority", max: 300 },
  method: { label: "Preferred review method", max: 20 },
  contact: { label: "Private callback number or contact address", max: 254 },
  availability: {
    label: "Suitable times and time zone, or accessibility needs",
    max: 500
  },
  reference: {
    label:
      "Where a reviewer can independently confirm the church and your role",
    max: 1000
  }
} as const;
export type ClaimAuthority = Record<keyof typeof authorityFields, string>;
export function projectClaimAuthority(value: unknown): ClaimAuthority {
  const data = value && typeof value === "object" ? value : {};
  return Object.fromEntries(
    Object.keys(authorityFields).map((key) => [
      key,
      key in data && typeof data[key as keyof typeof data] === "string"
        ? data[key as keyof typeof data]
        : key === "method"
          ? "PHONE"
          : ""
    ])
  ) as ClaimAuthority;
}
export const claimStatusLabels: Record<string, string> = {
  DRAFT: "Private setup draft",
  SUBMITTED: "Pending review",
  NEEDS_INFORMATION: "More information needed",
  APPROVED: "Approved",
  REJECTED: "Not approved",
  WITHDRAWN: "Withdrawn",
  REVOKED: "Access ended"
};
