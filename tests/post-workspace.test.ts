import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import {
  createPortalActor,
  assertPortalTestDatabase,
  seedPortal
} from "./seed-portal";
import { PortalError, portalCommand } from "../lib/platform/portal";
import { loginAccount } from "../lib/platform/accounts";
import { communityCommand } from "../lib/platform/community";
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
      payload: {
        content: "Publication fixture",
        topics: ["community"],
        replyAudience: "VIEWERS"
      }
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

test("reply modes survive save, list, a new session, exact retries, conflicts and publish-once with actual reply enforcement", async () => {
  const f = await seedPortal(db),
    a = f.memberA;
  const secondToken = await loginAccount(
    db,
    a.email,
    a.password,
    "draft-resume"
  );
  for (const replyAudience of ["VIEWERS", "CHURCH_MEMBERS"] as const) {
    const id = randomUUID();
    const payload = privateDraftPayload({
      content: "  Reply permission recovery\r\n  ",
      audience: "PUBLIC",
      audienceChurchId: f.churchA.id,
      replyAudience
    });
    const save = mutation("save-draft", { id, expectedVersion: 0, payload });
    const receipt = await command(db, a.token, save);
    assert.deepEqual(await command(db, secondToken, save), receipt);
    await denied(
      command(db, a.token, {
        ...save,
        payload: {
          ...payload,
          replyAudience:
            replyAudience === "VIEWERS" ? "CHURCH_MEMBERS" : "VIEWERS"
        }
      }),
      409
    );
    const resumed = await read(db, secondToken, { view: "draft", id });
    assert.ok("draft" in resumed && resumed.draft);
    assert.equal(resumed.draft.version, 1);
    assert.deepEqual(resumed.draft.payload, payload);
    const library = await read(db, secondToken, { view: "drafts" });
    assert.ok("items" in library);
    assert.deepEqual(
      library.items.find((row) => row.id === id),
      resumed.draft
    );
    const updated = { ...payload, content: "Recovered and edited post" };
    const saved = await command(
      db,
      secondToken,
      mutation("save-draft", {
        id,
        expectedVersion: resumed.draft.version,
        payload: updated
      })
    );
    await denied(
      command(
        db,
        a.token,
        mutation("save-draft", {
          id,
          expectedVersion: 1,
          payload
        })
      ),
      409
    );
    // A delayed successful retry returns its old receipt without reverting newer work.
    assert.deepEqual(await command(db, a.token, save), receipt);
    const latest = await read(db, a.token, { view: "draft", id });
    assert.ok("draft" in latest && latest.draft);
    assert.deepEqual(latest.draft.payload, updated);
    assert.equal(latest.draft.version, saved.version);
    const publish = mutation("publish-draft", {
      id,
      expectedVersion: saved.version
    });
    const [first, retry] = await Promise.all([
      command(db, secondToken, publish),
      command(db, a.token, publish)
    ]);
    assert.deepEqual(first, retry);
    const post = await db.platformPost.findUniqueOrThrow({
      where: { id: first.postId }
    });
    assert.equal(post.replyAudience, replyAudience);
    assert.equal(post.audience, "PUBLIC");
    assert.equal(
      await db.platformPost.count({
        where: { authorId: a.id, replyAudience, content: updated.content }
      }),
      1
    );
    await communityCommand(db, f.coordinator.token, "comment", {
      postId: post.id,
      content: "Approved member reply"
    });
    const outsiderReply = communityCommand(db, f.memberB.token, "comment", {
      postId: post.id,
      content: "Outsider reply"
    });
    if (replyAudience === "CHURCH_MEMBERS") await denied(outsiderReply, 403);
    else await outsiderReply;
    assert.equal(
      await db.platformPostComment.count({ where: { postId: post.id } }),
      replyAudience === "VIEWERS" ? 2 : 1
    );
  }
});

