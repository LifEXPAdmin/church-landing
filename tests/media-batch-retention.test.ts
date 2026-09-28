import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import {
  assertPortalTestDatabase,
  createPortalActor,
  type PortalActor
} from "./seed-portal";
import { mediaCatalogCommand } from "../lib/platform/media-catalog-commands";
import { mediaCatalogRead } from "../lib/platform/media-catalog-reads";
import { mediaFields } from "../lib/platform/media-catalog-input";
import { MEDIA_POLICY } from "../lib/platform/media-catalog-options";
import { SCRIPTURE_REGISTRY_VERSION } from "../lib/platform/scripture-registry";
import { mediaPlaylistCommand } from "../lib/platform/media-playlist-commands";
import { mediaPlaylistRead } from "../lib/platform/media-playlist-reads";
import {
  protectedRetentionControls,
  replayRetentionControls,
  type RetentionControlEntry
} from "../lib/platform/retention-controls";
import {
  prepareAccountExport,
  downloadAccountExport
} from "../lib/platform/account-export";
import {
  requestPermanentAccountDeletion,
  type AccountDeletionRecord
} from "../lib/platform/account-deletion";
import { eraseRequestedAccountData } from "../lib/platform/account-erasure";
import { createSessionToken } from "../lib/platform/auth";
import { PortalError } from "../lib/platform/portal-policy";

const db = new PrismaClient();
before(() => assertPortalTestDatabase(db));
after(() => db.$disconnect());
const input = (operation: string, fields: Record<string, unknown> = {}) => ({
  operation,
  mutationId: randomUUID(),
  ...fields
});
const denied = (operation: Promise<unknown>) =>
  assert.rejects(
    operation,
    (error: unknown) => error instanceof PortalError && error.status === 404
  );

