import assert from "node:assert/strict";
import {
  mkdtempSync,
  existsSync,
  readFileSync,
  readdirSync,
  realpathSync,
  writeFileSync
} from "node:fs";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { join, resolve, sep } from "node:path";
import { gzipSync } from "node:zlib";
import { setImmediate } from "node:timers/promises";
import test from "node:test";
import vm from "node:vm";
import {
  createMeasurementReceipts,
  runSettledStage,
  summary
} from "../scripts/resource-measurement-receipts.mjs";
import { createResourceResponseBudget } from "../scripts/resource-response-budget.mjs";
import {
  resourceCandidate,
  resourceServingIdentity
} from "../scripts/resource-budget-identity.mjs";

const ts = createRequire(import.meta.url)("typescript");
const sourceText = readFileSync(
  new URL("../scripts/qa-resource-budgets.mjs", import.meta.url),
  "utf8"
);
const ast = ts.createSourceFile(
  "qa-resource-budgets.mjs",
  sourceText,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.JS
);
assert.deepEqual(ast.parseDiagnostics, []);
const declarations = new Map(),
  functions = new Map();
function visit(node) {
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
    const entries = declarations.get(node.name.text) ?? [];
    entries.push(node);
    declarations.set(node.name.text, entries);
  }
  if (ts.isFunctionDeclaration(node) && node.name) {
    const entries = functions.get(node.name.text) ?? [];
    entries.push(node);
    functions.set(node.name.text, entries);
  }
  ts.forEachChild(node, visit);
}
visit(ast);
function unique(map, name) {
  const found = map.get(name) ?? [];
  assert.equal(found.length, 1, `Expected one actual ${name} declaration`);
  return found[0];
}
const expression = (name) =>
  unique(declarations, name).initializer.getText(ast);
