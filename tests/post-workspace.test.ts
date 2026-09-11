import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { createPortalActor, assertPortalTestDatabase } from "./seed-portal";
import { PortalError } from "../lib/platform/portal";
import {
  privateDraftPayload,
  postWorkspaceCommand as command,
  readPostWorkspace as read
} from "../lib/platform/post-workspace";
import { handlePostWorkspaceRequest } from "../lib/platform/post-workspace-boundary";
import {
  prepareAccountExport,
  downloadAccountExport
} from "../lib/platform/account-export";
import { allowWorkspaceAttempt } from "../lib/platform/account-limits";
const db = new PrismaClient();
before(() => assertPortalTestDatabase(db));
after(() => db.$disconnect());
const mutation = (operation: string, fields: Record<string, unknown> = {}) => ({
  operation,
  mutationId: randomUUID(),
  ...fields
});
const denied = (work: Promise<unknown>, status: number) =>
  assert.rejects(
    work,
    (e: unknown) => e instanceof PortalError && e.status === status
  );

test("drafts preserve exact incomplete text, reject unsupported/truncated fields, isolate matching IDs by owner", async () => {
  const a = await createPortalActor(db, "drafta"),
    b = await createPortalActor(db, "draftb");
  const id = randomUUID(),
    payload = { content: "  unfinished\r\n  ", scripture: " " };
  await command(
    db,
    a.token,
    mutation("save-draft", { id, expectedVersion: 0, payload })
  );
  assert.deepEqual(await read(db, b.token, { view: "draft", id }), {
    draft: null
  });
  await command(
    db,
    b.token,
    mutation("save-draft", {
      id,
      expectedVersion: 0,
      payload: { content: "Other owner" }
    })
  );
  assert.ok(
    JSON.stringify(await read(db, a.token, { view: "draft", id })).includes(
      "unfinished"
    )
  );
  assert.ok(
    !JSON.stringify(await read(db, a.token, { view: "drafts" })).includes(
      "Other owner"
    )
  );
  assert.equal(privateDraftPayload(payload).content, payload.content);
  assert.throws(() => privateDraftPayload({ content: "x".repeat(20001) }));
  assert.throws(() => privateDraftPayload({ linkReceipt: "secret" }));
  await denied(
    command(
      db,
      a.token,
      mutation("save-draft", { id, expectedVersion: 1, payload, ownerId: b.id })
    ),
    400
  );
});
test("concurrent saves admit one version, retries do not increment, changed retry payload fails, discard prevents resurrection", async () => {
  const a = await createPortalActor(db, "conflict"),
    id = randomUUID();
  const initial = mutation("save-draft", {
    id,
    expectedVersion: 0,
    payload: { content: "Original" }
  });
  assert.deepEqual(
    await command(db, a.token, initial),
    await command(db, a.token, initial)
  );
  await denied(
    command(db, a.token, { ...initial, payload: { content: "Changed" } }),
    409
  );
  const race = await Promise.allSettled(
    ["Tab one", "Tab two"].map((content) =>
      command(
        db,
        a.token,
        mutation("save-draft", { id, expectedVersion: 1, payload: { content } })
      )
    )
  );
  assert.equal(race.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(
    race.filter((r) => r.status === "rejected" && r.reason.status === 409)
      .length,
    1
  );
  const discard = mutation("delete-draft", { id, expectedVersion: 2 });
  assert.deepEqual(
    await command(db, a.token, discard),
    await command(db, a.token, discard)
  );
  await denied(
    command(
      db,
      a.token,
      mutation("save-draft", {
        id,
        expectedVersion: 3,
        payload: { content: "Late save" }
      })
    ),
    409
  );
  const tombstone = await db.privatePostDraft.findUniqueOrThrow({
    where: { ownerId_id: { ownerId: a.id, id } }
  });
  assert.equal(tombstone.payload, null);
  assert.deepEqual(await read(db, a.token, { view: "draft", id }), {
    draft: null
  });
});
test("draft publish is atomic, validated, exactly once across concurrent retries, and independent of a caller's post request key", async () => {
  const a = await createPortalActor(db, "publish"),
    id = randomUUID();
  await command(
    db,
    a.token,
    mutation("save-draft", {
      id,
      expectedVersion: 0,
      payload: { content: " " }
    })
  );
  await denied(
    command(db, a.token, mutation("publish-draft", { id, expectedVersion: 1 })),
    400
  );
  assert.equal(await db.platformPost.count({ where: { authorId: a.id } }), 0);
  await command(
    db,
    a.token,
    mutation("save-draft", {
      id,
      expectedVersion: 1,
      payload: { content: "Publication fixture", topics: ["community"] }
    })
  );
  await db.platformPost.create({
    data: {
      authorId: a.id,
      requestKey: `draft-${id}`,
      content: "Existing unrelated post"
    }
  });
  const publish = mutation("publish-draft", { id, expectedVersion: 2 });
  const [first, retry] = await Promise.all([
    command(db, a.token, publish),
    command(db, a.token, publish)
  ]);
  assert.deepEqual(first, retry);
  assert.ok(first.postId);
  assert.equal(
    (await db.platformPost.findUniqueOrThrow({ where: { id: first.postId } }))
      .content,
    "Publication fixture"
  );
  assert.equal(await db.platformPost.count({ where: { authorId: a.id } }), 2);
  assert.deepEqual(await read(db, a.token, { view: "drafts" }), {
    items: [],
    nextCursor: null
  });
});
test("collection ownership, moves, stale rename, deletion to unfiled and unavailable saved projections", async () => {
  const a = await createPortalActor(db, "savea"),
    b = await createPortalActor(db, "saveb"),
    id = randomUUID();
  await command(
    db,
    a.token,
    mutation("create-collection", {
      id,
      name: "Private reading",
      expectedVersion: 0
    })
  );
  const post = await db.platformPost.create({
    data: {
      authorId: b.id,
      content: "Source secret marker",
      publishedAt: new Date()
    }
  });
  await denied(
    command(
      db,
      b.token,
      mutation("save-item", {
        postId: post.id,
        collectionId: id,
        expectedVersion: 0
      })
    ),
    404
  );
  const save = mutation("save-item", {
    postId: post.id,
    collectionId: id,
    expectedVersion: 0
  });
  const item = await command(db, a.token, save);
  assert.deepEqual(await command(db, a.token, save), item);
  await denied(
    command(
      db,
      b.token,
      mutation("move-item", { id: item.id, expectedVersion: item.version })
    ),
    404
  );
  await command(
    db,
    a.token,
    mutation("rename-collection", { id, name: "Renamed", expectedVersion: 1 })
  );
  await denied(
    command(
      db,
      a.token,
      mutation("rename-collection", { id, name: "Stale", expectedVersion: 1 })
    ),
    409
  );
  await db.platformPost.update({
    where: { id: post.id },
    data: { status: "WITHDRAWN", withdrawnAt: new Date() }
  });
  const hidden = JSON.stringify(await read(db, a.token, { view: "saved" }));
  assert.ok(hidden.includes('"available":false'));
  assert.ok(!hidden.includes(post.id));
  assert.ok(!hidden.includes("Source secret marker"));
  await command(
    db,
    a.token,
    mutation("delete-collection", { id, expectedVersion: 2 })
  );
  const unfiled = await db.savedPostItem.findUniqueOrThrow({
    where: { id: item.id }
  });
  assert.equal(unfiled.collectionId, null);
  assert.equal(unfiled.version, 2);
  await db.platformPost.delete({ where: { id: post.id } });
  assert.equal(
    (await db.savedPostItem.findUniqueOrThrow({ where: { id: item.id } }))
      .postId,
    null
  );
  await command(
    db,
    a.token,
    mutation("remove-item", { id: item.id, expectedVersion: 2 })
  );
});
test("draft pages are bounded and account export includes only active owner workspace fields", async () => {
  const a = await createPortalActor(db, "exportw");
  for (let i = 0; i < 22; i++)
    await command(
      db,
      a.token,
      mutation("save-draft", {
        id: `page-${String(i).padStart(2, "0")}`,
        expectedVersion: 0,
        payload: { content: `Private page ${i}` }
      })
    );
  const first = await read(db, a.token, { view: "drafts" });
  assert.ok("items" in first && "nextCursor" in first);
  assert.equal(first.items.length, 20);
  const next = await read(db, a.token, {
    view: "drafts",
    after: first.nextCursor
  });
  assert.ok("items" in next);
  assert.equal(next.items.length, 2);
  const secret = process.env.AUTH_RATE_LIMIT_SECRET!;
  const proof = await prepareAccountExport(db, a.token, a.password, secret);
  const exported = JSON.parse(
    await downloadAccountExport(db, a.token, proof.authorization, secret)
  );
  assert.equal(exported.privatePostDrafts.length, 22);
  assert.ok(!JSON.stringify(exported).includes("publicationKey"));
  assert.ok(!JSON.stringify(exported).includes("fingerprint"));
});
test("HTTP rejects guests, cross-origin and forged owners, sets private caching, and revocation denies later reads", async () => {
  const a = await createPortalActor(db, "httpw"),
    origin = process.env.ACCOUNT_ORIGIN!;
  const get = (token = "") =>
    handlePostWorkspaceRequest(
      db,
      new Request(`${origin}/api/platform/post-workspace`, {
        headers: { cookie: `church_platform_session=${token}` }
      })
    );
  assert.equal((await get()).status, 401);
  const response = await get(a.token);
  assert.equal(response.status, 200);
  assert.match(response.headers.get("cache-control")!, /no-store/);
  const post = (originHeader: string, extra = {}) =>
    handlePostWorkspaceRequest(
      db,
      new Request(`${origin}/api/platform/post-workspace`, {
        method: "POST",
        headers: {
          origin: originHeader,
          cookie: `church_platform_session=${a.token}`,
          "content-type": "application/json"
        },
        body: JSON.stringify(
          mutation("save-draft", {
            id: randomUUID(),
            expectedVersion: 0,
            payload: {},
            ...extra
          })
        )
      })
    );
  assert.equal((await post("https://unrelated.example")).status, 403);
  assert.equal((await post(origin, { ownerId: "forged" })).status, 400);
  assert.equal((await post(origin)).status, 200);
  await db.platformUser.update({
    where: { id: a.id },
    data: { deactivatedAt: new Date() }
  });
  assert.equal((await get(a.token)).status, 401);
});
test("autosave has a bounded per-owner budget independent of password limits and other owners", async () => {
  const secret = randomUUID();
  for (let i = 0; i < 240; i++)
    assert.equal(
      await allowWorkspaceAttempt(db, secret, "fictional-owner"),
      true
    );
  assert.equal(
    await allowWorkspaceAttempt(db, secret, "fictional-owner"),
    false
  );
  assert.equal(
    await allowWorkspaceAttempt(db, secret, "fictional-other"),
    true
  );
});
test("database ownership constraint rejects a cross-owner saved collection reference", async () => {
  const a = await createPortalActor(db, "fka"),
    b = await createPortalActor(db, "fkb"),
    id = randomUUID();
  await command(
    db,
    a.token,
    mutation("create-collection", {
      id,
      expectedVersion: 0,
      name: "Owned collection"
    })
  );
  await assert.rejects(
    db.savedPostItem.create({ data: { ownerId: b.id, collectionId: id } })
  );
  assert.equal(await db.savedPostItem.count({ where: { ownerId: b.id } }), 0);
});
