import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, realpathSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import config from "../app.config.js";
import { mobileBuildEnv } from "./build-identity.mjs";
import { prepareWorkspaceDirectories, verifyWorkspaceDirectory, verifyWorkspaceStorage } from "./workspace-storage.mjs";

const script = fileURLToPath(import.meta.url);
const mobile = resolve(dirname(script), "..");
const website = resolve(mobile, "..");
const inside = (root, path) => {
  const child = relative(root, path);
  return child !== "" && child !== ".." && !child.startsWith("../") && !isAbsolute(child);
};

export function androidBuildPlan(root, variant) {
  assert(["development", "staging"].includes(variant), "Select a non-production app variant.");
  const generated = join(root, ".generated", "android");
  return {
    packageName: "com.godschurches.mobile" + (variant === "development" ? ".dev" : ".staging"),
    generated, variantRoot: join(generated, variant),
    args: [":app:assembleRelease", "--no-daemon", "--no-parallel", "--max-workers=1", "--console=plain",
      "-PreactNativeArchitectures=arm64-v8a", "-Pandroid.cmakeVersion=3.30.5",
      "-Pkotlin.compiler.execution.strategy=in-process", "-Dorg.gradle.vfs.watch=false",
      "-Dorg.gradle.jvmargs=-Xmx2048m -XX:MaxMetaspaceSize=768m -XX:ActiveProcessorCount=2"],
    apk: join(root, "android", "app", "build", "outputs", "apk", "release", "app-release.apk")
  };
}

export function verifyAndroidOwnership(registry, checkout, worker) {
  const claim = worker && registry.claims?.[worker];
  const bound = worker && registry.workers?.[worker];
  const path = typeof bound === "string" ? bound : bound?.worktree;
  assert(claim?.resources.includes("contract:machine-build") && path && realpathSync(path) === realpathSync(checkout),
    "Reserve contract:machine-build in this worktree and set GC_MOBILE_WORKER before building.");
}

export function verifyAndroidToolchain(storage, { sdk, java }) {
  for (const path of [sdk, java]) {
    assert(typeof path === "string" && isAbsolute(path), "Set inspected ANDROID_HOME and JAVA_HOME paths.");
    const actual = realpathSync(path);
    assert(inside(storage.storage, actual) && statSync(actual).dev === storage.device && statSync(actual).isDirectory(),
      "Android tools must remain on the verified task storage volume.");
  }
  for (const path of [join(java, "bin", "java"), join(sdk, "platforms", "android-36", "android.jar"),
    join(sdk, "build-tools", "36.0.0", "aapt2"), join(sdk, "ndk", "27.1.12297006", "source.properties"),
    join(sdk, "cmake", "3.30.5", "bin", "cmake")]) assert(existsSync(path), "Install the inspected Android native toolchain first.");
}

// An init script changes only the local build invocation, leaving the generated
// Expo template and the shared iOS launcher untouched. Metro gets one worker.
export const boundedGradleInit = `
gradle.beforeProject { project ->
  ['com.android.application', 'com.android.library'].each { plugin ->
    project.pluginManager.withPlugin(plugin) {
      project.extensions.getByName('android').defaultConfig.externalNativeBuild.cmake.arguments.addAll([
        '-DCMAKE_JOB_POOLS=gc_native=1',
        '-DCMAKE_JOB_POOL_COMPILE=gc_native',
        '-DCMAKE_JOB_POOL_LINK=gc_native'
      ])
    }
  }
  project.pluginManager.withPlugin('com.facebook.react') {
    project.extensions.getByName('react').extraPackagerArgs.set(['--max-workers', '1'])
  }
}
gradle.projectsEvaluated {
  def app = gradle.rootProject.findProject(':app')
  if (app == null) throw new GradleException('Expected one Android app target.')
  def android = app.extensions.getByName('android')
  if (android.defaultConfig.applicationId != System.getenv('GC_ANDROID_EXPECTED_PACKAGE'))
    throw new GradleException('Prebuild the selected non-production variant first.')
  def signing = android.buildTypes.getByName('release').signingConfig
  if (signing == null || signing.name != 'debug' || signing.keyAlias != 'androiddebugkey' ||
      signing.storeFile.canonicalPath != app.file('debug.keystore').canonicalPath)
    throw new GradleException('This local build requires the generated debug signing key.')
  if (android.ndkVersion != '27.1.12297006' || android.compileSdk != 36 || android.defaultConfig.minSdk != 24)
    throw new GradleException('Review the changed Android SDK matrix before building.')
}
`;

