import { PortalError } from "./portal-policy";
import {
  SCRIPTURE_REGISTRY_VERSION,
  getScriptureSystem,
  getScriptureBook,
  scriptureBookMatches,
  resolveScriptureBook,
  scriptureBooks
} from "./scripture-registry";

export type ScripturePoint = { chapter: number; verse: number | null };
export type ScriptureRange = {
  referenceSystemId: string;
  referenceVersion: string;
  bookId: string;
  start: ScripturePoint;
  end: ScripturePoint;
  startKey: number;
  endKey: number;
  originals: string[];
};
const problem = (message: string): never => {
  throw new PortalError(400, `Scripture references: ${message}`);
};
const normalizedName = (s: string) =>
  s.trim().replace(/\s+/g, " ").toLowerCase();
function checkedText(value: unknown): string {
  if (
    typeof value !== "string" ||
    !value.isWellFormed() ||
    value.length > 4000 ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)
  )
    return problem("use plain text, up to 4,000 characters per entry.");
  return value;
}
function parseOne(systemId: string, original: string): ScriptureRange {
  const text = normalizedName(original);
  const candidates = scriptureBooks(systemId).flatMap((book) =>
    [book.name, book.id, ...book.aliases]
      .map(normalizedName)
      .filter((alias) => text === alias || text.startsWith(alias + " "))
      .map((alias) => ({ book, alias }))
  );
  candidates.sort((a, b) => b.alias.length - a.alias.length);
  const match = candidates[0];
  if (match && scriptureBookMatches(systemId, match.alias).length > 1)
    return problem(
      `the book name in "${original}" is ambiguous. Choose ${scriptureBookMatches(
        systemId,
        match.alias
      )
        .map((b) => `${b.name} (${b.id})`)
        .join(" or ")}.`
    );
  if (!match || !resolveScriptureBook(systemId, match.alias))
    return problem(
      `check the book name in "${original}". Use a supported full name, such as John or 1 John.`
    );
  const book = match.book;
  const tail = text.slice(match.alias.length).trim();
  const m = tail.match(
    /^(\d{1,3})(?:\s*:\s*(\d{1,3}))?(?:\s*(?:-|\u2013|\bto\b)\s*(\d{1,3})(?:\s*:\s*(\d{1,3}))?)?$/
  );
  if (tail && !m)
    return problem(
      `check "${original}". Use a chapter or range, such as John 3, John 3:16-18 or John 3:36-4:2. Separate passages with semicolons.`
    );
  let start: ScripturePoint = { chapter: 1, verse: null };
  let end: ScripturePoint = { chapter: book.chapters.length, verse: null };
  if (m) {
    start = { chapter: Number(m[1]), verse: m[2] ? Number(m[2]) : null };
    if (!m[3]) end = { ...start };
    else if (start.verse === null) {
      if (m[4])
        return problem(
          `use whole chapters or verse endpoints consistently in "${original}".`
        );
      end = { chapter: Number(m[3]), verse: null };
    } else
      end = m[4]
        ? { chapter: Number(m[3]), verse: Number(m[4]) }
        : { chapter: start.chapter, verse: Number(m[3]) };
  }
  for (const point of [start, end]) {
    const maximum = book.chapters[point.chapter - 1];
    if (
      !Number.isSafeInteger(point.chapter) ||
      point.chapter < 1 ||
      maximum === undefined
    )
      return problem(
        `${book.name} has chapters 1 to ${book.chapters.length} in the selected reference system.`
      );
    if (
      point.verse !== null &&
      (!Number.isSafeInteger(point.verse) ||
        point.verse < 1 ||
        point.verse > maximum)
    )
      return problem(
        `${book.name} ${point.chapter} has verses 1 to ${maximum} in the selected reference system.`
      );
  }
  // Local coordinates within one book only. Registry validation guarantees fewer
  // than 1,000 verses per chapter; no universal book ordering is introduced.
  const startKey = start.chapter * 1000 + (start.verse ?? 1);
  const endKey =
    end.chapter * 1000 + (end.verse ?? book.chapters[end.chapter - 1]);
  if (startKey > endKey)
    return problem(`put the earlier endpoint first in "${original}".`);
  return {
    referenceSystemId: systemId,
    referenceVersion: SCRIPTURE_REGISTRY_VERSION,
    bookId: book.id,
    start,
    end,
    startKey,
    endKey,
    originals: [original]
  };
}
const key = (r: ScriptureRange) =>
  JSON.stringify([
    r.referenceSystemId,
    r.referenceVersion,
    r.bookId,
    r.start,
    r.end
  ]);

