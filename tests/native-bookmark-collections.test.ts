import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { assertPortalTestDatabase, createPortalActor } from "./seed-portal";
import { sessionCookieFixtureName } from "../scripts/session-cookie-fixture.mjs";
import { accountConfig } from "../lib/platform/account-config";
import { AccountSessionOwnerError } from "../lib/platform/account-sessions";
import { hashSessionToken } from "../lib/platform/auth";
import { apiFailure, decodeApiResponse } from "../lib/platform/api-contracts";
import { handleNativeBookmarkRequest } from "../lib/platform/native-bookmark-boundary";
import { handlePostWorkspaceRequest } from "../lib/platform/post-workspace-boundary";
import { postWorkspaceCommand } from "../lib/platform/post-workspace";

const db = new PrismaClient();
before(() => assertPortalTestDatabase(db));
after(() => db.$disconnect());

type Actor = { id: string; token: string };
const mutation = <T extends Record<string, unknown>>(
  operation: string,
  fields: T
) => ({
  operation,
  mutationId: randomUUID(),
  ...fields
});
const create = (
  name = "Fictional private collection",
  id: string = randomUUID()
) => mutation("create-collection", { id, expectedVersion: 0, name });
const encoded = (input: Record<string, unknown> | string) =>
  typeof input === "string" ? input : JSON.stringify(input);

async function native(
  actor: Actor,
  input?: Record<string, unknown> | string,
  options: {
    headers?: Record<string, string>;
    resource?: "bookmarks" | "bookmarkCollections";
  } = {}
) {
  const resource = options.resource ?? "bookmarkCollections";
  const response = await handleNativeBookmarkRequest(
    db,
    new Request(
      new URL(
        resource === "bookmarks"
          ? "/api/platform/v1/bookmarks"
          : "/api/platform/v1/bookmark-collections",
        process.env.ACCOUNT_ORIGIN!
      ),
      {
        method: input === undefined ? "GET" : "POST",
        headers: {
          Authorization: "Bearer " + actor.token,
          "X-Expected-Account": actor.id,
          ...(input === undefined
            ? {}
            : { "Content-Type": "application/json" }),
          ...options.headers
        },
        ...(input === undefined ? {} : { body: encoded(input) })
      }
    ),
    resource
  );
  assert.match(response.headers.get("cache-control")!, /private.*no-store/);
  assert.equal(response.headers.get("cdn-cache-control"), "no-store");
  assert.equal(response.headers.get("vercel-cdn-cache-control"), "no-store");
  assert.equal(response.headers.get("set-cookie"), null);
  assert.equal(response.headers.get("location"), null);
  assert.equal(response.headers.get("x-api-version"), "1");
  for (const header of [
    "authorization",
    "cookie",
    "x-expected-account",
    "x-api-version"
  ])
    assert.ok(
      response.headers.get("vary")!.toLowerCase().split(/,\s*/).includes(header)
    );
  return { response, value: await response.json() };
}
function ok(
  result: Awaited<ReturnType<typeof native>>,
  owner: string,
  operation:
    | "bookmarkCollectionCommand"
    | "bookmarkCommand" = "bookmarkCollectionCommand"
) {
  assert.equal(result.response.status, 200, JSON.stringify(result.value));
  return decodeApiResponse(operation, result.value, owner).data;
}
function denied(
  result: Awaited<ReturnType<typeof native>>,
  status: number,
  code: string
) {
  assert.equal(result.response.status, status, JSON.stringify(result.value));
  assert.equal(apiFailure.parse(result.value).error.code, code);
  assert.equal(result.value.data, undefined);
}
async function web(actor: Actor, bytes: string) {
  const response = await handlePostWorkspaceRequest(
    db,
    new Request(
      new URL("/api/platform/post-workspace", process.env.ACCOUNT_ORIGIN!),
      {
        method: "POST",
        headers: {
          Origin: process.env.ACCOUNT_ORIGIN!,
          Cookie: `${sessionCookieFixtureName()}=${actor.token}`,
          "X-Expected-Account": actor.id,
          "Content-Type": "application/json"
        },
        body: bytes
      }
    )
  );
  assert.match(response.headers.get("cache-control")!, /private.*no-store/);
  return { response, value: await response.json() };
}
function webOk(result: Awaited<ReturnType<typeof web>>) {
  assert.equal(result.response.status, 200, JSON.stringify(result.value));
  return result.value;
}
const row = (actor: Actor, id: string) =>
  db.savedPostCollection.findUniqueOrThrow({
    where: { ownerId_id: { ownerId: actor.id, id } }
  });

