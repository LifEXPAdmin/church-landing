import test, { before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Prisma, PrismaClient } from "@prisma/client";
import {
  assertPortalTestDatabase,
  createPortalActor,
  type PortalActor
} from "./seed-portal";
import { mediaPlaylistCommand as command } from "../lib/platform/media-playlist-commands";
import {
  mediaPlaylistRead as read,
  playlistCursor
} from "../lib/platform/media-playlist-reads";
import { mediaCatalogCommand } from "../lib/platform/media-catalog-commands";
import { mediaContext } from "../lib/platform/media-catalog-policy";
import { mediaFields } from "../lib/platform/media-catalog-input";
import { MEDIA_POLICY } from "../lib/platform/media-catalog-options";
import { PortalError } from "../lib/platform/portal-policy";
import {
  exportMediaPlaylists,
  eraseMediaPlaylists,
  replayPlaylistControl
} from "../lib/platform/media-playlist-retention";
import {
  replayRetentionControls,
  type RetentionControlEntry
} from "../lib/platform/retention-controls";
const db = new PrismaClient({ log: [{ level: "query", emit: "event" }] });
let queries: string[] = [];
db.$on("query", (event) => queries.push(event.query));
let owner: PortalActor,
  other: PortalActor,
  editor: PortalActor,
  churchId: string;
