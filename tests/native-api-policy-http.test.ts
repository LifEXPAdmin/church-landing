import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { request as httpsRequest } from "node:https";
import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import sharp from "sharp";
import { PrismaClient } from "@prisma/client";
import { assertPortalTestDatabase, createPortalActor } from "./seed-portal";
import { decodeApiResponse, apiFailure } from "../lib/platform/api-contracts";
import { nativeImageEnvelope } from "../lib/platform/native-media-contracts";
const db = new PrismaClient(),
  origin = process.env.ACCOUNT_ORIGIN!;
const phase = process.env.NATIVE_POLICY_PHASE!;
const receipt = process.env.NATIVE_POLICY_RECEIPT!;
assert.ok(["enabled", "paused", "invalid", "rollback"].includes(phase));
assert.match(origin, /^https:\/\/127\.0\.0\.1:\d+$/);
assert.ok(receipt && process.env.NATIVE_PRIOR_CONTRACT_DIR);
before(() => assertPortalTestDatabase(db));
after(() => db.$disconnect());
type Actor = { id: string; token: string };
type Retained = {
  actor: Actor;
  bytes: string;
  input: object;
  image: { id: string; version: number };
  asset: unknown;
};
const oldContract = await import(
  pathToFileURL(process.env.NATIVE_PRIOR_CONTRACT_DIR! + "/api-contracts.ts")
    .href
);
const oldMedia = await import(
  pathToFileURL(
    process.env.NATIVE_PRIOR_CONTRACT_DIR! + "/native-media-contracts.ts"
  ).href
);
function send(
  path: string,
  actor: Actor | null = null,
  method = "GET",
  bytes?: Buffer,
  extra: Record<string, string> = {}
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
        timeout: 30000,
        servername: "localhost",
        headers: {
          ...(actor
            ? {
                Authorization: "Bearer " + actor.token,
                "X-Expected-Account": actor.id
              }
            : {}),
          ...(bytes ? { "Content-Length": bytes.length } : {}),
          ...extra
        }
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (b) => chunks.push(b));
        res.once("error", reject);
        res.once("end", () =>
          resolve({
            status: res.statusCode!,
            headers: res.headers,
            bytes: Buffer.concat(chunks)
          })
        );
      }
    );
    req.once("error", reject);
    req.once("timeout", () =>
      req.destroy(new Error("Fictional policy HTTPS timeout"))
    );
    req.end(bytes);
  });
}
const value = (r: Awaited<ReturnType<typeof send>>) =>
  JSON.parse(r.bytes.toString());
function privateResponse(r: Awaited<ReturnType<typeof send>>) {
  assert.equal(r.headers["x-api-version"], "1");
  assert.match(String(r.headers.vary), /X-API-Version/);
  assert.match(String(r.headers["cache-control"]), /private.*no-store/);
  assert.equal(r.headers["set-cookie"], undefined);
  assert.equal(r.headers.location, undefined);
}
const upload = (r: Retained, extra: Record<string, string> = {}) =>
  send(
    "/api/platform/v1/images",
    r.actor,
    "POST",
    Buffer.from(r.bytes, "base64"),
    {
      "Content-Type": "image/png",
      "X-Image-Details": encodeURIComponent(JSON.stringify(r.input)),
      ...extra
    }
  );
const asset = async (id: string) =>
  JSON.parse(
    JSON.stringify(await db.mediaAsset.findUniqueOrThrow({ where: { id } }))
  );

