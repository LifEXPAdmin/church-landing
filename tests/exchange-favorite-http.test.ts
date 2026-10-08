import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { sessionCookieFixtureName } from "../scripts/session-cookie-fixture.mjs";
import { assertPortalTestDatabase, createPortalActor } from "./seed-portal";
import {
  exchangeSavedCommand as command,
  readExchangeSaved as read
} from "../lib/platform/exchange-saved";
import { EXCHANGE_ITEM_POLICY } from "../lib/platform/exchange-options";

const db = new PrismaClient(),
  origin = process.env.ACCOUNT_ORIGIN!;
assert.match(origin, /^https:\/\/127\.0\.0\.1:\d+$/);
before(async () => {
  await assertPortalTestDatabase(db);
});
after(async () => {
  await db.$disconnect();
});
const input = (operation: string, fields: Record<string, unknown>) => ({
  operation,
  mutationId: randomUUID(),
  ...fields
});
const req = (
  path: string,
  token = "",
  headers: Record<string, string> = {},
  body?: string
) =>
  fetch(origin + path, {
    redirect: "manual",
    method: body ? "POST" : "GET",
    headers: {
      cookie: `${sessionCookieFixtureName()}=${token}`,
      origin,
      ...(body ? { "content-type": "application/json" } : {}),
      ...headers
    },
    ...(body ? { body } : {})
  });
function privateResponse(response: Response) {
  for (const header of [
    "cache-control",
    "cdn-cache-control",
    "vercel-cdn-cache-control"
  ])
    assert.match(response.headers.get(header)!, /no-store/);
}
const post = (token: string, owner: string, body: string) =>
  req("/api/platform/exchange", token, { "x-expected-account": owner }, body);

test("listing HTML/RSC omit favorite association while pinned reads and exact replay survive listing withdrawal", async () => {
  const owner = await createPortalActor(db, "favoritehttpowner"),
    publisher = await createPortalActor(db, "favoritehttppub"),
    other = await createPortalActor(db, "favoritehttpother"),
    ineligible = await createPortalActor(db, "favoritehttpminor", {
      adult: false
    });
  const listing = await db.exchangeListing.create({
    data: {
      ownerId: publisher.id,
      creatorId: publisher.id,
      state: "ACTIVE",
      title: "Fictional listing favorite " + randomUUID(),
      description: "Fictional favorite privacy source",
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
  const addition = input("favorite-add", {
    listingId: listing.id,
    expectedVersion: 0
  });
  const addBody = JSON.stringify(addition);
  const response = await post(owner.token, owner.id, addBody);
  assert.equal(response.status, 200);
  privateResponse(response);
  const created = await response.json();
  assert.equal(created.version, 1);
  const canonical = await command(db, owner.token, addition);
  assert.equal(created.id, canonical.id);
  for (const headers of [{}, { RSC: "1" }] as Record<string, string>[]) {
    for (const token of [owner.token, other.token, ""]) {
      const page = await req(
        `/platform/exchange/${listing.id}`,
        token,
        headers
      );
      assert.equal(page.status, 200);
      assert.match(page.headers.get("cache-control")!, /no-store/);
      const text = await page.text();
      assert.ok(!text.includes(created.id));
      assert.doesNotMatch(text.replaceAll("\\", ""), /"favorite"\s*:\s*\{/);
    }
  }
  const endpoint =
    "/api/platform/exchange?" +
    new URLSearchParams({ view: "favorite", listingId: listing.id });
  const current = await req(endpoint, owner.token, {
    "x-expected-account": owner.id
  });
  assert.equal(current.status, 200);
  privateResponse(current);
  const currentData = await current.json();
  assert.deepEqual(
    currentData,
    await read(db, owner.token, { view: "favorite", listingId: listing.id })
  );
  assert.deepEqual(currentData.favorite, {
    id: created.id,
    version: 1,
    saved: true
  });
  for (const [token, pin, status] of [
    [owner.token, other.id, 401],
    [other.token, owner.id, 401],
    ["", owner.id, 401],
    [ineligible.token, ineligible.id, 403]
  ] as const) {
    const denied = await req(endpoint, token, { "x-expected-account": pin });
    assert.equal(denied.status, status);
    privateResponse(denied);
    assert.ok(!(await denied.text()).includes(created.id));
  }
  const foreign = await req(endpoint, other.token, {
    "x-expected-account": other.id
  });
  assert.equal(foreign.status, 200);
  assert.equal((await foreign.json()).favorite, null);
  const wrongOwnerRemove = await post(
    other.token,
    other.id,
    JSON.stringify(
      input("favorite-remove", { favoriteId: created.id, expectedVersion: 1 })
    )
  );
  assert.equal(wrongOwnerRemove.status, 404);
  const removal = input("favorite-remove", {
      favoriteId: created.id,
      expectedVersion: 1
    }),
    removeBody = JSON.stringify(removal);
  const removedResponse = await post(owner.token, owner.id, removeBody);
  assert.equal(removedResponse.status, 200);
  const removed = await removedResponse.json();
  assert.equal(removed.version, 2);
  const readded = await command(
    db,
    owner.token,
    input("favorite-add", { listingId: listing.id, expectedVersion: 2 })
  );
  assert.equal(readded.version, 3);
  await db.exchangeListing.update({
    where: { id: listing.id },
    data: { state: "DRAFT", publishedAt: null, version: { increment: 1 } }
  });
  const hidden = await req(
    `/api/platform/exchange?view=listing&id=${listing.id}`,
    owner.token,
    { "x-expected-account": owner.id }
  );
  assert.equal(hidden.status, 404);
  const replay = await post(owner.token, owner.id, removeBody);
  assert.equal(replay.status, 200);
  const replayData = await replay.json();
  assert.equal(replayData.id, removed.id);
  assert.equal(replayData.version, removed.version);
  const association = await req(endpoint, owner.token, {
    "x-expected-account": owner.id
  });
  assert.equal(association.status, 200);
  privateResponse(association);
  assert.deepEqual((await association.json()).favorite, {
    id: created.id,
    version: 3,
    saved: true
  });
  const drift = await post(
    owner.token,
    owner.id,
    JSON.stringify({ ...removal, expectedVersion: 3 })
  );
  assert.equal(drift.status, 409);
  const deniedSave = await post(
    owner.token,
    owner.id,
    JSON.stringify(
      input("favorite-add", { listingId: listing.id, expectedVersion: 3 })
    )
  );
  assert.equal(deniedSave.status, 404);
  const clear = await post(
    owner.token,
    owner.id,
    JSON.stringify(
      input("favorite-remove", { favoriteId: created.id, expectedVersion: 3 })
    )
  );
  assert.equal(clear.status, 200);
  assert.equal((await clear.json()).version, 4);
  const after = await read(db, owner.token, {
    view: "favorite",
    listingId: listing.id
  });
  assert.deepEqual(after.favorite, {
    id: created.id,
    version: 4,
    saved: false
  });
  assert.equal(
    await db.exchangeFavorite.count({ where: { ownerId: other.id } }),
    0
  );
});
