// Explicit isolated experiment; not a hosted load or a public latency claim.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { PrismaClient, type Prisma } from "@prisma/client";
import { assertPortalTestDatabase, createPortalActor } from "./seed-portal";
import { listExchangeListings } from "../lib/platform/exchange-listings";
import {
  discoveryPlaceBands,
  searchDiscoveryPlaces
} from "../lib/platform/discovery-places";
import type { ExchangeSearchQuery } from "../lib/platform/exchange-options";
const db = new PrismaClient({ log: [{ emit: "event", level: "query" }] });
let capture = false;
const events: Prisma.QueryEvent[] = [];
db.$on("query", (event) => {
  if (capture) events.push(event);
});
const literal = (value: unknown): string => {
  if (value === null) return "NULL";
  if (Array.isArray(value))
    return value.length ? `ARRAY[${value.map(literal).join(",")}]` : "'{}'";
  if (typeof value === "boolean") return String(value);
  if (typeof value === "number") {
    assert.ok(Number.isFinite(value));
    return String(value);
  }
  assert.equal(typeof value, "string");
  return "'" + String(value).replaceAll("'", "''") + "'";
};
function explain(event: Prisma.QueryEvent) {
  const args = JSON.parse(event.params).map(literal).join(",");
  const result = spawnSync(
    join(
      process.env.TEST_PG_BIN ?? "/opt/homebrew/opt/postgresql@17/bin",
      "psql"
    ),
    [process.env.DATABASE_URL!.split("?")[0], "-XqAt", "-v", "ON_ERROR_STOP=1"],
    {
      input: `PREPARE exchange_cost AS ${event.query};\nEXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) EXECUTE exchange_cost(${args});\nDEALLOCATE exchange_cost;\n`,
      encoding: "utf8",
      maxBuffer: 10 * 1024 * 1024
    }
  );
  assert.equal(result.status, 0, result.stderr);
  const plan = JSON.parse(result.stdout)[0];
  const indexes: string[] = [];
  const walk = (node: Record<string, unknown>) => {
    if (node["Index Name"]) indexes.push(String(node["Index Name"]));
    for (const child of (node.Plans ?? []) as Record<string, unknown>[])
      walk(child);
  };
  walk(plan.Plan);
  return {
    ms: plan["Execution Time"],
    indexes,
    sharedHitBlocks: plan.Plan["Shared Hit Blocks"],
    rows: plan.Plan["Actual Rows"]
  };
}
try {
  await assertPortalTestDatabase(db);
  const owner = await createPortalActor(db, "excostowner"),
    viewer = await createPortalActor(db, "excostviewer");
  const center = (await searchDiscoveryPlaces("US", "Chicago")).places[0].id;
  const bands = await discoveryPlaceBands("US", center, 250),
    marker = "Fictional cost " + randomUUID();
  const at = new Date(Date.now() - 60000);
  for (let page = 0; page < 24; page++)
    await db.exchangeListing.createMany({
      data: Array.from({ length: 500 }, (_, i) => ({
        ownerId: owner.id,
        creatorId: owner.id,
        title: marker,
        description: "Isolated listing fixture. ".repeat(10),
        intent: "SALE",
        state: "ACTIVE",
        currency: "USD",
        priceMinor: (((page * 500 + i) * 53) % 99999) + 1,
        country: "US",
        placeId: bands[i % bands.length].placeIds[0],
        placeLabel: "Fictional catalog town",
        condition: "GOOD",
        category: "BOOKS",
        publishedAt: at,
        updatedAt: at,
        confirmedAt: at,
        itemPolicy: "exchange-listings-v2"
      }))
    });
  await db.$executeRawUnsafe('ANALYZE "ExchangeListing"');
  const queries: [string, ExchangeSearchQuery][] = [
    ["newest", { q: marker }],
    [
      "price-low",
      { q: marker, currency: "USD", basis: "item", sort: "price-low" }
    ],
    [
      "price-high",
      { q: marker, currency: "USD", basis: "item", sort: "price-high" }
    ],
    [
      "nearest",
      {
        q: marker,
        country: "US",
        placeId: center,
        radiusKm: 250,
        sort: "nearest"
      }
    ]
  ];
  async function measure(phase: string) {
    for (const [name, query] of queries) {
      const times: number[] = [];
      let bytes = 0,
        count = 0;
      let listing: Prisma.QueryEvent | undefined;
      for (let repeat = 0; repeat < 7; repeat++) {
        events.length = 0;
        capture = true;
        const start = performance.now(),
          result = await listExchangeListings(db, viewer.token, query);
        times.push(performance.now() - start);
        capture = false;
        assert.equal(result.listings.length, 20);
        assert.ok(result.after);
        assert.equal(new Set(result.listings.map((row) => row.id)).size, 20);
        bytes = Buffer.byteLength(JSON.stringify(result));
        count = events.length;
        listing = events.find(
          (event) =>
            event.query.includes('FROM "public"."ExchangeListing"') &&
            event.query.includes("ORDER BY")
        );
      }
      times.sort((a, b) => a - b);
      console.log(
        JSON.stringify({
          phase,
          name,
          fixtureRows: 12000,
          totalQueries: count,
          projectionBytes: bytes,
          medianMs: times[3],
          slowestMs: times.at(-1),
          plan: listing ? explain(listing) : null
        })
      );
    }
  }
  await measure("existing-indexes");
  await db.$executeRawUnsafe(
    'CREATE INDEX "fixture_exchange_price_order" ON "ExchangeListing" (currency, intent, state, "priceMinor", "publishedAt" DESC, id DESC)'
  );
  await db.$executeRawUnsafe('ANALYZE "ExchangeListing"');
  await measure("candidate-price-index");
  await db.$executeRawUnsafe('DROP INDEX "fixture_exchange_price_order"');
} finally {
  await db.$disconnect();
}
