import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { setTimeout as delay } from "node:timers/promises";
import { PrismaClient } from "@prisma/client";
import { assertPortalTestDatabase, createPortalActor } from "./seed-portal";
import { handleNativeCommentReadRequest } from "../lib/platform/native-comment-boundary";
import { readComments } from "../lib/platform/comment-reads";
import { commentCommand } from "../lib/platform/comment-commands";
import { hashSessionToken } from "../lib/platform/auth";
import { sessionCookieFixtureName } from "../scripts/session-cookie-fixture.mjs";
import {
  apiFailure,
  decodeApiResponse,
  wire
} from "../lib/platform/api-contracts";
import {
  nativeReadCursors,
  NATIVE_CURSOR_LIFETIME_MS
} from "../lib/platform/native-read-cursors";

const db = new PrismaClient();
before(() => assertPortalTestDatabase(db));
after(() => db.$disconnect());
type Actor = { id: string; token: string };
const command = (operation: string, fields: Record<string, unknown>) => ({
  operation,
  mutationId: randomUUID(),
  ...fields
});
async function fixture(label: string) {
  const owner = await createPortalActor(db, label + "owner");
  const reader = await createPortalActor(db, label + "reader");
  const post = await db.platformPost.create({
    data: {
      authorId: owner.id,
      content: "Fictional native conversation",
      publishedAt: new Date(Date.now() - 1000)
    }
  });
  return { owner, reader, post };
}
async function call(
  postId: string,
  actor: Actor | null = null,
  query: Record<string, string> = {},
  headers: Record<string, string> = {},
  method = "GET"
) {
  const url = new URL(
    `/api/platform/v1/posts/${postId}/comments`,
    process.env.ACCOUNT_ORIGIN!
  );
  for (const [key, value] of Object.entries(query))
    url.searchParams.set(key, value);
  const response = await handleNativeCommentReadRequest(
    db,
    new Request(url, {
      method,
      headers: {
        ...(actor
          ? {
              Authorization: "Bearer " + actor.token,
              "X-Expected-Account": actor.id
            }
          : {}),
        ...headers
      }
    }),
    { postId }
  );
  assert.match(response.headers.get("cache-control")!, /private.*no-store/);
  assert.equal(response.headers.get("cdn-cache-control"), "no-store");
  assert.equal(response.headers.get("vercel-cdn-cache-control"), "no-store");
  assert.equal(response.headers.get("set-cookie"), null);
  assert.equal(response.headers.get("location"), null);
  assert.equal(response.headers.get("x-api-version"), "1");
  return { response, value: await response.json() };
}
function ok(
  result: Awaited<ReturnType<typeof call>>,
  owner: string | null = null
) {
  assert.equal(result.response.status, 200, JSON.stringify(result.value));
  return decodeApiResponse("comments", result.value, owner).data;
}
function denied(
  result: Awaited<ReturnType<typeof call>>,
  status: number,
  code: string
) {
  assert.equal(result.response.status, status, JSON.stringify(result.value));
  assert.equal(apiFailure.parse(result.value).error.code, code);
  assert.equal(result.value.data, undefined);
}

