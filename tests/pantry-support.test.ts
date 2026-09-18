import { exchangeNeedCommand } from "../lib/platform/exchange-need-commands";
import { exchangeListingCommand } from "../lib/platform/exchange-listings";
import { EXCHANGE_ITEM_POLICY } from "../lib/platform/exchange-options";
import { pantryRequestReadSources } from "../lib/platform/pantry-read-access";
import { purgeMessagingCandidate } from "../lib/platform/messaging-retention";
import {
  prepareAccountExport,
  downloadAccountExport
} from "../lib/platform/account-export";
import { requestPermanentAccountDeletion } from "../lib/platform/account-deletion";
import { eraseRequestedAccountData } from "../lib/platform/account-erasure";
import { createSessionToken } from "../lib/platform/auth";
import {
  readCommunityReports,
  communityReportCommand
} from "../lib/platform/community-reports";
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import {
  assertPortalTestDatabase,
  createPortalActor,
  seedOperatorGrants,
  type PortalActor
} from "./seed-portal";
import { pantryCommand as command } from "../lib/platform/pantry-commands";
import { readPantry as read } from "../lib/platform/pantry-reads";
import {
  parsePantryCategory,
  parsePantrySession
} from "../lib/platform/pantry-input";
import { relationshipCommand } from "../lib/platform/relationships";
import { PortalError } from "../lib/platform/portal-policy";
import { handlePantryRequest } from "../lib/platform/pantry-boundary";
import { currentPantryRequest } from "../lib/platform/pantry-policy";
import { pantryRequestEvidence } from "../lib/platform/pantry-evidence";
import { notificationPushAllowed } from "../lib/platform/notification-preferences";
import { notificationSources } from "../lib/platform/notification-source";
import {
  replayRetentionControls,
  type RetentionControlEntry
} from "../lib/platform/retention-controls";

