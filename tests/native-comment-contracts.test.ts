import test from "node:test";
import assert from "node:assert/strict";
import {
  apiComment,
  apiContracts,
  encodeApiResponse,
  decodeApiResponse,
  WireContractError
} from "../lib/platform/api-contracts";
import { apiResponseExamples } from "../lib/platform/api-contract-examples";

const structure = {
  id: "fictional-comment",
  rootId: null,
  parentId: null,
  createdAt: "2026-10-07T00:00:00.000Z",
  replyCount: 1
};
const visible = {
  ...structure,
  available: true,
  requiresWeb: false,
  content: "Fictional permitted comment",
  author: {
    kind: "person",
    identity: { id: "person", name: "Example", username: "example" }
  },
  version: 1,
  editedAt: null,
  prayerUpdateKind: null,
  isPostAuthor: false,
  replyTo: null,
  mentions: [],
  likeCount: null,
  ownReaction: null,
  canReply: false,
  canEdit: false,
  canDelete: false
};
const response = (item: object) => ({
  ...apiResponseExamples.comments,
  data: { ...apiResponseExamples.comments.data, items: [item] }
});

test("comment fields separate visible text, neutral parents and bounded website-only legacy comments", () => {
  for (const item of [
    visible,
    { ...structure, available: false },
    { ...structure, available: true, requiresWeb: true }
  ]) {
    assert.deepEqual(
      encodeApiResponse("comments", response(item)),
      response(item)
    );
    assert.deepEqual(
      decodeApiResponse("comments", response(item), null),
      response(item)
    );
  }
  for (const item of [
    { ...structure, available: false, content: "hidden" },
    { ...structure, available: false, author: visible.author },
    { ...structure, available: true, requiresWeb: true, content: "truncated" }
  ])
    assert.throws(
      () => encodeApiResponse("comments", response(item)),
      WireContractError
    );
  assert.equal(apiComment.parse({ ...visible, content: "" }).available, true);
  assert.throws(
    () => apiComment.parse({ ...visible, content: "x".repeat(1501) }),
    WireContractError
  );
  assert.throws(
    () =>
      apiComment.parse({
        ...visible,
        mentions: Array(6).fill(visible.author.identity)
      }),
    WireContractError
  );
  const church = apiComment.parse({
    ...visible,
    author: { kind: "church", id: "church", name: "Example Church" }
  });
  assert.ok(church.available && !church.requiresWeb);
  assert.deepEqual(church.author, {
    kind: "church",
    id: "church",
    name: "Example Church"
  });
});

test("native conversation requests reject mixed selectors, unsupported views and noncanonical reply order", () => {
  const query = {
    view: "roots",
    sort: "oldest",
    rootId: null,
    commentId: null,
    cursor: null
  };
  for (const valid of [
    query,
    { ...query, sort: "newest" },
    { ...query, view: "replies", rootId: "root" },
    { ...query, view: "context", commentId: "target" }
  ])
    assert.deepEqual(apiContracts.comments.query.parse(valid), valid);
  for (const change of [
    { view: "mentions" },
    { view: "drafts" },
    { rootId: "root" },
    { commentId: "target" },
    { view: "replies" },
    { view: "context" },
    { view: "replies", rootId: "root", sort: "newest" },
    { view: "context", commentId: "target", rootId: "root" },
    { cursor: "" },
    { ownerId: "other" }
  ])
    assert.throws(
      () => apiContracts.comments.query.parse({ ...query, ...change }),
      WireContractError
    );
});

test("guest comments cannot carry another account's reactions or write permissions", () => {
  for (const field of [
    { ownReaction: { liked: false, version: 0 } },
    { canReply: true },
    { canEdit: true },
    { canDelete: true }
  ])
    assert.throws(
      () => encodeApiResponse("comments", response({ ...visible, ...field })),
      WireContractError
    );
  for (const field of [
    { canPin: true },
    { canReply: true },
    { conversation: { mode: "FOLLOW", version: 1 } }
  ])
    assert.throws(
      () =>
        encodeApiResponse("comments", {
          ...response(visible),
          data: { ...response(visible).data, ...field }
        }),
      WireContractError
    );
  assert.throws(
    () => decodeApiResponse("comments", response(visible), "other"),
    WireContractError
  );
  assert.throws(
    () =>
      encodeApiResponse("comments", {
        ...response(visible),
        data: { ...response(visible).data, items: Array(21).fill(visible) }
      }),
    WireContractError
  );
  const unknown = {
    ...visible,
    author: {
      ...visible.author,
      identity: { ...visible.author.identity, email: "private@example.test" }
    }
  };
  assert.throws(
    () => encodeApiResponse("comments", response(unknown)),
    WireContractError
  );
  assert.deepEqual(
    decodeApiResponse("comments", response(unknown), null),
    response(visible)
  );
});
