import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient, type Prisma } from "@prisma/client";
import { assertPortalTestDatabase, createPortalActor } from "./seed-portal";
import { readFeed } from "../lib/platform/feed-reads";
import { getPostAvailabilityBatch } from "../lib/platform/post-reads";
import { postContext } from "../lib/platform/post-access";
import {
  defaultDiscoveryPreferences,
  type DiscoveryPreferences
} from "../lib/platform/discovery-options";
import {
  getDiscoveryPreferences,
  saveDiscoveryPreferences
} from "../lib/platform/discovery-preferences";
import { discoveryResourceHiddenIds } from "../lib/platform/discovery-resource-preferences";
import {
  postResourceKinds,
  type PostResourceReference
} from "../lib/platform/post-resource-input";
import { MEDIA_POLICY } from "../lib/platform/media-catalog-options";
import { PortalError } from "../lib/platform/portal-policy";

const queries: { query: string; params: string }[] = [];
const db = new PrismaClient({ log: [{ emit: "event", level: "query" }] });
db.$on("query", ({ query, params }) => queries.push({ query, params }));
before(() => assertPortalTestDatabase(db));
after(async () => {
  await db.platformPost.updateMany({
    where: { content: { startsWith: "Fictional resource preference post " } },
    data: { status: "WITHDRAWN", withdrawnAt: new Date() }
  });
  await db.$disconnect();
});
const ids = (result: Awaited<ReturnType<typeof readFeed>>) =>
  result.posts.map((post) => post.id);
const reference = (
  kind: PostResourceReference["kind"],
  id: string
): PostResourceReference => ({ kind, id });
const json = (value: unknown) => value as Prisma.InputJsonObject;

