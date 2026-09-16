import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
const fixtureDir = process.argv[2];
assert.ok(fixtureDir, "Pass the existing isolated Exchange preview directory");
const config = JSON.parse(
  readFileSync(fixtureDir + "/browser-env.json", "utf8")
);
assert.match(config.origin, /^https:\/\/exchange-fixture\.example\.test:\d+$/);
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

const { exchangeHandoffCommand: command, readExchangeHandoffs } =
  await import("../lib/platform/exchange-handoffs.ts");
const actorsFile = fixtureDir + "/cost-actors.json";
let actor;
try {
  actor = JSON.parse(readFileSync(actorsFile, "utf8"));
} catch {
  const owner = await createPortalActor(db, "handcostowner"),
    reviewer = await createPortalActor(db, "handcostreview");
  await seedOperatorGrants(db, reviewer, ["REVIEW_COMMUNITY_REPORTS"]);
  await db.socialPreferences.create({
    data: { ownerId: owner.id, contactRequests: "EVERYONE" }
  });
  const listing = await db.exchangeListing.create({
    data: {
      ownerId: owner.id,
      creatorId: owner.id,
      state: "ACTIVE",
      title: "Isolated twenty-inquiry cost",
      description: "Fictional only",
      category: "FURNITURE",
      condition: "GOOD",
      country: "US",
      placeId: 4887398,
      placeLabel: "Chicago",
      itemPolicy: EXCHANGE_ITEM_POLICY,
      confirmedAt: new Date(),
      publishedAt: new Date()
    }
  });
  await command(db, owner.token, {
    operation: "contact",
    mutationId: randomUUID(),
    listingId: listing.id,
    listingVersion: listing.version,
    expectedVersion: 0,
    enabled: true
  });
  for (let n = 0; n < 20; n++) {
    const sender = await createPortalActor(db, "handcostrequest"),
      target = (
        await readExchangeHandoffs(db, sender.token, {
          view: "target",
          listingId: listing.id
        })
      ).target;
    await command(db, sender.token, {
      operation: "inquire",
      mutationId: randomUUID(),
      id: randomUUID(),
      listingId: listing.id,
      listingVersion: target.listingVersion,
      contactVersion: target.contactVersion,
      expectedVersion: 0,
      purpose: "Fictional cost inquiry"
    });
  }
  actor = owner;
  writeFileSync(actorsFile, JSON.stringify(actor), { mode: 0o600 });
}
const samples = [];
for (let n = 0; n < 5; n++) {
  queries.length = 0;
  const start = performance.now();
  const result = await readExchangeHandoffs(db, actor.token, {
    view: "incoming"
  });
  assert.equal(result.inquiries.length, 20);
  assert.ok(
    result.inquiries.every((r) => r.listing && r.person && !("purpose" in r))
  );
  samples.push({
    milliseconds: performance.now() - start,
    selects: queries.filter((q) => q.startsWith("SELECT")).length,
    statements: queries.length,
    summaryBytes: Buffer.byteLength(JSON.stringify(result)),
    summaryHash: createHash("sha256")
      .update(JSON.stringify(result))
      .digest("hex")
  });
}
writeFileSync(
  process.argv[3],
  JSON.stringify(
    { samples, at: new Date().toISOString(), productionWrites: 0 },
    null,
    2
  ),
  { mode: 0o600 }
);
console.log(JSON.stringify(samples));
await db.$disconnect();