test("bounded root pages preserve both stable sorts, pins and an exact target beyond the first reply page", async () => {
  const f = await fixture("cpages");
  const ids = Array.from({ length: 60 }, () => randomUUID()).sort();
  const createdAt = new Date("2026-01-01T12:00:00.000Z");
  await db.platformPostComment.createMany({
    data: ids.map((id, i) => ({
      id,
      postId: f.post.id,
      authorId: f.reader.id,
      content: `Fictional root ${i}`,
      createdAt
    }))
  });
  const replies = Array.from({ length: 25 }, () => randomUUID()).sort();
  await db.platformPostComment.createMany({
    data: replies.map((id, i) => ({
      id,
      postId: f.post.id,
      authorId: f.owner.id,
      rootId: ids[0],
      parentId: i ? replies[i - 1] : ids[0],
      content: `Fictional nested reply ${i}`,
      createdAt
    }))
  });
  await commentCommand(
    db,
    f.owner.token,
    command("pin", { postId: f.post.id, commentId: ids[0], expectedVersion: 0 })
  );
  for (const sort of ["oldest", "newest"]) {
    let cursor: string | null = null;
    const seen: string[] = [];
    for (let page = 0; page < 3; page++) {
      const result = ok(
        await call(f.post.id, null, { sort, ...(cursor ? { cursor } : {}) })
      );
      assert.equal(result.items.length, 20);
      assert.equal(result.visibleCount, 85);
      assert.equal(result.pinned?.id, ids[0]);
      assert.equal(result.requiresWeb, true);
      seen.push(...result.items.map((row) => row.id));
      cursor = result.nextCursor;
    }
    assert.equal(cursor, null);
    assert.deepEqual(seen, sort === "oldest" ? ids : [...ids].reverse());
  }
  const context = ok(
    await call(f.post.id, f.reader, {
      view: "context",
      commentId: replies[24]
    }),
    f.reader.id
  );
  assert.equal(context.root?.id, ids[0]);
  assert.equal(context.items.length, 20);
  assert.equal(context.target?.id, replies[24]);
  assert.ok(!context.items.some((row) => row.id === context.target?.id));
  assert.ok(context.nextCursor);
  const tail = ok(
    await call(f.post.id, f.reader, {
      view: "context",
      commentId: replies[24],
      cursor: context.nextCursor
    }),
    f.reader.id
  );
  assert.equal(tail.items.length, 5);
  assert.equal(tail.nextCursor, null);
  assert.equal(tail.target?.id, replies[24]);
  const web = await readComments(
    db,
    f.reader.token,
    { postId: f.post.id, view: "context", commentId: replies[24] },
    f.reader.id
  );
  assert.equal(web.kind, "thread");
  if (web.kind !== "thread") throw new Error("Expected thread");
  assert.deepEqual(
    context.items.map((row) => row.id),
    web.items.map((row) => row.id)
  );
  assert.equal(context.visibleCount, web.visibleCount);
});

test("native cursors bind viewer, post, view, selectors and sort without renewing their deadline", async () => {
  const f = await fixture("ccursor");
  const ids = Array.from({ length: 45 }, () => randomUUID()).sort();
  await db.platformPostComment.createMany({
    data: ids.map((id) => ({
      id,
      postId: f.post.id,
      authorId: f.owner.id,
      content: "Fictional cursor row"
    }))
  });
  const first = ok(await call(f.post.id, f.reader), f.reader.id);
  assert.ok(first.nextCursor);
  const cursor = first.nextCursor;
  const second = ok(await call(f.post.id, f.reader, { cursor }), f.reader.id);
  assert.ok(second.nextCursor);
  const envelope = (value: string) =>
    JSON.parse(
      gunzipSync(Buffer.from(value.split(".")[0], "base64url")).toString()
    ) as { expires: number; value: string };
  assert.equal(envelope(second.nextCursor).expires, envelope(cursor).expires);
  const otherPost = await db.platformPost.create({
    data: {
      authorId: f.owner.id,
      content: "Other fictional post",
      publishedAt: new Date()
    }
  });
  for (const result of [
    await call(f.post.id, f.owner, { cursor }),
    await call(f.post.id, null, { cursor }),
    await call(otherPost.id, f.reader, { cursor }),
    await call(f.post.id, f.reader, { cursor, sort: "newest" }),
    await call(f.post.id, f.reader, {
      cursor,
      view: "replies",
      rootId: ids[0]
    }),
    await call(f.post.id, f.reader, {
      cursor,
      view: "context",
      commentId: ids[0]
    }),
    await call(f.post.id, f.reader, { cursor: cursor.slice(0, -3) + "abc" })
  ])
    denied(result, 409, "cursor_invalid");
  const expired = nativeReadCursors(
    ["comments", f.reader.id, f.post.id, "roots", "oldest", null, null],
    wire.text(600, 1, /^[A-Za-z0-9_.-]+$/),
    new Date(Date.now() - NATIVE_CURSOR_LIFETIME_MS - 1000)
  ).encode(envelope(cursor).value);
  denied(
    await call(f.post.id, f.reader, { cursor: expired }),
    409,
    "cursor_invalid"
  );
  denied(
    await call(f.post.id, f.reader, { cursor: envelope(cursor).value }),
    409,
    "cursor_invalid"
  );
});

