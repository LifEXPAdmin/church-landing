import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { PrismaClient } from "@prisma/client";
import {
  createPortalActor,
  assertPortalTestDatabase,
  seedPortal
} from "./seed-portal";
import { PortalError, portalCommand } from "../lib/platform/portal";
import {
  uploadImage,
  readImage,
  removeImage,
  collectImageGarbage
} from "../lib/platform/media";
import { personalPhotoCommand } from "../lib/platform/personal-photos";
import {
  photoAlbumCommand,
  readPhotoAlbums
} from "../lib/platform/photo-albums";
import { postCommand } from "../lib/platform/post-commands";
import { relationshipCommand } from "../lib/platform/relationships";
import {
  deactivateAccount,
  reactivateAccount
} from "../lib/platform/account-lifecycle";
import { loginAccount } from "../lib/platform/accounts";
import {
  prepareAccountExport,
  downloadAccountExport
} from "../lib/platform/account-export";
const db = new PrismaClient();
before(async () => {
  await assertPortalTestDatabase(db);
  process.env.PERSONAL_PHOTO_LIBRARY_ENABLED = "true";
  process.env.PHOTO_ALBUMS_ENABLED = "true";
});
after(() => db.$disconnect());
const m = (operation: string, fields: Record<string, unknown> = {}) => ({
  operation,
  mutationId: randomUUID(),
  ...fields
});
const denied = (promise: Promise<unknown>, status: number) =>
  assert.rejects(
    promise,
    (error: unknown) => error instanceof PortalError && error.status === status
  );
function memoryStore() {
  const files = new Map<string, Buffer>();
  let puts = 0;
  return {
    files,
    get puts() {
      return puts;
    },
    async put(path: string, bytes: Buffer) {
      assert.ok(!files.has(path));
      files.set(path, bytes);
      puts++;
    },
    async get(path: string) {
      return files.get(path) ?? null;
    },
    async delete(paths: string[]) {
      paths.forEach((path) => files.delete(path));
    }
  };
}
const bytes = () =>
  sharp({ create: { width: 90, height: 60, channels: 3, background: "teal" } })
    .png()
    .toBuffer();
const upload = (targetId: string, purpose = "PROFILE_PHOTO", rest = {}) => ({
  targetId,
  purpose,
  requestKey: randomUUID(),
  ...rest
});
async function ref(id: string) {
  const row = await db.personalPhoto.findUniqueOrThrow({
    where: { assetId: id },
    include: { asset: true }
  });
  return { id, photoVersion: row.version, imageVersion: row.asset.version };
}
async function photoInput(id: string) {
  const r = await ref(id);
  return {
    imageId: id,
    expectedVersion: r.photoVersion,
    imageVersion: r.imageVersion
  };
}
const create = (token: string, rest = {}) =>
  photoAlbumCommand(
    db,
    token,
    m("create", { expectedVersion: 0, name: "Fictional album", ...rest })
  );
async function save(token: string, id: string, ids: string[], rest = {}) {
  const row = await db.photoAlbum.findUniqueOrThrow({ where: { id } });
  return photoAlbumCommand(
    db,
    token,
    m("save", {
      id,
      expectedVersion: row.version,
      name: row.name,
      audience: row.audience,
      audienceChurchId: row.audienceChurchId,
      coverAssetId: null,
      photos: await Promise.all(ids.map(ref)),
      ...rest
    })
  );
}

