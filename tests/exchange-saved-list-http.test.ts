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
import {
  EXCHANGE_ITEM_POLICY,
  EXCHANGE_SAVED_SCHEMA
} from "../lib/platform/exchange-options";
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
const req = (path: string, token = "", headers: Record<string, string> = {}) =>
  fetch(origin + path, {
    redirect: "manual",
    headers: {
      cookie: `${sessionCookieFixtureName()}=${token}`,
      origin,
      ...headers
    }
  });

test("saved-list bootstrap omits private choices while canonical pinned reads retain ownership, redaction, paging and replay", async () => {
  const owner = await createPortalActor(db, "savedlisthttpowner"),
    publisher = await createPortalActor(db, "savedlisthttppub"),
    other = await createPortalActor(db, "savedlisthttpother");
  const marker = "Fictional private choice " + randomUUID(),
    criterion = "Private query " + randomUUID();
  for (let i = 0; i < 21; i++) {
    const listing = await db.exchangeListing.create({
      data: {
        ownerId: publisher.id,
        creatorId: publisher.id,
        state: "ACTIVE",
        title: marker + " " + i,
        description: "Fictional saved-list source",
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
    await command(
      db,
      owner.token,
      input("favorite-add", { listingId: listing.id, expectedVersion: 0 })
    );
    await command(
      db,
      owner.token,
      input("search-save", {
        searchId: randomUUID(),
        expectedVersion: 0,
        schema: EXCHANGE_SAVED_SCHEMA,
        name: marker + " " + i,
        criteria: { q: criterion },
        alerts: false
      })
    );
  }
  for (const view of ["favorites", "searches"] as const) {
    const path = "/platform/exchange/saved?view=" + view,
      endpoint = "/api/platform/exchange?view=" + view;
    for (const headers of [{}, { RSC: "1" }] as Record<string, string>[]) {
      for (const token of [owner.token, other.token, ""]) {
        const response = await req(path, token, headers);
        assert.equal(response.status, 200);
        assert.match(response.headers.get("cache-control")!, /no-store/);
        const text = await response.text();
        assert.ok(!text.includes(marker));
        assert.ok(!text.includes(criterion));
      }
    }
    const response = await req(endpoint, owner.token, {
      "x-expected-account": owner.id
    });
    assert.equal(response.status, 200);
    for (const header of [
      "cache-control",
      "cdn-cache-control",
      "vercel-cdn-cache-control"
    ])
      assert.match(response.headers.get(header)!, /no-store/);
    const data = await response.json();
    const canonical = await read(db, owner.token, { view });
    assert.deepEqual(data, canonical);
    assert.equal(data.ownerId, owner.id);
    const rows =
      view === "favorites" ? canonical.favorites : canonical.searches;
    assert.ok(rows);
    assert.equal(rows.length, 20);
    assert.ok(canonical.after);
    const next = await req(
      endpoint + "&after=" + canonical.after,
      owner.token,
      { "x-expected-account": owner.id }
    );
    assert.equal(next.status, 200);
    const nextData = await next.json();
    assert.equal(nextData[view].length, 1);
    assert.equal(nextData.after, null);
    assert.ok(!rows.some((row) => row.id === nextData[view][0].id));
    for (const [token, pin] of [
      [owner.token, other.id],
      [other.token, owner.id],
      ["", owner.id]
    ]) {
      const denied = await req(endpoint, token, { "x-expected-account": pin });
      assert.equal(denied.status, 401);
      assert.ok(!(await denied.text()).includes(marker));
    }
    const foreign = await req(endpoint, other.token, {
      "x-expected-account": other.id
    });
    assert.equal(foreign.status, 200);
    assert.equal((await foreign.json())[view].length, 0);
    const anchor = rows.find((row) => row.id === canonical.after)!;
    const remove = input(
      view === "favorites" ? "favorite-remove" : "search-delete",
      {
        [view === "favorites" ? "favoriteId" : "searchId"]: anchor.id,
        expectedVersion: anchor.version
      }
    );
    const receipt = await command(db, owner.token, remove);
    assert.deepEqual(await command(db, owner.token, remove), receipt);
    const stale = await req(endpoint + "&after=" + anchor.id, owner.token, {
      "x-expected-account": owner.id
    });
    assert.equal(stale.status, 409);
    assert.ok(!(await stale.text()).includes(marker));
    const first = await req(endpoint, owner.token, {
      "x-expected-account": owner.id
    });
    assert.equal(first.status, 200);
    assert.equal((await first.json())[view].length, 20);
  }
  const favorites = (await read(db, owner.token, { view: "favorites" }))
    .favorites!;
  const favorite = favorites[0];
  assert.ok(favorite.listing);
  await db.exchangeListing.update({
    where: { id: favorite.listing.id },
    data: { state: "DRAFT", publishedAt: null }
  });
  const redacted = (
    await read(db, owner.token, { view: "favorites" })
  ).favorites!.find((row) => row.id === favorite.id)!;
  assert.equal(redacted.listing, null);
  const remove = input("favorite-remove", {
    favoriteId: favorite.id,
    expectedVersion: favorite.version
  });
  const removed = await command(db, owner.token, remove);
  assert.deepEqual(await command(db, owner.token, remove), removed);
  assert.ok(
    !(await read(db, owner.token, { view: "favorites" })).favorites!.some(
      (row) => row.id === favorite.id
    )
  );
});
