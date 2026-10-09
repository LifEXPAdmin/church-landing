import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import config from "../app.config.js";

const script = fileURLToPath(import.meta.url);
const mobile = resolve(dirname(script), "..");

// Expo's nested env -i build discards the parent Simulator signing and cache
// settings. Pin the inspected helper, including its artifact/hash logic, before
// adapting this installed dependency for our guarded unsigned build only.
export function expoJsiSimulatorScript(source, version) {
  assert.equal(version, "57.1.1", "Reinspect the ExpoModulesJSI build helper after upgrading Expo.");
  const edits = [
    ["set -euo pipefail", ["set -euo pipefail", "",
      'if [[ "${GC_MOBILE_GUARDED_ACTION:-}" != "build-ios" || "${PLATFORM_NAME:-}" != "iphonesimulator" || "${CODE_SIGNING_ALLOWED:-}" != "NO" || -z "${TMPDIR:-}" ]]; then',
      '  echo "ExpoModulesJSI requires the guarded unsigned Simulator launcher; reinstall dependencies for other builds." >&2',
      "  exit 1", "fi"].join("\n")],
    ['local env_args=(PATH="$PATH" HOME="$HOME" PODS_ROOT="$PODS_ROOT" RN_ROOT="$RN_ROOT")',
      'local env_args=(PATH="$PATH" HOME="$HOME" PODS_ROOT="$PODS_ROOT" RN_ROOT="$RN_ROOT" TMPDIR="$TMPDIR")'],
    ["    -parallelizeTargets \\", ["    -parallelizeTargets \\", "    -jobs 2 \\",
      '    -clonedSourcePackagesDirPath "${DERIVED_DATA_PATH}/SourcePackages" \\',
      '    -packageCachePath "${DERIVED_DATA_PATH}/PackageCache" \\',
      "    CODE_SIGNING_ALLOWED=NO \\",
      '    CLANG_MODULE_CACHE_PATH="${DERIVED_DATA_PATH}/ModuleCache.noindex" \\',
      '    SWIFT_MODULE_CACHE_PATH="${DERIVED_DATA_PATH}/ModuleCache.noindex" \\'].join("\n")]
  ];
  const original = edits.reduce((text, [before, after]) => text.replace(after, before), source);
  assert.equal(createHash("sha256").update(original).digest("hex"),
    "8f3ed615b7024f8026847316d22989796c145a998b2dcda1216c8df68efbe55c",
    "ExpoModulesJSI helper differs from the inspected source. Reinspect before building.");
  const patched = edits.reduce((text, [before, after]) => text.replace(before, after), original);
  assert(source === original || source === patched, "ExpoModulesJSI helper is only partly adapted. Reinstall dependencies.");
  return patched;
}

