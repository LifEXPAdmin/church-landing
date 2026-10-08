import test from "node:test";
import assert from "node:assert/strict";
import {
  apiContracts,
  decodeApiResponse,
  encodeApiResponse,
  WireContractError
} from "../lib/platform/api-contracts";
import {
  prepareRequest,
  type RequestAdapter
} from "../packages/shared-core/src/request-client";

const input = { mutationId: "fictional-delete-1", expectedVersion: 2 };
const receipt = {
  apiVersion: "1",
  viewerId: "author",
  data: {
    id: "comment",
    version: 3,
    message: "Comment deleted.",
    recoveryPending: false
  }
};

test("comment deletion binds both path targets and an immutable versioned request", () => {
  const contract = apiContracts.deleteComment;
  assert.equal(contract.method, "POST");
  assert.equal(
    contract.path,
    "/api/platform/v1/posts/:postId/comments/:commentId/delete"
  );
  assert.equal(contract.access, "member");
  assert.deepEqual(contract.body.parse(input), input);
  assert.deepEqual(
    contract.params.parse({ postId: "post", commentId: "comment" }),
    { postId: "post", commentId: "comment" }
  );
  assert.deepEqual(contract.query.parse({}), {});
});

test("deletion cannot override the actor, target, command or content and requires a bounded request reference", () => {
  for (const extra of [
    { operation: "edit" },
    { ownerId: "foreign" },
    { authorId: "foreign" },
    { postId: "foreign" },
    { commentId: "foreign" },
    { authorChurchId: "church" },
    { content: "replacement" },
    { mentionIds: [] },
    { replyToId: null },
    { draftId: "draft" },
    { desired: true },
    { recoveryPending: false },
    { expectedVersion: -1 },
    { expectedVersion: 1.5 },
    { expectedVersion: Number.MAX_SAFE_INTEGER },
    { mutationId: "" },
    { mutationId: "a".repeat(81) },
    { mutationId: "bad/key" }
  ])
    assert.throws(
      () => apiContracts.deleteComment.body.parse({ ...input, ...extra }),
      WireContractError
    );
  for (const value of [
    {},
    { mutationId: input.mutationId },
    { expectedVersion: 2 },
    null
  ])
    assert.throws(
      () => apiContracts.deleteComment.body.parse(value),
      WireContractError
    );
  for (const target of [
    { postId: "post" },
    { postId: "post", commentId: "bad/key" },
    { postId: "post", commentId: "comment", ownerId: "foreign" }
  ])
    assert.throws(
      () => apiContracts.deleteComment.params.parse(target),
      WireContractError
    );
  assert.throws(
    () => apiContracts.deleteComment.query.parse({ operation: "delete" }),
    WireContractError
  );
});

test("saved deletion receipts distinguish pending recovery without exposing deleted content or another account", () => {
  for (const recoveryPending of [false, true]) {
    const value = { ...receipt, data: { ...receipt.data, recoveryPending } };
    assert.deepEqual(encodeApiResponse("deleteComment", value), value);
    assert.deepEqual(
      decodeApiResponse("deleteComment", value, "author"),
      value
    );
    assert.throws(
      () => decodeApiResponse("deleteComment", value, "other"),
      WireContractError
    );
    assert.throws(
      () => encodeApiResponse("deleteComment", { ...value, viewerId: null }),
      WireContractError
    );
    for (const extra of [
      { content: "retained text" },
      { reportId: "private-report" },
      { authorId: "private-author" },
      { recoveryPending: null }
    ])
      assert.throws(
        () =>
          encodeApiResponse("deleteComment", {
            ...value,
            data: { ...value.data, ...extra }
          }),
        WireContractError
      );
  }
  const missing = {
    id: receipt.data.id,
    version: receipt.data.version,
    message: receipt.data.message
  };
  assert.throws(
    () =>
      decodeApiResponse(
        "deleteComment",
        { ...receipt, data: missing },
        "author"
      ),
    WireContractError
  );
});

test("the existing native request client accepts a saved 202 deletion and preserves its recovery warning", async () => {
  const value = {
    ...receipt,
    data: { ...receipt.data, recoveryPending: true }
  };
  const identity = { owner: "author", generation: 1 };
  let sends = 0;
  const adapter: RequestAdapter = {
    async capture() {
      return {
        identity,
        async send(request) {
          sends++;
          assert.equal(request.body, JSON.stringify(input));
          return {
            status: 202,
            async read() {
              return value;
            }
          };
        }
      };
    },
    async currentIdentity() {
      return identity;
    },
    decodeFailure() {
      throw Error("A saved deletion must not become a failed request");
    },
    now: () => 0
  };
  const prepared = prepareRequest(adapter, {
    path: "/api/platform/v1/posts/post/comments/comment/delete",
    method: "POST",
    expectedOwner: "author",
    body: JSON.stringify(input),
    idempotent: true,
    decode: (body) => decodeApiResponse("deleteComment", body, "author").data
  });
  assert.deepEqual(await prepared.run(), { owner: "author", data: value.data });
  assert.equal(sends, 1, "No automatic second deletion or provider retry");
});
