import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import {
  assertPortalTestDatabase,
  createPortalActor,
  seedOperatorGrants,
  type PortalActor
} from "./seed-portal";
import {
  churchVisitorFields,
  listingFields,
  projectListingData,
  type ListingData
} from "../lib/platform/church-listing-data";
import {
  churchListingCommand,
  getChurchListings,
  listingData
} from "../lib/platform/church-listings";
import {
  churchClaimCommand,
  getChurchClaims,
  CLAIM_POLICY
} from "../lib/platform/church-claims";
import {
  authorityFields,
  projectClaimAuthority
} from "../lib/platform/church-claim-data";
import { handleChurchListingRequest } from "../lib/platform/church-listing-boundary";
import { handleChurchClaimRequest } from "../lib/platform/church-claim-boundary";
import {
  publicChurches,
  getPortalSnapshot,
  PortalError
} from "../lib/platform/portal";
import {
  prepareAccountExport,
  downloadAccountExport
} from "../lib/platform/account-export";

const db = new PrismaClient();
let reviewer: PortalActor;
const previousReview = process.env.CHURCH_CLAIM_REVIEW_ENABLED;
const previousPolicy = process.env.CHURCH_CLAIM_POLICY_VERSION;
before(async () => {
  await assertPortalTestDatabase(db);
  reviewer = await createPortalActor(db, "visitorrev");
  await seedOperatorGrants(db, reviewer, [
    "REVIEW_CHURCH_LISTINGS",
    "REVIEW_CHURCH_CLAIMS",
    "MANAGE_CHURCH_ACCESS"
  ]);
  process.env.CHURCH_CLAIM_REVIEW_ENABLED = "true";
  process.env.CHURCH_CLAIM_POLICY_VERSION = CLAIM_POLICY;
});
after(async () => {
  if (previousReview === undefined)
    delete process.env.CHURCH_CLAIM_REVIEW_ENABLED;
  else process.env.CHURCH_CLAIM_REVIEW_ENABLED = previousReview;
  if (previousPolicy === undefined)
    delete process.env.CHURCH_CLAIM_POLICY_VERSION;
  else process.env.CHURCH_CLAIM_POLICY_VERSION = previousPolicy;
  await db.$disconnect();
});
const denied = (work: Promise<unknown>, status = 403) =>
  assert.rejects(
    work,
    (error: unknown) => error instanceof PortalError && error.status === status
  );
const listing = (actor: PortalActor, input: Record<string, unknown>) =>
  churchListingCommand(db, actor.token, input);
const claim = (actor: PortalActor, input: Record<string, unknown>) =>
  churchClaimCommand(db, actor.token, input);
const readListing = async (actor: PortalActor, id: string) =>
  (await getChurchListings(db, actor.token, id)).submissions[0];
const readClaim = async (actor: PortalActor, id: string) =>
  (await getChurchClaims(db, actor.token, { id })).claims[0];
const visitor = {
  serviceTimes: "Sunday 10:30 AM Central. Confirm holiday changes.",
  accessibilityInfo:
    "Step-free side entrance. Ask the office about assistance.",
  languages: "English, español, 中文 😀",
  childrenPrograms: "Family welcome at 10 AM. Confirm arrangements directly.",
  contactPreferences: "Email the public office address on weekdays."
};
const publicData = () =>
  projectListingData({
    name: "Fictional visitor " + randomUUID(),
    serviceArea: "Fictional area",
    ...visitor
  });
async function correction(
  actor: PortalActor,
  churchId: string,
  data: ListingData
) {
  const church = await db.church.findUniqueOrThrow({ where: { id: churchId } });
  const created = await listing(actor, {
    operation: "create",
    kind: "CORRECTION",
    churchId,
    requestKey: randomUUID()
  });
  await listing(actor, {
    operation: "save",
    id: created.id,
    expectedVersion: 1,
    expectedChurchVersion: church.version,
    data
  });
  await listing(actor, {
    operation: "publish",
    id: created.id,
    expectedVersion: 2,
    publicConfirmed: true,
    searchedConfirmed: true
  });
  return readListing(actor, created.id);
}
async function review(actor: PortalActor, id: string, extra = {}) {
  const row = await db.churchListingSubmission.findUniqueOrThrow({
    where: { id }
  });
  return listing(actor, {
    operation: "review",
    id,
    expectedVersion: row.version,
    action: "APPROVE",
    reason: "Independently checked fictional supplied facts",
    publicConfirmed: true,
    distinctConfirmed: true,
    ...extra
  });
}

