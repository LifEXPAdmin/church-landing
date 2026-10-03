// Explicit hosted fictional diagnostic. Never imported by application code.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import {
  readFileSync,
  writeFileSync,
  realpathSync,
  mkdtempSync
} from "node:fs";
import { join, resolve, sep } from "node:path";
import { cpus } from "node:os";
import { PrismaClient, type Prisma } from "@prisma/client";
import { assertPortalTestDatabase } from "./seed-portal";
import { listExchangeListings } from "../lib/platform/exchange-listings";
import type { ExchangeSearchQuery } from "../lib/platform/exchange-options";

assert.equal(process.env.GITHUB_ACTIONS, "true");
assert.equal(process.env.ACCOUNT_TEST_ISOLATED, "1");
const dir = realpathSync(resolve(process.argv[2] ?? ""));
assert.ok(dir.startsWith(realpathSync(".account-test") + sep));
const database = new URL(process.env.DATABASE_URL!);
assert.equal(database.hostname, "127.0.0.1");
assert.equal(database.pathname, "/godschurches_security_test");
for (const name of [
  "RESEND_API_KEY",
  "BLOB_READ_WRITE_TOKEN",
  "MAILERLITE_API_KEY"
])
  assert.equal(process.env[name] || "", "");
const source = execFileSync("git", ["rev-parse", "HEAD"], {
  encoding: "utf8"
}).trim();
assert.equal(source, process.env.VERCEL_GIT_COMMIT_SHA);
assert.equal(
  execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" }).trim(),
  ""
);
const fixtureBytes = readFileSync(join(dir, "resource-fixture.json"));
const fixture = JSON.parse(fixtureBytes.toString());
const digest = (value: string | Buffer) =>
  createHash("sha256").update(value).digest("hex");
const raw = mkdtempSync(join(dir, "exchange-private-"));
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
// Exclude SQL expressions and values from the aggregate artifact. Raw plans and
// parameters remain only in this owned runner fixture, outside artifact paths.
function planSummary(value: Record<string, unknown>): Record<string, unknown> {
  const keys = [
    "Node Type",
    "Relation Name",
    "Index Name",
    "Join Type",
    "Strategy",
    "Plan Rows",
    "Actual Rows",
    "Actual Loops",
    "Actual Total Time",
    "Rows Removed by Filter",
    "Rows Removed by Join Filter",
    "Shared Hit Blocks",
    "Shared Read Blocks",
    "Temp Read Blocks",
    "Temp Written Blocks",
    "Sort Method",
    "Sort Space Used",
    "Sort Space Type"
  ];
  return {
    ...Object.fromEntries(
      keys.filter((key) => key in value).map((key) => [key, value[key]])
    ),
    ...("Plans" in value
      ? { Plans: (value.Plans as Record<string, unknown>[]).map(planSummary) }
      : {})
  };
}
function explain(event: Prisma.QueryEvent, name: string) {
  assert.match(event.query, /^\s*SELECT\s/i);
  assert.ok(
    event.query.includes('FROM "public"."ExchangeListing"') &&
      event.query.includes("ORDER BY")
  );
  const parameters = JSON.parse(event.params).map(literal).join(",");
  const modes = ["auto", "force_custom_plan", "force_generic_plan"];
  let script =
    "SET statement_timeout='15s';\nSET standard_conforming_strings=on;\n";
  for (const mode of modes) {
    script += `SET plan_cache_mode=${mode};\nPREPARE exchange_diagnostic AS ${event.query};\n`;
    for (let n = 0; n < 8; n++) {
      script += `\\o ${literal(join(raw, `${name}-${mode}-${n}.json`))}\n`;
      script += `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) EXECUTE exchange_diagnostic(${parameters});\n`;
      script += `\\o ${literal(join(raw, `${name}-${mode}-${n}-counts.json`))}\n`;
      script +=
        "SELECT json_build_object('custom',custom_plans,'generic',generic_plans) FROM pg_prepared_statements WHERE name='exchange_diagnostic';\n";
    }
    script += "\\o\nDEALLOCATE exchange_diagnostic;\n";
  }
  writeFileSync(join(raw, `${name}.sql`), script, { flag: "wx", mode: 0o600 });
  const result = spawnSync(
    join(process.env.TEST_PG_BIN!, "psql"),
    [database.toString().split("?")[0], "-XqAt", "-v", "ON_ERROR_STOP=1"],
    { input: script, encoding: "utf8", timeout: 180000, maxBuffer: 1024 * 1024 }
  );
  assert.equal(result.status, 0, result.stderr || String(result.error));
  return modes.map((mode) => ({
    mode,
    executions: Array.from({ length: 8 }, (_, n) => {
      const plan = JSON.parse(
        readFileSync(join(raw, `${name}-${mode}-${n}.json`), "utf8")
      )[0];
      return {
        iteration: n + 1,
        milliseconds: plan["Execution Time"],
        planningMilliseconds: plan["Planning Time"],
        counters: JSON.parse(
          readFileSync(join(raw, `${name}-${mode}-${n}-counts.json`), "utf8")
        ),
        plan: planSummary(plan.Plan)
      };
    })
  }));
}

