import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { PrismaClient, type ChurchCapability } from "@prisma/client";
import { assertPortalTestDatabase, createPortalActor, seedOperatorGrants, type PortalActor } from "./seed-portal";
import { exchangeListingCommand as command, readExchangeListing as read, listExchangeListings as list, readExchangeGallery } from "../lib/platform/exchange-listings";
import { handleExchangeRequest } from "../lib/platform/exchange-boundary";
import { handleImageRequest } from "../lib/platform/media-boundary";
import { SESSION_COOKIE } from "../lib/platform/account-boundary";
import { emptyExchangeFields, EXCHANGE_ITEM_POLICY, type ExchangeEditorFields } from "../lib/platform/exchange-options";
import { searchDiscoveryPlaces } from "../lib/platform/discovery-places";
import { PortalError } from "../lib/platform/portal-policy";
import { relationshipCommand } from "../lib/platform/relationships";
import { communityReportCommand, readCommunityReports } from "../lib/platform/community-reports";
import { uploadImage, readImage, listImages, removeImage, collectImageGarbage } from "../lib/platform/media";
import type { ImageStorage } from "../lib/platform/media-storage";
import { replayRetentionControls, type RetentionControlEntry } from "../lib/platform/retention-controls";
import { prepareAccountExport, downloadAccountExport } from "../lib/platform/account-export";
import { requestPermanentAccountDeletion, type AccountDeletionRecord } from "../lib/platform/account-deletion";
import { eraseRequestedAccountData } from "../lib/platform/account-erasure";
import { createSessionToken } from "../lib/platform/auth";

const db = new PrismaClient();
let reviewer: PortalActor, placeId: number;
const prior = process.env.COMMUNITY_REPORTS_ENABLED;
before(async () => {
  await assertPortalTestDatabase(db);
  process.env.COMMUNITY_REPORTS_ENABLED = "true";
  reviewer = await createPortalActor(db, "exreview");
  await seedOperatorGrants(db, reviewer, ["REVIEW_COMMUNITY_REPORTS"]);
  placeId = (await searchDiscoveryPlaces("US", "Chicago")).places[0].id;
});
after(async () => { await db.$disconnect(); if (prior === undefined) delete process.env.COMMUNITY_REPORTS_ENABLED; else process.env.COMMUNITY_REPORTS_ENABLED = prior; });
const input = (operation: string, fields: Record<string, unknown> = {}) => ({ operation, mutationId: randomUUID(), ...fields });
const denied = (promise: Promise<unknown>, status: number) => assert.rejects(promise, (e: unknown) => e instanceof PortalError && e.status === status);
const ready = (fields: Partial<ExchangeEditorFields> = {}): ExchangeEditorFields => ({ ...emptyExchangeFields(),
  title: "Fictional spare table", description: "Fictional test item. Light scratches.", category: "FURNITURE", condition: "GOOD", country: "US", placeId, ...fields });
async function draft(actor: PortalActor, fields = ready(), ownerChurchId: string | null = null) {
  const body = input("create", { expectedVersion: 0, ownerChurchId, schema: 1, fields });
  return { ...await command(db, actor.token, body), body };
}
const publish = (actor: PortalActor, row: { id: string; version: number }) => command(db, actor.token,
  input("status", { listingId: row.id, expectedVersion: row.version, state: "ACTIVE", itemPolicy: EXCHANGE_ITEM_POLICY, itemConfirmed: true }));
const save = (actor: PortalActor, row: { id: string; version: number }, fields: ExchangeEditorFields) => command(db, actor.token,
  input("save", { listingId: row.id, expectedVersion: row.version, schema: 1, fields, itemPolicy: EXCHANGE_ITEM_POLICY, itemConfirmed: true }));
const status = (actor: PortalActor, row: { id: string; version: number }, state: string) => command(db, actor.token,
  input("status", { listingId: row.id, expectedVersion: row.version, state }));
