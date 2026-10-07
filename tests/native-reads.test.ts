import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { PrismaClient } from "@prisma/client";
import { assertPortalTestDatabase, createPortalActor } from "./seed-portal";
import {
  handleNativeReadRequest,
  type NativeReadOperation
} from "../lib/platform/native-read-boundary";
import {
  decodeApiResponse,
  apiId,
  apiCursor,
  WireContractError,
  type ApiResponse
} from "../lib/platform/api-contracts";
import {
  nativeReadCursors,
  NativeCursorError,
  NATIVE_CURSOR_LIFETIME_MS
} from "../lib/platform/native-read-cursors";
import { hashSessionToken, createSessionToken } from "../lib/platform/auth";
import { loginAccount, updateAccountProfile } from "../lib/platform/accounts";
import { getProfileEditor } from "../lib/platform/profiles";
import { relationshipCommand } from "../lib/platform/relationships";
import { requestPermanentAccountDeletion } from "../lib/platform/account-deletion";
import { getPost } from "../lib/platform/post-reads";
import { readFeed } from "../lib/platform/feed-reads";

const db = new PrismaClient();
type Actor = Awaited<ReturnType<typeof createPortalActor>>;
let a: Actor, b: Actor, c: Actor;
let church: { id: string; name: string };
const at = new Date(Date.now() - 60000);
const personalIds = Array.from({ length: 31 }, () => randomUUID())
  .sort()
  .reverse();
