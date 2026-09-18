// Explicit expanded-resource recovery fixture; never imported by the application.
import assert from "node:assert/strict";
import {
  readFile,
  writeFile,
  mkdir,
  mkdtemp,
  rm,
  readdir,
  stat,
  rename
} from "node:fs/promises";
import { createReadStream, createWriteStream } from "node:fs";
import { spawn, execFileSync } from "node:child_process";
import { once } from "node:events";
import { Writable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { resolve, join, sep } from "node:path";
import {
  randomUUID,
  randomBytes,
  createCipheriv,
  createDecipheriv,
  createHash
} from "node:crypto";
import { PrismaClient, type Prisma } from "@prisma/client";
import { assertPortalTestDatabase } from "./seed-portal";
import { exchangeListingCommand } from "../lib/platform/exchange-listings";
import { exchangeNeedCommand } from "../lib/platform/exchange-need-commands";
import { pantryCommand } from "../lib/platform/pantry-commands";
import { groupEventCommand } from "../lib/platform/group-events";
import { EXCHANGE_ITEM_POLICY } from "../lib/platform/exchange-options";
import { journalRetentionControls } from "../lib/platform/retention-controls";
import { retentionJournals } from "../lib/platform/retention-maintenance";
import { replayProtectedRestoration } from "../lib/platform/retention-restore";
import { currentPantryRequest } from "../lib/platform/pantry-policy";
import { currentNeedContribution } from "../lib/platform/exchange-need-policy";
import { readAccountSession } from "../lib/platform/accounts";
import {
  writeResourceArchive,
  restoreResourceArchive,
  type ArchiveEntry
} from "../lib/operations/resource-archive";

const dir = resolve(process.env.RESOURCE_RESTORE_DIR ?? "");
assert.ok(dir.startsWith(resolve(".account-test") + sep));
const db = new PrismaClient();
const input = (operation: string, fields: Record<string, unknown>) => ({
  operation,
  mutationId: randomUUID(),
  ...fields
});
const later = (hours: number) =>
  new Date(Date.now() + hours * 3600000).toISOString().slice(0, 16);
async function seed() {
  assert.equal(
    await db.exchangeNeed.count(),
    0,
    "Preserve an earlier expanded fixture attempt"
  );
  assert.equal(await db.pantryHub.count(), 0);
  const fixture = JSON.parse(
    await readFile(join(dir, "resource-fixture.json"), "utf8")
  );
  const coordinator = fixture.actors[0],
    contributor = fixture.actors[1];
  assert.equal(
    await db.platformUser.count({
      where: {
        NOT: { email: { endsWith: "example.test" } }
      }
    }),
    0,
    "Use only fictional accounts"
  );
  await db.platformOperatorGrant.createMany({
    data: [
      { userId: fixture.actors[2].id, capability: "REVIEW_COMMUNITY_REPORTS" }
    ],
    skipDuplicates: true
  });
  const membership = await db.churchConnection.findFirstOrThrow({
    where: { userId: coordinator.id, state: "APPROVED" },
    include: { church: true }
  });
  const church = membership.church;
  assert.equal(
    await db.churchConnection.count({
      where: {
        churchId: church.id,
        userId: contributor.id,
        state: "APPROVED"
      }
    }),
    1,
    "Reuse the actors' existing church membership"
  );
  await db.churchCapabilityGrant.createMany({
    skipDuplicates: true,
    data: (
      [
        "MANAGE_EXCHANGE_LISTINGS",
        "MODERATE_EXCHANGE_LISTINGS",
        "MANAGE_CHURCH_ASSISTANCE"
      ] as const
    ).map((capability) => ({
      churchId: church.id,
      userId: coordinator.id,
      capability
    }))
  });
  await db.socialPreferences.upsert({
    where: { ownerId: coordinator.id },
    create: { ownerId: coordinator.id, contactRequests: "EVERYONE" },
    update: { contactRequests: "EVERYONE" }
  });
  const listing = await db.exchangeListing.create({
    data: {
      ownerChurchId: church.id,
      creatorId: coordinator.id,
      intent: "CHURCH_NEED",
      category: "HOUSEHOLD",
      audience: "CHURCH",
      audienceChurchId: church.id,
      title: "Fictional recovery need",
      description: "An isolated recovery fixture",
      requestedItems: "Ten fictional parcels",
      country: "US",
      placeId: 4887398,
      placeLabel: "Chicago",
      itemPolicy: EXCHANGE_ITEM_POLICY
    }
  });
  const need = await exchangeNeedCommand(
    db,
    coordinator.token,
    input("configure", {
      listingId: listing.id,
      listingVersion: listing.version,
      expectedVersion: 0,
      deadlineLocal: later(72),
      timeZone: "UTC",
      acceptCoordinator: true
    })
  );
  const slot = await exchangeNeedCommand(
    db,
    coordinator.token,
    input("slot", {
      needId: need.id,
      slotId: randomUUID(),
      expectedVersion: 0,
      schema: 1,
      fields: {
        action: "DONATE",
        label: "Fictional parcels",
        unit: "parcels",
        target: 10,
        loan: false,
        returnLocal: null,
        returnTimeZone: null,
        returnResponsibility: "",
        volunteerSlotId: null
      }
    })
  );
  const ready = await db.exchangeListing.findUniqueOrThrow({
    where: { id: listing.id }
  });
  await exchangeListingCommand(
    db,
    coordinator.token,
    input("status", {
      listingId: listing.id,
      expectedVersion: ready.version,
      state: "ACTIVE",
      itemPolicy: EXCHANGE_ITEM_POLICY,
      itemConfirmed: true
    })
  );
  const consent = await db.exchangeNeed.findUniqueOrThrow({
    where: { id: need.id }
  });
  const contribution = await exchangeNeedCommand(
    db,
    contributor.token,
    input("claim", {
      needId: need.id,
      slotId: slot.id,
      slotVersion: slot.version,
      consentVersion: consent.consentVersion,
      id: randomUUID(),
      expectedVersion: 0,
      quantity: 2,
      note: "Fictional private contribution",
      price: null,
      currency: null,
      shareName: false,
      loanAccepted: false,
      waitlist: false
    })
  );
  const hub = await pantryCommand(
    db,
    coordinator.token,
    input("configure", {
      churchId: church.id,
      expectedVersion: 0,
      schema: 1,
      fields: {
        title: "Fictional recovery pantry",
        description: "Isolated archive acceptance",
        hours: "By appointment",
        accessInfo: "Fictional entrance",
        eligibility: "Adults request their own pickup",
        audience: "CHURCH",
        published: true,
        intakeEnabled: true,
        acceptCoordinator: true
      }
    })
  );
  const category = await pantryCommand(
    db,
    coordinator.token,
    input("category", {
      hubId: hub.id,
      id: randomUUID(),
      expectedVersion: 0,
      schema: 1,
      fields: {
        label: "Parcels",
        unit: "parcels",
        availability: "EXACT",
        quantity: 10,
        description: "Fictional stock",
        active: true,
        reason: "Isolated opening count"
      }
    })
  );
  const session = await pantryCommand(
    db,
    coordinator.token,
    input("session", {
      hubId: hub.id,
      id: randomUUID(),
      expectedVersion: 0,
      schema: 1,
      fields: {
        startLocal: later(24),
        endLocal: later(25),
        timeZone: "UTC",
        capacity: 3,
        pickupDetails: "Fictional private entrance",
        active: true
      }
    })
  );
  const linked = await pantryCommand(
    db,
    coordinator.token,
    input("replenish", {
      hubId: hub.id,
      id: category.id,
      expectedVersion: category.version,
      needId: need.id
    })
  );
  const request = await pantryCommand(
    db,
    contributor.token,
    input("request", {
      hubId: hub.id,
      id: randomUUID(),
      expectedVersion: 0,
      consentVersion: 1,
      coordinatorId: coordinator.id,
      accepted: true,
      items: [
        { categoryId: category.id, version: linked.version, quantity: 2 }
      ],
      note: "Fictional private request",
      pickupContact: "Fictional chosen contact"
    })
  );
  const offered = await pantryCommand(
    db,
    coordinator.token,
    input("assign", {
      id: request.id,
      expectedVersion: request.version,
      sessionId: session.id,
      sessionVersion: session.version
    })
  );
  const confirmed = await pantryCommand(
    db,
    contributor.token,
    input("confirm", {
      id: request.id,
      expectedVersion: offered.version,
      sessionVersion: session.version
    })
  );
  const occurrence = await db.calendarOccurrence.findFirstOrThrow({
    where: { event: { calendarId: fixture.calendarIds[0] } },
    include: { event: true },
    orderBy: { id: "asc" }
  });
  const groupLink = await groupEventCommand(
    db,
    coordinator.token,
    input("link-event", {
      groupId: "budget-group-0000",
      occurrenceId: occurrence.id,
      expectedVersion: 0,
      occurrenceVersion: occurrence.version,
      eventVersion: occurrence.event.version,
      confirmed: true
    })
  );
  const journals = retentionJournals();
  let pending = 1;
  for (let n = 0; pending && n < 20; n++) {
    const result = await journalRetentionControls(db, journals.controls);
    assert.equal(result.failed, 0);
    pending = result.pending;
  }
  assert.equal(pending, 0);
  const result = {
    at: new Date().toISOString(),
    churchId: church.id,
    listingId: listing.id,
    needId: need.id,
    slotId: slot.id,
    contributionId: contribution.id,
    hubId: hub.id,
    categoryId: category.id,
    sessionId: session.id,
    requestId: confirmed.id,
    groupLink,
    coordinatorId: coordinator.id,
    contributorId: contributor.id
  };
  await writeFile(
    join(dir, "expanded-fixture.json"),
    JSON.stringify(result, null, 2),
    { mode: 0o600, flag: "wx" }
  );
  console.log(
    JSON.stringify({
      seeded: true,
      need: true,
      contribution: true,
      pantry: true,
      confirmedPickup: true,
      replenishment: true,
      canonicalGroupEvent: true,
      protectedJournalPending: 0
    })
  );
}

const identifier = (name: string) => {
  assert.match(name, /^[A-Za-z_][A-Za-z0-9_]*$/);
  return '"' + name + '"';
};
async function fingerprints(client: PrismaClient) {
  const tables = await client.$queryRaw<Array<{ name: string }>>`
    SELECT tablename AS name FROM pg_tables WHERE schemaname='public' ORDER BY tablename`;
  const result = [];
  for (const { name } of tables) {
    const [row] = await client.$queryRawUnsafe<
      Array<{ count: string; digest: string | null }>
    >(
      `SELECT count(*)::text AS count, md5(string_agg(h,'' ORDER BY h)) AS digest FROM
       (SELECT md5(to_jsonb(t)::text) h FROM ${identifier(name)} t) q`
    );
    result.push({ table: name, ...row });
  }
  return result;
}
async function indirectOrphans(
  client: PrismaClient | Prisma.TransactionClient
) {
  const [row] = await client.$queryRaw<
    Array<{ replenishment: number; items: number }>
  >`
    SELECT (SELECT count(*)::int FROM "PantryCategory" c LEFT JOIN "ExchangeNeed" n
      ON n.id=c."replenishmentNeedId" WHERE c."replenishmentNeedId" IS NOT NULL AND n.id IS NULL) replenishment,
    (SELECT count(*)::int FROM "PantryRequest" r CROSS JOIN LATERAL jsonb_array_elements(r.items) item
      LEFT JOIN "PantryCategory" c ON c.id=item->>'categoryId' AND c."hubId"=r."hubId"
      WHERE c.id IS NULL) items`;
  return row;
}
async function foreignKeys(client: PrismaClient) {
  const relations = await client.$queryRaw<
    Array<{
      name: string;
      child: string;
      parent: string;
      children: string[];
      parents: string[];
    }>
  >`SELECT c.conname AS name, child.relname AS child, parent.relname AS parent,
    ARRAY(SELECT a.attname::text FROM unnest(c.conkey) WITH ORDINALITY u(n,i)
      JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=u.n ORDER BY u.i) children,
    ARRAY(SELECT a.attname::text FROM unnest(c.confkey) WITH ORDINALITY u(n,i)
      JOIN pg_attribute a ON a.attrelid=c.confrelid AND a.attnum=u.n ORDER BY u.i) parents
    FROM pg_constraint c JOIN pg_class child ON child.oid=c.conrelid
    JOIN pg_class parent ON parent.oid=c.confrelid JOIN pg_namespace ns ON ns.oid=child.relnamespace
    WHERE c.contype='f' AND ns.nspname='public' ORDER BY c.conname`;
  let orphaned = 0;
  for (const r of relations) {
    const [row] = await client.$queryRawUnsafe<Array<{ count: number }>>(
      `SELECT count(*)::int AS count FROM ${identifier(r.child)} c LEFT JOIN ${identifier(r.parent)} p ON ` +
        r.children
          .map((col, i) => `c.${identifier(col)}=p.${identifier(r.parents[i])}`)
          .join(" AND ") +
        " WHERE " +
        r.children
          .map((col) => `c.${identifier(col)} IS NOT NULL`)
          .join(" AND ") +
        ` AND p.${identifier(r.parents[0])} IS NULL`
    );
    assert.equal(row.count, 0, `Orphan references: ${r.name}`);
    orphaned += row.count;
  }
  return { checked: relations.length, orphaned };
}
async function flushControls() {
  for (let n = 0; n < 20; n++) {
    const r = await journalRetentionControls(db, retentionJournals().controls);
    assert.equal(r.failed, 0);
    if (!r.pending) return;
  }
  throw Error("Protected controls remain pending");
}
async function assetInventory(client: PrismaClient) {
  const assets = await client.mediaAsset.findMany({
    where: { status: "READY" },
    orderBy: { id: "asc" }
  });
  const entries: ArchiveEntry[] = [];
  for (const asset of assets) {
    const variants = asset.variants as Record<string, { bytes: number }>;
    for (const variant of ["original", "large", "medium", "thumb"]) {
      assert.ok(variants[variant], "Missing declared image variant");
      entries.push({
        key: `${asset.storagePrefix}/${variant}.webp`,
        bytes: variants[variant].bytes
      });
    }
  }
  return entries;
}
async function inspectAssets(root: string, entries: ArchiveEntry[]) {
  const files = (await readdir(root, { recursive: true, withFileTypes: true }))
    .filter((f) => f.isFile())
    .map((f) => join(f.parentPath, f.name).slice(root.length + 1));
  const actual = new Set(files),
    expected = new Set(entries.map((e) => e.key));
  return {
    missing: entries.filter((e) => !actual.has(e.key)).map((e) => e.key),
    orphaned: files.filter((f) => !expected.has(f))
  };
}
async function rehearse() {
  const startedAt = new Date().toISOString(),
    run = await mkdtemp(join(dir, "rehearsal-"));
  const receipt: Record<string, unknown> = {
    startedAt,
    status: "running",
    productionWrites: 0,
    recipientSends: 0
  };
  const save = () =>
    writeFile(join(run, "receipt.json"), JSON.stringify(receipt, null, 2), {
      mode: 0o600
    });
  let restored: PrismaClient | undefined;
  const pg = process.env.TEST_PG_BIN ?? "/opt/homebrew/opt/postgresql@17/bin";
  const source = new URL(process.env.DATABASE_URL!);
  source.search = "";
  const target = new URL(source);
  target.pathname =
    "/godschurches_resource_" +
    randomBytes(6).toString("hex").replace(/[0-9]/g, "a") +
    "_restore";
  receipt.targetDatabase = target.pathname.slice(1);
  try {
    const fixture = JSON.parse(
      await readFile(join(dir, "expanded-fixture.json"), "utf8")
    );
    const actors = JSON.parse(
      await readFile(join(dir, "resource-fixture.json"), "utf8")
    ).actors;
    await flushControls();
    const original = await fingerprints(db);
    const columns =
      await db.$queryRaw`SELECT table_name,column_name,data_type,is_nullable,column_default
      FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name,ordinal_position`;
    const migrations = await db.$queryRaw<
      Array<{ migration_name: string; checksum: string }>
    >`
      SELECT migration_name,checksum FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name`;
    receipt.before = original;
    receipt.migrations = migrations;
    assert.equal(
      (
        await db.exchangeNeedContribution.findUniqueOrThrow({
          where: { id: fixture.contributionId }
        })
      ).state,
      "COMMITTED"
    );
    assert.equal(
      (
        await db.pantryRequest.findUniqueOrThrow({
          where: { id: fixture.requestId }
        })
      ).state,
      "ASSIGNED"
    );
    const entries = await assetInventory(db);
    await mkdir(join(run, "archives"), { mode: 0o700 });
    await mkdir(join(run, "keys"), { mode: 0o700 });
    const key = randomBytes(32),
      iv = randomBytes(12),
      cipher = createCipheriv("aes-256-gcm", key, iv);
    await writeFile(join(run, "keys", "database.key"), key, {
      mode: 0o600,
      flag: "wx"
    });
    const archive = join(run, "archives", "database.enc"),
      verified = join(run, "verified.dump");
    const dumpStarted = performance.now();
    const dump = spawn(
      join(pg, "pg_dump"),
      ["--format=custom", "--no-owner", "--no-acl", source.href],
      { stdio: ["ignore", "pipe", "inherit"] }
    );
    const exited = once(dump, "close");
    await pipeline(
      dump.stdout,
      cipher,
      createWriteStream(archive, { mode: 0o600, flags: "wx" })
    );
    assert.equal((await exited)[0], 0, "Database dump failed");
    const tag = cipher.getAuthTag();
    await writeFile(
      join(run, "archives", "database.json"),
      JSON.stringify({
        iv: iv.toString("hex"),
        tag: tag.toString("hex"),
        migrations
      }),
      { mode: 0o600, flag: "wx" }
    );
    receipt.encryptedDatabaseCopyMs = performance.now() - dumpStarted;
    receipt.encryptedDatabaseBytes = (await stat(archive)).size;
    assert.deepEqual(
      await fingerprints(db),
      original,
      "Source changed during snapshot"
    );
    const restoreStarted = performance.now();
    const decipher = () => {
      const d = createDecipheriv("aes-256-gcm", key, iv);
      d.setAuthTag(tag);
      return d;
    };
    await pipeline(
      createReadStream(archive),
      decipher(),
      new Writable({
        write(_c, _e, next) {
          next();
        }
      })
    );
    try {
      await pipeline(
        createReadStream(archive),
        decipher(),
        createWriteStream(verified, { mode: 0o600, flags: "wx" })
      );
      execFileSync(join(pg, "createdb"), [
        "-h",
        target.hostname,
        "-p",
        target.port,
        "-U",
        target.username,
        target.pathname.slice(1)
      ]);
      execFileSync(join(pg, "pg_restore"), [
        "--exit-on-error",
        "--no-owner",
        "--no-acl",
        "--dbname",
        target.href,
        verified
      ]);
    } finally {
      await rm(verified, { force: true });
    }
    receipt.databaseRestoreMs = performance.now() - restoreStarted;
    restored = new PrismaClient({ datasourceUrl: target.href });
    assert.deepEqual(
      await fingerprints(restored),
      original,
      "Restored table contents differ"
    );
    assert.deepEqual(
      await restored.$queryRaw`SELECT table_name,column_name,data_type,is_nullable,column_default
      FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name,ordinal_position`,
      columns
    );
    assert.deepEqual(
      await restored.$queryRaw`SELECT migration_name,checksum FROM _prisma_migrations
      WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name`,
      migrations
    );
    receipt.identicalTables = original.length;
    receipt.identicalMigrationChecksums = migrations.length;
    receipt.foreignKeys = await foreignKeys(restored);
    assert.deepEqual(await indirectOrphans(restored), {
      replenishment: 0,
      items: 0
    });
    assert.deepEqual(await assetInventory(restored), entries);
    const batches: ArchiveEntry[][] = [[]];
    let batchBytes = 0;
    for (const entry of entries) {
      if (batchBytes + entry.bytes > 200 * 1024 * 1024) {
        batches.push([]);
        batchBytes = 0;
      }
      batches[batches.length - 1].push(entry);
      batchBytes += entry.bytes;
    }
    const digest = createHash("sha256");
    let copyMs = 0,
      restoreMs = 0,
      restoredBytes = 0;
    for (const [i, batch] of batches.entries()) {
      const paths = {
        archive: join(run, "archives", `assets-${i}.enc`),
        key: join(run, "keys", `assets-${i}.key`),
        manifest: join(run, "archives", `assets-${i}.json`)
      };
      const copyStarted = performance.now();
      await writeResourceArchive(paths, batch, (key) =>
        readFile(join(process.env.MEDIA_TEST_DIR!, key))
      );
      copyMs += performance.now() - copyStarted;
      const assetStarted = performance.now(),
        destination = join(run, `restored-assets-${i}`);
      const restoredBatch = await restoreResourceArchive(
        paths,
        batch,
        destination
      );
      restoreMs += performance.now() - assetStarted;
      restoredBytes += restoredBatch.bytes;
      assert.deepEqual(await inspectAssets(destination, batch), {
        missing: [],
        orphaned: []
      });
      for (const e of batch) {
        const before = await readFile(join(process.env.MEDIA_TEST_DIR!, e.key));
        const after = await readFile(join(destination, e.key));
        assert.deepEqual(after, before);
        digest
          .update(e.key)
          .update(createHash("sha256").update(after).digest());
      }
    }
    receipt.assetCopyMs = copyMs;
    receipt.assetRestoreMs = restoreMs;
    receipt.assetRestore = {
      entries: entries.length,
      bytes: restoredBytes,
      archives: batches.length,
      missing: 0,
      orphaned: 0
    };
    const destination = join(run, "restored-assets-0"),
      diagnosticEntries = batches[0];
    receipt.restoredAssetDigest = digest.digest("hex");
    await save();

    // Changes newer than the snapshot must not restore an old commitment.
    const contribution = await db.exchangeNeedContribution.findUniqueOrThrow({
      where: { id: fixture.contributionId }
    });
    await exchangeNeedCommand(
      db,
      actors[1].token,
      input("withdraw", {
        id: contribution.id,
        expectedVersion: contribution.version
      })
    );
    const request = await db.pantryRequest.findUniqueOrThrow({
      where: { id: fixture.requestId }
    });
    await pantryCommand(
      db,
      actors[1].token,
      input("cancel", { id: request.id, expectedVersion: request.version })
    );
    await flushControls();
    Object.assign(process.env, {
      RETENTION_RESTORE_ISOLATED: "true",
      ACCOUNT_DELIVERY_MODE: "disabled",
      PUSH_ENABLED: "false",
      FOUNDER_WELCOME_ENABLED: "false",
      COMMUNITY_REPORTS_ENABLED: "false",
      RETENTION_CLEANUP_ENABLED: "false",
      VERCEL: ""
    });
    const replayStarted = performance.now();
    receipt.replay = await replayProtectedRestoration(
      restored,
      retentionJournals()
    );
    receipt.replayMs = performance.now() - replayStarted;
    assert.equal(
      (receipt.replay as { replayComplete: boolean }).replayComplete,
      true
    );
    assert.equal(
      (receipt.replay as { trafficEnabled: boolean }).trafficEnabled,
      false
    );
    assert.equal(
      (receipt.replay as { currentAuthorizationReviewRequired: boolean })
        .currentAuthorizationReviewRequired,
      true
    );
    assert.equal(await readAccountSession(restored, actors[0].token), null);
    assert.equal(await restored.platformSession.count(), 0);
    assert.equal(
      await restored.platformOperatorGrant.count({
        where: { revokedAt: null }
      }),
      0
    );
    const need = await restored.exchangeNeed.findUniqueOrThrow({
      where: { id: fixture.needId }
    });
    const restoredRequest = await restored.pantryRequest.findUniqueOrThrow({
      where: { id: fixture.requestId }
    });
    assert.equal(
      need.recoveryRequired,
      true,
      "Newer Need withdrawal quarantines the old snapshot"
    );
    const hub = await restored.pantryHub.findUniqueOrThrow({
      where: { id: fixture.hubId }
    });
    assert.equal(hub.recoveryRequired, true);
    assert.equal(hub.published, false);
    assert.equal(hub.intakeEnabled, false);
    assert.equal(restoredRequest.authorityKey, null);
    assert.equal(restoredRequest.note, "");
    assert.equal(restoredRequest.pickupContact, "");
    assert.equal(await currentPantryRequest(restored, restoredRequest), null);
    const restoredContribution =
      await restored.exchangeNeedContribution.findUniqueOrThrow({
        where: { id: fixture.contributionId }
      });
    assert.equal(
      await currentNeedContribution(restored, restoredContribution),
      null
    );
    receipt.newerWithdrawal = {
      needQuarantined: true,
      pantryQuarantined: true,
      historicalPantryRequestState: restoredRequest.state,
      currentCommitmentsAvailable: false
    };
    receipt.postReplayForeignKeys = await foreignKeys(restored);
    assert.deepEqual(await indirectOrphans(restored), {
      replenishment: 0,
      items: 0
    });

    // Verify the diagnostic reports actual faults without damaging the accepted restore.
    const moved = join(run, "temporarily-missing.webp"),
      first = join(destination, entries[0].key);
    await rename(first, moved);
    try {
      assert.deepEqual(await inspectAssets(destination, diagnosticEntries), {
        missing: [entries[0].key],
        orphaned: []
      });
    } finally {
      await rename(moved, first);
    }
    const orphan = join(destination, "orphan.webp");
    await writeFile(orphan, "fictional", { mode: 0o600, flag: "wx" });
    try {
      assert.deepEqual(await inspectAssets(destination, diagnosticEntries), {
        missing: [],
        orphaned: ["orphan.webp"]
      });
    } finally {
      await rm(orphan);
    }
    const rollback = new Error("Rollback intentional orphan diagnostic");
    await assert.rejects(
      restored.$transaction(async (tx) => {
        await tx.pantryCategory.update({
          where: { id: fixture.categoryId },
          data: { replenishmentNeedId: "missing-fictional-need" }
        });
        await tx.pantryRequest.update({
          where: { id: fixture.requestId },
          data: {
            items: [{ categoryId: "missing-fictional-category", quantity: 2 }]
          }
        });
        assert.deepEqual(await indirectOrphans(tx), {
          replenishment: 1,
          items: 1
        });
        throw rollback;
      }),
      (e) => e === rollback
    );
    assert.deepEqual(await indirectOrphans(restored), {
      replenishment: 0,
      items: 0
    });
    assert.deepEqual(await inspectAssets(destination, diagnosticEntries), {
      missing: [],
      orphaned: []
    });
    receipt.diagnostics = {
      missingAsset: 1,
      orphanFile: 1,
      orphanReplenishment: 1,
      orphanRequestItem: 1,
      allReversed: true
    };
    receipt.status = "passed";
    receipt.completedAt = new Date().toISOString();
    await save();
    console.log(
      JSON.stringify({
        status: receipt.status,
        receipt: join(run, "receipt.json"),
        tables: original.length,
        migrations: migrations.length,
        databaseRestoreMs: receipt.databaseRestoreMs,
        assetRestore: receipt.assetRestore,
        assetRestoreMs: receipt.assetRestoreMs,
        replayMs: receipt.replayMs,
        foreignKeys: receipt.foreignKeys
      })
    );
  } catch (error) {
    receipt.status = "failed";
    receipt.error = error instanceof Error ? error.message : String(error);
    await save();
    throw error;
  } finally {
    await restored?.$disconnect();
  }
}
try {
  await assertPortalTestDatabase(db);
  assert.ok(["seed", "rehearse"].includes(process.argv[2]));
  if (process.argv[2] === "seed") await seed();
  else await rehearse();
} finally {
  await db.$disconnect();
}
