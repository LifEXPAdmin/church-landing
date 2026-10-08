import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { androidBuildPlan, verifyAndroidOwnership, verifyAndroidToolchain } from "../scripts/android-build.mjs";

test("Android native packages remain separate and the local build cannot select production or arbitrary tasks", () => {
  const dev = androidBuildPlan("/task with spaces/mobile", "development");
  const stage = androidBuildPlan("/task with spaces/mobile", "staging");
  assert.notEqual(dev.packageName, stage.packageName);
  assert.notEqual(dev.variantRoot, stage.variantRoot);
  assert.equal(dev.args[0], ":app:assembleRelease");
  assert(dev.args.includes("--no-daemon") && dev.args.includes("--no-parallel") && dev.args.includes("--max-workers=1"));
  assert(dev.args.includes("-PreactNativeArchitectures=arm64-v8a"));
  for (const variant of ["production", "../development", "release", ""]) assert.throws(() => androidBuildPlan("/task/mobile", variant));
});

test("another worker or worktree cannot use a native build reservation", (t) => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "gc-android-ownership-")));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const own = join(root, "own"), other = join(root, "other");
  mkdirSync(own); mkdirSync(other);
  const registry = { workers: { A: { worktree: own } }, claims: { A: { resources: ["contract:machine-build"] } } };
  verifyAndroidOwnership(registry, own, "A");
  assert.throws(() => verifyAndroidOwnership(registry, other, "A"));
  assert.throws(() => verifyAndroidOwnership(registry, own, "B"));
  assert.throws(() => verifyAndroidOwnership(registry, own));
  registry.claims.A.resources = ["contract:android-native-build"];
  assert.throws(() => verifyAndroidOwnership(registry, own, "A"));
});

test("missing tools and storage escapes fail before a native build writes output", (t) => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "gc-android-tools-")));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const storage = { storage: join(root, "storage"), device: statSync(root).dev };
  const sdk = join(storage.storage, "sdk"), java = join(storage.storage, "jdk");
  for (const name of ["platforms/android-36/android.jar", "build-tools/36.0.0/aapt2", "ndk/27.1.12297006/source.properties", "cmake/3.30.5/bin/cmake"]) {
    const path = join(sdk, name); mkdirSync(join(path, ".."), { recursive: true }); writeFileSync(path, "fictional");
  }
  mkdirSync(join(java, "bin"), { recursive: true }); writeFileSync(join(java, "bin/java"), "fictional");
  verifyAndroidToolchain(storage, { sdk, java });
  assert.throws(() => verifyAndroidToolchain({ ...storage, device: -1 }, { sdk, java }));
  assert.throws(() => verifyAndroidToolchain(storage, { sdk: root, java }));
  assert.throws(() => verifyAndroidToolchain(storage, { sdk: "relative", java }));
  const alias = join(storage.storage, "escaped"); symlinkSync(root, alias);
  assert.throws(() => verifyAndroidToolchain(storage, { sdk: alias, java }));
  rmSync(join(sdk, "cmake/3.30.5/bin/cmake"));
  assert.throws(() => verifyAndroidToolchain(storage, { sdk, java }));
});
