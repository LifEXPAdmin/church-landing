import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync, realpathSync, writeFileSync, unlinkSync, openSync, closeSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { mobileBuildEnv } from "./build-identity.mjs";
import { verifyWorkspaceStorage, prepareWorkspaceDirectories } from "./workspace-storage.mjs";

const mobile = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const website = resolve(mobile, "..");
const commands = {
  install: ["npm", ["ci", "--no-audit", "--no-fund"]],
  bootstrap: ["npm", ["install", "--no-audit", "--no-fund"]],
  compatibility: ["npx", ["--no-install", "expo", "install", "--check"]],
  config: ["npx", ["--no-install", "expo", "config", "--type", "public"]],
  "prebuild-ios": ["npx", ["--no-install", "expo", "prebuild", "--platform", "ios", "--no-install", "--no-clean"]],
  "prebuild-android": ["npx", ["--no-install", "expo", "prebuild", "--platform", "android", "--no-install", "--no-clean"]],
  "pods-ios": ["node", ["scripts/ios-build.mjs", "pods"]],
  "build-ios": ["node", ["scripts/ios-build.mjs", "build"]],
  typecheck: ["npm", ["run", "typecheck"]],
  test: ["npm", ["test"]],
  fixture: ["node", ["--experimental-strip-types", "scripts/fixture-server.ts"]],
  dev: ["npx", ["--no-install", "expo", "start", "--dev-client", "--localhost", "--port", "8084"]],
  export: ["npx", ["--no-install", "expo", "export", "--platform", "all", "--max-workers", "1", "--output-dir", ".generated/export"]]
};
const action = process.argv[2] || "inspect";
if (action !== "inspect" && !Object.hasOwn(commands, action)) throw new Error("Unknown mobile workspace action.");
const storage = verifyWorkspaceStorage({ website, mobile });
if (["install", "bootstrap", "dev", "export", "fixture", "prebuild-ios", "prebuild-android", "pods-ios", "build-ios"].includes(action)) {
  const common = execFileSync("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], { cwd: website, encoding: "utf8" }).trim();
  const registry = JSON.parse(readFileSync(join(common, "gc-coordination", "registry.json"), "utf8"));
  const worker = process.env.GC_MOBILE_WORKER;
  const claim = worker && registry.claims[worker];
  const bound = worker && registry.workers[worker];
  const path = typeof bound === "string" ? bound : bound?.worktree;
  if (!claim?.resources.includes("contract:machine-build") || !path || realpathSync(path) !== realpathSync(website))
    throw new Error("Reserve contract:machine-build in this worktree and set GC_MOBILE_WORKER before a heavy job.");
}
const { generated, freeGiB } = prepareWorkspaceDirectories(storage);
console.log(JSON.stringify({ action, storageKind: storage.kind, volumeUUID: storage.volumeUUID, mount: storage.mount, freeGiB, minimumFreeGiB: storage.minimumFreeGiB, mobile }));
if (action !== "inspect") {
  const [command, args] = commands[action];
  const lockPath = join(generated, "heavy-job.lock");
  let lock;
  if (["install", "bootstrap", "dev", "export", "prebuild-ios", "prebuild-android", "pods-ios", "build-ios"].includes(action)) {
    lock = openSync(lockPath, "wx");
    writeFileSync(lock, JSON.stringify({ pid: process.pid, action, started: new Date().toISOString() }));
  }
  try {
    const buildEnv = ["dev", "export", "build-ios"].includes(action) ? mobileBuildEnv() : {};
    // A live Metro session may serve later edits. Its startup commit is a base,
    // never a claim that the current running source remains clean or unchanged.
    if (action === "dev") buildEnv.EXPO_PUBLIC_SOURCE_STATE = "mutable";
    const result = spawnSync(command, args, { cwd: mobile, stdio: "inherit", env: {
    ...process.env, ...buildEnv, GC_MOBILE_GUARDED_ACTION: action,
    npm_config_cache: join(generated, "npm-cache"), TMPDIR: join(generated, "tmp"),
    // SDK 57 reads this shell-only setting before dotenv; EXPO_HOME is ignored.
    // Use a new task-local settings directory, preserving existing Expo accounts.
    __UNSAFE_EXPO_HOME_DIRECTORY: join(generated, "expo-home"), XDG_CACHE_HOME: join(generated, "cache"),
    EXPO_NO_TELEMETRY: "1", CI: action === "dev" ? undefined : "1"
  } });
    if (result.error) throw result.error;
    process.exitCode = result.status ?? 1;
  } finally {
    if (lock !== undefined) { closeSync(lock); unlinkSync(lockPath); }
  }
}
