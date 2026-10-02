import test from "node:test";
import assert from "node:assert/strict";
import { applyDiscoveryVariety } from "../lib/platform/discovery-variety.ts";
import { applyDiscoveryVariety as baseline } from "./fixtures/discovery-variety-baseline.mjs";

const rows = (authors) =>
  authors.map((authorId, id) =>
    Object.freeze({
      post: Object.freeze({ id: String(id), authorId, authorChurchId: null })
    })
  );
function equivalent(input) {
  Object.freeze(input);
  const expected = baseline(input),
    actual = applyDiscoveryVariety(input);
  assert.equal(actual.length, expected.length);
  actual.forEach((row, index) => assert.equal(row, expected[index]));
  return actual;
}
test("empty, single, unique and single-author sets preserve row identity and frozen input", () => {
  for (const authors of [
    [],
    ["a"],
    Array.from({ length: 500 }, (_, i) => String(i)),
    Array(1000).fill("a")
  ]) {
    const input = rows(authors);
    assert.deepEqual(equivalent(input), input);
  }
});
test("an eligible alternative displaces the fourth row without losing ranked priority", () => {
  const input = rows(["a", "a", "a", "a", "b"]);
  assert.deepEqual(equivalent(input), [
    input[0],
    input[1],
    input[2],
    input[4],
    input[3]
  ]);
});
test("the fourth author row waits for exactly the prior nineteen outputs", () => {
  const input = rows([
    ...Array(4).fill("a"),
    ...Array.from({ length: 17 }, (_, i) => "b" + i)
  ]);
  const output = equivalent(input);
  assert.equal(output[20], input[3]);
  assert.equal(output[19], input[20]);
});
test("six blocked heads do not hide a seventh eligible author, with exact fallback when absent", () => {
  const authors = ["a", "b", "c", "d", "e", "f"].flatMap((a) =>
    Array(4).fill(a)
  );
  const input = rows([...authors, "g"]),
    output = equivalent(input);
  assert.equal(output[18], input[24]);
  const fallback = rows(authors);
  assert.equal(equivalent(fallback)[18], fallback[3]);
});
test("church identity takes precedence, person namespaces stay separate and duplicates survive", () => {
  const input = rows(["a", "b", "c", "d", "same", "same"]);
  const church = input
    .slice(0, 4)
    .map((row) => ({ post: { ...row.post, authorChurchId: "same" } }));
  const duplicate = church[0];
  equivalent([...church, input[4], input[5], duplicate, duplicate]);
  equivalent([
    { post: { authorId: "a", authorChurchId: "" } },
    ...rows(Array(30).fill("a"))
  ]);
});
test("skewed, grouped and interleaved seeded orders match the preserved algorithm", () => {
  let state = 20261002;
  const random = () => (state = (Math.imul(state, 1664525) + 1013904223) >>> 0);
  for (let run = 0; run < 150; run++) {
    const count = random() % 600,
      authors = 1 + (random() % 30);
    const input = rows(
      Array.from({ length: count }, (_, i) =>
        String(
          run % 3 === 0
            ? Math.floor(i / Math.max(1, count / authors))
            : run % 3 === 1 && random() % 5
              ? 0
              : random() % authors
        )
      )
    );
    equivalent(input);
  }
});
test("each ranking stage starts its own independent variety window", () => {
  const input = rows([...Array(10).fill("a"), ...Array(10).fill("b")]);
  assert.deepEqual(applyDiscoveryVariety(input), applyDiscoveryVariety(input));
  equivalent(input);
  equivalent(rows([...Array(100).fill("a"), ...Array(100).fill("b")]));
});