test("visitor facts default empty, validate individual bounds and preserve supported multilingual text", async () => {
  const empty = projectListingData({ name: "Legacy public church" });
  for (const key of Object.keys(
    churchVisitorFields
  ) as (keyof typeof churchVisitorFields)[])
    assert.equal(empty[key], "");
  const church = await db.church.create({
    data: {
      name: "Legacy visitor fixture",
      slug: randomUUID(),
      summary: "Fictional existing listing"
    }
  });
  for (const key of Object.keys(
    churchVisitorFields
  ) as (keyof typeof churchVisitorFields)[]) {
    assert.equal(church[key], "");
    const maximum = churchVisitorFields[key].max;
    assert.equal(
      listingData({ ...empty, [key]: "漢".repeat(maximum) }, false)[key].length,
      maximum
    );
    for (const value of [
      "x".repeat(maximum + 1),
      1,
      {},
      "before\u0000after",
      "before\u007fafter",
      "before\ud800after",
      "before\udfffafter"
    ]) {
      assert.throws(
        () => listingData({ ...empty, [key]: value }, false),
        (error: unknown) => error instanceof PortalError && error.status === 400
      );
    }
  }
  assert.equal(
    listingData(
      { ...empty, serviceTimes: "  中文 😀\t10 AM\nConfirm\rchanges  " },
      false
    ).serviceTimes,
    "中文 😀\t10 AM\nConfirm\rchanges"
  );
  await assert.rejects(
    db.church.update({
      where: { id: church.id },
      data: { languages: "x".repeat(301) }
    })
  );
  assert.equal(
    (await db.church.findUniqueOrThrow({ where: { id: church.id } })).languages,
    ""
  );
});

test("private visitor corrections require independent current review, preserve identity and allow deliberate clearing", async () => {
  const owner = await createPortalActor(db, "visitorcor");
  await seedOperatorGrants(db, owner, ["REVIEW_CHURCH_LISTINGS"]);
  const church = await db.church.create({
    data: {
      name: "Visitor correction " + randomUUID(),
      slug: randomUUID(),
      summary: "Fictional existing listing",
      serviceArea: "Fictional area"
    }
  });
  const data = projectListingData({ ...church, ...visitor });
  const pending = await correction(owner, church.id, data);
  assert.deepEqual((await readListing(owner, pending.id)).data, data);
  assert.equal((await publicChurches(db, church.id))[0].serviceTimes, "");
  await denied(review(owner, pending.id));
  const grant = await db.platformOperatorGrant.findUniqueOrThrow({
    where: {
      userId_capability: {
        userId: reviewer.id,
        capability: "REVIEW_CHURCH_LISTINGS"
      }
    }
  });
  await db.platformOperatorGrant.update({
    where: { id: grant.id },
    data: { revokedAt: new Date() }
  });
  try {
    await denied(review(reviewer, pending.id));
  } finally {
    await db.platformOperatorGrant.update({
      where: { id: grant.id },
      data: { revokedAt: null }
    });
  }
  assert.equal(
    (
      await db.churchListingSubmission.findUniqueOrThrow({
        where: { id: pending.id }
      })
    ).version,
    pending.version
  );
  await review(reviewer, pending.id);
  const published = (await publicChurches(db, church.id))[0];
  assert.equal(published.id, church.id);
  assert.equal(published.slug, church.slug);
  for (const [key, value] of Object.entries(visitor))
    assert.equal(published[key as keyof typeof visitor], value);
  const signed = await getPortalSnapshot(
    db,
    owner.token,
    "discover",
    church.id
  );
  assert.equal(signed.church?.serviceTimes, visitor.serviceTimes);
  const bulk = (
    await publicChurches(db, undefined, undefined, church.name)
  ).find((row) => row.id === church.id)!;
  assert.ok(bulk);
  for (const key of Object.keys(visitor))
    assert.equal(
      Object.hasOwn(bulk, key),
      false,
      key + " is not shipped with search rows"
    );
  const cleared = projectListingData({
    ...published,
    ...Object.fromEntries(Object.keys(visitor).map((key) => [key, ""]))
  });
  const clearDraft = await correction(owner, church.id, cleared);
  assert.equal(
    (await publicChurches(db, church.id))[0].serviceTimes,
    visitor.serviceTimes
  );
  await db.church.update({
    where: { id: church.id },
    data: { version: { increment: 1 } }
  });
  await denied(review(reviewer, clearDraft.id), 409);
  assert.equal(
    (await publicChurches(db, church.id))[0].serviceTimes,
    visitor.serviceTimes
  );
  await review(reviewer, clearDraft.id, { action: "NEEDS_INFORMATION" });
  const current = await db.church.findUniqueOrThrow({
    where: { id: church.id }
  });
  const row = await readListing(owner, clearDraft.id);
  await listing(owner, {
    operation: "save",
    id: row.id,
    expectedVersion: row.version,
    expectedChurchVersion: current.version,
    data: cleared
  });
  await listing(owner, {
    operation: "publish",
    id: row.id,
    expectedVersion: row.version + 1,
    publicConfirmed: true,
    searchedConfirmed: true
  });
  await review(reviewer, row.id);
  const after = (await publicChurches(db, church.id))[0];
  assert.equal(after.id, church.id);
  for (const key of Object.keys(visitor) as (keyof typeof visitor)[])
    assert.equal(after[key], "");
});

