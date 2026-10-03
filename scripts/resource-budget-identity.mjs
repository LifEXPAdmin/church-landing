import assert from "node:assert/strict";

const sha = /^[a-f0-9]{40}$/;
const digest = /^[a-f0-9]{64}$/;
export function resourceCandidate(
  candidate,
  { source, buildId, fixtureSha256 }
) {
  assert.equal(candidate?.schema, 1, "RESOURCE_CANDIDATE_SCHEMA");
  assert.match(candidate.sourceSha ?? "", sha, "RESOURCE_CANDIDATE_SHA");
  assert.equal(candidate.sourceSha, source, "RESOURCE_CHECKOUT_SOURCE");
  assert.match(
    candidate.productVersion ?? "",
    /^\d{4}\.\d{2}\.\d{2}\.\d+$/,
    "RESOURCE_PRODUCT_VERSION"
  );
  assert.match(
    candidate.buildId ?? "",
    /^[A-Za-z0-9_-]{1,128}$/,
    "RESOURCE_BUILD_ID"
  );
  assert.equal(candidate.buildId, buildId, "RESOURCE_LOCAL_BUILD");
  assert.match(
    candidate.fixtureSha256 ?? "",
    digest,
    "RESOURCE_FIXTURE_DIGEST"
  );
  assert.equal(
    candidate.fixtureSha256,
    fixtureSha256,
    "RESOURCE_FIXTURE_CHANGED"
  );
  return Object.freeze({
    schema: 1,
    sourceSha: candidate.sourceSha,
    productVersion: candidate.productVersion,
    buildId: candidate.buildId,
    fixtureSha256: candidate.fixtureSha256
  });
}
export function resourceServingIdentity(candidate, ready, identity, origin) {
  assert.equal(ready?.origin, origin, "RESOURCE_ORIGIN");
  assert.equal(
    ready.runtimeSource,
    candidate.sourceSha,
    "RESOURCE_READY_SOURCE"
  );
  assert.equal(ready.buildId, candidate.buildId, "RESOURCE_READY_BUILD");
  assert.equal(
    identity?.release,
    candidate.sourceSha,
    "RESOURCE_SERVING_SOURCE"
  );
  assert.equal(
    identity.product?.build,
    candidate.sourceSha,
    "RESOURCE_PRODUCT_BUILD"
  );
  assert.equal(
    identity.product?.version,
    candidate.productVersion,
    "RESOURCE_SERVING_VERSION"
  );
}
