import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync, writeFileSync } from "node:fs";
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
          summary:"Fictional isolated enum acceptance", name: "Fictional enum compatibility church"
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
