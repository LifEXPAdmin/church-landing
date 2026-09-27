import test from "node:test";
import assert from "node:assert/strict";
import {
  ACCOUNT_SESSION_COOKIE as legacy,
  ACCOUNT_SECURE_SESSION_COOKIE as host,
  LEGACY_SECURE_SESSION_ENDS_AT,
  accountSessionCookie,
  ambiguousAccountSessionCookie,
  sessionCookieName
} from "../lib/platform/account-cookies";
import { createSessionToken } from "../lib/platform/auth";
import { sessionCookieFixtureName } from "../scripts/session-cookie-fixture.mjs";

const a = createSessionToken(),
  b = createSessionToken();
const deadline = Date.parse(LEGACY_SECURE_SESSION_ENDS_AT);
const secure = { secure: true, now: deadline - 1 };
const pair = (name: string, token = a) => `${name}=${token}`;

test("HTTPS transition accepts one canonical identity under either name without decoding", () => {
  for (const header of [
    pair(legacy),
    pair(host),
    `${pair(host)}; ${pair(legacy)}`,
    `${pair(legacy)}; ${pair(host)}`
  ]) {
    assert.equal(accountSessionCookie(header, secure), a);
    assert.equal(ambiguousAccountSessionCookie(header, secure), false);
  }
  assert.equal(
    accountSessionCookie(`theme=light; ${pair(host)}; other=1`, secure),
    a
  );
  for (const name of [legacy, host]) {
    for (const header of [
      name,
      `${name} =${a}`,
      pair(name, `%${a.charCodeAt(0).toString(16)}${a.slice(1)}`),
      pair(name, `"${a}"`),
      pair(name, a + "="),
      pair(name, "")
    ])
      assert.equal(accountSessionCookie(header, secure), undefined);
  }
});

test("duplicate names and conflicting or malformed cross-name identities fail closed in either order", () => {
  for (const name of [legacy, host])
    for (const value of [a, b, "", "invalid"])
      for (const parts of [
        [pair(name), pair(name, value)],
        [pair(name, value), pair(name)]
      ]) {
        const header = parts.join("; ");
        assert.equal(accountSessionCookie(header, secure), undefined);
        assert.equal(ambiguousAccountSessionCookie(header, secure), true);
      }
  for (const invalid of [
    pair(legacy, b),
    pair(legacy, "invalid"),
    legacy,
    `${legacy} =${a}`
  ])
    for (const parts of [
      [pair(host), invalid],
      [invalid, pair(host)]
    ]) {
      assert.equal(accountSessionCookie(parts.join("; "), secure), undefined);
      assert.equal(
        ambiguousAccountSessionCookie(parts.join("; "), secure),
        true
      );
    }
});

test("the fixed HTTPS retirement rejects legacy sessions and ignores obsolete cookies beside a host identity", () => {
  assert.equal(accountSessionCookie(pair(legacy), secure), a);
  for (const now of [deadline, deadline + 86400000]) {
    const policy = { secure: true, now };
    assert.equal(accountSessionCookie(pair(legacy), policy), undefined);
    assert.equal(
      accountSessionCookie(
        `${pair(legacy, b)}; ${pair(host)}; ${legacy}`,
        policy
      ),
      a
    );
    assert.equal(
      ambiguousAccountSessionCookie(
        `${pair(legacy, b)}; ${pair(host)}; ${legacy}`,
        policy
      ),
      false
    );
    assert.equal(
      accountSessionCookie(`${pair(host)}; ${pair(host)}`, policy),
      undefined
    );
  }
});

test("local HTTP uses only the ordinary name before and after HTTPS retirement", () => {
  assert.equal(sessionCookieName(true), host);
  assert.equal(sessionCookieName(false), legacy);
  for (const now of [deadline - 1, deadline, deadline + 1]) {
    const policy = { secure: false, now };
    assert.equal(accountSessionCookie(pair(host), policy), undefined);
    assert.equal(
      accountSessionCookie(`${pair(host, b)}; ${pair(legacy)}`, policy),
      a
    );
    assert.equal(
      accountSessionCookie(`${pair(legacy)}; ${pair(legacy)}`, policy),
      undefined
    );
    assert.equal(accountSessionCookie(null, policy), undefined);
  }
});

test("cookie identity depends on the configured origin, independently of email and rate-limit configuration", () => {
  const saved = { ...process.env };
  try {
    process.env.ACCOUNT_ORIGIN = "https://fictional.example.test";
    Object.assign(process.env, { NODE_ENV: "production" });
    process.env.ACCOUNT_DELIVERY_MODE = "resend";
    delete process.env.RESEND_API_KEY;
    delete process.env.ACCOUNT_EMAIL_FROM;
    delete process.env.AUTH_RATE_LIMIT_SECRET;
    assert.equal(accountSessionCookie(pair(host)), a);
    assert.equal(sessionCookieFixtureName(), host);
    Object.assign(process.env, { NODE_ENV: "test" });
    process.env.VERCEL = "";
    process.env.ACCOUNT_ORIGIN = "http://127.0.0.1:3210";
    assert.equal(accountSessionCookie(pair(legacy)), a);
    assert.equal(sessionCookieFixtureName(), legacy);
    process.env.ACCOUNT_ORIGIN = "http://fictional.example.test";
    assert.throws(() => accountSessionCookie(pair(legacy)), /requires HTTPS/);
  } finally {
    for (const key of Object.keys(process.env))
      if (!(key in saved)) delete process.env[key];
    Object.assign(process.env, saved);
  }
});
