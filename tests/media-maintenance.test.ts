import test, { before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import sharp from "sharp";
import { assertPortalTestDatabase, createPortalActor } from "./seed-portal";
import { handleImageMaintenance } from "../lib/platform/media-maintenance";
import {
  collectImageGarbage,
  uploadImage,
  readImage
} from "../lib/platform/media";
import {
  imagesAvailable,
  privateImageStorage,
  type ImageStorage
} from "../lib/platform/media-storage";

const db = new PrismaClient();
const secret = randomBytes(32).toString("hex");
const originalSecret = process.env.CRON_SECRET;
before(() => assertPortalTestDatabase(db));
beforeEach(async () => {
  await assertPortalTestDatabase(db);
  await db.mediaGarbage.deleteMany();
  process.env.CRON_SECRET = secret;
});
after(async () => {
  if (originalSecret === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = originalSecret;
  await db.$disconnect();
});
const request = (authorization = `Bearer ${secret}`, method = "GET") =>
  new Request("https://example.test/api/maintenance/images", {
    method,
    headers: { authorization, cookie: "church_platform_session=not-authority" }
  });
function memoryStore() {
  const files = new Map<string, Buffer>();
  return {
    files,
    async put(path: string, bytes: Buffer) {
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
const prefix = () => "images/" + randomUUID();

test("maintenance fails closed before storage access and requires its secret, not an account cookie", async () => {
  let opened = false;
  const storage = () => {
    opened = true;
    return memoryStore();
  };
  for (const value of [
    "",
    "Bearer undefined",
    "Bearer " + "x".repeat(secret.length),
    secret
  ]) {
    const response = await handleImageMaintenance(db, request(value), storage);
    assert.equal(response.status, 401);
    assert.match(response.headers.get("cache-control")!, /no-store/);
  }
  delete process.env.CRON_SECRET;
  assert.equal(
    (await handleImageMaintenance(db, request(), storage)).status,
    401
  );
  process.env.CRON_SECRET = "short";
  assert.equal(
    (await handleImageMaintenance(db, request("Bearer short"), storage)).status,
    401
  );
  process.env.CRON_SECRET = secret;
  assert.equal(
    (await handleImageMaintenance(db, request(undefined, "POST"), storage))
      .status,
    405
  );
  assert.equal(opened, false);
  assert.equal(
    (await handleImageMaintenance(db, request(), storage)).status,
    200
  );
  assert.equal(opened, true);
});

test("maintenance uses the existing 20-prefix bound, respects grace and is idempotent under duplicate calls", async () => {
  const store = memoryStore();
  const due = Array.from({ length: 25 }, prefix),
    future = prefix();
  await db.mediaGarbage.createMany({
    data: [
      ...due.map((storagePrefix) => ({ storagePrefix, dueAt: new Date(0) })),
      { storagePrefix: future, dueAt: new Date(Date.now() + 86400000) }
    ]
  });
  for (const p of [...due, future])
    for (const v of ["original", "large", "medium", "thumb"])
      store.files.set(`${p}/${v}.webp`, Buffer.from("fixture"));
  const first = await handleImageMaintenance(db, request(), () => store);
  assert.deepEqual(await first.json(), { ok: true, removed: 20 });
  assert.equal(await db.mediaGarbage.count(), 6);
  const duplicate = await Promise.all([
    collectImageGarbage(db, store),
    collectImageGarbage(db, store)
  ]);
  assert.equal(
    duplicate.reduce((sum, result) => sum + result.removed, 0),
    5
  );
  assert.equal(await db.mediaGarbage.count(), 1);
  assert.equal(store.files.size, 4);
  assert.ok([...store.files.keys()].every((k) => k.startsWith(future + "/")));
  assert.deepEqual(await collectImageGarbage(db, store), { removed: 0 });
});

test("provider failure and cancellation retain durable work and return only a safe failure", async () => {
  const p = prefix(),
    store = memoryStore();
  await db.mediaGarbage.create({
    data: { storagePrefix: p, dueAt: new Date(0) }
  });
  const response = await handleImageMaintenance(db, request(), () => ({
    ...store,
    async delete() {
      throw Error("private provider detail " + p);
    }
  }));
  assert.equal(response.status, 503);
  assert.ok(!(await response.text()).includes(p));
  assert.equal(await db.mediaGarbage.count(), 1);
  const controller = new AbortController();
  const aborted = await handleImageMaintenance(
    db,
    request(),
    () => ({
      ...store,
      async delete(paths, signal) {
        await store.delete(paths);
        controller.abort();
        assert.equal(signal.aborted, true);
      }
    }),
    controller.signal
  );
  assert.equal(aborted.status, 503);
  assert.equal(await db.mediaGarbage.count(), 1);
  assert.deepEqual(await collectImageGarbage(db, store), { removed: 1 });
  assert.equal(await db.mediaGarbage.count(), 0);
});

test("cleanup cannot delete a ready image or the new prefix of an upload retried during provider deletion", async () => {
  const owner = await createPortalActor(db, "maintenance");
  const store = memoryStore();
  const input = {
    purpose: "PROFILE_AVATAR",
    targetId: owner.id,
    requestKey: randomUUID()
  };
  const bytes = await sharp({
    create: { width: 16, height: 16, channels: 3, background: "blue" }
  })
    .png()
    .toBuffer();
  await assert.rejects(
    uploadImage(db, owner.token, input, bytes, {
      ...store,
      async put(path, data) {
        await store.put(path, data);
        throw Error("interrupted fixture");
      }
    }),
    /interrupted/
  );
  const pending = await db.mediaAsset.findUniqueOrThrow({
    where: {
      uploaderId_requestKey: {
        uploaderId: owner.id,
        requestKey: input.requestKey
      }
    }
  });
  await db.mediaGarbage.update({
    where: { storagePrefix: pending.storagePrefix },
    data: { dueAt: new Date(0) }
  });
  await collectImageGarbage(db, {
    ...store,
    async delete(paths) {
      await uploadImage(db, owner.token, input, bytes, store);
      await store.delete(paths);
    }
  });
  const ready = await db.mediaAsset.findUniqueOrThrow({
    where: { id: pending.id }
  });
  assert.equal(ready.status, "READY");
  assert.notEqual(ready.storagePrefix, pending.storagePrefix);
  assert.equal(store.files.size, 4);
  assert.ok(
    (await readImage(db, owner.token, ready.id, "thumb", store)).length
  );
  await db.mediaGarbage.create({
    data: { storagePrefix: ready.storagePrefix, dueAt: new Date(0) }
  });
  assert.deepEqual(await collectImageGarbage(db, store), { removed: 0 });
  assert.equal(store.files.size, 4);
});

test("private maintenance transport remains configured independently of the public upload switch", () => {
  const prior = {
    mode: process.env.MEDIA_STORAGE_MODE,
    token: process.env.BLOB_READ_WRITE_TOKEN
  };
  try {
    delete process.env.MEDIA_STORAGE_MODE;
    process.env.BLOB_READ_WRITE_TOKEN = "fixture-configuration-only-no-network";
    assert.equal(imagesAvailable(), false);
    assert.equal(typeof privateImageStorage().delete, "function");
  } finally {
    if (prior.mode === undefined) delete process.env.MEDIA_STORAGE_MODE;
    else process.env.MEDIA_STORAGE_MODE = prior.mode;
    if (prior.token === undefined) delete process.env.BLOB_READ_WRITE_TOKEN;
    else process.env.BLOB_READ_WRITE_TOKEN = prior.token;
  }
});
