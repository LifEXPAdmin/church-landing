import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import {
  assertPortalTestDatabase,
  createPortalActor,
  seedPortal
} from "./seed-portal";
const db = new PrismaClient(),
  origin = process.env.ACCOUNT_ORIGIN!;
assert.match(origin, /^https:\/\/127\.0\.0\.1:\d+$/);
before(() => assertPortalTestDatabase(db));
after(() => db.$disconnect());

test("profile pin HTTPS requires the current account and same origin, preserves exact retries and exposes no other owner's pin", async () => {
  const a = await createPortalActor(db, "pinhttp"),
    b = await createPortalActor(db, "pinhttpother");
  const post = await db.platformPost.create({
    data: { authorId: a.id, content: "Fictional pin HTTP " + randomUUID() }
  });
  const input = {
      postId: post.id,
      desired: true,
      expectedVersion: 0,
      mutationId: randomUUID()
    },
    body = JSON.stringify(input);
  const request = (
    method: string,
    payload?: string,
    token = a.token,
    account = a.id,
    from = origin
  ) =>
    fetch(origin + "/api/platform/profile-pin?postId=" + post.id, {
      method,
      headers: {
        origin: from,
        cookie: `church_platform_session=${token}`,
        "x-expected-account": account,
        "content-type": "application/json"
      },
      ...(payload ? { body: payload } : {})
    });
  for (const method of ["GET", "POST"]) {
    for (const [token, account] of [
      [a.token, b.id],
      [a.token, ""],
      ["", a.id]
    ]) {
      const denied = await request(
        method,
        method === "POST" ? body : undefined,
        token,
        account
      );
      assert.equal(denied.status, 401);
      assert.match(denied.headers.get("cache-control")!, /no-store/);
      assert.ok(!(await denied.text()).includes(post.content));
    }
    assert.equal(
      (
        await request(
          method,
          method === "POST" ? body : undefined,
          b.token,
          b.id
        )
      ).status,
      404
    );
  }
  assert.equal(
    (await request("POST", body, a.token, a.id, "https://elsewhere.example"))
      .status,
    403
  );
  assert.equal(
    await db.socialOperation.count({
      where: { ownerId: a.id, key: { startsWith: "profile-pin:" } }
    }),
    0
  );
  const initial = await request("GET");
  assert.equal(initial.status, 200);
  assert.deepEqual(await initial.json(), {
    pinned: false,
    replaces: false,
    version: 0,
    canPin: true
  });
  const response = await request("POST", body);
  assert.equal(response.status, 200);
  assert.match(response.headers.get("cache-control")!, /private.*no-store/);
  const receipt = await response.json();
  assert.deepEqual(await (await request("POST", body)).json(), receipt);
  assert.equal(
    (await request("POST", JSON.stringify({ ...input, desired: false })))
      .status,
    409
  );
  assert.equal(
    (
      await request(
        "POST",
        JSON.stringify({ ...input, mutationId: randomUUID(), ownerId: b.id })
      )
    ).status,
    400
  );
  assert.equal((await (await request("GET")).json()).pinned, true);
  await db.platformPost.update({
    where: { id: post.id },
    data: { moderationState: "HIDDEN" }
  });
  assert.equal((await request("POST", body)).status, 404);
  assert.equal(
    (
      await request(
        "POST",
        JSON.stringify({
          ...input,
          desired: false,
          mutationId: randomUUID(),
          expectedVersion: 1
        })
      )
    ).status,
    200
  );
  assert.equal(
    await db.socialOperation.count({
      where: { ownerId: a.id, key: { startsWith: "profile-pin:" } }
    }),
    2
  );
  await db.platformSession.deleteMany({ where: { userId: a.id } });
  assert.equal((await request("GET")).status, 401);
});

test("profile HTML and member preview suppress a church-only pin while the current owner sees one canonical card", async () => {
  const f = await seedPortal(db),
    a = f.memberA,
    b = f.memberB;
  const marker = "Fictional-private-pinned-post-" + randomUUID();
  const post = await db.platformPost.create({
    data: {
      authorId: a.id,
      content: marker,
      audience: "CHURCH",
      audienceChurchId: f.churchA.id
    }
  });
  await db.socialPreferences.create({
    data: { ownerId: a.id, profilePinPostId: post.id, profilePinVersion: 1 }
  });
  const path = origin + "/platform/profile/" + a.username;
  const get = (token: string, suffix = "", rsc = false) =>
    fetch(path + suffix, {
      headers: {
        cookie: `church_platform_session=${token}`,
        ...(rsc ? { RSC: "1" } : {})
      }
    });
  const own = await get(a.token);
  assert.equal(own.status, 200);
  const html = await own.text();
  assert.match(html, /data-profile-pin="true"/);
  assert.ok(html.includes(marker));
  assert.equal((html.match(/data-profile-pin="true"/g) ?? []).length, 1);
  for (const [token, suffix] of [
    ["", ""],
    [b.token, ""],
    [a.token, "?preview=member"],
    [a.token, "?preview=visitor"]
  ]) {
    for (const rsc of [false, true]) {
      const response = await get(token, suffix, rsc);
      assert.equal(response.status, 200);
      const text = await response.text();
      assert.ok(!text.includes(marker));
      assert.ok(!text.includes(post.id));
      assert.ok(!text.includes(a.token));
    }
  }
});
