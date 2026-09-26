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
const workerPattern = /^[A-Z][A-Z0-9_-]{0,31}$/;
function taskIds(value = []) {
  assert.ok(Array.isArray(value) && value.length <= 100, "Use at most 100 exact task IDs");
  for (const id of value) {
    assert.equal(typeof id, "string");
    assert.match(id, /^[A-Za-z0-9_-]{1,120}$/, "Use exact task IDs without spaces or paths");
  }
  return [...new Set(value)].sort();
}
function summary(state, directory) {
  if (!state) return [];
  return Object.entries(state.workers).map(([worker, entry]) => {
    const identity = state.identities[worker], claim = state.claims[worker];
    const path = join(directory, "workers", worker + ".json");
    const saved = workerPattern.test(worker) && existsSync(path) ? read(path) : null;
    const ownsClaim = Boolean(identity && claim?.session === identity.session);
    const matches = Boolean(identity && saved?.worker === worker && saved.session === identity.session
      && saved.updatedAt >= identity.registeredAt
      && saved.worktree === entry.worktree && saved.task === (claim?.task ?? null)
      && JSON.stringify(taskIds(saved.taskIds)) === JSON.stringify(taskIds(claim?.taskIds))
      && (!claim || (ownsClaim && saved.updatedAt >= claim.at
        && (claim.id === undefined || saved.claimId === claim.id)
        && (saved.claimedAt === undefined || saved.claimedAt === claim.at))));
    const checkpoint = matches ? saved : null;
    return {
      worker, label: identity?.label ?? worker, session: identity?.session ?? null,
      worktree: entry.worktree, state: claim ? (ownsClaim ? "claimed" : "orphaned-claim") : identity ? "registered" : "unregistered",
      task: claim?.task ?? null, taskIds: taskIds(claim?.taskIds), resources: claim?.resources ?? [],
      claimedAt: claim?.at ?? null,
      updatedAt: [identity?.updatedAt ?? identity?.registeredAt, claim?.at, checkpoint?.updatedAt].filter(Boolean).sort().at(-1) ?? null,
      checkpoint: checkpoint ? {
        updatedAt: checkpoint.updatedAt, status: checkpoint.status,
        branch: checkpoint.branch, commit: checkpoint.commit
      } : null
    };
  });
}

/** Cooperative local coordination, not an OS or provider permission boundary. */
export function workerCommand(request, cwd = process.cwd()) {
  assert.ok(request && typeof request === "object" && !Array.isArray(request));
  const here = location(cwd), directory = join(here.common, "gc-coordination");
  const registryPath = join(directory, "registry.json");
  if (request.operation === "status") {
    const registry = existsSync(registryPath) ? read(registryPath) : null;
    return { directory, registry, summary: summary(registry, directory),
      mutex: existsSync(join(directory, "claim.lock")) };
  }
  assert.equal(typeof request.worker, "string");
  assert.match(request.worker, workerPattern, "Use an uppercase worker ID, at most 32 letters, digits, underscores or hyphens");
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
      if (request.operation === "register" && !state.workers[request.worker]) {
        assert.ok(state.configuredAt, "Configure the shared registry before registering another worker");
        assert.ok(!identity && !state.claims[request.worker], "Preserve existing ownership");
        assert.ok(!Object.values(state.workers).some(worker => worker.worktree === here.root), "This worktree is already assigned to another worker");
        state.workers[request.worker] = { worktree: here.root };
      }
      assert.equal(state.workers[request.worker]?.worktree, here.root, "Use only your assigned worktree");
      if (request.worker !== "A1") {
        const branch = git(cwd, "branch", "--show-current");
        assert.ok(branch && branch !== "main", "Additional workers require a feature branch, not main or a detached checkout");
      }
      if (request.operation === "register") {
        if (identity) owned();
        assert.ok(!Object.entries(state.identities).some(([worker, owner]) => worker !== request.worker && owner.session === request.session), "This session already owns another worker identity");
        state.identities[request.worker] = identity ?? { session: request.session, registeredAt: now };
        if (request.label !== undefined) {
          assert.equal(typeof request.label, "string");
          assert.ok(request.label.trim().length > 0 && request.label.length <= 200 && !/[\r\n\u0000-\u001f\u007f]/.test(request.label), "Use a short, single-line chat label");
          state.identities[request.worker].label = request.label.trim();
        }
      } else {
        owned();
        if (request.operation === "claim") {
          assert.equal(typeof request.task, "string");
          assert.ok(request.task.trim().length > 0 && request.task.length <= 200);
          assert.ok(Array.isArray(request.resources) && request.resources.length > 0 && request.resources.length <= 100);
          const prior = state.claims[request.worker];
          const ids = taskIds(request.taskIds === undefined ? prior?.taskIds : request.taskIds);
          const resources = [...new Set([...request.resources, ...ids.map(id => "contract:task-" + id)].map(resource))];
          assert.ok(resources.length <= 100, "Use at most 100 resources, including task ID reservations");
          assert.ok(!prior || prior.task === request.task, "Finish the current task claim before choosing another task");
          for (const [worker, claim] of Object.entries(state.claims)) {
            if (worker === request.worker) continue;
            assert.notEqual(claim.task, request.task, "Another worker already owns this task");
            assert.ok(!ids.some(id => (claim.taskIds ?? []).includes(id)), "Another worker already owns this exact task ID");
            assert.ok(!resources.some(a => claim.resources.some(b => overlaps(a, b))), "Resource overlaps another worker's current claim");
          }
          state.claims[request.worker] = { id: randomUUID(), session: request.session, task: request.task, taskIds: ids, resources, at: now };
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
            taskIds: state.claims[request.worker]?.taskIds ?? [], claimedAt: state.claims[request.worker]?.at ?? null,
            claimId: state.claims[request.worker]?.id ?? null,
            status: request.status, handoff: request.handoff ?? ""
          });
        } else if (request.operation === "unregister") {
          assert.ok(!state.claims[request.worker] && state.release?.session !== request.session, "Finish claims and release work before unregistering");
          delete state.identities[request.worker];
        } else throw new Error("Unknown coordination operation");
      }
    }
    if (state.identities[request.worker]) state.identities[request.worker].updatedAt = now;
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
