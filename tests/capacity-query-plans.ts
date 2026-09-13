import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { PrismaClient, type Prisma } from "@prisma/client";
import { assertPortalTestDatabase } from "./seed-portal";
import { listPosts, getPost } from "../lib/platform/post-reads";
import { communitySearch } from "../lib/platform/community-search";
import { readComments } from "../lib/platform/comment-reads";

const db = new PrismaClient({ log: [{ emit: "event", level: "query" }] });
const dir = process.env.CAPACITY_FIXTURE_DIR!;
const events: Prisma.QueryEvent[] = [];
let capture = false;
db.$on("query", (event) => {
  if (capture) events.push(event);
});
try {
  await assertPortalTestDatabase(db);
  const f = JSON.parse(await readFile(join(dir, "actors.json"), "utf8"));
  const token = f.actors[0].token;
  const reads: Array<[string, () => Promise<unknown>]> = [
    ["feed", () => listPosts(db, token, { feed: true })],
    ["detail", () => getPost(db, token, "cap-post-1")],
    [
      "search",
      () => communitySearch(db, token, { q: "capacity", kind: "posts" })
    ],
    [
      "comments",
      () => readComments(db, token, { postId: "cap-post-1", view: "roots" })
    ]
  ];
  const counts = [];
  const projections: Record<string, unknown> = {};
  for (const [name, read] of reads) {
    const before = events.length,
      start = performance.now();
    capture = true;
    const result = await read();
    projections[name] = result;
    capture = false;
    counts.push({
      name,
      queries: events.length - before,
      ms: performance.now() - start,
      projectionBytes: Buffer.byteLength(JSON.stringify(result))
    });
  }
  // Re-execute actual captured reads after the timed workload, with PostgreSQL
  // inferring each prepared parameter's type. SQL/parameters remain private.
  const literal = (value: unknown): string => {
    if (value === null) return "NULL";
    if (Array.isArray(value))
      return value.length ? `ARRAY[${value.map(literal).join(",")}]` : "'{}'";
    if (typeof value === "boolean") return String(value);
    if (typeof value === "number") {
      assert.ok(Number.isFinite(value));
      return String(value);
    }
    assert.equal(typeof value, "string", "Unsupported captured parameter");
    return "'" + String(value).replaceAll("'", "''") + "'";
  };
  const seen = new Set<string>();
  const slow = events
    .filter((e) => /^SELECT\s/i.test(e.query) && !/pg_advisory/.test(e.query))
    .sort((a, b) => b.duration - a.duration)
    .filter((e) => {
      if (seen.has(e.query)) return false;
      seen.add(e.query);
      return true;
    })
    .slice(0, 12);
  const plans = slow.map((event) => {
    const parameters = JSON.parse(event.params).map(literal).join(",");
    const sql = `PREPARE capacity_read AS ${event.query};\nEXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) EXECUTE capacity_read${parameters ? `(${parameters})` : ""};\nDEALLOCATE capacity_read;\n`;
    const result = spawnSync(
      join(
        process.env.TEST_PG_BIN ?? "/opt/homebrew/opt/postgresql@17/bin",
        "psql"
      ),
      [
        process.env.DATABASE_URL!.split("?")[0],
        "-XqAt",
        "-v",
        "ON_ERROR_STOP=1"
      ],
      { input: sql, encoding: "utf8", maxBuffer: 10 * 1024 * 1024 }
    );
    assert.equal(result.status, 0, result.stderr);
    return {
      query: event.query,
      durationMs: event.duration,
      plan: JSON.parse(result.stdout)
    };
  });
  await writeFile(
    join(dir, "query-plans.json"),
    JSON.stringify({ counts, plans }, null, 2),
    { mode: 0o600 }
  );
  await writeFile(
    join(dir, "reader-projections.json"),
    JSON.stringify(projections),
    { mode: 0o600 }
  );
  console.log(JSON.stringify({ counts, explained: plans.length }));
} finally {
  await db.$disconnect();
}
