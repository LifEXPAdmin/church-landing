import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { PrismaClient } from "@prisma/client";
import { assertPortalTestDatabase } from "./seed-portal";
import { seedParticipation } from "./seed-post-participation";
import { postCommand } from "../lib/platform/post-commands";
const db = new PrismaClient(),
  origin = process.env.ACCOUNT_ORIGIN!;
assert.match(origin, /^https?:\/\/127\.0\.0\.1:\d+$/);
before(() => assertPortalTestDatabase(db));
after(() => db.$disconnect());
const picture = () =>
  sharp({
    create: { width: 80, height: 50, channels: 3, background: "orange" }
  })
    .jpeg()
    .withMetadata({ orientation: 6 })
    .toBuffer();
const get = (path: string, token = "", headers = {}) =>
  fetch(origin + path, {
    headers: { Cookie: "church_platform_session=" + token, ...headers },
    redirect: "manual"
  });
const upload = (
  token: string,
  input: Record<string, unknown>,
  bytes: Uint8Array,
  source = origin
) =>
  fetch(origin + "/api/platform/images", {
    method: "POST",
    headers: {
      Origin: source,
      Cookie: "church_platform_session=" + token,
      "Content-Type": "application/octet-stream",
      "X-Image-Details": encodeURIComponent(JSON.stringify(input))
    },
    body: new Uint8Array(bytes)
  });
test("actual image endpoint processes profile uploads, stable retries, account gates and explicit removal", async () => {
  const f = await seedParticipation(db),
    input = {
      purpose: "PROFILE_AVATAR",
      targetId: f.ada.id,
      requestKey: randomUUID()
    },
    bytes = await picture();
  assert.equal(
    (await upload(f.ada.token, input, bytes, "https://forged.example")).status,
    403
  );
  const created = await upload(f.ada.token, input, bytes);
  assert.equal(created.status, 200, await created.clone().text());
  const result = await created.json();
  assert.equal(result.variants.original.width, 50);
  assert.equal(result.variants.original.height, 80);
  assert.equal(
    (await (await upload(f.ada.token, input, bytes)).json()).id,
    result.id
  );
  for (const size of ["original", "large", "medium", "thumb"]) {
    const path = `/api/platform/images/${result.id}/${size}`;
    const permitted = await get(path, f.lee.token, {
      "If-None-Match": "*",
      Range: "bytes=0-1"
    });
    assert.equal(permitted.status, 200);
    assert.match(permitted.headers.get("cache-control")!, /no-store/);
    assert.equal(permitted.headers.get("content-type"), "image/webp");
    const meta = await sharp(
      Buffer.from(await permitted.arrayBuffer())
    ).metadata();
    assert.equal(meta.orientation, undefined);
    assert.equal(meta.exif, undefined);
    assert.equal((await get(path)).status, 404);
  }
  const listPath = `/api/platform/images?purpose=PROFILE_AVATAR&targetId=${f.ada.id}`;
  assert.equal((await get(listPath)).status, 404);
  const list = await (await get(listPath, f.lee.token)).text();
  assert.ok(list.includes(result.id));
  assert.ok(!list.includes("storagePrefix") && !list.includes(f.ada.email));
  const remove = await fetch(origin + "/api/platform/images", {
    method: "DELETE",
    headers: {
      Origin: origin,
      Cookie: "church_platform_session=" + f.ada.token,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ id: result.id, expectedVersion: 1 })
  });
  assert.equal(remove.status, 200);
  assert.equal(
    (await get(result.variants.original.url, f.lee.token)).status,
    404
  );
});
test("public photo delivery stays readable to guests but cannot enter Next's shared optimizer or survive changed audience", async () => {
  const f = await seedParticipation(db);
  const post = await postCommand(db, f.ada.token, {
    operation: "create",
    requestKey: randomUUID(),
    authorChurchId: f.churchA.id,
    audience: "PUBLIC",
    content: "Fictional public image notice"
  });
  const created = await upload(
    f.ada.token,
    {
      purpose: "POST_PHOTO",
      targetId: post.id,
      requestKey: randomUUID(),
      alt: "Fictional orange image"
    },
    await picture()
  );
  assert.equal(created.status, 200, await created.clone().text());
  const image = await created.json(),
    path = image.variants.thumb.url;
  assert.equal((await get(path)).status, 200);
  const optimizer = `/_next/image?url=${encodeURIComponent(path)}&w=256&q=75`;
  assert.equal((await get(optimizer)).status, 400);
  await postCommand(db, f.ada.token, {
    operation: "edit",
    postId: post.id,
    expectedVersion: 2,
    audience: "CHURCH",
    confirmAudienceChange: true
  });
  for (const size of ["original", "large", "medium", "thumb"])
    assert.equal((await get(image.variants[size].url)).status, 404);
  assert.equal((await get(path, f.lee.token)).status, 200);
  await db.churchConnection.updateMany({
    where: { userId: f.lee.id, churchId: f.churchA.id },
    data: { state: "LEFT" }
  });
  assert.equal((await get(path, f.lee.token)).status, 404);
  assert.equal((await get(optimizer)).status, 400);
});