test("album operations own references, preserve exact receipts/versions and never upload or silently delete photos", async () => {
  const a = await createPortalActor(db, "albumowner"),
    b = await createPortalActor(db, "albumother"),
    store = memoryStore(),
    data = await bytes();
  const one = await uploadImage(db, a.token, upload(a.id), data, store),
    two = await uploadImage(db, a.token, upload(a.id), data, store),
    foreign = await uploadImage(db, b.token, upload(b.id), data, store);
  const input = m("create", { expectedVersion: 0, name: "Private album" });
  const album = await photoAlbumCommand(db, a.token, input);
  assert.deepEqual(await photoAlbumCommand(db, a.token, input), album);
  await denied(
    photoAlbumCommand(db, a.token, { ...input, name: "Changed retry" }),
    409
  );
  await denied(save(b.token, album.id, []), 404);
  await denied(save(a.token, album.id, [foreign.id]), 409);
  await denied(save(a.token, album.id, [one.id, one.id]), 400);
  const body = m("save", {
    id: album.id,
    expectedVersion: 1,
    name: "Ordered album",
    audience: "MEMBERS",
    photos: [await ref(two.id), await ref(one.id)],
    coverAssetId: one.id
  });
  const saved = await photoAlbumCommand(db, a.token, body);
  assert.deepEqual(await photoAlbumCommand(db, a.token, body), saved);
  await denied(
    photoAlbumCommand(db, a.token, {
      ...body,
      mutationId: randomUUID(),
      name: "Stale tab"
    }),
    409
  );
  const own = await readPhotoAlbums(db, a.token, {
    profileId: a.id,
    id: album.id,
    edit: "true"
  });
  assert.deepEqual(
    own.images.map((row) => row.id),
    [two.id, one.id]
  );
  assert.equal(own.album?.cover?.id, one.id);
  const visitor = await readPhotoAlbums(db, b.token, {
    profileId: a.id,
    id: album.id
  });
  assert.equal(visitor.album?.total, 0);
  assert.equal(visitor.album?.cover, null);
  assert.equal(visitor.album?.coverAssetId, null);
  assert.doesNotMatch(
    JSON.stringify(visitor),
    new RegExp(one.id + "|" + two.id)
  );
  await denied(
    readPhotoAlbums(db, b.token, {
      profileId: a.id,
      id: album.id,
      edit: "true"
    }),
    404
  );
  await denied(
    personalPhotoCommand(
      db,
      a.token,
      m("delete", { ...(await photoInput(one.id)), confirmed: true })
    ),
    409
  );
  process.env.PHOTO_ALBUMS_ENABLED = "false";
  try {
    assert.throws(
      () => readPhotoAlbums(db, a.token, { profileId: a.id }),
      (error: unknown) => error instanceof PortalError && error.status === 503
    );
    await denied(
      personalPhotoCommand(
        db,
        a.token,
        m("delete", { ...(await photoInput(one.id)), confirmed: true })
      ),
      409
    );
  } finally {
    process.env.PHOTO_ALBUMS_ENABLED = "true";
  }
  await save(a.token, album.id, [one.id]);
  assert.equal(store.puts, 12);
  const deletion = m("delete", {
    id: album.id,
    expectedVersion: 3,
    confirmed: true
  });
  const receipt = await photoAlbumCommand(db, a.token, deletion);
  assert.deepEqual(await photoAlbumCommand(db, a.token, deletion), receipt);
  assert.equal(
    await db.photoAlbumEntry.count({ where: { albumId: album.id } }),
    0
  );
  for (const image of [one, two])
    assert.equal(
      (await db.mediaAsset.findUniqueOrThrow({ where: { id: image.id } }))
        .status,
      "READY"
    );
  assert.equal(
    await db.mediaGarbage.count({
      where: {
        storagePrefix: {
          in: (
            await db.mediaAsset.findMany({
              where: { id: { in: [one.id, two.id] } },
              select: { storagePrefix: true }
            })
          ).map((row) => row.storagePrefix)
        }
      }
    }),
    0
  );
  await personalPhotoCommand(
    db,
    a.token,
    m("delete", { ...(await photoInput(one.id)), confirmed: true })
  );
  const retired = await db.mediaAsset.findUniqueOrThrow({
    where: { id: one.id }
  });
  assert.equal(retired.status, "RETIRED");
  assert.ok(
    await db.mediaGarbage.findUnique({
      where: { storagePrefix: retired.storagePrefix }
    })
  );
  assert.equal(store.puts, 12);
});

