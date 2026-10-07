import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
import sharp from "sharp";
import { PrismaClient } from "@prisma/client";
import { assertPortalTestDatabase } from "./seed-portal";
import { seedParticipation } from "./seed-post-participation";
import { handleNativeImageRequest } from "../lib/platform/native-media-boundary";
import {
  nativeImageEnvelope,
  NATIVE_IMAGE_MAX_BYTES
} from "../lib/platform/native-media-contracts";
import { type ImageStorage } from "../lib/platform/media-storage";
import { hashSessionToken } from "../lib/platform/auth";
import { uploadImage } from "../lib/platform/media";
import { postWorkspaceCommand } from "../lib/platform/post-workspace";
import { portalCommand } from "../lib/platform/portal";

const db = new PrismaClient();
const origin = process.env.ACCOUNT_ORIGIN!;
before(() => assertPortalTestDatabase(db));
after(() => db.$disconnect());
type Actor = { id: string; token: string };
const picture = () =>
  sharp({ create: { width: 60, height: 40, channels: 3, background: "blue" } })
    .png()
    .toBuffer();
function storage() {
  const files = new Map<string, Buffer>();
  return {
    files,
    async put(path: string, bytes: Buffer) {
      assert.ok(!files.has(path));
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
const details = (owner: string) => ({
  purpose: "PROFILE_AVATAR",
  targetId: owner,
  requestKey: randomUUID(),
  replacesId: null as string | null,
  expectedVersion: null as number | null,
  caption: "",
  alt: "Fictional blue image",
  crop: null
});
function request(
  actor: Actor | null,
  method = "GET",
  path = "",
  body?: Uint8Array | string,
  extra: Record<string, string> = {},
  signal?: AbortSignal
) {
  return new Request(origin + "/api/platform/v1/images" + path, {
    method,
    headers: {
      ...(actor
        ? {
            Authorization: "Bearer " + actor.token,
            "X-Expected-Account": actor.id
          }
        : {}),
      ...extra
    },
    ...(body === undefined
      ? {}
      : { body: typeof body === "string" ? body : new Uint8Array(body) }),
    signal
  });
}
const send = (
  actor: Actor,
  input: object,
  bytes: Uint8Array,
  store: ImageStorage,
  extra: Record<string, string> = {},
  signal?: AbortSignal
) =>
  handleNativeImageRequest(
    db,
    request(
      actor,
      "POST",
      "",
      bytes,
      {
        "Content-Type": "application/octet-stream",
        "X-Image-Details": encodeURIComponent(JSON.stringify(input)),
        ...extra
      },
      signal
    ),
    undefined,
    store
  );
const get = (
  actor: Actor | null,
  id: string,
  store: ImageStorage,
  extra: Record<string, string> = {}
) =>
  handleNativeImageRequest(
    db,
    request(actor, "GET", "/" + id + "/thumb", undefined, extra),
    { id, variant: "thumb" },
    store
  );
async function uploaded(response: Response) {
  assert.equal(response.status, 200, await response.clone().text());
  return nativeImageEnvelope("upload").parse(await response.json()).data.image;
}
async function budget() {
  await db.platformAuthLimit.deleteMany();
}

test("native media requires exact transport identity before reading body or saving objects", async () => {
  const f = await seedParticipation(db),
    store = storage(),
    input = details(f.ada.id),
    bytes = await picture();
  await budget();
  for (const [extra, status] of [
    [{ "X-Expected-Account": f.blake.id }, 401],
    [{ "X-Expected-Account": "" }, 400],
    [{ Origin: origin }, 403],
    [{ "Sec-Fetch-Site": "same-origin" }, 403],
    [{ Authorization: "Bearer " + randomBytes(32).toString("base64url") }, 401]
  ] as [Record<string, string>, number][])
    assert.equal(
      (await send(f.ada, input, bytes, store, extra)).status,
      status
    );
  let pulls = 0;
  const stream = new ReadableStream<Uint8Array>(
    {
      pull(c) {
        pulls++;
        c.enqueue(bytes);
        c.close();
      }
    },
    { highWaterMark: 0 }
  );
  const init = {
    method: "POST",
    headers: {
      Authorization: "Bearer " + f.ada.token,
      "X-Expected-Account": f.blake.id
    },
    body: stream,
    duplex: "half"
  } as RequestInit;
  assert.equal(
    (
      await handleNativeImageRequest(
        db,
        new Request(origin + "/api/platform/v1/images", init),
        undefined,
        store
      )
    ).status,
    401
  );
  assert.equal(pulls, 0);
  assert.equal(store.files.size, 0);
  const noOwner = request(f.ada);
  noOwner.headers.delete("x-expected-account");
  assert.equal((await handleNativeImageRequest(db, noOwner)).status, 400);
});

test("native image upload, exact retry, versioned replacement/removal and redacted descriptors reuse canonical state", async () => {
  const f = await seedParticipation(db),
    store = storage(),
    bytes = await picture(),
    input = details(f.ada.id);
  await budget();
  const first = await uploaded(await send(f.ada, input, bytes, store));
  assert.equal(first.version, 1);
  assert.equal(store.files.size, 4);
  assert.equal(
    (await uploaded(await send(f.ada, input, bytes, store))).id,
    first.id
  );
  assert.equal(
    (await send(f.ada, { ...input, alt: "changed" }, bytes, store)).status,
    409
  );
  const list = await handleNativeImageRequest(
    db,
    request(f.lee, "GET", `?purpose=PROFILE_AVATAR&targetId=${f.ada.id}`)
  );
  const text = await list.text();
  assert.equal(list.status, 200, text);
  for (const privateField of [
    "storagePrefix",
    "fingerprint",
    "uploaderId",
    f.ada.email,
    "blob.vercel-storage.com"
  ])
    assert.ok(!text.includes(privateField));
  const images = nativeImageEnvelope("list").parse(JSON.parse(text)).data
    .images;
  assert.equal(images[0].id, first.id);
  const replacement = {
    ...input,
    requestKey: randomUUID(),
    replacesId: first.id,
    expectedVersion: 0
  };
  assert.equal((await send(f.ada, replacement, bytes, store)).status, 409);
  replacement.expectedVersion = first.version;
  const second = await uploaded(await send(f.ada, replacement, bytes, store));
  assert.notEqual(second.id, first.id);
  assert.equal((await get(f.ada, first.id, store)).status, 404);
  const remove = (version: number, actor = f.ada) =>
    handleNativeImageRequest(
      db,
      request(
        actor,
        "DELETE",
        "",
        JSON.stringify({ id: second.id, expectedVersion: version }),
        { "Content-Type": "application/json" }
      )
    );
  assert.equal((await remove(0)).status, 409);
  assert.equal((await remove(1, f.blake)).status, 403);
  assert.equal((await remove(1)).status, 200);
  assert.equal((await remove(1)).status, 200);
  assert.equal((await get(f.ada, second.id, store)).status, 404);
});

test("delivery honors current private audience and never forwards storage, range or cache credentials", async () => {
  const f = await seedParticipation(db),
    store = storage(),
    bytes = await picture();
  await budget();
  const image = await uploaded(
    await send(
      f.ada,
      { ...details(f.post.id), purpose: "POST_PHOTO" },
      bytes,
      store
    )
  );
  const good = await get(f.lee, image.id, store, {
    Range: "bytes=0-1",
    "If-None-Match": "*"
  });
  assert.equal(good.status, 200);
  assert.equal((await get(f.blake, image.id, store)).status, 404);
  assert.equal((await get(null, image.id, store)).status, 401);
  for (const header of ["location", "etag", "content-range", "set-cookie"])
    assert.equal(good.headers.get(header), null);
  assert.match(good.headers.get("vary")!, /Authorization.*X-Expected-Account/);
  assert.match(good.headers.get("cache-control")!, /private.*no-store/);
  assert.equal(good.headers.get("content-type"), "image/webp");
  assert.ok((await good.arrayBuffer()).byteLength > 2);
  await db.churchConnection.updateMany({
    where: { userId: f.lee.id, churchId: f.churchA.id },
    data: { state: "LEFT" }
  });
  assert.equal((await get(f.lee, image.id, store)).status, 404);
});

test("a revoked bearer cannot downgrade to a guest during public image delivery", async () => {
  const f = await seedParticipation(db),
    store = storage();
  await budget();
  const image = await uploaded(
    await send(
      f.ada,
      { ...details(f.post.id), purpose: "POST_PHOTO" },
      await picture(),
      store
    )
  );
  await db.platformPost.update({
    where: { id: f.post.id },
    data: { audience: "PUBLIC", eventOccurrenceId: null }
  });
  let reads = 0;
  const revoked: ImageStorage = {
    ...store,
    async get(path) {
      reads++;
      const bytes = await store.get(path);
      await db.platformSession.deleteMany({
        where: { tokenHash: hashSessionToken(f.lee.token) }
      });
      return bytes;
    }
  };
  assert.equal((await get(f.lee, image.id, revoked)).status, 401);
  assert.equal(reads, 1);
  assert.equal((await get(f.lee, image.id, store)).status, 401);
});

test("revocation during blob writes prevents READY publication and retains garbage", async () => {
  const f = await seedParticipation(db),
    store = storage(),
    input = details(f.ada.id);
  await budget();
  let writes = 0;
  const revoked: ImageStorage = {
    ...store,
    async put(path, bytes) {
      await store.put(path, bytes);
      if (++writes === 1)
        await db.platformSession.deleteMany({
          where: { tokenHash: hashSessionToken(f.ada.token) }
        });
    }
  };
  assert.equal(
    (await send(f.ada, input, await picture(), revoked)).status,
    401
  );
  const row = await db.mediaAsset.findUniqueOrThrow({
    where: {
      uploaderId_requestKey: {
        uploaderId: f.ada.id,
        requestKey: input.requestKey
      }
    }
  });
  assert.equal(row.status, "UPLOADING");
  assert.equal(row.leaseUntil.getTime(), 0);
  assert.equal(store.files.size, 4);
  assert.ok(
    await db.mediaGarbage.findUnique({
      where: { storagePrefix: row.storagePrefix }
    })
  );
});

test("lost storage replies and cancellation preserve exact retry inputs and cleanup", async () => {
  const f = await seedParticipation(db),
    store = storage(),
    input = details(f.ada.id),
    bytes = await picture();
  await budget();
  let fail = true;
  const uncertain: ImageStorage = {
    ...store,
    async put(path, data) {
      await store.put(path, data);
      if (fail) {
        fail = false;
        throw new Error("fictional-private-provider-reply");
      }
    }
  };
  const failed = await send(f.ada, input, bytes, uncertain);
  assert.equal(failed.status, 503);
  assert.ok(!(await failed.text()).includes("fictional-private-provider"));
  const row = await db.mediaAsset.findUniqueOrThrow({
    where: {
      uploaderId_requestKey: {
        uploaderId: f.ada.id,
        requestKey: input.requestKey
      }
    }
  });
  const image = await uploaded(await send(f.ada, input, bytes, store));
  assert.equal(image.id, row.id);
  assert.equal(store.files.size, 5);
  assert.ok(
    await db.mediaGarbage.findUnique({
      where: { storagePrefix: row.storagePrefix }
    })
  );
  const controller = new AbortController(),
    other = { ...details(f.post.id), purpose: "POST_PHOTO" };
  const cancel: ImageStorage = {
    ...store,
    async put(path, data) {
      await store.put(path, data);
      controller.abort();
    }
  };
  assert.equal(
    (await send(f.ada, other, bytes, cancel, {}, controller.signal)).status,
    503
  );
  const pending = await db.mediaAsset.findUniqueOrThrow({
    where: {
      uploaderId_requestKey: {
        uploaderId: f.ada.id,
        requestKey: other.requestKey
      }
    }
  });
  assert.equal(pending.status, "UPLOADING");
  assert.equal(pending.leaseUntil.getTime(), 0);
});

test("binary and metadata bounds, unsupported purposes and formats fail without READY assets", async () => {
  const f = await seedParticipation(db),
    store = storage(),
    input = details(f.ada.id),
    bytes = await picture();
  await budget();
  const invalidHeaders: Record<string, string>[] = [
    { "Content-Length": String(NATIVE_IMAGE_MAX_BYTES + 1) },
    { "X-Image-Details": "x".repeat(8193) },
    { "Content-Type": "multipart/form-data" }
  ];
  for (const extra of invalidHeaders)
    assert.equal((await send(f.ada, input, bytes, store, extra)).status, 400);
  assert.equal(
    (await send(f.ada, input, Buffer.alloc(NATIVE_IMAGE_MAX_BYTES + 1), store))
      .status,
    400
  );
  assert.equal(
    (
      await send(
        f.ada,
        { ...input, purpose: "SUPPORT_ATTACHMENT" },
        bytes,
        store
      )
    ).status,
    400
  );
  assert.equal(
    (await send(f.ada, input, Buffer.from("<svg/>"), store)).status,
    400
  );
  assert.equal(store.files.size, 0);
  assert.equal(
    await db.mediaAsset.count({
      where: { uploaderId: f.ada.id, status: "READY" }
    }),
    0
  );
});

test("replacement versions and church authority are rechecked after storage IO", async () => {
  const f = await seedParticipation(db),
    store = storage(),
    bytes = await picture();
  await budget();
  const first = await uploaded(
    await send(f.ada, details(f.ada.id), bytes, store)
  );
  let changed = false;
  const changing: ImageStorage = {
    ...store,
    async put(path, data) {
      await store.put(path, data);
      if (!changed) {
        changed = true;
        await db.mediaAsset.update({
          where: { id: first.id },
          data: { version: { increment: 1 } }
        });
      }
    }
  };
  assert.equal(
    (
      await send(
        f.ada,
        {
          ...details(f.ada.id),
          replacesId: first.id,
          expectedVersion: first.version
        },
        bytes,
        changing
      )
    ).status,
    409
  );
  assert.equal(
    (await db.mediaAsset.findUniqueOrThrow({ where: { id: first.id } })).status,
    "READY"
  );
  await portalCommand(db, f.operator.token, {
    operation: "grant",
    churchId: f.churchA.id,
    userId: f.ada.id,
    capability: "MANAGE_CHURCH_PROFILE",
    expectedVersion: 0
  });
  const before = process.env.PRIVILEGED_MFA_MODE;
  try {
    process.env.PRIVILEGED_MFA_MODE = "enforce";
    const denied = await send(
      f.ada,
      { ...details(f.churchA.id), purpose: "CHURCH_LOGO" },
      bytes,
      store
    );
    assert.equal(denied.status, 403);
    assert.equal((await denied.json()).error.code, "forbidden");
  } finally {
    if (before === undefined) delete process.env.PRIVILEGED_MFA_MODE;
    else process.env.PRIVILEGED_MFA_MODE = before;
  }
  let revoked = false;
  const revokeGrant: ImageStorage = {
    ...store,
    async put(path, data) {
      await store.put(path, data);
      if (!revoked) {
        revoked = true;
        await db.churchCapabilityGrant.updateMany({
          where: {
            userId: f.ada.id,
            churchId: f.churchA.id,
            capability: "MANAGE_CHURCH_PROFILE"
          },
          data: { revokedAt: new Date() }
        });
      }
    }
  };
  const input = { ...details(f.churchA.id), purpose: "CHURCH_LOGO" };
  assert.equal((await send(f.ada, input, bytes, revokeGrant)).status, 403);
  const pending = await db.mediaAsset.findUniqueOrThrow({
    where: {
      uploaderId_requestKey: {
        uploaderId: f.ada.id,
        requestKey: input.requestKey
      }
    }
  });
  assert.equal(pending.status, "UPLOADING");
});

test("authorized saved personal photos remain readable in post galleries without enabling library commands", async () => {
  const f = await seedParticipation(db),
    store = storage();
  const prior = process.env.PERSONAL_PHOTO_LIBRARY_ENABLED;
  try {
    process.env.PERSONAL_PHOTO_LIBRARY_ENABLED = "true";
    const photo = await uploadImage(
      db,
      f.ada.token,
      {
        purpose: "PROFILE_PHOTO",
        targetId: f.ada.id,
        requestKey: randomUUID(),
        audience: "CHURCH",
        audienceChurchId: f.churchA.id
      },
      await picture(),
      store
    );
    const id = randomUUID();
    await postWorkspaceCommand(db, f.ada.token, {
      operation: "save-draft",
      mutationId: randomUUID(),
      id,
      expectedVersion: 0,
      payload: {
        content: "Fictional saved photo",
        replyAudience: "CHURCH_MEMBERS",
        audience: "CHURCH",
        audienceChurchId: f.churchA.id,
        photos: [{ id: photo.id, version: photo.version }]
      }
    });
    const result = (await postWorkspaceCommand(db, f.ada.token, {
      operation: "publish-draft",
      mutationId: randomUUID(),
      id,
      expectedVersion: 1
    })) as { postId: string };
    await db.postPhotoReference.updateMany({
      where: { postId: result.postId, assetId: photo.id },
      data: { position: 1001 }
    });
    const listed = await handleNativeImageRequest(
      db,
      request(f.lee, "GET", `?purpose=POST_PHOTO&targetId=${result.postId}`)
    );
    assert.equal(listed.status, 200, await listed.clone().text());
    const images = nativeImageEnvelope("list").parse(await listed.json()).data
      .images;
    assert.equal(images[0].id, photo.id);
    assert.equal(images[0].purpose, "PROFILE_PHOTO");
    assert.equal(images[0].position, 1001);
    assert.equal((await get(f.lee, photo.id, store)).status, 200);
    assert.equal((await get(f.blake, photo.id, store)).status, 404);
  } finally {
    if (prior === undefined) delete process.env.PERSONAL_PHOTO_LIBRARY_ENABLED;
    else process.env.PERSONAL_PHOTO_LIBRARY_ENABLED = prior;
  }
});

test("invalid removal bodies do not misreport session loss or revoke the current account", async () => {
  const f = await seedParticipation(db);
  await budget();
  for (const body of [undefined, "null", "[]", " ".repeat(2049)]) {
    const response = await handleNativeImageRequest(
      db,
      request(f.ada, "DELETE", "", body, { "Content-Type": "application/json" })
    );
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error.code, "validation");
  }
  const list = await handleNativeImageRequest(
    db,
    request(f.ada, "GET", `?purpose=PROFILE_AVATAR&targetId=${f.ada.id}`)
  );
  assert.equal(list.status, 200);
});
