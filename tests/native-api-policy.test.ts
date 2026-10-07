import test, { after } from "node:test";
import assert from "node:assert/strict";
import type { PrismaClient } from "@prisma/client";
import {
  nativeCapabilityPolicy,
  requireNativeProtocol,
  NativePolicyError
} from "../lib/platform/native-api-policy";
import { handleNativeSessionRequest } from "../lib/platform/native-session-boundary";
import { handleNativeReadRequest } from "../lib/platform/native-read-boundary";
import { handleNativeImageRequest } from "../lib/platform/native-media-boundary";
import { handleNativeReactionRequest } from "../lib/platform/native-reaction-boundary";
import { handleNativeBookmarkRequest } from "../lib/platform/native-bookmark-boundary";
import { decodeApiResponse, apiFailure } from "../lib/platform/api-contracts";

const priorOrigin = process.env.ACCOUNT_ORIGIN;
const priorDisabled = process.env.NATIVE_API_DISABLED_FEATURES;
process.env.ACCOUNT_ORIGIN = "https://127.0.0.1:49119";
const origin = process.env.ACCOUNT_ORIGIN;
after(() => {
  if (priorOrigin === undefined) delete process.env.ACCOUNT_ORIGIN;
  else process.env.ACCOUNT_ORIGIN = priorOrigin;
  if (priorDisabled === undefined)
    delete process.env.NATIVE_API_DISABLED_FEATURES;
  else process.env.NATIVE_API_DISABLED_FEATURES = priorDisabled;
});
const credentials = {
  Authorization: "Bearer " + "a".repeat(43),
  "X-Expected-Account": "fictional-account"
};
function unusedDatabase() {
  let calls = 0;
  const db = new Proxy(
    {},
    {
      get() {
        calls++;
        throw new Error("Database must not be consulted");
      }
    }
  ) as PrismaClient;
  return { db, calls: () => calls };
}
function request(
  path: string,
  method = "GET",
  headers: Record<string, string> = {},
  stream = false
) {
  let pulls = 0;
  const body = stream
    ? new ReadableStream<Uint8Array>(
        {
          pull(controller) {
            pulls++;
            controller.enqueue(new TextEncoder().encode("fictional body"));
            controller.close();
          }
        },
        { highWaterMark: 0 }
      )
    : undefined;
  const value = new Request(origin + "/api/platform/v1/" + path, {
    method,
    headers,
    ...(body ? { body, duplex: "half" } : {})
  } as RequestInit);
  return { value, pulls: () => pulls };
}
async function denied(response: Response, status: number, code: string) {
  assert.equal(response.status, status);
  assert.equal(apiFailure.parse(await response.json()).error.code, code);
  assert.equal(response.headers.get("x-api-version"), "1");
  assert.match(response.headers.get("vary")!, /X-API-Version/);
  assert.match(response.headers.get("cache-control")!, /private.*no-store/);
  assert.equal(response.headers.get("set-cookie"), null);
  assert.equal(response.headers.get("location"), null);
}

test("path selects the major; absent and exact headers retain v1 while unsupported or ambiguous versions fail", () => {
  for (const h of [null, "1"])
    requireNativeProtocol("/api/platform/v1/session", h);
  for (const h of ["2", "99999999"])
    assert.throws(
      () => requireNativeProtocol("/api/platform/v1/session", h),
      (e) => e instanceof NativePolicyError && e.code === "unsupported_version"
    );
  for (const h of [
    "",
    "01",
    "1, 1",
    "1.0",
    " 1",
    "1 ",
    "0",
    "-1",
    "1e0",
    "9".repeat(9)
  ])
    assert.throws(
      () => requireNativeProtocol("/api/platform/v1/session", h),
      (e) => e instanceof NativePolicyError && e.code === "validation"
    );
  assert.throws(
    () => requireNativeProtocol("/api/platform/v2/session", "1"),
    (e) => e instanceof NativePolicyError && e.code === "unsupported_version"
  );
});

