import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  accessSync,
  constants,
  mkdtempSync,
  readdirSync,
  realpathSync,
  statSync,
  writeFileSync
} from "node:fs";
import { isAbsolute, join, parse } from "node:path";
import { PrismaClient } from "@prisma/client";
import { assertPortalTestDatabase } from "./seed-portal";
import {
  journalRetentionControls,
  type RetentionControlEntry
} from "../lib/platform/retention-controls";

const migration = "20261007185000_volunteer_service_history";
const ident = (value: string) => '"' + value.replaceAll('"', '""') + '"';
const literal = (value: string) => "'" + value.replaceAll("'", "''") + "'";
type Columns = Array<{ table: string; columns: string[] }>;

// The isolated runner verifies its storage mount. Require its explicit existing
// sink and scratch directories; never substitute a home directory or OS temp.
function directory(name: string) {
  const value = process.env[name];
  assert.ok(value && isAbsolute(value), `${name} must be an absolute path`);
  const path = realpathSync(value);
  assert.notEqual(path, parse(path).root);
  assert.ok(statSync(path).isDirectory());
  accessSync(path, constants.R_OK | constants.W_OK | constants.X_OK);
  return path;
}

test("populated predecessor upgrade and actual dump restore preserve volunteer history, private defaults and legacy-writer protection", async (t) => {
  const db = new PrismaClient();
  let restored: PrismaClient | undefined;
  const created: string[] = [];
  try {
    await assertPortalTestDatabase(db);
    const source = new URL(process.env.DATABASE_URL!);
    assert.equal(source.hostname, "127.0.0.1");
    assert.ok(source.port && source.username);
    // libpq must not receive Prisma-only URL options or an alternate host.
    assert.ok([...source.searchParams.keys()].every((key) => key === "schema"));
    if (source.searchParams.has("schema"))
      assert.equal(source.searchParams.get("schema"), "public");
    source.search = "";
    const pg = process.env.TEST_PG_BIN;
    assert.ok(pg && isAbsolute(pg), "TEST_PG_BIN must select PostgreSQL 17");
    const sink = directory("ACCOUNT_TEST_SINK_DIR");
    const scratch = directory("TMPDIR");
    assert.equal(
      statSync(sink).dev,
      statSync(scratch).dev,
      "Sink and scratch must use the same configured fixture volume"
    );
    const run = (tool: string, args: string[]) =>
      execFileSync(join(pg, tool), args, {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        maxBuffer: 32 * 1024 * 1024,
        timeout: 120_000,
        env: { ...process.env, TMPDIR: scratch, PGCONNECT_TIMEOUT: "5" }
      });
    for (const tool of ["psql", "pg_dump"])
      assert.match(run(tool, ["--version"]), /\(PostgreSQL\) 17\./);
    const psql = (url: URL, args: string[]) =>
      run("psql", [url.href, "-X", "-v", "ON_ERROR_STOP=1", ...args]);
    const sql = (url: URL, query: string) => psql(url, ["-qAtc", query]).trim();
    const json = <T>(url: URL, query: string): T =>
      JSON.parse(sql(url, query)) as T;
    assert.match(sql(source, "SHOW server_version"), /^17\./);
    const create = async (prefix: string) => {
      const name = prefix + randomUUID().replaceAll("-", "");
      assert.match(name, /^volunteer_(?:upgrade|restore)_[a-f0-9]{32}$/);
      await db.$executeRawUnsafe(
        `CREATE DATABASE ${ident(name)} TEMPLATE template0`
      );
      created.push(name);
      const url = new URL(source);
      url.pathname = "/" + name;
      assert.deepEqual(
        json(
          url,
          `SELECT json_build_object('name',current_database(),'host',host(inet_server_addr()))`
        ),
        { name, host: "127.0.0.1" }
      );
      return url;
    };
    const inventory = (url: URL): Columns =>
      json(
        url,
        `SELECT json_agg(json_build_object('table',table_name,'columns',cols) ORDER BY table_name)
        FROM (SELECT c.table_name,json_agg(c.column_name ORDER BY c.ordinal_position) AS cols
          FROM information_schema.columns c JOIN information_schema.tables t
          ON t.table_schema=c.table_schema AND t.table_name=c.table_name
          WHERE c.table_schema='public' AND t.table_type='BASE TABLE'
          GROUP BY c.table_name) x`
      );
    // One SQL call fingerprints every old column, including unrelated tables.
    // This catches rewritten timestamps, answers, capacity, grants and outbox rows.
    const snapshot = (url: URL, tables: Columns) => {
      assert.ok(tables.length > 0);
      const parts = tables.map(
        ({ table, columns }) =>
          `SELECT ${literal(table)} AS name, md5(coalesce(jsonb_agg(to_jsonb(r)
          ORDER BY to_jsonb(r)::text)::text,'[]')) AS digest FROM
          (SELECT ${columns.map(ident).join(",")} FROM ${ident(table)}) r`
      );
      return json<Record<string, string>>(
        url,
        `SELECT json_object_agg(name,digest ORDER BY name) FROM (${parts.join(" UNION ALL ")}) fingerprints`
      );
    };
    const upgraded = await create("volunteer_upgrade_");
    const names = readdirSync("prisma/migrations")
      .filter((name) => /^\d{14}_/.test(name))
      .sort();
    assert.ok(names.includes(migration));
    const predecessors = names.filter((name) => name < migration);
    assert.ok(predecessors.length > 0);
    for (const name of predecessors)
      psql(upgraded, [
        "-q",
        "-f",
        join("prisma/migrations", name, "migration.sql")
      ]);
    assert.equal(
      sql(
        upgraded,
        `SELECT count(*) FROM information_schema.columns
      WHERE table_schema='public' AND table_name IN ('PostVolunteerSignup','VolunteerApplication')
      AND column_name='serviceVersion'`
      ),
      "0"
    );
    // Only predecessor columns are written. No current generated model is used
    // to construct an old-schema row, and no source fixture data is modified.
    sql(
      upgraded,
      `
      INSERT INTO "PlatformUser" (id,"updatedAt",name,username,email) VALUES
        ('migration-organizer',NOW(),'Fictional organizer','migration_organizer','organizer@example.test'),
        ('migration-completed',NOW(),'Fictional completed','migration_completed','completed@example.test'),
        ('migration-active',NOW(),'Fictional active','migration_active','active@example.test'),
        ('migration-canceled',NOW(),'Fictional canceled','migration_canceled','canceled@example.test');
      INSERT INTO "Church" (id,slug,name,summary) VALUES
        ('migration-church','migration-church','Fictional church','SQL migration fixture');
      INSERT INTO "PlatformCalendar" (id,"churchId","creatorId","requestKey",name,"timeZone","updatedAt") VALUES
        ('migration-calendar','migration-church','migration-organizer','calendar','Fictional calendar','UTC',NOW());
      INSERT INTO "CalendarEvent" (id,"calendarId","requestKey",title,visibility,"timeZone","startLocal","endLocal","updatedAt") VALUES
        ('migration-event','migration-calendar','event','Fictional service','CHURCH','UTC','2026-10-01T10:00','2026-10-01T11:00',NOW());
      INSERT INTO "CalendarOccurrence" (id,"eventId",ordinal,title,"allDay","timeZone","startLocal","endLocal","startAt","endAt") VALUES
        ('migration-occurrence','migration-event',0,'Fictional service',false,'UTC','2026-10-01T10:00','2026-10-01T11:00','2026-10-01T10:00:00Z','2026-10-01T11:00:00Z');
      INSERT INTO "PlatformPost" (id,"updatedAt","authorId","authorChurchId","audienceChurchId",audience,content,"eventOccurrenceId") VALUES
        ('migration-post',NOW(),'migration-organizer','migration-church','migration-church','CHURCH','Fictional volunteer service','migration-occurrence');
      INSERT INTO "PostVolunteerSlot" (id,"postId","requestKey",role,capacity,version) VALUES
        ('migration-slot','migration-post','role','Fictional helpers',5,3);
      INSERT INTO "PostVolunteerSignup" (id,"slotId","userId",state,version,"slotVersion","eventVersion","occurrenceVersion","completedAt","updatedAt") VALUES
        ('migration-signup-done','migration-slot','migration-completed','ACTIVE',7,3,1,1,'2026-10-01T11:15:00.123',NOW()),
        ('migration-signup-active','migration-slot','migration-active','ACTIVE',4,3,1,1,NULL,NOW()),
        ('migration-signup-canceled','migration-slot','migration-canceled','CANCELED',9,3,1,1,'2026-10-01T11:20:00.456',NOW());
      INSERT INTO "VolunteerOpportunity" (id,"postId","slotId",title,duties,commitment,capacity,"updatedAt") VALUES
        ('migration-timed','migration-post','migration-slot','Fictional timed role','Help with this fictional service','',NULL,NOW()),
        ('migration-untimed','migration-post',NULL,'Fictional untimed role','Help with this fictional project','One fictional project',5,NOW());
      INSERT INTO "VolunteerApplication" (id,"opportunityId","userId","signupId",statement,"decisionNote",availability,state,version,"opportunityVersion","slotVersion","eventVersion","occurrenceVersion","updatedAt") VALUES
        ('migration-app-timed','migration-timed','migration-completed','migration-signup-done','Private old timed answer','Private old acceptance','Fictional mornings','ACCEPTED',3,1,3,1,1,NOW()),
        ('migration-app-untimed','migration-untimed','migration-active',NULL,'Private old untimed answer','Private old untimed decision','Fictional afternoons','ACCEPTED',2,1,NULL,NULL,NULL,NOW()),
        ('migration-app-withdrawn','migration-untimed','migration-canceled',NULL,'Private old withdrawn answer','','','WITHDRAWN',4,1,NULL,NULL,NULL,NOW());
      INSERT INTO "VolunteerApplicationEvent" (id,"applicationId","actorId",action,version,note) VALUES
        ('migration-event-timed','migration-app-timed','migration-organizer','ACCEPTED',3,'Private old application history'),
        ('migration-event-untimed','migration-app-untimed','migration-organizer','ACCEPTED',2,'Private old untimed history'),
        ('migration-event-withdrawn','migration-app-withdrawn','migration-canceled','WITHDRAWN',4,'');
    `
    );
    const oldControl = {
      id: "migration-existing-control",
      target: "ACCOUNT",
      targetId: "migration-canceled",
      sourceId: "migration-app-withdrawn",
      kind: "VOLUNTEER_APPLICATION",
      version: 4,
      policy: "GC-MSG-RETENTION-v1",
      outcome: "QUARANTINED",
      operatorId: "migration-canceled",
      recordedAt: "2026-10-01T12:00:00.000Z",
      startedAt: "2026-10-01T12:00:00.000Z",
      reviewDueAt: "2026-12-30T12:00:00.000Z",
      endedAt: null
    };
    sql(
      upgraded,
      `INSERT INTO "RetentionControl" (id,target,"targetId","sourceId",kind,version,payload)
      VALUES (${literal(oldControl.id)},'ACCOUNT',${literal(oldControl.targetId)},${literal(oldControl.sourceId)},
      'VOLUNTEER_APPLICATION',4,${literal(JSON.stringify(oldControl))}::jsonb)`
    );
    const oldColumns = inventory(upgraded);
    const before = snapshot(upgraded, oldColumns);
    psql(upgraded, [
      "-q",
      "-f",
      join("prisma/migrations", migration, "migration.sql")
    ]);
    assert.deepEqual(
      snapshot(upgraded, oldColumns),
      before,
      "Every original column and row must survive, without new receipts, notifications, grants or recovery decisions"
    );
    const serviceRows = (url: URL, table: string) =>
      json<
        Array<{
          id: string;
          completionVersion: number;
          serviceVersion: number;
          completionNote: string;
          serviceSharedAt: string | null;
          serviceSharedCompletionVersion: number | null;
          serviceRecoveryRequired: boolean;
          completedAt: string | null;
        }>
      >(
        url,
        `SELECT json_agg(r ORDER BY id) FROM (SELECT id,"completedAt","completionVersion","serviceVersion", "completionNote", "serviceSharedAt", "serviceSharedCompletionVersion", "serviceRecoveryRequired" FROM ${ident(table)}) r`
      );
    for (const row of serviceRows(upgraded, "PostVolunteerSignup")) {
      assert.equal(row.completionVersion, row.completedAt === null ? 0 : 1);
      assert.equal(row.serviceVersion, 0);
      assert.equal(row.completionNote, "");
      assert.equal(row.serviceSharedAt, null);
      assert.equal(row.serviceSharedCompletionVersion, null);
      assert.equal(row.serviceRecoveryRequired, false);
    }
    for (const row of serviceRows(upgraded, "VolunteerApplication")) {
      assert.equal(
        row.completedAt,
        null,
        "An accepted untimed application or linked signup is not a new application completion"
      );
      assert.equal(row.completionVersion, 0);
      assert.equal(row.serviceVersion, 0);
      assert.equal(row.completionNote, "");
      assert.equal(row.serviceSharedAt, null);
      assert.equal(row.serviceSharedCompletionVersion, null);
      assert.equal(row.serviceRecoveryRequired, false);
    }
    const allColumns = inventory(upgraded);
    const upgradedSnapshot = snapshot(upgraded, allColumns);
    // Keep SQL evidence outside the email sink's flat message directory.
    const evidence = mkdtempSync(join(scratch, "volunteer-service-upgrade-"));
    t.diagnostic(`Fictional upgrade/restore evidence retained at ${evidence}`);
    const dump = join(evidence, "snapshot.sql");
    writeFileSync(dump, "", { flag: "wx", mode: 0o600 });
    run("pg_dump", ["--no-owner", "--no-acl", "--file", dump, upgraded.href]);
    const target = await create("volunteer_restore_");
    psql(target, ["-q", "-f", dump]);
    assert.deepEqual(inventory(target), allColumns);
    assert.deepEqual(snapshot(target, allColumns), upgradedSnapshot);
    assert.deepEqual(
      json(
        target,
        `SELECT json_agg(tgname ORDER BY tgname) FROM pg_trigger
      WHERE NOT tgisinternal AND tgname IN ('volunteer_service_signup_scrub','volunteer_service_application_scrub')`
      ),
      ["volunteer_service_application_scrub", "volunteer_service_signup_scrub"]
    );
    // The restored constraints reject invalid consent, rather than silently
    // converting it to consent for a different completion revision.
    assert.throws(
      () =>
        sql(
          target,
          `UPDATE "PostVolunteerSignup" SET "serviceVersion"=1,
      "serviceSharedAt"=NOW(),"serviceSharedCompletionVersion"=99 WHERE id='migration-signup-done'`
        ),
      /PostVolunteerSignup_service_bounds/
    );
    assert.deepEqual(snapshot(target, allColumns), upgradedSnapshot);
    // Direct SQL deliberately models a compatible old writer, not canonical
    // service authorization. Exercise both restored trigger attachments.
    sql(
      target,
      `UPDATE "PostVolunteerSignup" SET "serviceVersion"=1,"completionNote"='Fictional restore-only note',
      "serviceSharedAt"=NOW(),"serviceSharedCompletionVersion"=1 WHERE id='migration-signup-done';
      UPDATE "VolunteerApplication" SET "completedAt"='2026-10-01T12:30:00',"completionVersion"=1,
      "serviceVersion"=1,version=version+1 WHERE id='migration-app-untimed';
      UPDATE "VolunteerApplication" SET "serviceVersion"=2,"completionNote"='Fictional restore-only note',
      "serviceSharedAt"=NOW(),"serviceSharedCompletionVersion"=1 WHERE id='migration-app-untimed';`
    );
    for (const [table, id] of [
      ["PostVolunteerSignup", "migration-signup-done"],
      ["VolunteerApplication", "migration-app-untimed"]
    ])
      assert.ok(
        serviceRows(target, table).find((row) => row.id === id)?.serviceSharedAt
      );
    sql(
      target,
      `UPDATE "PostVolunteerSignup" SET "completedAt"=NULL,version=version+1 WHERE id='migration-signup-done';
      UPDATE "VolunteerApplication" SET "completedAt"=NULL,version=version+1 WHERE id='migration-app-untimed';`
    );
    for (const [table, id, version] of [
      ["PostVolunteerSignup", "migration-signup-done", 2],
      ["VolunteerApplication", "migration-app-untimed", 3]
    ] as const) {
      const row = serviceRows(target, table).find((value) => value.id === id)!;
      assert.equal(row.completedAt, null);
      assert.equal(row.completionVersion, 2);
      assert.equal(row.serviceVersion, version);
      assert.equal(row.serviceRecoveryRequired, true);
      assert.equal(row.completionNote, "");
      assert.equal(row.serviceSharedAt, null);
      assert.equal(row.serviceSharedCompletionVersion, null);
    }
    const controls = json<RetentionControlEntry[]>(
      target,
      `SELECT json_agg(payload ORDER BY kind) FROM "RetentionControl"
      WHERE kind IN ('VOLUNTEER_SERVICE_SIGNUP','VOLUNTEER_SERVICE_APPLICATION')`
    );
    assert.equal(controls.length, 2);
    assert.deepEqual(
      controls.map(({ kind, sourceId, targetId, operatorId, version }) => ({
        kind,
        sourceId,
        targetId,
        operatorId,
        version
      })),
      [
        {
          kind: "VOLUNTEER_SERVICE_APPLICATION",
          sourceId: "migration-app-untimed",
          targetId: "migration-active",
          operatorId: "migration-active",
          version: 3
        },
        {
          kind: "VOLUNTEER_SERVICE_SIGNUP",
          sourceId: "migration-signup-done",
          targetId: "migration-completed",
          operatorId: "migration-completed",
          version: 2
        }
      ]
    );
    assert.ok(
      !JSON.stringify(controls).includes("Fictional restore-only note")
    );
    restored = new PrismaClient({ datasourceUrl: target.href });
    const journaled: RetentionControlEntry[] = [];
    const result = await journalRetentionControls(
      restored,
      {
        async record(entry) {
          journaled.push(entry);
        }
      },
      ["migration-active", "migration-completed"]
    );
    assert.deepEqual(result, { recorded: 2, failed: 0, pending: 0 });
    assert.deepEqual(
      journaled.map((entry) => entry.id).sort(),
      controls.map((entry) => entry.id).sort()
    );
    assert.equal(
      sql(
        target,
        `SELECT count(*) FROM "PostVolunteerSignup" WHERE state='ACTIVE'`
      ),
      "2"
    );
    assert.equal(
      sql(
        target,
        `SELECT capacity FROM "PostVolunteerSlot" WHERE id='migration-slot'`
      ),
      "5"
    );
    assert.equal(
      sql(
        target,
        `SELECT state FROM "VolunteerApplication" WHERE id='migration-app-untimed'`
      ),
      "ACCEPTED"
    );
    assert.deepEqual(
      snapshot(upgraded, allColumns),
      upgradedSnapshot,
      "Restored corrections and journal writes must not change the upgraded source database"
    );
    writeFileSync(
      join(evidence, "receipt.json"),
      JSON.stringify(
        {
          migration,
          predecessorCount: predecessors.length,
          preservedTables: oldColumns.length,
          oldColumnFingerprints: before,
          upgradedFingerprints: upgradedSnapshot,
          restoredTriggerControls: controls,
          sourceUnchanged: true
        },
        null,
        2
      ) + "\n",
      { flag: "wx", mode: 0o600 }
    );
    t.diagnostic(
      `Preserved ${oldColumns.length} tables across ${predecessors.length} predecessor migrations; both restored legacy-writer triggers journaled valid owner controls.`
    );
  } finally {
    await restored?.$disconnect();
    // Only names successfully created by this test are eligible for teardown.
    // Keep the generated dump and receipt as evidence, including after failure.
    try {
      for (const name of created.reverse())
        await db.$executeRawUnsafe(`DROP DATABASE ${ident(name)}`);
    } finally {
      await db.$disconnect();
    }
  }
});
