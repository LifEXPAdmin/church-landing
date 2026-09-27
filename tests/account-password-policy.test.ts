import test, { after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import {
  registerAccount,
  loginAccount,
  changeAccountPassword,
  requestAccountGrant,
  consumeAccountGrant,
  readAccountSession,
  AccountError
} from "../lib/platform/accounts";
import {
  hashPassword,
  hashSessionToken,
  createSessionToken,
  verifyPassword
} from "../lib/platform/auth";
import {
  handleAccountRequest,
  SESSION_COOKIE
} from "../lib/platform/account-boundary";
import { assertPortalTestDatabase } from "./seed-portal";

const db = new PrismaClient({ log: [{ level: "query", emit: "event" }] });
let queries = 0;
db.$on("query", () => queries++);
after(() => db.$disconnect());
beforeEach(async () => {
  await assertPortalTestDatabase(db);
  await db.platformAuthLimit.deleteMany();
});
const safePassword = "Fictional-orbit-violet-42!";
const nextPassword = "Fictional-river-jupiter-79!";
const code = (expected: AccountError["code"]) => (error: unknown) =>
  error instanceof AccountError && error.code === expected;
const details = () => {
  const username = "policy_" + randomBytes(6).toString("hex");
  return {
    name: "Fictional Policy Account",
    username,
    email: username + "@example.test",
    role: "BELIEVER",
    password: safePassword,
    confirmPassword: safePassword
  };
};
async function actor() {
  const input = details();
  await registerAccount(db, input);
  const user = await db.platformUser.findUniqueOrThrow({
    where: { username: input.username }
  });
  return {
    ...user,
    token: await loginAccount(db, input.email, safePassword, null)
  };
}
async function grant(
  email: string,
  purpose: "RESET_PASSWORD" | "VERIFY_EMAIL" = "RESET_PASSWORD"
) {
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
async function state(id: string) {
  return {
    user: await db.platformUser.findUniqueOrThrow({
      where: { id },
      select: { passwordHash: true, credentialVersion: true }
    }),
    sessions: await db.platformSession.findMany({
      where: { userId: id },
      orderBy: { id: "asc" }
    }),
    grants: await db.platformAccountGrant.findMany({
      where: { userId: id },
      orderBy: { id: "asc" }
    }),
    proofs: await db.platformRecentAuthentication.findMany({
      where: { userId: id },
      orderBy: { id: "asc" }
    })
  };
}
function boundary(
  body: Record<string, unknown>,
  cookie?: string,
  owner?: string,
  origin = process.env.ACCOUNT_ORIGIN!
) {
  return handleAccountRequest(
    db,
    new Request(process.env.ACCOUNT_ORIGIN + "/api/platform/account", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin,
        ...(cookie ? { cookie } : {}),
        ...(owner ? { "X-Expected-Account": owner } : {})
      },
      body: JSON.stringify(body)
    })
  );
}

test("registration screens before identity lookup and creates no weak-password account", async () => {
  const input = details();
  for (const password of [
    "password123",
    "God's Churches2026!",
    input.username + "!",
    input.email
  ]) {
    const before = queries;
    await assert.rejects(
      registerAccount(db, { ...input, password, confirmPassword: password }),
      code("password-unsafe")
    );
    assert.equal(
      queries,
      before,
      "No identity lookup before definitive screening rejection"
    );
  }
  assert.equal(
    await db.platformUser.count({ where: { email: input.email } }),
    0
  );
});

test("new and existing email registrations receive the same safe rejection without changing existing credentials", async () => {
  const a = await actor(),
    before = await state(a.id);
  const input = details();
  const messages = [];
  for (const email of [a.email, input.email]) {
    const r = await boundary({
      ...input,
      operation: "register",
      email,
      password: "password123",
      confirmPassword: "password123"
    });
    assert.equal(r.status, 400);
    assert.equal(r.headers.get("set-cookie"), null);
    const body = await r.json();
    assert.equal(body.code, "ACCOUNT_PASSWORD_UNSAFE");
    messages.push(body);
  }
  assert.deepEqual(messages[0], messages[1]);
  assert.deepEqual(await state(a.id), before);
});

