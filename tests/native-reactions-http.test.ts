import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { request as httpsRequest } from "node:https";
import { createHmac, randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { assertPortalTestDatabase, createPortalActor } from "./seed-portal";
import { accountConfig } from "../lib/platform/account-config";
import {
  apiFailure,
  decodeApiResponse,
  type ApiOperation,
  type ApiResponse
} from "../lib/platform/api-contracts";
import { sessionCookieFixtureName } from "../scripts/session-cookie-fixture.mjs";

const db = new PrismaClient(),
  origin = process.env.ACCOUNT_ORIGIN!;
assert.match(origin, /^https:\/\/127\.0\.0\.1:\d+$/);
before(() => assertPortalTestDatabase(db));
after(() => db.$disconnect());
type Actor = { id: string; token: string };
const preferencesPath = "/api/platform/v1/reaction-preferences";
const likePath = (id: string) => `/api/platform/v1/posts/${id}/like`;
const json = (value: unknown) => Buffer.from(JSON.stringify(value));

// The runner supplies the localhost certificate trust. Native requests do not
// acquire browser cookies, Origin or Fetch Metadata implicitly.
function send(
  path: string,
  actor: Actor | null,
  method = "GET",
  bytes?: Buffer,
  headers: Record<string, string> = {}
) {
  return new Promise<{
    status: number;
    headers: import("node:http").IncomingHttpHeaders;
    bytes: Buffer;
  }>((resolve, reject) => {
    const request = httpsRequest(
      origin + path,
      {
        method,
        servername: "localhost",
        timeout: 30000,
        headers: {
          ...(actor
            ? {
                Authorization: "Bearer " + actor.token,
                "X-Expected-Account": actor.id
              }
            : {}),
          ...(bytes
            ? {
                "Content-Type": "application/json",
                "Content-Length": String(bytes.length)
              }
            : {}),
          ...headers
        }
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.once("error", reject);
        response.once("end", () =>
          resolve({
            status: response.statusCode!,
            headers: response.headers,
            bytes: Buffer.concat(chunks)
          })
        );
      }
    );
    request.once("error", reject);
    request.once("timeout", () =>
      request.destroy(new Error("Fictional native reactions HTTPS timeout"))
    );
    request.end(bytes);
  });
}
type HttpResult = Awaited<ReturnType<typeof send>>;
function privateResponse(response: HttpResult) {
  assert.match(String(response.headers["cache-control"]), /private.*no-store/);
  assert.equal(response.headers["cdn-cache-control"], "no-store");
  assert.equal(response.headers["vercel-cdn-cache-control"], "no-store");
  assert.equal(response.headers["referrer-policy"], "no-referrer");
  assert.equal(response.headers["x-content-type-options"], "nosniff");
  assert.equal(response.headers["x-api-version"], "1");
  for (const key of [
    "authorization",
    "cookie",
    "x-expected-account",
    "x-api-version"
  ])
    assert.ok(
      String(response.headers.vary).toLowerCase().split(/,\s*/).includes(key),
      `Missing private Vary key ${key}`
    );
  for (const key of ["set-cookie", "location", "access-control-allow-origin"])
    assert.equal(response.headers[key], undefined, key);
}
function ok<K extends ApiOperation>(
  operation: K,
  response: HttpResult,
  owner: string | null
) {
  assert.equal(response.status, 200, response.bytes.toString());
  privateResponse(response);
  assert.match(String(response.headers["content-type"]), /^application\/json/);
  return decodeApiResponse(
    operation,
    JSON.parse(response.bytes.toString()),
    owner
  ).data as ApiResponse<K>["data"];
}
function denied(response: HttpResult, status: number, code: string) {
  assert.equal(response.status, status, response.bytes.toString());
  privateResponse(response);
  assert.equal(
    apiFailure.parse(JSON.parse(response.bytes.toString())).error.code,
    code
  );
}
const webHeaders = (actor: Actor) => ({
  Cookie: `${sessionCookieFixtureName()}=${actor.token}`,
  "X-Expected-Account": actor.id
});
const webPost = (path: string, actor: Actor, bytes: Buffer) =>
  send(path, null, "POST", bytes, { ...webHeaders(actor), Origin: origin });
function webOk(response: HttpResult) {
  assert.equal(response.status, 200, response.bytes.toString());
  assert.match(String(response.headers["cache-control"]), /private.*no-store/);
  return JSON.parse(response.bytes.toString());
}
async function fixture() {
  const author = await createPortalActor(db, "nr_author"),
    viewer = await createPortalActor(db, "nr_viewer");
  const post = await db.platformPost.create({
    data: {
      authorId: author.id,
      content: "Fictional native and web reaction parity",
      publishedAt: new Date(Date.now() - 1000)
    }
  });
  return { author, viewer, post };
}

test("HTTPS native Likes share web receipts, preserve historical acknowledgments and record one durable notification intent", async () => {
  const f = await fixture(),
    path = likePath(f.post.id);
  const empty = { id: f.post.id, liked: false, version: 0, count: 0 };
  assert.deepEqual(ok("like", await send(path, null), null), empty);
  assert.deepEqual(ok("like", await send(path, f.viewer), f.viewer.id), empty);
  const input = { mutationId: randomUUID(), expectedVersion: 0, desired: true },
    bytes = json(input);
  const replies = await Promise.all([
    send(path, f.viewer, "POST", bytes),
    send(path, f.viewer, "POST", bytes)
  ]);
  const receipt = ok("setLike", replies[0], f.viewer.id);
  assert.equal(receipt.id, f.post.id);
  assert.equal(receipt.version, 1);
  assert.deepEqual(ok("setLike", replies[1], f.viewer.id), receipt);
  assert.deepEqual(
    webOk(
      await webPost(
        "/api/platform/post-likes",
        f.viewer,
        json({ ...input, postId: f.post.id })
      )
    ),
    receipt
  );
  const first = await db.platformPostLike.findUniqueOrThrow({
    where: { postId_userId: { postId: f.post.id, userId: f.viewer.id } }
  });
  assert.ok(first.firstLikedAt);
  const events = await db.socialEvent.findMany({
    where: { kind: "POST_REACTION", postId: f.post.id, actorId: f.viewer.id }
  });
  assert.equal(events.length, 1);
  assert.equal(events[0].recipientId, f.author.id);
  assert.equal(events[0].sourceId, first.id);
  assert.equal(events[0].sourceVersion, 1);
  // No delivery opt-ins or provider subscriptions are created in this fixture.
  // This proves durable intent/idempotency, not queue or provider acceptance.
  assert.equal(
    await db.notificationDelivery.count({ where: { eventId: events[0].id } }),
    0
  );
  assert.deepEqual(
    webOk(
      await send(
        `/api/platform/post-likes?postId=${f.post.id}`,
        null,
        "GET",
        undefined,
        webHeaders(f.viewer)
      )
    ),
    { id: f.post.id, liked: true, version: 1, count: 1 }
  );
  denied(
    await send(path, f.viewer, "POST", json({ ...input, desired: false })),
    409,
    "conflict"
  );
  denied(
    await send(
      path,
      f.viewer,
      "POST",
      json({ ...input, mutationId: randomUUID() })
    ),
    409,
    "conflict"
  );
  const unlike = {
    mutationId: randomUUID(),
    expectedVersion: 1,
    desired: false
  };
  const removed = webOk(
    await webPost(
      "/api/platform/post-likes",
      f.viewer,
      json({ ...unlike, postId: f.post.id })
    )
  );
  assert.equal(removed.version, 2);
  assert.deepEqual(
    ok(
      "setLike",
      await send(path, f.viewer, "POST", json(unlike)),
      f.viewer.id
    ),
    removed
  );
  assert.deepEqual(
    ok("setLike", await send(path, f.viewer, "POST", bytes), f.viewer.id),
    receipt
  );
  assert.deepEqual(ok("like", await send(path, f.viewer), f.viewer.id), {
    id: f.post.id,
    liked: false,
    version: 2,
    count: 0
  });
  ok(
    "setLike",
    await send(
      path,
      f.viewer,
      "POST",
      json({
        mutationId: randomUUID(),
        expectedVersion: 2,
        desired: true
      })
    ),
    f.viewer.id
  );
  const final = await db.platformPostLike.findUniqueOrThrow({
    where: { id: first.id }
  });
  assert.deepEqual(final.firstLikedAt, first.firstLikedAt);
  assert.equal(final.version, 3);
  assert.deepEqual(
    (
      await db.socialEvent.findMany({
        where: {
          kind: "POST_REACTION",
          postId: f.post.id,
          actorId: f.viewer.id
        },
        select: { id: true }
      })
    ).map((event) => event.id),
    [events[0].id]
  );
  assert.equal(
    await db.socialOperation.count({
      where: { ownerId: f.viewer.id, key: { startsWith: "post-like:" } }
    }),
    3
  );
});

test("HTTPS native author preferences share web versions and retries while hidden counts retain own Like state", async () => {
  const f = await fixture();
  assert.deepEqual(
    ok(
      "reactionPreferences",
      await send(preferencesPath, f.author),
      f.author.id
    ),
    {
      ownerId: f.author.id,
      version: 0,
      hideAuthoredReactionCounts: false,
      recoveryRequired: false
    }
  );
  ok(
    "setLike",
    await send(
      likePath(f.post.id),
      f.viewer,
      "POST",
      json({
        mutationId: randomUUID(),
        expectedVersion: 0,
        desired: true
      })
    ),
    f.viewer.id
  );
  const input = {
      mutationId: randomUUID(),
      expectedVersion: 0,
      hideAuthoredReactionCounts: true
    },
    bytes = json(input);
  const receipt = ok(
    "setReactionPreferences",
    await send(preferencesPath, f.author, "POST", bytes),
    f.author.id
  );
  assert.equal(receipt.id, f.author.id);
  assert.equal(receipt.version, 1);
  assert.deepEqual(
    ok(
      "setReactionPreferences",
      await send(preferencesPath, f.author, "POST", bytes),
      f.author.id
    ),
    receipt
  );
  assert.deepEqual(
    webOk(await webPost("/api/platform/reaction-preferences", f.author, bytes)),
    receipt
  );
  const saved = {
    ownerId: f.author.id,
    version: 1,
    hideAuthoredReactionCounts: true,
    recoveryRequired: false
  };
  assert.deepEqual(
    ok(
      "reactionPreferences",
      await send(preferencesPath, f.author),
      f.author.id
    ),
    saved
  );
  assert.deepEqual(
    webOk(
      await send(
        "/api/platform/reaction-preferences",
        null,
        "GET",
        undefined,
        webHeaders(f.author)
      )
    ),
    saved
  );
  assert.deepEqual(
    ok("like", await send(likePath(f.post.id), f.viewer), f.viewer.id),
    {
      id: f.post.id,
      liked: true,
      version: 1,
      count: null
    }
  );
  assert.deepEqual(ok("like", await send(likePath(f.post.id), null), null), {
    id: f.post.id,
    liked: false,
    version: 0,
    count: null
  });
  for (const method of ["GET", "POST"])
    denied(
      await send(
        preferencesPath,
        f.viewer,
        method,
        method === "POST" ? bytes : undefined,
        {
          "X-Expected-Account": f.author.id
        }
      ),
      401,
      "account_changed"
    );
  denied(
    await send(
      preferencesPath,
      f.author,
      "POST",
      json({ ...input, hideAuthoredReactionCounts: false })
    ),
    409,
    "conflict"
  );
  denied(
    await send(
      preferencesPath,
      f.author,
      "POST",
      json({ ...input, mutationId: randomUUID() })
    ),
    409,
    "conflict"
  );
  const newer = json({
    mutationId: randomUUID(),
    expectedVersion: 1,
    hideAuthoredReactionCounts: false
  });
  const restored = webOk(
    await webPost("/api/platform/reaction-preferences", f.author, newer)
  );
  assert.equal(restored.version, 2);
  assert.deepEqual(
    ok(
      "setReactionPreferences",
      await send(preferencesPath, f.author, "POST", newer),
      f.author.id
    ),
    restored
  );
  assert.deepEqual(
    ok(
      "setReactionPreferences",
      await send(preferencesPath, f.author, "POST", bytes),
      f.author.id
    ),
    receipt
  );
  assert.deepEqual(
    ok(
      "reactionPreferences",
      await send(preferencesPath, f.author),
      f.author.id
    ),
    {
      ownerId: f.author.id,
      version: 2,
      hideAuthoredReactionCounts: false,
      recoveryRequired: false
    }
  );
  assert.equal(
    ok("like", await send(likePath(f.post.id), f.viewer), f.viewer.id).count,
    1
  );
  assert.equal(
    await db.socialOperation.count({
      where: {
        ownerId: f.author.id,
        key: { startsWith: "reaction-count-preferences:" }
      }
    }),
    2
  );
});

test("HTTPS native reaction boundaries reject malformed inputs and browser credentials without changing canonical state", async () => {
  const f = await fixture();
  for (const resource of ["like", "preferences"] as const) {
    const path = resource === "like" ? likePath(f.post.id) : preferencesPath;
    const input = {
        mutationId: randomUUID(),
        expectedVersion: 0,
        ...(resource === "like"
          ? { desired: true }
          : { hideAuthoredReactionCounts: true })
      },
      bytes = json(input);
    denied(await send(path, null, "POST", bytes), 401, "unauthenticated");
    const invalidCredentials: Record<string, string>[] = [
      { Authorization: "Basic fictional" },
      { Authorization: "Bearer short" },
      { Authorization: "Bearer " + "x".repeat(43) },
      { Cookie: `${sessionCookieFixtureName()}=${f.viewer.token}` }
    ];
    for (const headers of invalidCredentials)
      denied(
        await send(path, f.viewer, "POST", bytes, headers),
        401,
        "unauthenticated"
      );
    denied(
      await send(path, null, "GET", undefined, webHeaders(f.viewer)),
      401,
      "unauthenticated"
    );
    denied(
      await send(path, f.viewer, "GET", undefined, {
        "X-Expected-Account": f.author.id
      }),
      401,
      "account_changed"
    );
    denied(
      await send(path, null, "POST", bytes, {
        Authorization: "Bearer " + f.viewer.token
      }),
      400,
      "validation"
    );
    const browserHeaders: Record<string, string>[] = [
      { Origin: origin },
      { "Sec-Fetch-Site": "same-origin" }
    ];
    for (const headers of browserHeaders)
      denied(
        await send(path, f.viewer, "POST", bytes, headers),
        403,
        "forbidden"
      );
    denied(
      await send(path, f.viewer, "POST", bytes, {
        "X-Expected-Account": f.author.id
      }),
      401,
      "account_changed"
    );
    for (const suffix of ["?unexpected=1", "?ownerId=one&ownerId=two"])
      for (const method of ["GET", "POST"])
        denied(
          await send(
            path + suffix,
            f.viewer,
            method,
            method === "POST" ? bytes : undefined
          ),
          400,
          "validation"
        );
    for (const method of ["PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"]) {
      const response = await send(path, f.viewer, method);
      assert.equal(response.status, 405, response.bytes.toString());
      assert.equal(response.headers.allow, "GET, POST");
      privateResponse(response);
      if (method === "HEAD") assert.equal(response.bytes.length, 0);
      else denied(response, 405, "method_not_allowed");
    }
    denied(
      await send(path, f.viewer, "POST", bytes, { "X-API-Version": "2" }),
      426,
      "unsupported_version"
    );
    denied(
      await send(path, f.viewer, "POST", bytes, { "X-API-Version": "1,1" }),
      400,
      "validation"
    );
    const wrongBoolean =
      resource === "like"
        ? { desired: "true" }
        : { hideAuthoredReactionCounts: "true" };
    for (const invalid of [
      { ...input, ownerId: f.author.id },
      { ...input, postId: f.post.id },
      { ...input, expectedVersion: "0" },
      { ...input, expectedVersion: -1 },
      { ...input, ...wrongBoolean },
      { ...input, mutationId: "x".repeat(81) },
      [],
      null
    ])
      denied(
        await send(path, f.viewer, "POST", json(invalid)),
        400,
        "validation"
      );
    denied(
      await send(path, f.viewer, "POST", Buffer.from("{")),
      400,
      "validation"
    );
    denied(
      await send(
        path,
        f.viewer,
        "POST",
        Buffer.concat([bytes, Buffer.alloc(16385, " ")])
      ),
      400,
      "validation"
    );
    denied(
      await send(path, f.viewer, "POST", bytes, {
        "Content-Type": "text/plain"
      }),
      400,
      "validation"
    );
    const webPath =
      resource === "like"
        ? "/api/platform/post-likes"
        : "/api/platform/reaction-preferences";
    const webBytes =
      resource === "like" ? json({ ...input, postId: f.post.id }) : bytes;
    // The original website transport still needs both its cookie and CSRF origin.
    assert.equal(
      (await send(webPath, f.viewer, "POST", webBytes, { Origin: origin }))
        .status,
      401
    );
    assert.equal(
      (await send(webPath, null, "POST", webBytes, webHeaders(f.viewer)))
        .status,
      403
    );
  }
  denied(await send(preferencesPath, null), 401, "unauthenticated");
  assert.deepEqual(
    ok(
      "like",
      await send(likePath(f.post.id), f.viewer, "GET", undefined, {
        "X-API-Version": "1"
      }),
      f.viewer.id
    ),
    {
      id: f.post.id,
      liked: false,
      version: 0,
      count: 0
    }
  );
  assert.equal(
    await db.platformPostLike.count({ where: { postId: f.post.id } }),
    0
  );
  assert.equal(
    await db.socialOperation.count({ where: { ownerId: f.viewer.id } }),
    0
  );
  assert.equal(
    ok(
      "reactionPreferences",
      await send(preferencesPath, f.viewer),
      f.viewer.id
    ).version,
    0
  );
});

test("HTTPS native and web reaction writes charge the same account/domain limiter and denial leaves the command uncommitted", async () => {
  const f = await fixture();
  for (const resource of ["like", "preferences"] as const) {
    const path = resource === "like" ? likePath(f.post.id) : preferencesPath;
    const webPath =
      resource === "like"
        ? "/api/platform/post-likes"
        : "/api/platform/reaction-preferences";
    const domain =
      resource === "like" ? "post-likes" : "reaction-count-preferences";
    const operation =
      resource === "like" ? "setLike" : "setReactionPreferences";
    const input = {
      mutationId: randomUUID(),
      expectedVersion: 0,
      ...(resource === "like"
        ? { desired: true }
        : { hideAuthoredReactionCounts: true })
    };
    const key = createHmac("sha256", accountConfig().rateSecret + ":" + domain)
      .update(`post-workspace:${f.viewer.id}`)
      .digest("hex");
    const receipt = ok(
      operation,
      await send(path, f.viewer, "POST", json(input)),
      f.viewer.id
    );
    assert.equal(
      (await db.platformAuthLimit.findUniqueOrThrow({ where: { key } })).hits,
      1
    );
    assert.deepEqual(
      webOk(
        await webPost(
          webPath,
          f.viewer,
          json({
            ...input,
            ...(resource === "like" ? { postId: f.post.id } : {})
          })
        )
      ),
      receipt
    );
    assert.equal(
      (await db.platformAuthLimit.findUniqueOrThrow({ where: { key } })).hits,
      2
    );
    // Set only this fixture's exact existing domain/account key, never a global bucket.
    await db.platformAuthLimit.update({
      where: { key },
      data: { hits: 240, expiresAt: new Date(Date.now() + 900000) }
    });
    const pending = {
      mutationId: randomUUID(),
      expectedVersion: 1,
      ...(resource === "like"
        ? { desired: false }
        : { hideAuthoredReactionCounts: false })
    };
    const blocked = await send(path, f.viewer, "POST", json(pending));
    denied(blocked, 429, "rate_limited");
    assert.equal(blocked.headers["retry-after"], "900");
    assert.equal(
      apiFailure.parse(JSON.parse(blocked.bytes.toString())).error
        .retryAfterSeconds,
      900
    );
    const webBlocked = await webPost(
      webPath,
      f.viewer,
      json({
        ...pending,
        ...(resource === "like" ? { postId: f.post.id } : {})
      })
    );
    assert.equal(webBlocked.status, 429, webBlocked.bytes.toString());
    assert.equal(webBlocked.headers["retry-after"], "900");
    assert.equal(
      await db.socialOperation.count({
        where: {
          ownerId: f.viewer.id,
          key: `${resource === "like" ? "post-like" : "reaction-count-preferences"}:${pending.mutationId}`
        }
      }),
      0
    );
    const state =
      resource === "like"
        ? ok("like", await send(path, f.viewer), f.viewer.id)
        : ok("reactionPreferences", await send(path, f.viewer), f.viewer.id);
    assert.equal(state.version, 1);
    if ("liked" in state) assert.equal(state.liked, true);
    else assert.equal(state.hideAuthoredReactionCounts, true);
  }
});

test("HTTPS source loss blocks new reactions and revoked identity blocks native reads and receipt replay", async () => {
  const f = await fixture(),
    path = likePath(f.post.id);
  const input = json({
    mutationId: randomUUID(),
    expectedVersion: 0,
    desired: true
  });
  ok("setLike", await send(path, f.viewer, "POST", input), f.viewer.id);
  const choice = json({
    mutationId: randomUUID(),
    expectedVersion: 0,
    hideAuthoredReactionCounts: true
  });
  ok(
    "setReactionPreferences",
    await send(preferencesPath, f.viewer, "POST", choice),
    f.viewer.id
  );
  await db.platformPost.update({
    where: { id: f.post.id },
    data: { status: "WITHDRAWN", withdrawnAt: new Date() }
  });
  for (const actor of [null, f.viewer])
    denied(await send(path, actor), 404, "not_found");
  denied(
    await send(
      path,
      f.viewer,
      "POST",
      json({ mutationId: randomUUID(), expectedVersion: 1, desired: true })
    ),
    404,
    "not_found"
  );
  // Existing canonical receipts are historical; source loss alone is not a
  // blanket receipt revocation. Session revocation must still precede replay.
  await db.platformUser.update({
    where: { id: f.viewer.id },
    data: { credentialVersion: { increment: 1 } }
  });
  for (const [route, bytes] of [
    [path, input],
    [preferencesPath, choice]
  ] as const) {
    denied(await send(route, f.viewer), 401, "unauthenticated");
    denied(await send(route, f.viewer, "POST", bytes), 401, "unauthenticated");
  }
  assert.equal(
    await db.socialOperation.count({ where: { ownerId: f.viewer.id } }),
    2
  );
  assert.equal(
    (
      await db.platformPostLike.findUniqueOrThrow({
        where: { postId_userId: { postId: f.post.id, userId: f.viewer.id } }
      })
    ).version,
    1
  );
});
