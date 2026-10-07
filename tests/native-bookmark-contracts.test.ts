import test from "node:test";
import assert from "node:assert/strict";
import {
  apiContracts,
  apiBookmark,
  encodeApiResponse,
  decodeApiResponse,
  WireContractError
} from "../packages/shared-core/src/api-contracts";

const base = { id: "bookmark", version: 1, collectionId: null };
const post = {
  id: "post",
  type: "UPDATE",
  excerpt: "Fictional safe excerpt",
  contentNote: "Fictional note",
  publishedAt: null,
  href: "/platform/posts/post"
};
const page = (item: unknown) => ({
  apiVersion: "1",
  viewerId: "owner",
  data: { items: [item], nextCursor: null }
});

test("bookmark projection rejects unavailable source fields and cross-account envelopes", () => {
  const item = { ...base, available: false };
  assert.deepEqual(encodeApiResponse("bookmarks", page(item)), page(item));
  for (const field of [
    { post },
    { resourceId: "secret" },
    { content: "private" },
    { ownerId: "owner" }
  ])
    assert.throws(
      () => encodeApiResponse("bookmarks", page({ ...item, ...field })),
      WireContractError
    );
  assert.throws(
    () => decodeApiResponse("bookmarks", page(item), "other"),
    WireContractError
  );
  assert.throws(
    () => encodeApiResponse("bookmarks", { ...page(item), viewerId: null }),
    WireContractError
  );
  assert.deepEqual(
    decodeApiResponse(
      "bookmarks",
      page({ ...item, future: "ignored" }),
      "owner"
    ),
    page(item)
  );
});

test("bookmark posts preserve bounded safe excerpts and cannot carry an external navigation target", () => {
  const item = { ...base, available: true, post };
  assert.deepEqual(apiBookmark.parse(item), item);
  for (const fields of [
    { href: "https://example.test/post" },
    { href: "/platform/posts/other" },
    { excerpt: "x".repeat(301) },
    { contentNote: "x".repeat(121) },
    { content: "full private body" }
  ])
    assert.throws(
      () => apiBookmark.parse({ ...item, post: { ...post, ...fields } }),
      WireContractError
    );
  assert.throws(
    () =>
      encodeApiResponse("bookmarks", {
        ...page(item),
        data: { items: Array(21).fill(item), nextCursor: null }
      }),
    WireContractError
  );
});

test("all canonical saved resource kinds retain only their correct website target and event details", () => {
  const timing = {
    startAt: "2026-10-08T10:00:00.000Z",
    endAt: "2026-10-08T11:00:00.000Z",
    timeZone: "America/Chicago",
    allDay: false,
    startLocal: "2026-10-08T05:00",
    endLocal: "2026-10-08T06:00"
  };
  for (const [kind, href] of [
    ["exchangeListing", "/platform/exchange/item"],
    ["exchangeListing", "/platform/exchange/help/item"],
    ["eventOccurrence", "/platform/events/item"],
    ["volunteerOpportunity", "/platform/serve/item"],
    ["mediaCatalogItem", "/platform/media/item"]
  ]) {
    const resource = {
      kind,
      id: "item",
      title: "Fictional resource",
      href,
      state: "Available",
      requiresWeb: true,
      event: kind === "eventOccurrence" ? timing : null
    };
    const item = { ...base, available: true, resource };
    assert.deepEqual(apiBookmark.parse(item), item);
    for (const fields of [
      { href: "/platform/media/other" },
      { providerUrl: "private" },
      { event: kind === "eventOccurrence" ? null : timing },
      { requiresWeb: false }
    ])
      assert.throws(
        () =>
          apiBookmark.parse({ ...item, resource: { ...resource, ...fields } }),
        WireContractError
      );
  }
});

