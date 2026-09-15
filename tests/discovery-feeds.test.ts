import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient, type Prisma } from "@prisma/client";
import { assertPortalTestDatabase, createPortalActor } from "./seed-portal";
import { readFeed } from "../lib/platform/feed-reads";
import {
  defaultDiscoveryPreferences,
  type DiscoveryPreferences
} from "../lib/platform/discovery-options";
import {
  saveDiscoveryPreferences,
  getDiscoveryPreferences
} from "../lib/platform/discovery-preferences";
import {
  getDiscoveryPlace,
  searchDiscoveryPlaces
} from "../lib/platform/discovery-places";
import { postDiscoveryData } from "../lib/platform/post-discovery";
import { getPostAvailabilityBatch } from "../lib/platform/post-reads";
import {
  replayRetentionControls,
  type RetentionControlEntry
} from "../lib/platform/retention-controls";
import { PortalError } from "../lib/platform/portal-policy";
const db = new PrismaClient();
before(() => assertPortalTestDatabase(db));
after(async () => {
  await db.platformPost.updateMany({
    where: { content: { startsWith: "Fictional discovery " } },
    data: { status: "WITHDRAWN", withdrawnAt: new Date() }
  });
  await db.$disconnect();
});
const ids = (result: Awaited<ReturnType<typeof readFeed>>) =>
  result.posts.map((post) => post.id);
