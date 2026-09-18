// Explicit local measurement, never part of the application runtime or CI suite.
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, realpathSync, existsSync } from "node:fs";
import { resolve, sep, join } from "node:path";
import { cpus, totalmem, loadavg } from "node:os";
import { spawnSync } from "node:child_process";
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
    mode: 0o600
  });
const percentile = (values, p) =>
  [...values].sort((a, b) => a - b)[Math.ceil(values.length * p) - 1];
const summary = (values) => ({
  count: values.length,
  min: Math.min(...values),
  p50: percentile(values, 0.5),
  p95: percentile(values, 0.95),
  max: Math.max(...values)
});
const source = spawnSync("git", ["rev-parse", "HEAD"], {
  encoding: "utf8"
}).stdout.trim();
const host = {
  cpu: cpus()[0].model,
  logicalCpus: cpus().length,
  memoryBytes: totalmem(),
  loadAverage: loadavg()
};
async function databaseStats() {
  const [row] =
    await db.$queryRaw`SELECT numbackends, xact_commit, xact_rollback, blks_read, blks_hit, temp_bytes, deadlocks, pg_database_size(current_database()) AS bytes FROM pg_stat_database WHERE datname=current_database()`;
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [
      key,
      typeof value === "bigint" ? Number(value) : value
    ])
  );
}
try {
  await assertPortalTestDatabase(db);
  if (phase === "seed") {
    console.log(JSON.stringify(await seedResourceBudgetFixture(db, dir)));
  } else {
    const fixture = JSON.parse(
      readFileSync(join(dir, "resource-fixture.json"))
    );
    const actor = fixture.actors[0],
      token = actor.token;
    const range = { from: "2026-10-01", until: "2026-10-31", timeZone: "UTC" };
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
          const result = await readFeed(db, current.token, { mode });
          const ms = performance.now() - start;
          capturing = false;
          assert.equal(result.posts.length, 30);
          row[mode] = { cursor: result.pageCursor, scope: result.scope };
          creation.push({
            mode,
            ms,
            statements: events.length,
            selects: events.filter((e) => /^\s*SELECT/i.test(e.query)).length
          });
        }
        cursors.push(row);
      }
      save("feed-cursors.json", {
        createdAt: new Date().toISOString(),
        cursors,
        creation
      });
    }
    const feedSetup = JSON.parse(readFileSync(cursorFile));
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
        run: () => communitySearch(db, token, { q: "capacity", kind: "posts" }),
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
      const startedAt = new Date().toISOString(),
        measurements = [],
        captured = [];
      for (const call of calls) {
        await call.run(); // Unmeasured warmup; no result cache bypass or permissions change.
        const samples = [];
        for (let i = 0; i < 20; i++) {
          events = [];
          storeReads = 0;
          capturing = true;
          const start = performance.now(),
            result = await call.run(),
            ms = performance.now() - start;
          capturing = false;
          if (call.rows)
            assert.equal(call.rows(result), call.expected, call.name);
          const bytes = Buffer.isBuffer(result)
            ? result
            : Buffer.from(JSON.stringify(result));
          samples.push({
            ms,
            selects: events.filter((e) => /^\s*SELECT/i.test(e.query)).length,
            statements: events.length,
            sqlMs: events.reduce((n, e) => n + e.duration, 0),
            bytes: bytes.length,
            gzipBytes: gzipSync(bytes).length,
            rows: call.rows?.(result) ?? null,
            storeReads
          });
          captured.push(
            ...events
              .filter(
                (e) =>
                  /^\s*SELECT/i.test(e.query) && !/pg_advisory/.test(e.query)
              )
              .map((e) => ({ ...e, group: call.name }))
          );
        }
        const row = {
          name: call.name,
          samples,
          milliseconds: summary(samples.map((x) => x.ms)),
          selects: summary(samples.map((x) => x.selects)),
          statements: summary(samples.map((x) => x.statements)),
          sqlMilliseconds: summary(samples.map((x) => x.sqlMs)),
          bytes: summary(samples.map((x) => x.bytes)),
          gzipBytes: summary(samples.map((x) => x.gzipBytes)),
          storeReads: summary(samples.map((x) => x.storeReads))
        };
        measurements.push(row);
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
      save("service-query-events.json", captured);
      save("service-budget.json", {
        startedAt,
        completedAt: new Date().toISOString(),
        source,
        host,
        concurrency: 1,
        warmupsPerPath: 1,
        measuredCalls: measurements.length * 20,
        fixture: fixture.counts,
        feedCreation: feedSetup.creation,
        measurements,
        database: await databaseStats(),
        productionWrites: 0,
        externalProviderCalls: 0
      });
    } else {
      const ready = JSON.parse(readFileSync(join(dir, "server-ready.json")));
      assert.equal(ready.origin, config.origin);
      const identity = await (
        await fetch(config.origin + "/api/platform/release")
      ).json();
      assert.equal(identity.release, ready.runtimeSource);
      assert.equal(identity.product.version, "2026.09.18.8");
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
        ["search-posts", () => "/api/platform/search?kind=posts&q=capacity"],
        ["search-people", () => "/api/platform/search?kind=people&q=Capacity"],
        [
          "exchange-newest",
          () => "/api/platform/exchange?q=" + encodeURIComponent(fixture.marker)
        ],
        [
          "exchange-price",
          () =>
            "/api/platform/exchange?currency=USD&basis=item&sort=price-low&q=" +
            encodeURIComponent(fixture.marker)
        ],
        [
          "groups",
          () => "/api/platform/groups?q=" + encodeURIComponent(fixture.marker)
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
      let totalBytes = 0,
        totalCalls = 0,
        active = 0;
      const startedAt = new Date().toISOString(),
        stages = [],
        databaseBefore = await databaseStats();
      async function call(index, actorIndex, measured) {
        assert.ok(
          totalCalls < 1000 && totalBytes < 256 * 1024 * 1024,
          "Local experiment budget reached"
        );
        totalCalls++;
        active++;
        const [name, path] = paths[index],
          current = fixture.actors[actorIndex];
        const start = performance.now();
        try {
          const response = await fetch(config.origin + path(actorIndex), {
            redirect: "manual",
            signal: AbortSignal.timeout(20000),
            headers: {
              cookie: "church_platform_session=" + current.token,
              "x-expected-account": current.id
            }
          });
          const bytes = Buffer.from(await response.arrayBuffer());
          totalBytes += bytes.length;
          assert.ok(
            bytes.length <= 8 * 1024 * 1024 && totalBytes <= 256 * 1024 * 1024,
            "Local response-byte budget exceeded"
          );
          const row = {
            name,
            ms: performance.now() - start,
            status: response.status,
            bytes: bytes.length,
            cache: response.headers.get("cache-control")
          };
          assert.equal(row.status, 200, JSON.stringify(row));
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
            assert.match(row.cache ?? "", /no-store/);
          } else
            assert.match(
              response.headers.get("content-type") ?? "",
              /image\/webp/
            );
          if (measured) measured.push(row);
        } finally {
          active--;
        }
      }
      for (let n = 0; n < paths.length * 2; n++)
        await call(n % paths.length, 0);
      for (const concurrency of [1, 5, 25]) {
        const samples = [],
          stageStart = performance.now();
        let next = 0,
          peak = 0;
        await Promise.all(
          Array.from({ length: concurrency }, async (_, actorIndex) => {
            while (next < 300) {
              const n = next++;
              const pending = call(n % paths.length, actorIndex, samples);
              peak = Math.max(peak, active);
              await pending;
            }
          })
        );
        const elapsedMs = performance.now() - stageStart;
        const measurements = paths.map(([name]) => {
          const rows = samples.filter((x) => x.name === name);
          return {
            name,
            count: rows.length,
            milliseconds: summary(rows.map((x) => x.ms)),
            bytes: summary(rows.map((x) => x.bytes)),
            statuses: [...new Set(rows.map((x) => x.status))]
          };
        });
        const stage = {
          concurrency,
          peakInFlight: peak,
          elapsedMs,
          requestsPerSecond: samples.length / (elapsedMs / 1000),
          measurements,
          samples
        };
        stages.push(stage);
        save("http-budget-progress.json", {
          startedAt,
          source,
          runtimeSource: ready.runtimeSource,
          host,
          stages,
          totalCalls,
          totalBytes
        });
        console.log(
          JSON.stringify({ concurrency, peak, elapsedMs, measurements })
        );
      }
      save("http-budget.json", {
        startedAt,
        completedAt: new Date().toISOString(),
        source,
        runtimeSource: ready.runtimeSource,
        buildId: ready.buildId,
        host,
        fixture: fixture.counts,
        warmupRequests: 20,
        measuredRequests: 900,
        mix: paths.map(([name]) => ({ name, percent: 10 })),
        stages,
        totalCalls,
        totalBytes,
        databaseBefore,
        databaseAfter: await databaseStats(),
        productionWrites: 0,
        externalProviderCalls: 0,
        limitations:
          "Warm loopback HTTPS, no think time or network shaping. Local filesystem image store. Shared Mac, not hosted capacity or physical-device acceptance."
      });
    }
  }
} finally {
  await db.$disconnect();
}
