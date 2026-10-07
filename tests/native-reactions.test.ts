import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, createHmac } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { assertPortalTestDatabase } from "./seed-portal";
import { seedReactionCounts, setAuthorCounts } from "./reaction-count-fixture";
import {
  handleNativeReactionRequest,
  type NativeReactionResource
} from "../lib/platform/native-reaction-boundary";
import {
  apiFailure,
  decodeApiResponse,
  type ApiResponse,
  type ApiOperation
} from "../lib/platform/api-contracts";
import { accountConfig } from "../lib/platform/account-config";
import { postLikeCommand, readPostLike } from "../lib/platform/post-likes";
import { AccountSessionOwnerError } from "../lib/platform/account-sessions";
import { relationshipCommand } from "../lib/platform/relationships";
import { repostCommand } from "../lib/platform/reposts";
import { hashSessionToken } from "../lib/platform/auth";

const db = new PrismaClient();
before(() => assertPortalTestDatabase(db));
after(() => db.$disconnect());
type Actor = { id: string; token: string };
const action = (fields: Record<string, unknown>) => ({
  mutationId: randomUUID(),
  ...fields
});
async function call(
  resource: NativeReactionResource,
  actor?: Actor,
  postId?: string,
  body?: object,
  extra: Record<string, string> = {}
) {
  const response = await handleNativeReactionRequest(
    db,
    new Request(
      new URL(
        resource === "like"
          ? `/api/platform/v1/posts/${postId}/like`
          : "/api/platform/v1/reaction-preferences",
        process.env.ACCOUNT_ORIGIN!
      ),
      {
        method: body ? "POST" : "GET",
        headers: {
          ...(actor
            ? {
                Authorization: "Bearer " + actor.token,
                "X-Expected-Account": actor.id
              }
            : {}),
          ...(body ? { "Content-Type": "application/json" } : {}),
          ...extra
        },
        ...(body ? { body: JSON.stringify(body) } : {})
      }
    ),
    resource,
    resource === "like" ? { postId } : {}
  );
  assert.match(response.headers.get("cache-control")!, /private.*no-store/);
  assert.equal(response.headers.get("set-cookie"), null);
  assert.equal(response.headers.get("location"), null);
  assert.equal(response.headers.get("x-api-version"), "1");
  return { response, value: await response.json() };
}
function ok<K extends ApiOperation>(
  operation: K,
  r: Awaited<ReturnType<typeof call>>,
  owner: string | null
) {
  assert.equal(r.response.status, 200, JSON.stringify(r.value));
  return decodeApiResponse(operation, r.value, owner)
    .data as ApiResponse<K>["data"];
}
function denied(
  r: Awaited<ReturnType<typeof call>>,
  status: number,
  code: string
) {
  assert.equal(r.response.status, status, JSON.stringify(r.value));
  assert.equal(apiFailure.parse(r.value).error.code, code);
}

test("native Like reads preserve guest, private audience, hidden totals and strict supplied identity", async () => {
  const f = await seedReactionCounts(db);
  assert.deepEqual(
    ok("like", await call("like", undefined, f.post.id), null),
    await readPostLike(db, undefined, f.post.id)
  );
  await setAuthorCounts(db, f.a, true);
  const hidden = ok(
    "like",
    await call("like", f.viewer, f.post.id),
    f.viewer.id
  );
  assert.equal(hidden.count, null);
  assert.equal(hidden.liked, true);
  assert.equal(
    ok("like", await call("like", f.viewer, f.churchPost.id), f.viewer.id)
      .count,
    1
  );
  denied(
    await call("like", f.viewer, f.post.id, undefined, {
      "X-Expected-Account": f.a.id
    }),
    401,
    "account_changed"
  );
  denied(
    await call("like", { id: f.viewer.id, token: "x".repeat(43) }, f.post.id),
    401,
    "unauthenticated"
  );
  await db.platformPost.update({
    where: { id: f.churchPost.id },
    data: { audience: "CHURCH" }
  });
  denied(await call("like", undefined, f.churchPost.id), 404, "not_found");
  denied(await call("like", f.b, f.churchPost.id), 404, "not_found");
});