/** Reparse source text on every write. Caller-supplied coordinates are never trusted. */
export function normalizeScripture(value: unknown): ScriptureRange[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 20)
    return problem("use up to 20 passage entries.");
  const ranges = new Map<string, ScriptureRange>();
  let totalText = 0,
    provenanceCount = 0;
  for (const entry of value) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry))
      return problem("check each passage entry.");
    const v = entry as Record<string, unknown>;
    if (
      Object.keys(v).some(
        (k) =>
          ![
            "referenceSystemId",
            "referenceVersion",
            "originals",
            "bookId",
            "start",
            "end",
            "startKey",
            "endKey"
          ].includes(k)
      )
    )
      return problem("use only the supported reference fields.");
    if (
      typeof v.referenceSystemId !== "string" ||
      !getScriptureSystem(v.referenceSystemId)
    )
      return problem(
        "choose a supported reference system explicitly. Other systems cannot be converted automatically."
      );
    if (v.referenceVersion !== SCRIPTURE_REGISTRY_VERSION)
      return problem(
        "reload the current reference list before saving; this reference version is unsupported."
      );
    if (
      !Array.isArray(v.originals) ||
      !v.originals.length ||
      v.originals.length > 40
    )
      return problem("enter the original passage text.");
    const parsed: ScriptureRange[] = [];
    for (const original of v.originals) {
      const text = checkedText(original);
      totalText += text.length;
      if (totalText > 8000)
        return problem("use at most 8,000 characters across all passages.");
      const parts = text.split(/[;\n]/);
      if (parts.some((part) => !part.trim()))
        return problem("remove empty passages between separators.");
      for (const part of parts) {
        if (++provenanceCount > 40)
          return problem(
            "use up to 40 supplied references, with at most 20 distinct ranges."
          );
        parsed.push(parseOne(v.referenceSystemId, part));
      }
    }
    for (const r of parsed) {
      for (const k of [
        "bookId",
        "start",
        "end",
        "startKey",
        "endKey"
      ] as const) {
        const supplied = v[k];
        const pointMatches =
          (k === "start" || k === "end") &&
          supplied &&
          typeof supplied === "object" &&
          !Array.isArray(supplied) &&
          Object.keys(supplied).length === 2 &&
          (supplied as ScripturePoint).chapter === r[k].chapter &&
          (supplied as ScripturePoint).verse === r[k].verse;
        if (
          Object.hasOwn(v, k) &&
          (k === "start" || k === "end" ? !pointMatches : supplied !== r[k])
        )
          return problem(
            "the saved coordinates do not match the original text. Reload and enter the passage again."
          );
      }
      const prior = ranges.get(key(r));
      if (prior)
        prior.originals = [...new Set([...prior.originals, ...r.originals])];
      else ranges.set(key(r), r);
    }
    if (ranges.size > 20)
      return problem("use at most 20 distinct passage ranges.");
  }
  return [...ranges.values()];
}

export function scriptureOverlap(a: ScriptureRange, b: ScriptureRange) {
  return (
    a.referenceSystemId === b.referenceSystemId &&
    a.referenceVersion === b.referenceVersion &&
    a.bookId === b.bookId &&
    a.startKey <= b.endKey &&
    b.startKey <= a.endKey
  );
}
export function scriptureLabel(r: ScriptureRange) {
  const book = getScriptureBook(r.referenceSystemId, r.bookId);
  const system = getScriptureSystem(r.referenceSystemId);
  if (!book || !system || r.referenceVersion !== SCRIPTURE_REGISTRY_VERSION)
    return "Unclassified Scripture reference";
  const point = (p: ScripturePoint) =>
    `${p.chapter}${p.verse === null ? "" : ":" + p.verse}`;
  return `${book.name} ${point(r.start)}${JSON.stringify(r.start) === JSON.stringify(r.end) ? "" : " to " + point(r.end)} (${system.label})`;
}