test("native guests remain distinct from invalid, expired or mismatched account credentials", async () => {
  const f = await fixture("cauth");
  assert.deepEqual(ok(await call(f.post.id)).items, []);
  denied(
    await call(f.post.id, { id: f.reader.id, token: "a".repeat(43) }),
    401,
    "unauthenticated"
  );
  denied(
    await call(f.post.id, f.reader, {}, { "X-Expected-Account": f.owner.id }),
    401,
    "account_changed"
  );
  denied(
    await call(
      f.post.id,
      null,
      {},
      { Authorization: "Bearer " + f.reader.token }
    ),
    400,
    "validation"
  );
  denied(
    await call(f.post.id, null, {}, { "X-Expected-Account": f.reader.id }),
    401,
    "unauthenticated"
  );
  denied(
    await call(
      f.post.id,
      null,
      {},
      { Cookie: `${sessionCookieFixtureName()}=${f.reader.token}` }
    ),
    401,
    "unauthenticated"
  );
  denied(
    await call(f.post.id, null, {}, { Origin: process.env.ACCOUNT_ORIGIN! }),
    403,
    "forbidden"
  );
  denied(
    await call(f.post.id, f.reader, { view: "drafts" }),
    400,
    "validation"
  );
  denied(
    await call(f.post.id, f.reader, { view: "mentions" }),
    400,
    "validation"
  );
  denied(
    await call(f.post.id, f.reader, { ownerId: f.owner.id }),
    400,
    "validation"
  );
  denied(
    await call(f.post.id, f.reader, {}, {}, "POST"),
    405,
    "method_not_allowed"
  );
  await db.platformSession.update({
    where: { tokenHash: hashSessionToken(f.reader.token) },
    data: { expiresAt: new Date(Date.now() - 1) }
  });
  denied(await call(f.post.id, f.reader), 401, "unauthenticated");
  assert.deepEqual(ok(await call(f.post.id)).items, []);
});

test("current hidden parent, reaction preferences, church voice and legacy text retain distinct bounded projections", async () => {
  const f = await fixture("cprivacy");
  const root = await commentCommand(
    db,
    f.owner.token,
    command("create", {
      postId: f.post.id,
      content: "Fictional root to remove"
    })
  );
  const reply = await commentCommand(
    db,
    f.reader.token,
    command("create", {
      postId: f.post.id,
      replyToId: root.id,
      content: "Fictional visible child"
    })
  );
  await commentCommand(
    db,
    f.owner.token,
    command("like", {
      postId: f.post.id,
      commentId: reply.id,
      desired: true,
      expectedVersion: 0
    })
  );
  await db.socialPreferences.upsert({
    where: { ownerId: f.reader.id },
    create: { ownerId: f.reader.id, hideAuthoredReactionCounts: true },
    update: { hideAuthoredReactionCounts: true }
  });
  await commentCommand(
    db,
    f.owner.token,
    command("delete", {
      postId: f.post.id,
      commentId: root.id,
      expectedVersion: root.version
    })
  );
  const view = ok(
    await call(f.post.id, f.owner, { view: "replies", rootId: root.id }),
    f.owner.id
  );
  assert.ok(view.root && !view.root.available);
  assert.deepEqual(Object.keys(view.root).sort(), [
    "available",
    "createdAt",
    "id",
    "parentId",
    "replyCount",
    "rootId"
  ]);
  const item = view.items[0];
  assert.ok(item.available && !item.requiresWeb);
  assert.equal(item.likeCount, null);
  assert.deepEqual(item.ownReaction, { liked: true, version: 1 });
  assert.equal(item.replyTo?.name, null);
  denied(
    await call(f.post.id, null, { view: "context", commentId: root.id }),
    404,
    "not_found"
  );
  const church = await db.church.create({
    data: {
      slug: "fictional-" + randomUUID(),
      name: "Fictional speaking church",
      summary: "Isolated test church"
    }
  });
  const churchComment = await db.platformPostComment.create({
    data: {
      postId: f.post.id,
      authorId: f.reader.id,
      authorChurchId: church.id,
      content: "Fictional church voice"
    }
  });
  const legacy = await db.platformPostComment.create({
    data: { postId: f.post.id, authorId: f.owner.id, content: "L".repeat(1501) }
  });
  const empty = await db.platformPostComment.create({
    data: { postId: f.post.id, authorId: f.owner.id, content: "" }
  });
  const roots = ok(await call(f.post.id));
  const speaker = roots.items.find((row) => row.id === churchComment.id);
  assert.ok(speaker?.available && !speaker.requiresWeb);
  assert.deepEqual(speaker.author, {
    kind: "church",
    id: church.id,
    name: church.name
  });
  assert.equal(speaker.likeCount, 0);
  assert.equal(speaker.ownReaction, null);
  assert.ok(!JSON.stringify(speaker).includes(f.reader.id));
  const long = roots.items.find((row) => row.id === legacy.id);
  assert.ok(long?.available && long.requiresWeb);
  assert.equal("content" in long, false);
  const emptyRow = roots.items.find((row) => row.id === empty.id);
  assert.ok(emptyRow?.available && !emptyRow.requiresWeb);
  assert.equal(emptyRow.content, "");
  assert.equal(
    (
      await db.platformPostComment.findUniqueOrThrow({
        where: { id: legacy.id }
      })
    ).content.length,
    1501
  );
});

