import test from "node:test";
import assert from "node:assert/strict";
import {
  resourceCandidate,
  resourceServingIdentity
} from "../scripts/resource-budget-identity.mjs";
const source = "a".repeat(40),
  fixtureSha256 = "b".repeat(64),
  buildId = "fictional-build";
const candidate = {
  schema: 1,
  sourceSha: source,
  productVersion: "2026.09.28.42",
  buildId,
  fixtureSha256
};
const inputs = { source, buildId, fixtureSha256 };
const origin = "https://127.0.0.1:1234";
const ready = { origin, runtimeSource: source, buildId };
const identity = {
  release: source,
  product: { build: source, version: candidate.productVersion }
};
test("a declared current candidate replaces the obsolete fixed product version without relaxing identity", () => {
  const result = resourceCandidate(candidate, inputs);
  assert.deepEqual(result, candidate);
  assert.ok(Object.isFrozen(result));
  resourceServingIdentity(result, ready, identity, origin);
});
for (const [name, patch] of Object.entries({
  schema: { schema: 2 },
  missingSource: { sourceSha: undefined },
  shortSource: { sourceSha: "abc" },
  differentSource: { sourceSha: "c".repeat(40) },
  missingProduct: { productVersion: undefined },
  missingBuild: { buildId: undefined },
  differentBuild: { buildId: "other" },
  changedFixture: { fixtureSha256: "c".repeat(64) }
})) {
  test("candidate identity rejects " + name, () =>
    assert.throws(() => resourceCandidate({ ...candidate, ...patch }, inputs))
  );
}
for (const [name, alteredReady, alteredIdentity] of [
  ["origin", { ...ready, origin: "https://127.0.0.1:4321" }, identity],
  ["ready source", { ...ready, runtimeSource: "c".repeat(40) }, identity],
  ["ready build", { ...ready, buildId: "other" }, identity],
  ["served source", ready, { ...identity, release: "c".repeat(40) }],
  [
    "product build",
    ready,
    { ...identity, product: { ...identity.product, build: "c".repeat(40) } }
  ],
  [
    "stale product version",
    ready,
    { ...identity, product: { ...identity.product, version: "2026.09.18.8" } }
  ]
])
  test("serving identity rejects " + name, () =>
    assert.throws(() =>
      resourceServingIdentity(candidate, alteredReady, alteredIdentity, origin)
    )
  );
