import { searchCategories, type SearchCategory } from "./search-navigation";

export type RecentSearch = { q: string; kind: SearchCategory; at: number };
export type RecentSearchState = { enabled: boolean; items: RecentSearch[] };
type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;
const lifetime = 30 * 24 * 60 * 60 * 1000;
export const recentSearchLimit = 20;
export const recentSearchKey = (owner: string) =>
  `godschurches:recent-searches:v1:${encodeURIComponent(owner)}`;
const empty = (): RecentSearchState => ({ enabled: false, items: [] });

export function readRecentSearches(
  storage: Store,
  owner: string,
  now = Date.now()
): RecentSearchState {
  if (!owner) return empty();
  const raw = storage.getItem(recentSearchKey(owner));
  if (!raw || raw.length > 30000) return empty();
  try {
    const value = JSON.parse(raw);
    if (
      value.format !== 1 ||
      value.owner !== owner ||
      value.enabled !== true ||
      !Array.isArray(value.items)
    )
      return empty();
    const seen = new Set<string>();
    const items: RecentSearch[] = [];
    for (const item of value.items) {
      if (
        !item ||
        typeof item.q !== "string" ||
        !item.q.trim() ||
        item.q.length > 200 ||
        !searchCategories.includes(item.kind) ||
        !Number.isFinite(item.at) ||
        item.at > now ||
        item.at <= now - lifetime
      )
        continue;
      const q = item.q.trim();
      const key = JSON.stringify([item.kind, q]);
      if (seen.has(key)) continue;
      seen.add(key);
      items.push({ q, kind: item.kind, at: item.at });
      if (items.length === recentSearchLimit) break;
    }
    return { enabled: true, items };
  } catch {
    return empty();
  }
}

export type RecentSearchChange =
  | { action: "enable" | "disable" | "clear" }
  | { action: "record" | "remove"; q: string; kind: SearchCategory };

/** Read at the moment of a deliberate action, never merge an old UI snapshot. */
export function changeRecentSearches(
  storage: Store,
  owner: string,
  change: RecentSearchChange,
  now = Date.now()
): RecentSearchState {
  if (!owner) return empty();
  const key = recentSearchKey(owner);
  if (change.action === "disable") {
    storage.removeItem(key);
    return empty();
  }
  const current = readRecentSearches(storage, owner, now);
  if (change.action === "enable") current.enabled = true;
  if (!current.enabled) return current;
  if (change.action === "clear") current.items = [];
  if (change.action === "record" || change.action === "remove") {
    const q = change.q.trim().slice(0, 200);
    if (!q || !searchCategories.includes(change.kind)) return current;
    current.items = current.items.filter(
      (item) => item.q !== q || item.kind !== change.kind
    );
    if (change.action === "record")
      current.items.unshift({ q, kind: change.kind, at: now });
  }
  current.items = current.items.slice(0, recentSearchLimit);
  storage.setItem(key, JSON.stringify({ format: 1, owner, ...current }));
  return current;
}