async function setup() {
  const reader = await createPortalActor(db, "resfeedreader");
  const author = await createPortalActor(db, "resfeedauthor");
  const church = await db.church.create({
    data: {
      slug: randomUUID(),
      name: "Fictional resource preference church",
      summary: "Isolated feed fixture",
      communityListed: true
    }
  });
  await db.churchConnection.create({
    data: { userId: author.id, churchId: church.id, state: "APPROVED" }
  });
  await db.friendAcceptance.create({
    data: {
      inviterId: reader.id,
      recipientId: author.id,
      invitationVersion: 1,
      state: "CONNECTED"
    }
  });
  await db.platformFollow.createMany({
    data: [
      { followerId: reader.id, followingId: author.id },
      { followerId: author.id, followingId: reader.id }
    ]
  });
  const tag = "resource-fixture-" + randomUUID(),
    at = new Date(Date.now() - 1000);
  const prefs = defaultDiscoveryPreferences();
  prefs.filters.denominations = [tag];
  await db.socialPreferences.create({
    data: { ownerId: reader.id, discovery: json(prefs) }
  });
  const post = (extra: Partial<Prisma.PlatformPostUncheckedCreateInput> = {}) =>
    db.platformPost.create({
      data: {
        authorId: author.id,
        content: "Fictional resource preference post " + randomUUID(),
        discoveryDenomination: tag,
        publishedAt: at,
        audienceChurchId: extra.authorChurchId ?? null,
        ...extra
      }
    });
  const set = (value: DiscoveryPreferences = prefs) =>
    db.socialPreferences.update({
      where: { ownerId: reader.id },
      data: { discovery: json(value) }
    });
  return { reader, author, church, tag, at, prefs, post, set };
}
type Fixture = Awaited<ReturnType<typeof setup>>;
async function resources(f: Fixture) {
  const listing = await db.exchangeListing.create({
    data: {
      ownerId: f.author.id,
      creatorId: f.author.id,
      state: "ACTIVE",
      title: "Fictional feed listing " + randomUUID(),
      description: "Source-only listing detail",
      publishedAt: f.at,
      confirmedAt: f.at,
      itemPolicy: "exchange-listings-v3",
      category: "BOOKS",
      condition: "GOOD",
      country: "US",
      placeId: 4887398,
      placeLabel: "Chicago"
    }
  });
  const calendar = await db.platformCalendar.create({
    data: {
      churchId: f.church.id,
      creatorId: f.author.id,
      requestKey: randomUUID(),
      name: "Fictional feed calendar",
      timeZone: "UTC"
    }
  });
  const event = await db.calendarEvent.create({
    data: {
      calendarId: calendar.id,
      requestKey: randomUUID(),
      title: "Fictional feed event",
      visibility: "PUBLIC",
      timeZone: "UTC",
      startLocal: "2026-10-10T12:00",
      endLocal: "2026-10-10T13:00"
    }
  });
  const occurrence = await db.calendarOccurrence.create({
    data: {
      eventId: event.id,
      ordinal: 0,
      title: "Fictional feed occurrence",
      description: "Source-only event detail",
      allDay: false,
      timeZone: "UTC",
      startLocal: event.startLocal,
      endLocal: event.endLocal,
      startAt: new Date("2026-10-10T12:00Z"),
      endAt: new Date("2026-10-10T13:00Z")
    }
  });
  const opportunityPost = await f.post({ authorChurchId: f.church.id });
  const opportunity = await db.volunteerOpportunity.create({
    data: {
      postId: opportunityPost.id,
      title: "Fictional feed opportunity",
      duties: "Arrange fictional community books",
      contact: "PRIVATE-RESOURCE-CONTACT",
      requirements: "Adults only",
      commitment: "One hour by arrangement",
      capacity: 3
    }
  });
  const fingerprint = randomUUID();
  const media = await db.mediaCatalogItem.create({
    data: {
      ownerId: f.author.id,
      createdById: f.author.id,
      state: "PUBLISHED",
      audience: "PUBLIC",
      title: "Fictional feed recording",
      description: "Source-only media detail",
      format: "SERMON",
      presentation: "VIDEO",
      sourceUrl: "https://youtu.be/abcdefghijk",
      sourceProvider: "youtube",
      sourceState: "ATTESTED",
      acknowledgment: fingerprint,
      publishedAt: f.at,
      rights: {
        create: {
          actorId: f.author.id,
          basis: "OWN",
          policy: MEDIA_POLICY,
          fingerprint,
          assertedAt: f.at,
          evidenceReference: "PRIVATE-RESOURCE-EVIDENCE"
        }
      }
    }
  });
  const refs = [
    reference("exchangeListing", listing.id),
    reference("eventOccurrence", occurrence.id),
    reference("mediaCatalogItem", media.id),
    reference("volunteerOpportunity", opportunity.id)
  ];
  return {
    listing,
    calendar,
    event,
    occurrence,
    opportunityPost,
    opportunity,
    media,
    refs
  };
}
async function scoped(
  f: Fixture,
  mode: "latest" | "friends" | "public" | "for-you" | "trending",
  targetIds: string[]
) {
  const result = await readFeed(db, f.reader.token, { mode }, f.at);
  return {
    result,
    matched: new Set(ids(result).filter((id) => targetIds.includes(id)))
  };
}

test("each canonical resource kind is independent, mixed excluded attachments hide the entry, and ordinary posts remain", async () => {
  const f = await setup(),
    r = await resources(f),
    plain = await f.post();
  const posts = await Promise.all(
    r.refs.map((ref) => f.post({ resourceReferences: [ref] }))
  );
  const mixed = await f.post({ resourceReferences: [r.refs[0], r.refs[2]] });
  const targets = [plain.id, mixed.id, ...posts.map((post) => post.id)];
  for (const allowed of r.refs) {
    f.prefs.filters.resources = [allowed.kind];
    await f.set();
    const expected = new Set([plain.id, posts[r.refs.indexOf(allowed)].id]);
    for (const mode of ["latest", "public"] as const)
      assert.deepEqual(
        (await scoped(f, mode, targets)).matched,
        expected,
        mode + ":" + allowed.kind
      );
  }
  f.prefs.filters.resources = [];
  await f.set();
  for (const mode of ["latest", "public"] as const)
    assert.deepEqual(
      (await scoped(f, mode, targets)).matched,
      new Set([plain.id])
    );
  f.prefs.filters.resources = [...postResourceKinds];
  await f.set();
  assert.deepEqual(
    (await scoped(f, "public", targets)).matched,
    new Set(targets)
  );
});