test("bookmark commands require original immutable references and reject draft, owner or invented toggle fields", () => {
  const commands = [
    {
      operation: "save-item",
      mutationId: "save",
      expectedVersion: 0,
      postId: "post",
      collectionId: null
    },
    {
      operation: "move-item",
      mutationId: "move",
      expectedVersion: 1,
      id: "bookmark",
      collectionId: "collection"
    },
    {
      operation: "remove-item",
      mutationId: "remove",
      expectedVersion: 2,
      id: "bookmark"
    }
  ];
  for (const command of commands) {
    assert.deepEqual(apiContracts.bookmarkCommand.body.parse(command), command);
    for (const field of [
      { desired: true },
      { ownerId: "other" },
      { payload: {} },
      { expectedVersion: -1 },
      { mutationId: "x".repeat(81) }
    ])
      assert.throws(
        () => apiContracts.bookmarkCommand.body.parse({ ...command, ...field }),
        WireContractError
      );
  }
  for (const operation of [
    "save-resource",
    "save-draft",
    "publish-draft",
    "create-collection"
  ])
    assert.throws(
      () =>
        apiContracts.bookmarkCommand.body.parse({ ...commands[0], operation }),
      WireContractError
    );
  assert.throws(
    () =>
      apiContracts.bookmarkCommand.body.parse({
        operation: "remove-item",
        mutationId: "remove",
        expectedVersion: 1,
        postId: "post"
      }),
    WireContractError
  );
});

test("collection commands preserve original names and IDs while rejecting unrelated fields and operations", () => {
  const input = {
    mutationId: "create-collection-retry",
    id: "client-collection-reference",
    expectedVersion: 0
  };
  const schema = apiContracts.bookmarkCollectionCommand.body;
  for (const operation of ["create-collection", "rename-collection"] as const) {
    const command = { ...input, operation, name: "  Private choices  " };
    assert.deepEqual(schema.parse(command), command);
    for (const field of [
      { name: "" },
      { name: "n".repeat(81) },
      { name: null },
      { id: "" },
      { id: "x".repeat(81) },
      { expectedVersion: -1 },
      { mutationId: "x".repeat(81) },
      { ownerId: "other" },
      { collectionId: "other" },
      { payload: {} },
      { postId: "post" }
    ])
      assert.throws(
        () => schema.parse({ ...command, ...field }),
        WireContractError
      );
  }
  const deletion = {
    ...input,
    operation: "delete-collection",
    expectedVersion: 1
  };
  assert.deepEqual(schema.parse(deletion), deletion);
  assert.throws(
    () => schema.parse({ ...deletion, name: "Private choices" }),
    WireContractError
  );
  for (const operation of [
    "save-item",
    "save-resource",
    "save-draft",
    "publish-draft",
    "remove-item"
  ])
    assert.throws(
      () => schema.parse({ ...deletion, operation }),
      WireContractError
    );
  assert.equal(
    apiContracts.bookmarkCollectionCommand.path,
    "/api/platform/v1/bookmark-collections"
  );
  assert.equal(apiContracts.bookmarkCollectionCommand.method, "POST");
});

test("collection and status envelopes are private, bounded and strictly projected", () => {
  const collection = {
    id: "collection",
    name: "Private choices",
    version: 1,
    createdAt: "2026-10-07T10:00:00.000Z",
    updatedAt: "2026-10-07T10:00:00.000Z"
  };
  assert.deepEqual(
    encodeApiResponse("bookmarkCollections", page(collection)),
    page(collection)
  );
  assert.throws(
    () =>
      encodeApiResponse(
        "bookmarkCollections",
        page({ ...collection, ownerId: "owner" })
      ),
    WireContractError
  );
  for (const item of [null, base])
    assert.equal(
      encodeApiResponse("bookmarkStatus", {
        apiVersion: "1",
        viewerId: "owner",
        data: { item }
      }).viewerId,
      "owner"
    );
  assert.throws(
    () =>
      encodeApiResponse("bookmarkStatus", {
        apiVersion: "1",
        viewerId: "owner",
        data: { item: { ...base, postId: "hidden" } }
      }),
    WireContractError
  );
});
