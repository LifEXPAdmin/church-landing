import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import {
  createPortalActor,
  assertPortalTestDatabase,
  seedPortal
} from "./seed-portal";
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
    payload: {
      content: `Private draft ${randomUUID()}`,
      replyAudience: "VIEWERS"
    }
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

test("actual HTTPS preserves both reply modes through retry/conflict/resume and denies revoked church publication", async () => {
  const f = await seedPortal(db),
    a = f.memberA;
  const post = (value: Record<string, unknown>) =>
    fetch(origin + "/api/platform/post-workspace", {
      method: "POST",
      headers: {
        origin,
        cookie: `church_platform_session=${a.token}`,
        "content-type": "application/json"
      },
      body: JSON.stringify(value)
    });
  const send = (operation: string, fields: Record<string, unknown>) => ({
    operation,
    mutationId: randomUUID(),
    ...fields
  });
  for (const replyAudience of ["VIEWERS", "CHURCH_MEMBERS"]) {
    const id = randomUUID(),
      payload = {
        content: "HTTPS reply snapshot",
        audience: "PUBLIC",
        audienceChurchId: f.churchA.id,
        replyAudience
      };
    const save = send("save-draft", { id, expectedVersion: 0, payload });
    const first = await post(save);
    assert.equal(first.status, 200);
    const receipt = await first.json();
    assert.deepEqual(await (await post(save)).json(), receipt);
    assert.equal(
      (await post({ ...save, payload: { ...payload, replyAudience: null } }))
        .status,
      409
    );
    const resumed = await (
      await get(`/api/platform/post-workspace?view=draft&id=${id}`, a.token)
    ).json();
    assert.equal(resumed.draft.payload.replyAudience, replyAudience);
    assert.equal(resumed.draft.version, 1);
    assert.equal(
      (await post(send("save-draft", { id, expectedVersion: 0, payload })))
        .status,
      409
    );
    const publish = send("publish-draft", { id, expectedVersion: 1 });
    const published = await post(publish);
    assert.equal(published.status, 200);
    const result = await published.json();
    assert.deepEqual(await (await post(publish)).json(), result);
    assert.equal(
      (
        await db.platformPost.findUniqueOrThrow({
          where: { id: result.postId }
        })
      ).replyAudience,
      replyAudience
    );
    // A separate draft loses publication access while remaining recoverable.
    const deniedId = randomUUID();
    assert.equal(
      (
        await post(
          send("save-draft", { id: deniedId, expectedVersion: 0, payload })
        )
      ).status,
      200
    );
    await db.churchConnection.updateMany({
      where: { userId: a.id, churchId: f.churchA.id },
      data: { state: "REMOVED" }
    });
    assert.equal(
      (await post(send("publish-draft", { id: deniedId, expectedVersion: 1 })))
        .status,
      403
    );
    const retained = await (
      await get(
        `/api/platform/post-workspace?view=draft&id=${deniedId}`,
        a.token
      )
    ).json();
    assert.equal(retained.draft.payload.replyAudience, replyAudience);
    assert.equal(retained.draft.version, 1);
    await db.churchConnection.updateMany({
      where: { userId: a.id, churchId: f.churchA.id },
      data: { state: "APPROVED" }
    });
  }
  assert.equal(await db.platformPost.count({ where: { authorId: a.id } }), 2);
});

test("actual HTTPS legacy draft cannot publish until reply permissions are explicitly saved", async () => {
  const a = await createPortalActor(db, "legacyhttp"),
    id = randomUUID();
  await db.privatePostDraft.create({
    data: { ownerId: a.id, id, payload: { content: "Old HTTPS draft" } }
  });
  const loaded = await (
    await get(`/api/platform/post-workspace?view=draft&id=${id}`, a.token)
  ).json();
  assert.equal(loaded.draft.payload.replyAudience, null);
  const post = (value: Record<string, unknown>) =>
    fetch(origin + "/api/platform/post-workspace", {
      method: "POST",
      headers: {
        origin,
        cookie: `church_platform_session=${a.token}`,
        "content-type": "application/json"
      },
      body: JSON.stringify(value)
    });
  const publish = {
    operation: "publish-draft",
    mutationId: randomUUID(),
    id,
    expectedVersion: 1
  };
  const denied = await post(publish);
  assert.equal(denied.status, 400);
  assert.match((await denied.json()).message, /Choose who may reply/);
  assert.equal(await db.platformPost.count({ where: { authorId: a.id } }), 0);
  assert.equal(
    (
      await post({
        operation: "save-draft",
        mutationId: randomUUID(),
        id,
        expectedVersion: 1,
        payload: { ...loaded.draft.payload, replyAudience: "VIEWERS" }
      })
    ).status,
    200
  );
  assert.equal((await post(publish)).status, 409);
  assert.equal(
    (await post({ ...publish, mutationId: randomUUID(), expectedVersion: 2 }))
      .status,
    200
  );
  assert.equal(
    await db.platformPost.count({
      where: { authorId: a.id, replyAudience: "VIEWERS" }
    }),
    1
  );
});