async function church(actors: PortalActor[], duties: Array<[PortalActor, ChurchCapability]> = []) {
  const row = await db.church.create({ data: { slug: "fixture-ex-" + randomUUID(), name: "Fictional Exchange church", summary: "Isolated fixture", communityListed: true } });
  await db.churchConnection.createMany({ data: actors.map(a => ({ userId: a.id, churchId: row.id, state: "APPROVED" })) });
  for (const [actor, capability] of duties) await db.churchCapabilityGrant.create({ data: { userId: actor.id, churchId: row.id, capability } });
  return row;
}
function memoryStore() {
  const files = new Map<string, Buffer>();
  return { files, async put(path: string, value: Buffer) { assert.ok(!files.has(path)); files.set(path, value); },
    async get(path: string) { return files.get(path) ?? null; }, async delete(paths: string[]) { paths.forEach(p => files.delete(p)); }
  } satisfies ImageStorage & { files: Map<string, Buffer> };
}
const bytes = () => sharp({ create: { width: 90, height: 60, channels: 3, background: "blue" } }).png().toBuffer();
const photo = (id: string) => ({ purpose: "EXCHANGE_PHOTO", targetId: id, requestKey: randomUUID(), caption: "Fictional item photo", alt: "Blue test rectangle" });
async function report(actor: PortalActor, row: { id: string; version: number }) {
  return communityReportCommand(db, actor.token, input("create", { targetType: "EXCHANGE_LISTING", targetId: row.id,
    expectedTargetVersion: row.version, expectedContextVersion: 0, reason: "PRIVACY", details: "Fictional privacy concern" }));
}

test("incomplete private drafts are owned, survive reload and exact concurrent retries, and reject forged or stale work", async () => {
  const owner = await createPortalActor(db, "exdraft"), stranger = await createPortalActor(db, "exother");
  const row = await draft(owner, emptyExchangeFields());
  const replays = await Promise.all([command(db, owner.token, row.body), command(db, owner.token, row.body)]);
  assert.equal(replays[0].id, row.id); assert.equal(replays[1].id, row.id);
  assert.equal(await db.exchangeListing.count({ where: { ownerId: owner.id } }), 1);
  assert.deepEqual((await read(db, owner.token, row.id, true)).fields, emptyExchangeFields());
  await denied(read(db, undefined, row.id), 404); await denied(read(db, stranger.token, row.id, true), 404);
  await denied(command(db, owner.token, { ...row.body, fields: ready() }), 409);
  assert.throws(() => command(db, owner.token, { ...row.body, authorId: stranger.id }));
  await denied(publish(owner, row), 400);
  const saved = await save(owner, row, ready());
  await denied(save(owner, row, ready({ title: "Stale replacement" })), 409);
  assert.equal((await read(db, owner.token, saved.id, true)).listing.title, ready().title);
  for (const options of [{ verified: false }, { adult: false }]) {
    const ineligible = await createPortalActor(db, "exno", options);
    await denied(draft(ineligible), 403);
  }
});

test("publication requires real catalog locality, explicit item confirmation and actual reporting coverage", async () => {
  const owner = await createPortalActor(db, "exprice");
  await denied(draft(owner, ready({ country: "CA" })), 400);
  const row = await draft(owner, ready({ intent: "SALE", currency: "KWD", price: "1.001" }));
  await denied(status(owner, row, "ACTIVE"), 400);
  process.env.COMMUNITY_REPORTS_ENABLED = "false";
  try { await denied(publish(owner, row), 503); } finally { process.env.COMMUNITY_REPORTS_ENABLED = "true"; }
  assert.equal((await read(db, owner.token, row.id, true)).listing.state, "DRAFT");
  const active = await publish(owner, row), publicRow = (await read(db, undefined, active.id)).listing;
  assert.equal(publicRow.priceMinor, 1001); assert.equal(publicRow.currency, "KWD");
  assert.equal(publicRow.owner?.id, owner.id);
  const encoded = JSON.stringify(publicRow);
  for (const privateValue of [owner.email, owner.password, owner.token, "creatorId", "storagePrefix", "latitude", "longitude"])
    assert.ok(!encoded.includes(privateValue));
  assert.ok((await list(db, undefined)).listings.some(r => r.id === row.id));
});