test("collection create, rename and delete retain original names and exact receipts across native, website and canonical retries", async () => {
  const actor = await createPortalActor(db, "ncolretry");
  const input = Object.freeze(create("  Fictional original name  "));
  const bytes = JSON.stringify(input);
  const created = ok(await native(actor, bytes), actor.id);
  assert.deepEqual(await postWorkspaceCommand(db, actor.token, input), created);
  assert.deepEqual(webOk(await web(actor, bytes)), created);
  const rateKey = createHmac("sha256", accountConfig().rateSecret)
    .update("post-workspace:" + actor.id)
    .digest("hex");
  assert.equal(
    (await db.platformAuthLimit.findUniqueOrThrow({ where: { key: rateKey } }))
      .hits,
    2
  );
  assert.deepEqual(ok(await native(actor, bytes), actor.id), created);
  assert.equal(JSON.stringify(input), bytes);
  assert.equal(created.version, 1);
  assert.equal((await row(actor, created.id)).name, "Fictional original name");
  denied(
    await native(actor, { ...input, name: "Fictional original name" }),
    409,
    "conflict"
  );
  assert.equal(
    (await web(actor, JSON.stringify({ ...input, name: "Different work" })))
      .response.status,
    409
  );

  const rename = Object.freeze(
    mutation("rename-collection", {
      id: created.id,
      expectedVersion: created.version,
      name: "  Fictional renamed choice  "
    })
  );
  const renameBytes = JSON.stringify(rename);
  const renamed = webOk(await web(actor, renameBytes));
  assert.deepEqual(ok(await native(actor, renameBytes), actor.id), renamed);
  assert.deepEqual(
    await postWorkspaceCommand(db, actor.token, rename),
    renamed
  );
  assert.deepEqual(webOk(await web(actor, renameBytes)), renamed);
  assert.equal(JSON.stringify(rename), renameBytes);
  assert.equal(renamed.version, 2);
  assert.equal((await row(actor, created.id)).name, "Fictional renamed choice");
  denied(
    await native(actor, { ...rename, name: "Fictional renamed choice" }),
    409,
    "conflict"
  );
  assert.deepEqual(ok(await native(actor, bytes), actor.id), created);
  assert.equal((await row(actor, created.id)).version, renamed.version);
  assert.equal((await row(actor, created.id)).name, "Fictional renamed choice");

  const remove = Object.freeze(
    mutation("delete-collection", {
      id: created.id,
      expectedVersion: renamed.version
    })
  );
  const removeBytes = JSON.stringify(remove);
  const removed = ok(await native(actor, removeBytes), actor.id);
  assert.equal(removed.version, 3);
  const tombstone = await row(actor, created.id);
  assert.ok(tombstone.deletedAt);
  assert.equal(tombstone.name, "");
  assert.deepEqual(ok(await native(actor, removeBytes), actor.id), removed);
  assert.deepEqual(webOk(await web(actor, removeBytes)), removed);
  assert.deepEqual(
    await postWorkspaceCommand(db, actor.token, remove),
    removed
  );
  denied(
    await native(actor, { ...remove, expectedVersion: removed.version }),
    409,
    "conflict"
  );
  assert.equal(JSON.stringify(remove), removeBytes);
  assert.deepEqual(await row(actor, created.id), tombstone);
  assert.equal(
    await db.postWorkspaceOperation.count({ where: { ownerId: actor.id } }),
    3
  );
});

