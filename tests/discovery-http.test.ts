import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { createPortalActor, assertPortalTestDatabase } from "./seed-portal";
import { defaultDiscoveryPreferences } from "../lib/platform/discovery-options";
const db = new PrismaClient(),
  origin = process.env.ACCOUNT_ORIGIN!;
assert.match(origin, /^https:\/\/127\.0\.0\.1:\d+$/);
before(() => assertPortalTestDatabase(db));
after(() => db.$disconnect());
const request = (
  path: string,
  token = "",
  body?: Record<string, unknown>,
  headers: Record<string, string> = {}
) =>
  fetch(origin + path, {
    method: body ? "POST" : "GET",
    redirect: "manual",
    headers: {
      cookie: `church_platform_session=${token}`,
      origin,
      ...(body ? { "content-type": "application/json" } : {}),
      ...headers
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
test("discovery HTTPS keeps preferences private, exposes only public place labels and atomically retries account-pinned choices", async () => {
  const a = await createPortalActor(db, "dischttpa"),
    b = await createPortalActor(db, "dischttpb");
  const prefs = defaultDiscoveryPreferences();
  prefs.hiddenWords = ["private-choice-" + randomUUID()];
  const body = {
    operation: "save",
    preferences: prefs,
    expectedVersion: 0,
    mode: "for-you",
    expectedFeedVersion: 0,
    mutationId: randomUUID()
  };
  const send = (
    input = body,
    token = a.token,
    expected = a.id,
    from = origin
  ) =>
    request("/api/platform/discovery", token, input, {
      "x-expected-account": expected,
      origin: from
    });
  assert.equal((await request("/api/platform/discovery")).status, 401);
  assert.equal(
    (
      await request("/api/platform/discovery", a.token, undefined, {
        "x-expected-account": b.id
      })
    ).status,
    401
  );
  assert.equal(
    (await request("/api/platform/discovery", a.token, body)).status,
    401
  );
  assert.equal((await send(body, a.token, b.id)).status, 401);
  assert.equal(
    (await send(body, a.token, a.id, "https://elsewhere.invalid")).status,
    403
  );
  assert.equal((await send(body, "")).status, 401);
  assert.equal(
    (
      await send({
        ...body,
        preferences: { ...prefs, inferredFaith: "unsupported" }
      } as typeof body)
    ).status,
    400
  );
  const first = await send();
  assert.ok([200, 202].includes(first.status));
  assert.match(first.headers.get("cache-control")!, /no-store/);
  const saved = await first.json(),
    retry = await (await send()).json();
  assert.equal(saved.id, retry.id);
  assert.equal(saved.version, retry.version);
  assert.equal((await send({ ...body, mode: "public" })).status, 409);
  const choices = await request("/api/platform/discovery", a.token, undefined, {
    "x-expected-account": a.id
  });
  assert.match(choices.headers.get("cache-control")!, /no-store/);
  const data = await choices.json();
  assert.deepEqual(data.preferences, prefs);
  assert.equal(data.mode, "for-you");
  assert.equal(data.version, 1);
  assert.equal(data.feedVersion, 1);
  const other = await (
    await request("/api/platform/discovery", b.token)
  ).json();
  assert.ok(!JSON.stringify(other).includes(prefs.hiddenWords[0]));
  const publicPlaces = await request(
    "/api/platform/discovery?view=places&country=US&q=Chicago"
  );
  assert.equal(publicPlaces.status, 200);
  const places = await publicPlaces.json();
  assert.ok(places.places.length > 0 && places.places.length <= 20);
  for (const place of places.places)
    assert.deepEqual(Object.keys(place).sort(), ["country", "id", "label"]);
  assert.ok(!JSON.stringify(places).includes(prefs.hiddenWords[0]));
  const place = await (
    await request(
      `/api/platform/discovery?view=place&country=US&id=${places.places[0].id}`
    )
  ).json();
  assert.deepEqual(Object.keys(place.place).sort(), ["country", "id", "label"]);
  assert.equal(
    (await request("/api/platform/discovery?view=places&country=US&q=%20%20"))
      .status,
    400
  );
  assert.equal(
    (
      await request(
        "/api/platform/discovery?view=places&country=..%2Fetc&q=Chicago"
      )
    ).status,
    400
  );
  const parallel = await Promise.all(
    ["prayer", "community"].map((topic) =>
      send({
        operation: "feedback",
        topic,
        choice: "more",
        expectedVersion: 1,
        mutationId: randomUUID()
      } as unknown as typeof body)
    )
  );
  assert.deepEqual(
    parallel.map((r) => (r.status === 202 ? 200 : r.status)).sort(),
    [200, 409]
  );
  const current = await db.socialPreferences.findUniqueOrThrow({
    where: { ownerId: a.id }
  });
  assert.equal(current.discoveryVersion, 2);
  assert.equal(current.feedVersion, 1);
  assert.equal(
    await db.retentionControl.count({
      where: { sourceId: a.id, kind: "DISCOVERY_PREFERENCES" }
    }),
    2
  );
  await db.platformSession.deleteMany({ where: { userId: a.id } });
  assert.equal((await send()).status, 401);
});
