import assert from "node:assert/strict";
import { appendFileSync } from "node:fs";
import { resolve, relative, isAbsolute } from "node:path";
assert.equal(process.env.ACCOUNT_TEST_ISOLATED, "1");
assert.equal(process.env.NODE_ENV, "production");
assert.equal(process.env.RESEND_API_KEY, "re_synthetic_never_real");
const database = new URL(process.env.DATABASE_URL);
assert.equal(database.hostname, "127.0.0.1");
assert.equal(database.pathname, "/godschurches_security_test");
const local = new URL(process.env.FICTIONAL_ALLOWED_ORIGIN);
assert.equal(local.protocol, "https:");
assert.equal(local.hostname, "127.0.0.1");
assert.ok(Number(local.port) > 1024);
const fixture = resolve(process.env.FICTIONAL_PROVIDER_FIXTURE);
const log = resolve(process.env.FICTIONAL_PROVIDER_LOG);
assert.equal(relative(fixture, log), "fictional-provider.jsonl");
assert.ok(!isAbsolute(relative(fixture, log)));
const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = new URL(typeof input === "string" || input instanceof URL ? String(input) : input.url);
  if (url.href === "https://api.resend.com/emails") {
    assert.equal(init?.method, "POST");
    const body = JSON.parse(String(init?.body));
    const recipients = Array.isArray(body.to) ? body.to : [body.to];
    assert.ok(recipients.length > 0 && recipients.every((to) => typeof to === "string" && /^[^\s@]+@example\.test$/.test(to)));
    appendFileSync(log, JSON.stringify({ at: new Date().toISOString(), provider: "Resend", simulated: true, recipients: recipients.length }) + "\n", { mode: 0o600 });
    return Response.json({ id: "fictional-delivery-" + crypto.randomUUID() });
  }
  assert.equal(url.origin, local.origin, "Unapproved fixture fetch target");
  const response = await originalFetch(input, { ...init, redirect: "manual" });
  const location = response.headers.get("location");
  if (location) assert.equal(new URL(location, url).origin, local.origin, "Unapproved fixture redirect");
  return response;
};