test("concurrent Like retries share canonical receipt, preserve first activation and never undo a later Unlike", async () => {
  const f = await seedReactionCounts(db);
  const input = action({ expectedVersion: 0, desired: true });
  const results = await Promise.all([
    call("like", f.b, f.post.id, input),
    call("like", f.b, f.post.id, input)
  ]);
  const receipt = ok("setLike", results[0], f.b.id);
  assert.deepEqual(ok("setLike", results[1], f.b.id), receipt);
  assert.deepEqual(
    await postLikeCommand(db, f.b.token, { ...input, postId: f.post.id }),
    receipt
  );
  const first = await db.platformPostLike.findUniqueOrThrow({
    where: { postId_userId: { postId: f.post.id, userId: f.b.id } }
  });
  assert.ok(first.firstLikedAt);
  assert.equal(
    await db.socialEvent.count({
      where: { kind: "POST_REACTION", postId: f.post.id, actorId: f.b.id }
    }),
    1
  );
  denied(
    await call("like", f.b, f.post.id, { ...input, desired: false }),
    409,
    "conflict"
  );
  denied(
    await call(
      "like",
      f.b,
      f.post.id,
      action({ expectedVersion: 0, desired: false })
    ),
    409,
    "conflict"
  );
  const removed = ok(
    "setLike",
    await call(
      "like",
      f.b,
      f.post.id,
      action({ expectedVersion: receipt.version, desired: false })
    ),
    f.b.id
  );
  assert.deepEqual(
    ok("setLike", await call("like", f.b, f.post.id, input), f.b.id),
    receipt
  );
  assert.deepEqual(ok("like", await call("like", f.b, f.post.id), f.b.id), {
    id: f.post.id,
    liked: false,
    version: removed.version,
    count: 1
  });
  ok(
    "setLike",
    await call(
      "like",
      f.b,
      f.post.id,
      action({ expectedVersion: removed.version, desired: true })
    ),
    f.b.id
  );
  assert.equal(
    (
      await db.platformPostLike.findUniqueOrThrow({ where: { id: first.id } })
    ).firstLikedAt?.getTime(),
    first.firstLikedAt.getTime()
  );
  assert.equal(
    await db.socialEvent.count({
      where: { kind: "POST_REACTION", postId: f.post.id, actorId: f.b.id }
    }),
    1
  );
});

test("original account is enforced inside new commands and historical receipt replay", async () => {
  const f = await seedReactionCounts(db);
  const input = action({ expectedVersion: 0, desired: false });
  await assert.rejects(
    postLikeCommand(db, f.b.token, { ...input, postId: f.post.id }, f.a.id),
    AccountSessionOwnerError
  );
  assert.equal(
    await db.platformPostLike.count({
      where: { postId: f.post.id, userId: f.b.id }
    }),
    0
  );
  const receipt = ok(
    "setLike",
    await call("like", f.b, f.post.id, input),
    f.b.id
  );
  assert.equal(receipt.version, 1);
  await assert.rejects(
    postLikeCommand(db, f.b.token, { ...input, postId: f.post.id }, f.a.id),
    AccountSessionOwnerError
  );
  denied(
    await call("like", f.b, f.post.id, input, { "X-Expected-Account": f.a.id }),
    401,
    "account_changed"
  );
  await db.platformSession.deleteMany({
    where: { tokenHash: hashSessionToken(f.b.token) }
  });
  denied(await call("like", f.b, f.post.id), 401, "unauthenticated");
  denied(await call("like", f.b, f.post.id, input), 401, "unauthenticated");
  assert.equal(
    await db.socialOperation.count({
      where: { ownerId: f.b.id, key: "post-like:" + input.mutationId }
    }),
    1
  );
});

test("plain repost resolves canonical interaction ID while route identity remains part of exact retry", async () => {
  const f = await seedReactionCounts(db);
  const plain = await repostCommand(
    db,
    f.b.token,
    action({
      operation: "repost",
      sourceId: f.post.id,
      expectedSourceVersion: f.post.version
    })
  );
  const input = action({ expectedVersion: 0, desired: true });
  const value = ok("setLike", await call("like", f.b, plain.id, input), f.b.id);
  assert.equal(value.id, f.post.id);
  assert.equal(
    ok("like", await call("like", f.b, plain.id), f.b.id).id,
    f.post.id
  );
  denied(await call("like", f.b, f.post.id, input), 409, "conflict");
  assert.deepEqual(
    ok("setLike", await call("like", f.b, plain.id, input), f.b.id),
    value
  );
});

