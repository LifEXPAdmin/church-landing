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
const path = "/api/platform/v1/bookmarks";
const statusPath = (id: string) => `/api/platform/v1/posts/${id}/bookmark`;
const collectionsPath = "/api/platform/v1/bookmark-collections";
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
      request.destroy(new Error("Fictional native bookmarks HTTPS timeout"))
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
  const author = await createPortalActor(db, "nb_author");
  const viewer = await createPortalActor(db, "nb_viewer");
  const post = await db.platformPost.create({
    data: {
      authorId: author.id,
      content: "Fictional native bookmark HTTPS source",
      publishedAt: new Date(Date.now() - 1000)
    }
  });
  return { author, viewer, post };
}
const command = (operation: string, fields: Record<string, unknown>) => ({
  operation,
  mutationId: randomUUID(),
  ...fields
});
const save = (postId: string) =>
  command("save-item", {
    postId,
    expectedVersion: 0,
    collectionId: null
  });

test("HTTPS native bookmarks share original web receipts and cannot remove a later replacement", async () => {
  const f = await fixture();
  assert.deepEqual(ok("bookmarks", await send(path, f.viewer), f.viewer.id), {
    items: [],
    nextCursor: null
  });
  assert.deepEqual(
    ok(
      "bookmarkStatus",
      await send(statusPath(f.post.id), f.viewer),
      f.viewer.id
    ),
    { item: null }
  );
  const input = save(f.post.id),
    bytes = json(input);
  const receipts = await Promise.all([
    send(path, f.viewer, "POST", bytes),
    send(path, f.viewer, "POST", bytes)
  ]);
  const receipt = ok("bookmarkCommand", receipts[0], f.viewer.id);
  assert.deepEqual(ok("bookmarkCommand", receipts[1], f.viewer.id), receipt);
  assert.deepEqual(
    webOk(await webPost("/api/platform/post-workspace", f.viewer, bytes)),
    receipt
  );
  denied(
    await send(
      path,
      f.viewer,
      "POST",
      json({ ...input, collectionId: "different" })
    ),
    409,
    "conflict"
  );
  const collection = webOk(
    await webPost(
      "/api/platform/post-workspace",
      f.viewer,
      json(
        command("create-collection", {
          id: randomUUID(),
          name: "Fictional HTTPS collection",
          expectedVersion: 0
        })
      )
    )
  );
  const collections = ok(
    "bookmarkCollections",
    await send(collectionsPath, f.viewer),
    f.viewer.id
  );
  assert.equal(collections.items[0].id, collection.id);
  assert.equal(collections.items[0].name, "Fictional HTTPS collection");
  const moved = ok(
    "bookmarkCommand",
    await send(
      path,
      f.viewer,
      "POST",
      json(
        command("move-item", {
          id: receipt.id,
          expectedVersion: receipt.version,
          collectionId: collection.id
        })
      )
    ),
    f.viewer.id
  );
  const filtered = ok(
    "bookmarks",
    await send(path + "?collectionId=" + collection.id, f.viewer),
    f.viewer.id
  );
  assert.equal(filtered.items.length, 1);
  assert.deepEqual(
    ok(
      "bookmarkStatus",
      await send(statusPath(f.post.id), f.viewer),
      f.viewer.id
    ),
    {
      item: {
        id: receipt.id,
        version: moved.version,
        collectionId: collection.id
      }
    }
  );
  const remove = json(
    command("remove-item", { id: receipt.id, expectedVersion: moved.version })
  );
  const removed = ok(
    "bookmarkCommand",
    await send(path, f.viewer, "POST", remove),
    f.viewer.id
  );
  const replacement = ok(
    "bookmarkCommand",
    await send(path, f.viewer, "POST", json(save(f.post.id))),
    f.viewer.id
  );
  assert.notEqual(replacement.id, receipt.id);
  assert.deepEqual(
    ok(
      "bookmarkCommand",
      await send(path, f.viewer, "POST", remove),
      f.viewer.id
    ),
    removed
  );
  assert.deepEqual(
    webOk(await webPost("/api/platform/post-workspace", f.viewer, remove)),
    removed
  );
  assert.equal(
    await db.savedPostItem.count({
      where: { ownerId: f.viewer.id, id: replacement.id }
    }),
    1
  );
  assert.equal(
    await db.postWorkspaceOperation.count({
      where: { ownerId: f.viewer.id, key: input.mutationId }
    }),
    1
  );
});

