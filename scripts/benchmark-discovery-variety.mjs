// Small deterministic CPU comparison. No database, network, provider or fixture writes.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cpus } from "node:os";
import { applyDiscoveryVariety } from "../lib/platform/discovery-variety.ts";
import { applyDiscoveryVariety as baseline } from "../tests/fixtures/discovery-variety-baseline.mjs";

const source = execFileSync("git", ["rev-parse", "HEAD"], {
  encoding: "utf8"
}).trim();
const dirty =
  execFileSync("git", ["status", "--porcelain"], {
    encoding: "utf8"
  }).trim() !== "";
const cases = [];
const summarize = (samples) => {
  const sorted = [...samples].sort((a, b) => a - b);
  return {
    p50: sorted[Math.ceil(sorted.length * 0.5) - 1],
    p95: sorted[Math.ceil(sorted.length * 0.95) - 1],
    samples
  };
};
for (const count of [100, 1000, 10000]) {
  for (const pattern of [
    "one-author",
    "five-groups",
    "round-robin",
    "all-distinct"
  ]) {
    const rows = Array.from({ length: count }, (_, i) => ({
      post: {
        id: String(i),
        authorChurchId: null,
        authorId: String(
          pattern === "one-author"
            ? 0
            : pattern === "five-groups"
              ? Math.floor(i / (count / 5))
              : pattern === "round-robin"
                ? i % 100
                : i
        )
      }
    }));
    const expected = baseline(rows),
      actual = applyDiscoveryVariety(rows);
    actual.forEach((row, i) => assert.equal(row, expected[i]));
    assert.equal(actual.length, expected.length);
    const before = [],
      after = [];
    for (let round = 0; round < 9; round++) {
      const runs = [
        [baseline, before],
        [applyDiscoveryVariety, after]
      ];
      if (round % 2) runs.reverse();
      for (const [fn, samples] of runs) {
        const start = performance.now();
        fn(rows);
        samples.push(performance.now() - start);
      }
    }
    cases.push({
      count,
      pattern,
      baselineMs: summarize(before),
      candidateMs: summarize(after)
    });
  }
}
console.log(
  JSON.stringify(
    {
      source,
      dirty,
      node: process.version,
      cpu: cpus()[0].model,
      capturedAt: new Date().toISOString(),
      cases,
      limitations:
        "Alternating deterministic CPU microbenchmark; no request-latency or hosted-capacity claim."
    },
    null,
    2
  )
);
