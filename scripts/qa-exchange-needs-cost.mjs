import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
const fixtureDir = process.argv[2];
assert.ok(fixtureDir, "Pass the existing isolated Exchange preview directory");
const config = JSON.parse(
  readFileSync(fixtureDir + "/browser-env.json", "utf8")
);
assert.match(config.origin, /^https:\/\/127\.0\.0\.1:\d+$/);
assert.match(config.localOrigin, /^https:\/\/127\.0\.0\.1:\d+$/);
assert.equal(new URL(config.database).hostname, "127.0.0.1");
Object.assign(process.env, {
  DATABASE_URL: config.database,
  DIRECT_URL: config.database,
  ACCOUNT_ORIGIN: config.localOrigin,
  NEXT_PUBLIC_SITE_URL: config.localOrigin,
  ACCOUNT_TEST_ISOLATED: "1",
  ACCOUNT_DELIVERY_MODE: "test-sink",
  ACCOUNT_TEST_SINK_DIR: process.cwd() + "/" + fixtureDir + "/sink",
  AUTH_RATE_LIMIT_SECRET: "medium-fixture-only-secret-".repeat(3),
  NODE_ENV: "test",
  VERCEL: "",
  PRIVILEGED_MFA_MODE: "enroll",
  COMMUNITY_REPORTS_ENABLED: "true",
  BLOB_READ_WRITE_TOKEN: "",
  RESEND_API_KEY: "",
  MAILERLITE_API_KEY: "",
  MEDIA_STORAGE_MODE: "local-test",
  MEDIA_TEST_DIR: process.cwd() + "/" + fixtureDir + "/images"
});
const { PrismaClient } = await import("@prisma/client");
const { createPortalActor, assertPortalTestDatabase, seedOperatorGrants } =
  await import("../tests/seed-portal.ts");
const { EXCHANGE_ITEM_POLICY } =
  await import("../lib/platform/exchange-options.ts");
const queries = [];
const db = new PrismaClient({ log: [{ emit: "event", level: "query" }] });
db.$on("query", (e) => queries.push(e.query));
await assertPortalTestDatabase(db);

const { exchangeNeedCommand: command } =
  await import("../lib/platform/exchange-need-commands.ts");
const { readExchangeNeeds: read } =
  await import("../lib/platform/exchange-need-reads.ts");
const { exchangeListingCommand } =
  await import("../lib/platform/exchange-listings.ts");
const { seedParticipation } =
  await import("../tests/seed-post-participation.ts");