test("personal church audiences require membership and their own reviewer; narrowing immediately removes guest and stranger access", async () => {
  const owner = await createPortalActor(db, "exscope"), member = await createPortalActor(db, "exmember"), moderator = await createPortalActor(db, "exmod"), postModerator = await createPortalActor(db, "expostmod");
  const c = await church([owner, member, moderator, postModerator], [[postModerator, "MODERATE_CHURCH_POSTS"]]);
  const row = await publish(owner, await draft(owner));
  const restricted = ready({ audience: "CHURCH", audienceChurchId: c.id });
  await denied(save(owner, row, restricted), 503);
  await db.churchCapabilityGrant.create({ data: { userId: moderator.id, churchId: c.id, capability: "MODERATE_EXCHANGE_LISTINGS" } });
  const narrowed = await save(owner, row, restricted);
  await denied(read(db, undefined, row.id), 404); await denied(read(db, reviewer.token, row.id), 404);
  assert.equal((await read(db, member.token, row.id)).listing.audience, "CHURCH");
  const selected = await report(member, narrowed);
  await denied(readCommunityReports(db, reviewer.token, { view: "review", id: selected.id }), 404);
  await denied(readCommunityReports(db, postModerator.token, { view: "review", id: selected.id }), 404);
  const review = await readCommunityReports(db, moderator.token, { view: "review", id: selected.id });
  assert.ok("evidence" in review && review.evidence?.type === "EXCHANGE_LISTING");
  const queue = await readCommunityReports(db, moderator.token, { view: "queue" });
  assert.ok("reviews" in queue && queue.reviews?.some(r => r.id === selected.id));
  await db.churchConnection.update({ where: { userId_churchId: { userId: owner.id, churchId: c.id } }, data: { state: "LEFT" } });
  await denied(read(db, member.token, row.id), 404);
  assert.equal((await read(db, owner.token, row.id, true)).listing.audience, "CHURCH");
  await denied(save(owner, narrowed, restricted), 403);
});

test("church ownership is independent of the creating delegate and old post duties never grant listing management", async () => {
  const author = await createPortalActor(db, "exchurch"), manager = await createPortalActor(db, "exmanager"), moderator = await createPortalActor(db, "exreviewer");
  const c = await church([author, manager, moderator], [[author, "PUBLISH_CHURCH_POSTS"], [manager, "MANAGE_EXCHANGE_LISTINGS"], [moderator, "MODERATE_EXCHANGE_LISTINGS"]]);
  await denied(draft(author, ready(), c.id), 403);
  const grant = await db.churchCapabilityGrant.create({ data: { userId: author.id, churchId: c.id, capability: "PUBLISH_EXCHANGE_LISTINGS" } });
  const row = await draft(author, ready(), c.id);
  await denied(publish(author, row), 403);
  const live = await publish(manager, row);
  const projection = (await read(db, undefined, live.id)).listing;
  assert.equal(projection.owner, null); assert.equal(projection.ownerChurch?.id, c.id);
  await db.churchCapabilityGrant.update({ where: { id: grant.id }, data: { revokedAt: new Date(), version: { increment: 1 } } });
  await denied(command(db, author.token, row.body), 403);
  await denied(read(db, author.token, row.id, true), 404);
  assert.ok((await read(db, manager.token, row.id, true)).canManage);
  await assert.rejects(db.exchangeListing.update({ where: { id: row.id }, data: { ownerChurchId: null, ownerId: author.id } }));
});

test("listing photos inherit draft, public, blocked and archived boundaries across every derivative and exact upload retry", async () => {
  const owner = await createPortalActor(db, "exphoto"), viewer = await createPortalActor(db, "exviewer");
  const row = await draft(owner), store = memoryStore(), file = await bytes(), request = photo(row.id);
  const image = await uploadImage(db, owner.token, request, file, store);
  assert.equal((await uploadImage(db, owner.token, request, file, store)).id, image.id); assert.equal(store.files.size, 4);
  for (const variant of ["original", "large", "medium", "thumb"]) {
    await denied(readImage(db, undefined, image.id, variant, store), 404);
    assert.ok((await readImage(db, owner.token, image.id, variant, store)).length);
  }
  const current = (await read(db, owner.token, row.id, true)).listing;
  const active = await publish(owner, current);
  assert.equal((await listImages(db, undefined, "EXCHANGE_PHOTO", row.id)).length, 1);
  await relationshipCommand(db, viewer.token, input("mute", { kind: "person", targetId: owner.id, desired: true, expectedVersion: 0 }));
  assert.ok(!(await list(db, viewer.token)).listings.some(r => r.id === row.id));
  assert.equal((await read(db, viewer.token, row.id)).listing.id, row.id);
  await relationshipCommand(db, owner.token, input("block", { kind: "person", targetId: viewer.id, desired: true, expectedVersion: 0 }));
  await denied(read(db, viewer.token, row.id), 404);
  for (const variant of ["original", "large", "medium", "thumb"]) await denied(readImage(db, viewer.token, image.id, variant, store), 404);
  assert.ok((await readImage(db, undefined, image.id, "thumb", store)).length);
  await status(owner, active, "ARCHIVED");
  await denied(read(db, undefined, row.id), 404); await denied(readImage(db, undefined, image.id, "thumb", store), 404);
  assert.ok((await readImage(db, owner.token, image.id, "thumb", store)).length);
  await denied(uploadImage(db, owner.token, photo(row.id), file, store), 404);
});

