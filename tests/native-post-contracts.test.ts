import test from "node:test";
import assert from "node:assert/strict";
import {
  apiContracts,
  decodeApiResponse,
  WireContractError
} from "../lib/platform/api-contracts";
import {
  apiResponseExamples,
  apiWriteExamples
} from "../lib/platform/api-contract-examples";

test("direct text publication retains raw text, ordered topics and its canonical request key", () => {
  const input = {
    ...apiWriteExamples.createPost,
    content: "a\r\n".repeat(1500),
    scripture: "John 1:1\r\n",
    topics: ["scripture", "community"]
  };
  assert.deepEqual(apiContracts.createPost.body.parse(input), input);
  assert.equal(apiContracts.createPost.path, "/api/platform/v1/posts");
  assert.equal(apiContracts.createPost.method, "POST");
  assert.equal(apiContracts.createPost.access, "member");
  assert.deepEqual(apiContracts.createPost.params.parse({}), {});
  assert.deepEqual(apiContracts.createPost.query.parse({}), {});
});

test("direct publication accepts explicit core choices and rejects unsupported author, draft and advanced controls", () => {
  for (const field of [
    "operation",
    "mutationId",
    "authorId",
    "userId",
    "draftId",
    "draftVersion",
    "expectedVersion",
    "photos",
    "mentionIds",
    "resourceReferences",
    "groupId",
    "topicCommunityId",
    "eventOccurrenceId",
    "linkUrl",
    "linkReceipt",
    "scheduleLocal",
    "scheduleZone",
    "quoteSourceId",
    "discovery"
  ]) {
    assert.throws(
      () =>
        apiContracts.createPost.body.parse({
          ...apiWriteExamples.createPost,
          [field]: "injected"
        }),
      WireContractError,
      field
    );
  }
  for (const key of Object.keys(apiWriteExamples.createPost)) {
    const input: Record<string, unknown> = { ...apiWriteExamples.createPost };
    delete input[key];
    assert.throws(
      () => apiContracts.createPost.body.parse(input),
      WireContractError,
      key
    );
  }
  for (const change of [
    { content: "x".repeat(6001) },
    { content: "ab" },
    { contentNote: "x".repeat(241) },
    { safeExcerpt: "x".repeat(321) },
    { scripture: "x".repeat(241) },
    { requestKey: "x".repeat(101) },
    { requestKey: "bad/key" },
    { type: "POLL" },
    { audience: "GROUP" },
    { replyAudience: null },
    { allowReposts: "false" },
    { topics: ["unsupported"] },
    { topics: Array(6).fill("prayer") },
    { authorChurchId: "bad/church" }
  ]) {
    assert.throws(
      () =>
        apiContracts.createPost.body.parse({
          ...apiWriteExamples.createPost,
          ...change
        }),
      WireContractError
    );
  }
  assert.throws(
    () => apiContracts.createPost.query.parse({ operation: "create" }),
    WireContractError
  );
  assert.throws(
    () => apiContracts.createPost.params.parse({ postId: "forged" }),
    WireContractError
  );
});

test("publication returns only an original-viewer historical mutation receipt", () => {
  const response = apiResponseExamples.createPost;
  assert.deepEqual(
    decodeApiResponse("createPost", response, "fictional-member"),
    response
  );
  assert.throws(
    () => decodeApiResponse("createPost", response, "another-member"),
    WireContractError
  );
  assert.throws(
    () =>
      apiContracts.createPost.response.parse({
        ...response,
        data: {
          ...response.data,
          authorId: "private-actor",
          requestKey: "private-request"
        }
      }),
    WireContractError
  );
});
