import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { sessionCookieFixtureName } from "../scripts/session-cookie-fixture.mjs";
import {
  assertPortalTestDatabase,
  createPortalActor,
  seedOperatorGrants
} from "./seed-portal";
import {
  exchangeHandoffCommand,
  readExchangeHandoffs
} from "../lib/platform/exchange-handoffs";
import { EXCHANGE_ITEM_POLICY } from "../lib/platform/exchange-options";
const db = new PrismaClient(),
  origin = process.env.ACCOUNT_ORIGIN!;
const priorReports = process.env.COMMUNITY_REPORTS_ENABLED;
assert.match(origin, /^https:\/\/127\.0\.0\.1:\d+$/);
before(async () => {
  await assertPortalTestDatabase(db);
  process.env.COMMUNITY_REPORTS_ENABLED = "true";
});
after(async () => {
  await db.$disconnect();
  if (priorReports === undefined) delete process.env.COMMUNITY_REPORTS_ENABLED;
  else process.env.COMMUNITY_REPORTS_ENABLED = priorReports;
});
const req = (path: string, token = "", headers: Record<string, string> = {}) =>
  fetch(origin + path, {
    redirect: "manual",
    headers: {
      cookie: `${sessionCookieFixtureName()}=${token}`,
      origin,
      ...headers
    }
  });
const input = (operation: string, fields: Record<string, unknown>) => ({
  operation,
  mutationId: randomUUID(),
  ...fields
});

test("handoff detail bootstrap omits private body while current participant reads preserve redaction and no-store", async () => {
  const owner = await createPortalActor(db, "detailhttpowner"),
    requester = await createPortalActor(db, "detailhttprequester"),
    other = await createPortalActor(db, "detailhttpother");
  await seedOperatorGrants(db, other, ["REVIEW_COMMUNITY_REPORTS"]);
  await db.socialPreferences.create({
    data: { ownerId: owner.id, contactRequests: "EVERYONE" }
  });
  const purpose = "Fictional private inquiry " + randomUUID();
  const listing = await db.exchangeListing.create({
    data: {
      ownerId: owner.id,
      creatorId: owner.id,
      state: "ACTIVE",
      title: "Fictional inquiry source",
      description: "Fictional composer HTTP source",
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
  await exchangeHandoffCommand(
    db,
    owner.token,
    input("contact", {
      listingId: listing.id,
      listingVersion: listing.version,
      expectedVersion: listing.inquiryContactVersion,
      enabled: true
    })
  );
  const target = (
    await readExchangeHandoffs(db, requester.token, {
      view: "target",
      listingId: listing.id
    })
  ).target;
  assert.ok(target?.available);
  const receipt = await exchangeHandoffCommand(
    db,
    requester.token,
    input("inquire", {
      id: randomUUID(),
      expectedVersion: 0,
      listingId: listing.id,
      listingVersion: target.listingVersion,
      contactVersion: target.contactVersion,
      purpose
    })
  );
  const { EXCHANGE_HANDOFF_SCHEMA } =
    await import("../lib/platform/exchange-handoff-options");
  const pickup = "Private fictional instructions " + randomUUID();
  const start = new Date(Date.now() + 3 * 86400000);
  start.setUTCSeconds(0, 0);
  await exchangeHandoffCommand(
    db,
    owner.token,
    input("select", {
      id: receipt.id,
      expectedVersion: receipt.version,
      schema: EXCHANGE_HANDOFF_SCHEMA,
      plan: {
        startLocal: start.toISOString().slice(0, 16),
        endLocal: new Date(start.getTime() + 3600000)
          .toISOString()
          .slice(0, 16),
        timeZone: "UTC",
        pickupDetails: pickup
      }
    })
  );
  const path = "/platform/exchange/handoffs/" + receipt.id;
  for (const headers of [{}, { RSC: "1" }] as Record<string, string>[]) {
    for (const actor of [owner, requester, other]) {
      const response = await req(path, actor.token, headers);
      assert.equal(response.status, 200);
      assert.match(response.headers.get("cache-control")!, /no-store/);
      const text = await response.text();
      assert.ok(!text.includes(purpose));
      assert.ok(!text.includes(pickup));
    }
  }
  const endpoint =
    "/api/platform/exchange?" +
    new URLSearchParams({ view: "handoff-detail", id: receipt.id });
  for (const actor of [owner, requester]) {
    const response = await req(endpoint, actor.token, {
      "x-expected-account": actor.id
    });
    assert.equal(response.status, 200);
    for (const header of [
      "cache-control",
      "cdn-cache-control",
      "vercel-cdn-cache-control"
    ])
      assert.match(response.headers.get(header)!, /no-store/);
    const data = await response.json();
    assert.deepEqual(
      data,
      await readExchangeHandoffs(db, actor.token, {
        view: "detail",
        id: receipt.id
      })
    );
    assert.equal(data.ownerId, actor.id);
    assert.ok(data.inquiry);
    assert.equal(data.inquiry.purpose, purpose);
    assert.equal(
      data.inquiry.pickupDetails,
      actor.id === owner.id ? pickup : ""
    );
  }
  for (const [token, pin, status] of [
    [owner.token, other.id, 401],
    [other.token, requester.id, 401],
    [other.token, other.id, 404],
    ["", requester.id, 401]
  ] as const) {
    const response = await req(endpoint, token, { "x-expected-account": pin });
    assert.equal(response.status, status);
    const text = await response.text();
    assert.ok(!text.includes(purpose));
    assert.ok(!text.includes(pickup));
  }
  const selected = (
    await readExchangeHandoffs(db, requester.token, {
      view: "detail",
      id: receipt.id
    })
  ).inquiry!;
  await exchangeHandoffCommand(
    db,
    requester.token,
    input("confirm", {
      id: receipt.id,
      expectedVersion: selected.version,
      planVersion: selected.planVersion
    })
  );
  const agreed = await req(endpoint, requester.token, {
    "x-expected-account": requester.id
  });
  assert.equal((await agreed.json()).inquiry.pickupDetails, pickup);
  const current = (
    await readExchangeHandoffs(db, owner.token, {
      view: "detail",
      id: receipt.id
    })
  ).inquiry!;
  const cancelNote = "Private fictional cancellation " + randomUUID();
  await exchangeHandoffCommand(
    db,
    owner.token,
    input("cancel", {
      id: receipt.id,
      expectedVersion: current.version,
      reason: "CHANGED_PLANS",
      note: cancelNote
    })
  );
  for (const headers of [{}, { RSC: "1" }] as Record<string, string>[]) {
    const response = await req(path, owner.token, headers);
    const text = await response.text();
    assert.ok(!text.includes(purpose));
    assert.ok(!text.includes(pickup));
    assert.ok(!text.includes(cancelNote));
  }
  const canceled = (
    await readExchangeHandoffs(db, owner.token, {
      view: "detail",
      id: receipt.id
    })
  ).inquiry!;
  const clear = input("clear", {
    id: receipt.id,
    expectedVersion: canceled.version
  });
  const cleared = await exchangeHandoffCommand(db, owner.token, clear);
  assert.equal(
    (await req(endpoint, owner.token, { "x-expected-account": owner.id }))
      .status,
    404
  );
  assert.deepEqual(
    await exchangeHandoffCommand(db, owner.token, clear),
    cleared
  );
  const otherHistory = await req(endpoint, requester.token, {
    "x-expected-account": requester.id
  });
  assert.equal(otherHistory.status, 200);
  assert.equal((await otherHistory.json()).inquiry.cancelNote, cancelNote);
});
