// Explicit local measurement, never part of the application runtime or CI suite.
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, realpathSync, existsSync } from "node:fs";
import { resolve, sep, join } from "node:path";
import { cpus, totalmem, loadavg } from "node:os";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { PrismaClient } from "@prisma/client";
import { assertPortalTestDatabase } from "../tests/seed-portal.ts";
import { seedResourceBudgetFixture } from "../tests/resource-budget-fixture.ts";
import { readFeed } from "../lib/platform/feed-reads.ts";
import { communitySearch } from "../lib/platform/community-search.ts";
import {
  listExchangeListings,
  readExchangeListing
} from "../lib/platform/exchange-listings.ts";
import { listGroups } from "../lib/platform/group-reads.ts";
import { getCalendarAgenda } from "../lib/platform/calendar-reads.ts";
import { readImage } from "../lib/platform/media.ts";
import { imageStorage } from "../lib/platform/media-storage.ts";
import { sessionCookieFixtureName } from "./session-cookie-fixture.mjs";
import {
  resourceCandidate,
  resourceServingIdentity
} from "./resource-budget-identity.mjs";
import { createResourceResponseBudget } from "./resource-response-budget.mjs";
import {
  createMeasurementReceipts,
  runSettledStage,
  summary
} from "./resource-measurement-receipts.mjs";