test("old saved filters default to all resources, while explicit empty filters and presets persist and invalidate reading sets", async () => {
  const f = await setup(),
    r = await resources(f),
    p = await f.post({ resourceReferences: [r.refs[0]] });
  const legacy = structuredClone(f.prefs) as unknown as {
    filters: Record<string, unknown>;
  };
  delete legacy.filters.resources;
  await db.socialPreferences.update({
    where: { ownerId: f.reader.id },
    data: { discovery: json(legacy) }
  });
  const original = await getDiscoveryPreferences(db, f.reader.token);
  assert.deepEqual(
    new Set(original.preferences.filters.resources),
    new Set(postResourceKinds)
  );
  const discovery = await readFeed(
    db,
    f.reader.token,
    { mode: "public" },
    f.at
  );
  const chronological = await readFeed(
    db,
    f.reader.token,
    { mode: "friends" },
    f.at
  );
  assert.ok(ids(discovery).includes(p.id) && ids(chronological).includes(p.id));
  f.prefs.filters.resources = [];
  f.prefs.presets = [
    {
      id: "resources-none",
      name: "Ordinary posts",
      mode: "public",
      filters: structuredClone(f.prefs.filters)
    }
  ];
  const request = {
    operation: "save",
    expectedVersion: original.version,
    mutationId: randomUUID(),
    preferences: f.prefs
  };
  const receipt = await saveDiscoveryPreferences(db, f.reader.token, request);
  assert.deepEqual(
    await saveDiscoveryPreferences(db, f.reader.token, request),
    receipt
  );
  const saved = await getDiscoveryPreferences(db, f.reader.token);
  assert.deepEqual(saved.preferences.filters.resources, []);
  assert.deepEqual(saved.preferences.presets[0].filters.resources, []);
  for (const [mode, cursor] of [
    ["public", discovery.pageCursor],
    ["friends", chronological.pageCursor]
  ] as const)
    await assert.rejects(
      readFeed(db, f.reader.token, { mode, cursor }, f.at),
      (error) => error instanceof PortalError && error.status === 409
    );
  const available = await getPostAvailabilityBatch(
    db,
    f.reader.token,
    [p.id],
    "public",
    { filterKey: discovery.discovery!.filterKey }
  );
  assert.deepEqual(available.posts, [
    {
      id: p.id,
      available: false,
      entryVersion: null,
      commentCount: null,
      likeCount: null
    }
  ]);
});

test("denied and withdrawn resources cannot classify or disclose an otherwise readable post", async () => {
  const f = await setup(),
    r = await resources(f);
  const posts = await Promise.all(
    r.refs.map((ref) => f.post({ resourceReferences: [ref] }))
  );
  f.prefs.filters.resources = [];
  await f.set();
  assert.deepEqual(
    (
      await scoped(
        f,
        "public",
        posts.map((post) => post.id)
      )
    ).matched,
    new Set()
  );
  await db.exchangeListing.update({
    where: { id: r.listing.id },
    data: { audience: "CHURCH", audienceChurchId: f.church.id }
  });
  await db.calendarEvent.update({
    where: { id: r.event.id },
    data: { visibility: "PRIVATE" }
  });
  await db.mediaCatalogRights.update({
    where: { itemId: r.media.id },
    data: { revokedAt: new Date() }
  });
  await db.platformPost.update({
    where: { id: r.opportunityPost.id },
    data: { audience: "CHURCH", audienceChurchId: f.church.id }
  });
  const targetIds = posts.map((post) => post.id);
  for (const mode of ["latest", "public"] as const) {
    const result = await scoped(f, mode, targetIds);
    assert.deepEqual(result.matched, new Set(targetIds));
    const availability = await getPostAvailabilityBatch(
      db,
      f.reader.token,
      targetIds,
      mode
    );
    assert.ok(
      availability.posts.every(
        (post) => post.available && !post.resources?.length
      )
    );
    const wire = JSON.stringify([
      result.result.posts.filter((post) => targetIds.includes(post.id)),
      availability.posts
    ]);
    for (const hidden of [
      r.listing.title,
      r.occurrence.title,
      r.media.title,
      r.opportunity.title,
      "PRIVATE-RESOURCE",
      "youtu.be"
    ])
      assert.ok(!wire.includes(hidden), hidden);
  }
  await db.exchangeListing.update({
    where: { id: r.listing.id },
    data: { audience: "PUBLIC", audienceChurchId: null }
  });
  assert.equal(
    (
      await getPostAvailabilityBatch(
        db,
        f.reader.token,
        [posts[0].id],
        "latest"
      )
    ).posts[0].available,
    false
  );
  await db.exchangeListing.update({
    where: { id: r.listing.id },
    data: { state: "ARCHIVED" }
  });
  assert.equal(
    (
      await getPostAvailabilityBatch(
        db,
        f.reader.token,
        [posts[0].id],
        "latest"
      )
    ).posts[0].available,
    true
  );
});

