import test from "node:test";
import assert from "node:assert/strict";
import {
  features,
  releases,
  baselineBuild,
  parseReleaseNotes,
  releaseMetadata
} from "../lib/platform/release-content";
import { installationUpdateDecision } from "../lib/platform/install-policy";
test("public release content has stable unique identities, valid references and public internal destinations", () => {
  assert.equal(new Set(features.map((f) => f.id)).size, features.length);
  assert.equal(new Set(releases.map((r) => r.id)).size, releases.length);
  assert.equal(new Set(releases.map((r) => r.version)).size, releases.length);
  assert.match(baselineBuild, /^[a-f0-9]{40}$/);
  for (const f of features) {
    assert.match(f.href, /^\/(?:platform(?:\/|$)|about#our-mission$)/);
    assert.doesNotMatch(
      JSON.stringify(f),
      /notion\.|todoist\.|GC-DEMO|example\.test/
    );
    assert.ok(f.eligibility && f.steps);
  }
  for (const r of releases) {
    assert.deepEqual(parseReleaseNotes(r), r);
    assert.match(r.version, /^\d{4}\.\d{2}\.\d{2}\.\d+$/);
    assert.equal(new Date(r.date).toISOString().slice(0, 10), r.date);
    for (const id of r.featureIds) assert.ok(features.some((f) => f.id === id));
  }
  assert.equal(releaseMetadata(null), null);
  assert.equal(parseReleaseNotes({ id: "bad" }), null);
  assert.equal(
    parseReleaseNotes({ ...releases[0], added: Array(31).fill("x") }),
    null
  );
});
test("release notes do not weaken dirty, saving, conflict or rollback refresh decisions", () => {
  const loaded = "2".repeat(40),
    older = "1".repeat(40);
  assert.equal(
    installationUpdateDecision(loaded, older, {
      dirty: false,
      saving: false,
      conflict: false
    }),
    "offer-refresh"
  );
  for (const field of ["dirty", "saving", "conflict"])
    assert.equal(
      installationUpdateDecision(loaded, older, {
        dirty: false,
        saving: false,
        conflict: false,
        [field]: true
      }),
      "keep-work"
    );
  assert.equal(
    installationUpdateDecision(loaded, null, {
      dirty: false,
      saving: false,
      conflict: false
    }),
    "unknown"
  );
});
