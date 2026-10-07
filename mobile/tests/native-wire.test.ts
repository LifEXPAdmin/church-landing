import assert from "node:assert/strict";
import test from "node:test";
import { createBridgedNativeWire, type NativeJsonBridge } from "../src/platform/native-wire.ts";
import type { NativeWireRequest, NativeWireResponse } from "../src/platform/request-adapter.ts";

const origin = "https://fictional.example.invalid";
const response: NativeWireResponse = { status: 200, apiVersion: "1", contentType: "application/json", cacheControl: "no-store", retryAfter: null, body: "{}" };
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
function deferred() { let resolve: () => void = () => {}; const promise = new Promise<void>(done => { resolve = done; }); return { promise, resolve }; }
function fixture() {
  let nonce = 0;
  const calls: { kind: string; id: string }[] = [];
  const bridge: NativeJsonBridge = {
    async initialize(environment, url) { calls.push({ kind: "initialize", id: environment + "|" + url }); },
    async reserve(id) { calls.push({ kind: "reserve", id }); },
    async send(id) { calls.push({ kind: "send", id }); return response; },
    async cancel(id) { calls.push({ kind: "cancel", id }); }
  };
  const wire = createBridgedNativeWire({ environment: "staging", origin }, bridge, () => id(++nonce));
  return { bridge, calls, wire };
}
function request(signal = new AbortController().signal): NativeWireRequest {
  return { url: origin + "/api/platform/v1/session", method: "GET", headers: { Accept: "application/json" }, maximumResponseBytes: 2097152, timeoutMs: 15000, signal };
}

test("bridge initialization is lazy, fixed and reused; reservations precede dispatch", async () => {
  const f = fixture(); assert.equal(f.calls.length, 0);
  assert.equal(await f.wire(request()), response);
  await f.wire(request());
  assert.deepEqual(f.calls.map(call => call.kind), ["initialize", "reserve", "send", "cancel", "reserve", "send", "cancel"]);
  assert.equal(f.calls[0].id, "staging|" + origin);
});

test("pre-cancelled and noncanonical limits do not reach the bridge", async () => {
  const f = fixture(), abort = new AbortController(); abort.abort();
  await assert.rejects(f.wire(request(abort.signal)));
  await assert.rejects(f.wire({ ...request(), maximumResponseBytes: 2097153 }));
  await assert.rejects(f.wire({ ...request(), timeoutMs: 16000 }));
  assert.equal(f.calls.length, 0);
});

test("abort while initialization is pending cannot create a reservation", async () => {
  const f = fixture(), reached = deferred(), release = deferred(), abort = new AbortController();
  f.bridge.initialize = async () => { reached.resolve(); await release.promise; };
  const pending = f.wire(request(abort.signal)); await reached.promise;
  abort.abort(); await assert.rejects(pending); release.resolve();
  await Promise.resolve(); assert.ok(f.calls.every(call => call.kind === "cancel"));
});

test("late reservation after cancellation is cancelled again and never sent", async () => {
  const f = fixture(), reached = deferred(), release = deferred(), abort = new AbortController();
  let reserved = false;
  f.bridge.reserve = async () => { reached.resolve(); await release.promise; reserved = true; };
  f.bridge.cancel = async () => { reserved = false; };
  const pending = f.wire(request(abort.signal)); await reached.promise;
  abort.abort(); await assert.rejects(pending); release.resolve();
  await Promise.resolve(); await Promise.resolve();
  assert.equal(reserved, false); assert.equal(f.calls.some(call => call.kind === "send"), false);
});

test("cancellation rejects immediately even if native completion is delayed", async () => {
  const f = fixture(), reached = deferred(), release = deferred(), abort = new AbortController();
  f.bridge.send = async () => { reached.resolve(); await release.promise; return response; };
  const pending = f.wire(request(abort.signal)); await reached.promise;
  abort.abort(); await assert.rejects(pending); release.resolve();
  assert.ok(f.calls.some(call => call.kind === "cancel"));
});

test("four JS flights stay bounded and release after settlement", async () => {
  const f = fixture(), reached = deferred(), release = deferred(); let count = 0;
  f.bridge.send = async () => { if (++count === 4) reached.resolve(); await release.promise; return response; };
  const pending = Array.from({ length: 4 }, () => f.wire(request())); await reached.promise;
  await assert.rejects(f.wire(request())); assert.equal(count, 4);
  release.resolve(); await Promise.all(pending); await f.wire(request()); assert.equal(count, 5);
});

test("duplicate request IDs never cancel another active reservation", async () => {
  const f = fixture(), reached = deferred(), release = deferred();
  const wire = createBridgedNativeWire({ environment: "staging", origin }, f.bridge, () => id(1));
  f.bridge.send = async () => { reached.resolve(); await release.promise; return response; };
  const first = wire(request()); await reached.promise;
  await assert.rejects(wire(request()));
  assert.equal(f.calls.some(call => call.kind === "cancel"), false);
  release.resolve(); await first;
});

test("native diagnostics are sanitized and cancellation failure cannot escape", async () => {
  const f = fixture(); const secret = "fictional private diagnostic";
  f.bridge.send = async () => { throw Error(secret); };
  f.bridge.cancel = async () => { throw Error(secret); };
  await assert.rejects(f.wire(request()), error => {
    assert.equal((error as Error).message, "Native request could not be confirmed.");
    assert.equal(JSON.stringify(error).includes(secret), false); return true;
  });
});
