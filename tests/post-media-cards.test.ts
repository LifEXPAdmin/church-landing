import test, { before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import {
  assertPortalTestDatabase,
  createPortalActor,
  type PortalActor
} from "./seed-portal";
import { mediaCatalogCommand } from "../lib/platform/media-catalog-commands";
import { mediaFields } from "../lib/platform/media-catalog-input";
import { MEDIA_POLICY } from "../lib/platform/media-catalog-options";
import {
  postCommand,
  publishScheduledPost
} from "../lib/platform/post-commands";
import { getPost, getPostAvailabilityBatch } from "../lib/platform/post-reads";
import { postContext } from "../lib/platform/post-access";
import {
  resolvePostResourcesIn,
  validatePostResourcesIn
} from "../lib/platform/post-resource-attachments";
import {
  postResourceReferences,
  type PostResourceReference
} from "../lib/platform/post-resource-input";
import {
  postWorkspaceCommand,
  readPostWorkspace
} from "../lib/platform/post-workspace";
import { PortalError } from "../lib/platform/portal-policy";
const queries: string[] = [];
const db = new PrismaClient({ log: [{ emit: "event", level: "query" }] });
db.$on("query", (e) => queries.push(e.query));
let owner: PortalActor,
  reader: PortalActor,
  other: PortalActor,
  churchId: string;
before(async () => {
  await assertPortalTestDatabase(db);
  owner = await createPortalActor(db, "mediacardowner");
  reader = await createPortalActor(db, "mediacardreader");
  other = await createPortalActor(db, "mediacardother");
  churchId = (
    await db.church.create({
      data: {
        slug: randomUUID(),
        name: "Fictional media card church",
        summary: "Isolated",
        communityListed: true
      }
    })
  ).id;
  await db.churchConnection.createMany({
    data: [owner, reader].map((a) => ({
      userId: a.id,
      churchId,
      state: "APPROVED"
    }))
  });
  const claim = await db.churchClaim.create({
    data: {
      ownerId: owner.id,
      requestKey: randomUUID(),
      churchId,
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
      { userId: owner.id, churchId, capability: "PUBLISH_CHURCH_POSTS" }
    ]
  });
});
beforeEach(() => db.platformAuthLimit.deleteMany());
after(() => db.$disconnect());
const denied = (work: Promise<unknown>, status: number) =>
  assert.rejects(work, (e) => e instanceof PortalError && e.status === status);
const reference = (id: string): PostResourceReference => ({
  kind: "mediaCatalogItem",
  id
});
const review = (fields: ReturnType<typeof mediaFields>) => ({
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
    textRights: true,
    evidenceReference: "private-evidence-reference"
  }
});
async function media(audience = "PUBLIC", church = false, publish = true) {
  const fields = mediaFields({
    title: "Fictional media card " + randomUUID(),
    description: "Private extended details",
    format: "SERMON",
    presentation: "VIDEO",
    audience,
    details: { preachedOn: null },
    sourceUrl: "https://youtu.be/abcdefghijk"
  });
  let row = await mediaCatalogCommand(db, owner.token, {
    operation: "create",
    mutationId: randomUUID(),
    ownerChurchId: church ? churchId : null,
    ...review(fields)
  });
  if (publish)
    row = await mediaCatalogCommand(db, owner.token, {
      operation: "publish",
      mutationId: randomUUID(),
      itemId: row.id,
      expectedVersion: row.version,
      ...review(fields)
    });
  return { row, fields };
}
const postBody = (id: string, patch: Record<string, unknown> = {}) => ({
  operation: "create",
  requestKey: randomUUID(),
  content: "Fictional post remains readable",
  audience: "PUBLIC",
  resourceReferences: [reference(id)],
  ...patch
});
async function cards(id: string, token: unknown = null) {
  return (
    (await getPostAvailabilityBatch(db, token, [id])).posts[0]?.resources ?? []
  );
}
test("media is a strict canonical reference; no source URL or private fields enter cards or post serialization", async () => {
  const m = await media(),
    body = postBody(m.row.id),
    p = await postCommand(db, owner.token, body);
  assert.deepEqual(postResourceReferences([reference(m.row.id)]), [
    reference(m.row.id)
  ]);
  assert.throws(() =>
    postResourceReferences([
      { ...reference(m.row.id), sourceUrl: m.fields.sourceUrl }
    ])
  );
  const rows = await cards(p.id);
  assert.equal(rows.length, 1);
  assert.deepEqual(Object.keys(rows[0]).sort(), [
    "href",
    "id",
    "kind",
    "state",
    "title"
  ]);
  assert.equal(rows[0].href, `/platform/media/${m.row.id}`);
  assert.equal(rows[0].state, "Sermon");
  for (const secret of [
    m.fields.sourceUrl,
    "private-evidence-reference",
    m.fields.description,
    owner.email
  ])
    assert.ok(!JSON.stringify(rows).includes(secret!));
  const wire = JSON.stringify(await getPost(db, null, p.id));
  assert.ok(!wire.includes(m.row.id));
  assert.ok(!wire.includes(m.fields.title));
  assert.deepEqual(await postCommand(db, owner.token, body), p);
});
test("publication checks least-privileged post audience, never draft ownership or unrelated church access", async () => {
  const priv = await media("PUBLIC", false, false),
    members = await media("MEMBERS"),
    church = await media("CHURCH", true);
  await denied(postCommand(db, owner.token, postBody(priv.row.id)), 409);
  await denied(postCommand(db, owner.token, postBody(members.row.id)), 400);
  const p = await postCommand(
    db,
    owner.token,
    postBody(members.row.id, { audience: "CHURCH", audienceChurchId: churchId })
  );
  assert.equal((await cards(p.id, reader.token)).length, 1);
  assert.deepEqual(await cards(p.id), []);
  const c = await postContext(db, owner.id);
  await validatePostResourcesIn(
    db,
    c,
    { audience: "GROUP", audienceChurchId: null },
    [reference(members.row.id)]
  );
  await denied(
    validatePostResourcesIn(
      db,
      c,
      { audience: "GROUP", audienceChurchId: null },
      [reference(church.row.id)]
    ),
    400
  );
  await denied(
    validatePostResourcesIn(
      db,
      c,
      { audience: "CHURCH", audienceChurchId: "unrelated-church" },
      [reference(church.row.id)]
    ),
    400
  );
  await postCommand(
    db,
    owner.token,
    postBody(church.row.id, { audience: "CHURCH", audienceChurchId: churchId })
  );
});
test("source narrowing, revoked membership and blocks conceal cards while preserving independent post text", async () => {
  const m = await media(),
    p = await postCommand(db, owner.token, postBody(m.row.id));
  await mediaCatalogCommand(db, owner.token, {
    operation: "save",
    mutationId: randomUUID(),
    itemId: m.row.id,
    expectedVersion: m.row.version,
    ...review(mediaFields({ ...m.fields, audience: "MEMBERS" }))
  });
  assert.deepEqual(await cards(p.id), []);
  assert.equal((await cards(p.id, reader.token)).length, 1);
  assert.ok(await getPost(db, null, p.id));
  await db.socialRelationship.create({
    data: { ownerId: reader.id, targetUserId: owner.id, blocked: true }
  });
  assert.deepEqual(await cards(p.id, reader.token), []);
  await db.socialRelationship.delete({
    where: {
      ownerId_targetUserId: { ownerId: reader.id, targetUserId: owner.id }
    }
  });
  const ch = await media("CHURCH", true),
    cp = await postCommand(
      db,
      owner.token,
      postBody(ch.row.id, { audience: "CHURCH", audienceChurchId: churchId })
    );
  await db.churchConnection.update({
    where: { userId_churchId: { userId: reader.id, churchId } },
    data: { state: "REMOVED" }
  });
  assert.deepEqual(await cards(cp.id, reader.token), []);
  await db.churchConnection.update({
    where: { userId_churchId: { userId: reader.id, churchId } },
    data: { state: "APPROVED" }
  });
});
test("rights expiry, revocation, moderation, quarantine and removal omit every retained card field", async () => {
  for (const gate of [
    "expiry",
    "revocation",
    "moderation",
    "recovery",
    "source",
    "unpublish",
    "remove"
  ]) {
    const m = await media(),
      p = await postCommand(db, owner.token, postBody(m.row.id));
    if (gate === "expiry")
      await db.mediaCatalogRights.update({
        where: { itemId: m.row.id },
        data: { expiresAt: new Date(0) }
      });
    else if (gate === "revocation")
      await db.mediaCatalogRights.update({
        where: { itemId: m.row.id },
        data: { revokedAt: new Date() }
      });
    else if (gate === "moderation")
      await db.mediaCatalogItem.update({
        where: { id: m.row.id },
        data: { moderationState: "HIDDEN" }
      });
    else if (gate === "recovery")
      await db.mediaCatalogItem.update({
        where: { id: m.row.id },
        data: { recoveryRequired: true }
      });
    else
      await mediaCatalogCommand(db, owner.token, {
        operation: gate === "source" ? "source-unavailable" : gate,
        mutationId: randomUUID(),
        itemId: m.row.id,
        expectedVersion: m.row.version
      });
    assert.deepEqual(await cards(p.id, owner.token), [], gate);
    assert.ok(await getPost(db, null, p.id));
  }
});
test("source edits refresh cards without post history, while deliberate replacement/removal uses existing revisions and widening consent", async () => {
  const m = await media(),
    n = await media(),
    p = await postCommand(
      db,
      owner.token,
      postBody(m.row.id, { audience: "CHURCH", audienceChurchId: churchId })
    );
  await mediaCatalogCommand(db, owner.token, {
    operation: "save",
    mutationId: randomUUID(),
    itemId: m.row.id,
    expectedVersion: m.row.version,
    ...review(mediaFields({ ...m.fields, title: "Fresh source title" }))
  });
  assert.equal(
    (await cards(p.id, reader.token))[0].title,
    "Fresh source title"
  );
  assert.equal(
    (await db.platformPost.findUniqueOrThrow({ where: { id: p.id } })).version,
    1
  );
  const edit = {
    operation: "edit",
    mutationId: randomUUID(),
    postId: p.id,
    expectedVersion: 1,
    resourceReferences: [reference(n.row.id)]
  };
  const changed = await postCommand(db, owner.token, edit);
  assert.deepEqual(await postCommand(db, owner.token, edit), changed);
  const widen = {
    operation: "edit",
    mutationId: randomUUID(),
    postId: p.id,
    expectedVersion: 2,
    audience: "PUBLIC"
  };
  await denied(postCommand(db, owner.token, widen), 400);
  await postCommand(db, owner.token, { ...widen, confirmAudienceChange: true });
  const removed = await postCommand(db, owner.token, {
    operation: "edit",
    mutationId: randomUUID(),
    postId: p.id,
    expectedVersion: 3,
    resourceReferences: []
  });
  assert.equal(removed.version, 4);
  assert.deepEqual(await cards(p.id), []);
  assert.ok(
    (await db.platformPost.findUniqueOrThrow({ where: { id: p.id } })).editedAt
  );
});
test("draft resume and exact publication retries revalidate current media rights", async () => {
  const m = await media(),
    id = randomUUID();
  await postWorkspaceCommand(db, owner.token, {
    operation: "save-draft",
    mutationId: randomUUID(),
    id,
    expectedVersion: 0,
    payload: {
      content: "Media draft",
      replyAudience: "VIEWERS",
      resourceReferences: [reference(m.row.id)]
    }
  });
  const resumed = await readPostWorkspace(db, owner.token, {
    view: "draft",
    id
  });
  assert.ok("draft" in resumed);
  assert.deepEqual(resumed.draft?.payload.resourceReferences, [
    reference(m.row.id)
  ]);
  const publish = {
    operation: "publish-draft",
    mutationId: randomUUID(),
    id,
    expectedVersion: 1
  };
  const first = await postWorkspaceCommand(db, owner.token, publish);
  assert.deepEqual(await postWorkspaceCommand(db, owner.token, publish), first);
  await db.mediaCatalogRights.update({
    where: { itemId: m.row.id },
    data: { revokedAt: new Date() }
  });
  await denied(postWorkspaceCommand(db, owner.token, publish), 409);
});
test("scheduled publication rechecks revoked media and leaves a correctable private draft", async () => {
  const m = await media(),
    p = await postCommand(
      db,
      owner.token,
      postBody(m.row.id, {
        authorChurchId: churchId,
        scheduleLocal: new Date(Date.now() + 3600000)
          .toISOString()
          .slice(0, 16),
        scheduleZone: "UTC"
      })
    );
  const row = await db.platformPost.findUniqueOrThrow({ where: { id: p.id } });
  assert.equal(row.status, "SCHEDULED");
  await db.mediaCatalogRights.update({
    where: { itemId: m.row.id },
    data: { revokedAt: new Date() }
  });
  const result = await publishScheduledPost(
    db,
    p.id,
    p.version,
    new Date(row.scheduleAt!.getTime() + 1000)
  );
  assert.equal(result.published, false);
  assert.equal(
    (await db.platformPost.findUniqueOrThrow({ where: { id: p.id } })).status,
    "DRAFT"
  );
});
test("media resolution batches repeated IDs into one bounded SQL query", async () => {
  const m = await media(),
    c = await postContext(db, other.id);
  queries.length = 0;
  assert.equal(
    (await resolvePostResourcesIn(db, c, [reference(m.row.id)])).size,
    1
  );
  const count = queries.length;
  queries.length = 0;
  assert.equal(
    (
      await resolvePostResourcesIn(
        db,
        c,
        Array.from({ length: 180 }, () => reference(m.row.id))
      )
    ).size,
    1
  );
  assert.equal(queries.length, count);
  assert.equal(count, 1);
  await denied(
    resolvePostResourcesIn(
      db,
      c,
      Array.from({ length: 181 }, () => reference(m.row.id))
    ),
    400
  );
});
