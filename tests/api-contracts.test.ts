import test from "node:test";
import assert from "node:assert/strict";
import {
  apiContracts,
  apiDate,
  apiFailure,
  apiErrorRules,
  apiId,
  apiCursor,
  encodeApiResponse,
  decodeApiResponse,
  decodeApiSession,
  WireContractError,
  type ApiOperation
} from "../lib/platform/api-contracts";
import {
  apiResponseExamples,
  apiWriteExamples,
  examplePost
} from "../lib/platform/api-contract-examples";

test("all selected operations have typed, bounded fictional wire examples without route activation", () => {
  for (const key of Object.keys(apiContracts) as ApiOperation[]) {
    const example = apiResponseExamples[key];
    assert.deepEqual(encodeApiResponse(key, example), example);
    assert.deepEqual(
      decodeApiResponse(key, example, example.viewerId),
      example
    );
    assert.equal(apiContracts[key].state, "contract-only");
    assert.ok(apiContracts[key].path.startsWith("/api/platform/v1/"));
  }
});

test("server allowlists reject row/secret spreads while old consumers discard additive fields recursively", () => {
  const example = apiResponseExamples.post;
  const withSecret = {
    ...example,
    data: { ...example.data, email: "private@example.test" }
  };
  assert.throws(() => encodeApiResponse("post", withSecret), WireContractError);
  assert.deepEqual(
    decodeApiResponse("post", withSecret, example.viewerId),
    example
  );
  const nested = {
    ...example,
    data: {
      ...example.data,
      author: {
        kind: "person",
        identity: {
          ...(example.data.author.kind === "person"
            ? example.data.author.identity
            : {}),
          passwordHash: "private-hash"
        }
      }
    }
  };
  assert.throws(() => encodeApiResponse("post", nested), WireContractError);
  assert.deepEqual(
    decodeApiResponse("post", nested, example.viewerId),
    example
  );
  assert.equal(
    JSON.stringify(
      decodeApiResponse("post", nested, example.viewerId)
    ).includes("private-hash"),
    false
  );
});

test("wrong viewer, private owner or contradictory session cannot be consumed or emitted", () => {
  for (const key of Object.keys(apiContracts) as ApiOperation[]) {
    const example = apiResponseExamples[key];
    assert.throws(
      () => decodeApiResponse(key, example, "different-account"),
      WireContractError
    );
  }
  const privateChoice = {
    ...apiResponseExamples.reactionPreferences,
    data: {
      ...apiResponseExamples.reactionPreferences.data,
      ownerId: "different-account"
    }
  };
  assert.throws(
    () => encodeApiResponse("reactionPreferences", privateChoice),
    WireContractError
  );
  assert.throws(
    () =>
      decodeApiResponse(
        "reactionPreferences",
        privateChoice,
        "fictional-member"
      ),
    WireContractError
  );
  assert.throws(
    () =>
      encodeApiResponse("profile", {
        ...apiResponseExamples.profile,
        viewerId: null
      }),
    WireContractError
  );
  assert.throws(
    () =>
      encodeApiResponse("session", {
        ...apiResponseExamples.session,
        viewerId: null
      }),
    WireContractError
  );
  assert.deepEqual(
    decodeApiResponse(
      "session",
      {
        apiVersion: "1",
        viewerId: null,
        data: { state: "guest", account: null }
      },
      null
    ).data,
    { state: "guest", account: null }
  );
  assert.deepEqual(
    decodeApiSession(apiResponseExamples.session),
    apiResponseExamples.session
  );
  assert.throws(
    () =>
      encodeApiResponse("setReactionPreferences", {
        ...apiResponseExamples.setReactionPreferences,
        data: {
          ...apiResponseExamples.setReactionPreferences.data,
          id: "other"
        }
      }),
    WireContractError
  );
  assert.throws(
    () =>
      encodeApiResponse("post", {
        ...apiResponseExamples.post,
        viewerId: null
      }),
    WireContractError
  );
  assert.throws(
    () =>
      encodeApiResponse("like", {
        ...apiResponseExamples.like,
        viewerId: null
      }),
    WireContractError
  );
});

