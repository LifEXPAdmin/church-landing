import { sessionCookieFixtureName } from "../scripts/session-cookie-fixture.mjs";
import { handlePostWorkspaceRequest } from "../lib/platform/post-workspace-boundary";
import test, { before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import {
  assertPortalTestDatabase,
  createPortalActor,
  type PortalActor
} from "./seed-portal";
import { postCommand } from "../lib/platform/post-commands";
import {
  postWorkspaceCommand,
  readPostWorkspace
} from "../lib/platform/post-workspace";
import type { PostResourceReference } from "../lib/platform/post-resource-input";
import { PortalError } from "../lib/platform/portal-policy";
import { mediaCatalogCommand } from "../lib/platform/media-catalog-commands";
import { mediaFields } from "../lib/platform/media-catalog-input";
import { MEDIA_POLICY } from "../lib/platform/media-catalog-options";
const db = new PrismaClient();
let author: PortalActor,
  member: PortalActor,
  outsider: PortalActor,
  churchId: string;
before(async () => {
  await assertPortalTestDatabase(db);
  author = await createPortalActor(db, "resourceauthor");
  member = await createPortalActor(db, "resourcemember");
  outsider = await createPortalActor(db, "resourceguest");
  churchId = (
    await db.church.create({
      data: {
        slug: randomUUID(),
        name: "Fictional card church",
        summary: "Isolated resource card fixture",
        communityListed: true
      }
    })
  ).id;
  await db.churchConnection.createMany({
    data: [author, member].map((a) => ({
      userId: a.id,
      churchId,
      state: "APPROVED"
    }))
  });
  await db.churchCapabilityGrant.createMany({
    data: [
      "PUBLISH_CHURCH_POSTS",
      "EDIT_CHURCH_CALENDAR",
      "PUBLISH_CHURCH_EVENTS"
    ].map((capability) => ({
      userId: author.id,
      churchId,
      capability: capability as "PUBLISH_CHURCH_POSTS"
    }))
  });
});
beforeEach(() => db.platformAuthLimit.deleteMany());
after(() => db.$disconnect());
const denied = (work: Promise<unknown>, status: number) =>
  assert.rejects(work, (e) => e instanceof PortalError && e.status === status);
const ref = (
  kind: PostResourceReference["kind"],
  id: string
): PostResourceReference => ({ kind, id });
const makePost = (
  references: PostResourceReference[],
  fields: Record<string, unknown> = {}
) =>
  postCommand(db, author.token, {
    operation: "create",
    requestKey: randomUUID(),
    content: "Fictional post keeps its own readable text",
    audience: "PUBLIC",
    resourceReferences: references,
    ...fields
  });
const listing = (fields: Record<string, unknown> = {}) =>
  db.exchangeListing.create({
    data: {
      ownerId: author.id,
      creatorId: author.id,
      state: "ACTIVE",
      publishedAt: new Date(),
      confirmedAt: new Date(),
      itemPolicy: "exchange-listings-v3",
      category: "BOOKS",
      condition: "GOOD",
      country: "US",
      placeId: 4887398,
      placeLabel: "Chicago",
      title: "Fictional resource " + randomUUID(),
      description: "Never copy this private extended description",
      ...fields
    }
  });
async function event(
  visibility: "PUBLIC" | "CHURCH" | "PRIVATE" = "PUBLIC",
  personal = false
) {
  const calendar = await db.platformCalendar.create({
    data: {
      name: "Private calendar name",
      creatorId: author.id,
      requestKey: randomUUID(),
      timeZone: "UTC",
      ...(personal ? { ownerId: author.id } : { churchId })
    }
  });
  const row = await db.calendarEvent.create({
    data: {
      calendarId: calendar.id,
      requestKey: randomUUID(),
      title: "Series title",
      timeZone: "UTC",
      startLocal: "2026-10-10T12:00",
      endLocal: "2026-10-10T13:00",
      visibility
    }
  });
  const occurrence = await db.calendarOccurrence.create({
    data: {
      eventId: row.id,
      ordinal: 0,
      title: "Occurrence title " + randomUUID(),
      description: "Private event detail",
      onlineUrl: "https://private.example.test/secret",
      organizer: "Private organizer",
      allDay: false,
      timeZone: "UTC",
      startLocal: row.startLocal,
      endLocal: row.endLocal,
      startAt: new Date("2026-10-10T12:00Z"),
      endAt: new Date("2026-10-10T13:00Z")
    }
  });
  return {
    calendar,
    row,
    occurrence,
    reference: ref("eventOccurrence", occurrence.id)
  };
}
async function opportunity(audience: "PUBLIC" | "CHURCH" = "PUBLIC") {
  const post = await makePost([], { authorChurchId: churchId, audience });
  const row = await db.volunteerOpportunity.create({
    data: {
      postId: post.id,
      title: "Fictional opportunity " + randomUUID(),
      contact: "Private coordinator contact",
      requirements: "Adults only",
      commitment: "One hour by arrangement",
      capacity: 3,
      duties: "Do not copy application details"
    }
  });
  return { post, row, reference: ref("volunteerOpportunity", row.id) };
}

const save = (
  reference: PostResourceReference,
  actor = member,
  extra: Record<string, unknown> = {}
) =>
  postWorkspaceCommand(db, actor.token, {
    operation: "save-resource",
    mutationId: randomUUID(),
    expectedVersion: 0,
    resource: reference,
    ...extra
  });
const saved = async (actor = member, query: Record<string, unknown> = {}) =>
  (await readPostWorkspace(db, actor.token, { view: "saved", ...query })) as {
    items: { id: string; available: boolean; resource?: { id: string; kind: string; title: string }; post?: unknown }[];
    nextCursor: string | null;
  };
async function media() {
  const fields = mediaFields({
    title: "Fictional bookmark media",
    description: "Private provider details",
    format: "SERMON",
    presentation: "VIDEO",
    audience: "PUBLIC",
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
  const row = await mediaCatalogCommand(db, author.token, {
    operation: "create",
    mutationId: randomUUID(),
    ownerChurchId: null,
    ...reviewed
  });
  await mediaCatalogCommand(db, author.token, {
    operation: "publish",
    mutationId: randomUUID(),
    itemId: row.id,
    expectedVersion: row.version,
    ...reviewed
  });
  return ref("mediaCatalogItem", row.id);
}

test("all four kinds bookmark only references and resolve fresh, narrow cards without source payloads", async () => {
  const l = await listing(),
    e = await event(),
    v = await opportunity(),
    m = await media();
  const references = [
    ref("exchangeListing", l.id),
    e.reference,
    v.reference,
    m
  ];
  const rows = await Promise.all(references.map((r) => save(r)));
  const page = await saved();
  for (let i = 0; i < rows.length; i++) {
    const item = page.items.find((r) => r.id === rows[i].id);
    assert.ok(item?.resource);
    assert.equal(item.available, true);
    assert.equal(item.resource.kind, references[i].kind);
    assert.equal(item.resource.id, references[i].id);
    const raw = await db.savedPostItem.findUniqueOrThrow({
      where: { id: rows[i].id }
    });
    assert.equal(raw.resourceId, references[i].id);
    assert.equal(raw.postId, null);
    assert.equal("title" in raw, false);
  }
  assert.doesNotMatch(
    JSON.stringify(page),
    /Private provider|private.example|Private coordinator|Adults only|Never copy|sourceUrl|requirements/
  );
  await db.calendarOccurrence.update({
    where: { id: e.occurrence.id },
    data: { title: "Changed current event title" }
  });
  assert.equal(
    (await saved()).items.find((r) => r.id === rows[1].id)?.resource?.title,
    "Changed current event title"
  );
  await db.exchangeListing.update({
    where: { id: l.id },
    data: { state: "ARCHIVED", erasedAt: new Date() }
  });
  await db.calendarEvent.update({
    where: { id: e.row.id },
    data: { visibility: "PRIVATE" }
  });
  await db.platformPost.update({
    where: { id: v.post.id },
    data: { status: "WITHDRAWN", withdrawnAt: new Date() }
  });
  await db.mediaCatalogItem.update({
    where: { id: m.id },
    data: { state: "DRAFT" }
  });
  for (const row of rows) {
    const item = (await saved()).items.find((r) => r.id === row.id);
    assert.deepEqual(item, {
      id: row.id,
      version: 1,
      collectionId: null,
      available: false
    });
  }
});

test("current access gates save, status and receipt replay; private personal events never grant bookmark access", async () => {
  const e = await event("CHURCH");
  await denied(save(e.reference, outsider), 404);
  await denied(
    readPostWorkspace(db, outsider.token, {
      view: "saved-resource-status",
      resourceKind: e.reference.kind,
      resourceId: e.reference.id
    }),
    404
  );
  const mutation = {
    operation: "save-resource",
    mutationId: randomUUID(),
    expectedVersion: 0,
    resource: e.reference
  };
  const result = await postWorkspaceCommand(db, member.token, mutation);
  assert.deepEqual(
    await postWorkspaceCommand(db, member.token, mutation),
    result
  );
  await db.calendarEvent.update({
    where: { id: e.row.id },
    data: { visibility: "PRIVATE" }
  });
  await denied(postWorkspaceCommand(db, member.token, mutation), 404);
  await denied(save(e.reference), 404);
  assert.equal(
    (await saved()).items.find((r) => r.id === result.id)?.available,
    false
  );
  const personal = await event("PRIVATE", true);
  await denied(save(personal.reference), 404);
});

test("duplicate races, changed retries, owner isolation, collection move and removal preserve references", async () => {
  const e = await event();
  const races = await Promise.allSettled([
    save(e.reference),
    save(e.reference)
  ]);
  assert.equal(races.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(
    races.filter((r) => r.status === "rejected" && r.reason.status === 409)
      .length,
    1
  );
  const item = (await saved()).items.find(
    (r) => r.resource?.id === e.occurrence.id
  );
  assert.ok(item);
  const collection = randomUUID();
  const command = (
    operation: string,
    fields: Record<string, unknown>,
    actor = member
  ) =>
    postWorkspaceCommand(db, actor.token, {
      operation,
      mutationId: randomUUID(),
      ...fields
    });
  await command("create-collection", {
    id: collection,
    name: "Private event plans",
    expectedVersion: 0
  });
  await denied(
    command(
      "move-item",
      { id: item.id, expectedVersion: 1, collectionId: collection },
      outsider
    ),
    404
  );
  await command("move-item", {
    id: item.id,
    expectedVersion: 1,
    collectionId: collection
  });
  assert.equal(
    (await saved(member, { collectionId: collection })).items[0].id,
    item.id
  );
  assert.ok(!(await saved(outsider)).items.some((r) => r.id === item.id));
  await command("delete-collection", { id: collection, expectedVersion: 1 });
  const unfiled = await db.savedPostItem.findUniqueOrThrow({
    where: { id: item.id }
  });
  assert.equal(unfiled.collectionId, null);
  assert.equal(unfiled.resourceId, e.occurrence.id);
  await command("remove-item", {
    id: item.id,
    expectedVersion: unfiled.version
  });
  assert.equal(
    await db.savedPostItem.findUnique({ where: { id: item.id } }),
    null
  );
  assert.ok(
    await db.calendarOccurrence.findUnique({ where: { id: e.occurrence.id } })
  );
});

test("malformed and forged payloads, cross-owner collections and invalid SQL pairs fail closed", async () => {
  for (const r of [
    { kind: "unknown", id: "x" },
    { kind: "eventOccurrence", id: "x", title: "Copied private text" },
    { kind: "eventOccurrence", id: "" }
  ])
    await denied(save(r as PostResourceReference), 400);
  const e = await event();
  await denied(save(e.reference, member, { ownerId: outsider.id }), 400);
  for (const data of [
    { resourceKind: "eventOccurrence" },
    { resourceId: e.occurrence.id },
    { resourceKind: "unknown", resourceId: e.occurrence.id }
  ])
    await assert.rejects(
      db.savedPostItem.create({ data: { ownerId: member.id, ...data } })
    );
  const c = randomUUID();
  await postWorkspaceCommand(db, member.token, {
    operation: "create-collection",
    mutationId: randomUUID(),
    id: c,
    expectedVersion: 0,
    name: "Private"
  });
  await assert.rejects(
    db.savedPostItem.create({
      data: {
        ownerId: outsider.id,
        collectionId: c,
        resourceKind: e.reference.kind,
        resourceId: e.reference.id
      }
    })
  );
});

test("unavailable and deleted references paginate without carrying stale details", async () => {
  const actor = await createPortalActor(db, "savedpages");
  const e = await event();
  await save(e.reference, actor);
  await db.calendarOccurrence.delete({ where: { id: e.occurrence.id } });
  await db.savedPostItem.createMany({
    data: Array.from({ length: 24 }, (_, i) => ({
      id: `page_${String(i).padStart(2, "0")}_${randomUUID()}`,
      ownerId: actor.id,
      resourceKind: "eventOccurrence",
      resourceId: `missing_${i}`
    }))
  });
  const first = await saved(actor),
    second = await saved(actor, { after: first.nextCursor });
  assert.equal(first.items.length, 20);
  assert.equal(second.items.length, 5);
  assert.equal(
    new Set([...first.items, ...second.items].map((r) => r.id)).size,
    25
  );
  assert.ok(
    [...first.items, ...second.items].every(
      (r) => !r.available && !r.resource && !r.post
    )
  );
  assert.equal(second.nextCursor, null);
});

test("actual HTTP boundary routes typed status and enforces private caching and expected account", async () => {
  const e = await event(),
    origin = process.env.ACCOUNT_ORIGIN!;
  const url = origin + "/api/platform/post-workspace";
  const make = () => ({
    operation: "save-resource",
    mutationId: randomUUID(),
    expectedVersion: 0,
    resource: e.reference
  });
  const post = (actor: string, originHeader = origin) =>
    handlePostWorkspaceRequest(
      db,
      new Request(url, {
        method: "POST",
        headers: {
          origin: originHeader,
          cookie: `${sessionCookieFixtureName()}=${member.token}`,
          "content-type": "application/json",
          "x-expected-account": actor
        },
        body: JSON.stringify(make())
      })
    );
  assert.equal((await post(outsider.id)).status, 401);
  assert.equal(
    (await post(member.id, "https://unrelated.example")).status,
    403
  );
  assert.equal((await post(member.id)).status, 200);
  const r = await handlePostWorkspaceRequest(
    db,
    new Request(
      url +
        "?" +
        new URLSearchParams({
          view: "saved-resource-status",
          resourceKind: e.reference.kind,
          resourceId: e.reference.id
        }),
      { headers: { cookie: `${sessionCookieFixtureName()}=${member.token}` } }
    )
  );
  assert.equal(r.status, 200);
  assert.match(r.headers.get("cache-control")!, /no-store/);
  assert.equal((await r.json()).item.version, 1);
});
