import test from "node:test";
import assert from "node:assert/strict";
import {
  apiContracts,
  decodeApiResponse,
  encodeApiResponse,
  WireContractError
} from "../lib/platform/api-contracts";

const input = {
  mutationId: "fictional-edit-1",
  expectedVersion: 1,
  content: "Fictional correction\r\nwith raw line endings.",
  mentionIds: ["first-person", "second-person"]
};

test("comment correction keeps raw text, ordered mentions and exact path targets", () => {
  const contract = apiContracts.editComment;
  assert.equal(contract.method, "POST");
  assert.equal(
    contract.path,
    "/api/platform/v1/posts/:postId/comments/:commentId"
  );
  assert.equal(contract.access, "member");
  assert.deepEqual(contract.body.parse(input), input);
  assert.deepEqual(
    contract.params.parse({ postId: "post", commentId: "comment" }),
    {
      postId: "post",
      commentId: "comment"
    }
  );
  assert.equal(
    contract.body.parse({ ...input, content: "a\r\n".repeat(750) }).content
      .length,
    2250
  );
});

test("corrections cannot substitute speaker, audience, target, operation or draft controls", () => {
  for (const extra of [
    { operation: "delete" },
    { ownerId: "foreign" },
    { authorId: "foreign" },
    { authorChurchId: null },
    { replyToId: null },
    { postId: "foreign" },
    { commentId: "foreign" },
    { draftId: "foreign" },
    { draftVersion: 1 },
    { audience: "PUBLIC" },
    { desired: true },
    { padding: "unknown" },
    { content: "a" },
    { content: "a".repeat(3001) },
    { content: null },
    { expectedVersion: -1 },
    { expectedVersion: 1.5 },
    { expectedVersion: Number.MAX_SAFE_INTEGER },
    { mutationId: "a".repeat(81) },
    { mentionIds: null },
    { mentionIds: ["a", "b", "c", "d", "e", "f"] }
  ])
    assert.throws(
      () => apiContracts.editComment.body.parse({ ...input, ...extra }),
      WireContractError
    );
  for (const key of Object.keys(input)) {
    const missing: Record<string, unknown> = { ...input };
    delete missing[key];
    assert.throws(
      () => apiContracts.editComment.body.parse(missing),
      WireContractError
    );
  }
  assert.throws(
    () => apiContracts.editComment.params.parse({ postId: "post" }),
    WireContractError
  );
  assert.throws(
    () => apiContracts.editComment.query.parse({ expectedVersion: "1" }),
    WireContractError
  );
});

test("edit receipts bind their original viewer and expose no current content or authority", () => {
  const receipt = {
    apiVersion: "1",
    viewerId: "author",
    data: {
      id: "comment",
      version: 2,
      message: "Comment updated."
    }
  };
  assert.deepEqual(encodeApiResponse("editComment", receipt), receipt);
  assert.deepEqual(
    decodeApiResponse("editComment", receipt, "author"),
    receipt
  );
  assert.throws(
    () => decodeApiResponse("editComment", receipt, "other"),
    WireContractError
  );
  assert.throws(
    () => encodeApiResponse("editComment", { ...receipt, viewerId: null }),
    WireContractError
  );
  assert.throws(
    () =>
      encodeApiResponse("editComment", {
        ...receipt,
        data: { ...receipt.data, content: "Private corrected text" }
      }),
    WireContractError
  );
});
