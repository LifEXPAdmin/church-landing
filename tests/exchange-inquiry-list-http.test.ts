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

test("private inquiry lists omit server payloads and preserve current-account pagination, redaction and no-store HTTP boundaries", async () => {
  const owner = await createPortalActor(db, "inquiryhttpowner"),
    requester = await createPortalActor(db, "inquiryhttprequester"),
    other = await createPortalActor(db, "inquiryhttpother");
  await seedOperatorGrants(db, other, ["REVIEW_COMMUNITY_REPORTS"]);
  await db.socialPreferences.create({
    data: { ownerId: owner.id, contactRequests: "EVERYONE" }
  });
  const title = "Private inquiry association " + randomUUID(),
    purpose = "Private inquiry purpose " + randomUUID();
  const listing = await db.exchangeListing.create({
    data: {
      ownerId: owner.id,
      creatorId: owner.id,
      state: "ACTIVE",
      title,
      description: "Fictional inquiry HTTP source",
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
  ).target!;
  assert.ok(target.available);
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
  const original = await db.exchangeInquiry.findUniqueOrThrow({
    where: { id: receipt.id }
  });
  for (let i = 1; i <= 21; i++)
    await db.exchangeInquiry.create({
      data: {
        ...original,
        id: randomUUID(),
        state: "EXPIRED",
        endedAt: new Date(),
        createdAt: new Date(original.createdAt.getTime() - i * 1000),
        wakeAt: null
      }
    });
  const endpoint = (view: string, after?: string) =>
    "/api/platform/exchange?" +
    new URLSearchParams({
      view: "handoff-" + view,
      listingId: listing.id,
      ...(after ? { after } : {})
    });
  for (const [view, actor, participant] of [
    ["incoming", owner, requester],
    ["outgoing", requester, owner]
  ] as const) {
    const first = await readExchangeHandoffs(db, actor.token, {
      view,
      listingId: listing.id
    });
    assert.equal(first.inquiries?.length, 20);
    assert.ok(first.after);
    for (const headers of [{}, { RSC: "1" }] as Record<string, string>[]) {
      const html = await req(
        "/platform/exchange/handoffs?view=" + view,
        actor.token,
        headers
      );
      assert.equal(html.status, 200);
      assert.match(html.headers.get("cache-control")!, /no-store/);
      const body = await html.text();
      for (const marker of [
        title,
        purpose,
        participant.name,
        receipt.id,
        first.after!
      ])
        assert.ok(
          !body.includes(marker),
          "HTML/RSC omits private summaries and returned cursor"
        );
    }
    const page = await req(endpoint(view), actor.token, {
      "x-expected-account": actor.id
    });
    assert.equal(page.status, 200);
    for (const header of [
      "cache-control",
      "cdn-cache-control",
      "vercel-cdn-cache-control"
    ])
      assert.match(page.headers.get(header)!, /no-store/);
    const actual = await page.json();
    assert.deepEqual(actual, first);
    assert.ok(!JSON.stringify(actual).includes(purpose));
    assert.ok(
      actual.after,
      "The first 20-row page must expose its seek cursor"
    );
    const next = await req(endpoint(view, actual.after), actor.token, {
      "x-expected-account": actor.id
    });
    assert.equal(next.status, 200);
    const second = await next.json();
    assert.equal(second.inquiries.length, 2);
    assert.equal(second.after, null);
    assert.equal(
      new Set([...actual.inquiries, ...second.inquiries].map((row) => row.id))
        .size,
      22
    );
    const stale = await req(endpoint(view, randomUUID()), actor.token, {
      "x-expected-account": actor.id
    });
    assert.equal(stale.status, 409);
    assert.ok(!(await stale.text()).includes(title));
  }
  for (const [token, pin] of [
    [owner.token, other.id],
    [other.token, owner.id],
    ["", owner.id]
  ]) {
    const denied = await req(endpoint("incoming"), token, {
      "x-expected-account": pin
    });
    assert.equal(denied.status, 401);
    const body = await denied.text();
    for (const marker of [title, purpose, requester.name, receipt.id])
      assert.ok(!body.includes(marker));
  }
  const own = await req(endpoint("incoming"), other.token, {
    "x-expected-account": other.id
  });
  assert.equal(own.status, 200);
  assert.deepEqual((await own.json()).inquiries, []);
  for (const token of [other.token, ""]) {
    const html = await req("/platform/exchange/handoffs", token);
    const body = await html.text();
    for (const marker of [title, purpose, requester.name, receipt.id])
      assert.ok(!body.includes(marker));
  }
  await db.socialRelationship.create({
    data: { ownerId: requester.id, targetUserId: owner.id, blocked: true }
  });
  const revoked = await req(endpoint("outgoing"), requester.token, {
    "x-expected-account": requester.id
  });
  assert.equal(revoked.status, 200);
  const redacted = await revoked.json();
  assert.equal(redacted.inquiries.length, 20);
  assert.ok(
    redacted.inquiries.every(
      (row: { person: unknown; listing: unknown }) =>
        row.person === null && row.listing === null
    )
  );
  for (const marker of [title, purpose, owner.name])
    assert.ok(!JSON.stringify(redacted).includes(marker));
});
