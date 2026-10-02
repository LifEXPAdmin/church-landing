import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
  readdirSync
} from "node:fs";
import { createServer } from "node:net";
import { createServer as createHttpsServer, get as httpsGet } from "node:https";
import { request as httpRequest } from "node:http";
import { join, resolve } from "node:path";

// This runner deliberately cannot start large artifacts on a local workstation.
assert.equal(
  process.env.GITHUB_ACTIONS,
  "true",
  "Run in the isolated hosted workflow"
);
assert.ok(process.env.RUNNER_TEMP && process.env.TEST_PG_BIN);
assert.ok(
  !readdirSync(".").some(
    (name) => /^\.env(?:\.|$)/.test(name) && name !== ".env.example"
  ),
  "Do not load workstation or production environments"
);
const pg = process.env.TEST_PG_BIN;
const root = process.cwd();
mkdirSync(".account-test", { recursive: true, mode: 0o700 });
const fixture = mkdtempSync(resolve(".account-test/artist-hosted-"));
const cluster = mkdtempSync(join(process.env.RUNNER_TEMP, "artist-postgres-"));
const freePort = async () => {
  const listener = createServer();
  await new Promise((done, reject) => {
    listener.once("error", reject);
    listener.listen(0, "127.0.0.1", done);
  });
  const port = listener.address().port;
  await new Promise((done) => listener.close(done));
  return port;
};
const databasePort = await freePort(),
  appPort = await freePort(),
  tlsPort = await freePort();
assert.equal(new Set([databasePort, appPort, tlsPort]).size, 3);
const origin = `https://127.0.0.1:${tlsPort}`;
const database = `postgresql://fixture@127.0.0.1:${databasePort}/godschurches_security_test`;
const cert = join(fixture, "localhost-cert.pem"),
  key = join(fixture, "localhost-key.pem");
const env = {
  PATH: process.env.PATH,
  HOME: process.env.HOME,
  TMPDIR: process.env.RUNNER_TEMP,
  CI: "1",
  NEXT_TELEMETRY_DISABLED: "1",
  NODE_ENV: "test",
  DATABASE_URL: database,
  DIRECT_URL: database,
  TEST_PG_BIN: pg,
  ACCOUNT_ORIGIN: origin,
  NEXT_PUBLIC_SITE_URL: origin,
  ACCOUNT_TEST_ISOLATED: "1",
  ACCOUNT_DELIVERY_MODE: "test-sink",
  ACCOUNT_TEST_SINK_DIR: join(fixture, "sink"),
  MEDIA_STORAGE_MODE: "local-test",
  MEDIA_TEST_DIR: join(fixture, "images"),
  RETENTION_TEST_DIR: join(fixture, "retention"),
  AUTH_RATE_LIMIT_SECRET: randomBytes(32).toString("hex"),
  PRIVILEGED_MFA_MODE: "off",
  SOCIAL_EMAIL_ENABLED: "false",
  COMMUNITY_REPORTS_ENABLED: "true",
  ACCOUNT_GOOGLE_ENABLED: "false",
  CHURCH_CLAIM_REVIEW_ENABLED: "true",
  CHURCH_CLAIM_POLICY_VERSION: "manual-review-v1",
  SUPPORT_INTAKE_ENABLED: "false",
  PLAYWRIGHT_MODULE: process.env.PLAYWRIGHT_MODULE,
  ARTIST_BUNDLED_CHROMIUM: "1",
  NODE_EXTRA_CA_CERTS: cert
};
let server,
  proxy,
  databaseStarted = false;
const sockets = new Set(),
  requests = new Set();
function sync(command, args, childEnv = env) {
  const result = spawnSync(command, args, {
    cwd: root,
    env: childEnv,
    stdio: "inherit"
  });
  assert.equal(result.status, 0, `${command} ${args[0]} failed`);
}
async function run(command, args, childEnv = env) {
  const child = spawn(command, args, {
    cwd: root,
    env: childEnv,
    stdio: "inherit"
  });
  await new Promise((done, reject) => {
    child.once("error", reject);
    child.once("exit", (code) =>
      code === 0
        ? done()
        : reject(new Error(`${args.join(" ")} exited ${code}`))
    );
  });
}
async function stop(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  await new Promise((done) => {
    const timer = setTimeout(() => child.kill("SIGKILL"), 5000);
    child.once("exit", () => {
      clearTimeout(timer);
      done();
    });
    child.kill("SIGTERM");
  });
}
const health = () =>
  new Promise((done) => {
    const request = httpsGet(
      origin + "/api/health",
      { ca: readFileSync(cert), timeout: 3000 },
      (response) => {
        response.resume();
        done(response.statusCode === 200);
      }
    );
    request.once("error", () => done(false));
    request.once("timeout", () => {
      request.destroy();
      done(false);
    });
  });
