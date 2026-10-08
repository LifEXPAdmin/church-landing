import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, copyFileSync, readFileSync, writeFileSync, rmSync, symlinkSync, linkSync, lstatSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import storagePlugin from "../plugins/with-ios-build-storage.js";
import { expoJsiSimulatorScript, iosBuildPlan, iosSimulatorEntitlements, prepareIosSimulatorIdentity, verifyIosTarget } from "../scripts/ios-build.mjs";

function expoJsiSource(installed = readFileSync(new URL("../node_modules/expo-modules-jsi/apple/scripts/build-xcframework.sh", import.meta.url), "utf8")) {
  // The guarded launcher may already have adapted this installed dependency.
  // Recover the pinned upstream fixture without accepting any other edits.
  const original = installed
    .replace(/\n\nif \[\[ "\$\{GC_MOBILE_GUARDED_ACTION:-\}"[^\n]+\n[^\n]+\n {2}exit 1\nfi/, "")
    .replace(' RN_ROOT="$RN_ROOT" TMPDIR="$TMPDIR")', ' RN_ROOT="$RN_ROOT")')
    .replace(/^ {4}(?:-jobs 2|-clonedSourcePackagesDirPath "\$\{DERIVED_DATA_PATH\}\/SourcePackages"|-packageCachePath "\$\{DERIVED_DATA_PATH\}\/PackageCache"|CODE_SIGNING_ALLOWED=NO|CLANG_MODULE_CACHE_PATH="\$\{DERIVED_DATA_PATH\}\/ModuleCache.noindex"|SWIFT_MODULE_CACHE_PATH="\$\{DERIVED_DATA_PATH\}\/ModuleCache.noindex") \\\n/gm, "");
  assert.equal(createHash("sha256").update(original).digest("hex"),
    "8f3ed615b7024f8026847316d22989796c145a998b2dcda1216c8df68efbe55c",
    "Reinspect the installed ExpoModulesJSI test fixture after a dependency change.");
  return { original, installed };
}

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
    assert.equal(plan.simulatorEntitlements, join(plan.generated, "Simulator.entitlements"));
    assert.equal(plan.simulatorEntitlementsDer, plan.simulatorEntitlements + ".der");
    // Xcode resolves these nested macros for each target. Pods must not inherit
    // the app's identity, and paths containing spaces remain one setting value.
    assert.deepEqual(plan.args.filter(value => value.startsWith("GC_SIMULATOR_ENTITLEMENTS_")), [
      `GC_SIMULATOR_ENTITLEMENTS_${plan.scheme}=${plan.simulatorEntitlements}`,
      `GC_SIMULATOR_ENTITLEMENTS_DER_${plan.scheme}=${plan.simulatorEntitlementsDer}`,
    ]);
    assert(plan.args.includes("LD_ENTITLEMENTS_SECTION=$(GC_SIMULATOR_ENTITLEMENTS_$(TARGET_NAME))"));
    assert(plan.args.includes("LD_ENTITLEMENTS_SECTION_DER=$(GC_SIMULATOR_ENTITLEMENTS_DER_$(TARGET_NAME))"));
    assert(!plan.args.some(value => value.startsWith("OTHER_LDFLAGS=") || value.includes("-sectcreate")));
  }
  assert.throws(() => iosBuildPlan(root, "production"));
});

test("Simulator entitlements reject production and unrecognized app identities", () => {
  const plan = iosBuildPlan("/external/mobile", "development");
  for (const bundleIdentifier of ["com.godschurches.mobile", "com.example.other", "com.godschurches.mobile.dev.extra",
    "com.godschurches.mobile.dev</string><key>get-task-allow</key><true/>", "", undefined]) {
    assert.throws(() => iosSimulatorEntitlements({ ...plan, bundleIdentifier }));
  }
});

test("generated Simulator plist grants only the selected app's own Keychain group", { skip: process.platform !== "darwin" }, () => {
  for (const variant of ["development", "staging"]) {
    const plan = iosBuildPlan("/external storage/mobile", variant);
    const xml = iosSimulatorEntitlements(plan);
    // Parse the actual generated document with Apple's plist parser. An exact
    // result also rejects accidental team, shared-group or debugger privileges.
    const parsed = JSON.parse(execFileSync("/usr/bin/plutil", ["-convert", "json", "-o", "-", "-"], {
      input: xml, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"],
    }));
    assert.deepEqual(parsed, { "application-identifier": plan.bundleIdentifier, "keychain-access-groups": [plan.bundleIdentifier] });
  }
});

