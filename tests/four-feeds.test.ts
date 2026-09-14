import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import {
  assertPortalTestDatabase,
  createPortalActor,
  seedPortal
} from "./seed-portal";
import { readFeed } from "../lib/platform/feed-reads";
import { saveFeedPreference } from "../lib/platform/feed-preferences";
import { postLikeCommand } from "../lib/platform/post-likes";
import { getPostAvailabilityBatch } from "../lib/platform/post-reads";
import { expireFeedSnapshots } from "../lib/platform/feed-snapshot-retention";
import { AccountError } from "../lib/platform/account-error";
import { PortalError } from "../lib/platform/portal-policy";
import { safeAccountReturn } from "../lib/platform/account-entry";
const db = new PrismaClient(),
  HOUR = 3600000;
before(async () => {
  await assertPortalTestDatabase(db);
  await db.platformPost.updateMany({
    where: { content: { startsWith: "Fictional four-feed record " } },
    data: { status: "WITHDRAWN", withdrawnAt: new Date() }
  });
});
after(() => db.$disconnect());
let sequence = 0;
const clock = () => new Date(Date.now() + (100 + ++sequence * 10) * 24 * HOUR);
const post = (authorId: string, at: Date, extra = {}) =>
  db.platformPost.create({
    data: {
      authorId,
      publishedAt: at,
      content: "Fictional four-feed record " + randomUUID(),
      ...extra
    }
  });
const like = (postId: string, userId: string, at: Date, extra = {}) =>
  db.platformPostLike.create({
    data: { postId, userId, createdAt: at, firstLikedAt: at, ...extra }
  });
const ids = (r: Awaited<ReturnType<typeof readFeed>>) =>
  r.posts.map((p) => p.id);
const denied = (r: Promise<unknown>, status: number) =>
  assert.rejects(
    r,
    (e: unknown) => e instanceof PortalError && e.status === status
  );
