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
  listImages,
  uploadImage,
  readImage,
  removeImage,
  collectImageGarbage
} from "../lib/platform/media";
import {
  readPersonalPhotos,
  personalPhotoCommand
} from "../lib/platform/personal-photos";
import { postCommand } from "../lib/platform/post-commands";
import {
  readPostGallery,
  postGalleryCommand
} from "../lib/platform/post-gallery";
import {
  privateDraftPayload,
  postWorkspaceCommand,
  readPostWorkspace
} from "../lib/platform/post-workspace";
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
      assert.ok(!files.has(path), "Immutable file is never uploaded twice");
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
async function photoInput(assetId: string) {
  const row = await db.personalPhoto.findUniqueOrThrow({
    where: { assetId },
    include: { asset: true }
  });
  return {
    imageId: assetId,
    expectedVersion: row.version,
    imageVersion: row.asset.version
  };
}
async function due(prefix: string) {
  await db.mediaGarbage.upsert({
    where: { storagePrefix: prefix },
    create: { storagePrefix: prefix, dueAt: new Date(-1000) },
    update: { dueAt: new Date(-1000) }
  });
}

test("history retains both current purposes, exact upload retries reuse bytes, selecting/removing/deleting are distinct and cleanup cannot revive deleted history", async () => {
  const a = await createPortalActor(db, "history"),
    b = await createPortalActor(db, "reader"),
    store = memoryStore(),
    data = await bytes();
  for (const purpose of ["PROFILE_AVATAR", "PROFILE_COVER"]) {
    const initial = upload(a.id, purpose),
      first = await uploadImage(db, a.token, initial, data, store);
    const replacement = upload(a.id, purpose, { replacesId: first.id }),
      second = await uploadImage(db, a.token, replacement, data, store);
    assert.equal(
      (await listImages(db, a.token, purpose, a.id))[0].id,
      second.id
    );
    assert.ok((await readImage(db, b.token, first.id, "large", store)).length);
    assert.equal(
      (await uploadImage(db, a.token, initial, data, store)).id,
      first.id
    );
    assert.equal(
      (await listImages(db, a.token, purpose, a.id))[0].id,
      second.id,
      "Old upload acknowledgement never becomes current again"
    );
    const choose = m("select", {
      ...(await photoInput(first.id)),
      currentId: second.id,
      currentVersion: second.version
    });
    const result = await personalPhotoCommand(db, a.token, choose);
    assert.deepEqual(await personalPhotoCommand(db, a.token, choose), result);
    await denied(
      personalPhotoCommand(
        db,
        b.token,
        m("select", {
          ...(await photoInput(first.id)),
          currentId: first.id,
          currentVersion: 3
        })
      ),
      404
    );
    const current = (await listImages(db, a.token, purpose, a.id))[0];
    await denied(
      personalPhotoCommand(
        db,
        a.token,
        m("delete", { ...(await photoInput(current.id)), confirmed: true })
      ),
      409
    );
    await removeImage(db, a.token, current.id, current.version);
    await removeImage(db, a.token, current.id, current.version);
    assert.equal((await listImages(db, a.token, purpose, a.id)).length, 0);
    assert.ok(
      (await readImage(db, b.token, current.id, "thumb", store)).length
    );
    const row = await db.mediaAsset.findUniqueOrThrow({
      where: { id: current.id }
    });
    await due(row.storagePrefix);
    await collectImageGarbage(db, store, new Date(-100));
    assert.ok(
      store.files.has(row.storagePrefix + "/original.webp"),
      "READY retained image defeats even an erroneous due ledger record"
    );
    const deletion = m("delete", {
      ...(await photoInput(current.id)),
      confirmed: true
    });
    await personalPhotoCommand(db, a.token, deletion);
    await personalPhotoCommand(db, a.token, deletion);
    await denied(readImage(db, b.token, current.id, "thumb", store), 404);
    await collectImageGarbage(db, store, new Date(-100));
    assert.ok(!store.files.has(row.storagePrefix + "/original.webp"));
    await denied(
      personalPhotoCommand(
        db,
        a.token,
        m("select", {
          ...deletion,
          mutationId: randomUUID(),
          operation: "select",
          currentId: null,
          currentVersion: 0
        })
      ),
      404
    );
    await denied(uploadImage(db, a.token, initial, data, store), 409);
  }
  assert.equal(store.puts, 16);
  const library = await readPersonalPhotos(db, a.token, { profileId: a.id });
  assert.equal(library.total, 2);
  assert.ok(library.images.every((image) => !image.current));
});