test("actual HTTPS compatibility policy phase " + phase, async () => {
  if (phase === "enabled") {
    const actor = await createPortalActor(db, "policyhttp");
    const bytes = await sharp({
      create: { width: 48, height: 48, channels: 3, background: "green" }
    })
      .png()
      .toBuffer();
    const retained: Retained = {
      actor: { id: actor.id, token: actor.token },
      bytes: bytes.toString("base64"),
      input: {
        purpose: "PROFILE_AVATAR",
        targetId: actor.id,
        requestKey: randomUUID(),
        replacesId: null,
        expectedVersion: null,
        caption: "",
        alt: "Fictional policy image",
        crop: null
      },
      image: { id: "", version: 0 },
      asset: null
    };
    for (const headers of [{}, { "X-API-Version": "1" }] as Record<
      string,
      string
    >[]) {
      for (const operation of ["capabilities", "feed"] as const) {
        const response = await send(
          "/api/platform/v1/" + operation,
          null,
          "GET",
          undefined,
          headers
        );
        assert.equal(response.status, 200);
        privateResponse(response);
        assert.deepEqual(
          oldContract.decodeApiResponse(operation, value(response), null),
          decodeApiResponse(operation, value(response), null)
        );
      }
      const response = await upload(retained, headers);
      assert.equal(response.status, 200, response.bytes.toString());
      privateResponse(response);
      const image = nativeImageEnvelope("upload").parse(value(response)).data
        .image;
      assert.deepEqual(
        oldMedia.nativeImageEnvelope("upload").parse(value(response)).data
          .image,
        image
      );
      if (retained.image.id) assert.equal(image.id, retained.image.id);
      retained.image = { id: image.id, version: image.version };
    }
    retained.asset = await asset(retained.image.id);
    writeFileSync(receipt, JSON.stringify(retained), {
      flag: "wx",
      mode: 0o600
    });
    const budget = await db.platformAuthLimit.findMany({
      orderBy: { key: "asc" }
    });
    for (const [header, status, code] of [
      ["2", 426, "unsupported_version"],
      ["1, 1", 400, "validation"],
      ["", 400, "validation"]
    ] as const) {
      const response = await upload(retained, { "X-API-Version": header });
      assert.equal(response.status, status);
      privateResponse(response);
      assert.equal(apiFailure.parse(value(response)).error.code, code);
    }
    assert.deepEqual(await asset(retained.image.id), retained.asset);
    assert.deepEqual(
      await db.platformAuthLimit.findMany({ orderBy: { key: "asc" } }),
      budget
    );
    return;
  }
  const retained: Retained = JSON.parse(readFileSync(receipt, "utf8"));
  if (phase === "paused" || phase === "invalid") {
    const caps = await send("/api/platform/v1/capabilities");
    assert.equal(caps.status, 200);
    privateResponse(caps);
    const data = oldContract.decodeApiResponse(
      "capabilities",
      value(caps),
      null
    ).data;
    const available = (name: string) =>
      data.features.find((f: { name: string }) => f.name === name)?.available;
    for (const feature of [
      "session.password",
      "feed.read",
      "media.images.upload",
      "push"
    ])
      assert.equal(available(feature), false);
    for (const feature of [
      "session.read",
      "session.logout",
      "session.activity",
      "session.authenticator"
    ])
      assert.equal(available(feature), true);
    assert.equal(available("media.images.read"), phase === "paused");
    const budget = await db.platformAuthLimit.findMany({
      orderBy: { key: "asc" }
    });
    const rejected = [
      await upload(retained),
      await send("/api/platform/v1/feed"),
      await send(
        "/api/platform/v1/auth/password",
        null,
        "POST",
        Buffer.from("{}"),
        { "Content-Type": "application/json" }
      )
    ];
    for (const response of rejected) {
      assert.equal(response.status, 503);
      privateResponse(response);
      assert.equal(
        apiFailure.parse(value(response)).error.code,
        "feature_unavailable"
      );
    }
    assert.deepEqual(await asset(retained.image.id), retained.asset);
    assert.deepEqual(
      await db.platformAuthLimit.findMany({ orderBy: { key: "asc" } }),
      budget
    );
    for (const path of ["session", "session/activity", "authenticator"]) {
      const r = await send("/api/platform/v1/" + path, retained.actor);
      assert.equal(r.status, 200, r.bytes.toString());
      privateResponse(r);
    }
    const image = await send(
      "/api/platform/v1/images/" + retained.image.id + "/thumb",
      retained.actor
    );
    assert.equal(image.status, phase === "paused" ? 200 : 503);
    privateResponse(image);
    const other = await createPortalActor(db, "policylogout");
    const logout = await send(
      "/api/platform/v1/session/logout",
      other,
      "POST",
      Buffer.from("{}"),
      { "Content-Type": "application/json" }
    );
    assert.equal(logout.status, 200);
    privateResponse(logout);
    return;
  }
  const replay = await upload(retained, { "X-API-Version": "1" });
  assert.equal(replay.status, 200, replay.bytes.toString());
  privateResponse(replay);
  assert.equal(
    oldMedia.nativeImageEnvelope("upload").parse(value(replay)).data.image.id,
    retained.image.id
  );
  assert.deepEqual(await asset(retained.image.id), retained.asset);
  const caps = await send("/api/platform/v1/capabilities");
  assert.equal(caps.status, 200);
  assert.equal(
    oldContract
      .decodeApiResponse("capabilities", value(caps), null)
      .data.features.find(
        (f: { name: string }) => f.name === "media.images.upload"
      ).available,
    true
  );
  const remove = await send(
    "/api/platform/v1/images",
    retained.actor,
    "DELETE",
    Buffer.from(
      JSON.stringify({
        id: retained.image.id,
        expectedVersion: retained.image.version
      })
    ),
    { "Content-Type": "application/json", "X-API-Version": "1" }
  );
  assert.equal(remove.status, 200);
  privateResponse(remove);
  assert.equal(
    oldMedia.nativeImageEnvelope("remove").parse(value(remove)).data.removed,
    true
  );
});
