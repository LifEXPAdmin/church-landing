import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { cpus, totalmem } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readOperationalHealth } from "../lib/platform/operational-health.ts";
import { isDeepStrictEqual } from "node:util";
import { PrismaClient } from "@prisma/client";
import { assertPortalTestDatabase } from "../tests/seed-portal.ts";

const db = new PrismaClient();
await assertPortalTestDatabase(db);
assert.equal(process.env.CAPACITY_STAIRCASE, "1");
const dir = process.env.CAPACITY_FIXTURE_DIR;
const { origin } = JSON.parse(
  await readFile(join(dir, "browser-env.json"), "utf8")
);
assert.equal(new URL(origin).hostname, "127.0.0.1");
const fixture = JSON.parse(await readFile(join(dir, "actors.json"), "utf8"));
assert.equal(fixture.actors.length, 100);
assert.equal(fixture.media.length, 100);
const photo = await readFile(join(dir, "fictional-photo.jpg"));
const { appPid } = JSON.parse(
  await readFile(join(dir, "runtime.json"), "utf8")
);
assert.ok(Number.isInteger(appPid) && appPid > 0);
const execute = promisify(execFile);
const seconds = Number(process.argv[2]);
assert.ok(Number.isInteger(seconds) && seconds >= 10 && seconds <= 1800);
const stages = [],
  integrity = [],
  createdImages = [];
let active = 0,
  peak = 0;
const percentile = (values, p) =>
  values.length
    ? [...values].sort((a, b) => a - b)[Math.ceil(values.length * p) - 1]
    : null;
const check = (name, pass, details = {}) =>
  integrity.push({ name, pass: !!pass, ...details });

async function call(actor, path, group, stats, body, extraHeaders = {}) {
  const started = performance.now();
  active++;
  peak = Math.max(peak, active);
  let status = 0,
    bytes = 0,
    data = null;
  try {
    const response = await fetch(origin + path, {
      method: body ? "POST" : "GET",
      redirect: "manual",
      signal: AbortSignal.timeout(45_000),
      headers: {
        cookie: `church_platform_session=${actor.token}`,
        origin,
        "x-expected-account": actor.id,
        ...(body ? { "content-type": "application/json" } : {}),
        ...extraHeaders
      },
      ...(body
        ? { body: Buffer.isBuffer(body) ? body : JSON.stringify(body) }
        : {})
    });
    status = response.status;
    const raw = Buffer.from(await response.arrayBuffer());
    bytes = raw.length;
    data = response.headers.get("content-type")?.includes("application/json")
      ? JSON.parse(raw.toString())
      : response.headers.get("content-type")?.startsWith("image/")
        ? { sha256: createHash("sha256").update(raw).digest("hex") }
        : null;
  } catch (error) {
    data = { error: error.name };
  } finally {
    active--;
  }
  const elapsed = performance.now() - started;
  if (stats) {
    const record = (stats[group] ??= { latencies: [], statuses: {}, bytes: 0 });
    record.latencies.push(elapsed);
    record.statuses[status] = (record.statuses[status] ?? 0) + 1;
    record.bytes += bytes;
  }
  return { status, data, bytes, elapsed };
}

