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

export type ContactPreference = { version: number; audience: ContactAudience };
export type ContactPerson = { id: string; name: string; username: string };
export type ContactConversation = {
  id: string;
  version: number;
  sendingAllowed: boolean;
};
export type ContactRequest = {
  id: string;
  version: number;
  direction: "sent" | "received";
  purpose: string;
  status: keyof typeof contactStatusLabels;
  createdAt: string;
  expiresAt: string;
  person: ContactPerson | null;
  canAccept: boolean;
  canDecline: boolean;
  canWithdraw: boolean;
  conversation: ContactConversation | null;
};
export type ContactView = {
  ownerId: string;
  available: boolean;
  preferences?: ContactPreference;
  target?: ContactPerson;
  expectedRecipientVersion?: number;
  activeRequest?: { id: string; senderId: string } | null;
  conversation?: ContactConversation | null;
  request?: ContactRequest;
  requests?: ContactRequest[];
  after?: string | null;
};