test("current withdrawal and bilateral block govern native reads and fresh writes", async () => {
  const f = await seedReactionCounts(db);
  await relationshipCommand(
    db,
    f.b.token,
    action({
      operation: "block",
      kind: "person",
      targetId: f.a.id,
      expectedVersion: 0,
      desired: true
    })
  );
  denied(await call("like", f.b, f.post.id), 404, "not_found");
  denied(
    await call(
      "like",
      f.b,
      f.post.id,
      action({ expectedVersion: 0, desired: true })
    ),
    404,
    "not_found"
  );
  await db.platformPost.update({
    where: { id: f.post.id },
    data: { status: "WITHDRAWN", withdrawnAt: new Date() }
  });
  denied(await call("like", undefined, f.post.id), 404, "not_found");
  denied(
    await call(
      "like",
      f.viewer,
      f.post.id,
      action({ expectedVersion: 1, desired: false })
    ),
    404,
    "not_found"
  );
});

test("preference journal uncertainty preserves the committed operation and exact retry completes recovery", async () => {
  const f = await seedReactionCounts(db);
  const input = action({
    expectedVersion: 0,
    hideAuthoredReactionCounts: true
  });
  const previous = process.env.RETENTION_TEST_DIR;
  assert.ok(previous);
  try {
    // Rejected fixture configuration forces the real postcommit journal path to fail.
    process.env.RETENTION_TEST_DIR = "/unavailable-fictional-retention";
    denied(
      await call("reactionPreferences", f.a, undefined, input),
      503,
      "unconfirmed"
    );
  } finally {
    process.env.RETENTION_TEST_DIR = previous;
  }
  assert.equal(
    (
      await db.socialPreferences.findUniqueOrThrow({
        where: { ownerId: f.a.id }
      })
    ).reactionCountVersion,
    1
  );
  const receipt = ok(
    "setReactionPreferences",
    await call("reactionPreferences", f.a, undefined, input),
    f.a.id
  );
  assert.equal(receipt.version, 1);
  assert.equal(
    await db.socialOperation.count({
      where: {
        ownerId: f.a.id,
        key: "reaction-count-preferences:" + input.mutationId
      }
    }),
    1
  );
  denied(
    await call("reactionPreferences", f.a, undefined, input, {
      "X-Expected-Account": f.b.id
    }),
    401,
    "account_changed"
  );
  denied(
    await call("reactionPreferences", f.a, undefined, {
      ...input,
      hideAuthoredReactionCounts: false
    }),
    409,
    "conflict"
  );
  ok(
    "setReactionPreferences",
    await call(
      "reactionPreferences",
      f.a,
      undefined,
      action({ expectedVersion: 1, hideAuthoredReactionCounts: false })
    ),
    f.a.id
  );
  assert.deepEqual(
    ok(
      "setReactionPreferences",
      await call("reactionPreferences", f.a, undefined, input),
      f.a.id
    ),
    receipt
  );
  assert.equal(
    ok("reactionPreferences", await call("reactionPreferences", f.a), f.a.id)
      .hideAuthoredReactionCounts,
    false
  );
  await db.socialPreferences.update({
    where: { ownerId: f.a.id },
    data: { reactionCountRecoveryRequired: true }
  });
  const quarantined = ok(
    "reactionPreferences",
    await call("reactionPreferences", f.a),
    f.a.id
  );
  assert.equal(quarantined.recoveryRequired, true);
  assert.equal(quarantined.hideAuthoredReactionCounts, true);
});

