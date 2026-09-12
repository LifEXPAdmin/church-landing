export const searchCategories = [
  "posts",
  "people",
  "churches",
  "events",
  "topics"
] as const;
export type SearchCategory = (typeof searchCategories)[number];
export type SearchNavigation = {
  q: string;
  kind: SearchCategory;
  after?: string;
  topic?: string;
  churchId?: string;
};
export function searchHref(input: SearchNavigation) {
  const q = new URLSearchParams({ q: input.q, kind: input.kind });
  for (const key of ["after", "topic", "churchId"] as const)
    if (input[key]) q.set(key, input[key]);
  return "/platform/search?" + q;
}
