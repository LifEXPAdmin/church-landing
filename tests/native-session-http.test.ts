import test, { before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { request as httpsRequest } from "node:https";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { assertPortalTestDatabase, createPortalActor } from "./seed-portal";
import { hashSessionToken } from "../lib/platform/auth";
import {
  authenticatorTotp,
  openAuthenticator
} from "../lib/platform/admin-authenticator-crypto";
import { sessionCookieFixtureName } from "../scripts/session-cookie-fixture.mjs";
import {
  decodeNativePasswordResponse,
  decodeNativeResponse
} from "../lib/platform/native-auth-contracts";

const db = new PrismaClient(),
  origin = process.env.ACCOUNT_ORIGIN!;
assert.match(origin, /^https:\/\/127\.0\.0\.1:\d+$/);
before(() => assertPortalTestDatabase(db));
beforeEach(() => db.platformAuthLimit.deleteMany());
after(() => db.$disconnect());
// Native networking has no browser-generated Origin, cookies or Fetch Metadata.
function send(
  path: string,
  method = "GET",
  body?: unknown,
  headers: Record<string, string> = {}
) {
  const data = body === undefined ? undefined : JSON.stringify(body);
  return new Promise<{
    status: number;
    headers: import("node:http").IncomingHttpHeaders;
    value: unknown;
  }>((resolve, reject) => {
    const request = httpsRequest(
      origin + path,
      {
        method,
        headers: {
          ...(data === undefined
            ? {}
            : {
                "Content-Type": "application/json",
                "Content-Length": Buffer.byteLength(data)
              }),
          ...headers
        },
        timeout: 30000
      },
      (response) => {
        let raw = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          raw += chunk;
        });
        response.once("error", reject);
        response.once("end", () => {
          try {
            resolve({
              status: response.statusCode!,
              headers: response.headers,
              value: raw ? JSON.parse(raw) : null
            });
          } catch {
            reject(new Error("Native HTTPS response was not JSON"));
          }
        });
      }
    );
    request.once("error", reject);
    request.once("timeout", () =>
      request.destroy(new Error("Native HTTPS request timed out"))
    );
    request.end(data);
  });
}
const headers = (token: string, owner?: string) => ({
  Authorization: "Bearer " + token,
  ...(owner ? { "X-Expected-Account": owner } : {})
});
function privateResponse(response: Awaited<ReturnType<typeof send>>) {
  assert.match(String(response.headers["cache-control"]), /private.*no-store/);
  assert.match(
    String(response.headers.vary),
    /Authorization.*Cookie.*X-Expected-Account/i
  );
  assert.equal(response.headers["set-cookie"], undefined);
  assert.equal(response.headers["access-control-allow-origin"], undefined);
}
async function signIn(actor: Awaited<ReturnType<typeof createPortalActor>>) {
  const response = await send("/api/platform/v1/auth/password", "POST", {
    email: actor.email,
    password: actor.password
  });
  assert.equal(response.status, 200);
  privateResponse(response);
  const value = decodeNativePasswordResponse(response.value);
  assert.equal(value.viewerId, actor.id);
  return value.data.token;
}
test("HTTPS native password, discovery, activity and logout share canonical sessions with private responses", async () => {
  const a = await createPortalActor(db, "nativehttps"),
    token = await signIn(a);
  const response = await send(
    "/api/platform/v1/session",
    "GET",
    undefined,
    headers(token)
  );
  assert.equal(response.status, 200);
  privateResponse(response);
  const wrong = await send(
    "/api/platform/v1/session/activity",
    "POST",
    { activity: "foreground" },
    headers(token, "other")
  );
  assert.equal(wrong.status, 401);
  const activity = await send(
    "/api/platform/v1/session/activity",
    "POST",
    { activity: "foreground" },
    headers(token, a.id)
  );
  assert.equal(activity.status, 200);
  assert.equal(
    decodeNativeResponse("activity", activity.value, a.id).data.owner,
    a.id
  );
  const logout = await send(
    "/api/platform/v1/session/logout",
    "POST",
    {},
    headers(token, a.id)
  );
  assert.equal(logout.status, 200);
  privateResponse(logout);
  const replacement = await signIn(a);
  assert.equal(
    (
      await send(
        "/api/platform/v1/session/logout",
        "POST",
        {},
        headers(token, a.id)
      )
    ).status,
    401
  );
  assert.equal(
    (
      await send(
        "/api/platform/v1/session",
        "GET",
        undefined,
        headers(replacement)
      )
    ).status,
    200
  );
  await db.platformSession.update({
    where: { tokenHash: hashSessionToken(replacement) },
    data: { expiresAt: new Date(Date.now() - 1) }
  });
  assert.equal(
    (
      await send(
        "/api/platform/v1/session",
        "GET",
        undefined,
        headers(replacement)
      )
    ).status,
    401
  );
});
test("HTTPS native routes deny browser credentials, unsupported methods and provider/actor injection", async () => {
  const a = await createPortalActor(db, "nativeguard"),
    token = await signIn(a);
  for (const extra of [
    { Origin: origin },
    { "Sec-Fetch-Site": "same-origin" },
    { Cookie: sessionCookieFixtureName(origin) + "=invalid" },
    { Authorization: "Bearer " + token + ", Bearer " + token }
  ] as Array<Record<string, string>>) {
    const denied = await send("/api/platform/v1/session", "GET", undefined, {
      ...headers(token),
      ...extra
    });
    assert.ok(denied.status === 401 || denied.status === 403);
    privateResponse(denied);
  }
  assert.equal(
    (await send("/api/platform/v1/session?token=" + token)).status,
    400
  );
  for (const path of [
    "/api/platform/v1/session",
    "/api/platform/v1/auth/password",
    "/api/platform/v1/session/activity",
    "/api/platform/v1/session/logout",
    "/api/platform/v1/authenticator"
  ]) {
    const denied = await send(path, "PUT", {});
    assert.equal(denied.status, 405);
    assert.equal(
      (denied.value as { error: { code: string } }).error.code,
      "method_not_allowed"
    );
    privateResponse(denied);
  }
  assert.equal(
    (
      await send("/api/platform/v1/auth/password", "POST", {
        email: a.email,
        password: a.password,
        ownerId: a.id
      })
    ).status,
    400
  );
  assert.equal(
    (
      await send("/api/platform/v1/auth/password", "POST", {
        email: a.email,
        password: a.password,
        credentialMethod: "google"
      })
    ).status,
    400
  );
});
test("HTTPS browser login keeps Origin checks and cookie issuance while bearer-only browser requests fail", async () => {
  const a = await createPortalActor(db, "nativeweb");
  const input = { operation: "login", email: a.email, password: a.password };
  assert.equal(
    (await send("/api/platform/account", "POST", input)).status,
    403
  );
  assert.equal(
    (
      await send("/api/platform/account", "POST", input, {
        Origin: "https://foreign.example"
      })
    ).status,
    403
  );
  const signedIn = await send("/api/platform/account", "POST", input, {
    Origin: origin
  });
  assert.equal(signedIn.status, 200);
  assert.ok(
    signedIn.headers["set-cookie"]?.some(
      (value) =>
        value.startsWith("__Host-church_platform_session=") &&
        value.includes("HttpOnly") &&
        value.includes("Secure")
    )
  );
  const native = await signIn(a);
  assert.equal(
    (
      await send(
        "/api/platform/session",
        "POST",
        { activity: "foreground" },
        { ...headers(native, a.id), Origin: origin }
      )
    ).status,
    401
  );
});
test("HTTPS authenticator transport respects delivery availability and verifies enabled fictional enrollment", async () => {
  const a = await createPortalActor(db, "nativemfahttp"),
    token = await signIn(a);
  const state = await send(
    "/api/platform/v1/authenticator",
    "GET",
    undefined,
    headers(token, a.id)
  );
  assert.equal(state.status, 200);
  privateResponse(state);
  const snapshot = decodeNativeResponse("authenticator", state.value, a.id);
  assert.equal(snapshot.data.googleRecentAuthentication, false);
  const command = {
    operation: "mfa-start",
    requestKey: randomUUID(),
    expectedVersion: 0,
    currentPassword: a.password
  };
  const start = await send(
    "/api/platform/v1/authenticator",
    "POST",
    command,
    headers(token, a.id)
  );
  const enabled = process.env.NATIVE_MFA_HTTP_ENABLED === "1";
  assert.equal(
    snapshot.data.available,
    enabled,
    "Fixture availability must match the declared test phase"
  );
  if (!enabled) {
    assert.equal(start.status, 503);
    assert.equal(
      (start.value as { error: { code: string } }).error.code,
      "feature_unavailable"
    );
    return;
  }
  assert.equal(start.status, 200);
  privateResponse(start);
  const enrollment = decodeNativeResponse(
    "authenticatorCommand",
    start.value,
    a.id
  );
  assert.ok(enrollment.data.enrollment?.secret);
  const row = await db.adminAuthenticator.findUniqueOrThrow({
    where: { userId: a.id }
  });
  const code = authenticatorTotp(
    openAuthenticator(a.id, row.secretCiphertext),
    BigInt(Math.floor(Date.now() / 30000))
  );
  const confirm = await send(
    "/api/platform/v1/authenticator",
    "POST",
    {
      operation: "mfa-confirm",
      requestKey: randomUUID(),
      expectedVersion: row.version,
      code
    },
    headers(token, a.id)
  );
  assert.equal(confirm.status, 200);
  assert.equal(
    decodeNativeResponse("authenticatorCommand", confirm.value, a.id).data
      .recoveryCodes?.length,
    8
  );
});
