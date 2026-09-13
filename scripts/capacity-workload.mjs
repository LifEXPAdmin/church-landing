import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { cpus, totalmem } from "node:os";
import { isDeepStrictEqual } from "node:util";
import { PrismaClient } from "@prisma/client";
import { assertPortalTestDatabase } from "../tests/seed-portal.ts";
import { participationCommand } from "../lib/platform/post-participation.ts";
import { releases } from "../lib/platform/release-content.ts";

const db = new PrismaClient(),
  dir = process.env.CAPACITY_FIXTURE_DIR;
await assertPortalTestDatabase(db);
const { origin } = JSON.parse(
  await readFile(join(dir, "browser-env.json"), "utf8")
);
assert.equal(new URL(origin).hostname, "127.0.0.1");
const f = JSON.parse(await readFile(join(dir, "actors.json"), "utf8"));
const seconds = Number(process.argv[2]);
const groups = {},
  checks = [],
  health = [];
const retryComparisons = { matched: 0, different: 0, transportRejected: 0 };
let active = 0,
  maxActive = 0;
async function call(actor, path, body, group) {
  const started = performance.now();
  active++;
  maxActive = Math.max(maxActive, active);
  let status = 0,
    bytes = 0,
    data;
  try {
    const response = await fetch(origin + path, {
      method: body ? "POST" : "GET",
      redirect: "manual",
      signal: AbortSignal.timeout(45000),
      headers: {
        cookie: `church_platform_session=${actor.token}`,
        origin,
        "content-type": "application/json",
        "x-expected-account": actor.id
      },
      ...(body ? { body: JSON.stringify(body) } : {})
    });
    status = response.status;
    const text = await response.text();
    bytes = Buffer.byteLength(text);
    data = response.headers.get("content-type")?.includes("application/json")
      ? JSON.parse(text)
      : text;
  } catch (error) {
    data = { error: error.name };
  } finally {
    active--;
  }
  const ms = performance.now() - started;
  if (group) {
    const g = (groups[group] ??= { latencies: [], statuses: {}, bytes: 0 });
    g.latencies.push(ms);
    g.statuses[status] = (g.statuses[status] ?? 0) + 1;
    g.bytes += bytes;
  }
  return { status, data, ms, bytes };
}
function check(name, pass, details) {
  const existing = checks.find(
    (entry) =>
      entry.name === name &&
      entry.group === details?.group &&
      entry.pass === Boolean(pass)
  );
  if (existing) {
    existing.occurrences = (existing.occurrences ?? 1) + 1;
    return;
  }
  checks.push({ name, pass: Boolean(pass), ...details });
}
function participationReceipt(value) {
  assert.equal(typeof value.id, "string");
  assert.ok(Number.isInteger(value.version) && value.version > 0);
  return { id: value.id, version: value.version };
}
async function retryPair(actor, path, body, group) {
  const results = await Promise.all([
    call(actor, path, body, group),
    call(actor, path, body, group)
  ]);
  const accepted = results.filter((r) => r.status === 200);
  if (accepted.length !== 2) retryComparisons.transportRejected++;
  // Participation explicitly distinguishes "saved" from "already saved" in
  // its human acknowledgement; canonical identity/version must remain stable.
  else if (
    isDeepStrictEqual(
      ...accepted.map((row) =>
        path === "/api/platform/participation"
          ? participationReceipt(row.data)
          : row.data
      )
    )
  )
    retryComparisons.matched++;
  else {
    retryComparisons.different++;
    check("exact-retry-result", false, { group });
  }
  return results;
}
const percentile = (values, p) =>
  values.length
    ? Math.round(
        [...values].sort((a, b) => a - b)[Math.ceil(values.length * p) - 1] * 10
      ) / 10
    : null;