try {
  const release = await call(fixture.actors[0], "/api/platform/release");
  assert.equal(release.status, 200);
  const anonymousHealth = await call(
    fixture.actors[0],
    "/api/maintenance/health"
  );
  check("health-account-cookie-denied", anonymousHealth.status === 401);
  const authorizedHealth = await call(
    fixture.actors[0],
    "/api/maintenance/health",
    null,
    null,
    null,
    { authorization: `Bearer ${process.env.CRON_SECRET}` }
  );
  check(
    "built-health-aggregate-available",
    [200, 503].includes(authorizedHealth.status) &&
      authorizedHealth.data.database.available === true
  );
  for (const clients of [25, 50, 100]) {
    const duration = clients === 100 ? seconds : Math.min(seconds, 180);
    const stats = {},
      samples = [],
      retry = { matching: 0, different: 0, throttled: 0 };
    const startedAt = new Date().toISOString(),
      started = performance.now(),
      deadline = started + duration * 1000;
    const cpuBefore = cpus().map((c) => c.times);
    peak = 0;
    let sampling = true;
    const samplingErrors = [];
    const sampler = (async () => {
      while (sampling) {
        try {
          const rows =
            await db.$queryRaw`SELECT state,wait_event_type,count(*)::integer AS connections FROM pg_stat_activity WHERE datname=current_database() GROUP BY state,wait_event_type`;
          samples.push({
            seconds: (performance.now() - started) / 1000,
            inFlight: active,
            rows,
            appProcess: (
              await execute("ps", ["-o", "rss=,%cpu=", "-p", String(appPid)], {
                timeout: 2000
              })
            ).stdout
              .trim()
              .split(/\s+/)
              .map(Number)
          });
        } catch (error) {
          samplingErrors.push(error.name);
        }
        for (let i = 0; i < 10 && sampling; i++) await delay(500);
      }
    })();
    console.log(
      JSON.stringify({
        stageStarted: startedAt,
        clients,
        durationSeconds: duration
      })
    );
    try {
      await Promise.all(
        fixture.actors.slice(0, clients).map(async (actor, index) => {
          let round = 0,
            uploaded = false;
          await delay((index * 2000) / clients);
          while (performance.now() < deadline) {
            const n = round++ + index;
            if (!uploaded && n % 20 === 2) {
              uploaded = true;
              const result = await call(
                actor,
                "/api/platform/images",
                "photo-upload",
                stats,
                photo,
                {
                  "content-type": "image/jpeg",
                  "x-image-details": encodeURIComponent(
                    JSON.stringify({
                      purpose: "PROFILE_PHOTO",
                      targetId: actor.id,
                      requestKey: randomUUID(),
                      audience: "ONLY_ME"
                    })
                  )
                }
              );
              if (result.status === 200)
                createdImages.push({ id: result.data.id, ownerId: actor.id });
            } else if (n % 20 === 0 || n % 20 === 1) {
              const comment = n % 20 === 0;
              const path = comment
                ? "/api/platform/comments"
                : "/api/platform/post-likes";
              const body = comment
                ? {
                    operation: "create",
                    postId: `cap-post-${1 + index}`,
                    mutationId: randomUUID(),
                    content: "Fictional staircase comment " + randomUUID()
                  }
                : {
                    postId: `cap-post-${2000 + clients * 100 + index * 50 + round}`,
                    mutationId: randomUUID(),
                    expectedVersion: 0,
                    desired: true
                  };
              const results = await Promise.all([
                call(
                  actor,
                  path,
                  comment ? "comment-write" : "like-write",
                  stats,
                  body
                ),
                call(
                  actor,
                  path,
                  comment ? "comment-write" : "like-write",
                  stats,
                  body
                )
              ]);
              if (results.every((r) => r.status === 200)) {
                if (isDeepStrictEqual(results[0].data, results[1].data))
                  retry.matching++;
                else retry.different++;
              } else if (results.every((r) => [200, 429].includes(r.status)))
                retry.throttled++;
            } else {
              const picture =
                fixture.media[(index + round) % fixture.media.length];
              const reads = [
                ["/platform", "feed-html"],
                [`/platform/posts/cap-post-${1 + (n % 100)}`, "detail-html"],
                ["/api/platform/search?q=capacity&kind=posts", "search"],
                [
                  `/api/platform/comments?postId=cap-post-${1 + (n % 100)}`,
                  "comments"
                ],
                [`/api/platform/avatars/${picture.ownerId}`, "avatar"],
                [`/api/platform/images/${picture.id}/medium`, "photo-medium"],
                [
                  "/api/platform/search?q=capacity&kind=people",
                  "people-search"
                ],
                [`/api/platform/avatars/${picture.ownerId}`, "avatar"]
              ];
              const [path, group] = reads[n % reads.length];
              const response = await call(actor, path, group, stats);
              if (
                group === "avatar" &&
                response.status === 200 &&
                response.bytes !== picture.variants.thumb.bytes
              )
                check("avatar-byte-integrity", false, { clients });
            }
            await delay(2000);
          }
        })
      );
    } finally {
      sampling = false;
      await sampler;
    }
    const elapsedSeconds = (performance.now() - started) / 1000,
      cpuAfter = cpus().map((c) => c.times);
    let all = 0,
      idle = 0;
    cpuAfter.forEach((c, i) => {
      for (const k of Object.keys(c)) all += c[k] - cpuBefore[i][k];
      idle += c.idle - cpuBefore[i].idle;
    });
    const summary = Object.fromEntries(
      Object.entries(stats).map(([name, row]) => [
        name,
        {
          requests: row.latencies.length,
          p50Ms: percentile(row.latencies, 0.5),
          p95Ms: percentile(row.latencies, 0.95),
          statuses: row.statuses,
          bytes: row.bytes
        }
      ])
    );
    const requests = Object.values(summary).reduce((n, r) => n + r.requests, 0);
    const expectedThrottles = Object.entries(summary)
      .filter(([n]) =>
        ["photo-upload", "comment-write", "like-write"].includes(n)
      )
      .reduce((n, [, r]) => n + (r.statuses[429] ?? 0), 0);
    const failures =
      Object.values(summary).reduce(
        (n, r) =>
          n +
          Object.entries(r.statuses).reduce(
            (m, [code, count]) => m + (code === "200" ? 0 : count),
            0
          ),
        0
      ) - expectedThrottles;
    check("exact-retry-receipts", retry.different === 0, { clients, ...retry });
    check(
      "unexpected-response-target",
      requests > 0 && failures / requests < 0.01,
      { clients, failures, requests }
    );
    const data =
      await db.$queryRaw`SELECT pg_database_size(current_database())::text AS bytes,numbackends,xact_commit,xact_rollback,blks_read,blks_hit,temp_bytes FROM pg_stat_database WHERE datname=current_database()`;
    const stage = {
      clients,
      durationSeconds: duration,
      startedAt,
      elapsedSeconds,
      requests,
      requestsPerSecond: requests / elapsedSeconds,
      peakInFlight: peak,
      expectedThrottles,
      unexpectedResponses: failures,
      hostCpuBusyPercent: 100 * (1 - idle / all),
      summary,
      retry,
      samples,
      health: await readOperationalHealth(db),
      samplingErrors,
      database: data.map((row) =>
        Object.fromEntries(
          Object.entries(row).map(([k, v]) => [
            k,
            typeof v === "bigint" ? v.toString() : v
          ])
        )
      )
    };
    check(
      "resource-samples-available",
      samples.length > 0 && samplingErrors.length === 0,
      { clients }
    );
    stages.push(stage);
    await writeFile(
      join(dir, "staircase-progress.json"),
      JSON.stringify({ stages, integrity }, null, 2),
      { mode: 0o600 }
    );
    console.log(
      JSON.stringify({
        stageFinished: clients,
        requests,
        peakInFlight: peak,
        expectedThrottles,
        unexpectedResponses: failures,
        p95Feed: summary["feed-html"]?.p95Ms
      })
    );
    if (failures / requests >= 0.01 || retry.different || samplingErrors.length)
      break;
  }
  for (const image of createdImages.slice(0, 3)) {
    const owner = fixture.actors.find((a) => a.id === image.ownerId),
      other = fixture.actors.find((a) => a.id !== image.ownerId);
    const own = await call(owner, `/api/platform/images/${image.id}/thumb`);
    const denied = await call(other, `/api/platform/images/${image.id}/thumb`);
    check(
      "private-upload-owner-only",
      own.status === 200 && denied.status === 404
    );
  }
  const result = {
    checkedAt: new Date().toISOString(),
    version: release.data.product.version,
    build: release.data.release,
    fixture: fixture.counts,
    environment: {
      cpu: cpus()[0].model,
      logicalCpus: cpus().length,
      memoryBytes: totalmem(),
      node: process.version,
      postgres: "17, isolated loopback",
      prismaPool: 20,
      transport:
        "production Next.js HTTPS, 80 ms added latency, shared 100 Mbps down / 20 Mbps up",
      serverWarmth: "warmed baseline",
      providers:
        "local isolated files; cloud Blob/Neon latency and CPU limits are not reproduced",
      isProductionCapacityClaim: false
    },
    stages,
    integrity,
    acceptedUploads: createdImages.length,
    productionWrites: 0
  };
  await writeFile(
    join(dir, "staircase.json"),
    JSON.stringify(result, null, 2),
    { mode: 0o600 }
  );
} finally {
  await db.$disconnect();
}