const measurement = unique(functions, "measure").getText(ast);
const mainSource = unique(functions, "main").getText(ast);
const cliBoundary = ast.statements.at(-1).getText(ast);
assert.match(cliBoundary, /^await main\(\)\.catch\(/);
const outerState = ["receipts", "failureCode"]
  .map((name) => unique(declarations, name).parent.parent.getText(ast))
  .join("\n");
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const totalCap = 256 * 1024 * 1024,
  responseCap = 8 * 1024 * 1024;
const origin = "https://127.0.0.1:4443";
const canaries = {
  error: "FICTIONAL_ERROR_CANARY",
  header: "FICTIONAL_HEADER_CANARY",
  body: "FICTIONAL_BODY_CANARY",
  sql: "FICTIONAL_SQL_CANARY",
  url: "FICTIONAL_URL_CANARY",
  token: "FICTIONAL_TOKEN_CANARY",
  actor: "FICTIONAL_ACTOR_CANARY"
};

function directory() {
  // Small synthetic evidence only. Retain it; never clean an SSD or other run.
  const root = realpathSync("/tmp");
  assert.ok(!root.startsWith("/Volumes/"));
  return mkdtempSync(join(root, "resource-receipts-test-"));
}
function put(path, value) {
  writeFileSync(path, JSON.stringify(value), { flag: "wx", mode: 0o600 });
}
function fixture({ omitService = false, omitCursors = false } = {}) {
  const dir = directory();
  const source = "a".repeat(40),
    buildId = "fictional-build";
  const data = {
    actors: Array.from({ length: 25 }, (_, i) => ({
      id: canaries.actor + i,
      token: canaries.token + i
    })),
    calendarIds: Array.from(
      { length: 25 },
      (_, i) => "fictional-calendar-" + i
    ),
    mediaId: "fictional-image",
    marker: canaries.url,
    counts: { actors: 25 }
  };
  put(join(dir, "resource-fixture.json"), data);
  const candidate = {
    schema: 1,
    sourceSha: source,
    productVersion: "2026.10.04.1",
    buildId,
    fixtureSha256: digest(readFileSync(join(dir, "resource-fixture.json")))
  };
  put(join(dir, "measurement-candidate.json"), candidate);
  if (!omitCursors)
    put(join(dir, "feed-cursors.json"), {
      candidate,
      creation: [],
      cursors: Array.from({ length: 25 }, () => ({
        latest: { cursor: "fictional", scope: "fictional" },
        following: { cursor: "fictional", scope: "fictional" }
      }))
    });
  put(join(dir, "server-ready.json"), {
    origin,
    runtimeSource: source,
    buildId
  });
  if (!omitService) put(join(dir, "service-budget.json"), { candidate });
  return { dir, source, buildId, candidate };
}

function syntheticBody(url) {
  if (url.includes("/platform?"))
    return "Fictional capacity update " + canaries.body;
  const value = { privateCanary: canaries.body };
  if (url.includes("/search?")) value.items = Array(20).fill({});
  else if (url.includes("/exchange?")) value.listings = Array(20).fill({});
  else if (url.includes("/groups?")) value.groups = Array(20).fill({});
  else if (url.includes("/calendars?")) value.events = Array(200).fill({});
  else return "fictional-image-" + canaries.body;
  return JSON.stringify(value);
}

// Execute the actual measure() function, including prerequisite checks,
// complete workload, immutable writes and failure publication. Application/DB
// boundaries are injected; the scheduler, budget and receipt writer are real.
async function runHttp(options = {}) {
  const input =
    options.fixture ?? fixture({ omitService: options.phase === "service" });
  const failure = new Error(
    `${canaries.error}: SELECT ${canaries.sql} FROM private; https://${canaries.url}/?token=${canaries.token}`
  );
  const cleanupFailure = new Error("fictional cleanup: " + canaries.error);
  let workloadCalls = 0,
    identityCalls = 0,
    statsCalls = 0,
    disconnected = 0,
    serviceCalls = 0;
  let observedBudget, attempt;
  const logs = [],
    states = [];
  const context = vm.createContext({
    assert,
    Buffer,
    URLSearchParams,
    AbortSignal,
    Date,
    performance,
    JSON,
    gzipSync,
    dir: input.dir,
    phase: options.phase ?? "http",
    source: input.source,
    host: { environment: "pure-mock" },
    config: { origin },
    capturing: false,
    storeReads: 0,
    events: [],
    createHash,
    join,
    existsSync,
    readFileSync: (path, encoding) =>
      path === ".next/BUILD_ID" ? input.buildId : readFileSync(path, encoding),
    writeFileSync,
    resourceCandidate,
    resourceServingIdentity,
    summary,
    createMeasurementReceipts: (dir, phase) => {
      const writer = createMeasurementReceipts(dir, phase);
      attempt = join(dir, "resource-receipts", writer.id);
      for (const name of options.collide ?? [])
        put(join(attempt, name), { preserved: "prior fictional evidence" });
      return writer;
    },
    createResourceResponseBudget: (maximumTotalBytes, maximumResponseBytes) => {
      assert.equal(maximumTotalBytes, totalCap);
      assert.equal(maximumResponseBytes, responseCap);
      observedBudget = createResourceResponseBudget(
        options.smallCaps?.[0] ?? maximumTotalBytes,
        options.smallCaps?.[1] ?? maximumResponseBytes
      );
      return observedBudget;
    },
    runSettledStage: async (args) => {
      try {
        return await runSettledStage(args);
      } finally {
        states.push({ aborted: args.signal.aborted });
      }
    },
    db: {
      $disconnect: async () => {
        disconnected++;
        if (options.failDisconnect) throw cleanupFailure;
      }
    },
    assertPortalTestDatabase: async () => {},
    imageStorage: () => ({}),
    databaseStats: async () => {
      statsCalls++;
      if (statsCalls === options.failStatsAt) throw failure;
      return { version: "fictional", connections: 0 };
    },
    sessionCookieFixtureName: () => "fictional-cookie",
    process: { exitCode: undefined },
    console: {
      log: (value) => logs.push(String(value)),
      error: (value) => logs.push(String(value))
    },
    fetch: async (url, init) => {
      if (url.endsWith("/api/platform/release")) {
        identityCalls++;
        assert.equal(init.redirect, "error");
        if (identityCalls === options.failIdentityAt) throw failure;
        return new Response(
          JSON.stringify({
            release: input.source,
            product: {
              build: input.source,
              version: input.candidate.productVersion
            }
          }),
          { status: 200 }
        );
      }
      workloadCalls++;
      assert.equal(init.redirect, "manual");
      assert.ok(init.signal instanceof AbortSignal);
      assert.match(init.headers.cookie, /FICTIONAL_TOKEN_CANARY/);
      if (workloadCalls === options.failRequestAt) throw failure;
      const body =
        workloadCalls === options.failStreamAt
          ? new ReadableStream({
              pull(controller) {
                if (!this.sent) {
                  this.sent = true;
                  controller.enqueue(new Uint8Array([1, 2, 3]));
                } else controller.error(failure);
              }
            })
          : workloadCalls === options.badBodyAt
            ? canaries.body
            : syntheticBody(url);
      return new Response(body, {
        status: workloadCalls === options.badStatusAt ? 500 : 200,
        headers: {
          "cache-control": "private,no-store," + canaries.header,
          "content-type": url.includes("/images/")
            ? "image/webp; fixture=" + canaries.header
            : "application/json"
        }
      });
    }
  });
  const service = async (result) => {
    serviceCalls++;
    if (context.capturing)
      context.events.push({
        query: "SELECT " + canaries.sql,
        params: canaries.token,
        duration: 7
      });
    if (serviceCalls === options.failServiceAt) throw failure;
    return result;
  };
  Object.assign(context, {
    readFeed: () =>
      service({
        posts: Array(30).fill({}),
        pageCursor: "fictional",
        scope: "fictional"
      }),
    communitySearch: () => service({ items: Array(20).fill({}) }),
    listExchangeListings: () => service({ listings: Array(20).fill({}) }),
    readExchangeListing: () => service({ privateCanary: canaries.body }),
    listGroups: () => service({ groups: Array(20).fill({}) }),
    getCalendarAgenda: () => service({ events: Array(200).fill({}) }),
    readImage: () => service(Buffer.from(canaries.body))
  });
  context.save = vm.runInContext(`(${expression("save")})`, context);
  let error;
  try {
    await vm.runInContext(
      `(async () => { ${outerState}\n${measurement}\n${options.cli ? "const main = measure;\n" + cliBoundary : "await measure();"} })()`,
      context
    );
  } catch (caught) {
    error = caught;
  }
  const files = Object.fromEntries(
    readdirSync(attempt).map((name) => [
      name,
      readFileSync(join(attempt, name), "utf8")
    ])
  );
  const records = Object.fromEntries(
    Object.entries(files).map(([name, bytes]) => [name, JSON.parse(bytes)])
  );
  return {
    input,
    attempt,
    error,
    failure,
    cleanupFailure,
    files,
    records,
    logs,
    states,
    workloadCalls,
    identityCalls,
    statsCalls,
    disconnected,
    serviceCalls,
    exitCode: context.process.exitCode,
    budget: observedBudget
  };
}

// Run the complete CLI initialization and catch with a wholly fictional
// process/env/filesystem/client. No actual environment, files, git or DB are
// read here. Counters prove each rejection happens at its intended boundary.
async function runPreflight({ kind, provider } = {}) {
  const fixtureRoot = "/fictional-account-test";
  const fixtureDir = join(fixtureRoot, "fictional-run");
  const mediaDir = join(fixtureDir, "fictional-media");
  const database = `postgresql://fictional:${canaries.token}@127.0.0.1:5432/fictional`;
  const config = { origin, database };
  const processFixture = {
    argv: ["fictional-node", "fictional-script", fixtureDir, "http"],
    version: "fictional-node-version",
    exitCode: undefined,
    env: {
      DATABASE_URL: kind === "database" ? database + canaries.url : database,
      ACCOUNT_ORIGIN: origin,
      MEDIA_STORAGE_MODE: "local-test",
      MEDIA_TEST_DIR: mediaDir,
      ...(provider ? { [provider]: canaries.token } : {})
    }
  };
  const counters = {
    configReads: 0,
    mediaPathChecks: 0,
    clients: 0,
    queryListeners: 0,
    gitCalls: 0,
    receipts: 0,
    databaseGuards: 0,
    disconnects: 0,
    providerCalls: 0
  };
  const logs = [],
    records = [];
  const context = vm.createContext({
    assert,
    URL,
    JSON,
    Date,
    process: processFixture,
    join,
    resolve,
    sep,
    console: {
      log: (...values) => logs.push(values.map(String).join(" ")),
      error: (...values) => logs.push(values.map(String).join(" "))
    },
    realpathSync: (path) => {
      if (kind === "filesystem")
        throw new Error(`ENOENT: ${fixtureDir}/${canaries.url}`);
      if (path === fixtureDir) return fixtureDir;
      if (path === ".account-test") return fixtureRoot;
      assert.equal(path, mediaDir);
      counters.mediaPathChecks++;
      return mediaDir;
    },
    readFileSync: (path) => {
      assert.equal(path, join(fixtureDir, "browser-env.json"));
      counters.configReads++;
      return kind === "json"
        ? `"${canaries.body}" invalid`
        : JSON.stringify(config);
    },
    PrismaClient: class {
      constructor() {
        counters.clients++;
      }
      $on(event) {
        assert.equal(event, "query");
        counters.queryListeners++;
      }
      async $disconnect() {
        counters.disconnects++;
      }
    },
    execFileSync: (command, args) => {
      assert.equal(command, "git");
      counters.gitCalls++;
      if (args.join(" ") === "rev-parse HEAD") return "a".repeat(40);
      assert.equal(args.join(" "), "status --porcelain");
      return kind === "dirty" ? ` M ${canaries.url}` : "";
    },
    cpus: () => [{ model: "fictional CPU" }],
    totalmem: () => 1024,
    loadavg: () => [0, 0, 0],
    createMeasurementReceipts: () => {
      counters.receipts++;
      return {
        id: "fictional-attempt",
        write: (name, value) => records.push({ name, value })
      };
    },
    assertPortalTestDatabase: async () => {
      counters.databaseGuards++;
      throw new Error(`Fictional measurement stop ${canaries.sql}`);
    },
    fetch: async () => {
      counters.providerCalls++;
      throw new Error("Fictional forbidden provider call " + canaries.token);
    }
  });
  const failureState = unique(
    declarations,
    "failureCode"
  ).parent.parent.getText(ast);
  await vm.runInContext(
    `(async () => { ${failureState}\n${mainSource}\n${cliBoundary} })()`,
    context
  );
  return { counters, logs, records, exitCode: processFixture.exitCode };
}

function assertPrivateDataAbsent(result) {
  // This one deliberately private query file is excluded by the artifact
  // workflow. Public receipts and CLI output must contain no raw canaries.
  const all =
    Object.entries(result.files)
      .filter(([name]) => name !== "private-service-query-events.json")
      .map(([, bytes]) => bytes)
      .join("\n") + result.logs.join("\n");
  for (const value of Object.values(canaries))
    assert.ok(!all.includes(value), `Receipt/log disclosed ${value}`);
}
function assertAccounting(result, receipt) {
  const samples = receipt.stages.flatMap((stage) => stage.samples);
  assert.equal(receipt.totalCalls, result.workloadCalls);
  assert.equal(samples.length, result.workloadCalls);
  assert.equal(receipt.activeRequests, 0);
  assert.equal(receipt.totalBytes, result.budget.totalBytes);
  assert.equal(receipt.totalReceivedBytes, result.budget.totalReceivedBytes);
  assert.equal(
    samples.reduce((n, row) => n + row.bytes, 0),
    receipt.totalBytes
  );
  assert.equal(
    samples.reduce((n, row) => n + row.receivedBytes, 0),
    receipt.totalReceivedBytes
  );
  for (const stage of receipt.stages) {
    assert.equal(stage.attempted, stage.samples.length);
    assert.equal(
      stage.validated,
      stage.samples.filter((row) => row.validated).length
    );
    assert.equal(
      stage.responsesReceived,
      stage.samples.filter((row) => row.responseReceived).length
    );
    assert.equal(
      stage.bodiesCompleted,
      stage.samples.filter((row) => row.bodyComplete).length
    );
    assert.ok(stage.samples.every((row) => Number.isFinite(row.ms)));
  }
}

test("receipt attempts and repeated filenames never replace earlier evidence", () => {
  const dir = directory();
  const first = createMeasurementReceipts(dir, "http");
  const path = first.write("complete.json", { value: 1 });
  const preserved = readFileSync(path, "utf8");
  assert.throws(() => first.write("complete.json", { value: 2 }), {
    code: "EEXIST"
  });
  assert.equal(readFileSync(path, "utf8"), preserved);
  const second = createMeasurementReceipts(dir, "http");
  assert.notEqual(first.id, second.id);
  assert.notEqual(second.write("complete.json", { value: 2 }), path);
  assert.equal(readFileSync(path, "utf8"), preserved);
  assert.throws(() => first.write("../escape.json", {}));
});

test("actual fixed compatibility save rejects a collision and preserves prior bytes", () => {
  const dir = directory();
  const save = vm.runInNewContext(`(${expression("save")})`, {
    dir,
    join,
    writeFileSync,
    JSON
  });
  save("service-budget.json", { candidate: "first" });
  const bytes = readFileSync(join(dir, "service-budget.json"), "utf8");
  assert.throws(() => save("service-budget.json", { candidate: "second" }), {
    code: "EEXIST"
  });
  assert.equal(readFileSync(join(dir, "service-budget.json"), "utf8"), bytes);
});

test("empty and partial measurement summaries retain honest counts", () => {
  assert.deepEqual(summary([]), {
    count: 0,
    min: null,
    p50: null,
    p95: null,
    max: null
  });
  const values = [8, 1, 5];
  assert.deepEqual(summary(values), {
    count: 3,
    min: 1,
    p50: 5,
    p95: 8,
    max: 8
  });
  assert.deepEqual(values, [8, 1, 5]);
});

test("stage cancellation waits for every started call and throws the original failure", async () => {
  const controller = new AbortController(),
    failure = new Error("fictional first failure");
  let release,
    settled = false;
  const held = new Promise((resolve) => {
    release = resolve;
  });
  const calls = [];
  const pending = runSettledStage({
    count: 20,
    concurrency: 2,
    signal: controller.signal,
    abort: (error) => controller.abort(error),
    call: async (index, actorIndex) => {
      calls.push({ index, actorIndex });
      if (index === 0) await held;
      else throw failure;
    }
  });
  const outcome = pending.then(
    () => {
      settled = true;
      return null;
    },
    (error) => {
      settled = true;
      return error;
    }
  );
  await setImmediate();
  assert.equal(controller.signal.reason, failure);
  assert.equal(settled, false);
  assert.equal(calls.length, 2);
  release();
  assert.equal(await outcome, failure);
  assert.equal(calls.length, 2);
});

test("actual HTTP runner completes exactly 920 calls with separate immutable stage receipts", async () => {
  const result = await runHttp();
  assert.equal(result.error, undefined);
  assert.equal(result.workloadCalls, 920);
  assert.equal(result.identityCalls, 2);
  assert.equal(result.disconnected, 1);
  assert.deepEqual(Object.keys(result.records).sort(), [
    "complete.json",
    "stage-0.json",
    "stage-1.json",
    "stage-2.json",
    "stage-3.json",
    "started.json"
  ]);
  const complete = result.records["complete.json"];
  assert.equal(complete.outcome, "complete");
  assert.equal(complete.warmupRequests, 20);
  assert.equal(complete.measuredRequests, 900);
  assert.deepEqual(complete.identityProbes, { attempted: 2, verified: 2 });
  assert.equal(complete.maximumRetainedBytes, totalCap);
  assert.equal(complete.maximumResponseRetainedBytes, responseCap);
  assert.deepEqual(
    complete.stages.map((stage) => [stage.concurrency, stage.validated]),
    [
      [1, 20],
      [1, 300],
      [5, 300],
      [25, 300]
    ]
  );
  for (const [i, expected] of [20, 320, 620, 920].entries()) {
    const checkpoint = result.records[`stage-${i}.json`];
    assert.equal(checkpoint.totalCalls, expected);
    assert.equal(checkpoint.stages.length, i + 1);
    assert.equal(checkpoint.activeRequests, 0);
  }
  assertAccounting(result, complete);
  assertPrivateDataAbsent(result);
  const firstHashes = Object.fromEntries(
    Object.entries(result.files).map(([name, bytes]) => [name, digest(bytes)])
  );
  const repeated = await runHttp({ fixture: result.input });
  assert.equal(repeated.error, undefined);
  assert.notEqual(repeated.attempt, result.attempt);
  for (const [name, hash] of Object.entries(firstHashes))
    assert.equal(digest(readFileSync(join(result.attempt, name))), hash);
});

test("actual call refuses a 921st start before fetching or adding a sample", async () => {
  const budget = createResourceResponseBudget(totalCap, responseCap);
  let fetched = 0;
  const context = vm.createContext({
    totalCalls: 920,
    active: 0,
    responseBudget: budget,
    fetch: async () => {
      fetched++;
    },
    Error
  });
  const call = vm.runInContext(
    `(${unique(functions, "call").getText(ast)})`,
    context
  );
  const samples = [];
  await assert.rejects(call(0, 0, samples), /experiment budget reached/);
  assert.equal(fetched, 0);
  assert.equal(context.totalCalls, 920);
  assert.equal(context.active, 0);
  assert.deepEqual(samples, []);
  assert.equal(budget.signal.aborted, true);
});

test("actual mid-stage stream failure preserves partial work after all calls settle", async () => {
  const result = await runHttp({ failStreamAt: 328 });
  assert.equal(result.error, result.failure);
  assert.equal(result.records["complete.json"], undefined);
  const failed = result.records["failed.json"];
  assert.equal(failed.failure, "http-stage");
  assert.equal(failed.outcome, "failed");
  assert.equal(failed.stages.length, 3);
  const partial = failed.stages[2];
  assert.equal(partial.outcome, "failed");
  assert.ok(partial.validated > 0);
  assert.ok(partial.validated < partial.attempted);
  assert.ok(partial.samples.some((row) => row.failure === "response-body"));
  assert.deepEqual(result.records["stage-2.json"].stage, partial);
  assertAccounting(result, failed);
  assertPrivateDataAbsent(result);
});

test("actual early warmup failure counts its start without inventing a response", async () => {
  const result = await runHttp({ failRequestAt: 1 });
  assert.equal(result.error, result.failure);
  const failed = result.records["failed.json"];
  assert.equal(failed.failure, "http-warmup");
  assert.equal(result.workloadCalls, 1);
  assert.equal(failed.stages.length, 1);
  assert.equal(failed.stages[0].validated, 0);
  assert.equal(failed.stages[0].responsesReceived, 0);
  assertAccounting(result, failed);
  assertPrivateDataAbsent(result);
});

for (const [name, option, value, expectedCalls] of [
  ["identity-before", "failIdentityAt", 1, 0],
  ["identity-after", "failIdentityAt", 2, 920],
  ["http-database-before", "failStatsAt", 1, 0],
  ["http-database-after", "failStatsAt", 2, 920]
]) {
  test(`actual ${name} failure publishes candidate-bound failure without claiming completion`, async () => {
    const result = await runHttp({ [option]: value });
    assert.equal(result.error, result.failure);
    assert.equal(result.records["complete.json"], undefined);
    const failed = result.records["failed.json"];
    assert.equal(failed.failure, name);
    assert.equal(failed.outcome, "failed");
    assert.deepEqual(failed.candidate, result.input.candidate);
    assert.equal(result.workloadCalls, expectedCalls);
    assert.equal(result.disconnected, 1);
    if (expectedCalls) assertAccounting(result, failed);
    assertPrivateDataAbsent(result);
  });
}

test("actual body cap failure records received versus retained bytes without a completed sample", async () => {
  const result = await runHttp({ smallCaps: [32, 8] });
  assert.match(result.error.message, /collection budget exceeded/);
  const failed = result.records["failed.json"];
  assert.equal(failed.stages[0].validated, 0);
  assert.ok(failed.totalReceivedBytes > failed.totalBytes);
  assert.ok(failed.totalBytes <= 32);
  assert.ok(failed.stages[0].samples.every((sample) => sample.bytes <= 8));
  assertAccounting(result, failed);
  assertPrivateDataAbsent(result);
});

test("receipt collisions during a failed stage preserve both prior bytes and the original error", async () => {
  const result = await runHttp({
    failStreamAt: 328,
    collide: ["stage-2.json", "failed.json"]
  });
  assert.equal(result.error, result.failure);
  assert.deepEqual(result.records["stage-2.json"], {
    preserved: "prior fictional evidence"
  });
  assert.deepEqual(result.records["failed.json"], {
    preserved: "prior fictional evidence"
  });
  assert.ok(result.logs.includes("RESOURCE_STAGE_RECEIPT_WRITE_FAILED"));
  assert.ok(result.logs.includes("RESOURCE_FAILURE_RECEIPT_WRITE_FAILED"));
  assertPrivateDataAbsent(result);
});

test("existing service prerequisite prevents cursor and service work without replacing evidence", async () => {
  const input = fixture({ omitCursors: true });
  const prior = readFileSync(join(input.dir, "service-budget.json"));
  const result = await runHttp({ fixture: input, phase: "service" });
  assert.match(result.error.message, /RESOURCE_SERVICE_RECEIPT_EXISTS/);
  assert.equal(result.serviceCalls, 0);
  assert.equal(result.workloadCalls, 0);
  assert.equal(existsSync(join(input.dir, "feed-cursors.json")), false);
  assert.deepEqual(readFileSync(join(input.dir, "service-budget.json")), prior);
  assert.equal(result.records["failed.json"].failure, "service-prerequisite");
  assert.deepEqual(result.records["failed.json"].candidate, input.candidate);
  assert.equal(result.records["complete.json"], undefined);
  assert.equal(result.disconnected, 1);
  assertPrivateDataAbsent(result);
});

test("actual service completion publishes a candidate-bound immutable HTTP prerequisite", async () => {
  const result = await runHttp({ phase: "service" });
  assert.equal(result.error, undefined);
  assert.equal(result.serviceCalls, 231);
  assert.equal(result.workloadCalls, 0);
  assert.equal(result.disconnected, 1);
  assert.equal(result.records["failed.json"], undefined);
  const completed = result.records["complete.json"];
  assert.equal(completed.outcome, "complete");
  assert.equal(completed.measuredCalls, 220);
  assert.deepEqual(completed.counts, {
    warmupAttempts: 11,
    warmupCompleted: 11,
    measuredAttempts: 220,
    validated: 220
  });
  assert.equal(completed.measurements.length, 11);
  assert.deepEqual(completed.candidate, result.input.candidate);
  const rowCounts = {
    "feed-latest": 30,
    "feed-following": 30,
    "search-posts": 20,
    "search-people": 20,
    "exchange-newest": 20,
    "exchange-price": 20,
    groups: 20,
    "calendar-200": 200
  };
  for (const group of completed.measurements) {
    assert.equal(group.outcome, "complete");
    assert.equal(group.warmup.completed, true);
    assert.equal(group.samples.length, 20);
    assert.equal(group.milliseconds.count, 20);
    assert.equal(group.bytes.count, 20);
    assert.equal(
      group.bytes.min,
      Math.min(...group.samples.map((sample) => sample.bytes))
    );
    assert.equal(
      group.bytes.max,
      Math.max(...group.samples.map((sample) => sample.bytes))
    );
    for (const sample of group.samples) {
      assert.equal(sample.validated, true);
      assert.equal(sample.failure, null);
      assert.equal(sample.rows, rowCounts[group.name] ?? null);
      assert.equal(sample.statements, 1);
      assert.equal(sample.selects, 1);
      assert.equal(sample.sqlMs, 7);
      assert.ok(sample.bytes > 0);
      assert.ok(sample.gzipBytes > 0);
    }
    assert.deepEqual(result.records[`stage-${group.name}.json`].stage, group);
  }
  const aliasPath = join(result.input.dir, "service-budget.json");
  const aliasBytes = readFileSync(aliasPath);
  assert.deepEqual(JSON.parse(aliasBytes), completed);
  assert.ok(
    result.files["private-service-query-events.json"].includes(canaries.sql)
  );
  assertPrivateDataAbsent(result);
  const http = await runHttp({ fixture: result.input });
  assert.equal(http.error, undefined);
  assert.equal(http.workloadCalls, 920);
  assert.deepEqual(
    http.records["complete.json"].candidate,
    completed.candidate
  );
  assert.deepEqual(readFileSync(aliasPath), aliasBytes);
  assertPrivateDataAbsent(http);
});

for (const [failServiceAt, expectedSamples, failureCode] of [
  [1, 0, "service-warmup"],
  [5, 4, "service-sample"]
]) {
  test(`actual ${failureCode} failure preserves the started group and completed sample counts`, async () => {
    const result = await runHttp({ phase: "service", failServiceAt });
    assert.equal(result.error, result.failure);
    assert.equal(result.serviceCalls, failServiceAt);
    assert.equal(result.records["complete.json"], undefined);
    assert.equal(
      existsSync(join(result.input.dir, "service-budget.json")),
      false
    );
    const failed = result.records["failed.json"];
    assert.equal(failed.failure, failureCode);
    assert.equal(failed.measurements.length, 1);
    const group = failed.measurements[0];
    assert.equal(group.outcome, "failed");
    assert.equal(group.samples.length, expectedSamples);
    assert.equal(group.warmup.completed, expectedSamples > 0);
    assert.equal(group.warmup.attempted, true);
    assert.ok(Number.isFinite(group.warmup.ms));
    assert.deepEqual(failed.counts, {
      warmupAttempts: 1,
      warmupCompleted: expectedSamples > 0 ? 1 : 0,
      measuredAttempts: expectedSamples,
      validated: Math.max(0, expectedSamples - 1)
    });
    if (expectedSamples) {
      const last = group.samples.at(-1);
      assert.equal(last.validated, false);
      assert.equal(last.failure, "service-call");
      assert.equal(last.bytes, null);
      assert.equal(last.gzipBytes, null);
      assert.equal(last.statements, 1);
      assert.equal(last.selects, 1);
      assert.equal(last.sqlMs, 7);
      assert.ok(group.samples.every((sample) => Number.isFinite(sample.ms)));
    }
    assert.deepEqual(result.records["stage-feed-latest.json"].stage, group);
    assertPrivateDataAbsent(result);
  });
}

test("disconnect failure prevents final completion after a successful workload", async () => {
  const result = await runHttp({ failDisconnect: true });
  assert.equal(result.error, result.cleanupFailure);
  assert.equal(result.workloadCalls, 920);
  assert.equal(result.disconnected, 1);
  assert.equal(result.records["complete.json"], undefined);
  const failed = result.records["failed.json"];
  assert.equal(failed.failure, "database-disconnect");
  assertAccounting(result, failed);
  assertPrivateDataAbsent(result);
});

test("disconnect failure cannot replace an original workload failure", async () => {
  const result = await runHttp({ failRequestAt: 1, failDisconnect: true });
  assert.equal(result.error, result.failure);
  assert.notEqual(result.error, result.cleanupFailure);
  assert.equal(result.records["failed.json"].failure, "http-warmup");
  assert.ok(result.logs.includes("RESOURCE_DISCONNECT_FAILED"));
  assertPrivateDataAbsent(result);
});

test("actual CLI boundary exits unsuccessfully without disclosing assertion response data", async () => {
  const result = await runHttp({ badBodyAt: 1, cli: true });
  assert.equal(result.error, undefined);
  assert.equal(result.exitCode, 1);
  assert.equal(result.records["complete.json"], undefined);
  assert.equal(result.records["failed.json"].failure, "http-warmup");
  assert.equal(
    result.records["failed.json"].stages[0].samples[0].failure,
    "response-check"
  );
  assert.deepEqual(result.logs, ["RESOURCE_MEASUREMENT_FAILED:http-warmup"]);
  assertPrivateDataAbsent(result);
});

const preflightCases = [
  ...[
    "RESEND_API_KEY",
    "MAILERLITE_API_KEY",
    "BLOB_READ_WRITE_TOKEN",
    "BLOB_STORE_ID",
    "GOOGLE_CLIENT_SECRET"
  ].map((provider) => ({
    name: provider,
    provider,
    configReads: 1,
    mediaPathChecks: 1,
    clients: 0,
    gitCalls: 0
  })),
  {
    name: "DATABASE_URL mismatch",
    kind: "database",
    configReads: 1,
    mediaPathChecks: 0,
    clients: 0,
    gitCalls: 0
  },
  {
    name: "malformed configuration JSON",
    kind: "json",
    configReads: 1,
    mediaPathChecks: 0,
    clients: 0,
    gitCalls: 0
  },
  {
    name: "filesystem path failure",
    kind: "filesystem",
    configReads: 0,
    mediaPathChecks: 0,
    clients: 0,
    gitCalls: 0
  },
  {
    name: "dirty source",
    kind: "dirty",
    configReads: 1,
    mediaPathChecks: 1,
    clients: 1,
    gitCalls: 2
  }
];

for (const scenario of preflightCases) {
  test(`full CLI preflight redacts ${scenario.name} before measurement`, async () => {
    const result = await runPreflight(scenario);
    assert.equal(result.exitCode, 1);
    assert.deepEqual(result.logs, ["RESOURCE_MEASUREMENT_FAILED:preflight"]);
    assert.deepEqual(result.records, []);
    assert.deepEqual(result.counters, {
      configReads: scenario.configReads,
      mediaPathChecks: scenario.mediaPathChecks,
      clients: scenario.clients,
      queryListeners: scenario.clients,
      gitCalls: scenario.gitCalls,
      receipts: 0,
      databaseGuards: 0,
      disconnects: 0,
      providerCalls: 0
    });
    for (const canary of Object.values(canaries))
      assert.ok(!result.logs.join("\n").includes(canary));
  });
}

test("full CLI valid preflight reaches the real measurement failure boundary", async () => {
  const result = await runPreflight();
  assert.equal(result.exitCode, 1);
  assert.deepEqual(result.logs, ["RESOURCE_MEASUREMENT_FAILED:fixture-setup"]);
  assert.deepEqual(result.counters, {
    configReads: 1,
    mediaPathChecks: 1,
    clients: 1,
    queryListeners: 1,
    gitCalls: 2,
    receipts: 1,
    databaseGuards: 1,
    disconnects: 1,
    providerCalls: 0
  });
  assert.deepEqual(
    result.records.map((record) => record.name),
    ["started.json", "failed.json"]
  );
  assert.equal(result.records[1].value.outcome, "failed");
  assert.equal(result.records[1].value.failure, "fixture-setup");
  for (const canary of Object.values(canaries))
    assert.ok(!JSON.stringify(result).includes(canary));
});
