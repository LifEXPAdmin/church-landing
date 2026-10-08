import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import storagePlugin from "../plugins/with-ios-build-storage.js";
import { iosBuildPlan, verifyIosTarget } from "../scripts/ios-build.mjs";

test("native build separates variants and keeps generated outputs and unsigned Simulator selection explicit", () => {
  const root = "/external storage/mobile";
  const dev = iosBuildPlan(root, "development");
  const staging = iosBuildPlan(root, "staging");
  assert.notEqual(dev.scheme, staging.scheme);
  assert.notEqual(dev.bundleIdentifier, staging.bundleIdentifier);
  assert.notEqual(dev.generated, staging.generated);
  for (const plan of [dev, staging]) {
    assert(plan.args.includes("generic/platform=iOS Simulator"));
    assert(plan.args.includes("CODE_SIGNING_ALLOWED=NO"));
    assert.equal(plan.args[plan.args.indexOf("-derivedDataPath") + 1], plan.generated + "/DerivedData");
    assert.equal(plan.args[plan.args.indexOf("-clonedSourcePackagesDirPath") + 1], plan.generated + "/Packages");
    assert.equal(plan.args[plan.args.indexOf("-packageCachePath") + 1], plan.generated + "/PackageCache");
  }
  assert.throws(() => iosBuildPlan(root, "production"));
});

test("prebuild installs one cache hook before native preparation and rejects template drift", () => {
  const input = "require 'native_helpers'\nprepare_react_native_project!\ntarget 'Example' do\nend\n";
  const changed = storagePlugin.addCacheHook(input);
  assert(changed.includes("require_relative '../scripts/ios-pod-cache'\nprepare_react_native_project!"));
  assert.equal(storagePlugin.addCacheHook(changed), changed);
  assert.throws(() => storagePlugin.addCacheHook("changed template"));
  assert.throws(() => storagePlugin.addCacheHook(input + input));
});

test("Mac Pod cache hook scopes both native caches without changing artifact checks", { skip: process.platform !== "darwin" }, () => {
  const root = mkdtempSync(join(tmpdir(), "gc-ios-cache-check-"));
  try {
    mkdirSync(join(root, "scripts"));
    mkdirSync(join(root, "node_modules", "react-native"), { recursive: true });
    mkdirSync(join(root, ".generated", "react-native-cache"), { recursive: true });
    copyFileSync(new URL("../scripts/ios-pod-cache.rb", import.meta.url), join(root, "scripts", "ios-pod-cache.rb"));
    writeFileSync(join(root, "node_modules", "react-native", "package.json"), JSON.stringify({ version: "0.86.3" }));
    const ruby = `
class ReactNativePodsUtils
  def self.shared_cache_dir; '/global/cache'; end
  def self.validate_tarball(*); :original_verification; end
end
check = ReactNativePodsUtils.method(:validate_tarball)
require ARGV[0]
def shared_cache_dir; '/global/hermes/cache'; end
raise unless ReactNativePodsUtils.shared_cache_dir == ENV.fetch('GC_IOS_REACT_NATIVE_CACHE')
raise unless shared_cache_dir == ENV.fetch('GC_IOS_REACT_NATIVE_CACHE')
raise unless ReactNativePodsUtils.method(:validate_tarball) == check
puts 'scoped caches; verification unchanged'
`;
    const args = ["-e", ruby, join(root, "scripts", "ios-pod-cache.rb")];
    const env = { ...process.env, GC_MOBILE_GUARDED_ACTION: "pods-ios", RCT_SKIP_CACHES: "0",
      GC_IOS_REACT_NATIVE_CACHE: join(root, ".generated", "react-native-cache") };
    assert.match(execFileSync("ruby", args, { env, encoding: "utf8" }), /verification unchanged/);
    for (const override of [{ RCT_SKIP_CACHES: "1" }, { GC_MOBILE_GUARDED_ACTION: "build-ios" },
      { GC_IOS_REACT_NATIVE_CACHE: root }]) {
      assert.throws(() => execFileSync("ruby", args, { env: { ...env, ...override }, stdio: "pipe" }));
    }
    writeFileSync(join(root, "node_modules", "react-native", "package.json"), JSON.stringify({ version: "0.87.0" }));
    assert.throws(() => execFileSync("ruby", args, { env, stdio: "pipe" }));
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("stale generated variant, device signing and non-iPhone target fail before compilation", () => {
  const plan = iosBuildPlan("/external/mobile", "development");
  const settings = { PRODUCT_BUNDLE_IDENTIFIER: plan.bundleIdentifier, TARGETED_DEVICE_FAMILY: "1",
    PLATFORM_NAME: "iphonesimulator", CODE_SIGNING_ALLOWED: "NO" };
  const input = (values) => [{ target: plan.scheme, buildSettings: { ...settings, ...values } }];
  verifyIosTarget(input({}), plan);
  for (const values of [{ PRODUCT_BUNDLE_IDENTIFIER: "com.godschurches.mobile.staging" },
    { TARGETED_DEVICE_FAMILY: "1,2" }, { PLATFORM_NAME: "iphoneos" }, { CODE_SIGNING_ALLOWED: "YES" }]) {
    assert.throws(() => verifyIosTarget(input(values), plan));
  }
  assert.throws(() => verifyIosTarget([], plan));
  assert.throws(() => verifyIosTarget([...input({}), ...input({})], plan));
});
