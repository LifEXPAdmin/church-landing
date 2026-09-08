import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { scryptSync } from "node:crypto";
import {
  createSessionToken,
  hashPassword,
  hashSessionToken,
  verifyPassword
} from "../lib/platform/auth";

const url = new URL(process.env.DATABASE_URL ?? "http://invalid");
assert.equal(process.env.ACCOUNT_TEST_ISOLATED, "1");
assert.equal(url.hostname, "127.0.0.1");
assert.equal(url.pathname, "/godschurches_security_test");
assert.notEqual(process.env.NODE_ENV, "production");
const db = new PrismaClient();
try {
  // Raw SQL deliberately runs against Stage2A, before the generated client schema exists.
  const old = await db.$queryRaw<
    Array<{
      id: string;
      passwordHash: string | null;
      credentialVersion: number;
      emailVerifiedAt: Date | null;
    }>
  >`
    SELECT "id", "passwordHash", "credentialVersion", "emailVerifiedAt"
    FROM "PlatformUser" WHERE "id" IN ('fixture-legacy', 'fixture-existing') ORDER BY "id"`;
  assert.equal(old.length, 2);
  const expectedLegacyHash = `scrypt:${"a".repeat(32)}:${scryptSync("Existing-password-1", "a".repeat(32), 64).toString("hex")}`;
  assert.equal(old[0].id, "fixture-existing");
  assert.equal(old[0].passwordHash, expectedLegacyHash);
  assert.equal(old[1].passwordHash, null);
  for (const row of old) {
    assert.equal(row.credentialVersion, 0);
    assert.equal(row.emailVerifiedAt, null);
  }
  const hash = await hashPassword("Fictional-stage2a-password-1");
  const sessionHash = hashSessionToken(createSessionToken());
  const grantHash = hashSessionToken(createSessionToken());
  await db.$executeRaw`INSERT INTO "PlatformUser"
    ("id", "updatedAt", "name", "username", "email", "passwordHash", "credentialVersion")
    VALUES ('fixture-stage2a', NOW(), 'Fictional Stage2A Account', 'fictional_stage2a',
    'fictional-stage2a@example.test', ${hash}, 0)`;
  await db.$executeRaw`INSERT INTO "PlatformSession"
    ("id", "userId", "tokenHash", "credentialVersion", "expiresAt")
    VALUES ('fixture-stage2a-session', 'fixture-stage2a', ${sessionHash}, 0, NOW() + INTERVAL '1 day')`;
  await db.$executeRaw`INSERT INTO "PlatformAccountGrant"
    ("id", "userId", "purpose", "tokenHash", "credentialVersion", "expiresAt")
    VALUES ('fixture-stage2a-grant', 'fixture-stage2a', 'RESET_PASSWORD', ${grantHash}, 0, NOW() + INTERVAL '30 minutes')`;
  const [current] = await db.$queryRaw<
    Array<{
      passwordHash: string;
      emailVerifiedAt: Date | null;
      credentialVersion: number;
    }>
  >`
    SELECT "passwordHash", "emailVerifiedAt", "credentialVersion" FROM "PlatformUser" WHERE "id" = 'fixture-stage2a'`;
  assert.equal(current.passwordHash, hash);
  assert.match(current.passwordHash, /^scrypt-v2:/);
  assert.ok(
    await verifyPassword("Fictional-stage2a-password-1", current.passwordHash)
  );
  assert.equal(current.emailVerifiedAt, null);
  assert.equal(current.credentialVersion, 0);
  console.log(
    "Raw SQL validated original legacy/password accounts and new Stage2A scrypt-v2 fixture before church migration."
  );
} finally {
  await db.$disconnect();
}
