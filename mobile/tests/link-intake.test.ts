import assert from "node:assert/strict";
import test from "node:test";
import { observeNativeLinks, type LinkNotice, type NativeLinkSource } from "../src/navigation/link-intake.ts";
import { createNativeFixture } from "../src/spike/native-fixture.ts";
import { fixturePostFromLink } from "../src/spike/links.ts";
import type { SessionSnapshot } from "../src/session/session-controller.ts";

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

test("Android delivers a warm intent while paused before foreground verification", async t => {
  const f = fixture(t); await f.runtime.setForeground(true); await f.signIn(); f.start();
  await f.runtime.setForeground(false); f.send(prayer); await flush();
  assert.equal(f.runtime.navigation.getSnapshot().destination, null);
  assert.equal(f.runtime.reading.getSnapshot().kind, "concealed");
  assert.equal(f.values.filter(value => value !== null).length, 0);
  await f.runtime.setForeground(true); await flush();
  assert.deepEqual(f.runtime.navigation.getSnapshot().destination, { kind: "post", postId: "fixture-prayer" });
  assert.equal(f.runtime.reading.getSnapshot().kind, "post");
  assert.equal(f.values.at(-1), "opened");
});

test("iPhone first Open confirmation delivers a guest link during concealment", async t => {
  const f = fixture(t); await f.runtime.setForeground(true); f.start();
  // Observed native order: a previously active guest conceals for the OS
  // confirmation, receives its URL, then resumes through verification.
  await f.runtime.setForeground(false); f.send(prayer); await flush();
  assert.equal(f.runtime.navigation.getSnapshot().hasPendingReturn, false);
  assert.equal(f.runtime.navigation.getSnapshot().destination, null);
  assert.equal(f.runtime.reading.getSnapshot().kind, "concealed");
  assert.equal(f.values.filter(value => value !== null).length, 0);
  await f.runtime.setForeground(true); await flush();
  assert.equal(f.runtime.navigation.getSnapshot().hasPendingReturn, true);
  assert.equal(f.values.at(-1), "sign-in-required");
  await f.signIn();
  const reading = f.runtime.reading.getSnapshot();
  assert.equal(reading.kind, "post");
  if (reading.kind === "post") {
    assert.equal(reading.post.id, "fixture-prayer");
    assert.equal(reading.revealed, false);
  }
});

for (const delivery of ["before", "during", "after"] as const) {
  test(`cold launch URL resolving ${delivery} the first verification reaches contextual sign-in`, async t => {
    const f = fixture(t); f.start();
    if (delivery === "before") { f.resolve(prayer); await flush(); }
    const restoring = f.runtime.setForeground(true);
    if (delivery === "during") f.resolve(prayer);
    await restoring;
    if (delivery === "after") f.resolve(prayer);
    await flush();
    assert.equal(f.values.at(-1), "sign-in-required");
    await f.signIn();
    assert.deepEqual(f.runtime.navigation.getSnapshot().destination, { kind: "post", postId: "fixture-prayer" });
    assert.equal(f.runtime.reading.getSnapshot().kind, "post");
  });
}

test("only the newest paused delivery survives resume and its fresh read", async t => {
  const f = fixture(t); await f.runtime.setForeground(true); await f.signIn(); f.start();
  await f.runtime.setForeground(false); f.send(welcome); f.send(prayer); f.resolve(welcome);
  await f.runtime.setForeground(true); await flush();
  assert.deepEqual(f.runtime.navigation.getSnapshot().destination, { kind: "post", postId: "fixture-prayer" });
  const reading = f.runtime.reading.getSnapshot();
  assert.equal(reading.kind, "post");
  if (reading.kind === "post") assert.equal(reading.post.id, "fixture-prayer");
  assert.equal(f.values.filter(value => value === "opened").length, 1);
});

for (const invalidate of ["logout", "cancel", "second concealment", "dispose"] as const) {
  test(`${invalidate} discards an address delivered while paused`, async t => {
    const f = fixture(t); await f.runtime.setForeground(true); await f.signIn(); const stop = f.start();
    await f.runtime.setForeground(false); f.send(prayer);
    if (invalidate === "logout") await f.runtime.signOut();
    else if (invalidate === "cancel") await f.runtime.cancelSignIn();
    else if (invalidate === "dispose") stop();
    else {
      const restoring = f.runtime.setForeground(true);
      await f.runtime.setForeground(false); await restoring;
    }
    await f.runtime.setForeground(true); await flush();
    if (f.runtime.session.getSnapshot().phase === "signed-out") await f.signIn();
    assert.deepEqual(f.runtime.navigation.getSnapshot().destination, { kind: "screen", screen: "home" });
    assert.equal(f.values.filter(value => value === "opened" || value === "sign-in-required").length, 0);
  });
}

