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
import { EXCHANGE_SAVED_SCHEMA } from "../lib/platform/exchange-options";

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

test("saved-search HTML/RSC omit private editor values while current reads and exact HTTP replay preserve ownership after deletion", async () => {
  const owner = await createPortalActor(db, "searchhttpowner"),
    other = await createPortalActor(db, "searchhttpother"),
    ineligible = await createPortalActor(db, "searchhttpminor", {
      adult: false
    });
  const name = "Private saved name " + randomUUID(),
    savedCriterion = "Stored private criterion " + randomUUID(),
    currentCriterion = "Current route criterion " + randomUUID(),
    searchId = randomUUID();
  const create = input("search-save", {
      searchId,
      expectedVersion: 0,
      schema: EXCHANGE_SAVED_SCHEMA,
      name,
      criteria: { q: savedCriterion },
      alerts: true
    }),
    createBody = JSON.stringify(create);
  const createdResponse = await post(owner.token, owner.id, createBody);
  assert.ok([200, 202].includes(createdResponse.status));
  privateResponse(createdResponse);
  const created = await createdResponse.json();
  assert.equal(created.id, searchId);
  assert.equal(created.version, 1);
  const canonicalCreate = await command(db, owner.token, create);
  assert.equal(canonicalCreate.id, created.id);
  assert.equal(canonicalCreate.version, created.version);

  // URL criteria are deliberately different from the saved DTO. Existing
  // navigation identifiers remain legitimate page inputs, not private row data.
  for (const selected of [false, true]) {
    const path =
      "/platform/exchange?" +
      new URLSearchParams({
        q: currentCriterion,
        ...(selected ? { savedSearch: searchId } : {})
      });
    for (const headers of [{}, { RSC: "1" }] as Record<string, string>[]) {
      for (const token of [owner.token, other.token, ""]) {
        const response = await req(path, token, headers);
        assert.equal(response.status, 200);
        assert.match(response.headers.get("cache-control")!, /no-store/);
        const body = await response.text();
        assert.ok(!body.includes(name));
        assert.ok(!body.includes(savedCriterion));
        // Normalize the escaping used by inline RSC strings before checking
        // that neither saved alert consent nor a saved-row prop is serialized.
        const serialized = body.replaceAll("\\", "");
        assert.doesNotMatch(serialized, /"alerts"\s*:\s*(?:true|false)/);
        assert.doesNotMatch(serialized, /"existing"\s*:\s*\{/);
      }
    }
  }
  const endpoint =
    "/api/platform/exchange?" +
    new URLSearchParams({ view: "search", searchId });
  const current = await req(endpoint, owner.token, {
    "x-expected-account": owner.id
  });
  assert.equal(current.status, 200);
  privateResponse(current);
  const data = await current.json();
  assert.deepEqual(
    data,
    await read(db, owner.token, { view: "search", searchId })
  );
  assert.equal(data.ownerId, owner.id);
  assert.equal(data.searches.length, 1);
  assert.equal(data.searches[0].name, name);
  assert.equal(data.searches[0].alerts, true);
  assert.equal(data.searches[0].criteria.q, savedCriterion);
  for (const [token, pin, status] of [
    [owner.token, other.id, 401],
    [other.token, owner.id, 401],
    [other.token, other.id, 404],
    ["", owner.id, 401],
    [ineligible.token, ineligible.id, 403]
  ] as const) {
    const denied = await req(endpoint, token, { "x-expected-account": pin });
    assert.equal(denied.status, status);
    privateResponse(denied);
    const text = await denied.text();
    assert.ok(!text.includes(name));
    assert.ok(!text.includes(savedCriterion));
  }
  const changedRequest = await post(
    owner.token,
    owner.id,
    JSON.stringify({ ...create, alerts: false })
  );
  assert.equal(changedRequest.status, 409);
  privateResponse(changedRequest);
  assert.equal(
    (await read(db, owner.token, { view: "search", searchId })).searches![0]
      .version,
    1
  );

  const update = input("search-save", {
      searchId,
      expectedVersion: 1,
      schema: EXCHANGE_SAVED_SCHEMA,
      name: name + " updated",
      criteria: { q: currentCriterion },
      alerts: false
    }),
    updateBody = JSON.stringify(update);
  const updatedResponse = await post(owner.token, owner.id, updateBody);
  assert.ok([200, 202].includes(updatedResponse.status));
  const updated = await updatedResponse.json();
  assert.equal(updated.id, searchId);
  assert.equal(updated.version, 2);
  const canonicalUpdate = await command(db, owner.token, update);
  const updatedRow = (await read(db, owner.token, { view: "search", searchId }))
    .searches![0];
  assert.equal(updatedRow.name, name + " updated");
  assert.equal(updatedRow.alerts, false);
  assert.equal(updatedRow.criteria.q, currentCriterion);
  const removal = input("search-delete", { searchId, expectedVersion: 2 });
  const removedResponse = await post(
    owner.token,
    owner.id,
    JSON.stringify(removal)
  );
  assert.ok([200, 202].includes(removedResponse.status));
  assert.equal((await removedResponse.json()).version, 3);
  const tombstone = await db.exchangeSavedSearch.findUniqueOrThrow({
    where: { id: searchId }
  });
  assert.ok(tombstone.deletedAt);
  assert.equal(tombstone.name, "");
  assert.equal(tombstone.alertsSince, null);
  assert.deepEqual(tombstone.criteria, {});
  const missing = await req(endpoint, owner.token, {
    "x-expected-account": owner.id
  });
  assert.equal(missing.status, 404);
  privateResponse(missing);
  const actorRead = await req(
    "/api/platform/exchange?view=searches",
    owner.token,
    { "x-expected-account": owner.id }
  );
  assert.equal(actorRead.status, 200);
  const actorData = await actorRead.json();
  assert.equal(actorData.ownerId, owner.id);
  assert.deepEqual(actorData.searches, []);

  // Replay both exact original byte strings after deletion. The HTTP boundary
  // may append its protected-recovery notice; the canonical receipt is stable.
  for (const [body, original, canonical] of [
    [createBody, create, canonicalCreate],
    [updateBody, update, canonicalUpdate]
  ] as const) {
    const replay = await post(owner.token, owner.id, body);
    assert.ok([200, 202].includes(replay.status));
    privateResponse(replay);
    const received = await replay.json();
    assert.equal(received.id, canonical.id);
    assert.equal(received.version, canonical.version);
    assert.ok(
      received.message === canonical.message ||
        received.message ===
          canonical.message +
            " Protected recovery is pending and will be retried automatically."
    );
    assert.deepEqual(await command(db, owner.token, original), canonical);
    const changed = await post(
      owner.token,
      owner.id,
      JSON.stringify({ ...original, name: "Changed fingerprint" })
    );
    assert.equal(changed.status, 409);
  }
  assert.deepEqual(
    await db.exchangeSavedSearch.findUniqueOrThrow({ where: { id: searchId } }),
    tombstone
  );
  const freshWrite = await post(
    owner.token,
    owner.id,
    JSON.stringify({ ...update, mutationId: randomUUID(), expectedVersion: 3 })
  );
  assert.equal(
    freshWrite.status,
    409,
    "A fresh key cannot revive a deleted search"
  );
  for (const [token, pin, status] of [
    [other.token, other.id, 404],
    [owner.token, other.id, 401],
    [ineligible.token, ineligible.id, 403],
    ["", owner.id, 401]
  ] as const) {
    const denied = await post(token, pin, updateBody);
    assert.equal(denied.status, status);
    privateResponse(denied);
    assert.ok(!(await denied.text()).includes(name));
  }
});
