import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { PrismaClient } from "@prisma/client";
import { assertPortalTestDatabase, createPortalActor } from "./seed-portal";
import { uploadImage } from "../lib/platform/media";
import { readAvatar } from "../lib/platform/avatar";
import { handleAvatarDelivery } from "../lib/platform/media-boundary";
import type { ImageStorage } from "../lib/platform/media-storage";
const db = new PrismaClient();
before(() => assertPortalTestDatabase(db));
after(() => db.$disconnect());
async function fixture() {
  const owner = await createPortalActor(db, "avatarowner");
  const reader = await createPortalActor(db, "avatarreader");
  const files = new Map<string, Buffer>();
  const store: ImageStorage = {
    async put(path, bytes) {
      files.set(path, bytes);
    },
    async get(path) {
      return files.get(path) ?? null;
    },
    async delete(paths) {
      for (const path of paths) files.delete(path);
    }
  };
  const bytes = await sharp({
    create: { width: 80, height: 80, channels: 3, background: "orange" }
  })
    .png()
    .toBuffer();
  const input = {
    purpose: "PROFILE_AVATAR",
    targetId: owner.id,
    requestKey: randomUUID()
  };
  const image = await uploadImage(db, owner.token, input, bytes, store);
  const read = (storage = store) =>
    readAvatar(db, reader.token, owner.id, reader.id, storage);
  return { owner, reader, store, bytes, input, image, read };
}
test("avatar delivery binds the expected account, serves only private thumbnail bytes, and rejects guests/mismatch", async () => {
  const f = await fixture();
  const request = (token: string, expected?: string) =>
    new Request(
      process.env.ACCOUNT_ORIGIN + "/api/platform/avatars/" + f.owner.id,
      {
        headers: {
          Cookie: "church_platform_session=" + token,
          ...(expected ? { "X-Expected-Account": expected } : {})
        }
      }
    );
  for (const [token, expected] of [
    ["", f.reader.id],
    [f.reader.token, undefined],
    [f.reader.token, f.owner.id]
  ]) {
    const denied = await handleAvatarDelivery(
      db,
      request(token!, expected),
      f.owner.id,
      f.store
    );
    assert.equal(denied.status, 401);
    assert.match(denied.headers.get("cache-control")!, /private.*no-store/);
  }
  const response = await handleAvatarDelivery(
    db,
    request(f.reader.token, f.reader.id),
    f.owner.id,
    f.store
  );
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "image/webp");
  assert.match(response.headers.get("vary")!, /Cookie, X-Expected-Account/);
  assert.equal(response.headers.get("vercel-cdn-cache-control"), "no-store");
  assert.equal(
    response.headers.get("cross-origin-resource-policy"),
    "same-origin"
  );
  assert.match(response.headers.get("server-timing")!, /^avatar;dur=\d+\.\d$/);
  assert.equal(
    (await response.arrayBuffer()).byteLength,
    f.image.variants.thumb.bytes
  );
  assert.equal(
    (await sharp(await f.read()).metadata()).width,
    f.image.variants.thumb.width
  );
});
test("either direction of block and inactive profile conceal avatars before storage is accessed", async () => {
  const f = await fixture();
  for (const [ownerId, targetUserId] of [
    [f.owner.id, f.reader.id],
    [f.reader.id, f.owner.id]
  ]) {
    const block = await db.socialRelationship.create({
      data: { ownerId, targetUserId, blocked: true }
    });
    await assert.rejects(
      f.read({
        ...f.store,
        async get() {
          assert.fail("Blocked bytes requested");
        }
      }),
      /unavailable/
    );
    await db.socialRelationship.delete({ where: { id: block.id } });
  }
  for (const field of ["suspendedAt", "deactivatedAt"]) {
    await db.platformUser.update({
      where: { id: f.owner.id },
      data: { [field]: new Date() }
    });
    await assert.rejects(f.read(), /unavailable/);
    await db.platformUser.update({
      where: { id: f.owner.id },
      data: { [field]: null }
    });
  }
});
test("a block applied during storage delivery suppresses the old response", async () => {
  const f = await fixture();
  await assert.rejects(
    f.read({
      ...f.store,
      async get(path, signal) {
        await db.socialRelationship.create({
          data: {
            ownerId: f.owner.id,
            targetUserId: f.reader.id,
            blocked: true
          }
        });
        return f.store.get(path, signal);
      }
    }),
    /unavailable/
  );
});
test("session revocation during storage delivery suppresses the old response", async () => {
  const f = await fixture();
  await assert.rejects(
    f.read({
      ...f.store,
      async get(path, signal) {
        await db.platformSession.deleteMany({ where: { userId: f.reader.id } });
        return f.store.get(path, signal);
      }
    }),
    /sign-in changed/
  );
});
test("replacement during storage delivery cannot display an old retained avatar", async () => {
  const f = await fixture();
  await assert.rejects(
    f.read({
      ...f.store,
      async get(path, signal) {
        await uploadImage(
          db,
          f.owner.token,
          { ...f.input, requestKey: randomUUID(), replacesId: f.image.id },
          f.bytes,
          f.store
        );
        return f.store.get(path, signal);
      }
    }),
    /unavailable/
  );
  assert.ok((await f.read()).length > 0);
});
test("no current avatar, wrong image purpose, missing bytes and cancellation fail closed", async () => {
  const f = await fixture();
  await assert.rejects(
    f.read({
      ...f.store,
      async get() {
        return Buffer.from("truncated");
      }
    }),
    /could not be loaded/
  );
  await assert.rejects(
    f.read({
      ...f.store,
      async get() {
        return null;
      }
    }),
    /could not be loaded/
  );
  const abort = new AbortController();
  await assert.rejects(
    readAvatar(
      db,
      f.reader.token,
      f.owner.id,
      f.reader.id,
      {
        ...f.store,
        async get(path, signal) {
          const bytes = await f.store.get(path, signal);
          abort.abort();
          return bytes;
        }
      },
      abort.signal
    )
  );
  await db.mediaAsset.update({
    where: { id: f.image.id },
    data: { isCurrent: false }
  });
  await assert.rejects(f.read(), /unavailable/);
  await db.mediaAsset.update({
    where: { id: f.image.id },
    data: { isCurrent: true, purpose: "PROFILE_COVER" }
  });
  await assert.rejects(f.read(), /unavailable/);
});
