import test, { before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import {
  assertPortalTestDatabase,
  createPortalActor,
  type PortalActor
} from "./seed-portal";
import {
  postCommand,
  publishScheduledPost
} from "../lib/platform/post-commands";
import { getPost, getPostAvailabilityBatch } from "../lib/platform/post-reads";
import { getPostEditor } from "../lib/platform/post-editor";
import { postContext } from "../lib/platform/post-access";
import {
  resolvePostResourcesIn,
  resourceCards,
  validatePostResourcesIn
} from "../lib/platform/post-resource-attachments";
import {
  postResourceReferences,
  storedPostResources,
  type PostResourceReference
} from "../lib/platform/post-resource-input";
import {
  postWorkspaceCommand,
  readPostWorkspace
} from "../lib/platform/post-workspace";
import { handlePostResourceRequest } from "../lib/platform/post-resource-boundary";
import { PortalError } from "../lib/platform/portal-policy";
import {
  prepareAccountExport,
  downloadAccountExport
} from "../lib/platform/account-export";
import { requestPermanentAccountDeletion } from "../lib/platform/account-deletion";
import { eraseRequestedAccountData } from "../lib/platform/account-erasure";
import { createSessionToken } from "../lib/platform/auth";
import {
  replayRetentionControls,
  type RetentionControlEntry
} from "../lib/platform/retention-controls";

const queries: string[] = [];
const db = new PrismaClient({ log: [{ emit: "event", level: "query" }] });
db.$on("query", (e) => queries.push(e.query));
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
const readCards = async (id: string, token: unknown = null) => {
  const row = (await getPostAvailabilityBatch(db, token, [id])).posts[0];
  return { ...row, resources: row.resources ?? [] };
};
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

test("strict bounded references reject unknown/reserved kinds, metadata, duplicates and malformed retained data", () => {
  for (const value of [
    null,
    {},
    [null],
    [{ kind: "mediaCatalogItem", id: "x" }],
    [{ kind: "fundraisingCampaign", id: "x" }],
    [{ kind: "post", id: "x" }],
    [{ kind: "eventOccurrence", id: "x", title: "private" }],
    [ref("eventOccurrence", "x"), ref("eventOccurrence", "x")],
    Array.from({ length: 4 }, (_, i) => ref("eventOccurrence", String(i)))
  ]) {
    assert.throws(() => postResourceReferences(value));
    assert.deepEqual(storedPostResources(value), []);
  }
});

test("three canonical kinds persist references only, project whitelisted current cards and omit source metadata from post serialization", async () => {
  const l = await listing(),
    e = await event(),
    v = await opportunity();
  const references = [ref("exchangeListing", l.id), e.reference, v.reference];
  const post = await makePost(references);
  const stored = await db.platformPost.findUniqueOrThrow({
    where: { id: post.id }
  });
  assert.deepEqual(stored.resourceReferences, references);
  const cards = (await readCards(post.id)).resources;
  assert.deepEqual(
    cards.map((r) => r.kind),
    references.map((r) => r.kind)
  );
  assert.equal(cards[1].title, e.occurrence.title);
  assert.equal(cards[1].href, `/platform/events/${e.occurrence.id}`);
  const wire = JSON.stringify(cards);
  for (const forbidden of [
    l.description,
    e.occurrence.onlineUrl,
    e.occurrence.organizer,
    v.row.contact,
    "application",
    "calendarId",
    "version"
  ])
    assert.ok(!wire.includes(forbidden), forbidden);
  const body = JSON.stringify(await getPost(db, null, post.id));
  assert.ok(!body.includes(l.title));
  assert.ok(!body.includes(l.id));
  assert.deepEqual(
    (await getPostEditor(db, author.token, post.id)).resourceReferences,
    references
  );
});

test("publication cannot widen church resources, including church events and opportunities", async () => {
  const l = await listing({ audience: "CHURCH", audienceChurchId: churchId }),
    e = await event("CHURCH"),
    v = await opportunity("CHURCH");
  const references = [ref("exchangeListing", l.id), e.reference, v.reference];
  for (const r of references) await denied(makePost([r]), 400);
  const post = await makePost(references, {
    audience: "CHURCH",
    audienceChurchId: churchId
  });
  assert.equal((await readCards(post.id, member.token)).resources.length, 3);
  assert.deepEqual((await readCards(post.id, outsider.token)).resources, []);
  const update = {
    operation: "edit",
    mutationId: randomUUID(),
    postId: post.id,
    expectedVersion: post.version,
    audience: "PUBLIC",
    resourceReferences: references
  };
  await denied(postCommand(db, author.token, update), 400);
  await denied(
    postCommand(db, author.token, { ...update, confirmAudienceChange: true }),
    400
  );
  assert.equal(
    (await db.platformPost.findUniqueOrThrow({ where: { id: post.id } }))
      .version,
    post.version
  );
});

test("source narrowing, moderation, recovery and deletion remove cards without hiding the original post", async () => {
  const l = await listing(),
    post = await makePost([ref("exchangeListing", l.id)]);
  await db.exchangeListing.update({
    where: { id: l.id },
    data: { audience: "CHURCH", audienceChurchId: churchId }
  });
  assert.deepEqual((await readCards(post.id)).resources, []);
  assert.equal((await readCards(post.id, member.token)).resources.length, 1);
  assert.ok(await getPost(db, null, post.id));
  for (const data of [
    { moderationState: "HIDDEN" },
    { moderationState: "VISIBLE", recoveryRequired: true },
    { recoveryRequired: false, state: "ARCHIVED", erasedAt: new Date() }
  ]) {
    await db.exchangeListing.update({
      where: { id: l.id },
      data: data as never
    });
    assert.deepEqual((await readCards(post.id, member.token)).resources, []);
  }
  await db.exchangeListing.delete({ where: { id: l.id } });
  assert.equal((await readCards(post.id)).available, true);
  const edit = await postCommand(db, author.token, {
    operation: "edit",
    postId: post.id,
    expectedVersion: post.version,
    resourceReferences: [],
    content: "Post remains usable after source removal"
  });
  assert.ok(edit.version > post.version);
});

test("current blocks and revoked membership remove retained cards, without copied source IDs in the response", async () => {
  const l = await listing(),
    post = await makePost([ref("exchangeListing", l.id)]);
  await db.socialRelationship.create({
    data: { ownerId: member.id, targetUserId: author.id, blocked: true }
  });
  assert.deepEqual((await readCards(post.id, member.token)).resources, []);
  await db.socialRelationship.delete({
    where: {
      ownerId_targetUserId: { ownerId: member.id, targetUserId: author.id }
    }
  });
  await db.exchangeListing.update({
    where: { id: l.id },
    data: { audience: "CHURCH", audienceChurchId: churchId }
  });
  await db.churchConnection.update({
    where: { userId_churchId: { userId: member.id, churchId } },
    data: { state: "REMOVED" }
  });
  const wire = JSON.stringify(await readCards(post.id, member.token));
  assert.ok(!wire.includes(l.id));
  assert.ok(!wire.includes(l.title));
  await db.churchConnection.update({
    where: { userId_churchId: { userId: member.id, churchId } },
    data: { state: "APPROVED" }
  });
});

test("private editor and busy-only event access never become attachment publication permission", async () => {
  const e = await event("PRIVATE", true);
  const owner = await postContext(db, author.id),
    reader = await postContext(db, member.id);
  assert.equal(
    (await resolvePostResourcesIn(db, owner, [e.reference])).size,
    1
  );
  await denied(
    makePost([e.reference], { audience: "CHURCH", audienceChurchId: churchId }),
    400
  );
  const connection = await db.churchConnection.findUniqueOrThrow({
    where: { userId_churchId: { userId: author.id, churchId } }
  });
  await db.calendarShare.create({
    data: {
      calendarId: e.calendar.id,
      churchId,
      connectionId: connection.id,
      level: "BUSY"
    }
  });
  assert.equal(
    (await resolvePostResourcesIn(db, reader, [e.reference])).size,
    0
  );
  await db.calendarShare.update({
    where: { calendarId_churchId: { calendarId: e.calendar.id, churchId } },
    data: { level: "DETAILS" }
  });
  const post = await makePost([e.reference], {
    audience: "CHURCH",
    audienceChurchId: churchId
  });
  assert.equal((await readCards(post.id, member.token)).resources.length, 1);
  await db.calendarShare.update({
    where: { calendarId_churchId: { calendarId: e.calendar.id, churchId } },
    data: { revokedAt: new Date() }
  });
  assert.deepEqual((await readCards(post.id, member.token)).resources, []);
});

test("event cancellation and all-day timing stay truthful; source edits refresh without manufacturing a post revision", async () => {
  const e = await event(),
    post = await makePost([e.reference]);
  await db.calendarOccurrence.update({
    where: { id: e.occurrence.id },
    data: {
      title: "Current occurrence title",
      canceledAt: new Date(),
      allDay: true,
      startLocal: "2026-10-10T00:00",
      endLocal: "2026-10-11T00:00"
    }
  });
  const card = (await readCards(post.id)).resources[0];
  assert.equal(card.title, "Current occurrence title");
  assert.equal(card.state, "Canceled");
  assert.equal(card.allDay, true);
  assert.equal(card.startLocal, "2026-10-10T00:00");
  assert.equal(
    (await db.platformPost.findUniqueOrThrow({ where: { id: post.id } }))
      .version,
    1
  );
  await db.calendarEvent.update({
    where: { id: e.row.id },
    data: { visibility: "PRIVATE" }
  });
  assert.deepEqual((await readCards(post.id)).resources, []);
});

test("opportunity closed state stays visible but recovery and backing-post withdrawal hide its metadata", async () => {
  const v = await opportunity(),
    post = await makePost([v.reference]);
  await db.volunteerOpportunity.update({
    where: { id: v.row.id },
    data: { closedAt: new Date() }
  });
  assert.equal((await readCards(post.id)).resources[0].state, "Closed");
  await db.volunteerOpportunity.update({
    where: { id: v.row.id },
    data: { recoveryRequired: true }
  });
  assert.deepEqual((await readCards(post.id)).resources, []);
  await db.volunteerOpportunity.update({
    where: { id: v.row.id },
    data: { recoveryRequired: false }
  });
  await postCommand(db, author.token, {
    operation: "withdraw",
    postId: v.post.id,
    expectedVersion: 1,
    confirmed: true
  });
  assert.deepEqual((await readCards(post.id)).resources, []);
  assert.ok(await getPost(db, null, post.id));
});

test("resource edits use existing version, immutable retry receipt, Edited label and deliberate widening", async () => {
  const a = await listing(),
    b = await listing(),
    post = await makePost([ref("exchangeListing", a.id)], {
      audience: "CHURCH",
      audienceChurchId: churchId
    });
  const body = {
    operation: "edit",
    mutationId: randomUUID(),
    postId: post.id,
    expectedVersion: post.version,
    resourceReferences: [ref("exchangeListing", b.id)]
  };
  const edited = await postCommand(db, author.token, body);
  assert.deepEqual(await postCommand(db, author.token, body), edited);
  await denied(
    postCommand(db, author.token, { ...body, resourceReferences: [] }),
    409
  );
  await denied(
    postCommand(db, author.token, { ...body, mutationId: randomUUID() }),
    409
  );
  const row = await db.platformPost.findUniqueOrThrow({
    where: { id: post.id }
  });
  assert.ok(row.editedAt);
  assert.equal(row.version, 2);
  const wider = {
    operation: "edit",
    postId: post.id,
    expectedVersion: 2,
    audience: "PUBLIC"
  };
  await denied(postCommand(db, author.token, wider), 400);
  await postCommand(db, author.token, {
    ...wider,
    confirmAudienceChange: true
  });
  const wire = JSON.stringify(await getPost(db, null, post.id));
  assert.ok(!wire.includes(a.id));
  assert.ok(!wire.includes(a.title));
  assert.deepEqual(
    (await db.platformPost.findUniqueOrThrow({ where: { id: post.id } }))
      .resourceReferences,
    body.resourceReferences
  );
});

test("an edit retry with omitted resources revalidates retained references, while explicit removal remains usable", async () => {
  const source = await listing();
  const post = await makePost([ref("exchangeListing", source.id)]);
  const edit = {
    operation: "edit",
    mutationId: randomUUID(),
    postId: post.id,
    expectedVersion: post.version,
    content: "Edited text retaining the resource"
  };
  await postCommand(db, author.token, edit);
  await db.exchangeListing.update({
    where: { id: source.id },
    data: { moderationState: "HIDDEN" }
  });
  await denied(postCommand(db, author.token, edit), 409);
  const current = await db.platformPost.findUniqueOrThrow({
    where: { id: post.id }
  });
  await postCommand(db, author.token, {
    operation: "edit",
    mutationId: randomUUID(),
    postId: post.id,
    expectedVersion: current.version,
    resourceReferences: []
  });
  assert.deepEqual(
    (await db.platformPost.findUniqueOrThrow({ where: { id: post.id } }))
      .resourceReferences,
    []
  );
});

test("direct creation and draft publication retry recheck current source access", async () => {
  const l = await listing(),
    body = {
      operation: "create",
      requestKey: randomUUID(),
      content: "A retried card post",
      audience: "PUBLIC",
      resourceReferences: [ref("exchangeListing", l.id)]
    };
  const first = await postCommand(db, author.token, body);
  assert.deepEqual(await postCommand(db, author.token, body), first);
  await db.exchangeListing.update({
    where: { id: l.id },
    data: { state: "DRAFT" }
  });
  await denied(postCommand(db, author.token, body), 409);
  assert.equal(
    await db.platformPost.count({
      where: { authorId: author.id, requestKey: body.requestKey }
    }),
    1
  );
});

test("private drafts preserve exact refs through conflict/retry/resume, guard old-client omission and publish once", async () => {
  const l = await listing(),
    id = randomUUID(),
    references = [ref("exchangeListing", l.id)];
  const payload = {
    content: "Resource private draft",
    replyAudience: "VIEWERS",
    resourceReferences: references
  };
  const save = {
    operation: "save-draft",
    mutationId: randomUUID(),
    id,
    expectedVersion: 0,
    payload
  };
  await postWorkspaceCommand(db, author.token, save);
  const resumed = await readPostWorkspace(db, author.token, {
    view: "draft",
    id
  });
  assert.ok("draft" in resumed);
  assert.deepEqual(resumed.draft?.payload.resourceReferences, references);
  assert.deepEqual(
    await readPostWorkspace(db, outsider.token, { view: "draft", id }),
    { draft: null }
  );
  await denied(
    postWorkspaceCommand(db, author.token, {
      ...save,
      mutationId: randomUUID(),
      expectedVersion: 1,
      payload: { content: "Old client" }
    }),
    400
  );
  await denied(
    postWorkspaceCommand(db, author.token, {
      ...save,
      mutationId: randomUUID()
    }),
    409
  );
  const publish = {
    operation: "publish-draft",
    mutationId: randomUUID(),
    id,
    expectedVersion: 1
  };
  const first = await postWorkspaceCommand(db, author.token, publish);
  assert.deepEqual(
    await postWorkspaceCommand(db, author.token, publish),
    first
  );
  assert.deepEqual(
    (await db.platformPost.findUniqueOrThrow({ where: { id: first.postId! } }))
      .resourceReferences,
    references
  );
  await db.exchangeListing.update({
    where: { id: l.id },
    data: { state: "DRAFT" }
  });
  await denied(postWorkspaceCommand(db, author.token, publish), 409);
});

test("scheduled publication revalidates source narrowing and keeps blocked work as a draft", async () => {
  const l = await listing();
  const post = await makePost([ref("exchangeListing", l.id)], {
    authorChurchId: churchId,
    scheduleLocal: new Date(Date.now() + 3600000).toISOString().slice(0, 16),
    scheduleZone: "UTC"
  });
  const row = await db.platformPost.findUniqueOrThrow({
    where: { id: post.id }
  });
  assert.equal(row.status, "SCHEDULED");
  await db.exchangeListing.update({
    where: { id: l.id },
    data: { audience: "CHURCH", audienceChurchId: churchId }
  });
  const result = await publishScheduledPost(
    db,
    post.id,
    post.version,
    new Date(row.scheduleAt!.getTime() + 1000)
  );
  assert.equal(result.published, false);
  assert.equal(
    (await db.platformPost.findUniqueOrThrow({ where: { id: post.id } }))
      .status,
    "DRAFT"
  );
});

test("owner-pinned preview rejects mismatches and reserved kinds without exposing private data", async () => {
  const l = await listing({ audience: "CHURCH", audienceChurchId: churchId });
  const call = (
    actor: PortalActor | null,
    owner: string | null,
    references: unknown,
    extra = ""
  ) =>
    handlePostResourceRequest(
      db,
      new Request(
        `${process.env.ACCOUNT_ORIGIN}/api/platform/post-resources?${new URLSearchParams({ references: JSON.stringify(references) })}${extra}`,
        {
          headers: {
            ...(actor
              ? { cookie: `church_platform_session=${actor.token}` }
              : {}),
            ...(owner ? { "x-expected-account": owner } : {})
          }
        }
      )
    );
  assert.equal((await call(author, null, [])).status, 401);
  assert.equal((await call(author, outsider.id, [])).status, 401);
  assert.equal(
    (await call(author, author.id, [{ kind: "mediaCatalogItem", id: l.id }]))
      .status,
    400
  );
  assert.equal(
    (await call(author, author.id, [], "&ownerId=forged")).status,
    400
  );
  const response = await call(outsider, outsider.id, [
    ref("exchangeListing", l.id)
  ]);
  assert.match(response.headers.get("cache-control")!, /no-store/);
  assert.deepEqual(await response.json(), { resources: [] });
});

test("source batch costs depend on kinds, not repeated cards, and no authority is created", async () => {
  const l = await listing(),
    e = await event(),
    v = await opportunity();
  const references = [ref("exchangeListing", l.id), e.reference, v.reference];
  const context = await postContext(db, null),
    baseline = queries.length;
  const result = await resolvePostResourcesIn(
    db,
    context,
    Array.from({ length: 30 }, () => references).flat()
  );
  const used = queries.slice(baseline);
  assert.equal(result.size, 3);
  const again = queries.length;
  await resolvePostResourcesIn(db, context, references);
  assert.equal(used.length, queries.length - again);
  assert.ok(used.length <= 15);
  console.log(
    `Resource projection: ${used.length} SQL queries for3unique or90repeated references.`
  );
  assert.equal(resourceCards(references, result).length, 3);
  const grants = await db.churchCapabilityGrant.count();
  await validatePostResourcesIn(
    db,
    await postContext(db, author.id),
    { audience: "PUBLIC", audienceChurchId: null },
    references
  );
  assert.equal(await db.churchCapabilityGrant.count(), grants);
});

test("account export includes only owned references and permanent erasure clears them", async () => {
  const actor = await createPortalActor(db, "resourceerase"),
    l = await listing();
  const references = [ref("exchangeListing", l.id)];
  const post = await postCommand(db, actor.token, {
    operation: "create",
    requestKey: randomUUID(),
    content: "Fictional export and erasure",
    audience: "PUBLIC",
    resourceReferences: references
  });
  const secret = process.env.AUTH_RATE_LIMIT_SECRET!;
  const proof = await prepareAccountExport(
    db,
    actor.token,
    actor.password,
    secret
  );
  const exported = JSON.parse(
    await downloadAccountExport(db, actor.token, proof.authorization, secret)
  );
  assert.deepEqual(
    exported.posts.find((p: { id: string }) => p.id === post.id)
      .resourceReferences,
    references
  );
  assert.ok(!JSON.stringify(exported).includes(l.title));
  const journal = { async recordAccount() {}, async completeAccount() {} };
  await requestPermanentAccountDeletion(
    db,
    actor.token,
    actor.password,
    true,
    createSessionToken(),
    journal
  );
  const deletion = await db.accountDeletion.findUniqueOrThrow({
    where: { userId: actor.id }
  });
  await eraseRequestedAccountData(db, deletion.id, journal);
  assert.deepEqual(
    (await db.platformPost.findUniqueOrThrow({ where: { id: post.id } }))
      .resourceReferences,
    []
  );
  assert.deepEqual((await readCards(post.id)).resources, []);
});

test("reported withdrawal clears references and replay cannot restore attachments from an old backup", async () => {
  const l = await listing(),
    references = [ref("exchangeListing", l.id)],
    post = await makePost(references);
  await db.communityReport.create({
    data: {
      reporterId: outsider.id,
      targetType: "POST",
      targetId: post.id,
      targetVersion: 1,
      reason: "PRIVACY",
      details: "Fictional selected source report"
    }
  });
  await postCommand(db, author.token, {
    operation: "withdraw",
    postId: post.id,
    expectedVersion: 1,
    confirmed: true
  });
  assert.deepEqual(
    (await db.platformPost.findUniqueOrThrow({ where: { id: post.id } }))
      .resourceReferences,
    []
  );
  const entry = await db.retentionControl.findFirstOrThrow({
    where: { kind: "AUTHOR_WITHDRAW_POST", sourceId: post.id }
  });
  assert.ok(!JSON.stringify(entry.payload).includes(l.id));
  await db.platformPost.update({
    where: { id: post.id },
    data: {
      resourceReferences: references,
      status: "PUBLISHED",
      withdrawnAt: null,
      version: 1
    }
  });
  await replayRetentionControls(db, [entry.payload as RetentionControlEntry]);
  const restored = await db.platformPost.findUniqueOrThrow({
    where: { id: post.id }
  });
  assert.equal(restored.status, "WITHDRAWN");
  assert.deepEqual(restored.resourceReferences, []);
});