async function media(actor: PortalActor, churchId: string | null = null) {
  const fields = mediaFields({
    title: `Fictional batch passage ${randomUUID()}`,
    description: "Owned Scripture provenance",
    format: "SERMON",
    presentation: "VIDEO",
    audience: "PUBLIC",
    sourceUrl: "https://youtu.be/abcdefghijk",
    details: { preachedOn: null },
    scriptureRanges: [
      {
        referenceSystemId: "sil-eng",
        referenceVersion: SCRIPTURE_REGISTRY_VERSION,
        originals: [" Jn 3:16-18", "John 3:16-18"]
      }
    ]
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
    input("create", { ownerChurchId: churchId, ...reviewed })
  );
  const published = await mediaCatalogCommand(
    db,
    actor.token,
    input("publish", {
      itemId: draft.id,
      expectedVersion: draft.version,
      ...reviewed
    })
  );
  return { ...published, fields };
}
async function playlist(
  actor: PortalActor,
  mediaId: string,
  churchId: string | null = null
) {
  const fields = {
    title: `Fictional batch playlist ${randomUUID()}`,
    description: "Owned finite collection",
    audience: "PUBLIC"
  };
  const draft = await mediaPlaylistCommand(
    db,
    actor.token,
    input("create", { ownerChurchId: churchId, fields })
  );
  const populated = await mediaPlaylistCommand(
    db,
    actor.token,
    input("add", {
      playlistId: draft.id,
      expectedVersion: draft.version,
      mediaId
    })
  );
  return mediaPlaylistCommand(
    db,
    actor.token,
    input("publish", {
      playlistId: draft.id,
      expectedVersion: populated.version,
      fields
    })
  );
}
async function collection(actor: PortalActor) {
  const item = await media(actor),
    list = await playlist(actor, item.id);
  const saved = await mediaPlaylistCommand(
    db,
    actor.token,
    input("save-media", { mediaId: item.id })
  );
  return { item, list, saved };
}
async function control(
  kind: "MEDIA_CATALOG" | "MEDIA_PLAYLIST" | "MEDIA_SAVE",
  sourceId: string,
  version: number
) {
  const prior = await db.retentionControl.findFirstOrThrow({
    where: { kind, sourceId },
    orderBy: { version: "desc" }
  });
  return {
    ...(prior.payload as unknown as RetentionControlEntry),
    id: randomUUID(),
    version,
    recordedAt: new Date().toISOString()
  };
}
function journal() {
  const entries = new Map<string, RetentionControlEntry>();
  return protectedRetentionControls({
    async read(key) {
      return entries.get(key) ?? null;
    },
    async write(key, entry) {
      assert.equal(entries.has(key), false);
      entries.set(key, structuredClone(entry));
    },
    async remove(key) {
      entries.delete(key);
    },
    async page() {
      return { paths: [...entries.keys()] };
    }
  });
}
async function assertQuarantined(
  ids: { item: { id: string }; list: { id: string }; saved: { id: string } },
  expectedVersion: number
) {
  const item = await db.mediaCatalogItem.findUniqueOrThrow({
    where: { id: ids.item.id }
  });
  assert.equal(item.controlVersion, expectedVersion);
  assert.equal(item.recoveryRequired, true);
  assert.equal(item.title, "");
  assert.equal(item.sourceUrl, null);
  assert.deepEqual(item.scriptureRanges, []);
  assert.equal(
    await db.mediaCatalogRights.count({ where: { itemId: item.id } }),
    0
  );
  const list = await db.mediaPlaylist.findUniqueOrThrow({
    where: { id: ids.list.id }
  });
  assert.equal(list.controlVersion, expectedVersion);
  assert.equal(list.recoveryRequired, true);
  assert.equal(list.title, "");
  assert.equal(
    await db.mediaPlaylistEntry.count({ where: { playlistId: list.id } }),
    0
  );
  const saved = await db.mediaSavedItem.findUniqueOrThrow({
    where: { id: ids.saved.id }
  });
  assert.equal(saved.controlVersion, expectedVersion);
  assert.equal(saved.recoveryRequired, true);
  assert.equal(saved.userId, null);
  assert.equal(saved.mediaId, null);
  assert.ok(saved.removedAt);
  await denied(
    mediaCatalogRead(
      db,
      undefined,
      new URLSearchParams({ view: "detail", id: item.id })
    )
  );
  await denied(
    mediaPlaylistRead(
      db,
      undefined,
      new URLSearchParams({ view: "detail", id: list.id })
    )
  );
}

test("protected journal dispatch clears restored Scripture, playlist membership and saves in reverse version order", async () => {
  const actor = await createPortalActor(db, "mb_replay"),
    ids = await collection(actor),
    store = journal();
  const entries: RetentionControlEntry[] = [];
  for (const [kind, sourceId] of [
    ["MEDIA_CATALOG", ids.item.id],
    ["MEDIA_PLAYLIST", ids.list.id],
    ["MEDIA_SAVE", ids.saved.id]
  ] as const) {
    for (const version of [20, 19])
      entries.push(await control(kind, sourceId, version));
  }
  for (const entry of entries) await store.record(entry);
  const page = await store.page();
  assert.equal(page.entries.length, 6);
  assert.doesNotMatch(
    JSON.stringify(page.entries),
    /Fictional batch|Jn 3|John 3|youtu|Owned finite/
  );
  await replayRetentionControls(db, page.entries);
  await assertQuarantined(ids, 20);
  // Repeated and reversed pages cannot restore content or reduce the applied version.
  await replayRetentionControls(db, [...page.entries].reverse());
  await assertQuarantined(ids, 20);
  assert.equal(
    await db.retentionControl.count({
      where: {
        id: { in: entries.map((e) => e.id) },
        journaledAt: { not: null }
      }
    }),
    6
  );
});

test("missing media, playlist and saved records get inert recovery stubs through the dispatcher", async () => {
  const actor = await createPortalActor(db, "mb_missing"),
    original = await collection(actor);
  const missing = {
    item: { id: randomUUID() },
    list: { id: randomUUID() },
    saved: { id: randomUUID() }
  };
  const entries = await Promise.all([
    control("MEDIA_CATALOG", original.item.id, 20),
    control("MEDIA_PLAYLIST", original.list.id, 20),
    control("MEDIA_SAVE", original.saved.id, 20)
  ]);
  entries[0].sourceId = missing.item.id;
  entries[1].sourceId = missing.list.id;
  entries[2].sourceId = missing.saved.id;
  await replayRetentionControls(db, entries);
  await assertQuarantined(missing, 20);
  assert.deepEqual(
    (
      await db.mediaCatalogItem.findUniqueOrThrow({
        where: { id: original.item.id }
      })
    ).scriptureRanges,
    original.item.fields.scriptureRanges
  );
  assert.equal(
    (
      await db.mediaPlaylist.findUniqueOrThrow({
        where: { id: original.list.id }
      })
    ).recoveryRequired,
    false
  );
  assert.equal(
    (
      await db.mediaSavedItem.findUniqueOrThrow({
        where: { id: original.saved.id }
      })
    ).userId,
    actor.id
  );
});

test("older protected entries cannot quarantine newer currently reviewed media and collections", async () => {
  const actor = await createPortalActor(db, "mb_current"),
    ids = await collection(actor);
  const entries = await Promise.all([
    control("MEDIA_CATALOG", ids.item.id, 19),
    control("MEDIA_PLAYLIST", ids.list.id, 19),
    control("MEDIA_SAVE", ids.saved.id, 19)
  ]);
  await db.mediaCatalogItem.update({
    where: { id: ids.item.id },
    data: { controlVersion: 20 }
  });
  await db.mediaPlaylist.update({
    where: { id: ids.list.id },
    data: { controlVersion: 20 }
  });
  await db.mediaSavedItem.update({
    where: { id: ids.saved.id },
    data: { controlVersion: 20 }
  });
  await replayRetentionControls(db, entries);
  assert.deepEqual(
    (
      await db.mediaCatalogItem.findUniqueOrThrow({
        where: { id: ids.item.id }
      })
    ).scriptureRanges,
    ids.item.fields.scriptureRanges
  );
  assert.equal(
    (await db.mediaPlaylist.findUniqueOrThrow({ where: { id: ids.list.id } }))
      .recoveryRequired,
    false
  );
  assert.equal(
    await db.mediaPlaylistEntry.count({ where: { playlistId: ids.list.id } }),
    1
  );
  assert.equal(
    (await db.mediaSavedItem.findUniqueOrThrow({ where: { id: ids.saved.id } }))
      .userId,
    actor.id
  );
});

async function church(actor: PortalActor) {
  const row = await db.church.create({
    data: {
      slug: randomUUID(),
      name: "Fictional batch church",
      summary: "Isolated account adapter evidence",
      communityListed: true
    }
  });
  await db.churchConnection.create({
    data: { userId: actor.id, churchId: row.id, state: "APPROVED" }
  });
  const claim = await db.churchClaim.create({
    data: {
      ownerId: actor.id,
      requestKey: randomUUID(),
      churchId: row.id,
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
        userId: actor.id,
        churchId: row.id,
        capability: "MANAGE_CHURCH_ACCESS",
        sourceClaimId: claim.id
      },
      { userId: actor.id, churchId: row.id, capability: "MANAGE_CHURCH_MEDIA" }
    ]
  });
  return row;
}
async function accountExport(actor: PortalActor) {
  const secret = process.env.AUTH_RATE_LIMIT_SECRET!;
  const proof = await prepareAccountExport(
    db,
    actor.token,
    actor.password,
    secret
  );
  return JSON.parse(
    await downloadAccountExport(db, actor.token, proof.authorization, secret)
  );
}
test("actual account export combines exact Scripture provenance and private collections while excluding denied sources and church work", async () => {
  const actor = await createPortalActor(db, "mb_export"),
    other = await createPortalActor(db, "mb_other");
  const own = await collection(actor),
    foreign = await media(other),
    org = await church(actor);
  const churchItem = await media(actor, org.id),
    churchList = await playlist(actor, churchItem.id, org.id);
  const foreignSaved = await mediaPlaylistCommand(
    db,
    actor.token,
    input("save-media", { mediaId: foreign.id })
  );
  await mediaPlaylistCommand(
    db,
    actor.token,
    input("add", {
      playlistId: own.list.id,
      expectedVersion: own.list.version,
      mediaId: foreign.id
    })
  );
  const before = await accountExport(actor);
  assert.deepEqual(
    before.personalMedia.find((r: { id: string }) => r.id === own.item.id)
      .scriptureRanges,
    own.item.fields.scriptureRanges
  );
  assert.ok(
    before.personalMediaPlaylists.some(
      (r: { id: string }) => r.id === own.list.id
    )
  );
  assert.ok(
    before.savedMedia.some((r: { id: string }) => r.id === foreignSaved.id)
  );
  assert.equal(before.personalMediaPlaylistEntries.length, 2);
  await db.mediaCatalogRights.update({
    where: { itemId: foreign.id },
    data: { revokedAt: new Date() }
  });
  const exported = await accountExport(actor);
  const mediaSections = {
    personalMedia: exported.personalMedia,
    personalMediaPlaylists: exported.personalMediaPlaylists,
    personalMediaPlaylistEntries: exported.personalMediaPlaylistEntries,
    savedMedia: exported.savedMedia
  };
  const serialized = JSON.stringify(mediaSections);
  for (const forbidden of [
    foreign.id,
    foreign.fields.title,
    churchItem.id,
    churchList.id,
    other.email
  ])
    assert.equal(serialized.includes(forbidden), false, forbidden);
  assert.ok(
    exported.personalMediaPlaylistEntries.some(
      (r: { media: unknown }) => r.media === null
    )
  );
  assert.ok(
    exported.savedMedia.some((r: { id: string }) => r.id === foreignSaved.id)
  );
});

