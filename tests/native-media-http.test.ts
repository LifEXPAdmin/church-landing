import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { request as httpsRequest } from "node:https";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { PrismaClient } from "@prisma/client";
import { assertPortalTestDatabase } from "./seed-portal";
import { seedParticipation } from "./seed-post-participation";
import { nativeImageEnvelope } from "../lib/platform/native-media-contracts";
import { hashSessionToken } from "../lib/platform/auth";
import { sessionCookieFixtureName } from "../scripts/session-cookie-fixture.mjs";
const db = new PrismaClient(),
  origin = process.env.ACCOUNT_ORIGIN!;
assert.match(origin, /^https:\/\/127\.0\.0\.1:\d+$/);
before(() => assertPortalTestDatabase(db));
after(() => db.$disconnect());
type Actor = { id: string; token: string };
function send(
  path: string,
  actor: Actor | null,
  method = "GET",
  bytes?: Buffer,
  headers: Record<string, string> = {}
) {
  return new Promise<{
    status: number;
    headers: import("node:http").IncomingHttpHeaders;
    bytes: Buffer;
  }>((resolve, reject) => {
    const req = httpsRequest(
      origin + path,
      {
        method,
        servername: "localhost",
        timeout: 30000,
        headers: {
          ...(actor
            ? {
                Authorization: "Bearer " + actor.token,
                "X-Expected-Account": actor.id
              }
            : {}),
          ...(bytes ? { "Content-Length": String(bytes.length) } : {}),
          ...headers
        }
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.once("error", reject);
        response.once("end", () =>
          resolve({
            status: response.statusCode!,
            headers: response.headers,
            bytes: Buffer.concat(chunks)
          })
        );
      }
    );
    req.once("error", reject);
    req.once("timeout", () =>
      req.destroy(new Error("Fictional native media HTTPS timeout"))
    );
    req.end(bytes);
  });
}
const input = (id: string) => ({
  purpose: "PROFILE_AVATAR",
  targetId: id,
  requestKey: randomUUID(),
  replacesId: null,
  expectedVersion: null,
  caption: "",
  alt: "Fictional image",
  crop: null
});
const imageBytes = () =>
  sharp({ create: { width: 80, height: 50, channels: 3, background: "green" } })
    .jpeg()
    .withMetadata({ orientation: 6 })
    .toBuffer();
function upload(actor: Actor, details: object, bytes: Buffer) {
  return send("/api/platform/v1/images", actor, "POST", bytes, {
    "Content-Type": "application/octet-stream",
    "X-Image-Details": encodeURIComponent(JSON.stringify(details))
  });
}
test("HTTPS native upload, replay, descriptors and all image variants work without browser cookies", async () => {
  const f = await seedParticipation(db),
    details = input(f.ada.id),
    bytes = await imageBytes();
  await db.platformAuthLimit.deleteMany();
  const created = await upload(f.ada, details, bytes);
  assert.equal(created.status, 200, created.bytes.toString());
  const image = nativeImageEnvelope("upload").parse(
    JSON.parse(created.bytes.toString())
  ).data.image;
  const retry = await upload(f.ada, details, bytes);
  assert.equal(retry.status, 200);
  assert.equal(
    nativeImageEnvelope("upload").parse(JSON.parse(retry.bytes.toString())).data
      .image.id,
    image.id
  );
  for (const variant of Object.values(image.variants)) {
    const response = await send(variant.path, f.lee, "GET", undefined, {
      Range: "bytes=0-1",
      "If-None-Match": "*"
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers["content-type"], "image/webp");
    assert.match(
      String(response.headers["cache-control"]),
      /private.*no-store/
    );
    assert.match(
      String(response.headers.vary),
      /Authorization.*X-Expected-Account/
    );
    for (const header of [
      "location",
      "set-cookie",
      "content-range",
      "etag",
      "access-control-allow-origin"
    ])
      assert.equal(response.headers[header], undefined);
    const meta = await sharp(response.bytes).metadata();
    assert.equal(meta.orientation, undefined);
    assert.equal(meta.exif, undefined);
    assert.equal(response.bytes.length, variant.bytes);
  }
  const listed = await send(
    `/api/platform/v1/images?purpose=PROFILE_AVATAR&targetId=${f.ada.id}`,
    f.ada
  );
  assert.equal(listed.status, 200);
  assert.equal(
    nativeImageEnvelope("list").parse(JSON.parse(listed.bytes.toString())).data
      .images[0].id,
    image.id
  );
});
test("HTTPS native private media rejects browser credentials, another owner, expired sessions and lost membership", async () => {
  const f = await seedParticipation(db);
  await db.platformAuthLimit.deleteMany();
  const created = await upload(
    f.ada,
    { ...input(f.post.id), purpose: "POST_PHOTO" },
    await imageBytes()
  );
  assert.equal(created.status, 200, created.bytes.toString());
  const image = nativeImageEnvelope("upload").parse(
    JSON.parse(created.bytes.toString())
  ).data.image;
  const path = image.variants.thumb.path;
  assert.equal((await send(path, null)).status, 401);
  assert.equal(
    (
      await send(path, f.lee, "GET", undefined, {
        "X-Expected-Account": f.blake.id
      })
    ).status,
    401
  );
  assert.equal(
    (await send(path, f.lee, "GET", undefined, { Origin: origin })).status,
    403
  );
  assert.equal(
    (
      await send(path, f.lee, "GET", undefined, {
        Cookie: `${sessionCookieFixtureName()}=${f.lee.token}`
      })
    ).status,
    401
  );
  assert.equal((await send(path, f.blake)).status, 404);
  await db.churchConnection.updateMany({
    where: { userId: f.lee.id, churchId: f.churchA.id },
    data: { state: "LEFT" }
  });
  assert.equal((await send(path, f.lee)).status, 404);
  await db.platformSession.updateMany({
    where: { tokenHash: hashSessionToken(f.ada.token) },
    data: { idleExpiresAt: new Date(0) }
  });
  assert.equal((await send(path, f.ada)).status, 401);
});
test("HTTPS native upload preserves format, account, query and explicit version boundaries", async () => {
  const f = await seedParticipation(db),
    details = input(f.ada.id);
  await db.platformAuthLimit.deleteMany();
  assert.equal(
    (await upload(f.blake, details, await imageBytes())).status,
    403
  );
  assert.equal(
    (await upload(f.ada, details, Buffer.from("<svg/>"))).status,
    400
  );
  const unsupported = await upload(
    f.ada,
    { ...details, purpose: "SUPPORT_ATTACHMENT" },
    await imageBytes()
  );
  assert.equal(unsupported.status, 400);
  const duplicate = await send(
    `/api/platform/v1/images?purpose=PROFILE_AVATAR&purpose=POST_PHOTO&targetId=${f.ada.id}`,
    f.ada
  );
  assert.equal(duplicate.status, 400);
  const malformed = await upload(
    f.ada,
    { ...details, replacesId: "old", expectedVersion: null },
    await imageBytes()
  );
  assert.equal(malformed.status, 400);
});
