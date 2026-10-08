import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { assertPortalTestDatabase, createPortalActor, type PortalActor } from "./seed-portal";
import { mediaCatalogCommand as command } from "../lib/platform/media-catalog-commands";
import { mediaCatalogRead as read } from "../lib/platform/media-catalog-reads";
import { mediaFields } from "../lib/platform/media-catalog-input";
import { MEDIA_POLICY } from "../lib/platform/media-catalog-options";
import { prepareAccountExport, downloadAccountExport } from "../lib/platform/account-export";
import { requestPermanentAccountDeletion, type AccountDeletionRecord } from "../lib/platform/account-deletion";
import { eraseRequestedAccountData } from "../lib/platform/account-erasure";
import { replayRetentionControls, type RetentionControlEntry } from "../lib/platform/retention-controls";
import { createSessionToken } from "../lib/platform/auth";
import { PortalError } from "../lib/platform/portal-policy";
const db = new PrismaClient();
before(() => assertPortalTestDatabase(db));
after(() => db.$disconnect());
async function item(actor: PortalActor) {
  const f = mediaFields({ title: "Fictional retained transcript " + randomUUID(), format: "SERMON", presentation: "VIDEO", audience: "PUBLIC", sourceUrl: "https://youtu.be/abcdefghijk", details: { preachedOn: null }, durationSeconds: 90, transcriptText: "Private retention marker " + randomUUID(), chapters: [{ startSeconds: 0, title: "Private retained heading" }] });
  const reviewed = { fields: f, acknowledgment: { policy: MEDIA_POLICY, sourceUrl: f.sourceUrl, audience: f.audience, accepted: true }, rights: { basis: "OWN", reviewed: true, publicRecording: true, textRights: true } };
  const draft = await command(db, actor.token, { operation: "create", mutationId: randomUUID(), ownerChurchId: null, ...reviewed });
  const r = await command(db, actor.token, { operation: "publish", mutationId: randomUUID(), itemId: draft.id, expectedVersion: draft.version, ...reviewed });
  return { ...r, fields: f };
}
async function exported(actor: PortalActor) {
  const secret = process.env.AUTH_RATE_LIMIT_SECRET!;
  const proof = await prepareAccountExport(db, actor.token, actor.password, secret);
  return JSON.parse(await downloadAccountExport(db, actor.token, proof.authorization, secret));
}
const current = (id: string) => db.mediaCatalogItem.findUniqueOrThrow({ where: { id } });
const assertScrubbed = (r: Awaited<ReturnType<typeof current>>) => { assert.equal(r.transcriptText, ""); assert.deepEqual(r.chapters, []); };

test("actual account export carries only currently authorized personal transcript text and chapter metadata", async () => {
  const actor = await createPortalActor(db, "transcriptexport"), other = await createPortalActor(db, "transcriptforeign");
  const own = await item(actor), foreign = await item(other);
  const result = await exported(actor), found = result.personalMedia.find((r: { id: string }) => r.id === own.id);
  assert.equal(found.transcriptText, own.fields.transcriptText); assert.deepEqual(found.chapters, own.fields.chapters);
  assert.ok(!JSON.stringify(result).includes(foreign.fields.transcriptText));
  await db.mediaCatalogRights.update({ where: { itemId: own.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
  assert.ok(!JSON.stringify(await exported(actor)).includes(own.fields.transcriptText));
});

test("actual permanent account erasure scrubs transcript and chapters and journals no private content", async () => {
  const actor = await createPortalActor(db, "transcripterase"), own = await item(actor);
  const records: AccountDeletionRecord[] = [], journal = { async recordAccount(entry: AccountDeletionRecord) { records.push(structuredClone(entry)); } };
  await requestPermanentAccountDeletion(db, actor.token, actor.password, true, createSessionToken(), journal);
  const deletion = await db.accountDeletion.findUniqueOrThrow({ where: { userId: actor.id } });
  await eraseRequestedAccountData(db, deletion.id, journal);
  const row = await current(own.id); assertScrubbed(row); assert.equal(row.ownerId, null); assert.equal(row.state, "REMOVED");
  assert.equal(await db.mediaCatalogRights.count({ where: { itemId: own.id } }), 0);
  const controls = await db.retentionControl.findMany({ where: { kind: "MEDIA_CATALOG", sourceId: own.id } });
  assert.ok(controls.length > 0); assert.ok(records.length > 0);
  assert.ok(!JSON.stringify([controls, records]).includes(own.fields.transcriptText));
  assert.ok(!JSON.stringify(controls).includes("Private retained heading"));
});

test("protected retention replay and explicit remove clear restored content without permitting later revival", async () => {
  const actor = await createPortalActor(db, "transcriptrestore"), own = await item(actor), removed = await item(actor);
  const control = await db.retentionControl.findFirstOrThrow({ where: { kind: "MEDIA_CATALOG", sourceId: own.id }, orderBy: { version: "desc" } });
  const entry: RetentionControlEntry = { ...(control.payload as unknown as RetentionControlEntry), id: randomUUID(), version: 20, recordedAt: new Date().toISOString() };
  await replayRetentionControls(db, [entry]);
  const first = await current(own.id); assertScrubbed(first); assert.equal(first.recoveryRequired, true); assert.equal(first.controlVersion, 20);
  await replayRetentionControls(db, [entry, { ...entry, id: randomUUID(), version: 19 }]);
  const second = await current(own.id); assertScrubbed(second); assert.equal(second.controlVersion, 20);
  await assert.rejects(read(db, null, new URLSearchParams({ view: "detail", id: own.id })), (e: unknown) => e instanceof PortalError && e.status === 404);
  const body = { operation: "remove", mutationId: randomUUID(), itemId: removed.id, expectedVersion: removed.version };
  const result = await command(db, actor.token, body);
  assert.deepEqual(await command(db, actor.token, body), result);
  assertScrubbed(await current(removed.id));
  assert.equal(await db.mediaCatalogRights.count({ where: { itemId: removed.id } }), 0);
  assert.ok(!JSON.stringify(entry).includes(own.fields.transcriptText));
});