test("withdrawal, blocking and lost membership are rechecked rather than authorized by old cursors", async () => {
  for (const change of ["withdraw", "block", "membership"] as const) {
    const f = await fixture("closs");
    let churchId: string | null = null;
    if (change === "membership") {
      const church = await db.church.create({
        data: {
          slug: "fictional-" + randomUUID(),
          name: "Fictional private church",
          summary: "Isolated test church"
        }
      });
      churchId = church.id;
      await db.churchConnection.create({
        data: { churchId, userId: f.reader.id, state: "APPROVED" }
      });
      await db.platformPost.update({
        where: { id: f.post.id },
        data: { audience: "CHURCH", audienceChurchId: churchId }
      });
    }
    await db.platformPostComment.createMany({
      data: Array.from({ length: 21 }, () => ({
        postId: f.post.id,
        authorId: f.owner.id,
        content: "Fictional currently permitted content"
      }))
    });
    const first = ok(await call(f.post.id, f.reader), f.reader.id);
    assert.ok(first.nextCursor);
    if (change === "withdraw")
      await db.platformPost.update({
        where: { id: f.post.id },
        data: { status: "WITHDRAWN", withdrawnAt: new Date() }
      });
    if (change === "block")
      await db.socialRelationship.create({
        data: { ownerId: f.reader.id, targetUserId: f.owner.id, blocked: true }
      });
    if (change === "membership")
      await db.churchConnection.update({
        where: {
          userId_churchId: { userId: f.reader.id, churchId: churchId! }
        },
        data: { state: "REMOVED" }
      });
    denied(
      await call(f.post.id, f.reader, { cursor: first.nextCursor }),
      404,
      "not_found"
    );
    denied(await call(f.post.id, f.reader), 404, "not_found");
  }
});

test("queued native comment reads revalidate supplied session identity inside the shared permission lock", async () => {
  for (const change of ["expiry", "revocation"] as const) {
    const f = await fixture("cqueued");
    let enter!: () => void, release!: () => void;
    const entered = new Promise<void>((resolve) => {
      enter = resolve;
    });
    const released = new Promise<void>((resolve) => {
      release = resolve;
    });
    const writer = db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(730221, 2)`;
      enter();
      await released;
      if (change === "expiry")
        await tx.platformSession.update({
          where: { tokenHash: hashSessionToken(f.reader.token) },
          data: { expiresAt: new Date(Date.now() - 1) }
        });
      else
        await tx.platformSession.delete({
          where: { tokenHash: hashSessionToken(f.reader.token) }
        });
    });
    await entered;
    let settled = false;
    const reader = call(f.post.id, f.reader).then((result) => {
      settled = true;
      return result;
    });
    try {
      await delay(70);
      assert.equal(settled, false);
    } finally {
      release();
      await writer;
    }
    denied(await reader, 401, "unauthenticated");
  }
});
