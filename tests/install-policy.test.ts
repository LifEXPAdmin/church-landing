import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import {
  INSTALL_POLICY,
  installationUpdateDecision as decide,
  publicReleaseId
} from "../lib/platform/install-policy";
test("installation uses stable public identity, an in-scope guest-readable start, and existing normal/maskable icons", () => {
  const origin = "https://godschurches.example";
  assert.equal(new URL(INSTALL_POLICY.start_url, origin).origin, origin);
  assert.ok(INSTALL_POLICY.start_url.startsWith(INSTALL_POLICY.scope));
  assert.equal(INSTALL_POLICY.start_url, "/platform");
  assert.ok(!INSTALL_POLICY.id.includes("?"));
  for (const icon of INSTALL_POLICY.icons)
    assert.ok(existsSync(`public${icon.src}`));
  assert.ok(INSTALL_POLICY.icons.some((i) => i.purpose === "maskable"));
});
test("update contract preserves dirty, saving and conflicting work and treats absent build metadata as unknown", () => {
  const clean = { dirty: false, saving: false, conflict: false };
  assert.equal(decide(null, "b", clean), "unknown");
  assert.equal(decide("a", null, clean), "unknown");
  assert.equal(decide("a", "a", clean), "current");
  assert.equal(decide("a", "b", clean), "offer-refresh");
  for (const flag of ["dirty", "saving", "conflict"])
    assert.equal(decide("a", "b", { ...clean, [flag]: true }), "keep-work");
  assert.equal(publicReleaseId("credential-or-branch-name"), null);
  assert.equal(publicReleaseId("A".repeat(40)), "a".repeat(40));
});