test("collection commands serialize stale versions and remain bound to the original account before writes and receipt replay", async () => {
  const owner = await createPortalActor(db, "ncolowner");
  const other = await createPortalActor(db, "ncolother");
  const id = randomUUID();
  const original = create("Fictional owner collection", id);
  const created = ok(await native(owner, original), owner.id);
  ok(await native(other, create("Fictional other collection", id)), other.id);
  const otherBefore = await row(other, id);
  const rename = mutation("rename-collection", {
    id,
    expectedVersion: created.version,
    name: "Fictional original account choice"
  });
  denied(
    await native(other, rename, {
      headers: { "X-Expected-Account": owner.id }
    }),
    401,
    "account_changed"
  );
  denied(
    await native(owner, rename, {
      headers: { "X-Expected-Account": other.id }
    }),
    401,
    "account_changed"
  );
  await assert.rejects(
    postWorkspaceCommand(db, other.token, rename, owner.id),
    AccountSessionOwnerError
  );
  assert.equal((await row(owner, id)).version, created.version);
  assert.deepEqual(await row(other, id), otherBefore);

  const contenders = [
    rename,
    {
      ...rename,
      mutationId: randomUUID(),
      name: "Fictional concurrent choice"
    }
  ];
  const results = await Promise.all(
    contenders.map((input) => native(owner, input))
  );
  const won = results.findIndex((result) => result.response.status === 200);
  assert.notEqual(won, -1);
  assert.equal(
    results.filter((result) => result.response.status === 200).length,
    1
  );
  denied(results[1 - won], 409, "conflict");
  const receipt = ok(results[won], owner.id);
  const current = await row(owner, id);
  assert.equal(current.version, created.version + 1);
  assert.equal(current.name, contenders[won].name);
  assert.deepEqual(ok(await native(owner, original), owner.id), created);
  assert.deepEqual(ok(await native(owner, contenders[won]), owner.id), receipt);
  denied(
    await native(other, contenders[won], {
      headers: { "X-Expected-Account": owner.id }
    }),
    401,
    "account_changed"
  );
  await assert.rejects(
    postWorkspaceCommand(db, owner.token, contenders[won], other.id),
    AccountSessionOwnerError
  );
  assert.deepEqual(await row(other, id), otherBefore);
  assert.deepEqual(await row(owner, id), current);

  await db.platformSession.deleteMany({
    where: { tokenHash: hashSessionToken(owner.token) }
  });
  denied(await native(owner, contenders[won]), 401, "unauthenticated");
  denied(
    await native(
      owner,
      mutation("delete-collection", {
        id,
        expectedVersion: current.version
      })
    ),
    401,
    "unauthenticated"
  );
  assert.deepEqual(await row(owner, id), current);
  assert.equal(
    await db.postWorkspaceOperation.count({ where: { ownerId: owner.id } }),
    2
  );
});

test("deleting a collection unfiles only its owner's items once and delayed retries preserve later moves", async () => {
  const owner = await createPortalActor(db, "ncolitems");
  const other = await createPortalActor(db, "ncolscope");
  const original = create();
  const removedCollection = ok(await native(owner, original), owner.id);
  const destination = ok(await native(owner, create()), owner.id);
  ok(
    await native(
      other,
      create("Fictional unrelated collection", removedCollection.id)
    ),
    other.id
  );
  const post = await db.platformPost.create({
    data: {
      authorId: owner.id,
      content: "Fictional collection deletion source",
      publishedAt: new Date(Date.now() - 1000)
    }
  });
  const saved = await postWorkspaceCommand(
    db,
    owner.token,
    mutation("save-item", {
      postId: post.id,
      collectionId: removedCollection.id,
      expectedVersion: 0
    })
  );
  // An unavailable source still has an owner-scoped bookmark to unfile.
  const unavailable = await db.savedPostItem.create({
    data: {
      ownerId: owner.id,
      collectionId: removedCollection.id,
      resourceKind: "eventOccurrence",
      resourceId: "missing_" + randomUUID(),
      version: 3
    }
  });
  const unrelated = await db.savedPostItem.create({
    data: {
      ownerId: owner.id,
      resourceKind: "eventOccurrence",
      resourceId: "missing_" + randomUUID(),
      version: 7
    }
  });
  const foreign = await db.savedPostItem.create({
    data: {
      ownerId: other.id,
      collectionId: removedCollection.id,
      resourceKind: "eventOccurrence",
      resourceId: "missing_" + randomUUID(),
      version: 9
    }
  });
  const remove = mutation("delete-collection", {
    id: removedCollection.id,
    expectedVersion: removedCollection.version
  });
  const bytes = JSON.stringify(remove);
  const results = await Promise.all([
    native(owner, bytes),
    native(owner, bytes)
  ]);
  const receipt = ok(results[0], owner.id);
  assert.deepEqual(ok(results[1], owner.id), receipt);
  assert.equal(receipt.version, removedCollection.version + 1);
  for (const item of [saved, unavailable]) {
    const current = await db.savedPostItem.findUniqueOrThrow({
      where: { id: item.id }
    });
    assert.equal(current.collectionId, null);
    assert.equal(current.version, item.version + 1);
  }
  assert.deepEqual(
    await db.savedPostItem.findUniqueOrThrow({ where: { id: unrelated.id } }),
    unrelated
  );
  assert.deepEqual(
    await db.savedPostItem.findUniqueOrThrow({ where: { id: foreign.id } }),
    foreign
  );
  const moved = ok(
    await native(
      owner,
      mutation("move-item", {
        id: saved.id,
        expectedVersion: saved.version + 1,
        collectionId: destination.id
      }),
      { resource: "bookmarks" }
    ),
    owner.id,
    "bookmarkCommand"
  );
  assert.equal(moved.version, saved.version + 2);
  const itemsBeforeRetry = await db.savedPostItem.findMany({
    where: { ownerId: { in: [owner.id, other.id] } },
    orderBy: { id: "asc" }
  });
  const tombstone = await row(owner, removedCollection.id);
  assert.ok(tombstone.deletedAt);
  assert.equal(tombstone.name, "");
  assert.deepEqual(ok(await native(owner, bytes), owner.id), receipt);
  assert.deepEqual(webOk(await web(owner, bytes)), receipt);
  assert.deepEqual(
    ok(await native(owner, original), owner.id),
    removedCollection
  );
  assert.deepEqual(
    await db.savedPostItem.findMany({
      where: { ownerId: { in: [owner.id, other.id] } },
      orderBy: { id: "asc" }
    }),
    itemsBeforeRetry
  );
  assert.deepEqual(await row(owner, removedCollection.id), tombstone);
  assert.equal(
    (await db.savedPostItem.findUniqueOrThrow({ where: { id: saved.id } }))
      .collectionId,
    destination.id
  );
  const listed = await native(owner);
  assert.equal(listed.response.status, 200);
  assert.deepEqual(
    decodeApiResponse(
      "bookmarkCollections",
      listed.value,
      owner.id
    ).data.items.map((item) => item.id),
    [destination.id]
  );
  assert.equal(
    await db.postWorkspaceOperation.count({
      where: { ownerId: owner.id, key: remove.mutationId }
    }),
    1
  );
});

