import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import {
  assertPortalTestDatabase,
  createPortalActor,
  seedOperatorGrants
} from "./seed-portal";
import { artistCommand } from "../lib/platform/artist-commands";
import { artistRead } from "../lib/platform/artist-reads";
import { ARTIST_POLICY } from "../lib/platform/artist-types";
import { relationshipCommand } from "../lib/platform/relationships";
import {
  protectedRetentionControls,
  type RetentionControlEntry
} from "../lib/platform/retention-controls";
import {
  protectedDeletionJournal,
  type RetentionJournalStore
} from "../lib/platform/retention-journal";
import { protectedAccountDeletionJournal } from "../lib/platform/account-deletion-journal";
import { replayProtectedRestoration } from "../lib/platform/retention-restore";
import { loginAccount } from "../lib/platform/accounts";
function store<T>(): RetentionJournalStore<T> {
  const rows = new Map<string, unknown>();
  return {
    async read(k) {
      return rows.get(k) ?? null;
    },
    async write(k, v) {
      if (rows.has(k)) throw Error("Immutable journal");
      rows.set(k, structuredClone(v));
    },
    async remove(k) {
      rows.delete(k);
    },
    async page() {
      return { paths: [...rows.keys()] };
    }
  };
}
const command = (operation: string, more: Record<string, unknown> = {}) => ({
  operation,
  mutationId: randomUUID(),
  ...more
});
test("actual artist backup restores with equal and newer protected checkpoints without reviving publication, editor consent or follows", async () => {
  const baseline = new PrismaClient();
  await assertPortalTestDatabase(baseline);
  let db = baseline;
  const priorDatabaseUrl = process.env.DATABASE_URL;
  const origin = new URL(process.env.DATABASE_URL!),
    target = new URL(origin);
  origin.search = "";
  target.search = "";
  const name =
    "godschurches_artist_" + randomUUID().replace(/[^a-f]/g, "") + "_restore";
  target.pathname = "/" + name;
  const pg = process.env.TEST_PG_BIN ?? "/opt/homebrew/opt/postgresql@17/bin";
  const args = [
    "-h",
    origin.hostname,
    "-p",
    origin.port,
    "-U",
    decodeURIComponent(origin.username)
  ];
  const run = (tool: string, parameters: string[], input?: Buffer) =>
    execFileSync(`${pg}/${tool}`, parameters, {
      input,
      maxBuffer: 128 * 1024 * 1024,
      stdio: ["pipe", "pipe", "pipe"]
    });
  const directory =
    process.env.B1_ARTIST_RECOVERY_DIR ?? ".account-test/b1-artists/retention";
  mkdirSync(directory, { recursive: true });
  const envNames = [
    "RETENTION_RESTORE_ISOLATED",
    "ACCOUNT_DELIVERY_MODE",
    "PUSH_ENABLED",
    "FOUNDER_WELCOME_ENABLED",
    "COMMUNITY_REPORTS_ENABLED",
    "RETENTION_CLEANUP_ENABLED"
  ];
  const previous = Object.fromEntries(envNames.map((k) => [k, process.env[k]]));
  let restored: PrismaClient | undefined,
    created = false,
    sourceCreated = false;
  const isolatedSource = new URL(origin);
  isolatedSource.pathname = "/godschurches_security_test_restore";
  try {
    run("createdb", [...args, "godschurches_security_test_restore"]);
    sourceCreated = true;
    const schema = run("pg_dump", [
      "--format=custom",
      "--schema-only",
      "--no-owner",
      "--no-acl",
      origin.href
    ]);
    run(
      "pg_restore",
      [
        "--exit-on-error",
        "--no-owner",
        "--no-acl",
        "--dbname",
        isolatedSource.href
      ],
      schema
    );
    db = new PrismaClient({ datasourceUrl: isolatedSource.href });
    process.env.DATABASE_URL = isolatedSource.href;
    const config = await baseline.platformMetricConfiguration.findFirstOrThrow({
      orderBy: { version: "desc" }
    });
    await db.platformMetricConfiguration.create({
      data: {
        version: 1,
        zone: config.zone,
        openingStates: { ENABLED: 0, DEACTIVATED: 0, SUSPENDED: 0 }
      }
    });
    const owner = await createPortalActor(db, "artistrestore"),
      delegate = await createPortalActor(db, "artistrestoredelegate"),
      reviewer = await createPortalActor(db, "artistrestoreoperator");
    await seedOperatorGrants(db, reviewer, ["REVIEW_COMMUNITY_REPORTS"]);
    const fields = {
      name: "Fictional restored artist",
      presentation: "TEAM",
      roles: ["Band"]
    };
    const rights = {
      policy: ARTIST_POLICY,
      basis: "OWN_WORK",
      confirmed: true
    };
    const artist = await artistCommand(
      db,
      owner.token,
      command("create", {
        fields,
        rights,
        representation: true,
        policy: ARTIST_POLICY
      })
    );
    await artistCommand(
      db,
      owner.token,
      command("publish", {
        artistId: artist.id,
        expectedVersion: 1,
        fields,
        rights
      })
    );
    const invitation = await artistCommand(
      db,
      owner.token,
      command("invite", {
        artistId: artist.id,
        accountId: delegate.id,
        capabilities: ["EDIT_ARTIST_PROFILE", "PUBLISH_ARTIST_RELEASES"],
        expectedVersion: 0
      })
    );
    const accept = command("accept-invite", {
      artistId: artist.id,
      invitationId: invitation.id,
      expectedVersion: 1
    });
    await artistCommand(db, delegate.token, accept);
    const releaseFields = {
      kind: "SINGLE",
      title: "Fictional restored song",
      tracks: [{ id: randomUUID(), title: "Song", links: [] }],
      links: ["https://open.spotify.com/track/1234567890123456789012"]
    };
    const release = await artistCommand(
      db,
      owner.token,
      command("create-release", { artistId: artist.id, fields: releaseFields })
    );
    await artistCommand(
      db,
      owner.token,
      command("publish-release", {
        artistId: artist.id,
        releaseId: release.id,
        expectedVersion: 1,
        fields: releaseFields,
        rights
      })
    );
    const follow = await relationshipCommand(
      db,
      delegate.token,
      command("follow", {
        kind: "artist",
        targetId: artist.id,
        desired: true,
        expectedVersion: 0
      })
    );
    const association = await db.artistEventAssociation.create({
      data: {
        artistId: artist.id,
        occurrenceId: randomUUID(),
        proposedById: owner.id,
        acceptedById: reviewer.id,
        acceptedAt: new Date(),
        expiresAt: new Date(Date.now() + 86400000)
      }
    });
    const snapshot = run("pg_dump", [
      "--format=custom",
      "--no-owner",
      "--no-acl",
      isolatedSource.href
    ]);
    writeFileSync(directory + "/artist-snapshot.dump", snapshot, {
      mode: 0o600
    });
    run("createdb", [...args, name]);
    created = true;
    run(
      "pg_restore",
      ["--exit-on-error", "--no-owner", "--no-acl", "--dbname", target.href],
      snapshot
    );
    restored = new PrismaClient({ datasourceUrl: target.href });
    await artistCommand(
      db,
      owner.token,
      command("withdraw-release-rights", {
        artistId: artist.id,
        releaseId: release.id,
        expectedVersion: 2
      })
    );
    await relationshipCommand(
      db,
      delegate.token,
      command("follow", {
        kind: "artist",
        targetId: artist.id,
        desired: false,
        expectedVersion: follow.version
      })
    );
    const journals = {
      controls: protectedRetentionControls(store()),
      accounts: protectedAccountDeletionJournal(store()),
      messages: protectedDeletionJournal(store())
    };
    const relationship = await db.socialRelationship.findUniqueOrThrow({
      where: { ownerId_artistId: { ownerId: delegate.id, artistId: artist.id } }
    });
    const controls = await db.retentionControl.findMany({
      where: { sourceId: { in: [artist.id, release.id, relationship.id] } }
    });
    assert.ok(controls.length >= 6);
    for (const c of controls)
      await journals.controls.record(
        c.payload as unknown as RetentionControlEntry
      );
    Object.assign(process.env, {
      RETENTION_RESTORE_ISOLATED: "true",
      ACCOUNT_DELIVERY_MODE: "disabled",
      PUSH_ENABLED: "false",
      FOUNDER_WELCOME_ENABLED: "false",
      COMMUNITY_REPORTS_ENABLED: "false",
      RETENTION_CLEANUP_ENABLED: "false"
    });
    const result = await replayProtectedRestoration(restored, journals);
    assert.equal(result.replayComplete, true);
    assert.equal(await restored.platformSession.count(), 0);
    const a = await restored.artistProfile.findUniqueOrThrow({
        where: { id: artist.id }
      }),
      r = await restored.artistRelease.findUniqueOrThrow({
        where: { id: release.id }
      });
    assert.equal(a.recoveryRequired, true);
    assert.equal(a.rightsFingerprint, null);
    assert.equal(r.recoveryRequired, true);
    assert.equal(r.rightsFingerprint, null);
    assert.equal(
      (
        await restored.artistDelegate.findUniqueOrThrow({
          where: { id: invitation.id }
        })
      ).state,
      "REVOKED"
    );
    assert.equal(
      (
        await restored.socialRelationship.findUniqueOrThrow({
          where: { id: relationship.id }
        })
      ).followingArtist,
      false
    );
    assert.ok(
      (
        await restored.artistEventAssociation.findUniqueOrThrow({
          where: { id: association.id }
        })
      ).revokedAt
    );
    const fresh = await loginAccount(
      restored,
      owner.email,
      owner.password,
      "Fictional recovery acceptance"
    );
    await assert.rejects(
      artistRead(
        restored,
        fresh,
        new URLSearchParams({ view: "editor", id: artist.id })
      ),
      /unavailable/
    );
    await assert.rejects(
      artistRead(
        restored,
        undefined,
        new URLSearchParams({ view: "detail", id: artist.id })
      ),
      /unavailable/
    );
    const delegateFresh = await loginAccount(
      restored,
      delegate.email,
      delegate.password,
      "Fictional restored delegate"
    );
    await assert.rejects(
      artistCommand(restored, delegateFresh, accept),
      /unavailable/
    );
    const replay = await replayProtectedRestoration(restored, journals);
    assert.equal(replay.replayComplete, true);
    assert.equal(
      (
        await restored.artistProfile.findUniqueOrThrow({
          where: { id: artist.id }
        })
      ).controlVersion,
      a.controlVersion
    );
    assert.equal(
      (
        await restored.artistRelease.findUniqueOrThrow({
          where: { id: release.id }
        })
      ).controlVersion,
      r.controlVersion
    );
    writeFileSync(
      directory + "/artist-recovery-result.json",
      JSON.stringify(
        {
          result,
          replay,
          controls: controls.length,
          checks: [
            "real custom backup restored",
            "equal-checkpoint owner and delegates quarantined",
            "newer release withdrawal replayed",
            "newer unfollow replayed",
            "fresh login cannot restore execution authority",
            "repeat replay remains closed"
          ]
        },
        null,
        2
      )
    );
  } finally {
    for (const k of envNames)
      if (previous[k] === undefined) delete process.env[k];
      else process.env[k] = previous[k];
    await restored?.$disconnect();
    await db.$disconnect();
    await baseline.$disconnect();
    process.env.DATABASE_URL = priorDatabaseUrl;
    if (created) run("dropdb", [...args, name]);
    if (sourceCreated)
      run("dropdb", [...args, "godschurches_security_test_restore"]);
  }
});
