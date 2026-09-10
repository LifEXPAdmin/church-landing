export function churchSearchQuery(value: unknown): string {
  return typeof value === "string"
    ? value
        .replace(/[\u0000-\u001f\u007f]/g, " ")
        .trim()
        .slice(0, 100)
    : "";
}

export function churchDiscoveryHref(query = "", cursor?: string): string {
  const params = new URLSearchParams();
  const normalized = churchSearchQuery(query);
  if (normalized) params.set("q", normalized);
  if (cursor) params.set("cursor", cursor);
  const suffix = params.toString();
  return `/platform/churches${suffix ? `?${suffix}` : ""}`;
}