async function connect(a: string, b: string, state = "CONNECTED") {
  await db.friendAcceptance.create({
    data: { inviterId: a, recipientId: b, invitationVersion: 1, state }
  });
  await db.platformFollow.createMany({
    data: [
      { followerId: a, followingId: b },
      { followerId: b, followingId: a }
    ]
  });
}
test("Latest defaults to eligible public posts, includes self and freezes deterministic chronological paging", async () => {
  const f = await seedPortal(db),
    a = f.memberA,
    at = clock();
  const rows = await Promise.all(
    Array.from({ length: 35 }, () => post(a.id, new Date(+at - 1000)))
  );
  const secret = await post(a.id, new Date(+at - 500), {
    audience: "CHURCH",
    audienceChurchId: f.churchA.id
  });
  const first = await readFeed(db, a.token, {}, at);
  assert.equal(first.mode, "latest");
  assert.deepEqual(
    ids(first),
    rows
      .map((p) => p.id)
      .sort()
      .reverse()
      .slice(0, 30)
  );
  assert.ok(!ids(first).includes(secret.id));
  const fresh = await post(a.id, new Date(+at + 1));
  const second = await readFeed(
    db,
    a.token,
    { mode: "latest", cursor: first.nextCursor },
    new Date(+at + 2)
  );
  assert.ok(!ids(second).includes(fresh.id));
  assert.ok(!ids(second).some((id) => ids(first).includes(id)));
  assert.deepEqual(
    [...ids(first), ...ids(second)].filter((id) =>
      rows.some((row) => row.id === id)
    ),
    rows
      .map((p) => p.id)
      .sort()
      .reverse()
  );
  assert.equal(
    ids(await readFeed(db, a.token, {}, new Date(+at + 2)))[0],
    fresh.id
  );
});
test("Friends requires current acceptance plus both follows, excludes self/pending/strangers, and retained cards lose eligibility immediately", async () => {
  const a = await createPortalActor(db, "feedowner"),
    b = await createPortalActor(db, "feedfriend"),
    c = await createPortalActor(db, "feedpending"),
    at = clock();
  await connect(a.id, b.id);
  await connect(a.id, c.id, "PENDING");
  const mine = await post(a.id, at),
    friend = await post(b.id, at),
    pending = await post(c.id, at);
  const first = await readFeed(db, a.token, { mode: "friends" }, at);
  assert.deepEqual(ids(first), [friend.id]);
  assert.ok(!ids(first).includes(mine.id) && !ids(first).includes(pending.id));
  assert.deepEqual(ids(await readFeed(db, "", { mode: "friends" }, at)), []);
  await db.platformFollow.deleteMany({
    where: { followerId: b.id, followingId: a.id }
  });
  assert.deepEqual(
    ids(
      await readFeed(
        db,
        a.token,
        { mode: "friends", cursor: first.pageCursor },
        at
      )
    ),
    []
  );
  await db.platformPost.update({
    where: { id: friend.id },
    data: { publishedAt: new Date(Date.now() - 1000) }
  });
  const availability = await getPostAvailabilityBatch(
    db,
    a.token,
    [friend.id],
    "friends"
  );
  assert.equal(availability.posts[0].available, false);
  assert.equal(
    (await getPostAvailabilityBatch(db, a.token, [friend.id])).posts[0]
      .available,
    true
  );
});
test("friendship never grants a church audience and current membership, blocks and mutes are checked", async () => {
  const f = await seedPortal(db),
    at = clock();
  await connect(f.memberA.id, f.memberB.id);
  const publicPost = await post(f.memberB.id, at);
  const churchPost = await post(f.memberB.id, at, {
    audience: "CHURCH",
    audienceChurchId: f.churchB.id
  });
  assert.deepEqual(
    ids(await readFeed(db, f.memberA.token, { mode: "friends" }, at)),
    [publicPost.id]
  );
  await db.churchConnection.updateMany({
    where: { userId: f.memberA.id },
    data: { state: "WITHDRAWN" }
  });
  await db.churchConnection.create({
    data: { userId: f.memberA.id, churchId: f.churchB.id, state: "APPROVED" }
  });
  assert.ok(
    ids(await readFeed(db, f.memberA.token, { mode: "friends" }, at)).includes(
      churchPost.id
    )
  );
  for (const data of [{ muted: true }, { blocked: true, muted: false }]) {
    await db.socialRelationship.upsert({
      where: {
        ownerId_targetUserId: {
          ownerId: f.memberA.id,
          targetUserId: f.memberB.id
        }
      },
      create: { ownerId: f.memberA.id, targetUserId: f.memberB.id, ...data },
      update: data
    });
    assert.deepEqual(
      ids(await readFeed(db, f.memberA.token, { mode: "friends" }, at)),
      []
    );
  }
});
test("weekly uses distinct active non-self received Likes in the exact rolling window; old posts qualify and normal counts stay separate", async () => {
  const a = await createPortalActor(db, "feedauthor"),
    b = await createPortalActor(db, "feedvoter"),
    c = await createPortalActor(db, "feedvoter2"),
    at = clock();
  const old = await post(a.id, new Date(+at - 1000 * HOUR)),
    recent = await post(a.id, new Date(+at - HOUR)),
    zero = await post(a.id, at),
    out = await post(a.id, at);
  await like(old.id, b.id, new Date(+at - 168 * HOUR));
  await like(old.id, c.id, new Date(+at - HOUR));
  await like(old.id, a.id, new Date(+at - HOUR));
  await like(recent.id, b.id, new Date(+at - 2 * HOUR));
  await like(recent.id, c.id, new Date(+at - HOUR), { active: false });
  await like(zero.id, a.id, new Date(+at - HOUR));
  await like(out.id, b.id, new Date(+at - 168 * HOUR - 1));
  await like(out.id, c.id, at);
  const result = await readFeed(db, a.token, { mode: "weekly" }, at);
  assert.deepEqual(ids(result), [old.id, recent.id]);
  assert.equal(result.posts[0].likeCount, 3);
});
test("Trending uses the fixed 24-hour half-life and 72-hour window, not post age", async () => {
  const a = await createPortalActor(db, "trendowner"),
    voters = await Promise.all(
      Array.from({ length: 4 }, (_, i) => createPortalActor(db, "trend" + i))
    ),
    at = clock();
  const olderLikes = await post(a.id, new Date(+at - HOUR)),
    newerLikes = await post(a.id, new Date(+at - 1000 * HOUR)),
    expired = await post(a.id, at);
  for (const voter of voters)
    await like(olderLikes.id, voter.id, new Date(+at - 24 * HOUR));
  for (const voter of voters.slice(0, 3))
    await like(newerLikes.id, voter.id, new Date(+at - HOUR));
  await like(expired.id, voters[0].id, new Date(+at - 72 * HOUR - 1));
  assert.deepEqual(ids(await readFeed(db, a.token, { mode: "trending" }, at)), [
    newerLikes.id,
    olderLikes.id
  ]);
  assert.deepEqual(ids(await readFeed(db, a.token, { mode: "weekly" }, at)), [
    olderLikes.id,
    newerLikes.id,
    expired.id
  ]);
});
test("ranking ties use publication and ID, snapshots cannot reorder or duplicate pages after Likes change, and refresh recomputes", async () => {
  const a = await createPortalActor(db, "rankowner"),
    b = await createPortalActor(db, "rankvoter"),
    c = await createPortalActor(db, "rankvoter2"),
    at = clock();
  const posts = await Promise.all(
    Array.from({ length: 35 }, () => post(a.id, new Date(+at - 10 * HOUR)))
  );
  for (const p of posts) await like(p.id, b.id, new Date(+at - HOUR));
  const order = posts
    .map((p) => p.id)
    .sort()
    .reverse();
  const first = await readFeed(db, a.token, { mode: "weekly" }, at);
  assert.deepEqual(ids(first), order.slice(0, 30));
  await like(order[34], c.id, new Date(+at - HOUR));
  await db.platformPostLike.updateMany({
    where: { postId: order[0] },
    data: { active: false }
  });
  const second = await readFeed(
    db,
    a.token,
    { mode: "weekly", cursor: first.nextCursor },
    new Date(+at + 1)
  );
  assert.deepEqual(ids(second), order.slice(30));
  const same = await readFeed(
    db,
    a.token,
    { mode: "weekly", cursor: first.pageCursor },
    new Date(+at + 1)
  );
  assert.deepEqual(ids(same), order.slice(0, 30));
  assert.equal(same.posts[0].likeCount, 0);
  const refreshed = await readFeed(
    db,
    a.token,
    { mode: "weekly" },
    new Date(+at + 1)
  );
  assert.equal(ids(refreshed)[0], order[34]);
  assert.ok(!ids(refreshed).includes(order[0]));
  await db.platformPost.update({
    where: { id: order[31] },
    data: { moderationState: "HIDDEN" }
  });
  assert.deepEqual(
    ids(
      await readFeed(
        db,
        a.token,
        { mode: "weekly", cursor: first.nextCursor },
        new Date(+at + 2)
      )
    ),
    order.slice(30).filter((id) => id !== order[31])
  );
});
test("ranked discovery excludes blocked/muted/inactive signals and plain repost multiplication, while quotes use their own Likes", async () => {
  const a = await createPortalActor(db, "source"),
    b = await createPortalActor(db, "reposter"),
    c = await createPortalActor(db, "reader"),
    d = await createPortalActor(db, "signal"),
    at = clock();
  const original = await post(a.id, new Date(+at - HOUR), {
    allowReposts: true
  });
  const plain = await post(b.id, at, {
    repostKind: "PLAIN",
    repostSourceId: original.id
  });
  const quote = await post(b.id, at, {
    repostKind: "QUOTE",
    repostSourceId: original.id
  });
  await like(original.id, c.id, new Date(+at - HOUR));
  await like(quote.id, d.id, new Date(+at - HOUR));
  assert.deepEqual(ids(await readFeed(db, c.token, { mode: "weekly" }, at)), [
    quote.id,
    original.id
  ]);
  assert.ok(
    !ids(await readFeed(db, c.token, { mode: "weekly" }, at)).includes(plain.id)
  );
  await db.platformUser.update({
    where: { id: d.id },
    data: { suspendedAt: new Date() }
  });
  assert.deepEqual(ids(await readFeed(db, c.token, { mode: "weekly" }, at)), [
    original.id
  ]);
  await db.socialRelationship.create({
    data: { ownerId: c.id, targetUserId: a.id, muted: true }
  });
  assert.deepEqual(
    ids(await readFeed(db, c.token, { mode: "weekly" }, at)),
    []
  );
});
test("signed cursors bind account, mode and clock; account-switch scope resets to that account's saved choice", async () => {
  const a = await createPortalActor(db, "scopea"),
    b = await createPortalActor(db, "scopeb"),
    at = clock();
  const first = await readFeed(db, a.token, { mode: "latest" }, at);
  await denied(
    readFeed(db, b.token, { mode: "latest", cursor: first.pageCursor }, at),
    409
  );
  await denied(
    readFeed(db, a.token, { mode: "friends", cursor: first.pageCursor }, at),
    409
  );
  await denied(
    readFeed(db, a.token, { cursor: first.pageCursor + "x" }, at),
    409
  );
  assert.equal(
    (
      await readFeed(
        db,
        a.token,
        { cursor: first.pageCursor },
        new Date(+at + HOUR)
      )
    ).mode,
    "latest"
  );
  await saveFeedPreference(db, b.token, {
    mode: "friends",
    expectedVersion: 0,
    mutationId: randomUUID()
  });
  const switched = await readFeed(
    db,
    b.token,
    { mode: "latest", cursor: first.pageCursor, scope: first.scope },
    at
  );
  assert.equal(switched.mode, "friends");
  assert.notEqual(switched.scope, first.scope);
});
test("feed choice is private, versioned and exactly retryable, independent of other preferences and guest choices", async () => {
  const a = await createPortalActor(db, "prefa"),
    b = await createPortalActor(db, "prefb");
  await db.socialPreferences.create({
    data: { ownerId: a.id, mentions: "NOBODY", version: 7 }
  });
  const input = {
    mode: "friends",
    expectedVersion: 0,
    mutationId: randomUUID()
  };
  const first = await saveFeedPreference(db, a.token, input);
  assert.deepEqual(await saveFeedPreference(db, a.token, input), first);
  await denied(
    saveFeedPreference(db, a.token, { ...input, mode: "latest" }),
    409
  );
  assert.throws(
    () =>
      saveFeedPreference(db, a.token, {
        ...input,
        mutationId: randomUUID(),
        ownerId: b.id
      }),
    (e: unknown) => e instanceof PortalError && e.status === 400
  );
  await assert.rejects(
    saveFeedPreference(db, "", input),
    (e: unknown) => e instanceof AccountError && e.code === "session"
  );
  assert.equal(
    (await readFeed(db, a.token, { guestMode: "weekly" })).mode,
    "friends"
  );
  assert.equal(
    (await readFeed(db, b.token, { guestMode: "friends" })).mode,
    "latest"
  );
  assert.equal(
    (await readFeed(db, "", { guestMode: "friends" })).mode,
    "friends"
  );
  const saved = await db.socialPreferences.findUniqueOrThrow({
    where: { ownerId: a.id }
  });
  assert.equal(saved.mentions, "NOBODY");
  assert.equal(saved.version, 7);
  assert.equal(saved.feedVersion, 1);
});
test("first Like time handles an initially inactive row and exact retries without renewing a known activation", async () => {
  const a = await createPortalActor(db, "timea"),
    b = await createPortalActor(db, "timeb"),
    p = await post(a.id, new Date());
  const send = (version: number, desired: boolean) => ({
    postId: p.id,
    expectedVersion: version,
    desired,
    mutationId: randomUUID()
  });
  await postLikeCommand(db, b.token, send(0, false));
  const where = { postId_userId: { postId: p.id, userId: b.id } };
  assert.equal(
    (await db.platformPostLike.findUniqueOrThrow({ where })).firstLikedAt,
    null
  );
  const activation = send(1, true);
  await postLikeCommand(db, b.token, activation);
  const at = (await db.platformPostLike.findUniqueOrThrow({ where }))
    .firstLikedAt;
  assert.ok(at);
  await postLikeCommand(db, b.token, activation);
  await postLikeCommand(db, b.token, send(2, false));
  await postLikeCommand(db, b.token, send(3, true));
  assert.deepEqual(
    (await db.platformPostLike.findUniqueOrThrow({ where })).firstLikedAt,
    at
  );
});
test("expired snapshots are swept in bounded batches and account entry preserves only supported modes", async () => {
  const a = await createPortalActor(db, "expires"),
    at = clock();
  await readFeed(db, a.token, { mode: "weekly" }, at);
  assert.equal(await db.feedSnapshot.count({ where: { ownerId: a.id } }), 1);
  await expireFeedSnapshots(db, new Date(+at + HOUR));
  assert.equal(await db.feedSnapshot.count({ where: { ownerId: a.id } }), 0);
  assert.equal(
    safeAccountReturn(
      "/platform/feed?feed=friends&feedCursor=secret&feedScope=other&mode=pages"
    ),
    "/platform/feed?feed=friends&mode=pages"
  );
  assert.equal(safeAccountReturn("/platform?feed=arbitrary"), "/platform");
});