async function setup() {
  const a = await createPortalActor(db, "discowner"),
    b = await createPortalActor(db, "discother"),
    c = await createPortalActor(db, "discthird");
  const at = new Date(Date.now() - 1000),
    tag = "fixture " + randomUUID();
  const prefs = defaultDiscoveryPreferences();
  prefs.filters.denominations = [tag];
  await db.socialPreferences.upsert({
    where: { ownerId: a.id },
    create: {
      ownerId: a.id,
      discovery: prefs as unknown as Prisma.InputJsonObject
    },
    update: { discovery: prefs as unknown as Prisma.InputJsonObject }
  });
  const post = (
    authorId = b.id,
    extra: Partial<Prisma.PlatformPostUncheckedCreateInput> = {}
  ) =>
    db.platformPost.create({
      data: {
        authorId,
        content: "Fictional discovery " + randomUUID(),
        publishedAt: at,
        discoveryDenomination: tag,
        ...extra
      }
    });
  const set = async (value: DiscoveryPreferences = prefs) =>
    db.socialPreferences.update({
      where: { ownerId: a.id },
      data: { discovery: value as unknown as Prisma.InputJsonObject }
    });
  return { a, b, c, at, tag, prefs, post, set };
}
test("Following and Favorites use current follows without requiring mutual friendship or adding strangers", async () => {
  const f = await setup();
  const followed = await f.post(f.b.id),
    stranger = await f.post(f.c.id),
    own = await f.post(f.a.id);
  await db.platformFollow.create({
    data: { followerId: f.a.id, followingId: f.b.id }
  });
  assert.deepEqual(
    ids(await readFeed(db, f.a.token, { mode: "following" }, f.at)),
    [followed.id]
  );
  assert.deepEqual(
    ids(await readFeed(db, f.a.token, { mode: "friends" }, f.at)),
    []
  );
  assert.deepEqual(
    ids(await readFeed(db, f.a.token, { mode: "favorites" }, f.at)),
    []
  );
  await db.socialRelationship.create({
    data: { ownerId: f.a.id, targetUserId: f.b.id, favorite: true }
  });
  const result = await readFeed(db, f.a.token, { mode: "favorites" }, f.at);
  assert.equal(
    (await getPostAvailabilityBatch(db, f.a.token, [followed.id], "favorites"))
      .posts[0].available,
    true
  );
  assert.deepEqual(ids(result), [followed.id]);
  assert.ok(
    !ids(result).includes(stranger.id) && !ids(result).includes(own.id)
  );
  await db.platformFollow.deleteMany({
    where: { followerId: f.a.id, followingId: f.b.id }
  });
  assert.deepEqual(
    ids(
      await readFeed(
        db,
        f.a.token,
        { mode: "favorites", cursor: result.pageCursor },
        f.at
      )
    ),
    []
  );
  assert.equal(
    (await getPostAvailabilityBatch(db, f.a.token, [followed.id], "favorites"))
      .posts[0].available,
    false
  );
});
test("Your Church requires selected current approval; Churches stays public and a follow never grants membership", async () => {
  const f = await setup();
  const church = await db.church.create({
    data: {
      name: "Fictional Discovery Church",
      slug: "discovery-" + randomUUID(),
      summary: "Fictional fixture",
      communityListed: true
    }
  });
  await db.churchConnection.create({
    data: { userId: f.a.id, churchId: church.id, state: "APPROVED" }
  });
  await db.socialRelationship.create({
    data: { ownerId: f.a.id, churchId: church.id, followingChurch: true }
  });
  f.prefs.filters.homeChurchId = church.id;
  await f.set();
  const pub = await f.post(f.b.id, {
    authorChurchId: church.id,
    audienceChurchId: church.id
  });
  const members = await f.post(f.b.id, {
    audience: "CHURCH",
    audienceChurchId: church.id
  });
  await f.post(f.b.id);
  assert.deepEqual(
    new Set(ids(await readFeed(db, f.a.token, { mode: "your-church" }, f.at))),
    new Set([pub.id, members.id])
  );
  assert.deepEqual(
    ids(await readFeed(db, f.a.token, { mode: "churches" }, f.at)),
    [pub.id]
  );
  const saved = await readFeed(db, f.a.token, { mode: "your-church" }, f.at);
  await db.churchConnection.updateMany({
    where: { userId: f.a.id, churchId: church.id },
    data: { state: "LEFT" }
  });
  assert.deepEqual(
    ids(
      await readFeed(
        db,
        f.a.token,
        { mode: "your-church", cursor: saved.pageCursor },
        f.at
      )
    ),
    []
  );
  assert.deepEqual(
    ids(await readFeed(db, f.a.token, { mode: "churches" }, f.at)),
    [pub.id]
  );
});
test("Local uses explicit town distance, excludes church-only and non-adult personal posts, and widens only with consent", async () => {
  const f = await setup();
  const chicago = (await searchDiscoveryPlaces("US", "Chicago")).places.find(
    (p) => p.label.startsWith("Chicago,")
  )!;
  const newYork = (await searchDiscoveryPlaces("US", "New York City"))
    .places[0];
  assert.ok(chicago && newYork);
  f.prefs.filters.country = "US";
  f.prefs.filters.placeId = chicago.id;
  f.prefs.filters.radiusKm = 10;
  await f.set();
  const local = await f.post(
    f.b.id,
    await postDiscoveryData({
      country: "US",
      placeId: chicago.id,
      shareLocality: true,
      denomination: f.tag
    })
  );
  const distant = await f.post(
    f.b.id,
    await postDiscoveryData({
      country: "US",
      placeId: newYork.id,
      shareLocality: true,
      denomination: f.tag
    })
  );
  const unclassified = await f.post(f.b.id);
  const young = await createPortalActor(db, "discnoadult", { adult: false });
  await f.post(
    young.id,
    await postDiscoveryData({
      country: "US",
      placeId: chicago.id,
      shareLocality: true,
      denomination: f.tag
    })
  );
  const church = await db.church.create({
    data: {
      name: "Fictional Local Church",
      slug: "local-" + randomUUID(),
      summary: "Fictional fixture"
    }
  });
  await db.churchConnection.create({
    data: { userId: f.a.id, churchId: church.id, state: "APPROVED" }
  });
  await f.post(f.b.id, {
    ...(await postDiscoveryData({
      country: "US",
      placeId: chicago.id,
      shareLocality: true,
      denomination: f.tag
    })),
    audience: "CHURCH",
    audienceChurchId: church.id
  });
  assert.deepEqual(
    ids(await readFeed(db, f.a.token, { mode: "local" }, f.at)),
    [local.id]
  );
  f.prefs.filters.expand = true;
  await f.set();
  const expanded = await readFeed(db, f.a.token, { mode: "local" }, f.at);
  assert.deepEqual(ids(expanded), [local.id, distant.id, unclassified.id]);
  assert.equal(expanded.discovery?.explanations[local.id].stage, "Local");
  assert.equal(expanded.discovery?.explanations[distant.id].stage, "National");
  assert.equal(
    expanded.discovery?.explanations[unclassified.id].stage,
    "Worldwide"
  );
  assert.ok(await getDiscoveryPlace("US", chicago.id));
});
test("language, explicit topics and hidden literal words filter before selection and do not broaden traditions", async () => {
  const f = await setup();
  f.prefs.filters.languages = ["en"];
  f.prefs.filters.includeUnknownLanguage = false;
  f.prefs.filters.topics = ["prayer"];
  f.prefs.hiddenWords = ["100%", "bad_phrase"];
  await f.set();
  const good = await f.post(f.b.id, {
    discoveryLanguage: "en",
    topics: ["prayer"],
    content: "Fictional discovery 100 good and badXphrase"
  });
  await f.post(f.b.id, {
    discoveryLanguage: "en",
    topics: ["prayer"],
    content: "Fictional discovery 100% exact"
  });
  await f.post(f.b.id, {
    discoveryLanguage: "en",
    topics: ["prayer"],
    content: "Fictional discovery bad_phrase exact"
  });
  await f.post(f.b.id, { discoveryLanguage: "es", topics: ["prayer"] });
  await f.post(f.b.id, { topics: ["prayer"] });
  await f.post(f.b.id, {
    discoveryLanguage: "en",
    topics: ["prayer"],
    discoveryDenomination: "unselected tradition"
  });
  assert.deepEqual(
    ids(await readFeed(db, f.a.token, { mode: "public" }, f.at)),
    [good.id]
  );
  f.prefs.hiddenWords = ["prayer"];
  await f.set();
  assert.deepEqual(
    ids(await readFeed(db, f.a.token, { mode: "public" }, f.at)),
    []
  );
});
test("For You exposes actual explicit signals and feedback preserves the old order until refresh", async () => {
  const f = await setup();
  f.prefs.interests = ["scripture"];
  await f.set();
  const followed = await f.post(f.b.id, { topics: ["scripture"] });
  const stranger = await f.post(f.c.id, {
    topics: ["community"],
    publishedAt: new Date(+f.at - 1000)
  });
  await db.platformFollow.create({
    data: { followerId: f.a.id, followingId: f.b.id }
  });
  const first = await readFeed(db, f.a.token, { mode: "for-you" }, f.at);
  assert.deepEqual(ids(first), [followed.id, stranger.id]);
  assert.ok(
    first.discovery?.explanations[followed.id].reasons.some(
      (r) => r.code === "FOLLOWED_AUTHOR"
    )
  );
  assert.ok(
    first.discovery?.explanations[followed.id].reasons.some(
      (r) => r.code === "CHOSEN_TOPIC"
    )
  );
  await saveDiscoveryPreferences(db, f.a.token, {
    operation: "feedback",
    topic: "scripture",
    choice: "less",
    expectedVersion: 0,
    mutationId: randomUUID()
  });
  const saved = await readFeed(
    db,
    f.a.token,
    { mode: "for-you", cursor: first.pageCursor },
    f.at
  );
  assert.deepEqual(ids(saved), ids(first));
  assert.equal(saved.discovery?.rankingChanged, true);
  assert.ok(
    saved.discovery?.explanations[followed.id].reasons.some(
      (r) => r.code === "SAVED_SET"
    )
  );
});
test("Popular uses recent public posts and eligible Likes; prayer, old posts and self-Likes never win", async () => {
  const f = await setup();
  f.prefs.filters.sort = "popular";
  await f.set();
  const winner = await f.post(f.b.id),
    zero = await f.post(f.c.id, { publishedAt: new Date(+f.at - 1000) });
  const old = await f.post(f.b.id, {
      publishedAt: new Date(+f.at - 8 * 86400000)
    }),
    prayer = await f.post(f.b.id, { type: "PRAYER" });
  for (const p of [winner, old, prayer])
    await db.platformPostLike.create({
      data: {
        postId: p.id,
        userId: f.a.id,
        firstLikedAt: new Date(+f.at - 1000)
      }
    });
  await db.platformPostLike.create({
    data: {
      postId: zero.id,
      userId: f.c.id,
      firstLikedAt: new Date(+f.at - 1000)
    }
  });
  assert.deepEqual(
    ids(await readFeed(db, f.a.token, { mode: "public" }, f.at)),
    [winner.id, zero.id]
  );
});
test("bounded pages keep their position across new posts, reject cross-account cursors and remove blocked sources before hydration", async () => {
  const f = await setup();
  const posts = [];
  for (let i = 0; i < 35; i++)
    posts.push(
      await f.post(f.b.id, { publishedAt: new Date(+f.at - i * 1000) })
    );
  const first = await readFeed(db, f.a.token, { mode: "public" }, f.at);
  assert.equal(first.posts.length, 30);
  assert.ok(first.nextCursor);
  const newer = await f.post(f.b.id, { publishedAt: new Date(+f.at + 1000) });
  const next = await readFeed(
    db,
    f.a.token,
    { mode: "public", cursor: first.nextCursor },
    new Date(+f.at + 2000)
  );
  assert.deepEqual(
    ids(next),
    posts.slice(30).map((p) => p.id)
  );
  assert.ok(!ids(next).includes(newer.id));
  await assert.rejects(
    readFeed(
      db,
      f.c.token,
      { mode: "public", cursor: first.nextCursor },
      new Date(+f.at + 2000)
    ),
    PortalError
  );
  await db.socialRelationship.create({
    data: { ownerId: f.a.id, targetUserId: f.b.id, blocked: true }
  });
  assert.deepEqual(
    ids(
      await readFeed(
        db,
        f.a.token,
        { mode: "public", cursor: first.pageCursor },
        new Date(+f.at + 2000)
      )
    ),
    []
  );
});
test("hard filter changes invalidate old cursors and retained availability without revealing filtered post metadata", async () => {
  const f = await setup();
  const p = await f.post();
  const first = await readFeed(db, f.a.token, { mode: "public" }, f.at);
  f.prefs.hiddenTopics = ["prayer"];
  await f.set();
  await assert.rejects(
    readFeed(db, f.a.token, { mode: "public", cursor: first.pageCursor }, f.at),
    PortalError
  );
  const result = await getPostAvailabilityBatch(
    db,
    f.a.token,
    [p.id],
    "public",
    { filterKey: first.discovery!.filterKey }
  );
  assert.deepEqual(result.posts, [
    {
      id: p.id,
      available: false,
      entryVersion: null,
      commentCount: null,
      likeCount: null
    }
  ]);
});
test("private preference receipts are exact, versioned, account-scoped, and reset changes feedback only", async () => {
  const f = await setup();
  f.prefs.interests = ["prayer"];
  f.prefs.feedback = { prayer: 1 };
  f.prefs.hiddenWords = ["hidden"];
  const input = {
    operation: "save",
    preferences: f.prefs,
    expectedVersion: 0,
    mutationId: randomUUID()
  };
  const saved = await saveDiscoveryPreferences(db, f.a.token, input);
  assert.deepEqual(await saveDiscoveryPreferences(db, f.a.token, input), saved);
  await assert.rejects(
    saveDiscoveryPreferences(db, f.a.token, {
      ...input,
      preferences: defaultDiscoveryPreferences()
    }),
    PortalError
  );
  await assert.rejects(
    saveDiscoveryPreferences(db, f.a.token, {
      ...input,
      mutationId: randomUUID()
    }),
    PortalError
  );
  await saveDiscoveryPreferences(db, f.a.token, {
    operation: "reset-feedback",
    expectedVersion: saved.version,
    mutationId: randomUUID()
  });
  const result = await getDiscoveryPreferences(db, f.a.token);
  assert.deepEqual(result.preferences, { ...f.prefs, feedback: {} });
  assert.deepEqual(
    (await getDiscoveryPreferences(db, f.c.token)).preferences,
    defaultDiscoveryPreferences()
  );
  await assert.rejects(getDiscoveryPreferences(db, ""), PortalError);
});
test("protected recovery clears outdated public classification and requires review of missing newer private preferences", async () => {
  const f = await setup();
  const p = await f.post(f.b.id, {
    discoveryCountry: "US",
    version: 9,
    discoveryVersion: 1
  });
  const { recordDiscoveryControl } =
    await import("../lib/platform/retention-controls");
  await db.$transaction(async (tx) => {
    await recordDiscoveryControl(tx, "POST_DISCOVERY", f.b.id, p.id, 2);
    await recordDiscoveryControl(
      tx,
      "DISCOVERY_PREFERENCES",
      f.a.id,
      f.a.id,
      2
    );
  });
  const entries = await db.retentionControl.findMany({
    where: {
      OR: [
        { sourceId: p.id },
        { sourceId: f.a.id, kind: "DISCOVERY_PREFERENCES" }
      ]
    },
    select: { payload: true }
  });
  await replayRetentionControls(
    db,
    entries.map((e) => e.payload as unknown as RetentionControlEntry)
  );
  const restored = await db.platformPost.findUniqueOrThrow({
    where: { id: p.id }
  });
  assert.equal(restored.discoveryCountry, null);
  assert.equal(restored.discoveryDenomination, null);
  assert.equal(restored.content, p.content);
  assert.equal(restored.discoveryVersion, 2);
  assert.equal(restored.version, 10);
  // A newer unrelated content/moderation version cannot suppress the independent
  // classification withdrawal, and replaying it twice cannot change data again.
  await replayRetentionControls(
    db,
    entries.map((e) => e.payload as unknown as RetentionControlEntry)
  );
  assert.equal(
    (await db.platformPost.findUniqueOrThrow({ where: { id: p.id } })).version,
    10
  );
  assert.equal(
    (await getDiscoveryPreferences(db, f.a.token)).recoveryRequired,
    true
  );
  await assert.rejects(
    readFeed(db, f.a.token, { mode: "public" }, f.at),
    PortalError
  );
  await saveDiscoveryPreferences(db, f.a.token, {
    operation: "save",
    preferences: f.prefs,
    expectedVersion: 2,
    mutationId: randomUUID()
  });
  assert.equal(
    (await getDiscoveryPreferences(db, f.a.token)).recoveryRequired,
    false
  );
});
test("repost explanations and hidden filters never use an original after source permission or between-author blocking revokes it", async () => {
  const f = await setup();
  const church = await db.church.create({
    data: {
      name: "Fictional Original Church",
      slug: "source-" + randomUUID(),
      summary: "Fictional fixture"
    }
  });
  const source = await f.post(f.b.id, {
    content: "Fictional discovery protected-original-phrase",
    allowReposts: true,
    audienceChurchId: church.id,
    discoveryCountry: "US",
    discoveryLanguage: "en"
  });
  const plain = await f.post(f.c.id, {
    repostKind: "PLAIN",
    repostSourceId: source.id,
    discoveryDenomination: null
  });
  const quote = await f.post(f.c.id, {
    repostKind: "QUOTE",
    repostSourceId: source.id
  });
  await db.platformFollow.create({
    data: { followerId: f.a.id, followingId: f.c.id }
  });
  f.prefs.hiddenWords = ["protected-original-phrase"];
  await f.set();
  assert.deepEqual(
    ids(await readFeed(db, f.a.token, { mode: "following" }, f.at)),
    []
  );
  await db.platformPost.update({
    where: { id: source.id },
    data: { audience: "CHURCH", version: { increment: 1 } }
  });
  const privateResult = await readFeed(
    db,
    f.a.token,
    { mode: "following" },
    f.at
  );
  assert.deepEqual(ids(privateResult), [quote.id]);
  assert.equal(privateResult.posts[0].repost?.source, null);
  assert.equal(
    privateResult.discovery?.explanations[quote.id].classification.locality,
    null
  );
  assert.ok(
    !JSON.stringify([
      privateResult.posts,
      privateResult.discovery?.explanations
    ]).includes("protected-original-phrase")
  );
  const latest = await readFeed(db, f.a.token, { mode: "latest" }, f.at);
  assert.ok(ids(latest).includes(quote.id));
  assert.equal(
    latest.posts.find((p) => p.id === plain.id)?.repost?.source,
    null
  );
  await db.platformPost.update({
    where: { id: source.id },
    data: { audience: "PUBLIC", version: { increment: 1 } }
  });
  await db.socialRelationship.create({
    data: { ownerId: f.b.id, targetUserId: f.c.id, blocked: true }
  });
  const blocked = await readFeed(db, f.a.token, { mode: "following" }, f.at);
  assert.deepEqual(ids(blocked), [quote.id]);
  assert.equal(blocked.posts[0].repost?.source, null);
  assert.ok(
    !JSON.stringify([blocked.posts, blocked.discovery?.explanations]).includes(
      "protected-original-phrase"
    )
  );
});
test("changed follows keep the current recommendation set stable with an honest refresh explanation", async () => {
  const f = await setup();
  const post = await f.post(f.b.id);
  const first = await readFeed(db, f.a.token, { mode: "for-you" }, f.at);
  assert.deepEqual(ids(first), [post.id]);
  await db.platformFollow.create({
    data: { followerId: f.a.id, followingId: f.b.id }
  });
  const retained = await readFeed(
    db,
    f.a.token,
    { mode: "for-you", cursor: first.pageCursor },
    f.at
  );
  assert.deepEqual(ids(retained), [post.id]);
  assert.equal(retained.discovery?.rankingChanged, true);
  assert.deepEqual(
    retained.discovery?.explanations[post.id].reasons.map((r) => r.code),
    ["SAVED_SET"]
  );
  const fresh = await readFeed(db, f.a.token, { mode: "for-you" }, f.at);
  assert.equal(fresh.discovery?.rankingChanged, false);
  assert.ok(
    fresh.discovery?.explanations[post.id].reasons.some(
      (r) => r.code === "FOLLOWED_AUTHOR"
    )
  );
});
test("strict Local filters distant candidates before the capacity bound and chronological follows stay newest first across stages", async () => {
  const f = await setup();
  const chicago = (await searchDiscoveryPlaces("US", "Chicago")).places.find(
    (p) => p.label.startsWith("Chicago,")
  )!;
  const localData = await postDiscoveryData({
    country: "US",
    placeId: chicago.id,
    shareLocality: true,
    denomination: f.tag
  });
  f.prefs.filters.country = "US";
  f.prefs.filters.placeId = chicago.id;
  f.prefs.filters.geography = "local";
  await f.set();
  const local = await f.post(f.b.id, {
    ...localData,
    publishedAt: new Date(+f.at - 1000)
  });
  const distant = await f.post(f.b.id, { discoveryCountry: "GB" });
  await db.platformPost.createMany({
    data: Array.from({ length: 10001 }, () => ({
      authorId: f.c.id,
      content: "Fictional discovery bounded distant " + randomUUID(),
      publishedAt: f.at,
      discoveryCountry: "GB",
      discoveryDenomination: f.tag
    }))
  });
  assert.deepEqual(
    ids(await readFeed(db, f.a.token, { mode: "local" }, f.at)),
    [local.id]
  );
  // Do not leave unrelated synthetic load in subsequent shared fixture cases.
  await db.platformPost.updateMany({
    where: { authorId: f.c.id },
    data: { status: "WITHDRAWN", withdrawnAt: new Date() }
  });
  await db.platformFollow.create({
    data: { followerId: f.a.id, followingId: f.b.id }
  });
  f.prefs.filters.expand = true;
  await f.set();
  const following = await readFeed(db, f.a.token, { mode: "following" }, f.at);
  assert.deepEqual(ids(following), [distant.id, local.id]);
  assert.equal(
    following.discovery?.explanations[distant.id].stage,
    "Worldwide"
  );
  assert.equal(following.discovery?.explanations[local.id].stage, "Local");
});
test("a preset save atomically updates the mode and preferences and rejects a stale mode version without losing either", async () => {
  const f = await setup();
  const input = {
    operation: "save",
    preferences: f.prefs,
    mode: "for-you",
    expectedVersion: 0,
    expectedFeedVersion: 0,
    mutationId: randomUUID()
  };
  const result = await saveDiscoveryPreferences(db, f.a.token, input);
  assert.deepEqual(
    await saveDiscoveryPreferences(db, f.a.token, input),
    result
  );
  const saved = await getDiscoveryPreferences(db, f.a.token);
  assert.equal(saved.mode, "for-you");
  assert.equal(saved.feedVersion, 1);
  const { saveFeedPreference } =
    await import("../lib/platform/feed-preferences");
  await saveFeedPreference(db, f.a.token, {
    mode: "latest",
    expectedVersion: 1,
    mutationId: randomUUID()
  });
  await assert.rejects(
    saveDiscoveryPreferences(db, f.a.token, {
      ...input,
      expectedVersion: 1,
      expectedFeedVersion: 1,
      mode: "local",
      mutationId: randomUUID()
    }),
    PortalError
  );
  const current = await getDiscoveryPreferences(db, f.a.token);
  assert.equal(current.mode, "latest");
  assert.equal(current.version, 1);
  assert.deepEqual(current.preferences, f.prefs);
});
test("unconfirmed public locality survives a private draft but publication requires explicit consent; edits can remove classification", async () => {
  const f = await setup(),
    id = randomUUID();
  const { postWorkspaceCommand, readPostWorkspace } =
    await import("../lib/platform/post-workspace");
  const { postCommand } = await import("../lib/platform/post-commands");
  const payload = {
    content: "Fictional discovery consent draft",
    scripture: "",
    audience: "PUBLIC",
    replyAudience: "VIEWERS",
    topics: [],
    discovery: {
      country: "US",
      placeId: null,
      language: "en",
      denomination: f.tag,
      shareLocality: false
    }
  };
  const command = (operation: string, fields: Record<string, unknown>) =>
    postWorkspaceCommand(db, f.a.token, {
      operation,
      ...fields,
      mutationId: randomUUID()
    });
  await command("save-draft", { id, expectedVersion: 0, payload });
  const draft = await readPostWorkspace(db, f.a.token, { view: "draft", id });
  assert.ok(JSON.stringify(draft).includes('"shareLocality":false'));
  await assert.rejects(
    command("publish-draft", { id, expectedVersion: 1 }),
    PortalError
  );
  await command("save-draft", {
    id,
    expectedVersion: 1,
    payload: {
      ...payload,
      discovery: { ...payload.discovery, shareLocality: true }
    }
  });
  const published = await command("publish-draft", { id, expectedVersion: 2 });
  assert.ok(published.postId);
  const post = await db.platformPost.findUniqueOrThrow({
    where: { id: published.postId }
  });
  assert.equal(post.discoveryCountry, "US");
  assert.equal(post.discoveryLanguage, "en");
  await postCommand(db, f.a.token, {
    operation: "edit",
    postId: post.id,
    expectedVersion: post.version,
    discovery: {},
    mutationId: randomUUID()
  });
  const cleared = await db.platformPost.findUniqueOrThrow({
    where: { id: post.id }
  });
  assert.equal(cleared.discoveryCountry, null);
  assert.equal(cleared.discoveryLanguage, null);
  assert.equal(cleared.content, post.content);
  assert.equal(
    await db.retentionControl.count({
      where: { sourceId: post.id, kind: "POST_DISCOVERY" }
    }),
    2
  );
});
