import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { request as httpsRequest } from "node:https";
import { randomUUID } from "node:crypto";
import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { PrismaClient } from "@prisma/client";
import { assertPortalTestDatabase, createPortalActor } from "./seed-portal";
import { apiFailure, decodeApiResponse } from "../lib/platform/api-contracts";
import { commentCommand } from "../lib/platform/comment-commands";
import { sessionCookieFixtureName } from "../scripts/session-cookie-fixture.mjs";

const db = new PrismaClient(),
  origin = process.env.ACCOUNT_ORIGIN!;
assert.match(origin, /^https:\/\/127\.0\.0\.1:\d+$/);
before(() => assertPortalTestDatabase(db));
after(() => db.$disconnect());
type Actor = { id: string; token: string };
const path = (postId: string, commentId: string) =>
  `/api/platform/v1/posts/${postId}/comments/${commentId}/delete`;
const change = () => ({ mutationId: randomUUID(), expectedVersion: 1 });
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
      request.destroy(Error("Fictional comment deletion HTTPS timeout"))
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
function ok(r: Result, owner: string, pending = false) {
  assert.equal(r.status, pending ? 202 : 200, r.bytes.toString());
  privateResponse(r);
  const data = decodeApiResponse(
    "deleteComment",
    JSON.parse(r.bytes.toString()),
    owner
  ).data;
  assert.equal(data.recoveryPending, pending);
  return data;
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
  const owner = await createPortalActor(db, "deletehttpowner"),
    reader = await createPortalActor(db, "deletehttpreader");
  const post = await db.platformPost.create({
    data: {
      authorId: owner.id,
      content: "Fictional native deletion browser post",
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

test("trusted HTTPS native and website deletions share the same once-only receipt in both directions", async () => {
  for (const first of ["native", "web"]) {
    const f = await fixture(),
      input = change(),
      target = path(f.post.id, f.comment.id);
    const native = () => send(target, f.reader, input);
    const web = () =>
      send(
        "/api/platform/comments",
        null,
        {
          operation: "delete",
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
    assert.deepEqual(JSON.parse(webReply.bytes.toString()), {
      id: receipt.id,
      version: receipt.version,
      message: receipt.message
    });
    assert.equal(receipt.id, f.comment.id);
    assert.equal(receipt.version, 2);
    assert.equal(
      await db.socialOperation.count({
        where: { ownerId: f.reader.id, key: "comments:" + input.mutationId }
      }),
      1
    );
    const saved = await db.platformPostComment.findUniqueOrThrow({
      where: { id: f.comment.id }
    });
    assert.equal(saved.content, "");
    assert.ok(saved.deletedAt);
    const read = await send(
      `/api/platform/v1/posts/${f.post.id}/comments`,
      f.reader
    );
    privateResponse(read);
    assert.equal(read.status, 200);
    assert.equal(
      decodeApiResponse(
        "comments",
        JSON.parse(read.bytes.toString()),
        f.reader.id
      ).data.items.length,
      0
    );
    denied(
      await send(target, f.reader, { ...input, expectedVersion: 2 }),
      409,
      "conflict"
    );
    denied(await send(target, f.reader, change()), 404, "not_found");
    assert.deepEqual(
      await db.platformPostComment.findUniqueOrThrow({
        where: { id: f.comment.id }
      }),
      saved
    );
  }
});

test("trusted HTTPS deletion rejects borrowed authority, foreign targets, injection and unsupported methods", async () => {
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
  for (const extra of [{ Origin: origin }, { "Sec-Fetch-Site": "same-origin" }])
    denied(await send(target, f.reader, input, extra), 403, "forbidden");
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
    await send(target + "?operation=edit", f.reader, input),
    400,
    "validation"
  );
  for (const fields of [
    { postId: "other" },
    { commentId: "other" },
    { operation: "edit" },
    { ownerId: f.owner.id },
    { authorChurchId: null },
    { replyToId: null },
    { draftId: "foreign" },
    { content: "replacement" },
    { expectedVersion: -1 },
    { padding: "x".repeat(17000) }
  ])
    denied(
      await send(target, f.reader, { ...input, ...fields }),
      400,
      "validation"
    );
  denied(await send(target, f.owner, input), 403, "forbidden");
  denied(
    await send(path("missing-post", f.comment.id), f.reader, input),
    404,
    "not_found"
  );
  denied(
    await send(path(f.post.id, "missing-comment"), f.reader, input),
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
  const head = await send(target, f.reader, undefined, {}, "HEAD");
  assert.equal(head.status, 405);
  assert.equal(head.bytes.length, 0);
  privateResponse(head);
  assert.match(String(head.headers.allow), /POST/);
  const saved = await db.platformPostComment.findUniqueOrThrow({
    where: { id: f.comment.id }
  });
  assert.equal(saved.content, f.comment.content);
  assert.equal(saved.version, 1);
  assert.equal(saved.deletedAt, null);
  assert.equal(
    await db.socialOperation.count({ where: { ownerId: f.reader.id } }),
    0
  );
});

test("trusted HTTPS deletion reports pending protection and an exact retry repairs only the fictional journal", async () => {
  const f = await fixture(),
    input = change();
  await db.communityReport.create({
    data: {
      reporterId: f.owner.id,
      targetType: "COMMENT",
      targetId: f.comment.id,
      targetVersion: 1,
      reason: "PRIVACY",
      details: "Fictional deletion recovery report"
    }
  });
  // Model a website deletion whose acknowledgement was lost before protection.
  const canonical = await commentCommand(db, f.reader.token, {
    operation: "delete",
    ...input,
    postId: f.post.id,
    commentId: f.comment.id
  });
  const control = await db.retentionControl.findFirstOrThrow({
    where: { kind: "AUTHOR_WITHDRAW_COMMENT", sourceId: f.comment.id }
  });
  const journalRoot = resolve(process.env.RETENTION_TEST_DIR!);
  assert.ok(journalRoot.startsWith(resolve(".account-test") + sep));
  const journalFile = join(
    journalRoot,
    "retention-v1",
    "controls",
    control.id + ".json"
  );
  mkdirSync(dirname(journalFile), { recursive: true, mode: 0o700 });
  // Exclusive create affects this new fictional control only. Preserve its bad
  // bytes as evidence when allowing the canonical exact retry to recover.
  writeFileSync(
    journalFile,
    JSON.stringify({ fictionalInterruptedWrite: true }),
    { flag: "wx", mode: 0o600 }
  );
  const pending = ok(
    await send(path(f.post.id, f.comment.id), f.reader, input),
    f.reader.id,
    true
  );
  assert.equal(pending.id, canonical.id);
  assert.equal(pending.version, canonical.version);
  assert.match(pending.message, /removal is saved.*protection is pending/);
  assert.ok(!JSON.stringify(pending).includes(f.comment.content));
  const webPending = await send(
    "/api/platform/comments",
    null,
    {
      operation: "delete",
      ...input,
      postId: f.post.id,
      commentId: f.comment.id
    },
    webHeaders(f.reader)
  );
  assert.equal(webPending.status, 202, webPending.bytes.toString());
  assert.deepEqual(JSON.parse(webPending.bytes.toString()), {
    id: pending.id,
    version: pending.version,
    message: pending.message
  });
  assert.equal(
    (await db.retentionControl.findUniqueOrThrow({ where: { id: control.id } }))
      .journaledAt,
    null
  );
  renameSync(
    journalFile,
    join(
      dirname(process.env.ACCOUNT_TEST_SINK_DIR!),
      "failed-comment-control-" + control.id + ".json"
    )
  );
  const confirmed = ok(
    await send(path(f.post.id, f.comment.id), f.reader, input),
    f.reader.id
  );
  assert.deepEqual(confirmed, { ...canonical, recoveryPending: false });
  const saved = await db.platformPostComment.findUniqueOrThrow({
    where: { id: f.comment.id }
  });
  assert.equal(saved.content, f.comment.content);
  assert.ok(saved.deletedAt);
  assert.equal(saved.version, 2);
  assert.ok(
    (await db.retentionControl.findUniqueOrThrow({ where: { id: control.id } }))
      .journaledAt
  );
  assert.equal(
    await db.retentionControl.count({
      where: { kind: "AUTHOR_WITHDRAW_COMMENT", sourceId: f.comment.id }
    }),
    1
  );
  assert.equal(
    await db.socialOperation.count({
      where: { ownerId: f.reader.id, key: "comments:" + input.mutationId }
    }),
    1
  );
});

test("trusted HTTPS native deletion keeps a neutral parent and prepares actual website confirmation and retry checks", async () => {
  const f = await fixture();
  const reply = await db.platformPostComment.create({
    data: {
      postId: f.post.id,
      authorId: f.owner.id,
      parentId: f.comment.id,
      rootId: f.comment.id,
      content: "Fictional reply survives native deletion"
    }
  });
  const webComment = await db.platformPostComment.create({
    data: {
      postId: f.post.id,
      authorId: f.reader.id,
      content: "Fictional website deletion target"
    }
  });
  const webReply = await db.platformPostComment.create({
    data: {
      postId: f.post.id,
      authorId: f.owner.id,
      parentId: webComment.id,
      rootId: webComment.id,
      content: "Fictional reply survives website deletion"
    }
  });
  const nativeInput = change(),
    nativeReceipt = ok(
      await send(path(f.post.id, f.comment.id), f.reader, nativeInput),
      f.reader.id
    );
  const read = await send(
    `/api/platform/v1/posts/${f.post.id}/comments?view=replies&rootId=${f.comment.id}`,
    f.reader
  );
  assert.equal(read.status, 200);
  privateResponse(read);
  const view = decodeApiResponse(
    "comments",
    JSON.parse(read.bytes.toString()),
    f.reader.id
  ).data;
  assert.ok(view.root && !view.root.available);
  assert.equal(view.items[0].id, reply.id);
  assert.ok(!JSON.stringify(view.root).includes(f.comment.content));
  writeFileSync(
    join(
      dirname(process.env.ACCOUNT_TEST_SINK_DIR!),
      "comment-deletion-browser-fixture.json"
    ),
    JSON.stringify(
      {
        owner: f.owner,
        reader: f.reader,
        postId: f.post.id,
        commentId: f.comment.id,
        replyId: reply.id,
        replyText: reply.content,
        webCommentId: webComment.id,
        webCommentText: webComment.content,
        webReplyId: webReply.id,
        webReplyText: webReply.content,
        nativeInput,
        nativeReceipt
      },
      null,
      2
    ),
    { flag: "wx", mode: 0o600 }
  );
});
