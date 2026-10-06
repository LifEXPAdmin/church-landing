import test, { after, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import {
  assertPortalTestDatabase,
  createPortalActor,
  seedOperatorGrants,
  type PortalActor
} from "./seed-portal";
import {
  communitySearch as search,
  parseCommunitySearchInput,
  searchUrlInput,
  type CommunitySearchInput
} from "../lib/platform/community-search";
import {
  exchangeListingCommand,
  listExchangeListings
} from "../lib/platform/exchange-listings";
import {
  emptyExchangeFields,
  EXCHANGE_EDITOR_SCHEMA,
  EXCHANGE_ITEM_POLICY,
  type ExchangeEditorFields
} from "../lib/platform/exchange-options";
import { parseExchangeListQuery } from "../lib/platform/exchange-input";
import { searchDiscoveryPlaces } from "../lib/platform/discovery-places";
import { mediaCatalogCommand } from "../lib/platform/media-catalog-commands";
import { mediaCatalogRead } from "../lib/platform/media-catalog-reads";
import { mediaFields } from "../lib/platform/media-catalog-input";
import { MEDIA_POLICY } from "../lib/platform/media-catalog-options";
import { postCommand } from "../lib/platform/post-commands";
import { volunteerCommand } from "../lib/platform/volunteer-commands";
import { listVolunteerOpportunities } from "../lib/platform/volunteer-reads";
import { groupCommand } from "../lib/platform/group-commands";
import { listGroups } from "../lib/platform/group-reads";
import { PortalError } from "../lib/platform/portal-policy";
import { accountConfig } from "../lib/platform/account-config";

// These are real read/command/database checks. The fixture bootstraps fictional
// church duties only after the existing isolated database + delivery-sink guard.
// No production provider is contacted; privileged-write MFA acceptance belongs
// to the separate enforce-mode transport suite.
const db = new PrismaClient();
const priorReports = process.env.COMMUNITY_REPORTS_ENABLED;
let owner: PortalActor, member: PortalActor, outsider: PortalActor;
let churchId: string, groupGrantId: string, chicago: number, losAngeles: number;
before(async () => {
  await assertPortalTestDatabase(db);
  process.env.COMMUNITY_REPORTS_ENABLED = "true";
  owner = await createPortalActor(db, "searchown");
  member = await createPortalActor(db, "searchmem");
  outsider = await createPortalActor(db, "searchout");
  const reviewer = await createPortalActor(db, "searchrev");
  await seedOperatorGrants(db, reviewer, ["REVIEW_COMMUNITY_REPORTS"]);
  const church = await db.church.create({
    data: {
      slug: `search-${randomUUID()}`,
      name: "Fictional search church",
      summary: "Isolated universal-search acceptance fixture",
      communityListed: true
    }
  });
  churchId = church.id;
  // Each actor has at most one active church connection.
  await db.churchConnection.createMany({
    data: [owner, member, reviewer].map((actor) => ({
      userId: actor.id,
      churchId,
      state: "APPROVED"
    }))
  });
  const claim = await db.churchClaim.create({
    data: {
      ownerId: owner.id,
      churchId,
      requestKey: randomUUID(),
      kind: "INITIAL",
      authority: {},
      profile: {},
      status: "APPROVED",
      approvedAt: new Date(),
      activatedAt: new Date()
    }
  });
  await db.churchCapabilityGrant.createMany({
    data: [
      {
        userId: owner.id,
        churchId,
        capability: "MANAGE_CHURCH_ACCESS",
        sourceClaimId: claim.id
      },
      { userId: owner.id, churchId, capability: "MANAGE_CHURCH_MEDIA" },
      { userId: owner.id, churchId, capability: "PUBLISH_CHURCH_POSTS" },
      { userId: owner.id, churchId, capability: "MANAGE_CHURCH_VOLUNTEERS" },
      {
        userId: reviewer.id,
        churchId,
        capability: "MODERATE_EXCHANGE_LISTINGS"
      }
    ]
  });
  groupGrantId = (
    await db.churchCapabilityGrant.create({
      data: {
        userId: owner.id,
        churchId,
        capability: "MANAGE_CHURCH_GROUPS"
      }
    })
  ).id;
  chicago = (await searchDiscoveryPlaces("US", "Chicago")).places[0].id;
  losAngeles = (await searchDiscoveryPlaces("US", "Los Angeles")).places[0].id;
});
// Only this suite's group owner's creation limiter is reset. No test-global
// cleanup: other actors' rate rows, content and retained evidence stay intact.
const resetGroupFixtureRate = () =>
  db.platformAuthLimit.deleteMany({
    where: {
      key: createHmac("sha256", accountConfig().rateSecret)
        .update(`activity:group-create:${owner.id}`)
        .digest("hex")
    }
  });
beforeEach(resetGroupFixtureRate);
after(async () => {
  await db.$disconnect();
  if (priorReports === undefined) delete process.env.COMMUNITY_REPORTS_ENABLED;
  else process.env.COMMUNITY_REPORTS_ENABLED = priorReports;
});

const action = (operation: string, fields: Record<string, unknown> = {}) => ({
  operation,
  mutationId: randomUUID(),
  ...fields
});
const ids = (rows: Array<{ id: string }>) => rows.map((row) => row.id);
function href(row: { id: string } | undefined) {
  assert.ok(row && "href" in row, "Resource cards need a direct destination");
  assert.equal(typeof row.href, "string");
  return row.href;
}
const denied = (run: () => unknown, status: number) =>
  assert.rejects(
    Promise.resolve().then(run),
    (error: unknown) => error instanceof PortalError && error.status === status
  );
const resourceKinds = ["listings", "media", "opportunities", "groups"] as const;
type ResourceKind = (typeof resourceKinds)[number];
async function explore(
  kind: ResourceKind,
  q: string,
  actor: PortalActor | null = null,
  rest: CommunitySearchInput = {}
) {
  const page = await search(db, actor?.token, { kind, q, ...rest }, actor?.id);
  assert.equal(
    page.ownerId,
    actor?.id ?? null,
    "Response identifies the actual resource read owner"
  );
  return page;
}
function minimal(
  result: Awaited<ReturnType<typeof search>>,
  keys: string[],
  forbidden: string[] = []
) {
  assert.equal(Object.hasOwn(result, "total"), false);
  assert.equal(Object.hasOwn(result, "count"), false);
  for (const row of result.items)
    assert.deepEqual(Object.keys(row).sort(), [...keys].sort());
  const json = JSON.stringify(result);
  for (const text of [owner.email, member.email, ...forbidden])
    assert.ok(!json.includes(text), `Search must not serialize ${text}`);
}
async function listing(
  title: string,
  patch: Partial<ExchangeEditorFields> = {},
  publish = true
) {
  const draft = await exchangeListingCommand(
    db,
    owner.token,
    action("create", {
      expectedVersion: 0,
      ownerChurchId: null,
      schema: EXCHANGE_EDITOR_SCHEMA,
      fields: {
        ...emptyExchangeFields(),
        title,
        description: "Fictional search listing. " + "D".repeat(500),
        category: "FURNITURE",
        condition: "GOOD",
        country: "US",
        placeId: chicago,
        ...patch
      }
    })
  );
  if (!publish) return draft;
  return exchangeListingCommand(
    db,
    owner.token,
    action("status", {
      listingId: draft.id,
      expectedVersion: draft.version,
      state: "ACTIVE",
      itemPolicy: EXCHANGE_ITEM_POLICY,
      itemConfirmed: true
    })
  );
}
async function media(
  title: string,
  audience: "PUBLIC" | "MEMBERS" | "CHURCH" = "PUBLIC",
  publish = true
) {
  const fields = mediaFields({
    title,
    description: "Fictional search recording",
    format: "SERMON",
    presentation: "VIDEO",
    audience,
    details: { preachedOn: null },
    sourceUrl: "https://youtu.be/abcdefghijk"
  });
  const reviewed = {
    fields,
    acknowledgment: {
      policy: MEDIA_POLICY,
      sourceUrl: fields.sourceUrl,
      audience,
      accepted: true
    },
    rights: {
      basis: "OWN",
      reviewed: true,
      publicRecording: true,
      textRights: true
    }
  };
  const draft = await mediaCatalogCommand(
    db,
    owner.token,
    action("create", {
      ownerChurchId: audience === "CHURCH" ? churchId : null,
      ...reviewed
    })
  );
  return publish
    ? mediaCatalogCommand(
        db,
        owner.token,
        action("publish", {
          itemId: draft.id,
          expectedVersion: draft.version,
          ...reviewed
        })
      )
    : draft;
}
async function opportunityPost(audience: "PUBLIC" | "CHURCH" = "PUBLIC") {
  return postCommand(db, owner.token, {
    operation: "create",
    requestKey: randomUUID(),
    authorChurchId: churchId,
    content: "Fictional ongoing search opportunity source",
    audience
  });
}
async function opportunity(
  title: string,
  post: { id: string; version: number },
  closed = false
) {
  return volunteerCommand(
    db,
    owner.token,
    action("save", {
      id: randomUUID(),
      postId: post.id,
      postVersion: post.version,
      expectedVersion: 0,
      title,
      duties: "Fictional welcome duty",
      requirements: "Read the actual opportunity before applying",
      contact: "Fictional coordinator contact; omit from search cards",
      commitment: "One hour weekly by arrangement",
      capacity: 3,
      closed,
      independentTime: false
    })
  );
}
async function group(
  name: string,
  patch: Record<string, unknown> = {},
  actor = owner
) {
  const slug = `search-${randomUUID()}`;
  const receipt = await groupCommand(
    db,
    actor.token,
    action("create", {
      schema: 1,
      slug,
      fields: {
        name,
        purpose: "Fictional search group purpose. " + "P".repeat(240),
        rules: "Fictional rules; keep membership and discussion private",
        kind: "INTEREST",
        discovery: "LISTED",
        joinPolicy: "APPROVAL",
        format: "LOCAL",
        area: "Fictional approximate area",
        topic: "Community",
        churchId: null,
        ...patch
      },
      acceptedRules: true,
      leaderDisclosure: true
    })
  );
  return { ...receipt, slug };
}

test("listing adapter matches current discovery, keeps coarse geography and omits unavailable rows", async () => {
  const q = randomUUID();
  const local = await listing(q + " Chicago");
  await listing(q + " distant", { placeId: losAngeles });
  const restricted = await listing(q + " church", {
    audience: "CHURCH",
    audienceChurchId: churchId
  });
  const draft = await listing(q + " draft", {}, false);
  const filters = {
    q,
    country: "US",
    placeId: String(chicago),
    radiusKm: "10"
  };
  const canonical = await listExchangeListings(
    db,
    undefined,
    parseExchangeListQuery({ ...filters, sort: "newest" })
  );
  const found = await explore("listings", q, null, filters);
  assert.deepEqual(ids(found.items), ids(canonical.listings));
  assert.deepEqual(ids(found.items), [local.id]);
  assert.equal(href(found.items[0]), `/platform/exchange/${local.id}`);
  minimal(
    found,
    ["id", "label", "summary", "detail", "href"],
    [
      restricted.id,
      draft.id,
      "latitude",
      "longitude",
      "placeId",
      "D".repeat(222)
    ]
  );
  assert.ok(
    ids((await explore("listings", q, member, filters)).items).includes(
      restricted.id
    )
  );
  await db.churchConnection.update({
    where: { userId_churchId: { userId: member.id, churchId } },
    data: { state: "LEFT", version: { increment: 1 } }
  });
  try {
    const current = await explore("listings", q, member, filters);
    assert.deepEqual(ids(current.items), [local.id]);
    assert.deepEqual(
      ids(current.items),
      ids(
        (
          await listExchangeListings(
            db,
            member.token,
            parseExchangeListQuery({ ...filters, sort: "newest" })
          )
        ).listings
      )
    );
  } finally {
    await db.churchConnection.update({
      where: { userId_churchId: { userId: member.id, churchId } },
      data: { state: "APPROVED", version: { increment: 1 } }
    });
  }
});

test("media adapter matches canonical audiences and removes revoked rights without hidden counts", async () => {
  const q = randomUUID();
  const visible = await media(q + " public");
  const members = await media(q + " members", "MEMBERS");
  const church = await media(q + " church", "CHURCH");
  const draft = await media(q + " draft", "PUBLIC", false);
  for (const actor of [null, outsider, member]) {
    const result = await explore("media", q, actor);
    const canonical = await mediaCatalogRead(
      db,
      actor?.token,
      new URLSearchParams({ q })
    );
    assert.ok(canonical.items);
    assert.deepEqual(ids(result.items), ids(canonical.items));
    assert.equal(
      result.items.length,
      actor === null ? 1 : actor === outsider ? 2 : 3
    );
    for (const row of result.items)
      assert.equal(href(row), `/platform/media/${row.id}`);
    minimal(
      result,
      ["id", "label", "detail", "href"],
      [draft.id, "sourceUrl", "evidenceReference", "abcdefghijk"]
    );
  }
  assert.deepEqual(
    ids((await explore("media", q, member, { churchId })).items),
    [church.id]
  );
  assert.equal(
    (await explore("media", q, outsider, { churchId })).items.length,
    0
  );
  await db.mediaCatalogRights.update({
    where: { itemId: visible.id },
    data: { revokedAt: new Date() }
  });
  const guest = await explore("media", q);
  assert.deepEqual(guest.items, []);
  assert.equal(guest.nextCursor, null);
  minimal(guest, [], [visible.id, members.id, church.id, draft.id]);
  const canonical = await mediaCatalogRead(
    db,
    undefined,
    new URLSearchParams({ q })
  );
  assert.equal(canonical.total, 0);
  assert.deepEqual(ids(guest.items), ids(canonical.items ?? []));
});

test("opportunity adapter exposes only canonical cards and rechecks changed post audience", async () => {
  const q = randomUUID();
  const publicPost = await opportunityPost();
  const churchPost = await opportunityPost("CHURCH");
  const visible = await opportunity(q + " public", publicPost);
  const privateRow = await opportunity(q + " church", churchPost);
  const closed = await opportunity(q + " closed", publicPost, true);
  await volunteerCommand(
    db,
    member.token,
    action("apply", {
      opportunityId: privateRow.id,
      opportunityVersion: privateRow.version,
      expectedVersion: 0,
      statement: "Fictional private search applicant statement",
      confirmed: true
    })
  );
  for (const actor of [null, outsider, member]) {
    const result = await explore("opportunities", q, actor, { churchId });
    const canonical = await listVolunteerOpportunities(db, actor?.token, {
      q,
      churchId
    });
    assert.deepEqual(ids(result.items), ids(canonical.items));
    assert.equal(result.items.length, actor === member ? 2 : 1);
    for (const row of result.items)
      assert.equal(href(row), `/platform/serve/${row.id}`);
    minimal(
      result,
      ["id", "label", "detail", "href"],
      [
        closed.id,
        "Fictional private search applicant statement",
        "Fictional coordinator contact",
        "applications",
        "decisionNote"
      ]
    );
  }
  await db.platformPost.update({
    where: { id: publicPost.id },
    data: {
      audience: "CHURCH",
      audienceChurchId: churchId,
      version: { increment: 1 }
    }
  });
  assert.equal((await explore("opportunities", q)).items.length, 0);
  assert.ok(
    ids((await explore("opportunities", q, member)).items).includes(visible.id)
  );
  await db.churchConnection.update({
    where: { userId_churchId: { userId: member.id, churchId } },
    data: { state: "LEFT", version: { increment: 1 } }
  });
  try {
    const result = await explore("opportunities", q, member);
    assert.deepEqual(
      ids(result.items),
      ids((await listVolunteerOpportunities(db, member.token, { q })).items)
    );
    assert.equal(result.items.length, 0);
  } finally {
    await db.churchConnection.update({
      where: { userId_churchId: { userId: member.id, churchId } },
      data: { state: "APPROVED", version: { increment: 1 } }
    });
  }
});

test("group adapter lists public identity only and rechecks church authority epochs", async () => {
  const q = randomUUID();
  const visible = await group(q + " listed");
  const hidden = await group(q + " cohort", {
    kind: "PRIVATE_COHORT",
    discovery: "UNLISTED",
    joinPolicy: "INVITE_ONLY"
  });
  const official = await group(q + " church", {
    kind: "CHURCH_LIFE",
    churchId
  });
  for (const actor of [null, member]) {
    const result = await explore("groups", q, actor);
    assert.deepEqual(
      ids(result.items),
      ids((await listGroups(db, actor?.token, { q })).groups)
    );
    assert.deepEqual(
      [...ids(result.items)].sort(),
      [visible.id, official.id].sort()
    );
    assert.equal(
      href(result.items.find((row) => row.id === visible.id)),
      `/platform/groups/${visible.slug}`
    );
    minimal(
      result,
      ["id", "label", "summary", "detail", "href"],
      [
        hidden.id,
        hidden.slug,
        "rules",
        "members",
        "ownerAuthorityKey",
        "P".repeat(221)
      ]
    );
  }
  assert.deepEqual(
    ids((await explore("groups", q, null, { churchId })).items),
    [official.id]
  );
  await db.churchCapabilityGrant.update({
    where: { id: groupGrantId },
    data: { revokedAt: new Date(), version: { increment: 1 } }
  });
  try {
    assert.equal(
      (await explore("groups", q, member, { churchId })).items.length,
      0
    );
  } finally {
    await db.churchCapabilityGrant.update({
      where: { id: groupGrantId },
      data: { revokedAt: null, version: { increment: 1 } }
    });
  }
  // Regrant is a new authority epoch; it must not silently renew the old group.
  const current = await explore("groups", q, member, { churchId });
  assert.deepEqual(current.items, []);
  assert.deepEqual(
    ids(current.items),
    ids((await listGroups(db, member.token, { q, churchId })).groups)
  );
});

async function paginated(kind: ResourceKind, q: string) {
  if (kind === "listings") {
    const base = await listing(q + " base");
    const source = await db.exchangeListing.findUniqueOrThrow({
      where: { id: base.id }
    });
    const {
      id: unusedId,
      createdAt: unusedCreated,
      updatedAt: unusedUpdated,
      ...fields
    } = source;
    void unusedId;
    void unusedCreated;
    void unusedUpdated;
    const at = new Date(Date.now() - 1000);
    await db.exchangeListing.createMany({
      data: Array.from({ length: 21 }, (_, i) => ({
        ...fields,
        id: `search-list-${randomUUID()}`,
        title: `${q} ${i}`,
        publishedAt: at,
        updatedAt: at
      }))
    });
    return 22;
  }
  if (kind === "media") {
    for (let i = 0; i < 22; i++) await media(`${q} ${i}`);
    // Explicit ties exercise the canonical ID tiebreaker.
    await db.mediaCatalogItem.updateMany({
      where: { title: { startsWith: q } },
      data: { publishedAt: new Date(Date.now() - 1000) }
    });
    return 22;
  }
  if (kind === "opportunities") {
    for (let batch = 0; batch < 3; batch++) {
      const post = await opportunityPost();
      for (let i = 0; i < 9; i++)
        await opportunity(`${q} ${batch * 9 + i}`, post);
    }
    return 27;
  }
  // Directory pagination spans owners. Neither owner exceeds the canonical
  // twenty-active-group limit; duplicate fixture rows model earlier creations,
  // not a bypass of the three-per-day command acceptance being tested elsewhere.
  for (let actorIndex = 0; actorIndex < 2; actorIndex++) {
    const actor = await createPortalActor(db, `searchpage${actorIndex}`);
    const base = await group(`${q} owner ${actorIndex}`, {}, actor);
    const source = await db.gatherGroup.findUniqueOrThrow({
      where: { id: base.id }
    });
    for (let i = 0; i < 10; i++) {
      const name = `${q} ${actorIndex}-${i}`;
      await db.gatherGroup.create({
        data: {
          ...source,
          id: randomUUID(),
          slug: `search-${randomUUID()}`,
          name,
          nameKey: name.toLowerCase(),
          members: {
            create: {
              userId: actor.id,
              state: "ACTIVE",
              leader: true,
              rulesVersion: 1,
              joinedAt: new Date()
            }
          }
        }
      });
    }
  }
  return 22;
}

async function canonicalPages(kind: ResourceKind, q: string, token: string) {
  const result: string[] = [];
  let after: string | undefined;
  let mediaPage = 0;
  for (let reads = 0; reads < 5; reads++) {
    if (kind === "listings") {
      const page = await listExchangeListings(
        db,
        token,
        parseExchangeListQuery({ q, sort: "newest", after })
      );
      result.push(...ids(page.listings));
      after = page.after ?? undefined;
    } else if (kind === "media") {
      const page = await mediaCatalogRead(
        db,
        token,
        new URLSearchParams({ q, page: String(mediaPage) })
      );
      assert.ok(page.items && page.total !== undefined);
      result.push(...ids(page.items));
      if (++mediaPage * 20 >= page.total) return result;
      continue;
    } else if (kind === "opportunities") {
      const page = await listVolunteerOpportunities(db, token, { q, after });
      result.push(...ids(page.items));
      after = page.nextCursor ?? undefined;
    } else {
      const page = await listGroups(db, token, { q, after });
      result.push(...ids(page.groups));
      after = page.nextCursor ?? undefined;
    }
    if (!after) return result;
  }
  assert.fail("Canonical fixture pagination must terminate within five reads");
}

for (const kind of resourceKinds) {
  test(`${kind} search paginates canonical rows and rejects cross-account/filter/category cursor reuse`, async () => {
    const q = randomUUID();
    const count = await paginated(kind, q);
    const first = await explore(kind, q, member);
    assert.equal(first.items.length, kind === "opportunities" ? 25 : 20);
    assert.ok(first.nextCursor);
    const cursor = first.nextCursor;
    const all = [...ids(first.items)];
    let after: string | null = cursor;
    for (let reads = 0; after && reads < 4; reads++) {
      const next = await explore(kind, q, member, { after });
      all.push(...ids(next.items));
      after = next.nextCursor;
    }
    assert.equal(after, null);
    assert.equal(all.length, count);
    assert.equal(new Set(all).size, count);
    assert.deepEqual(all, await canonicalPages(kind, q, member.token));
    await denied(() => explore(kind, q, outsider, { after: cursor }), 409);
    await denied(
      () => explore(kind, q + " changed", member, { after: cursor }),
      409
    );
    const otherKind = kind === "media" ? "groups" : "media";
    await denied(() => explore(otherKind, q, member, { after: cursor }), 409);
    await denied(
      () =>
        explore(kind, q, member, {
          after: cursor.slice(0, -1) + (cursor.endsWith("a") ? "b" : "a")
        }),
      409
    );
    const filter = kind === "listings" ? { country: "US" } : { churchId };
    await denied(
      () => explore(kind, q, member, { ...filter, after: cursor }),
      409
    );
    await denied(() => search(db, member.token, { kind, q }, outsider.id), 401);
    minimal(
      first,
      kind === "listings" || kind === "groups"
        ? ["id", "label", "summary", "detail", "href"]
        : ["id", "label", "detail", "href"]
    );
  });
}

for (const kind of ["groups", "opportunities"] as const) {
  test(`${kind} canonical and Explore searches treat percent, underscore and backslash literally`, async (t) => {
    const prefix = randomUUID();
    const post = kind === "opportunities" ? await opportunityPost() : null;
    for (const [literal, decoy] of [
      ["100%_literal", "100XXliteral"],
      ["under_score", "underXscore"],
      ["back\\slash", "backslash"]
    ]) {
      await t.test(literal, async () => {
        const q = `${prefix} ${literal}`;
        // Group creation rate acceptance is separate from literal search.
        if (kind === "groups") await resetGroupFixtureRate();
        const exact =
          kind === "groups" ? await group(q) : await opportunity(q, post!);
        if (kind === "groups") await group(`${prefix} ${decoy}`);
        else await opportunity(`${prefix} ${decoy}`, post!);
        const canonical =
          kind === "groups"
            ? (await listGroups(db, undefined, { q })).groups
            : (await listVolunteerOpportunities(db, undefined, { q })).items;
        const result = await explore(kind, q);
        // Expected IDs, not parity alone: both readers must reject the decoy.
        assert.deepEqual(
          { canonical: ids(canonical), explore: ids(result.items) },
          { canonical: [exact.id], explore: [exact.id] },
          `Literal query ${q}`
        );
      });
    }
  });
}

test("resource input rejects incompatible geography and native query limits without falling back to another kind", async () => {
  for (const [kind, maximum] of [
    ["listings", 120],
    ["media", 160],
    ["opportunities", 70],
    ["groups", 80]
  ] as const) {
    await denied(() => explore(kind, "x".repeat(maximum + 1)), 400);
    await denied(
      () => explore(kind, "fictional", null, { topic: "prayer" }),
      400
    );
    if (kind !== "listings")
      await denied(
        () => explore(kind, "fictional", null, { country: "US" }),
        400
      );
  }
  await denied(() => explore("listings", "x"), 400);
  await denied(
    () => explore("listings", "fictional", null, { placeId: String(chicago) }),
    400
  );
  await denied(
    () =>
      explore("listings", "fictional", null, { country: "US", radiusKm: "10" }),
    400
  );
});

test("page and API parse the same unambiguous full search URL", () => {
  const parse = (text: string) =>
    parseCommunitySearchInput(searchUrlInput(new URLSearchParams(text)));
  for (const text of [
    "kind=listings&q=one&q=two",
    "kind=listings&kind=media",
    "kind=unknown",
    "kind=listings&unknown=value",
    new URLSearchParams({
      kind: "listings",
      q: "x".repeat(120) + " ".repeat(80) + "suffix"
    }).toString()
  ])
    assert.throws(
      () => parse(text),
      (error: unknown) => error instanceof PortalError && error.status === 400
    );
  const after = "a".repeat(500);
  assert.deepEqual(
    parse(
      new URLSearchParams({
        kind: "listings",
        q: "books",
        country: "US",
        placeId: "4887398",
        radiusKm: "25",
        after
      }).toString()
    ),
    {
      kind: "listings",
      q: "books",
      country: "US",
      placeId: "4887398",
      radiusKm: "25",
      after
    }
  );
});
