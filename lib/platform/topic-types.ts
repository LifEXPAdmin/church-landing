export const topicRestrictionReasons = {
  SPAM: "Repeated spam or promotion",
  HARASSMENT: "Harassment or disruption",
  PRIVACY: "Sharing private information",
  SAFETY: "A safety concern",
  RULES: "Repeated community rule violations"
} as const;
export function topicHref(slug: string) {
  return `/platform/topics/${encodeURIComponent(slug)}`;
}
