import assert from "node:assert/strict";
import test from "node:test";
import { observeSessionVisibility, type SessionVisibilitySource } from "../src/platform/session-visibility.ts";

function fixture(requiresFocus = false, initial: string | null = "active") {
  const values: boolean[] = [], removed: string[] = [];
  let state: (value: string | null) => void = () => {}, focus: (value: boolean) => void = () => {};
  const source: SessionVisibilitySource = {
    currentState: () => initial, requiresFocus,
    onState(listener) { state = listener; return () => { removed.push("state"); }; },
    onFocus(listener) { focus = listener; return () => { removed.push("focus"); }; }
  };
  return { source, values, removed, state: (value: string | null) => state(value), focus: (value: boolean) => focus(value),
    start: (update: (value: boolean) => void | Promise<unknown> = value => { values.push(value); }) => observeSessionVisibility(source, update) };
}
const settle = async () => { await Promise.resolve(); await Promise.resolve(); };
function pendingFocus(f: ReturnType<typeof fixture>) {
  const requests: { resolve: (value: unknown) => void; reject: (error: Error) => void }[] = [];
  f.source.currentFocus = () => new Promise((resolve, reject) => { requests.push({ resolve, reject }); });
  return requests;
}

test("Android mounted after the last focus event can resume from an authoritative snapshot", async () => {
  const f = fixture(true);
  f.source.currentFocus = async () => true;
  const stop = f.start();
  assert.deepEqual(f.values, [false], "remain concealed until the native reply");
  await settle();
  assert.deepEqual(f.values, [false, true]);
  stop();
});

test("newer blur or focus overrides either direction of an in-flight native snapshot", async () => {
  const f = fixture(true), requests = pendingFocus(f), stop = f.start();
  f.focus(false); requests[0].resolve(true); await settle();
  assert.deepEqual(f.values, [false], "late true must not erase notification shade blur");
  f.state("background"); f.state("active");
  f.focus(true); requests[1].resolve(false); await settle();
  assert.deepEqual(f.values, [false], "a positive event needs a current snapshot");
  requests[2].resolve(true); await settle();
  assert.deepEqual(f.values, [false, true], "only the newest query can establish focus");
  stop();
});

test("a stale positive focus event cannot reopen after a newer snapshot observes blur", async () => {
  const f = fixture(true), requests = pendingFocus(f), stop = f.start();
  requests[0].resolve(false); await settle();
  f.focus(true); assert.deepEqual(f.values, [false]);
  requests[1].resolve(false); await settle(); assert.deepEqual(f.values, [false]); stop();
});

test("background and teardown fence pending snapshots; each new active epoch gets its own query", async () => {
  const f = fixture(true), requests = pendingFocus(f), stop = f.start();
  f.state("background"); requests[0].resolve(true); await settle();
  assert.deepEqual(f.values, [false]);
  f.state("active"); assert.equal(requests.length, 2);
  requests[1].resolve(true); await settle(); assert.equal(f.values.at(-1), true);
  f.state("background"); f.state("active"); stop();
  const count = f.values.length;
  requests[2].resolve(true); await settle();
  assert.equal(f.values.at(-1), false); assert.equal(f.values.length, count);
});

test("an older foreground query cannot reopen a later active epoch", async () => {
  const f = fixture(true), requests = pendingFocus(f), stop = f.start();
  f.state("background"); f.state("active");
  requests[0].resolve(true); await settle(); assert.deepEqual(f.values, [false]);
  requests[1].resolve(true); await settle(); assert.deepEqual(f.values, [false, true]); stop();
});

test("duplicate active events do not query away a known blur or cancel the startup snapshot", async () => {
  const f = fixture(true), requests = pendingFocus(f), stop = f.start();
  f.state("active"); assert.equal(requests.length, 1);
  requests[0].resolve(true); await settle(); assert.equal(f.values.at(-1), true);
  f.focus(false); f.state("active");
  assert.equal(requests.length, 1); assert.equal(f.values.at(-1), false); stop();
});

test("missing, invalid, throwing and rejected native snapshots remain concealed", async () => {
  for (const value of [null, undefined, "true", 1, {}, false]) {
    const f = fixture(true); f.source.currentFocus = async () => value;
    const stop = f.start(); await settle(); assert.deepEqual(f.values, [false]); stop();
  }
  for (const read of [() => { throw Error("Missing module"); }, () => Promise.reject(Error("No window"))]) {
    const f = fixture(true); f.source.currentFocus = read;
    const stop = f.start(); await settle(); assert.deepEqual(f.values, [false]); stop();
  }
});

test("a non-focus source skips the Android module; Android subscriptions precede its snapshot", async () => {
  const ios = fixture(); ios.source.currentFocus = () => { assert.fail("iOS must use its own active state"); };
  const done = ios.start(); assert.deepEqual(ios.values, [false, true]); done();
  const f = fixture(true), order: string[] = [];
  const onFocus = f.source.onFocus!, onState = f.source.onState;
  f.source.onFocus = listener => { order.push("focus"); return onFocus(listener); };
  f.source.onState = listener => { order.push("state"); return onState(listener); };
  f.source.currentFocus = async () => { order.push("snapshot"); return true; };
  const stop = f.start(); await settle();
  assert.deepEqual(order, ["focus", "state", "snapshot"]); stop();
});

