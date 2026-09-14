import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { assertPortalTestDatabase } from "./seed-portal";

test("feed migration preserves known first Like dates without fabricating ambiguous activations or changing existing preference fields", async () => {
  const db = new PrismaClient();
  try {
    await assertPortalTestDatabase(db);
  } finally {
    await db.$disconnect();
  }
  const schema = "feed_upgrade_" + randomBytes(6).toString("hex");
  const migration = readFileSync(
    "prisma/migrations/20260914180000_four_feeds/migration.sql",
    "utf8"
  );
  const sql = `BEGIN;
    CREATE SCHEMA "${schema}"; SET LOCAL search_path TO "${schema}"; SET LOCAL TIME ZONE 'Pacific/Auckland';
    CREATE TABLE "PlatformUser" (id TEXT PRIMARY KEY);
    CREATE TABLE "SocialPreferences" ("ownerId" TEXT PRIMARY KEY, mentions TEXT, version INT);
    INSERT INTO "SocialPreferences" VALUES ('fictional-owner', 'NOBODY', 7);
    CREATE TABLE "PlatformPostLike" (id TEXT PRIMARY KEY, "createdAt" TIMESTAMP(3), active BOOLEAN, version INT, "postId" TEXT, "userId" TEXT);
    CREATE TABLE "_prisma_migrations" (migration_name TEXT, finished_at TIMESTAMPTZ);
    INSERT INTO "_prisma_migrations" VALUES ('20260912200000_post_like_versions', '2026-09-12T20:00:00Z');
    INSERT INTO "PlatformPostLike" VALUES
      ('old-border','2026-09-12T19:59:59',false,4,'p','g'),
      ('new-border','2026-09-12T20:00:01',true,3,'p','h'),
      ('old-active','2026-09-11T01:00:00',true,3,'p','a'),
      ('old-inactive','2026-09-11T01:00:00',false,4,'p','b'),
      ('new-first-active','2026-09-13T01:00:00',true,1,'p','c'),
      ('new-first-inactive','2026-09-13T01:00:00',false,1,'p','d'),
      ('unknown-active','2026-09-13T01:00:00',true,3,'p','e'),
      ('unknown-inactive','2026-09-13T01:00:00',false,2,'p','f');
    ${migration}
    SELECT json_build_object('likes', (SELECT json_agg(json_build_object('id',id,'known',"firstLikedAt" IS NOT NULL,'same',"firstLikedAt"="createdAt") ORDER BY id) FROM "PlatformPostLike"),
      'preference', (SELECT row_to_json(p) FROM "SocialPreferences" p));
    ROLLBACK;`;
  const output = execFileSync(
    (process.env.TEST_PG_BIN ?? "/opt/homebrew/opt/postgresql@17/bin") +
      "/psql",
    [process.env.DATABASE_URL!, "-X", "-qAt", "-v", "ON_ERROR_STOP=1"],
    { input: sql, encoding: "utf8" }
  );
  const result = JSON.parse(output.trim());
  assert.deepEqual(
    result.likes
      .filter((row: { known: boolean }) => row.known)
      .map((row: { id: string; same: boolean }) => {
        assert.equal(row.same, true);
        return row.id;
      }),
    ["new-first-active", "old-active", "old-border", "old-inactive"]
  );
  assert.deepEqual(result.preference, {
    ownerId: "fictional-owner",
    mentions: "NOBODY",
    version: 7,
    feedMode: null,
    feedVersion: 0
  });
});