test("eight-photo capacity, removal and interrupted processing reuse bounded provider cleanup without cross-listing attachment", async () => {
  const owner = await createPortalActor(db, "exlimit"), row = await draft(owner), store = memoryStore(), file = await bytes();
  const images = [];
  for (let i = 0; i < 8; i++) images.push(await uploadImage(db, owner.token, photo(row.id), file, store));
  await denied(uploadImage(db, owner.token, photo(row.id), file, store), 409);
  assert.equal(store.files.size, 32);
  const other = await draft(owner);
  await assert.rejects(db.mediaAsset.update({ where: { id: images[0].id }, data: { exchangeListingId: other.id } }));
  await removeImage(db, owner.token, images[0].id, images[0].version);
  await removeImage(db, owner.token, images[0].id, images[0].version);
  await denied(readImage(db, owner.token, images[0].id, "thumb", store), 404);
  await collectImageGarbage(db, store, new Date(Date.now() + 25 * 3600000));
  assert.equal(store.files.size, 28);
  let writes = 0;
  const broken: ImageStorage = { ...store, async put(path, data) { await store.put(path, data); if (++writes === 2) throw new Error("Interrupted local provider"); } };
  await assert.rejects(uploadImage(db, owner.token, photo(other.id), file, broken), /Interrupted/);
  await collectImageGarbage(db, store, new Date(Date.now() + 25 * 3600000));
  assert.equal(store.files.size, 28);
});

test("selected listing reports yield scoped evidence, author notice and independent moderation without restoring archived content", async () => {
  const owner = await createPortalActor(db, "exnotice"), reporter = await createPortalActor(db, "exreport");
  const row = await publish(owner, await draft(owner)), selected = await report(reporter, row);
  const reviewed = await communityReportCommand(db, reviewer.token, input("moderate", { id: selected.id, expectedVersion: selected.version,
    expectedSourceVersion: row.version, expectedContextVersion: 0, action: "HIDE", authorReason: "PRIVATE_INFORMATION", decisionReason: "Fictional review found private text." }));
  await denied(read(db, undefined, row.id), 404);
  const notices = await readCommunityReports(db, owner.token, { view: "decisions" });
  assert.ok("notices" in notices && notices.notices?.some(n => n.type === "EXCHANGE_LISTING"));
  const current = (await read(db, owner.token, row.id, true)).listing;
  await denied(command(db, owner.token, input("duplicate", { listingId: row.id, expectedVersion: current.version })), 409);
  const corrected = await save(owner, current, ready({ description: "Fictional corrected item description." }));
  assert.equal((await read(db, owner.token, row.id, true)).moderationState, "HIDDEN");
  const archived = await status(owner, corrected, "ARCHIVED");
  await communityReportCommand(db, reviewer.token, input("moderate", { id: selected.id, expectedVersion: reviewed.version,
    expectedSourceVersion: archived.version, expectedContextVersion: 0, action: "RESTORE", authorReason: "CORRECTION_COMPLETE", decisionReason: "Fictional correction reviewed." }));
  await denied(read(db, undefined, row.id), 404);
  assert.equal((await read(db, owner.token, row.id, true)).listing.state, "ARCHIVED");
});

test("protected restore quarantines older listing visibility independently of newer moderation replay order", async () => {
  const owner = await createPortalActor(db, "exrestore"), reporter = await createPortalActor(db, "exrestore2");
  const row = await publish(owner, await draft(owner));
  const selected = await report(reporter, row);
  await communityReportCommand(db, reviewer.token, input("moderate", { id: selected.id, expectedVersion: selected.version,
    expectedSourceVersion: row.version, expectedContextVersion: 0, action: "HIDE", authorReason: "PRIVATE_INFORMATION", decisionReason: "Fictional protection needs review." }));
  const controls = (await db.retentionControl.findMany({ where: { sourceId: row.id }, orderBy: { version: "desc" } })).map(r => r.payload as RetentionControlEntry);
  const privacy = controls.find(c => c.kind === "EXCHANGE_VISIBILITY")!, moderation = controls.find(c => c.kind === "MODERATION_EXCHANGE")!;
  assert.ok(privacy && moderation);
  for (const entries of [[privacy, moderation], [moderation, privacy]]) {
    await db.exchangeListing.update({ where: { id: row.id }, data: { state: "ACTIVE", version: 1, visibilityVersion: 1,
      moderationState: "VISIBLE", moderationVersion: 0, recoveryRequired: false } });
    await replayRetentionControls(db, entries);
    const restored = await db.exchangeListing.findUniqueOrThrow({ where: { id: row.id } });
    assert.equal(restored.state, "DRAFT"); assert.equal(restored.recoveryRequired, true); assert.equal(restored.moderationState, "HIDDEN");
    await denied(read(db, undefined, row.id), 404);
    await denied(publish(owner, restored), 409);
  }
});