test("visible albums intersect source posts, cover/count privacy, withdrawal, hidden entries, block and church membership", async () => {
  const f = await seedPortal(db),
    a = f.memberA,
    b = f.memberB,
    store = memoryStore(),
    data = await bytes();
  const post = await postCommand(db, a.token, {
    operation: "create",
    requestKey: randomUUID(),
    content: "Fictional album source",
    audience: "PUBLIC",
    audienceChurchId: f.churchA.id,
    replyAudience: "CHURCH_MEMBERS"
  });
  const photo = await uploadImage(
    db,
    a.token,
    upload(post.id, "POST_PHOTO"),
    data,
    store
  );
  const publicPhoto = await uploadImage(
    db,
    a.token,
    upload(a.id, "PROFILE_PHOTO", { audience: "PUBLIC" }),
    data,
    store
  );
  const album = await create(a.token, { audience: "MEMBERS" });
  await save(a.token, album.id, [photo.id, publicPhoto.id], {
    coverAssetId: photo.id
  });
  assert.equal(
    (await readPhotoAlbums(db, b.token, { profileId: a.id, id: album.id }))
      .album?.total,
    2
  );
  await denied(removeImage(db, a.token, photo.id, photo.version), 409);
  await postCommand(db, a.token, {
    operation: "edit",
    postId: post.id,
    expectedVersion: 2,
    audience: "CHURCH",
    confirmAudienceChange: true
  });
  let foreign = await readPhotoAlbums(db, b.token, {
    profileId: a.id,
    id: album.id
  });
  assert.equal(foreign.album?.total, 1);
  assert.equal(foreign.album?.cover?.id, publicPhoto.id);
  assert.equal(foreign.album?.coverAssetId, publicPhoto.id);
  assert.doesNotMatch(
    JSON.stringify(foreign),
    new RegExp(photo.id + "|" + post.id)
  );
  for (const variant of ["thumb", "large", "original"])
    await denied(readImage(db, b.token, photo.id, variant, store), 404);
  assert.equal(
    (
      await readPhotoAlbums(db, f.coordinator.token, {
        profileId: a.id,
        id: album.id
      })
    ).album?.total,
    2
  );
  await db.churchConnection.updateMany({
    where: { userId: f.coordinator.id, churchId: f.churchA.id },
    data: { state: "REMOVED" }
  });
  assert.equal(
    (
      await readPhotoAlbums(db, f.coordinator.token, {
        profileId: a.id,
        id: album.id
      })
    ).album?.total,
    1
  );
  await denied(
    readImage(db, f.coordinator.token, photo.id, "large", store),
    404
  );
  await postCommand(db, a.token, {
    operation: "withdraw",
    postId: post.id,
    expectedVersion: 3,
    confirmed: true
  });
  const own = await readPhotoAlbums(db, a.token, {
    profileId: a.id,
    id: album.id,
    edit: "true"
  });
  assert.equal(own.album?.total, 1);
  assert.equal(own.editing?.find((row) => row.id === photo.id)?.image, null);
  await save(a.token, album.id, [publicPhoto.id], {
    name: "Source removed from collection"
  });
  await personalPhotoCommand(
    db,
    a.token,
    m("hide", await photoInput(publicPhoto.id))
  );
  foreign = await readPhotoAlbums(db, b.token, {
    profileId: a.id,
    id: album.id
  });
  assert.equal(foreign.album?.total, 0);
  assert.ok(
    (await readImage(db, "", publicPhoto.id, "large", store)).length,
    "Private discovery never revokes an explicitly public source elsewhere"
  );
  await relationshipCommand(
    db,
    b.token,
    m("block", {
      kind: "person",
      targetId: a.id,
      expectedVersion: 0,
      desired: true
    })
  );
  await denied(readPhotoAlbums(db, b.token, { profileId: a.id }), 404);
  await denied(readImage(db, b.token, publicPhoto.id, "thumb", store), 404);
  await portalCommand(db, f.operator.token, {
    operation: "grant",
    churchId: f.churchA.id,
    userId: a.id,
    capability: "PUBLISH_CHURCH_POSTS",
    expectedVersion: 0
  });
  const churchPost = await postCommand(db, a.token, {
    operation: "create",
    requestKey: randomUUID(),
    authorChurchId: f.churchA.id,
    content: "Fictional church photo",
    audience: "PUBLIC"
  });
  const churchPhoto = await uploadImage(
    db,
    a.token,
    upload(churchPost.id, "POST_PHOTO"),
    data,
    store
  );
  assert.equal(
    await db.personalPhoto.count({ where: { assetId: churchPhoto.id } }),
    0
  );
  await denied(
    photoAlbumCommand(
      db,
      a.token,
      m("save", {
        id: album.id,
        expectedVersion: 3,
        name: "Church ownership stays separate",
        audience: "MEMBERS",
        photos: [{ id: churchPhoto.id, photoVersion: 1, imageVersion: 1 }]
      })
    ),
    409
  );
});

