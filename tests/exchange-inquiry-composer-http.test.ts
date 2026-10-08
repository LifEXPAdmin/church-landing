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

test("inquiry bootstrap omits private association from HTML/RSC and preserves canonical pinned no-store target reads", async () => {
  const owner = await createPortalActor(db, "composerhttpowner"),
    requester = await createPortalActor(db, "composerhttprequester"),
    other = await createPortalActor(db, "composerhttpother");
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
  for (const headers of [{}, { RSC: "1" }] as Record<string, string>[]) {
    for (const token of [requester.token, other.token, ""]) {
      const response = await req(
        "/platform/exchange/" + listing.id,
        token,
        headers
      );
      assert.equal(response.status, 200);
      assert.match(response.headers.get("cache-control")!, /no-store/);
      const body = await response.text();
      assert.ok(!body.includes(receipt.id));
      assert.ok(!body.includes(purpose));
    }
  }
  const endpoint =
    "/api/platform/exchange?" +
    new URLSearchParams({ view: "handoff-target", listingId: listing.id });
  const current = await req(endpoint, requester.token, {
    "x-expected-account": requester.id
  });
  assert.equal(current.status, 200);
  for (const header of [
    "cache-control",
    "cdn-cache-control",
    "vercel-cdn-cache-control"
  ])
    assert.match(current.headers.get(header)!, /no-store/);
  const data = await current.json();
  assert.equal(data.ownerId, requester.id);
  assert.equal(data.target.activeId, receipt.id);
  assert.deepEqual(
    data,
    await readExchangeHandoffs(db, requester.token, {
      view: "target",
      listingId: listing.id
    })
  );
  assert.ok(!JSON.stringify(data).includes(purpose));
  for (const [token, pin] of [
    [requester.token, other.id],
    [other.token, requester.id],
    ["", requester.id]
  ]) {
    const denied = await req(endpoint, token, { "x-expected-account": pin });
    assert.equal(denied.status, 401);
    assert.ok(!(await denied.text()).includes(receipt.id));
  }
  const own = await req(endpoint, other.token, {
    "x-expected-account": other.id
  });
  assert.equal(own.status, 200);
  const ownData = await own.json();
  assert.equal(ownData.ownerId, other.id);
  assert.equal(ownData.target.activeId, null);
  const { adultContactCommand } = await import("../lib/platform/adult-contact");
  const preferences = await db.socialPreferences.findUniqueOrThrow({
    where: { ownerId: owner.id }
  });
  await adultContactCommand(
    db,
    owner.token,
    input("preferences", {
      expectedVersion: preferences.version,
      audience: "NOBODY"
    })
  );
  const revoked = await req(endpoint, requester.token, {
    "x-expected-account": requester.id
  });
  assert.equal(revoked.status, 200);
  assert.equal((await revoked.json()).target, null);
});
