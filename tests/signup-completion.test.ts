import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { assertPortalTestDatabase } from "./seed-portal";
import {
  signupCompletionCookie,
  confirmedSignup
} from "../lib/platform/signup-completion";
import { handleAccountRequest } from "../lib/platform/account-boundary";
import { accountConfig } from "../lib/platform/account-config";

const db = new PrismaClient();
before(() => assertPortalTestDatabase(db));
after(() => db.$disconnect());
const value = (cookie: string) => cookie.split(";")[0].split("=")[1];

test("signup presentation proof conceals identity and rejects wrong owners, forgery, future and expired replay", () => {
  const secret = "isolated-signup-cookie-secret-".repeat(3),
    now = Date.now();
  const created = signupCompletionCookie("account-one", secret, true, now);
  const duplicate = signupCompletionCookie(undefined, secret, true, now);
  assert.equal(created.length, duplicate.length);
  assert.match(
    created,
    /^__Host-gc_signup_completion=\d{13}\.[A-Za-z0-9_-]{43}; Path=\/; HttpOnly; SameSite=Lax; Max-Age=86400; Secure$/
  );
  assert.ok(!created.includes("account-one"));
  const proof = value(created);
  assert.equal(confirmedSignup(proof, "account-one", secret, now), true);
  for (const [cookie, owner, key, at] of [
    [proof, "account-two", secret, now],
    [proof, "account-one", "different-secret", now],
    [
      proof.slice(0, -1) + (proof.endsWith("a") ? "b" : "a"),
      "account-one",
      secret,
      now
    ],
    [proof, "account-one", secret, now - 1],
    [proof, "account-one", secret, now + 86400000],
    [value(duplicate), "account-one", secret, now],
    ["created=true", "account-one", secret, now]
  ] as const)
    assert.equal(confirmedSignup(cookie, owner, key, at), false);
});

test("real and duplicate registration stay neutral; only the inserted account matches the optional help proof and no authority is issued", async () => {
  const config = accountConfig();
  const post = (body: Record<string, unknown>, cookie = "") =>
    handleAccountRequest(
      db,
      new Request(config.origin + "/api/platform/account", {
        method: "POST",
        headers: {
          Origin: config.origin,
          "Content-Type": "application/json",
          Cookie: cookie
        },
        body: JSON.stringify(body)
      })
    );
  const username = "start_" + randomUUID().replaceAll("-", "").slice(0, 14);
  const input = {
    operation: "register",
    email: username + "@example.test",
    username,
    name: "Fictional QR newcomer",
    role: "EXPLORING_FAITH",
    password: "Fictional-QR-password-17",
    confirmPassword: "Fictional-QR-password-17"
  };
  const first = await post(input);
  assert.equal(first.status, 200);
  const saved = await db.platformUser.findUniqueOrThrow({
    where: { username }
  });
  const cookie = first.headers.get("set-cookie")!;
  assert.equal(
    confirmedSignup(value(cookie), saved.id, config.rateSecret),
    true
  );
  assert.ok(!cookie.includes("church_platform_session="));
  const duplicate = await post({
    ...input,
    username: "dup_" + randomUUID().replaceAll("-", "").slice(0, 14),
    name: "Must not replace",
    role: "CREATOR"
  });
  assert.equal(duplicate.status, 200);
  assert.deepEqual(await duplicate.json(), await first.json());
  assert.equal(duplicate.headers.get("set-cookie")!.length, cookie.length);
  assert.equal(
    confirmedSignup(
      value(duplicate.headers.get("set-cookie")!),
      saved.id,
      config.rateSecret
    ),
    false
  );
  assert.deepEqual(
    await db.platformUser.findUnique({ where: { id: saved.id } }),
    saved
  );
  assert.equal(saved.emailVerifiedAt, null);
  assert.equal(saved.adultAcknowledgedAt, null);
  assert.equal(
    await db.platformSession.count({ where: { userId: saved.id } }),
    0
  );
  assert.equal(
    await db.friendAcceptance.count({ where: { signupRecipientId: saved.id } }),
    0
  );
  assert.equal(
    await db.platformOperatorGrant.count({ where: { userId: saved.id } }),
    0
  );
  const denied = await post(
    { operation: "update-profile", name: "Forged owner", expectedVersion: 0 },
    cookie.split(";")[0]
  );
  assert.ok(denied.status >= 400);
  assert.equal(
    (await db.platformUser.findUniqueOrThrow({ where: { id: saved.id } })).name,
    saved.name
  );
});
