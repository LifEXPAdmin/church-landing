import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { createPortalActor, assertPortalTestDatabase } from "./seed-portal";
const db = new PrismaClient(),
  origin = process.env.ACCOUNT_ORIGIN!;
assert.match(origin, /^https:\/\/127\.0\.0\.1:\d+$/);
before(() => assertPortalTestDatabase(db));
after(() => db.$disconnect());
test("feed preference HTTPS boundary pins the account, checks origin and preserves exact retry and private settings", async () => {
  const a = await createPortalActor(db, "feedapi"),
    b = await createPortalActor(db, "feedother");
  await db.socialPreferences.create({
    data: { ownerId: a.id, mentions: "NOBODY", version: 8 }
  });
  const input = {
      mode: "friends",
      mutationId: randomUUID(),
      expectedVersion: 0
    },
    body = JSON.stringify(input);
  const send = (
    payload = body,
    token = a.token,
    expected = a.id,
    from = origin
  ) =>
    fetch(origin + "/api/platform/feed", {
      method: "POST",
      headers: {
        origin: from,
        cookie: `church_platform_session=${token}`,
        "content-type": "application/json",
        "x-expected-account": expected
      },
      body: payload
    });
  assert.equal((await send(body, a.token, b.id)).status, 401);
  assert.equal(
    (await send(body, a.token, a.id, "https://elsewhere.example")).status,
    403
  );
  assert.equal((await send(body, "")).status, 401);
  const first = await send();
  assert.equal(first.status, 200);
  assert.match(first.headers.get("cache-control")!, /no-store/);
  const result = await first.json();
  assert.deepEqual(await (await send()).json(), result);
  assert.equal(
    (await send(JSON.stringify({ ...input, mode: "trending" }))).status,
    409
  );
  assert.equal(
    (
      await send(
        JSON.stringify({
          ...input,
          mutationId: randomUUID(),
          mode: "unsupported"
        })
      )
    ).status,
    400
  );
  const saved = await db.socialPreferences.findUniqueOrThrow({
    where: { ownerId: a.id }
  });
  assert.equal(saved.feedMode, "friends");
  assert.equal(saved.feedVersion, 1);
  assert.equal(saved.mentions, "NOBODY");
  assert.equal(saved.version, 8);
  assert.equal(
    await db.socialPreferences.count({ where: { ownerId: b.id } }),
    0
  );
  await db.platformSession.deleteMany({ where: { userId: a.id } });
  assert.equal((await send()).status, 401);
});
