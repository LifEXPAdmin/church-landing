import assert from "node:assert/strict";
import test from "node:test";
import { API_MAX_RESPONSE_BYTES, RequestClientError } from "@godschurches/shared-core";
import { apiResponseExamples } from "../../lib/platform/api-contract-examples.ts";
import {
  createNativeRequestAdapter, type NativeIdentity, type NativeWireRequest, type NativeWireResponse
} from "../src/platform/request-adapter.ts";
import { createNativeClient } from "../src/session/native-client.ts";

const origin = "https://fictional.example.invalid";
const owner = apiResponseExamples.feed.viewerId;
const query = { mode: "latest", cursor: null, scope: null } as const;
const token = "a".repeat(43);
const response = (value: unknown): NativeWireResponse => ({
  status: 200, apiVersion: "1", contentType: "application/json", cacheControl: "private, no-store", retryAfter: null, body: JSON.stringify(value)
});
function harness() {
  const state = {
    current: { identity: { owner, generation: 1 }, credential: { ownerId: owner, token } } as NativeIdentity,
    response: response(apiResponseExamples.feed), requests: [] as NativeWireRequest[],
    onSend: undefined as ((input: NativeWireRequest) => Promise<void>) | undefined
  };
  const adapter = createNativeRequestAdapter({ environment: "development", origin }, { current: () => state.current }, async request => {
    state.requests.push(request); await state.onSend?.(request); return state.response;
  });
  return { state, adapter, client: createNativeClient(adapter) };
}
const rejected = (error: unknown) => {
  assert.ok(error instanceof RequestClientError);
  assert.equal(error.message.includes(token), false);
  assert.equal(JSON.stringify(error).includes(token), false);
  return true;
};

test("typed core read sends only the captured bearer to a fixed HTTPS origin", async () => {
  const { state, client } = harness();
  assert.deepEqual(await client.feed(owner, query), apiResponseExamples.feed);
  assert.equal(state.requests.length, 1);
  const request = state.requests[0];
  assert.equal(request.url, origin + "/api/platform/v1/feed?mode=latest");
  assert.equal(request.headers.Authorization, "Bearer " + token);
  assert.equal(request.headers["X-Expected-Account"], owner);
  assert.equal(request.headers["Cache-Control"], "no-store");
  assert.equal(request.headers["X-API-Version"], "1");
  for (const name of ["Cookie", "Origin", "Sec-Fetch-Site"]) assert.equal(request.headers[name], undefined);
  assert.equal(request.body, undefined);
  assert.equal(request.maximumResponseBytes, 2 * 1024 * 1024);
  assert.equal(request.timeoutMs, 15000);
  assert.ok(Object.isFrozen(request) && Object.isFrozen(request.headers));
});

test("native password issuance omits all existing account credentials", async () => {
  const { state, client } = harness();
  state.current = { identity: { owner: null, generation: 1 }, credential: null };
  state.response = response({ apiVersion: "1", viewerId: owner, data: {
    tokenType: "Bearer", token, session: apiResponseExamples.session.data,
    activity: { owner, legacy: false, deadline: "2026-10-07T12:30:00.000Z", absoluteExpiresAt: "2026-11-06T12:00:00.000Z", serverTime: "2026-10-07T12:00:00.000Z" }
  } });
  await client.signIn({ email: "fictional@example.invalid", password: "  fictional password  " }, state.current.identity);
  assert.deepEqual(JSON.parse(state.requests[0].body!), { email: "fictional@example.invalid", password: "  fictional password  " });
  assert.equal(state.requests[0].headers.Authorization, undefined);
  assert.equal(state.requests[0].headers["X-Expected-Account"], undefined);
  assert.equal(state.requests[0].headers.Cookie, undefined);
});

test("origin configuration rejects HTTP, userinfo, paths, fragments and production mode", () => {
  const source = { current: () => ({ identity: { owner: null, generation: 1 }, credential: null }) };
  for (const bad of ["http://fictional.example.invalid", origin + "/path", origin + "#fragment", "https://member@fictional.example.invalid"])
    assert.throws(() => createNativeRequestAdapter({ environment: "staging", origin: bad }, source, async () => response({})));
  assert.throws(() => createNativeRequestAdapter({ environment: "production" as "staging", origin }, source, async () => response({})));
});

