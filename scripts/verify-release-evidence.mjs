import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, realpath, stat } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

export const releaseChecks = [
  "static",
  "services",
  "https",
  "build",
  "browser"
];
const sha = /^[a-f0-9]{40}$/;
const digest = /^[a-f0-9]{64}$/;
const timestamp = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;

function requireValue(condition, code) {
  assert.ok(condition, code);
}

function git(cwd, ...args) {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  }).trim();
}

function time(value) {
  requireValue(
    typeof value === "string" && timestamp.test(value),
    "EVIDENCE_TIME"
  );
  const parsed = Date.parse(value);
  requireValue(Number.isFinite(parsed), "EVIDENCE_TIME");
  // Date.parse normalizes impossible days and 24:00 into another date. Only
  // allow the two UTC spellings in the receipt contract to round-trip exactly.
  const canonical = value.length === 20 ? `${value.slice(0, -1)}.000Z` : value;
  requireValue(new Date(parsed).toISOString() === canonical, "EVIDENCE_TIME");
  return parsed;
}

/** Checks local receipt consistency; does not execute or attest the reported tests. */
export async function verifyReleaseEvidence({
  candidate,
  receiptPath,
  cwd = process.cwd(),
  now = Date.now()
}) {
  requireValue(
    typeof candidate === "string" && sha.test(candidate),
    "CANDIDATE_SHA"
  );
  requireValue(git(cwd, "rev-parse", "HEAD") === candidate, "CANDIDATE_HEAD");
  requireValue(
    git(cwd, "status", "--porcelain", "--untracked-files=all") === "",
    "CANDIDATE_DIRTY"
  );
  const receiptFile = await realpath(resolve(cwd, receiptPath));
  requireValue((await stat(receiptFile)).size <= 256 * 1024, "RECEIPT_SIZE");
  const receipt = JSON.parse(await readFile(receiptFile, "utf8"));
  requireValue(
    receipt?.schema === 1 && receipt.sourceSha === candidate,
    "RECEIPT_SOURCE"
  );
  requireValue(
    Array.isArray(receipt.checks) &&
      receipt.checks.length === releaseChecks.length,
    "CHECK_COVERAGE"
  );
  const root = dirname(receiptFile);
  const seen = new Set();
  let artifacts = 0;
  for (const check of receipt.checks) {
    requireValue(
      check && releaseChecks.includes(check.kind) && !seen.has(check.kind),
      "CHECK_COVERAGE"
    );
    seen.add(check.kind);
    requireValue(check.sourceSha === candidate, "CHECK_SOURCE");
    requireValue(
      check.status === "passed" && check.exitCode === 0,
      "CHECK_RESULT"
    );
    requireValue(
      typeof check.command === "string" && check.command.trim().length > 0,
      "CHECK_COMMAND"
    );
    const start = time(check.startedAt),
      end = time(check.finishedAt);
    requireValue(start <= end && end <= now, "CHECK_TIME");
    if (["services", "https", "browser"].includes(check.kind)) {
      requireValue(
        check.environment === "isolated-fictional",
        "CHECK_ENVIRONMENT"
      );
      requireValue(
        Number.isSafeInteger(check.passed) &&
          check.passed > 0 &&
          check.failed === 0,
        "CHECK_COUNTS"
      );
    }
    if (check.kind === "build") {
      requireValue(
        typeof check.buildId === "string" &&
          /^[A-Za-z0-9_-]{1,128}$/.test(check.buildId),
        "BUILD_ID"
      );
    }
    requireValue(
      Array.isArray(check.artifacts) &&
        check.artifacts.length > 0 &&
        check.artifacts.length <= 100,
      "CHECK_ARTIFACTS"
    );
    for (const artifact of check.artifacts) {
      requireValue(
        artifact &&
          typeof artifact.path === "string" &&
          !isAbsolute(artifact.path) &&
          digest.test(artifact.sha256),
        "ARTIFACT_RECORD"
      );
      const file = await realpath(resolve(root, artifact.path));
      const local = relative(root, file);
      requireValue(
        local &&
          local !== ".." &&
          !local.startsWith(".." + sep) &&
          !isAbsolute(local),
        "ARTIFACT_SCOPE"
      );
      const info = await stat(file);
      requireValue(info.isFile() && info.size > 0, "ARTIFACT_FILE");
      const hash = createHash("sha256");
      for await (const chunk of createReadStream(file)) hash.update(chunk);
      requireValue(hash.digest("hex") === artifact.sha256, "ARTIFACT_HASH");
      artifacts++;
    }
  }
  // Recheck the checkout after reading evidence, before returning a usable receipt.
  requireValue(git(cwd, "rev-parse", "HEAD") === candidate, "CANDIDATE_HEAD");
  requireValue(
    git(cwd, "status", "--porcelain", "--untracked-files=all") === "",
    "CANDIDATE_DIRTY"
  );
  return {
    sourceSha: candidate,
    checks: [...seen],
    artifacts,
    verifiedAt: new Date(now).toISOString()
  };
}

export async function runReleaseEvidence(args, options = {}) {
  try {
    requireValue(
      args.length === 4 && args[0] === "--candidate" && args[2] === "--receipt",
      "USAGE"
    );
    const result = await verifyReleaseEvidence({
      ...options,
      candidate: args[1],
      receiptPath: args[3]
    });
    console.log(JSON.stringify(result));
    return 0;
  } catch (error) {
    // Never print receipt fields, log contents, connection strings or file errors.
    const code =
      error instanceof assert.AssertionError && /^[A-Z_]+$/.test(error.message)
        ? error.message
        : "EVIDENCE_UNREADABLE";
    console.error(`Release evidence rejected: ${code}`);
    return 1;
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  process.exitCode = await runReleaseEvidence(process.argv.slice(2));
}