test("hidden counts and unavailable repost sources stay null without erasing the caller's reaction", () => {
  const response = encodeApiResponse("post", apiResponseExamples.post);
  assert.equal(response.data.likeCount, null);
  assert.deepEqual(response.data.ownReaction, { liked: true, version: 2 });
  const unavailable = {
    ...response,
    data: { ...response.data, repost: { kind: "PLAIN", source: null } }
  };
  assert.equal(
    encodeApiResponse("post", unavailable).data.repost?.source,
    null
  );
  for (const likeCount of [-1, NaN, Infinity, "0", undefined]) {
    assert.throws(
      () =>
        encodeApiResponse("post", {
          ...response,
          data: { ...response.data, likeCount }
        }),
      WireContractError
    );
  }
});

test("write requests reject actor injection, unknown fields, unsafe versions and coercions", () => {
  for (const key of ["setLike", "setReactionPreferences"] as const) {
    const schema = apiContracts[key].body,
      body = apiWriteExamples[key];
    assert.deepEqual(schema.parse(body), body);
    for (const extra of [
      { ownerId: "other" },
      { actorId: "other" },
      { churchId: "church" },
      { enabled: true }
    ]) {
      assert.throws(
        () => schema.parse({ ...body, ...extra }),
        WireContractError
      );
    }
    for (const expectedVersion of [
      -1,
      0.5,
      Number.MAX_SAFE_INTEGER,
      "1",
      null
    ]) {
      assert.throws(
        () => schema.parse({ ...body, expectedVersion }),
        WireContractError
      );
    }
    for (const mutationId of ["", "spaces not allowed", "x".repeat(81)]) {
      assert.throws(
        () => schema.parse({ ...body, mutationId }),
        WireContractError
      );
    }
  }
  assert.throws(
    () =>
      apiContracts.setLike.body.parse({
        ...apiWriteExamples.setLike,
        desired: "true"
      }),
    WireContractError
  );
  assert.deepEqual(
    apiContracts.setLike.body.parse({
      ...apiWriteExamples.setLike,
      mutationId: "x"
    }),
    { ...apiWriteExamples.setLike, mutationId: "x" }
  );
});

test("wire identifiers, cursors, canonical dates and path parameters are bounded opaque values", () => {
  assert.equal(apiId.parse("cuid_123-abc"), "cuid_123-abc");
  assert.equal(
    apiCursor.parse("opaque.page.signature"),
    "opaque.page.signature"
  );
  for (const id of ["../secret", "a/b", "", "x".repeat(101), null])
    assert.throws(() => apiId.parse(id), WireContractError);
  for (const cursor of ["x".repeat(2001), "a\nb", "a/b"])
    assert.throws(() => apiCursor.parse(cursor), WireContractError);
  for (const date of [
    "2026-02-30T00:00:00.000Z",
    "2026-01-01",
    "2026-01-01T00:00:00Z",
    "2026-01-01T00:00:00.000+00:00",
    1
  ])
    assert.throws(() => apiDate.parse(date), WireContractError);
  assert.equal(apiDate.parse(examplePost.publishedAt), examplePost.publishedAt);
  assert.deepEqual(apiContracts.post.params.parse({ postId: "post" }), {
    postId: "post"
  });
  assert.throws(
    () => apiContracts.post.params.parse({ username: "post" }),
    WireContractError
  );
  assert.throws(
    () => apiContracts.profile.params.parse({ username: "../admin" }),
    WireContractError
  );
});