test("Simulator identity preparation replaces linked outputs without writing through them", { skip: process.platform !== "darwin" }, () => {
  const root = mkdtempSync(join(tmpdir(), "gc-ios-identity-check-"));
  try {
    for (const [kind, createLink] of [["symbolic", symlinkSync], ["hard", linkSync]]) {
      const plan = iosBuildPlan(join(root, kind, "mobile"), "development");
      mkdirSync(plan.generated, { recursive: true });
      const pairs = [plan.simulatorEntitlements, plan.simulatorEntitlementsDer].map((output, index) => {
        const external = join(root, `${kind}-outside-${index}`), contents = `preserve ${kind} external file ${index}`;
        writeFileSync(external, contents);
        createLink(external, output);
        return { output, external, contents, original: lstatSync(output) };
      });
      const before = readdirSync(plan.generated).sort();
      assert.throws(() => prepareIosSimulatorIdentity({ ...plan, bundleIdentifier: "com.godschurches.mobile" }), /known non-production app target/);
      assert.deepEqual(readdirSync(plan.generated).sort(), before, "invalid identity must not leave temporary files");
      for (const { output, original, contents } of pairs) {
        assert.equal(lstatSync(output).ino, original.ino, "invalid identity must leave output links unchanged");
        assert.equal(readFileSync(output, "utf8"), contents);
      }

      prepareIosSimulatorIdentity(plan);
      for (const { output, external, contents } of pairs) {
        assert.equal(readFileSync(external, "utf8"), contents, "external fixture must remain untouched");
        assert(lstatSync(output).isFile(), "each output must now be a regular file");
        assert.notEqual(lstatSync(output).ino, lstatSync(external).ino, "each output must be independent of its old target");
      }
      assert.equal(readFileSync(plan.simulatorEntitlements, "utf8"), iosSimulatorEntitlements(plan));
      const decoded = execFileSync("/usr/bin/derq", ["query", "-i", plan.simulatorEntitlementsDer, "--xml"], { encoding: "utf8" });
      const parsed = JSON.parse(execFileSync("/usr/bin/plutil", ["-convert", "json", "-o", "-", "-"], { input: decoded, encoding: "utf8" }));
      assert.deepEqual(parsed, { "application-identifier": plan.bundleIdentifier, "keychain-access-groups": [plan.bundleIdentifier] });
      assert.deepEqual(readdirSync(plan.generated).sort(), before, "successful preparation must remove its temporary directory");
    }
  } finally { rmSync(root, { recursive: true, force: true }); }
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
    PLATFORM_NAME: "iphonesimulator", CODE_SIGNING_ALLOWED: "NO",
    LD_ENTITLEMENTS_SECTION: plan.simulatorEntitlements, LD_ENTITLEMENTS_SECTION_DER: plan.simulatorEntitlementsDer };
  const input = (values) => [{ target: plan.scheme, buildSettings: { ...settings, ...values } }];
  verifyIosTarget(input({}), plan);
  for (const values of [{ PRODUCT_BUNDLE_IDENTIFIER: "com.godschurches.mobile.staging" },
    { TARGETED_DEVICE_FAMILY: "1,2" }, { PLATFORM_NAME: "iphoneos" }, { CODE_SIGNING_ALLOWED: "YES" }]) {
    assert.throws(() => verifyIosTarget(input(values), plan));
  }
  assert.throws(() => verifyIosTarget([], plan));
  assert.throws(() => verifyIosTarget([...input({}), ...input({})], plan));
  const staging = iosBuildPlan("/external/mobile", "staging");
  for (const [setting, otherVariant] of [["LD_ENTITLEMENTS_SECTION", staging.simulatorEntitlements],
    ["LD_ENTITLEMENTS_SECTION_DER", staging.simulatorEntitlementsDer]]) {
    for (const value of [undefined, "", "/outside/Simulator.entitlements", otherVariant]) {
      assert.throws(() => verifyIosTarget(input({ [setting]: value }), plan), setting + " must match this generated variant");
    }
  }
});

