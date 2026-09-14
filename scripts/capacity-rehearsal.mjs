import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  writeFileSync,
  readFileSync,
  openSync,
  closeSync
} from "node:fs";
import { join, resolve } from "node:path";
import { createServer as netServer } from "node:net";
import { createServer as httpsServer } from "node:https";
import { request } from "node:http";
import { randomBytes, createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { sharedLink } from "./capacity-link.mjs";
import { pipeline } from "node:stream";

// Own the cluster and server: no target URL, existing database or credentials are
// accepted. Real account/provider secrets are deliberately not inherited.
const root = process.cwd();
const sourceHead = spawnSync("git", ["rev-parse", "HEAD"], {
  cwd: root,
  encoding: "utf8"
}).stdout.trim();
assert.match(sourceHead, /^[a-f0-9]{40}$/);
const pg = process.env.TEST_PG_BIN ?? "/opt/homebrew/opt/postgresql@17/bin";
const seconds = Number(process.argv[2] ?? 900);
assert.ok(Number.isInteger(seconds) && seconds >= 10 && seconds <= 1800);
const staircase = process.argv[3] === "--staircase";
assert.ok(process.argv.length <= 3 || (process.argv.length === 4 && staircase));
mkdirSync(".account-test", { recursive: true, mode: 0o700 });
const dir = mkdtempSync(resolve(".account-test/capacity-"));
// Large PostgreSQL/WAL files stay outside the application tracing root. Keep
// only small receipts and guarded image/journal fixtures inside the checkout.
const storageDir = mkdtempSync(join(tmpdir(), "godschurches-capacity-"));
const sourceFiles = spawnSync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
  { encoding: "utf8" }
)
  .stdout.split("\0")
  .filter((path) => /^(app|components|lib|prisma)\//.test(path))
  .sort();
const sourceDigest = createHash("sha256");
for (const path of sourceFiles)
  sourceDigest.update(path + "\0").update(readFileSync(path));
writeFileSync(
  join(dir, "source-receipt.json"),
  JSON.stringify({
    sourceHead,
    sourceSha256: sourceDigest.digest("hex"),
    files: sourceFiles.length,
    buildId: readFileSync(".next/BUILD_ID", "utf8").trim(),
    staircase,
    seconds,
    workingTreeDirty:
      spawnSync("git", ["status", "--porcelain"], { encoding: "utf8" }).stdout
        .length > 0
  }),
  { mode: 0o600 }
);
async function freePort() {
  const server = netServer();
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;
  await new Promise((r) => server.close(r));
  return port;
}
const dbPort = await freePort(),
  appPort = await freePort(),
  tlsPort = await freePort();
const database = `postgresql://fixture@127.0.0.1:${dbPort}/godschurches_security_test?connection_limit=20`;
const origin = `https://127.0.0.1:${tlsPort}`;
const certificate = join(dir, "localhost-cert.pem"),
  key = join(dir, "localhost-key.pem");
const env = {
  PATH: process.env.PATH,
  HOME: process.env.HOME,
  TMPDIR: process.env.TMPDIR,
  LANG: "en_US.UTF-8",
  TZ: "UTC",
  NODE_ENV: "test",
  VERCEL: "",
  VERCEL_GIT_COMMIT_SHA: sourceHead,
  DATABASE_URL: database,
  DIRECT_URL: database,
  ACCOUNT_ORIGIN: origin,
  NEXT_PUBLIC_SITE_URL: origin,
  ACCOUNT_TEST_ISOLATED: "1",
  ACCOUNT_TEST_SINK_DIR: join(dir, "sink"),
  ACCOUNT_DELIVERY_MODE: "test-sink",
  AUTH_RATE_LIMIT_SECRET: randomBytes(32).toString("hex"),
  CRON_SECRET: randomBytes(32).toString("hex"),
  MEDIA_STORAGE_MODE: "local-test",
  MEDIA_TEST_DIR: join(dir, "images"),
  RETENTION_TEST_DIR: join(dir, "retention"),
  BLOB_STORE_ID: "isolated-retention-fixture",
  BLOB_READ_WRITE_TOKEN: "",
  MAILERLITE_API_KEY: "",
  RESEND_API_KEY: "",
  ACCOUNT_EMAIL_FROM: "",
  ACCOUNT_GOOGLE_ENABLED: "false",
  GOOGLE_CLIENT_ID: "",
  GOOGLE_CLIENT_SECRET: "",
  VERCEL_OIDC_TOKEN: "",
  FOUNDER_ACCOUNT_ID: "",
  FOUNDER_WELCOME_ENABLED: "false",
  PUSH_ENABLED: "false",
  COMMUNITY_REPORTS_ENABLED: "false",
  RETENTION_CLEANUP_ENABLED: "false",
  ACCOUNT_DELETION_ENABLED: "false",
  CAPACITY_FIXTURE_DIR: dir,
  CAPACITY_STORAGE_DIR: storageDir,
  CAPACITY_STAIRCASE: staircase ? "1" : "0",
  PERSONAL_PHOTO_LIBRARY_ENABLED: staircase ? "true" : "false",
  NODE_EXTRA_CA_CERTS: certificate
};
writeFileSync(
  join(dir, "browser-env.json"),
  JSON.stringify({
    origin,
    database,
    certificate,
    databaseDirectory: join(storageDir, "pg"),
    storageDirectory: storageDir
  }),
  { mode: 0o600 }
);
function run(command, args, overrides = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    env,
    encoding: "utf8",
    ...overrides
  });
  if (result.status !== 0)
    throw Error(`${command} failed: ${result.stderr || result.stdout}`);
  return result.stdout;
}
function psql(sql) {
  return run(join(pg, "psql"), [
    database.split("?")[0],
    "-v",
    "ON_ERROR_STOP=1",
    "-At",
    "-c",
    sql
  ]);
}
let runningChild,
  interrupted = false;
