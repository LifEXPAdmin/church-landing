import type { ChurchSummary, DirectoryEntry } from "./portal-types";

export const structureCapabilities = {
  MANAGE_STRUCTURE: "Manage positions and assignments",
  EDIT_CHURCH_CALENDAR: "Edit church calendars and events",
  PUBLISH_CHURCH_EVENTS: "Publish church events",
  MANAGE_CHURCH_PROFILE: "Manage the public church profile",
  MANAGE_CHURCH_ACCESS: "Manage church access and review requests",
  REVIEW_CONNECTIONS: "Review church connections",
  APPOINT_COORDINATORS: "Appoint church help coordinators"
} as const;
export type StructureCapability = keyof typeof structureCapabilities;
export type StructureOperation =
  | "create"
  | "edit"
  | "archive"
  | "assign"
  | "unassign"
  | "step-down"
  | "grant"
  | "revoke";
export type StructureView =
  | "overview"
  | "structure"
  | "responsibilities"
  | "access"
  | "person";
export type PositionSummary = {
  id: string;
  parentId: string | null;
  name: string;
  description: string;
  assignments: {
    id: string;
    name?: string;
    connectionId?: string;
    isSelf: boolean;
  }[];
};
export type StructureSnapshot = {
  viewer: { id: string; name: string; username: string };
  church: ChurchSummary;
  version: number;
  ownConnectionId: string;
  capabilities: StructureCapability[];
  positions: PositionSummary[];
  candidates?: { id: string; name: string }[];
  candidatesCursor?: string;
  grants?: {
    id: string;
    name?: string;
    connectionId?: string;
    capability: StructureCapability;
    version: number;
    revoked: boolean;
    isSelf: boolean;
  }[];
  grantsCursor?: string;
  person?: DirectoryEntry & { connectionId: string };
};