test("changed identity or same-owner credential rejects a captured dispatch", async () => {
  for (const change of ["owner", "generation", "token"]) {
    const { state, adapter } = harness();
    const captured = await adapter.capture();
    state.current = change === "owner" ? { identity: { owner: "other", generation: 2 }, credential: { ownerId: "other", token } } :
      { identity: { owner, generation: change === "generation" ? 2 : 1 }, credential: { ownerId: owner, token: "b".repeat(43) } };
    await assert.rejects(captured.send({ path: "/api/platform/v1/feed", method: "GET", expectedOwner: owner }));
    assert.equal(state.requests.length, 0);
  }
});

test("unsafe paths and unsupported native writes never reach the wire", async () => {
  const { state, adapter } = harness();
  const captured = await adapter.capture();
  for (const path of ["https://other.invalid/api/platform/v1/feed", "//other.invalid/feed", "/api/platform/v1/../admin", "/api/platform/v1/%2e%2e/admin", "/api/platform/v1/posts/a%2fb", "/api/platform/v1/feed#private"])
    await assert.rejects(captured.send({ path, method: "GET", expectedOwner: owner }));
  for (const path of ["/api/platform/v1/posts", "/api/platform/v1/authenticator", "/api/platform/v1/session/logout?copy=1"])
    await assert.rejects(captured.send({ path, method: "POST", expectedOwner: owner, body: "{}" }));
  assert.equal(state.requests.length, 0);
});

test("owner/header and body bounds fail before dispatch, including multi-byte text", async () => {
  const { state, adapter } = harness();
  const captured = await adapter.capture();
  await assert.rejects(captured.send({ path: "/api/platform/v1/session", method: "GET", expectedOwner: null }));
  await assert.rejects(captured.send({ path: "/api/platform/v1/session", method: "GET", expectedOwner: owner, body: "{}" }));
  await assert.rejects(captured.send({ path: "/api/platform/v1/session/activity", method: "POST", expectedOwner: owner, body: "€".repeat(50) }));
  assert.equal(state.requests.length, 0);
});

test("late same-account replacement cannot return a feed or expose a failure", async () => {
  const { state, client } = harness();
  state.onSend = async () => {
    state.current = { identity: { owner, generation: 2 }, credential: { ownerId: owner, token: "b".repeat(43) } };
  };
  await assert.rejects(client.feed(owner, query), rejected);
  assert.equal(state.requests.length, 1);
});

test("non-JSON, redirects, cacheable, oversized and malformed replies are not exposed", async () => {
  for (const changed of [
    { contentType: "text/html" }, { apiVersion: null }, { apiVersion: "2" }, { status: 302 }, { cacheControl: "private, max-age=30" },
    { body: " ".repeat(API_MAX_RESPONSE_BYTES + 1) }, { body: "€".repeat(Math.floor(API_MAX_RESPONSE_BYTES / 3) + 1) },
    { body: "{" }, { body: JSON.stringify({ ...apiResponseExamples.feed, viewerId: "other" }) }
  ]) {
    const { state, client } = harness(); state.response = { ...state.response, ...changed };
    await assert.rejects(client.feed(owner, query), rejected);
    assert.equal(state.requests.length, 1, "No implicit replay");
  }
});

test("network errors are sanitized and never replayed by the JS adapter", async () => {
  const { state, client } = harness();
  state.onSend = async () => { throw new RequestClientError(503, token, undefined, true, token); };
  await assert.rejects(client.feed(owner, query), error => {
    rejected(error); assert.equal((error as RequestClientError).responseError, false); return true;
  });
  assert.equal(state.requests.length, 1);
});

test("aborted requests create no dispatch or cancel their existing native task", async () => {
  const { state, client } = harness();
  const cancelled = new AbortController(); cancelled.abort();
  await assert.rejects(client.feed(owner, query, cancelled.signal), rejected);
  assert.equal(state.requests.length, 0);
  const active = new AbortController();
  state.onSend = async request => {
    active.abort();
    assert.equal(request.signal.aborted, true);
    throw Error("Cancelled native task");
  };
  await assert.rejects(client.feed(owner, query, active.signal), rejected);
  assert.equal(state.requests.length, 1);
});

