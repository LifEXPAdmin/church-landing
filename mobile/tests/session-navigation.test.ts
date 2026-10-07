import assert from "node:assert/strict";
import test from "node:test";
import { apiResponseExamples } from "../../lib/platform/api-contract-examples.ts";
import { createNativeRequestAdapter, type NativeWireRequest, type NativeWireResponse } from "../src/platform/request-adapter.ts";
import { createCredentialVault, type TextStore } from "../src/session/credential-vault.ts";
import { createNativeClient } from "../src/session/native-client.ts";
import { createNativeSessionController } from "../src/session/session-controller.ts";
import { createSessionNavigation } from "../src/navigation/session-navigation.ts";

const origin = "https://fictional.example.invalid", owner = apiResponseExamples.feed.viewerId;
const input = { email: "fictional@example.invalid", password: "fictional password" };
const home = { kind: "screen", screen: "home" } as const;
const post = { kind: "post", postId: "fictional-post" } as const;
function deferred() {
  let resolve: () => void = () => {};
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}
function store(): TextStore {
  let value: string | null = null;
  return { async read() { return value; }, async write(next) { value = next; }, async remove() { value = null; } };
}
const response = (value: unknown): NativeWireResponse => ({ status: 200, apiVersion: "1", contentType: "application/json",
  cacheControl: "no-store", retryAfter: null, body: JSON.stringify(value) });
function fixture() {
  let nonce = 0, elapsed = 0;
  const vault = createCredentialVault("staging|" + origin, { secret: store(), marker: store(),
    randomId: () => `00000000-0000-4000-8000-${String(++nonce).padStart(12, "0")}` });
  const observed = { requests: [] as NativeWireRequest[], signingOwner: owner,
    intercept: null as ((request: NativeWireRequest) => Promise<void>) | null };
  const activity = (id: string) => ({ owner: id, legacy: false, deadline: "2026-10-07T12:01:00.000Z",
    absoluteExpiresAt: "2026-11-06T12:00:00.000Z", serverTime: "2026-10-07T12:00:00.000Z" });
  function sessionData(id: string) {
    const value = structuredClone(apiResponseExamples.session.data);
    if (value.state === "authenticated") value.account.id = id;
    return value;
  }
  const session = createNativeSessionController({ vault, clock: { now: () => elapsed, schedule: () => () => {} },
    createClient: source => createNativeClient(createNativeRequestAdapter({ environment: "staging", origin }, source, async request => {
      observed.requests.push(request); await observed.intercept?.(request);
      const path = new URL(request.url).pathname;
      const id = request.headers["X-Expected-Account"] ?? observed.signingOwner;
      if (path.endsWith("/auth/password")) return response({ apiVersion: "1", viewerId: id,
        data: { tokenType: "Bearer", token: "b".repeat(43), session: sessionData(id), activity: activity(id) } });
      if (path.endsWith("/session")) return response({ apiVersion: "1", viewerId: id, data: sessionData(id) });
      if (path.endsWith("/session/activity")) return response({ apiVersion: "1", viewerId: id, data: activity(id) });
      if (path.endsWith("/session/logout")) return response({ apiVersion: "1", viewerId: id, data: { ownerId: id, signedOut: true } });
      throw Error("Unexpected navigation fixture read");
    })) });
  const navigation = createSessionNavigation(session, { screens: ["home"], resources: ["post"] });
  return { session, navigation, observed,
    advance(ms: number) { elapsed += ms; },
    dispose() { navigation.dispose(); session.dispose(); },
    async seed() { await vault.replace({ isCurrent: () => true }, { ownerId: owner, token: "a".repeat(43) }); }
  };
}

test("restoration conceals navigation until the sole session authority verifies the account", async t => {
  const f = fixture(); t.after(f.dispose); await f.seed();
  const reached = deferred(), release = deferred();
  f.observed.intercept = async () => { reached.resolve(); await release.promise; };
  const restoring = f.session.setForeground(true); await reached.promise;
  assert.equal(f.navigation.getSnapshot().destination, null);
  assert.equal(f.navigation.open(post), "concealed");
  release.resolve(); await restoring;
  assert.deepEqual(f.navigation.getSnapshot().destination, home);
  assert.equal(f.navigation.getSnapshot().owner, owner);
  assert.equal(f.observed.requests.length, 2, "Address publication does not dispatch a resource read");
});

