import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, existsSync, rmSync, readdirSync, statSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
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
    assert.throws(() => f.run("A2", "release-acquire"), /designated release owner session/);
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
    assert.throws(() => c3.run("release-acquire"), /designated release owner session/);
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
const releaseHandoff = {
  expectedOwner: { worker: "A1", session: "session-a1" },
  authorization: "Fictional direct human instruction in coordinator message fixture-123: R1 may take the unowned release role."
};
test("explicit release handoff preserves historical workers and gives only the designated session the release lock", () => {
  const f = fixture();
  try {
    f.run("A1", "register"); f.run("A2", "register");
    f.run("A1", "checkpoint", { status: "Paused historical release owner" });
    f.run("A2", "claim", { task: "Independent work", resources: ["file:a2.ts"] });
    f.run("A2", "checkpoint", { status: "Independent work remains active" });
    const r1 = f.addWorker("R1"); r1.run("register");
    r1.run("claim", { task: "Authorized release work", resources: ["contract:release"] });
    const before = workerCommand({ operation: "status" }, f.a1);
    const checkpoints = ["A1", "A2"].map(worker => readFileSync(join(before.directory, "workers", worker + ".json"), "utf8"));
    const handoff = r1.run("release-handoff", releaseHandoff);
    assert.deepEqual(handoff.releaseOwner.previousOwner, releaseHandoff.expectedOwner);
    assert.equal(handoff.releaseOwner.worker, "R1"); assert.equal(handoff.releaseOwner.session, "session-r1");
    assert.equal(handoff.releaseOwner.authorization, releaseHandoff.authorization);
    assert.ok(handoff.releaseOwner.assignedAt); assert.equal(handoff.release, null);
    const after = workerCommand({ operation: "status" }, f.a1);
    assert.equal(after.registry.schema, 1);
    assert.deepEqual(after.registry.workers, before.registry.workers);
    assert.deepEqual(after.registry.claims, before.registry.claims);
    for (const worker of ["A1", "A2"]) assert.deepEqual(after.registry.identities[worker], before.registry.identities[worker]);
    assert.deepEqual(["A1", "A2"].map(worker => readFileSync(join(before.directory, "workers", worker + ".json"), "utf8")), checkpoints);
    assert.throws(() => f.run("A1", "release-acquire"), /designated release owner session/);
    assert.throws(() => f.run("A2", "release-acquire"), /designated release owner session/);
    const release = r1.run("release-acquire").release;
    assert.equal(release.worker, "R1"); assert.equal(release.session, "session-r1"); assert.equal(release.task, "Authorized release work");
    assert.deepEqual(r1.run("release-acquire").release, release);
    assert.throws(() => f.run("A1", "release-release"), /designated release owner session/);
    assert.throws(() => r1.run("finish"), /Release closeout/);
    f.run("A2", "finish"); f.run("A2", "unregister");
    assert.deepEqual(workerCommand({ operation: "status" }, f.a1).registry.release, release);
    r1.run("release-release"); r1.run("finish");
    const closed = workerCommand({ operation: "status" }, f.a1);
    assert.equal(closed.registry.release, null); assert.deepEqual(closed.registry.releaseOwner, handoff.releaseOwner);
    const files = snapshot(closed.directory); workerCommand({ operation: "status" }, f.a1); assert.deepEqual(snapshot(closed.directory), files);
  } finally { f.cleanup(); }
});
test("handoff rejects active prior work, held releases, stale expectations and unowned requests without changing registry", () => {
  const f = fixture();
  try {
    f.run("A1", "register");
    const r1 = f.addWorker("R1");
    const unchanged = (action, expected) => {
      const before = workerCommand({ operation: "status" }, f.a1).registry;
      assert.throws(action, expected);
      const after = workerCommand({ operation: "status" }, f.a1);
      assert.deepEqual(after.registry, before); assert.equal(after.mutex, false);
    };
    unchanged(() => r1.run("release-handoff", releaseHandoff), /assigned worktree/);
    r1.run("register");
    unchanged(() => r1.run("release-handoff", releaseHandoff), /Claim release work/);
    r1.run("claim", { task: "Release work", resources: ["contract:release"] });
    unchanged(() => r1.run("release-handoff", { ...releaseHandoff, session: "wrong-session" }), /another session/);
    unchanged(() => workerCommand({ operation: "release-handoff", worker: "R1", session: "session-r1", ...releaseHandoff }, f.a1), /assigned worktree/);
    unchanged(() => r1.run("release-handoff", { ...releaseHandoff, expectedOwner: { worker: "A1", session: "wrong-session" } }), /owner changed/);
    unchanged(() => r1.run("release-handoff", { ...releaseHandoff, expectedOwner: { worker: "A2", session: "session-a1" } }), /owner changed/);
    unchanged(() => r1.run("release-handoff", { ...releaseHandoff, target: { worker: "A2", session: "session-a2" } }), /only the requesting worker/);
    for (const authorization of [undefined, null, "", " ", "Human\nmessage", "x".repeat(2001)]) {
      unchanged(() => r1.run("release-handoff", { ...releaseHandoff, authorization }), /authorization/);
    }
    f.run("A1", "claim", { task: "Prior owner active task", resources: ["file:a1.ts"] });
    unchanged(() => r1.run("release-handoff", releaseHandoff), /previous release owner still has a claim/);
    f.run("A1", "release-acquire");
    unchanged(() => r1.run("release-handoff", releaseHandoff), /existing release lock/);
    f.run("A1", "release-release"); f.run("A1", "finish");
    r1.run("release-handoff", releaseHandoff);
    const c3 = f.addWorker("C3"); c3.run("register"); c3.run("claim", { task: "Later release work", resources: ["file:c3.ts"] });
    unchanged(() => c3.run("release-handoff", releaseHandoff), /owner changed/);
    r1.run("release-acquire");
    unchanged(() => c3.run("release-handoff", { ...releaseHandoff, expectedOwner: { worker: "R1", session: "session-r1" } }), /existing release lock/);
    r1.run("release-release"); r1.run("finish");
    c3.run("release-handoff", { ...releaseHandoff, expectedOwner: { worker: "R1", session: "session-r1" } });
    assert.throws(() => r1.run("release-acquire"), /designated release owner session/);
    assert.equal(c3.run("release-acquire").release.worker, "C3");
  } finally { f.cleanup(); }
});
test("a replacement registration does not inherit an explicitly assigned release session", () => {
  const f = fixture();
  try {
    f.run("A1", "register");
    const r1 = f.addWorker("R1"); r1.run("register"); r1.run("claim", { task: "Release work", resources: ["contract:release"] });
    const role = r1.run("release-handoff", releaseHandoff).releaseOwner;
    r1.run("finish"); r1.run("unregister");
    r1.run("register", { session: "replacement-session" });
    r1.run("claim", { session: "replacement-session", task: "Different work", resources: ["file:new.ts"] });
    assert.throws(() => r1.run("release-acquire", { session: "replacement-session" }), /designated release owner session/);
    assert.deepEqual(workerCommand({ operation: "status" }, f.a1).registry.releaseOwner, role);
  } finally { f.cleanup(); }
});
test("a replacement session can explicitly renew its worker's released role without inheriting old authority", () => {
  const f = fixture();
  try {
    f.run("A1", "register");
    const r1 = f.addWorker("R1"); r1.run("register"); r1.run("claim", { task: "Original release work", resources: ["contract:release"] });
    r1.run("release-handoff", releaseHandoff); r1.run("release-acquire");
    r1.run("release-release"); r1.run("finish"); r1.run("unregister");
    const session = "replacement-session";
    r1.run("register", { session });
    const renewal = { session, expectedOwner: { worker: "R1", session: "session-r1" }, authorization: "Fictional renewed human authorization fixture-456 for this replacement R1 session." };
    const unchanged = (action, expected) => {
      const before = workerCommand({ operation: "status" }, f.a1).registry;
      assert.throws(action, expected);
      const after = workerCommand({ operation: "status" }, f.a1);
      assert.deepEqual(after.registry, before); assert.equal(after.mutex, false);
    };
    unchanged(() => r1.run("release-handoff", renewal), /Claim release work/);
    r1.run("claim", { session, task: "Renewed release work", resources: ["contract:release"] });
    unchanged(() => r1.run("release-acquire", { session }), /designated release owner session/);
    unchanged(() => r1.run("release-handoff", { ...renewal, expectedOwner: releaseHandoff.expectedOwner }), /owner changed/);
    const before = workerCommand({ operation: "status" }, f.a1).registry;
    const role = r1.run("release-handoff", renewal).releaseOwner;
    assert.deepEqual(role.previousOwner, renewal.expectedOwner);
    assert.equal(role.worker, "R1"); assert.equal(role.session, session);
    assert.equal(role.authorization, renewal.authorization);
    const after = workerCommand({ operation: "status" }, f.a1).registry;
    assert.deepEqual(after.claims, before.claims); assert.deepEqual(after.workers, before.workers);
    unchanged(() => r1.run("release-handoff", renewal), /owner changed/);
    unchanged(() => r1.run("release-handoff", { ...renewal, expectedOwner: { worker: "R1", session } }), /already owns the release role/);
    unchanged(() => r1.run("release-acquire"), /another session/);
    const held = r1.run("release-acquire", { session }).release;
    assert.equal(held.worker, "R1"); assert.equal(held.session, session); assert.equal(held.task, "Renewed release work");
    r1.run("release-release", { session }); r1.run("finish", { session });
  } finally { f.cleanup(); }
});
test("same-worker release renewal refuses an orphaned old-session claim without changing it", () => {
  const f = fixture();
  try {
    f.run("A1", "register");
    const r1 = f.addWorker("R1"); r1.run("register"); r1.run("claim", { task: "Original release work", resources: ["contract:release"] });
    r1.run("release-handoff", releaseHandoff);
    const original = workerCommand({ operation: "status" }, f.a1).registry.claims.R1;
    r1.run("finish"); r1.run("unregister");
    const session = "replacement-session";
    r1.run("register", { session });
    const status = workerCommand({ operation: "status" }, f.a1);
    // Only this fictional registry receives the stale state; no repair may clear it.
    status.registry.claims.R1 = original;
    writeFileSync(join(status.directory, "registry.json"), JSON.stringify(status.registry, null, 2) + "\n");
    assert.throws(() => r1.run("release-handoff", {
      session, expectedOwner: { worker: "R1", session: "session-r1" },
      authorization: "Fictional renewed human authorization does not permit taking orphaned work."
    }), /previous release owner still has a claim/);
    const after = workerCommand({ operation: "status" }, f.a1);
    assert.deepEqual(after.registry, status.registry); assert.equal(after.mutex, false);
    assert.equal(after.summary.find(worker => worker.worker === "R1").state, "orphaned-claim");
  } finally { f.cleanup(); }
});
test("simultaneous handoffs with the same expected owner establish at most one release owner", async () => {
  const f = fixture();
  try {
    f.run("A1", "register");
    const r1 = f.addWorker("R1"), c3 = f.addWorker("C3");
    for (const [index, chat] of [r1, c3].entries()) {
      chat.run("register"); chat.run("claim", { task: "Release candidate " + index, resources: ["file:candidate" + index + ".ts"] });
    }
    const codes = await Promise.all([r1, c3].map((chat, index) => attempt(chat.worktree, f.directory, {
      operation: "release-handoff", worker: index === 0 ? "R1" : "C3", session: index === 0 ? "session-r1" : "session-c3", ...releaseHandoff
    }, index)));
    assert.equal(codes.filter(code => code === 0).length, 1);
    const status = workerCommand({ operation: "status" }, f.a1);
    assert.ok(["R1", "C3"].includes(status.registry.releaseOwner.worker));
    assert.equal(status.registry.release, null); assert.equal(status.mutex, false);
  } finally { f.cleanup(); }
});
test("frozen schema-one helper preserves additive role on independent work and cannot acquire a held R1 release", () => {
  const f = fixture();
  try {
    assert.equal(createHash("sha256").update(legacyHelperSource).digest("hex"), legacyHelperSha256);
    const path = join(f.directory, "legacy-worker-coordination.mjs"); writeFileSync(path, legacyHelperSource);
    let index = 0;
    const legacy = (worker, operation, fields = {}) => {
      const request = join(f.directory, "legacy-request-" + index++ + ".json");
      writeFileSync(request, JSON.stringify({ worker, operation, session: "session-" + worker.toLowerCase(), ...fields }));
      return JSON.parse(execFileSync(process.execPath, [path, request], { cwd: worker === "A1" ? f.a1 : f.a2, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }));
    };
    legacy("A1", "register"); legacy("A2", "register");
    legacy("A1", "checkpoint", { status: "Paused release owner" });
    const r1 = f.addWorker("R1"); r1.run("register"); r1.run("claim", { task: "Authorized release work", resources: ["contract:release"] });
    const role = r1.run("release-handoff", releaseHandoff).releaseOwner;
    const held = r1.run("release-acquire").release;
    legacy("A2", "claim", { task: "Independent legacy work", resources: ["file:a2.ts"] });
    legacy("A2", "checkpoint", { status: "Independent legacy checkpoint" });
    legacy("A2", "finish"); legacy("A2", "unregister");
    legacy("A1", "claim", { task: "Fictional stale owner attempt", resources: ["file:a1.ts"] });
    assert.throws(() => legacy("A1", "release-acquire"), /Another session owns the release lock/);
    assert.throws(() => legacy("A1", "release-release"), /No release lock is owned by this session/);
    legacy("A1", "finish");
    const preserved = workerCommand({ operation: "status" }, f.a1).registry;
    assert.deepEqual(preserved.releaseOwner, role); assert.deepEqual(preserved.release, held);
    r1.run("release-release");
    // Once the lock is unowned, historical A1 helpers do not understand this
    // additive role. The paused owner must adopt the updated helper before any
    // later authorized release; this test does not claim an ACL against old code.
    assert.throws(() => f.run("A1", "release-acquire"), /designated release owner session/);
  } finally { f.cleanup(); }
});