test("Expo JSI adaptation pins the complete upstream source and accepts only an original or complete patch", () => {
  const { original, installed } = expoJsiSource();
  const patched = expoJsiSimulatorScript(original, "57.1.1");
  assert.notEqual(patched, original);
  assert.equal(expoJsiSource(patched).original, original);
  assert.equal(expoJsiSimulatorScript(patched, "57.1.1"), patched);
  assert.equal(expoJsiSimulatorScript(installed, "57.1.1"), patched);
  assert.throws(() => expoJsiSimulatorScript(original, "57.1.2"), /Reinspect/);
  for (const changed of [original + "\n# source drift\n", patched + "\n# source drift\n",
    original.replace("SKIP_INSTALL=NO", "SKIP_INSTALL=YES"),
    patched.replace(' TMPDIR="$TMPDIR"', ""),
    patched.replace("    -jobs 2 \\\n", ""),
    original.replace('RN_ROOT="$RN_ROOT")', 'RN_ROOT="$RN_ROOT" TMPDIR="$TMPDIR")')]) {
    assert.throws(() => expoJsiSimulatorScript(changed, "57.1.1"), /differs|partly adapted/);
  }
  // Upstream hashing includes this helper, so the repaired slice cannot use the
  // old script's cached result. Artifact assembly and staging remain upstream.
  const artifactStart = '  local product_path="${BUILD_PRODUCTS_PATH}/${build_dir_name}"';
  assert.equal(patched.slice(patched.indexOf(artifactStart)), original.slice(original.indexOf(artifactStart)));
  const hashStart = "compute_hash() {", hashEnd = "# Resolves the xcodebuild destination";
  const hashFunction = original.slice(original.indexOf(hashStart), original.indexOf(hashEnd));
  assert(patched.includes(hashFunction));
  assert(patched.includes('  "${PACKAGE_DIR}/scripts/build-xcframework.sh"'));
});

test("Expo JSI shell guard rejects other build contexts before running any upstream command", () => {
  const patched = expoJsiSimulatorScript(expoJsiSource().original, "57.1.1");
  const boundary = patched.indexOf("\nPACKAGE_DIR=");
  assert(boundary > 0);
  // Execute only the actual guard. A distinctive sentinel replaces all package
  // discovery and native work, including when the guard unexpectedly passes.
  const probe = patched.slice(0, boundary) + "\nprintf 'guard passed'\nexit 73\n";
  const allowed = { ...process.env, GC_MOBILE_GUARDED_ACTION: "build-ios", PLATFORM_NAME: "iphonesimulator",
    CODE_SIGNING_ALLOWED: "NO", TMPDIR: tmpdir() };
  const run = (env) => spawnSync("/bin/bash", ["-c", probe], { env, encoding: "utf8", timeout: 5000 });
  const accepted = run(allowed);
  assert.ifError(accepted.error);
  assert.equal(accepted.status, 73);
  assert.equal(accepted.stdout, "guard passed");
  for (const [key, value] of [["GC_MOBILE_GUARDED_ACTION", undefined], ["GC_MOBILE_GUARDED_ACTION", "pods-ios"],
    ["PLATFORM_NAME", "iphoneos"], ["PLATFORM_NAME", "macosx"], ["PLATFORM_NAME", undefined],
    ["CODE_SIGNING_ALLOWED", "YES"], ["CODE_SIGNING_ALLOWED", undefined], ["TMPDIR", undefined], ["TMPDIR", ""]]) {
    const env = { ...allowed };
    if (value === undefined) delete env[key]; else env[key] = value;
    const rejected = run(env);
    assert.ifError(rejected.error);
    assert.equal(rejected.status, 1, key + " must fail closed");
    assert.equal(rejected.stdout, "");
    assert.match(rejected.stderr, /requires the guarded unsigned Simulator launcher/);
  }
});