test("capability pauses cannot activate unsupported features or turn off essential account controls", () => {
  const enabled = nativeCapabilityPolicy("");
  const decoded = decodeApiResponse(
    "capabilities",
    {
      apiVersion: "1",
      viewerId: null,
      data: enabled
    },
    null
  );
  assert.deepEqual(decoded.data.supportedVersions, ["1"]);
  const available = (raw: string, name: string) =>
    nativeCapabilityPolicy(raw).features.find((f) => f.name === name)
      ?.available;
  assert.equal(available("media.images.upload", "media.images.upload"), false);
  assert.equal(available("media.images.upload", "post.read"), true);
  for (const raw of [
    "typo",
    "push",
    "session.logout",
    "media.images.upload,",
    "media.images.upload,media.images.upload",
    " ".repeat(4097)
  ]) {
    assert.equal(available(raw, "media.images.upload"), false);
    assert.equal(available(raw, "session.password"), false);
    for (const name of [
      "session.read",
      "session.logout",
      "session.activity",
      "session.authenticator"
    ])
      assert.equal(available(raw, name), true);
    assert.equal(available(raw, "push"), false);
  }
  assert.equal(available("", "media.images.upload"), true);
});

test("reaction controls reject unsupported versions and paused reads/writes without database or body access", async () => {
  const { db, calls } = unusedDatabase();
  for (const resource of ["like", "reactionPreferences"] as const) {
    const params = resource === "like" ? { postId: "fictional-post" } : {};
    for (const method of ["GET", "POST"]) {
      for (const reason of ["version", "pause", "invalid"]) {
        process.env.NATIVE_API_DISABLED_FEATURES =
          reason === "version"
            ? ""
            : reason === "invalid"
              ? "unknown.feature"
              : "likes.read,likes.write,reactionPreferences.read,reactionPreferences.write";
        const probe = request(
          "reactions",
          method,
          {
            ...credentials,
            ...(reason === "version" ? { "X-API-Version": "2" } : {})
          },
          method === "POST"
        );
        await denied(
          await handleNativeReactionRequest(db, probe.value, resource, params),
          reason === "version" ? 426 : 503,
          reason === "version" ? "unsupported_version" : "feature_unavailable"
        );
        assert.equal(probe.pulls(), 0);
      }
    }
  }
  assert.equal(calls(), 0);
  delete process.env.NATIVE_API_DISABLED_FEATURES;
});

test("bookmark admission stops before database and body access while preserving transport checks", async () => {
  const { db, calls } = unusedDatabase();
  for (const resource of [
    "bookmarks",
    "bookmarkCollections",
    "bookmarkStatus"
  ] as const) {
    for (const method of resource === "bookmarkStatus" ? ["GET"] : ["GET", "POST"]) {
      for (const reason of ["version", "pause", "invalid"]) {
        process.env.NATIVE_API_DISABLED_FEATURES =
          reason === "version"
            ? ""
            : reason === "pause"
              ? "bookmarks.read,bookmarks.write"
              : "unknown.feature";
        const probe = request(
          resource === "bookmarkCollections"
            ? "bookmark-collections"
            : resource === "bookmarkStatus"
              ? "posts/fictional-post/bookmark"
              : "bookmarks",
          method,
          {
            ...credentials,
            ...(reason === "version" ? { "X-API-Version": "2" } : {})
          },
          method === "POST"
        );
        await denied(
          await handleNativeBookmarkRequest(
            db,
            probe.value,
            resource,
            resource === "bookmarkStatus" ? { postId: "fictional-post" } : {}
          ),
          reason === "version" ? 426 : 503,
          reason === "version" ? "unsupported_version" : "feature_unavailable"
        );
        assert.equal(probe.pulls(), 0);
      }
    }
  }
  process.env.NATIVE_API_DISABLED_FEATURES = "bookmarks.write";
  await denied(
    await handleNativeBookmarkRequest(
      db,
      request("bookmarks", "POST", { ...credentials, Origin: origin }, true)
        .value,
      "bookmarks"
    ),
    403,
    "forbidden"
  );
  await denied(
    await handleNativeBookmarkRequest(
      db,
      request("bookmarks", "POST", {}, true).value,
      "bookmarks"
    ),
    401,
    "unauthenticated"
  );
  assert.equal(calls(), 0);
  delete process.env.NATIVE_API_DISABLED_FEATURES;
  assert.equal(
    nativeCapabilityPolicy().features.find((f) => f.name === "bookmarks.write")
      ?.available,
    true
  );
});