test("closed, reopened and duplicate drafts preserve price and audience without copied media or history", async () => {
  const owner = await createPortalActor(db, "exstatus");
  const row = await publish(owner, await draft(owner));
  const reserved = await status(owner, row, "RESERVED"), closed = await status(owner, reserved, "CLOSED");
  assert.ok(!(await list(db, undefined)).listings.some(r => r.id === row.id));
  assert.equal((await read(db, undefined, row.id)).listing.state, "CLOSED");
  const reopened = await publish(owner, closed);
  const duplicate = await command(db, owner.token, input("duplicate", { listingId: row.id, expectedVersion: reopened.version }));
  const draftCopy = await read(db, owner.token, duplicate.id, true);
  assert.equal(draftCopy.listing.state, "DRAFT"); assert.equal(draftCopy.listing.title, ready().title);
  assert.equal(await db.mediaAsset.count({ where: { exchangeListingId: duplicate.id } }), 0);
  assert.equal(await db.exchangeListingAudit.count({ where: { listingId: duplicate.id } }), 1);
  const races = await Promise.allSettled([save(owner, reopened, ready({ title: "First concurrent version" })), save(owner, reopened, ready({ title: "Second concurrent version" }))]);
  assert.equal(races.filter(r => r.status === "fulfilled").length, 1);
});

test("personal export includes only owned listings and permanent erasure clears their unreported text and retires images", async () => {
  const owner = await createPortalActor(db, "exerase"), other = await createPortalActor(db, "exexport2");
  const row = await draft(owner), unrelated = await draft(other, ready({ title: "Other private listing marker" }));
  const store = memoryStore(), image = await uploadImage(db, owner.token, photo(row.id), await bytes(), store);
  const secret = process.env.AUTH_RATE_LIMIT_SECRET!;
  const authorization = await prepareAccountExport(db, owner.token, owner.password, secret);
  const result = await downloadAccountExport(db, owner.token, authorization.authorization, secret);
  const encoded = typeof result === "string" ? result : JSON.stringify(result);
  assert.ok(encoded.includes(row.id)); assert.ok(!encoded.includes(unrelated.id)); assert.ok(!encoded.includes("Other private listing marker"));
  const records: AccountDeletionRecord[] = [], journal = { async completeAccount() {}, async recordAccount(record: AccountDeletionRecord) { records.push(record); } };
  await requestPermanentAccountDeletion(db, owner.token, owner.password, true, createSessionToken(), journal);
  const request = await db.accountDeletion.findUniqueOrThrow({ where: { userId: owner.id } });
  await eraseRequestedAccountData(db, request.id, journal);
  const erased = await db.exchangeListing.findUniqueOrThrow({ where: { id: row.id } });
  assert.equal(erased.title, ""); assert.equal(erased.description, ""); assert.ok(erased.erasedAt); assert.equal(erased.creatorId, null);
  assert.equal((await db.mediaAsset.findUniqueOrThrow({ where: { id: image.id } })).status, "RETIRED");
  await denied(readImage(db, undefined, image.id, "thumb", store), 404);
  assert.equal((await read(db, other.token, unrelated.id, true)).listing.title, "Other private listing marker");
});