before(async () => {
  await assertPortalTestDatabase(db);
  a = await createPortalActor(db, "nreada");
  b = await createPortalActor(db, "nreadb");
  c = await createPortalActor(db, "nreadc");
  church = await db.church.create({
    data: {
      name: "Native reading church",
      summary: "Fictional church",
      slug: randomUUID()
    }
  });
  await db.churchConnection.createMany({
    data: [a, b].map((actor) => ({
      userId: actor.id,
      churchId: church.id,
      state: "APPROVED" as const
    }))
  });
  await db.platformPost.createMany({
    data: personalIds.map((id) => ({
      id,
      authorId: a.id,
      content: "Fictional native reading " + id,
      publishedAt: at
    }))
  });
});
after(() => db.$disconnect());
async function call(
  operation: NativeReadOperation,
  actor?: Actor,
  params: object = {},
  query: Record<string, string> = {},
  extra: Record<string, string> = {}
) {
  const url = new URL(
    "/api/platform/v1/" + operation,
    process.env.ACCOUNT_ORIGIN!
  );
  for (const [key, value] of Object.entries(query))
    url.searchParams.set(key, value);
  const response = await handleNativeReadRequest(
    db,
    new Request(url, {
      headers: {
        ...(actor
          ? {
              Authorization: "Bearer " + actor.token,
              "X-Expected-Account": actor.id
            }
          : {}),
        ...extra
      }
    }),
    operation,
    params
  );
  assert.match(response.headers.get("cache-control")!, /private.*no-store/);
  assert.equal(response.headers.get("set-cookie"), null);
  assert.equal(response.headers.get("access-control-allow-origin"), null);
  const value = await response.json();
  return { response, value };
}
async function ok<K extends NativeReadOperation>(
  operation: K,
  actor?: Actor,
  params = {},
  query: Record<string, string> = {}
): Promise<ApiResponse<K>["data"]> {
  const result = await call(operation, actor, params, query);
  assert.equal(result.response.status, 200, JSON.stringify(result.value));
  return decodeApiResponse(operation, result.value, actor?.id ?? null)
    .data as ApiResponse<K>["data"];
}
test("native transport distinguishes true guests, invalid credentials, account changes and implemented capabilities", async () => {
  const capabilities = await ok("capabilities");
  assert.equal(
    capabilities.features.find((f) => f.name === "post.read")?.available,
    true
  );
  assert.equal(
    capabilities.features.find((f) => f.name === "comments.read")?.available,
    false
  );
  const malformed = await call(
    "churches",
    undefined,
    {},
    {},
    { Authorization: "Bearer invalid" }
  );
  assert.equal(malformed.response.status, 401);
  const missing = await call(
    "churches",
    undefined,
    {},
    {},
    { Authorization: "Bearer " + "x".repeat(43), "X-Expected-Account": a.id }
  );
  assert.equal(missing.response.status, 401);
  const changed = await call(
    "post",
    b,
    { postId: personalIds[0] },
    {},
    { "X-Expected-Account": a.id }
  );
  assert.equal(changed.value.error.code, "account_changed");
  assert.equal(
    (
      await call(
        "churches",
        undefined,
        {},
        {},
        { Authorization: "Bearer " + a.token }
      )
    ).response.status,
    400
  );
  assert.equal(
    (await call("profile", undefined, { username: a.username })).response
      .status,
    401
  );
  for (const extra of [
    { Origin: process.env.ACCOUNT_ORIGIN! },
    { "Sec-Fetch-Site": "none" },
    { Host: "wrong.example" }
  ] as Record<string, string>[])
    assert.equal(
      (await call("churches", undefined, {}, {}, extra)).response.status,
      403
    );
  for (const suffix of [
    "?cursor=x&cursor=y",
    "?unknown=value",
    "?query=" + "x".repeat(101)
  ]) {
    const r = await handleNativeReadRequest(
      db,
      new Request(
        process.env.ACCOUNT_ORIGIN + "/api/platform/v1/churches" + suffix
      ),
      "churches"
    );
    assert.equal(r.status, 400);
  }
});
test("member profile pages preserve timestamp ties, strict projections, original viewer and hidden fields", async () => {
  const first = await ok("profile", b, { username: a.username });
  assert.equal(first.posts.items.length, 30);
  assert.ok(first.posts.nextCursor);
  const second = await ok(
    "profile",
    b,
    { username: a.username },
    { cursor: first.posts.nextCursor }
  );
  assert.deepEqual(
    [...first.posts.items, ...second.posts.items].map((p) => p.id),
    personalIds
  );
  assert.equal(second.posts.nextCursor, null);
  assert.equal(
    (
      await call(
        "profile",
        c,
        { username: a.username },
        { cursor: first.posts.nextCursor }
      )
    ).value.error.code,
    "cursor_invalid"
  );
  assert.equal(
    (
      await call(
        "profile",
        b,
        { username: c.username },
        { cursor: first.posts.nextCursor }
      )
    ).value.error.code,
    "cursor_invalid"
  );
  const serialized = JSON.stringify(first);
  for (const privateValue of [
    a.email,
    a.token,
    "locationAudience",
    "socialPreferences",
    "presentation",
    "comments",
    "canEdit",
    "linkSourceUrl"
  ])
    assert.ok(!serialized.includes(privateValue), privateValue);
  const view = await getProfileEditor(db, a.token);
  await updateAccountProfile(
    db,
    a.token,
    {
      name: view.name,
      bio: "",
      website: "",
      interests: "",
      location: "Private location marker",
      locationAudience: "ONLY_ME",
      expectedVersion: view.presentation.version,
      expectedLocationVersion: view.locationVersion
    },
    a.id
  );
  await db.platformFollow.createMany({
    data: [
      { followerId: a.id, followingId: b.id },
      { followerId: b.id, followingId: a.id }
    ]
  });
  await relationshipCommand(db, a.token, {
    operation: "privacy",
    mutationId: randomUUID(),
    showRelationships: false,
    mentions: "NOBODY",
    expectedVersion: 0
  });
  const hidden = await ok("profile", b, { username: a.username });
  assert.equal(hidden.location, null);
  assert.equal(hidden.followers, null);
  assert.equal(hidden.followingCount, null);
  const own = await ok("profile", a, { username: a.username });
  assert.equal(own.location, "Private location marker");
  assert.equal(own.followers, 1);
  const oldClient = {
    apiVersion: "1",
    viewerId: b.id,
    data: { ...hidden, futureField: true }
  };
  assert.deepEqual(decodeApiResponse("profile", oldClient, b.id).data, hidden);
  assert.throws(
    () => decodeApiResponse("profile", oldClient, c.id),
    WireContractError
  );
});
test("church-authored private posts omit operator identity and disappear after membership withdrawal", async () => {
  const post = await db.platformPost.create({
    data: {
      authorId: a.id,
      authorChurchId: church.id,
      audienceChurchId: church.id,
      audience: "CHURCH",
      content: "Fictional church private marker",
      publishedAt: at
    }
  });
  const visible = await ok("post", b, { postId: post.id });
  assert.deepEqual(visible.author, {
    kind: "church",
    id: church.id,
    name: church.name
  });
  assert.equal(visible.audience, "CHURCH");
  for (const value of [
    a.id,
    a.username,
    a.email,
    "requestKey",
    "scheduledById",
    "authorChurchId",
    "audienceChurchId"
  ])
    assert.ok(!JSON.stringify(visible).includes(value));
  for (const actor of [undefined, c])
    assert.equal(
      (await call("post", actor, { postId: post.id })).response.status,
      404
    );
  await db.churchConnection.updateMany({
    where: { churchId: church.id, userId: b.id },
    data: { state: "WITHDRAWN" }
  });
  assert.equal(
    (await call("post", b, { postId: post.id })).response.status,
    404
  );
  await db.churchConnection.updateMany({
    where: { churchId: church.id, userId: b.id },
    data: { state: "APPROVED" }
  });
  assert.ok(
    !(await ok("profile", b, { username: a.username })).posts.items.some(
      (p) => p.id === post.id
    )
  );
  await db.platformPost.update({
    where: { id: post.id },
    data: { withdrawnAt: new Date() }
  });
  assert.equal(
    (await call("post", b, { postId: post.id })).response.status,
    404
  );
});
test("event-linked native posts use the current intersection audience", async () => {
  const calendar = await db.platformCalendar.create({
    data: {
      churchId: church.id,
      creatorId: a.id,
      requestKey: randomUUID(),
      name: "Native calendar",
      timeZone: "UTC"
    }
  });
  const time = {
    timeZone: "UTC",
    startLocal: "2026-11-01T09:00",
    endLocal: "2026-11-01T10:00"
  };
  const event = await db.calendarEvent.create({
    data: {
      calendarId: calendar.id,
      requestKey: randomUUID(),
      title: "Native event",
      visibility: "CHURCH",
      ...time
    }
  });
  const occurrence = await db.calendarOccurrence.create({
    data: {
      eventId: event.id,
      ordinal: 0,
      title: event.title,
      allDay: false,
      ...time,
      startAt: new Date("2026-11-01T09:00Z"),
      endAt: new Date("2026-11-01T10:00Z")
    }
  });
  const post = await db.platformPost.create({
    data: {
      authorId: a.id,
      authorChurchId: church.id,
      audienceChurchId: church.id,
      audience: "PUBLIC",
      content: "Fictional event discussion",
      eventOccurrenceId: occurrence.id,
      publishedAt: at
    }
  });
  assert.equal((await ok("post", b, { postId: post.id })).audience, "CHURCH");
  assert.equal(
    (await call("post", undefined, { postId: post.id })).response.status,
    404
  );
  await db.calendarEvent.update({
    where: { id: event.id },
    data: { visibility: "PUBLIC" }
  });
  assert.equal(
    (await ok("post", undefined, { postId: post.id })).audience,
    "PUBLIC"
  );
  await db.calendarEvent.update({
    where: { id: event.id },
    data: { visibility: "PRIVATE" }
  });
  assert.equal(
    (await call("post", b, { postId: post.id })).response.status,
    404
  );
});
test("reposts retain hidden source counts and lose withdrawn sources without widening permissions", async () => {
  const source = await db.platformPost.create({
    data: {
      authorId: b.id,
      content: "Fictional hidden count source",
      publishedAt: at
    }
  });
  await db.socialPreferences.upsert({
    where: { ownerId: b.id },
    create: { ownerId: b.id, hideAuthoredReactionCounts: true },
    update: { hideAuthoredReactionCounts: true }
  });
  await db.platformPostLike.create({
    data: { postId: source.id, userId: c.id }
  });
  const quote = await db.platformPost.create({
    data: {
      authorId: c.id,
      content: "Fictional quote",
      repostKind: "QUOTE",
      repostSourceId: source.id,
      publishedAt: at
    }
  });
  const result = await ok("post", c, { postId: quote.id });
  assert.equal(result.repost?.source?.likeCount, null);
  assert.equal(result.repost?.source?.ownReaction?.liked, true);
  assert.equal(
    (await ok("post", undefined, { postId: quote.id })).repost?.source
      ?.ownReaction,
    null
  );
  await db.platformPost.update({
    where: { id: source.id },
    data: { withdrawnAt: new Date() }
  });
  assert.equal(
    (await ok("post", c, { postId: quote.id })).repost?.source,
    null
  );
});
test("church discovery bounds 100/101 and binds continuations to viewer and normalized query", async () => {
  const prefix = "Native discovery " + randomUUID();
  await db.church.createMany({
    data: Array.from({ length: 101 }, (_, n) => ({
      name: prefix + " " + String(n).padStart(3, "0"),
      summary: "Fictional church",
      slug: randomUUID()
    }))
  });
  const first = await ok("churches", undefined, {}, { query: prefix });
  assert.equal(first.items.length, 100);
  assert.ok(first.nextCursor);
  const second = await ok(
    "churches",
    undefined,
    {},
    { query: "  " + prefix + "  ", cursor: first.nextCursor }
  );
  assert.equal(second.items.length, 1);
  assert.equal(
    new Set([...first.items, ...second.items].map((ch) => ch.id)).size,
    101
  );
  assert.equal(second.nextCursor, null);
  assert.equal(
    (await ok("church", undefined, { churchId: second.items[0].id })).church.id,
    second.items[0].id
  );
  for (const [actor, query] of [
    [a, prefix],
    [undefined, "changed"]
  ] as const)
    assert.equal(
      (await call("churches", actor, {}, { query, cursor: first.nextCursor }))
        .value.error.code,
      "cursor_invalid"
    );
});
test("church post pages keep pins separate and bound their continuation to the current target", async () => {
  const target = await db.church.create({
    data: {
      name: "Native page target",
      summary: "Fictional church",
      slug: randomUUID()
    }
  });
  const ids = Array.from({ length: 31 }, () => randomUUID())
    .sort()
    .reverse();
  await db.platformPost.createMany({
    data: ids.map((id) => ({
      id,
      authorId: a.id,
      authorChurchId: target.id,
      audienceChurchId: target.id,
      content: "Fictional church page",
      publishedAt: at
    }))
  });
  const pin = await db.platformPost.create({
    data: {
      authorId: a.id,
      authorChurchId: target.id,
      audienceChurchId: target.id,
      content: "Fictional pin",
      pinUntil: new Date(Date.now() + 60000),
      publishedAt: at
    }
  });
  const first = await ok("church", undefined, { churchId: target.id });
  assert.deepEqual(
    first.pinnedPosts.map((p) => p.id),
    [pin.id]
  );
  assert.equal(first.posts.items.length, 30);
  assert.ok(first.posts.nextCursor);
  const second = await ok(
    "church",
    undefined,
    { churchId: target.id },
    { cursor: first.posts.nextCursor }
  );
  assert.deepEqual(
    [...first.posts.items, ...second.posts.items].map((p) => p.id),
    ids
  );
  assert.equal(
    (
      await call(
        "church",
        undefined,
        { churchId: church.id },
        { cursor: first.posts.nextCursor }
      )
    ).value.error.code,
    "cursor_invalid"
  );
});
test("feed cursors preserve service reading sets and reject tampered mode, owner and scope", async () => {
  const first = await ok("feed", b, {}, { mode: "latest" });
  assert.ok(first.page.items.length);
  const again = await ok(
    "feed",
    b,
    {},
    { mode: "latest", scope: first.scope, cursor: first.pageCursor }
  );
  assert.deepEqual(
    again.page.items.map((p) => p.id),
    first.page.items.map((p) => p.id)
  );
  for (const query of [
    { mode: "latest", scope: first.scope, cursor: first.pageCursor + "a" },
    { mode: "weekly", scope: first.scope, cursor: first.pageCursor },
    { mode: "latest", scope: "different", cursor: first.pageCursor },
    { mode: "latest", cursor: first.pageCursor }
  ] as Record<string, string>[])
    assert.equal(
      (await call("feed", b, {}, query)).value.error.code,
      "cursor_invalid"
    );
  assert.equal(
    (
      await call(
        "feed",
        c,
        {},
        { mode: "latest", scope: first.scope, cursor: first.pageCursor }
      )
    ).value.error.code,
    "cursor_invalid"
  );
  const web = await readFeed(db, b.token, { mode: "latest" });
  assert.equal(web.ownerId, b.id);
  assert.ok(await getPost(db, b.token, personalIds[0]));
});
test("cursor deadlines cannot be extended by continuation or accepted for other endpoints", () => {
  const now = new Date();
  const codec = nativeReadCursors(["churches", null, "same"], apiId, now);
  const signed = codec.encode("row");
  assert.equal(codec.decode(signed)?.value, "row");
  const later = nativeReadCursors(
    ["churches", null, "same"],
    apiId,
    new Date(now.getTime() + 1000)
  );
  const prior = later.decode(signed)!;
  const next = later.encode("next", prior.expires);
  assert.equal(later.decode(next)?.expires, prior.expires);
  assert.throws(
    () =>
      nativeReadCursors(["church", null, "same"], apiId, now).decode(signed),
    NativeCursorError
  );
  assert.throws(
    () =>
      nativeReadCursors(
        ["churches", null, "same"],
        apiId,
        new Date(now.getTime() + NATIVE_CURSOR_LIFETIME_MS)
      ).decode(next),
    NativeCursorError
  );
  assert.throws(() => codec.decode("x".repeat(2001)), NativeCursorError);
  assert.throws(() =>
    nativeReadCursors(["feed"], apiCursor, now).encode("x".repeat(2001))
  );
});
test("queued reads revalidate expiry and revocation after acquiring the authorization gate", async () => {
  for (const operation of ["feed", "churches"] as const) {
    const token = await loginAccount(
      db,
      c.email,
      c.password,
      "Fictional queued read"
    );
    let enter!: () => void, release!: () => void;
    const entered = new Promise<void>((r) => {
      enter = r;
    });
    const released = new Promise<void>((r) => {
      release = r;
    });
    const writer = db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(730221, 2)`;
      enter();
      await released;
      if (operation === "feed")
        await tx.platformSession.update({
          where: { tokenHash: hashSessionToken(token) },
          data: { expiresAt: new Date(Date.now() - 1) }
        });
      else
        await tx.platformSession.delete({
          where: { tokenHash: hashSessionToken(token) }
        });
    });
    await entered;
    let settled = false;
    const reader = call(operation, { ...c, token }).then((r) => {
      settled = true;
      return r;
    });
    try {
      await delay(70);
      assert.equal(settled, false);
    } finally {
      release();
      await writer;
    }
    const result = await reader;
    assert.equal(result.response.status, 401);
    assert.equal(result.value.data, undefined);
  }
});
test("account deletion and personal blocking make native content unavailable", async () => {
  const owner = await createPortalActor(db, "nreadgone");
  const post = await db.platformPost.create({
    data: {
      authorId: owner.id,
      content: "Fictional disappearing content",
      publishedAt: at
    }
  });
  assert.equal((await ok("post", b, { postId: post.id })).id, post.id);
  await relationshipCommand(db, b.token, {
    operation: "block",
    kind: "person",
    targetId: owner.id,
    desired: true,
    mutationId: randomUUID(),
    expectedVersion: 0
  });
  assert.equal(
    (await call("post", b, { postId: post.id })).response.status,
    404
  );
  await requestPermanentAccountDeletion(
    db,
    owner.token,
    owner.password,
    true,
    createSessionToken(),
    { async recordAccount() {} },
    owner.id
  );
  assert.equal((await call("churches", owner)).response.status, 401);
  assert.equal(
    (await call("post", undefined, { postId: post.id })).response.status,
    404
  );
});
