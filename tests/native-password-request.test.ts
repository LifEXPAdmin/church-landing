import assert from "node:assert/strict";
import test from "node:test";
import {
  issueNativePasswordCredential, prepareRequest, RequestClientError,
  type RequestAdapter, type RequestCancellation, type RequestData, type RequestIdentity
} from "../packages/shared-core/src/request-client";

const credentials = { email: "fictional@example.invalid", password: "  fictional-Secret  " };
const issued = () => ({
  apiVersion: "1", viewerId: "owner-a",
  data: {
    tokenType: "Bearer", token: "a".repeat(43),
    session: { state: "authenticated", account: { id: "owner-a", name: "Alex", username: "fictional_alex" } },
    activity: {
      owner: "owner-a", legacy: false, deadline: "2026-10-07T12:30:00.000Z",
      absoluteExpiresAt: "2026-11-06T12:00:00.000Z", serverTime: "2026-10-07T12:00:00.000Z"
    }
  }
});
function harness() {
  const state = {
    identity: { owner: null, generation: 1 } as RequestIdentity,
    captures: 0, sent: [] as RequestData[], status: 200, value: issued() as unknown,
    header: undefined as string | undefined,
    beforeCapture: undefined as (() => Promise<void>) | undefined,
    afterCapture: undefined as (() => Promise<void>) | undefined,
    onSend: undefined as (() => Promise<void>) | undefined,
    onRead: undefined as (() => Promise<void>) | undefined
  };
  const adapter: RequestAdapter = {
    async capture() {
      state.captures++;
      await state.beforeCapture?.();
      const identity = { ...state.identity };
      await state.afterCapture?.();
      return { identity, async send(request) {
        state.sent.push(request);
        await state.onSend?.();
        return { status: state.status, retryAfter: state.header, async read() {
          await state.onRead?.(); return state.value;
        } };
      } };
    },
    async currentIdentity() { return { ...state.identity }; },
    decodeFailure() { throw Error("Issuance must use the canonical failure decoder"); },
    challenge() { throw Error("Initial password issuance must not emit a privileged challenge"); },
    now: () => Date.UTC(2026, 9, 7, 12)
  };
  const issue = (identity: RequestIdentity = state.identity, cancellation?: RequestCancellation) =>
    issueNativePasswordCredential(adapter, credentials, identity, { cancellation });
  return { state, adapter, issue };
}
function cancellation() {
  let cancelled = false;
  const listeners = new Set<() => void>();
  return {
    signal: { get cancelled() { return cancelled; }, subscribe(listener: () => void) {
      listeners.add(listener); return () => { listeners.delete(listener); };
    } },
    cancel() { cancelled = true; listeners.forEach(listener => listener()); }
  };
}
const failure = (code: string, dispatched: boolean) => (error: unknown) => {
  assert.ok(error instanceof RequestClientError);
  assert.equal(error.code, code);
  assert.equal(error.dispatched, dispatched);
  assert.equal(JSON.stringify(error).includes(credentials.password), false);
  assert.equal(error.message.includes(credentials.password), false);
  assert.equal("request" in error || "run" in error, false);
  return true;
};

test("one-shot guest issuance preserves exact password bytes and returns only a decoded result", async () => {
  const { state, issue } = harness();
  const pending = issue();
  assert.deepEqual(Object.keys(pending), []);
  const result = await pending;
  assert.deepEqual(result, issued());
  assert.equal("request" in result || "run" in result, false);
  assert.deepEqual(state.sent, [{
    path: "/api/platform/v1/auth/password", method: "POST", expectedOwner: null,
    body: JSON.stringify(credentials)
  }]);
  assert.ok(Object.isFrozen(state.sent[0]));
  assert.deepEqual(state.identity, { owner: null, generation: 1 }, "Caller must explicitly commit the credential");
});

test("issuance supports adapters with prototype methods without losing their receiver", async () => {
  const { state, adapter } = harness();
  class NativeAdapter implements RequestAdapter {
    private delegate = adapter;
    capture(c?: RequestCancellation) { return this.delegate.capture(c); }
    currentIdentity(c?: RequestCancellation) { return this.delegate.currentIdentity(c); }
    decodeFailure(value: unknown) { return this.delegate.decodeFailure(value); }
    now() { return this.delegate.now(); }
  }
  assert.deepEqual(await issueNativePasswordCredential(new NativeAdapter(), credentials, state.identity), issued());
});

test("invalid password input fails before credential capture", async () => {
  const { state, adapter } = harness();
  for (const input of [{ ...credentials, password: "short" }, { ...credentials, email: "" }, { ...credentials, unexpected: true }])
    await assert.rejects(issueNativePasswordCredential(adapter, input, state.identity), failure("validation", false));
  assert.equal(state.captures, 0);
  assert.equal(state.sent.length, 0);
});

test("authenticated initiation cannot issue a replacement credential", async () => {
  const { state, issue } = harness();
  await assert.rejects(issue({ owner: "owner-a", generation: 1 }), failure("account_changed", false));
  assert.equal(state.captures, 0);
  assert.equal(state.sent.length, 0);
});

