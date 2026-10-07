import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, realpathSync, statSync, statfsSync, writeFileSync, unlinkSync, openSync, closeSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const mobile = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const website = resolve(mobile, "..");
const uuid = process.env.GC_MOBILE_VOLUME_UUID;
if (!uuid || !/^[A-F0-9-]{36}$/i.test(uuid)) throw new Error("Set GC_MOBILE_VOLUME_UUID from the private storage policy.");
const commands = {
  install: ["npm", ["ci", "--no-audit", "--no-fund"]],
  bootstrap: ["npm", ["install", "--no-audit", "--no-fund"]],
  compatibility: ["npx", ["--no-install", "expo", "install", "--check"]],
  config: ["npx", ["--no-install", "expo", "config", "--type", "public"]],
  "prebuild-ios": ["npx", ["--no-install", "expo", "prebuild", "--platform", "ios", "--no-install", "--no-clean"]],
  typecheck: ["npm", ["run", "typecheck"]],
  test: ["npm", ["test"]],
  fixture: ["node", ["--experimental-strip-types", "scripts/fixture-server.ts"]],
  dev: ["npx", ["--no-install", "expo", "start", "--dev-client", "--localhost", "--port", "8084"]],
  export: ["npx", ["--no-install", "expo", "export", "--platform", "all", "--max-workers", "1", "--output-dir", ".generated/export"]]
};
const action = process.argv[2] || "inspect";
if (action !== "inspect" && !Object.hasOwn(commands, action)) throw new Error("Unknown mobile workspace action.");
if (process.platform !== "darwin") throw new Error("This Mac launcher requires the prepared SSD. Configure another host explicitly.");
const plist = execFileSync("diskutil", ["info", "-plist", uuid], { encoding: "utf8" });
const disk = JSON.parse(execFileSync("plutil", ["-convert", "json", "-o", "-", "-"], { input: plist, encoding: "utf8" }));
if (typeof disk.VolumeUUID !== "string" || disk.VolumeUUID.toUpperCase() !== uuid.toUpperCase() || disk.WritableVolume !== true || disk.Internal !== false || disk.Locked || !disk.MountPoint)
  throw new Error("The prepared writable SSD is unavailable.");
const mount = realpathSync(disk.MountPoint);
const storage = realpathSync(join(mount, "Codex Storage"));
const actual = realpathSync(mobile);
const storageRelative = relative(mount, storage);
if (!storageRelative || storageRelative.startsWith("..") || storageRelative.startsWith("/") || statSync(storage).dev !== statSync(mount).dev || statSync(actual).dev !== statSync(mount).dev)
  throw new Error("Storage and source must be on the verified SSD volume.");
const nested = relative(storage, actual);
if (!nested || nested.startsWith("..") || nested.startsWith("/")) throw new Error("Mobile workspace must be inside the verified SSD storage root.");
const free = statfsSync(mount);
if (free.bavail * free.bsize < 4 * 1024 ** 3) throw new Error("Less than 4 GiB remains on the SSD.");
if (["install", "bootstrap", "dev", "export", "fixture", "prebuild-ios"].includes(action)) {
  const common = execFileSync("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], { cwd: website, encoding: "utf8" }).trim();
  const registry = JSON.parse(readFileSync(join(common, "gc-coordination", "registry.json"), "utf8"));
  const worker = process.env.GC_MOBILE_WORKER;
  const claim = worker && registry.claims[worker];
  const bound = worker && registry.workers[worker];
  const path = typeof bound === "string" ? bound : bound?.worktree;
  if (!claim?.resources.includes("contract:machine-build") || !path || realpathSync(path) !== realpathSync(website))
    throw new Error("Reserve contract:machine-build in this worktree and set GC_MOBILE_WORKER before a heavy job.");
}
const generated = join(mobile, ".generated");
mkdirSync(generated, { recursive: true });
if (!realpathSync(generated).startsWith(actual + "/") || statSync(generated).dev !== statSync(mount).dev) throw new Error("Generated output must stay on this SSD workspace.");
const proof = join(generated, "write-proof-" + process.pid);
let proofCreated = false;
try {
  writeFileSync(proof, "mobile-storage-proof", { flag: "wx" });
  proofCreated = true;
  if (readFileSync(proof, "utf8") !== "mobile-storage-proof") throw new Error("SSD write/read verification failed.");
} finally { if (proofCreated) unlinkSync(proof); }
for (const child of ["npm-cache", "tmp", "expo-home", "cache"]) {
  const path = join(generated, child);
  mkdirSync(path, { recursive: true });
  if (!realpathSync(path).startsWith(actual + "/") || statSync(path).dev !== statSync(mount).dev) throw new Error("Cache path leaves the verified SSD workspace.");
}
console.log(JSON.stringify({ action, volumeUUID: disk.VolumeUUID, mount, freeGiB: Math.floor(free.bavail * free.bsize / 1024 ** 3), mobile }));
if (action !== "inspect") {
  const [command, args] = commands[action];
  const lockPath = join(generated, "heavy-job.lock");
  let lock;
  if (["install", "bootstrap", "dev", "export", "prebuild-ios"].includes(action)) {
    lock = openSync(lockPath, "wx");
    writeFileSync(lock, JSON.stringify({ pid: process.pid, action, started: new Date().toISOString() }));
  }
  try {
    const result = spawnSync(command, args, { cwd: mobile, stdio: "inherit", env: {
    ...process.env, npm_config_cache: join(generated, "npm-cache"), TMPDIR: join(generated, "tmp"),
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
