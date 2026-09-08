import test, { after } from "node:test";
import assert from "node:assert/strict";
import { PrismaClient, type AccountGrantPurpose } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  authenticatePassword,
  issueAuthenticatedSession,
  registerAccount,
  loginAccount,
  changeAccountPassword,
  readAccountSession,
  requestAccountGrant,
  consumeAccountGrant
} from "../lib/platform/accounts";
import {
  hashPassword,
  hashSessionToken,
  validatePassword,
  verifyPassword,
  createSessionToken
} from "../lib/platform/auth";
import { accountConfig } from "../lib/platform/account-config";
import { allowAccountAttempt } from "../lib/platform/account-limits";
import { deliverAccountGrant } from "../lib/platform/account-delivery";

accountConfig();
assert.equal(process.env.ACCOUNT_TEST_ISOLATED, "1");
const db = new PrismaClient();
after(async () => db.$disconnect());
const password = "Fixture-password-1";
const newPassword = "Fixture-password-2";
async function account() {
  const id = randomUUID().replaceAll("-", "").slice(0, 15);
  const email = `${id}@example.test`;
  await registerAccount(db, {
    name: "Synthetic Account",
    username: id,
    email,
    password,
    confirmPassword: password,
    role: "BELIEVER"
  });
  return await db.platformUser.findUniqueOrThrow({ where: { email } });
}
async function grant(email: string, purpose: AccountGrantPurpose) {
  let token = "";
  await requestAccountGrant(
    db,
    email,
    purpose,
    async (_email, _purpose, value) => {
      token = value;
    }
  );
  assert.ok(token);
  return token;
}

