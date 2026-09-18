import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  existsSync, mkdirSync, readFileSync, writeFileSync, renameSync,
  rmSync, realpathSync, openSync, fsyncSync, closeSync
} from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const read = (path) => JSON.parse(readFileSync(path, "utf8"));
function atomic(path, value) {
  const temporary = path + "." + randomUUID() + ".tmp";
  try {
    writeFileSync(temporary, JSON.stringify(value, null, 2) + "\n", { mode: 0o600, flag: "wx" });
    const fd = openSync(temporary, "r");
    try { fsyncSync(fd); } finally { closeSync(fd); }
    renameSync(temporary, path);
  } finally { rmSync(temporary, { force: true }); }
}
function git(cwd, ...args) {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}
function location(cwd) {
  return {
    root: realpathSync(git(cwd, "rev-parse", "--show-toplevel")),
    common: realpathSync(git(cwd, "rev-parse", "--path-format=absolute", "--git-common-dir"))
  };
}
function resource(value) {
  assert.equal(typeof value, "string");
  assert.match(value, /^(file|contract):[A-Za-z0-9_./[\]()-]+$/);
  const [kind, name] = value.split(":");
  assert.ok(name && !name.startsWith("/") && !name.split("/").some(p => !p || p === "." || p === ".."));
  return kind + ":" + name.toLowerCase();
}
function overlaps(a, b) {
  return a === b || (a.startsWith("file:") && b.startsWith("file:") && (a.startsWith(b + "/") || b.startsWith(a + "/")));
}