test("verified account erasure clears all three personal adapters while preserving shared church content and journaling controls", async () => {
  const actor = await createPortalActor(db, "mb_erase"),
    own = await collection(actor),
    org = await church(actor);
  const churchItem = await media(actor, org.id),
    churchList = await playlist(actor, churchItem.id, org.id);
  const beforeErasure = await Promise.all([
    db.mediaCatalogItem.findUniqueOrThrow({ where: { id: own.item.id } }),
    db.mediaPlaylist.findUniqueOrThrow({ where: { id: own.list.id } }),
    db.mediaSavedItem.findUniqueOrThrow({ where: { id: own.saved.id } })
  ]);
  const priorControlIds = (
    await db.retentionControl.findMany({
      where: {
        targetId: actor.id,
        sourceId: { in: beforeErasure.map((row) => row.id) }
      },
      select: { id: true }
    })
  ).map((row) => row.id);
  const records: AccountDeletionRecord[] = [],
    accountJournal = {
      async recordAccount(entry: AccountDeletionRecord) {
        records.push(structuredClone(entry));
      }
    };
  await requestPermanentAccountDeletion(
    db,
    actor.token,
    actor.password,
    true,
    createSessionToken(),
    accountJournal
  );
  const request = await db.accountDeletion.findUniqueOrThrow({
    where: { userId: actor.id }
  });
  await eraseRequestedAccountData(db, request.id, accountJournal);
  const erased = await db.mediaCatalogItem.findUniqueOrThrow({
    where: { id: own.item.id }
  });
  assert.equal(erased.ownerId, null);
  assert.equal(erased.sourceUrl, null);
  assert.deepEqual(erased.scriptureRanges, []);
  assert.equal(erased.state, "REMOVED");
  assert.equal(
    await db.mediaCatalogRights.count({ where: { itemId: erased.id } }),
    0
  );
  const erasedList = await db.mediaPlaylist.findUniqueOrThrow({
    where: { id: own.list.id }
  });
  assert.equal(erasedList.ownerId, null);
  assert.equal(erasedList.title, "");
  assert.equal(erasedList.state, "REMOVED");
  assert.equal(
    await db.mediaPlaylistEntry.count({ where: { playlistId: erasedList.id } }),
    0
  );
  const erasedSave = await db.mediaSavedItem.findUniqueOrThrow({
    where: { id: own.saved.id }
  });
  assert.equal(erasedSave.userId, null);
  assert.equal(erasedSave.mediaId, null);
  assert.ok(erasedSave.removedAt);
  const retainedItem = await db.mediaCatalogItem.findUniqueOrThrow({
    where: { id: churchItem.id }
  });
  assert.equal(retainedItem.ownerChurchId, org.id);
  assert.equal(retainedItem.createdById, null);
  assert.deepEqual(
    retainedItem.scriptureRanges,
    churchItem.fields.scriptureRanges
  );
  const retainedList = await db.mediaPlaylist.findUniqueOrThrow({
    where: { id: churchList.id }
  });
  assert.equal(retainedList.ownerChurchId, org.id);
  assert.equal(retainedList.createdById, null);
  assert.equal(
    await db.mediaPlaylistEntry.count({ where: { playlistId: churchList.id } }),
    1
  );
  assert.ok(records.length >= 2);
  const controls = await db.retentionControl.findMany({
    where: {
      targetId: actor.id,
      sourceId: { in: [own.item.id, own.list.id, own.saved.id] }
    }
  });
  assert.deepEqual(
    new Set(controls.map((c) => c.kind)),
    new Set(["MEDIA_CATALOG", "MEDIA_PLAYLIST", "MEDIA_SAVE"])
  );
  const createdControls = controls.filter(
    (control) => !priorControlIds.includes(control.id)
  );
  assert.equal(createdControls.length, 3);
  for (const [index, row] of [erased, erasedList, erasedSave].entries()) {
    assert.equal(row.controlVersion, beforeErasure[index].controlVersion + 1);
    const created = createdControls.filter(
      (control) => control.sourceId === row.id
    );
    assert.equal(created.length, 1);
    assert.equal(created[0].version, row.controlVersion);
    assert.equal(
      (created[0].payload as unknown as RetentionControlEntry).version,
      row.controlVersion
    );
  }
  assert.doesNotMatch(
    JSON.stringify(controls.map((c) => c.payload)),
    /Jn 3|John 3|youtu|Fictional batch/
  );
});