test("incomplete visitor drafts remain private and export only the owner's selected fields", async () => {
  const owner = await createPortalActor(db, "visitorexp");
  const outsider = await createPortalActor(db, "visitorexother");
  const own = await listing(owner, {
    operation: "create",
    kind: "COMMUNITY",
    requestKey: randomUUID()
  });
  const other = await listing(outsider, {
    operation: "create",
    kind: "COMMUNITY",
    requestKey: randomUUID()
  });
  const privateMarker = "private-visitor-" + randomUUID();
  const otherMarker = "other-visitor-" + randomUUID();
  await listing(owner, {
    operation: "save",
    id: own.id,
    expectedVersion: 1,
    data: projectListingData({ ...visitor, serviceTimes: privateMarker })
  });
  await listing(outsider, {
    operation: "save",
    id: other.id,
    expectedVersion: 1,
    data: projectListingData({ serviceTimes: otherMarker })
  });
  await denied(
    listing(owner, {
      operation: "publish",
      id: own.id,
      expectedVersion: 2,
      publicConfirmed: true,
      searchedConfirmed: true
    }),
    400
  );
  await denied(getChurchListings(db, outsider.token, own.id), 404);
  const proof = await prepareAccountExport(
    db,
    owner.token,
    owner.password,
    process.env.AUTH_RATE_LIMIT_SECRET!
  );
  const exported = await downloadAccountExport(
    db,
    owner.token,
    proof.authorization,
    process.env.AUTH_RATE_LIMIT_SECRET!
  );
  assert.ok(exported.includes(privateMarker));
  assert.ok(exported.includes(visitor.languages));
  assert.ok(!exported.includes(otherMarker));
  assert.ok(!exported.includes(owner.token));
  assert.equal(
    await db.church.count({ where: { serviceTimes: privateMarker } }),
    0
  );
});

test("authorized representative visitor edits stay private until publication and revoked grants deny the saved change", async () => {
  const owner = await createPortalActor(db, "visitorclaim");
  const created = await claim(owner, {
    operation: "create",
    requestKey: randomUUID()
  });
  const profile = publicData();
  await claim(owner, {
    operation: "save",
    id: created.id,
    expectedVersion: 1,
    expectedChurchVersion: 0,
    profile,
    authority: projectClaimAuthority({
      position: "Secretary",
      leader: "Fictional confirming leader",
      method: "EMAIL",
      contact: "review@example.test",
      availability: "Weekdays UTC",
      reference: "Fictional independent reference"
    }),
    scopes: ["MANAGE_CHURCH_PROFILE"]
  });
  process.env.CHURCH_CLAIM_REVIEW_ENABLED = "false";
  try {
    await denied(
      claim(owner, {
        operation: "submit",
        id: created.id,
        expectedVersion: 2,
        contactConsent: true,
        searchedConfirmed: true
      }),
      503
    );
  } finally {
    process.env.CHURCH_CLAIM_REVIEW_ENABLED = "true";
  }
  await claim(owner, {
    operation: "submit",
    id: created.id,
    expectedVersion: 2,
    contactConsent: true,
    searchedConfirmed: true
  });
  await claim(reviewer, {
    operation: "review",
    id: created.id,
    expectedVersion: 3,
    action: "APPROVE",
    reason: "Fictional current authority checked",
    trustedSource: "Independent fictional source",
    confirmingPerson: "Fictional leader",
    checkedAt: new Date().toISOString().slice(0, 10),
    independentConfirmed: true,
    scopeConfirmed: true,
    distinctConfirmed: true
  });
  const activated = await claim(owner, {
    operation: "activate",
    id: created.id,
    expectedVersion: 4,
    accessConfirmed: true,
    publicConfirmed: true
  });
  assert.ok(activated.churchId);
  const churchId = activated.churchId!;
  const current = await readClaim(owner, created.id);
  const canonical = (await publicChurches(db, churchId))[0];
  const updated = {
    ...current.profile,
    serviceTimes: "Updated Wednesday 7 PM, UTC"
  };
  await claim(owner, {
    operation: "profile-save",
    id: created.id,
    expectedVersion: current.version,
    expectedChurchVersion: canonical.version,
    profile: updated
  });
  assert.equal(
    (await publicChurches(db, churchId))[0].serviceTimes,
    visitor.serviceTimes
  );
  const saved = await readClaim(owner, created.id);
  await denied(
    claim(owner, {
      operation: "profile-publish",
      id: created.id,
      expectedVersion: saved.version
    }),
    400
  );
  const grant = await db.churchCapabilityGrant.findFirstOrThrow({
    where: {
      userId: owner.id,
      churchId,
      capability: "MANAGE_CHURCH_PROFILE",
      revokedAt: null
    }
  });
  await db.churchCapabilityGrant.update({
    where: { id: grant.id },
    data: { revokedAt: new Date() }
  });
  await denied(
    claim(owner, {
      operation: "profile-publish",
      id: created.id,
      expectedVersion: saved.version,
      publicConfirmed: true
    })
  );
  assert.equal(
    (await publicChurches(db, churchId))[0].serviceTimes,
    visitor.serviceTimes
  );
  await db.churchCapabilityGrant.update({
    where: { id: grant.id },
    data: { revokedAt: null }
  });
  await claim(owner, {
    operation: "profile-publish",
    id: created.id,
    expectedVersion: saved.version,
    publicConfirmed: true
  });
  const after = (await publicChurches(db, churchId))[0];
  assert.equal(after.id, churchId);
  assert.equal(after.serviceTimes, updated.serviceTimes);
});

