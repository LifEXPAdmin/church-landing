// Explicit fictional-fixture experiment, never an application or hosted load path.
import assert from "node:assert/strict";
import { readFileSync, realpathSync, writeFileSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { createHash } from "node:crypto";
import { loadavg } from "node:os";
import { PrismaClient, type Prisma } from "@prisma/client";
import { assertPortalTestDatabase } from "./seed-portal";
import { listExchangeListings } from "../lib/platform/exchange-listings";
import type { ExchangeSearchQuery } from "../lib/platform/exchange-options";
import { listGroups } from "../lib/platform/group-reads";

const dir = realpathSync(resolve(process.argv[2] ?? ""));
assert.ok(dir.startsWith(realpathSync(".account-test") + sep));
const config = JSON.parse(readFileSync(join(dir, "browser-env.json"), "utf8"));
assert.equal(config.database, process.env.DATABASE_URL);
for (const key of [
  "RESEND_API_KEY",
  "MAILERLITE_API_KEY",
  "BLOB_READ_WRITE_TOKEN"
])
  assert.equal(process.env[key] || "", "");
const url = new URL(config.database);
url.searchParams.set("connection_limit", "1");
const freshConnections = process.argv[3] === "fresh";
const walkPages = process.argv[3] === "walk";
assert.ok([undefined, "fresh", "walk"].includes(process.argv[3]));
const attemptId = new Date().toISOString().replaceAll(/[^0-9]/g, "");
const receiptName = `query-index-experiment${walkPages ? "-walk" : freshConnections ? "-fresh" : ""}-${attemptId}`;
const clientOptions = {
  datasources: { db: { url: url.href } },
  log: [{ emit: "event", level: "query" }] as const
};
const client = () =>
  new PrismaClient({ ...clientOptions, log: [...clientOptions.log] });
let db = client();
let events: Prisma.QueryEvent[] = [];
db.$on("query", (event) => events.push(event));
const indexes = ["fixture_c21_price_low", "fixture_c21_price_high"];
const created: string[] = [];
const result: Record<string, unknown> = {
  status: "failed",
  attemptId,
  startedAt: new Date().toISOString(),
  loadAverage: loadavg(),
  connectionLimit: 1,
  freshConnections,
  walkPages,
  samplesPerPath: 15,
  phases: []
};
const digest = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
try {
  await assertPortalTestDatabase(db);
  assert.equal(await db.exchangeListing.count(), 12000);
  assert.equal(
    await db.platformUser.count({
      where: { NOT: { email: { endsWith: "example.test" } } }
    }),
    0
  );
  for (const index of indexes) {
    const rows = await db.$queryRawUnsafe<Array<{ relation: string | null }>>(
      "SELECT to_regclass($1)::text AS relation",
      "public." + index
    );
    assert.equal(rows[0].relation, null, "Preserve any previous experiment");
  }
  const fixture = JSON.parse(
    readFileSync(join(dir, "resource-fixture.json"), "utf8")
  );
  const token = fixture.actors[0].token;
  const low: ExchangeSearchQuery = {
    q: fixture.marker,
    currency: "USD",
    basis: "item",
    sort: "price-low"
  };
  const high: ExchangeSearchQuery = { ...low, sort: "price-high" };
  if (walkPages) {
    await db.$executeRawUnsafe(
      `CREATE INDEX "${indexes[0]}" ON "ExchangeListing" (currency,intent,state,"priceMinor","publishedAt" DESC,id DESC)`
    );
    created.push(indexes[0]);
    await db.$disconnect();
    db = client();
    db.$on("query", (event) => events.push(event));
    const walks = [];
    const traversalQueries: ExchangeSearchQuery[] = [
      low,
      high,
      { q: fixture.marker }
    ];
    for (const query of traversalQueries) {
      const found: string[] = [];
      let after: string | undefined;
      let pages = 0;
      const start = performance.now();
      do {
        assert.ok(
          pages < 601,
          "Traversal must terminate within the fixture bound"
        );
        events = [];
        const page = await listExchangeListings(db, token, { ...query, after });
        assert.ok(page.listings.length <= 20);
        found.push(...page.listings.map((row) => row.id));
        after = page.after ?? undefined;
        pages++;
        if (pages % 100 === 0)
          console.log(JSON.stringify({ walk: query.sort ?? "newest", pages }));
      } while (after);
      const expectedRows = Array.from({ length: 12000 }, (_, i) => ({
        id: `budget-listing-${String(i).padStart(5, "0")}`,
        price: ((i * 53) % 99999) + 1
      }));
      expectedRows.sort(
        (a, b) =>
          (query.sort === "price-low"
            ? a.price - b.price
            : query.sort === "price-high"
              ? b.price - a.price
              : 0) || b.id.localeCompare(a.id)
      );
      assert.deepEqual(
        found,
        expectedRows.map((row) => row.id)
      );
      assert.equal(new Set(found).size, 12000);
      walks.push({
        sort: query.sort ?? "newest",
        pages,
        rows: found.length,
        ms: performance.now() - start,
        hash: digest(found)
      });
    }
    const groupIds: string[] = [];
    let after: string | undefined,
      pages = 0;
    do {
      assert.ok(pages < 52);
      events = [];
      const page = await listGroups(db, token, { q: fixture.marker, after });
      assert.ok(page.groups.length <= 20);
      groupIds.push(...page.groups.map((row) => row.id));
      after = page.nextCursor ?? undefined;
      pages++;
    } while (after);
    assert.deepEqual(
      groupIds,
      Array.from(
        { length: 1000 },
        (_, i) => `budget-group-${String(i).padStart(4, "0")}`
      )
    );
    result.walks = walks;
    result.groupWalk = { pages, rows: groupIds.length, hash: digest(groupIds) };
    console.log(JSON.stringify({ walks, groupWalk: result.groupWalk }));
  } else {
    const patterns: Array<{
      name: string;
      query: ExchangeSearchQuery;
      token?: string;
    }> = [
      { name: "low", query: low, token },
      { name: "high", query: high, token },
      { name: "newest", query: { q: fixture.marker }, token },
      { name: "low-range", query: { ...low, minPriceMinor: 90000 }, token },
      {
        name: "low-one",
        query: { ...low, q: fixture.marker + " 11999" },
        token
      },
      {
        name: "low-none",
        query: { ...low, q: "Fictional query without any matching listing" },
        token
      },
      { name: "guest-low", query: low },
      { name: "own-low", query: { ...low, mine: true }, token }
    ];
    for (const query of [low, high]) {
      const first = await listExchangeListings(db, token, query);
      assert.ok(first.after);
      patterns.push({
        name: query.sort + "-second",
        query: { ...query, after: first.after },
        token
      });
    }
    // Bind every repeated read to its original time and cursor. Compare full
    // projections, not only counts; the experiment cannot change any source rows.
    const expected = new Map<string, string>();
    for (const pattern of patterns) {
      const page = await listExchangeListings(db, pattern.token, pattern.query);
      pattern.query = { ...pattern.query, after: page.pageCursor };
      expected.set(pattern.name, digest(page));
    }
    for (const phase of ["baseline", "low-index", "both-indexes"]) {
      if (phase !== "baseline") {
        const index = phase === "low-index" ? indexes[0] : indexes[1];
        const direction = phase === "low-index" ? "ASC" : "DESC";
        await db.$executeRawUnsafe(
          `CREATE INDEX "${index}" ON "ExchangeListing" (currency,intent,state,"priceMinor" ${direction},"publishedAt" DESC,id DESC)`
        );
        created.push(index);
      }
      if (freshConnections) {
        await db.$disconnect();
        db = client();
        db.$on("query", (event) => events.push(event));
      }
      const samples = [];
      for (const pattern of patterns) {
        const times: number[] = [];
        let lastEvents: Prisma.QueryEvent[] = [];
        let rows = 0;
        for (let repeat = 0; repeat < 15; repeat++) {
          events = [];
          const start = performance.now();
          const page = await listExchangeListings(
            db,
            pattern.token,
            pattern.query
          );
          times.push(performance.now() - start);
          assert.equal(digest(page), expected.get(pattern.name), pattern.name);
          assert.ok(page.listings.length <= 20);
          rows = page.listings.length;
          lastEvents = events;
        }
        const sorted = [...times].sort((a, b) => a - b);
        const sample = {
          name: pattern.name,
          rows,
          times,
          p50: sorted[7],
          p95: sorted[14],
          statements: lastEvents.length,
          hash: expected.get(pattern.name),
          queryEvents: lastEvents
        };
        samples.push(sample);
        console.log(
          JSON.stringify({
            phase,
            name: sample.name,
            rows,
            p50: sample.p50,
            p95: sample.p95,
            statements: sample.statements
          })
        );
      }
      const sizes = await db.$queryRawUnsafe(
        "SELECT relname,pg_relation_size(oid) AS bytes FROM pg_class WHERE relname IN ($1,$2)",
        ...indexes
      );
      (result.phases as unknown[]).push({ phase, samples, sizes });
      writeFileSync(
        join(dir, `${receiptName}-progress.json`),
        JSON.stringify(
          result,
          (_, value) => (typeof value === "bigint" ? Number(value) : value),
          2
        ),
        { mode: 0o600 }
      );
    }
  }
  result.status = "passed";
} finally {
  const removed: string[] = [];
  try {
    for (const index of created.reverse()) {
      await db.$executeRawUnsafe(`DROP INDEX "${index}"`);
      removed.push(index);
    }
  } catch (error) {
    result.status = "failed";
    result.cleanupFailed = true;
    throw error;
  } finally {
    result.removedIndexes = removed;
    result.finishedAt = new Date().toISOString();
    try {
      await db.$disconnect();
    } finally {
      writeFileSync(
        join(dir, `${receiptName}.json`),
        JSON.stringify(
          result,
          (_, value) => (typeof value === "bigint" ? Number(value) : value),
          2
        ),
        { mode: 0o600, flag: "wx" }
      );
    }
  }
}