test("one canonical address survives only its explicit contextual sign-in", async t => {
  const f = fixture(); t.after(f.dispose); await f.session.setForeground(true);
  assert.equal(f.navigation.open({ ...post, token: "never retain", body: "private" } as typeof post), "sign-in-required");
  assert.equal(f.navigation.open({ ...post, postId: "latest" }), "sign-in-required");
  assert.deepEqual(f.navigation.getSnapshot(), { generation: f.session.getSnapshot().generation, owner: null, destination: null, hasPendingReturn: true });
  await f.navigation.signIn(input);
  const state = f.navigation.getSnapshot();
  assert.deepEqual(state.destination, { kind: "post", postId: "latest" });
  assert.equal(state.hasPendingReturn, false);
  assert.equal(JSON.stringify(state).includes(input.password), false);
  assert.equal(f.observed.requests.length, 3);
  assert.throws(() => Object.assign(state.destination!, { postId: "changed" }));
});

test("sign-in initiated elsewhere cannot adopt a previously pending address", async t => {
  const f = fixture(); t.after(f.dispose); await f.session.setForeground(true);
  f.navigation.open(post); await f.session.signIn(input);
  assert.deepEqual(f.navigation.getSnapshot().destination, home);
});

test("cancel return during a held sign-in removes the address without inventing a second auth flow", async t => {
  const f = fixture(); t.after(f.dispose); await f.session.setForeground(true); f.navigation.open(post);
  const reached = deferred(), release = deferred();
  f.observed.intercept = async request => { if (request.url.endsWith("/auth/password")) { reached.resolve(); await release.promise; } };
  const signingIn = f.navigation.signIn(input); await reached.promise;
  f.navigation.cancelReturn();
  assert.equal(f.navigation.getSnapshot().hasPendingReturn, false);
  release.resolve(); await signingIn;
  assert.deepEqual(f.navigation.getSnapshot().destination, home);
});

test("backgrounding drops pending return and a late sign-in cannot restore it", async t => {
  const f = fixture(); t.after(f.dispose); await f.session.setForeground(true); f.navigation.open(post);
  const reached = deferred(), release = deferred();
  f.observed.intercept = async request => { if (request.url.endsWith("/auth/password")) { reached.resolve(); await release.promise; } };
  const signingIn = f.navigation.signIn(input); await reached.promise;
  await f.session.setForeground(false);
  assert.equal(f.navigation.getSnapshot().hasPendingReturn, false);
  assert.equal(f.navigation.getSnapshot().destination, null);
  release.resolve(); await signingIn;
  f.observed.intercept = null; await f.session.setForeground(true); await f.navigation.signIn(input);
  assert.deepEqual(f.navigation.getSnapshot().destination, home);
});

test("logout conceals synchronously and old remote completion cannot restore same-account navigation", async t => {
  const f = fixture(); t.after(f.dispose); await f.session.setForeground(true); await f.navigation.signIn(input); f.navigation.open(post);
  const reached = deferred(), release = deferred();
  f.observed.intercept = async request => { if (request.url.endsWith("/session/logout")) { reached.resolve(); await release.promise; } };
  const signingOut = f.session.signOut();
  assert.equal(f.navigation.getSnapshot().destination, null);
  await reached.promise; await f.navigation.signIn(input);
  const current = f.navigation.getSnapshot();
  assert.deepEqual(current.destination, home);
  release.resolve(); await signingOut;
  assert.equal(f.navigation.getSnapshot(), current);
});

test("account replacement and foreground re-verification start without the prior private address", async t => {
  const f = fixture(); t.after(f.dispose); await f.session.setForeground(true); await f.navigation.signIn(input); f.navigation.open(post);
  await f.session.signOut(); f.observed.signingOwner = "second-account"; await f.navigation.signIn(input);
  assert.equal(f.navigation.getSnapshot().owner, "second-account");
  assert.deepEqual(f.navigation.getSnapshot().destination, home);
  f.navigation.open(post); await f.session.setForeground(false); await f.session.setForeground(true);
  assert.deepEqual(f.navigation.getSnapshot().destination, home);
});

