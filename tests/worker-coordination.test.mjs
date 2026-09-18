import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { workerCommand } from "../scripts/worker-coordination.mjs";
const commandPath = fileURLToPath(new URL("../scripts/worker-coordination.mjs", import.meta.url));
function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "gc-coordination-test-"));
  const main = join(directory, "main"), a1 = join(directory, "a1"), a2 = join(directory, "a2");
  mkdirSync(main);
  const git = (...args) => execFileSync("git", args, { cwd: main, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  git("init", "-b", "main"); writeFileSync(join(main, "README"), "fictional fixture\n");
  git("add", "README"); git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-m", "Fixture");
  git("worktree", "add", a1, "-b", "fixture-a1"); git("worktree", "add", a2, "-b", "fixture-a2");
  const base = git("rev-parse", "HEAD");
  workerCommand({ operation: "configure", worker: "A1", session: "session-a1", base, worktrees: { A1: a1, A2: a2 } }, a1);
  const run = (worker, operation, fields = {}) => workerCommand({ worker, operation, session: "session-" + worker.toLowerCase(), ...fields }, worker === "A1" ? a1 : a2);
  return { directory, main, a1, a2, run, cleanup: () => rmSync(directory, { recursive: true, force: true }) };
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
