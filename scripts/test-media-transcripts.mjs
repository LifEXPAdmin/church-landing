import assert from "node:assert/strict";
import { mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";

// Consume an explicitly supplied, already migrated fictional fixture; start no service.
const [fixtureArg, ...flags] = process.argv.slice(2);
assert.ok(fixtureArg, "Pass the owned fixture directory [--http].");
assert.ok(flags.length === 0 || (flags.length === 1 && flags[0] === "--http"));
const root = realpathSync(process.cwd()), fixture = realpathSync(resolve(fixtureArg));
assert.ok(fixture.startsWith(realpathSync(join(root, ".account-test")) + "/"));
const supplied = JSON.parse(readFileSync(join(fixture, "test-env.json"), "utf8"));
assert.equal(supplied.ACCOUNT_TEST_ISOLATED, "1");
assert.equal(supplied.ACCOUNT_DELIVERY_MODE, "test-sink");
assert.equal(supplied.VERCEL || "", "");
assert.notEqual(supplied.NODE_ENV, "production");
const database = new URL(supplied.DATABASE_URL);
assert.equal(database.hostname, "127.0.0.1");
assert.equal(database.pathname, "/godschurches_security_test");
assert.equal(supplied.DIRECT_URL, supplied.DATABASE_URL);
const env = { ...process.env, ...supplied, NODE_ENV: "test", VERCEL: "", VERCEL_ENV: "", ACCOUNT_TEST_ISOLATED: "1", ACCOUNT_DELIVERY_MODE: "test-sink", PRIVILEGED_MFA_MODE: "off", COMMUNITY_REPORTS_ENABLED: "true", SOCIAL_EMAIL_ENABLED: "false", PUSH_ENABLED: "false", RESEND_API_KEY: "", MAILERLITE_API_KEY: "", ACCOUNT_EMAIL_FROM: "", ACCOUNT_GOOGLE_ENABLED: "false", GOOGLE_CLIENT_ID: "", GOOGLE_CLIENT_SECRET: "", BLOB_READ_WRITE_TOKEN: "", BLOB_STORE_ID: "", FOUNDER_WELCOME_ENABLED: "false", FOUNDER_ANNOUNCEMENTS_ENABLED: "false" };
const http = flags.includes("--http");
if (http) {
  const config = JSON.parse(readFileSync(join(fixture, "browser-env.json"), "utf8"));
  assert.equal(config.database, supplied.DATABASE_URL);
  assert.match(config.origin, /^https:\/\/127\.0\.0\.1:\d+$/);
  assert.ok(realpathSync(config.certificate).startsWith(fixture + "/"));
  assert.notEqual(process.env.NODE_TLS_REJECT_UNAUTHORIZED, "0");
  env.ACCOUNT_ORIGIN = config.origin;
  env.NEXT_PUBLIC_SITE_URL = config.origin;
  env.NODE_EXTRA_CA_CERTS = config.certificate;
  const built = JSON.parse(readFileSync(join(fixture, "transcripts-build-receipt.json"), "utf8"));
  const runtime = JSON.parse(readFileSync(join(fixture, "runtime.json"), "utf8"));
  assert.equal(readFileSync(join(root, ".next/BUILD_ID"), "utf8").trim(), built.buildId);
  assert.equal(runtime.buildId, built.buildId);
  assert.equal(runtime.origin, config.origin);
  assert.equal(runtime.source, root);
  for (const [path, expected] of Object.entries(built.files))
    assert.equal(createHash("sha256").update(readFileSync(join(root, path))).digest("hex"), expected, `Source changed after build: ${path}`);
}
const files = http ? ["tests/media-transcripts-http.test.ts"] : ["tests/media-transcripts.test.ts", "tests/media-transcripts-retention.test.ts"];
const output = join(fixture, `media-transcripts-${http ? "http" : "service"}-${Date.now()}`);
mkdirSync(output, { recursive: true, mode: 0o700 });
const digest = path => createHash("sha256").update(readFileSync(path)).digest("hex");
const sources = ["lib/platform/media-transcript.ts", "lib/platform/media-catalog-input.ts", "lib/platform/media-catalog-commands.ts", "lib/platform/media-catalog-reads.ts", "lib/platform/media-catalog-retention.ts", "lib/platform/social-boundary.ts", "lib/platform/social-operations.ts", "prisma/schema.prisma", "prisma/migrations/20261007234500_media_transcripts/migration.sql", ...files];
const result = { head: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(), startedAt: new Date().toISOString(), runnerSha256: digest(new URL(import.meta.url)), sourceHashes: Object.fromEntries(sources.map(path => [path, digest(path)])), files: [], passed: false };
const save = () => writeFileSync(join(output, "result.json"), JSON.stringify(result, null, 2) + "\n", { mode: 0o600 });
save();
for (const file of files) {
  const run = spawnSync(process.execPath, ["--import", "./tests/register.mjs", "--test", file], { cwd: root, env, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, timeout: 240000 });
  const log = file.replaceAll("/", "_") + ".log";
  writeFileSync(join(output, log), `${run.stdout ?? ""}\n${run.stderr ?? ""}`, { mode: 0o600 });
  result.files.push({ file, sha256: digest(file), exitCode: run.status, signal: run.signal, error: run.error?.message ?? null, log });
  save();
  console.log(`${run.status === 0 ? "PASS" : "FAIL"}: ${file}`);
  if (run.status !== 0) { console.error(`Preserved evidence: ${join(output, log)}`); process.exit(1); }
}
assert.deepEqual(Object.fromEntries(sources.map(path => [path, digest(path)])), result.sourceHashes, "Frozen sources changed during acceptance");
result.passed = true;
result.completedAt = new Date().toISOString();
save();
console.log(`Focused transcript acceptance passed. Private evidence: ${output}`);
