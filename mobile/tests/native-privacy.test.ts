import assert from "node:assert/strict";
import test from "node:test";
import { observeNativePrivacy, presentationMatches, type NativePrivacyPresentation,
  type NativePrivacySource } from "../src/platform/native-privacy.ts";
import { createNativeFixture } from "../src/spike/native-fixture.ts";
import { observeSessionVisibility } from "../src/platform/session-visibility.ts";

function deferred<T>() {
  let resolve: (value: T) => void = () => {}, reject: (error: Error) => void = () => {};
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
const settle = () => new Promise<void>(resolve => setImmediate(resolve));
function source() {
  const reads: ReturnType<typeof deferred<unknown>>[] = [], callbacks: Array<() => void> = [], order: string[] = [];
  const listeners = new Set<() => void>();
  const port: NativePrivacySource = {
    readState() { order.push("read"); const request = deferred<unknown>(); reads.push(request); return request.promise; },
    onStateChange(listener) {
      order.push("subscribe"); callbacks.push(listener); listeners.add(listener);
      return () => { order.push("unsubscribe"); listeners.delete(listener); };
    }
  };
  return { port, reads, callbacks, order, emit() { for (const listener of listeners) listener(); } };
}
function subject(t: { after(cleanup: () => void): void }) {
  const f = createNativeFixture({ latencyMs: 0 }); t.after(f.runtime.dispose);
  const bridge = source(), updates: boolean[] = [], published: Array<NativePrivacyPresentation | null> = [];
  const atPublication: Array<ReturnType<typeof f.runtime.session.getSnapshot>> = [];
  const update = (foreground: boolean) => {
    updates.push(foreground);
    const completion = f.runtime.setForeground(foreground);
    return { generation: f.runtime.session.getSnapshot().generation, completion };
  };
  const publish = (token: NativePrivacyPresentation | null) => {
    published.push(token); atPublication.push(f.runtime.session.getSnapshot());
  };
  const start = () => { const stop = observeNativePrivacy(bridge.port, update, publish); t.after(stop); return stop; };
  return { ...f, bridge, updates, published, atPublication, update, publish, start,
    token() { const token = published.at(-1); assert.ok(token); return token; } };
}

test("native observation subscribes before reading and pairs its first token only with a freshly concealed runtime", async t => {
  const f = subject(t); await f.runtime.setForeground(true); await f.signIn();
  const old = f.runtime.session.getSnapshot(); assert.equal(old.phase, "ready");
  f.start();
  assert.deepEqual(f.bridge.order, ["subscribe", "read"]);
  assert.equal(f.runtime.session.getSnapshot().phase, "concealed"); assert.equal(f.published.at(-1), null);
  f.bridge.reads[0].resolve({ epoch: 1, active: true }); await settle();
  const token = f.token(), atPublish = f.atPublication.at(-1)!;
  assert.equal(atPublish.phase, "verifying"); assert.equal(token.sessionGeneration, atPublish.generation);
  assert.equal(token.epoch, 1); assert.ok(token.presentationId.length > 0);
  assert.equal(presentationMatches(token, old), false);
  assert.equal(f.runtime.session.getSnapshot().phase, "ready");
  assert.equal(presentationMatches(token, f.runtime.session.getSnapshot()), true);
});

test("every native prompt immediately conceals and only the newest authoritative read can reactivate", async t => {
  const f = subject(t); f.start();
  f.bridge.reads[0].resolve({ epoch: 1, active: true }); await settle(); await f.signIn();
  f.bridge.emit();
  assert.equal(f.runtime.session.getSnapshot().phase, "concealed");
  assert.equal(f.runtime.reading.getSnapshot().kind, "concealed"); assert.equal(f.published.at(-1), null);
  f.bridge.emit();
  f.bridge.reads[1].resolve({ epoch: 2, active: true }); await settle();
  assert.equal(f.runtime.session.getSnapshot().phase, "concealed"); assert.equal(f.published.at(-1), null);
  f.bridge.reads[2].resolve({ epoch: 3, active: true }); await settle();
  assert.equal(f.token().epoch, 3); assert.equal(f.runtime.session.getSnapshot().phase, "ready");
});

test("duplicate current epochs get fresh presentations after concealment while lower epochs stay concealed", async t => {
  const f = subject(t); f.start();
  f.bridge.reads[0].resolve({ epoch: 8, active: true }); await settle(); const first = f.token();
  f.bridge.emit(); f.bridge.reads[1].resolve({ epoch: 8, active: true }); await settle(); const second = f.token();
  assert.notEqual(second.presentationId, first.presentationId);
  assert.ok(second.sessionGeneration > first.sessionGeneration);
  f.bridge.emit(); f.bridge.reads[2].resolve({ epoch: 7, active: true }); await settle();
  assert.equal(f.published.at(-1), null); assert.equal(f.runtime.session.getSnapshot().phase, "concealed");
  f.bridge.emit(); f.bridge.reads[3].resolve({ epoch: 9, active: false }); await settle();
  assert.equal(f.published.at(-1), null);
  f.bridge.emit(); f.bridge.reads[4].resolve({ epoch: 8, active: true }); await settle();
  assert.equal(f.published.at(-1), null, "inactive snapshots also advance the epoch fence");
});

test("unknown native state or unavailable bridge cannot activate the runtime", async t => {
  const malformed = [null, undefined, {}, [], { epoch: 1 }, { epoch: 1, active: "true" },
    { epoch: -1, active: true }, { epoch: 1.5, active: true }, { epoch: Number.MAX_SAFE_INTEGER + 1, active: true },
    { epoch: "1", active: true }];
  for (const state of malformed) {
    const f = subject(t); f.start(); f.bridge.reads[0].resolve(state); await settle();
    assert.equal(f.updates.includes(true), false); assert.equal(f.published.at(-1), null);
  }
  const broken: Array<NativePrivacySource | null> = [null,
    { readState: async () => ({ epoch: 1, active: true }), onStateChange() { throw Error("No native events"); } },
    { readState() { throw Error("Native snapshot unavailable"); }, onStateChange: () => () => {} },
    { readState: async () => { throw Error("Native snapshot unavailable"); }, onStateChange: () => () => {} }
  ];
  for (const port of broken) {
    const f = subject(t); await f.runtime.setForeground(true);
    const stop = observeNativePrivacy(port, f.update, f.publish); t.after(stop); await settle();
    assert.equal(f.updates.includes(true), false); assert.equal(f.published.at(-1), null);
    assert.equal(f.runtime.session.getSnapshot().phase, "concealed");
  }
});

test("cleanup fences retained callbacks and delayed reads, and remount creates a fresh presentation owner", async t => {
  const f = subject(t), stop = f.start();
  f.bridge.reads[0].resolve({ epoch: 1, active: true }); await settle(); const first = f.token();
  f.bridge.emit(); const delayed = f.bridge.reads[1], callback = f.bridge.callbacks[0];
  stop(); stop(); const reads = f.bridge.reads.length;
  callback(); assert.equal(f.bridge.reads.length, reads);
  const again = f.start();
  f.bridge.reads[2].resolve({ epoch: 1, active: true }); await settle(); const second = f.token();
  assert.notEqual(second.presentationId, first.presentationId);
  delayed.resolve({ epoch: 50, active: true }); await settle(); assert.equal(f.token(), second);
  again(); assert.equal(f.published.at(-1), null); assert.equal(f.runtime.session.getSnapshot().phase, "concealed");
});

test("current activation failure conceals while a previous activation failure cannot conceal its replacement", async t => {
  const f = subject(t), activations: ReturnType<typeof deferred<void>>[] = [];
  const update = (foreground: boolean) => {
    const current = f.update(foreground);
    if (!foreground) return current;
    const activation = deferred<void>(); activations.push(activation);
    return { generation: current.generation, completion: Promise.all([current.completion, activation.promise]) };
  };
  const stop = observeNativePrivacy(f.bridge.port, update, f.publish); t.after(stop);
  f.bridge.reads[0].resolve({ epoch: 1, active: true }); await settle();
  f.bridge.emit(); f.bridge.reads[1].resolve({ epoch: 2, active: true }); await settle(); const second = f.token();
  activations[0].reject(Error("Old activation failed")); await settle(); assert.equal(f.token(), second);
  activations[1].reject(Error("Current activation failed")); await settle();
  assert.equal(f.published.at(-1), null); assert.equal(f.runtime.session.getSnapshot().phase, "concealed");
});

test("presentation matching rejects old generations and concealment while allowing later canonical session changes", () => {
  const token = { epoch: 1, sessionGeneration: 5, presentationId: "fictional-presentation" };
  assert.equal(presentationMatches(null, { generation: 5, foreground: true, phase: "ready" }), false);
  assert.equal(presentationMatches(token, { generation: 4, foreground: true, phase: "ready" }), false);
  assert.equal(presentationMatches(token, { generation: 5, foreground: false, phase: "ready" }), false);
  assert.equal(presentationMatches(token, { generation: 5, foreground: true, phase: "concealed" }), false);
  assert.equal(presentationMatches(token, { generation: NaN, foreground: true, phase: "ready" }), false);
  assert.equal(presentationMatches(token, { generation: 5, foreground: true, phase: "verifying" }), true);
  assert.equal(presentationMatches(token, { generation: 6, foreground: true, phase: "signed-out" }), true);
  assert.equal(presentationMatches(token, { generation: 7, foreground: true, phase: "ready" }), true);
});

test("native privacy is the sole lifecycle source, including when the native bridge is missing", async t => {
  for (const missing of [false, true]) {
    const f = subject(t); await f.runtime.setForeground(true); await f.signIn();
    const forbidden = () => { assert.fail("Native privacy must not fall back to AppState or Android focus"); };
    const stop = observeSessionVisibility({
      nativePrivacy: { source: missing ? null : f.bridge.port,
        generation: () => f.runtime.session.getSnapshot().generation, publish: f.publish },
      currentState: forbidden, onState: forbidden, requiresFocus: true, onFocus: forbidden, currentFocus: forbidden
    }, foreground => f.update(foreground).completion);
    t.after(stop);
    assert.equal(f.runtime.session.getSnapshot().phase, "concealed");
    if (missing) { assert.equal(f.published.at(-1), null); continue; }
    f.bridge.reads[0].resolve({ epoch: 1, active: true }); await settle();
    assert.equal(f.runtime.session.getSnapshot().phase, "ready");
    assert.equal(presentationMatches(f.token(), f.runtime.session.getSnapshot()), true);
    f.bridge.emit(); assert.equal(f.runtime.session.getSnapshot().phase, "concealed");
    assert.equal(f.published.at(-1), null);
  }
});
