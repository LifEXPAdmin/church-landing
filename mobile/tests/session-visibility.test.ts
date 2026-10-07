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

test("unknown or non-active state stays concealed; iOS active resumes and inactive immediately conceals", () => {
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