test("reposts combine their own resources with only an authorized original, including between-author blocks", async () => {
  const f = await setup(),
    r = await resources(f),
    reposter = await createPortalActor(db, "resfeedquote");
  const source = await f.post({
    resourceReferences: [r.refs[0]],
    allowReposts: true
  });
  const plain = await f.post({
    authorId: reposter.id,
    repostKind: "PLAIN",
    repostSourceId: source.id
  });
  const quote = await f.post({
    authorId: reposter.id,
    repostKind: "QUOTE",
    repostSourceId: source.id,
    resourceReferences: [r.refs[2]]
  });
  f.prefs.filters.resources = postResourceKinds.filter(
    (kind) => kind !== "exchangeListing"
  );
  await f.set();
  const targets = [source.id, plain.id, quote.id];
  for (const mode of ["latest", "public"] as const)
    assert.deepEqual((await scoped(f, mode, targets)).matched, new Set());
  await db.platformPost.update({
    where: { id: source.id },
    data: { audience: "CHURCH", audienceChurchId: f.church.id }
  });
  for (const mode of ["latest", "public"] as const) {
    const result = await scoped(f, mode, targets);
    assert.ok(result.matched.has(quote.id));
    assert.equal(
      result.result.posts.find((post) => post.id === quote.id)?.repost?.source,
      null
    );
  }
  await db.platformPost.update({
    where: { id: source.id },
    data: { audience: "PUBLIC", audienceChurchId: null }
  });
  await db.socialRelationship.create({
    data: { ownerId: f.author.id, targetUserId: reposter.id, blocked: true }
  });
  for (const mode of ["latest", "public"] as const) {
    const result = await scoped(f, mode, targets);
    assert.ok(result.matched.has(quote.id));
    assert.equal(
      result.result.posts.find((post) => post.id === quote.id)?.repost?.source,
      null
    );
  }
  f.prefs.filters.resources = [];
  await f.set();
  assert.ok(
    !(await scoped(f, "public", targets)).matched.has(quote.id),
    "The quote's own readable media still applies after its original is denied"
  );
});

