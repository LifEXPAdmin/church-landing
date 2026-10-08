import test, { before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { assertPortalTestDatabase, createPortalActor, type PortalActor } from "./seed-portal";
import { mediaCatalogCommand as command } from "../lib/platform/media-catalog-commands";
import { mediaCatalogRead as read } from "../lib/platform/media-catalog-reads";
import { mediaFields } from "../lib/platform/media-catalog-input";
import { MEDIA_POLICY } from "../lib/platform/media-catalog-options";
import { mediaPlaylistCommand } from "../lib/platform/media-playlist-commands";
import { mediaPlaylistRead } from "../lib/platform/media-playlist-reads";
import { PortalError } from "../lib/platform/portal-policy";
import { mediaEmpty } from "../lib/platform/media-catalog-retention";

const db = new PrismaClient();
let owner: PortalActor, other: PortalActor;
before(async () => {
  await assertPortalTestDatabase(db);
  owner = await createPortalActor(db, "transcriptowner");
  other = await createPortalActor(db, "transcriptreader");
});
// These runs are restricted to the parent's dedicated, fictional clone.
beforeEach(() => db.platformAuthLimit.deleteMany());
after(() => db.$disconnect());
const action = (operation: string, more: Record<string, unknown> = {}) => ({ operation, mutationId: randomUUID(), ...more });
const fields = (patch: Record<string, unknown> = {}) => mediaFields({
  title: "Fictional transcript " + randomUUID(), description: "Supplied text acceptance",
  format: "SERMON", presentation: "VIDEO", audience: "PUBLIC", details: { preachedOn: null },
  sourceUrl: "https://youtu.be/abcdefghijk", durationSeconds: 120,
  transcriptText: "A fictional speaker describes patient kindness.",
  chapters: [{ startSeconds: 0, title: "Opening" }, { startSeconds: 60, title: "Kindness" }], ...patch
});
const reviewed = (f: ReturnType<typeof fields>) => ({ fields: f,
  acknowledgment: { policy: MEDIA_POLICY, sourceUrl: f.sourceUrl, audience: f.audience, accepted: true },
  rights: { basis: "OWN", reviewed: true, publicRecording: true, textRights: true }
});
async function published(f = fields(), actor = owner) {
  const draft = await command(db, actor.token, action("create", { ownerChurchId: null, ...reviewed(f) }));
  const body = action("publish", { itemId: draft.id, expectedVersion: draft.version, ...reviewed(f) });
  return { receipt: await command(db, actor.token, body), body, fields: f };
}
const detail = (id: string, actor?: PortalActor) => read(db, actor?.token, new URLSearchParams({ view: "detail", id }));
const denied = (promise: Promise<unknown>, status: number) => assert.rejects(promise, (error: unknown) => error instanceof PortalError && error.status === status);
const assertSlim = (value: unknown) => {
  const visit = (node: unknown) => {
    if (!node || typeof node !== "object") return;
    assert.equal(Object.hasOwn(node, "transcriptText"), false);
    assert.equal(Object.hasOwn(node, "chapters"), false);
    for (const child of Object.values(node)) visit(child);
  };
  visit(value);
};

test("authorized detail and editor retain normalized long text; library and playlist cards remain slim", async () => {
  const text = "界".repeat(59990) + "\r\n ending ", f = fields({ transcriptText: text }), { receipt: r } = await published(f);
  const current = await detail(r.id);
  assert.equal(current.item?.transcriptText, text.replace(/\r\n?/g, "\n").trim());
  assert.deepEqual(current.item?.chapters, f.chapters);
  const editor = await read(db, owner.token, new URLSearchParams({ view: "editor", id: r.id }), owner.id);
  assert.equal(editor.item?.transcriptText, f.transcriptText);
  const library = await read(db, null, new URLSearchParams({ q: f.title }));
  assert.equal(library.total, 1);
  assertSlim(library);
  const pf = { title: "Fictional transcript collection " + randomUUID(), description: "Slim card check", audience: "PUBLIC" };
  const list = await mediaPlaylistCommand(db, owner.token, action("create", { ownerChurchId: null, fields: pf }));
  const added = await mediaPlaylistCommand(db, owner.token, action("add", { playlistId: list.id, expectedVersion: list.version, mediaId: r.id }));
  await mediaPlaylistCommand(db, owner.token, action("publish", { playlistId: list.id, expectedVersion: added.version, fields: pf }));
  const projected = await mediaPlaylistRead(db, null, new URLSearchParams({ view: "detail", id: list.id }));
  assert.ok(JSON.stringify(projected).includes(r.id));
  assertSlim(projected);
});

test("transcript-only search uses the same authorized set for exact counts and bounded pages", async () => {
  const term = "transcriptneedle" + randomUUID().replaceAll("-", "");
  const publicIds = [];
  for (let i = 0; i < 21; i++) publicIds.push((await published(fields({ transcriptText: `${term} public ${i}` }))).receipt.id);
  const privateItem = await published(fields({ transcriptText: term + " restricted", audience: "MEMBERS" }));
  await command(db, owner.token, action("create", { ownerChurchId: null, ...reviewed(fields({ transcriptText: term + " draft" })) }));
  const q = new URLSearchParams({ q: term });
  const first = await read(db, null, q);
  assert.equal(first.total, 21); assert.equal(first.items?.length, 20); assertSlim(first);
  q.set("page", "1");
  const second = await read(db, null, q);
  assert.equal(second.total, 21); assert.equal(second.items?.length, 1);
  assert.deepEqual(new Set([...(first.items ?? []), ...(second.items ?? [])].map(x => x.id)), new Set(publicIds));
  assert.ok(!JSON.stringify([first, second]).includes(privateItem.receipt.id));
  q.delete("page"); assert.equal((await read(db, other.token, q)).total, 22);
  await denied(detail(privateItem.receipt.id), 404);
  assert.equal((await detail(privateItem.receipt.id, other)).item?.transcriptText, term + " restricted");
});

test("blocked readers and withdrawn or expired rights cannot read or search transcript text", async () => {
  const term = "privateword" + randomUUID(), { receipt: r } = await published(fields({ transcriptText: term }));
  const block = await db.socialRelationship.create({ data: { ownerId: other.id, targetUserId: owner.id, blocked: true } });
  await denied(detail(r.id, other), 404);
  assert.equal((await read(db, other.token, new URLSearchParams({ q: term }))).total, 0);
  await db.socialRelationship.delete({ where: { id: block.id } });
  await db.mediaCatalogRights.update({ where: { itemId: r.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
  await denied(detail(r.id), 404);
  assert.equal((await read(db, null, new URLSearchParams({ q: term }))).total, 0);
  await denied(command(db, other.token, action("save", { itemId: r.id, expectedVersion: r.version, ...reviewed(fields()) })), 404);
});

test("published transcript replacement requires current rights and exact retries do not renew them", async () => {
  const { receipt: r, fields: original } = await published();
  const changed = fields({ ...original, transcriptText: "The newly reviewed fictional words." });
  const v = action("save", { itemId: r.id, expectedVersion: r.version, ...reviewed(changed) });
  await denied(command(db, owner.token, { ...v, rights: undefined }), 400);
  assert.equal((await detail(r.id)).item?.transcriptText, original.transcriptText);
  const result = await command(db, owner.token, v);
  const rights = await db.mediaCatalogRights.findUniqueOrThrow({ where: { itemId: r.id } });
  assert.deepEqual(await command(db, owner.token, v), result);
  assert.deepEqual(await db.mediaCatalogRights.findUniqueOrThrow({ where: { itemId: r.id } }), rights);
  await denied(command(db, owner.token, { ...v, fields: { ...changed, transcriptText: "Changed retry" } }), 409);
  assert.equal(await db.mediaCatalogEvent.count({ where: { itemId: r.id, version: result.version } }), 1);
});

test("stale clients cannot omit existing transcript or chapter fields; explicit clearing is reviewed", async () => {
  const { receipt: r, fields: f } = await published();
  for (const key of ["transcriptText", "chapters"]) {
    const omitted: Record<string, unknown> = { ...f }; delete omitted[key];
    await denied(command(db, owner.token, action("save", { itemId: r.id, expectedVersion: r.version, ...reviewed(f), fields: omitted })), 409);
  }
  assert.equal((await detail(r.id)).item?.version, r.version);
  const cleared = fields({ ...f, transcriptText: "", chapters: [] });
  await command(db, owner.token, action("save", { itemId: r.id, expectedVersion: r.version, ...reviewed(cleared) }));
  assert.equal((await detail(r.id)).item?.transcriptText, "");
  assert.deepEqual((await detail(r.id)).item?.chapters, []);
});

test("duration edits reject equal or out-of-range chapter starts without changing the prior publication", async () => {
  const { receipt: r, fields: f } = await published();
  for (const durationSeconds of [60, 59]) {
    await denied(command(db, owner.token, action("save", { itemId: r.id, expectedVersion: r.version, ...reviewed(f), fields: { ...f, durationSeconds } })), 400);
  }
  assert.equal((await detail(r.id)).item?.durationSeconds, 120);
  assert.equal((await detail(r.id)).item?.version, r.version);
  const unknown = fields({ ...f, durationSeconds: null, chapters: [{ startSeconds: 604800, title: "Supplied marker, duration unknown" }] });
  await command(db, owner.token, action("save", { itemId: r.id, expectedVersion: r.version, ...reviewed(unknown) }));
  const saved = (await detail(r.id)).item;
  assert.equal(saved?.durationSeconds, null);
  assert.deepEqual(saved?.chapters, unknown.chapters);
});

test("legacy writers cannot change content or replace its rights without the transaction writer marker", async () => {
  const { receipt: r, fields: f } = await published();
  const before = await db.mediaCatalogItem.findUniqueOrThrow({ where: { id: r.id } });
  await assert.rejects(db.$executeRaw`UPDATE "MediaCatalogItem" SET "transcriptText"='unreviewed old writer' WHERE id=${r.id}`, /Current media transcript writer required/);
  const rightsBefore = await db.mediaCatalogRights.findUniqueOrThrow({ where: { itemId: r.id } });
  await assert.rejects(db.$transaction(async tx => {
    // Exact legacy save order: item/acknowledgment first, rights upsert second.
    await tx.$executeRaw`UPDATE "MediaCatalogItem" SET title='legacy content edit', acknowledgment='legacy-fingerprint' WHERE id=${r.id}`;
    await tx.mediaCatalogRights.update({ where: { itemId: r.id }, data: { fingerprint: "legacy-fingerprint", assertedAt: new Date() } });
  }), /Current media transcript writer required/);
  assert.deepEqual(await db.mediaCatalogRights.findUniqueOrThrow({ where: { itemId: r.id } }), rightsBefore);
  const after = await db.mediaCatalogItem.findUniqueOrThrow({ where: { id: r.id } });
  assert.equal(after.transcriptText, f.transcriptText); assert.equal(after.title, before.title); assert.equal(after.acknowledgment, before.acknowledgment);
  // A compatible safety restriction remains possible without refreshing permission.
  await db.mediaCatalogItem.update({ where: { id: r.id }, data: { moderationState: "HIDDEN" } });
  await denied(detail(r.id), 404);
});


test("actual legacy cleanup shapes scrub unknown transcript fields during remove and protected recovery", async () => {
  const { transcriptText: _text, chapters: _chapters, ...legacyEmpty } = mediaEmpty;
  assert.equal(_text, "");
  assert.deepEqual(_chapters, []);
  for (const operation of ["remove", "recovery"] as const) {
    const { receipt: r } = await published();
    await db.$transaction(async tx => {
      await tx.mediaCatalogRights.deleteMany({ where: { itemId: r.id } });
      await tx.mediaCatalogItem.update({ where: { id: r.id }, data: { ...legacyEmpty,
        ...(operation === "remove" ? { state: "REMOVED", removedAt: new Date(), version: { increment: 1 }, controlVersion: { increment: 1 } } : { state: "UNPUBLISHED", recoveryRequired: true, version: 20, controlVersion: 20 })
      } });
    });
    const row = await db.mediaCatalogItem.findUniqueOrThrow({ where: { id: r.id } });
    assert.equal(row.transcriptText, ""); assert.deepEqual(row.chapters, []);
    assert.equal(await db.mediaCatalogRights.count({ where: { itemId: r.id } }), 0);
    await denied(detail(r.id), 404);
  }
});