for (const identity of [{ owner: "owner-a", generation: 2 }, { owner: null, generation: 2 }])
  test(`changed ${identity.owner ?? "guest"} generation during capture never adopts the newer identity`, async () => {
    const { state, issue } = harness();
    state.beforeCapture = async () => { state.identity = identity; };
    await assert.rejects(issue(), failure("account_changed", false));
    assert.equal(state.sent.length, 0);
  });

test("the initiating identity is copied before capture can mutate its caller-owned object", async () => {
  const { state, issue } = harness();
  const initiating = { owner: null, generation: 1 };
  state.identity = initiating;
  state.beforeCapture = async () => { initiating.generation = 2; };
  await assert.rejects(issue(initiating), failure("account_changed", false));
  assert.equal(state.sent.length, 0);
});

test("a stale capture is checked against current identity before dispatch", async () => {
  const { state, issue } = harness();
  state.afterCapture = async () => { state.identity = { owner: null, generation: 2 }; };
  await assert.rejects(issue(), failure("account_changed", false));
  assert.equal(state.sent.length, 0);
});

for (const identity of [{ owner: "owner-a", generation: 2 }, { owner: "owner-b", generation: 2 }, { owner: null, generation: 2 }])
  test(`late issuance after switching to ${identity.owner ?? "guest"} never exposes a credential`, async () => {
    const { state, issue } = harness();
    state.onRead = async () => { state.identity = identity; };
    await assert.rejects(issue(), failure("account_changed", true));
    assert.equal(state.sent.length, 1);
  });

test("contradictory identities and malformed successful replies remain uncertain with no replay", async () => {
  const { state, issue } = harness();
  const wrongActivity = issued(); wrongActivity.data.activity.owner = "owner-b";
  const badToken = issued(); badToken.data.token = "short";
  for (const value of [{ ...issued(), viewerId: "owner-b" }, wrongActivity, badToken, {}]) {
    state.value = value;
    const before = state.sent.length;
    await assert.rejects(issue(), failure("unconfirmed", true));
    assert.equal(state.sent.length, before + 1);
  }
});

test("lost response and unreadable body dispatch once and redact transport details", async () => {
  for (const hook of ["onSend", "onRead"] as const) {
    const { state, issue } = harness();
    state[hook] = async () => { throw Error(credentials.password); };
    await assert.rejects(issue(), failure("unconfirmed", true));
    assert.equal(state.sent.length, 1);
  }
});

for (const phase of ["capture", "beforeIdentity", "afterIdentity", "send", "clock"])
  test(`adapter RequestClientError at ${phase} cannot expose password diagnostics or a false confirmed rejection`, async () => {
    const { state, adapter, issue } = harness();
    const leak = () => { throw new RequestClientError(503, credentials.password, 12, true, credentials.password, true, true); };
    if (phase === "capture") adapter.capture = async () => leak();
    if (phase === "send") state.onSend = async () => leak();
    if (phase === "beforeIdentity" || phase === "afterIdentity") {
      let checks = 0;
      adapter.currentIdentity = async () => {
        if (++checks === (phase === "beforeIdentity" ? 1 : 2)) leak();
        return state.identity;
      };
    }
    if (phase === "clock") {
      state.status = 429; state.header = "30";
      state.value = { apiVersion: "1", error: { code: "rate_limited", message: "Wait.", retryAfterSeconds: 30 } };
      adapter.now = leak;
    }
    const dispatched = ["afterIdentity", "send", "clock"].includes(phase);
    await assert.rejects(issue(), error => {
      failure("unconfirmed", dispatched)(error);
      assert.ok(error instanceof RequestClientError);
      assert.equal(error.responseError, false);
      assert.equal(error.needsAuthenticator, false);
      assert.equal(error.retryAfter, undefined);
      return true;
    });
    assert.equal(state.sent.length, dispatched ? 1 : 0);
  });

test("cancellation before, during capture and after dispatch never causes replay", async () => {
  for (const phase of ["before", "capture", "read"]) {
    const { state, issue } = harness(), control = cancellation();
    if (phase === "before") control.cancel();
    if (phase === "capture") state.beforeCapture = async () => control.cancel();
    if (phase === "read") state.onRead = async () => control.cancel();
    await assert.rejects(issue(state.identity, control.signal), failure("cancelled", phase === "read"));
    assert.equal(state.sent.length, phase === "read" ? 1 : 0);
  }
});

test("canonical rejection is sanitized and Retry-After is only a hint", async () => {
  const { state, issue } = harness();
  state.status = 429; state.header = "30";
  state.value = { apiVersion: "1", error: { code: "rate_limited", message: credentials.password, retryAfterSeconds: 30 } };
  await assert.rejects(issue(), error => {
    failure("rate_limited", true)(error);
    assert.ok(error instanceof RequestClientError);
    assert.equal(error.retryAfter, 30);
    assert.equal(error.responseError, true);
    assert.equal(error.needsAuthenticator, false);
    return true;
  });
  assert.equal(state.sent.length, 1);
});

test("ordinary prepared writes still require an owner, including the password route", async () => {
  const { state, adapter } = harness();
  for (const path of ["/api/platform/v1/auth/password", "/api/platform/v1/session/activity", "/api/platform/v1/reaction-preferences"])
    await assert.rejects(prepareRequest(adapter, {
      path, method: "POST", expectedOwner: null, body: JSON.stringify(credentials), decode: value => value
    }).run(), failure("account_changed", false));
  assert.equal(state.sent.length, 0);
});
