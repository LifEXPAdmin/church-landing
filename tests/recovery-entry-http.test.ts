import test, { after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { registerAccount, loginAccount } from "../lib/platform/accounts";

const origin = process.env.ACCOUNT_ORIGIN!;
assert.equal(process.env.ACCOUNT_TEST_ISOLATED, "1");
assert.match(origin, /^https?:\/\/127\.0\.0\.1:\d+$/);
assert.equal(new URL(process.env.DATABASE_URL!).hostname, "127.0.0.1");
const db = new PrismaClient();
after(() => db.$disconnect());

test("actual Home exposes non-followers' public posts equally and verification prefills only the current owner", async () => {
  const username = "entry_" + randomUUID().replaceAll("-", "").slice(0, 14);
  const email = `${username}@example.test`;
  const password = "Synthetic-entry-password-1";
  await registerAccount(db, {
    username,
    email,
    name: "Entry fixture",
    role: "BELIEVER",
    password,
    confirmPassword: password
  });
  const token = await loginAccount(db, email, password, null);
  const author = await db.platformUser.create({
    data: {
      name: "Unfollowed fixture",
      username: username + "b",
      email: username + "b@example.test"
    }
  });
  const marker = "Early public post " + randomUUID();
  await db.platformPost.create({
    data: { authorId: author.id, content: marker }
  });
  const headers = { Cookie: "church_platform_session=" + token, RSC: "1" };
  for (const signedIn of [false, true]) {
    const response = await fetch(origin + "/platform", {
      headers: signedIn ? headers : { RSC: "1" }
    });
    assert.equal(response.status, 200);
    const body = await response.text();
    assert.ok(body.includes(marker));
    assert.ok(!body.includes(email));
    assert.ok(!body.includes(author.email));
  }
  const own = await fetch(origin + "/platform/account/verify", { headers });
  assert.equal(own.status, 200);
  assert.match(own.headers.get("cache-control")!, /no-store/);
  const ownBody = await own.text();
  assert.ok(ownBody.includes(`"initialEmail":"${email}"`));
  assert.ok(ownBody.includes('"purpose":"VERIFY_EMAIL"'));
  assert.ok(!ownBody.includes(author.email));
  assert.ok(!ownBody.includes(token));
  const guestBody = await (
    await fetch(origin + "/platform/account/verify", { headers: { RSC: "1" } })
  ).text();
  assert.ok(!guestBody.includes(email));
  assert.ok(guestBody.includes('"initialEmail":""'));
});

test("account entry HTML and RSC share the configured recovery availability without sender configuration", async () => {
  const available = process.env.ACCOUNT_DELIVERY_MODE !== "disabled";
  for (const path of ["/platform/login", "/platform/signup"])
    for (const rsc of [false, true]) {
      const response = await fetch(origin + path, {
        headers: rsc ? { RSC: "1" } : undefined
      });
      assert.equal(response.status, 200);
      const body = await response.text();
      if (rsc) {
        // Flight carries this client component's props, not its rendered text.
        assert.ok(body.includes(`"recoveryAvailable":${available}`));
      } else {
        assert.ok(body.includes("Forgot password?"));
        assert.ok(body.includes("/platform/account/recover"));
        assert.equal(
          body.includes("Password recovery emails are not available yet."),
          !available
        );
        assert.equal(
          body.includes("Use Forgot password? to request a reset link"),
          available
        );
        assert.ok(!body.includes("Recovery availability"));
      }
      for (const privateValue of [
        process.env.AUTH_RATE_LIMIT_SECRET,
        process.env.RESEND_API_KEY
      ])
        if (privateValue) assert.ok(!body.includes(privateValue));
    }
  const help = await (await fetch(origin + "/help")).text();
  assert.ok(help.includes("/platform/account/recover"));
  assert.ok(!help.includes("email delivery are not enabled yet"));
});