test("legacy snapshots remain unresolved and unchanged on reads/retries until an explicit versioned choice is saved", async () => {
  const f = await seedPortal(db),
    a = f.memberA;
  for (const audienceChurchId of [null, f.churchA.id]) {
    const id = randomUUID();
    const oldPayload = {
      content: "  Legacy exact recovery\r\n ",
      audienceChurchId
    };
    const oldSave = mutation("save-draft", {
      id,
      expectedVersion: 0,
      payload: oldPayload
    });
    const originalReceipt = await command(db, a.token, oldSave);
    // Reproduce the pre-upgrade stored JSON, retaining its original request fingerprint.
    await db.privatePostDraft.update({
      where: { ownerId_id: { ownerId: a.id, id } },
      data: { payload: oldPayload }
    });
    const before = await db.privatePostDraft.findUniqueOrThrow({
      where: { ownerId_id: { ownerId: a.id, id } }
    });
    for (const view of ["draft", "drafts"]) {
      const result = await read(db, a.token, { view, id });
      const draft =
        "draft" in result
          ? result.draft
          : "items" in result
            ? result.items.find((row) => row.id === id)
            : null;
      assert.ok(draft && "payload" in draft);
      assert.equal(
        (draft.payload as { replyAudience: unknown }).replyAudience,
        null
      );
    }
    assert.deepEqual(await command(db, a.token, oldSave), originalReceipt);
    await denied(
      command(db, a.token, {
        ...oldSave,
        payload: { ...oldPayload, replyAudience: null }
      }),
      409
    );
    const publish = mutation("publish-draft", { id, expectedVersion: 1 });
    await assert.rejects(
      command(db, a.token, publish),
      (e: unknown) =>
        e instanceof PortalError &&
        e.status === 400 &&
        /Choose who may reply/.test(e.message)
    );
    assert.deepEqual(
      await db.privatePostDraft.findUniqueOrThrow({
        where: { ownerId_id: { ownerId: a.id, id } }
      }),
      before
    );
    assert.equal(
      await db.postWorkspaceOperation.count({
        where: { ownerId: a.id, key: String(publish.mutationId) }
      }),
      0
    );
    const replyAudience = audienceChurchId ? "CHURCH_MEMBERS" : "VIEWERS";
    await command(
      db,
      a.token,
      mutation("save-draft", {
        id,
        expectedVersion: 1,
        payload: { ...oldPayload, replyAudience }
      })
    );
    await denied(command(db, a.token, publish), 409);
    const published = await command(
      db,
      a.token,
      mutation("publish-draft", {
        id,
        expectedVersion: 2
      })
    );
    assert.equal(
      (
        await db.platformPost.findUniqueOrThrow({
          where: { id: published.postId }
        })
      ).replyAudience,
      replyAudience
    );
  }
});

test("unresolved and incomplete reply settings never fall through to the canonical public default", async () => {
  const a = await createPortalActor(db, "replybad");
  for (const invalid of ["", "EVERYONE", false, 1, {}, []])
    assert.throws(
      () => privateDraftPayload({ replyAudience: invalid }),
      (e: unknown) => e instanceof PortalError && e.status === 400
    );
  for (const replyAudience of [null, "CHURCH_MEMBERS"]) {
    const id = randomUUID(),
      payload = { content: "Incomplete reply selection", replyAudience };
    await command(
      db,
      a.token,
      mutation("save-draft", { id, expectedVersion: 0, payload })
    );
    await denied(
      command(
        db,
        a.token,
        mutation("publish-draft", { id, expectedVersion: 1 })
      ),
      400
    );
    const row = await db.privatePostDraft.findUniqueOrThrow({
      where: { ownerId_id: { ownerId: a.id, id } }
    });
    assert.equal(row.version, 1);
    assert.equal(row.deletedAt, null);
    assert.equal(
      (row.payload as { replyAudience: unknown }).replyAudience,
      replyAudience
    );
  }
  assert.equal(await db.platformPost.count({ where: { authorId: a.id } }), 0);
});

test("publication rechecks revoked membership and church publishing grants for both reply modes without consuming drafts", async () => {
  const f = await seedPortal(db),
    a = f.memberA;
  await portalCommand(db, f.operator.token, {
    operation: "grant",
    churchId: f.churchA.id,
    userId: a.id,
    capability: "PUBLISH_CHURCH_POSTS",
    expectedVersion: 0
  });
  for (const revocation of ["grant", "membership"]) {
    const drafts = [];
    for (const replyAudience of ["VIEWERS", "CHURCH_MEMBERS"]) {
      const id = randomUUID(),
        payload = {
          content: "Revoked church publication",
          audience: "PUBLIC",
          audienceChurchId: f.churchA.id,
          authorChurchId: revocation === "grant" ? f.churchA.id : null,
          replyAudience
        };
      await command(
        db,
        a.token,
        mutation("save-draft", { id, expectedVersion: 0, payload })
      );
      drafts.push({ id, payload });
    }
    if (revocation === "grant")
      await db.churchCapabilityGrant.updateMany({
        where: {
          userId: a.id,
          churchId: f.churchA.id,
          capability: "PUBLISH_CHURCH_POSTS"
        },
        data: { revokedAt: new Date() }
      });
    else
      await db.churchConnection.updateMany({
        where: { userId: a.id, churchId: f.churchA.id },
        data: { state: "REMOVED" }
      });
    for (const { id, payload } of drafts) {
      const publish = mutation("publish-draft", { id, expectedVersion: 1 });
      await denied(command(db, a.token, publish), 403);
      await denied(command(db, a.token, publish), 403);
      const row = await db.privatePostDraft.findUniqueOrThrow({
        where: { ownerId_id: { ownerId: a.id, id } }
      });
      assert.equal(row.version, 1);
      assert.equal(row.deletedAt, null);
      assert.deepEqual(row.payload, privateDraftPayload(payload));
      assert.equal(
        await db.postWorkspaceOperation.count({
          where: { ownerId: a.id, key: String(publish.mutationId) }
        }),
        0
      );
    }
  }
  assert.equal(await db.platformPost.count({ where: { authorId: a.id } }), 0);
});
