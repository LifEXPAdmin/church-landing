import type { ContactPerson } from "./adult-contact-types";
export type MessageAlertChoices = {
  version: number;
  requests: boolean;
  messages: boolean;
};
export type MessageActivity = {
  pendingRequests: number;
  requestAlerts: number;
  messageAlerts: number;
  preferences: MessageAlertChoices;
  channels: { inApp: true; email: false; push: false };
};
export type AdultMessageItem = {
  id: string;
  sequence: number;
  mine: boolean;
  content: string;
  createdAt: string;
};
export type AdultConversationChoice = {
  version: number;
  muted: boolean;
  archived: boolean;
  readThrough: number;
  hiddenThrough: number;
};
export type AdultConversationSummary = {
  id: string;
  version: number;
  person: ContactPerson | null;
  sendingAllowed: boolean;
  updatedAt: string;
  latest: AdultMessageItem | null;
  unread: number;
  preferences: AdultConversationChoice;
};
export type AdultMessageView = {
  ownerId: string;
  available: boolean;
  activity?: MessageActivity;
  conversations?: AdultConversationSummary[];
  after?: string | null;
  conversation?: AdultConversationSummary;
  context?: { id: string; purpose: string; createdAt: string } | null;
  messages?: AdultMessageItem[];
  older?: string | null;
  newer?: string | null;
};
