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
const get = (path: string, token = "") =>
  fetch(origin + path, {
    headers: { cookie: `church_platform_session=${token}` }
  });
const post = (
  path: string,
  token: string,
  body: Record<string, unknown>,
  from = origin
) =>
  fetch(origin + path, {
    method: "POST",
    headers: {
      origin: from,
      cookie: `church_platform_session=${token}`,
      "content-type": "application/json"
    },
    body: JSON.stringify(body)
  });
test("actual HTTPS relationships/comments recheck sessions, reject CSRF and owner injection, preserve private drafts and deduplicate publishing", async () => {
  const a = await createPortalActor(db, "socialapi"),
    b = await createPortalActor(db, "socialb");
  const p = await db.platformPost.create({
    data: { authorId: a.id, content: "Fictional social HTTPS conversation" }
  });
  for (const path of [
    "/api/platform/relationships",
    "/api/platform/comments?view=drafts"
  ])
    assert.equal((await get(path)).status, 401);
  const input = {
    operation: "create",
    mutationId: randomUUID(),
    postId: p.id,
    content: "Saved exactly once"
  };
  assert.equal(
    (
      await post(
        "/api/platform/comments",
        a.token,
        input,
        "https://unrelated.example"
      )
    ).status,
    403
  );
  assert.equal(
    (await post("/api/platform/comments", a.token, { ...input, ownerId: b.id }))
      .status,
    400
  );
  const response = await post("/api/platform/comments", a.token, input);
  assert.equal(response.status, 200);
  assert.match(response.headers.get("cache-control")!, /no-store/);
  const saved = await response.json();
  assert.deepEqual(
    await (await post("/api/platform/comments", a.token, input)).json(),
    saved
  );
  const thread = await (
    await get(
      `/api/platform/comments?postId=${p.id}&view=context&commentId=${saved.id}`,
      b.token
    )
  ).json();
  assert.equal(thread.target.id, saved.id);
  assert.equal(thread.visibleCount, 1);
  assert.ok(!JSON.stringify(thread).includes(a.email));
  const draftId = randomUUID(),
    content = "Private unsent API draft";
  assert.equal(
    (
      await post("/api/platform/comments", a.token, {
        operation: "draft-save",
        mutationId: randomUUID(),
        postId: p.id,
        draftId,
        content,
        expectedVersion: 0
      })
    ).status,
    200
  );
  assert.equal(
    (
      await (
        await get(
          `/api/platform/comments?view=drafts&draftId=${draftId}`,
          a.token
        )
      ).json()
    ).items[0].content,
    content
  );
  assert.equal(
    (
      await (
        await get(
          `/api/platform/comments?view=drafts&draftId=${draftId}`,
          b.token
        )
      ).json()
    ).items.length,
    0
  );
  const blocking = {
    operation: "block",
    mutationId: randomUUID(),
    kind: "person",
    targetId: a.id,
    desired: true,
    expectedVersion: 0
  };
  assert.equal(
    (await post("/api/platform/relationships", b.token, blocking)).status,
    200
  );
  assert.equal(
    (await get(`/api/platform/comments?postId=${p.id}`, b.token)).status,
    404
  );
  assert.equal(
    (await get(`/api/platform/gallery?postId=${p.id}`, b.token)).status,
    404
  );
  assert.equal(
    (
      await (
        await get(`/api/platform/share-preview?kind=post&id=${p.id}`, b.token)
      ).json()
    ).available,
    false
  );
  assert.equal(
    (
      await (
        await get(`/api/platform/share-preview?kind=post&id=${p.id}`)
      ).json()
    ).available,
    true
  );
  await db.platformUser.update({
    where: { id: a.id },
    data: { credentialVersion: { increment: 1 } }
  });
  assert.equal(
    (await post("/api/platform/comments", a.token, input)).status,
    401
  );
});
test("actual HTTPS gallery and crawler preview boundaries use bounded projections, safe assets and generic missing/private responses", async () => {
  const a = await createPortalActor(db, "galleryapi");
  const p = await db.platformPost.create({
    data: { authorId: a.id, content: "Public preview API fixture" }
  });
  const gallery = await get(`/api/platform/gallery?postId=${p.id}`, a.token);
  assert.equal(gallery.status, 200);
  assert.match(gallery.headers.get("cache-control")!, /no-store/);
  const data = await gallery.json();
  assert.equal(data.postVersion, 1);
  assert.deepEqual(data.images, []);
  const order = {
    operation: "reorder",
    mutationId: randomUUID(),
    postId: p.id,
    expectedVersion: 1,
    images: []
  };
  assert.equal(
    (
      await post(
        "/api/platform/gallery",
        a.token,
        order,
        "https://unrelated.example"
      )
    ).status,
    403
  );
  assert.equal(
    (await post("/api/platform/gallery", a.token, order)).status,
    200
  );
  const preview = await get(`/api/platform/share-preview?kind=post&id=${p.id}`);
  assert.match(preview.headers.get("cache-control")!, /no-store/);
  const visible = await preview.json();
  assert.equal(visible.available, true);
  assert.equal(visible.author.name, a.name);
  const image = await fetch(visible.image.url);
  assert.equal(image.status, 200);
  assert.match(image.headers.get("content-type")!, /image\/png/);
  await db.platformPost.update({
    where: { id: p.id },
    data: { status: "WITHDRAWN", withdrawnAt: new Date() }
  });
  const hidden = await (
    await get(`/api/platform/share-preview?kind=post&id=${p.id}`, a.token)
  ).json();
  assert.equal(hidden.available, false);
  assert.equal(hidden.author, null);
  assert.ok(!JSON.stringify(hidden).includes(p.content));
  assert.equal(
    (await get("/api/platform/share-preview?kind=admin&id=foo")).status,
    400
  );
  assert.equal(
    (
      await get(
        "/api/platform/comments?postId=not-found&view=context&commentId=nope"
      )
    ).status,
    404
  );
  const missing = await (
    await get("/api/platform/share-preview?kind=post&id=not-found")
  ).json();
  assert.equal(missing.description, hidden.description);
});
