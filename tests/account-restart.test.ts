import test, { after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import { hashSessionToken } from "../lib/platform/auth";
assert.equal(process.env.ACCOUNT_TEST_ISOLATED, "1");
assert.match(process.env.DATABASE_URL!, /127\.0\.0\.1/);
const db = new PrismaClient();
after(() => db.$disconnect());
test("new production server process loads the same account/profile and persistent session", async () => {
  const f = JSON.parse(
    readFileSync(
      resolve(process.env.ACCOUNT_TEST_SINK_DIR!, "../repair-restart.json"),
      "utf8"
    )
  );
  const origin = process.env.ACCOUNT_ORIGIN!;
  const prior = await fetch(origin + "/platform/profile/me", {
    headers: { Cookie: f.cookie },
    redirect: "manual"
  });
  assert.equal(prior.status, 200);
  assert.ok((await prior.text()).includes(f.bio));
  const login = await fetch(origin + "/api/platform/account", {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify({
      operation: "login",
      email: f.email,
      password: f.password
    })
  });
  assert.equal(login.status, 200);
  const cookie = login.headers.get("set-cookie")!;
  for (const text of [
    "Secure",
    "HttpOnly",
    "SameSite=Lax",
    "Path=/",
    "Max-Age=2592000"
  ])
    assert.ok(cookie.includes(text));
  assert.ok(!cookie.includes("Domain="));
  const token = cookie.split(";")[0].split("=")[1];
  const session = await db.platformSession.findUniqueOrThrow({
    where: { tokenHash: hashSessionToken(token) }
  });
  assert.equal(session.userId, f.id);
  assert.ok(session.expiresAt.getTime() > Date.now() + 29 * 86400000);
  const user = await db.platformUser.findUniqueOrThrow({ where: { id: f.id } });
  assert.equal(user.bio, f.bio);
  assert.equal(user.emailVerifiedAt, null);
});