const input = (operation, rest) => ({
  operation,
  mutationId: randomUUID(),
  ...rest
});
let manager, need;
try {
  try {
    ({ manager, need } = JSON.parse(
      readFileSync(fixtureDir + "/needs-cost-actors.json", "utf8")
    ));
  } catch {
    const f = await seedParticipation(db);
    manager = f.ada;
    await db.church.update({
      where: { id: f.churchA.id },
      data: { communityListed: true }
    });
    const reviewer = await createPortalActor(db, "needcostreview");
    await seedOperatorGrants(db, reviewer, ["REVIEW_COMMUNITY_REPORTS"]);
    await db.churchCapabilityGrant.create({
      data: {
        churchId: f.churchA.id,
        userId: manager.id,
        capability: "MANAGE_EXCHANGE_LISTINGS"
      }
    });
    await db.socialPreferences.upsert({
      where: { ownerId: manager.id },
      create: { ownerId: manager.id, contactRequests: "EVERYONE" },
      update: { contactRequests: "EVERYONE" }
    });
    await db.churchCapabilityGrant.create({
      data: {
        churchId: f.churchA.id,
        userId: f.val.id,
        capability: "MODERATE_EXCHANGE_LISTINGS"
      }
    });
    const listing = await db.exchangeListing.create({
      data: {
        ownerChurchId: f.churchA.id,
        creatorId: manager.id,
        intent: "CHURCH_NEED",
        category: "HOUSEHOLD",
        title: "Fictional full-page Needs cost",
        description: "Isolated bounded read measurement",
        requestedItems: "Fictional items",
        country: "US",
        placeId: 4887398,
        placeLabel: "Chicago"
      }
    });
    await command(
      db,
      manager.token,
      input("configure", {
        listingId: listing.id,
        listingVersion: listing.version,
        expectedVersion: 0,
        deadlineLocal: new Date(Date.now() + 3 * 86400000)
          .toISOString()
          .slice(0, 16),
        timeZone: "UTC",
        acceptCoordinator: true
      })
    );
    const slots = [];
    for (let n = 0; n < 12; n++)
      slots.push(
        await command(
          db,
          manager.token,
          input("slot", {
            needId: listing.id,
            slotId: randomUUID(),
            expectedVersion: 0,
            schema: 1,
            fields: {
              action: "DONATE",
              label: "Fictional slot " + n,
              unit: "items",
              target: 30,
              loan: false,
              returnLocal: null,
              returnTimeZone: null,
              returnResponsibility: "",
              volunteerSlotId: null
            }
          })
        )
      );
    const ready = await db.exchangeListing.findUniqueOrThrow({
      where: { id: listing.id }
    });
    await exchangeListingCommand(
      db,
      manager.token,
      input("status", {
        listingId: listing.id,
        expectedVersion: ready.version,
        state: "ACTIVE",
        itemPolicy: EXCHANGE_ITEM_POLICY,
        itemConfirmed: true
      })
    );
    need = await db.exchangeNeed.findUniqueOrThrow({
      where: { id: listing.id }
    });
    const slot = await db.exchangeNeedSlot.findUniqueOrThrow({
      where: { id: slots[0].id }
    });
    for (let n = 0; n < 21; n++) {
      const actor = await createPortalActor(db, "needcost");
      await command(
        db,
        actor.token,
        input("claim", {
          needId: need.id,
          slotId: slot.id,
          slotVersion: slot.version,
          consentVersion: need.consentVersion,
          id: randomUUID(),
          expectedVersion: 0,
          quantity: 1,
          note: "Fictional PRIVATE cost note " + n,
          price: null,
          currency: null,
          shareName: false,
          loanAccepted: false,
          waitlist: false
        })
      );
    }
    writeFileSync(
      fixtureDir + "/needs-cost-actors.json",
      JSON.stringify({ manager, need }),
      { mode: 0o600 }
    );
  }
  const samples = [];
  for (const view of ["contributors", "need"])
    for (let n = 0; n < 3; n++) {
      queries.length = 0;
      const start = performance.now();
      const result = await read(
        db,
        view === "contributors" ? manager.token : null,
        { view, id: need.id }
      );
      if (view === "contributors") {
        assert.equal(result.contributions.length, 20);
        assert.ok(result.next);
      } else {
        assert.equal(result.need.slots.length, 12);
        assert.equal(result.need.slots[0].committed, 21);
        assert.equal(
          JSON.stringify(result).includes("Fictional PRIVATE"),
          false
        );
      }
      samples.push({
        view,
        milliseconds: performance.now() - start,
        selects: queries.filter((q) => q.startsWith("SELECT")).length,
        statements: queries.length,
        bytes: Buffer.byteLength(JSON.stringify(result)),
        hash: createHash("sha256").update(JSON.stringify(result)).digest("hex")
      });
    }
  const first = await read(db, manager.token, {
    view: "contributors",
    id: need.id
  });
  const second = await read(db, manager.token, {
    view: "contributors",
    id: need.id,
    after: first.next
  });
  assert.equal(second.contributions.length, 1);
  assert.equal(second.next, null);
  const result = {
    at: new Date().toISOString(),
    slots: 12,
    contributions: 21,
    pageSize: 20,
    secondPage: 1,
    samples,
    productionWrites: 0,
    externalSends: 0
  };
  writeFileSync(
    fixtureDir + "/needs-cost.json",
    JSON.stringify(result, null, 2),
    { mode: 0o600 }
  );
  console.log(JSON.stringify(result));
} finally {
  await db.$disconnect();
}