const db = new PrismaClient();
let reviewer: PortalActor;
const oldReports = process.env.COMMUNITY_REPORTS_ENABLED;
before(async () => {
  await assertPortalTestDatabase(db);
  process.env.COMMUNITY_REPORTS_ENABLED = "true";
  reviewer = await createPortalActor(db, "pantryreview");
  await seedOperatorGrants(db, reviewer, ["REVIEW_COMMUNITY_REPORTS"]);
});
after(async () => {
  process.env.COMMUNITY_REPORTS_ENABLED = oldReports;
  await db.$disconnect();
});
const input = (operation: string, fields: Record<string, unknown> = {}) => ({
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
const status = (code: number) => (e: unknown) =>
  e instanceof PortalError && e.status === code;
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

test("pantry rejects unsupported fields, false counts and invalid pickup windows", () => {
  assert.throws(
    () =>
      parsePantryCategory(1, { ...stockFields, availability: "APPROXIMATE" }),
    status(400)
  );
  assert.throws(
    () => parsePantryCategory(1, { ...stockFields, quantity: 1.5 }),
    status(400)
  );
  assert.throws(
    () => parsePantryCategory(1, { ...stockFields, ownerId: "invented" }),
    status(400)
  );
  assert.throws(
    () => parsePantrySession(1, { ...sessionFields(), endLocal: future(23) }),
    status(400)
  );
});
test("ordinary members and Exchange managers never inherit recipient access", async () => {
  const f = await setup();
  const r = await f.request().run();
  const publicView = await read(db, undefined, { view: "hub", id: f.hub.id });
  assert.ok("categories" in publicView);
  assert.equal(publicView.categories?.length, 1);
  const encoded = JSON.stringify(publicView);
  for (const hidden of [
    f.a.id,
    "Private practical note",
    "Chosen private contact",
    "pickupDetails",
    "coordinatorNote"
  ])
    assert.ok(!encoded.includes(hidden), hidden);
  for (const actor of [f.b, f.manager]) {
    await assert.rejects(
      read(db, actor.token, { view: "request", id: r.id }),
      status(404)
    );
    await assert.rejects(
      read(db, actor.token, { view: "queue", id: f.hub.id }),
      status(404)
    );
  }
  await assert.rejects(
    read(db, f.manager.token, { view: "manage", id: f.hub.id }),
    status(404)
  );
  await db.churchCapabilityGrant.create({
    data: {
      userId: f.manager.id,
      churchId: f.church.id,
      capability: "MANAGE_CHURCH_ASSISTANCE"
    }
  });
  assert.ok(
    "categories" in
      (await read(db, f.manager.token, { view: "manage", id: f.hub.id }))
  );
  await assert.rejects(
    read(db, f.manager.token, { view: "queue", id: f.hub.id }),
    status(404)
  );
});
test("private request exact retry preserves one receipt and one active request", async () => {
  const f = await setup(),
    req = f.request();
  const first = await req.run();
  assert.deepEqual(await req.run(), first);
  assert.equal(await db.pantryRequest.count({ where: { hubId: f.hub.id } }), 1);
  await assert.rejects(
    command(db, f.a.token, { ...req.body, note: "Different retry" }),
    status(409)
  );
  await assert.rejects(f.request().run(), status(409));
  const own = await read(db, f.a.token, { view: "request", id: first.id });
  assert.ok("requests" in own);
  assert.equal(own.requests?.[0].note, "Private practical note");
  assert.ok(!JSON.stringify(own).includes("coordinatorNote"));
});
test("pickup races respect capacity and cancellation returns exactly one place", async () => {
  const f = await setup(),
    a = await f.request().run(),
    b = await f.request(f.b).run();
  const assign = (r: { id: string; version: number }) =>
    command(
      db,
      f.coordinator.token,
      input("assign", {
        id: r.id,
        expectedVersion: r.version,
        sessionId: f.session.id,
        sessionVersion: f.session.version
      })
    );
  const results = await Promise.allSettled([assign(a), assign(b)]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(
    results.filter((r) => r.status === "rejected" && status(409)(r.reason))
      .length,
    1
  );
  const rows = await db.pantryRequest.findMany({ where: { hubId: f.hub.id } });
  const booked = rows.find((r) => r.state === "ASSIGNED")!,
    waiting = rows.find((r) => r.state === "REQUESTED")!;
  const actor = booked.requesterId === f.a.id ? f.a : f.b;
  const canceled = input("cancel", {
    id: booked.id,
    expectedVersion: booked.version
  });
  const first = await command(db, actor.token, canceled);
  assert.deepEqual(await command(db, actor.token, canceled), first);
  await assign(waiting);
  assert.equal(
    await db.pantryRequest.count({
      where: { sessionId: f.session.id, state: "ASSIGNED" }
    }),
    1
  );
});
test("only the requester confirms the offer; booked directions cannot change silently", async () => {
  const f = await setup(),
    row = await f.request().run();
  const assigned = await command(
    db,
    f.coordinator.token,
    input("assign", {
      id: row.id,
      expectedVersion: row.version,
      sessionId: f.session.id,
      sessionVersion: 1
    })
  );
  await assert.rejects(
    command(
      db,
      f.coordinator.token,
      input("confirm", {
        id: row.id,
        expectedVersion: assigned.version,
        sessionVersion: 1
      })
    ),
    status(404)
  );
  await assert.rejects(
    command(
      db,
      f.a.token,
      input("confirm", {
        id: row.id,
        expectedVersion: assigned.version,
        sessionVersion: 2
      })
    ),
    status(409)
  );
  await command(
    db,
    f.a.token,
    input("confirm", {
      id: row.id,
      expectedVersion: assigned.version,
      sessionVersion: 1
    })
  );
  await assert.rejects(
    command(
      db,
      f.coordinator.token,
      input("session", {
        hubId: f.hub.id,
        id: f.session.id,
        expectedVersion: 1,
        schema: 1,
        fields: { ...sessionFields(), pickupDetails: "Changed private door" }
      })
    ),
    status(409)
  );
  assert.ok(
    (await db.pantryRequest.findUniqueOrThrow({ where: { id: row.id } }))
      .confirmedAt
  );
});
test("collection and missed outcomes enforce time, retain used session capacity and keep notes private", async () => {
  const f = await setup(),
    r = await f.request().run();
  let current = await command(
    db,
    f.coordinator.token,
    input("assign", {
      id: r.id,
      expectedVersion: r.version,
      sessionId: f.session.id,
      sessionVersion: 1
    })
  );
  for (const state of ["COLLECTED", "MISSED"])
    await assert.rejects(
      command(
        db,
        f.coordinator.token,
        input("outcome", {
          id: r.id,
          expectedVersion: current.version,
          state,
          reason: "Fictional observation"
        })
      ),
      status(409)
    );
  const startsAt = new Date(Date.now() - 7200000),
    endsAt = new Date(Date.now() - 3600000);
  await db.pantrySession.update({
    where: { id: f.session.id },
    data: { startsAt, endsAt }
  });
  current = await command(
    db,
    f.coordinator.token,
    input("outcome", {
      id: r.id,
      expectedVersion: current.version,
      state: "COLLECTED",
      reason: "Fictional pickup observed"
    })
  );
  current = await command(
    db,
    f.coordinator.token,
    input("note", {
      id: r.id,
      expectedVersion: current.version,
      note: "Restricted coordinator detail"
    })
  );
  const own = await read(db, f.a.token, { view: "request", id: r.id });
  assert.ok(!JSON.stringify(own).includes("Restricted coordinator detail"));
  const queue = await read(db, f.coordinator.token, {
    view: "queue",
    id: f.hub.id
  });
  assert.ok(JSON.stringify(queue).includes("Restricted coordinator detail"));
  const evidence = pantryRequestEvidence(
    await db.pantryRequest.findUniqueOrThrow({ where: { id: r.id } })
  );
  assert.ok(evidence.includes("Private practical note"));
  assert.ok(!evidence.includes("Restricted coordinator detail"));
  assert.ok(!evidence.includes("Chosen private contact"));
  const sessions = await read(db, f.coordinator.token, {
    view: "sessions",
    id: f.hub.id
  });
  assert.ok("sessions" in sessions);
  assert.equal(sessions.sessions?.[0].occupied, 1);
});
test("block and unblock never revive private request consent", async () => {
  const f = await setup(),
    r = await f.request().run();
  await relationshipCommand(
    db,
    f.a.token,
    input("block", {
      kind: "person",
      targetId: f.coordinator.id,
      expectedVersion: 0,
      desired: true
    })
  );
  const row = await db.pantryRequest.findUniqueOrThrow({ where: { id: r.id } });
  assert.equal(row.state, "REVOKED");
  assert.equal(row.authorityKey, null);
  const relationship = await db.socialRelationship.findUniqueOrThrow({
    where: {
      ownerId_targetUserId: { ownerId: f.a.id, targetUserId: f.coordinator.id }
    }
  });
  await relationshipCommand(
    db,
    f.a.token,
    input("block", {
      kind: "person",
      targetId: f.coordinator.id,
      expectedVersion: relationship.version,
      desired: false
    })
  );
  assert.equal(
    await db.$transaction((tx) => currentPantryRequest(tx, row)),
    null
  );
  const own = await read(db, f.a.token, { view: "request", id: r.id });
  assert.ok("requests" in own);
  assert.equal(own.requests?.[0].note, "");
});
test("regained assistance duty requires new coordinator consent and leaves old recipients private", async () => {
  const f = await setup(),
    r = await f.request().run();
  await db.churchCapabilityGrant.update({
    where: { id: f.grant.id },
    data: { revokedAt: new Date(), version: { increment: 1 } }
  });
  await assert.rejects(
    read(db, f.coordinator.token, { view: "queue", id: f.hub.id }),
    status(404)
  );
  await db.churchCapabilityGrant.update({
    where: { id: f.grant.id },
    data: { revokedAt: null, version: { increment: 1 } }
  });
  await assert.rejects(
    read(db, f.coordinator.token, { view: "queue", id: f.hub.id }),
    status(404)
  );
  const hub = await db.pantryHub.findUniqueOrThrow({ where: { id: f.hub.id } });
  await command(
    db,
    f.coordinator.token,
    input("configure", {
      churchId: f.church.id,
      expectedVersion: hub.version,
      schema: 1,
      fields: hubFields
    })
  );
  assert.equal(
    (await db.pantryRequest.findUniqueOrThrow({ where: { id: r.id } }))
      .authorityKey,
    null
  );
});
test("church-only hub and exact API denials never leak recipient rows or cache private responses", async () => {
  const f = await setup("CHURCH"),
    r = await f.request().run();
  await assert.rejects(
    read(db, undefined, { view: "hub", id: f.hub.id }),
    status(404)
  );
  await db.churchConnection.update({
    where: { userId_churchId: { userId: f.a.id, churchId: f.church.id } },
    data: { state: "LEFT", version: { increment: 1 } }
  });
  const own = await read(db, f.a.token, { view: "request", id: r.id });
  assert.ok("requests" in own);
  assert.equal(own.requests?.[0].current, false);
  for (const path of [
    "?view=mine",
    `?view=request&id=${r.id}`,
    `?view=queue&id=${f.hub.id}`
  ]) {
    const response = await handlePantryRequest(
      db,
      new Request("http://127.0.0.1/api/platform/pantry" + path)
    );
    assert.equal(response.status, 404);
    assert.equal(response.headers.get("cdn-cache-control"), "no-store");
    assert.ok((await response.text()).includes("unavailable"));
  }
  const bad = await handlePantryRequest(
    db,
    new Request(
      "http://127.0.0.1/api/platform/pantry?view=mine&ownerId=" + f.a.id
    )
  );
  assert.equal(bad.status, 400);
});
test("request notifications are generic, current-access bound and require dated phone opt-in", async () => {
  const f = await setup(),
    r = await f.request().run();
  const event = await db.socialEvent.findFirstOrThrow({
    where: { kind: "PANTRY_REQUEST", sourceId: r.id }
  });
  assert.ok(
    !JSON.stringify(event, (_key, value) =>
      typeof value === "bigint" ? String(value) : value
    ).includes("Private practical note")
  );
  const sources = await db.$transaction((tx) =>
    notificationSources(tx, [event], false)
  );
  assert.equal(sources.size, 1);
  const pref = await db.socialPreferences.update({
    where: { ownerId: f.coordinator.id },
    data: { pushCategories: ["assistance"], notificationPushSince: {} }
  });
  assert.equal(notificationPushAllowed(pref, "assistance", new Date()), false);
  await db.churchCapabilityGrant.update({
    where: { id: f.grant.id },
    data: { revokedAt: new Date(), version: { increment: 1 } }
  });
  assert.equal(
    (await db.$transaction((tx) => notificationSources(tx, [event], false)))
      .size,
    0
  );
});
test("protected restore quarantines older hub and removes recoverable private text", async () => {
  const f = await setup(),
    r = await f.request().run();
  const control = await db.retentionControl.findFirstOrThrow({
    where: { kind: "PANTRY_HUB", sourceId: f.hub.id },
    orderBy: { version: "desc" }
  });
  await db.pantryHub.update({ where: { id: f.hub.id }, data: { version: 1 } });
  await replayRetentionControls(db, [
    control.payload as unknown as RetentionControlEntry
  ]);
  const hub = await db.pantryHub.findUniqueOrThrow({ where: { id: f.hub.id } });
  assert.equal(hub.recoveryRequired, true);
  assert.equal(hub.published, false);
  const row = await db.pantryRequest.findUniqueOrThrow({ where: { id: r.id } });
  assert.equal(row.note, "");
  assert.equal(row.authorityKey, null);
  await assert.rejects(
    read(db, f.coordinator.token, { view: "queue", id: f.hub.id }),
    status(404)
  );
});

test("private requests cannot change the public hub projection or disclose activity through versions", async () => {
  const f = await setup();
  const before = await read(db, undefined, { view: "hub", id: f.hub.id });
  const row = await f.request().run();
  await command(
    db,
    f.coordinator.token,
    input("note", {
      id: row.id,
      expectedVersion: row.version,
      note: "Private internal marker"
    })
  );
  assert.deepEqual(
    await read(db, undefined, { view: "hub", id: f.hub.id }),
    before
  );
});
test("withdrawing coordinator consent closes intake and never transfers recipient history", async () => {
  const f = await setup(),
    r = await f.request().run();
  const hub = await db.pantryHub.findUniqueOrThrow({ where: { id: f.hub.id } });
  await command(
    db,
    f.coordinator.token,
    input("configure", {
      churchId: f.church.id,
      expectedVersion: hub.version,
      schema: 1,
      fields: { ...hubFields, acceptCoordinator: false }
    })
  );
  const saved = await db.pantryHub.findUniqueOrThrow({
    where: { id: f.hub.id }
  });
  assert.equal(saved.intakeEnabled, false);
  assert.equal(saved.coordinatorId, null);
  assert.equal(
    (await db.pantryRequest.findUniqueOrThrow({ where: { id: r.id } }))
      .authorityKey,
    null
  );
  await assert.rejects(f.request(f.b).run(), status(404));
});
test("stock adjustments require reasons and stale selections cannot claim changed categories", async () => {
  const f = await setup(),
    req = f.request();
  await assert.rejects(
    command(
      db,
      f.coordinator.token,
      input("category", {
        hubId: f.hub.id,
        id: f.category.id,
        expectedVersion: 1,
        schema: 1,
        fields: { ...stockFields, reason: "" }
      })
    ),
    status(400)
  );
  const saved = await command(
    db,
    f.coordinator.token,
    input("category", {
      hubId: f.hub.id,
      id: f.category.id,
      expectedVersion: 1,
      schema: 1,
      fields: {
        ...stockFields,
        quantity: 7,
        reason: "Observed three parcels removed"
      }
    })
  );
  await assert.rejects(req.run(), status(409));
  const event = await db.pantryEvent.findFirstOrThrow({
    where: { hubId: f.hub.id, action: "STOCK", quantity: 7 }
  });
  assert.equal(event.actorId, f.coordinator.id);
  assert.equal(event.previousQuantity, 10);
  assert.equal(
    (await read(db, undefined, { view: "hub", id: f.hub.id })).categories?.[0]
      .version,
    saved.version
  );
});
test("replenishment seed requires separate Exchange authority and carries only category information", async () => {
  const f = await setup();
  await f.request().run();
  await assert.rejects(
    read(db, f.coordinator.token, { view: "replenish", id: f.category.id }),
    status(404)
  );
  await db.churchCapabilityGrant.create({
    data: {
      churchId: f.church.id,
      userId: f.coordinator.id,
      capability: "PUBLISH_EXCHANGE_LISTINGS"
    }
  });
  const seed = (
    await read(db, f.coordinator.token, {
      view: "replenish",
      id: f.category.id
    })
  ).replenishmentSeed;
  assert.deepEqual(Object.keys(seed!).sort(), [
    "audience",
    "categoryId",
    "churchId",
    "requestedItems",
    "title",
    "version"
  ]);
  assert.equal(seed?.requestedItems, "Food parcels (parcels)");
  assert.ok(!JSON.stringify(seed).includes("Private practical note"));
  await assert.rejects(
    read(db, f.manager.token, { view: "replenish", id: f.category.id }),
    status(404)
  );
});
test("ended request clearing removes selected text and coordinator reasons without exposing either to another recipient", async () => {
  const f = await setup(),
    r = await f.request().run();
  const note = await command(
    db,
    f.coordinator.token,
    input("note", {
      id: r.id,
      expectedVersion: r.version,
      note: "Private coordinator marker"
    })
  );
  await assert.rejects(
    command(
      db,
      f.a.token,
      input("clear", { id: r.id, expectedVersion: note.version })
    ),
    status(409)
  );
  const ended = await command(
    db,
    f.a.token,
    input("cancel", { id: r.id, expectedVersion: note.version })
  );
  const cleared = await command(
    db,
    f.a.token,
    input("clear", { id: r.id, expectedVersion: ended.version })
  );
  const saved = await db.pantryRequest.findUniqueOrThrow({
    where: { id: r.id }
  });
  assert.equal(saved.note, "");
  assert.equal(saved.pickupContact, "");
  assert.deepEqual(saved.items, []);
  await command(
    db,
    f.coordinator.token,
    input("clear", { id: r.id, expectedVersion: cleared.version })
  );
  assert.equal(
    (await db.pantryRequest.findUniqueOrThrow({ where: { id: r.id } }))
      .coordinatorNote,
    ""
  );
  await assert.rejects(
    read(db, f.b.token, { view: "request", id: r.id }),
    status(404)
  );
});
test("selected report evidence excludes pickup contacts, directions and coordinator notes", async () => {
  const f = await setup(),
    r = await f.request().run();
  await command(
    db,
    f.coordinator.token,
    input("note", {
      id: r.id,
      expectedVersion: r.version,
      note: "Restricted coordinator-only evidence marker"
    })
  );
  const target = await readCommunityReports(db, f.a.token, {
    view: "target",
    targetType: "PANTRY_REQUEST",
    targetId: r.id
  });
  assert.ok(target.target);
  const report = await communityReportCommand(
    db,
    f.a.token,
    input("create", {
      targetType: "PANTRY_REQUEST",
      targetId: r.id,
      expectedTargetVersion: target.target.version,
      expectedContextVersion: target.target.contextVersion,
      reason: "PRIVACY",
      details: "Selected private concern"
    })
  );
  const encoded = JSON.stringify(
    await readCommunityReports(db, reviewer.token, {
      view: "review",
      id: report.id
    })
  );
  assert.ok(encoded.includes("Private practical note"));
  for (const hidden of [
    "Chosen private contact",
    "Private pickup entrance A",
    "Restricted coordinator-only evidence marker"
  ])
    assert.ok(!encoded.includes(hidden));
  const current = await db.pantryRequest.findUniqueOrThrow({
    where: { id: r.id }
  });
  const ended = await command(
    db,
    f.a.token,
    input("cancel", { id: r.id, expectedVersion: current.version })
  );
  await command(
    db,
    f.a.token,
    input("clear", { id: r.id, expectedVersion: ended.version })
  );
  assert.equal(
    (await read(db, f.a.token, { view: "request", id: r.id })).requests?.[0]
      .note,
    ""
  );
  assert.equal(
    (await read(db, f.coordinator.token, { view: "request", id: r.id }))
      .requests?.[0].note,
    ""
  );
  assert.ok(
    JSON.stringify(
      await readCommunityReports(db, reviewer.token, {
        view: "review",
        id: report.id
      })
    ).includes("Private practical note")
  );
  await db.$transaction((tx) =>
    purgeMessagingCandidate(tx, {
      target: "REPORT",
      id: report.id,
      version: report.version
    })
  );
  assert.equal(
    (await db.pantryRequest.findUniqueOrThrow({ where: { id: r.id } })).note,
    ""
  );
});
test("account export and erasure isolate assistance records and remove private outcome reasons", async () => {
  const f = await setup(),
    r = await f.request().run();
  await f.request(f.b).run();
  await command(
    db,
    f.coordinator.token,
    input("note", {
      id: r.id,
      expectedVersion: r.version,
      note: "Never in requester export"
    })
  );
  await db.pantryEvent.create({
    data: {
      hubId: f.hub.id,
      version: 900,
      actorId: f.coordinator.id,
      action: "MISSED",
      targetId: r.id,
      reason: "Private correction about requester"
    }
  });
  const secret = process.env.AUTH_RATE_LIMIT_SECRET!;
  const auth = await prepareAccountExport(db, f.a.token, f.a.password, secret);
  const exported = await downloadAccountExport(
    db,
    f.a.token,
    auth.authorization,
    secret
  );
  const encoded = JSON.stringify(exported);
  assert.ok(encoded.includes("Private practical note"));
  assert.ok(!encoded.includes("Never in requester export"));
  assert.ok(!encoded.includes("Private correction about requester"));
  const journal = { async recordAccount() {}, async completeAccount() {} };
  await requestPermanentAccountDeletion(
    db,
    f.a.token,
    f.a.password,
    true,
    createSessionToken(),
    journal
  );
  const deletion = await db.accountDeletion.findUniqueOrThrow({
    where: { userId: f.a.id }
  });
  await eraseRequestedAccountData(db, deletion.id, journal);
  const row = await db.pantryRequest.findUniqueOrThrow({ where: { id: r.id } });
  assert.equal(row.requesterId, null);
  assert.equal(row.note, "");
  assert.equal(row.pickupContact, "");
  assert.equal(row.coordinatorNote, "");
  assert.equal(row.authorityKey, null);
  assert.deepEqual(row.items, []);
  assert.equal(
    await db.pantryEvent.count({
      where: { targetId: r.id, reason: { not: "" } }
    }),
    0
  );
});

test("bounded private projections match canonical access after source, duty, account and connection changes", async () => {
  const f = await setup("CHURCH"),
    a = await f.request().run(),
    b = await f.request(f.b).run();
  async function check(count: number) {
    await db.$transaction(async (tx) => {
      await tx.$executeRaw`SET TRANSACTION READ ONLY`;
      const rows = await tx.pantryRequest.findMany({
        where: { hubId: f.hub.id },
        orderBy: { id: "asc" }
      });
      const batched = await pantryRequestReadSources(tx, rows),
        canonical: string[] = [];
      for (const row of rows)
        if (await currentPantryRequest(tx, row)) canonical.push(row.id);
      assert.deepEqual([...batched.keys()], canonical);
      assert.equal(batched.size, count);
    });
  }
  await check(2);
  await db.churchConnection.update({
    where: { userId_churchId: { userId: f.a.id, churchId: f.church.id } },
    data: { state: "LEFT", version: { increment: 1 } }
  });
  await check(1);
  await db.churchConnection.update({
    where: { userId_churchId: { userId: f.a.id, churchId: f.church.id } },
    data: { state: "APPROVED", version: { increment: 1 } }
  });
  await check(1);
  await db.socialRelationship.create({
    data: { ownerId: f.b.id, targetUserId: f.coordinator.id, blocked: true }
  });
  await check(0);
  await db.socialRelationship.deleteMany({ where: { ownerId: f.b.id } });
  await db.platformUser.update({
    where: { id: f.b.id },
    data: { deactivatedAt: new Date() }
  });
  await check(0);
  await db.platformUser.update({
    where: { id: f.b.id },
    data: { deactivatedAt: null }
  });
  await check(1);
  await db.churchCapabilityGrant.update({
    where: { id: f.grant.id },
    data: { revokedAt: new Date(), version: { increment: 1 } }
  });
  await check(0);
  assert.notEqual(a.id, b.id);
});

test("pantry HTTP writes require same-origin and the exact current account pin", async () => {
  const f = await setup(),
    request = f.request(),
    origin = process.env.ACCOUNT_ORIGIN!;
  const send = (headers: Record<string, string>) =>
    handlePantryRequest(
      db,
      new Request(origin + "/api/platform/pantry", {
        method: "POST",
        headers: {
          cookie: "church_platform_session=" + f.a.token,
          "content-type": "application/json",
          ...headers
        },
        body: JSON.stringify(request.body)
      })
    );
  assert.equal(
    (await send({ origin, "x-expected-account": f.b.id })).status,
    401
  );
  assert.equal(
    (
      await send({
        origin: "https://invalid.example.test",
        "x-expected-account": f.a.id
      })
    ).status,
    403
  );
  assert.equal((await send({ origin })).status, 401);
  const saved = await send({ origin, "x-expected-account": f.a.id });
  assert.equal(saved.status, 200);
  const first = await saved.json();
  const retry = await send({ origin, "x-expected-account": f.a.id });
  assert.deepEqual(await retry.json(), first);
  assert.equal(
    await db.pantryRequest.count({
      where: { hubId: f.hub.id, requesterId: f.a.id }
    }),
    1
  );
});
test("database constraints reject negative stock and a pickup from another church", async () => {
  const f = await setup(),
    g = await setup(),
    row = await f.request().run();
  await assert.rejects(
    db.pantryCategory.update({
      where: { id: f.category.id },
      data: { quantity: -1 }
    })
  );
  await assert.rejects(
    db.pantryRequest.update({
      where: { id: row.id },
      data: { sessionId: g.session.id, sessionVersion: 1, state: "ASSIGNED" }
    })
  );
  assert.equal(
    (await db.pantryRequest.findUniqueOrThrow({ where: { id: row.id } }))
      .sessionId,
    null
  );
  assert.equal(
    (
      await db.pantryCategory.findUniqueOrThrow({
        where: { id: f.category.id }
      })
    ).quantity,
    10
  );
});

test("replenishment links require current same-church management and disappear when the Need closes", async () => {
  const f = await setup();
  const exchangeGrant = await db.churchCapabilityGrant.create({
    data: {
      churchId: f.church.id,
      userId: f.coordinator.id,
      capability: "MANAGE_EXCHANGE_LISTINGS"
    }
  });
  await db.churchCapabilityGrant.create({
    data: {
      churchId: f.church.id,
      userId: f.coordinator.id,
      capability: "MODERATE_EXCHANGE_LISTINGS"
    }
  });
  const listing = await db.exchangeListing.create({
    data: {
      ownerChurchId: f.church.id,
      creatorId: f.coordinator.id,
      intent: "CHURCH_NEED",
      category: "HOUSEHOLD",
      audience: "PUBLIC",
      title: "Fictional replenishment",
      description: "Public category restock",
      requestedItems: "Ten food parcels",
      country: "US",
      placeId: 4887398,
      placeLabel: "Chicago",
      itemPolicy: EXCHANGE_ITEM_POLICY
    }
  });
  const need = await exchangeNeedCommand(
    db,
    f.coordinator.token,
    input("configure", {
      listingId: listing.id,
      listingVersion: listing.version,
      expectedVersion: 0,
      deadlineLocal: future(72),
      timeZone: "UTC",
      acceptCoordinator: true
    })
  );
  await exchangeNeedCommand(
    db,
    f.coordinator.token,
    input("slot", {
      needId: need.id,
      slotId: randomUUID(),
      expectedVersion: 0,
      schema: 1,
      fields: {
        action: "DONATE",
        label: "Food parcels",
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
  const link = (version = f.category.version) =>
    command(
      db,
      f.coordinator.token,
      input("replenish", {
        hubId: f.hub.id,
        id: f.category.id,
        expectedVersion: version,
        needId: need.id
      })
    );
  await assert.rejects(link(), status(404));
  const ready = await db.exchangeListing.findUniqueOrThrow({
    where: { id: listing.id }
  });
  await exchangeListingCommand(
    db,
    f.coordinator.token,
    input("status", {
      listingId: listing.id,
      expectedVersion: ready.version,
      state: "ACTIVE",
      itemPolicy: EXCHANGE_ITEM_POLICY,
      itemConfirmed: true
    })
  );
  const linked = await link();
  assert.deepEqual(
    (await read(db, undefined, { view: "hub", id: f.hub.id })).categories?.[0]
      .replenishment,
    { id: need.id, title: "Fictional replenishment" }
  );
  await db.churchCapabilityGrant.update({
    where: { id: exchangeGrant.id },
    data: { revokedAt: new Date(), version: { increment: 1 } }
  });
  await assert.rejects(link(linked.version), status(404));
  await db.exchangeNeed.update({
    where: { id: need.id },
    data: { closedAt: new Date() }
  });
  assert.equal(
    (await read(db, undefined, { view: "hub", id: f.hub.id })).categories?.[0]
      .replenishment,
    null
  );
});
