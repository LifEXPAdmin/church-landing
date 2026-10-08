import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import config from "../app.config.js";

const script = fileURLToPath(import.meta.url);
const mobile = resolve(dirname(script), "..");

export function iosBuildPlan(root, variant) {
  assert(["development", "staging"].includes(variant), "Select a non-production app variant.");
  const scheme = variant === "development" ? "GodsChurchesDev" : "GodsChurchesStaging";
  const generated = join(root, ".generated", "ios", variant);
  return {
    scheme,
    bundleIdentifier: "com.godschurches.mobile" + (variant === "development" ? ".dev" : ".staging"),
    generated,
    args: ["-workspace", join(root, "ios", scheme + ".xcworkspace"), "-scheme", scheme,
      "-configuration", "Release", "-sdk", "iphonesimulator", "-destination", "generic/platform=iOS Simulator",
      "-derivedDataPath", join(generated, "DerivedData"), "-clonedSourcePackagesDirPath", join(generated, "Packages"),
      "-packageCachePath", join(generated, "PackageCache"),
      "-jobs", "2", "CODE_SIGNING_ALLOWED=NO", "COMPILER_INDEX_STORE_ENABLE=NO",
      "CLANG_MODULE_CACHE_PATH=" + join(generated, "ModuleCache"),
      "SWIFT_MODULE_CACHE_PATH=" + join(generated, "ModuleCache")]
  };
}

export function verifyIosTarget(settings, plan) {
  const app = settings.filter((entry) => entry.target === plan.scheme);
  assert.equal(app.length, 1, "Expected exactly one matching app target.");
  const selected = app[0].buildSettings;
  assert.equal(selected.PRODUCT_BUNDLE_IDENTIFIER, plan.bundleIdentifier, "Prebuild the selected variant before building.");
  assert.equal(selected.TARGETED_DEVICE_FAMILY, "1", "The initial target is iPhone only.");
  assert.equal(selected.PLATFORM_NAME, "iphonesimulator", "This launcher builds unsigned Simulator apps only.");
  assert.equal(selected.CODE_SIGNING_ALLOWED, "NO", "Simulator build must not request signing.");
}

function run() {
  const action = process.argv[2];
  assert(["pods", "build"].includes(action), "Select pods or build.");
  assert.equal(process.env.GC_MOBILE_GUARDED_ACTION, action === "pods" ? "pods-ios" : "build-ios",
    "Run this action through scripts/workspace.mjs so SSD and heavy-job ownership are verified.");
  const developer = process.env.DEVELOPER_DIR;
  assert(developer && existsSync(join(developer, "usr/bin/xcodebuild")), "Set DEVELOPER_DIR to the inspected full Xcode Contents/Developer directory.");
  const plan = iosBuildPlan(mobile, config().extra.variant);
  const generated = realpathSync(join(mobile, ".generated"));
  for (const path of [join(mobile, "ios"), join(generated, "ios"), plan.generated,
    join(plan.generated, "DerivedData"), join(plan.generated, "Packages"), join(plan.generated, "PackageCache"), join(plan.generated, "ModuleCache"),
    join(generated, "cocoapods"), join(generated, "cocoapods-cache"), join(generated, "react-native-cache")]) {
    mkdirSync(path, { recursive: true });
    assert(realpathSync(path).startsWith(realpathSync(mobile) + "/") && statSync(path).dev === statSync(mobile).dev,
      "iOS generated output must stay inside this SSD workspace.");
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
  }
  const result = spawnSync(action === "pods" ? "pod" : "xcodebuild",
    action === "pods" ? ["install", "--project-directory=" + join(mobile, "ios")] : [...plan.args, "build"],
    { cwd: mobile, env, stdio: "inherit" });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
}

if (process.argv[1] && resolve(process.argv[1]) === script) run();
