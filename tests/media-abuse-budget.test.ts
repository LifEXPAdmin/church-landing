import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { accountConfig } from "../lib/platform/account-config";
import { allowImageAttempt } from "../lib/platform/account-limits";
import {
  handleImageRequest,
  imageHeaders
} from "../lib/platform/media-boundary";
import { IMAGE_INPUT_BYTES } from "../lib/platform/media-processing";
import { boundedBytes, type ImageStorage } from "../lib/platform/media-storage";
import { PortalError } from "../lib/platform/portal-policy";
import { assertPortalTestDatabase, createPortalActor } from "./seed-portal";

const db = new PrismaClient();
before(() => assertPortalTestDatabase(db));
after(() => db.$disconnect());

function storageProbe() {
  const calls = { put: 0, get: 0, delete: 0 };
  const store: ImageStorage = {
    async put() {
      calls.put++;
    },
    async get() {
      calls.get++;
      return null;
    },
    async delete() {
      calls.delete++;
    }
  };
  return { calls, store };
}

function lazyRequest(
  actor: Awaited<ReturnType<typeof createPortalActor>>,
  method: "POST" | "DELETE",
  headers: Record<string, string> = {},
  bytes = Uint8Array.of(123, 125)
) {
  let pulls = 0;
  const body = new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        pulls++;
        controller.enqueue(bytes);
        controller.close();
      }
    },
    { highWaterMark: 0 }
  );
  const init: RequestInit & { duplex: "half" } = {
    method,
    headers: {
      Origin: accountConfig().origin,
      Cookie: "church_platform_session=" + actor.token,
      "Content-Type":
        method === "POST" ? "application/octet-stream" : "application/json",
      "X-Expected-Account": actor.id,
      "X-Image-Details": encodeURIComponent(
        JSON.stringify({
          purpose: "PROFILE_AVATAR",
          targetId: actor.id,
          requestKey: randomUUID()
        })
      ),
      ...headers
    },
    body,
    duplex: "half"
  };
  return {
    request: new Request(accountConfig().origin + "/api/platform/images", init),
    pulls: () => pulls
  };
}

function assertPrivateHeaders(response: Response) {
  for (const [name, value] of Object.entries(imageHeaders))
    assert.equal(response.headers.get(name), value);
}

for (const [method, operation] of [
  ["POST", "upload"],
  ["DELETE", "remove"]
] as const) {
  test(`image ${operation} denial reports retry timing before reading bytes, then recovers after expiry`, async () => {
    const actor = await createPortalActor(db, `img_${operation}`);
    const config = accountConfig();
    assert.equal(
      await allowImageAttempt(
        db,
        config.rateSecret,
        operation,
        "local",
        actor.id
      ),
      true
    );
    const key = createHmac("sha256", config.rateSecret + ":images")
      .update(`${operation}:${actor.id}`)
      .digest("hex");
    await db.platformAuthLimit.update({ where: { key }, data: { hits: 10 } });
    const initialAssets = await db.mediaAsset.count({
      where: { uploaderId: actor.id }
    });
    const initialGarbage = await db.mediaGarbage.count();
    const probe = storageProbe();
    const denied = lazyRequest(actor, method);
    const response = await handleImageRequest(db, denied.request, probe.store);
    assert.equal(response.status, 429);
    assert.equal(
      denied.pulls(),
      0,
      "Rate rejection must precede body consumption"
    );
    assert.deepEqual(probe.calls, { put: 0, get: 0, delete: 0 });
    assert.equal(
      await db.mediaAsset.count({ where: { uploaderId: actor.id } }),
      initialAssets
    );
    assert.equal(await db.mediaGarbage.count(), initialGarbage);
    assertPrivateHeaders(response);
    assert.equal(response.headers.get("Retry-After"), "900");

    // Expire only this fictional actor's bucket; do not wait or generate a flood.
    await db.platformAuthLimit.update({
      where: { key },
      data: { expiresAt: new Date(0) }
    });
    const recovered = lazyRequest(
      actor,
      method,
      method === "POST"
        ? { "Content-Length": String(IMAGE_INPUT_BYTES + 1) }
        : {},
      Uint8Array.of(125, 123)
    );
    const afterExpiry = await handleImageRequest(
      db,
      recovered.request,
      probe.store
    );
    assert.equal(afterExpiry.status, method === "POST" ? 413 : 400);
    assert.equal(afterExpiry.headers.get("Retry-After"), null);
    assertPrivateHeaders(afterExpiry);
    assert.equal(recovered.pulls(), method === "POST" ? 0 : 1);
    assert.deepEqual(probe.calls, { put: 0, get: 0, delete: 0 });
    assert.equal(
      await db.mediaAsset.count({ where: { uploaderId: actor.id } }),
      initialAssets
    );
    assert.equal(await db.mediaGarbage.count(), initialGarbage);
    assert.equal(
      (await db.platformAuthLimit.findUniqueOrThrow({ where: { key } })).hits,
      1
    );
  });
}

test("ordinary image boundary errors keep privacy headers without a retry deadline", async () => {
  const actor = await createPortalActor(db, "img_status");
  const probe = storageProbe();
  const cases: Array<{ status: number; headers: Record<string, string> }> = [
    { status: 401, headers: { Cookie: "" } },
    { status: 401, headers: { "X-Expected-Account": randomUUID() } },
    {
      status: 403,
      headers: { Origin: "https://fictional-other.example.test" }
    },
    { status: 400, headers: { "X-Image-Details": "%" } },
    {
      status: 413,
      headers: { "Content-Length": String(IMAGE_INPUT_BYTES + 1) }
    }
  ];
  for (const item of cases) {
    const attempted = lazyRequest(actor, "POST", item.headers);
    const response = await handleImageRequest(
      db,
      attempted.request,
      probe.store
    );
    assert.equal(response.status, item.status);
    assert.equal(response.headers.get("Retry-After"), null);
    assertPrivateHeaders(response);
    assert.equal(attempted.pulls(), 0);
  }
  const priorMode = process.env.MEDIA_STORAGE_MODE;
  try {
    process.env.MEDIA_STORAGE_MODE = "disabled";
    const attempted = lazyRequest(actor, "POST");
    const response = await handleImageRequest(db, attempted.request);
    assert.equal(response.status, 503);
    assert.equal(response.headers.get("Retry-After"), null);
    assertPrivateHeaders(response);
    assert.equal(attempted.pulls(), 0);
  } finally {
    if (priorMode === undefined) delete process.env.MEDIA_STORAGE_MODE;
    else process.env.MEDIA_STORAGE_MODE = priorMode;
  }
  assert.deepEqual(probe.calls, { put: 0, get: 0, delete: 0 });
  assert.equal(
    await db.mediaAsset.count({ where: { uploaderId: actor.id } }),
    0
  );
});

test("stream byte admission cancels an oversized body using only two fictional bytes", async () => {
  let pulls = 0,
    cancelled = 0;
  const stream = new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        pulls++;
        controller.enqueue(Uint8Array.of(1, 2));
      },
      cancel() {
        cancelled++;
      }
    },
    { highWaterMark: 0 }
  );
  await assert.rejects(
    boundedBytes(stream, 1, AbortSignal.timeout(1000)),
    (error: unknown) => error instanceof PortalError && error.status === 413
  );
  assert.equal(pulls, 1);
  assert.equal(cancelled, 1);
  assert.equal(stream.locked, false);
});
