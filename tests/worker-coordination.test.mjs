import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, existsSync, rmSync, readdirSync, statSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { workerCommand } from "../scripts/worker-coordination.mjs";
const commandPath = fileURLToPath(new URL("../scripts/worker-coordination.mjs", import.meta.url));
function fixture() {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), "gc-coordination-test-")));
  const main = join(directory, "main"), a1 = join(directory, "a1"), a2 = join(directory, "a2");
  mkdirSync(main);
  const git = (...args) => execFileSync("git", args, { cwd: main, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  git("init", "-b", "main"); writeFileSync(join(main, "README"), "fictional fixture\n");
  git("add", "README"); git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-m", "Fixture");
  git("worktree", "add", a1, "-b", "fixture-a1"); git("worktree", "add", a2, "-b", "fixture-a2");
  const base = git("rev-parse", "HEAD");
  workerCommand({ operation: "configure", worker: "A1", session: "session-a1", base, worktrees: { A1: a1, A2: a2 } }, a1);
  const run = (worker, operation, fields = {}) => workerCommand({ worker, operation, session: "session-" + worker.toLowerCase(), ...fields }, worker === "A1" ? a1 : a2);
  const addWorker = (worker) => {
    const worktree = join(directory, worker.toLowerCase());
    git("worktree", "add", worktree, "-b", "fixture-" + worker.toLowerCase());
    const run = (operation, fields = {}) => workerCommand({ worker, operation, session: "session-" + worker.toLowerCase(), ...fields }, worktree);
    return { worktree, run };
  };
  return { directory, main, a1, a2, base, run, addWorker, cleanup: () => rmSync(directory, { recursive: true, force: true }) };
}
function snapshot(directory) {
  return Object.fromEntries(readdirSync(directory, { recursive: true }).map(name => {
    const path = join(directory, name), stat = statSync(path);
    return [name, { mtimeMs: stat.mtimeMs, content: stat.isFile() ? readFileSync(path, "utf8") : null }];
  }));
}
function attempt(command, directory, request, index) {
  const path = join(directory, `attempt-${index}.json`);
  writeFileSync(path, JSON.stringify(request));
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [commandPath, path], { cwd: command, stdio: "ignore" });
    child.once("error", reject); child.once("exit", code => resolve(code));
  });
}
test("duplicate identities and wrong-worktree writes cannot take another worker's state", () => {
  const f = fixture();
  try {
    f.run("A1", "register"); f.run("A2", "register");
    assert.throws(() => f.run("A1", "register", { session: "duplicate-session" }), /another session/);
    assert.throws(() => workerCommand({ operation: "checkpoint", worker: "A1", session: "session-a1", status: "bad" }, f.a2), /assigned worktree/);
    f.run("A1", "claim", { task: "fixture-task", resources: ["file:lib/shared", "contract:calendar"] });
    assert.throws(() => f.run("A2", "claim", { task: "other-task", resources: ["file:lib/shared/reader.ts"] }), /overlaps/);
    assert.throws(() => f.run("A2", "claim", { task: "other-task", resources: ["contract:calendar"] }), /overlaps/);
    assert.throws(() => f.run("A2", "claim", { task: "fixture-task", resources: ["file:independent.ts"] }), /already owns/);
    f.run("A2", "claim", { task: "other-task", resources: ["file:independent.ts"] });
    f.run("A1", "checkpoint", { status: "working", handoff: "Fictional checkpoint" });
    const status = workerCommand({ operation: "status" }, f.a1);
    const a1 = JSON.parse(readFileSync(join(status.directory, "workers/A1.json"), "utf8"));
    assert.equal(a1.session, "session-a1"); assert.equal(a1.task, "fixture-task"); assert.equal(a1.branch, "fixture-a1");
    assert.equal(existsSync(join(status.directory, "workers/A2.json")), false);
    assert.equal(status.mutex, false);
  } finally { f.cleanup(); }
});
test("A1 release lock retains its claim while A2 can finish independent work", () => {
  const f = fixture();
  try {
    for (const worker of ["A1", "A2"]) {
      f.run(worker, "register"); f.run(worker, "claim", { task: worker + "-task", resources: ["file:" + worker + ".ts"] });
    }
    assert.throws(() => f.run("A2", "release-acquire"), /Only A1/);
    f.run("A1", "release-acquire");
    assert.throws(() => f.run("A1", "finish"), /Release closeout/);
    assert.throws(() => f.run("A2", "release-release"));
    f.run("A2", "finish"); f.run("A2", "unregister");
    assert.equal(workerCommand({ operation: "status" }, f.a1).registry.release.session, "session-a1");
    f.run("A1", "release-release"); f.run("A1", "finish"); f.run("A1", "unregister");
    assert.deepEqual(workerCommand({ operation: "status" }, f.a1).registry.identities, {});
  } finally { f.cleanup(); }
});
test("unexamined stale locks and invalid resources fail closed without stealing or partial claims", () => {
  const f = fixture();
  try {
    f.run("A1", "register");
    const directory = workerCommand({ operation: "status" }, f.a1).directory;
    const mutex = join(directory, "claim.lock"); mkdirSync(mutex);
    writeFileSync(join(mutex, "owner.json"), JSON.stringify({ token: "unknown-live-owner", pid: process.pid }));
    assert.throws(() => f.run("A1", "claim", { task: "task", resources: ["file:lib"] }), /lock is held/);
    assert.equal(JSON.parse(readFileSync(join(mutex, "owner.json"))).token, "unknown-live-owner");
    rmSync(mutex, { recursive: true }); // This test owns its artificial lock.
    for (const name of ["file:../secret", "file:/absolute", "file:lib//x", "file:lib/./x", "contract:../../other"]) {
      assert.throws(() => f.run("A1", "claim", { task: "task", resources: [name] }));
      assert.deepEqual(workerCommand({ operation: "status" }, f.a1).registry.claims, {});
    }
  } finally { f.cleanup(); }
});
test("simultaneous separate processes establish at most one identity", async () => {
  const f = fixture();
  try {
    const attempts = ["first-session", "second-session"].map((session, i) => {
      const path = join(f.directory, `attempt-${i}.json`);
      writeFileSync(path, JSON.stringify({ operation: "register", worker: "A1", session }));
      return new Promise((resolve, reject) => {
        const child = spawn(process.execPath, [commandPath, path], { cwd: f.a1, stdio: "ignore" });
        child.once("error", reject); child.once("exit", code => resolve(code));
      });
    });
    const codes = await Promise.all(attempts);
    assert.equal(codes.filter(code => code === 0).length, 1);
    const state = workerCommand({ operation: "status" }, f.a1);
    assert.ok(["first-session", "second-session"].includes(state.registry.identities.A1.session));
    assert.equal(state.mutex, false);
  } finally { f.cleanup(); }
});
test("additional chats register without changing existing claims, historical identities or release ownership", () => {
  const f = fixture();
  try {
    f.run("A1", "register"); f.run("A2", "register");
    f.run("A1", "claim", { task: "release task", resources: ["contract:calendar"] });
    f.run("A1", "release-acquire");
    f.run("A2", "checkpoint", { status: "Preserved historical checkpoint" });
    const before = workerCommand({ operation: "status" }, f.a1);
    const historical = readFileSync(join(before.directory, "workers/A2.json"), "utf8");
    const c3 = f.addWorker("C3");
    c3.run("register", { label: "  Calendar accessibility chat  " });
    const after = workerCommand({ operation: "status" }, c3.worktree);
    assert.equal(after.registry.schema, 1);
    assert.deepEqual(after.registry.claims, before.registry.claims);
    assert.deepEqual(after.registry.release, before.registry.release);
    assert.deepEqual(after.registry.identities.A1, before.registry.identities.A1);
    assert.deepEqual(after.registry.identities.A2, before.registry.identities.A2);
    assert.equal(readFileSync(join(before.directory, "workers/A2.json"), "utf8"), historical);
    assert.equal(after.registry.workers.C3.worktree, c3.worktree);
    assert.equal(after.registry.identities.C3.label, "Calendar accessibility chat");
    assert.ok(after.registry.identities.C3.updatedAt);
    c3.run("claim", { task: "Independent task", taskIds: ["fictional-task-3"], resources: ["file:independent.ts"] });
    assert.throws(() => c3.run("release-acquire"), /Only A1/);
    assert.throws(() => c3.run("release-release"));
    c3.run("finish"); c3.run("unregister");
    assert.deepEqual(workerCommand({ operation: "status" }, f.a1).registry.release, before.registry.release);
    assert.throws(() => f.run("A1", "configure", { base: f.base, worktrees: { A1: f.a1, A2: f.a2 } }), /existing A2 identity/);
    f.run("A2", "unregister");
    assert.throws(() => f.run("A1", "configure", { base: f.base, worktrees: { A1: f.a1, A2: f.a2 } }), /Preserve established worker directories/);
  } finally { f.cleanup(); }
});
test("additional identities cannot duplicate sessions, reuse worktrees, or register main and detached checkouts", () => {
  const f = fixture();
  try {
    f.run("A1", "register");
    const c3 = f.addWorker("C3"), c4 = f.addWorker("C4");
    c3.run("register", { label: "First chat" });
    const before = workerCommand({ operation: "status" }, f.a1).registry;
    assert.throws(() => c3.run("register", { session: "different-session" }), /another session/);
    assert.throws(() => c4.run("register", { session: "session-c3" }), /already owns another worker identity/);
    assert.throws(() => workerCommand({ operation: "register", worker: "C4", session: "session-c4" }, c3.worktree), /already assigned/);
    assert.throws(() => workerCommand({ operation: "register", worker: "C4", session: "session-c4" }, f.main), /feature branch/);
    assert.throws(() => workerCommand({ operation: "register", worker: "C3", session: "session-c3" }, c4.worktree), /assigned worktree/);
    assert.throws(() => c3.run("register", { label: "invalid\nlabel" }), /single-line/);
    for (const worker of ["../other", "constructor", "__proto__", "", "A".repeat(33)]) {
      assert.throws(() => c4.run("register", { worker }));
    }
    execFileSync("git", ["checkout", "--detach"], { cwd: c4.worktree, stdio: "ignore" });
    assert.throws(() => c4.run("register"), /feature branch/);
    assert.deepEqual(workerCommand({ operation: "status" }, f.a1).registry, before);
    c3.run("register", { label: "Renamed chat" });
    assert.equal(workerCommand({ operation: "status" }, f.a1).registry.identities.C3.label, "Renamed chat");
  } finally { f.cleanup(); }
});
test("exact task and child IDs prevent differently worded duplicate work and retain legacy contract exclusions", () => {
  const f = fixture();
  try {
    f.run("A1", "register");
    const c3 = f.addWorker("C3"); c3.run("register");
    const claim = { task: "Parent and required child", taskIds: ["fictional-parent", "fictional-child", "fictional-parent"], resources: ["file:first.ts"] };
    f.run("A1", "claim", claim);
    const current = workerCommand({ operation: "status" }, f.a1).registry.claims.A1;
    assert.deepEqual(current.taskIds, ["fictional-child", "fictional-parent"]);
    assert.ok(current.resources.includes("contract:task-fictional-child"));
    assert.throws(() => c3.run("claim", { task: "Different words", taskIds: ["fictional-child"], resources: ["file:second.ts"] }), /exact task ID/);
    assert.throws(() => c3.run("claim", { task: "Legacy request", resources: ["contract:task-fictional-parent"] }), /overlaps/);
    f.run("A1", "claim", { task: claim.task, resources: ["file:first-revised.ts"] });
    assert.deepEqual(workerCommand({ operation: "status" }, f.a1).registry.claims.A1.taskIds, current.taskIds);
    const before = workerCommand({ operation: "status" }, f.a1).registry;
    for (const taskIds of [null, "fictional-id", [""], ["../escape"], ["has spaces"], [123], Array(101).fill("id")]) {
      assert.throws(() => f.run("A1", "claim", { ...claim, taskIds }));
    }
    assert.throws(() => f.run("A1", "claim", { ...claim, resources: Array.from({ length: 100 }, (_, i) => "file:item" + i) }), /including task ID/);
    assert.deepEqual(workerCommand({ operation: "status" }, f.a1).registry, before);
    f.run("A1", "finish");
    f.run("A1", "claim", { task: "Old-style claim", resources: ["contract:task-fictional-old"] });
    assert.throws(() => c3.run("claim", { task: "New-style description", taskIds: ["fictional-old"], resources: ["file:second.ts"] }), /overlaps/);
  } finally { f.cleanup(); }
});
test("status is read-only and shows checkpoints only for the current session and exact current claim", () => {
  const f = fixture();
  try {
    const c3 = f.addWorker("C3"); c3.run("register", { label: "Working chat" });
    c3.run("checkpoint", { status: "Choosing work" });
    const row = () => workerCommand({ operation: "status" }, c3.worktree).summary.find(item => item.worker === "C3");
    assert.equal(row().checkpoint.status, "Choosing work");
    const claim = { task: "A task", taskIds: ["fictional-task"], resources: ["file:first.ts"] };
    c3.run("claim", claim);
    assert.equal(row().checkpoint, null);
    c3.run("checkpoint", { status: "Testing", handoff: "Private details stay in the saved checkpoint" });
    let current = row();
    assert.equal(current.state, "claimed"); assert.equal(current.label, "Working chat");
    assert.equal(current.checkpoint.status, "Testing"); assert.equal(current.checkpoint.branch, "fixture-c3");
    assert.equal(current.checkpoint.handoff, undefined);
    const directory = workerCommand({ operation: "status" }, c3.worktree).directory;
    const before = snapshot(directory);
    workerCommand({ operation: "status" }, c3.worktree);
    assert.deepEqual(snapshot(directory), before);
    c3.run("claim", claim); // A new claim generation, even if the clock has not advanced.
    assert.equal(row().checkpoint, null);
    c3.run("checkpoint", { status: "Testing again" });
    c3.run("finish");
    assert.equal(row().state, "registered"); assert.equal(row().checkpoint, null);
    c3.run("checkpoint", { status: "Finished" });
    c3.run("unregister");
    assert.equal(row().state, "unregistered"); assert.equal(row().checkpoint, null);
    c3.run("register", { session: "replacement-session" });
    assert.equal(row().checkpoint, null);
    const registryPath = join(directory, "registry.json"), state = JSON.parse(readFileSync(registryPath, "utf8"));
    state.claims.C3 = { session: "old-session", task: "Orphaned task", resources: ["file:orphaned.ts"], at: new Date().toISOString() };
    writeFileSync(registryPath, JSON.stringify(state));
    current = row(); assert.equal(current.state, "orphaned-claim"); assert.equal(current.checkpoint, null);
  } finally { f.cleanup(); }
});
test("legacy schema-one checkpoints remain visible and heartbeat timestamps change only on successful writes", () => {
  const f = fixture();
  try {
    f.run("A1", "register"); f.run("A1", "claim", { task: "Legacy task", resources: ["file:legacy.ts"] });
    f.run("A1", "checkpoint", { status: "Legacy working" });
    const directory = workerCommand({ operation: "status" }, f.a1).directory;
    const registryPath = join(directory, "registry.json"), checkpointPath = join(directory, "workers/A1.json");
    const registry = JSON.parse(readFileSync(registryPath, "utf8")), checkpoint = JSON.parse(readFileSync(checkpointPath, "utf8"));
    delete registry.claims.A1.id; delete registry.claims.A1.taskIds; delete registry.identities.A1.updatedAt;
    delete checkpoint.claimId; delete checkpoint.claimedAt; delete checkpoint.taskIds;
    registry.identities.A1.registeredAt = "2000-01-01T00:00:00.000Z";
    writeFileSync(registryPath, JSON.stringify(registry)); writeFileSync(checkpointPath, JSON.stringify(checkpoint));
    assert.equal(workerCommand({ operation: "status" }, f.a1).summary[0].checkpoint.status, "Legacy working");
    assert.equal(JSON.parse(readFileSync(registryPath, "utf8")).identities.A1.updatedAt, undefined);
    assert.throws(() => f.run("A1", "claim", { task: "Wrong task", resources: ["file:new.ts"] }), /Finish the current/);
    assert.equal(JSON.parse(readFileSync(registryPath, "utf8")).identities.A1.updatedAt, undefined);
    f.run("A1", "checkpoint", { status: "Updated heartbeat" });
    assert.ok(JSON.parse(readFileSync(registryPath, "utf8")).identities.A1.updatedAt > registry.identities.A1.registeredAt);
  } finally { f.cleanup(); }
});
test("simultaneous chats cannot claim the same stable task with different descriptions", async () => {
  const f = fixture();
  try {
    const c3 = f.addWorker("C3"), c4 = f.addWorker("C4");
    c3.run("register"); c4.run("register");
    const codes = await Promise.all([c3, c4].map((chat, index) => attempt(chat.worktree, f.directory, {
      operation: "claim", worker: "C" + (index + 3), session: "session-c" + (index + 3),
      task: "Different description " + index, taskIds: ["fictional-shared-task"], resources: ["file:item" + index + ".ts"]
    }, index)));
    assert.equal(codes.filter(code => code === 0).length, 1);
    const status = workerCommand({ operation: "status" }, f.a1);
    assert.equal(Object.keys(status.registry.claims).length, 1);
    assert.equal(status.mutex, false);
  } finally { f.cleanup(); }
});
test("simultaneous new-worker registration cannot bind one identity to two worktrees", async () => {
  const f = fixture();
  try {
    const c3 = f.addWorker("C3"), c4 = f.addWorker("C4");
    const codes = await Promise.all([c3, c4].map((chat, index) => attempt(chat.worktree, f.directory, {
      operation: "register", worker: "C3", session: "competing-session-" + index
    }, index)));
    assert.equal(codes.filter(code => code === 0).length, 1);
    const status = workerCommand({ operation: "status" }, f.a1);
    assert.equal(Object.keys(status.registry.identities).length, 1);
    assert.ok([c3.worktree, c4.worktree].includes(status.registry.workers.C3.worktree));
    assert.equal(status.mutex, false);
  } finally { f.cleanup(); }
});
test("status before setup does not create coordination files", () => {
  const directory = mkdtempSync(join(tmpdir(), "gc-status-test-"));
  try {
    execFileSync("git", ["init", "-b", "main"], { cwd: directory, stdio: "ignore" });
    const status = workerCommand({ operation: "status" }, directory);
    assert.equal(status.registry, null); assert.deepEqual(status.summary, []); assert.equal(status.mutex, false);
    assert.equal(existsSync(status.directory), false);
    assert.throws(() => workerCommand({ operation: "register", worker: "C3", session: "new-session" }, directory), /Configure the shared registry/);
    assert.equal(existsSync(join(status.directory, "registry.json")), false);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
