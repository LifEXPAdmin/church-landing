export const PROFILE_FEATURED_LIMIT = 6;
export const profileFeaturedKinds = [
  "exchangeListing",
  "volunteerOpportunity",
  "mediaCatalogItem"
] as const;
export type ProfileFeaturedReference = {
  kind: (typeof profileFeaturedKinds)[number];
  id: string;
};
export const featuredKey = (reference: ProfileFeaturedReference) =>
  `${reference.kind}:${reference.id}`;

/** References only. A profile never stores a copy of source content or access. */
export function profileFeaturedReferences(
  value: unknown
): ProfileFeaturedReference[] {
  if (!Array.isArray(value) || value.length > PROFILE_FEATURED_LIMIT)
    throw Error("Choose up to six featured resources.");
  const references = value.map((row) => {
    if (
      !row ||
      typeof row !== "object" ||
      Array.isArray(row) ||
      Object.keys(row).sort().join() !== "id,kind" ||
      !profileFeaturedKinds.includes(row.kind) ||
      typeof row.id !== "string" ||
      !/^[A-Za-z0-9_-]{1,100}$/.test(row.id)
    )
      throw Error("Choose an existing listing, opportunity or media page.");
    return { kind: row.kind, id: row.id } as ProfileFeaturedReference;
  });
  if (new Set(references.map(featuredKey)).size !== references.length)
    throw Error("Choose each featured resource only once.");
  return references;
}

export function featuredReferenceFromLink(
  link: string,
  origin: string
): ProfileFeaturedReference {
  const url = new URL(link, origin);
  const match = url.pathname.match(
    /^\/platform\/(exchange(?:\/help)?|serve|media)\/([A-Za-z0-9_-]{1,100})$/
  );
  if (
    url.origin !== origin ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !match
  )
    throw Error(
      "Paste an existing listing, opportunity or media page link from this website without extra options."
    );
  return {
    kind:
      match[1] === "media"
        ? "mediaCatalogItem"
        : match[1] === "serve"
          ? "volunteerOpportunity"
          : "exchangeListing",
    id: match[2]
  };
}
