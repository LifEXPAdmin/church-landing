import test, { after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { assertPortalTestDatabase, createPortalActor } from "./seed-portal";
import {
  notificationCategories,
  notificationPreferenceCommand,
  readNotificationPreferences,
  quietHoursEnd
} from "../lib/platform/notification-preferences";
import {
  privilegedAuthenticatorCommand,
  readPrivilegedAuthentication
} from "../lib/platform/privileged-auth";
import {
  authenticatorTotp,
  openAuthenticator
} from "../lib/platform/admin-authenticator-crypto";
import { dispatchPrivilegedNotices } from "../lib/platform/privileged-auth-notices";

const db = new PrismaClient();
const originalMode = process.env.PRIVILEGED_MFA_MODE;
after(async () => {
  if (originalMode === undefined) delete process.env.PRIVILEGED_MFA_MODE;
  else process.env.PRIVILEGED_MFA_MODE = originalMode;
  await db.$disconnect();
});

test("optional alert saves and quiet hours cannot disable or duplicate essential authenticator notices", async () => {
  await assertPortalTestDatabase(db);
  process.env.PRIVILEGED_MFA_MODE = "enroll";
  const actor = await createPortalActor(db, "securitychoices");
  const other = await createPortalActor(db, "securityother");
  const view = await readNotificationPreferences(db, actor.token);
  const minute = new Date().getUTCHours() * 60 + new Date().getUTCMinutes();
  const quietHours = {
    start: (minute + 1430) % 1440,
    end: (minute + 10) % 1440,
    timeZone: "UTC"
  };
  assert.ok(quietHoursEnd(quietHours, new Date()));
  const choice = {
    operation: "preferences",
    ownerId: actor.id,
    mutationId: randomUUID(),
    expectedVersion: view.preferences.version,
    inApp: Object.fromEntries(
      notificationCategories.map((key) => [key, false])
    ),
    pushCategories: [],
    feedbackEmail: false,
    quietHours
  };
  const saved = await notificationPreferenceCommand(db, actor.token, choice);
  const start = await privilegedAuthenticatorCommand(
    db,
    actor.token,
    {
      operation: "mfa-start",
      requestKey: randomUUID(),
      expectedVersion: 0
    },
    actor.password
  );
  const pending = await readPrivilegedAuthentication(db, actor.token);
  assert.equal(pending.factor?.confirmed, false);
  const factor = await db.adminAuthenticator.findUniqueOrThrow({
    where: { userId: actor.id }
  });
  const confirm = {
    operation: "mfa-confirm",
    requestKey: randomUUID(),
    expectedVersion: factor.version,
    code: authenticatorTotp(
      openAuthenticator(actor.id, factor.secretCiphertext),
      BigInt(Math.floor(Date.now() / 30000))
    )
  };
  const confirmed = await privilegedAuthenticatorCommand(
    db,
    actor.token,
    confirm,
    undefined
  );
  assert.equal((confirmed.recoveryCodes as string[]).length, 8);
  const security = await readPrivilegedAuthentication(db, actor.token);
  assert.equal(security.factor?.confirmed, true);
  assert.equal(security.notices.length, 1);
  assert.equal(security.notices[0].deliveredAt, null);

  // An exact optional-preference retry and a later ordinary save cannot touch the
  // security record or authenticator, even while optional delivery is silenced.
  assert.deepEqual(
    await notificationPreferenceCommand(db, actor.token, choice),
    saved
  );
  const next = await readNotificationPreferences(db, actor.token);
  assert.ok(Object.values(next.preferences.inApp).every((enabled) => !enabled));
  assert.deepEqual(next.preferences.pushCategories, []);
  assert.equal(next.preferences.feedbackEmail, false);
  await notificationPreferenceCommand(db, actor.token, {
    ...choice,
    mutationId: randomUUID(),
    expectedVersion: next.preferences.version,
    inApp: { ...choice.inApp, replies: true }
  });
  const notice = await db.privilegedSecurityNotice.findFirstOrThrow({
    where: { userId: actor.id }
  });
  assert.equal(
    await db.privilegedSecurityNotice.count({ where: { userId: actor.id } }),
    1
  );
  assert.equal(
    await db.privilegedSecurityNotice.count({ where: { userId: other.id } }),
    0
  );
  assert.equal(
    (await readPrivilegedAuthentication(db, actor.token)).factor?.version,
    confirmed.version
  );
  const attempts: object[] = [];
  const deliver = async (payload: object) => {
    attempts.push(payload);
  };
  assert.deepEqual(await dispatchPrivilegedNotices(db, actor.id, deliver), {
    delivered: 1,
    pending: 0
  });
  assert.deepEqual(await dispatchPrivilegedNotices(db, actor.id, deliver), {
    delivered: 0,
    pending: 0
  });
  assert.equal(attempts.length, 1);
  assert.deepEqual(Object.keys(attempts[0]).sort(), [
    "action",
    "createdAt",
    "email",
    "id"
  ]);
  assert.equal((attempts[0] as { id: string }).id, notice.id);
  for (const secret of [start.secret, ...(confirmed.recoveryCodes as string[])])
    assert.ok(!JSON.stringify(attempts).includes(String(secret)));
  assert.ok(
    (await readPrivilegedAuthentication(db, actor.token)).notices[0].deliveredAt
  );
});
