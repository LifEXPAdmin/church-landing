import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { seedPortal, assertPortalTestDatabase } from "./seed-portal";
import { postCommand } from "../lib/platform/post-commands";
import { portalCommand } from "../lib/platform/portal";

const db = new PrismaClient(),
  origin = process.env.ACCOUNT_ORIGIN!;
const production = process.env.POST_RENDER_PHASE === "production";
assert.match(origin, /^https?:\/\/127\.0\.0\.1:\d+$/);
before(() => assertPortalTestDatabase(db));
after(() => db.$disconnect());
async function fixture() {
  const f = await seedPortal(db);
  await portalCommand(db, f.operator.token, {
    operation: "grant",
    churchId: f.churchA.id,
    userId: f.memberA.id,
    capability: "PUBLISH_CHURCH_POSTS",
    expectedVersion: 0
  });
  return f;
}
const get = (path: string, token = "", rsc = false) =>
  fetch(origin + path, {
    headers: {
      ...(token ? { Cookie: "church_platform_session=" + token } : {}),
      ...(rsc ? { RSC: "1" } : {})
    }
  });
test("publishing API accepts exactly 3000 normalized multiline characters and rejects overflow", async () => {
  const f = await fixture();
  const content = "文".repeat(1499) + "\n\n" + "字".repeat(1499);
  const requestKey = randomUUID();
  const submit = (value: string, key: string) =>
    fetch(origin + "/api/platform/posts", {
      method: "POST",
      headers: {
        Cookie: "church_platform_session=" + f.memberA.token,
        Origin: origin,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        operation: "create",
        content: value.replace(/\n/g, "\r\n"),
        requestKey: key,
        type: "UPDATE"
      })
    });
  assert.equal((await submit(content, requestKey)).status, 200);
  assert.equal((await submit(content, requestKey)).status, 200);
  const posts = await db.platformPost.findMany({
    where: { authorId: f.memberA.id, requestKey }
  });
  assert.equal(posts.length, 1);
  assert.equal(posts[0].content, content);
  const html = await (await get("/platform/posts/" + posts[0].id)).text();
  assert.ok(html.includes("文".repeat(1499)));
  assert.ok(html.includes("字".repeat(1499)));
  const overflowKey = randomUUID();
  assert.equal((await submit(content + "字", overflowKey)).status, 400);
  assert.equal(
    await db.platformPost.count({ where: { requestKey: overflowKey } }),
    0
  );
});
test("actual post HTML and RSC filter church audiences before feed, search, profile and direct rendering", async () => {
  const f = await fixture(),
    marker = "PRIVATE CHURCH POST " + randomUUID();
  const p = await postCommand(db, f.memberA.token, {
    operation: "create",
    requestKey: randomUUID(),
    authorChurchId: f.churchA.id,
    content: marker
  });
  for (const rsc of [false, true]) {
    for (const token of ["", f.memberB.token, f.coordinator.token]) {
      for (const path of [
        "/platform",
        "/platform/search?q=" +
          encodeURIComponent(marker.replace("PRIVATE CHURCH POST ", "")),
        "/platform/posts/" + p.id
      ]) {
        const response = await get(path, token, rsc),
          body = await response.text();
        assert.equal(
          body.includes(marker),
          production &&
            token === f.coordinator.token &&
            !path.includes("search"),
          `${path}, rsc=${rsc}, authorized=${token === f.coordinator.token}`
        );
        if (path.includes("search")) {
          const response = await get(
            "/api/platform/search?kind=posts&q=" +
              encodeURIComponent(marker.replace("PRIVATE CHURCH POST ", "")),
            token
          );
          assert.equal(response.status, 200);
          const results = await response.text();
          assert.equal(results.includes(marker), token === f.coordinator.token);
          assert.ok(!results.includes(f.memberA.email));
          assert.ok(!results.includes(f.memberA.username));
        }
        assert.ok(!body.includes(f.memberA.email));
        if (path.includes("/posts/") || path === "/platform") {
          assert.ok(
            !body.includes(f.memberA.username),
            "a church post must not expose its acting account"
          );
          assert.ok(
            !body.includes(f.memberA.id),
            "acting account IDs stay in restricted records"
          );
        }
      }
    }
    const profile = await (
      await get(
        "/platform/profile/" + f.memberA.username,
        f.coordinator.token,
        rsc
      )
    ).text();
    assert.ok(!profile.includes(marker));
  }
  await postCommand(db, f.memberA.token, {
    operation: "withdraw",
    postId: p.id,
    expectedVersion: 1,
    confirmed: true
  });
  for (const rsc of [false, true])
    assert.ok(
      !(
        await (
          await get("/platform/posts/" + p.id, f.coordinator.token, rsc)
        ).text()
      ).includes(marker)
    );
});
test("actual public church posts name only the church and revoked membership disappears on fresh reads", async () => {
  const f = await fixture(),
    marker = "Public church author " + randomUUID();
  const p = await postCommand(db, f.memberA.token, {
    operation: "create",
    requestKey: randomUUID(),
    authorChurchId: f.churchA.id,
    audience: "PUBLIC",
    content: marker
  });
  for (const rsc of [false, true]) {
    const response = await get("/platform/posts/" + p.id, "", rsc),
      body = await response.text();
    assert.equal(response.status, 200);
    assert.ok(body.includes(marker));
    assert.ok(body.includes(f.churchA.name));
    for (const hidden of [
      f.memberA.email,
      f.memberA.username,
      f.memberA.id,
      "scheduleLocal",
      "scheduledById",
      "requestKey"
    ])
      assert.ok(!body.includes(hidden), hidden);
  }
  await postCommand(db, f.memberA.token, {
    operation: "edit",
    postId: p.id,
    expectedVersion: 1,
    audience: "CHURCH",
    confirmAudienceChange: true
  });
  const connection = await db.churchConnection.findUniqueOrThrow({
    where: {
      userId_churchId: { userId: f.coordinator.id, churchId: f.churchA.id }
    }
  });
  await portalCommand(db, f.reviewerA.token, {
    operation: "transition",
    action: "REMOVE",
    churchId: f.churchA.id,
    connectionId: connection.id,
    expectedVersion: connection.version
  });
  for (const rsc of [false, true])
    assert.ok(
      !(
        await (
          await get("/platform/posts/" + p.id, f.coordinator.token, rsc)
        ).text()
      ).includes(marker)
    );
});