test("rejected change preserves owner credentials, sessions and reset grant; corrected change still revokes all", async () => {
  const a = await actor();
  await loginAccount(db, a.email, safePassword, null);
  await grant(a.email);
  const before = await state(a.id);
  for (const password of ["password123", "godschurches2026!", a.username + "!"])
    await assert.rejects(
      changeAccountPassword(
        db,
        a.token,
        safePassword,
        password,
        password,
        a.id
      ),
      code("password-unsafe")
    );
  assert.deepEqual(await state(a.id), before);
  assert.ok(await readAccountSession(db, a.token));
  await changeAccountPassword(
    db,
    a.token,
    safePassword,
    nextPassword,
    nextPassword,
    a.id
  );
  const saved = await state(a.id);
  assert.equal(saved.user.credentialVersion, before.user.credentialVersion + 1);
  assert.equal(saved.sessions.length, 0);
  assert.ok(saved.grants.every((g) => g.consumedAt));
  assert.ok(await verifyPassword(nextPassword, saved.user.passwordHash));
});

test("current account context is checked under the owner lock and an account switch fails before policy feedback", async () => {
  const a = await actor(),
    b = await actor();
  const username = "current_" + randomBytes(5).toString("hex");
  await db.platformUser.update({ where: { id: a.id }, data: { username } });
  await assert.rejects(
    changeAccountPassword(
      db,
      a.token,
      safePassword,
      username + "!",
      username + "!",
      a.id
    ),
    code("password-unsafe")
  );
  await assert.rejects(
    changeAccountPassword(
      db,
      a.token,
      safePassword,
      "password123",
      "password123",
      b.id
    ),
    code("session")
  );
  await assert.rejects(
    changeAccountPassword(
      db,
      createSessionToken(),
      safePassword,
      "password123",
      "password123",
      a.id
    ),
    code("session")
  );
  await assert.rejects(
    changeAccountPassword(
      db,
      a.token,
      "incorrect password",
      nextPassword,
      nextPassword,
      a.id
    ),
    code("credentials")
  );
});

test("Google-only add-password rejection preserves the exact one-use proof and corrected retry consumes it", async () => {
  const a = await actor();
  await db.platformUser.update({
    where: { id: a.id },
    data: { passwordHash: null }
  });
  const identity = await db.platformGoogleIdentity.create({
    data: {
      userId: a.id,
      issuer: "https://accounts.google.com",
      subject: "fictional-policy-" + randomBytes(12).toString("hex")
    }
  });
  const session = await db.platformSession.findUniqueOrThrow({
    where: { tokenHash: hashSessionToken(a.token) }
  });
  const proofToken = createSessionToken();
  await db.platformRecentAuthentication.create({
    data: {
      userId: a.id,
      sessionId: session.id,
      googleIdentityId: identity.id,
      credentialVersion: a.credentialVersion,
      purpose: "change-password",
      tokenHash: hashSessionToken(proofToken),
      expiresAt: new Date(Date.now() + 300000)
    }
  });
  const credential = { kind: "google-reauth", token: proofToken };
  const before = await state(a.id);
  await assert.rejects(
    changeAccountPassword(
      db,
      a.token,
      credential,
      "password123",
      "password123",
      a.id
    ),
    code("password-unsafe")
  );
  assert.deepEqual(await state(a.id), before);
  await changeAccountPassword(
    db,
    a.token,
    credential,
    nextPassword,
    nextPassword,
    a.id
  );
  const saved = await state(a.id);
  assert.equal(saved.proofs.length, 0);
  assert.equal(saved.sessions.length, 0);
  assert.ok(await verifyPassword(nextPassword, saved.user.passwordHash));
});

