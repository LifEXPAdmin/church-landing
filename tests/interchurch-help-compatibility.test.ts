import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync, writeFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { PrismaClient } from "@prisma/client";
import { assertPortalTestDatabase, createPortalActor } from "./seed-portal";
const db = new PrismaClient();
before(() => assertPortalTestDatabase(db));
after(() => db.$disconnect());
test("actual reviewed Prisma client cannot read new grant enums; compatible client reads active/revoked direct/role grants and old writers cannot close typed requests", async () => {
  const directory = mkdtempSync(resolve(".account-test/interchurch-compat-"));
  const old = execFileSync(
    "git",
    ["show", "28aafcdf9c6136a8081c3b16ec79941dad11e512:prisma/schema.prisma"],
    { encoding: "utf8" }
  );
  const schema = old.replace(
    'provider = "prisma-client-js"',
    `provider = "prisma-client-js"\n  output = ${JSON.stringify(resolve(directory, "client"))}`
  );
  writeFileSync(resolve(directory, "schema.prisma"), schema);
  execFileSync(
    process.execPath,
    [
      "node_modules/prisma/build/index.js",
      "generate",
      "--schema",
      resolve(directory, "schema.prisma")
    ],
    { stdio: "pipe", env: process.env }
  );
  const Legacy = createRequire(import.meta.url)(
    resolve(directory, "client")
  ).PrismaClient;
  const legacy = new Legacy();
  try {
    const person = await createPortalActor(db, "helpcompat"),
      church = await db.church.create({
        data: {
          slug: "compat-" + randomUUID(),
          summary: "Fictional isolated enum acceptance",
          name: "Fictional enum compatibility church"
        }
      });
    const connection = await db.churchConnection.create({
      data: { churchId: church.id, userId: person.id, state: "APPROVED" }
    });
    const direct = await db.churchCapabilityGrant.create({
      data: {
        churchId: church.id,
        userId: person.id,
        capability: "COMMIT_INTERCHURCH_HELP"
      }
    });
    const position = await db.churchPosition.create({
      data: {
        churchId: church.id,
        name: "Fictional help delegate",
        requestKey: randomUUID()
      }
    });
    const assignment = await db.churchPositionAssignment.create({
      data: {
        churchId: church.id,
        connectionId: connection.id,
        positionId: position.id
      }
    });
    const role = await db.churchRoleGrant.create({
      data: {
        churchId: church.id,
        connectionId: connection.id,
        assignmentId: assignment.id,
        capability: "COMMIT_INTERCHURCH_HELP",
        grantedById: person.id
      }
    });
    for (const revoked of [false, true]) {
      if (revoked) {
        await db.churchCapabilityGrant.update({
          where: { id: direct.id },
          data: { revokedAt: new Date(), version: { increment: 1 } }
        });
        await db.churchRoleGrant.update({
          where: { id: role.id },
          data: { revokedAt: new Date(), version: { increment: 1 } }
        });
      }
      await assert.rejects(
        legacy.churchCapabilityGrant.findMany({ where: { userId: person.id } }),
        /COMMIT_INTERCHURCH_HELP|enum/
      );
      await assert.rejects(
        legacy.churchRoleGrant.findMany({
          where: { assignmentId: assignment.id }
        }),
        /COMMIT_INTERCHURCH_HELP|enum/
      );
      assert.equal(
        (
          await db.churchCapabilityGrant.findMany({
            where: { userId: person.id }
          })
        )[0].capability,
        "COMMIT_INTERCHURCH_HELP"
      );
      assert.equal(
        (
          await db.churchRoleGrant.findMany({
            where: { assignmentId: assignment.id }
          })
        )[0].capability,
        "COMMIT_INTERCHURCH_HELP"
      );
    }
    const id = randomUUID();
    await db.$transaction(async (tx) => {
      await tx.exchangeListing.create({
        data: {
          id,
          ownerChurchId: church.id,
          creatorId: person.id,
          intent: "CHURCH_NEED",
          helpPurpose: "INTERCHURCH_V1",
          title: "Fictional compatibility request"
        }
      });
      await tx.interchurchHelpRequest.create({
        data: {
          id,
          listingId: id,
          category: "AV",
          duties: "Fictional adult equipment setup",
          dutyClass: "ADULT_LOGISTICS",
          equipmentMode: "NONE",
          startLocal: "2027-01-01T12:00",
          endLocal: "2027-01-01T13:00",
          timeZone: "UTC",
          startAt: new Date("2027-01-01T12:00Z"),
          endAt: new Date("2027-01-01T13:00Z"),
          compensation: "VOLUNTARY",
          reimbursement: "None",
          coordinatorDisplay: "Not appointed"
        }
      });
    });
    await assert.rejects(
      legacy.exchangeListing.update({
        where: { id },
        data: { title: "Older writer bypass" }
      }),
      /Typed help writer required/
    );
    assert.equal(
      (
        await legacy.exchangeListing.findUnique({
          where: { id },
          select: { title: true }
        })
      ).title,
      "Fictional compatibility request"
    );
    await assert.rejects(db.interchurchHelpRequest.delete({ where: { id } }));
  } finally {
    await legacy.$disconnect();
  }
});

