import test from "node:test";
import assert from "node:assert/strict";
import { observeMotionPreference } from "../src/ui/motion-preference.ts";

function fixture() {
  const queries: { resolve: (value: boolean) => void; reject: (error: Error) => void }[] = [];
  const values: boolean[] = [];
  let change = (_: boolean) => {}, resume = () => {}, stopped = 0;
  const stop = observeMotionPreference({
    read: () => new Promise<boolean>((resolve, reject) => queries.push({ resolve, reject })),
    subscribe: (listener) => { change = listener; return () => { stopped++; }; },
    onResume: (listener) => { resume = listener; return () => { stopped++; }; }
  }, (value) => values.push(value));
  return { queries, values, change: (value: boolean) => change(value), resume: () => resume(), stop, stopped: () => stopped };
}
const settle = async () => { await Promise.resolve(); await Promise.resolve(); };

test("motion is reduced until the native query resolves, and read failure stays reduced", async () => {
  const a = fixture();
  assert.deepEqual(a.values, [true]);
  a.queries[0].resolve(false); await settle();
  assert.deepEqual(a.values, [true, false]);
  a.resume(); a.queries[1].reject(new Error("unavailable")); await settle();
  assert.equal(a.values.at(-1), true); a.stop();
});
test("a stale query cannot override a newer device accessibility event", async () => {
  const a = fixture();
  a.change(true); a.queries[0].resolve(false); await settle();
  assert.deepEqual(a.values, [true, true]); a.stop();
});
test("foreground recheck supersedes older queries and reconciles the latest preference", async () => {
  const a = fixture();
  a.resume(); a.queries[1].resolve(true); await settle();
  a.queries[0].resolve(false); await settle();
  assert.equal(a.values.at(-1), true);
  a.change(false); assert.equal(a.values.at(-1), false); a.stop();
});
test("unmount removes subscriptions and ignores pending results or queued events", async () => {
  const a = fixture(); a.stop();
  assert.equal(a.stopped(), 2);
  a.queries[0].resolve(false); a.change(false); a.resume(); await settle();
  assert.deepEqual(a.values, [true]); assert.equal(a.queries.length, 1);
});
