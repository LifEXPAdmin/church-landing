import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { sessionCookieFixtureName } from "../scripts/session-cookie-fixture.mjs";
import { assertPortalTestDatabase } from "./seed-portal";
import { seedReactionCounts, setAuthorCounts } from "./reaction-count-fixture";
const db = new PrismaClient(),
  origin = process.env.ACCOUNT_ORIGIN!;
assert.match(origin, /^https:\/\/127\.0\.0\.1:\d+$/);
before(() => assertPortalTestDatabase(db));
after(() => db.$disconnect());
type Actor = { id: string; token: string };
const headers = (actor?: Actor): Record<string, string> =>
  actor
    ? {
        cookie: `${sessionCookieFixtureName()}=${actor.token}`,
        "x-expected-account": actor.id
      }
    : {};
const read = (path: string, actor?: Actor) =>
  fetch(origin + path, { headers: headers(actor) });
const send = (body: string, actor: Actor, extra: Record<string, string> = {}) =>
  fetch(origin + "/api/platform/reaction-preferences", {
    method: "POST",
    headers: {
      ...headers(actor),
      origin,
      "content-type": "application/json",
      ...extra
    },
    body
  });
const choice = (hide: boolean, version = 0) =>
  JSON.stringify({
    mutationId: randomUUID(),
    expectedVersion: version,
    hideAuthoredReactionCounts: hide
  });
function privateResponse(response: Response) {
  assert.match(response.headers.get("cache-control")!, /private.*no-store/);
  assert.match(response.headers.get("vary")!, /Cookie.*X-Expected-Account/i);
}
test("HTTPS author choice requires its original account, origin, supported body and exact retry", async () => {
  const f = await seedReactionCounts(db),
    path = "/api/platform/reaction-preferences";
  assert.equal((await read(path)).status, 400);
  for (const response of [
    await read(path, { id: f.a.id, token: "" }),
    await read(path, { id: f.a.id, token: f.b.token })
  ]) {
    assert.equal(response.status, 401);
    privateResponse(response);
  }
  const initial = await read(path, f.a);
  assert.equal(initial.status, 200);
  privateResponse(initial);
  assert.deepEqual(await initial.json(), {
    ownerId: f.a.id,
    version: 0,
    hideAuthoredReactionCounts: false,
    recoveryRequired: false
  });
  assert.equal((await read(path + "?ownerId=" + f.b.id, f.a)).status, 400);
  const body = choice(true);
  assert.equal(
    (await send(body, f.a, { origin: "https://elsewhere.example" })).status,
    403
  );
  assert.equal(
    (await send(body, f.b, { "x-expected-account": f.a.id })).status,
    401
  );
  assert.equal(
    (await send(JSON.stringify({ ...JSON.parse(body), ownerId: f.b.id }), f.a))
      .status,
    400
  );
  const response = await send(body, f.a);
  assert.equal(response.status, 200);
  privateResponse(response);
  const receipt = await response.json();
  assert.equal(receipt.id, f.a.id);
  assert.equal(receipt.version, 1);
  assert.deepEqual(await (await send(body, f.a)).json(), receipt);
  assert.equal(
    (
      await send(
        JSON.stringify({
          ...JSON.parse(body),
          hideAuthoredReactionCounts: false
        }),
        f.a
      )
    ).status,
    409
  );
  assert.equal((await send(choice(false), f.a)).status, 409);
  assert.equal((await send(choice(false, 1), f.a)).status, 200);
  assert.deepEqual(await (await send(body, f.a)).json(), receipt);
  assert.equal(
    (await (await read(path, f.a)).json()).hideAuthoredReactionCounts,
    false
  );
});
test("HTTPS current projections redact author totals without concealing another speaker or own reaction", async () => {
  const f = await seedReactionCounts(db);
  await setAuthorCounts(db, f.a, true);
  for (const actor of [undefined, f.viewer, f.a]) {
    const response = await read(
      `/api/platform/posts?view=availability-batch&postId=${f.post.id}&postId=${f.other.id}&postId=${f.churchPost.id}`,
      actor
    );
    assert.equal(response.status, 200);
    privateResponse(response);
    const data = await response.json();
    assert.deepEqual(
      data.posts.map((p: { likeCount: number | null }) => p.likeCount),
      [null, 1, 1]
    );
    assert.ok(!JSON.stringify(data).includes("reactionCountRecoveryRequired"));
    const comments = await (
      await read(`/api/platform/comments?postId=${f.churchPost.id}`, actor)
    ).json();
    assert.equal(comments.pinned.likeCount, null);
    assert.equal(
      comments.items.find((c: { id: string }) => c.id === f.churchComment.id)
        .likeCount,
      1
    );
  }
  const like = await (
    await read(`/api/platform/post-likes?postId=${f.post.id}`, f.viewer)
  ).json();
  assert.equal(like.count, null);
  assert.equal(like.liked, true);
  const prayer = await (
    await read(`/api/platform/prayers?postId=${f.post.id}`, f.viewer)
  ).json();
  assert.equal(prayer.count, null);
  assert.equal(prayer.choice.acknowledged, false);
  const response = await fetch(origin + "/api/platform/post-likes", {
    method: "POST",
    headers: {
      ...headers(f.viewer),
      origin,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      postId: f.post.id,
      desired: false,
      expectedVersion: like.version,
      mutationId: randomUUID()
    })
  });
  assert.equal(response.status, 200);
  const afterLike = await (
    await read(`/api/platform/post-likes?postId=${f.post.id}`, f.viewer)
  ).json();
  assert.equal(afterLike.count, null);
  assert.equal(afterLike.liked, false);
});
test("HTTPS stale credentials cannot read or replay a saved author choice", async () => {
  const f = await seedReactionCounts(db),
    body = choice(true);
  assert.equal((await send(body, f.a)).status, 200);
  await db.platformUser.update({
    where: { id: f.a.id },
    data: { credentialVersion: { increment: 1 } }
  });
  for (const response of [
    await read("/api/platform/reaction-preferences", f.a),
    await send(body, f.a)
  ]) {
    assert.equal(response.status, 401);
    privateResponse(response);
  }
});