test("synthetic upgrade preserves prior data and leaves verification truthful", async () => {
  const legacy = await db.platformUser.findUniqueOrThrow({
    where: { id: "fixture-legacy" }
  });
  const existing = await db.platformUser.findUniqueOrThrow({
    where: { id: "fixture-existing" }
  });
  assert.equal(legacy.passwordHash, null);
  assert.equal(legacy.emailVerifiedAt, null);
  assert.equal(existing.emailVerifiedAt, null);
  assert.equal(existing.credentialVersion, 0);
  assert.ok(await verifyPassword("Existing-password-1", existing.passwordHash));
  assert.equal(
    (await db.platformPost.findUniqueOrThrow({ where: { id: "fixture-post" } }))
      .authorId,
    existing.id
  );
  assert.equal(await db.platformPostComment.count(), 1);
  assert.equal(await db.platformFollow.count(), 1);
  assert.equal(await db.platformPostLike.count(), 1);
});
test("duplicate passwordless and password registrations never overwrite or create sessions", async () => {
  for (const id of ["fixture-legacy", "fixture-existing"]) {
    const before = await db.platformUser.findUniqueOrThrow({ where: { id } });
    const sessions = await db.platformSession.count({ where: { userId: id } });
    await registerAccount(db, {
      name: "Attempted rewrite",
      email: before.email,
      username: `unused_${id.replaceAll("-", "_")}`,
      role: "BUILDER",
      password,
      confirmPassword: password
    });
    assert.deepEqual(
      await db.platformUser.findUnique({ where: { id } }),
      before
    );
    assert.equal(
      await db.platformSession.count({ where: { userId: id } }),
      sessions
    );
  }
  await assert.rejects(loginAccount(db, "legacy@example.test", password, null));
});
test("legacy credentials and Unicode policy remain compatible; malformed/oversized hashes and input rejected", async () => {
  const token = await loginAccount(
    db,
    "existing@example.test",
    "Existing-password-1",
    null
  );
  assert.equal((await readAccountSession(db, token))?.id, "fixture-existing");
  for (const p of ["x".repeat(129), "x", {}, null])
    await assert.rejects(loginAccount(db, "existing@example.test", p, null));
  const unicode = "🙏".repeat(64);
  assert.equal(validatePassword(unicode), null);
  assert.ok(await verifyPassword(unicode, await hashPassword(unicode)));
  assert.equal(await verifyPassword(password, "scrypt:bad:bad"), false);
  assert.equal(
    await verifyPassword(password, "scrypt-v2:" + "f".repeat(500)),
    false
  );
  assert.equal(await readAccountSession(db, "oversized".repeat(100)), null);
});
test("wrong current password preserves credentials, sessions and recovery grants", async () => {
  const user = await account();
  const token = await loginAccount(db, user.email, password, null);
  const recovery = await grant(user.email, "RESET_PASSWORD");
  await assert.rejects(
    changeAccountPassword(
      db,
      token,
      "Incorrect-password",
      newPassword,
      newPassword
    )
  );
  assert.ok(await readAccountSession(db, token));
  assert.equal(
    (await db.platformUser.findUniqueOrThrow({ where: { id: user.id } }))
      .passwordHash,
    user.passwordHash
  );
  assert.equal(
    (
      await db.platformAccountGrant.findUniqueOrThrow({
        where: { tokenHash: hashSessionToken(recovery) }
      })
    ).consumedAt,
    null
  );
});
test("password change revokes all sessions/grants and closes the validated-old-password login race", async () => {
  const user = await account();
  const tokens = await Promise.all([
    loginAccount(db, user.email, password, null),
    loginAccount(db, user.email, password, null)
  ]);
  const snapshot = await authenticatePassword(db, user.email, password);
  const recovery = await grant(user.email, "RESET_PASSWORD");
  await changeAccountPassword(
    db,
    tokens[0],
    password,
    newPassword,
    newPassword
  );
  // Deterministic interleaving: old password validated, change committed, delayed session insert.
  await assert.rejects(issueAuthenticatedSession(db, snapshot, null));
  for (const token of tokens)
    assert.equal(await readAccountSession(db, token), null);
  await assert.rejects(loginAccount(db, user.email, password, null));
  await assert.rejects(
    consumeAccountGrant(db, recovery, "RESET_PASSWORD", password, password)
  );
  assert.ok(
    await readAccountSession(
      db,
      await loginAccount(db, user.email, newPassword, null)
    )
  );
});
test("concurrent actual login/password-change operations cannot leave stale sessions", async () => {
  const user = await account();
  const initial = await loginAccount(db, user.email, password, null);
  const [changed, logins] = await Promise.all([
    changeAccountPassword(db, initial, password, newPassword, newPassword),
    Promise.allSettled(
      Array.from({ length: 4 }, () =>
        loginAccount(db, user.email, password, null)
      )
    )
  ]);
  assert.equal(changed, undefined);
  for (const login of logins)
    if (login.status === "fulfilled")
      assert.equal(await readAccountSession(db, login.value), null);
  assert.equal(
    await db.platformSession.count({ where: { userId: user.id } }),
    0
  );
});
test("recovery request leaves access intact; invalid/expired/wrong-purpose grants cannot reset", async () => {
  const user = await account();
  const session = await loginAccount(db, user.email, password, null);
  const expired = await grant(user.email, "RESET_PASSWORD");
  await db.platformAccountGrant.update({
    where: { tokenHash: hashSessionToken(expired) },
    data: { expiresAt: new Date(0) }
  });
  const verification = await grant(user.email, "VERIFY_EMAIL");
  for (const token of [expired, verification, "invalid", createSessionToken()])
    await assert.rejects(
      consumeAccountGrant(db, token, "RESET_PASSWORD", newPassword, newPassword)
    );
  assert.ok(await readAccountSession(db, session));
  assert.equal(
    (await db.platformUser.findUniqueOrThrow({ where: { id: user.id } }))
      .passwordHash,
    user.passwordHash
  );
});
test("one concurrent recovery wins, revokes every grant/session and does not implicitly verify email", async () => {
  const user = await account();
  const session = await loginAccount(db, user.email, password, null);
  const token = await grant(user.email, "RESET_PASSWORD");
  const other = await grant(user.email, "RESET_PASSWORD");
  const verification = await grant(user.email, "VERIFY_EMAIL");
  const results = await Promise.allSettled(
    Array.from({ length: 4 }, () =>
      consumeAccountGrant(db, token, "RESET_PASSWORD", newPassword, newPassword)
    )
  );
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  for (const used of [token, other])
    await assert.rejects(
      consumeAccountGrant(db, used, "RESET_PASSWORD", password, password)
    );
  await assert.rejects(consumeAccountGrant(db, verification, "VERIFY_EMAIL"));
  assert.equal(await readAccountSession(db, session), null);
  assert.equal(
    (await db.platformUser.findUniqueOrThrow({ where: { id: user.id } }))
      .emailVerifiedAt,
    null
  );
  await assert.rejects(loginAccount(db, user.email, password, null));
  assert.ok(await loginAccount(db, user.email, newPassword, null));
});
test("verification is purpose-bound and one-use without changing password/session authority", async () => {
  const user = await account();
  const session = await loginAccount(db, user.email, password, null);
  const reset = await grant(user.email, "RESET_PASSWORD");
  await assert.rejects(consumeAccountGrant(db, reset, "VERIFY_EMAIL"));
  const token = await grant(user.email, "VERIFY_EMAIL");
  await consumeAccountGrant(db, token, "VERIFY_EMAIL");
  await assert.rejects(consumeAccountGrant(db, token, "VERIFY_EMAIL"));
  const after = await db.platformUser.findUniqueOrThrow({
    where: { id: user.id }
  });
  assert.ok(after.emailVerifiedAt);
  assert.equal(after.passwordHash, user.passwordHash);
  assert.equal(after.role, user.role);
  assert.ok(await readAccountSession(db, session));
});
test("legacy account can recover only with a valid delivered grant and retains its content", async () => {
  const token = await grant("legacy@example.test", "RESET_PASSWORD");
  await consumeAccountGrant(
    db,
    token,
    "RESET_PASSWORD",
    newPassword,
    newPassword
  );
  assert.equal(
    (
      await readAccountSession(
        db,
        await loginAccount(db, "legacy@example.test", newPassword, null)
      )
    )?.id,
    "fixture-legacy"
  );
  assert.equal(
    (
      await db.platformPostComment.findUniqueOrThrow({
        where: { id: "fixture-comment" }
      })
    ).authorId,
    "fixture-legacy"
  );
});
test("persistent rate limits hold under concurrency and across service instances", async () => {
  await db.platformAuthLimit.deleteMany();
  const results = await Promise.all(
    Array.from({ length: 12 }, () =>
      allowAccountAttempt(
        db,
        "fixture-rate-secret",
        "request-reset",
        "fixture-ip",
        "fixture-subject"
      )
    )
  );
  assert.equal(results.filter(Boolean).length, 3);
  const another = new PrismaClient();
  try {
    assert.equal(
      await allowAccountAttempt(
        another,
        "fixture-rate-secret",
        "request-reset",
        "fixture-ip",
        "fixture-subject"
      ),
      false
    );
  } finally {
    await another.$disconnect();
  }
  const rows = await db.platformAuthLimit.findMany();
  assert.ok(rows.every((row) => /^[a-f0-9]{64}$/.test(row.key)));
  assert.ok(rows.every((row) => row.hits <= 121));
});
test("test delivery is file-only, fragment links never expose tokens in URL paths/query, production refuses sink", async () => {
  const user = await account();
  await requestAccountGrant(
    db,
    user.email,
    "RESET_PASSWORD",
    deliverAccountGrant
  );
  const dir = process.env.ACCOUNT_TEST_SINK_DIR!;
  const files = await readdir(dir);
  const message = JSON.parse(await readFile(join(dir, files.at(-1)!), "utf8"));
  const url = new URL(message.url);
  assert.equal(url.search, "");
  assert.equal(url.pathname, "/platform/account/recover");
  assert.ok(url.hash.includes("token="));
  assert.throws(() =>
    accountConfig({
      ...process.env,
      NODE_ENV: "production",
      ACCOUNT_ORIGIN: "https://godschurches.com"
    })
  );
  assert.throws(() => accountConfig({ ...process.env, VERCEL: "1" }));
  assert.throws(() =>
    accountConfig({
      ...process.env,
      DATABASE_URL: "postgresql://fixture@remote.invalid/production"
    })
  );
  assert.throws(() =>
    accountConfig({
      ...process.env,
      ACCOUNT_ORIGIN: "https://attacker.invalid/path"
    })
  );
  assert.equal(
    accountConfig({
      ...process.env,
      NODE_ENV: "production",
      ACCOUNT_ORIGIN: "https://godschurches.com",
      ACCOUNT_DELIVERY_MODE: "disabled"
    }).delivery,
    "disabled"
  );
  const tokenHash = new URLSearchParams(url.hash.slice(1)).get("token")!;
  assert.equal(
    await db.platformAccountGrant.count({ where: { tokenHash } }),
    0
  );
});