test("four simultaneous native requests are bounded and failures release slots", async () => {
  const { state, client } = harness();
  const releases: Array<() => void> = [];
  state.onSend = () => new Promise(resolve => releases.push(resolve));
  const flights = Array.from({ length: 4 }, () => client.feed(owner, query));
  await assert.rejects(client.feed(owner, query), rejected);
  assert.equal(state.requests.length, 4);
  releases.forEach(release => release()); await Promise.all(flights);
  state.onSend = undefined;
  await client.feed(owner, query);
  assert.equal(state.requests.length, 5);
});

test("captured revocation cannot pick up a newer global credential", async () => {
  const { state } = harness();
  const old = state.current;
  const sent: NativeWireRequest[] = [];
  const revoke = createNativeClient(createNativeRequestAdapter({ environment: "staging", origin }, { current: () => old }, async request => {
    sent.push(request);
    return response({ apiVersion: "1", viewerId: owner, data: { ownerId: owner, signedOut: true } });
  }));
  state.current = { identity: { owner, generation: 2 }, credential: { ownerId: owner, token: "b".repeat(43) } };
  await revoke.logout(owner);
  assert.equal(sent[0].headers.Authorization, "Bearer " + token);
  assert.equal(sent[0].body, "{}");
  assert.equal(state.current.credential?.token, "b".repeat(43));
});

test("server Retry-After and denied details retain canonical classification without raw text", async () => {
  const { state, client } = harness();
  state.response = { ...response({ apiVersion: "1", error: { code: "rate_limited", message: token, retryAfterSeconds: 30 } }), status: 429, retryAfter: "30" };
  await assert.rejects(client.feed(owner, query), error => {
    rejected(error); const value = error as RequestClientError;
    assert.equal(value.code, "rate_limited"); assert.equal(value.retryAfter, 30); assert.equal(value.responseError, true);
    return true;
  });
  assert.equal(state.requests.length, 1);
});

test("version and availability denials remain typed v1 responses with one dispatch", async () => {
  for (const [code, status] of [["unsupported_version", 426], ["feature_unavailable", 503], ["validation", 400]] as const) {
    const { state, client } = harness();
    state.response = { ...response({ apiVersion: "1", error: { code, message: token, retryAfterSeconds: null } }), status };
    await assert.rejects(client.feed(owner, query), error => {
      rejected(error); const value = error as RequestClientError;
      assert.equal(value.responseError, true); assert.equal(value.code, code); assert.equal(value.status, status); return true;
    });
    assert.equal(state.requests.length, 1); assert.equal(state.requests[0].headers["X-API-Version"], "1");
  }
});

test("missing or incompatible response versions cannot manufacture a confirmed update denial", async () => {
  for (const change of [{ apiVersion: null }, { apiVersion: "2" }, { body: JSON.stringify({ apiVersion: "2",
    error: { code: "unsupported_version", message: token, retryAfterSeconds: null } }) }]) {
    const { state, client } = harness();
    state.response = { ...response({ apiVersion: "1", error: { code: "unsupported_version", message: token, retryAfterSeconds: null } }), status: 426, ...change };
    await assert.rejects(client.feed(owner, query), error => {
      rejected(error); assert.equal((error as RequestClientError).responseError, false); return true;
    });
    assert.equal(state.requests.length, 1);
  }
});

test("clock failures cannot expose private diagnostics through canonical rate-limit handling", async () => {
  for (const status of [429, 503]) {
    const { state } = harness();
    const adapter = createNativeRequestAdapter({ environment: "staging", origin }, { current: () => state.current }, async () => ({
      ...response({ apiVersion: "1", error: { code: status === 429 ? "rate_limited" : "unconfirmed", message: "Try later.", retryAfterSeconds: 30 } }),
      status, retryAfter: "30"
    }), () => { throw new RequestClientError(503, token, undefined, false, token); });
    await assert.rejects(createNativeClient(adapter).feed(owner, query), rejected);
  }
});

test("late response consumption and successful completion after cancellation stay fenced", async () => {
  const { state, adapter, client } = harness();
  const captured = await adapter.capture();
  const received = await captured.send({ path: "/api/platform/v1/feed", method: "GET", expectedOwner: owner });
  state.current = { ...state.current, identity: { owner, generation: 2 } };
  await assert.rejects(received.read());
  const active = new AbortController();
  state.onSend = async () => { active.abort(); };
  await assert.rejects(client.feed(owner, query, active.signal), rejected);
});
