export type ReleaseEntry = {
  id: string;
  version: string;
  date: string;
  summary: string;
  added: string[];
  improved: string[];
  fixed: string[];
  featureIds: string[];
};
export function parseReleaseNotes(value: unknown): ReleaseEntry | null {
  if (!value || typeof value !== "object") return null;
  const r = value as Record<string, unknown>;
  if (
    !["id", "version", "date", "summary"].every(
      (k) => typeof r[k] === "string" && (r[k] as string).length <= 500
    )
  )
    return null;
  if (
    !/^[a-z0-9-]{1,80}$/.test(r.id as string) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(r.date as string)
  )
    return null;
  if (
    !["added", "improved", "fixed", "featureIds"].every(
      (k) =>
        Array.isArray(r[k]) &&
        r[k].length <= 30 &&
        r[k].every((v: unknown) => typeof v === "string" && v.length <= 500)
    )
  )
    return null;
  if (!(r.featureIds as string[]).every((id) => /^[a-z0-9-]{1,80}$/.test(id)))
    return null;
  return r as ReleaseEntry;
}
