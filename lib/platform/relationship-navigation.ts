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

/** A bounded, explicit search for the owner's safety lists. */
export function relationshipSearch(view: string, value: unknown): string {
  return (view === "blocked" || view === "muted") &&
    typeof value === "string" &&
    !/[\u0000-\u001f\u007f]/.test(value)
    ? value.slice(0, 100).trim()
    : "";
}