async function child(args, logName, overrides = {}) {
  assert.equal(interrupted, false, "Capacity rehearsal interrupted");
  const log = openSync(join(dir, logName), "a", 0o600);
  const processChild = spawn(process.execPath, args, {
    cwd: root,
    env,
    stdio: ["ignore", log, log],
    ...overrides
  });
  runningChild = processChild;
  const code = await new Promise((r, reject) => {
    processChild.once("exit", r);
    processChild.once("error", reject);
  });
  closeSync(log);
  runningChild = undefined;
  assert.equal(code, 0, `Check ${logName}`);
}
let started = false,
  app,
  proxy;
const downstream = sharedLink(100),
  upstreamLink = sharedLink(20);
const interrupt = () => {
  interrupted = true;
  runningChild?.kill("SIGTERM");
  app?.kill("SIGTERM");
};
process.once("SIGINT", interrupt);
process.once("SIGTERM", interrupt);
try {
  console.log(`CAPACITY_FIXTURE ${dir}`);
  run(join(pg, "initdb"), [
    "-D",
    join(storageDir, "pg"),
    "-A",
    "trust",
    "-U",
    "fixture",
    "--no-locale",
    "--encoding=UTF8"
  ]);
  run(join(pg, "pg_ctl"), [
    "-D",
    join(storageDir, "pg"),
    "-l",
    join(dir, "pg.log"),
    "-o",
    `-h 127.0.0.1 -p ${dbPort} -c unix_socket_directories='' -c shared_preload_libraries=pg_stat_statements -c track_io_timing=on`,
    "-w",
    "start"
  ]);
  started = true;
  run(join(pg, "createdb"), [
    "-h",
    "127.0.0.1",
    "-p",
    String(dbPort),
    "-U",
    "fixture",
    "godschurches_security_test"
  ]);
  run(process.execPath, [
    "node_modules/prisma/build/index.js",
    "migrate",
    "deploy"
  ]);
  psql("CREATE EXTENSION pg_stat_statements");
  run("openssl", [
    "req",
    "-x509",
    "-newkey",
    "rsa:2048",
    "-sha256",
    "-nodes",
    "-days",
    "2",
    "-subj",
    "/CN=127.0.0.1",
    "-addext",
    "subjectAltName=IP:127.0.0.1",
    "-keyout",
    key,
    "-out",
    certificate
  ]);
  await child(
    ["--import", "./tests/register.mjs", "tests/seed-capacity.ts"],
    "seed.log"
  );
  psql("VACUUM ANALYZE");
  console.log("CAPACITY_SEEDED");
  const appLog = openSync(join(dir, "app.log"), "a", 0o600);
  app = spawn(
    process.execPath,
    [
      "node_modules/next/dist/bin/next",
      "start",
      "--hostname",
      "127.0.0.1",
      "--port",
      String(appPort)
    ],
    {
      cwd: root,
      env: {
        ...env,
        NODE_ENV: "production",
        ACCOUNT_DELIVERY_MODE: "disabled"
      },
      stdio: ["ignore", appLog, appLog]
    }
  );
  closeSync(appLog);
  writeFileSync(
    join(dir, "runtime.json"),
    JSON.stringify({ appPid: app.pid }),
    { mode: 0o600 }
  );
  proxy = httpsServer(
    { key: readFileSync(key), cert: readFileSync(certificate) },
    async (req, res) => {
      if (staircase) await new Promise((resolve) => setTimeout(resolve, 80));
      const headers = {
        ...req.headers,
        host: new URL(origin).host,
        "x-forwarded-host": new URL(origin).host,
        "x-forwarded-proto": "https",
        "x-forwarded-for": "127.0.0.1"
      };
      delete headers.forwarded;
      const upstream = request(
        {
          hostname: "127.0.0.1",
          port: appPort,
          path: req.url,
          method: req.method,
          headers
        },
        (r) => {
          res.writeHead(r.statusCode, r.headers);
          if (staircase) pipeline(r, downstream.stream(), res, () => {});
          else r.pipe(res);
        }
      );
      upstream.on("error", () => {
        if (!res.headersSent) res.writeHead(502);
        res.end();
      });
      if (staircase) pipeline(req, upstreamLink.stream(), upstream, () => {});
      else req.pipe(upstream);
    }
  );
  await new Promise((r) => proxy.listen(tlsPort, "127.0.0.1", r));
  await child(
    [
      "--import",
      "./tests/register.mjs",
      "scripts/capacity-workload.mjs",
      String(staircase ? 10 : seconds)
    ],
    "workload.log"
  );
  if (staircase)
    await child(
      [
        "--import",
        "./tests/register.mjs",
        "scripts/capacity-staircase.mjs",
        String(seconds)
      ],
      "staircase.log"
    );
  await child(
    ["--import", "./tests/register.mjs", "tests/capacity-query-plans.ts"],
    "query-plans.log"
  );
  await child(
    ["--import", "./tests/register.mjs", "tests/capacity-recovery.ts"],
    "recovery.log"
  );
  const result = JSON.parse(readFileSync(join(dir, "result.json"), "utf8"));
  assert.ok(
    result.checks.every((check) => check.pass),
    "Capacity integrity check failed; inspect result.json"
  );
  if (staircase) {
    const measured = JSON.parse(
      readFileSync(join(dir, "staircase.json"), "utf8")
    );
    measured.linkBytes = {
      download: downstream.bytes,
      upload: upstreamLink.bytes
    };
    writeFileSync(
      join(dir, "staircase.json"),
      JSON.stringify(measured, null, 2),
      { mode: 0o600 }
    );
    assert.ok(
      measured.integrity.every((check) => check.pass),
      "Staircase integrity check failed; inspect staircase.json"
    );
    console.log(`CAPACITY_STAIRCASE_FINISHED ${join(dir, "staircase.json")}`);
  }
  console.log(`CAPACITY_FINISHED ${join(dir, "result.json")}`);
} finally {
  process.removeListener("SIGINT", interrupt);
  process.removeListener("SIGTERM", interrupt);
  proxy?.closeAllConnections();
  proxy?.close();
  if (app && app.exitCode === null && app.signalCode === null) {
    app.kill("SIGTERM");
    await new Promise((r) => app.once("exit", r));
  }
  if (started)
    run(join(pg, "pg_ctl"), [
      "-D",
      join(storageDir, "pg"),
      "-m",
      "fast",
      "-w",
      "stop"
    ]);
}