/** Cooperative local coordination, not an OS or provider permission boundary. */
export function workerCommand(request, cwd = process.cwd()) {
  assert.ok(request && typeof request === "object" && !Array.isArray(request));
  const here = location(cwd), directory = join(here.common, "gc-coordination");
  const registryPath = join(directory, "registry.json");
  if (request.operation === "status") {
    return { directory, registry: existsSync(registryPath) ? read(registryPath) : null,
      mutex: existsSync(join(directory, "claim.lock")) };
  }
  assert.ok(["A1", "A2"].includes(request.worker), "Choose A1 or A2");
  assert.match(request.session ?? "", /^[A-Za-z0-9_-]{8,120}$/);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const mutex = join(directory, "claim.lock"), token = randomUUID();
  try { mkdirSync(mutex, { mode: 0o700 }); }
  catch (error) {
    if (error.code === "EEXIST") throw new Error("Claim lock is held. Inspect its owner and retry later; never remove a live or unexamined lock.");
    throw error;
  }
  writeFileSync(join(mutex, "owner.json"), JSON.stringify({ token, pid: process.pid, worker: request.worker, session: request.session, at: new Date().toISOString() }), { mode: 0o600, flag: "wx" });
  try {
    const state = existsSync(registryPath) ? read(registryPath) : { schema: 1, workers: {}, identities: {}, claims: {}, release: null };
    assert.equal(state.schema, 1, "Unknown coordination schema");
    const now = new Date().toISOString();
    const identity = state.identities[request.worker];
    const owned = () => assert.equal(identity?.session, request.session, "This worker identity belongs to another session or is not registered");
    if (request.operation === "configure") {
      assert.equal(request.worker, "A1", "Only A1 establishes the shared setup");
      if (Object.keys(state.identities).length) owned();
      assert.ok(!state.identities.A2, "An existing A2 identity prevents setup replacement");
      const workers = {};
      for (const id of ["A1", "A2"]) {
        const entry = location(request.worktrees?.[id]);
        assert.equal(entry.common, here.common, "Workers must share this Git common directory");
        workers[id] = { worktree: entry.root };
      }
      assert.notEqual(workers.A1.worktree, workers.A2.worktree, "Separate worktrees are required");
      assert.equal(here.root, workers.A1.worktree, "Configure from the assigned A1 worktree");
      if (state.configuredAt) assert.deepEqual(workers, state.workers, "Preserve established worker directories");
      assert.match(request.base ?? "", /^[a-f0-9]{40}$/);
      git(cwd, "cat-file", "-e", request.base + "^{commit}");
      state.workers = workers;
      state.base = request.base;
      state.configuredAt = now;
    } else {
      assert.equal(state.workers[request.worker]?.worktree, here.root, "Use only your assigned worktree");
      if (request.worker === "A2") assert.notEqual(git(cwd, "branch", "--show-current"), "main", "A2 cannot use main");
      if (request.operation === "register") {
        if (identity) owned();
        state.identities[request.worker] = identity ?? { session: request.session, registeredAt: now };
      } else {
        owned();
        if (request.operation === "claim") {
          assert.equal(typeof request.task, "string");
          assert.ok(request.task.length > 0 && request.task.length <= 200);
          assert.ok(Array.isArray(request.resources) && request.resources.length > 0 && request.resources.length <= 100);
          const resources = [...new Set(request.resources.map(resource))];
          const prior = state.claims[request.worker];
          assert.ok(!prior || prior.task === request.task, "Finish the current task claim before choosing another task");
          for (const [worker, claim] of Object.entries(state.claims)) {
            if (worker === request.worker) continue;
            assert.notEqual(claim.task, request.task, "Another worker already owns this task");
            assert.ok(!resources.some(a => claim.resources.some(b => overlaps(a, b))), "Resource overlaps another worker's current claim");
          }
          state.claims[request.worker] = { session: request.session, task: request.task, resources, at: now };
        } else if (request.operation === "finish") {
          assert.notEqual(state.release?.session, request.session, "Release closeout must finish before clearing the feature claim");
          delete state.claims[request.worker];
        } else if (request.operation === "release-acquire") {
          assert.equal(request.worker, "A1", "Only A1 may hold the integration/release lock");
          assert.ok(state.claims.A1, "Claim release work before acquiring the release lock");
          assert.ok(!state.release || state.release.session === request.session, "Another session owns the release lock");
          state.release ??= { worker: "A1", session: request.session, task: state.claims.A1.task, acquiredAt: now };
        } else if (request.operation === "release-release") {
          assert.equal(request.worker, "A1");
          assert.equal(state.release?.session, request.session, "No release lock is owned by this session");
          state.release = null;
        } else if (request.operation === "checkpoint") {
          assert.equal(typeof request.status, "string");
          assert.ok(request.status.length > 0 && request.status.length <= 200);
          assert.ok(typeof (request.handoff ?? "") === "string" && (request.handoff ?? "").length <= 20000);
          mkdirSync(join(directory, "workers"), { recursive: true, mode: 0o700 });
          atomic(join(directory, "workers", request.worker + ".json"), {
            worker: request.worker, session: request.session, updatedAt: now,
            worktree: here.root, branch: git(cwd, "branch", "--show-current"), commit: git(cwd, "rev-parse", "HEAD"),
            task: state.claims[request.worker]?.task ?? null, resources: state.claims[request.worker]?.resources ?? [],
            status: request.status, handoff: request.handoff ?? ""
          });
        } else if (request.operation === "unregister") {
          assert.ok(!state.claims[request.worker] && state.release?.session !== request.session, "Finish claims and release work before unregistering");
          delete state.identities[request.worker];
        } else throw new Error("Unknown coordination operation");
      }
    }
    state.updatedAt = now;
    atomic(registryPath, state);
    return { directory, operation: request.operation, worker: request.worker, identity: state.identities[request.worker] ?? null,
      claim: state.claims[request.worker] ?? null, release: state.release };
  } finally {
    if (existsSync(join(mutex, "owner.json")) && read(join(mutex, "owner.json")).token === token) rmSync(mutex, { recursive: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    assert.equal(process.argv.length, 3, "Pass one private JSON request file; run from the assigned worktree");
    console.log(JSON.stringify(workerCommand(read(resolve(process.argv[2]))), null, 2));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
