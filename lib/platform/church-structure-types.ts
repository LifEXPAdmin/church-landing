import type { ChurchRoleSummary } from "./church-role-library";
import type { ChurchSummary, DirectoryEntry } from "./portal-types";

export const structureCapabilities = {
  MANAGE_STRUCTURE: "Manage positions and assignments",
  EDIT_CHURCH_CALENDAR: "Edit church calendars and events",
  PUBLISH_CHURCH_EVENTS: "Publish church events",
  PUBLISH_CHURCH_POSTS: "Publish church posts",
  MODERATE_CHURCH_POSTS: "Moderate church posts",
  MANAGE_CHURCH_VOLUNTEERS: "Manage church volunteer roles and rosters",
  MANAGE_CHURCH_PROFILE: "Manage the public church profile",
  MANAGE_CHURCH_ACCESS: "Manage church access and review requests",
  REVIEW_CONNECTIONS: "Review church connections",
  APPOINT_COORDINATORS: "Appoint church help coordinators"
} as const;
export type StructureCapability = keyof typeof structureCapabilities;
export type StructureOperation =
  | "place"
  | "template-create"
  | "template-edit"
  | "template-archive"
  | "create"
  | "edit"
  | "archive"
  | "assign"
  | "assignment-privileges"
  | "unassign"
  | "step-down"
  | "grant"
  | "revoke";
export type StructureView =
  | "assign"
  | "roles"
  | "privileges"
  | "overview"
  | "structure"
  | "responsibilities"
  | "access"
  | "person";
export type PositionSummary = {
  id: string;
  parentId: string | null;
  placement: "UNCONNECTED" | "ROOT" | "REPORTING";
  name: string;
  description: string;
  roleTemplateId?: string | null;
  roleTemplateVersion?: number | null;
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
  roleTemplates?: ChurchRoleSummary[];
  privileges?: {
    memberLabel: string;
    isSelf: boolean;
    recommendations: StructureCapability[];
    presetKey: import("./church-role-library").RolePresetKey;
    presetVersion: number;
    positionId: string;
    connectionId: string;
    assignmentId: string | null;
    assignmentVersion: number;
    assigned: boolean;
    selected: StructureCapability[];
    grantable: StructureCapability[];
    effective: {
      capability: StructureCapability;
      source: "ASSIGNMENT" | "INDEPENDENT";
      assignmentId: string | null;
      positionName?: string;
    }[];
  };
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
