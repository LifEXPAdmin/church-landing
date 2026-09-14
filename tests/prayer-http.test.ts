import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { createPortalActor, assertPortalTestDatabase } from "./seed-portal";
import { PRAYER_GUIDE_VERSION } from "../lib/platform/prayer-types";
const db = new PrismaClient(),
  origin = process.env.ACCOUNT_ORIGIN!;
assert.match(origin, /^https:\/\/127\.0\.0\.1:\d+$/);
before(() => assertPortalTestDatabase(db));
after(() => db.$disconnect());
const request = (
  token: string,
  query: string,
  body?: Record<string, unknown>,
  extra: Record<string, string> = {}
) =>
  fetch(origin + "/api/platform/prayers" + query, {
    method: body ? "POST" : "GET",
    headers: {
      cookie: `church_platform_session=${token}`,
      origin,
      ...(body ? { "content-type": "application/json" } : {}),
      ...extra
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
test("real HTTPS prayer endpoints preserve identity, origin, private caching, current guide and exact canonical update receipts", async () => {
  const a = await createPortalActor(db, "prayhttps"),
    b = await createPortalActor(db, "prayhttpb");
  const p = await db.platformPost.create({
    data: { authorId: a.id, content: "Fictional HTTPS prayer source" }
  });
  const guest = await request("", "?view=saved");
  assert.equal(guest.status, 401);
  assert.match(guest.headers.get("cache-control")!, /no-store/);
  assert.equal(
    (
      await request(a.token, "?postId=" + p.id, undefined, {
        "x-expected-account": b.id
      })
    ).status,
    401
  );
  assert.equal((await request(a.token, "?view=invalid")).status, 400);
  const guide = {
    operation: "guide",
    mutationId: randomUUID(),
    expectedVersion: 0,
    guideVersion: PRAYER_GUIDE_VERSION
  };
  assert.equal(
    (await request(a.token, "", guide, { origin: "https://unrelated.example" }))
      .status,
    403
  );
  assert.equal(
    (await request(a.token, "", { ...guide, ownerId: b.id })).status,
    400
  );
  const acknowledgment = {
    operation: "acknowledge",
    postId: p.id,
    desired: true,
    shareName: false,
    guideVersion: PRAYER_GUIDE_VERSION,
    expectedVersion: 0,
    mutationId: randomUUID()
  };
  assert.equal((await request(a.token, "", acknowledgment)).status, 409);
  const accepted = await request(a.token, "", guide);
  assert.equal(accepted.status, 200);
  assert.match(accepted.headers.get("cache-control")!, /no-store/);
  const first = await request(a.token, "", acknowledgment);
  assert.equal(first.status, 200);
  assert.deepEqual(
    await first.json(),
    await (await request(a.token, "", acknowledgment)).json()
  );
  const state = await (await request(a.token, "?postId=" + p.id)).json();
  assert.equal(state.choice.acknowledged, true);
  assert.equal(state.choice.shareName, false);
  assert.deepEqual(state.names, []);
  assert.equal(JSON.stringify(state).includes(a.email), false);
  const update = {
    operation: "update",
    mutationId: randomUUID(),
    postId: p.id,
    kind: "UPDATE",
    content: "HTTPS author prayer update"
  };
  assert.equal((await request(b.token, "", update)).status, 403);
  const created = await request(a.token, "", update);
  assert.equal(created.status, 200);
  const receipt = await created.json();
  assert.deepEqual(await (await request(a.token, "", update)).json(), receipt);
  assert.equal(await db.prayerUpdate.count({ where: { postId: p.id } }), 1);
  const comments = await fetch(
    origin +
      `/api/platform/comments?postId=${p.id}&view=context&commentId=${receipt.id}`,
    { headers: { cookie: `church_platform_session=${a.token}` } }
  );
  const thread = await comments.json();
  assert.equal(thread.target.prayerUpdateKind, "UPDATE");
  const updates = await (
    await request(a.token, `?view=updates&postId=${p.id}`)
  ).json();
  assert.equal(
    updates.items[0].href,
    `/platform/posts/${p.id}?comment=${receipt.id}`
  );
  await db.platformPost.update({
    where: { id: p.id },
    data: {
      status: "WITHDRAWN",
      withdrawnAt: new Date(),
      version: { increment: 1 }
    }
  });
  assert.equal((await request(a.token, "", update)).status, 404);
  assert.equal(
    (await request(a.token, `?view=updates&postId=${p.id}`)).status,
    404
  );
  await db.platformUser.update({
    where: { id: a.id },
    data: { credentialVersion: { increment: 1 } }
  });
  assert.equal((await request(a.token, "?view=saved")).status, 401);
});