test("unsupported version reaches no database or request body through session, core read or image adapters", async () => {
  delete process.env.NATIVE_API_DISABLED_FEATURES;
  const { db, calls } = unusedDatabase();
  const login = request(
    "auth/password",
    "POST",
    { "X-API-Version": "2", "Content-Type": "application/json" },
    true
  );
  await denied(
    await handleNativeSessionRequest(db, login.value, "password"),
    426,
    "unsupported_version"
  );
  assert.equal(login.pulls(), 0);
  const feed = request("feed", "GET", { "X-API-Version": "2" });
  await denied(
    await handleNativeReadRequest(db, feed.value, "feed"),
    426,
    "unsupported_version"
  );
  for (const method of ["POST", "DELETE"]) {
    const image = request(
      "images",
      method,
      { ...credentials, "X-API-Version": "2" },
      true
    );
    await denied(
      await handleNativeImageRequest(db, image.value),
      426,
      "unsupported_version"
    );
    assert.equal(image.pulls(), 0);
  }
  await denied(
    await handleNativeImageRequest(
      db,
      request("images/image/thumb", "GET", {
        ...credentials,
        "X-API-Version": "2"
      }).value,
      { id: "image", variant: "thumb" }
    ),
    426,
    "unsupported_version"
  );
  assert.equal(calls(), 0);
});

test("disabled reads and writes stop before database, storage or stream consumption; transport checks retain precedence", async () => {
  process.env.NATIVE_API_DISABLED_FEATURES =
    "session.password,feed.read,post.read,profile.read,church.read,churches.read,media.images.read,media.images.list,media.images.upload,media.images.remove";
  const { db, calls } = unusedDatabase();
  const login = request(
    "auth/password",
    "POST",
    { "Content-Type": "application/json" },
    true
  );
  await denied(
    await handleNativeSessionRequest(db, login.value, "password"),
    503,
    "feature_unavailable"
  );
  assert.equal(login.pulls(), 0);
  for (const operation of [
    "feed",
    "post",
    "profile",
    "church",
    "churches"
  ] as const) {
    const params =
      operation === "post"
        ? { postId: "post" }
        : operation === "profile"
          ? { username: "fictional" }
          : operation === "church"
            ? { churchId: "church" }
            : {};
    await denied(
      await handleNativeReadRequest(
        db,
        request(operation).value,
        operation,
        params
      ),
      503,
      "feature_unavailable"
    );
  }
  for (const method of ["POST", "DELETE", "GET"]) {
    const image = request("images", method, credentials, method !== "GET");
    await denied(
      await handleNativeImageRequest(db, image.value),
      503,
      "feature_unavailable"
    );
    assert.equal(image.pulls(), 0);
  }
  await denied(
    await handleNativeImageRequest(
      db,
      request("images/image/thumb", "GET", credentials).value,
      { id: "image", variant: "thumb" }
    ),
    503,
    "feature_unavailable"
  );
  await denied(
    await handleNativeImageRequest(
      db,
      request("images", "POST", { ...credentials, Origin: origin }, true).value
    ),
    403,
    "forbidden"
  );
  await denied(
    await handleNativeImageRequest(
      db,
      request("images", "POST", {}, true).value
    ),
    401,
    "unauthenticated"
  );
  assert.equal(calls(), 0);
});

test("old header-free and current v1 clients keep session discovery during a pause, and app version text grants no access", async () => {
  process.env.NATIVE_API_DISABLED_FEATURES = "invalid config";
  const { db, calls } = unusedDatabase();
  for (const headers of [
    {},
    { "X-API-Version": "1", "X-App-Version": "999.999.999" }
  ]) {
    const response = await handleNativeSessionRequest(
      db,
      request("session", "GET", headers as Record<string, string>).value,
      "session"
    );
    assert.equal(response.status, 200);
    assert.equal((await response.json()).data.state, "guest");
  }
  assert.equal(calls(), 0);
  delete process.env.NATIVE_API_DISABLED_FEATURES;
  assert.equal(
    nativeCapabilityPolicy().features.find(
      (f) => f.name === "media.images.upload"
    )!.available,
    true
  );
  await denied(
    await handleNativeImageRequest(
      db,
      request("images", "POST", { "X-App-Version": "999.999.999" }, true).value
    ),
    401,
    "unauthenticated"
  );
  assert.equal(calls(), 0);
});