test("additive interchurch migration preserves every original column and infers no requests, offers or permissions", async () => {
  const name = "help_upgrade_" + randomUUID().replaceAll("-", "");
  const base = new URL(process.env.DATABASE_URL!);
  base.pathname = "/" + name;
  const target = base.toString(),
    pg = process.env.TEST_PG_BIN ?? "/opt/homebrew/opt/postgresql@17/bin";
  const sql = (query: string) =>
    execFileSync(
      pg + "/psql",
      [target, "-X", "-v", "ON_ERROR_STOP=1", "-Atc", query],
      { encoding: "utf8" }
    ).trim();
  await db.$executeRawUnsafe(`CREATE DATABASE "${name}"`);
  const upgrade = new PrismaClient({ datasourceUrl: target });
  try {
    const migration = "20260927195000_interchurch_help";
    const migrations = readdirSync("prisma/migrations")
      .filter((n) => /^\d/.test(n))
      .sort();
    for (const m of migrations.filter((n) => n < migration))
      execFileSync(
        pg + "/psql",
        [
          target,
          "-X",
          "-v",
          "ON_ERROR_STOP=1",
          "-f",
          `prisma/migrations/${m}/migration.sql`
        ],
        { stdio: "pipe" }
      );
    const actor = await upgrade.platformUser.create({
      data: {
        name: "Fictional preserved account",
        username: "help_upgrade",
        email: "help-upgrade@example.test"
      }
    });
    const church = await upgrade.church.create({
      data: {
        name: "Fictional preserved church",
        slug: "help-upgrade",
        summary: "Migration acceptance fixture"
      }
    });
    const connection = await upgrade.churchConnection.create({
      data: { userId: actor.id, churchId: church.id, state: "APPROVED" }
    });
    await upgrade.churchCapabilityGrant.create({
      data: {
        userId: actor.id,
        churchId: church.id,
        capability: "MANAGE_EXCHANGE_LISTINGS",
        dependencyConnectionId: connection.id
      }
    });
    const literal = (s: string) => "'" + s.replaceAll("'", "''") + "'";
    sql(
      `INSERT INTO "ExchangeListing" (id,"updatedAt","ownerChurchId","creatorId",intent,title) VALUES ('preserved-listing',NOW(),${literal(church.id)},${literal(actor.id)},'CHURCH_NEED','Preserved ordinary item need')`
    );
    const original = JSON.parse(
      sql(
        `SELECT json_agg(json_build_object('table',table_name,'columns',cols) ORDER BY table_name) FROM (SELECT table_name,json_agg(column_name ORDER BY ordinal_position) AS cols FROM information_schema.columns WHERE table_schema='public' GROUP BY table_name) x`
      )
    ) as Array<{ table: string; columns: string[] }>;
    const ident = (s: string) => '"' + s.replaceAll('"', '""') + '"';
    const snapshot = () =>
      original.map((t) =>
        sql(
          `SELECT md5(coalesce(jsonb_agg(to_jsonb(r) ORDER BY to_jsonb(r)::text)::text,'[]')) FROM (SELECT ${t.columns.map(ident).join(",")} FROM ${ident(t.table)}) r`
        )
      );
    const before = snapshot();
    for (const change of migrations.filter((n) => n >= migration))
      execFileSync(
        pg + "/psql",
        [
          target,
          "-X",
          "-v",
          "ON_ERROR_STOP=1",
          "-f",
          `prisma/migrations/${change}/migration.sql`
        ],
        { stdio: "pipe" }
      );
    assert.deepEqual(snapshot(), before);
    assert.ok(original.length >= 149);
    assert.equal(await upgrade.interchurchHelpRequest.count(), 0);
    assert.equal(await upgrade.interchurchHelpOffer.count(), 0);
    assert.equal(await upgrade.interchurchHelpAgreement.count(), 0);
    assert.equal(
      await upgrade.churchCapabilityGrant.count({
        where: { capability: "COMMIT_INTERCHURCH_HELP" }
      }),
      0
    );
    assert.equal(
      await upgrade.exchangeListing.count({
        where: { helpPurpose: { not: null } }
      }),
      0
    );
    console.log(
      `Interchurch upgrade preserved all original columns in ${original.length} populated-schema tables; new consent/authority counts are zero.`
    );
  } finally {
    await upgrade.$disconnect();
    await db.$executeRawUnsafe(`DROP DATABASE "${name}"`);
  }
});
