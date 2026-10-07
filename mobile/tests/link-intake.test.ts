import assert from "node:assert/strict";
import test from "node:test";
import { observeNativeLinks, type LinkNotice, type NativeLinkSource } from "../src/navigation/link-intake.ts";
import { createNativeFixture } from "../src/spike/native-fixture.ts";
import { fixturePostFromLink } from "../src/spike/links.ts";

const welcome = "godschurches-dev://spike/post/fixture-welcome";
const prayer = "godschurches-dev://spike/post/fixture-prayer";
const parse = (url: string) => { const id = fixturePostFromLink(url); return id ? { kind: "post" as const, postId: id } : null; };
const flush = () => new Promise<void>(resolve => setImmediate(resolve));
function fixture(t: { after: (fn: () => void) => void }, latencyMs = 0) {
  const f = createNativeFixture({ latencyMs }); t.after(f.runtime.dispose);
  let resolve: (url: string | null) => void = () => {}, listener: (url: string) => void = () => {}, removed = 0;
  const initial = new Promise<string | null>(done => { resolve = done; });
  const values: LinkNotice[] = [];
  const source: NativeLinkSource = { initial: () => initial, subscribe(next) { listener = next; return () => { removed++; }; } };
  return { ...f, source, values, resolve: (url: string | null) => resolve(url), send: (url: string) => listener(url), removed: () => removed,
    start() { const stop = observeNativeLinks(f.runtime, source, parse, value => values.push(value)); t.after(stop); return stop; } };
}

test("a current guest link becomes the sole contextual sign-in destination", async t => {
  const f = fixture(t); await f.runtime.setForeground(true); f.start(); f.send(prayer); await flush();
  assert.equal(f.values.at(-1), "sign-in-required"); await f.signIn();
  assert.deepEqual(f.runtime.navigation.getSnapshot().destination, { kind: "post", postId: "fixture-prayer" });
  assert.equal(f.runtime.reading.getSnapshot().kind, "post");
});

test("a newer incoming link supersedes a delayed launch link", async t => {
  const f = fixture(t); await f.runtime.setForeground(true); f.start();
  f.send(prayer); f.resolve(welcome); await flush(); await f.signIn();
  assert.deepEqual(f.runtime.navigation.getSnapshot().destination, { kind: "post", postId: "fixture-prayer" });
});

test("a link emitted while subscribing also supersedes the old launch link", async t => {
  const f = fixture(t); await f.runtime.setForeground(true);
  f.source.subscribe = listener => { listener(prayer); return () => {}; };
  f.start(); f.resolve(welcome); await flush(); await f.signIn();
  assert.deepEqual(f.runtime.navigation.getSnapshot().destination, { kind: "post", postId: "fixture-prayer" });
});

test("one address can wait for the current verification to establish guest state", async t => {
  const f = fixture(t); f.start(); const verifying = f.runtime.setForeground(true);
  assert.equal(f.runtime.session.getSnapshot().phase, "verifying"); f.send(prayer);
  await verifying; await flush(); assert.equal(f.values.at(-1), "sign-in-required");
  await f.signIn(); assert.equal(f.runtime.reading.getSnapshot().kind, "post");
});

test("concealment drops deferred links and invalidates a late launch result", async t => {
  const f = fixture(t); f.start(); const verifying = f.runtime.setForeground(true); f.send(prayer);
  await f.runtime.setForeground(false); await verifying; f.resolve(welcome); await flush();
  await f.runtime.setForeground(true); await f.signIn();
  assert.deepEqual(f.runtime.navigation.getSnapshot().destination, { kind: "screen", screen: "home" });
  assert.equal(f.runtime.reading.getSnapshot().kind, "feed");
});

test("late opened status cannot return after sign-out changes the session generation", async t => {
  const f = fixture(t, 5); await f.runtime.setForeground(true); await f.signIn(); f.start();
  f.send(prayer); await f.runtime.signOut(); await flush();
  assert.equal(f.values.at(-1), null); assert.equal(f.runtime.navigation.getSnapshot().destination, null);
});

test("unmount fences pending launch results and callbacks already queued by the emitter", async t => {
  const f = fixture(t); await f.runtime.setForeground(true); const stop = f.start(); stop();
  f.send(prayer); f.resolve(welcome); await flush();
  assert.deepEqual(f.values, []); assert.equal(f.removed(), 1); assert.equal(f.runtime.navigation.getSnapshot().hasPendingReturn, false);
});

test("unrecognized links are ignored and source failure detaches session observation", async t => {
  const f = fixture(t); await f.runtime.setForeground(true); f.start(); f.send("https://untrusted.example.invalid/");
  await flush(); assert.deepEqual(f.values, []);
  const g = fixture(t); g.source.initial = () => { throw Error("Unavailable"); };
  g.start(); assert.equal(g.removed(), 1); await g.runtime.setForeground(true); assert.deepEqual(g.values, []);
});
