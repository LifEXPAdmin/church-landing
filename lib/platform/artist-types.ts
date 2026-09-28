export const ARTIST_POLICY = "artist-publication-2026-09-28";
export const artistRoles = [
  "Solo musician",
  "Band",
  "Worship musician",
  "DJ",
  "Producer",
  "Music ministry",
  "Songwriter",
  "Composer"
] as const;
export const artistCapabilities = [
  "EDIT_ARTIST_PROFILE",
  "EDIT_ARTIST_RELEASES",
  "PUBLISH_ARTIST_RELEASES"
] as const;
export type ArtistCapability = (typeof artistCapabilities)[number];
export type ArtistCredit = { name: string; role: string };
export type ArtistLink = {
  provider: "Spotify" | "Apple Music" | "Bandcamp";
  kind: "album" | "track";
  url: string;
};
export type ArtistTrack = {
  id: string;
  title: string;
  durationSeconds: number | null;
  links: ArtistLink[];
};
export type ArtistFields = {
  name: string;
  biography: string;
  presentation: "PERSON" | "TEAM";
  roles: string[];
  genres: string[];
  countryId: string | null;
  townId: string | null;
  churchCredit: string;
  credits: ArtistCredit[];
};
export type ReleaseFields = {
  kind: "SINGLE" | "EP" | "ALBUM";
  title: string;
  description: string;
  releaseDate: string | null;
  tracks: ArtistTrack[];
  credits: ArtistCredit[];
  links: ArtistLink[];
};

export type ArtistItem = ArtistFields & {
  locationLabel?: string;
  id: string;
  version: number;
  state?: string;
  moderationState?: string;
};
export type ReleaseItem = ReleaseFields & {
  id: string;
  artistId: string;
  version: number;
  state?: string;
  moderationState?: string;
};
export type ArtistEditorView = {
  viewerId: string;
  artist: ArtistItem;
  releases: ReleaseItem[];
  delegates: {
    id: string;
    accountId: string;
    capabilities: string[];
    version: number;
    state: string;
    expiresAt: string;
    revokedAt: string | null;
  }[];
  associations: {
    id: string;
    occurrenceId: string;
    revokedAt: string | null;
    version: number;
    acceptedAt: string | null;
    expiresAt: string;
  }[];
  ownDelegate: { id: string; version: number; state: string } | null;
  permissions: {
    steward: boolean;
    profile: boolean;
    drafts: boolean;
    publish: boolean;
  };
};
