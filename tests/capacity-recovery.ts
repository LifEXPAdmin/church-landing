import assert from "node:assert/strict";
import { readFile, writeFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { assertPortalTestDatabase } from "./seed-portal";
import { portalCommand } from "../lib/platform/portal";
import { getPost } from "../lib/platform/post-reads";
import { readAccountSession } from "../lib/platform/accounts";
import { replayProtectedRestoration } from "../lib/platform/retention-restore";
import { retentionJournals } from "../lib/platform/retention-maintenance";

const db = new PrismaClient(),
  dir = process.env.CAPACITY_FIXTURE_DIR!;
let restored: PrismaClient | undefined;
try {
  await assertPortalTestDatabase(db);
  const f = JSON.parse(await readFile(join(dir, "actors.json"), "utf8"));
  const { origin } = JSON.parse(
    await readFile(join(dir, "browser-env.json"), "utf8")
  );
  assert.equal(new URL(origin).hostname, "127.0.0.1");
  const actor = f.actors[99];
  assert.ok(await getPost(db, actor.token, f.postId));
  const connection = await db.churchConnection.findUniqueOrThrow({
    where: { userId_churchId: { userId: actor.id, churchId: f.churchId } }
  });
  await portalCommand(db, f.reviewer.token, {
    operation: "transition",
    action: "REMOVE",
    churchId: f.churchId,
    connectionId: connection.id,
    expectedVersion: connection.version
  });
  assert.equal(await getPost(db, actor.token, f.postId), null);
  const changed = await fetch(origin + "/api/platform/comments", {
    method: "POST",
    headers: {
      origin,
      cookie: `church_platform_session=${f.actors[0].token}`,
      "x-expected-account": actor.id,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      operation: "create",
      postId: "cap-post-1",
      mutationId: randomUUID(),
      content: "Fictional stale account form must never be committed."
    })
  });
  assert.equal(changed.status, 401);
  assert.equal(
    await db.platformPostComment.count({
      where: {
        content: "Fictional stale account form must never be committed."
      }
    }),
    0
  );
  const paused = await fetch(
    origin + "/api/platform/notifications?view=devices",
    {
      headers: { cookie: `church_platform_session=${f.actors[0].token}` }
    }
  );
  assert.equal(paused.status, 200);
  assert.equal(
    (await paused.json()).publicKey,
    null,
    "Disabled push stays unavailable while social reads remain usable"
  );

  const tables = [
    "PlatformUser",
    "Church",
    "PlatformPost",
    "PlatformPostComment"
  ];
  async function fingerprints(client: PrismaClient) {
    const rows = [];
    for (const table of tables) {
      // Static table names only; double digest bounds aggregate memory for 500k rows.
      const [row] = await client.$queryRawUnsafe<
        Array<{ count: string; digest: string }>
      >(
        `SELECT count(*)::text AS count, md5(string_agg(md5(to_jsonb(t)::text), '' ORDER BY id)) AS digest FROM "${table}" t`
      );
      rows.push({ table, ...row });
    }
    return rows;
  }
  const before = await fingerprints(db);
  const migrations = await db.$queryRaw<
    Array<{ migration_name: string; checksum: string }>
  >`
    SELECT migration_name, checksum FROM _prisma_migrations
    WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name`;
  const source = new URL(process.env.DATABASE_URL!);
  source.search = "";
  const target = new URL(source);
  target.pathname = "/godschurches_security_test_restore";
  const pg = process.env.TEST_PG_BIN ?? "/opt/homebrew/opt/postgresql@17/bin";
  const archive = join(
      process.env.CAPACITY_STORAGE_DIR!,
      "capacity-snapshot.dump"
    ),
    started = performance.now();
  execFileSync(join(pg, "pg_dump"), [
    "--format=custom",
    "--no-owner",
    "--no-acl",
    "--file",
    archive,
    source.href
  ]);
  execFileSync(join(pg, "createdb"), [
    "-h",
    source.hostname,
    "-p",
    source.port,
    "-U",
    source.username,
    target.pathname.slice(1)
  ]);
  execFileSync(join(pg, "pg_restore"), [
    "--exit-on-error",
    "--no-owner",
    "--no-acl",
    "--dbname",
    target.href,
    archive
  ]);
  restored = new PrismaClient({ datasourceUrl: target.href });
  assert.deepEqual(await fingerprints(restored), before);
  const restoreMs = performance.now() - started;
  const migrationRows = await restored.$queryRaw<
    Array<{ migration_name: string; checksum: string }>
  >`SELECT migration_name, checksum FROM _prisma_migrations
    WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name`;
  assert.deepEqual(migrationRows, migrations);
  Object.assign(process.env, {
    RETENTION_RESTORE_ISOLATED: "true",
    ACCOUNT_DELIVERY_MODE: "disabled",
    PUSH_ENABLED: "false",
    FOUNDER_WELCOME_ENABLED: "false",
    COMMUNITY_REPORTS_ENABLED: "false",
    RETENTION_CLEANUP_ENABLED: "false"
  });
  const replayStarted = performance.now();
  const replay = await replayProtectedRestoration(
    restored,
    retentionJournals()
  );
  assert.equal(replay.replayComplete, true);
  assert.equal(replay.trafficEnabled, false);
  assert.equal(replay.currentAuthorizationReviewRequired, true);
  assert.equal(await readAccountSession(restored, f.actors[0].token), null);
  assert.equal(await restored.platformSession.count(), 0);
  assert.equal(
    await restored.platformOperatorGrant.count({ where: { revokedAt: null } }),
    0
  );
  assert.deepEqual((await fingerprints(restored)).slice(1), before.slice(1));
  assert.equal(
    (
      await restored.churchConnection.findUniqueOrThrow({
        where: { id: connection.id }
      })
    ).state,
    "REMOVED"
  );
  const receipt = {
    checks: [
      "church revocation hides source",
      "stale account form rejected with zero comments",
      "disabled push with functioning social readers",
      "snapshot preserves all four capacity tables",
      `${migrations.length} migration checksums preserved`,
      "restored sessions and elevated grants quarantined",
      "church revocation preserved",
      "posts/comments/churches unchanged after quarantine"
    ],
    before,
    archiveBytes: (await stat(archive)).size,
    restoreMs,
    replayMs: performance.now() - replayStarted,
    replay
  };
  await writeFile(
    join(dir, "recovery.json"),
    JSON.stringify(receipt, null, 2),
    { mode: 0o600 }
  );
  console.log(
    JSON.stringify({
      checks: receipt.checks.length,
      restoreMs,
      replay: replay.replayComplete,
      trafficEnabled: false
    })
  );
} finally {
  await restored?.$disconnect();
  await db.$disconnect();
}