test("generic non-focus observation conceals unknown or inactive state and resumes active state", () => {
  for (const initial of [null, "unknown", "background", "inactive", "extension"]) {
    const f = fixture(false, initial); const stop = f.start(); assert.deepEqual(f.values, [false]); stop();
  }
  const f = fixture(); const stop = f.start(); assert.deepEqual(f.values, [false, true]);
  f.state("inactive"); f.state("active"); f.state("background");
  assert.deepEqual(f.values, [false, true, false, true, false]); stop();
});

test("Android requires both active and a fresh focus event, including notification-shade blur", () => {
  const f = fixture(true); const stop = f.start();
  assert.deepEqual(f.values, [false]); f.focus(true); f.focus(false); f.state("active");
  assert.deepEqual(f.values, [false, true, false], "active cannot erase a known blur");
  f.focus(true); f.state("background"); f.state("active");
  assert.equal(f.values.at(-1), false, "background discards remembered focus");
  f.focus(true); assert.equal(f.values.at(-1), true); stop();
});

test("focus arriving before the next active event is retained, but never opens background data", () => {
  const f = fixture(true, "background"); const stop = f.start();
  f.focus(true); assert.deepEqual(f.values, [false]); f.state("active");
  assert.deepEqual(f.values, [false, true]); stop();
});

test("missing focus support, state-read failure and partial subscription failure fail closed", () => {
  const a = fixture(true); delete a.source.onFocus; a.start(); assert.ok(a.values.every(value => !value));
  const b = fixture(); b.source.currentState = () => { throw Error("Unavailable"); }; b.start();
  assert.ok(b.values.every(value => !value)); assert.deepEqual(b.removed, ["state"]);
  const c = fixture(true); c.source.onState = () => { throw Error("Unavailable"); }; c.start();
  assert.ok(c.values.every(value => !value)); assert.deepEqual(c.removed, ["focus"]);
});

test("cleanup conceals before removal and ignores callbacks already queued by the native emitter", () => {
  const f = fixture(true); const stop = f.start(); f.focus(true); stop();
  const count = f.values.length; f.focus(true); f.state("active"); stop();
  assert.equal(f.values.at(-1), false); assert.equal(f.values.length, count);
  assert.deepEqual(f.removed.sort(), ["focus", "state"]);
});

test("one failing subscription removal cannot prevent the other from being removed", () => {
  const f = fixture(true); f.source.onFocus = () => () => { throw Error("Removal failed"); };
  const stop = f.start(); assert.doesNotThrow(stop); assert.deepEqual(f.removed, ["state"]);
});

test("a pending activation never delays concealment and its late failure cannot conceal a new activation", async () => {
  const f = fixture(); let reject: (error: Error) => void = () => {}, first = true;
  const stop = f.start(value => {
    f.values.push(value);
    if (value && first) { first = false; return new Promise((_, fail) => { reject = fail; }); }
  });
  f.state("background"); f.state("active"); reject(Error("Old failure")); await settle();
  assert.deepEqual(f.values, [false, true, false, true]); stop();
});

test("current callback rejection conceals, contains errors and requires fresh activity", async () => {
  const f = fixture(); const stop = f.start(value => { f.values.push(value); if (value) return Promise.reject(Error("Unavailable")); });
  await settle(); assert.deepEqual(f.values, [false, true, false]); stop();
  const g = fixture(); const done = g.start(() => { throw Error("Unavailable"); }); assert.doesNotThrow(done);
});

test("effect teardown and remount can reuse the session without disposing its owner", () => {
  const f = fixture(); const first = f.start(); first(); const second = f.start();
  assert.deepEqual(f.values, [false, true, false, false, true]); second();
});

test("iOS native epochs are the sole visibility source and capture generation after synchronous invalidation", async () => {
  let generation = 0;
  const changes: boolean[] = [], proof: { epoch: number; sessionGeneration: number }[] = [];
  let changed: () => void = () => {};
  let epoch = 1;
  const unused = () => { assert.fail("iOS must not observe a competing AppState or Android focus source"); };
  const stop = observeSessionVisibility({ requiresFocus: true, currentState: unused, onState: unused,
    currentFocus: unused, onFocus: unused, nativePrivacy: {
      source: { readState: async () => ({ epoch, active: true }),
        onStateChange(listener) { changed = listener; return () => {}; } },
      generation: () => generation, publish(value) { if (value) proof.push(value); }
    }
  }, value => { changes.push(value); generation++; });
  await settle();
  assert.equal(changes.at(-1), true);
  assert.equal(proof.at(-1)?.sessionGeneration, generation);
  const firstGeneration = generation;
  epoch++; changed();
  assert.equal(changes.at(-1), false, "a native epoch conceals immediately before the read");
  await settle();
  assert.equal(proof.at(-1)?.epoch, 2);
  assert.ok(proof.at(-1)!.sessionGeneration > firstGeneration);
  stop(); assert.equal(changes.at(-1), false);
});

test("an iOS binary without the privacy bridge cannot fall back to an active AppState", () => {
  const changes: boolean[] = [];
  const stop = observeSessionVisibility({ requiresFocus: false, currentState: () => "active",
    onState() { assert.fail("missing native cover is not a fallback permission"); },
    nativePrivacy: { source: null, generation: () => 0, publish() {} }
  }, value => { changes.push(value); });
  assert.ok(changes.length && changes.every(value => value === false));
  stop();
});
