import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  openSync,
  closeSync
} from "node:fs";
import { resolve, dirname } from "node:path";
import { spawn, execFileSync } from "node:child_process";
import { createServer } from "node:https";
import { request as httpRequest } from "node:http";

// This rehearsal accepts only separately prepared fictional source exports.
// It never runs a migration, restores a database or contacts a deployment provider.
const configPath = resolve(process.argv[2] ?? "");
assert.ok(process.argv[2], "Pass the private isolated browser-env.json");
const config = JSON.parse(readFileSync(configPath, "utf8"));
const fixture = dirname(configPath);
const env = JSON.parse(readFileSync(fixture + "/env.json", "utf8"));
const database = new URL(config.database),
  origin = new URL(config.origin);
assert.equal(database.hostname, "127.0.0.1");
assert.equal(database.pathname, "/godschurches_security_test");
assert.equal(database.port, String(config.ports.postgres));
assert.equal(origin.hostname, "127.0.0.1");
assert.equal(origin.protocol, "https:");
assert.equal(env.DATABASE_URL, config.database);
assert.equal(env.ACCOUNT_TEST_ISOLATED, "1");
assert.equal(env.ACCOUNT_DELIVERY_MODE, "test-sink");
assert.equal(env.NODE_ENV, "test");
for (const key of [
  "RESEND_API_KEY",
  "BLOB_READ_WRITE_TOKEN",
  "MAILERLITE_API_KEY",
  "GOOGLE_CLIENT_SECRET"
])
  assert.ok(!env[key], key);
Object.assign(process.env, env);
const { PrismaClient } = await import("@prisma/client");
const { assertPortalTestDatabase, seedPortal } =
  await import("../tests/seed-portal.ts");
const { portalCommand } = await import("../lib/platform/portal.ts");
const { postCommand } = await import("../lib/platform/post-commands.ts");
const db = new PrismaClient();
await assertPortalTestDatabase(db);
const run = fixture + "/run-" + Date.now();
mkdirSync(run, { mode: 0o700 });
const results = [],
  processes = [],
  errors = [],
  external = [];
const check = (text) => {
  results.push(text);
  console.log("PASS " + text);
};
const json = (path, value) =>
  writeFileSync(path, JSON.stringify(value, null, 2), { mode: 0o600 });
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const sourceFiles = execFileSync("git", ["ls-tree", "-rz", config.source], {
  encoding: "utf8",
  maxBuffer: 4 * 1024 * 1024
})
  .split("\0")
  .filter(Boolean);
assert.equal(sourceFiles.length, config.trackedFiles);
assert.deepEqual(config.deltas, {
  canary: ["app/api/platform/release/route.ts"],
  recovery: ["components/platform/profile-form.tsx"]
});
for (const kind of ["canary", "recovery"]) {
  assert.notEqual(resolve(config.roots[kind]), process.cwd());
  for (const item of sourceFiles) {
    const [meta, file] = item.split("\t");
    if (config.deltas[kind].includes(file)) continue;
    const bytes = readFileSync(config.roots[kind] + "/" + file);
    assert.equal(
      createHash("sha1")
        .update(Buffer.from("blob " + bytes.length + "\0"))
        .update(bytes)
        .digest("hex"),
      meta.split(" ")[2],
      kind + ":" + file
    );
  }
  const build = JSON.parse(
    readFileSync(
      dirname(config.roots[kind]) + "/" + kind + "-build.json",
      "utf8"
    )
  );
  assert.equal(build.code, 0);
  assert.equal(build.source, config.source);
}
const oldForm = execFileSync("git", [
  "show",
  config.oldUiSource + ":components/platform/profile-form.tsx"
]);
assert.equal(
  hash(
    readFileSync(
      config.roots.recovery + "/components/platform/profile-form.tsx"
    )
  ),
  hash(oldForm)
);
assert.match(
  readFileSync(
    config.roots.canary + "/app/api/platform/release/route.ts",
    "utf8"
  ),
  /Isolated fictional canary release failed/
);
check(
  "Both built source exports match the same current source except the declared canary fault and older profile form"
);