let failureCode = "preflight";
async function main() {
  const dir = realpathSync(resolve(process.argv[2] ?? ""));
  assert.ok(dir.startsWith(realpathSync(".account-test") + sep));
  const phase = process.argv[3];
  assert.ok(["seed", "service", "http"].includes(phase));
  const config = JSON.parse(readFileSync(join(dir, "browser-env.json")));
  assert.equal(config.database, process.env.DATABASE_URL);
  assert.equal(new URL(config.origin).hostname, "127.0.0.1");
  assert.equal(new URL(config.origin).protocol, "https:");
  assert.equal(process.env.ACCOUNT_ORIGIN, config.origin);
  assert.equal(process.env.MEDIA_STORAGE_MODE, "local-test");
  assert.ok(realpathSync(process.env.MEDIA_TEST_DIR).startsWith(dir + sep));
  for (const key of [
    "RESEND_API_KEY",
    "MAILERLITE_API_KEY",
    "BLOB_READ_WRITE_TOKEN",
    "BLOB_STORE_ID",
    "GOOGLE_CLIENT_SECRET"
  ])
    assert.equal(
      process.env[key] || "",
      "",
      "Provider credentials are not fixture configuration"
    );
  const db = new PrismaClient({ log: [{ emit: "event", level: "query" }] });
  let capturing = false,
    events = [],
    storeReads = 0;
  db.$on("query", (event) => {
    if (capturing) events.push(event);
  });
  const save = (name, value) =>
    writeFileSync(join(dir, name), JSON.stringify(value, null, 2), {
      mode: 0o600,
      flag: "wx"
    });
  const source = execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8"
  }).trim();
  assert.equal(
    execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" }).trim(),
    "",
    "RESOURCE_DIRTY_SOURCE"
  );
  const host = {
    node: process.version,
    environment:
      process.env.GITHUB_ACTIONS === "true"
        ? "hosted-isolated"
        : "local-isolated",
    cpu: cpus()[0].model,
    logicalCpus: cpus().length,
    memoryBytes: totalmem(),
    loadAverage: loadavg()
  };
  async function databaseStats() {
    const [row] =
      await db.$queryRaw`SELECT current_setting('server_version') AS version, numbackends, xact_commit, xact_rollback, blks_read, blks_hit, temp_bytes, deadlocks, pg_database_size(current_database()) AS bytes FROM pg_stat_database WHERE datname=current_database()`;
    return Object.fromEntries(
      Object.entries(row).map(([key, value]) => [
        key,
        typeof value === "bigint" ? Number(value) : value
      ])
    );
  }
  let receipts, receiptState, primaryFailure;
  async function measure() {
    failureCode = "fixture-setup";
    try {
      try {
        if (phase !== "seed") {
          receipts = createMeasurementReceipts(dir, phase);
          receiptState = {
            schema: 1,
            attempt: receipts.id,
            phase,
            source,
            host,
            startedAt: new Date().toISOString(),
            candidate: null,
            productionWrites: 0,
            externalProviderCalls: 0
          };
          receipts.write("started.json", receiptState);
        }
        await assertPortalTestDatabase(db);
        if (phase === "seed") {
          console.log(JSON.stringify(await seedResourceBudgetFixture(db, dir)));
        } else {
          const fixtureBytes = readFileSync(join(dir, "resource-fixture.json"));
          const fixture = JSON.parse(fixtureBytes);
          const candidate = resourceCandidate(
            JSON.parse(readFileSync(join(dir, "measurement-candidate.json"))),
            {
              source,
              buildId: readFileSync(".next/BUILD_ID", "utf8").trim(),
              fixtureSha256: createHash("sha256")
                .update(fixtureBytes)
                .digest("hex")
            }
          );
          receiptState.candidate = candidate;
          receiptState.buildId = candidate.buildId;
          receiptState.fixture = fixture.counts;
          if (phase === "service") {
            failureCode = "service-prerequisite";
            assert.equal(
              existsSync(join(dir, "service-budget.json")),
              false,
              "RESOURCE_SERVICE_RECEIPT_EXISTS"
            );
          }
          failureCode = "cursor-preparation";
          const actor = fixture.actors[0],
            token = actor.token;
          const range = {
            from: "2026-10-01",
            until: "2026-10-31",
            timeZone: "UTC"
          };
          const storage = imageStorage();
          const countedStorage = {
            ...storage,
            get: (...args) => {
              storeReads++;
              return storage.get(...args);
            }
          };
          const cursorFile = join(dir, "feed-cursors.json");
          if (!existsSync(cursorFile)) {
            assert.equal(
              phase,
              "service",
              "Prepare the service receipt before HTTP measurement"
            );
            const cursors = [],
              creation = [];
            for (const current of fixture.actors) {
              const row = {};
              for (const mode of ["latest", "following"]) {
                events = [];
                capturing = true;
                const start = performance.now();
                let result;
                try {
                  result = await readFeed(db, current.token, { mode });
                } finally {
                  capturing = false;
                }
                const ms = performance.now() - start;
                assert.equal(result.posts.length, 30);
                row[mode] = { cursor: result.pageCursor, scope: result.scope };
                creation.push({
                  mode,
                  ms,
                  statements: events.length,
                  selects: events.filter((e) => /^\s*SELECT/i.test(e.query))
                    .length
                });
              }
              cursors.push(row);
            }
            save("feed-cursors.json", {
              candidate,
              createdAt: new Date().toISOString(),
              cursors,
              creation
            });
          }
          const feedSetup = JSON.parse(readFileSync(cursorFile));
          assert.deepEqual(
            feedSetup.candidate,
            candidate,
            "RESOURCE_CURSOR_CANDIDATE"
          );
          const calls = [
            {
              name: "feed-latest",
              run: () => readFeed(db, token, { mode: "latest" }),
              rows: (x) => x.posts.length,
              expected: 30
            },
            {
              name: "feed-following",
              run: () =>
                readFeed(db, token, {
                  mode: "following",
                  ...feedSetup.cursors[0].following
                }),
              rows: (x) => x.posts.length,
              expected: 30
            },
            {
              name: "search-posts",
              run: () =>
                communitySearch(db, token, { q: "capacity", kind: "posts" }),
              rows: (x) => x.items.length,
              expected: 20
            },
            {
              name: "search-people",
              run: () =>
                communitySearch(db, token, { q: "Capacity", kind: "people" }),
              rows: (x) => x.items.length,
              expected: 20
            },
            {
              name: "exchange-newest",
              run: () => listExchangeListings(db, token, { q: fixture.marker }),
              rows: (x) => x.listings.length,
              expected: 20
            },
            {
              name: "exchange-price",
              run: () =>
                listExchangeListings(db, token, {
                  q: fixture.marker,
                  currency: "USD",
                  basis: "item",
                  sort: "price-low"
                }),
              rows: (x) => x.listings.length,
              expected: 20
            },
            {
              name: "exchange-detail",
              run: () => readExchangeListing(db, token, "budget-listing-00000")
            },
            {
              name: "groups",
              run: () => listGroups(db, token, { q: fixture.marker }),
              rows: (x) => x.groups.length,
              expected: 20
            },
            {
              name: "calendar-200",
              run: () =>
                getCalendarAgenda(db, token, {
                  calendarIds: [fixture.calendarIds[0]],
                  ...range
                }),
              rows: (x) => x.events.length,
              expected: 200
            },
            {
              name: "image-thumb",
              run: () =>
                readImage(db, token, fixture.mediaId, "thumb", countedStorage)
            },
            {
              name: "image-medium",
              run: () =>
                readImage(db, token, fixture.mediaId, "medium", countedStorage)
            }
          ];
          if (phase === "service") {
            const measurements = [],
              captured = [];
            const counts = {
              warmupAttempts: 0,
              warmupCompleted: 0,
              measuredAttempts: 0,
              validated: 0
            };
            receiptState.measurements = measurements;
            receiptState.counts = counts;
            for (const call of calls) {
              const samples = [];
              const row = {
                name: call.name,
                outcome: "in-progress",
                samples,
                warmup: { attempted: true, completed: false, ms: null }
              };
              measurements.push(row);
              failureCode = "service-warmup";
              counts.warmupAttempts++;
              const warmupStart = performance.now();
              try {
                await call.run(); // No result-cache bypass or permissions change.
                row.warmup.completed = true;
                counts.warmupCompleted++;
              } finally {
                row.warmup.ms = performance.now() - warmupStart;
              }
              failureCode = "service-sample";
              for (let i = 0; i < 20; i++) {
                events = [];
                storeReads = 0;
                const sample = {
                  ms: null,
                  selects: 0,
                  statements: 0,
                  sqlMs: 0,
                  bytes: null,
                  gzipBytes: null,
                  rows: null,
                  storeReads: 0,
                  validated: false,
                  failure: null
                };
                samples.push(sample);
                const start = performance.now();
                let operation = "service-call";
                counts.measuredAttempts++;
                capturing = true;
                try {
                  const result = await call.run();
                  sample.ms = performance.now() - start;
                  capturing = false;
                  operation = "service-response-check";
                  if (call.rows)
                    assert.equal(call.rows(result), call.expected, call.name);
                  const bytes = Buffer.isBuffer(result)
                    ? result
                    : Buffer.from(JSON.stringify(result));
                  Object.assign(sample, {
                    bytes: bytes.length,
                    gzipBytes: gzipSync(bytes).length,
                    rows: call.rows?.(result) ?? null,
                    validated: true
                  });
                  counts.validated++;
                } catch (error) {
                  sample.failure = operation;
                  throw error;
                } finally {
                  capturing = false;
                  sample.ms ??= performance.now() - start;
                  sample.selects = events.filter((e) =>
                    /^\s*SELECT/i.test(e.query)
                  ).length;
                  sample.statements = events.length;
                  sample.sqlMs = events.reduce((n, e) => n + e.duration, 0);
                  sample.storeReads = storeReads;
                }
                captured.push(
                  ...events
                    .filter(
                      (e) =>
                        /^\s*SELECT/i.test(e.query) &&
                        !/pg_advisory/.test(e.query)
                    )
                    .map((e) => ({ ...e, group: call.name }))
                );
              }
              Object.assign(row, {
                outcome: "complete",
                milliseconds: summary(samples.map((x) => x.ms)),
                selects: summary(samples.map((x) => x.selects)),
                statements: summary(samples.map((x) => x.statements)),
                sqlMilliseconds: summary(samples.map((x) => x.sqlMs)),
                bytes: summary(samples.map((x) => x.bytes)),
                gzipBytes: summary(samples.map((x) => x.gzipBytes)),
                storeReads: summary(samples.map((x) => x.storeReads))
              });
              receipts.write(`stage-${call.name}.json`, {
                ...receiptState,
                stage: row
              });
              console.log(
                JSON.stringify({
                  name: row.name,
                  milliseconds: row.milliseconds,
                  selects: row.selects,
                  bytes: row.bytes,
                  storeReads: row.storeReads
                })
              );
            }
            // Raw SQL stays private and is never selected by the artifact workflow.
            receipts.write("private-service-query-events.json", captured);
            failureCode = "service-database-after";
            Object.assign(receiptState, {
              concurrency: 1,
              warmupsPerPath: 1,
              measuredCalls: counts.validated,
              feedCreation: feedSetup.creation,
              database: await databaseStats()
            });
          } else {
            failureCode = "http-prerequisite";
            Object.assign(receiptState, {
              totalCalls: 0,
              activeRequests: 0,
              totalBytes: 0,
              totalReceivedBytes: 0,
              warmupRequests: 0,
              measuredRequests: 0,
              stages: []
            });
            const ready = JSON.parse(
              readFileSync(join(dir, "server-ready.json"))
            );
            assert.deepEqual(
              JSON.parse(readFileSync(join(dir, "service-budget.json")))
                .candidate,
              candidate,
              "RESOURCE_SERVICE_CANDIDATE"
            );
            const identityProbes = { attempted: 0, verified: 0 };
            receiptState.identityProbes = identityProbes;
            const verifyServing = async () => {
              identityProbes.attempted++;
              const response = await fetch(
                config.origin + "/api/platform/release",
                {
                  redirect: "error",
                  signal: AbortSignal.timeout(15000)
                }
              );
              assert.equal(response.status, 200, "RESOURCE_IDENTITY_RESPONSE");
              resourceServingIdentity(
                candidate,
                ready,
                await response.json(),
                config.origin
              );
              identityProbes.verified++;
            };
            failureCode = "identity-before";
            await verifyServing();
            receiptState.runtimeSource = ready.runtimeSource;
            const paths = [
              [
                "feed-latest",
                (i) =>
                  "/platform?" +
                  new URLSearchParams({
                    feed: "latest",
                    feedCursor: feedSetup.cursors[i].latest.cursor,
                    feedScope: feedSetup.cursors[i].latest.scope
                  })
              ],
              [
                "feed-following",
                (i) =>
                  "/platform?" +
                  new URLSearchParams({
                    feed: "following",
                    feedCursor: feedSetup.cursors[i].following.cursor,
                    feedScope: feedSetup.cursors[i].following.scope
                  })
              ],
              [
                "search-posts",
                () => "/api/platform/search?kind=posts&q=capacity"
              ],
              [
                "search-people",
                () => "/api/platform/search?kind=people&q=Capacity"
              ],
              [
                "exchange-newest",
                () =>
                  "/api/platform/exchange?q=" +
                  encodeURIComponent(fixture.marker)
              ],
              [
                "exchange-price",
                () =>
                  "/api/platform/exchange?currency=USD&basis=item&sort=price-low&q=" +
                  encodeURIComponent(fixture.marker)
              ],
              [
                "groups",
                () =>
                  "/api/platform/groups?q=" + encodeURIComponent(fixture.marker)
              ],
              [
                "calendar-200",
                (i) =>
                  "/api/platform/calendars?view=agenda&calendarId=" +
                  fixture.calendarIds[i] +
                  "&" +
                  new URLSearchParams(range)
              ],
              [
                "image-thumb",
                () => "/api/platform/images/" + fixture.mediaId + "/thumb"
              ],
              [
                "image-medium",
                () => "/api/platform/images/" + fixture.mediaId + "/medium"
              ]
            ];
            const responseBudget = createResourceResponseBudget(
              256 * 1024 * 1024,
              8 * 1024 * 1024
            );
            let totalCalls = 0,
              active = 0;
            const stages = [];
            Object.assign(receiptState, {
              stages,
              workload: { warmup: 20, measured: 900, maximumCalls: 920 },
              maximumRetainedBytes: 256 * 1024 * 1024,
              maximumResponseRetainedBytes: 8 * 1024 * 1024,
              mix: paths.map(([name]) => ({ name, percent: 10 })),
              limitations:
                "Warm loopback HTTPS, no think time or network shaping. Local filesystem image store in an isolated environment. Not production-equivalent hosted capacity or physical-device acceptance. Received bytes count chunks delivered to the reader, not wire/transport bytes. Identity probes are separate from workload calls."
            });
            const snapshot = () =>
              Object.assign(receiptState, {
                totalCalls,
                activeRequests: active,
                totalBytes: responseBudget.totalBytes,
                totalReceivedBytes: responseBudget.totalReceivedBytes,
                warmupRequests: stages
                  .filter((s) => s.kind === "warmup")
                  .reduce((n, s) => n + s.samples.length, 0),
                measuredRequests: stages
                  .filter((s) => s.kind === "measured")
                  .reduce((n, s) => n + s.samples.length, 0)
              });
            snapshot();
            failureCode = "http-database-before";
            receiptState.databaseBefore = await databaseStats();
            async function call(index, actorIndex, samples) {
              if (
                totalCalls >= 920 ||
                responseBudget.totalBytes >= 256 * 1024 * 1024
              ) {
                const error = new Error("Local experiment budget reached");
                responseBudget.abort(error);
                throw error;
              }
              responseBudget.signal.throwIfAborted();
              const [name, path] = paths[index],
                current = fixture.actors[actorIndex];
              const row = {
                name,
                ms: null,
                status: null,
                receivedBytes: 0,
                bytes: 0,
                responseReceived: false,
                bodyComplete: false,
                validated: false,
                cacheNoStore: null,
                imageWebp: null,
                failure: null
              };
              const start = performance.now();
              let operation = "request";
              totalCalls++;
              active++;
              samples.push(row);
              try {
                const response = await fetch(config.origin + path(actorIndex), {
                  redirect: "manual",
                  signal: AbortSignal.any([
                    responseBudget.signal,
                    AbortSignal.timeout(20000)
                  ]),
                  headers: {
                    cookie:
                      sessionCookieFixtureName(config.origin) +
                      "=" +
                      current.token,
                    "x-expected-account": current.id
                  }
                });
                row.responseReceived = true;
                row.status = response.status;
                operation = "response-body";
                const bytes = await responseBudget.read(
                  response.body,
                  (progress) => {
                    row.receivedBytes = progress.receivedBytes;
                    row.bytes = progress.retainedBytes;
                  }
                );
                row.bodyComplete = true;
                row.ms = performance.now() - start;
                operation = "response-check";
                assert.equal(row.status, 200, "RESOURCE_RESPONSE_STATUS");
                if (name.startsWith("feed"))
                  assert.match(bytes.toString(), /Fictional capacity update/);
                else if (!name.startsWith("image")) {
                  const result = JSON.parse(bytes.toString());
                  const count = name.startsWith("search")
                    ? result.items.length
                    : name.startsWith("exchange")
                      ? result.listings.length
                      : name === "groups"
                        ? result.groups.length
                        : result.events.length;
                  assert.equal(count, name === "calendar-200" ? 200 : 20, name);
                  row.cacheNoStore = /no-store/.test(
                    response.headers.get("cache-control") ?? ""
                  );
                  assert.equal(
                    row.cacheNoStore,
                    true,
                    "RESOURCE_RESPONSE_CACHE"
                  );
                } else {
                  row.imageWebp = /image\/webp/.test(
                    response.headers.get("content-type") ?? ""
                  );
                  assert.equal(row.imageWebp, true, "RESOURCE_RESPONSE_IMAGE");
                }
                row.validated = true;
              } catch (error) {
                row.failure = operation;
                responseBudget.abort(error);
                throw error;
              } finally {
                row.ms ??= performance.now() - start;
                active--;
              }
            }
            const plan = [
              { kind: "warmup", concurrency: 1, count: 20 },
              ...[1, 5, 25].map((concurrency) => ({
                kind: "measured",
                concurrency,
                count: 300
              }))
            ];
            for (const [stageIndex, planned] of plan.entries()) {
              const stage = {
                ...planned,
                outcome: "in-progress",
                peakInFlight: 0,
                samples: []
              };
              stages.push(stage);
              const stageStart = performance.now();
              failureCode =
                planned.kind === "warmup" ? "http-warmup" : "http-stage";
              let stageFailure;
              try {
                await runSettledStage({
                  count: planned.count,
                  concurrency: planned.concurrency,
                  signal: responseBudget.signal,
                  abort: (error) => responseBudget.abort(error),
                  call: (index, actorIndex) => {
                    const pending = call(
                      index % paths.length,
                      actorIndex,
                      stage.samples
                    );
                    stage.peakInFlight = Math.max(stage.peakInFlight, active);
                    return pending;
                  }
                });
                stage.outcome = "complete";
              } catch (error) {
                stageFailure = error;
                stage.outcome = "failed";
              }
              assert.equal(active, 0, "RESOURCE_UNSETTLED_REQUESTS");
              stage.elapsedMs = performance.now() - stageStart;
              stage.attempted = stage.samples.length;
              stage.responsesReceived = stage.samples.filter(
                (x) => x.responseReceived
              ).length;
              stage.bodiesCompleted = stage.samples.filter(
                (x) => x.bodyComplete
              ).length;
              stage.validated = stage.samples.filter((x) => x.validated).length;
              stage.requestsPerSecond =
                stage.validated / (stage.elapsedMs / 1000);
              stage.measurements = paths.map(([name]) => {
                const rows = stage.samples.filter(
                  (x) => x.name === name && x.validated
                );
                return {
                  name,
                  count: rows.length,
                  milliseconds: summary(rows.map((x) => x.ms)),
                  bytes: summary(rows.map((x) => x.bytes)),
                  statuses: [...new Set(rows.map((x) => x.status))]
                };
              });
              snapshot();
              try {
                receipts.write(`stage-${stageIndex}.json`, {
                  ...receiptState,
                  stage
                });
              } catch (writeError) {
                if (!stageFailure) throw writeError;
                console.error("RESOURCE_STAGE_RECEIPT_WRITE_FAILED");
              }
              if (stageFailure) throw stageFailure;
              console.log(
                JSON.stringify({
                  kind: stage.kind,
                  concurrency: stage.concurrency,
                  peak: stage.peakInFlight,
                  elapsedMs: stage.elapsedMs,
                  measurements: stage.measurements
                })
              );
            }
            failureCode = "identity-after";
            await verifyServing();
            failureCode = "http-database-after";
            receiptState.databaseAfter = await databaseStats();
            snapshot();
          }
        }
      } catch (error) {
        primaryFailure = error;
        throw error;
      } finally {
        capturing = false;
        try {
          await db.$disconnect();
        } catch (error) {
          if (!primaryFailure) {
            failureCode = "database-disconnect";
            throw error;
          }
          console.error("RESOURCE_DISCONNECT_FAILED");
        }
      }
      if (receipts) {
        failureCode =
          phase === "service" ? "service-publication" : "http-publication";
        const completed = {
          ...receiptState,
          outcome: "complete",
          completedAt: new Date().toISOString()
        };
        if (phase === "service") {
          // Immutable compatibility prerequisite, published once per fresh fixture.
          save("service-budget.json", completed);
        }
        receipts.write("complete.json", completed);
      }
    } catch (error) {
      primaryFailure = error;
      if (receipts) {
        try {
          for (const row of receiptState.measurements ?? []) {
            if (row.outcome === "in-progress") {
              row.outcome = "failed";
              try {
                receipts.write(`stage-${row.name}.json`, {
                  ...receiptState,
                  stage: row
                });
              } catch {
                console.error("RESOURCE_STAGE_RECEIPT_WRITE_FAILED");
              }
            }
          }
          receipts.write("failed.json", {
            ...receiptState,
            outcome: "failed",
            failure: failureCode,
            completedAt: new Date().toISOString()
          });
        } catch {
          // An evidence-write failure must not replace the original workload error.
          console.error("RESOURCE_FAILURE_RECEIPT_WRITE_FAILED");
        }
      }
      throw error;
    }
  }
  await measure();
}
// Preserve original exceptions internally; redact initialization and measurement
// failures at the CLI boundary, including assertion inputs and filesystem paths.
await main().catch(() => {
  console.error(`RESOURCE_MEASUREMENT_FAILED:${failureCode}`);
  process.exitCode = 1;
});
