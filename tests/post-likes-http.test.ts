import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { createPortalActor, assertPortalTestDatabase } from "./seed-portal";
const db = new PrismaClient(),
  origin = process.env.ACCOUNT_ORIGIN!;
assert.match(origin, /^https:\/\/127\.0\.0\.1:\d+$/);
before(() => assertPortalTestDatabase(db));
after(() => db.$disconnect());
test("HTTPS Likes preserve exact retries, Unlike versions, account and current source access", async () => {
  const a = await createPortalActor(db, "likeapi"),
    b = await createPortalActor(db, "likeother");
  const row = await db.platformPost.create({
    data: { authorId: a.id, content: "Fictional Like retry" }
  });
  const send = (body: string, token = a.token, account = a.id, from = origin) =>
    fetch(origin + "/api/platform/post-likes", {
      method: "POST",
      headers: {
        origin: from,
        cookie: `church_platform_session=${token}`,
        "content-type": "application/json",
        "x-expected-account": account
      },
      body
    });
  const state = async () =>
    (
      await fetch(origin + "/api/platform/post-likes?postId=" + row.id, {
        headers: { cookie: `church_platform_session=${a.token}` }
      })
    ).json();
  const input = {
    postId: row.id,
    mutationId: randomUUID(),
    expectedVersion: 0,
    desired: true
  };
  const body = JSON.stringify(input);
  assert.equal((await send(body, a.token, b.id)).status, 401);
  assert.equal(
    (await send(body, a.token, a.id, "https://elsewhere.example")).status,
    403
  );
  const first = await send(body);
  assert.equal(first.status, 200);
  const receipt = await first.json();
  assert.deepEqual(await (await send(body)).json(), receipt);
  assert.deepEqual(await state(), {
    id: row.id,
    liked: true,
    version: 1,
    count: 1
  });
  assert.equal(
    (await send(JSON.stringify({ ...input, desired: false }))).status,
    409
  );
  assert.equal(
    (await send(JSON.stringify({ ...input, mutationId: randomUUID() }))).status,
    409
  );
  const unlike = JSON.stringify({
    ...input,
    mutationId: randomUUID(),
    expectedVersion: 1,
    desired: false
  });
  assert.equal((await send(unlike)).status, 200);
  assert.equal((await send(unlike)).status, 200);
  assert.deepEqual(await state(), {
    id: row.id,
    liked: false,
    version: 2,
    count: 0
  });
  // A delayed acknowledgement is a receipt; it cannot undo the later Unlike.
  assert.deepEqual(await (await send(body)).json(), receipt);
  assert.equal((await state()).liked, false);
  await db.platformPost.update({
    where: { id: row.id },
    data: { status: "WITHDRAWN", withdrawnAt: new Date() }
  });
  assert.equal(
    (
      await send(
        JSON.stringify({
          ...input,
          mutationId: randomUUID(),
          expectedVersion: 2
        })
      )
    ).status,
    404
  );
  await db.platformSession.deleteMany({ where: { userId: a.id } });
  assert.equal((await send(body)).status, 401);
});
test("production server manifest no longer exports retired community mutations", () => {
  const manifest = readFileSync(
    ".next/server/server-reference-manifest.json",
    "utf8"
  );
  for (const name of [
    "createPlatformPost",
    "deletePlatformPost",
    "followPlatformUser",
    "unfollowPlatformUser",
    "togglePlatformPostLike",
    "createPlatformPostComment",
    "deletePlatformPostComment"
  ])
    assert.ok(!manifest.includes(`\"${name}\"`), name);
});
test("identity projection stays minimal and private and rejects revoked credentials", async () => {
  const actor = await createPortalActor(db, "identityapi");
  const read = (token = actor.token) =>
    fetch(origin + "/api/platform/profile?view=identity", {
      headers: { cookie: `church_platform_session=${token}` }
    });
  const response = await read();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("cache-control")!, /no-store/);
  assert.deepEqual(await response.json(), { id: actor.id });
  assert.equal((await read("")).status, 401);
  await db.platformUser.update({
    where: { id: actor.id },
    data: { credentialVersion: { increment: 1 } }
  });
  assert.equal((await read()).status, 401);
});
