import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  symlinkSync
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  releaseChecks,
  verifyReleaseEvidence
} from "../scripts/verify-release-evidence.mjs";

function fixture(t) {
  const cwd = mkdtempSync(join(tmpdir(), "gc-release-evidence-"));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const git = (...args) =>
    execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    }).trim();
  git("init", "-q");
  git("config", "user.name", "Fictional test");
  git("config", "user.email", "fixture@example.test");
  writeFileSync(join(cwd, ".gitignore"), ".account-test/\n");
  writeFileSync(join(cwd, "source.txt"), "candidate\n");
  git("add", ".");
  git("-c", "commit.gpgsign=false", "commit", "-qm", "fixture");
  const candidate = git("rev-parse", "HEAD");
  const directory = join(cwd, ".account-test");
  mkdirSync(directory);
  const checks = releaseChecks.map((kind) => {
    const log = `Fictional ${kind} passing receipt\n`;
    writeFileSync(join(directory, `${kind}.log`), log);
    return {
      kind,
      sourceSha: candidate,
      status: "passed",
      exitCode: 0,
      command: `fictional-${kind}`,
      startedAt: "2026-10-02T10:00:00.000Z",
      finishedAt: "2026-10-02T10:01:00.000Z",
      environment: "isolated-fictional",
      passed: 1,
      failed: 0,
      buildId: "fictional-build",
      artifacts: [
        {
          path: `${kind}.log`,
          sha256: createHash("sha256").update(log).digest("hex")
        }
      ]
    };
  });
  const receipt = { schema: 1, sourceSha: candidate, checks };
  const receiptPath = join(directory, "receipt.json");
  const save = () => writeFileSync(receiptPath, JSON.stringify(receipt));
  const options = {
    cwd,
    candidate,
    receiptPath,
    now: Date.parse("2026-10-02T12:00:00.000Z")
  };
  const verify = () => {
    save();
    return verifyReleaseEvidence(options);
  };
  return { cwd, directory, git, receipt, checks, options, save, verify };
}

test("complete exact-source evidence validates and emits only a bounded summary", async (t) => {
  const f = fixture(t);
  assert.deepEqual(await f.verify(), {
    sourceSha: f.options.candidate,
    checks: releaseChecks,
    artifacts: 5,
    verifiedAt: "2026-10-02T12:00:00.000Z"
  });
});

for (const [name, change, code] of [
  [
    "short candidate",
    (f) => {
      f.options.candidate = "abcdef";
    },
    "CANDIDATE_SHA"
  ],
  [
    "wrong HEAD",
    (f) => {
      f.options.candidate = "a".repeat(40);
    },
    "CANDIDATE_HEAD"
  ],
  [
    "stale receipt",
    (f) => {
      f.receipt.sourceSha = "a".repeat(40);
    },
    "RECEIPT_SOURCE"
  ],
  [
    "stale check",
    (f) => {
      f.checks[1].sourceSha = "a".repeat(40);
    },
    "CHECK_SOURCE"
  ],
  [
    "missing browser check",
    (f) => {
      f.checks.pop();
    },
    "CHECK_COVERAGE"
  ],
  [
    "duplicate category",
    (f) => {
      f.checks[4].kind = "static";
    },
    "CHECK_COVERAGE"
  ],
  [
    "failed check",
    (f) => {
      f.checks[0].exitCode = 1;
    },
    "CHECK_RESULT"
  ],
  [
    "skipped check",
    (f) => {
      f.checks[0].status = "skipped";
    },
    "CHECK_RESULT"
  ],
  [
    "all-skipped service suite",
    (f) => {
      f.checks[1].passed = 0;
    },
    "CHECK_COUNTS"
  ],
  [
    "hidden failed test",
    (f) => {
      f.checks[1].failed = 1;
    },
    "CHECK_COUNTS"
  ],
  [
    "production fixture",
    (f) => {
      f.checks[2].environment = "production";
    },
    "CHECK_ENVIRONMENT"
  ],
  [
    "missing command",
    (f) => {
      f.checks[0].command = "";
    },
    "CHECK_COMMAND"
  ],
  [
    "future evidence",
    (f) => {
      f.checks[0].finishedAt = "2026-10-03T12:00:00.000Z";
    },
    "CHECK_TIME"
  ],
  [
    "reversed time",
    (f) => {
      f.checks[0].finishedAt = "2026-10-01T12:00:00.000Z";
    },
    "CHECK_TIME"
  ],
  [
    "invalid date",
    (f) => {
      f.checks[0].finishedAt = "not-a-date";
    },
    "EVIDENCE_TIME"
  ],
  [
    "missing build identity",
    (f) => {
      delete f.checks[3].buildId;
    },
    "BUILD_ID"
  ],
  [
    "missing log",
    (f) => {
      f.checks[0].artifacts = [];
    },
    "CHECK_ARTIFACTS"
  ],
  [
    "changed log",
    (f) => {
      writeFileSync(join(f.directory, "static.log"), "changed\n");
    },
    "ARTIFACT_HASH"
  ],
  [
    "empty log",
    (f) => {
      writeFileSync(join(f.directory, "static.log"), "");
    },
    "ARTIFACT_FILE"
  ],
  [
    "absolute log path",
    (f) => {
      f.checks[0].artifacts[0].path = join(f.directory, "static.log");
    },
    "ARTIFACT_RECORD"
  ],
  [
    "path traversal",
    (f) => {
      f.checks[0].artifacts[0].path = "../source.txt";
    },
    "ARTIFACT_SCOPE"
  ],
  [
    "escaping symlink",
    (f) => {
      symlinkSync(join(f.cwd, "source.txt"), join(f.directory, "escape.log"));
      f.checks[0].artifacts[0].path = "escape.log";
    },
    "ARTIFACT_SCOPE"
  ],
  [
    "dirty tracked source",
    (f) => {
      writeFileSync(join(f.cwd, "source.txt"), "changed\n");
    },
    "CANDIDATE_DIRTY"
  ],
  [
    "staged source",
    (f) => {
      writeFileSync(join(f.cwd, "source.txt"), "changed\n");
      f.git("add", "source.txt");
    },
    "CANDIDATE_DIRTY"
  ],
  [
    "untracked source",
    (f) => {
      writeFileSync(join(f.cwd, "new-source.ts"), "export {};\n");
    },
    "CANDIDATE_DIRTY"
  ]
]) {
  test(`rejects ${name}`, async (t) => {
    const f = fixture(t);
    change(f);
    await assert.rejects(f.verify, (error) => error.message === code);
  });
}

test("CLI fails closed without exposing malformed private receipt contents", (t) => {
  const f = fixture(t);
  const secret = "fictional-private-evidence-do-not-print";
  writeFileSync(f.options.receiptPath, secret);
  const result = spawnSync(
    process.execPath,
    [
      new URL("../scripts/verify-release-evidence.mjs", import.meta.url)
        .pathname,
      "--candidate",
      f.options.candidate,
      "--receipt",
      f.options.receiptPath
    ],
    { cwd: f.cwd, encoding: "utf8" }
  );
  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.equal(
    result.stderr.trim(),
    "Release evidence rejected: EVIDENCE_UNREADABLE"
  );
  assert.ok(!result.stderr.includes(secret));
});
