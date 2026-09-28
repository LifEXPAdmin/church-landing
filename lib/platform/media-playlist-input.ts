import { PortalError } from "./portal-policy";
import { postId } from "./post-input";
import { mediaText } from "./media-catalog-input";
import { socialInput } from "./social-operations";

export const PLAYLIST_LIMIT = 100;
export const PLAYLIST_ENTRY_LIMIT = 200;
export const MEDIA_SAVE_LIMIT = 1000;
export const PLAYLIST_PAGE_LIMIT = 25;
export const playlistAudiences = [
  "PRIVATE",
  "MEMBERS",
  "PUBLIC",
  "CHURCH"
] as const;
export type PlaylistAudience = (typeof playlistAudiences)[number];

export function playlistFields(value: unknown, churchOwned: boolean) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new PortalError(
      400,
      "Check the playlist title, description and audience."
    );
  const fields = value as Record<string, unknown>;
  socialInput(fields, ["title", "description", "audience"]);
  if (
    typeof fields.audience !== "string" ||
    !playlistAudiences.includes(fields.audience as PlaylistAudience) ||
    (churchOwned ? fields.audience === "PRIVATE" : fields.audience === "CHURCH")
  )
    throw new PortalError(
      400,
      "Choose an audience supported by this playlist owner."
    );
  return {
    title: mediaText(fields.title, 160, "playlist title", true),
    description: mediaText(fields.description, 2000, "playlist description"),
    audience: fields.audience as PlaylistAudience
  };
}

export function playlistOrder(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > PLAYLIST_ENTRY_LIMIT)
    throw new PortalError(400, "Reorder at most 200 playlist entries.");
  const ids = value.map(postId);
  if (new Set(ids).size !== ids.length)
    throw new PortalError(400, "Include each playlist entry exactly once.");
  return ids;
}

export function requireCompletePlaylistOrder(
  requested: string[],
  current: string[]
) {
  const expected = new Set(current);
  if (
    requested.length !== current.length ||
    requested.some((id) => !expected.has(id))
  )
    throw new PortalError(
      409,
      "This playlist changed. Review its current order before saving again."
    );
}
