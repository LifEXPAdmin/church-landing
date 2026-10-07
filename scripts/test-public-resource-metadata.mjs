import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  writeFileSync
} from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

// Follow the existing account harness isolation contract without running its
// unrelated account migration, browser and provider suites for this read change.
const args = process.argv.slice(2);
const preview = args.includes("--preview");
if (args.some((arg) => arg !== "--preview"))
  throw new Error("The only supported option is --preview.");
const pg = process.env.TEST_PG_BIN ?? "/opt/homebrew/opt/postgresql@16/bin";
if (!existsSync(join(pg, "initdb")))
  throw new Error(
    "Install local PostgreSQL or set TEST_PG_BIN. No external database is used."
  );
mkdirSync(".account-test", { recursive: true, mode: 0o700 });
const dir = mkdtempSync(resolve(".account-test/public-resource-"));
const clusterRoot = mkdtempSync(join(tmpdir(), "godschurches-security-"));
const databaseDirectory = join(clusterRoot, "pg");
const socket = createServer();
await new Promise((resolve, reject) => {
  socket.once("error", reject);
  socket.listen(0, "127.0.0.1", resolve);
});
const port = socket.address().port;
await new Promise((resolve) => socket.close(resolve));
const database = `postgresql://fixture@127.0.0.1:${port}/godschurches_security_test`;
const fixtureEnv = {
  DATABASE_URL: database,
  DIRECT_URL: database,
  NODE_ENV: "test",
  VERCEL: "",
  VERCEL_ENV: "",
  ACCOUNT_TEST_ISOLATED: "1",
  ACCOUNT_DELIVERY_MODE: "test-sink",
  ACCOUNT_TEST_SINK_DIR: join(dir, "sink"),
  ACCOUNT_ORIGIN: "https://127.0.0.1:9443",
  NEXT_PUBLIC_SITE_URL: "https://127.0.0.1:9443",
  AUTH_RATE_LIMIT_SECRET: randomBytes(32).toString("hex"),
  MAILERLITE_API_KEY: "",
  RESEND_API_KEY: "",
  ACCOUNT_EMAIL_FROM: "",
  ACCOUNT_GOOGLE_ENABLED: "false",
  GOOGLE_CLIENT_ID: "",
  GOOGLE_CLIENT_SECRET: "",
  SOCIAL_EMAIL_ENABLED: "false",
  PUSH_ENABLED: "false",
  PUSH_VAPID_PUBLIC_KEY: "",
  PUSH_VAPID_PRIVATE_KEY: "",
  PUSH_VAPID_SUBJECT: "",
  PRIVILEGED_MFA_MODE: "off",
  BLOB_READ_WRITE_TOKEN: "",
  BLOB_STORE_ID: "",
  MEDIA_STORAGE_MODE: "local-test",
  MEDIA_TEST_DIR: join(dir, "images"),
  RETENTION_TEST_DIR: join(dir, "retention"),
  CHURCH_CLAIM_REVIEW_ENABLED: "true",
  CHURCH_CLAIM_POLICY_VERSION: "manual-review-v1",
  SUPPORT_INTAKE_ENABLED: "false"
};
const env = { ...process.env, ...fixtureEnv };
writeFileSync(join(dir, "test-env.json"), JSON.stringify(fixtureEnv), {
  mode: 0o600
});
writeFileSync(
  join(dir, "cluster.json"),
  JSON.stringify({ databaseDirectory, runnerPid: process.pid }),
  {
    mode: 0o600
  }
);
let commandNumber = 0;
function run(command, args) {
  const result = spawnSync(command, args, {
    env,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024
  });
  const log = join(
    dir,
    `command-${String(++commandNumber).padStart(3, "0")}.log`
  );
  writeFileSync(log, `${result.stdout ?? ""}\n${result.stderr ?? ""}`, {
    mode: 0o600
  });
  if (result.status !== 0)
    throw new Error(`Isolated check failed. Details: ${log}`, {
      cause: result.error
    });
  return result.stdout;
}
let started = false;
try {
  run(join(pg, "initdb"), [
    "-D",
    databaseDirectory,
    "-A",
    "trust",
    "-U",
    "fixture",
    "--no-locale",
    "--encoding=UTF8"
  ]);
  run(join(pg, "pg_ctl"), [
    "-D",
    databaseDirectory,
    "-l",
    join(dir, "pg.log"),
    "-o",
    `-h 127.0.0.1 -p ${port} -c unix_socket_directories=''`,
    "-w",
    "start"
  ]);
  started = true;
  run(join(pg, "createdb"), [
    "-h",
    "127.0.0.1",
    "-p",
    String(port),
    "-U",
    "fixture",
    "godschurches_security_test"
  ]);
  const migrations = readdirSync("prisma/migrations")
    .filter((name) => /^\d/.test(name))
    .sort();
  for (const name of migrations)
    run(join(pg, "psql"), [
      database,
      "-v",
      "ON_ERROR_STOP=1",
      "-f",
      `prisma/migrations/${name}/migration.sql`
    ]);
  console.log(`PASS: ${migrations.length} fresh isolated migrations.`);
  for (const file of [
    "tests/public-resource-discovery.test.ts",
    "tests/public-discoverability.test.ts",
    "tests/gallery-sharing.test.ts",
    "tests/share-card-images.test.ts"
  ]) {
    run(join(pg, "psql"), [
      database,
      "-v",
      "ON_ERROR_STOP=1",
      "-c",
      'TRUNCATE "PlatformAuthLimit"'
    ]);
    console.log(
      run(process.execPath, [
        "--import",
        "./tests/register.mjs",
        "--test",
        file
      ])
    );
  }
  console.log(`PASS: public resource metadata services. Evidence: ${dir}`);
  if (preview) {
    console.log(
      `Fictional database remains available for local HTTP checks. Use ${join(dir, "test-env.json")}. No app server is started. Stop with Ctrl+C.`
    );
    await new Promise((resolve) => {
      const alive = setInterval(() => {}, 60000);
      const stop = () => {
        clearInterval(alive);
        resolve();
      };
      process.once("SIGINT", stop);
      process.once("SIGTERM", stop);
    });
  }
} finally {
  if (started)
    run(join(pg, "pg_ctl"), [
      "-D",
      databaseDirectory,
      "-m",
      "fast",
      "-w",
      "stop"
    ]);
}