test("the listing transport rejects changed accounts, cross-origin writes, duplicate filters and oversized payloads with private no-store responses", async () => {
  const owner = await createPortalActor(db, "exhttp"), other = await createPortalActor(db, "exhttp2");
  const origin = process.env.ACCOUNT_ORIGIN!, body = input("create", { expectedVersion: 0, ownerChurchId: null, schema: 1, fields: ready() });
  const request = (account: string | null, from = origin, raw = JSON.stringify(body)) => new Request(origin + "/api/platform/exchange", {
    method: "POST", headers: { Origin: from, "Content-Type": "application/json", Cookie: `${SESSION_COOKIE}=${owner.token}`,
      ...(account ? { "X-Expected-Account": account } : {}) }, body: raw
  });
  assert.equal((await handleExchangeRequest(db, request(null))).status, 401);
  assert.equal((await handleExchangeRequest(db, request(other.id))).status, 401);
  assert.equal((await handleExchangeRequest(db, request(owner.id, "https://other.example.test"))).status, 403);
  assert.equal((await handleExchangeRequest(db, request(owner.id, origin, "a".repeat(32769)))).status, 400);
  const accepted = await handleExchangeRequest(db, request(owner.id));
  assert.ok([200, 202].includes(accepted.status));
  const saved = await accepted.json();
  const replay = await (await handleExchangeRequest(db, request(owner.id))).json(); assert.equal(replay.id, saved.id);
  for (const response of [accepted, await handleExchangeRequest(db, new Request(origin + `/api/platform/exchange?view=editor&id=${saved.id}`,
    { headers: { Cookie: `${SESSION_COOKIE}=${other.token}` } }))]) {
    assert.match(response.headers.get("cache-control")!, /private.*no-store/);
    assert.equal(response.headers.get("cdn-cache-control"), "no-store");
    assert.match(response.headers.get("vary")!, /Cookie/);
  }
  for (const query of ["view=list&view=mine", "ownerId=forged", "intent=SERVICE", "placeId=1e3&country=US"])
    assert.equal((await handleExchangeRequest(db, new Request(origin + "/api/platform/exchange?" + query))).status, 400);
  const stale = await handleExchangeRequest(db, new Request(origin + `/api/platform/exchange?view=editor&id=${saved.id}`,
    { headers: { Cookie: `${SESSION_COOKIE}=${owner.token}`, "X-Expected-Account": other.id } }));
  assert.equal(stale.status, 401);
});

test("photo metadata and order use complete current listing versions; byte delivery rechecks a source withdrawn during provider I/O", async () => {
  const owner = await createPortalActor(db, "exgallery"), stranger = await createPortalActor(db, "exgother");
  const row = await draft(owner), store = memoryStore(), file = await bytes();
  const a = await uploadImage(db, owner.token, photo(row.id), file, store), b = await uploadImage(db, owner.token, photo(row.id), file, store);
  let gallery = await readExchangeGallery(db, owner.token, row.id);
  const metadata = input("photo-metadata", { listingId: row.id, expectedVersion: gallery.listingVersion, imageId: a.id,
    imageVersion: a.version, caption: "Fictional updated caption", alt: "Updated blue rectangle" });
  await denied(command(db, stranger.token, metadata), 404);
  const saved = await command(db, owner.token, metadata); assert.equal((await command(db, owner.token, metadata)).version, saved.version);
  await denied(command(db, owner.token, { ...metadata, alt: "Changed same-key retry" }), 409);
  gallery = await readExchangeGallery(db, owner.token, row.id);
  assert.equal(gallery.images.find(i => i.id === a.id)?.caption, "Fictional updated caption");
  const order = input("photo-order", { listingId: row.id, expectedVersion: gallery.listingVersion,
    images: [...gallery.images].reverse().map(i => ({ id: i.id, version: i.version })) });
  const ordered = await command(db, owner.token, order);
  assert.equal((await readExchangeGallery(db, owner.token, row.id)).images[0].id, b.id);
  const live = await publish(owner, ordered);
  const origin = process.env.ACCOUNT_ORIGIN!;
  const removal = new Request(origin + "/api/platform/images", { method: "DELETE", headers: {
    Origin: origin, Cookie: `${SESSION_COOKIE}=${owner.token}`, "Content-Type": "application/json"
  }, body: JSON.stringify({ id: a.id, expectedVersion: a.version }) });
  assert.equal((await handleImageRequest(db, removal, store)).status, 400);
  let withdrawn = false;
  const racingStore: ImageStorage = { ...store, async get(path) {
    const value = await store.get(path);
    if (!withdrawn) { withdrawn = true; await status(owner, live, "ARCHIVED"); }
    return value;
  } };
  await denied(readImage(db, stranger.token, b.id, "thumb", racingStore), 404);
  assert.equal((await readExchangeGallery(db, owner.token, row.id)).canManage, false);
});