test("HTTPS current visibility hides bookmarked source metadata in web and native status reads", async () => {
  const f = await fixture();
  const input = save(f.post.id);
  const receipt = ok(
    "bookmarkCommand",
    await send(path, f.viewer, "POST", json(input)),
    f.viewer.id
  );
  await db.platformPost.update({
    where: { id: f.post.id },
    data: { status: "WITHDRAWN", withdrawnAt: new Date() }
  });
  denied(await send(statusPath(f.post.id), f.viewer), 404, "not_found");
  const webStatus = await send(
    "/api/platform/post-workspace?view=saved-status&postId=" + f.post.id,
    null,
    "GET",
    undefined,
    webHeaders(f.viewer)
  );
  assert.equal(webStatus.status, 404);
  assert.doesNotMatch(webStatus.bytes.toString(), new RegExp(receipt.id));
  assert.deepEqual(ok("bookmarks", await send(path, f.viewer), f.viewer.id), {
    items: [
      {
        id: receipt.id,
        version: receipt.version,
        collectionId: null,
        available: false
      }
    ],
    nextCursor: null
  });
  denied(
    await send(path, f.viewer, "POST", json(save(f.post.id))),
    404,
    "not_found"
  );
  // Exact receipt replay acknowledges the historical save; it does not restore current visibility.
  assert.deepEqual(
    ok(
      "bookmarkCommand",
      await send(path, f.viewer, "POST", json(input)),
      f.viewer.id
    ),
    receipt
  );
});

test("HTTPS bookmark identity, private headers and unsupported methods fail without cookie or redirect side effects", async () => {
  const f = await fixture();
  for (const target of [path, collectionsPath, statusPath(f.post.id)]) {
    denied(await send(target, null), 401, "unauthenticated");
    denied(
      await send(target, f.viewer, "GET", undefined, {
        "X-Expected-Account": f.author.id
      }),
      401,
      "account_changed"
    );
    denied(
      await send(target, f.viewer, "GET", undefined, { "X-API-Version": "2" }),
      426,
      "unsupported_version"
    );
    denied(
      await send(target, f.viewer, "GET", undefined, {
        Cookie: webHeaders(f.viewer).Cookie
      }),
      401,
      "unauthenticated"
    );
    for (const method of ["PUT", "PATCH", "DELETE", "OPTIONS"]) {
      const response = await send(target, f.viewer, method);
      denied(response, 405, "method_not_allowed");
      assert.equal(
        response.headers.allow,
        target === path ? "GET, POST" : "GET"
      );
    }
    const head = await send(target, f.viewer, "HEAD");
    assert.equal(head.status, 405);
    privateResponse(head);
    assert.equal(head.bytes.length, 0);
  }
  denied(
    await send(path, null, "POST", json(save(f.post.id)), {
      Authorization: "Bearer " + f.viewer.token
    }),
    400,
    "validation"
  );
  denied(
    await send(collectionsPath, f.viewer, "POST", json({})),
    405,
    "method_not_allowed"
  );
  denied(
    await send(statusPath(f.post.id), f.viewer, "POST", json({})),
    405,
    "method_not_allowed"
  );
  await db.platformSession.deleteMany({ where: { userId: f.viewer.id } });
  denied(await send(path, f.viewer), 401, "unauthenticated");
  denied(
    await send(path, f.viewer, "POST", json(save(f.post.id))),
    401,
    "unauthenticated"
  );
  assert.equal(
    await db.savedPostItem.count({ where: { ownerId: f.viewer.id } }),
    0
  );
});

