export const ADULT_POLICY = "adult-preview-v1";
export type PortalView =
  | "discover"
  | "my-church"
  | "sharing"
  | "directory"
  | "review"
  | "help"
  | "operator";
export type ChurchSummary = {
  id: string;
  slug: string;
  name: string;
  summary: string;
  version?: number;
  communityListed?: boolean;
  connectionsAvailable?: boolean;
  city?: string;
  region?: string;
  country?: string;
  serviceArea?: string;
  locationModel?: string;
  website?: string;
  publicEmail?: string;
  publicPhone?: string;
  meetingInfo?: string;
  denomination?: string;
  source?: string;
};
export type ConnectionSummary = {
  id: string;
  churchId: string;
  churchName: string;
  name: string;
  state: string;
  version: number;
  isSelf: boolean;
};
export type DirectoryEntry = { name: string; email?: string; phone?: string };
export type SharingSummary = {
  connectionId: string;
  version: number;
  listed: boolean;
  displayName: string;
  contactEmail: string;
  phone: string;
  emailAudience: "ONLY_ME" | "SAME_CHURCH";
  phoneAudience: "ONLY_ME" | "SAME_CHURCH";
  preview: DirectoryEntry | null;
};
export type ContactSummary = {
  slot: string;
  name: string;
  email?: string;
  phone?: string;
};
export type PortalSnapshot = {
  viewer: {
    id: string;
    name: string;
    username: string;
    verified: boolean;
    adult: boolean;
    version: number;
  };
  churches: ChurchSummary[];
  connections: ConnectionSummary[];
  reviewerChurches: ChurchSummary[];
  coordinatorChurches: ChurchSummary[];
  operatorCapabilities: string[];
  discovery?: { query: string; continued: boolean; moreCursor?: string };
  church?: ChurchSummary;
  directory?: DirectoryEntry[];
  sharing?: SharingSummary;
  queue?: ConnectionSummary[];
  contacts?: ContactSummary[];
  operator?: {
    users: {
      id: string;
      name: string;
      username: string;
      eligible: boolean;
      suspended?: boolean;
      version?: number;
    }[];
    grants: {
      id: string;
      churchId: string;
      userId: string;
      capability: string;
      version: number;
      revoked: boolean;
    }[];
    assignments: {
      id: string;
      churchId: string;
      userId: string;
      slot: string;
      version: number;
      revoked: boolean;
    }[];
  };
};