async function start(mode) {
  server = spawn(
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
        ACCOUNT_DELIVERY_MODE: "disabled",
        PRIVILEGED_MFA_MODE: mode
      },
      stdio: "inherit"
    }
  );
  for (let i = 0; i < 120; i++) {
    if (await health()) return;
    if (server.exitCode !== null || server.signalCode !== null)
      throw new Error("Production-mode server exited");
    await new Promise((done) => setTimeout(done, 500));
  }
  throw new Error("Production-mode server did not become healthy");
}
try {
  const config = join(fixture, "localhost-cert.cnf");
  writeFileSync(
    config,
    "[req]\nprompt=no\ndistinguished_name=dn\nx509_extensions=local_tls\n[dn]\nCN=localhost\n[local_tls]\nsubjectAltName=IP:127.0.0.1,DNS:localhost\nbasicConstraints=critical,CA:TRUE\nkeyUsage=critical,digitalSignature,keyEncipherment,keyCertSign\nextendedKeyUsage=serverAuth\n",
    { mode: 0o600 }
  );
  sync("openssl", [
    "req",
    "-x509",
    "-newkey",
    "rsa:2048",
    "-sha256",
    "-nodes",
    "-days",
    "2",
    "-config",
    config,
    "-keyout",
    key,
    "-out",
    cert
  ]);
  sync(join(pg, "initdb"), [
    "-D",
    cluster,
    "-A",
    "trust",
    "-U",
    "fixture",
    "--no-locale",
    "--encoding=UTF8"
  ]);
  sync(join(pg, "pg_ctl"), [
    "-D",
    cluster,
    "-l",
    join(fixture, "postgres.log"),
    "-o",
    `-h 127.0.0.1 -p ${databasePort} -c unix_socket_directories=''`,
    "-w",
    "start"
  ]);
  databaseStarted = true;
  sync(join(pg, "createdb"), [
    "-h",
    "127.0.0.1",
    "-p",
    String(databasePort),
    "-U",
    "fixture",
    "godschurches_security_test"
  ]);
  sync("npm", ["run", "prisma:deploy"]);
  writeFileSync(join(fixture, "environment.json"), JSON.stringify(env), {
    mode: 0o600
  });
  await run(process.execPath, [
    "--import",
    "./tests/register.mjs",
    "--test",
    "--test-concurrency=1",
    "tests/artist-input.test.ts",
    "tests/artists.test.ts",
    "tests/artist-recovery.test.ts"
  ]);
  await run("npm", ["run", "build"], {
    ...env,
    NODE_ENV: "production",
    ACCOUNT_DELIVERY_MODE: "disabled"
  });
  console.log(
    "Artist production build ID:",
    readFileSync(".next/BUILD_ID", "utf8").trim()
  );
  proxy = createHttpsServer(
    { key: readFileSync(key), cert: readFileSync(cert) },
    (request, response) => {
      if (!request.url?.startsWith("/") || request.url.startsWith("//")) {
        response.writeHead(400);
        response.end();
        return;
      }
      const headers = {
        ...request.headers,
        host: new URL(origin).host,
        "x-forwarded-host": new URL(origin).host,
        "x-forwarded-proto": "https",
        "x-forwarded-for": "127.0.0.1"
      };
      delete headers.forwarded;
      const upstream = httpRequest(
        {
          hostname: "127.0.0.1",
          port: appPort,
          path: request.url,
          method: request.method,
          headers,
          agent: false
        },
        (result) => {
          response.writeHead(result.statusCode ?? 502, result.headers);
          result.once("error", () => response.destroy());
          result.pipe(response);
        }
      );
      requests.add(upstream);
      upstream.once("close", () => requests.delete(upstream));
      upstream.once("error", () => {
        if (response.destroyed) return;
        if (response.headersSent) response.destroy();
        else {
          response.writeHead(502);
          response.end();
        }
      });
      upstream.setTimeout(30000, () => upstream.destroy());
      request.once("aborted", () => upstream.destroy());
      response.once("close", () => upstream.destroy());
      request.pipe(upstream);
    }
  );
  proxy.on("connection", (socket) => {
    sockets.add(socket);
    socket.once("close", () => sockets.delete(socket));
  });
  await new Promise((done, reject) => {
    proxy.once("error", reject);
    proxy.listen(tlsPort, "127.0.0.1", done);
  });
  await start("off");
  await run(process.execPath, [
    "--import",
    "./tests/register.mjs",
    "scripts/qa-artists-browser.mjs",
    fixture
  ]);
  await run(process.execPath, [
    "--import",
    "./tests/register.mjs",
    "scripts/qa-artist-draft-privacy-browser.mjs",
    fixture
  ]);
  await stop(server);
  await start("enforce");
  await run(
    process.execPath,
    [
      "--import",
      "./tests/register.mjs",
      "--test",
      "tests/artists-http.test.ts"
    ],
    { ...env, PRIVILEGED_MFA_MODE: "enforce", ARTIST_HTTP_MFA_ENFORCED: "1" }
  );
  sync("git", ["diff", "--exit-code"]);
  console.log(
    "PASS: fictional artist service/restore, production build, browser and enforced-MFA HTTPS checks. No production connection or delivery credentials."
  );
} finally {
  await stop(server);
  for (const request of requests) request.destroy();
  for (const socket of sockets) socket.destroy();
  if (proxy?.listening) await new Promise((done) => proxy.close(done));
  if (databaseStarted)
    sync(join(pg, "pg_ctl"), ["-D", cluster, "-m", "fast", "-w", "stop"]);
}
