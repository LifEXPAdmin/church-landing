import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { featuredFixture, saveFeatured } from "./profile-featured-fixture";
import { assertPortalTestDatabase } from "./seed-portal";
import {
  getProfileFeaturedResources,
  getProfileFeaturedChoices
} from "../lib/platform/profile-featured";
import {
  getProfileEditor,
  getMemberProfile,
  getVisitorProfilePreview
} from "../lib/platform/profiles";
import { updateAccountProfile } from "../lib/platform/accounts";
import { emptyProfileModules } from "../lib/platform/profile-modules";
import {
  prepareAccountExport,
  downloadAccountExport
} from "../lib/platform/account-export";
import {
  replayRetentionControls,
  type RetentionControlEntry
} from "../lib/platform/retention-controls";
import { handleAccountRequest } from "../lib/platform/account-boundary";
import { sessionCookieFixtureName } from "../scripts/session-cookie-fixture.mjs";
const queries: string[] = [];
const db = new PrismaClient({ log: [{ emit: "event", level: "query" }] });
db.$on("query", (e) => queries.push(e.query));
before(() => assertPortalTestDatabase(db));
after(() => db.$disconnect());

test("profile resources resolve current viewer and preview policies without raw references or copied source details", async () => {
  const f = await featuredFixture(db);
  await saveFeatured(db, f.owner, f.references);
  const read = (actor = f.member, preview = false) =>
    getProfileFeaturedResources(
      db,
      actor.token,
      f.owner.username,
      preview,
      actor.id
    );
  queries.length = 0;
  const member = await read();
  const count = queries.length;
  assert.equal(member.resources.length, 3);
  assert.ok(count < 40, `Bounded profile-only read: ${count} queries`);
  assert.deepEqual(
    member.resources.map((x) => x.id),
    f.references.map((x) => x.id)
  );
  assert.doesNotMatch(
    JSON.stringify(member),
    /PRIVATE|sourceUrl|requirements|provider|rights|contact|featuredResources/
  );
  for (const actor of [f.owner, f.outsider]) {
    const result = await read(actor, true);
    assert.equal(result.resources.length, 2);
    assert.ok(!JSON.stringify(result).includes(f.opportunity.id));
  }
  const dto = await getMemberProfile(db, f.outsider.token, f.owner.username);
  for (const reference of f.references)
    assert.ok(!JSON.stringify(dto).includes(reference.id));
  assert.ok(!JSON.stringify(dto).includes("featuredResources"));
  assert.ok(!("hasFeaturedResources" in dto));
  assert.deepEqual(
    await getVisitorProfilePreview(db, f.owner.token, f.owner.username),
    { name: f.owner.name, username: f.owner.username }
  );
  await assert.rejects(
    getProfileFeaturedResources(
      db,
      f.member.token,
      f.owner.username,
      false,
      f.outsider.id
    )
  );
  await assert.rejects(
    getProfileFeaturedResources(db, "", f.owner.username, false, f.member.id)
  );
  await db.churchConnection.updateMany({
    where: { userId: f.member.id, churchId: f.church.id },
    data: { state: "LEFT" }
  });
  assert.equal((await read()).resources.length, 2);
  await db.exchangeListing.update({
    where: { id: f.listing.id },
    data: { title: "Edited original title", state: "RESERVED" }
  });
  assert.equal((await read()).resources[0].title, "Edited original title");
  assert.match((await read()).resources[0].state, /reserved/i);
  await db.mediaCatalogItem.update({
    where: { id: f.media.id },
    data: { state: "DRAFT" }
  });
  assert.equal((await read()).resources.length, 1);
  await db.exchangeListing.update({
    where: { id: f.listing.id },
    data: { state: "ARCHIVED", erasedAt: new Date() }
  });
  assert.deepEqual((await read()).resources, []);
  await db.platformUser.update({
    where: { id: f.owner.id },
    data: { deactivatedAt: new Date() }
  });
  await assert.rejects(read());
});

test("profile selection save is atomic, versioned, current-access checked and backward compatible", async () => {
  const f = await featuredFixture(db);
  await saveFeatured(db, f.owner, f.references);
  const before = await getProfileEditor(db, f.owner.token);
  await assert.rejects(
    saveFeatured(db, f.owner, [], { expectedVersion: 0 }),
    /profile-conflict/
  );
  const journals = await db.retentionControl.count({
    where: { sourceId: f.owner.id }
  });
  await assert.rejects(
    saveFeatured(db, f.owner, [
      ...f.references,
      { kind: "mediaCatalogItem", id: "missing" }
    ]),
    /profile-featured/
  );
  assert.deepEqual(await getProfileEditor(db, f.owner.token), before);
  assert.equal(
    await db.retentionControl.count({ where: { sourceId: f.owner.id } }),
    journals
  );
  await updateAccountProfile(
    db,
    f.owner.token,
    {
      name: f.owner.name,
      expectedVersion: before.presentation.version,
      profileModules: {
        ...emptyProfileModules(),
        testimony: "An unrelated older-client edit"
      }
    },
    f.owner.id
  );
  assert.deepEqual(
    (await getProfileEditor(db, f.owner.token)).presentation.modules
      .featuredResources,
    f.references
  );
  await db.mediaCatalogItem.update({
    where: { id: f.media.id },
    data: { state: "DRAFT" }
  });
  await saveFeatured(db, f.owner, [...f.references].reverse());
  assert.deepEqual(
    (await getProfileEditor(db, f.owner.token)).presentation.modules
      .featuredResources,
    [...f.references].reverse()
  );
  await saveFeatured(db, f.owner, []);
  assert.deepEqual(
    (await getProfileEditor(db, f.owner.token)).presentation.modules
      .featuredResources,
    []
  );
  const unverified = await db.platformUser.update({
    where: { id: f.owner.id },
    data: { emailVerifiedAt: null }
  });
  await assert.rejects(
    saveFeatured(db, f.owner, [f.references[0]]),
    /profile-featured/
  );
  await assert.rejects(
    getProfileFeaturedChoices(
      db,
      f.owner.token,
      [f.references[0]],
      unverified.id
    )
  );
});

