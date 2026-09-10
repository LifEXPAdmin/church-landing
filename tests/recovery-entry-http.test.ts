import test from "node:test";
import assert from "node:assert/strict";

const origin = process.env.ACCOUNT_ORIGIN!;
assert.equal(process.env.ACCOUNT_TEST_ISOLATED, "1");
assert.match(origin, /^https?:\/\/127\.0\.0\.1:\d+$/);

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
