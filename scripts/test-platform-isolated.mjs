import assert from "node:assert/strict";
import { spawn, spawnSync, execFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  copyFileSync,
  constants
} from "node:fs";
import { createServer } from "node:net";
import { createServer as createHttpsServer, get as httpsGet } from "node:https";
import { request as httpRequest } from "node:http";
import { join, relative, resolve } from "node:path";

const suite = process.argv[2] ?? "artists";
assert.ok(
  [
    "artists",
    "discovery",
    "resources",
    "exchange-plans",
    "exchange-services",
    "exchange",
    "exchange-bootstrap",
    "exchange-defaults",
    "exchange-inquiry-list",
    "exchange-inquiry-composer",
    "exchange-privacy",
    "exchange-handoff-detail",
    "exchange-saved-list",
    "exchange-handoff-saved",
    "exchange-saved-search",
    "exchange-favorite",
    "exchange-search-favorite"
  ].includes(suite),
  "Choose a declared isolated suite"
);
// Keep historical profiles and their exact suites available. The privacy profile
// covers the shared reader; handoff/saved covers the retained command owners.
const privacyProfiles = {
  "exchange-saved-search": {
    services: ["exchange-input", "exchange-listings"],
    browsers: [
      "qa-exchange-saved-search-privacy-browser",
      "qa-exchange-search-browser",
      "qa-exchange-saved-list-privacy-browser"
    ],
    https: [
      "exchange-saved-search-http",
      "exchange-saved-list-http",
      "exchange-http"
    ]
  },
  "exchange-favorite": {
    services: ["exchange-input", "exchange-listings"],
    browsers: [
      "qa-exchange-favorite-privacy-browser",
      "qa-exchange-search-browser",
      "qa-exchange-saved-search-privacy-browser",
      "qa-exchange-saved-list-privacy-browser"
    ],
    https: [
      "exchange-favorite-http",
      "exchange-saved-search-http",
      "exchange-saved-list-http",
      "exchange-http"
    ]
  },
  "exchange-search-favorite": {
    services: [
      "exchange-input",
      "exchange-listings",
      "exchange-handoff-input",
      "exchange-handoffs"
    ],
    browsers: [
      "qa-exchange-favorite-privacy-browser",
      "qa-exchange-saved-search-privacy-browser",
      "qa-exchange-saved-list-privacy-browser",
      "qa-exchange-handoff-detail-privacy-browser",
      "qa-exchange-search-browser",
      "qa-exchange-inquiry-composer-privacy-browser",
      "qa-exchange-defaults-privacy-browser",
      "qa-exchange-handoff-browser",
      "qa-exchange-inquiry-list-privacy-browser",
      "qa-topic-catalogue-privacy-browser",
      "qa-support-index-browser",
      "qa-notification-integration-browser"
    ],
    https: [
      "exchange-favorite-http",
      "exchange-saved-search-http",
      "exchange-saved-list-http",
      "exchange-handoff-detail-http",
      "exchange-inquiry-composer-http",
      "exchange-inquiry-list-http",
      "exchange-defaults-http",
      "exchange-http"
    ]
  },
  "exchange-handoff-detail": {
    services: ["exchange-handoff-input", "exchange-handoffs"],
    browsers: [
      "qa-exchange-handoff-detail-privacy-browser",
      "qa-exchange-inquiry-composer-privacy-browser",
      "qa-exchange-defaults-privacy-browser",
      "qa-exchange-handoff-browser"
    ],
    https: [
      "exchange-handoff-detail-http",
      "exchange-inquiry-composer-http",
      "exchange-inquiry-list-http",
      "exchange-defaults-http",
      "exchange-http"
    ]
  },
  "exchange-saved-list": {
    services: [
      "exchange-input",
      "exchange-listings",
      "exchange-handoff-input",
      "exchange-handoffs"
    ],
    browsers: [
      "qa-exchange-saved-list-privacy-browser",
      "qa-exchange-search-browser",
      "qa-exchange-handoff-detail-privacy-browser"
    ],
    https: [
      "exchange-saved-list-http",
      "exchange-http",
      "exchange-handoff-detail-http"
    ]
  },
  "exchange-handoff-saved": {
    services: [
      "exchange-input",
      "exchange-listings",
      "exchange-handoff-input",
      "exchange-handoffs"
    ],
    browsers: [
      "qa-exchange-saved-list-privacy-browser",
      "qa-exchange-handoff-detail-privacy-browser",
      "qa-exchange-search-browser",
      "qa-exchange-inquiry-composer-privacy-browser",
      "qa-exchange-defaults-privacy-browser",
      "qa-exchange-handoff-browser"
    ],
    https: [
      "exchange-saved-list-http",
      "exchange-handoff-detail-http",
      "exchange-inquiry-composer-http",
      "exchange-inquiry-list-http",
      "exchange-defaults-http",
      "exchange-http"
    ]
  },
  "exchange-defaults": {
    services: ["exchange-handoff-input", "exchange-handoffs"],
    browsers: [
      "qa-exchange-defaults-privacy-browser",
      "qa-exchange-handoff-browser"
    ],
    https: ["exchange-defaults-http", "exchange-http"]
  },
  "exchange-inquiry-list": {
    services: ["exchange-handoff-input", "exchange-handoffs"],
    browsers: [
      "qa-exchange-inquiry-list-privacy-browser",
      "qa-exchange-handoff-browser"
    ],
    https: [
      "exchange-inquiry-list-http",
      "exchange-defaults-http",
      "exchange-http"
    ]
  },
  "exchange-inquiry-composer": {
    services: ["exchange-handoff-input", "exchange-handoffs"],
    browsers: [
      "qa-exchange-inquiry-composer-privacy-browser",
      "qa-exchange-defaults-privacy-browser",
      "qa-exchange-handoff-browser"
    ],
    https: [
      "exchange-inquiry-composer-http",
      "exchange-inquiry-list-http",
      "exchange-defaults-http",
      "exchange-http"
    ]
  },
  "exchange-privacy": {
    services: ["exchange-handoff-input", "exchange-handoffs"],
    browsers: [
      "qa-exchange-inquiry-list-privacy-browser",
      "qa-exchange-inquiry-composer-privacy-browser",
      "qa-exchange-defaults-privacy-browser",
      "qa-exchange-handoff-browser",
      "qa-topic-catalogue-privacy-browser",
      "qa-support-index-browser",
      "qa-notification-integration-browser"
    ],
    https: [
      "exchange-inquiry-composer-http",
      "exchange-inquiry-list-http",
      "exchange-defaults-http",
      "exchange-http"
    ]
  }
};
const profile =
  privacyProfiles[suite] ??
  (suite === "artists"
      ? {
          services: ["artist-input", "artists", "artist-recovery"],
          browsers: ["qa-artist-draft-privacy-browser", "qa-artists-browser"],
          https: ["artists-http"]
        }
      : suite === "discovery"
        ? {
            services: [
              "discovery-options",
              "discovery-feeds",
              "discovery-device",
              "four-feeds"
            ],
            browsers: [
              "qa-discovery-browser",
              "qa-four-feeds-browser",
              "qa-navigation-journey-browser"
            ],
            https: ["discovery-http", "four-feeds-http"]
          }
        : ["exchange-services", "exchange", "exchange-bootstrap"].includes(suite)
          ? {
              services: [
                "exchange-input",
                "exchange-listings",
                "exchange-needs",
                "interchurch-help",
                "interchurch-help-compatibility",
                ...(suite === "exchange-bootstrap"
                  ? [
                      "pantry-support",
                      "exchange-handoff-input",
                      "exchange-handoffs"
                    ]
                  : [])
              ],
              browsers: [
                "qa-exchange-browser",
                "qa-exchange-search-browser",
                ...(suite === "exchange-bootstrap"
                  ? ["qa-exchange-handoff-browser", "qa-pantry-browser"]
                  : [])
              ],
              https: ["exchange-http"]
            }
          : { services: [], browsers: [], https: [] });
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
const source = execFileSync("git", ["rev-parse", "HEAD"], {
  encoding: "utf8"
}).trim();
assert.match(source, /^[a-f0-9]{40}$/);
assert.equal(
  source,
  process.env.GITHUB_SHA,
  "Verify the exact workflow source"
);
mkdirSync(".account-test", { recursive: true, mode: 0o700 });
const fixture = mkdtempSync(
  resolve(`.account-test/${suite === "artists" ? "artist" : suite}-hosted-`)
);
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
  GITHUB_ACTIONS: process.env.GITHUB_ACTIONS,
  FEED_SNAPSHOT_MEASUREMENT: suite === "discovery" ? "1" : "0",
  NEXT_TELEMETRY_DISABLED: "1",
  VERCEL_GIT_COMMIT_SHA: source,
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
  CHROMIUM_PATH: process.env.CHROMIUM_PATH,
  ARTIST_BUNDLED_CHROMIUM: "1",
  NODE_EXTRA_CA_CERTS: cert
};
if (["resources", "exchange-plans"].includes(suite))
  Object.assign(env, {
    CAPACITY_FIXTURE_DIR: fixture,
    CAPACITY_STAIRCASE: "1",
    PERSONAL_PHOTO_LIBRARY_ENABLED: "true"
  });
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
    if (await health()) {
      const identity = await new Promise((done, reject) => {
        const request = httpsGet(
          origin + "/api/platform/release",
          { ca: readFileSync(cert), timeout: 3000 },
          (response) => {
            let body = "";
            response.setEncoding("utf8");
            response.on("data", (chunk) => {
              body += chunk;
            });
            response.once("error", reject);
            response.once("end", () => {
              try {
                assert.equal(response.statusCode, 200);
                done(JSON.parse(body));
              } catch (error) {
                reject(error);
              }
            });
          }
        );
        request.once("error", reject);
        request.once("timeout", () =>
          request.destroy(new Error("Serving identity timed out"))
        );
      });
      assert.equal(identity.release, source);
      console.log(
        "Verified fictional server source:",
        identity.release,
        "MFA mode:",
        mode
      );
      return identity;
    }
    if (server.exitCode !== null || server.signalCode !== null)
      throw new Error("Production-mode server exited");
    await new Promise((done) => setTimeout(done, 500));
  }
  throw new Error("Production-mode server did not become healthy");
}
async function verifyBuiltApplication() {
  await run("npm", ["run", "build"], {
    ...env,
    NODE_ENV: "production",
    ACCOUNT_DELIVERY_MODE: "disabled"
  });
  console.log(
    "Platform production build ID:",
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
  const identity = await start("off");
  if (suite === "resources") {
    const product = JSON.parse(
      execFileSync(
        process.execPath,
        [
          "--import",
          "./tests/register.mjs",
          "--input-type=module",
          "-e",
          'import {releaseMetadata} from "./lib/platform/release-content.ts"; process.stdout.write(JSON.stringify(releaseMetadata(process.env.VERCEL_GIT_COMMIT_SHA)));'
        ],
        { cwd: root, env, encoding: "utf8" }
      )
    );
    assert.equal(identity.product.version, product.version);
    assert.equal(identity.product.build, source);
    const buildId = readFileSync(".next/BUILD_ID", "utf8").trim();
    const candidate = {
      schema: 1,
      sourceSha: source,
      productVersion: product.version,
      buildId,
      fixtureSha256: createHash("sha256")
        .update(readFileSync(join(fixture, "resource-fixture.json")))
        .digest("hex")
    };
    for (const [name, value] of [
      ["measurement-candidate.json", candidate],
      ["server-ready.json", { origin, runtimeSource: source, buildId }]
    ])
      writeFileSync(join(fixture, name), JSON.stringify(value, null, 2), {
        mode: 0o600,
        flag: "wx"
      });
    for (const phase of ["service", "http"])
      await run(process.execPath, [
        "--import",
        "./tests/register.mjs",
        "scripts/qa-resource-budgets.mjs",
        fixture,
        phase
      ]);
  } else {
    for (const name of profile.browsers) {
      await run(process.execPath, [
        "--import",
        "./tests/register.mjs",
        `scripts/${name}.mjs`,
        [
          "qa-navigation-journey-browser",
          "qa-topic-catalogue-privacy-browser",
          "qa-support-index-browser",
          "qa-notification-integration-browser"
        ].includes(name)
          ? relative(root, fixture)
          : fixture
      ]);
    }
    await stop(server);
    await start("enforce");
    await run(
      process.execPath,
      [
        "--import",
        "./tests/register.mjs",
        "--test",
        "--test-concurrency=1",
        ...profile.https.map((name) => `tests/${name}.test.ts`)
      ],
      { ...env, PRIVILEGED_MFA_MODE: "enforce", ARTIST_HTTP_MFA_ENFORCED: "1" }
    );
  }
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
  writeFileSync(
    join(fixture, "browser-env.json"),
    JSON.stringify({ origin, database, certificate: cert }),
    { mode: 0o600 }
  );
  // Run the capacity-bound fixture before other suites create public Like
  // candidates. Its cleanup withdraws only its own author's fictional posts.
  if (suite === "discovery")
    await run(process.execPath, [
      "--import",
      "./tests/register.mjs",
      "--test",
      "tests/feed-snapshot-cost.test.ts"
    ]);
  if (["resources", "exchange-plans"].includes(suite)) {
    await run(process.execPath, [
      "--import",
      "./tests/register.mjs",
      "tests/seed-capacity.ts"
    ]);
    copyFileSync(
      join(fixture, "actors.json"),
      join(fixture, "dense-actors.json"),
      constants.COPYFILE_EXCL
    );
    await run(process.execPath, [
      "--import",
      "./tests/register.mjs",
      "scripts/qa-resource-budgets.mjs",
      fixture,
      "seed"
    ]);
  } else {
    await run(process.execPath, [
      "--import",
      "./tests/register.mjs",
      "--test",
      "--test-concurrency=1",
      ...profile.services.map((name) => `tests/${name}.test.ts`)
    ]);
  }
  if (suite === "exchange-plans") {
    await run(process.execPath, [
      "--import",
      "./tests/register.mjs",
      "tests/exchange-prepared-plans.ts",
      fixture
    ]);
  } else if (suite !== "exchange-services") {
    await verifyBuiltApplication();
  }
  sync("git", ["diff", "--exit-code"]);
  console.log(
    suite === "exchange-plans"
      ? "PASS: current fictional Exchange service and prepared-plan measurements only; no build, browser, HTTPS or production acceptance."
      : suite === "exchange-services"
        ? "PASS: fictional Exchange input, listing, Needs and interchurch compatibility service regressions only."
        : suite === "resources"
          ? "PASS: fictional dense resource service and loopback HTTPS measurements. No production connection or delivery credentials; not production capacity acceptance."
          : `PASS: fictional ${suite} services, production build, browser and enforced-MFA HTTPS checks. No production connection or delivery credentials.`
  );
} finally {
  await stop(server);
  for (const request of requests) request.destroy();
  for (const socket of sockets) socket.destroy();
  if (proxy?.listening) await new Promise((done) => proxy.close(done));
  if (databaseStarted)
    sync(join(pg, "pg_ctl"), ["-D", cluster, "-m", "fast", "-w", "stop"]);
}