test("failed additions produce definite HTTP validation without changing sibling text or recovery controls", async () => {
  const f = await featuredFixture(db);
  await saveFeatured(db, f.owner, [f.references[0]]);
  const before = await getProfileEditor(db, f.owner.token);
  const origin = process.env.ACCOUNT_ORIGIN!;
  const response = await handleAccountRequest(
    db,
    new Request(origin + "/api/platform/account", {
      method: "POST",
      headers: {
        origin,
        "content-type": "application/json",
        cookie: sessionCookieFixtureName() + "=" + f.owner.token,
        "x-expected-account": f.owner.id
      },
      body: JSON.stringify({
        operation: "update-profile",
        name: f.owner.name,
        bio: "Must not partially save",
        expectedVersion: before.presentation.version,
        profileModules: {
          ...emptyProfileModules(),
          featuredResources: [{ kind: "mediaCatalogItem", id: "unavailable" }]
        }
      })
    })
  );
  assert.equal(response.status, 400);
  assert.equal((await response.json()).code, "ACCOUNT_PROFILE_VALIDATION");
  assert.deepEqual(await getProfileEditor(db, f.owner.token), before);
});

test("profile resources reuse own export and opaque recovery while never changing canonical sources", async () => {
  const f = await featuredFixture(db);
  await saveFeatured(db, f.owner, f.references);
  const sources = await db.mediaCatalogItem.findUniqueOrThrow({
    where: { id: f.media.id }
  });
  const original = await db.profilePresentation.findUniqueOrThrow({
    where: { userId: f.owner.id }
  });
  const secret = process.env.AUTH_RATE_LIMIT_SECRET!;
  const proof = await prepareAccountExport(
    db,
    f.owner.token,
    f.owner.password,
    secret
  );
  const exported = JSON.parse(
    await downloadAccountExport(db, f.owner.token, proof.authorization, secret)
  );
  assert.deepEqual(
    exported.account.presentation.modules.featuredResources,
    f.references
  );
  await saveFeatured(db, f.owner, []);
  const entries = (
    await db.retentionControl.findMany({
      where: { kind: "PROFILE_MODULES", sourceId: f.owner.id },
      orderBy: { version: "asc" }
    })
  ).map((row) => row.payload as unknown as RetentionControlEntry);
  assert.ok(!JSON.stringify(entries).includes(f.media.id));
  await db.profilePresentation.update({
    where: { userId: f.owner.id },
    data: {
      modules: original.modules!,
      modulesVersion: original.modulesVersion,
      version: original.version
    }
  });
  await replayRetentionControls(db, entries);
  assert.deepEqual(
    (await getProfileEditor(db, f.owner.token)).presentation.modules,
    emptyProfileModules()
  );
  await saveFeatured(db, f.owner, [f.references[0]]);
  await replayRetentionControls(db, entries);
  assert.deepEqual(
    (await getProfileEditor(db, f.owner.token)).presentation.modules
      .featuredResources,
    [f.references[0]]
  );
  assert.deepEqual(
    await db.mediaCatalogItem.findUniqueOrThrow({ where: { id: f.media.id } }),
    sources
  );
});

test("maximum multilingual profile plus six full-length references fits the actual JSONB storage bound", async () => {
  const f = await featuredFixture(db);
  const references = Array.from({ length: 6 }, (_, i) => ({
    kind: "exchangeListing" as const,
    id: "f".repeat(99) + i
  }));
  await db.exchangeListing.createMany({
    data: references.map((reference) => ({
      ...Object.fromEntries(
        Object.entries(f.listing).filter(
          ([key]) => !["id", "createdAt", "updatedAt"].includes(key)
        )
      ),
      id: reference.id
    })) as never
  });
  await saveFeatured(db, f.owner, references, {
    profileModules: {
      testimony: "文".repeat(2000),
      skills: Array.from({ length: 10 }, (_, i) => i + "能".repeat(59)),
      links: Array.from({ length: 3 }, () => ({
        label: "文".repeat(80),
        url: "https://example.test/" + "x".repeat(470)
      })),
      order: ["links", "skills", "testimony"],
      featuredResources: references
    }
  });
  const [row] = await db.$queryRaw<
    Array<{ bytes: number }>
  >`SELECT octet_length(modules::text) AS bytes FROM "ProfilePresentation" WHERE "userId"=${f.owner.id}`;
  assert.ok(row.bytes <= 16000);
});
