import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { createPortalActor, assertPortalTestDatabase } from "./seed-portal";
import { loginAccount } from "../lib/platform/accounts";
import { createSessionToken } from "../lib/platform/auth";
import { requestPermanentAccountDeletion } from "../lib/platform/account-deletion";
import { protectedAccountDeletionJournal } from "../lib/platform/account-deletion-journal";
import {
  protectedDeletionJournal,
  type RetentionJournalStore
} from "../lib/platform/retention-journal";
import { protectedRetentionControls } from "../lib/platform/retention-controls";
import {
  handleRetentionMaintenance,
  inspectRetentionOperations,
  expireRetentionReceipts
} from "../lib/platform/retention-maintenance";
import { collectImageGarbage } from "../lib/platform/media";
import { DAY } from "../lib/platform/messaging-retention";
function store<Entry>(): RetentionJournalStore<Entry> {
  const values = new Map<string, unknown>();
  return {
    async read(k) {
      return values.get(k) ?? null;
    },
    async write(k, v) {
      if (values.has(k)) throw Error("Immutable fixture");
      values.set(k, structuredClone(v));
    },
    async remove(k) {
      values.delete(k);
    },
    async page() {
      return { paths: [...values.keys()] };
    }
  };
}
test("secured staged maintenance inspects first, continues after a journal failure, waits for provider cleanup, rotates pending work and expires completed receipts", async () => {
  const source = new PrismaClient();
  await assertPortalTestDatabase(source);
  const prior = {
    CRON_SECRET: process.env.CRON_SECRET,
    RETENTION_CLEANUP_ENABLED: process.env.RETENTION_CLEANUP_ENABLED,
    FOUNDER_WELCOME_ENABLED: process.env.FOUNDER_WELCOME_ENABLED
  };
  process.env.FOUNDER_WELCOME_ENABLED = "false";
  const actors = [
    await createPortalActor(source, "jobfailure"),
    await createPortalActor(source, "jobmedia"),
    await createPortalActor(source, "jobnew")
  ];
  const sourceUrl = new URL(process.env.DATABASE_URL!),
    targetUrl = new URL(sourceUrl);
  assert.equal(sourceUrl.hostname, "127.0.0.1");
  assert.equal(sourceUrl.pathname, "/godschurches_security_test");
  const database = "godschurches_retention_maintenance_restore";
  targetUrl.pathname = "/" + database;
  const pg = process.env.TEST_PG_BIN ?? "/opt/homebrew/opt/postgresql@16/bin";
  const flags = [
    "-h",
    sourceUrl.hostname,
    "-p",
    sourceUrl.port,
    "-U",
    decodeURIComponent(sourceUrl.username)
  ];
  const run = (name: string, args: string[], input?: Buffer) =>
    execFileSync(`${pg}/${name}`, args, {
      input,
      stdio: ["pipe", "pipe", "pipe"],
      maxBuffer: 32 * 1024 * 1024
    });
  let db: PrismaClient | undefined,
    created = false;
  try {
    const schema = run("pg_dump", [
      "--schema-only",
      "--format=custom",
      "--no-owner",
      "--no-acl",
      sourceUrl.href
    ]);
    run("createdb", [...flags, database]);
    created = true;
    run(
      "pg_restore",
      ["--exit-on-error", "--no-owner", "--no-acl", "--dbname", targetUrl.href],
      schema
    );
    db = new PrismaClient({ datasourceUrl: targetUrl.href });
    // A schema-only restore also needs the explicit immutable reporting baseline.
    // These selected fixture accounts are inserted next, starting from zero.
    for (const configuration of await source.platformMetricConfiguration.findMany())
      await db.platformMetricConfiguration.create({ data: {
        ...configuration, openingStates: { ENABLED: 0, DEACTIVATED: 0, SUSPENDED: 0 }
      } });
    for (const actor of actors)
      await db.platformUser.create({
        data: await source.platformUser.findUniqueOrThrow({
          where: { id: actor.id }
        })
      });
    const journals = {
      messages: protectedDeletionJournal(store()),
      accounts: protectedAccountDeletionJournal(store()),
      controls: protectedRetentionControls(store())
    };
    const tokens = await Promise.all(
      actors.map((a) =>
        loginAccount(db!, a.email, a.password, "Isolated maintenance fixture")
      )
    );
    const prefix = "images/" + randomUUID();
    await db.mediaAsset.create({
      data: {
        uploaderId: actors[1].id,
        profileUserId: actors[1].id,
        requestKey: randomUUID(),
        fingerprint: "d".repeat(64),
        purpose: "PROFILE_AVATAR",
        status: "READY",
        leaseUntil: new Date(),
        storagePrefix: prefix,
        caption: "Private fixture caption",
        alt: "Private fixture description"
      }
    });
    const files = new Map(
      ["original", "large", "medium", "thumb"].map((v) => [
        `${prefix}/${v}.webp`,
        Buffer.from("fixture image")
      ])
    );
    for (let i = 0; i < 2; i++)
      await requestPermanentAccountDeletion(
        db,
        tokens[i],
        actors[i].password,
        true,
        createSessionToken(),
        journals.accounts
      );
    const firstRequest = await db.accountDeletion.findUniqueOrThrow({
      where: { userId: actors[0].id }
    });
    const secret = randomBytes(32).toString("hex");
    process.env.CRON_SECRET = secret;
    process.env.RETENTION_CLEANUP_ENABLED = "false";
    const expiredFeed = await db.feedSnapshot.create({
      data: {
        id: randomUUID(),
        mode: "weekly",
        postIds: [],
        expiresAt: new Date(Date.now() - 1000)
      }
    });
    const currentFeed = await db.feedSnapshot.create({
      data: {
        id: randomUUID(),
        mode: "trending",
        postIds: [],
        expiresAt: new Date(Date.now() + 3600000)
      }
    });
    const request = (auth = `Bearer ${secret}`, query = "", method = "GET") =>
      new Request("https://example.test/api/maintenance/retention" + query, {
        method,
        headers: {
          authorization: auth,
          cookie: "church_platform_session=not-authority"
        }
      });
    let opened = 0,
      failing = true;
    const provider = () => {
      opened++;
      return {
        ...journals,
        accounts: {
          ...journals.accounts,
          async recordAccount(
            record: Parameters<typeof journals.accounts.recordAccount>[0]
          ) {
            if (failing && record.id === firstRequest.id)
              throw Error("Fixture protected provider failure");
            await journals.accounts.recordAccount(record);
          }
        }
      };
    };
    for (const auth of [
      "",
      "Bearer undefined",
      "Bearer " + "x".repeat(secret.length)
    ])
      assert.equal(
        (await handleRetentionMaintenance(db, request(auth), provider)).status,
        401
      );
    assert.equal(
      (
        await handleRetentionMaintenance(
          db,
          request(undefined, "", "POST"),
          provider
        )
      ).status,
      405
    );
    const inspect = await handleRetentionMaintenance(db, request(), provider);
    assert.equal(inspect.status, 200);
    assert.match(inspect.headers.get("cache-control")!, /no-store/);
    assert.equal(opened, 0);
    const inspection = await inspect.text();
    assert.doesNotMatch(
      inspection,
      new RegExp(actors[0].id + "|Private fixture|@")
    );
    assert.equal(
      await db.platformUser.count({ where: { erasedAt: { not: null } } }),
      0
    );
    process.env.RETENTION_CLEANUP_ENABLED = "true";
    assert.equal(
      (
        await handleRetentionMaintenance(
          db,
          request(undefined, "?mode=inspect"),
          provider
        )
      ).status,
      200
    );
    assert.equal(opened, 0);
    assert.equal(await db.feedSnapshot.count(), 2);
    const failed = await handleRetentionMaintenance(db, request(), provider);
    assert.equal(failed.status, 503);
    const failedResult = await failed.json();
    assert.equal(failedResult.failed, 1);
    assert.equal(failedResult.feedSnapshotsExpired, 1);
    assert.equal(
      await db.feedSnapshot.findUnique({ where: { id: expiredFeed.id } }),
      null
    );
    assert.ok(
      await db.feedSnapshot.findUnique({ where: { id: currentFeed.id } })
    );
    const a = await db.accountDeletion.findUniqueOrThrow({
        where: { userId: actors[0].id }
      }),
      b = await db.accountDeletion.findUniqueOrThrow({
        where: { userId: actors[1].id }
      });
    assert.equal(a.structuredPurgedAt, null);
    assert.ok(a.lastAttemptAt);
    assert.ok(b.structuredPurgedAt);
    assert.equal(b.completedAt, null);
    assert.equal(
      (await db.platformUser.findUniqueOrThrow({ where: { id: actors[1].id } }))
        .name,
      "Deleted member"
    );
    assert.equal(files.size, 4);
    assert.equal(await db.mediaGarbage.count(), 1);
    await requestPermanentAccountDeletion(
      db,
      tokens[2],
      actors[2].password,
      true,
      createSessionToken(),
      journals.accounts
    );
    const next = await db.accountDeletion.findUniqueOrThrow({
      where: { userId: actors[2].id }
    });
    assert.equal(
      (await inspectRetentionOperations(db)).accounts[0].id,
      next.id
    );
    const storage = {
      async put() {},
      async get(path: string) {
        return files.get(path) ?? null;
      },
      async delete(paths: string[]) {
        for (const path of paths) files.delete(path);
      }
    };
    const due = new Date(Date.now() + 2 * DAY);
    await assert.rejects(
      collectImageGarbage(
        db,
        {
          ...storage,
          async delete() {
            throw Error("Fixture image provider unavailable");
          }
        },
        due
      )
    );
    assert.equal(await db.mediaGarbage.count(), 1);
    assert.equal(files.size, 4);
    failing = false;
    assert.equal(
      (await handleRetentionMaintenance(db, request(), provider)).status,
      200
    );
    assert.equal(
      (
        await db.accountDeletion.findUniqueOrThrow({
          where: { id: firstRequest.id }
        })
      ).dueAt.toISOString(),
      firstRequest.dueAt.toISOString()
    );
    assert.equal(
      (await db.accountDeletion.findUniqueOrThrow({ where: { id: b.id } }))
        .completedAt,
      null
    );
    assert.deepEqual(await collectImageGarbage(db, storage, due), {
      removed: 1
    });
    assert.equal(files.size, 0);
    assert.equal(
      (await handleRetentionMaintenance(db, request(), provider)).status,
      200
    );
    assert.equal(
      await db.accountDeletion.count({ where: { completedAt: null } }),
      0
    );
    assert.equal(await db.mediaAsset.count(), 0);
    assert.equal(
      (
        await expireRetentionReceipts(
          db,
          journals,
          new Date(Date.now() + 89 * DAY)
        )
      ).accounts,
      0
    );
    assert.equal(
      (
        await expireRetentionReceipts(
          db,
          journals,
          new Date(Date.now() + 91 * DAY)
        )
      ).accounts,
      3
    );
    assert.equal(await db.accountDeletion.count(), 0);
    assert.equal(
      await db.platformUser.count({
        where: { deletionRequestedAt: { not: null }, name: "Deleted member" }
      }),
      3
    );
  } finally {
    await db?.$disconnect();
    if (created) run("dropdb", [...flags, database]);
    for (const [key, value] of Object.entries(prior))
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    await source.$disconnect();
  }
});
