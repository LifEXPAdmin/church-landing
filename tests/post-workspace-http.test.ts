import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { createPortalActor, assertPortalTestDatabase } from "./seed-portal";
import { publicReleaseId } from "../lib/platform/install-policy";
const db = new PrismaClient(),
  origin = process.env.ACCOUNT_ORIGIN!;
assert.match(origin, /^https:\/\/127\.0\.0\.1:\d+$/);
before(() => assertPortalTestDatabase(db));
after(() => db.$disconnect());
const get = (path: string, token = "") =>
  fetch(origin + path, {
    headers: { cookie: `church_platform_session=${token}` }
  });
test("actual HTTPS workspace routes retain private drafts, enforce CSRF and ownership, and publish one post", async () => {
  const a = await createPortalActor(db, "httpsw"),
    b = await createPortalActor(db, "httpsb"),
    id = randomUUID();
  assert.equal((await get("/api/platform/post-workspace")).status, 401);
  const body = {
    operation: "save-draft",
    mutationId: randomUUID(),
    id,
    expectedVersion: 0,
    payload: { content: `Private draft ${randomUUID()}` }
  };
  const post = (value: Record<string, unknown>, originHeader = origin) =>
    fetch(origin + "/api/platform/post-workspace", {
      method: "POST",
      headers: {
        origin: originHeader,
        cookie: `church_platform_session=${a.token}`,
        "content-type": "application/json"
      },
      body: JSON.stringify(value)
    });
  assert.equal((await post(body, "https://unrelated.example")).status, 403);
  const saved = await post(body);
  assert.equal(saved.status, 200);
  assert.match(saved.headers.get("cache-control")!, /no-store/);
  assert.equal((await post(body)).status, 200);
  const own = await get(
    `/api/platform/post-workspace?view=draft&id=${id}`,
    a.token
  );
  assert.equal((await own.json()).draft.payload.content, body.payload.content);
  assert.deepEqual(
    await (
      await get(`/api/platform/post-workspace?view=draft&id=${id}`, b.token)
    ).json(),
    { draft: null }
  );
  assert.ok(
    !(await (await get("/platform")).text()).includes(body.payload.content)
  );
  const publish = {
    operation: "publish-draft",
    mutationId: randomUUID(),
    id,
    expectedVersion: 1
  };
  const published = await post(publish);
  assert.equal(published.status, 200);
  const receipt = await published.json();
  assert.deepEqual(await (await post(publish)).json(), receipt);
  assert.equal(
    await db.platformPost.count({
      where: { authorId: a.id, content: body.payload.content }
    }),
    1
  );
  assert.equal((await get(`/platform/posts/${receipt.postId}`)).status, 200);
});
test("actual HTTPS search validates query and categories, uses private caching, and release identity is public-only", async () => {
  const a = await createPortalActor(db, "searchhttp");
  const response = await get(
    `/api/platform/search?kind=people&q=${a.username}`
  );
  assert.equal(response.status, 200);
  assert.match(response.headers.get("cache-control")!, /no-store/);
  const text = await response.text();
  assert.ok(text.includes(a.username));
  assert.ok(!text.includes(a.email));
  assert.equal(
    (await get("/api/platform/search?kind=unknown&q=church")).status,
    400
  );
  assert.equal(
    (await get("/api/platform/search?q=" + "a".repeat(201))).status,
    400
  );
  const release = await get("/api/platform/release");
  assert.equal(release.status, 200);
  assert.match(release.headers.get("cache-control")!, /no-store/);
  const expected = publicReleaseId(process.env.VERCEL_GIT_COMMIT_SHA);
  assert.deepEqual(await release.json(), { release: expected });
  if (expected)
    assert.ok(
      (await (await get("/platform")).text()).includes(
        `data-release="${expected}"`
      )
    );
});
