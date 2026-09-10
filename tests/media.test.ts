import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { PrismaClient } from "@prisma/client";
import { assertPortalTestDatabase } from "./seed-portal";
import { seedParticipation } from "./seed-post-participation";
import {
  listImages,
  uploadImage,
  readImage,
  removeImage,
  collectImageGarbage
} from "../lib/platform/media";
import { portalCommand } from "../lib/platform/portal";
import { postCommand } from "../lib/platform/post-commands";
import type { ImageStorage } from "../lib/platform/media-storage";
const db = new PrismaClient();
before(() => assertPortalTestDatabase(db));
after(() => db.$disconnect());
function memoryStore() {
  const files = new Map<string, Buffer>();
  return {
    files,
    async put(path: string, bytes: Buffer) {
      if (files.has(path)) throw new Error("Duplicate immutable object");
      files.set(path, bytes);
    },
    async get(path: string) {
      return files.get(path) ?? null;
    },
    async delete(paths: string[]) {
      for (const path of paths) files.delete(path);
    }
  } satisfies ImageStorage & { files: Map<string, Buffer> };
}
const fixtureImage = () =>
  sharp({ create: { width: 100, height: 60, channels: 3, background: "blue" } })
    .png()
    .toBuffer();
const photo = (id: string) => ({
  purpose: "POST_PHOTO",
  targetId: id,
  requestKey: randomUUID(),
  caption: "Fictional photo",
  alt: "Blue fixture"
});
test("profile originals, thumbnails and listings require an account; public post authors do not expose media", async () => {
  const f = await seedParticipation(db),
    store = memoryStore(),
    bytes = await fixtureImage();
  const input = { ...photo(f.ada.id), purpose: "PROFILE_AVATAR" };
  const uploaded = await uploadImage(db, f.ada.token, input, bytes, store);
  assert.equal(
    (await uploadImage(db, f.ada.token, input, bytes, store)).id,
    uploaded.id
  );
  assert.equal(store.files.size, 4);
  for (const variant of ["original", "large", "medium", "thumb"]) {
    await assert.rejects(
      readImage(db, "", uploaded.id, variant, store),
      /unavailable/
    );
    assert.ok(
      (await readImage(db, f.blake.token, uploaded.id, variant, store)).length
    );
  }
  await assert.rejects(
    listImages(db, "", "PROFILE_AVATAR", f.ada.id),
    /unavailable/
  );
  await assert.rejects(
    uploadImage(
      db,
      f.blake.token,
      { ...input, requestKey: randomUUID() },
      bytes,
      store
    ),
    /cannot change/
  );
  await db.platformUser.update({
    where: { id: f.ada.id },
    data: { deactivatedAt: new Date() }
  });
  await assert.rejects(
    readImage(db, f.blake.token, uploaded.id, "thumb", store),
    /unavailable/
  );
});
test("church post media follows current membership, event audience and withdrawal for every derivative", async () => {
  const f = await seedParticipation(db),
    store = memoryStore();
  const uploaded = await uploadImage(
    db,
    f.ada.token,
    photo(f.post.id),
    await fixtureImage(),
    store
  );
  for (const variant of ["original", "large", "medium", "thumb"]) {
    assert.ok(
      (await readImage(db, f.lee.token, uploaded.id, variant, store)).length
    );
    for (const token of ["", f.blake.token])
      await assert.rejects(
        readImage(db, token, uploaded.id, variant, store),
        /unavailable/
      );
  }
  await db.churchConnection.updateMany({
    where: { userId: f.lee.id, churchId: f.churchA.id },
    data: { state: "LEFT" }
  });
  await assert.rejects(
    readImage(db, f.lee.token, uploaded.id, "original", store),
    /unavailable/
  );
  await postCommand(db, f.ada.token, {
    operation: "withdraw",
    postId: f.post.id,
    expectedVersion: 2,
    confirmed: true
  });
  await assert.rejects(
    readImage(db, f.ada.token, uploaded.id, "thumb", store),
    /unavailable/
  );
});
test("church identity needs the actual profile grant; unlisted churches keep images inside the church", async () => {
  const f = await seedParticipation(db),
    store = memoryStore(),
    input = { ...photo(f.churchA.id), purpose: "CHURCH_LOGO" },
    bytes = await fixtureImage();
  await db.church.update({
    where: { id: f.churchA.id },
    data: { communityListed: false }
  });
  await assert.rejects(
    uploadImage(db, f.ada.token, input, bytes, store),
    /cannot change/
  );
  await portalCommand(db, f.operator.token, {
    operation: "grant",
    churchId: f.churchA.id,
    userId: f.ada.id,
    capability: "MANAGE_CHURCH_PROFILE",
    expectedVersion: 0
  });
  const uploaded = await uploadImage(db, f.ada.token, input, bytes, store);
  assert.ok(
    (await readImage(db, f.lee.token, uploaded.id, "thumb", store)).length
  );
  await assert.rejects(
    readImage(db, "", uploaded.id, "thumb", store),
    /unavailable/
  );
  await db.church.update({
    where: { id: f.churchA.id },
    data: { communityListed: true }
  });
  assert.ok((await readImage(db, "", uploaded.id, "thumb", store)).length);
  await db.churchCapabilityGrant.updateMany({
    where: { userId: f.ada.id, capability: "MANAGE_CHURCH_PROFILE" },
    data: { revokedAt: new Date() }
  });
  await assert.rejects(
    removeImage(db, f.ada.token, uploaded.id, 1),
    /cannot change/
  );
});
test("failed replacement preserves old image; retry stays one asset and removal invalidates all sizes", async () => {
  const f = await seedParticipation(db),
    store = memoryStore(),
    bytes = await fixtureImage();
  const target = { ...photo(f.ada.id), purpose: "PROFILE_COVER" };
  const old = await uploadImage(db, f.ada.token, target, bytes, store);
  const replacement = {
    ...target,
    requestKey: randomUUID(),
    replacesId: old.id
  };
  let writes = 0;
  const failure = {
    ...store,
    async put(path: string, b: Buffer) {
      await store.put(path, b);
      if (++writes === 2) throw new Error("Fictional lost storage reply");
    }
  };
  await assert.rejects(
    uploadImage(db, f.ada.token, replacement, bytes, failure),
    /lost storage reply/
  );
  assert.equal(
    (await listImages(db, f.ada.token, target.purpose, target.targetId))[0].id,
    old.id
  );
  const pending = await db.mediaAsset.findUniqueOrThrow({
    where: {
      uploaderId_requestKey: {
        uploaderId: f.ada.id,
        requestKey: replacement.requestKey
      }
    }
  });
  await assert.rejects(
    uploadImage(db, f.ada.token, replacement, Buffer.from("different"), store),
    /another image/
  );
  const updated = await uploadImage(db, f.ada.token, replacement, bytes, store);
  assert.equal(updated.id, pending.id);
  assert.equal(
    (await uploadImage(db, f.ada.token, replacement, bytes, store)).id,
    updated.id
  );
  await assert.rejects(
    readImage(db, f.ada.token, old.id, "original", store),
    /unavailable/
  );
  await assert.rejects(removeImage(db, f.ada.token, updated.id, 9), /changed/);
  await removeImage(db, f.ada.token, updated.id, 1);
  await removeImage(db, f.ada.token, updated.id, 1);
  for (const variant of ["original", "large", "medium", "thumb"])
    await assert.rejects(
      readImage(db, f.ada.token, updated.id, variant, store),
      /unavailable/
    );
  await assert.rejects(
    uploadImage(db, f.ada.token, replacement, bytes, store),
    /removed/
  );
  await db.mediaGarbage.updateMany({
    where: {
      storagePrefix: {
        in: [...store.files.keys()].map((k) =>
          k.split("/").slice(0, 2).join("/")
        )
      }
    },
    data: { dueAt: new Date(0) }
  });
  await collectImageGarbage(db, store);
  assert.equal(store.files.size, 0);
  await collectImageGarbage(db, store);
});
test("a storage read cannot finish after membership or session revocation; upload authority is rechecked after storage", async () => {
  const f = await seedParticipation(db),
    store = memoryStore(),
    bytes = await fixtureImage();
  const uploaded = await uploadImage(
    db,
    f.ada.token,
    photo(f.post.id),
    bytes,
    store
  );
  const revokedRead = {
    ...store,
    async get(path: string) {
      await db.churchConnection.updateMany({
        where: { userId: f.lee.id, churchId: f.churchA.id },
        data: { state: "REMOVED" }
      });
      return store.get(path);
    }
  };
  await assert.rejects(
    readImage(db, f.lee.token, uploaded.id, "thumb", revokedRead),
    /unavailable/
  );
  let revoked = false;
  const revokedWrite = {
    ...store,
    async put(path: string, b: Buffer) {
      await store.put(path, b);
      if (!revoked) {
        revoked = true;
        await db.churchCapabilityGrant.updateMany({
          where: { userId: f.ada.id, capability: "PUBLISH_CHURCH_POSTS" },
          data: { revokedAt: new Date() }
        });
      }
    }
  };
  await assert.rejects(
    uploadImage(db, f.ada.token, photo(f.post.id), bytes, revokedWrite),
    /cannot change/
  );
  assert.equal(
    await db.mediaAsset.count({
      where: { postId: f.post.id, status: "READY" }
    }),
    1
  );
});
test("orphan cleanup survives deletion failure and never deletes a currently attached prefix", async () => {
  const f = await seedParticipation(db),
    store = memoryStore(),
    bytes = await fixtureImage();
  const uploaded = await uploadImage(
    db,
    f.ada.token,
    photo(f.post.id),
    bytes,
    store
  );
  const ready = await db.mediaAsset.findUniqueOrThrow({
    where: { id: uploaded.id }
  });
  await db.mediaGarbage.create({
    data: { storagePrefix: ready.storagePrefix, dueAt: new Date(0) }
  });
  const pendingInput = photo(f.post.id);
  await assert.rejects(
    uploadImage(db, f.ada.token, pendingInput, bytes, {
      ...store,
      async put(path, data) {
        await store.put(path, data);
        throw new Error("Interrupted fixture upload");
      }
    }),
    /Interrupted/
  );
  const pending = await db.mediaAsset.findUniqueOrThrow({
    where: {
      uploaderId_requestKey: {
        uploaderId: f.ada.id,
        requestKey: pendingInput.requestKey
      }
    }
  });
  await db.mediaGarbage.update({
    where: { storagePrefix: pending.storagePrefix },
    data: { dueAt: new Date(0) }
  });
  await assert.rejects(
    collectImageGarbage(db, {
      ...store,
      async delete() {
        throw new Error("Fictional delete outage");
      }
    }),
    /delete outage/
  );
  assert.ok(
    await db.mediaGarbage.findUnique({
      where: { storagePrefix: pending.storagePrefix }
    })
  );
  await collectImageGarbage(db, store);
  assert.ok(
    [...store.files.keys()].every((k) =>
      k.startsWith(ready.storagePrefix + "/")
    )
  );
  assert.equal(store.files.size, 4);
  assert.ok(
    (await readImage(db, f.lee.token, uploaded.id, "thumb", store)).length
  );
  await db.mediaGarbage.delete({
    where: { storagePrefix: ready.storagePrefix }
  });
});
test("ten concurrent photos reserve ten slots and duplicate concurrent retries never write a second image", async () => {
  const f = await seedParticipation(db),
    store = memoryStore(),
    bytes = await fixtureImage();
  const inputs = Array.from({ length: 11 }, () => photo(f.post.id));
  const results = await Promise.allSettled(
    inputs.map((input) => uploadImage(db, f.ada.token, input, bytes, store))
  );
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 10);
  assert.equal(
    await db.mediaAsset.count({
      where: { postId: f.post.id, status: "READY" }
    }),
    10
  );
  assert.equal(
    (await listImages(db, f.lee.token, "POST_PHOTO", f.post.id)).length,
    10
  );
  const another = { ...photo(f.ada.id), purpose: "PROFILE_AVATAR" };
  const repeated = await Promise.allSettled([
    uploadImage(db, f.ada.token, another, bytes, store),
    uploadImage(db, f.ada.token, another, bytes, store)
  ]);
  assert.ok(repeated.some((r) => r.status === "fulfilled"));
  assert.equal(
    await db.mediaAsset.count({
      where: { uploaderId: f.ada.id, requestKey: another.requestKey }
    }),
    1
  );
});
