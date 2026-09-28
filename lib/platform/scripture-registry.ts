import data from "./scripture-registry-data.json" with { type: "json" };

/** Frozen factual numbering data, not a canon, translation or conversion table. */
export const SCRIPTURE_REGISTRY_VERSION = data.registryVersion;
export type ScriptureSystemId = "sil-eng" | "sil-org";
export type ScriptureSystem = Readonly<{
  id: ScriptureSystemId;
  label: string;
  version: string;
  sourceVersion: string;
  bookCount: number;
}>;
export type ScriptureBook = Readonly<{
  id: string;
  name: string;
  aliases: readonly string[];
  /** Positive verse maxima, indexed by chapter minus one. No verse zero. */
  chapters: readonly number[];
}>;

export function normalizeScriptureBookAlias(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

const bounds = data.chapterBounds.map((chapters) => Object.freeze(chapters));
const names = new Map(
  data.books.map((book) => [
    book.id,
    Object.freeze({ ...book, aliases: Object.freeze(book.aliases) })
  ])
);
const systems = new Map<string, ScriptureSystem>();
const booksBySystem = new Map<string, ReadonlyMap<string, ScriptureBook>>();
const lists = new Map<string, readonly ScriptureBook[]>();
const aliases = new Map<
  string,
  ReadonlyMap<string, readonly ScriptureBook[]>
>();
const emptyBooks: readonly ScriptureBook[] = Object.freeze([]);

for (const source of data.systems) {
  if (source.id !== "sil-eng" && source.id !== "sil-org")
    throw new Error("Unreviewed Scripture reference system.");
  const books = new Map<string, ScriptureBook>();
  const matches = new Map<string, ScriptureBook[]>();
  for (const [id, index] of Object.entries(source.books)) {
    const name = names.get(id);
    const chapters = bounds[index];
    if (
      !name ||
      name.name.includes("*obsolete*") ||
      !chapters?.length ||
      chapters.some(
        (count) => !Number.isSafeInteger(count) || count < 1 || count >= 1000
      )
    )
      throw new Error("Invalid frozen Scripture reference data.");
    const book: ScriptureBook = Object.freeze({ ...name, chapters });
    books.set(id, book);
    for (const alias of book.aliases) {
      const key = normalizeScriptureBookAlias(alias);
      const entries = matches.get(key) ?? [];
      if (!entries.some((entry) => entry.id === id)) entries.push(book);
      matches.set(key, entries);
    }
  }
  const system: ScriptureSystem = Object.freeze({
    id: source.id,
    label: source.label,
    version: SCRIPTURE_REGISTRY_VERSION,
    sourceVersion: source.sourceVersion,
    bookCount: books.size
  });
  systems.set(system.id, system);
  booksBySystem.set(system.id, books);
  lists.set(system.id, Object.freeze([...books.values()]));
  aliases.set(
    system.id,
    new Map([...matches].map(([key, values]) => [key, Object.freeze(values)]))
  );
}

/** Small UI list. Callers must choose a system; array order is not a default. */
export const scriptureSystems: readonly ScriptureSystem[] = Object.freeze([
  ...systems.values()
]);

export function getScriptureSystem(id: string): ScriptureSystem | null {
  return systems.get(id) ?? null;
}

/** Book IDs are stable identifiers, not aliases; use the resolver for input. */
export function getScriptureBook(
  systemId: string,
  bookId: string
): ScriptureBook | null {
  return booksBySystem.get(systemId)?.get(bookId) ?? null;
}

export function scriptureBooks(systemId: string): readonly ScriptureBook[] {
  return lists.get(systemId) ?? emptyBooks;
}

/** Multiple results require an explicit book choice, never the first result. */
export function scriptureBookMatches(
  systemId: string,
  name: string
): readonly ScriptureBook[] {
  return (
    aliases.get(systemId)?.get(normalizeScriptureBookAlias(name)) ?? emptyBooks
  );
}

export function resolveScriptureBook(
  systemId: string,
  name: string
): ScriptureBook | null {
  const matches = scriptureBookMatches(systemId, name);
  return matches.length === 1 ? matches[0] : null;
}
