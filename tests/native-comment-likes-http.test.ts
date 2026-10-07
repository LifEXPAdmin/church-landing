import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { request as httpsRequest } from "node:https";
import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { assertPortalTestDatabase, createPortalActor } from "./seed-portal";
import { apiFailure, decodeApiResponse } from "../lib/platform/api-contracts";
import { sessionCookieFixtureName } from "../scripts/session-cookie-fixture.mjs";
import { setAuthorCounts } from "./reaction-count-fixture";

const db = new PrismaClient(),
  origin = process.env.ACCOUNT_ORIGIN!;
assert.match(origin, /^https:\/\/127\.0\.0\.1:\d+$/);
before(() => assertPortalTestDatabase(db));
after(() => db.$disconnect());
type Actor = { id: string; token: string };
const path = (postId: string, commentId: string) =>
  "/api/platform/v1/posts/" + postId + "/comments/" + commentId + "/like";
const change = (desired = true, expectedVersion = 0) => ({
  mutationId: randomUUID(),
  desired,
  expectedVersion
});
function send(
  path: string,
  actor: Actor | null,
  input?: object,
  headers: Record<string, string> = {},
  method = input ? "POST" : "GET"
) {
  const body = input ? JSON.stringify(input) : undefined;
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
          ...(body
            ? {
                "Content-Type": "application/json",
                "Content-Length": String(Buffer.byteLength(body))
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
      request.destroy(Error("Fictional comment Like HTTPS timeout"))
    );
    request.end(body);
  });
}
type Result = Awaited<ReturnType<typeof send>>;
function privateResponse(r: Result) {
  assert.match(String(r.headers["cache-control"]), /private.*no-store/);
  for (const key of ["cdn-cache-control", "vercel-cdn-cache-control"])
    assert.equal(r.headers[key], "no-store");
  assert.equal(r.headers["x-api-version"], "1");
  assert.equal(r.headers["referrer-policy"], "no-referrer");
  for (const key of [
    "authorization",
    "cookie",
    "x-expected-account",
    "x-api-version"
  ])
    assert.ok(String(r.headers.vary).toLowerCase().split(/,\s*/).includes(key));
  for (const key of ["set-cookie", "location", "access-control-allow-origin"])
    assert.equal(r.headers[key], undefined);
}
function ok(r: Result, owner: string) {
  assert.equal(r.status, 200, r.bytes.toString());
  privateResponse(r);
  return decodeApiResponse(
    "setCommentLike",
    JSON.parse(r.bytes.toString()),
    owner
  ).data;
}
function denied(r: Result, status: number, code: string) {
  assert.equal(r.status, status, r.bytes.toString());
  privateResponse(r);
  assert.equal(
    apiFailure.parse(JSON.parse(r.bytes.toString())).error.code,
    code
  );
}
async function fixture() {
  const owner = await createPortalActor(db, "likehttpowner"),
    reader = await createPortalActor(db, "likehttpreader");
  const post = await db.platformPost.create({
    data: {
      authorId: owner.id,
      content: "Fictional native Like browser post",
      publishedAt: new Date()
    }
  });
  const comment = await db.platformPostComment.create({
    data: {
      authorId: owner.id,
      postId: post.id,
      content: "Fictional native Like browser target"
    }
  });
  return { owner, reader, post, comment };
}
const webHeaders = (actor: Actor) => ({
  Origin: origin,
  Cookie: sessionCookieFixtureName(origin) + "=" + actor.token,
  "X-Expected-Account": actor.id
});

