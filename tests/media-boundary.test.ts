import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { PrismaClient } from "@prisma/client";
import { assertPortalTestDatabase } from "./seed-portal";
import { seedParticipation } from "./seed-post-participation";
import {
  handleImageDelivery,
  handleImageRequest
} from "../lib/platform/media-boundary";
import { imageStorage } from "../lib/platform/media-storage";
import { IMAGE_INPUT_BYTES } from "../lib/platform/media-processing";
const db = new PrismaClient(),
  origin = process.env.ACCOUNT_ORIGIN!;
before(() => assertPortalTestDatabase(db));
after(() => db.$disconnect());
const picture = () =>
  sharp({ create: { width: 40, height: 20, channels: 3, background: "green" } })
    .png()
    .toBuffer();
function request(
  token: string,
  input: Record<string, unknown>,
  bytes: Uint8Array,
  extra: Record<string, string> = {}
) {
  return new Request(origin + "/api/platform/images", {
    method: "POST",
    headers: {
      Origin: origin,
      Cookie: "church_platform_session=" + token,
      "Content-Type": "application/octet-stream",
      "X-Image-Details": encodeURIComponent(JSON.stringify(input)),
      ...extra
    },
    body: new Uint8Array(bytes)
  });
}
test("image boundary checks CSRF, sign-in, impersonation and actual streamed size before saving", async () => {
  const f = await seedParticipation(db),
    bytes = await picture();
  const input = {
    purpose: "PROFILE_AVATAR",
    targetId: f.ada.id,
    requestKey: randomUUID()
  };
  const send = (
    token = f.ada.token,
    details = input,
    data = bytes,
    headers = {}
  ) => handleImageRequest(db, request(token, details, data, headers));
  assert.equal(
    (
      await send(f.ada.token, input, bytes, {
        Origin: "https://forged.example"
      })
    ).status,
    403
  );
  assert.equal((await send("")).status, 401);
  assert.equal(
    (await send(f.ada.token, { ...input, ...{ uploaderId: f.blake.id } }))
      .status,
    400
  );
  assert.equal((await send(f.blake.token)).status, 403);
  assert.equal(
    (
      await send(
        f.ada.token,
        input,
        Buffer.from("<html>not an image.jpg</html>"),
        { "Content-Type": "image/jpeg" }
      )
    ).status,
    400
  );
  assert.equal(
    (await send(f.ada.token, input, Buffer.alloc(IMAGE_INPUT_BYTES + 1)))
      .status,
    413
  );
  assert.equal(
    (
      await send(f.ada.token, input, bytes, {
        "Content-Length": String(IMAGE_INPUT_BYTES + 1)
      })
    ).status,
    413
  );
  // A rejected file is a different request; retrying it cannot silently switch content.
  input.requestKey = randomUUID();
  const response = await send();
  assert.equal(response.status, 200, await response.clone().text());
  const text = await response.text();
  for (const forbidden of [
    f.ada.email,
    "storagePrefix",
    "fingerprint",
    "uploaderId",
    "blob.vercel-storage.com"
  ])
    assert.ok(!text.includes(forbidden));
  for (const body of [
    "{",
    JSON.stringify({
      id: JSON.parse(text).id,
      expectedVersion: 1,
      userId: f.blake.id
    }),
    " ".repeat(2049)
  ]) {
    const invalid = await handleImageRequest(
      db,
      new Request(origin + "/api/platform/images", {
        method: "DELETE",
        headers: {
          Origin: origin,
          Cookie: "church_platform_session=" + f.ada.token,
          "Content-Type": "application/json"
        },
        body
      })
    );
    assert.equal(invalid.status, 400);
  }
  assert.equal(
    (
      await db.mediaAsset.findUniqueOrThrow({
        where: { id: JSON.parse(text).id }
      })
    ).status,
    "READY"
  );
});
test("direct delivery never forwards storage URLs, range or conditional caching and rechecks a revoked session", async () => {
  const f = await seedParticipation(db),
    bytes = await picture();
  const input = {
    purpose: "PROFILE_AVATAR",
    targetId: f.ada.id,
    requestKey: randomUUID()
  };
  const uploaded = await (
    await handleImageRequest(db, request(f.ada.token, input, bytes))
  ).json();
  assert.ok(uploaded.id);
  const get = (token = "") =>
    new Request(origin + `/api/platform/images/${uploaded.id}/thumb`, {
      headers: {
        Cookie: "church_platform_session=" + token,
        Range: "bytes=0-2",
        "If-None-Match": "*",
        "If-Modified-Since": new Date().toUTCString()
      }
    });
  const response = await handleImageDelivery(
    db,
    get(f.lee.token),
    uploaded.id,
    "thumb"
  );
  assert.equal(response.status, 200);
  assert.match(response.headers.get("cache-control")!, /private.*no-store/);
  assert.equal(response.headers.get("cdn-cache-control"), "no-store");
  assert.equal(response.headers.get("vary"), "Cookie");
  assert.equal(response.headers.get("location"), null);
  assert.equal(response.headers.get("etag"), null);
  assert.equal(response.headers.get("content-range"), null);
  assert.equal(response.headers.get("content-type"), "image/webp");
  assert.equal(
    (await sharp(Buffer.from(await response.arrayBuffer())).metadata()).width,
    40
  );
  assert.equal(
    (await handleImageDelivery(db, get(), uploaded.id, "thumb")).status,
    404
  );
  assert.equal(
    (
      await handleImageDelivery(
        db,
        get(f.lee.token),
        uploaded.id,
        "../original"
      )
    ).status,
    404
  );
  const store = imageStorage();
  const revoked = {
    ...store,
    async get(path: string, signal: AbortSignal) {
      const data = await store.get(path, signal);
      await db.platformSession.deleteMany({ where: { userId: f.lee.id } });
      return data;
    }
  };
  assert.equal(
    (
      await handleImageDelivery(
        db,
        get(f.lee.token),
        uploaded.id,
        "original",
        revoked
      )
    ).status,
    404
  );
});
test("unconfigured storage fails closed without changing an existing image", async () => {
  const f = await seedParticipation(db),
    previous = process.env.MEDIA_STORAGE_MODE;
  try {
    delete process.env.MEDIA_STORAGE_MODE;
    const response = await handleImageRequest(
      db,
      request(
        f.ada.token,
        {
          purpose: "PROFILE_AVATAR",
          targetId: f.ada.id,
          requestKey: randomUUID()
        },
        await picture()
      )
    );
    assert.equal(response.status, 503);
    assert.match(await response.text(), /not available yet/);
    assert.equal(
      await db.mediaAsset.count({ where: { uploaderId: f.ada.id } }),
      0
    );
  } finally {
    process.env.MEDIA_STORAGE_MODE = previous;
  }
});