test("HTTPS native bookmark transport rejects browser, query, oversized and non-bookmark payloads", async () => {
  const f = await fixture(),
    input = save(f.post.id);
  for (const headers of [
    { Origin: origin },
    { "Sec-Fetch-Site": "same-origin" },
    { "Sec-Fetch-Mode": "cors" }
  ] as Record<string, string>[])
    denied(
      await send(path, f.viewer, "POST", json(input), headers),
      403,
      "forbidden"
    );
  for (const query of [
    "?view=drafts",
    "?cursor=x&cursor=y",
    "?collectionId=x&collectionId=y"
  ])
    denied(await send(path + query, f.viewer), 400, "validation");
  for (const body of [
    { ...input, ownerId: f.author.id },
    { ...input, desired: true },
    { ...input, mutationId: "x".repeat(81) },
    { ...input, operation: "save-draft", payload: { content: "private" } },
    { ...input, operation: "publish-draft" },
    { ...input, operation: "create-collection" }
  ])
    denied(await send(path, f.viewer, "POST", json(body)), 400, "validation");
  denied(
    await send(path, f.viewer, "POST", Buffer.alloc(16385, "x")),
    400,
    "validation"
  );
  denied(
    await send(path, f.viewer, "POST", Buffer.from("{invalid")),
    400,
    "validation"
  );
  denied(
    await send(path, f.viewer, "POST", json(input), {
      "Content-Type": "text/plain"
    }),
    400,
    "validation"
  );
  assert.equal(
    await db.savedPostItem.count({ where: { ownerId: f.viewer.id } }),
    0
  );
  assert.equal(
    await db.postWorkspaceOperation.count({ where: { ownerId: f.viewer.id } }),
    0
  );
});

test("HTTPS saved pagination binds signed cursors to the endpoint, owner and collection", async () => {
  const f = await fixture(),
    suffix = randomUUID();
  const rows = Array.from({ length: 21 }, (_, i) => ({
    id: "http_" + String(i).padStart(2, "0") + "_" + suffix,
    ownerId: f.viewer.id,
    resourceKind: "eventOccurrence",
    resourceId: "missing_" + i
  }));
  await db.savedPostItem.createMany({ data: rows });
  const first = ok("bookmarks", await send(path, f.viewer), f.viewer.id);
  assert.equal(first.items.length, 20);
  assert.ok(first.nextCursor);
  const cursor = encodeURIComponent(first.nextCursor);
  const last = ok(
    "bookmarks",
    await send(path + "?cursor=" + cursor, f.viewer),
    f.viewer.id
  );
  assert.equal(last.items.length, 1);
  assert.equal(last.nextCursor, null);
  assert.deepEqual(
    [...first.items, ...last.items].map((item) => item.id),
    rows.map((row) => row.id)
  );
  denied(
    await send(path + "?cursor=" + cursor, f.author),
    409,
    "cursor_invalid"
  );
  denied(
    await send(path + "?cursor=" + cursor + "&collectionId=unfiled", f.viewer),
    409,
    "cursor_invalid"
  );
  denied(
    await send(collectionsPath + "?cursor=" + cursor, f.viewer),
    409,
    "cursor_invalid"
  );
});

test("HTTPS web and native bookmark writes share the same rate bucket and preserve a limited exact retry", async () => {
  const f = await fixture(),
    input = save(f.post.id),
    bytes = json(input);
  const receipt = ok(
    "bookmarkCommand",
    await send(path, f.viewer, "POST", bytes),
    f.viewer.id
  );
  assert.deepEqual(
    webOk(await webPost("/api/platform/post-workspace", f.viewer, bytes)),
    receipt
  );
  const key = createHmac("sha256", accountConfig().rateSecret)
    .update("post-workspace:" + f.viewer.id)
    .digest("hex");
  assert.equal(
    (await db.platformAuthLimit.findUniqueOrThrow({ where: { key } })).hits,
    2
  );
  await db.platformAuthLimit.update({
    where: { key },
    data: { hits: 240, expiresAt: new Date(Date.now() + 900000) }
  });
  const limited = await send(path, f.viewer, "POST", bytes);
  denied(limited, 429, "rate_limited");
  assert.equal(limited.headers["retry-after"], "900");
  assert.equal(
    (await webPost("/api/platform/post-workspace", f.viewer, bytes)).status,
    429
  );
  await db.platformAuthLimit.delete({ where: { key } });
  assert.deepEqual(
    ok(
      "bookmarkCommand",
      await send(path, f.viewer, "POST", bytes),
      f.viewer.id
    ),
    receipt
  );
  assert.equal(
    await db.savedPostItem.count({ where: { ownerId: f.viewer.id } }),
    1
  );
});