test("album and photo audience rechecks deny expired church access and do not accept guest or preview management", async () => {
  const f = await seedPortal(db),
    a = f.memberA,
    b = f.memberB,
    store = memoryStore(),
    data = await bytes();
  const photo = await uploadImage(
    db,
    a.token,
    upload(a.id, "PROFILE_PHOTO", { audience: "PUBLIC" }),
    data,
    store
  );
  const album = await create(a.token, {
    audience: "CHURCH",
    audienceChurchId: f.churchA.id
  });
  await save(a.token, album.id, [photo.id]);
  await denied(
    readPhotoAlbums(db, b.token, { profileId: a.id, id: album.id }),
    404
  );
  await denied(
    readPhotoAlbums(db, null, { profileId: a.id, id: album.id }),
    401
  );
  const preview = await readPhotoAlbums(db, a.token, {
    profileId: a.id,
    preview: "member"
  });
  assert.equal(preview.canManage, false);
  assert.deepEqual(preview.albums, []);
  await db.churchConnection.updateMany({
    where: { userId: a.id, churchId: f.churchA.id },
    data: { state: "REMOVED" }
  });
  await denied(
    save(a.token, album.id, [photo.id], { name: "Stale church save" }),
    403
  );
  await save(a.token, album.id, [photo.id], {
    audience: "ONLY_ME",
    audienceChurchId: null
  });
  await denied(create(a.token, { audience: "PUBLIC" }), 400);
});

test("album pagination is bounded and cursor changes follow the current viewer, order and source filter", async () => {
  const a = await createPortalActor(db, "pagedalbums"),
    b = await createPortalActor(db, "albumreader"),
    store = memoryStore(),
    data = await bytes(),
    ids: string[] = [];
  for (let i = 0; i < 25; i++)
    ids.push(
      (
        await uploadImage(
          db,
          a.token,
          upload(a.id, "PROFILE_PHOTO", { audience: "MEMBERS" }),
          data,
          store
        )
      ).id
    );
  const album = await create(a.token, { audience: "MEMBERS" });
  await save(a.token, album.id, ids);
  const first = await readPhotoAlbums(db, b.token, {
    profileId: a.id,
    id: album.id
  });
  assert.equal(first.images.length, 24);
  assert.equal(first.album?.total, 25);
  assert.ok(first.nextCursor);
  const next = await readPhotoAlbums(db, b.token, {
    profileId: a.id,
    id: album.id,
    after: first.nextCursor
  });
  assert.equal(next.images.length, 1);
  assert.equal(next.nextCursor, null);
  assert.equal(
    new Set([...first.images, ...next.images].map((row) => row.id)).size,
    25
  );
  await denied(
    readPhotoAlbums(db, a.token, {
      profileId: a.id,
      id: album.id,
      after: first.nextCursor
    }),
    409
  );
  await save(a.token, album.id, ids.toReversed());
  await denied(
    readPhotoAlbums(db, b.token, {
      profileId: a.id,
      id: album.id,
      after: first.nextCursor
    }),
    409
  );
  await db.photoAlbum.createMany({
    data: Array.from({ length: 49 }, (_, i) => ({
      id: randomUUID(),
      ownerId: a.id,
      name: "Bounded fixture " + i
    }))
  });
  await denied(create(a.token), 409);
  assert.equal(
    (await readPhotoAlbums(db, a.token, { profileId: a.id })).albums.length,
    50
  );
  assert.equal(
    (await readPhotoAlbums(db, b.token, { profileId: a.id })).albums.length,
    1
  );
  await denied(
    photoAlbumCommand(
      db,
      a.token,
      m("save", {
        id: album.id,
        expectedVersion: 3,
        name: "Too many",
        photos: Array(101).fill(await ref(ids[0]))
      })
    ),
    400
  );
  assert.equal(store.puts, 100);
});