test("response pages and nested text have finite hard bounds; missing required values never default", () => {
  const response = apiResponseExamples.feed;
  const church = apiResponseExamples.church;
  const guestPost = { ...examplePost, ownReaction: null };
  assert.equal(
    encodeApiResponse("church", {
      ...church,
      data: { ...church.data, pinnedPosts: [guestPost] }
    }).data.pinnedPosts.length,
    1
  );
  assert.throws(
    () =>
      encodeApiResponse("church", {
        ...church,
        data: { ...church.data, pinnedPosts: Array(4).fill(guestPost) }
      }),
    WireContractError
  );
  assert.throws(
    () =>
      encodeApiResponse("church", {
        ...church,
        data: { ...church.data, pinnedPosts: [examplePost] }
      }),
    WireContractError
  );
  assert.throws(
    () =>
      encodeApiResponse("feed", {
        ...response,
        data: {
          ...response.data,
          page: { items: Array(31).fill(examplePost), nextCursor: null }
        }
      }),
    WireContractError
  );
  assert.throws(
    () =>
      encodeApiResponse("post", {
        ...apiResponseExamples.post,
        data: {
          ...examplePost,
          body: { ...examplePost.body, text: "x".repeat(3001) }
        }
      }),
    WireContractError
  );
  const missing: Record<string, unknown> = { ...examplePost };
  delete missing.likeCount;
  assert.throws(
    () =>
      encodeApiResponse("post", { ...apiResponseExamples.post, data: missing }),
    WireContractError
  );
  assert.throws(
    () =>
      encodeApiResponse("post", { ...apiResponseExamples.post, data: null }),
    WireContractError
  );
  assert.throws(
    () =>
      apiContracts.feed.query.parse({
        mode: "latest",
        cursor: null,
        scope: null,
        ownerId: "other"
      }),
    WireContractError
  );
});

test("compatibility is explicit: additive fields/features survive, unsupported required semantics fail closed", () => {
  const response = apiResponseExamples.capabilities;
  const future = {
    ...response,
    data: {
      supportedVersions: ["1", "2"],
      features: [{ name: "future.read", available: false }]
    }
  };
  assert.deepEqual(decodeApiResponse("capabilities", future, null), future);
  assert.throws(
    () =>
      decodeApiResponse(
        "post",
        { ...apiResponseExamples.post, apiVersion: "2" },
        "fictional-member"
      ),
    WireContractError
  );
  assert.throws(
    () =>
      decodeApiResponse(
        "post",
        {
          ...apiResponseExamples.post,
          data: { ...examplePost, type: "UNSUPPORTED" }
        },
        "fictional-member"
      ),
    WireContractError
  );
});

test("stable error vocabulary preserves uncertain outcomes and bounds retry hints without treating a receipt as state", () => {
  for (const [code, rule] of Object.entries(apiErrorRules)) {
    const failure = {
      apiVersion: "1",
      error: {
        code,
        message: "Safe summary.",
        retryAfterSeconds: code === "rate_limited" ? 60 : null
      }
    };
    assert.deepEqual(apiFailure.parse(failure), failure);
    assert.ok(rule.status >= 400);
  }
  assert.equal(apiErrorRules.unconfirmed.action, "reconcile");
  assert.equal(apiErrorRules.unconfirmed.status, 503);
  for (const error of [
    { code: "__proto__", message: "x", retryAfterSeconds: null },
    { code: "forbidden", message: "x", retryAfterSeconds: 1 },
    { code: "rate_limited", message: "x", retryAfterSeconds: -1 }
  ])
    assert.throws(
      () => apiFailure.parse({ apiVersion: "1", error }),
      WireContractError
    );
  const receipt = encodeApiResponse("setLike", apiResponseExamples.setLike);
  assert.deepEqual(Object.keys(receipt.data).sort(), [
    "id",
    "message",
    "version"
  ]);
  assert.equal("count" in receipt.data, false);
});

test("plain JSON structure is required and rejection diagnostics never echo rejected values", () => {
  for (const value of [
    [],
    new Date(),
    Object.create({ apiVersion: "1" }),
    JSON.parse(
      '{"apiVersion":"1","viewerId":null,"data":{},"__proto__":{"admin":true}}'
    )
  ]) {
    assert.throws(() => encodeApiResponse("session", value), WireContractError);
  }
  assert.throws(
    () => apiId.parse("private-secret/path"),
    (error) =>
      error instanceof WireContractError &&
      !error.message.includes("private-secret")
  );
});