test("standalone saves default private, audience changes survive retries and feature hiding, and a delivery cannot cross a concurrent privacy change", async () => {
  const a = await createPortalActor(db, "private"),
    b = await createPortalActor(db, "viewer"),
    store = memoryStore(),
    data = await bytes(),
    input = upload(a.id);
  const asset = await uploadImage(db, a.token, input, data, store);
  assert.equal(await db.platformPost.count({ where: { authorId: a.id } }), 0);
  assert.equal(
    (await readPersonalPhotos(db, b.token, { profileId: a.id })).total,
    0
  );
  for (const token of ["", b.token])
    for (const variant of ["thumb", "medium", "large", "original"])
      await denied(readImage(db, token, asset.id, variant, store), 404);
  await denied(
    personalPhotoCommand(
      db,
      a.token,
      m("audience", { ...(await photoInput(asset.id)), audience: "PUBLIC" })
    ),
    400
  );
  await personalPhotoCommand(
    db,
    a.token,
    m("audience", {
      ...(await photoInput(asset.id)),
      audience: "PUBLIC",
      confirmed: true
    })
  );
  assert.ok((await readImage(db, "", asset.id, "large", store)).length);
  await uploadImage(db, a.token, input, data, store);
  assert.equal(store.puts, 4);
  assert.equal(
    (await db.personalPhoto.findUniqueOrThrow({ where: { assetId: asset.id } }))
      .audience,
    "PUBLIC"
  );
  let entered!: () => void, release!: () => void;
  const started = new Promise<void>((resolve) => {
      entered = resolve;
    }),
    paused = new Promise<void>((resolve) => {
      release = resolve;
    });
  const reading = readImage(db, b.token, asset.id, "original", {
    ...store,
    async get(path) {
      entered();
      await paused;
      return store.get(path);
    }
  });
  await started;
  await personalPhotoCommand(
    db,
    a.token,
    m("audience", { ...(await photoInput(asset.id)), audience: "ONLY_ME" })
  );
  release();
  await denied(reading, 404);
  process.env.PERSONAL_PHOTO_LIBRARY_ENABLED = "false";
  try {
    await denied(readImage(db, b.token, asset.id, "thumb", store), 404);
    assert.ok((await readImage(db, a.token, asset.id, "thumb", store)).length);
  } finally {
    process.env.PERSONAL_PHOTO_LIBRARY_ENABLED = "true";
  }
  await personalPhotoCommand(
    db,
    a.token,
    m("audience", { ...(await photoInput(asset.id)), audience: "MEMBERS" })
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
  await denied(readImage(db, b.token, asset.id, "thumb", store), 404);
  await denied(readPersonalPhotos(db, b.token, { profileId: a.id }), 404);
});

test("personal source posts project once, church authorship stays in church, and withdrawal, narrowing, membership loss and hidden collection references do not create new grants", async () => {
  const f = await seedPortal(db),
    a = f.memberA,
    b = f.memberB,
    store = memoryStore(),
    data = await bytes();
  const own = await postCommand(db, a.token, {
    operation: "create",
    requestKey: randomUUID(),
    content: "Fictional personal photo source",
    audience: "PUBLIC",
    audienceChurchId: f.churchA.id
  });
  const personal = await uploadImage(
    db,
    a.token,
    upload(own.id, "POST_PHOTO"),
    data,
    store
  );
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
    content: "Fictional church source",
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
  const first = await readPersonalPhotos(db, b.token, { profileId: a.id });
  assert.equal(first.total, 1);
  assert.equal(first.images[0].sourcePostId, own.id);
  await personalPhotoCommand(
    db,
    a.token,
    m("hide", await photoInput(personal.id))
  );
  assert.equal(
    (await readPersonalPhotos(db, b.token, { profileId: a.id })).total,
    0
  );
  assert.equal((await readPostGallery(db, b.token, own.id)).images.length, 1);
  assert.ok((await readImage(db, "", personal.id, "large", store)).length);
  await personalPhotoCommand(
    db,
    a.token,
    m("restore", await photoInput(personal.id))
  );
  await postCommand(db, a.token, {
    operation: "edit",
    postId: own.id,
    expectedVersion: 2,
    audience: "CHURCH",
    confirmAudienceChange: true
  });
  assert.equal(
    (await readPersonalPhotos(db, b.token, { profileId: a.id })).total,
    0
  );
  await denied(readImage(db, "", personal.id, "thumb", store), 404);
  assert.equal(
    (await readPersonalPhotos(db, a.token, { profileId: a.id })).total,
    1
  );
  await db.churchConnection.updateMany({
    where: { userId: a.id, churchId: f.churchA.id },
    data: { state: "LEFT" }
  });
  assert.equal(
    (await readPersonalPhotos(db, a.token, { profileId: a.id })).total,
    0
  );
  await db.platformPost.update({
    where: { id: own.id },
    data: { status: "WITHDRAWN", withdrawnAt: new Date() }
  });
  await denied(readImage(db, a.token, personal.id, "original", store), 404);
  assert.equal(store.puts, 8);
});

test("saved photos publish through private drafts once with both reply modes; older snapshots, conflicts, deleted photos and revoked church membership fail closed", async () => {
  const f = await seedPortal(db),
    a = f.memberA,
    store = memoryStore(),
    data = await bytes();
  for (const replyAudience of ["VIEWERS", "CHURCH_MEMBERS"] as const) {
    const image = await uploadImage(
      db,
      a.token,
      upload(a.id, "PROFILE_PHOTO", {
        audience: "CHURCH",
        audienceChurchId: f.churchA.id
      }),
      data,
      store
    );
    const id = randomUUID(),
      payload = {
        content: "Saved photo publication",
        replyAudience,
        audience: "CHURCH",
        audienceChurchId: f.churchA.id,
        photos: [{ id: image.id, version: image.version }]
      };
    const save = m("save-draft", { id, expectedVersion: 0, payload });
    await postWorkspaceCommand(db, a.token, save);
    await postWorkspaceCommand(db, a.token, save);
    const read = await readPostWorkspace(db, a.token, { view: "draft", id });
    assert.ok(JSON.stringify(read).includes(image.id));
    assert.ok(JSON.stringify(read).includes(replyAudience));
    await denied(
      postWorkspaceCommand(db, a.token, {
        ...save,
        payload: { ...payload, photos: [] }
      }),
      409
    );
    await denied(
      postWorkspaceCommand(
        db,
        a.token,
        m("save-draft", { id, expectedVersion: 0, payload })
      ),
      409
    );
    const publish = m("publish-draft", { id, expectedVersion: 1 });
    const result = await postWorkspaceCommand(db, a.token, publish);
    assert.deepEqual(await postWorkspaceCommand(db, a.token, publish), result);
    const postId = (result as { postId: string }).postId;
    assert.equal(
      (await db.platformPost.findUniqueOrThrow({ where: { id: postId } }))
        .replyAudience,
      replyAudience
    );
    assert.equal(
      await db.postPhotoReference.count({ where: { assetId: image.id } }),
      1
    );
    assert.equal(
      (await readPostGallery(db, a.token, postId)).images[0].id,
      image.id
    );
    await denied(
      personalPhotoCommand(
        db,
        a.token,
        m("delete", { ...(await photoInput(image.id)), confirmed: true })
      ),
      409
    );
    const g = await readPostGallery(db, a.token, postId);
    await postGalleryCommand(
      db,
      a.token,
      m("remove-reference", {
        postId,
        expectedVersion: g.postVersion,
        imageId: image.id
      })
    );
    assert.equal((await readPostGallery(db, a.token, postId)).images.length, 0);
    assert.ok((await readImage(db, a.token, image.id, "large", store)).length);
  }
  assert.equal(store.puts, 8);
  assert.equal(privateDraftPayload({ content: "Legacy" }).replyAudience, null);
  const legacy = randomUUID();
  await postWorkspaceCommand(
    db,
    a.token,
    m("save-draft", {
      id: legacy,
      expectedVersion: 0,
      payload: { content: "Legacy" }
    })
  );
  await denied(
    postWorkspaceCommand(
      db,
      a.token,
      m("publish-draft", { id: legacy, expectedVersion: 1 })
    ),
    400
  );
  const privateImage = await uploadImage(
    db,
    a.token,
    upload(a.id),
    data,
    store
  );
  await denied(
    postCommand(db, a.token, {
      operation: "create",
      requestKey: randomUUID(),
      content: "No silent widening",
      audience: "PUBLIC",
      photos: [{ id: privateImage.id, version: 1 }]
    }),
    400
  );
  const churchImage = await uploadImage(
      db,
      a.token,
      upload(a.id, "PROFILE_PHOTO", {
        audience: "CHURCH",
        audienceChurchId: f.churchA.id
      }),
      data,
      store
    ),
    pending = randomUUID();
  await postWorkspaceCommand(
    db,
    a.token,
    m("save-draft", {
      id: pending,
      expectedVersion: 0,
      payload: {
        content: "Revocation",
        audience: "CHURCH",
        audienceChurchId: f.churchA.id,
        replyAudience: "CHURCH_MEMBERS",
        photos: [{ id: churchImage.id, version: 1 }]
      }
    })
  );
  await db.churchConnection.updateMany({
    where: { userId: a.id, churchId: f.churchA.id },
    data: { state: "LEFT" }
  });
  await denied(
    postWorkspaceCommand(
      db,
      a.token,
      m("publish-draft", { id: pending, expectedVersion: 1 })
    ),
    403
  );
  await denied(readImage(db, a.token, churchImage.id, "large", store), 404);
});

test("paginated permitted counts exceed a post's ten-photo limit and bind cursors to the viewer, collection and profile", async () => {
  const a = await createPortalActor(db, "pages"),
    b = await createPortalActor(db, "pagesview"),
    store = memoryStore(),
    data = await bytes();
  for (let i = 0; i < 26; i++)
    await uploadImage(
      db,
      a.token,
      upload(a.id, "PROFILE_PHOTO", {
        audience: i === 25 ? "ONLY_ME" : "MEMBERS",
        caption: "Fixture " + i
      }),
      data,
      store
    );
  const first = await readPersonalPhotos(db, b.token, { profileId: a.id });
  assert.equal(first.total, 25);
  assert.equal(first.images.length, 24);
  assert.ok(first.nextCursor);
  const next = await readPersonalPhotos(db, b.token, {
    profileId: a.id,
    after: first.nextCursor
  });
  assert.equal(next.images.length, 1);
  assert.equal(next.nextCursor, null);
  assert.ok(!first.images.some((image) => image.id === next.images[0].id));
  for (const [token, input] of [
    [a.token, { profileId: a.id }],
    [b.token, { profileId: a.id, view: "cover" }],
    [b.token, { profileId: b.id }]
  ] as const)
    await denied(
      readPersonalPhotos(db, token, { ...input, after: first.nextCursor }),
      400
    );
  assert.equal(
    (await readPersonalPhotos(db, a.token, { profileId: a.id })).total,
    26
  );
  const hidden = first.images[0];
  await personalPhotoCommand(
    db,
    a.token,
    m("hide", await photoInput(hidden.id))
  );
  assert.equal(
    (await readPersonalPhotos(db, b.token, { profileId: a.id })).total,
    24
  );
  assert.equal(
    (await readPersonalPhotos(db, a.token, { profileId: a.id, view: "hidden" }))
      .images[0].id,
    hidden.id
  );
});

test("failed files and two-tab replacement conflicts leave current history intact, and cleanup cannot attach an expired attempt", async () => {
  const a = await createPortalActor(db, "races"),
    store = memoryStore(),
    data = await bytes();
  const first = await uploadImage(
    db,
    a.token,
    upload(a.id, "PROFILE_AVATAR"),
    data,
    store
  );
  const broken = upload(a.id, "PROFILE_AVATAR", { replacesId: first.id });
  await assert.rejects(
    uploadImage(db, a.token, broken, data, {
      ...store,
      async put() {
        throw Error("provider fixture failure");
      }
    })
  );
  assert.equal(
    (await listImages(db, a.token, "PROFILE_AVATAR", a.id))[0].id,
    first.id
  );
  assert.equal(
    (await readPersonalPhotos(db, a.token, { profileId: a.id })).total,
    1
  );
  const race = await Promise.allSettled(
    [0, 1].map(() =>
      uploadImage(
        db,
        a.token,
        upload(a.id, "PROFILE_AVATAR", { replacesId: first.id }),
        data,
        store
      )
    )
  );
  assert.equal(
    race.filter((result) => result.status === "fulfilled").length,
    1
  );
  const current = (await listImages(db, a.token, "PROFILE_AVATAR", a.id))[0];
  assert.equal(
    (await readPersonalPhotos(db, a.token, { profileId: a.id })).total,
    2
  );
  const choice = {
    ...(await photoInput(first.id)),
    currentId: current.id,
    currentVersion: current.version
  };
  const selecting = await Promise.allSettled(
    [0, 1].map(() => personalPhotoCommand(db, a.token, m("select", choice)))
  );
  assert.equal(
    selecting.filter((result) => result.status === "fulfilled").length,
    1
  );
  const retry = upload(a.id);
  let entered!: () => void, release!: () => void;
  const started = new Promise<void>((resolve) => {
      entered = resolve;
    }),
    paused = new Promise<void>((resolve) => {
      release = resolve;
    });
  let once = true;
  const pending = uploadImage(db, a.token, retry, data, {
    ...store,
    async put(path, value) {
      await store.put(path, value);
      if (once) {
        once = false;
        entered();
        await paused;
      }
    }
  });
  await started;
  const staged = await db.mediaAsset.findUniqueOrThrow({
    where: {
      uploaderId_requestKey: { uploaderId: a.id, requestKey: retry.requestKey }
    }
  });
  await db.mediaAsset.update({
    where: { id: staged.id },
    data: { leaseUntil: new Date(-1000) }
  });
  await due(staged.storagePrefix);
  await collectImageGarbage(db, store, new Date(-100));
  release();
  await denied(pending, 409);
  assert.ok(
    await db.mediaGarbage.findUnique({
      where: { storagePrefix: staged.storagePrefix }
    }),
    "Late failure renews its cleanup ledger even after a concurrent collector"
  );
  // A provider can complete late writes after cancellation. The durable ledger
  // must still collect them; retry uses a different immutable attempt prefix.
  const saved = await uploadImage(db, a.token, retry, data, store);
  const restored = await db.mediaAsset.findUniqueOrThrow({
    where: { id: saved.id }
  });
  assert.notEqual(restored.storagePrefix, staged.storagePrefix);
  assert.equal(saved.id, staged.id);
  assert.equal(
    await db.personalPhoto.count({ where: { assetId: saved.id } }),
    1
  );
  await due(staged.storagePrefix);
  await collectImageGarbage(db, store, new Date(-100));
  assert.ok(
    ![...store.files.keys()].some((path) =>
      path.startsWith(staged.storagePrefix + "/")
    )
  );
  assert.ok((await readImage(db, a.token, saved.id, "thumb", store)).length);
});

test("exports include owned membership and references without church uploader data; deactivation hides media and legitimate reactivation preserves history", async () => {
  const a = await createPortalActor(db, "exportpics"),
    b = await createPortalActor(db, "outsider"),
    store = memoryStore(),
    data = await bytes();
  const image = await uploadImage(
    db,
    a.token,
    upload(a.id, "PROFILE_PHOTO", { audience: "PUBLIC" }),
    data,
    store
  );
  const post = await postCommand(db, a.token, {
    operation: "create",
    requestKey: randomUUID(),
    content: "Export photo fixture",
    photos: [{ id: image.id, version: 1 }]
  });
  const secret = process.env.AUTH_RATE_LIMIT_SECRET!,
    proof = await prepareAccountExport(db, a.token, a.password, secret);
  const archive = await downloadAccountExport(
    db,
    a.token,
    proof.authorization,
    secret
  );
  const serialized =
    typeof archive === "string" ? archive : JSON.stringify(archive);
  assert.ok(serialized.includes(image.id));
  assert.ok(serialized.includes(post.id));
  assert.ok(serialized.includes("personalPhoto"));
  assert.ok(serialized.includes("photoReferences"));
  assert.ok(!serialized.includes("storagePrefix"));
  await deactivateAccount(db, a.token, a.password, true);
  await denied(readImage(db, b.token, image.id, "thumb", store), 404);
  await denied(readImage(db, "", image.id, "original", store), 404);
  assert.equal(
    (await db.mediaAsset.findUniqueOrThrow({ where: { id: image.id } })).status,
    "READY"
  );
  await reactivateAccount(db, a.email, a.password, true);
  const token = await loginAccount(
    db,
    a.email,
    a.password,
    "photo reactivation fixture"
  );
  assert.equal(
    (await readPersonalPhotos(db, token, { profileId: a.id })).total,
    1
  );
  assert.ok((await readImage(db, b.token, image.id, "large", store)).length);
  assert.equal(store.puts, 4);
});

test("failed expired post uploads do not permanently block ordering of saved photos", async () => {
  const a = await createPortalActor(db, "failedpost"),
    store = memoryStore(),
    data = await bytes();
  const post = await postCommand(db, a.token, {
    operation: "create",
    requestKey: randomUUID(),
    content: "Fictional failed upload"
  });
  const image = await uploadImage(
    db,
    a.token,
    upload(post.id, "POST_PHOTO"),
    data,
    store
  );
  await assert.rejects(
    uploadImage(db, a.token, upload(post.id, "POST_PHOTO"), data, {
      ...store,
      async put() {
        throw Error("fixture provider failure");
      }
    })
  );
  const gallery = await readPostGallery(db, a.token, post.id);
  assert.equal(gallery.pendingUploads, 0);
  await postGalleryCommand(
    db,
    a.token,
    m("reorder", {
      postId: post.id,
      expectedVersion: gallery.postVersion,
      images: [{ id: image.id, version: image.version }]
    })
  );
  assert.equal((await readPostGallery(db, a.token, post.id)).images.length, 1);
});
