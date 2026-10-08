import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const workflow = readFileSync(
  new URL("../.github/workflows/source-security.yml", import.meta.url),
  "utf8",
);
// Inspect this workflow's step blocks without adding a YAML/runtime dependency.
// These are source-contract tests, not a substitute for a hosted Actions run.
const steps = workflow.split(/^      - /m).slice(1);
const named = (name) => {
  const found = steps.filter((step) => step.startsWith(`name: ${name}\n`));
  assert.equal(found.length, 1, `Expected one step: ${name}`);
  return found[0];
};
const condition = (step) => step.match(/^        if: (.+)$/m)?.[1];
const after = (id) =>
  `\${{ !cancelled() && steps.${id}.outcome == 'success' }}`;

// GitHub supplies an implicit success() unless a status function is present.
// The explicit cancelled() predicate lets independent checks continue after a
// failed gate, while requiring their own actual prerequisite to have succeeded.
test("independent checks are not skipped after an advisory or unrelated gate failure", () => {
  for (const name of [
    "Verify source boundaries and the migration guard",
    "Validate authored website copy",
    "Generate the schema client without connecting to a database",
    "Check known dependency advisories",
    "Verify registry signatures and provenance",
    "Run the existing static analysis",
  ]) {
    assert.equal(condition(named(name)), after("install"), name);
  }
});

test("failed or skipped prerequisites and cancellation cannot run dependent checks", () => {
  assert.match(
    named("Install the locked graph without dependency lifecycle scripts"),
    /^        id: install$/m,
  );
  assert.match(
    named("Generate the schema client without connecting to a database"),
    /^        id: generate$/m,
  );
  assert.equal(
    condition(named("Check project types without build artifacts")),
    after("generate"),
  );
  assert.equal(
    condition(named("Install the checksum-pinned secret scanner")),
    after("checkout"),
  );
  assert.equal(
    condition(named("Scan reachable history with fully redacted output")),
    after("scanner"),
  );
  assert.match(
    named("Install the checksum-pinned secret scanner"),
    /^        id: scanner$/m,
  );
  assert.equal(
    steps.filter((step) => step.startsWith("id: checkout\n")).length,
    1,
  );
  assert.doesNotMatch(workflow, /always\(\)/);
});

test("audit and other failures remain job failures, never tolerated successes", () => {
  assert.match(
    named("Check known dependency advisories"),
    /^        run: npm audit --audit-level=high$/m,
  );
  assert.match(
    named("Verify registry signatures and provenance"),
    /^        run: npm audit signatures$/m,
  );
  assert.match(
    named("Run the existing static analysis"),
    /^        run: npm run lint$/m,
  );
  assert.doesNotMatch(
    workflow,
    /continue-on-error|\|\|\s*(?:true|:|exit\s+0)|set\s+\+e|--omit(?:=|\s+)dev|--audit-level=(?:critical|none)/,
  );
  assert.match(workflow, /^    timeout-minutes: 15$/m);
});

test("post-failure checks retain read-only untrusted-change and lock-install boundaries", () => {
  assert.match(workflow, /^permissions:\n  contents: read\n/m);
  assert.doesNotMatch(
    workflow,
    /pull_request_target|secrets\.|secrets\[|write-all|contents: write/,
  );
  assert.match(workflow, /^          persist-credentials: false$/m);
  assert.match(workflow, /^          fetch-depth: 0$/m);
  assert.match(
    named("Install the locked graph without dependency lifecycle scripts"),
    /^        run: npm ci --ignore-scripts --no-audit --no-fund$/m,
  );
  assert.equal(
    condition(
      named("Install the locked graph without dependency lifecycle scripts"),
    ),
    undefined,
  );
  for (const action of workflow.matchAll(/uses: (\S+)/g)) {
    assert.match(action[1], /@[a-f0-9]{40}$/);
  }
});

test("history scan still requires a checksum-verified scanner and redacts findings", () => {
  const install = named("Install the checksum-pinned secret scanner");
  assert.match(install, /set -euo pipefail/);
  assert.match(install, /[a-f0-9]{64}  \$scanner_dir\/gitleaks\.tar\.gz/);
  assert.ok(
    install.indexOf("sha256sum --check --status") < install.indexOf("tar -xzf"),
  );
  const scan = named("Scan reachable history with fully redacted output");
  assert.match(scan, /--log-opts="--all --full-history -m"/);
  assert.match(scan, /--ignore-gitleaks-allow --max-decode-depth=5/);
  assert.match(scan, /--redact=100/);
});

for (const scenario of [
  "absent",
  "empty-file",
  "populated-file",
  "directory",
  "symlink",
  "dangling-symlink",
  "inspection-error",
]) {
  test(`history step rejects implicit suppressions before scanning: ${scenario}`, (t) => {
    const root = mkdtempSync(join(tmpdir(), "gc-history-ignore-"));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const cwd = join(root, "checkout");
    const runtime = join(root, "runtime");
    const bin = join(root, "bin");
    mkdirSync(cwd);
    mkdirSync(bin);
    mkdirSync(join(runtime, "gitleaks-8.30.1"), { recursive: true });
    const marker = join(root, "scanner-called");
    writeFileSync(
      join(runtime, "gitleaks-8.30.1/gitleaks"),
      '#!/bin/sh\nprintf "called\\n" > "$SCAN_MARKER"\n',
      { mode: 0o755 },
    );
    const ignored = join(cwd, ".gitleaksignore");
    if (scenario === "empty-file") writeFileSync(ignored, "");
    if (scenario === "populated-file")
      writeFileSync(ignored, "fictional-fingerprint\n");
    if (scenario === "directory") mkdirSync(ignored);
    if (scenario === "symlink") {
      writeFileSync(join(root, "target"), "fictional-fingerprint\n");
      symlinkSync(join(root, "target"), ignored);
    }
    if (scenario === "dangling-symlink")
      symlinkSync(join(root, "absent"), ignored);
    if (scenario === "inspection-error") {
      // Exercise the actual step's failure branch without changing real file
      // permissions or depending on whether the test runner has root access.
      writeFileSync(
        join(bin, "find"),
        '#!/bin/sh\nprintf "fictional-private-inspection-error\\n" >&2\nexit 1\n',
        { mode: 0o755 },
      );
    }
    const step = named("Scan reachable history with fully redacted output");
    const body = step.split("        run: |\n")[1];
    assert.ok(body, "Execute the actual workflow shell, not a copied guard");
    const result = spawnSync(
      "bash",
      [
        "--noprofile",
        "--norc",
        "-e",
        "-o",
        "pipefail",
        "-c",
        body.replace(/^          /gm, ""),
      ],
      {
        cwd,
        encoding: "utf8",
        timeout: 2000,
        env: {
          ...process.env,
          PATH: `${bin}:${process.env.PATH}`,
          RUNNER_TEMP: runtime,
          SCAN_MARKER: marker,
        },
      },
    );
    assert.equal(result.signal, null, result.error?.message);
    assert.equal(result.stdout, "");
    if (scenario === "absent") {
      assert.equal(result.status, 0, result.stderr);
      assert.equal(existsSync(marker), true);
      assert.equal(result.stderr, "");
    } else {
      assert.equal(result.status, 1);
      assert.equal(
        existsSync(marker),
        false,
        "Scanner must never run after rejected inspection",
      );
      assert.equal(
        result.stderr.trim(),
        scenario === "inspection-error"
          ? "Cannot inspect repository fingerprint ignore path."
          : "Repository fingerprint ignore path is not permitted.",
      );
    }
  });
}