function run() {
  assert.equal(process.argv.length, 2, "This launcher accepts no arbitrary Gradle tasks or flags.");
  const storage = verifyWorkspaceStorage({ website, mobile });
  const common = execFileSync("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], { cwd: website, encoding: "utf8" }).trim();
  verifyAndroidOwnership(JSON.parse(readFileSync(join(common, "gc-coordination", "registry.json"), "utf8")), website, process.env.GC_MOBILE_WORKER);
  const selected = config();
  assert.equal(selected.extra.fixtureOnly, true, "This build route is for the fictional native journey.");
  const plan = androidBuildPlan(mobile, selected.extra.variant);
  const sdk = process.env.ANDROID_HOME, java = process.env.JAVA_HOME;
  verifyAndroidToolchain(storage, { sdk, java });
  assert(existsSync(join(mobile, "android", "gradlew")), "Run the guarded prebuild-android action first.");
  const { generated } = prepareWorkspaceDirectories(storage);
  for (const path of [plan.generated, plan.variantRoot, join(plan.generated, "gradle"), join(plan.generated, "user")]) {
    verifyWorkspaceDirectory(storage, path);
    mkdirSync(path, { recursive: true });
    verifyWorkspaceDirectory(storage, path);
  }
  const lockPath = join(generated, "heavy-job.lock");
  const lock = openSync(lockPath, "wx");
  try {
    writeFileSync(lock, JSON.stringify({ pid: process.pid, action: "build-android", started: new Date().toISOString() }));
    const init = join(plan.variantRoot, "bounded-build.gradle");
    writeFileSync(init, boundedGradleInit);
    const env = { ...process.env, ...mobileBuildEnv(), GC_ANDROID_EXPECTED_PACKAGE: plan.packageName,
      ANDROID_HOME: sdk, ANDROID_SDK_ROOT: sdk, JAVA_HOME: java,
      GRADLE_USER_HOME: join(plan.generated, "gradle"), ANDROID_USER_HOME: join(plan.generated, "user"),
      npm_config_cache: join(generated, "npm-cache"), TMPDIR: join(generated, "tmp"),
      JAVA_TOOL_OPTIONS: '-Djava.io.tmpdir="' + join(generated, "tmp") + '"',
      NODE_OPTIONS: "--max-old-space-size=1536", CMAKE_BUILD_PARALLEL_LEVEL: "1",
      __UNSAFE_EXPO_HOME_DIRECTORY: join(generated, "expo-home"), XDG_CACHE_HOME: join(generated, "cache"),
      EXPO_NO_TELEMETRY: "1", CI: "1" };
    console.log(JSON.stringify({ action: "build-android", variant: selected.extra.variant,
      packageName: plan.packageName, architecture: "arm64-v8a", signing: "local debug key", storageKind: storage.kind }));
    const result = spawnSync(join(mobile, "android", "gradlew"), [...plan.args, "--init-script", init],
      { cwd: join(mobile, "android"), env, stdio: "inherit" });
    if (result.error) throw result.error;
    process.exitCode = result.status ?? 1;
    if (result.status === 0) {
      assert(existsSync(plan.apk), "Gradle returned success without the expected APK.");
      console.log(JSON.stringify({ apk: plan.apk, bytes: statSync(plan.apk).size }));
    }
  } finally { closeSync(lock); unlinkSync(lockPath); }
}

if (process.argv[1] && resolve(process.argv[1]) === script) run();
