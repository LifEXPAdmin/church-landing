import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, realpathSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const mobile = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const root = resolve(mobile, "..");
// Reuse storage verification, including the private UUID, actual device, free
// space and a reversible write/read. This never installs an SDK or dependency.
execFileSync(process.execPath, [join(mobile, "scripts/workspace.mjs"), "inspect"], { stdio: "inherit" });
const common = execFileSync("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], { cwd: root, encoding: "utf8" }).trim();
const registry = JSON.parse(readFileSync(join(common, "gc-coordination/registry.json"), "utf8"));
const worker = process.env.GC_MOBILE_WORKER;
const claim = worker && registry.claims[worker];
const bound = worker && registry.workers[worker];
const worktree = typeof bound === "string" ? bound : bound?.worktree;
assert(claim?.resources.includes("contract:machine-build") && worktree && realpathSync(worktree) === realpathSync(root), "Reserve the shared machine-build slot in this worktree first.");
const output = mkdtempSync(join(mobile, ".generated/native-json-check-"));
const executable = join(output, "native-json-checks");
console.log("Retained native check output: " + output);
const swift = join(mobile, "modules/gc-native-json/ios");
const moduleCache = join(mobile, ".generated/cache/native-json-swift");
const env = { ...process.env, TMPDIR: join(mobile, ".generated/tmp"), CLANG_MODULE_CACHE_PATH: moduleCache };
const compilation = spawnSync("xcrun", ["swiftc", "-swift-version", "6", "-warnings-as-errors", "-module-cache-path", moduleCache,
  join(swift, "GCJSONPolicy.swift"), join(swift, "GCJSONTransport.swift"), join(mobile, "tests/native-json.swift"), "-o", executable], { stdio: "inherit", env });
if (compilation.error) throw compilation.error;
assert.equal(compilation.status, 0, "macOS Foundation transport must compile.");
const result = spawnSync(executable, [], { stdio: "inherit", env, timeout: 30000 });
if (result.error) throw result.error;
assert.equal(result.status, 0, "macOS Foundation transport checks must pass.");
console.log("Retained native check output: " + output);
