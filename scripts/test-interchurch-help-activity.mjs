import assert from "node:assert/strict";
import { mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";

// Consume only the parent's explicitly supplied, already migrated fictional DB.
// This runner never starts/stops a service or changes migrations or build output.
const [fixtureArg, ...flags] = process.argv.slice(2);
assert.ok(
  fixtureArg,
  "Pass the owned fixture directory [--baseline] [--regression]."
);
assert.ok(flags.every((flag) => ["--baseline", "--regression"].includes(flag)));
assert.equal(new Set(flags).size, flags.length);
assert.ok(!(flags.includes("--baseline") && flags.includes("--regression")));
const root = realpathSync(process.cwd()),
  fixture = realpathSync(resolve(fixtureArg));
assert.ok(fixture.startsWith(realpathSync(join(root, ".account-test")) + "/"));
const supplied = JSON.parse(
  readFileSync(join(fixture, "test-env.json"), "utf8")
);
assert.equal(supplied.ACCOUNT_TEST_ISOLATED, "1");
assert.equal(supplied.ACCOUNT_DELIVERY_MODE, "test-sink");
assert.equal(supplied.VERCEL || "", "");
assert.notEqual(supplied.NODE_ENV, "production");
const database = new URL(supplied.DATABASE_URL),
  origin = new URL(supplied.ACCOUNT_ORIGIN);
assert.equal(database.hostname, "127.0.0.1");
assert.equal(database.pathname, "/godschurches_security_test");
assert.equal(supplied.DIRECT_URL, supplied.DATABASE_URL);
assert.equal(origin.hostname, "127.0.0.1");
const env = {
  ...process.env,
  ...supplied,
  NODE_ENV: "test",
  VERCEL: "",
  VERCEL_ENV: "",
  ACCOUNT_TEST_ISOLATED: "1",
  ACCOUNT_DELIVERY_MODE: "test-sink",
  PRIVILEGED_MFA_MODE: "off",
  COMMUNITY_REPORTS_ENABLED: "true",
  SOCIAL_EMAIL_ENABLED: "false",
  PUSH_ENABLED: "false",
  RESEND_API_KEY: "",
  MAILERLITE_API_KEY: "",
  ACCOUNT_EMAIL_FROM: "",
  ACCOUNT_GOOGLE_ENABLED: "false",
  GOOGLE_CLIENT_ID: "",
  GOOGLE_CLIENT_SECRET: "",
  BLOB_READ_WRITE_TOKEN: "",
  BLOB_STORE_ID: "",
  FOUNDER_WELCOME_ENABLED: "false",
  FOUNDER_ANNOUNCEMENTS_ENABLED: "false"
};
const files = ["tests/interchurch-help-activity.test.ts"];
if (flags.includes("--regression"))
  files.push(
    "tests/activity.test.ts",
    "tests/notification-center.test.ts"
  );
const output = join(fixture, "interchurch-activity-" + Date.now());
mkdirSync(output, { recursive: true, mode: 0o700 });
const sha = (path) =>
  createHash("sha256").update(readFileSync(path)).digest("hex");
const result = {
  head: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
  activitySha256: sha("lib/platform/activity.ts"),
  runnerSha256: sha(new URL(import.meta.url)),
  testSha256: sha(files[0]),
  flags,
  files: [],
  passed: false
};
const save = () =>
  writeFileSync(join(output, "result.json"), JSON.stringify(result, null, 2), {
    mode: 0o600
  });
save();
for (const file of files) {
  const args = [
    "--import",
    "./tests/register.mjs",
    "--test",
    ...(flags.includes("--baseline")
      ? ["--test-name-pattern=canonical interchurch updates"]
      : []),
    file
  ];
  const run = spawnSync(process.execPath, args, {
    cwd: root,
    env,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
    timeout: 180000
  });
  const log = file.replaceAll("/", "_") + ".log";
  writeFileSync(join(output, log), `${run.stdout ?? ""}\n${run.stderr ?? ""}`, {
    mode: 0o600
  });
  result.files.push({
    file,
    exitCode: run.status,
    signal: run.signal,
    error: run.error?.message ?? null,
    log
  });
  save();
  console.log(`${run.status === 0 ? "PASS" : "FAIL"}: ${file}`);
  if (run.status !== 0) {
    console.error(`Preserved evidence: ${join(output, log)}`);
    process.exit(1);
  }
}
result.passed = true;
save();
console.log(`Focused Activity acceptance passed. Private evidence: ${output}`);