test("Expo JSI nested invocation preserves scoped tools and caches while clearing outer SDK settings", () => {
  const patched = expoJsiSimulatorScript(expoJsiSource().original, "57.1.1");
  const start = patched.indexOf("platform_destination() {"), end = patched.indexOf("# --- Main ---");
  assert(start > 0 && end > start);
  const root = mkdtempSync(join(tmpdir(), "gc-ios-jsi-check-"));
  try {
    const packageDir = join(root, "package with spaces"), derived = join(packageDir, ".DerivedData");
    const bin = join(root, "bin"), temporary = join(root, "temporary files");
    for (const path of [packageDir, bin, temporary]) mkdirSync(path, { recursive: true });
    const envKeys = ["HOME", "PODS_ROOT", "RN_ROOT", "TMPDIR", "DEVELOPER_DIR", "SDKROOT", "PLATFORM_NAME",
      "CODE_SIGNING_ALLOWED", "GC_MOBILE_GUARDED_ACTION", "CLANG_MODULE_CACHE_PATH", "SWIFT_MODULE_CACHE_PATH"];
    writeFileSync(join(bin, "xcodebuild"), `#!${process.execPath}\n` +
      `process.stdout.write(JSON.stringify({args:process.argv.slice(2),env:Object.fromEntries(${JSON.stringify(envKeys)}.map(key=>[key,process.env[key]??null]))}));\nprocess.exit(73);\n`, { mode: 0o755 });
    const env = { ...process.env, PATH: bin + ":/usr/bin:/bin", PACKAGE_DIR: packageDir, PACKAGE_NAME: "ExpoModulesJSI",
      CONFIGURATION: "Release", DERIVED_DATA_PATH: derived, BUILD_PRODUCTS_PATH: join(derived, "Build", "Products"),
      PODS_ROOT: join(root, "Pods"), RN_ROOT: join(root, "react native"), TMPDIR: temporary,
      DEVELOPER_DIR: join(root, "Selected Xcode", "Contents", "Developer"), SDKROOT: "/wrong/outer/sdk",
      PLATFORM_NAME: "iphonesimulator", CODE_SIGNING_ALLOWED: "NO", GC_MOBILE_GUARDED_ACTION: "build-ios",
      CLANG_MODULE_CACHE_PATH: "/wrong/outer/clang", SWIFT_MODULE_CACHE_PATH: "/wrong/outer/swift" };
    // Extract actual platform/build functions. The fake xcodebuild exits before
    // artifact assembly; only the temporary product directory can be removed.
    const script = "set -euo pipefail\nlog() { :; }\n" + patched.slice(start, end) + "\nbuild_slice iphonesimulator\n";
    const result = spawnSync("/bin/bash", ["-c", script], { env, encoding: "utf8", timeout: 5000 });
    assert.ifError(result.error);
    assert.equal(result.status, 73, result.stderr);
    const actual = JSON.parse(result.stdout);
    const option = (key) => { assert.equal(actual.args.filter(value => value === key).length, 1); return actual.args[actual.args.indexOf(key) + 1]; };
    assert.equal(actual.args[0], "build");
    assert.equal(option("-scheme"), "ExpoModulesJSI");
    assert.equal(option("-sdk"), "iphonesimulator");
    assert.equal(option("-destination"), "generic/platform=iOS Simulator");
    assert.equal(option("-jobs"), "2");
    assert.equal(option("-derivedDataPath"), derived);
    assert.equal(option("-clonedSourcePackagesDirPath"), join(derived, "SourcePackages"));
    assert.equal(option("-packageCachePath"), join(derived, "PackageCache"));
    for (const setting of ["CODE_SIGNING_ALLOWED=NO", "COMPILER_INDEX_STORE_ENABLE=NO",
      "CLANG_MODULE_CACHE_PATH=" + join(derived, "ModuleCache.noindex"),
      "SWIFT_MODULE_CACHE_PATH=" + join(derived, "ModuleCache.noindex"),
      "SYMROOT=" + env.BUILD_PRODUCTS_PATH, "OBJROOT=" + join(derived, "Build", "Intermediates.noindex")]) {
      assert.equal(actual.args.filter(value => value === setting).length, 1, setting);
    }
    for (const key of ["HOME", "PODS_ROOT", "RN_ROOT", "TMPDIR", "DEVELOPER_DIR"]) assert.equal(actual.env[key], env[key] ?? null);
    for (const key of ["SDKROOT", "PLATFORM_NAME", "CODE_SIGNING_ALLOWED", "GC_MOBILE_GUARDED_ACTION",
      "CLANG_MODULE_CACHE_PATH", "SWIFT_MODULE_CACHE_PATH"]) assert.equal(actual.env[key], null, key + " must not leak through env -i");
  } finally { rmSync(root, { recursive: true, force: true }); }
});
