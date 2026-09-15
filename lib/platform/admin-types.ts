export const adminPriorities = {
  LOW: "Low",
  NORMAL: "Normal",
  HIGH: "High",
  URGENT: "Urgent"
} as const;
export const adminSourceTypes = {
  SUPPORT: "Help request",
  REPORT: "Content report",
  CLAIM: "Church request"
} as const;
export type AdminSourceType = keyof typeof adminSourceTypes;
export type AdminPriority = keyof typeof adminPriorities;
export type AdminSource = { sourceType: AdminSourceType; sourceId: string };
export const adminQueueStates = {
  OPEN: "Open",
  ALL: "All states",
  NEW: "New",
  ASSIGNED: "Assigned",
  WAITING_REQUESTER: "Waiting on requester",
  WAITING_TEAM: "Waiting on team",
  RESOLVED: "Resolved",
  CLOSED: "Closed"
} as const;
export type AdminQueueFilters = {
  type: "ALL" | AdminSourceType | "BUG" | "SUGGESTION";
  state: keyof typeof adminQueueStates;
  priority: "ALL" | AdminPriority;
  owner: "ALL" | "ME" | "UNASSIGNED";
  age: "ALL" | "1" | "7" | "30";
  churchId: string;
  topicId: string;
  q: string;
  tag: string;
  due: boolean;
};
export const defaultAdminFilters: AdminQueueFilters = {
  type: "ALL",
  state: "OPEN",
  priority: "ALL",
  owner: "ALL",
  age: "ALL",
  churchId: "",
  topicId: "",
  q: "",
  tag: "",
  due: false
};
export const adminCapabilityLabels = {
  VIEW_PLATFORM_METRICS: "View aggregate metrics",
  EXPORT_PLATFORM_METRICS: "Export aggregate metrics",
  VIEW_OPERATIONAL_HEALTH: "View operational health",
  LOOKUP_ACCOUNTS: "Look up operational account details",
  VIEW_ADMIN_AUDIT: "View permitted admin audits",
  MANAGE_ADMIN_ACCESS: "Manage platform admin access",
  REVIEW_COMMUNITY_REPORTS: "Review platform content reports",
  REVIEW_CHURCH_CLAIMS: "Review church claims",
  REVIEW_CHURCH_LISTINGS: "Review community church listings",
  ESTABLISH_CHURCH: "Establish churches",
  MANAGE_CHURCH_ACCESS: "Manage church access",
  MANAGE_ACCOUNTS: "Restrict and restore account access",
  ASSIGN_RELATIONSHIP_OWNER: "Assign church relationship owners",
  RESPOND: "Respond to assigned ordinary support",
  ASSIGN: "Route unassigned ordinary support",
  REDACT: "Redact assigned support for privacy"
} as const;
export type AdminQueueRow = AdminSource & {
  title: string;
  category: string;
  nativeStatus: string;
  state: Exclude<keyof typeof adminQueueStates, "OPEN" | "ALL">;
  version: number;
  priority: AdminPriority;
  nextAction: string;
  tags: string[];
  ownerId: string | null;
  ownerName: string | null;
  churchId: string | null;
  topicId: string | null;
  createdAt: string;
  updatedAt: string;
  reminderAt: string | null;
  adminGroupId: string | null;
  canRead: boolean;
  canTriage: boolean;
};
export type AdminNavigation = {
  viewer: { id: string; name: string; username: string };
  sections: { key: string; label: string; href: string }[];
  capabilities: string[];
  canReviewClaims: boolean;
  churches: { id: string; name: string }[];
  topics: { id: string; name: string }[];
};
export type AdminQueueSnapshot = {
  navigation: AdminNavigation;
  filters: AdminQueueFilters;
  rows: AdminQueueRow[];
  next: string | null;
  asOf: string;
  savedViews: {
    id: string;
    name: string;
    filters: AdminQueueFilters;
    version: number;
  }[];
};