test("album export and reversible account lifecycle preserve ownership; concurrent reference/retirement cannot lose retained bytes", async () => {
  const a = await createPortalActor(db, "albumexport"),
    b = await createPortalActor(db, "albumoutside"),
    store = memoryStore(),
    data = await bytes();
  const photo = await uploadImage(
      db,
      a.token,
      upload(a.id, "PROFILE_PHOTO", { audience: "MEMBERS" }),
      data,
      store
    ),
    album = await create(a.token, { audience: "MEMBERS" });
  await save(a.token, album.id, [photo.id], { name: "Owned album export" });
  const secret = process.env.AUTH_RATE_LIMIT_SECRET!,
    proof = await prepareAccountExport(db, a.token, a.password, secret),
    archive = await downloadAccountExport(
      db,
      a.token,
      proof.authorization,
      secret
    ),
    serialized =
      typeof archive === "string" ? archive : JSON.stringify(archive);
  assert.ok(serialized.includes('"photoAlbums"'));
  assert.ok(serialized.includes("Owned album export"));
  assert.ok(serialized.includes(photo.id));
  assert.ok(!serialized.includes("storagePrefix"));
  await deactivateAccount(db, a.token, a.password, true);
  await denied(readPhotoAlbums(db, b.token, { profileId: a.id }), 404);
  await denied(readImage(db, b.token, photo.id, "thumb", store), 404);
  await reactivateAccount(db, a.email, a.password, true);
  const token = await loginAccount(
    db,
    a.email,
    a.password,
    "album reactivation fixture"
  );
  assert.equal(
    (await readPhotoAlbums(db, token, { profileId: a.id, id: album.id })).album
      ?.total,
    1
  );
  const race = await uploadImage(db, token, upload(a.id), data, store),
    empty = await create(token);
  const changes = await Promise.allSettled([
    save(token, empty.id, [race.id]),
    personalPhotoCommand(
      db,
      token,
      m("delete", { ...(await photoInput(race.id)), confirmed: true })
    )
  ]);
  assert.equal(
    changes.filter((r) => r.status === "fulfilled").length,
    1,
    "Only the reference or retirement may win"
  );
  const row = await db.mediaAsset.findUniqueOrThrow({ where: { id: race.id } }),
    refs = await db.photoAlbumEntry.count({ where: { assetId: race.id } });
  assert.equal(row.status === "READY", refs === 1);
  if (refs) {
    await denied(
      personalPhotoCommand(
        db,
        token,
        m("delete", { ...(await photoInput(race.id)), confirmed: true })
      ),
      409
    );
    await save(token, empty.id, []);
    await personalPhotoCommand(
      db,
      token,
      m("delete", { ...(await photoInput(race.id)), confirmed: true })
    );
  }
  await denied(save(token, empty.id, [race.id]), 409);
  const retained = await db.mediaAsset.findUniqueOrThrow({
    where: { id: photo.id }
  });
  await db.mediaGarbage.upsert({
    where: { storagePrefix: retained.storagePrefix },
    create: { storagePrefix: retained.storagePrefix, dueAt: new Date(0) },
    update: { dueAt: new Date(0) }
  });
  await collectImageGarbage(db, store);
  assert.ok((await readImage(db, b.token, photo.id, "large", store)).length);
  assert.equal(store.puts, 8);
});