test("rejected reset leaves the original link usable and screens against current owner details", async () => {
  const a = await actor(),
    token = await grant(a.email);
  await db.platformUser.update({
    where: { id: a.id },
    data: { name: "Fictional Current Name" }
  });
  const before = await state(a.id);
  for (const password of ["password123", "FictionalCurrentName2026!"])
    await assert.rejects(
      consumeAccountGrant(db, token, "RESET_PASSWORD", password, password),
      code("password-unsafe")
    );
  assert.deepEqual(await state(a.id), before);
  await consumeAccountGrant(
    db,
    token,
    "RESET_PASSWORD",
    nextPassword,
    nextPassword
  );
  assert.ok(
    await verifyPassword(nextPassword, (await state(a.id)).user.passwordHash)
  );
  assert.equal(await readAccountSession(db, a.token), null);
  await assert.rejects(
    consumeAccountGrant(
      db,
      token,
      "RESET_PASSWORD",
      "password123",
      "password123"
    ),
    code("grant")
  );
});

test("invalid, expired, wrong-purpose and old-generation reset links do not reach context screening", async () => {
  const a = await actor();
  const verification = await grant(a.email, "VERIFY_EMAIL");
  const reset = await grant(a.email);
  await db.platformAccountGrant.update({
    where: { tokenHash: hashSessionToken(reset) },
    data: { expiresAt: new Date(0) }
  });
  for (const token of [createSessionToken(), verification, reset])
    await assert.rejects(
      consumeAccountGrant(
        db,
        token,
        "RESET_PASSWORD",
        "password123",
        "password123"
      ),
      code("grant")
    );
  const stale = await grant(a.email);
  await db.platformUser.update({
    where: { id: a.id },
    data: { credentialVersion: { increment: 1 } }
  });
  await assert.rejects(
    consumeAccountGrant(
      db,
      stale,
      "RESET_PASSWORD",
      "password123",
      "password123"
    ),
    code("grant")
  );
});

test("a previously issued blocked password continues authenticating and confirming a safe replacement", async () => {
  const a = await actor();
  await db.platformUser.update({
    where: { id: a.id },
    data: { passwordHash: await hashPassword("PaSsWoRd123") }
  });
  const token = await loginAccount(db, a.email, "PaSsWoRd123", null);
  await assert.rejects(
    loginAccount(db, a.email, "password123", null),
    code("credentials")
  );
  await changeAccountPassword(
    db,
    token,
    "PaSsWoRd123",
    nextPassword,
    nextPassword,
    a.id
  );
  assert.ok(await loginAccount(db, a.email, nextPassword, null));
});

test("policy feedback retains the existing origin and ambiguous-session boundary", async () => {
  const a = await actor();
  const body = {
    operation: "change-password",
    currentPassword: safePassword,
    password: "password123",
    confirmPassword: "password123"
  };
  assert.equal(
    (
      await boundary(
        body,
        `${SESSION_COOKIE}=${a.token}`,
        a.id,
        "https://unrelated.example.test"
      )
    ).status,
    403
  );
  const before = await state(a.id);
  const ambiguous = await boundary(
    body,
    `${SESSION_COOKIE}=${a.token}; ${SESSION_COOKIE}=${a.token}`,
    a.id
  );
  assert.equal(ambiguous.status, 400);
  assert.equal(
    (await ambiguous.json()).message,
    "Please sign in again before changing your account."
  );
  assert.deepEqual(await state(a.id), before);
  const rejected = await boundary(body, `${SESSION_COOKIE}=${a.token}`, a.id);
  assert.equal(rejected.status, 400);
  assert.equal((await rejected.json()).code, "ACCOUNT_PASSWORD_UNSAFE");
  assert.equal(rejected.headers.get("cache-control"), "no-store");
  assert.equal(rejected.headers.get("set-cookie"), null);
});
