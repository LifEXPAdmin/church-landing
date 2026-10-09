import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { closeSync, mkdirSync, mkdtempSync, openSync, readFileSync, realpathSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { prepareWorkspaceDirectories, verifyWorkspaceStorage } from "./workspace-storage.mjs";

const mobile = resolve(dirname(fileURLToPath(import.meta.url)), ".."), website = resolve(mobile, "..");
const storage = verifyWorkspaceStorage({ website, mobile });
const common = execFileSync("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], { cwd: website, encoding: "utf8" }).trim();
const registry = JSON.parse(readFileSync(join(common, "gc-coordination/registry.json"), "utf8"));
const worker = process.env.GC_MOBILE_WORKER, claim = worker && registry.claims[worker];
const bound = worker && registry.workers[worker], worktree = typeof bound === "string" ? bound : bound?.worktree;
assert(claim?.resources.includes("contract:machine-build") && worktree && realpathSync(worktree) === realpathSync(website),
  "Reserve the shared machine-build slot in this worktree first.");
const { generated } = prepareWorkspaceDirectories(storage);
const lockPath = join(generated, "heavy-job.lock"), lock = openSync(lockPath, "wx");
try {
  writeFileSync(lock, JSON.stringify({ pid: process.pid, action: "check-native-privacy", started: new Date().toISOString() }));
  // Fresh output directories retain the executable and isolate compiler caches.
  const output = mkdtempSync(join(generated, "native-privacy-check-"));
  const executable = join(output, "native-privacy-checks"), moduleCache = join(output, "ModuleCache"), temporary = join(output, "tmp");
  mkdirSync(moduleCache); mkdirSync(temporary);
  console.log("Retained native privacy checks: " + output);
  const env = { ...process.env, TMPDIR: temporary, CLANG_MODULE_CACHE_PATH: moduleCache, SWIFT_MODULE_CACHE_PATH: moduleCache };
  const compilation = spawnSync("xcrun", ["swiftc", "-swift-version", "6", "-warnings-as-errors", "-module-cache-path", moduleCache,
    join(mobile, "modules/gc-native-privacy/ios/GCPrivacyPolicy.swift"), join(mobile, "tests/native-privacy.swift"), "-o", executable],
  { stdio: "inherit", env, timeout: 120000 });
  if (compilation.error) throw compilation.error;
  assert.equal(compilation.status, 0, "Foundation privacy policy must compile.");
  const result = spawnSync(executable, [], { stdio: "inherit", env, timeout: 30000 });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, "Native privacy policy checks must pass.");
} finally { closeSync(lock); unlinkSync(lockPath); }
