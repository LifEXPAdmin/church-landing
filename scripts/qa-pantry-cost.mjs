import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import {
  assertPortalTestDatabase,
  createPortalActor
} from "../tests/seed-portal.ts";
import { pantryCommand as command } from "../lib/platform/pantry-commands.ts";
import { readPantry as read } from "../lib/platform/pantry-reads.ts";
const queries = [];
const db = new PrismaClient({ log: [{ emit: "event", level: "query" }] });
db.$on("query", (e) => queries.push(e.query));
await assertPortalTestDatabase(db);
const input = (operation, fields = {}) => ({
  operation,
  mutationId: randomUUID(),
  ...fields
});
const future = (hours = 24) =>
  new Date(Date.now() + hours * 3600000).toISOString().slice(0, 16);
const hubFields = {
  title: "Fictional pantry",
  description: "Isolated assistance acceptance",
  hours: "Monday by appointment",
  accessInfo: "Public church entrance",
  eligibility: "Adults request their own pickup",
  audience: "PUBLIC",
  published: true,
  intakeEnabled: true,
  acceptCoordinator: true
};
const stockFields = {
  label: "Food parcels",
  unit: "parcels",
  availability: "EXACT",
  quantity: 10,
  description: "Contents can change",
  active: true,
  reason: "Fictional opening count"
};
const sessionFields = (capacity = 1) => ({
  startLocal: future(),
  endLocal: future(25),
  timeZone: "UTC",
  capacity,
  pickupDetails: "Private pickup entrance A",
  active: true
});

async function setup(audience = "PUBLIC") {
  const coordinator = await createPortalActor(db, "pantrycoord"),
    a = await createPortalActor(db, "pantrya"),
    b = await createPortalActor(db, "pantryb"),
    manager = await createPortalActor(db, "pantryother");
  const church = await db.church.create({
    data: {
      slug: "pantry-" + randomUUID(),
      name: "Fictional assistance church",
      summary: "Isolated",
      communityListed: true
    }
  });
  await db.churchConnection.createMany({
    data: [coordinator, a, b, manager].map((u) => ({
      userId: u.id,
      churchId: church.id,
      state: "APPROVED"
    }))
  });
  const grant = await db.churchCapabilityGrant.create({
    data: {
      churchId: church.id,
      userId: coordinator.id,
      capability: "MANAGE_CHURCH_ASSISTANCE"
    }
  });
  await db.churchCapabilityGrant.create({
    data: {
      churchId: church.id,
      userId: manager.id,
      capability: "MANAGE_EXCHANGE_LISTINGS"
    }
  });
  await db.socialPreferences.create({
    data: { ownerId: coordinator.id, contactRequests: "EVERYONE" }
  });
  const hub = await command(
    db,
    coordinator.token,
    input("configure", {
      churchId: church.id,
      expectedVersion: 0,
      schema: 1,
      fields: { ...hubFields, audience }
    })
  );
  const category = await command(
    db,
    coordinator.token,
    input("category", {
      hubId: hub.id,
      id: randomUUID(),
      expectedVersion: 0,
      schema: 1,
      fields: stockFields
    })
  );
  const session = await command(
    db,
    coordinator.token,
    input("session", {
      hubId: hub.id,
      id: randomUUID(),
      expectedVersion: 0,
      schema: 1,
      fields: sessionFields()
    })
  );
  const request = (actor = a) => {
    const body = input("request", {
      hubId: hub.id,
      id: randomUUID(),
      expectedVersion: 0,
      consentVersion: 1,
      coordinatorId: coordinator.id,
      accepted: true,
      items: [
        { categoryId: category.id, version: category.version, quantity: 2 }
      ],
      note: "Private practical note",
      pickupContact: "Chosen private contact"
    });
    return { body, run: () => command(db, actor.token, body) };
  };
  return {
    coordinator,
    a,
    b,
    manager,
    church,
    hub,
    category,
    session,
    grant,
    request
  };
}

const fixtureFile = process.argv[2],
  output = process.argv[3];
assert.ok(fixtureFile && output);
let f;
try {
  f = JSON.parse(readFileSync(fixtureFile, "utf8"));
} catch (error) {
  if (error.code !== "ENOENT") throw error;
  const prepared = await setup();
  f = { coordinator: prepared.coordinator, hub: prepared.hub };
  for (let i = 0; i < 20; i++) {
    const actor = await createPortalActor(db, "pantrycost");
    await prepared.request(actor).run();
  }
  writeFileSync(fixtureFile, JSON.stringify(f), { mode: 0o600 });
}
const samples = [];
for (let i = 0; i < 5; i++) {
  queries.length = 0;
  const start = performance.now();
  const snapshot = await read(db, f.coordinator.token, {
    view: "queue",
    id: f.hub.id
  });
  assert.equal(snapshot.requests.length, 20);
  samples.push({
    milliseconds: performance.now() - start,
    selects: queries.filter((q) => /^SELECT/i.test(q)).length,
    hash: createHash("sha256").update(JSON.stringify(snapshot)).digest("hex")
  });
}
writeFileSync(
  output,
  JSON.stringify(
    { at: new Date().toISOString(), sample: "20 isolated recipients", samples },
    null,
    2
  ),
  { mode: 0o600 }
);
console.log(JSON.stringify(samples));
await db.$disconnect();
