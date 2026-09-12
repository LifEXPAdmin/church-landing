export const relationshipViews = [
  "following",
  "favorites",
  "muted",
  "blocked",
  "churches"
] as const;
export type RelationshipView = (typeof relationshipViews)[number];
export function relationshipView(value: unknown): RelationshipView {
  return typeof value === "string" &&
    relationshipViews.includes(value as RelationshipView)
    ? (value as RelationshipView)
    : "following";
}
