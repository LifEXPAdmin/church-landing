import test, { before, after, afterEach } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { PrismaClient } from "@prisma/client";
import { assertPortalTestDatabase, createPortalActor } from "./seed-portal";
import { handleNativeImageRequest } from "../lib/platform/native-media-boundary";
import { nativeImageEnvelope } from "../lib/platform/native-media-contracts";
import type { ImageStorage } from "../lib/platform/media-storage";
import { hashSessionToken } from "../lib/platform/auth";
const db = new PrismaClient();
const prior = process.env.NATIVE_API_DISABLED_FEATURES;
before(() => assertPortalTestDatabase(db));
afterEach(() => {
  if (prior === undefined) delete process.env.NATIVE_API_DISABLED_FEATURES;
  else process.env.NATIVE_API_DISABLED_FEATURES = prior;
});
after(() => db.$disconnect());
type Actor = { id: string; token: string };
function request(
  actor: Actor,
  method: string,
  body?: Uint8Array | string,
  extra: Record<string, string> = {}
) {
  return new Request(process.env.ACCOUNT_ORIGIN + "/api/platform/v1/images", {
    method,
    headers: {
      Authorization: "Bearer " + actor.token,
      "X-Expected-Account": actor.id,
      ...extra
    },
    ...(body === undefined
      ? {}
      : { body: typeof body === "string" ? body : new Uint8Array(body) })
  });
}
const details = (id: string) => ({
  purpose: "PROFILE_AVATAR",
  targetId: id,
  requestKey: randomUUID(),
  replacesId: null,
  expectedVersion: null,
  caption: "",
  alt: "Fictional image",
  crop: null
});
const picture = () =>
  sharp({ create: { width: 40, height: 40, channels: 3, background: "blue" } })
    .png()
    .toBuffer();
function storage() {
  const files = new Map<string, Buffer>();
  let puts = 0;
  const store: ImageStorage = {
    async put(path, bytes) {
      puts++;
      files.set(path, bytes);
    },
    async get(path) {
      return files.get(path) ?? null;
    },
    async delete(paths) {
      paths.forEach((p) => files.delete(p));
    }
  };
  return { store, puts: () => puts };
}
const upload = (
  actor: Actor,
  input: object,
  bytes: Uint8Array,
  store: ImageStorage,
  extra: Record<string, string> = {}
) =>
  handleNativeImageRequest(
    db,
    request(actor, "POST", bytes, {
      "Content-Type": "application/octet-stream",
      "X-Image-Details": encodeURIComponent(JSON.stringify(input)),
      ...extra
    }),
    undefined,
    store
  );

test("completed upload and uncertain removal survive pause and rollback without duplicate assets or provider writes", async () => {
  delete process.env.NATIVE_API_DISABLED_FEATURES;
  const actor = await createPortalActor(db, "policymedia"),
    other = await createPortalActor(db, "policyother");
  const bytes = await picture(),
    input = details(actor.id),
    { store, puts } = storage();
  const accepted = await upload(actor, input, bytes, store);
  assert.equal(accepted.status, 200);
  const image = nativeImageEnvelope("upload").parse(await accepted.json()).data
    .image;
  // The client has lost this response and retains the exact original intent.
  const row = await db.mediaAsset.findUniqueOrThrow({
    where: { id: image.id }
  });
  const writes = puts(),
    budget = await db.platformAuthLimit.findMany({ orderBy: { key: "asc" } });
  process.env.NATIVE_API_DISABLED_FEATURES = "media.images.upload";
  assert.equal((await upload(actor, input, bytes, store)).status, 503);
  assert.deepEqual(
    await db.mediaAsset.findUniqueOrThrow({ where: { id: image.id } }),
    row
  );
  assert.deepEqual(
    await db.platformAuthLimit.findMany({ orderBy: { key: "asc" } }),
    budget
  );
  assert.equal(puts(), writes);
  delete process.env.NATIVE_API_DISABLED_FEATURES;
  const retry = await upload(actor, input, bytes, store, {
    "X-API-Version": "1"
  });
  assert.equal(retry.status, 200);
  assert.equal(
    nativeImageEnvelope("upload").parse(await retry.json()).data.image.id,
    image.id
  );
  assert.equal(puts(), writes);
  const wrongOwner = await upload(actor, input, bytes, store, {
    "X-Expected-Account": other.id
  });
  assert.equal(wrongOwner.status, 401);
  assert.equal((await wrongOwner.json()).error.code, "account_changed");
  assert.equal(puts(), writes);
  const remove = (expectedVersion: number) =>
    handleNativeImageRequest(
      db,
      request(
        actor,
        "DELETE",
        JSON.stringify({ id: image.id, expectedVersion }),
        { "Content-Type": "application/json" }
      )
    );
  assert.equal((await remove(image.version + 1)).status, 409);
  assert.equal((await remove(image.version)).status, 200);
  const retired = await db.mediaAsset.findUniqueOrThrow({
    where: { id: image.id }
  });
  const garbage = await db.mediaGarbage.findUniqueOrThrow({
    where: { storagePrefix: retired.storagePrefix }
  });
  process.env.NATIVE_API_DISABLED_FEATURES = "media.images.remove";
  assert.equal((await remove(image.version)).status, 503);
  assert.deepEqual(
    await db.mediaAsset.findUniqueOrThrow({ where: { id: image.id } }),
    retired
  );
  assert.deepEqual(
    await db.mediaGarbage.findUniqueOrThrow({
      where: { storagePrefix: retired.storagePrefix }
    }),
    garbage
  );
  delete process.env.NATIVE_API_DISABLED_FEATURES;
  assert.equal((await remove(image.version)).status, 200);
  assert.equal(puts(), writes);
  await db.platformSession.deleteMany({
    where: { tokenHash: hashSessionToken(actor.token) }
  });
  assert.equal((await remove(image.version)).status, 401);
});

test("an already admitted upload can finish when configuration changes, while later calls pause", async () => {
  delete process.env.NATIVE_API_DISABLED_FEATURES;
  const actor = await createPortalActor(db, "policyflight"),
    bytes = await picture(),
    input = details(actor.id),
    base = storage();
  let paused = false;
  const store: ImageStorage = {
    ...base.store,
    async put(path, bytes, signal) {
      await base.store.put(path, bytes, signal);
      if (!paused) {
        paused = true;
        process.env.NATIVE_API_DISABLED_FEATURES = "media.images.upload";
      }
    }
  };
  const response = await upload(actor, input, bytes, store);
  assert.equal(response.status, 200);
  const image = nativeImageEnvelope("upload").parse(await response.json()).data
    .image;
  assert.equal(
    (await db.mediaAsset.findUniqueOrThrow({ where: { id: image.id } })).status,
    "READY"
  );
  assert.equal((await upload(actor, input, bytes, store)).status, 503);
  assert.equal(base.puts(), 4);
  delete process.env.NATIVE_API_DISABLED_FEATURES;
  const retry = await upload(actor, input, bytes, store);
  assert.equal(retry.status, 200);
  assert.equal(
    nativeImageEnvelope("upload").parse(await retry.json()).data.image.id,
    image.id
  );
  assert.equal(base.puts(), 4);
});
