import test, { after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { createPortalActor, seedOperatorGrants } from "./seed-portal";
import {
  adminAuthenticatorCommand,
  adminGrantCommand,
  readAdminAccess
} from "../lib/platform/admin-access";
import {
  authenticatorBase32,
  authenticatorTotp,
  openAuthenticator,
  sealAuthenticator,
  verifyAuthenticatorCode
} from "../lib/platform/admin-authenticator-crypto";
import { PortalError } from "../lib/platform/portal-policy";
import { AccountError } from "../lib/platform/account-error";
import {
  adminAccountLookup,
  readAdminAudit
} from "../lib/platform/admin-operations";
const db = new PrismaClient();
after(() => db.$disconnect());
const denied = (p: Promise<unknown>, status = 404) =>
  assert.rejects(
    p,
    (e: unknown) => e instanceof PortalError && e.status === status
  );
test("authenticator algorithm matches RFC 6238 vectors and encrypted keys reject tampering and account substitution", () => {
  const secret = Buffer.from("12345678901234567890");
  for (const [seconds, expected] of [
    [59, "94287082"],
    [1111111109, "07081804"],
    [1111111111, "14050471"],
    [1234567890, "89005924"],
    [2000000000, "69279037"],
    [20000000000, "65353130"]
  ] as const)
    assert.equal(
      authenticatorTotp(secret, BigInt(Math.floor(seconds / 30)), 8),
      expected
    );
  assert.equal(authenticatorBase32(Buffer.from("foobar")), "MZXW6YTBOI");
  const sealed = sealAuthenticator("fixture-admin", secret);
  assert.deepEqual(openAuthenticator("fixture-admin", sealed), secret);
  assert.throws(() => openAuthenticator("other-admin", sealed));
  assert.throws(() =>
    openAuthenticator("fixture-admin", sealed.slice(0, -3) + "AAA")
  );
  const counter = BigInt(Math.floor(Date.now() / 30000)),
    code = authenticatorTotp(secret, counter);
  assert.equal(
    verifyAuthenticatorCode(secret, code, counter - BigInt(1)),
    counter
  );
  assert.throws(() => verifyAuthenticatorCode(secret, code, counter));
});
test("new access changes require current manager generation, fresh credentials and a consumed second factor", async () => {
  const manager = await createPortalActor(db, "accessmgr"),
    target = await createPortalActor(db, "accessuser"),
    ordinary = await createPortalActor(db, "accessplain");
  await seedOperatorGrants(db, manager, [
    "MANAGE_ADMIN_ACCESS",
    "VIEW_ADMIN_AUDIT"
  ]);
  await denied(readAdminAccess(db, ordinary.token));
  const before = await readAdminAccess(db, manager.token, target.username);
  assert.equal(before.authenticator, null);
  assert.equal(before.target?.grants.length, 0);
  const start = {
    operation: "mfa-start",
    requestKey: randomUUID(),
    managerVersion: 1,
    expectedVersion: 0,
    currentPassword: manager.password
  };
  await assert.rejects(
    adminAuthenticatorCommand(db, manager.token, start, "wrong password"),
    (e) => e instanceof AccountError && e.code === "credentials"
  );
  const setup = await adminAuthenticatorCommand(
    db,
    manager.token,
    start,
    manager.password
  );
  assert.ok("secret" in setup);
  assert.equal(typeof setup.secret, "string");
  assert.deepEqual(
    await adminAuthenticatorCommand(db, manager.token, start, manager.password),
    setup
  );
  const factor = await db.adminAuthenticator.findUniqueOrThrow({
      where: { userId: manager.id }
    }),
    secret = openAuthenticator(manager.id, factor.secretCiphertext),
    counter = BigInt(Math.floor(Date.now() / 30000));
  const confirm = {
    operation: "mfa-confirm",
    requestKey: randomUUID(),
    managerVersion: 1,
    expectedVersion: 1,
    code: authenticatorTotp(secret, counter - BigInt(1))
  };
  const completed = await adminAuthenticatorCommand(
    db,
    manager.token,
    confirm,
    undefined
  );
  assert.ok("recoveryCodes" in completed);
  assert.equal((completed.recoveryCodes as string[]).length, 8);
  assert.deepEqual(
    await adminAuthenticatorCommand(db, manager.token, confirm, undefined),
    completed
  );
  const snapshot = await readAdminAccess(db, manager.token, target.username);
  assert.equal(snapshot.authenticator?.confirmed, true);
  assert.ok(!JSON.stringify(snapshot).includes(String(setup.secret)));
  assert.ok(
    !JSON.stringify(
      await db.adminOperation.findMany({ where: { actorId: manager.id } })
    ).includes(manager.password)
  );
  const change = {
    operation: "grant",
    requestKey: randomUUID(),
    managerVersion: 1,
    expectedVersion: 0,
    username: target.username,
    capability: "VIEW_OPERATIONAL_HEALTH",
    enabled: true,
    reason: "Explicit fictional health duty for this isolated fixture.",
    currentPassword: manager.password,
    code: authenticatorTotp(secret, counter)
  };
  const granted = await adminGrantCommand(
    db,
    manager.token,
    change,
    manager.password
  );
  assert.equal(granted.version, 1);
  assert.deepEqual(
    await adminGrantCommand(db, manager.token, change, manager.password),
    granted
  );
  await denied(
    adminGrantCommand(
      db,
      manager.token,
      { ...change, reason: "Altered retry" },
      manager.password
    ),
    409
  );
  await denied(
    adminGrantCommand(
      db,
      manager.token,
      { ...change, requestKey: randomUUID(), capability: "LOOKUP_ACCOUNTS" },
      manager.password
    ),
    400
  );
  const audit = await readAdminAudit(db, manager.token);
  assert.ok(
    audit.rows.some((r) => r.sourceId === target.id && r.action === "grant")
  );
  assert.ok(!JSON.stringify(audit).includes(String(setup.secret)));
  assert.ok(!JSON.stringify(audit).includes(change.code));
  await db.platformOperatorGrant.update({
    where: {
      userId_capability: {
        userId: manager.id,
        capability: "MANAGE_ADMIN_ACCESS"
      }
    },
    data: { revokedAt: new Date() }
  });
  await denied(adminGrantCommand(db, manager.token, change, manager.password));
});
test("recovery replaces the factor, consumes old codes and keeps a changed credential or revoked manager from resuming enrollment", async () => {
  const manager = await createPortalActor(db, "recovermgr");
  await seedOperatorGrants(db, manager, ["MANAGE_ADMIN_ACCESS"]);
  const start = {
    operation: "mfa-start",
    requestKey: randomUUID(),
    managerVersion: 1,
    expectedVersion: 0,
    currentPassword: manager.password
  };
  await adminAuthenticatorCommand(db, manager.token, start, manager.password);
  const row = await db.adminAuthenticator.findUniqueOrThrow({
      where: { userId: manager.id }
    }),
    secret = openAuthenticator(manager.id, row.secretCiphertext),
    code = authenticatorTotp(
      secret,
      BigInt(Math.floor(Date.now() / 30000)) - BigInt(1)
    );
  const confirmed = await adminAuthenticatorCommand(
    db,
    manager.token,
    {
      operation: "mfa-confirm",
      requestKey: randomUUID(),
      managerVersion: 1,
      expectedVersion: 1,
      code
    },
    undefined
  );
  assert.ok("recoveryCodes" in confirmed);
  const recoveryCode = (confirmed.recoveryCodes as string[])[0];
  const recover = {
    operation: "mfa-recover",
    requestKey: randomUUID(),
    managerVersion: 1,
    expectedVersion: 2,
    currentPassword: manager.password,
    recoveryCode
  };
  const replaced = await adminAuthenticatorCommand(
    db,
    manager.token,
    recover,
    manager.password
  );
  assert.ok("secret" in replaced);
  assert.equal(typeof replaced.secret, "string");
  assert.deepEqual(
    await adminAuthenticatorCommand(
      db,
      manager.token,
      recover,
      manager.password
    ),
    replaced
  );
  const pending = await db.adminAuthenticator.findUniqueOrThrow({
    where: { userId: manager.id }
  });
  assert.equal(pending.confirmedAt, null);
  assert.equal(pending.recoveryHashes.length, 0);
  assert.notEqual(pending.secretCiphertext, row.secretCiphertext);
  await denied(
    adminAuthenticatorCommand(
      db,
      manager.token,
      { ...recover, requestKey: randomUUID(), expectedVersion: 3 },
      manager.password
    ),
    403
  );
  await db.adminAuthenticator.update({
    where: { userId: manager.id },
    data: { credentialVersion: pending.credentialVersion + 1 }
  });
  await denied(
    adminAuthenticatorCommand(
      db,
      manager.token,
      {
        operation: "mfa-confirm",
        requestKey: randomUUID(),
        managerVersion: 1,
        expectedVersion: 3,
        code
      },
      undefined
    ),
    409
  );
});
test("operational lookup and access audit have independent capabilities and do not copy private contacts or account history", async () => {
  const operator = await createPortalActor(db, "lookupop"),
    person = await createPortalActor(db, "lookuptgt");
  await seedOperatorGrants(db, operator, ["LOOKUP_ACCOUNTS"]);
  const input = {
    operation: "lookup",
    requestKey: randomUUID(),
    username: person.username,
    purpose: "SUPPORT"
  };
  const result = await adminAccountLookup(db, operator.token, input);
  assert.equal(result.person?.id, person.id);
  assert.equal(result.person?.verified, true);
  assert.ok(!JSON.stringify(result).includes(person.email));
  assert.ok(!JSON.stringify(result).includes(person.password));
  assert.deepEqual(await adminAccountLookup(db, operator.token, input), result);
  await denied(readAdminAccess(db, operator.token));
  await denied(readAdminAudit(db, operator.token));
  await denied(adminAccountLookup(db, person.token, input));
  const audit = await db.adminOperation.findMany({
    where: { actorId: operator.id, action: "lookup" }
  });
  assert.equal(audit.length, 1);
  assert.ok(!JSON.stringify(audit).includes(person.username));
});