test("native writes share website rate buckets and deny before body consumption or mutation", async () => {
  const f = await seedReactionCounts(db);
  for (const resource of ["like", "reactionPreferences"] as const) {
    const domain =
      resource === "like" ? "post-likes" : "reaction-count-preferences";
    const key = createHmac("sha256", accountConfig().rateSecret + ":" + domain)
      .update("post-workspace:" + f.b.id)
      .digest("hex");
    await db.platformAuthLimit.upsert({
      where: { key },
      create: { key, hits: 240, expiresAt: new Date(Date.now() + 900000) },
      update: { hits: 240, expiresAt: new Date(Date.now() + 900000) }
    });
    let pulls = 0;
    const request = new Request(
      new URL("/api/platform/v1/reaction-probe", process.env.ACCOUNT_ORIGIN!),
      {
        method: "POST",
        headers: {
          Authorization: "Bearer " + f.b.token,
          "X-Expected-Account": f.b.id,
          "Content-Type": "application/json"
        },
        body: new ReadableStream(
          {
            pull(controller) {
              pulls++;
              controller.close();
            }
          },
          { highWaterMark: 0 }
        ),
        duplex: "half"
      } as RequestInit
    );
    const response = await handleNativeReactionRequest(
      db,
      request,
      resource,
      resource === "like" ? { postId: f.post.id } : {}
    );
    assert.equal(response.status, 429);
    assert.equal(response.headers.get("retry-after"), "900");
    assert.equal(pulls, 0);
  }
  assert.equal(
    await db.platformPostLike.count({
      where: { postId: f.post.id, userId: f.b.id }
    }),
    0
  );
  assert.equal(
    await db.socialOperation.count({ where: { ownerId: f.b.id } }),
    0
  );
});

test("feature pause rejects without side effects and rollback replays the exact retained change", async () => {
  const f = await seedReactionCounts(db);
  const input = action({ expectedVersion: 0, desired: true });
  const receipt = ok(
    "setLike",
    await call("like", f.b, f.post.id, input),
    f.b.id
  );
  const row = await db.platformPostLike.findUniqueOrThrow({
    where: { postId_userId: { postId: f.post.id, userId: f.b.id } }
  });
  const limits = await db.platformAuthLimit.findMany({
    orderBy: { key: "asc" }
  });
  const old = process.env.NATIVE_API_DISABLED_FEATURES;
  try {
    process.env.NATIVE_API_DISABLED_FEATURES =
      "likes.write,reactionPreferences.write";
    denied(
      await call("like", f.b, f.post.id, input),
      503,
      "feature_unavailable"
    );
    denied(
      await call(
        "reactionPreferences",
        f.b,
        undefined,
        action({ expectedVersion: 0, hideAuthoredReactionCounts: true })
      ),
      503,
      "feature_unavailable"
    );
    ok("like", await call("like", f.b, f.post.id), f.b.id);
    assert.deepEqual(
      await db.platformAuthLimit.findMany({ orderBy: { key: "asc" } }),
      limits
    );
  } finally {
    if (old === undefined) delete process.env.NATIVE_API_DISABLED_FEATURES;
    else process.env.NATIVE_API_DISABLED_FEATURES = old;
  }
  assert.deepEqual(
    ok("setLike", await call("like", f.b, f.post.id, input), f.b.id),
    receipt
  );
  assert.deepEqual(
    await db.platformPostLike.findUniqueOrThrow({ where: { id: row.id } }),
    row
  );
});

test("strict native pre-admission rejects unsupported versions, browser context and malformed bodies", async () => {
  const f = await seedReactionCounts(db);
  const input = action({ expectedVersion: 0, desired: true });
  for (const extra of [
    { Origin: process.env.ACCOUNT_ORIGIN! },
    { "Sec-Fetch-Site": "same-origin" }
  ] as Record<string, string>[])
    denied(await call("like", f.b, f.post.id, input, extra), 403, "forbidden");
  denied(
    await call("like", f.b, f.post.id, input, { "X-API-Version": "2" }),
    426,
    "unsupported_version"
  );
  denied(
    await call("like", undefined, f.post.id, input),
    401,
    "unauthenticated"
  );
  denied(await call("reactionPreferences"), 401, "unauthenticated");
  for (const body of [
    { ...input, ownerId: f.a.id },
    { ...input, desired: "true" },
    { ...input, expectedVersion: -1 },
    { ...input, mutationId: "x".repeat(81) }
  ])
    denied(await call("like", f.b, f.post.id, body), 400, "validation");
  assert.equal(
    await db.platformPostLike.count({
      where: { postId: f.post.id, userId: f.b.id }
    }),
    0
  );
});
