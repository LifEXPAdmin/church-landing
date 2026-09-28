import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CSP_NONCE_HEADER,
  requestScriptPolicy,
  scriptPolicy
} from "../lib/security/content-security-policy";

test("every document replaces caller-controlled nonce and policy with independent random authority", () => {
  const headers = new Headers({
    [CSP_NONCE_HEADER]: "caller-controlled",
    "content-security-policy": "script-src 'unsafe-inline'",
    "content-security-policy-report-only": "script-src 'nonce-attacker'",
    cookie: "fictional-session=preserve",
    rsc: "1",
    "next-router-prefetch": "1"
  });
  const values = new Set<string>();
  for (let i = 0; i < 128; i++) {
    const result = requestScriptPolicy(headers, false);
    assert.match(result.nonce, /^[A-Za-z0-9+/]{32}$/);
    assert.equal(Buffer.from(result.nonce, "base64").length, 24);
    assert.equal(result.forwarded.get(CSP_NONCE_HEADER), result.nonce);
    assert.equal(
      result.forwarded.get("content-security-policy"),
      result.policy
    );
    assert.equal(
      result.forwarded.get("content-security-policy-report-only"),
      null
    );
    assert.equal(result.forwarded.get("cookie"), "fictional-session=preserve");
    assert.equal(result.forwarded.get("rsc"), "1");
    assert.equal(result.forwarded.get("next-router-prefetch"), "1");
    assert.ok(!result.policy.includes("attacker"));
    values.add(result.nonce);
  }
  assert.equal(values.size, 128);
  assert.equal(headers.get(CSP_NONCE_HEADER), "caller-controlled");
});

test("production script restrictions preserve explicit worker/image/style needs without eval or inline script exceptions", () => {
  const policy = scriptPolicy("a".repeat(32), false);
  const directives = Object.fromEntries(
    policy.split("; ").map((value) => {
      const [name, ...sources] = value.split(" ");
      return [name, sources];
    })
  );
  assert.deepEqual(directives["script-src"], [
    "'self'",
    `'nonce-${"a".repeat(32)}'`,
    "'strict-dynamic'"
  ]);
  assert.deepEqual(directives["script-src-attr"], ["'none'"]);
  assert.deepEqual(directives["worker-src"], ["'self'"]);
  assert.deepEqual(directives["connect-src"], ["'self'"]);
  for (const directive of [
    "base-uri",
    "frame-src",
    "frame-ancestors",
    "object-src"
  ])
    assert.deepEqual(directives[directive], ["'none'"]);
  assert.ok(!policy.includes("unsafe-eval"));
  assert.ok(!policy.includes("report-sample"));
  assert.deepEqual(directives["img-src"], ["'self'", "blob:", "data:"]);
  assert.deepEqual(directives["report-uri"], ["/api/security/csp-report"]);
});

test("only development permits framework evaluation and WebSocket refresh", () => {
  const policy = scriptPolicy("b".repeat(32), true);
  assert.match(policy, /script-src [^;]+ 'unsafe-eval';/);
  assert.match(policy, /connect-src 'self' ws: wss:;/);
  assert.match(policy, /script-src-attr 'none'/);
  assert.ok(!/script-src [^;]*'unsafe-inline'/.test(policy));
});

test("malformed nonce values cannot add directives or become trusted markup", () => {
  for (const nonce of [
    "",
    "abc",
    "x".repeat(33),
    "x".repeat(31) + "'",
    "x; script-src *",
    '<img src="x">',
    "a".repeat(31) + "\n"
  ])
    assert.throws(() => scriptPolicy(nonce, false), /Invalid script nonce/);
});
