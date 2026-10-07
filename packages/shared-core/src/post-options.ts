// Safe to share with the composer; no database or credential dependencies.
export const POST_TOPICS = [
  "prayer",
  "testimony",
  "scripture",
  "fasting",
  "worship",
  "service",
  "community",
  "family",
  "questions",
  "encouragement"
] as const;
export const normalizedPostText = (value: string) =>
  value.replace(/\r\n?/g, "\n");
export const CONTENT_NOTE_LIMIT = 120;
export const SAFE_EXCERPT_LIMIT = 160;
// Selection is the author's explicit choice, never an inferred sensitivity label.
export function postPreviewText(post: {
  content: string;
  contentNote?: string | null;
  safeExcerpt?: string | null;
}) {
  return (
    post.safeExcerpt ||
    (post.contentNote
      ? "Open this post when you’re ready to read more."
      : post.content)
  );
}

export const emptyPostDiscovery = {
  discoveryLanguage: null,
  discoveryDenomination: null,
  discoveryCountry: null,
  discoveryPlaceId: null,
  discoveryRegion: null,
  discoveryLatitude: null,
  discoveryLongitude: null
};

// Public wire categories; the server still validates requests and permissions.
export const POST_TYPES = [
  "TESTIMONY",
  "PRAYER",
  "TEACHING",
  "UPDATE",
  "NEED"
] as const;
export type PostType = (typeof POST_TYPES)[number];

export const POST_RESOURCE_LIMIT = 3;
export const postResourceKinds = [
  "exchangeListing",
  "eventOccurrence",
  "volunteerOpportunity",
  "mediaCatalogItem"
] as const;
export type PostResourceKind = (typeof postResourceKinds)[number];