test("an expired ranked current page rehydrates safely without losing its order; continuation requires refresh", async () => {
  const a = await createPortalActor(db, "recoverank"),
    b = await createPortalActor(db, "recovervote"),
    at = clock();
  const posts = await Promise.all(
    Array.from({ length: 31 }, () => post(a.id, new Date(+at - HOUR)))
  );
  for (const p of posts) await like(p.id, b.id, new Date(+at - HOUR));
  const first = await readFeed(db, a.token, { mode: "weekly" }, at);
  const later = new Date(+at + HOUR + 1);
  await expireFeedSnapshots(db, later);
  const resumed = await readFeed(
    db,
    a.token,
    { mode: "weekly", cursor: first.pageCursor },
    later
  );
  assert.deepEqual(ids(resumed), ids(first));
  assert.match(resumed.notice!, /expired/);
  assert.equal(resumed.nextCursor, null);
  await denied(
    readFeed(db, a.token, { mode: "weekly", cursor: first.nextCursor }, later),
    409
  );
  await db.platformPost.update({
    where: { id: first.posts[0].id },
    data: { moderationState: "HIDDEN" }
  });
  assert.ok(
    !ids(
      await readFeed(
        db,
        a.token,
        { mode: "weekly", cursor: first.pageCursor },
        later
      )
    ).includes(first.posts[0].id)
  );
  assert.ok(first.pageCursor.length < 1500);
});

test("public ranking reuse keeps storage bounded across visitors while deliberate refresh recalculates immediately", async () => {
  const a = await createPortalActor(db, "publicrank"),
    b = await createPortalActor(db, "publicvote"),
    at = clock();
  const p = await post(a.id, new Date(+at - HOUR));
  await like(p.id, b.id, new Date(+at - HOUR));
  const first = await readFeed(db, "", { mode: "weekly" }, at);
  await db.platformPostLike.updateMany({
    where: { postId: p.id },
    data: { active: false }
  });
  const shared = await readFeed(db, "", { mode: "weekly" }, new Date(+at + 1));
  assert.equal(shared.pageCursor, first.pageCursor);
  const fresh = await readFeed(
    db,
    "",
    { mode: "weekly", refresh: "1" },
    new Date(+at + 2)
  );
  assert.deepEqual(ids(fresh), []);
  assert.notEqual(fresh.pageCursor, first.pageCursor);
});