test("resource exclusions fill chronological and discovery pages before pagination without duplicate entries", async () => {
  const f = await setup(),
    r = await resources(f);
  f.prefs.filters.resources = ["exchangeListing"];
  await f.set();
  const allowed: { id: string }[] = [],
    hidden: { id: string }[] = [];
  for (let i = 0; i < 35; i++) {
    hidden.push(
      await f.post({
        resourceReferences: [r.refs[2]],
        publishedAt: new Date(+f.at - i)
      })
    );
    allowed.push(
      await f.post({
        resourceReferences: [r.refs[0]],
        publishedAt: new Date(+f.at - 1000 - i)
      })
    );
  }
  for (const mode of ["friends", "public"] as const) {
    const first = await readFeed(db, f.reader.token, { mode }, f.at);
    assert.equal(first.posts.length, 30, mode);
    assert.ok(ids(first).every((id) => allowed.some((post) => post.id === id)));
    assert.ok(first.nextCursor);
    const second = await readFeed(
      db,
      f.reader.token,
      { mode, cursor: first.nextCursor },
      f.at
    );
    assert.equal(second.posts.length, 5, mode);
    assert.deepEqual(
      new Set([...ids(first), ...ids(second)]),
      new Set(allowed.map((post) => post.id))
    );
    assert.equal(new Set([...ids(first), ...ids(second)]).size, 35);
    assert.ok(
      ![...ids(first), ...ids(second)].some((id) =>
        hidden.some((post) => post.id === id)
      )
    );
  }
});

test("ranked snapshots and retained availability recheck resource changes after a set was created", async () => {
  const f = await setup(),
    r = await resources(f),
    post = await f.post();
  f.prefs.filters.resources = postResourceKinds.filter(
    (kind) => kind !== "mediaCatalogItem"
  );
  f.prefs.filters.sort = "popular";
  await f.set();
  await db.platformPostLike.create({
    data: {
      postId: post.id,
      userId: f.reader.id,
      firstLikedAt: new Date(+f.at - 1000)
    }
  });
  const sets = [];
  for (const mode of ["trending", "public"] as const) {
    const first = await readFeed(db, f.reader.token, { mode }, f.at);
    assert.ok(ids(first).includes(post.id));
    sets.push({ mode, first });
  }
  await db.platformPost.update({
    where: { id: post.id },
    data: { resourceReferences: [r.refs[2]], version: { increment: 1 } }
  });
  for (const { mode, first } of sets) {
    const replay = await readFeed(
      db,
      f.reader.token,
      { mode, cursor: first.pageCursor },
      f.at
    );
    assert.ok(!ids(replay).includes(post.id));
    const availability = await getPostAvailabilityBatch(
      db,
      f.reader.token,
      [post.id],
      mode,
      first.discovery ? { filterKey: first.discovery.filterKey } : {}
    );
    assert.equal(availability.posts[0].available, false);
  }
});