function prepareExpoJsiSimulatorBuild(root) {
  const packageRoot = join(root, "node_modules", "expo-modules-jsi");
  const helper = join(packageRoot, "apple", "scripts", "build-xcframework.sh");
  assert(realpathSync(helper).startsWith(realpathSync(root) + "/") && statSync(helper).dev === statSync(root).dev,
    "The installed ExpoModulesJSI helper must stay inside this verified workspace.");
  const original = readFileSync(helper, "utf8");
  const patched = expoJsiSimulatorScript(original, JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8")).version);
  if (patched !== original) writeFileSync(helper, patched);
}

export function iosBuildPlan(root, variant) {
  assert(["development", "staging"].includes(variant), "Select a non-production app variant.");
  const scheme = variant === "development" ? "GodsChurchesDev" : "GodsChurchesStaging";
  const generated = join(root, ".generated", "ios", variant);
  const simulatorEntitlements = join(generated, "Simulator.entitlements");
  const simulatorEntitlementsDer = simulatorEntitlements + ".der";
  return {
    scheme,
    bundleIdentifier: "com.godschurches.mobile" + (variant === "development" ? ".dev" : ".staging"),
    generated,
    simulatorEntitlements,
    simulatorEntitlementsDer,
    args: ["-workspace", join(root, "ios", scheme + ".xcworkspace"), "-scheme", scheme,
      "-configuration", "Release", "-sdk", "iphonesimulator", "-destination", "generic/platform=iOS Simulator",
      "-derivedDataPath", join(generated, "DerivedData"), "-clonedSourcePackagesDirPath", join(generated, "Packages"),
      "-packageCachePath", join(generated, "PackageCache"),
      "-jobs", "2", "CODE_SIGNING_ALLOWED=NO", "COMPILER_INDEX_STORE_ENABLE=NO",
      // Xcode's Simulator linker sections carry the simulated app identity.
      // Target-name indirection leaves dependency targets without this identity.
      "LD_ENTITLEMENTS_SECTION=$(GC_SIMULATOR_ENTITLEMENTS_$(TARGET_NAME))",
      "LD_ENTITLEMENTS_SECTION_DER=$(GC_SIMULATOR_ENTITLEMENTS_DER_$(TARGET_NAME))",
      "GC_SIMULATOR_ENTITLEMENTS_" + scheme + "=" + simulatorEntitlements,
      "GC_SIMULATOR_ENTITLEMENTS_DER_" + scheme + "=" + simulatorEntitlementsDer,
      "CLANG_MODULE_CACHE_PATH=" + join(generated, "ModuleCache"),
      "SWIFT_MODULE_CACHE_PATH=" + join(generated, "ModuleCache")]
  };
}

export function iosSimulatorEntitlements(plan) {
  const identities = { GodsChurchesDev: "com.godschurches.mobile.dev", GodsChurchesStaging: "com.godschurches.mobile.staging" };
  assert(Object.hasOwn(identities, plan.scheme) && identities[plan.scheme] === plan.bundleIdentifier,
    "Simulator identity must match a known non-production app target.");
  return '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n' +
    '<plist version="1.0"><dict><key>application-identifier</key><string>' + plan.bundleIdentifier +
    '</string><key>keychain-access-groups</key><array><string>' + plan.bundleIdentifier +
    '</string></array></dict></plist>\n';
}

export function prepareIosSimulatorIdentity(plan) {
  const entitlements = iosSimulatorEntitlements(plan);
  // The caller has verified this generated directory. Fresh exclusive temporary
  // files and atomic replacement never follow old output symlinks or hard links.
  const temporary = mkdtempSync(join(plan.generated, "simulator-identity-"));
  const xml = join(temporary, "identity.plist"), der = join(temporary, "identity.der");
  try {
    writeFileSync(xml, entitlements, { flag: "wx" });
    execFileSync("/usr/bin/derq", ["query", "-f", "xml", "-i", xml, "-o", der, "--raw"]);
    renameSync(xml, plan.simulatorEntitlements);
    renameSync(der, plan.simulatorEntitlementsDer);
  } finally { rmSync(temporary, { recursive: true, force: true }); }
}

export function verifyIosTarget(settings, plan) {
  const app = settings.filter((entry) => entry.target === plan.scheme);
  assert.equal(app.length, 1, "Expected exactly one matching app target.");
  const selected = app[0].buildSettings;
  assert.equal(selected.PRODUCT_BUNDLE_IDENTIFIER, plan.bundleIdentifier, "Prebuild the selected variant before building.");
  assert.equal(selected.TARGETED_DEVICE_FAMILY, "1", "The initial target is iPhone only.");
  assert.equal(selected.PLATFORM_NAME, "iphonesimulator", "This launcher builds unsigned Simulator apps only.");
  assert.equal(selected.CODE_SIGNING_ALLOWED, "NO", "Simulator build must not request signing.");
  assert.equal(selected.LD_ENTITLEMENTS_SECTION, plan.simulatorEntitlements, "Simulator identity must be linked into the selected app only.");
  assert.equal(selected.LD_ENTITLEMENTS_SECTION_DER, plan.simulatorEntitlementsDer, "Simulator DER identity must match its XML source.");
}

function run() {
  const action = process.argv[2];
  assert(["pods", "build"].includes(action), "Select pods or build.");
  assert.equal(process.env.GC_MOBILE_GUARDED_ACTION, action === "pods" ? "pods-ios" : "build-ios",
    "Run this action through scripts/workspace.mjs so storage and heavy-job ownership are verified.");
  const developer = process.env.DEVELOPER_DIR;
  assert(developer && existsSync(join(developer, "usr/bin/xcodebuild")), "Set DEVELOPER_DIR to the inspected full Xcode Contents/Developer directory.");
  const plan = iosBuildPlan(mobile, config().extra.variant);
  const generated = realpathSync(join(mobile, ".generated"));
  for (const path of [join(mobile, "ios"), join(generated, "ios"), plan.generated,
    join(plan.generated, "DerivedData"), join(plan.generated, "Packages"), join(plan.generated, "PackageCache"), join(plan.generated, "ModuleCache"),
    join(generated, "cocoapods"), join(generated, "cocoapods-cache"), join(generated, "react-native-cache")]) {
    mkdirSync(path, { recursive: true });
    assert(realpathSync(path).startsWith(realpathSync(mobile) + "/") && statSync(path).dev === statSync(mobile).dev,
      "iOS generated output must stay inside this verified workspace.");
  }
  const env = { ...process.env, CP_HOME_DIR: join(generated, "cocoapods"), CP_CACHE_DIR: join(generated, "cocoapods-cache"),
    GC_IOS_REACT_NATIVE_CACHE: join(generated, "react-native-cache"), RCT_SKIP_CACHES: "0",
    EXPO_USE_PRECOMPILED_MODULES: "0", EXTRA_PACKAGER_ARGS: "--max-workers 1",
    COCOAPODS_DISABLE_STATS: "true", COCOAPODS_SKIP_UPDATE_MESSAGE: "true", RCT_NO_LAUNCH_PACKAGER: "1" };
  const read = (command, args) => execFileSync(command, args, { cwd: mobile, env, encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
  read("xcodebuild", ["-checkFirstLaunchStatus"]);
  read("xcrun", ["--sdk", "iphonesimulator", "--show-sdk-path"]);
  assert(existsSync(join(mobile, "ios", plan.scheme + ".xcodeproj")), "Run prebuild-ios for the selected variant first.");
  if (action === "pods") {
    assert(existsSync(join(mobile, "ios", "Podfile")), "Generated Podfile is missing.");
    assert(readFileSync(join(mobile, "ios", "Podfile"), "utf8").includes("require_relative '../scripts/ios-pod-cache'"),
      "Regenerate the native project to install its scoped cache hook.");
    // Do not install tools or change the user's Ruby automatically here.
    read("pod", ["--version"]);
  } else {
    assert(existsSync(join(mobile, "ios", "Podfile.lock")), "Run pods-ios before the native build.");
    assert.equal(readFileSync(join(mobile, "ios", "Podfile.lock"), "utf8"),
      readFileSync(join(mobile, "ios", "Pods", "Manifest.lock"), "utf8"), "Installed Pods differ from the generated lock.");
    verifyIosTarget(JSON.parse(read("xcodebuild", [...plan.args, "-showBuildSettings", "-json"])), plan);
    prepareIosSimulatorIdentity(plan);
    prepareExpoJsiSimulatorBuild(mobile);
  }
  const result = spawnSync(action === "pods" ? "pod" : "xcodebuild",
    action === "pods" ? ["install", "--project-directory=" + join(mobile, "ios")] : [...plan.args, "build"],
    { cwd: mobile, env, stdio: "inherit" });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
}

if (process.argv[1] && resolve(process.argv[1]) === script) run();