const shapes: Array<{
  name: string;
  query: ExchangeSearchQuery;
  expected: number;
  guest?: boolean;
  second?: boolean;
}> = [
  { name: "newest", query: { q: fixture.marker }, expected: 20 },
  {
    name: "price-low",
    query: {
      q: fixture.marker,
      currency: "USD",
      basis: "item",
      sort: "price-low"
    },
    expected: 20
  },
  {
    name: "price-high",
    query: {
      q: fixture.marker,
      currency: "USD",
      basis: "item",
      sort: "price-high"
    },
    expected: 20
  },
  { name: "selective", query: { q: `${fixture.marker} 11999` }, expected: 1 },
  {
    name: "no-match",
    query: { q: "No fictional listing matches this phrase" },
    expected: 0
  },
  { name: "guest", query: { q: fixture.marker }, guest: true, expected: 20 },
  { name: "owned", query: { q: fixture.marker, mine: true }, expected: 20 },
  {
    name: "second-page",
    query: {
      q: fixture.marker,
      currency: "USD",
      basis: "item",
      sort: "price-low"
    },
    second: true,
    expected: 20
  }
];
const receipt = {
  source,
  fixtureSha256: digest(fixtureBytes),
  startedAt: new Date().toISOString(),
  host: {
    cpu: cpus()[0].model,
    logicalCpus: cpus().length,
    node: process.version
  },
  fixture: fixture.counts,
  databaseVersion: "",
  measurements: [] as unknown[],
  limitations:
    "Fresh client per shape; default pool limit unmeasured. Serial canonical service and separate repeated prepared SQL. Warm fixture on PostgreSQL 16; not HTTP, browser, production capacity or an application change. No new indexes or planner overrides in application code."
};
for (const shape of shapes) {
  const db = new PrismaClient({ log: [{ emit: "event", level: "query" }] });
  let events: Prisma.QueryEvent[] = [];
  let capturing = false;
  db.$on("query", (event) => {
    if (capturing) events.push(event);
  });
  try {
    await assertPortalTestDatabase(db);
    const version = await db.$queryRaw<
      Array<{ version: string }>
    >`SELECT current_setting('server_version') AS version`;
    receipt.databaseVersion = version[0].version;
    const token = shape.guest ? null : fixture.actors[0].token;
    const query = { ...shape.query };
    if (shape.second) {
      const first = await listExchangeListings(db, token, query);
      assert.ok(first.after);
      query.after = first.after;
    }
    let projection = "",
      listing: Prisma.QueryEvent | undefined;
    const samples = [];
    for (let n = 0; n < 9; n++) {
      events = [];
      capturing = true;
      const start = performance.now();
      const value = await listExchangeListings(db, token, query);
      const milliseconds = performance.now() - start;
      capturing = false;
      assert.equal(value.listings.length, shape.expected);
      const current = digest(JSON.stringify(value.listings));
      if (n)
        assert.equal(
          current,
          projection,
          `${shape.name} retains exact listing projection`
        );
      projection = current;
      listing = events.find(
        (event) =>
          event.query.includes('FROM "public"."ExchangeListing"') &&
          event.query.includes("ORDER BY")
      );
      assert.ok(listing, `Capture canonical ${shape.name} listing query`);
      samples.push({
        iteration: n + 1,
        warmup: n === 0,
        milliseconds,
        statements: events.length,
        sqlMilliseconds: events.reduce((sum, event) => sum + event.duration, 0),
        statementsByShape: events.map((event) => ({
          sqlSha256: digest(event.query),
          milliseconds: event.duration,
          listing: event === listing,
          select: /^\s*SELECT/i.test(event.query)
        }))
      });
    }
    assert.ok(listing);
    receipt.measurements.push({
      name: shape.name,
      expectedRows: shape.expected,
      projectionSha256: projection,
      querySha256: digest(listing.query),
      parameterBytes: Buffer.byteLength(listing.params),
      samples,
      plans: explain(listing, shape.name)
    });
    writeFileSync(
      join(dir, "exchange-plans-progress.json"),
      JSON.stringify({ ...receipt, partial: true }, null, 2),
      { mode: 0o600 }
    );
    console.log(
      `Measured ${shape.name}: 9 canonical calls and 24 prepared-plan executions`
    );
  } finally {
    await db.$disconnect();
  }
}
writeFileSync(
  join(dir, "exchange-plans-summary.json"),
  JSON.stringify(
    { ...receipt, completedAt: new Date().toISOString() },
    null,
    2
  ),
  { flag: "wx", mode: 0o600 }
);
console.log(
  "PASS: 72 canonical calls plus one second-page setup read, and 192 prepared-plan executions; aggregate evidence excludes SQL, parameters and credentials."
);