test("direct event, opportunity and structured need owners use canonical resource eligibility", async () => {
  const f = await setup(),
    r = await resources(f);
  const eventPost = await f.post({
    authorChurchId: f.church.id,
    eventOccurrenceId: r.occurrence.id
  });
  const churchListing = await db.exchangeListing.create({
    data: {
      ownerChurchId: f.church.id,
      creatorId: f.author.id,
      state: "ACTIVE",
      intent: "CHURCH_NEED",
      title: "Fictional structured need",
      description: "Fictional church need",
      requestedItems: "Ordinary books",
      category: "BOOKS",
      country: "US",
      placeId: 4887398,
      placeLabel: "Chicago",
      publishedAt: f.at,
      confirmedAt: f.at,
      itemPolicy: "exchange-listings-v3"
    }
  });
  const need = await db.exchangeNeed.create({
    data: { id: randomUUID(), listingId: churchListing.id }
  });
  const needPost = await f.post({
    authorChurchId: f.church.id,
    exchangeNeedId: need.id,
    type: "NEED"
  });
  const orphanNeed = await db.exchangeNeed.create({
    data: { id: randomUUID() }
  });
  const personalNeed = await db.exchangeNeed.create({
    data: { id: randomUUID(), listingId: r.listing.id }
  });
  const invalidSourcePosts = await Promise.all([
    f.post({
      authorChurchId: f.church.id,
      exchangeNeedId: orphanNeed.id,
      type: "NEED"
    }),
    f.post({ exchangeNeedId: personalNeed.id, type: "NEED" }),
    f.post({ exchangeNeedId: need.id, type: "NEED" })
  ]);
  const targets = [eventPost.id, r.opportunityPost.id, needPost.id];
  f.prefs.filters.resources = [];
  await f.set();
  assert.deepEqual((await scoped(f, "public", targets)).matched, new Set());
  const invalidIds = invalidSourcePosts.map((post) => post.id);
  assert.deepEqual(
    (await scoped(f, "public", invalidIds)).matched,
    new Set(invalidIds),
    "Orphaned, personal and wrong-author need links do not classify the post as a church resource"
  );
  for (const [kind, id] of [
    ["eventOccurrence", eventPost.id],
    ["volunteerOpportunity", r.opportunityPost.id],
    ["exchangeListing", needPost.id]
  ] as const) {
    f.prefs.filters.resources = [kind];
    await f.set();
    assert.deepEqual(
      (await scoped(f, "public", targets)).matched,
      new Set([id])
    );
  }
  f.prefs.filters.resources = [];
  await f.set();
  // Changing the post category can retain its source ID, but the canonical
  // reader only projects a structured need for the NEED category.
  await db.platformPost.update({
    where: { id: needPost.id },
    data: { type: "UPDATE", version: { increment: 1 } }
  });
  assert.deepEqual(
    (await scoped(f, "public", targets)).matched,
    new Set([needPost.id])
  );
  assert.equal(
    (
      await getPostAvailabilityBatch(
        db,
        f.reader.token,
        [needPost.id],
        "latest"
      )
    ).posts[0].available,
    true
  );
  await db.platformPost.update({
    where: { id: needPost.id },
    data: { type: "NEED", version: { increment: 1 } }
  });
  await db.exchangeNeed.update({
    where: { id: need.id },
    data: { recoveryRequired: true }
  });
  await db.volunteerOpportunity.update({
    where: { id: r.opportunity.id },
    data: { recoveryRequired: true }
  });
  assert.deepEqual(
    (await scoped(f, "public", targets)).matched,
    new Set([needPost.id, r.opportunityPost.id])
  );
});

test("default-all incurs no classification queries, repeated resources deduplicate, and unique lookups stay within 180 IDs", async () => {
  const f = await setup(),
    r = await resources(f),
    context = await postContext(db, f.reader.id);
  const repeated = await Promise.all(
    Array.from({ length: 181 }, () =>
      f.post({ resourceReferences: [r.refs[0]] })
    )
  );
  const repeatedIds = repeated.map((post) => post.id);
  let start = queries.length;
  assert.deepEqual(
    await discoveryResourceHiddenIds(db, context, repeatedIds, f.prefs),
    new Set()
  );
  assert.equal(
    queries.length,
    start,
    "Default all must avoid resource classification queries"
  );
  f.prefs.filters.resources = [];
  start = queries.length;
  assert.deepEqual(
    await discoveryResourceHiddenIds(db, context, repeatedIds, f.prefs),
    new Set(repeatedIds)
  );
  const listingQueries = () =>
    queries
      .slice(start)
      .filter(({ query }) =>
        /FROM\s+(?:"public"\.)?"ExchangeListing"/.test(query)
      );
  assert.equal(
    listingQueries().length,
    1,
    "181 entries sharing one source must use one source lookup"
  );
  const listingIds: string[] = Array.from({ length: 181 }, () => randomUUID());
  await db.exchangeListing.createMany({
    data: listingIds.map((id) => ({ ...r.listing, id }))
  });
  const individual = await Promise.all(
    listingIds.map((id) =>
      f.post({ resourceReferences: [reference("exchangeListing", id)] })
    )
  );
  start = queries.length;
  assert.equal(
    (
      await discoveryResourceHiddenIds(
        db,
        context,
        individual.map((post) => post.id),
        f.prefs
      )
    ).size,
    181
  );
  const calls = listingQueries();
  assert.equal(
    calls.length,
    2,
    "181 unique sources require two bounded lookups"
  );
  for (const call of calls) {
    const requested = (JSON.parse(call.params) as unknown[]).filter(
      (value) => typeof value === "string" && listingIds.includes(value)
    );
    assert.ok(requested.length > 0 && requested.length <= 180);
  }
});
