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
const path = (postId: string) =>
  "/api/platform/v1/posts/" + postId + "/comments";
const change = (fields: Record<string, unknown> = {}) => ({
  mutationId: randomUUID(),
  content: "Fictional native HTTP publication",
  replyToId: null,
  authorChurchId: null,
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
      request.destroy(Error("Fictional comment publication HTTPS timeout"))
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
    "createComment",
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
  const owner = await createPortalActor(db, "publishhttpowner"),
    reader = await createPortalActor(db, "publishhttpreader");
  const post = await db.platformPost.create({
    data: {
      authorId: owner.id,
      content: "Fictional native publication browser post",
      publishedAt: new Date()
    }
  });
  return { owner, reader, post };
}
const webHeaders = (actor: Actor) => ({
  Origin: origin,
  Cookie: sessionCookieFixtureName(origin) + "=" + actor.token,
  "X-Expected-Account": actor.id
});

test("trusted HTTPS website and native publication share the exact canonical receipt in both directions", async () => {
  for (const first of ["native", "web"]) {
    const f = await fixture(),
      input = change({ content: "Fictional raw\r\npublication" });
    const native = () => send(path(f.post.id), f.reader, input);
    const web = () =>
      send(
        "/api/platform/comments",
        null,
        { operation: "create", ...input, postId: f.post.id },
        webHeaders(f.reader)
      );
    if (first === "native") ok(await native(), f.reader.id);
    else assert.equal((await web()).status, 200);
    const receipt = ok(await native(), f.reader.id),
      webReply = await web();
    assert.equal(webReply.status, 200, webReply.bytes.toString());
    assert.deepEqual(JSON.parse(webReply.bytes.toString()), receipt);
    assert.equal(
      await db.platformPostComment.count({ where: { postId: f.post.id } }),
      1
    );
    assert.equal(
      await db.socialOperation.count({
        where: { ownerId: f.reader.id, key: "comments:" + input.mutationId }
      }),
      1
    );
    assert.equal(
      await db.privateCommentDraft.count({ where: { ownerId: f.reader.id } }),
      0
    );
    const read = await send(path(f.post.id), f.reader);
    privateResponse(read);
    const row = decodeApiResponse(
      "comments",
      JSON.parse(read.bytes.toString()),
      f.reader.id
    ).data.items[0];
    assert.ok(row.available && !row.requiresWeb);
    assert.equal(row.id, receipt.id);
    assert.equal(row.content, "Fictional raw\npublication");
    denied(
      await send(path(f.post.id), f.reader, { ...input, content: row.content }),
      409,
      "conflict"
    );
  }
});

test("trusted HTTPS publishing rejects browser authority, foreign owners, unsupported versions and body injection", async () => {
  const f = await fixture(),
    target = path(f.post.id),
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
    await send(target + "?draftId=foreign", f.reader, input),
    400,
    "validation"
  );
  for (const fields of [
    { postId: "other" },
    { operation: "delete" },
    { ownerId: f.owner.id },
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
  denied(await send(path("missing"), f.reader, input), 404, "not_found");
  for (const method of ["PUT", "PATCH", "DELETE", "OPTIONS"]) {
    const response = await send(target, f.reader, input, {}, method);
    denied(response, 405, "method_not_allowed");
    assert.match(String(response.headers.allow), /POST/);
  }
  assert.equal(
    await db.platformPostComment.count({ where: { postId: f.post.id } }),
    0
  );
});

test("trusted HTTPS root and child publication retain one canonical fixture for actual website acceptance", async () => {
  const f = await fixture();
  const input = change({
    content: "Fictional native root for website acceptance"
  });
  const root = ok(await send(path(f.post.id), f.reader, input), f.reader.id);
  const childInput = change({
    content: "Fictional native child for website acceptance",
    replyToId: root.id,
    mentionIds: [f.owner.id]
  });
  const child = ok(
    await send(path(f.post.id), f.reader, childInput),
    f.reader.id
  );
  const read = await send(
    path(f.post.id) + "?view=context&commentId=" + child.id,
    f.reader
  );
  assert.equal(read.status, 200, read.bytes.toString());
  const view = decodeApiResponse(
    "comments",
    JSON.parse(read.bytes.toString()),
    f.reader.id
  ).data;
  assert.equal(view.root?.id, root.id);
  assert.equal(view.target?.id, child.id);
  assert.equal(
    await db.socialEvent.count({
      where: {
        kind: "COMMENT_ACTIVITY",
        commentId: child.id,
        recipientId: f.owner.id
      }
    }),
    1
  );
  writeFileSync(
    join(
      dirname(process.env.ACCOUNT_TEST_SINK_DIR!),
      "comment-publishing-browser-fixture.json"
    ),
    JSON.stringify(
      {
        owner: f.owner,
        reader: f.reader,
        postId: f.post.id,
        rootId: root.id,
        childId: child.id,
        rootContent: input.content,
        childContent: childInput.content,
        nativeInput: input,
        nativeReceipt: root
      },
      null,
      2
    ),
    { flag: "wx", mode: 0o600 }
  );
});
