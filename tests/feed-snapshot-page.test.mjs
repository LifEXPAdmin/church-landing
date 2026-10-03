import test from "node:test";
import assert from "node:assert/strict";
import { readSnapshotPage } from "../lib/platform/feed-snapshot-page.ts";

const refs = (count) => Array.from({ length: count }, (_, i) => `post-${i}`);
const reader =
  (allowed, calls = []) =>
  async (chunk) => {
    calls.push(chunk);
    // SQL ordering must not replace the saved ranked order.
    return new Map(
      [...chunk]
        .reverse()
        .filter((id) => allowed.has(id))
        .map((id) => [id, { id }])
    );
  };
test("a dense saved set rechecks a bounded prefix and keeps exact order and row metadata", async () => {
  const references = refs(10000),
    calls = [];
  const result = await readSnapshotPage(
    references,
    30,
    reader(new Set(references), calls)
  );
  assert.deepEqual(result.ids, references.slice(0, 30));
  assert.equal(result.hasMore, true);
  assert.deepEqual(
    [...result.rows.values()],
    result.ids.map((id) => ({ id }))
  );
  assert.equal(calls.length, 1);
  assert.ok(calls[0].length < references.length);
});
test("long revoked prefixes are exhausted without holes or an artificial scan limit", async () => {
  const references = refs(10000),
    calls = [];
  const allowed = new Set(references.slice(9900));
  const result = await readSnapshotPage(references, 30, reader(allowed, calls));
  assert.deepEqual(result.ids, references.slice(9900, 9930));
  assert.equal(result.hasMore, true);
  assert.deepEqual(calls.flat(), references);
});
test("exactly 30 survivors plus a revoked tail has no next page; all revoked returns empty", async () => {
  const references = refs(10000);
  for (const count of [0, 1, 29, 30, 31]) {
    const calls = [];
    const result = await readSnapshotPage(
      references,
      30,
      reader(new Set(references.slice(0, count)), calls)
    );
    assert.deepEqual(result.ids, references.slice(0, Math.min(count, 30)));
    assert.equal(result.hasMore, count > 30);
    if (count <= 30) assert.deepEqual(calls.flat(), references);
  }
});
test("lookahead never replaces the caller's last-returned cursor boundary", async () => {
  const references = refs(1000);
  const first = await readSnapshotPage(
    references,
    30,
    reader(new Set([...references.slice(0, 30), references[900]]))
  );
  assert.equal(first.hasMore, true);
  const offset = references.indexOf(first.ids.at(-1)) + 1;
  const restored = await readSnapshotPage(
    references.slice(offset),
    30,
    reader(new Set(references))
  );
  assert.deepEqual(restored.ids, references.slice(30, 60));
});
test("retained expired page references are rechecked without filling from other entries", async () => {
  const page = refs(30);
  const result = await readSnapshotPage(
    page,
    30,
    reader(new Set(page.slice(15)))
  );
  assert.deepEqual(result.ids, page.slice(15));
  assert.equal(result.hasMore, false);
  assert.deepEqual(
    await readSnapshotPage([], 30, async () => {
      throw Error("Empty read");
    }),
    { ids: [], rows: new Map(), hasMore: false }
  );
});
test("a failed current-access read rejects the entire page", async () => {
  let count = 0;
  await assert.rejects(
    readSnapshotPage(refs(1000), 30, async (chunk) => {
      if (++count > 1) throw Error("Authority unavailable");
      return new Map(chunk.slice(0, 15).map((id) => [id, true]));
    }),
    /Authority unavailable/
  );
});
test("seeded sparse and duplicate sequences match the whole-set filter contract", async () => {
  let seed = 1790985251;
  const random = () =>
    (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32;
  for (let run = 0; run < 150; run++) {
    const references = Array.from(
      { length: Math.floor(random() * 1500) },
      () => `post-${Math.floor(random() * 500)}`
    );
    const allowed = new Set(refs(500).filter(() => random() < (run % 10) / 10));
    const expected = references.filter((id) => allowed.has(id));
    const result = await readSnapshotPage(references, 30, reader(allowed));
    assert.deepEqual(result.ids, expected.slice(0, 30));
    assert.equal(result.hasMore, expected.length > 30);
  }
});
