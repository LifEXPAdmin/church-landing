import { parseChartChanges, type ChartChange } from "./church-chart-model";

export const CHART_DRAFT_MAX_AGE = 24 * 60 * 60 * 1000;
export const CHART_DRAFT_MAX_BYTES = 96_000;
export type ChartRetry = {
  expectedVersion: number;
  requestKey: string;
  changes: ChartChange[];
};
export type StoredChartDraft = {
  format: 1;
  churchId: string;
  connectionId: string;
  updatedAt: number;
  version: number;
  changes: ChartChange[];
  retry: ChartRetry | null;
};
const id = (value: unknown) =>
  typeof value === "string" && /^[A-Za-z0-9_-]{1,100}$/.test(value);
const version = (value: unknown) =>
  Number.isSafeInteger(value) &&
  Number(value) >= 0 &&
  Number(value) <= 2_147_483_647;
const only = (value: object, keys: string[]) =>
  Object.keys(value).every((key) => keys.includes(key));
const ordered = (changes: ChartChange[]) =>
  [...changes].sort((a, b) => a.id.localeCompare(b.id));

export function churchChartDraftKey(churchId: string, connectionId: string) {
  if (!id(churchId) || !id(connectionId))
    throw new Error("Invalid chart draft scope");
  return `godschurches:chart-draft:1:${churchId}:${connectionId}`;
}

// Session storage is untrusted. Restore geometry only, bounded in size, age and
// church/member scope. Never restore names, authority or a confirmation checkbox.
export function readStoredChartDraft(
  raw: string | null,
  churchId: string,
  connectionId: string,
  now = Date.now()
): StoredChartDraft | null {
  if (!raw || raw.length > CHART_DRAFT_MAX_BYTES) return null;
  try {
    const value = JSON.parse(raw);
    if (
      !value ||
      typeof value !== "object" ||
      Array.isArray(value) ||
      !only(value, [
        "format",
        "churchId",
        "connectionId",
        "updatedAt",
        "version",
        "changes",
        "retry"
      ]) ||
      value.format !== 1 ||
      !id(churchId) ||
      !id(connectionId) ||
      value.churchId !== churchId ||
      value.connectionId !== connectionId ||
      !version(value.version) ||
      !Number.isSafeInteger(value.updatedAt) ||
      value.updatedAt > now + 300_000 ||
      value.updatedAt < now - CHART_DRAFT_MAX_AGE
    )
      return null;
    const changes = parseChartChanges(value.changes);
    let retry: ChartRetry | null = null;
    if (value.retry !== null) {
      const r = value.retry;
      if (
        !r ||
        typeof r !== "object" ||
        Array.isArray(r) ||
        !only(r, ["expectedVersion", "requestKey", "changes"]) ||
        !version(r.expectedVersion) ||
        typeof r.requestKey !== "string" ||
        !/^[A-Za-z0-9_-]{16,100}$/.test(r.requestKey)
      )
        return null;
      const retryChanges = parseChartChanges(r.changes);
      if (
        JSON.stringify(ordered(changes)) !==
        JSON.stringify(ordered(retryChanges))
      )
        return null;
      retry = {
        expectedVersion: r.expectedVersion,
        requestKey: r.requestKey,
        changes: retryChanges
      };
    }
    return {
      format: 1,
      churchId,
      connectionId,
      updatedAt: value.updatedAt,
      version: value.version,
      changes,
      retry
    };
  } catch {
    return null;
  }
}