try {
  for (let i = 0; i < 30; i++) {
    if (
      (await call(f.actors[0], "/api/platform/post-likes?postId=cap-post-1"))
        .status === 200
    )
      break;
    await delay(500);
  }
  const builtRelease = await call(f.actors[0], "/api/platform/release");
  assert.equal(builtRelease.status, 200);
  assert.equal(
    builtRelease.data.product?.version,
    releases[0].version,
    "Build the current candidate before measuring it"
  );
  // Failures are evidence: retain the result and continue independent probes.
  await retryPair(
    f.actors[0],
    "/api/platform/participation",
    {
      operation: "vote",
      postId: f.postId,
      pollVersion: f.poll.version,
      expectedVersion: 0,
      optionIds: [f.poll.options[0].id]
    },
    "poll-retry"
  );
  // Separate the canonical transaction race from the real shared-IP transport
  // budget. Do not disable or forge around that HTTP abuse protection.
  const serviceBody = {
    operation: "volunteer",
    postId: f.postId,
    slotId: f.serviceSlot.id,
    slotVersion: f.serviceSlot.version,
    expectedVersion: 0
  };
  const serviceStart = performance.now();
  const serviceRace = await Promise.allSettled(
    f.actors.map((actor) => participationCommand(db, actor.token, serviceBody))
  );
  const serviceWinner = serviceRace.findIndex(
    (row) => row.status === "fulfilled"
  );
  check(
    "100-writer-canonical-final-slot",
    serviceRace.filter((row) => row.status === "fulfilled").length === 1 &&
      serviceRace.every(
        (row) => row.status === "fulfilled" || row.reason.status === 409
      ) &&
      (await db.postVolunteerSignup.count({
        where: { slotId: f.serviceSlot.id, state: "ACTIVE" }
      })) === 1,
    { elapsedMs: Math.round(performance.now() - serviceStart) }
  );
  if (serviceWinner >= 0) {
    const replay = await participationCommand(
      db,
      f.actors[serviceWinner].token,
      serviceBody
    );
    check(
      "canonical-volunteer-retry",
      isDeepStrictEqual(
        participationReceipt(replay),
        participationReceipt(serviceRace[serviceWinner].value)
      )
    );
  }
  const raceBody = {
    operation: "volunteer",
    postId: f.postId,
    slotId: f.slot.id,
    slotVersion: f.slot.version,
    expectedVersion: 0
  };
  const raceStart = performance.now();
  const race = await Promise.all(
    f.actors.map((actor) =>
      call(actor, "/api/platform/participation", raceBody, "final-slot-race")
    )
  );
  const winner = race.findIndex((r) => r.status === 200);
  const signups = await db.postVolunteerSignup.count({
    where: { slotId: f.slot.id, state: "ACTIVE" }
  });
  check(
    "100-request-shared-IP-burst-safety",
    race.filter((r) => r.status === 200).length === 1 &&
      signups === 1 &&
      race.every((r) => [200, 409, 429].includes(r.status)),
    {
      committed: signups,
      accepted: race.filter((r) => r.status === 200).length,
      throttled: race.filter((r) => r.status === 429).length,
      elapsedMs: Math.round(performance.now() - raceStart)
    }
  );
  if (winner >= 0)
    await retryPair(
      f.actors[winner],
      "/api/platform/participation",
      raceBody,
      "volunteer-retry"
    );
  await retryPair(
    f.actors[0],
    "/api/platform/reposts",
    {
      operation: "repost",
      mutationId: randomUUID(),
      sourceId: "cap-post-1001",
      expectedSourceVersion: 1
    },
    "repost-retry"
  );
  const denied = await call(
    f.outsider,
    `/api/platform/comments?postId=${f.postId}`,
    undefined,
    "private-source-denied"
  );
  check("other-church-source-hidden", denied.status === 404);

  // Warm each measured reader before resetting database counters.
  const reader = (n) => {
    const post = `cap-post-${1 + (n % 100)}`;
    switch (n % 4) {
      case 0:
        return ["/platform", "feed-html"];
      case 1:
        return [`/platform/posts/${post}`, "detail-html"];
      case 2:
        return ["/api/platform/search?q=capacity&kind=posts", "search-api"];
      default:
        return [`/api/platform/comments?postId=${post}`, "comments-api"];
    }
  };
  for (let n = 0; n < 4; n++) {
    const [path] = reader(n),
      result = await call(f.actors[n], path);
    check(`warm-reader-${n}`, result.status === 200, {
      ms: Math.round(result.ms),
      bytes: result.bytes
    });
  }
  await db.$queryRaw`SELECT pg_stat_statements_reset()::text`;
  maxActive = 0;
  const cpuBefore = cpus().map((c) => c.times);
  const startedAt = new Date(),
    start = performance.now(),
    deadline = start + seconds * 1000;
  console.log(
    JSON.stringify({
      workloadStarted: startedAt.toISOString(),
      seconds,
      clients: 50,
      thinkTimeMs: 2000
    })
  );
  let sampleDone = false;
  const sample = (async () => {
    while (!sampleDone) {
      const activity =
        await db.$queryRaw`SELECT state, wait_event_type, count(*)::integer AS count FROM pg_stat_activity WHERE datname = current_database() GROUP BY state, wait_event_type`;
      health.push({
        elapsedSeconds: Math.round((performance.now() - start) / 1000),
        activeRequests: active,
        activity
      });
      await delay(5000);
    }
  })();
  await Promise.all(
    f.actors.slice(0, 50).map(async (actor, index) => {
      let round = 0;
      // Stagger client arrivals, then keep each client's sequence bounded.
      await delay(index * 40);
      while (performance.now() < deadline) {
        const n = round++ + index;
        if (n % 20 === 0) {
          const mutationId = randomUUID();
          await retryPair(
            actor,
            "/api/platform/comments",
            {
              operation: "create",
              postId: `cap-post-${1 + (index % 100)}`,
              mutationId,
              content: `Fictional measured comment ${mutationId}`
            },
            "comment-write-retry"
          );
        } else if (n % 20 === 1) {
          // Different post per round, avoiding an invented version overwrite.
          await retryPair(
            actor,
            "/api/platform/post-likes",
            {
              postId: `cap-post-${1000 + index * 1000 + round}`,
              mutationId: randomUUID(),
              expectedVersion: 0,
              desired: true
            },
            "like-write-retry"
          );
        } else {
          const [path, group] = reader(n);
          await call(actor, path, undefined, group);
        }
        await delay(2000);
      }
    })
  );
  sampleDone = true;
  await sample;
  const elapsedSeconds = (performance.now() - start) / 1000;
  const cpuAfter = cpus().map((c) => c.times);
  let cpuTotal = 0,
    cpuIdle = 0;
  cpuAfter.forEach((times, i) => {
    for (const key of Object.keys(times))
      cpuTotal += times[key] - cpuBefore[i][key];
    cpuIdle += times.idle - cpuBefore[i].idle;
  });
  const statements = await db.$queryRaw`
    SELECT queryid::text, calls::text, total_exec_time, mean_exec_time, rows::text,
      shared_blks_hit::text, shared_blks_read::text, temp_blks_written::text, query
    FROM pg_stat_statements WHERE dbid = (SELECT oid FROM pg_database WHERE datname = current_database())
    ORDER BY total_exec_time DESC LIMIT 30`;
  const totals =
    await db.$queryRaw`SELECT sum(calls)::text AS calls, sum(total_exec_time) AS execution_ms FROM pg_stat_statements WHERE dbid = (SELECT oid FROM pg_database WHERE datname = current_database())`;
  const duplicates =
    await db.$queryRaw`SELECT count(*)::integer AS count FROM (SELECT content FROM "PlatformPostComment" WHERE content LIKE 'Fictional measured comment %' GROUP BY content HAVING count(*) > 1) d`;
  check("no-duplicate-comment-commits", duplicates[0].count === 0);
  check(
    "one-canonical-poll-ballot",
    (await db.postPollBallot.count({ where: { pollId: f.poll.id } })) === 1
  );
  check(
    "one-canonical-repost",
    (await db.platformPost.count({
      where: { authorId: f.actors[0].id, repostSourceId: "cap-post-1001" }
    })) === 1
  );
  const summary = Object.fromEntries(
    Object.entries(groups).map(([name, g]) => [
      name,
      {
        count: g.latencies.length,
        statuses: g.statuses,
        p50Ms: percentile(g.latencies, 0.5),
        p95Ms: percentile(g.latencies, 0.95),
        maxMs: Math.round(Math.max(...g.latencies)),
        averageBytes: Math.round(g.bytes / g.latencies.length)
      }
    ])
  );
  const result = {
    fixture: f.counts,
    environment: {
      cpu: cpus()[0].model,
      logicalCpus: cpus().length,
      memoryBytes: totalmem(),
      node: process.version,
      database:
        "PostgreSQL 17, loopback, default settings plus pg_stat_statements/IO timing",
      prismaPool: 20,
      transport: "production Next build, local HTTPS proxy",
      cache:
        "warmed readers and VACUUM ANALYZE; application authenticated no-store",
      externalProviders: "disabled; no production requests",
      mixedClients: 50,
      thinkTimeMs: 2000
    },
    startedAt,
    productVersion: builtRelease.data.product.version,
    buildIdentity: builtRelease.data.release,
    elapsedSeconds,
    maxActive,
    hostCpuBusyPercent: Math.round(1000 * (1 - cpuIdle / cpuTotal)) / 10,
    summary,
    checks,
    retryComparisons,
    databaseTotals: totals,
    statements,
    health
  };
  await writeFile(join(dir, "result.json"), JSON.stringify(result, null, 2), {
    mode: 0o600
  });
  console.log(
    JSON.stringify({
      summary,
      checks,
      elapsedSeconds,
      maxActive,
      databaseTotals: totals
    })
  );
} catch (error) {
  await writeFile(
    join(dir, "failure.json"),
    JSON.stringify({ error: error.message, checks }, null, 2),
    { mode: 0o600 }
  );
  throw error;
} finally {
  await db.$disconnect();
}
