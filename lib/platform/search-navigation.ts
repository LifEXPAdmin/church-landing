export const searchCategories = [
  "posts",
  "people",
  "churches",
  "events",
  "topics",
  "listings",
  "media",
  "opportunities",
  "groups"
] as const;
export type SearchCategory = (typeof searchCategories)[number];
export type SearchNavigation = {
  q: string;
  kind: SearchCategory;
  after?: string;
  topic?: string;
  churchId?: string;
  country?: string;
  placeId?: string;
  radiusKm?: string;
};
export const searchQueryLimit = (kind: SearchCategory) =>
  kind === "opportunities"
    ? 70
    : kind === "groups"
      ? 80
      : kind === "listings"
        ? 120
        : kind === "media"
          ? 160
          : 200;
export const searchCategoryLabel = (kind: SearchCategory) =>
  kind === "opportunities"
    ? "Volunteer opportunities"
    : kind[0].toUpperCase() + kind.slice(1);
export const searchChurchFilter = (kind: SearchCategory) =>
  ["posts", "events", "media", "opportunities", "groups"].includes(kind);
export function searchHref(input: SearchNavigation) {
  const q = new URLSearchParams({ q: input.q, kind: input.kind });
  for (const key of [
    "after",
    "topic",
    "churchId",
    "country",
    "placeId",
    "radiusKm"
  ] as const)
    if (input[key]) q.set(key, input[key]);
  return "/platform/search?" + q;
}