test("snapshot reads enforce an expired session even before its timer fires", async t => {
  const f = fixture(); t.after(f.dispose); await f.session.setForeground(true); await f.navigation.signIn(input); f.navigation.open(post);
  f.advance(60001);
  assert.equal(f.navigation.getSnapshot().destination, null);
  assert.equal(f.navigation.getSnapshot().owner, null);
  assert.equal(f.navigation.open(post), "concealed");
});

test("failed sign-in and signed-out generation replacement discard contextual return", async t => {
  const f = fixture(); t.after(f.dispose); await f.session.setForeground(true); f.navigation.open(post);
  f.observed.intercept = async () => { throw Error("Unconfirmed fictional request"); };
  await f.navigation.signIn(input);
  assert.equal(f.navigation.getSnapshot().hasPendingReturn, false);
  f.navigation.open(post); await f.session.signOut();
  assert.equal(f.navigation.getSnapshot().hasPendingReturn, false);
});

test("invalid and unavailable targets neither replace navigation nor issue a request", async t => {
  const f = fixture(); t.after(f.dispose); await f.session.setForeground(true); await f.navigation.signIn(input);
  const current = f.navigation.getSnapshot(), count = f.observed.requests.length;
  assert.equal(f.navigation.open({ kind: "post", postId: "../secret" }), "invalid");
  assert.equal(f.navigation.open({ kind: "screen", screen: "messages" }), "unavailable");
  assert.equal(f.navigation.getSnapshot(), current);
  assert.equal(f.observed.requests.length, count);
});

test("reentrant sign-out during account publication cannot leave a private address", async t => {
  const f = fixture(); t.after(f.dispose); await f.session.setForeground(true); f.navigation.open(post);
  let signingOut: Promise<unknown> | undefined;
  const unsubscribe = f.navigation.subscribe(() => {
    if (f.navigation.getSnapshot().owner) signingOut = f.session.signOut();
  });
  await f.navigation.signIn(input); await signingOut; unsubscribe();
  assert.equal(f.navigation.getSnapshot().owner, null);
  assert.equal(f.navigation.getSnapshot().destination, null);
});

test("disposal erases pending and active state, unsubscribes and prevents future dispatch", async t => {
  const f = fixture(); t.after(f.dispose); await f.session.setForeground(true); f.navigation.open(post);
  f.navigation.dispose(); await f.navigation.signIn(input); await f.session.signIn(input);
  assert.equal(f.navigation.getSnapshot().owner, null);
  assert.equal(f.navigation.getSnapshot().destination, null);
  assert.equal(f.navigation.getSnapshot().hasPendingReturn, false);
  assert.equal(f.navigation.open(post), "concealed");
  assert.equal(f.observed.requests.length, 3);
});

test("reentrant disposal during deadline synchronization prevents a new sign-in dispatch", async t => {
  const f = fixture(); t.after(f.dispose); await f.session.setForeground(true); await f.navigation.signIn(input);
  let signingOut: Promise<unknown> | undefined;
  f.navigation.subscribe(() => {
    if (!f.navigation.getSnapshot().owner) { f.navigation.dispose(); signingOut = f.session.signOut(); }
  });
  f.advance(60001);
  await f.navigation.signIn(input); await signingOut;
  assert.equal(f.observed.requests.filter(request => request.url.endsWith("/auth/password")).length, 1);
  assert.equal(f.navigation.getSnapshot().destination, null);
});

test("reentrant disposal during open cannot retain another pending return", async t => {
  const f = fixture(); t.after(f.dispose); await f.session.setForeground(true); await f.navigation.signIn(input);
  let signingOut: Promise<unknown> | undefined;
  f.navigation.subscribe(() => {
    if (!f.navigation.getSnapshot().owner) { f.navigation.dispose(); signingOut = f.session.signOut(); }
  });
  f.advance(60001);
  assert.equal(f.navigation.open(post), "concealed");
  await signingOut;
  assert.equal(f.navigation.getSnapshot().hasPendingReturn, false);
});
