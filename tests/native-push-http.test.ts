import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { request as httpsRequest } from "node:https";
import { createHmac, randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { assertPortalTestDatabase, createPortalActor } from "./seed-portal";
import { createSessionToken } from "../lib/platform/auth";
import { accountConfig } from "../lib/platform/account-config";
import { apiFailure } from "../lib/platform/api-contracts";
import {
  decodeNativePushResponse,
  decodeNativePushRegistration,
  decodeNativePushRevocation
} from "../lib/platform/native-push-contracts";
import { sessionCookieFixtureName } from "../scripts/session-cookie-fixture.mjs";
import {
  notificationWrite,
  enqueueNotification
} from "../lib/platform/notification-outbox";
const db = new PrismaClient(),
  origin = process.env.ACCOUNT_ORIGIN!;
assert.match(origin, /^https:\/\/127\.0\.0\.1:\d+$/);
before(() => assertPortalTestDatabase(db));
after(() => db.$disconnect());
type Actor = { id: string; token: string };
function send(
  path: string,
  a: Actor | null,
  body?: unknown,
  headers: Record<string, string> = {},
  method = body === undefined ? "GET" : "POST"
) {
  const bytes =
    body === undefined ? undefined : Buffer.from(JSON.stringify(body));
  return new Promise<{
    status: number;
    headers: import("node:http").IncomingHttpHeaders;
    body: unknown;
  }>((ok, no) => {
    const request = httpsRequest(
      origin + path,
      {
        method,
        servername: "localhost",
        timeout: 15000,
        headers: {
          ...(a
            ? { authorization: `Bearer ${a.token}`, "X-Expected-Account": a.id }
            : {}),
          ...(bytes
            ? {
                "Content-Type": "application/json",
                "Content-Length": String(bytes.length)
              }
            : {}),
          ...headers
        }
      },
      (response) => {
        const chunks: Buffer[] = [];
        let length = 0;
        response.on("data", (chunk) => {
          length += chunk.length;
          if (length > 65536)
            request.destroy(Error("Oversized fictional HTTP result"));
          else chunks.push(chunk);
        });
        response.once("error", no);
        response.once("end", () => {
          try {
            ok({
              status: response.statusCode!,
              headers: response.headers,
              body: JSON.parse(Buffer.concat(chunks).toString())
            });
          } catch (error) {
            no(error);
          }
        });
      }
    );
    request.once("error", no);
    request.once("timeout", () =>
      request.destroy(Error("Fictional native push HTTPS timeout"))
    );
    request.end(bytes);
  });
}
const path = (part: string) => `/api/platform/v1/push/${part}`;
function denied(
  result: Awaited<ReturnType<typeof send>>,
  status: number,
  code: string
) {
  assert.equal(result.status, status, JSON.stringify(result.body));
  assert.equal(apiFailure.parse(result.body).error.code, code);
  assert.match(String(result.headers["cache-control"]), /no-store/);
}
async function input(a: Actor, installationSecret = createSessionToken()) {
  const prepared = await send(path("prepare"), a, { installationSecret });
  assert.equal(prepared.status, 200, JSON.stringify(prepared.body));
  const data = decodeNativePushResponse("prepare", prepared.body, a.id).data;
  return {
    id: randomUUID(),
    mutationId: randomUUID(),
    installationSecret,
    expectedInstallationVersion: data.installationVersion,
    recoveryEpoch: data.recoveryEpoch,
    provider: "EXPO" as const,
    platform: "IOS" as const,
    token: `ExpoPushToken[${randomUUID()}]`,
    label: "Fictional HTTPS device"
  };
}
if (process.env.NATIVE_PUSH_HTTP_ENABLED === "1") {
  test("HTTPS native registration, exact retry, current listing and removal share strict receipts", async () => {
    const a = await createPortalActor(db, "pushhttp"),
      body = await input(a);
    const first = await send(path("register"), a, body);
    assert.equal(first.status, 200, JSON.stringify(first.body));
    decodeNativePushRegistration(first.body, a.id, body);
    assert.match(String(first.headers["cache-control"]), /no-store/);
    assert.equal(first.headers["set-cookie"], undefined);
    assert.deepEqual((await send(path("register"), a, body)).body, first.body);
    denied(
      await send(path("register"), a, { ...body, label: "Changed" }),
      409,
      "conflict"
    );
    const listed = await send(path("devices"), a);
    assert.equal(listed.status, 200);
    const list = decodeNativePushResponse("list", listed.body, a.id).data;
    assert.equal(list.devices[0].id, body.id);
    assert.equal(list.devices[0].isCurrentSession, true);
    assert.ok(!JSON.stringify(list).includes(body.token));
    assert.ok(!JSON.stringify(list).includes(body.installationSecret));
    const removal = {
      id: body.id,
      mutationId: randomUUID(),
      expectedVersion: 1
    };
    const removed = await send(path("revoke"), a, removal);
    assert.equal(removed.status, 200, JSON.stringify(removed.body));
    decodeNativePushRevocation(removed.body, a.id, removal);
    assert.deepEqual(
      (await send(path("revoke"), a, removal)).body,
      removed.body
    );
    denied(await send(path("register"), a, body), 409, "conflict");
  });
  test("HTTPS native boundary rejects browser substitution, wrong owner, queries and unsupported methods", async () => {
    const a = await createPortalActor(db, "pushhttpa"),
      b = await createPortalActor(db, "pushhttpb"),
      body = { installationSecret: createSessionToken() };
    denied(await send(path("prepare"), null, body), 401, "unauthenticated");
    denied(
      await send(path("prepare"), a, body, { "X-Expected-Account": b.id }),
      401,
      "account_changed"
    );
    denied(
      await send(path("prepare"), a, body, { Origin: origin }),
      403,
      "forbidden"
    );
    denied(
      await send(path("prepare"), a, body, { "Sec-Fetch-Site": "same-origin" }),
      403,
      "forbidden"
    );
    denied(
      await send(path("prepare"), a, body, {
        Cookie: `${sessionCookieFixtureName(origin)}=${a.token}`
      }),
      401,
      "unauthenticated"
    );
    denied(
      await send(path("prepare") + "?secret=forbidden", a, body),
      400,
      "validation"
    );
    denied(
      await send(path("prepare"), a, body, { "X-API-Version": "2" }),
      426,
      "unsupported_version"
    );
    denied(
      await send(path("prepare"), a, { ...body, ownerId: b.id }),
      400,
      "validation"
    );
    denied(
      await send(path("prepare"), a, { installationSecret: "x".repeat(9000) }),
      400,
      "validation"
    );
    denied(
      await send(path("devices"), a, undefined, {}, "DELETE"),
      405,
      "method_not_allowed"
    );
    denied(await send(path("devices"), a, {}, {}, "GET"), 400, "validation");
    assert.equal(
      await db.pushSubscription.count({ where: { ownerId: a.id } }),
      0
    );
  });
  test("HTTPS A to B device replacement makes A's captured registration and removal obsolete", async () => {
    const a = await createPortalActor(db, "pushswitcha"),
      b = await createPortalActor(db, "pushswitchb"),
      first = await input(a);
    assert.equal((await send(path("register"), a, first)).status, 200);
    const replacement = await input(b, first.installationSecret);
    assert.equal((await send(path("register"), b, replacement)).status, 200);
    denied(await send(path("register"), a, first), 409, "conflict");
    denied(
      await send(path("revoke"), a, {
        id: replacement.id,
        mutationId: randomUUID(),
        expectedVersion: 1
      }),
      404,
      "not_found"
    );
    assert.equal(
      (
        await db.pushSubscription.findUniqueOrThrow({
          where: { id: replacement.id }
        })
      ).revokedAt,
      null
    );
  });
  test("HTTPS notification opening rechecks its account and current immutable device", async () => {
    const a = await createPortalActor(db, "pushopena"),
      b = await createPortalActor(db, "pushopenb"),
      body = await input(a);
    assert.equal((await send(path("register"), a, body)).status, 200);
    const delivery = await notificationWrite(db, async (tx) => {
      const event = await tx.socialEvent.create({
        data: {
          key: `push-http:${randomUUID()}`,
          kind: "PUSH_TEST",
          actorId: a.id,
          recipientId: a.id
        }
      });
      await enqueueNotification(tx, event, body.id);
      return tx.notificationDelivery.findFirstOrThrow({
        where: { eventId: event.id }
      });
    });
    const opened = await send(path("open"), a, { deliveryId: delivery.id });
    assert.equal(opened.status, 200, JSON.stringify(opened.body));
    const value = decodeNativePushResponse("open", opened.body, a.id).data;
    assert.equal(value.requiresWeb, true);
    assert.ok(value.href.startsWith("/platform/"));
    denied(
      await send(path("open"), b, { deliveryId: delivery.id }),
      404,
      "not_found"
    );
    assert.equal(
      (
        await send(path("revoke"), a, {
          id: body.id,
          mutationId: randomUUID(),
          expectedVersion: 1
        })
      ).status,
      200
    );
    denied(
      await send(path("open"), a, { deliveryId: delivery.id }),
      404,
      "not_found"
    );
  });
  test("HTTPS native device writes consume the same notifications bucket as the website", async () => {
    const a = await createPortalActor(db, "pushrate"),
      body = await input(a);
    const key = createHmac(
      "sha256",
      accountConfig().rateSecret + ":notifications"
    )
      .update(`post-workspace:${a.id}`)
      .digest("hex");
    assert.equal(
      (await db.platformAuthLimit.findUniqueOrThrow({ where: { key } })).hits,
      1
    );
    await db.platformAuthLimit.update({
      where: { key },
      data: { hits: 240, expiresAt: new Date(Date.now() + 900000) }
    });
    const blocked = await send(path("register"), a, body);
    denied(blocked, 429, "rate_limited");
    assert.equal(blocked.headers["retry-after"], "900");
    const web = await send(
      "/api/platform/notifications",
      null,
      {
        operation: "unsubscribe",
        ownerId: a.id,
        mutationId: randomUUID(),
        id: body.id,
        expectedVersion: 1
      },
      {
        Origin: origin,
        Cookie: `${sessionCookieFixtureName(origin)}=${a.token}`,
        "X-Expected-Account": a.id
      }
    );
    assert.equal(web.status, 429, JSON.stringify(web.body));
    assert.equal(
      await db.pushSubscription.findUnique({ where: { id: body.id } }),
      null
    );
  });
} else {
  test("HTTPS default-off native delivery keeps cleanup available and reports truthful preparation", async () => {
    const a = await createPortalActor(db, "pushoff");
    const prepared = await send(path("prepare"), a, {
      installationSecret: createSessionToken()
    });
    assert.equal(prepared.status, 200, JSON.stringify(prepared.body));
    const data = decodeNativePushResponse("prepare", prepared.body, a.id).data;
    assert.equal(data.available, false);
    assert.equal(data.projectId, null);
    assert.equal((await send(path("devices"), a)).status, 200);
    denied(
      await send(path("register"), a, await input(a)),
      503,
      "feature_unavailable"
    );
    denied(
      await send(path("revoke"), a, {
        id: randomUUID(),
        mutationId: randomUUID(),
        expectedVersion: 1
      }),
      404,
      "not_found"
    );
  });
}