test("bounded listing and claim handlers accept maximum multilingual fields and reject malformed text without domain writes", async () => {
  const owner = await createPortalActor(db, "visitorhttp");
  const max = projectListingData(
    Object.fromEntries(
      Object.entries(listingFields).map(([key, rule]) => [
        key,
        "漢".repeat(rule.max)
      ])
    )
  );
  max.locationModel = "NO_BUILDING";
  max.website = "https://example.test/" + "a".repeat(479);
  max.publicEmail = "office@example.test";
  max.publicPhone = "+123456789";
  const maximumAuthority = projectClaimAuthority(
    Object.fromEntries(
      Object.entries(authorityFields).map(([key, rule]) => [
        key,
        "漢".repeat(rule.max)
      ])
    )
  );
  maximumAuthority.method = "OTHER";
  const request = (path: string, body: string) =>
    new Request(process.env.ACCOUNT_ORIGIN + path, {
      method: "POST",
      headers: {
        Origin: process.env.ACCOUNT_ORIGIN!,
        Cookie: "church_platform_session=" + owner.token,
        "Content-Type": "application/json"
      },
      body
    });
  for (const kind of ["listing", "claim"] as const) {
    const created =
      kind === "listing"
        ? await listing(owner, {
            operation: "create",
            kind: "COMMUNITY",
            requestKey: randomUUID()
          })
        : await claim(owner, { operation: "create", requestKey: randomUUID() });
    const path =
      "/api/platform/church-" + (kind === "listing" ? "listings" : "claims");
    const handler =
      kind === "listing"
        ? handleChurchListingRequest
        : handleChurchClaimRequest;
    const base = {
      operation: "save",
      id: created.id,
      expectedVersion: 1,
      expectedChurchVersion: 0
    };
    const body = JSON.stringify(
      kind === "listing"
        ? { ...base, data: max }
        : {
            ...base,
            profile: max,
            authority: maximumAuthority,
            scopes: ["MANAGE_CHURCH_PROFILE"]
          }
    );
    assert.ok(Buffer.byteLength(body) > 8192);
    assert.ok(Buffer.byteLength(body) < 32768);
    const good = await handler(db, request(path, body));
    assert.equal(good.status, 200, await good.text());
    const load = () =>
      kind === "listing"
        ? db.churchListingSubmission.findUniqueOrThrow({
            where: { id: created.id }
          })
        : db.churchClaim.findUniqueOrThrow({ where: { id: created.id } });
    const before = await load();
    assert.equal(before.version, 2);
    for (const invalid of [
      "\ud800",
      "\udfff",
      "\u0000",
      "\u007f",
      "x".repeat(1001)
    ]) {
      const bad = { ...max, serviceTimes: invalid };
      const badBody = JSON.stringify(
        kind === "listing"
          ? { ...base, expectedVersion: 2, data: bad }
          : {
              ...base,
              expectedVersion: 2,
              profile: bad,
              authority: maximumAuthority,
              scopes: ["MANAGE_CHURCH_PROFILE"]
            }
      );
      const response = await handler(db, request(path, badBody));
      assert.equal(response.status, 400, await response.text());
      assert.deepEqual(await load(), before);
    }
    if (kind === "claim") {
      const badBody = JSON.stringify({
        ...base,
        expectedVersion: 2,
        profile: max,
        authority: { ...maximumAuthority, reference: "\ud800" },
        scopes: ["MANAGE_CHURCH_PROFILE"]
      });
      const response = await handler(db, request(path, badBody));
      assert.equal(response.status, 400);
      assert.deepEqual(await load(), before);
    }
    const oversized = await handler(
      db,
      request(path, JSON.stringify({ ...base, padding: "漢".repeat(11000) }))
    );
    assert.equal(oversized.status, 400);
    assert.deepEqual(await load(), before);
  }
});