const blocker = run + "/block-external.mjs";
writeFileSync(
  blocker,
  `const original=globalThis.fetch; globalThis.fetch=(input,init)=>{const u=new URL(typeof input==='string'?input:input.url??input);if(!['127.0.0.1','localhost'].includes(u.hostname))throw Error('External fetch blocked in fictional rollback rehearsal');return original(input,init);};\n`,
  { mode: 0o600 }
);
let child, proxy, browser, receipt;
const sockets = new Set();
async function stop() {
  if (proxy) {
    for (const socket of sockets) socket.destroy();
    await new Promise((resolve) => proxy.close(resolve));
    proxy = undefined;
  }
  if (child && child.exitCode === null && child.signalCode === null) {
    const stopped = new Promise((resolve) => child.once("exit", resolve));
    child.kill("SIGTERM");
    let timer;
    const forced = await Promise.race([
      stopped.then(() => false),
      new Promise((resolve) => {
        timer = setTimeout(() => resolve(true), 10000);
      })
    ]);
    clearTimeout(timer);
    if (forced) {
      child.kill("SIGKILL");
      await stopped;
    }
    processes.at(-1).stoppedAt = new Date().toISOString();
    processes.at(-1).exitCode = child.exitCode;
    processes.at(-1).signal = child.signalCode;
    assert.equal(
      forced,
      false,
      "Owned preview must stop gracefully before acceptance"
    );
  }
  child = undefined;
}
async function start(kind) {
  assert.equal(child, undefined);
  const root = config.roots[kind];
  const serverEnv = JSON.parse(
    readFileSync(root + "/.account-test/compatible-rollback/env.json", "utf8")
  );
  assert.equal(serverEnv.DATABASE_URL, config.database);
  for (const key of [
    "RESEND_API_KEY",
    "BLOB_READ_WRITE_TOKEN",
    "MAILERLITE_API_KEY",
    "GOOGLE_CLIENT_SECRET"
  ])
    assert.ok(!serverEnv[key]);
  const build = JSON.parse(
    readFileSync(dirname(root) + "/" + kind + "-build.json", "utf8")
  );
  Object.assign(serverEnv, {
    NODE_ENV: "production",
    ACCOUNT_DELIVERY_MODE: "disabled",
    VERCEL_GIT_COMMIT_SHA: build.localFixtureBuild
  });
  const fd = openSync(run + "/" + kind + "-server.log", "w", 0o600);
  child = spawn(
    process.execPath,
    [
      "--import",
      blocker,
      "node_modules/next/dist/bin/next",
      "start",
      "--hostname",
      "127.0.0.1",
      "--port",
      String(config.ports.http)
    ],
    { cwd: root, env: serverEnv, stdio: ["ignore", fd, fd] }
  );
  closeSync(fd);
  processes.push({
    kind,
    pid: child.pid,
    startedAt: new Date().toISOString(),
    localFixtureBuild: build.localFixtureBuild
  });
  proxy = createServer(
    { key: readFileSync(config.key), cert: readFileSync(config.certificate) },
    (request, response) => {
      const headers = {
        ...request.headers,
        host: origin.host,
        "x-forwarded-host": origin.host,
        "x-forwarded-proto": "https",
        "x-forwarded-for": "127.0.0.1"
      };
      delete headers.forwarded;
      const upstream = httpRequest(
        {
          hostname: "127.0.0.1",
          port: config.ports.http,
          path: request.url,
          method: request.method,
          headers,
          agent: false
        },
        (result) => {
          response.writeHead(result.statusCode ?? 502, result.headers);
          result.pipe(response);
        }
      );
      upstream.on("error", () => {
        if (!response.headersSent) response.writeHead(502);
        response.end();
      });
      request.pipe(upstream);
    }
  );
  proxy.on("connection", (socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
  });
  await new Promise((resolve, reject) => {
    proxy.once("error", reject);
    proxy.listen(config.ports.https, "127.0.0.1", resolve);
  });
  let ready = false;
  for (let i = 0; i < 80; i++) {
    assert.equal(child.exitCode, null, "Preview exited before readiness");
    try {
      ready = (
        await fetch(config.origin + "/api/health", {
          signal: AbortSignal.timeout(1000)
        })
      ).ok;
    } catch {}
    if (ready) break;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  assert.ok(ready, "Isolated preview must become ready");
}
async function fingerprints() {
  const tables = await db.$queryRawUnsafe(
    "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name"
  );
  const ident = (name) => '"' + name.replaceAll('"', '""') + '"';
  const parts = tables.map(
    ({ table_name: name }, i) =>
      `SELECT ${i} AS ordinal, '${name.replaceAll("'", "''")}' AS name, count(*)::text AS rows, md5(coalesce(string_agg(md5(row_to_json(x)::text),'' ORDER BY md5(row_to_json(x)::text)),'')) AS digest FROM (SELECT * FROM public.${ident(name)}) x`
  );
  return db.$queryRawUnsafe(
    `SELECT name,rows,digest FROM (${parts.join(" UNION ALL ")}) fingerprints ORDER BY ordinal`
  );
}
const api = (actor, path, body) =>
  fetch(config.origin + path, {
    method: body ? "POST" : "GET",
    headers: {
      Cookie: "church_platform_session=" + actor.token,
      "X-Expected-Account": actor.id,
      ...(body
        ? { Origin: config.origin, "Content-Type": "application/json" }
        : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(20000)
  });
async function availability(actor, id, expected) {
  const response = await api(
    actor,
    "/api/platform/posts?view=availability&postId=" + encodeURIComponent(id)
  );
  assert.equal(response.status, 200);
  assert.equal((await response.json()).available, expected);
}
try {
  const f = await seedPortal(db),
    owner = f.memberA;
  await portalCommand(db, f.operator.token, {
    operation: "grant",
    churchId: f.churchA.id,
    userId: owner.id,
    capability: "PUBLISH_CHURCH_POSTS",
    expectedVersion: 0
  });
  const churchPost = await postCommand(db, owner.token, {
    operation: "create",
    requestKey: randomUUID(),
    authorChurchId: f.churchA.id,
    content: "Fictional private source, revoked before rollback"
  });
  const withdrawn = await postCommand(db, owner.token, {
    operation: "create",
    requestKey: randomUUID(),
    audience: "PUBLIC",
    content: "Fictional source withdrawn after the candidate started"
  });
  await start("canary");
  await availability(owner, churchPost.id, true);
  await availability(owner, withdrawn.id, true);
  const { chromium } = createRequire(
    process.env.PLAYWRIGHT_MODULE ??
      `${process.env.HOME}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json`
  )("playwright");
  const pub = execFileSync("openssl", [
    "x509",
    "-in",
    config.certificate,
    "-pubkey",
    "-noout"
  ]);
  const der = execFileSync("openssl", ["pkey", "-pubin", "-outform", "DER"], {
    input: pub
  });
  browser = await chromium.launch({
    headless: true,
    executablePath:
      process.env.CHROMIUM_PATH ??
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    args: [
      "--ignore-certificate-errors-spki-list=" +
        createHash("sha256").update(der).digest("base64")
    ]
  });
  const openEditor = async () => {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 }
    });
    await context.route("**/*", (route) => {
      if (new URL(route.request().url()).origin === config.origin)
        return route.continue();
      external.push(route.request().url());
      return route.abort();
    });
    await context.addCookies([
      {
        name: "church_platform_session",
        value: owner.token,
        url: config.origin,
        secure: true,
        httpOnly: true,
        sameSite: "Lax"
      }
    ]);
    const page = await context.newPage();
    page.setDefaultTimeout(20000);
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(config.origin + "/platform/profile/me");
    await page
      .getByRole("button", { name: "Save profile", exact: true })
      .waitFor();
    return { context, page };
  };
  const save = async (page) => {
    const response = page.waitForResponse(
      (r) =>
        r.url() === config.origin + "/api/platform/account" &&
        r.request().method() === "POST"
    );
    await page
      .getByRole("button", { name: "Save profile", exact: true })
      .click();
    const r = await response;
    assert.equal(r.status(), 200, "Profile save must succeed");
    return r.request().postDataJSON();
  };
  const a = await openEditor();
  await a.page
    .getByLabel("My testimony (optional)", { exact: true })
    .fill("Later written fictional testimony");
  await a.page
    .getByLabel("Skills (optional)", { exact: true })
    .fill("Listening\nGardening");
  await a.page
    .getByRole("button", { name: "Move Links up", exact: true })
    .click();
  await a.page
    .getByRole("button", { name: "Move Links up", exact: true })
    .click();
  await a.page
    .getByRole("button", { name: "Move Skills up", exact: true })
    .click();
  await save(a.page);
  await a.context.close();
  const later = await db.profilePresentation.findUniqueOrThrow({
    where: { userId: owner.id }
  });
  assert.deepEqual(later.modules.order, ["links", "skills", "testimony"]);
  await postCommand(db, owner.token, {
    operation: "withdraw",
    postId: withdrawn.id,
    expectedVersion: 1,
    confirmed: true
  });
  const connection = await db.churchConnection.findUniqueOrThrow({
    where: { userId_churchId: { userId: owner.id, churchId: f.churchA.id } }
  });
  await portalCommand(db, owner.token, {
    operation: "transition",
    action: "LEAVE",
    churchId: f.churchA.id,
    connectionId: connection.id,
    expectedVersion: connection.version
  });
  await availability(owner, churchPost.id, false);
  await availability(owner, withdrawn.id, false);
  check(
    "Candidate accepts an actual later browser save; canonical withdrawal and membership removal take effect before rollback"
  );
  const failed = await fetch(config.origin + "/api/platform/release");
  assert.equal(failed.status, 503);
  assert.match(await failed.text(), /Isolated fictional canary release failed/);
  check("The locally injected canary release check actually fails with 503");
  const before = await fingerprints();
  json(run + "/before-code-switch.json", before);
  const switchStartedAt = new Date().toISOString();
  await stop();
  await start("recovery");
  const after = await fingerprints();
  json(run + "/after-code-switch.json", after);
  assert.deepEqual(
    after,
    before,
    "Every table, including migration history and later revocations, must survive the code switch"
  );
  assert.notEqual(processes[0].pid, processes[1].pid);
  check(
    "A different compatible server process starts without restore or migration; all table fingerprints remain identical"
  );
  const release = await fetch(config.origin + "/api/platform/release");
  assert.equal(release.status, 200);
  assert.equal((await release.json()).release, processes[1].localFixtureBuild);
  const recovered = await api(owner, "/api/platform/profile");
  assert.equal(recovered.status, 200);
  const current = await recovered.json();
  assert.deepEqual(current.presentation.modules, later.modules);
  await availability(owner, churchPost.id, false);
  await availability(owner, withdrawn.id, false);
  const denied = await api(owner, "/api/platform/posts", {
    operation: "create",
    requestKey: randomUUID(),
    authorChurchId: f.churchA.id,
    content: "Must remain denied after code rollback"
  });
  assert.ok([403, 404].includes(denied.status));
  check(
    "Recovered HTTP readers preserve new profile order, withdrawn sources and lost church read/write authority"
  );
  const b = await openEditor();
  assert.equal(
    await b.page
      .getByRole("button", { name: "Move Skills up", exact: true })
      .count(),
    0
  );
  assert.equal(
    await b.page
      .getByLabel("My testimony (optional)", { exact: true })
      .inputValue(),
    later.modules.testimony
  );
  await b.page
    .getByLabel("My testimony (optional)", { exact: true })
    .fill("Reviewed correction from the older compatible form");
  const legacyPayload = await save(b.page);
  assert.equal(Object.hasOwn(legacyPayload.profileModules, "order"), false);
  await b.page.screenshot({
    path: run + "/compatible-profile-editor.png",
    fullPage: true
  });
  await b.context.close();
  const saved = await db.profilePresentation.findUniqueOrThrow({
    where: { userId: owner.id }
  });
  assert.deepEqual(saved.modules.order, later.modules.order);
  assert.deepEqual(saved.modules.skills, later.modules.skills);
  assert.equal(
    saved.modules.testimony,
    "Reviewed correction from the older compatible form"
  );
  assert.ok(saved.version > later.version);
  const stale = await api(owner, "/api/platform/account", {
    ...legacyPayload,
    expectedVersion: later.version,
    profileModules: {
      ...later.modules,
      testimony: "Stale canary edit must not win"
    }
  });
  assert.equal(stale.status, 409);
  assert.deepEqual(
    await db.profilePresentation.findUniqueOrThrow({
      where: { userId: owner.id }
    }),
    saved
  );
  check(
    "The actual older form omits order but the compatible writer retains it; a stale later save conflicts without overwrite"
  );
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
  receipt = {
    source: config.source,
    olderUiSource: config.oldUiSource,
    sourceFilesVerified: sourceFiles.length,
    sourceDeltas: config.deltas,
    processes,
    switchStartedAt,
    tablesPreserved: before.length,
    checks: results,
    browserErrors: errors,
    browserExternalRequests: external,
    productionActions: 0,
    restoredDatabases: 0,
    migrationsDuringSwitch: 0,
    note: "Fictional local canary and a compatible UI rollback only. Other runtime privacy and write owners remain at the current source. Not an unrestricted downgrade or production rollback. External-request observations cover browser routing; the server fetch blocker is a guard, not a complete network trace."
  };
} finally {
  const cleanupErrors = [];
  try {
    if (browser) await browser.close();
  } catch (error) {
    cleanupErrors.push(error);
  }
  try {
    await stop();
  } catch (error) {
    cleanupErrors.push(error);
  }
  try {
    await db.$disconnect();
  } catch (error) {
    cleanupErrors.push(error);
  }
  assert.deepEqual(
    cleanupErrors,
    [],
    "Browser, proxy, server and database client must all close before acceptance"
  );
}
receipt.finishedAt = new Date().toISOString();
receipt.cleanupVerified = true;
json(run + "/receipt.json", receipt);
json(fixture + "/latest-receipt.json", { run, ...receipt });
console.log(
  JSON.stringify({
    run,
    checks: results.length,
    tables: receipt.tablesPreserved,
    source: config.source,
    cleanupVerified: true
  })
);
