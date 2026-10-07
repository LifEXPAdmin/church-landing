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

const db = new PrismaClient(),
  origin = process.env.ACCOUNT_ORIGIN!;
assert.match(origin, /^https:\/\/127\.0\.0\.1:\d+$/);
before(() => assertPortalTestDatabase(db));
after(() => db.$disconnect());
type Actor = { id: string; token: string };
const path = (postId: string, commentId: string) =>
  "/api/platform/v1/posts/" + postId + "/comments/" + commentId;
const change = (fields: Record<string, unknown> = {}) => ({
  mutationId: randomUUID(),
  content: "Fictional native HTTP correction",
  expectedVersion: 1,
  mentionIds: [],
  ...fields
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
      request.destroy(Error("Fictional comment correction HTTPS timeout"))
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
  return decodeApiResponse("editComment", JSON.parse(r.bytes.toString()), owner)
    .data;
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
  const owner = await createPortalActor(db, "edithttpowner"),
    reader = await createPortalActor(db, "edithttpreader");
  const post = await db.platformPost.create({
    data: {
      authorId: owner.id,
      content: "Fictional native correction browser post",
      publishedAt: new Date()
    }
  });
  const comment = await db.platformPostComment.create({
    data: {
      postId: post.id,
      authorId: reader.id,
      content: "Original fictional HTTP comment"
    }
  });
  return { owner, reader, post, comment };
}
const webHeaders = (actor: Actor) => ({
  Origin: origin,
  Cookie: sessionCookieFixtureName(origin) + "=" + actor.token,
  "X-Expected-Account": actor.id
});

test("trusted HTTPS native and website corrections share one exact receipt in both directions", async () => {
  for (const first of ["native", "web"]) {
    const f = await fixture(),
      input = change({ content: "Fictional raw\r\ncorrection" });
    const target = path(f.post.id, f.comment.id);
    const native = () => send(target, f.reader, input);
    const web = () =>
      send(
        "/api/platform/comments",
        null,
        {
          operation: "edit",
          ...input,
          postId: f.post.id,
          commentId: f.comment.id
        },
        webHeaders(f.reader)
      );
    if (first === "native") ok(await native(), f.reader.id);
    else assert.equal((await web()).status, 200);
    const receipt = ok(await native(), f.reader.id),
      webReply = await web();
    assert.equal(webReply.status, 200, webReply.bytes.toString());
    assert.deepEqual(JSON.parse(webReply.bytes.toString()), receipt);
    assert.equal(receipt.id, f.comment.id);
    assert.equal(receipt.version, 2);
    assert.equal(
      await db.socialOperation.count({
        where: { ownerId: f.reader.id, key: "comments:" + input.mutationId }
      }),
      1
    );
    assert.equal(
      await db.platformPostComment.count({ where: { postId: f.post.id } }),
      1
    );
    assert.equal(
      await db.privateCommentDraft.count({ where: { ownerId: f.reader.id } }),
      0
    );
    const read = await send(
      `/api/platform/v1/posts/${f.post.id}/comments`,
      f.reader
    );
    privateResponse(read);
    const row = decodeApiResponse(
      "comments",
      JSON.parse(read.bytes.toString()),
      f.reader.id
    ).data.items[0];
    assert.ok(row.available && !row.requiresWeb);
    assert.equal(row.content, "Fictional raw\ncorrection");
    assert.equal(row.version, 2);
    assert.ok(row.editedAt);
    denied(
      await send(target, f.reader, { ...input, content: row.content }),
      409,
      "conflict"
    );
    denied(await send(target, f.reader, change()), 409, "conflict");
  }
});

test("trusted HTTPS editing rejects borrowed browser authority, foreign owners and command injection", async () => {
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
    await send(target, f.reader, input, { "X-API-Version": "2" }),
    426,
    "unsupported_version"
  );
  denied(
    await send(target + "?operation=delete", f.reader, input),
    400,
    "validation"
  );
  for (const fields of [
    { postId: "other" },
    { commentId: "other" },
    { operation: "delete" },
    { ownerId: f.owner.id },
    { authorChurchId: null },
    { replyToId: null },
    { draftId: "foreign" },
    { draftVersion: 1 },
    { mentionIds: null },
    { content: "x".repeat(1501) },
    { padding: "x".repeat(17000) }
  ])
    denied(
      await send(target, f.reader, { ...input, ...fields }),
      400,
      "validation"
    );
  denied(await send(target, f.owner, input), 403, "forbidden");
  denied(
    await send(path(f.post.id, "missing"), f.reader, input),
    404,
    "not_found"
  );
  for (const method of ["GET", "PUT", "PATCH", "DELETE", "OPTIONS"]) {
    const response = await send(
      target,
      f.reader,
      method === "GET" ? undefined : input,
      {},
      method
    );
    denied(response, 405, "method_not_allowed");
    assert.match(String(response.headers.allow), /POST/);
  }
  const saved = await db.platformPostComment.findUniqueOrThrow({
    where: { id: f.comment.id }
  });
  assert.equal(saved.content, f.comment.content);
  assert.equal(saved.version, 1);
  assert.equal(
    await db.socialOperation.count({ where: { ownerId: f.reader.id } }),
    0
  );
});

test("trusted HTTPS corrected comment retains the canonical fixture for actual website edit acceptance", async () => {
  const f = await fixture(),
    nativeInput = change({
      content: "Fictional native correction visible on the website"
    });
  const nativeReceipt = ok(
    await send(path(f.post.id, f.comment.id), f.reader, nativeInput),
    f.reader.id
  );
  writeFileSync(
    join(
      dirname(process.env.ACCOUNT_TEST_SINK_DIR!),
      "comment-editing-browser-fixture.json"
    ),
    JSON.stringify(
      {
        owner: f.owner,
        reader: f.reader,
        postId: f.post.id,
        commentId: f.comment.id,
        content: nativeInput.content,
        nativeInput,
        nativeReceipt
      },
      null,
      2
    ),
    { flag: "wx", mode: 0o600 }
  );
});