// Frozen original helper from 582e1c0fc6540491b09e2f76251f262fac6b020f; kept inline so
// source-only checkouts can test legacy compatibility without Git history.
const legacyHelperSha256 = "a38d0b5683d03d500c06676eb17b244c636be9318a6fdd6215192f89c55d0399";
const legacyHelperSource = [
  "import assert from \"node:assert/strict\";",
  "import { execFileSync } from \"node:child_process\";",
  "import { randomUUID } from \"node:crypto\";",
  "import {",
  "  existsSync, mkdirSync, readFileSync, writeFileSync, renameSync,",
  "  rmSync, realpathSync, openSync, fsyncSync, closeSync",
  "} from \"node:fs\";",
  "import { join, resolve } from \"node:path\";",
  "import { pathToFileURL } from \"node:url\";",
  "",
  "const read = (path) => JSON.parse(readFileSync(path, \"utf8\"));",
  "function atomic(path, value) {",
  "  const temporary = path + \".\" + randomUUID() + \".tmp\";",
  "  try {",
  "    writeFileSync(temporary, JSON.stringify(value, null, 2) + \"\\n\", { mode: 0o600, flag: \"wx\" });",
  "    const fd = openSync(temporary, \"r\");",
  "    try { fsyncSync(fd); } finally { closeSync(fd); }",
  "    renameSync(temporary, path);",
  "  } finally { rmSync(temporary, { force: true }); }",
  "}",
  "function git(cwd, ...args) {",
  "  return execFileSync(\"git\", args, { cwd, encoding: \"utf8\", stdio: [\"ignore\", \"pipe\", \"pipe\"] }).trim();",
  "}",
  "function location(cwd) {",
  "  return {",
  "    root: realpathSync(git(cwd, \"rev-parse\", \"--show-toplevel\")),",
  "    common: realpathSync(git(cwd, \"rev-parse\", \"--path-format=absolute\", \"--git-common-dir\"))",
  "  };",
  "}",
  "function resource(value) {",
  "  assert.equal(typeof value, \"string\");",
  "  assert.match(value, /^(file|contract):[A-Za-z0-9_./[\\]()-]+$/);",
  "  const [kind, name] = value.split(\":\");",
  "  assert.ok(name && !name.startsWith(\"/\") && !name.split(\"/\").some(p => !p || p === \".\" || p === \"..\"));",
  "  return kind + \":\" + name.toLowerCase();",
  "}",
  "function overlaps(a, b) {",
  "  return a === b || (a.startsWith(\"file:\") && b.startsWith(\"file:\") && (a.startsWith(b + \"/\") || b.startsWith(a + \"/\")));",
  "}",
  "const workerPattern = /^[A-Z][A-Z0-9_-]{0,31}$/;",
  "function taskIds(value = []) {",
  "  assert.ok(Array.isArray(value) && value.length <= 100, \"Use at most 100 exact task IDs\");",
  "  for (const id of value) {",
  "    assert.equal(typeof id, \"string\");",
  "    assert.match(id, /^[A-Za-z0-9_-]{1,120}$/, \"Use exact task IDs without spaces or paths\");",
  "  }",
  "  return [...new Set(value)].sort();",
  "}",
  "function summary(state, directory) {",
  "  if (!state) return [];",
  "  return Object.entries(state.workers).map(([worker, entry]) => {",
  "    const identity = state.identities[worker], claim = state.claims[worker];",
  "    const path = join(directory, \"workers\", worker + \".json\");",
  "    const saved = workerPattern.test(worker) && existsSync(path) ? read(path) : null;",
  "    const ownsClaim = Boolean(identity && claim?.session === identity.session);",
  "    const matches = Boolean(identity && saved?.worker === worker && saved.session === identity.session",
  "      && saved.updatedAt >= identity.registeredAt",
  "      && saved.worktree === entry.worktree && saved.task === (claim?.task ?? null)",
  "      && JSON.stringify(taskIds(saved.taskIds)) === JSON.stringify(taskIds(claim?.taskIds))",
  "      && (!claim || (ownsClaim && saved.updatedAt >= claim.at",
  "        && (claim.id === undefined || saved.claimId === claim.id)",
  "        && (saved.claimedAt === undefined || saved.claimedAt === claim.at))));",
  "    const checkpoint = matches ? saved : null;",
  "    return {",
  "      worker, label: identity?.label ?? worker, session: identity?.session ?? null,",
  "      worktree: entry.worktree, state: claim ? (ownsClaim ? \"claimed\" : \"orphaned-claim\") : identity ? \"registered\" : \"unregistered\",",
  "      task: claim?.task ?? null, taskIds: taskIds(claim?.taskIds), resources: claim?.resources ?? [],",
  "      claimedAt: claim?.at ?? null,",
  "      updatedAt: [identity?.updatedAt ?? identity?.registeredAt, claim?.at, checkpoint?.updatedAt].filter(Boolean).sort().at(-1) ?? null,",
  "      checkpoint: checkpoint ? {",
  "        updatedAt: checkpoint.updatedAt, status: checkpoint.status,",
  "        branch: checkpoint.branch, commit: checkpoint.commit",
  "      } : null",
  "    };",
  "  });",
  "}",
  "",
  "/** Cooperative local coordination, not an OS or provider permission boundary. */",
  "export function workerCommand(request, cwd = process.cwd()) {",
  "  assert.ok(request && typeof request === \"object\" && !Array.isArray(request));",
  "  const here = location(cwd), directory = join(here.common, \"gc-coordination\");",
  "  const registryPath = join(directory, \"registry.json\");",
  "  if (request.operation === \"status\") {",
  "    const registry = existsSync(registryPath) ? read(registryPath) : null;",
  "    return { directory, registry, summary: summary(registry, directory),",
  "      mutex: existsSync(join(directory, \"claim.lock\")) };",
  "  }",
  "  assert.equal(typeof request.worker, \"string\");",
  "  assert.match(request.worker, workerPattern, \"Use an uppercase worker ID, at most 32 letters, digits, underscores or hyphens\");",
  "  assert.match(request.session ?? \"\", /^[A-Za-z0-9_-]{8,120}$/);",
  "  mkdirSync(directory, { recursive: true, mode: 0o700 });",
  "  const mutex = join(directory, \"claim.lock\"), token = randomUUID();",
  "  try { mkdirSync(mutex, { mode: 0o700 }); }",
  "  catch (error) {",
  "    if (error.code === \"EEXIST\") throw new Error(\"Claim lock is held. Inspect its owner and retry later; never remove a live or unexamined lock.\");",
  "    throw error;",
  "  }",
  "  writeFileSync(join(mutex, \"owner.json\"), JSON.stringify({ token, pid: process.pid, worker: request.worker, session: request.session, at: new Date().toISOString() }), { mode: 0o600, flag: \"wx\" });",
  "  try {",
  "    const state = existsSync(registryPath) ? read(registryPath) : { schema: 1, workers: {}, identities: {}, claims: {}, release: null };",
  "    assert.equal(state.schema, 1, \"Unknown coordination schema\");",
  "    const now = new Date().toISOString();",
  "    const identity = state.identities[request.worker];",
  "    const owned = () => assert.equal(identity?.session, request.session, \"This worker identity belongs to another session or is not registered\");",
  "    if (request.operation === \"configure\") {",
  "      assert.equal(request.worker, \"A1\", \"Only A1 establishes the shared setup\");",
  "      if (Object.keys(state.identities).length) owned();",
  "      assert.ok(!state.identities.A2, \"An existing A2 identity prevents setup replacement\");",
  "      const workers = {};",
  "      for (const id of [\"A1\", \"A2\"]) {",
  "        const entry = location(request.worktrees?.[id]);",
  "        assert.equal(entry.common, here.common, \"Workers must share this Git common directory\");",
  "        workers[id] = { worktree: entry.root };",
  "      }",
  "      assert.notEqual(workers.A1.worktree, workers.A2.worktree, \"Separate worktrees are required\");",
  "      assert.equal(here.root, workers.A1.worktree, \"Configure from the assigned A1 worktree\");",
  "      if (state.configuredAt) assert.deepEqual(workers, state.workers, \"Preserve established worker directories\");",
  "      assert.match(request.base ?? \"\", /^[a-f0-9]{40}$/);",
  "      git(cwd, \"cat-file\", \"-e\", request.base + \"^{commit}\");",
  "      state.workers = workers;",
  "      state.base = request.base;",
  "      state.configuredAt = now;",
  "    } else {",
  "      if (request.operation === \"register\" && !state.workers[request.worker]) {",
  "        assert.ok(state.configuredAt, \"Configure the shared registry before registering another worker\");",
  "        assert.ok(!identity && !state.claims[request.worker], \"Preserve existing ownership\");",
  "        assert.ok(!Object.values(state.workers).some(worker => worker.worktree === here.root), \"This worktree is already assigned to another worker\");",
  "        state.workers[request.worker] = { worktree: here.root };",
  "      }",
  "      assert.equal(state.workers[request.worker]?.worktree, here.root, \"Use only your assigned worktree\");",
  "      if (request.worker !== \"A1\") {",
  "        const branch = git(cwd, \"branch\", \"--show-current\");",
  "        assert.ok(branch && branch !== \"main\", \"Additional workers require a feature branch, not main or a detached checkout\");",
  "      }",
  "      if (request.operation === \"register\") {",
  "        if (identity) owned();",
  "        assert.ok(!Object.entries(state.identities).some(([worker, owner]) => worker !== request.worker && owner.session === request.session), \"This session already owns another worker identity\");",
  "        state.identities[request.worker] = identity ?? { session: request.session, registeredAt: now };",
  "        if (request.label !== undefined) {",
  "          assert.equal(typeof request.label, \"string\");",
  "          assert.ok(request.label.trim().length > 0 && request.label.length <= 200 && !/[\\r\\n\\u0000-\\u001f\\u007f]/.test(request.label), \"Use a short, single-line chat label\");",
  "          state.identities[request.worker].label = request.label.trim();",
  "        }",
  "      } else {",
  "        owned();",
  "        if (request.operation === \"claim\") {",
  "          assert.equal(typeof request.task, \"string\");",
  "          assert.ok(request.task.trim().length > 0 && request.task.length <= 200);",
  "          assert.ok(Array.isArray(request.resources) && request.resources.length > 0 && request.resources.length <= 100);",
  "          const prior = state.claims[request.worker];",
  "          const ids = taskIds(request.taskIds === undefined ? prior?.taskIds : request.taskIds);",
  "          const resources = [...new Set([...request.resources, ...ids.map(id => \"contract:task-\" + id)].map(resource))];",
  "          assert.ok(resources.length <= 100, \"Use at most 100 resources, including task ID reservations\");",
  "          assert.ok(!prior || prior.task === request.task, \"Finish the current task claim before choosing another task\");",
  "          for (const [worker, claim] of Object.entries(state.claims)) {",
  "            if (worker === request.worker) continue;",
  "            assert.notEqual(claim.task, request.task, \"Another worker already owns this task\");",
  "            assert.ok(!ids.some(id => (claim.taskIds ?? []).includes(id)), \"Another worker already owns this exact task ID\");",
  "            assert.ok(!resources.some(a => claim.resources.some(b => overlaps(a, b))), \"Resource overlaps another worker's current claim\");",
  "          }",
  "          state.claims[request.worker] = { id: randomUUID(), session: request.session, task: request.task, taskIds: ids, resources, at: now };",
  "        } else if (request.operation === \"finish\") {",
  "          assert.notEqual(state.release?.session, request.session, \"Release closeout must finish before clearing the feature claim\");",
  "          delete state.claims[request.worker];",
  "        } else if (request.operation === \"release-acquire\") {",
  "          assert.equal(request.worker, \"A1\", \"Only A1 may hold the integration/release lock\");",
  "          assert.ok(state.claims.A1, \"Claim release work before acquiring the release lock\");",
  "          assert.ok(!state.release || state.release.session === request.session, \"Another session owns the release lock\");",
  "          state.release ??= { worker: \"A1\", session: request.session, task: state.claims.A1.task, acquiredAt: now };",
  "        } else if (request.operation === \"release-release\") {",
  "          assert.equal(request.worker, \"A1\");",
  "          assert.equal(state.release?.session, request.session, \"No release lock is owned by this session\");",
  "          state.release = null;",
  "        } else if (request.operation === \"checkpoint\") {",
  "          assert.equal(typeof request.status, \"string\");",
  "          assert.ok(request.status.length > 0 && request.status.length <= 200);",
  "          assert.ok(typeof (request.handoff ?? \"\") === \"string\" && (request.handoff ?? \"\").length <= 20000);",
  "          mkdirSync(join(directory, \"workers\"), { recursive: true, mode: 0o700 });",
  "          atomic(join(directory, \"workers\", request.worker + \".json\"), {",
  "            worker: request.worker, session: request.session, updatedAt: now,",
  "            worktree: here.root, branch: git(cwd, \"branch\", \"--show-current\"), commit: git(cwd, \"rev-parse\", \"HEAD\"),",
  "            task: state.claims[request.worker]?.task ?? null, resources: state.claims[request.worker]?.resources ?? [],",
  "            taskIds: state.claims[request.worker]?.taskIds ?? [], claimedAt: state.claims[request.worker]?.at ?? null,",
  "            claimId: state.claims[request.worker]?.id ?? null,",
  "            status: request.status, handoff: request.handoff ?? \"\"",
  "          });",
  "        } else if (request.operation === \"unregister\") {",
  "          assert.ok(!state.claims[request.worker] && state.release?.session !== request.session, \"Finish claims and release work before unregistering\");",
  "          delete state.identities[request.worker];",
  "        } else throw new Error(\"Unknown coordination operation\");",
  "      }",
  "    }",
  "    if (state.identities[request.worker]) state.identities[request.worker].updatedAt = now;",
  "    state.updatedAt = now;",
  "    atomic(registryPath, state);",
  "    return { directory, operation: request.operation, worker: request.worker, identity: state.identities[request.worker] ?? null,",
  "      claim: state.claims[request.worker] ?? null, release: state.release };",
  "  } finally {",
  "    if (existsSync(join(mutex, \"owner.json\")) && read(join(mutex, \"owner.json\")).token === token) rmSync(mutex, { recursive: true });",
  "  }",
  "}",
  "",
  "if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {",
  "  try {",
  "    assert.equal(process.argv.length, 3, \"Pass one private JSON request file; run from the assigned worktree\");",
  "    console.log(JSON.stringify(workerCommand(read(resolve(process.argv[2]))), null, 2));",
  "  } catch (error) { console.error(error.message); process.exitCode = 1; }",
  "}",
  "",
].join("\n");