test("reserved unfiled collection creation is rejected below capacity and existing references remain removable", async () => {
  const actor = await createPortalActor(db, "ncolreserved");
  const input = create("Fictional reserved collection", "unfiled");
  denied(await native(actor, input), 400, "validation");
  denied(await native(actor, input), 400, "validation");
  assert.equal(
    await db.savedPostCollection.count({ where: { ownerId: actor.id } }),
    0
  );
  assert.equal(
    await db.postWorkspaceOperation.count({ where: { ownerId: actor.id } }),
    0
  );
  // Retain cleanup access for an existing reference from another transport.
  const legacy = await db.savedPostCollection.create({
    data: {
      ownerId: actor.id,
      id: "unfiled",
      name: "Fictional legacy collection"
    }
  });
  const renamed = ok(
    await native(
      actor,
      mutation("rename-collection", {
        id: legacy.id,
        expectedVersion: legacy.version,
        name: "Fictional cleanup choice"
      })
    ),
    actor.id
  );
  assert.equal((await row(actor, legacy.id)).name, "Fictional cleanup choice");
  const deletion = mutation("delete-collection", {
    id: legacy.id,
    expectedVersion: renamed.version
  });
  const removed = ok(await native(actor, deletion), actor.id);
  assert.deepEqual(ok(await native(actor, deletion), actor.id), removed);
  assert.ok((await row(actor, legacy.id)).deletedAt);
  assert.equal(
    await db.savedPostCollection.count({
      where: { ownerId: actor.id, deletedAt: null }
    }),
    0
  );
});

