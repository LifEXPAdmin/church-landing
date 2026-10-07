import type { PostType, PostResourceKind } from "./post-options";

// Data shapes only. These types do not grant access or validate stored input.
export type PostDiscoveryInput = {
  language: string | null;
  denomination: string | null;
  country: string | null;
  placeId: number | null;
  shareLocality: boolean;
};
export type SavedPhotoReference = { id: string; version: number };
export type PostResourceReference = { kind: PostResourceKind; id: string };

export type PostDraft = {
  resourceReferences?: PostResourceReference[];
  mentionIds?: string[];
  discovery?: PostDiscoveryInput;
  content: string;
  contentNote?: string;
  safeExcerpt?: string;
  scripture: string;
  type: PostType;
  topics: string[];
  audience: "PUBLIC" | "CHURCH" | "GROUP";
  linkUrl?: string;
  linkReceipt?: string;
  keepLinkPreview?: boolean;
  linkPreview?: {
    title: string | null;
    description: string | null;
    sourceUrl: string;
  } | null;
};
export type PrivateDraftPayload = {
  resourceReferences?: PostResourceReference[];
  mentionIds?: string[];
  discovery?: PostDiscoveryInput;
  scheduleLocal?: string;
  scheduleZone?: string;
  content: string;
  contentNote?: string;
  safeExcerpt?: string;
  scripture: string;
  type: PostType;
  topics: string[];
  audience: "PUBLIC" | "CHURCH" | "GROUP";
  groupId?: string | null;
  groupThreadKind?: string | null;
  groupCategory?: string | null;
  replyAudience: "VIEWERS" | "CHURCH_MEMBERS" | null;
  authorChurchId: string | null;
  audienceChurchId: string | null;
  eventOccurrenceId: string | null;
  linkUrl: string;
  photos?: SavedPhotoReference[];
  quoteSourceId?: string | null;
  topicCommunityId?: string | null;
};
