import countries from "../../data/discovery/countries.json" with { type: "json" };
import languages from "../../data/discovery/languages.json" with { type: "json" };
import { POST_TOPICS } from "./post-options";
import { PortalError } from "./portal-policy";

export { countries as discoveryCountries, languages as discoveryLanguages };
export const discoveryLanguageLabel = (id: string) =>
  languages.find((item) => item.id === id)?.name ?? id;
export const discoveryCountryLabel = (id: string) =>
  countries.find((item) => item.id === id)?.name ?? id;
export const DISCOVERY_MODES = [
  "for-you",
  "following",
  "your-church",
  "churches",
  "local",
  "public",
  "favorites"
] as const;
export type DiscoveryMode = (typeof DISCOVERY_MODES)[number];
export function discoveryMode(value: unknown): DiscoveryMode | undefined {
  return DISCOVERY_MODES.includes(value as DiscoveryMode)
    ? (value as DiscoveryMode)
    : undefined;
}
export const DISCOVERY_SORTS = ["newest", "relevant", "popular"] as const;
export const DISCOVERY_RADII = [10, 25, 50, 100, 250] as const;
export const DISCOVERY_TYPES = [
  "TESTIMONY",
  "PRAYER",
  "TEACHING",
  "UPDATE",
  "NEED",
  "EVENT"
] as const;
export const DISCOVERY_DENOMINATIONS = [
  "Anglican",
  "Baptist",
  "Catholic",
  "Eastern Orthodox",
  "Lutheran",
  "Methodist",
  "Non-denominational",
  "Oriental Orthodox",
  "Pentecostal",
  "Presbyterian",
  "Quaker",
  "Reformed",
  "Seventh-day Adventist"
];
export const GUEST_DISCOVERY_COOKIE = "gc-guest-discovery";
export type DiscoveryFilters = {
  sort: (typeof DISCOVERY_SORTS)[number];
  homeChurchId: string | null;
  geography: "worldwide" | "country" | "local";
  country: string | null;
  placeId: number | null;
  radiusKm: (typeof DISCOVERY_RADII)[number];
  expand: boolean;
  denominations: string[];
  languages: string[];
  includeUnknownLanguage: boolean;
  topics: string[];
  types: (typeof DISCOVERY_TYPES)[number][];
};
export type DiscoveryPreferences = {
  filters: DiscoveryFilters;
  interests: string[];
  hiddenWords: string[];
  hiddenTopics: string[];
  feedback: Partial<Record<(typeof POST_TOPICS)[number], -1 | 1>>;
  presets: {
    id: string;
    name: string;
    mode: DiscoveryMode;
    filters: DiscoveryFilters;
  }[];
};
export function defaultDiscoveryFilters(): DiscoveryFilters {
  return {
    sort: "newest",
    homeChurchId: null,
    geography: "worldwide",
    country: null,
    placeId: null,
    radiusKm: 25,
    expand: false,
    denominations: [],
    languages: [],
    includeUnknownLanguage: true,
    topics: [],
    types: []
  };
}
export function defaultDiscoveryPreferences(): DiscoveryPreferences {
  return {
    filters: defaultDiscoveryFilters(),
    interests: [],
    hiddenWords: [],
    hiddenTopics: [],
    feedback: {},
    presets: []
  };
}
const countryIds = new Set(countries.map((row) => row.id));
const languageIds = new Set(languages.map((row) => row.id));
function problem(message: string): never {
  throw new PortalError(400, message);
}
function object(value: unknown, keys: string[]): Record<string, unknown> {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).some((key) => !keys.includes(key))
  )
    problem(
      "Use only the supported discovery choices. Your entries have not been shortened."
    );
  return value as Record<string, unknown>;
}
function choice<T extends string | number>(
  value: unknown,
  options: readonly T[],
  fallback: T
): T {
  if (value === undefined) return fallback;
  if (!options.includes(value as T))
    problem("Choose a supported discovery option.");
  return value as T;
}
function flag(value: unknown, fallback: boolean) {
  if (value === undefined) return fallback;
  if (typeof value !== "boolean")
    problem("Choose an explicit on or off value.");
  return value;
}
export function discoveryText(value: unknown, maximum: number): string {
  if (
    typeof value !== "string" ||
    value.length > maximum ||
    /[\u0000-\u001f\u007f]/u.test(value)
  )
    problem(`Use up to ${maximum} characters without control characters.`);
  const normalized = value.normalize("NFKC").trim().replace(/\s+/gu, " ");
  if (normalized.length > maximum)
    problem(`Use up to ${maximum} normalized characters.`);
  return normalized;
}
function hiddenPhrase(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length > 80 ||
    /[\u0000-\u001f\u007f]/u.test(value)
  )
    problem(
      "Use hidden phrases of up to 80 characters without control characters."
    );
  // Match literal internal spacing and spelling; only case and outer whitespace are ignored.
  const phrase = value.trim().toLocaleLowerCase("en-US");
  if (phrase.length > 80) problem("Use hidden phrases of up to 80 characters.");
  return phrase;
}
export function denominationKey(value: unknown) {
  const key = discoveryText(value, 80).toLocaleLowerCase("en-US");
  // Spelling variants only. Do not infer that distinct traditions are related.
  return ["non denominational", "nondenominational"].includes(key)
    ? "non-denominational"
    : key;
}
function list(
  value: unknown,
  maximum: number,
  normalize: (item: unknown) => string
): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > maximum)
    problem(`Choose up to ${maximum} entries.`);
  const result = value.map(normalize);
  if (result.some((item) => !item) || new Set(result).size !== result.length)
    problem("Use different, non-empty choices.");
  return result.sort();
}
const topic = (value: unknown) => choice(value, POST_TOPICS, "community");
export function discoveryCountry(value: unknown): string | null {
  if (value == null || value === "") return null;
  if (typeof value !== "string" || !countryIds.has(value))
    problem("Choose a country from the list.");
  return value;
}
export function discoveryLanguage(value: unknown): string | null {
  if (value == null || value === "") return null;
  if (typeof value !== "string" || !languageIds.has(value))
    problem("Choose a language from the list or leave it unclassified.");
  return value;
}
export function discoveryPlaceId(value: unknown): number | null {
  if (value == null || value === "") return null;
  if (
    !Number.isSafeInteger(value) ||
    (value as number) < 1 ||
    (value as number) > 100_000_000
  )
    problem("Choose a named town or area from the results.");
  return value as number;
}
export function parseDiscoveryFilters(value: unknown): DiscoveryFilters {
  const p = object(value, Object.keys(defaultDiscoveryFilters())),
    base = defaultDiscoveryFilters();
  const homeChurchId =
    p.homeChurchId == null || p.homeChurchId === "" ? null : p.homeChurchId;
  if (
    homeChurchId !== null &&
    (typeof homeChurchId !== "string" ||
      !/^[a-zA-Z0-9_-]{1,100}$/.test(homeChurchId))
  )
    problem("Choose an approved church connection.");
  const result: DiscoveryFilters = {
    sort: choice(p.sort, DISCOVERY_SORTS, base.sort),
    homeChurchId: homeChurchId as string | null,
    geography: choice(
      p.geography,
      ["worldwide", "country", "local"] as const,
      base.geography
    ),
    country: discoveryCountry(p.country),
    placeId: discoveryPlaceId(p.placeId),
    radiusKm: choice(p.radiusKm, DISCOVERY_RADII, base.radiusKm),
    expand: flag(p.expand, false),
    denominations: list(p.denominations, 10, denominationKey),
    languages: list(
      p.languages,
      10,
      (item) => discoveryLanguage(item) ?? problem("Choose a language.")
    ),
    includeUnknownLanguage: flag(p.includeUnknownLanguage, true),
    topics: list(p.topics, 10, topic),
    types: list(p.types, DISCOVERY_TYPES.length, (item) =>
      choice(item, DISCOVERY_TYPES, "UPDATE")
    ) as DiscoveryFilters["types"]
  };
  if (result.placeId && !result.country)
    problem("Choose the country for this town or area.");
  if (result.geography !== "worldwide" && !result.country)
    problem("Choose a country for this geographic filter.");
  if (result.geography === "local" && !result.placeId)
    problem("Choose a named town or area for a local filter.");
  return result;
}
export function parseDiscoveryPreferences(
  value: unknown
): DiscoveryPreferences {
  const p = object(value, Object.keys(defaultDiscoveryPreferences()));
  const feedback = object(p.feedback ?? {}, [...POST_TOPICS]);
  for (const score of Object.values(feedback))
    if (score !== -1 && score !== 1)
      problem("Choose More, Less or Reset for recommendation feedback.");
  if (
    p.presets !== undefined &&
    (!Array.isArray(p.presets) || p.presets.length > 6)
  )
    problem("Keep up to six saved feed presets.");
  const presets = ((p.presets ?? []) as unknown[]).map((item) => {
    const preset = object(item, ["id", "name", "mode", "filters"]);
    if (
      typeof preset.id !== "string" ||
      !/^[a-zA-Z0-9_-]{1,60}$/.test(preset.id)
    )
      problem("Use a valid saved preset reference.");
    const name = discoveryText(preset.name, 60),
      mode = discoveryMode(preset.mode);
    if (!name || !mode)
      problem("Name this preset and choose a discovery feed.");
    const filters = parseDiscoveryFilters(preset.filters);
    if (mode === "local" && !filters.placeId)
      problem("Choose a named town or area for a Local preset.");
    if (mode === "your-church" && !filters.homeChurchId)
      problem("Choose an approved church for a Your Church preset.");
    return { id: preset.id as string, name, mode: mode!, filters };
  });
  if (new Set(presets.map((p) => p.id)).size !== presets.length)
    problem("Use different saved preset references.");
  return {
    filters: parseDiscoveryFilters(p.filters ?? {}),
    interests: list(p.interests, 10, topic),
    hiddenWords: list(p.hiddenWords, 20, hiddenPhrase),
    hiddenTopics: list(p.hiddenTopics, 10, topic),
    feedback: Object.fromEntries(Object.entries(feedback).sort()),
    presets
  };
}
export function guestDiscoveryPreferences(
  cookie: unknown
): DiscoveryPreferences {
  if (!cookie) return defaultDiscoveryPreferences();
  try {
    if (typeof cookie !== "string" || cookie.length > 3500) throw Error();
    return parseDiscoveryPreferences(JSON.parse(decodeURIComponent(cookie)));
  } catch {
    throw new PortalError(
      409,
      "These browser-only discovery choices could not be read. Clear the unreadable guest choices in Feed Settings before opening posts."
    );
  }
}
export function effectiveDiscoverySort(
  mode: DiscoveryMode,
  filters: DiscoveryFilters
) {
  return ["following", "your-church", "favorites"].includes(mode)
    ? "newest"
    : mode === "for-you"
      ? "relevant"
      : filters.sort;
}
