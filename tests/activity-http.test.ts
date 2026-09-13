import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { createPortalActor, assertPortalTestDatabase } from "./seed-portal";
import { commentCommand } from "../lib/platform/comment-commands";
const db = new PrismaClient(),
  origin = process.env.ACCOUNT_ORIGIN!;
assert.match(origin, /^https:\/\/127\.0\.0\.1:\d+$/);
type Actor = Awaited<ReturnType<typeof createPortalActor>>;
let owner: Actor, author: Actor, outsider: Actor;
before(async () => {
  await assertPortalTestDatabase(db);
  owner = await createPortalActor(db, "activityhttp");
  author = await createPortalActor(db, "activityhttpsource");
  outsider = await createPortalActor(db, "activityhttpoutside");
});
after(() => db.$disconnect());
const get = (query = "", actor = owner) =>
  fetch(origin + "/api/platform/activity" + query, {
    headers: { cookie: `church_platform_session=${actor.token}` }
  });
const send = (
  body: Record<string, unknown>,
  actor = owner,
  expected = actor.id,
  from = origin
) =>
  fetch(origin + "/api/platform/activity", {
    method: "POST",
    headers: {
      cookie: `church_platform_session=${actor.token}`,
      origin: from,
      "content-type": "application/json",
      "x-expected-account": expected
    },
    body: JSON.stringify(body)
  });
async function seed() {
  const post = await db.platformPost.create({
    data: {
      authorId: owner.id,
      content: "Private HTTP source text"
    }
  });
  const comment = await db.platformPostComment.create({
    data: {
      postId: post.id,
      authorId: author.id,
      content: "Private HTTP reply text"
    }
  });
  const event = await db.socialEvent.create({
    data: {
      key: randomUUID(),
      kind: "COMMENT_ACTIVITY",
      recipientId: owner.id,
      actorId: author.id,
      postId: post.id,
      commentId: comment.id
    }
  });
  return { post, comment, event };
}
test("Activity HTTPS denies guests and stale accounts, validates input and never caches recipient data", async () => {
  const guest = await fetch(origin + "/api/platform/activity");
  assert.equal(guest.status, 401);
  assert.match(guest.headers.get("cache-control")!, /no-store/);
  for (const query of [
    "?category=unknown",
    "?cursor=bad",
    "?ownerId=other",
    "?category=comments&category=messages"
  ])
    assert.equal((await get(query)).status, 400);
  const response = await get();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("cache-control")!, /private, no-store/);
  const page = await response.json();
  const body = {
    operation: "read-all",
    mutationId: randomUUID(),
    ownerId: owner.id,
    boundary: page.boundary
  };
  assert.equal((await send(body, owner, outsider.id)).status, 401);
  assert.equal(
    (await send(body, owner, owner.id, "https://elsewhere.example")).status,
    403
  );
  assert.equal((await send({ ...body, recipientId: outsider.id })).status, 400);
});
test("Activity HTTPS acknowledges an exact read retry without reading a later arrival or another account", async () => {
  await seed();
  const page = await (await get()).json();
  const body = {
    operation: "read-all",
    mutationId: randomUUID(),
    ownerId: owner.id,
    boundary: page.boundary
  };
  const response = await send(body);
  assert.equal(response.status, 200);
  const receipt = await response.json();
  await seed();
  const retry = await send(body);
  assert.equal(retry.status, 200);
  assert.deepEqual(await retry.json(), receipt);
  const latest = await (await get()).json();
  assert.equal(latest.unread, 1);
  assert.equal(
    (await send({ ...body, boundary: latest.boundary })).status,
    409
  );
  assert.equal((await send(body, outsider)).status, 401);
  assert.equal(
    (await get("?view=open&id=" + latest.items[0].id, outsider)).status,
    404
  );
  assert.equal((await (await get("", outsider)).json()).items.length, 0);
});
test("Activity HTTPS source loss removes presentation metadata and links while preserving owned read controls", async () => {
  const f = await seed();
  const before = await (await get("?category=comments")).json();
  assert.equal(before.items[0].id, f.event.id);
  assert.equal(before.items[0].summary, "Latest from " + author.name);
  await commentCommand(db, author.token, {
    operation: "delete",
    mutationId: randomUUID(),
    postId: f.post.id,
    commentId: f.comment.id,
    expectedVersion: f.comment.version
  });
  const response = await get("?category=comments"),
    page = await response.json();
  const item = page.items.find((i: { id: string }) => i.id === f.event.id);
  assert.equal(item.available, false);
  assert.equal(item.href, null);
  assert.equal(item.summary, null);
  assert.doesNotMatch(JSON.stringify(item), /Private HTTP|activityhttpsource/);
  const open = await (await get("?view=open&id=" + f.event.id)).json();
  assert.equal(open.available, false);
  assert.equal(open.href, null);
  assert.equal(
    (
      await send({
        operation: "read",
        mutationId: randomUUID(),
        ownerId: owner.id,
        id: f.event.id,
        boundary: page.boundary
      })
    ).status,
    200
  );
});