test("trusted HTTPS native and website adapters replay the exact canonical Like in either direction", async () => {
  for (const first of ["native", "web"]) {
    const f = await fixture(),
      input = change();
    const webInput = {
      operation: "like",
      ...input,
      postId: f.post.id,
      commentId: f.comment.id
    };
    const native = () => send(path(f.post.id, f.comment.id), f.reader, input);
    const web = () =>
      send("/api/platform/comments", null, webInput, webHeaders(f.reader));
    if (first === "native") ok(await native(), f.reader.id);
    else assert.equal((await web()).status, 200);
    const receipt = ok(await native(), f.reader.id),
      webReply = await web();
    assert.equal(webReply.status, 200, webReply.bytes.toString());
    assert.deepEqual(JSON.parse(webReply.bytes.toString()), receipt);
    assert.equal(
      (
        await db.commentLike.findUniqueOrThrow({
          where: {
            commentId_userId: { commentId: f.comment.id, userId: f.reader.id }
          }
        })
      ).version,
      1
    );
    const removed = await send(
      "/api/platform/comments",
      null,
      {
        operation: "like",
        ...change(false, 1),
        postId: f.post.id,
        commentId: f.comment.id
      },
      webHeaders(f.reader)
    );
    assert.equal(removed.status, 200, removed.bytes.toString());
    assert.deepEqual(ok(await native(), f.reader.id), receipt);
    const read = await send(
      "/api/platform/v1/posts/" + f.post.id + "/comments",
      f.reader
    );
    const row = decodeApiResponse(
      "comments",
      JSON.parse(read.bytes.toString()),
      f.reader.id
    ).data.items[0];
    assert.ok(row.available && !row.requiresWeb);
    assert.deepEqual(row.ownReaction, { liked: false, version: 2 });
    assert.equal(
      await db.socialEvent.count({
        where: { kind: "COMMENT_REACTION", commentId: f.comment.id }
      }),
      1
    );
  }
});

test("trusted HTTPS comment Like admission rejects browser authority, foreign actors, versions, targets and oversized bodies", async () => {
  const f = await fixture(),
    target = path(f.post.id, f.comment.id),
    input = change();
  denied(await send(target, null, input), 401, "unauthenticated");
  denied(
    await send(target, null, input, {
      Cookie: sessionCookieFixtureName(origin) + "=" + f.reader.token
    }),
    401,
    "unauthenticated"
  );
  denied(
    await send(target, f.reader, input, { Origin: origin }),
    403,
    "forbidden"
  );
  denied(
    await send(target, f.reader, input, { "Sec-Fetch-Site": "same-origin" }),
    403,
    "forbidden"
  );
  denied(
    await send(target, f.reader, input, { "X-API-Version": "2" }),
    426,
    "unsupported_version"
  );
  denied(
    await send(target, f.reader, input, { "X-Expected-Account": f.owner.id }),
    401,
    "account_changed"
  );
  denied(
    await send(target, f.reader, input, { "X-Expected-Account": "" }),
    400,
    "validation"
  );
  denied(
    await send(target + "?desired=true", f.reader, input),
    400,
    "validation"
  );
  denied(
    await send(target, f.reader, { ...input, postId: "other" }),
    400,
    "validation"
  );
  denied(
    await send(target, f.reader, { ...input, padding: "x".repeat(17000) }),
    400,
    "validation"
  );
  denied(
    await send(path(f.post.id, "missing"), f.reader, input),
    404,
    "not_found"
  );
  const method = await send(target, f.reader);
  assert.equal(method.headers.allow, "POST");
  denied(method, 405, "method_not_allowed");
  assert.equal(
    await db.commentLike.count({ where: { commentId: f.comment.id } }),
    0
  );
});

test("trusted HTTPS Like state is shared with the hidden-count website and retained for browser acceptance", async () => {
  const f = await fixture(),
    input = change();
  await setAuthorCounts(db, f.owner, true);
  const receipt = ok(
    await send(path(f.post.id, f.comment.id), f.reader, input),
    f.reader.id
  );
  const read = await send(
    "/api/platform/v1/posts/" + f.post.id + "/comments",
    f.reader
  );
  const row = decodeApiResponse(
    "comments",
    JSON.parse(read.bytes.toString()),
    f.reader.id
  ).data.items[0];
  assert.ok(row.available && !row.requiresWeb);
  assert.equal(row.likeCount, null);
  assert.deepEqual(row.ownReaction, { liked: true, version: 1 });
  writeFileSync(
    join(
      dirname(process.env.ACCOUNT_TEST_SINK_DIR!),
      "comment-like-browser-fixture.json"
    ),
    JSON.stringify(
      {
        owner: f.owner,
        reader: f.reader,
        postId: f.post.id,
        commentId: f.comment.id,
        content: f.comment.content,
        nativeInput: input,
        nativeReceipt: receipt
      },
      null,
      2
    ),
    { flag: "wx", mode: 0o600 }
  );
});
