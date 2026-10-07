import type { PostDraft } from "./post-contracts";
import {
  normalizedPostText,
  CONTENT_NOTE_LIMIT,
  SAFE_EXCERPT_LIMIT
} from "./post-options";

// Editor/publication hints only. Private autosave accepts incomplete work;
// every authoritative validation and audience check remains on the server.
export function draftProblem(draft: PostDraft) {
  if (
    normalizedPostText(draft.content).length > 3000 ||
    draft.content.trim().length < 3
  )
    return "Use 3 to 3,000 characters for your post. Your draft has not been shortened.";
  if (normalizedPostText(draft.scripture).length > 120)
    return "Use up to 120 characters for the Scripture reference. Your draft has not been shortened.";
  if (normalizedPostText(draft.contentNote ?? "").length > CONTENT_NOTE_LIMIT)
    return "Use up to 120 characters for the content note. Your draft has not been shortened.";
  if (normalizedPostText(draft.safeExcerpt ?? "").length > SAFE_EXCERPT_LIMIT)
    return "Use up to 160 characters for the safe excerpt. Your draft has not been shortened.";
  if (draft.topics.length > 5) return "Choose up to five topics.";
  if (
    (draft.discovery?.country || draft.discovery?.placeId) &&
    !draft.discovery.shareLocality
  )
    return "Confirm sharing the broad locality with this post, or clear its location fields.";
  return null;
}
