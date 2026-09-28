import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeScripture as normalize,
  scriptureOverlap as overlaps,
  scriptureLabel
} from "../lib/platform/media-scripture";
import {
  SCRIPTURE_REGISTRY_VERSION as version,
  scriptureBooks,
  scriptureSystems
} from "../lib/platform/scripture-registry";
const input = (text: string, system = "sil-eng") => [
  { referenceSystemId: system, referenceVersion: version, originals: [text] }
];
const range = (text: string, system = "sil-eng") =>
  normalize(input(text, system))[0];

test("deduplicated provenance always survives a second validation pass", () => {
  const supplied = Array.from({ length: 21 }, (_, i) => " ".repeat(i) + "John 3:16").join(";");
  const rows = normalize(input(supplied));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].originals.length, 21);
  assert.deepEqual(normalize(rows), rows);
});

test("aliases preserve original provenance and reparse to identical canonical coordinates", () => {
  const rows = normalize(input("John 3:16; Jn 3:16; JOHN 3:16"));
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0].originals, ["John 3:16", " Jn 3:16", " JOHN 3:16"]);
  assert.deepEqual(normalize(rows), rows);
  assert.equal(rows[0].bookId, "JHN");
  assert.match(scriptureLabel(rows[0]), /John 3:16/);
});
test("inclusive overlap handles verses, full chapters, book-only and cross-chapter ranges", () => {
  assert.equal(overlaps(range("John 3:16-18"), range("John 3:18-20")), true);
  assert.equal(overlaps(range("John 3:16-18"), range("John 3:19")), false);
  assert.equal(overlaps(range("John 3"), range("John 3:36")), true);
  assert.equal(overlaps(range("John 3"), range("John 4:1")), false);
  assert.equal(overlaps(range("John"), range("John 21:25")), true);
  assert.equal(overlaps(range("John 3:36-4:2"), range("John 4:2")), true);
  assert.equal(overlaps(range("John 3:36-4:2"), range("John 4:3")), false);
  assert.equal(overlaps(range("John 3-4"), range("John 4:54")), true);
  assert.equal(overlaps(range("John 3:16 to 18"), range("Jn 3:17")), true);
});
test("books, versions and explicitly selected systems never implicitly merge", () => {
  assert.equal(overlaps(range("1 John 3:16"), range("John 3:16")), false);
  assert.equal(overlaps(range("1Jn 3:16"), range("1 John 3:16")), true);
  assert.equal(
    overlaps(range("John 3:16", "sil-org"), range("John 3:16")),
    false
  );
  const changed = { ...range("John 3:16"), referenceVersion: "old" };
  assert.equal(overlaps(changed, range("John 3:16")), false);
  assert.throws(() => normalize(input("John 3:16", "")), /choose.*explicitly/);
  assert.throws(
    () => normalize(input("John 3:16", "sil-lxx")),
    /choose.*explicitly/
  );
  assert.throws(
    () => normalize([{ ...input("John 3:16")[0], referenceVersion: "old" }]),
    /version is unsupported/
  );
});
test("malformed and ambiguous references fail with actionable errors without clamping", () => {
  for (const text of [
    "John 3:18-16",
    "John 0:1",
    "John 22:1",
    "John 3:37",
    "John 3:0",
    "John 3:1-4:99",
    "John 3-4:2",
    "John 3:1-2:1",
    "John 3.5",
    "John -1",
    "Jo 3:16",
    "Unknown 1",
    "John 3;",
    "John 3;;Mark 1",
    "John 3:16,18",
    "John 3:16-1 John 3:18",
    "Esther 1",
    "Daniel 1"
  ]) {
    assert.throws(() => normalize(input(text)), /Scripture references:/, text);
  }
});
test("bounds and limits apply across lists; forged canonical coordinates are rejected", () => {
  const r = range("John 3:16");
  assert.throws(() => normalize([{ ...r, startKey: 1 }]), /coordinates/);
  assert.throws(() => normalize([{ ...r, bookId: "1JN" }]), /coordinates/);
  assert.throws(
    () => normalize([{ ...r, arbitraryHtml: "x" }]),
    /supported reference fields/
  );
  assert.throws(() => normalize(Array(21).fill(input("John 3")[0])), /20/);
  assert.throws(
    () =>
      normalize(
        input(Array.from({ length: 21 }, (_, i) => `John ${i + 1}`).join(";"))
      ),
    /20/
  );
  assert.throws(() => normalize(input("John 3\u0000")), /plain text/);
  assert.throws(() => normalize(input("x".repeat(4001))), /4,000/);
  assert.throws(() => normalize(null), /20/);
  assert.deepEqual(normalize(undefined), []);
  assert.equal(normalize(input("John 3:16;1 John 3:16\nMark 1")).length, 3);
});
test("every declared book validates its actual first/last bounds and rejects the next chapter or verse", () => {
  for (const system of scriptureSystems) {
    for (const book of scriptureBooks(system.id)) {
      const final = book.chapters.length,
        last = book.chapters[final - 1];
      const all = range(book.id, system.id);
      assert.equal(overlaps(all, range(`${book.id} 1:1`, system.id)), true);
      assert.equal(
        overlaps(all, range(`${book.id} ${final}:${last}`, system.id)),
        true
      );
      assert.throws(
        () => range(`${book.id} ${final + 1}:1`, system.id),
        /chapters/
      );
      assert.throws(
        () => range(`${book.id} ${final}:${last + 1}`, system.id),
        /verses/
      );
      assert.ok(
        book.chapters.every((n) => Number.isSafeInteger(n) && n > 0 && n < 1000)
      );
    }
  }
});
