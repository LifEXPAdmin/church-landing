import { spawn, spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  writeFileSync,
  readdirSync,
  existsSync
} from "node:fs";
import { resolve, join } from "node:path";
import { createServer } from "node:net";
import { randomBytes } from "node:crypto";

const root = process.cwd();
const pg = process.env.TEST_PG_BIN ?? "/opt/homebrew/opt/postgresql@16/bin";
if (!existsSync(join(pg, "initdb")))
  throw new Error(
    "Install local PostgreSQL or set TEST_PG_BIN to its bin directory. No external database is used."
  );
mkdirSync(".account-test", { recursive: true, mode: 0o700 });
const dir = mkdtempSync(resolve(".account-test/run-"));
async function freePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}
const port = await freePort();
const appPort = await freePort();
const database = `postgresql://fixture@127.0.0.1:${port}/godschurches_security_test`;
const env = {
  ...process.env,
  NODE_ENV: "test",
  VERCEL: "",
  DATABASE_URL: database,
  DIRECT_URL: database,
  ACCOUNT_ORIGIN: `http://127.0.0.1:${appPort}`,
  NEXT_PUBLIC_SITE_URL: `http://127.0.0.1:${appPort}`,
  ACCOUNT_TEST_ISOLATED: "1",
  ACCOUNT_TEST_SINK_DIR: join(dir, "sink"),
  ACCOUNT_DELIVERY_MODE: "test-sink",
  AUTH_RATE_LIMIT_SECRET: randomBytes(32).toString("hex"),
  MAILERLITE_API_KEY: "",
  RESEND_API_KEY: ""
};
const log = join(dir, "setup.log");
function run(cmd, args, overrides = {}) {
  const r = spawnSync(cmd, args, {
    cwd: root,
    env,
    encoding: "utf8",
    ...overrides
  });
  if (r.status !== 0) {
    // Only generated synthetic state is used here; keep verbose tooling output local.
    writeFileSync(log, `${r.stdout ?? ""}\n${r.stderr ?? ""}`, { mode: 0o600 });
    throw new Error(`Local check failed: ${cmd}. Details in ${log}`);
  }
  return r.stdout;
}
let server;
let databaseStarted = false;
try {
  run(join(pg, "initdb"), [
    "-D",
    join(dir, "pg"),
    "-A",
    "trust",
    "-U",
    "fixture",
    "--no-locale"
  ]);
  run(join(pg, "pg_ctl"), [
    "-D",
    join(dir, "pg"),
    "-l",
    join(dir, "pg.log"),
    "-o",
    `-h 127.0.0.1 -p ${port} -c unix_socket_directories=''`,
    "-w",
    "start"
  ]);
  databaseStarted = true;
  run(join(pg, "createdb"), [
    "-h",
    "127.0.0.1",
    "-p",
    String(port),
    "-U",
    "fixture",
    "godschurches_security_test"
  ]);
  const psql = (args) =>
    run(join(pg, "psql"), [database, "-v", "ON_ERROR_STOP=1", ...args]);
  // Upgrade rehearsal: previous SQL state with synthetic legacy/password accounts and relationships.
  const migrations = readdirSync("prisma/migrations")
    .filter((n) => n.startsWith("20"))
    .sort();
  for (const name of migrations.filter((n) => !n.startsWith("202609")))
    psql(["-f", `prisma/migrations/${name}/migration.sql`]);
  run(process.execPath, [
    "--import",
    "./tests/register.mjs",
    "tests/seed-upgrade.ts"
  ]);
  psql(["-f", `prisma/migrations/${migrations.at(-1)}/migration.sql`]);
  console.log("Synthetic prior-schema upgrade applied.");
  run(
    process.execPath,
    [
      "--import",
      "./tests/register.mjs",
      "--test",
      "tests/account-security.test.ts"
    ],
    { stdio: "inherit" }
  );
  run(join(pg, "pg_dump"), [
    database,
    "-Fc",
    "-f",
    join(dir, "synthetic.dump")
  ]);
  run(join(pg, "createdb"), [
    "-h",
    "127.0.0.1",
    "-p",
    String(port),
    "-U",
    "fixture",
    "godschurches_security_test_restore"
  ]);
  const restoreUrl = database + "_restore";
  run(join(pg, "pg_restore"), [
    "-d",
    restoreUrl,
    "--exit-on-error",
    join(dir, "synthetic.dump")
  ]);
  for (const table of [
    "PlatformUser",
    "PlatformSession",
    "PlatformAccountGrant",
    "PlatformPost",
    "PlatformPostComment",
    "PlatformPostLike",
    "PlatformFollow"
  ]) {
    const query = `SELECT md5(COALESCE(json_agg(t ORDER BY t.id)::text, '[]')) FROM "${table}" t`;
    const before = run(join(pg, "psql"), [database, "-Atc", query]);
    const restored = run(join(pg, "psql"), [restoreUrl, "-Atc", query]);
    if (before !== restored)
      throw new Error(`Synthetic restore mismatch: ${table}`);
  }
  console.log("Synthetic backup and restore completed.");
  // A third fresh DB proves the actual Prisma migration deployment path.
  run(join(pg, "createdb"), [
    "-h",
    "127.0.0.1",
    "-p",
    String(port),
    "-U",
    "fixture",
    "godschurches_security_fresh"
  ]);
  const freshUrl = database.replace(
    "godschurches_security_test",
    "godschurches_security_fresh"
  );
  run("npm", ["run", "prisma:deploy"], {
    env: { ...env, DATABASE_URL: freshUrl, DIRECT_URL: freshUrl }
  });
  console.log("Fresh Prisma migration setup passed.");
  // Production-mode compile verifies the sink cannot run there; runtime sink uses development.
  run("npm", ["run", "build"], {
    env: { ...env, NODE_ENV: "production", ACCOUNT_DELIVERY_MODE: "disabled" }
  });
  console.log("Production build passed.");
  server = spawn(
    process.execPath,
    [
      "node_modules/next/dist/bin/next",
      "dev",
      "--hostname",
      "127.0.0.1",
      "--port",
      String(appPort)
    ],
    { env: { ...env, NODE_ENV: "development" }, stdio: "ignore" }
  );
  let ready = false;
  for (let i = 0; i < 80; i++) {
    try {
      const r = await fetch(`${env.ACCOUNT_ORIGIN}/api/health`);
      if (r.ok) {
        ready = true;
        break;
      }
    } catch {
      /* starting */
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  if (!ready) throw new Error("Isolated Next server did not start");
  run(
    process.execPath,
    [
      "--import",
      "./tests/register.mjs",
      "--test",
      "tests/account-http.test.ts"
    ],
    { stdio: "inherit" }
  );
  writeFileSync(
    join(dir, "RESULT.txt"),
    "PASS: synthetic upgrade, account services, restore, fresh migrations, build and HTTP checks. No production data or external email used.\n"
  );
  console.log(`Account checks passed. Synthetic artifacts: ${dir}`);
  if (process.argv.includes("--preview")) {
    console.log(
      `Local synthetic preview: ${env.ACCOUNT_ORIGIN}/platform/login`
    );
    console.log(
      "Create a fictional account in this preview. Recovery messages stay in the local sink folder. Stop with Ctrl+C."
    );
    await new Promise((resolve) => {
      process.once("SIGINT", resolve);
      process.once("SIGTERM", resolve);
    });
  }
} finally {
  server?.kill("SIGTERM");
  if (databaseStarted)
    run(join(pg, "pg_ctl"), [
      "-D",
      join(dir, "pg"),
      "-m",
      "fast",
      "-w",
      "stop"
    ]);
}
