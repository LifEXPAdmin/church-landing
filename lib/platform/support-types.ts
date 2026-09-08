export const SUPPORT_NOTICE = "ordinary-support-v1";
export const supportCategories = {
  ACCOUNT_WEBSITE: "Account or website problem",
  CHURCH_SETUP: "Church setup",
  DIRECTORY_SHARING: "Directory or sharing help",
  FEATURE_SUGGESTION: "Feature suggestion"
} as const;
export const supportStatuses = {
  RECEIVED: "Received",
  IN_PROGRESS: "In progress",
  WAITING_FOR_REQUESTER: "Waiting for requester",
  RESOLVED: "Resolved",
  CLOSED: "Closed"
} as const;
export const featureDecisions = {
  RECEIVED: "Received",
  UNDER_CONSIDERATION: "Under consideration",
  PLANNED: "Planned within approved scope",
  DELIVERED: "Delivered",
  DEFERRED: "Deferred",
  DECLINED: "Declined"
} as const;
export type SupportCategoryKey = keyof typeof supportCategories;
export type SupportStatusKey = keyof typeof supportStatuses;
export type SupportDecisionKey = keyof typeof featureDecisions;
export type SupportView = "new" | "requests" | "inbox" | "routing" | "detail";
export type SupportPerson = { id: string; name: string };
export type SupportRow = {
  id: string;
  subject: string;
  category: SupportCategoryKey;
  status: SupportStatusKey;
  version: number;
  updatedAt: string;
  createdAt: string;
  unassigned: boolean;
  unread: boolean;
};
export type SupportDetail = SupportRow & {
  description: string;
  church: { id: string; name: string } | null;
  requester: SupportPerson;
  owner: SupportPerson | null;
  coordinator: SupportPerson | null;
  resolution: string | null;
  featureDecision: SupportDecisionKey | null;
  messages: {
    id: string;
    author: string;
    kind: string;
    body: string;
    createdAt: string;
    redacted: boolean;
  }[];
  moreMessages: boolean;
  messagePage: number;
  access: {
    requester: boolean;
    owner: boolean;
    coordinator: boolean;
    redact: boolean;
  };
  shareOptions: { id: string; version: number; name: string; slot: string }[];
  ownerOptions: { id: string; version: number; name: string }[];
};
export type SupportSnapshot = {
  viewer: {
    id: string;
    name: string;
    username: string;
    adult: boolean;
    verified: boolean;
  };
  staff: { respond: boolean; assign: boolean };
  intake: {
    available: boolean;
    recipient: { id: string; version: number; name: string } | null;
    notice: string;
  };
  churches: { id: string; name: string; state: string }[];
  rows: SupportRow[];
  more: boolean;
  page: number;
  detail: SupportDetail | null;
  routing: {
    id: string;
    category: SupportCategoryKey;
    status: SupportStatusKey;
    createdAt: string;
    version: number;
    churchId: string | null;
  }[];
  ownerOptions: { id: string; version: number; name: string }[];
};
export const SUPPORT_INTAKE_NOTE =
  "For ordinary account, website, setup and feature help. Do not include passwords, sign-in codes, private member lists, financial information or sensitive pastoral details. Replies stay in this website; no email is sent.";