test("collection limits, tombstones and strict input preserve the existing library without unintended writes", async () => {
  const actor = await createPortalActor(db, "ncolbound");
  const prefix = randomUUID();
  const fixtures = Array.from({ length: 99 }, (_, index) => ({
    ownerId: actor.id,
    id: `${prefix}_${index}`,
    name: `Fictional capacity collection ${index}`
  }));
  await db.savedPostCollection.createMany({ data: fixtures });
  const edge = create("N".repeat(80), "c".repeat(80));
  const hundredth = ok(await native(actor, edge), actor.id);
  assert.equal((await row(actor, hundredth.id)).name.length, 80);
  const beyond = create("Fictional later collection");
  denied(await native(actor, beyond), 409, "conflict");
  assert.equal(
    await db.postWorkspaceOperation.count({
      where: { ownerId: actor.id, key: beyond.mutationId }
    }),
    0
  );
  const renamed = ok(
    await native(
      actor,
      mutation("rename-collection", {
        id: hundredth.id,
        expectedVersion: hundredth.version,
        name: "  Fictional name at capacity  "
      })
    ),
    actor.id
  );
  assert.equal(
    (await row(actor, hundredth.id)).name,
    "Fictional name at capacity"
  );
  const deletion = mutation("delete-collection", {
    id: fixtures[0].id,
    expectedVersion: 1
  });
  const deleted = ok(await native(actor, deletion), actor.id);
  ok(await native(actor, beyond), actor.id);
  assert.equal(
    await db.savedPostCollection.count({
      where: { ownerId: actor.id, deletedAt: null }
    }),
    100
  );
  assert.deepEqual(ok(await native(actor, edge), actor.id), hundredth);
  assert.equal((await row(actor, hundredth.id)).version, renamed.version);
  // Leave capacity available so its limit cannot mask deleted-ID reuse.
  ok(
    await native(
      actor,
      mutation("delete-collection", {
        id: fixtures[1].id,
        expectedVersion: 1
      })
    ),
    actor.id
  );
  assert.equal(
    await db.savedPostCollection.count({
      where: { ownerId: actor.id, deletedAt: null }
    }),
    99
  );
  for (const input of [
    create("Fictional reuse", deleted.id),
    {
      ...create("Fictional reuse", deleted.id),
      expectedVersion: deleted.version
    },
    mutation("rename-collection", {
      id: deleted.id,
      expectedVersion: deleted.version,
      name: "Fictional reuse"
    }),
    mutation("delete-collection", {
      id: deleted.id,
      expectedVersion: deleted.version
    })
  ])
    denied(await native(actor, input), 409, "conflict");
  assert.deepEqual(ok(await native(actor, deletion), actor.id), deleted);
  const tombstone = await row(actor, deleted.id);
  assert.equal(tombstone.name, "");
  assert.ok(tombstone.deletedAt);
  assert.equal(tombstone.version, deleted.version);

  const collectionsBefore = await db.savedPostCollection.findMany({
    where: { ownerId: actor.id },
    orderBy: { id: "asc" }
  });
  const operationsBefore = await db.postWorkspaceOperation.count({
    where: { ownerId: actor.id }
  });
  for (const name of ["", " \t ", "x".repeat(81), null, 5, []]) {
    denied(await native(actor, { ...create(), name }), 400, "validation");
    denied(
      await native(
        actor,
        mutation("rename-collection", {
          id: hundredth.id,
          expectedVersion: renamed.version,
          name
        })
      ),
      400,
      "validation"
    );
  }
  const valid = create();
  for (const fields of [
    { ownerId: actor.id },
    { postId: "fictional-post" },
    { payload: { content: "Fictional forbidden draft" } },
    { collectionId: null },
    { desired: true },
    { id: "" },
    { id: "x".repeat(81) },
    { id: "../other" },
    { mutationId: "x".repeat(81) },
    { expectedVersion: -1 },
    { expectedVersion: 0.5 }
  ])
    denied(await native(actor, { ...valid, ...fields }), 400, "validation");
  for (const input of [
    mutation("delete-collection", {
      id: hundredth.id,
      expectedVersion: renamed.version,
      name: "Unexpected"
    }),
    mutation("delete-collection", {
      id: hundredth.id,
      expectedVersion: renamed.version,
      ownerId: actor.id
    }),
    mutation("save-item", {
      postId: "fictional-post",
      collectionId: null,
      expectedVersion: 0
    }),
    mutation("save-draft", {
      id: randomUUID(),
      payload: {},
      expectedVersion: 0
    }),
    mutation("publish-draft", {
      id: randomUUID(),
      expectedVersion: 1
    }),
    "{invalid",
    "[]"
  ])
    denied(await native(actor, input), 400, "validation");
  denied(
    await native(actor, valid, { resource: "bookmarks" }),
    400,
    "validation"
  );
  assert.deepEqual(
    await db.savedPostCollection.findMany({
      where: { ownerId: actor.id },
      orderBy: { id: "asc" }
    }),
    collectionsBefore
  );
  assert.equal(
    await db.postWorkspaceOperation.count({ where: { ownerId: actor.id } }),
    operationsBefore
  );
  assert.equal(
    await db.savedPostItem.count({ where: { ownerId: actor.id } }),
    0
  );
  assert.equal(
    await db.privatePostDraft.count({ where: { ownerId: actor.id } }),
    0
  );
});
