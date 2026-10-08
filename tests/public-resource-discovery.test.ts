import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient, type Prisma } from "@prisma/client";
import {
  assertPortalTestDatabase,
  createPortalActor,
  seedOperatorGrants,
  type PortalActor
} from "./seed-portal";
import { withPostRead } from "../lib/platform/post-access";
import {
  publicResourceProjection,
  type PublicResourceKind
} from "../lib/platform/public-resource-discovery";
import {
  canonicalSharePath,
  publicSharePreview
} from "../lib/platform/public-sharing";
import {
  publicSitemapResponse,
  sitemapPageSize
} from "../lib/platform/public-sitemap";
import {
  publicStructuredData,
  serializeStructuredData
} from "../lib/platform/public-structured-data";
import { sharePreviewResponse } from "../lib/platform/share-preview-response";
import {
  defaultShareCard,
  renderShareCard
} from "../lib/platform/share-card-image";
import { exchangeListingCommand } from "../lib/platform/exchange-listings";
import {
  emptyExchangeFields,
  EXCHANGE_EDITOR_SCHEMA,
  EXCHANGE_ITEM_POLICY
} from "../lib/platform/exchange-options";
import { mediaCatalogCommand } from "../lib/platform/media-catalog-commands";
import { mediaFields } from "../lib/platform/media-catalog-input";
import { MEDIA_POLICY } from "../lib/platform/media-catalog-options";
import { relationshipCommand } from "../lib/platform/relationships";
import { interchurchHelpCommand } from "../lib/platform/interchurch-help-commands";

