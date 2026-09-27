export const MEDIA_POLICY = "media-catalog-v1";
export const mediaFormats = [
  "SERMON",
  "PODCAST",
  "TESTIMONY",
  "SERVICE",
  "TEACHING"
] as const;
export const mediaAudiences = ["PUBLIC", "MEMBERS", "CHURCH"] as const;
export const MEDIA_EXTERNAL_NOTICE =
  "This audience controls who can find this catalog entry on God's Churches. The audio or video stays on the external provider. Anyone who can open its public link may watch or listen there, even if they cannot open this entry. Do not use this source for a recording that needs private playback.";
export const mediaFormatNames = {
  SERMON: "Sermon",
  PODCAST: "Podcast",
  TESTIMONY: "Testimony",
  SERVICE: "Service",
  TEACHING: "Teaching"
};
export const mediaAudienceNames = {
  PUBLIC: "Public",
  MEMBERS: "Eligible adult accounts",
  CHURCH: "Approved members of the owning church"
};
