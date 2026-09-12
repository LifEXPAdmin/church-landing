import test, { after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { Prisma, PrismaClient } from "@prisma/client";
import { registerAccount, AccountError } from "../lib/platform/accounts";
import { handleAccountRequest } from "../lib/platform/account-boundary";
const db = new PrismaClient();
const origin = process.env.ACCOUNT_ORIGIN!;
assert.equal(process.env.ACCOUNT_TEST_ISOLATED, "1");
assert.match(origin, /^https:\/\/127\.0\.0\.1:/);
assert.match(process.env.DATABASE_URL!, /127\.0\.0\.1/);
after(() => db.$disconnect());
beforeEach(() => db.platformAuthLimit.deleteMany());
const password = "Fixture-Repair-password-1";
const identity = () => {
  const username = "repair_" + randomBytes(6).toString("hex");
  return {
    operation: "register",
    username,
    email: `${username}@example.test`,
    name: "Synthetic Repair",
    password,
    confirmPassword: password,
    role: "BELIEVER"
  };
};
const post = (body: Record<string, unknown>, cookie = "", source = origin) =>
  fetch(origin + "/api/platform/account", {
    method: "POST",
    headers: {
      Origin: source,
      "Content-Type": "application/json",
      Cookie: cookie
    },
    body: JSON.stringify(body),
    redirect: "manual"
  });
async function signin(email: string) {
  const r = await post({ operation: "login", email, password });
  assert.equal(r.status, 200);
  return r.headers.get("set-cookie")!.split(";")[0];
}

test("HTTPS unique insertion, public-handle conflict and private-email neutrality are distinct", async () => {
  const input = identity();
  const first = await post(input);
  assert.equal(first.status, 200);
  assert.equal(first.headers.get("set-cookie"), null);
  const neutral = await first.json();
  assert.ok(!("created" in neutral));
  assert.ok(!("id" in neutral));
  const before = await db.platformUser.findUniqueOrThrow({
    where: { email: input.email }
  });
  assert.equal(before.bio, null);
  assert.deepEqual(before.interests, []);
  assert.equal(before.emailVerifiedAt, null);
  assert.equal(
    await db.platformSession.count({ where: { userId: before.id } }),
    0
  );
  const freshEmail = identity().email;
  for (const email of [input.email, freshEmail]) {
    const taken = await post({ ...input, email });
    assert.equal(taken.status, 409);
    assert.equal((await taken.json()).code, "ACCOUNT_HANDLE_TAKEN");
    assert.equal(taken.headers.get("set-cookie"), null);
  }
  assert.equal(
    await db.platformUser.count({ where: { email: freshEmail } }),
    0
  );
  const duplicate = await post({
    ...input,
    username: identity().username,
    password: "Different-password",
    confirmPassword: "Different-password",
    name: "Attempted replacement"
  });
  assert.equal(duplicate.status, 200);
  assert.deepEqual(await duplicate.json(), neutral);
  assert.deepEqual(
    await db.platformUser.findUnique({ where: { id: before.id } }),
    before
  );
  assert.equal((await post({ ...input, username: "bad spaces" })).status, 400);
  const cookie = await signin(input.email.toUpperCase());
  assert.ok(cookie);
  for (const email of [input.email, identity().email]) {
    const denied = await post({
      operation: "login",
      email,
      password: "Incorrect-password"
    });
    assert.equal(denied.status, 400);
    assert.match((await denied.json()).message, /did not match/);
  }
});
test("HTTPS passwordless account cannot be claimed or overwritten by another registration", async () => {
  const input = identity();
  const before = await db.platformUser.create({
    data: {
      email: input.email,
      username: input.username,
      name: "Synthetic Passwordless",
      interests: []
    }
  });
  const unique = await post(identity());
  const duplicate = await post({ ...input, username: identity().username });
  assert.equal(duplicate.status, 200);
  assert.deepEqual(await duplicate.json(), await unique.json());
  assert.deepEqual(
    await db.platformUser.findUnique({ where: { id: before.id } }),
    before
  );
  assert.equal(
    (await post({ operation: "login", email: input.email, password })).status,
    400
  );
  assert.equal(
    await db.platformSession.count({ where: { userId: before.id } }),
    0
  );
});
test("concurrent handle and email conflicts remain insert-only and never issue sessions", async () => {
  const input = identity();
  const handles = await Promise.all([
    post(input),
    post({ ...input, email: identity().email })
  ]);
  assert.deepEqual(handles.map((r) => r.status).sort(), [200, 409]);
  const email = identity();
  const names = [email.username, identity().username];
  const duplicate = await Promise.all(
    names.map((username) => post({ ...email, username }))
  );
  assert.deepEqual(
    duplicate.map((r) => r.status),
    [200, 200]
  );
  assert.deepEqual(await duplicate[0].json(), await duplicate[1].json());
  const rows = await db.platformUser.findMany({
    where: { OR: [{ username: input.username }, { email: email.email }] },
    select: { id: true }
  });
  assert.equal(rows.length, 2);
  assert.equal(
    await db.platformSession.count({
      where: { userId: { in: rows.map((r) => r.id) } }
    }),
    0
  );
});
test("ambiguous P2002 is rechecked, unrelated unique failures are not reported as success", async () => {
  const input = identity();
  await registerAccount(db, input);
  const fake = (target: unknown) =>
    ({
      $transaction: async (run: (tx: unknown) => Promise<unknown>) =>
        run({
          $queryRaw: async () => [],
          platformUser: {
            create: async () => {
              throw new Prisma.PrismaClientKnownRequestError(
                "Synthetic conflict",
                {
                  code: "P2002",
                  clientVersion: "fixture",
                  meta: { target }
                }
              );
            }
          }
        }),
      platformUser: {
        create: async () => {
          throw new Prisma.PrismaClientKnownRequestError("Synthetic conflict", {
            code: "P2002",
            clientVersion: "fixture",
            meta: { target }
          });
        },
        findUnique: db.platformUser.findUnique.bind(db.platformUser)
      }
    }) as unknown as PrismaClient;
  await registerAccount(fake(undefined), {
    ...input,
    username: identity().username
  });
  await assert.rejects(
    registerAccount(fake(["unrelated"]), {
      ...input,
      username: identity().username
    })
  );
  await assert.rejects(registerAccount(fake(undefined), identity()));
  await assert.rejects(
    registerAccount(fake(undefined), { ...input, email: identity().email }),
    (e: unknown) => e instanceof AccountError && e.code === "handle-taken"
  );
});
test("profile edits use session ownership, reject extra IDs/unsafe URLs, and stay durable/private", async () => {
  const first = identity(),
    second = identity();
  await post(first);
  await post(second);
  const cookie = await signin(first.email);
  const owner = await db.platformUser.findUniqueOrThrow({
    where: { email: first.email }
  });
  const other = await db.platformUser.findUniqueOrThrow({
    where: { email: second.email }
  });
  const edit = {
    operation: "update-profile",
    name: "Synthetic Edited",
    bio: "My own introduction",
    location: "Fictional Town",
    website: "https://example.test/",
    interests: "Prayer, Gardening"
  };
  assert.equal((await post({ ...edit, userId: other.id }, cookie)).status, 400);
  assert.equal(
    (await post({ ...edit, email: second.email }, cookie)).status,
    400
  );
  assert.equal(
    (await post({ ...edit, website: "javascript:alert(1)" }, cookie)).status,
    400
  );
  assert.equal((await post(edit)).status, 400);
  assert.equal((await post(edit, cookie)).status, 200);
  const saved = await db.platformUser.findUniqueOrThrow({
    where: { id: owner.id }
  });
  assert.equal(saved.bio, edit.bio);
  assert.deepEqual(saved.interests, ["Prayer", "Gardening"]);
  assert.equal(saved.passwordHash, owner.passwordHash);
  assert.equal(saved.email, owner.email);
  assert.deepEqual(
    await db.platformUser.findUnique({ where: { id: other.id } }),
    other
  );
  for (const headers of [
    { Cookie: cookie },
    { Cookie: cookie, RSC: "1" }
  ] as Record<string, string>[]) {
    const r = await fetch(origin + `/platform/profile/${owner.username}`, {
      headers
    });
    assert.equal(r.status, 200);
    const html = await r.text();
    assert.ok(html.includes(edit.bio));
    for (const secret of [
      owner.email,
      owner.passwordHash!,
      cookie.split("=")[1]
    ])
      assert.ok(!html.includes(secret));
  }
  const fresh = await signin(first.email);
  const page = await fetch(origin + "/platform/profile/me", {
    headers: { Cookie: fresh }
  });
  assert.match(await page.text(), /My own introduction/);
  writeFileSync(
    resolve(process.env.ACCOUNT_TEST_SINK_DIR!, "../repair-restart.json"),
    JSON.stringify({
      email: first.email,
      password,
      id: owner.id,
      username: owner.username,
      cookie: fresh,
      bio: edit.bio
    }),
    { mode: 0o600 }
  );
});
test("HTTPS origin, unavailable services, durable rate limits and correlation stay safe", async () => {
  const invalid = await post(
    { operation: "login" },
    "",
    "https://www.example.test"
  );
  assert.equal(invalid.status, 403);
  assert.equal((await invalid.json()).code, "ACCOUNT_ORIGIN");
  const request = () =>
    new Request(origin + "/api/platform/account", {
      method: "POST",
      headers: { Origin: origin, "Content-Type": "application/json" },
      body: JSON.stringify({
        operation: "login",
        email: "private@example.test",
        password
      })
    });
  const original = process.env.AUTH_RATE_LIMIT_SECRET;
  process.env.AUTH_RATE_LIMIT_SECRET = "placeholder";
  try {
    const r = await handleAccountRequest(db, request());
    assert.equal(r.status, 503);
    assert.equal((await r.json()).code, "ACCOUNT_CONFIGURATION");
    assert.match(r.headers.get("X-Account-Request-Id")!, /^[a-f0-9-]{36}$/);
  } finally {
    process.env.AUTH_RATE_LIMIT_SECRET = original;
  }
  const unavailable = await handleAccountRequest(
    {
      $queryRaw: async () => {
        throw Error("secret SQL parameters must never be serialized");
      }
    } as unknown as PrismaClient,
    request()
  );
  assert.equal(unavailable.status, 503);
  assert.ok(!(await unavailable.text()).includes("SQL parameters"));
  const input = identity();
  for (let i = 0; i < 10; i++)
    assert.equal(
      (await post({ operation: "login", email: input.email, password })).status,
      400
    );
  const limited = await post({
    operation: "login",
    email: input.email,
    password
  });
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get("Retry-After"), "900");
  assert.equal((await limited.json()).code, "ACCOUNT_LIMIT");
});