test("an already delivered foreground address cannot return after concealment", async t => {
  const f = fixture(t); await f.runtime.setForeground(true); f.start(); f.send(prayer); await flush();
  assert.equal(f.runtime.navigation.getSnapshot().hasPendingReturn, true);
  await f.runtime.setForeground(false); await f.runtime.setForeground(true); await f.signIn();
  assert.deepEqual(f.runtime.navigation.getSnapshot().destination, { kind: "screen", screen: "home" });
});

for (const outcome of ["another owner", "guest", "verification failure", "generation replacement"] as const) {
  test(`paused account-bound address is discarded on ${outcome}`, async t => {
    const account = (id: string) => ({ id, name: "Fictional member", username: id });
    let state: SessionSnapshot = { generation: 2, foreground: true, phase: "ready", account: account("first"),
      problem: null, cleanup: null, revocation: "none" };
    const listeners = new Set<() => void>(), calls: unknown[] = [], notices: LinkNotice[] = [];
    let incoming = (_url: string) => {};
    const runtime = { session: { getSnapshot: () => state, subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; } },
      async open(destination: unknown) { calls.push(destination); return "opened" as const; } };
    const stop = observeNativeLinks(runtime, { initial: async () => null, subscribe(fn) { incoming = fn; return () => {}; } }, parse, value => notices.push(value));
    t.after(stop);
    const publish = (next: SessionSnapshot) => { state = next; for (const fn of listeners) fn(); };
    publish({ ...state, generation: 3, foreground: false, phase: "concealed", account: null });
    incoming(prayer); await flush();
    assert.deepEqual(calls, []); assert.equal(notices.filter(value => value !== null).length, 0);
    publish({ ...state, generation: 4, foreground: true, phase: "verifying" });
    if (outcome === "another owner") publish({ ...state, phase: "ready", account: account("second") });
    else if (outcome === "guest") publish({ ...state, phase: "signed-out" });
    else {
      publish({ ...state, generation: 5, phase: outcome === "verification failure" ? "unavailable" : "signing-in" });
      publish({ ...state, phase: "ready", account: account("first") });
    }
    await flush(); assert.deepEqual(calls, []);
  });
}

test("a delayed initial URL cannot cross logout even during the first verification", async t => {
  const f = fixture(t); f.start(); const restoring = f.runtime.setForeground(true);
  await f.runtime.cancelSignIn(); await restoring; f.resolve(prayer); await flush(); await f.signIn();
  assert.deepEqual(f.runtime.navigation.getSnapshot().destination, { kind: "screen", screen: "home" });
  assert.equal(f.values.filter(value => value === "sign-in-required").length, 0);
});

for (const newerLink of [false, true]) {
  test(`snapshot invalidation fences the outer receive${newerLink ? " and preserves a newer link" : " after logout"}`, async t => {
    const f = fixture(t); await f.runtime.setForeground(true); await f.signIn();
    let invalidateOnRead = false, reenter = false;
    let logout = Promise.resolve();
    const runtime = { ...f.runtime, session: { ...f.runtime.session, getSnapshot() {
      // Snapshot reads may synchronously enforce expiry and call subscribers.
      if (invalidateOnRead) { invalidateOnRead = false; logout = f.runtime.signOut().then(() => {}); }
      return f.runtime.session.getSnapshot();
    } } };
    const stop = observeNativeLinks(runtime, f.source, parse, value => {
      if (value === null && reenter) { reenter = false; if (newerLink) f.send(prayer); }
    });
    t.after(stop); invalidateOnRead = true; reenter = true;
    f.send(welcome); await logout; await flush(); await f.signIn();
    assert.deepEqual(f.runtime.navigation.getSnapshot().destination, newerLink ?
      { kind: "post", postId: "fixture-prayer" } : { kind: "screen", screen: "home" });
  });
}

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
