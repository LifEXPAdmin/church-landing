import assert from "node:assert/strict";
import { readFileSync, realpathSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

// Consume an explicitly supplied, already migrated fictional fixture. This
// runner does not own a shared harness, database lifetime, migration or app build.
const [fixtureArg, ...flags] = process.argv.slice(2);
assert.ok(fixtureArg, "Usage: node scripts/test-interchurch-help-schedule.mjs <fixture-directory> [--http] [--regression]");
assert.ok(flags.every(flag => ["--http", "--regression"].includes(flag)), "Unsupported runner option");
assert.equal(new Set(flags).size, flags.length, "Do not repeat options");
const root = realpathSync(process.cwd()), fixture = realpathSync(resolve(fixtureArg));
const fixtureRoot = realpathSync(join(root, ".account-test"));
assert.ok(fixture.startsWith(fixtureRoot + "/"), "Use this checkout's explicitly owned fixture directory");
const supplied = JSON.parse(readFileSync(join(fixture, "test-env.json"), "utf8"));
assert.equal(supplied.ACCOUNT_TEST_ISOLATED, "1");
assert.equal(supplied.ACCOUNT_DELIVERY_MODE, "test-sink");
assert.equal(supplied.VERCEL || "", "");
assert.notEqual(supplied.NODE_ENV, "production");
const database = new URL(supplied.DATABASE_URL);
assert.equal(database.hostname, "127.0.0.1");
assert.equal(database.pathname, "/godschurches_security_test");
assert.equal(supplied.DIRECT_URL, supplied.DATABASE_URL);
assert.notEqual(process.env.NODE_TLS_REJECT_UNAUTHORIZED, "0");
const env = { ...process.env, ...supplied,
  NODE_ENV: "test", VERCEL: "", VERCEL_ENV: "", ACCOUNT_TEST_ISOLATED: "1",
  ACCOUNT_DELIVERY_MODE: "test-sink", PRIVILEGED_MFA_MODE: "off", SOCIAL_EMAIL_ENABLED: "false",
  PUSH_ENABLED: "false", RESEND_API_KEY: "", MAILERLITE_API_KEY: "", ACCOUNT_EMAIL_FROM: "",
  ACCOUNT_GOOGLE_ENABLED: "false", GOOGLE_CLIENT_ID: "", GOOGLE_CLIENT_SECRET: "",
  BLOB_READ_WRITE_TOKEN: "", BLOB_STORE_ID: "", FOUNDER_WELCOME_ENABLED: "false",
  FOUNDER_ANNOUNCEMENTS_ENABLED: "false"
};
const origin = new URL(env.ACCOUNT_ORIGIN);
assert.ok(["https:", "http:"].includes(origin.protocol) && origin.hostname === "127.0.0.1");
let buildId = null;
if (flags.includes("--http")) {
  const browser = JSON.parse(readFileSync(join(fixture, "browser-env.json"), "utf8"));
  assert.equal(browser.database, supplied.DATABASE_URL, "HTTP app and service tests must use the same fixture database");
  assert.match(browser.origin, /^https:\/\/127\.0\.0\.1:\d+$/);
  assert.ok(realpathSync(browser.certificate).startsWith(fixture + "/"));
  env.ACCOUNT_ORIGIN = env.NEXT_PUBLIC_SITE_URL = browser.origin;
  env.NODE_EXTRA_CA_CERTS = browser.certificate;
  assert.ok(existsSync(join(root, ".next/BUILD_ID")), "HTTP checks require this checkout's completed production build");
  buildId = readFileSync(join(root, ".next/BUILD_ID"), "utf8").trim();
  assert.match(buildId, /^[A-Za-z0-9_-]+$/);
  // Verification runs in a new Node process so its custom CA is effective before
  // TLS initializes. A running unrelated build cannot satisfy the asset identity.
  const probe = spawnSync(process.execPath, ["--input-type=module", "-e",
    `import assert from 'node:assert/strict'; const r = await fetch(process.env.ACCOUNT_ORIGIN + '/_next/static/' + ${JSON.stringify(buildId)} + '/_buildManifest.js', {redirect:'manual'}); assert.equal(r.status,200); assert.match(await r.text(), /__BUILD_MANIFEST/);`
  ], { cwd: root, env, encoding: "utf8" });
  assert.equal(probe.status, 0, "Serving HTTPS build identity check failed: " + (probe.stderr || ""));
}
const output = join(fixture, "interchurch-schedule-" + Date.now());
mkdirSync(output, { recursive: true, mode: 0o700 });
const files = ["tests/interchurch-help-schedule.test.ts"];
if (flags.includes("--regression")) files.push(
  "tests/interchurch-help.test.ts", "tests/calendars.test.ts", "tests/post-participation.test.ts",
  "tests/volunteer-shift.test.ts", "tests/volunteer-applications.test.ts"
);
if (flags.includes("--http")) files.push("tests/interchurch-help-schedule-http.test.ts", "tests/interchurch-help-http.test.ts");
const result = { buildId, files: [], passed: false };
writeFileSync(join(output, "result.json"), JSON.stringify(result, null, 2), { mode: 0o600 });
for (const file of files) {
  const run = spawnSync(process.execPath, ["--import", "./tests/register.mjs", "--test", file],
    { cwd: root, env, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
  const log = file.replaceAll("/", "_") + ".log";
  writeFileSync(join(output, log), `${run.stdout ?? ""}\n${run.stderr ?? ""}`, { mode: 0o600 });
  result.files.push({ file, exitCode: run.status, signal: run.signal, log });
  writeFileSync(join(output, "result.json"), JSON.stringify(result, null, 2), { mode: 0o600 });
  console.log(`${run.status === 0 ? "PASS" : "FAIL"}: ${file}`);
  if (run.status !== 0) {
    console.error(`Preserved failure evidence: ${join(output, log)}`);
    process.exit(1);
  }
}
result.passed = true;
writeFileSync(join(output, "result.json"), JSON.stringify(result, null, 2), { mode: 0o600 });
console.log(`Focused fictional acceptance passed. Private evidence: ${output}`);
