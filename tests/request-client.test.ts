import assert from "node:assert/strict";
import test from "node:test";
import {
  prepareRequest, RequestClientError, retryAfterSeconds,
  type RequestAdapter, type RequestCancellation, type RequestData, type RequestIdentity
} from "../packages/shared-core/src/request-client";
import { DraftController } from "../packages/shared-core/src/draft-controller";

const receipt = { id: "owner-a", version: 1, message: "Saved." };
function decode(value: unknown) {
  if (!value || typeof value !== "object" || (value as typeof receipt).id !== "owner-a" ||
      !Number.isInteger((value as typeof receipt).version)) throw Error();
  return value as typeof receipt;
}
function harness() {
  const state = {
    identity: { owner: "owner-a", generation: 1 } as RequestIdentity,
    status: 200, value: receipt as unknown, header: undefined as string | undefined,
    captureCount: 0, postCount: 0, challenges: 0,
    sent: [] as RequestData[], tokens: [] as string[], urls: [] as string[],
    onSend: undefined as undefined | ((cancel?: RequestCancellation) => Promise<void>),
    onRead: undefined as undefined | (() => Promise<void>)
  };
  const adapter: RequestAdapter = {
    async capture() {
      state.captureCount++;
      const identity = { ...state.identity };
      const credential = "fictional-credential-" + identity.generation;
      return { identity, async send(request, cancellation) {
        state.sent.push(request);
        state.tokens.push(credential);
        // Base URL and captured credentials live only in this adapter.
        state.urls.push("https://fictional.example" + request.path);
        await state.onSend?.(cancellation);
        return { status: state.status, retryAfter: state.header,
          async read() { await state.onRead?.(); return state.value; } };
      } };
    },
    async currentIdentity() { state.postCount++; return { ...state.identity }; },
    decodeFailure(value) {
      if (!value || typeof value !== "object") throw Error();
      return value as { message: string; code?: string };
    },
    challenge() { state.challenges++; return true; },
    now: () => Date.UTC(2026, 9, 7, 0, 0, 0)
  };
  const input = {
    path: "/api/platform/reaction-preferences", method: "POST" as const,
    expectedOwner: "owner-a", body: JSON.stringify({ mutationId: "original-key", desired: true }),
    idempotent: true, decode
  };
  return { state, adapter, input };
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
const failure = (code: string, dispatched?: boolean) => (error: unknown) => {
  assert.ok(error instanceof RequestClientError);
  assert.equal(error.code, code);
  if (dispatched !== undefined) assert.equal(error.dispatched, dispatched);
  return true;
};

test("native-compatible consumer binds one credential snapshot and validates before returning", async () => {
  const { state, adapter, input } = harness();
  const request = prepareRequest(adapter, input);
  const result = await request.run();
  assert.deepEqual(result, { owner: "owner-a", data: receipt });
  assert.equal(state.captureCount, 1);
  assert.equal(state.postCount, 1);
  assert.deepEqual(state.urls, ["https://fictional.example/api/platform/reaction-preferences"]);
  assert.deepEqual(state.tokens, ["fictional-credential-1"]);
  assert.equal(JSON.stringify(request).includes("fictional-credential"), false);
});

test("lost reply retries only the immutable original body, path and actor", async () => {
  const { state, adapter, input } = harness();
  const request = prepareRequest(adapter, input);
  const original = { ...request.request };
  state.onSend = async () => { throw Error("fictional credential or response must not escape"); };
  await assert.rejects(request.run(), failure("unconfirmed", true));
  assert.equal(state.sent.length, 1, "No automatic replay");
  input.path = "/api/platform/another-choice";
  input.body = JSON.stringify({ mutationId: "different-key", desired: false });
  input.expectedOwner = "owner-b";
  state.onSend = undefined;
  await request.run();
  assert.deepEqual(state.sent, [original, original]);
  assert.ok(Object.isFrozen(request.request));
});

test("a write without an idempotent receipt contract cannot be replayed", async () => {
  const { state, adapter, input } = harness();
  const request = prepareRequest(adapter, { ...input, idempotent: false });
  state.onSend = async () => { throw Error(); };
  await assert.rejects(request.run(), failure("unconfirmed"));
  state.onSend = undefined;
  await assert.rejects(request.run(), failure("recovery_required", false));
  assert.equal(state.sent.length, 1);
});

for (const [name, changed] of [
  ["another owner", { owner: "owner-b", generation: 2 }],
  ["same owner with a replaced credential", { owner: "owner-a", generation: 2 }]
] as const) test(`late response from ${name} is rejected before a challenge or result`, async () => {
  const { state, adapter, input } = harness();
  state.status = 403; state.value = { message: "Confirm", code: "authenticator_required" };
  state.onRead = async () => { state.identity = changed; };
  await assert.rejects(prepareRequest(adapter, input).run(), failure("account_changed", true));
  assert.equal(state.challenges, 0);
});

test("original identity is retained across an observed mismatch and safe return", async () => {
  const { state, adapter, input } = harness();
  const request = prepareRequest(adapter, input);
  state.onSend = async () => { throw Error(); };
  await assert.rejects(request.run(), failure("unconfirmed"));
  state.onSend = undefined;
  state.identity = { owner: "owner-b", generation: 2 };
  await assert.rejects(request.run(), failure("account_changed", false));
  assert.equal(state.sent.length, 1);
  // Browser identity generations represent owner checks; native credential
  // replacement uses a new generation and must remain blocked separately.
  state.identity = { owner: "owner-a", generation: 1 };
  await request.run();
  assert.equal(state.sent.length, 2);
});

test("same-owner credential replacement prevents retry with new credentials", async () => {
  const { state, adapter, input } = harness();
  const request = prepareRequest(adapter, input);
  state.onSend = async () => { throw Error(); };
  await assert.rejects(request.run(), failure("unconfirmed"));
  state.identity = { owner: "owner-a", generation: 2 };
  await assert.rejects(request.run(), failure("account_changed", false));
  assert.deepEqual(state.tokens, ["fictional-credential-1"]);
});

test("malformed and non-JSON replies retain uncertainty and still check identity", async () => {
  const { state, adapter, input } = harness();
  state.onRead = async () => { throw SyntaxError("private response fragment"); };
  await assert.rejects(prepareRequest(adapter, input).run(), failure("unconfirmed", true));
  assert.equal(state.postCount, 1);
  state.onRead = undefined; state.value = { id: "different-owner", version: "bad" };
  await assert.rejects(prepareRequest(adapter, input).run(), failure("unconfirmed", true));
  assert.equal(state.postCount, 2);
});

test("transport diagnostics are redacted from the public failure", async () => {
  const { state, adapter, input } = harness();
  state.onSend = async () => { throw Error("fictional-private-token-and-body"); };
  await assert.rejects(prepareRequest(adapter, input).run(), error => {
    assert.ok(error instanceof RequestClientError);
    assert.equal(error.message.includes("fictional-private-token"), false);
    return true;
  });
});

test("cancellation before dispatch creates no request or uncertain receipt", async () => {
  const { state, adapter, input } = harness(), control = cancellation();
  control.cancel();
  await assert.rejects(prepareRequest(adapter, input).run({ cancellation: control.signal }), failure("cancelled", false));
  assert.equal(state.captureCount, 0);
  assert.equal(state.sent.length, 0);
});

test("cancellation after dispatch preserves the original uncertain write for explicit replay", async () => {
  const { state, adapter, input } = harness(), control = cancellation();
  const request = prepareRequest(adapter, input);
  state.onRead = async () => control.cancel();
  await assert.rejects(request.run({ cancellation: control.signal }), failure("cancelled", true));
  assert.equal(state.postCount, 0, "Do not start another network check after cancellation");
  state.onRead = undefined;
  await request.run();
  assert.equal(state.sent.length, 2);
  assert.deepEqual(state.sent[0], state.sent[1]);
});

test("dispatch callback can cancel before network transmission", async () => {
  const { state, adapter, input } = harness(), control = cancellation();
  await assert.rejects(prepareRequest(adapter, input).run({ cancellation: control.signal, onDispatch: () => control.cancel() }), failure("cancelled", false));
  assert.equal(state.sent.length, 0);
});

test("concurrent attempts cannot send the same pending write twice", async () => {
  const { state, adapter, input } = harness();
  let release!: () => void;
  state.onSend = () => new Promise<void>(resolve => { release = resolve; });
  const request = prepareRequest(adapter, input), first = request.run();
  await assert.rejects(request.run(), failure("in_progress", false));
  release(); await first;
  assert.equal(state.sent.length, 1);
});

test("confirmed conflicts and authenticator errors preserve their existing classification", async () => {
  const { state, adapter, input } = harness();
  state.status = 409; state.value = { message: "Refresh first.", code: "conflict" };
  await assert.rejects(prepareRequest(adapter, input).run(), failure("conflict", true));
  state.status = 403; state.value = { message: "Verify first.", code: "authenticator_required" };
  await assert.rejects(prepareRequest(adapter, input).run(), error => {
    assert.ok(error instanceof RequestClientError);
    assert.equal(error.needsAuthenticator, true); assert.equal(error.status, 403);
    assert.equal(error.responseError, true);
    return true;
  });
  assert.equal(state.challenges, 1);
});

test("Retry-After seconds and dates are bounded hints with no timer or replay", async () => {
  const { state, adapter, input } = harness();
  state.status = 429; state.value = { message: "Wait.", code: "rate_limited" }; state.header = "30";
  await assert.rejects(prepareRequest(adapter, input).run(), error => {
    assert.ok(error instanceof RequestClientError); assert.equal(error.retryAfter, 30); return true;
  });
  assert.equal(state.sent.length, 1);
  assert.equal(retryAfterSeconds("Wed, 07 Oct 2026 00:01:00 GMT", adapter.now()), 60);
  for (const value of ["-1", "1.5", "Infinity", "999999999999999999999999", "86401", "not a date"])
    assert.equal(retryAfterSeconds(value, adapter.now()), undefined);
});

test("untrusted paths and unsupported idempotent writes fail before credentials are read", () => {
  const { state, adapter, input } = harness();
  for (const path of ["https://other.example/api/platform/feed", "//other.example/path", "/api/platform/%2e%2e/private", "/api/platform/thing%2fprivate"])
    assert.throws(() => prepareRequest(adapter, { ...input, path }), RequestClientError);
  assert.throws(() => prepareRequest(adapter, { ...input, body: JSON.stringify({ desired: true }) }), RequestClientError);
  assert.equal(state.captureCount, 0);
});

test("the existing draft controller uses only the injected timer and UUID", async () => {
  let scheduled = 0, cancelled = 0;
  const controller = new DraftController(async () => ({ status: 200, data: { id: "owner-a" } }),
    () => "fixture-draft", {
      schedule(_callback, milliseconds) { assert.equal(milliseconds, 5000); scheduled++; return scheduled; },
      cancel() { cancelled++; }
    });
  const hidden = controller.getServerSnapshot();
  assert.equal(hidden.hidden, true);
  await controller.verify(); controller.start();
  assert.equal(controller.getSnapshot().id, "fixture-draft");
  controller.change({ ...controller.getSnapshot().fields, content: "Unsent entry" });
  assert.equal(scheduled, 1);
  assert.equal(controller.getServerSnapshot(), hidden);
  controller.conceal(); assert.equal(cancelled, 1);
  controller.dispose();
});
