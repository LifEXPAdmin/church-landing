import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { createPortalActor, assertPortalTestDatabase } from "./seed-portal";
import { readActivity, activityCommand } from "../lib/platform/activity";
import { commentCommand } from "../lib/platform/comment-commands";
const db = new PrismaClient();
const prior = process.env.PUSH_ENABLED;
before(async () => {
  await assertPortalTestDatabase(db);
  process.env.PUSH_ENABLED = "false";
});
after(async () => {
  await db.$disconnect();
  if (prior === undefined) delete process.env.PUSH_ENABLED;
  else process.env.PUSH_ENABLED = prior;
});

test("an actual isolated dump/restore preserves read state; legacy upgrade orders old intents without changing original data", async () => {
  const source = new URL(process.env.DATABASE_URL!);
  assert.equal(source.hostname, "127.0.0.1");
  assert.equal(source.pathname, "/godschurches_security_test");
  const owner = await createPortalActor(db, "restoreactivity"),
    author = await createPortalActor(db, "restorewriter");
  const post = await db.platformPost.create({
    data: { authorId: owner.id, content: "Isolated restore source" }
  });
  const create = (client: PrismaClient) =>
    commentCommand(client, author.token, {
      operation: "create",
      mutationId: randomUUID(),
      postId: post.id,
      content: "Isolated restore comment"
    });
  await create(db);
  const first = await readActivity(db, owner.token);
  await activityCommand(db, owner.token, {
    operation: "read",
    mutationId: randomUUID(),
    ownerId: owner.id,
    id: first.items[0].id,
    boundary: first.boundary
  });
  await activityCommand(db, owner.token, {
    operation: "read-all",
    mutationId: randomUUID(),
    ownerId: owner.id,
    boundary: first.boundary
  });
  await create(db);
  const current = await readActivity(db, owner.token);
  assert.equal(current.unread, 1);
  const name =
    "godschurches_activity_restore_" + randomUUID().replaceAll("-", "");
  const target = new URL(source);
  target.pathname = "/" + name;
  const pg = process.env.TEST_PG_BIN ?? "/opt/homebrew/opt/postgresql@16/bin";
  const flags = [
    "-h",
    source.hostname,
    "-p",
    source.port,
    "-U",
    decodeURIComponent(source.username)
  ];
  const dir = mkdtempSync(
    join(process.env.ACCOUNT_TEST_SINK_DIR!, "activity-restore-")
  );
  let restored: PrismaClient | undefined;
  let created = false;
  try {
    const dump = execFileSync(
      join(pg, "pg_dump"),
      ["--no-owner", "--no-acl", source.href],
      { maxBuffer: 128 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] }
    );
    const file = join(dir, "snapshot.sql");
    writeFileSync(file, dump, { mode: 0o600 });
    execFileSync(join(pg, "createdb"), [...flags, name], { stdio: "pipe" });
    created = true;
    execFileSync(
      join(pg, "psql"),
      [target.href, "-v", "ON_ERROR_STOP=1", "-f", file],
      { stdio: "pipe", maxBuffer: 16 * 1024 * 1024 }
    );
    restored = new PrismaClient({ datasources: { db: { url: target.href } } });
    assert.deepEqual(await readActivity(restored, owner.token), current);
    await create(restored);
    const after = await readActivity(restored, owner.token);
    assert.equal(after.unread, 2);
    assert.equal(after.items[0].count, 3);
    assert.equal((await readActivity(db, owner.token)).unread, 1);
    const sourceRows = () =>
      restored!.$queryRaw<
        Array<{ value: unknown }>
      >`SELECT to_jsonb(e) - 'activitySequence' - 'activityReadAt' AS value FROM "SocialEvent" e ORDER BY id`;
    const preferenceRows = () =>
      restored!.$queryRaw<
        Array<{ value: unknown }>
      >`SELECT to_jsonb(p) - 'activityReadThrough' AS value FROM "SocialPreferences" p ORDER BY "ownerId"`;
    const oldEvents = await sourceRows(),
      oldPreferences = await preferenceRows();
    // Reconstruct an older snapshot in this disposable database only. No live
    // application or parent fixture sees the temporary absence of new columns.
    await restored.$executeRawUnsafe(
      'ALTER TABLE "SocialEvent" DROP COLUMN "activitySequence", DROP COLUMN "activityReadAt"'
    );
    await restored.$executeRawUnsafe(
      'ALTER TABLE "SocialPreferences" DROP COLUMN "activityReadThrough"'
    );
    execFileSync(
      join(pg, "psql"),
      [
        target.href,
        "-v",
        "ON_ERROR_STOP=1",
        "-f",
        "prisma/migrations/20260913200000_activity_read_boundaries/migration.sql"
      ],
      { stdio: "pipe" }
    );
    assert.deepEqual(await sourceRows(), oldEvents);
    assert.deepEqual(await preferenceRows(), oldPreferences);
    const ordering = await restored.$queryRaw<
      Array<{ mismatches: bigint }>
    >`SELECT count(*) AS mismatches FROM (SELECT "activitySequence", row_number() OVER (ORDER BY "createdAt", id) AS position FROM "SocialEvent") ordered WHERE "activitySequence" <> position`;
    assert.equal(ordering[0].mismatches, BigInt(0));
    assert.equal(
      await restored.socialEvent.count({
        where: { activityReadAt: { not: null } }
      }),
      0
    );
    assert.equal(
      await restored.socialPreferences.count({
        where: { activityReadThrough: { not: BigInt(0) } }
      }),
      0
    );
    const high = (
      await restored.socialEvent.aggregate({ _max: { activitySequence: true } })
    )._max.activitySequence!;
    const added = await create(restored);
    const intent = await restored.socialEvent.findFirstOrThrow({
      where: { commentId: added.id, kind: "COMMENT_ACTIVITY" }
    });
    assert.ok(intent.activitySequence > high);
    console.log(
      JSON.stringify({
        restoredActivity: true,
        legacyEventRowsPreserved: oldEvents.length,
        legacyPreferenceRowsPreserved: oldPreferences.length,
        originalActivityUnchanged: true,
        providerSends: 0
      })
    );
  } finally {
    await restored?.$disconnect();
    if (created)
      execFileSync(join(pg, "dropdb"), [...flags, "--force", name], {
        stdio: "pipe"
      });
    rmSync(dir, { recursive: true, force: true });
  }
});
