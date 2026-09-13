import webpush from "web-push";
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { createECDH, randomUUID, randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { assertPortalTestDatabase, createPortalActor } from "./seed-portal";
import { pushSubscriptionCommand } from "../lib/platform/push-subscriptions";
import { createSessionToken, hashSessionToken } from "../lib/platform/auth";
import {
  handleAccountRequest,
  SESSION_COOKIE
} from "../lib/platform/account-boundary";
import { accountConfig } from "../lib/platform/account-config";
const db = new PrismaClient();
before(() => assertPortalTestDatabase(db));
after(() => db.$disconnect());
test("normal password account switching revokes the replaced browser session and its push keys before setting the new cookie", async () => {
  const names = [
    "PUSH_ENABLED",
    "PUSH_VAPID_PUBLIC_KEY",
    "PUSH_VAPID_PRIVATE_KEY",
    "PUSH_VAPID_SUBJECT"
  ];
  const old = Object.fromEntries(
    names.map((name) => [name, process.env[name]])
  );
  try {
    const vapid = webpush.generateVAPIDKeys();
    const keys = createECDH("prime256v1");
    keys.generateKeys();
    Object.assign(process.env, {
      PUSH_ENABLED: "true",
      PUSH_VAPID_PUBLIC_KEY: vapid.publicKey,
      PUSH_VAPID_PRIVATE_KEY: vapid.privateKey,
      PUSH_VAPID_SUBJECT: "https://example.test/contact"
    });
    const a = await createPortalActor(db, "oldphone"),
      b = await createPortalActor(db, "newphone");
    const saved = await pushSubscriptionCommand(db, a.token, {
      operation: "subscribe",
      ownerId: a.id,
      mutationId: randomUUID(),
      binding: createSessionToken(),
      label: "Fictional phone",
      subscription: {
        endpoint: "https://fcm.googleapis.com/fcm/send/" + randomUUID(),
        keys: {
          p256dh: keys.getPublicKey().toString("base64url"),
          auth: randomBytes(16).toString("base64url")
        }
      }
    });
    const origin = accountConfig().origin;
    const result = await handleAccountRequest(
      db,
      new Request(origin + "/api/platform/account", {
        method: "POST",
        headers: {
          origin,
          cookie: `${SESSION_COOKIE}=${a.token}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          operation: "login",
          email: b.email,
          password: b.password
        })
      })
    );
    assert.equal(result.status, 200);
    assert.match(result.headers.get("set-cookie")!, /church_platform_session=/);
    assert.equal(
      await db.platformSession.count({
        where: { tokenHash: hashSessionToken(a.token) }
      }),
      0
    );
    const device = await db.pushSubscription.findUniqueOrThrow({
      where: { id: saved.id }
    });
    assert.ok(device.revokedAt);
    assert.equal(device.endpoint, null);
    assert.equal(device.p256dh, null);
    assert.equal(device.auth, null);
    assert.equal(
      await db.platformSession.count({
        where: { tokenHash: hashSessionToken(b.token) }
      }),
      1,
      "Another existing sign-in stays active"
    );
  } finally {
    for (const name of names)
      if (old[name] === undefined) delete process.env[name];
      else process.env[name] = old[name];
  }
});