const db = new PrismaClient();
const origin = process.env.ACCOUNT_ORIGIN!;
const previousReports = process.env.COMMUNITY_REPORTS_ENABLED;
let owner: PortalActor, viewer: PortalActor, churchId: string;
const input = (operation: string, fields: Record<string, unknown> = {}) => ({
  operation,
  mutationId: randomUUID(),
  ...fields
});
before(async () => {
  await assertPortalTestDatabase(db);
  process.env.COMMUNITY_REPORTS_ENABLED = "true";
  const reviewer = await createPortalActor(db, "resreview");
  await seedOperatorGrants(db, reviewer, ["REVIEW_COMMUNITY_REPORTS"]);
  owner = await createPortalActor(db, "resource");
  viewer = await createPortalActor(db, "resviewer");
  const church = await db.church.create({
    data: {
      slug: randomUUID(),
      name: "Fictional resource church",
      summary: "Isolated public discovery fixture",
      publicEmail: "private-resource-contact@example.test",
      communityListed: true
    }
  });
  churchId = church.id;
  await db.churchConnection.createMany({
    data: [owner, viewer].map((actor) => ({
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
      { userId: owner.id, churchId, capability: "MANAGE_EXCHANGE_LISTINGS" },
      { userId: viewer.id, churchId, capability: "MODERATE_EXCHANGE_LISTINGS" }
    ]
  });
});
after(async () => {
  await db.$disconnect();
  if (previousReports === undefined)
    delete process.env.COMMUNITY_REPORTS_ENABLED;
  else process.env.COMMUNITY_REPORTS_ENABLED = previousReports;
});

async function listing(
  actor = owner,
  audience: "PUBLIC" | "CHURCH" = "PUBLIC"
) {
  const draft = await exchangeListingCommand(
    db,
    actor.token,
    input("create", {
      expectedVersion: 0,
      ownerChurchId: null,
      schema: EXCHANGE_EDITOR_SCHEMA,
      fields: {
        ...emptyExchangeFields(),
        title: "Fictional public table",
        description: "A supplied description of a fictional table.",
        category: "FURNITURE",
        condition: "GOOD",
        country: "US",
        placeId: 4887398,
        audience,
        audienceChurchId: audience === "CHURCH" ? churchId : ""
      }
    })
  );
  return exchangeListingCommand(
    db,
    actor.token,
    input("status", {
      listingId: draft.id,
      expectedVersion: draft.version,
      state: "ACTIVE",
      itemPolicy: EXCHANGE_ITEM_POLICY,
      itemConfirmed: true
    })
  );
}
async function media(
  audience = "PUBLIC",
  actor = owner,
  owningChurch: string | null = null
) {
  const fields = mediaFields({
    title: "Fictional public recording",
    description: "A supplied description of a fictional recording.",
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
      audience: fields.audience,
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
    actor.token,
    input("create", {
      ownerChurchId: owningChurch,
      ...reviewed
    })
  );
  return mediaCatalogCommand(
    db,
    actor.token,
    input("publish", {
      itemId: draft.id,
      expectedVersion: draft.version,
      ...reviewed
    })
  );
}
const projection = (kind: PublicResourceKind, id: string, token?: string) =>
  withPostRead(db, token, (tx, context) =>
    publicResourceProjection(tx, context, kind, id)
  );
function noStore(response: Response) {
  for (const key of [
    "cache-control",
    "cdn-cache-control",
    "vercel-cdn-cache-control"
  ])
    assert.match(response.headers.get(key) ?? "", /no-store/);
}
async function sitemapPages(kind: "listings" | "media") {
  const index = await publicSitemapResponse(
    db,
    new Request(origin + "/sitemap.xml")
  );
  assert.equal(index.status, 200);
  noStore(index);
  const urls = [...(await index.text()).matchAll(/<loc>([^<]+)<\/loc>/g)]
    .map((match) => new URL(match[1].replace(/&amp;/g, "&")))
    .filter((url) => url.searchParams.get("kind") === kind);
  const pages: string[] = [];
  for (const url of urls) {
    assert.equal(url.origin, origin);
    const response = await publicSitemapResponse(db, new Request(url));
    assert.equal(response.status, 200);
    noStore(response);
    pages.push(await response.text());
  }
  return pages;
}
async function available(
  kind: PublicResourceKind,
  id: string,
  expected: boolean
) {
  assert.equal(!!(await projection(kind, id)), expected);
  const preview = await publicSharePreview(db, { kind, id });
  assert.equal(preview.available, expected);
  assert.equal(!!(await publicStructuredData(db, kind, id)), expected);
  assert.equal(
    (await sitemapPages(kind === "listing" ? "listings" : "media"))
      .join("\n")
      .includes(id),
    expected
  );
  if (!expected) {
    assert.equal(preview.title, "God’s Churches");
    assert.equal(preview.author, null);
    assert.equal(preview.image.url, origin + "/brand/share-card.png");
  }
}

test("public listing and media projections expose only supplied public copy and stable canonical identities", async () => {
  const l = await listing(),
    m = await media();
  await db.mediaCatalogRights.update({
    where: { itemId: m.id },
    data: {
      evidenceReference: "PRIVATE-RIGHTS-EVIDENCE",
      consentReference: "PRIVATE-CONSENT-REFERENCE"
    }
  });
  for (const [kind, id, title, description] of [
    [
      "listing",
      l.id,
      "Fictional public table",
      "A supplied description of a fictional table."
    ],
    [
      "media",
      m.id,
      "Fictional public recording",
      "A supplied description of a fictional recording."
    ]
  ] as const) {
    await available(kind, id, true);
    assert.deepEqual(await projection(kind, id), { id, title, description });
    const preview = await publicSharePreview(db, { kind, id }, owner.token);
    const canonical = `/platform/${kind === "listing" ? "exchange" : "media"}/${id}`;
    assert.equal(canonicalSharePath(kind, id), canonical);
    assert.equal(preview.path, canonical);
    assert.equal(preview.url, origin + canonical);
    assert.equal(preview.author, null);
    const data = await publicStructuredData(db, kind, id);
    assert.deepEqual(data, {
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: title,
      description,
      url: origin + canonical
    });
    const serialized = JSON.stringify({ preview, data });
    for (const privateValue of [
      owner.email,
      owner.id,
      "private-resource-contact",
      "PRIVATE-RIGHTS",
      "PRIVATE-CONSENT",
      "youtu.be",
      "abcdefghijk"
    ])
      assert.ok(!serialized.includes(privateValue), privateValue);
  }
  for (const kind of ["business", "venture"])
    assert.throws(() => canonicalSharePath(kind, l.id));
});

test("signed-in ownership and church membership never expand the public metadata audience", async () => {
  const l = await listing(owner, "CHURCH");
  const members = await media("MEMBERS");
  const church = await media("CHURCH", owner, churchId);
  for (const [kind, id] of [
    ["listing", l.id],
    ["media", members.id],
    ["media", church.id]
  ] as const) {
    await available(kind, id, false);
    for (const actor of [owner, viewer]) {
      assert.equal(await projection(kind, id, actor.token), null);
      assert.equal(
        (await publicSharePreview(db, { kind, id }, actor.token)).available,
        false
      );
    }
  }
});

test("listing availability, moderation, audience, recovery and owner changes immediately remove earlier public copy", async () => {
  const l = await listing();
  await available("listing", l.id, true);
  await db.exchangeListing.update({
    where: { id: l.id },
    data: { state: "RESERVED" }
  });
  await available("listing", l.id, true);
  const restrictions: Prisma.ExchangeListingUncheckedUpdateInput[] = [
    { state: "CLOSED" },
    { state: "ARCHIVED" },
    { state: "DRAFT" },
    { moderationState: "HIDDEN" },
    { moderationState: "REMOVED" },
    { recoveryRequired: true },
    { audience: "CHURCH", audienceChurchId: churchId }
  ];
  for (const restriction of restrictions) {
    await db.exchangeListing.update({ where: { id: l.id }, data: restriction });
    await available("listing", l.id, false);
    await db.exchangeListing.update({
      where: { id: l.id },
      data: {
        state: "ACTIVE",
        moderationState: "VISIBLE",
        recoveryRequired: false,
        audience: "PUBLIC",
        audienceChurchId: null
      }
    });
    await available("listing", l.id, true);
  }
  await db.exchangeListing.update({
    where: { id: l.id },
    data: { state: "ARCHIVED", erasedAt: new Date() }
  });
  await available("listing", l.id, false);
});

test("media publication, rights, source and recovery changes invalidate metadata, structured facts and sitemap entries", async () => {
  const m = await media();
  const original = await db.mediaCatalogItem.findUniqueOrThrow({
    where: { id: m.id }
  });
  const changes: Prisma.MediaCatalogItemUpdateInput[] = [
    { state: "UNPUBLISHED" },
    { state: "DRAFT" },
    { moderationState: "HIDDEN" },
    { recoveryRequired: true },
    { sourceState: "REVIEW_NEEDED" },
    { sourceState: "UNAVAILABLE" },
    { sourceUrl: null },
    { acknowledgment: "mismatched-fingerprint" },
    { publishedAt: new Date(Date.now() + 86400000) },
    { removedAt: new Date() }
  ];
  for (const change of changes) {
    await available("media", m.id, true);
    await db.mediaCatalogItem.update({ where: { id: m.id }, data: change });
    await available("media", m.id, false);
    await db.mediaCatalogItem.update({
      where: { id: m.id },
      data: {
        state: "PUBLISHED",
        moderationState: "VISIBLE",
        recoveryRequired: false,
        sourceState: "ATTESTED",
        sourceUrl: original.sourceUrl,
        acknowledgment: original.acknowledgment,
        publishedAt: original.publishedAt,
        removedAt: null
      }
    });
  }
  for (const restriction of [
    { revokedAt: new Date() },
    { expiresAt: new Date(Date.now() - 1000) },
    { policy: "obsolete-policy" },
    { fingerprint: "other-recording" }
  ]) {
    await db.mediaCatalogRights.update({
      where: { itemId: m.id },
      data: restriction
    });
    await available("media", m.id, false);
    await db.mediaCatalogRights.update({
      where: { itemId: m.id },
      data: {
        revokedAt: null,
        expiresAt: null,
        policy: MEDIA_POLICY,
        fingerprint: original.acknowledgment!
      }
    });
    await available("media", m.id, true);
  }
  await mediaCatalogCommand(
    db,
    owner.token,
    input("unpublish", { itemId: m.id, expectedVersion: m.version })
  );
  await available("media", m.id, false);
});

test("personal owner eligibility and viewer blocks narrow current discovery without granting private access", async () => {
  const author = await createPortalActor(db, "resowner");
  const l = await listing(author),
    m = await media("PUBLIC", author);
  const original = await db.platformUser.findUniqueOrThrow({
    where: { id: author.id }
  });
  for (const change of [
    { deactivatedAt: new Date() },
    { suspendedAt: new Date() },
    { emailVerifiedAt: null },
    { adultAcknowledgedAt: null },
    { adultPolicyVersion: "old-policy" }
  ]) {
    await db.platformUser.update({ where: { id: author.id }, data: change });
    for (const [kind, id] of [
      ["listing", l.id],
      ["media", m.id]
    ] as const)
      await available(kind, id, false);
    await db.platformUser.update({
      where: { id: author.id },
      data: {
        deactivatedAt: null,
        suspendedAt: null,
        emailVerifiedAt: original.emailVerifiedAt,
        adultAcknowledgedAt: original.adultAcknowledgedAt,
        adultPolicyVersion: original.adultPolicyVersion
      }
    });
  }
  await relationshipCommand(
    db,
    viewer.token,
    input("block", {
      kind: "person",
      targetId: author.id,
      expectedVersion: 0,
      desired: true
    })
  );
  for (const [kind, id] of [
    ["listing", l.id],
    ["media", m.id]
  ] as const) {
    await available(kind, id, true);
    assert.equal(await projection(kind, id, viewer.token), null);
    assert.equal(
      (await publicSharePreview(db, { kind, id }, viewer.token)).available,
      false
    );
  }
});

test("church media requires current public listing and verified church management even for its manager", async () => {
  const m = await media("PUBLIC", owner, churchId);
  await available("media", m.id, true);
  await db.church.update({
    where: { id: churchId },
    data: { communityListed: false }
  });
  await available("media", m.id, false);
  assert.equal(await projection("media", m.id, owner.token), null);
  await db.church.update({
    where: { id: churchId },
    data: { communityListed: true }
  });
  const grant = await db.churchCapabilityGrant.findFirstOrThrow({
    where: { churchId, capability: "MANAGE_CHURCH_ACCESS" }
  });
  await db.churchCapabilityGrant.update({
    where: { id: grant.id },
    data: { revokedAt: new Date() }
  });
  await available("media", m.id, false);
  await db.churchCapabilityGrant.update({
    where: { id: grant.id },
    data: { revokedAt: null }
  });
  await available("media", m.id, true);
});

test("interchurch help retains its separate route and never becomes an ordinary public listing preview", async () => {
  const created = await interchurchHelpCommand(
    db,
    owner.token,
    input("create", {
      expectedVersion: 0,
      ownerChurchId: churchId,
      schema: 1,
      fields: {
        title: "Fictional help with adult worship audio",
        category: "AV",
        country: "US",
        placeId: 4887398,
        audience: "PUBLIC",
        acceptCoordinator: true,
        coordinatorDisplay: "Consenting fictional coordinator",
        terms: {
          duties:
            "Prepare adult worship microphones, excluding child contact and supervision.",
          dutyClass: "ADULT_LOGISTICS",
          equipmentMode: "NONE",
          startLocal: new Date(Date.now() + 3 * 86400000)
            .toISOString()
            .slice(0, 16),
          endLocal: new Date(Date.now() + 4 * 86400000)
            .toISOString()
            .slice(0, 16),
          timeZone: "UTC",
          compensation: "VOLUNTARY",
          price: "",
          currency: "",
          rateUnit: "",
          reimbursement: "No expense reimbursement proposed."
        }
      }
    })
  );
  await interchurchHelpCommand(
    db,
    owner.token,
    input("publish", {
      requestId: created.id,
      expectedVersion: created.version,
      itemPolicy: EXCHANGE_ITEM_POLICY,
      itemConfirmed: true
    })
  );
  const help = await db.interchurchHelpRequest.findUniqueOrThrow({
    where: { id: created.id }
  });
  assert.ok(help.listingId);
  await available("listing", help.listingId, false);
});

test("resource PNGs discard copy withdrawn during rendering and JSON rejects caller-supplied preview fields", async () => {
  const l = await listing(),
    m = await media();
  for (const [kind, id] of [
    ["listing", l.id],
    ["media", m.id]
  ] as const) {
    const url = new URL("/api/platform/share-preview", origin);
    url.search = new URLSearchParams({
      kind,
      id,
      title: "INJECTED-PREVIEW-COPY",
      image: "https://untrusted.test/private"
    }).toString();
    const json = await sharePreviewResponse(db, new Request(url));
    assert.equal(json.status, 200);
    noStore(json);
    assert.ok(!(await json.text()).includes("INJECTED-PREVIEW"));
    url.searchParams.set("format", "png");
    let rendered = false;
    const png = await sharePreviewResponse(
      db,
      new Request(url),
      async (fields) => {
        rendered = true;
        if (kind === "listing")
          await db.exchangeListing.update({
            where: { id },
            data: { state: "ARCHIVED" }
          });
        else
          await db.mediaCatalogRights.update({
            where: { itemId: id },
            data: { revokedAt: new Date() }
          });
        return renderShareCard(fields);
      }
    );
    assert.equal(rendered, true);
    assert.equal(png.status, 200);
    noStore(png);
    assert.equal(png.headers.get("content-type"), "image/png");
    assert.deepEqual(
      Buffer.from(await png.arrayBuffer()),
      await defaultShareCard()
    );
    await available(kind, id, false);
  }
});

test("structured resource copy remains inert script data and never asserts offers, ratings, duration or provider facts", async () => {
  const m = await media();
  const hostile = "Fictional </script><script>bad()</script>& recording";
  await db.mediaCatalogItem.update({
    where: { id: m.id },
    data: { title: hostile }
  });
  const data = await publicStructuredData(db, "media", m.id);
  assert.equal(data?.name, hostile);
  const encoded = serializeStructuredData(data);
  assert.ok(!encoded.includes("<") && !encoded.includes("&"));
  assert.equal(JSON.parse(encoded).name, hostile);
  for (const field of [
    "offers",
    "price",
    "aggregateRating",
    "review",
    "duration",
    "contentUrl",
    "embedUrl",
    "telephone",
    "email",
    "author"
  ])
    assert.ok(!Object.hasOwn(data!, field));
});

test("both resource sitemap kinds traverse every bounded partition and drop sources changed after indexing", async () => {
  const l = await listing(),
    m = await media();
  const template = await db.exchangeListing.findUniqueOrThrow({
    where: { id: l.id }
  });
  const mediaTemplate = await db.mediaCatalogItem.findUniqueOrThrow({
    where: { id: m.id }
  });
  const rights = await db.mediaCatalogRights.findUniqueOrThrow({
    where: { itemId: m.id }
  });
  const prefix = "resource-sitemap-" + randomUUID();
  const listingIds = Array.from(
    { length: sitemapPageSize + 1 },
    (_, i) => `${prefix}-l-${i.toString().padStart(4, "0")}`
  );
  const mediaIds = Array.from(
    { length: sitemapPageSize + 1 },
    (_, i) => `${prefix}-m-${i.toString().padStart(4, "0")}`
  );
  await db.exchangeListing.createMany({
    data: listingIds.map((id) => ({ ...template, id }))
  });
  await db.mediaCatalogItem.createMany({
    data: mediaIds.map((id) => ({
      ...mediaTemplate,
      id,
      details: { preachedOn: null },
      chapters: mediaTemplate.chapters ?? [],
      scriptureRanges: []
    }))
  });
  await db.mediaCatalogRights.createMany({
    data: mediaIds.map((itemId) => ({ ...rights, itemId }))
  });
  for (const [kind, path, ids] of [
    ["listings", "exchange", listingIds],
    ["media", "media", mediaIds]
  ] as const) {
    const pages = await sitemapPages(kind);
    assert.ok(pages.length >= 2);
    const locations = new Set<string>();
    for (const page of pages) {
      const entries = [...page.matchAll(/<loc>([^<]+)<\/loc>/g)].map(
        (match) => match[1]
      );
      assert.ok(entries.length <= sitemapPageSize);
      for (const entry of entries) {
        assert.ok(!locations.has(entry));
        locations.add(entry);
      }
      assert.ok(!page.includes("private-login") && !page.includes("youtu.be"));
    }
    for (const id of ids)
      assert.ok(locations.has(`${origin}/platform/${path}/${id}`));
  }
  await db.exchangeListing.update({
    where: { id: listingIds.at(-1)! },
    data: { state: "CLOSED" }
  });
  await db.mediaCatalogRights.update({
    where: { itemId: mediaIds.at(-1)! },
    data: { revokedAt: new Date() }
  });
  assert.ok(
    !(await sitemapPages("listings")).join("\n").includes(listingIds.at(-1)!)
  );
  assert.ok(
    !(await sitemapPages("media")).join("\n").includes(mediaIds.at(-1)!)
  );
});