before(async () => {
  await assertPortalTestDatabase(db);
  owner = await createPortalActor(db, "plistown");
  other = await createPortalActor(db, "plistother");
  editor = await createPortalActor(db, "plistedit");
  churchId = (
    await db.church.create({
      data: {
        slug: randomUUID(),
        name: "Fictional playlist church",
        summary: "Isolated test",
        communityListed: true
      }
    })
  ).id;
  await db.churchConnection.createMany({
    data: [owner, editor].map((a) => ({
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
      { userId: editor.id, churchId, capability: "EDIT_CHURCH_MEDIA" }
    ]
  });
});
beforeEach(() => db.platformAuthLimit.deleteMany());
after(() => db.$disconnect());
const input = (operation: string, more: Record<string, unknown> = {}) => ({
  operation,
  mutationId: randomUUID(),
  ...more
});
const fields = (audience = "PUBLIC") => ({
  title: "Fictional ordered study " + randomUUID(),
  description: "A finite collection",
  audience
});
const create = (f = fields(), actor = owner, church: string | null = null) =>
  command(
    db,
    actor.token,
    input("create", { ownerChurchId: church, fields: f })
  );
type Projection = {
  actorId: string | null;
  playlist?: { id: string; version: number; entryIds?: string[] };
  items: Array<{
    entryId?: string;
    id?: string;
    version?: number;
    position?: number;
    media?: { id: string; title: string } | null;
  }>;
  total?: number;
  nextCursor: string | null;
};
const view = async (
  id: string,
  actor: PortalActor | null = null,
  editing = false,
  cursor?: string
) =>
  (await read(
    db,
    actor?.token,
    new URLSearchParams({
      view: editing ? "editor" : "detail",
      id,
      ...(cursor ? { cursor } : {})
    }),
    actor?.id
  )) as unknown as Projection;
const saves = async (actor = owner) =>
  (await read(
    db,
    actor.token,
    new URLSearchParams({ view: "saved" }),
    actor.id
  )) as unknown as Projection;
const denied = (p: Promise<unknown>, status = 404) =>
  assert.rejects(
    p,
    (e: unknown) => e instanceof PortalError && e.status === status
  );
async function media(
  audience = "PUBLIC",
  actor = owner,
  church: string | null = null
) {
  const f = mediaFields({
    title: "Private source sentinel " + randomUUID(),
    description: "Private source details",
    format: "SERMON",
    presentation: "VIDEO",
    audience,
    details: { preachedOn: null },
    sourceUrl: "https://youtu.be/abcdefghijk"
  });
  const reviewed = {
    fields: f,
    acknowledgment: {
      policy: MEDIA_POLICY,
      sourceUrl: f.sourceUrl,
      audience: f.audience,
      accepted: true
    },
    rights: {
      basis: "OWN",
      reviewed: true,
      publicRecording: true,
      textRights: true
    }
  };
  const p = await mediaCatalogCommand(
    db,
    actor.token,
    input("create", { ownerChurchId: church, ...reviewed })
  );
  return mediaCatalogCommand(
    db,
    actor.token,
    input("publish", { itemId: p.id, expectedVersion: p.version, ...reviewed })
  );
}
async function listWith(
  ids: string[],
  f = fields(),
  actor = owner,
  church: string | null = null
) {
  let p = await create(f, actor, church);
  for (const mediaId of ids)
    p = await command(
      db,
      actor.token,
      input("add", { playlistId: p.id, expectedVersion: p.version, mediaId })
    );
  return command(
    db,
    actor.token,
    input("publish", {
      playlistId: p.id,
      expectedVersion: p.version,
      fields: f
    })
  );
}

test("draft/PRIVATE container reads and forged owner changes fail closed", async () => {
  const f = fields("PRIVATE"),
    p = await create(f);
  await denied(view(p.id));
  await denied(view(p.id, other, true));
  assert.throws(
    () =>
      command(
        db,
        owner.token,
        input("create", { ownerChurchId: null, fields: f, ownerId: other.id })
      ),
    (e: unknown) => e instanceof PortalError && e.status === 400
  );
  await command(
    db,
    owner.token,
    input("publish", {
      playlistId: p.id,
      expectedVersion: p.version,
      fields: f
    })
  );
  assert.equal((await view(p.id, owner)).playlist?.id, p.id);
  await denied(view(p.id, other));
  await denied(view(p.id));
});
test("saves remain private, duplicate keys and duplicate source saves create one record", async () => {
  const m = await media(),
    body = input("save-media", { mediaId: m.id });
  const first = await command(db, owner.token, body);
  assert.deepEqual(await command(db, owner.token, body), first);
  assert.equal(
    (await command(db, owner.token, input("save-media", { mediaId: m.id }))).id,
    first.id
  );
  assert.equal(
    await db.mediaSavedItem.count({
      where: { userId: owner.id, mediaId: m.id }
    }),
    1
  );
  assert.ok(!JSON.stringify(await saves(other)).includes(m.id));
  await denied(
    command(
      db,
      other.token,
      input("unsave-media", {
        savedId: first.id,
        expectedVersion: first.version
      })
    )
  );
  await denied(
    read(db, other.token, new URLSearchParams({ view: "saved" }), owner.id),
    401
  );
});
test("source access is required for save/add, while owned opaque tombstones remain removable", async () => {
  const m = await media("MEMBERS"),
    p = await listWith([m.id]);
  const saved = await command(
    db,
    owner.token,
    input("save-media", { mediaId: m.id })
  );
  await db.mediaCatalogRights.update({
    where: { itemId: m.id },
    data: { revokedAt: new Date() }
  });
  const pub = await view(p.id),
    own = await view(p.id, owner, true);
  assert.equal(pub.items.length, 0);
  assert.equal(pub.total, 0);
  assert.equal(pub.nextCursor, null);
  assert.ok(!JSON.stringify([pub, own]).includes(m.id));
  assert.equal(own.items[0].media, null);
  const entry = own.items[0].entryId!;
  await command(
    db,
    owner.token,
    input("remove-entry", {
      playlistId: p.id,
      expectedVersion: p.version,
      entryId: entry
    })
  );
  await command(
    db,
    owner.token,
    input("unsave-media", { savedId: saved.id, expectedVersion: saved.version })
  );
  await denied(
    command(db, owner.token, input("save-media", { mediaId: m.id }))
  );
});
test("public playlist intersects each item and uses dense counts and positions", async () => {
  const a = await media(),
    hidden = await media("MEMBERS"),
    b = await media(),
    p = await listWith([a.id, hidden.id, b.id]);
  const guest = await view(p.id);
  assert.deepEqual(
    guest.items.map((x) => x.media?.id),
    [a.id, b.id]
  );
  assert.deepEqual(
    guest.items.map((x) => x.position),
    [1, 2]
  );
  assert.equal(guest.total, 2);
  assert.ok(!JSON.stringify(guest).includes(hidden.id));
  assert.ok(guest.items.every((x) => !x.entryId));
  assert.equal((await view(p.id, other)).total, 3);
  await db.mediaCatalogItem.update({
    where: { id: a.id },
    data: { state: "UNPUBLISHED" }
  });
  assert.deepEqual(
    (await view(p.id)).items.map((x) => x.media?.id),
    [b.id]
  );
});
test("church container and item audiences are exact intersections", async () => {
  const hidden = await media("CHURCH", owner, churchId),
    visible = await media();
  const p = await listWith([hidden.id, visible.id]);
  assert.deepEqual(
    (await view(p.id, other)).items.map((x) => x.media?.id),
    [visible.id]
  );
  assert.equal((await view(p.id, editor)).total, 2);
  const church = await listWith(
    [visible.id],
    fields("CHURCH"),
    owner,
    churchId
  );
  await denied(view(church.id, other));
  await denied(view(church.id));
  assert.equal((await view(church.id, editor)).total, 1);
});
test("reorder, duplicate add and exact retry retain one canonical structure", async () => {
  const a = await media(),
    b = await media(),
    p = await listWith([a.id, b.id]);
  const before = await view(p.id, owner, true),
    order = before.playlist!.entryIds!.slice().reverse();
  const body = input("reorder", {
    playlistId: p.id,
    expectedVersion: p.version,
    entryIds: order
  });
  const r = await command(db, owner.token, body);
  assert.deepEqual(await command(db, owner.token, body), r);
  assert.deepEqual(
    (await view(p.id)).items.map((x) => x.media?.id),
    [b.id, a.id]
  );
  await denied(
    command(db, owner.token, { ...body, entryIds: order.slice().reverse() }),
    409
  );
  const duplicate = await command(
    db,
    owner.token,
    input("add", {
      playlistId: p.id,
      expectedVersion: r.version,
      mediaId: a.id
    })
  );
  assert.equal(duplicate.version, r.version);
  await denied(
    command(
      db,
      owner.token,
      input("reorder", {
        playlistId: p.id,
        expectedVersion: r.version,
        entryIds: [order[0]]
      })
    ),
    409
  );
  await denied(
    command(
      db,
      owner.token,
      input("reorder", {
        playlistId: p.id,
        expectedVersion: r.version,
        entryIds: [order[0], randomUUID()]
      })
    ),
    409
  );
});
test("concurrent reorder/removal has one winner and cannot resurrect an entry", async () => {
  const a = await media(),
    b = await media(),
    p = await listWith([a.id, b.id]),
    v = await view(p.id, owner, true),
    ids = v.playlist!.entryIds!;
  const results = await Promise.allSettled([
    command(
      db,
      owner.token,
      input("reorder", {
        playlistId: p.id,
        expectedVersion: p.version,
        entryIds: ids.slice().reverse()
      })
    ),
    command(
      db,
      owner.token,
      input("remove-entry", {
        playlistId: p.id,
        expectedVersion: p.version,
        entryId: ids[0]
      })
    )
  ]);
  assert.equal(results.filter((x) => x.status === "fulfilled").length, 1);
  assert.equal(results.filter((x) => x.status === "rejected").length, 1);
  const rows = await db.mediaPlaylistEntry.findMany({
    where: { playlistId: p.id },
    orderBy: { position: "asc" }
  });
  assert.deepEqual(
    rows.map((x) => x.position),
    rows.map((_, i) => i)
  );
});
test("church draft editor cannot publish or change a live order; revocation denies old receipts", async () => {
  const f = fields(),
    body = input("create", { ownerChurchId: churchId, fields: f }),
    p = await command(db, editor.token, body);
  await denied(
    command(
      db,
      editor.token,
      input("publish", {
        playlistId: p.id,
        expectedVersion: p.version,
        fields: f
      })
    )
  );
  const live = await command(
    db,
    owner.token,
    input("publish", {
      playlistId: p.id,
      expectedVersion: p.version,
      fields: f
    })
  );
  await denied(view(p.id, editor, true));
  await denied(
    command(
      db,
      editor.token,
      input("reorder", {
        playlistId: p.id,
        expectedVersion: live.version,
        entryIds: []
      })
    )
  );
  const grant = await db.churchCapabilityGrant.findFirstOrThrow({
    where: {
      userId: editor.id,
      churchId,
      capability: "EDIT_CHURCH_MEDIA",
      revokedAt: null
    }
  });
  await db.churchCapabilityGrant.update({
    where: { id: grant.id },
    data: { revokedAt: new Date() }
  });
  await denied(command(db, editor.token, body));
  assert.ok(await db.mediaPlaylist.findUnique({ where: { id: p.id } }));
  await db.churchCapabilityGrant.update({
    where: { id: grant.id },
    data: { revokedAt: null }
  });
});
test("unsave and playlist removal are independent; old publish/save receipts cannot revive them", async () => {
  const m = await media(),
    saveBody = input("save-media", { mediaId: m.id }),
    s = await command(db, owner.token, saveBody),
    f = fields(),
    p = await create(f);
  const publish = input("publish", {
      playlistId: p.id,
      expectedVersion: p.version,
      fields: f
    }),
    live = await command(db, owner.token, publish);
  const remove = input("remove", {
      playlistId: p.id,
      expectedVersion: live.version
    }),
    gone = await command(db, owner.token, remove);
  assert.deepEqual(await command(db, owner.token, remove), gone);
  assert.ok((await saves()).items.some((x) => x.id === s.id));
  await denied(command(db, owner.token, publish));
  await command(
    db,
    owner.token,
    input("unsave-media", { savedId: s.id, expectedVersion: s.version })
  );
  await denied(command(db, owner.token, saveBody), 409);
});
test("cursor is bound to account, permission scope and playlist version", async () => {
  const c = await db.$transaction((tx) => mediaContext(tx, owner.id)),
    otherC = await db.$transaction((tx) => mediaContext(tx, other.id));
  const cursor = playlistCursor(c, ["detail", "playlist", 2]).encode(25);
  assert.equal(playlistCursor(c, ["detail", "playlist", 2]).decode(cursor), 25);
  assert.throws(() =>
    playlistCursor(otherC, ["detail", "playlist", 2]).decode(cursor)
  );
  assert.throws(() =>
    playlistCursor(c, ["detail", "playlist", 3]).decode(cursor)
  );
  assert.throws(() =>
    playlistCursor(c, ["detail", "playlist", 2]).decode(cursor + "x")
  );
});
test("export omits denied source metadata and all church-managed records", async () => {
  const m = await media(),
    p = await listWith([m.id]),
    church = await create(fields(), owner, churchId);
  await command(db, owner.token, input("save-media", { mediaId: m.id }));
  await db.mediaCatalogRights.update({
    where: { itemId: m.id },
    data: { revokedAt: new Date() }
  });
  const result = await db.$transaction((tx) =>
    exportMediaPlaylists(tx, owner.id, 2000)
  );
  assert.ok(result.personalMediaPlaylists.some((x) => x.id === p.id));
  assert.ok(!JSON.stringify(result).includes(m.id));
  assert.ok(!JSON.stringify(result).includes(church.id));
});
test("protected control replay quarantines stale membership and saves without reviving source data", async () => {
  const m = await media(),
    p = await listWith([m.id]),
    s = await command(db, owner.token, input("save-media", { mediaId: m.id }));
  const control = await db.retentionControl.findFirstOrThrow({
    where: { kind: "MEDIA_PLAYLIST", sourceId: p.id },
    orderBy: { version: "desc" }
  });
  const entry = {
    ...(control.payload as unknown as RetentionControlEntry),
    id: randomUUID(),
    version: control.version + 1,
    recordedAt: new Date().toISOString()
  };
  await replayRetentionControls(db, [entry]);
  await denied(view(p.id));
  assert.equal(
    await db.mediaPlaylistEntry.count({ where: { playlistId: p.id } }),
    0
  );
  await db.$transaction((tx) =>
    replayPlaylistControl(tx, "MEDIA_SAVE", s.id, s.version + 1, new Date())
  );
  assert.ok(!(await saves()).items.some((x) => x.id === s.id));
  const missing = randomUUID();
  await db.$transaction((tx) =>
    replayPlaylistControl(tx, "MEDIA_PLAYLIST", missing, 9, new Date())
  );
  assert.equal(
    (await db.mediaPlaylist.findUniqueOrThrow({ where: { id: missing } }))
      .recoveryRequired,
    true
  );
});
test("personal erasure clears private saves/playlists and attribution without deleting church work", async () => {
  const person = await createPortalActor(db, "plisterase"),
    m = await media(),
    p = await listWith([m.id], fields(), person);
  await command(db, person.token, input("save-media", { mediaId: m.id }));
  const church = await create(fields(), editor, churchId);
  await db.$transaction((tx) => eraseMediaPlaylists(tx, person.id, new Date()));
  assert.equal(
    (await db.mediaPlaylist.findUniqueOrThrow({ where: { id: p.id } })).ownerId,
    null
  );
  assert.equal(
    await db.mediaPlaylistEntry.count({ where: { playlistId: p.id } }),
    0
  );
  assert.equal(
    await db.mediaSavedItem.count({ where: { userId: person.id } }),
    0
  );
  await db.$transaction((tx) => eraseMediaPlaylists(tx, editor.id, new Date()));
  const retained = await db.mediaPlaylist.findUniqueOrThrow({
    where: { id: church.id }
  });
  assert.equal(retained.ownerChurchId, churchId);
  assert.equal(retained.createdById, null);
});

async function fixtureEntries(playlistId: string, count: number) {
  const seed = await media(),
    row = await db.mediaCatalogItem.findUniqueOrThrow({
      where: { id: seed.id }
    }),
    rights = await db.mediaCatalogRights.findUniqueOrThrow({
      where: { itemId: seed.id }
    });
  const ids = Array.from({ length: count }, () => randomUUID());
  await db.mediaCatalogItem.createMany({
    data: ids.map((id) => ({
      ...row,
      id,
      details: row.details ?? Prisma.JsonNull,
      scriptureRanges: row.scriptureRanges ?? []
    }))
  });
  await db.mediaCatalogRights.createMany({
    data: ids.map((itemId) => ({ ...rights, itemId }))
  });
  await db.mediaPlaylistEntry.createMany({
    data: ids.map((mediaId, position) => ({
      id: randomUUID(),
      playlistId,
      mediaId,
      position
    }))
  });
  return ids;
}
test("sparse public pagination filters before counts and cursors with a bounded batch query plan", async () => {
  const f = fields(),
    p = await create(f),
    ids = await fixtureEntries(p.id, 127);
  await command(
    db,
    owner.token,
    input("publish", {
      playlistId: p.id,
      expectedVersion: p.version,
      fields: f
    })
  );
  await db.mediaCatalogItem.updateMany({
    where: { id: { in: ids.slice(0, 100) } },
    data: { state: "UNPUBLISHED" }
  });
  queries = [];
  const first = await view(p.id);
  const firstQueryCount = queries.length;
  assert.equal(first.items.length, 25);
  assert.equal(first.total, 27);
  assert.ok(first.nextCursor);
  assert.deepEqual(
    first.items.map((x) => x.position),
    Array.from({ length: 25 }, (_, i) => i + 1)
  );
  assert.ok(
    ids.slice(0, 100).every((id) => !JSON.stringify(first).includes(id))
  );
  const second = await view(p.id, null, false, first.nextCursor!);
  assert.equal(second.items.length, 2);
  assert.deepEqual(
    second.items.map((x) => x.position),
    [26, 27]
  );
  assert.equal(second.nextCursor, null);
  assert.deepEqual(
    [...first.items, ...second.items].map((x) => x.media?.id),
    ids.slice(100)
  );
  assert.ok(
    firstQueryCount <= 20,
    `bounded source read, observed ${firstQueryCount} queries`
  );
  console.log(
    "MEASURE sparse playlist127/27readable: queries",
    firstQueryCount,
    "payloadBytes",
    Buffer.byteLength(JSON.stringify(first))
  );
});
test("200-entry limit, dense bulk reorder and exact set validation stay bounded", async () => {
  const p = await create(),
    ids = await fixtureEntries(p.id, 200),
    extra = await media();
  await denied(
    command(
      db,
      owner.token,
      input("add", {
        playlistId: p.id,
        expectedVersion: p.version,
        mediaId: extra.id
      })
    ),
    409
  );
  const order = (
    await db.mediaPlaylistEntry.findMany({
      where: { playlistId: p.id },
      orderBy: { position: "asc" }
    })
  )
    .map((x) => x.id)
    .reverse();
  queries = [];
  await command(
    db,
    owner.token,
    input("reorder", {
      playlistId: p.id,
      expectedVersion: p.version,
      entryIds: order
    })
  );
  const updates = queries.filter((q) =>
    q.includes('UPDATE "MediaPlaylistEntry"')
  );
  assert.equal(updates.length, 1);
  assert.equal(
    await db.mediaPlaylistEntry.count({ where: { playlistId: p.id } }),
    200
  );
  const first = await db.mediaPlaylistEntry.findFirstOrThrow({
    where: { playlistId: p.id },
    orderBy: { position: "asc" }
  });
  assert.equal(first.mediaId, ids[199]);
  console.log("MEASURE reorder200: one batched entry update");
});
test("source block, account restriction and expired rights immediately conceal retained references", async () => {
  const m = await media(),
    p = await listWith([m.id]);
  await db.mediaCatalogRights.update({
    where: { itemId: m.id },
    data: { expiresAt: new Date(Date.now() - 1000) }
  });
  assert.equal((await view(p.id, other)).total, 0);
  await db.mediaCatalogRights.update({
    where: { itemId: m.id },
    data: { expiresAt: null }
  });
  const block = await db.socialRelationship.create({
    data: { ownerId: other.id, targetUserId: owner.id, blocked: true }
  });
  await denied(view(p.id, other));
  await db.socialRelationship.delete({ where: { id: block.id } });
  await db.platformUser.update({
    where: { id: owner.id },
    data: { suspendedAt: new Date() }
  });
  await denied(view(p.id));
  await db.platformUser.update({
    where: { id: owner.id },
    data: { suspendedAt: null }
  });
});

test("editor anchors retain the canonical page after a cross-page reorder without exposing private positions", async () => {
  const p = await create(),
    ids = await fixtureEntries(p.id, 27);
  const entries = (await view(p.id, owner, true)).playlist!.entryIds!;
  const moved = entries[24];
  [entries[24], entries[25]] = [entries[25], entries[24]];
  await command(
    db,
    owner.token,
    input("reorder", {
      playlistId: p.id,
      expectedVersion: p.version,
      entryIds: entries
    })
  );
  const query = new URLSearchParams({
    view: "editor",
    id: p.id,
    anchor: moved
  });
  const page = (await read(
    db,
    owner.token,
    query,
    owner.id
  )) as unknown as Projection;
  assert.equal(page.items[0].entryId, moved);
  assert.equal(page.items[0].position, 26);
  assert.equal(page.items.length, 2);
  assert.equal(page.items[0].media?.id, ids[24]);
  await denied(read(db, other.token, query, other.id));
  assert.throws(() =>
    read(
      db,
      owner.token,
      new URLSearchParams({ view: "detail", id: p.id, anchor: moved }),
      owner.id
    )
  );
  assert.throws(() =>
    read(
      db,
      owner.token,
      new URLSearchParams({
        view: "editor",
        id: p.id,
        anchor: moved,
        cursor: "bad"
      }),
      owner.id
    )
  );
  await denied(
    read(
      db,
      owner.token,
      new URLSearchParams({ view: "editor", id: p.id, anchor: randomUUID() }),
      owner.id
    ),
    409
  );
});
