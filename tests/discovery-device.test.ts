import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { createPortalActor, assertPortalTestDatabase } from "./seed-portal";
import { handleDiscoveryDeviceRequest } from "../lib/platform/discovery-device-boundary";
const db = new PrismaClient(),
  origin = process.env.ACCOUNT_ORIGIN!;
assert.match(origin, /^https:\/\/127\.0\.0\.1:\d+$/);
before(() => assertPortalTestDatabase(db));
after(() => db.$disconnect());
test("device lookup pins the active adult account, uses private transient cells and leaves preferences, disclosure and command journals untouched", async () => {
  const a = await createPortalActor(db, "devicearea"),
    b = await createPortalActor(db, "deviceother");
  const snapshot = async () => ({
    user: await db.platformUser.findUniqueOrThrow({ where: { id: a.id } }),
    prefs: await db.socialPreferences.findUnique({ where: { ownerId: a.id } }),
    commands: await db.socialOperation.count({ where: { ownerId: a.id } }),
    controls: await db.retentionControl.count({ where: { sourceId: a.id } })
  });
  const before = await snapshot();
  const body = { country: "US", latitudeCell: 527, longitudeCell: 369 };
  const call = (
    options: {
      token?: string;
      owner?: string;
      body?: unknown;
      origin?: string;
      query?: string;
      method?: string;
    } = {}
  ) =>
    handleDiscoveryDeviceRequest(
      db,
      new Request(
        origin + "/api/platform/discovery/device" + (options.query ?? ""),
        {
          method: options.method ?? (options.body ? "POST" : "GET"),
          headers: {
            cookie: `church_platform_session=${options.token ?? a.token}`,
            "x-expected-account": options.owner ?? a.id,
            origin: options.origin ?? origin,
            ...(options.body ? { "content-type": "application/json" } : {})
          },
          ...(options.body ? { body: JSON.stringify(options.body) } : {})
        }
      )
    );
  for (const options of [{ owner: b.id }, { token: "" }, { token: b.token }])
    assert.equal((await call(options)).status, 401);
  assert.equal((await call({ owner: "" })).status, 400);
  assert.equal((await call({ query: "?latitude=41.8781234" })).status, 400);
  assert.equal((await call({ method: "PUT" })).status, 405);
  assert.equal(
    (await call({ body, origin: "https://elsewhere.invalid" })).status,
    403
  );
  assert.equal(
    (await call({ body: { ...body, precise: [41.8781234, -87.6299876] } }))
      .status,
    400
  );
  for (const response of [await call(), await call({ body })]) {
    assert.equal(response.status, 200);
    for (const header of [
      "cache-control",
      "cdn-cache-control",
      "vercel-cdn-cache-control"
    ])
      assert.match(response.headers.get(header)!, /no-store/);
    const result = await response.json();
    assert.equal(result.ownerId, a.id);
    if (result.places)
      for (const place of result.places)
        assert.deepEqual(Object.keys(place).sort(), ["country", "id", "label"]);
    else assert.equal(result.available, true);
    assert.ok(!JSON.stringify(result).includes("latitude"));
  }
  assert.deepEqual(await snapshot(), before);
  for (const field of ["emailVerifiedAt", "adultAcknowledgedAt"] as const) {
    await db.platformUser.update({
      where: { id: a.id },
      data: { [field]: null }
    });
    for (const options of [{}, { body }])
      assert.equal((await call(options)).status, 403);
    await db.platformUser.update({
      where: { id: a.id },
      data: { [field]: before.user[field] }
    });
  }
  await db.platformUser.update({
    where: { id: a.id },
    data: { suspendedAt: new Date() }
  });
  assert.equal((await call({ body })).status, 401);
  await db.platformUser.update({
    where: { id: a.id },
    data: { suspendedAt: null }
  });
  await db.platformSession.deleteMany({ where: { userId: a.id } });
  assert.equal((await call({ body })).status, 401);
});
