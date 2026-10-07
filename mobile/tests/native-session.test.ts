import assert from "node:assert/strict";
import test from "node:test";
import { apiResponseExamples } from "../../lib/platform/api-contract-examples.ts";
import { createNativeRequestAdapter, type NativeWireRequest, type NativeWireResponse } from "../src/platform/request-adapter.ts";
import { createCredentialVault, type TextStore } from "../src/session/credential-vault.ts";
import { createNativeClient } from "../src/session/native-client.ts";
import { createNativeSessionController, type SessionClock, type SessionSnapshot } from "../src/session/session-controller.ts";

const owner = apiResponseExamples.feed.viewerId;
const oldToken = "a".repeat(43), newToken = "b".repeat(43);
const input = { email: "fictional@example.invalid", password: "fictional password" };
const ticket = { isCurrent: () => true };
const origin = "https://fictional.example.invalid";
const scope = "staging|" + origin;
const body = (value: unknown, status = 200): NativeWireResponse => ({
  status, apiVersion: "1", body: JSON.stringify(value), contentType: "application/json", cacheControl: "private, no-store", retryAfter: null
});
const rejected = (code = "unauthenticated", status = 401) => body({ apiVersion: "1", error: { code, message: "A fictional failure.", retryAfterSeconds: null } }, status);
function deferred() {
  let resolve: () => void = () => {};
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}
class Store implements TextStore {
  value: string | null = null;
  failWrite = false;
  ignoreRemove = false;
  async read() { return this.value; }
  async write(value: string) { if (this.failWrite) throw Error(oldToken); this.value = value; }
  async remove() { if (!this.ignoreRemove) this.value = null; }
}
function fixture() {
  let nonce = 0, elapsed = 0;
  const timers = new Set<{ at: number; callback: () => void }>();
  const clock: SessionClock = {
    now: () => elapsed,
    schedule(callback, delayMs) { const timer = { at: elapsed + delayMs, callback }; timers.add(timer); return () => { timers.delete(timer); }; }
  };
  const marker = new Store(), secret = new Store();
  const ports = { marker, secret, randomId: () => `00000000-0000-4000-8000-${String(++nonce).padStart(12, "0")}` };
  const vault = createCredentialVault(scope, ports);
  const state = {
    requests: [] as NativeWireRequest[], snapshots: [] as SessionSnapshot[], issuedToken: newToken,
    onRequest: null as ((request: NativeWireRequest) => Promise<NativeWireResponse | void>) | null
  };
  const activity = () => ({ owner, legacy: false, deadline: "2026-10-07T12:01:00.000Z",
    absoluteExpiresAt: "2026-11-06T12:00:00.000Z", serverTime: "2026-10-07T12:00:00.000Z" });
  const controller = createNativeSessionController({ vault, clock,
    createClient: source => createNativeClient(createNativeRequestAdapter({ environment: "staging", origin }, source, async request => {
      state.requests.push(request);
      const handled = await state.onRequest?.(request);
      if (handled) return handled;
      const path = new URL(request.url).pathname;
      if (path.endsWith("/auth/password")) return body({ apiVersion: "1", viewerId: owner,
        data: { tokenType: "Bearer", token: state.issuedToken, session: apiResponseExamples.session.data, activity: activity() } });
      if (path.endsWith("/session")) return body(apiResponseExamples.session);
      if (path.endsWith("/session/activity")) return body({ apiVersion: "1", viewerId: owner, data: activity() });
      if (path.endsWith("/session/logout")) return body({ apiVersion: "1", viewerId: owner, data: { ownerId: owner, signedOut: true } });
      throw Error("Unexpected fixture route");
    }))
  });
  controller.subscribe(() => state.snapshots.push(controller.getSnapshot()));
  return { controller, state, vault, marker, secret, timers,
    freshVault: () => createCredentialVault(scope, ports),
    async seed() { await vault.replace(ticket, { ownerId: owner, token: oldToken }); },
    advance(ms: number, runTimers = true) {
      elapsed += ms;
      if (runTimers) for (const timer of [...timers]) if (timer.at <= elapsed) { timers.delete(timer); timer.callback(); }
    }
  };
}
const pathIs = (request: NativeWireRequest, suffix: string) => new URL(request.url).pathname.endsWith(suffix);

test("startup stays concealed and verifies stored credentials before publishing the account", async t => {
  const f = fixture(); t.after(() => f.controller.dispose()); await f.seed();
  const reached = deferred(), release = deferred();
  f.state.onRequest = async request => { if (pathIs(request, "/session/activity")) { reached.resolve(); await release.promise; } };
  assert.equal(f.controller.getSnapshot().account, null);
  const restoring = f.controller.setForeground(true); await reached.promise;
  assert.equal(f.controller.getSnapshot().phase, "verifying");
  assert.equal(f.controller.getSnapshot().account, null);
  release.resolve(); await restoring;
  assert.equal(f.controller.getSnapshot().account?.id, owner);
  assert.ok(f.state.requests.every(request => request.headers.Authorization === "Bearer " + oldToken));
  assert.ok(f.state.requests.every(request => request.method === "GET"));
  assert.equal(JSON.stringify(f.state.snapshots).includes(oldToken), false);
  assert.equal(JSON.stringify(f.state.snapshots).includes("installationId"), false);
});

test("password issuance is one command and account publication waits for verification and checked storage", async t => {
  const f = fixture(); t.after(() => f.controller.dispose()); await f.controller.setForeground(true);
  const reached = deferred(), release = deferred();
  const write = f.secret.write.bind(f.secret);
  f.secret.write = async value => { await write(value); reached.resolve(); await release.promise; };
  const signingIn = f.controller.signIn(input); await reached.promise;
  assert.equal(f.controller.getSnapshot().phase, "signing-in");
  assert.equal(f.controller.getSnapshot().account, null);
  assert.equal(f.state.requests.filter(request => pathIs(request, "/auth/password")).length, 1);
  assert.ok(f.state.requests.filter(request => !pathIs(request, "/auth/password")).every(request => request.headers.Authorization === "Bearer " + newToken));
  release.resolve(); await signingIn;
  assert.equal(f.controller.getSnapshot().phase, "ready");
  assert.equal((await f.freshVault().readCandidate(ticket)).status, "candidate");
  assert.equal(JSON.stringify(f.state.snapshots).includes(input.password), false);
  assert.equal(JSON.stringify(f.state.snapshots).includes(newToken), false);
});

test("backgrounding cancels a held restoration and a late successful reply cannot reveal it", async t => {
  const f = fixture(); t.after(() => f.controller.dispose()); await f.seed();
  const reached = deferred(), release = deferred();
  f.state.onRequest = async request => { if (pathIs(request, "/session")) { reached.resolve(); await release.promise; } };
  const restoring = f.controller.setForeground(true); await reached.promise;
  const prior = f.controller.getSnapshot().generation;
  const background = f.controller.setForeground(false);
  assert.equal(f.controller.getSnapshot().phase, "concealed");
  assert.equal(f.controller.getSnapshot().account, null);
  assert.ok(f.controller.getSnapshot().generation > prior);
  assert.equal(f.state.requests[0].signal.aborted, true);
  release.resolve(); await Promise.all([background, restoring]);
  assert.equal(f.controller.getSnapshot().account, null);
  f.state.onRequest = null;
  await f.controller.setForeground(true);
  assert.equal(f.controller.getSnapshot().phase, "ready");
  assert.equal(f.state.requests.filter(request => pathIs(request, "/session")).length, 2);
});

test("current session rejection clears saved credentials without guest fallback", async t => {
  const f = fixture(); t.after(() => f.controller.dispose()); await f.seed();
  f.state.onRequest = async () => rejected();
  await f.controller.setForeground(true);
  assert.equal(f.controller.getSnapshot().phase, "signed-out");
  assert.equal(f.controller.getSnapshot().problem, "sign-in-required");
  assert.equal(f.secret.value, null);
  assert.equal(f.state.requests.length, 1);
});

test("network uncertainty cannot establish an account or erase a candidate without confirmation", async t => {
  const f = fixture(); t.after(() => f.controller.dispose()); await f.seed();
  f.state.onRequest = async () => { throw Error(oldToken); };
  await f.controller.setForeground(true);
  assert.equal(f.controller.getSnapshot().phase, "unavailable");
  assert.equal(f.controller.getSnapshot().account, null);
  assert.ok(f.secret.value?.includes(oldToken));
  assert.equal(JSON.stringify(f.controller.getSnapshot()).includes(oldToken), false);
  f.state.onRequest = null; await f.controller.retryVerification();
  assert.equal(f.controller.getSnapshot().phase, "ready");
});

test("local sign-out is immediate and old remote completion cannot erase a newer same-account sign-in", async t => {
  const f = fixture(); t.after(() => f.controller.dispose()); await f.seed(); await f.controller.setForeground(true);
  const reached = deferred(), release = deferred();
  f.state.onRequest = async request => { if (pathIs(request, "/session/logout")) { reached.resolve(); await release.promise; } };
  const signingOut = f.controller.signOut();
  assert.equal(f.controller.getSnapshot().account, null);
  assert.equal(f.controller.getSnapshot().phase, "signed-out");
  await reached.promise;
  await f.controller.signIn(input);
  const current = f.controller.getSnapshot();
  assert.equal(current.phase, "ready"); assert.ok(f.secret.value?.includes(newToken));
  release.resolve();
  assert.deepEqual(await signingOut, { local: "cleared", remote: "confirmed" });
  assert.equal(f.controller.getSnapshot(), current);
  assert.ok(f.secret.value?.includes(newToken));
  const revocations = f.state.requests.filter(request => pathIs(request, "/session/logout"));
  assert.equal(revocations.length, 1); assert.equal(revocations[0].headers.Authorization, "Bearer " + oldToken);
});

test("unconfirmed local deletion and lost remote reply are reported separately", async t => {
  const f = fixture(); t.after(() => f.controller.dispose()); await f.seed(); await f.controller.setForeground(true);
  f.marker.failWrite = true; f.secret.ignoreRemove = true;
  f.state.onRequest = async request => { if (pathIs(request, "/session/logout")) throw Error(oldToken); };
  assert.deepEqual(await f.controller.signOut(), { local: "unconfirmed", remote: "unconfirmed" });
  const snapshot = f.controller.getSnapshot();
  assert.equal(snapshot.account, null); assert.equal(snapshot.cleanup, "unconfirmed"); assert.equal(snapshot.revocation, "unconfirmed");
  assert.deepEqual(await f.vault.readCandidate(ticket), { status: "locked" });
});

test("server-expired revocation is confirmed without repeating logout", async t => {
  const f = fixture(); t.after(() => f.controller.dispose()); await f.seed(); await f.controller.setForeground(true);
  f.state.onRequest = async request => pathIs(request, "/session/logout") ? rejected() : undefined;
  assert.deepEqual(await f.controller.signOut(), { local: "cleared", remote: "confirmed" });
  assert.equal(f.state.requests.filter(request => pathIs(request, "/session/logout")).length, 1);
});

test("deadline checks conceal even when an expiry timer has not run", async t => {
  for (const runTimers of [false, true]) {
    const f = fixture(); t.after(() => f.controller.dispose()); await f.seed(); await f.controller.setForeground(true);
    f.advance(60001, runTimers);
    assert.equal(f.controller.getSnapshot().phase, "unavailable");
    assert.equal(f.controller.getSnapshot().problem, "session-expired");
    assert.equal(f.controller.getSnapshot().account, null);
    assert.equal(f.timers.size, 0);
    assert.equal(f.state.requests.length, 2, "No automatic background renewal");
  }
});

test("only explicit foreground activity renews, with one concurrent activity request", async t => {
  const f = fixture(); t.after(() => f.controller.dispose()); await f.seed(); await f.controller.setForeground(true);
  const reached = deferred(), release = deferred();
  f.state.onRequest = async request => { if (request.method === "POST") { reached.resolve(); await release.promise; } };
  const renewing = f.controller.recordForegroundActivity(); await reached.promise;
  await f.controller.recordForegroundActivity();
  assert.equal(f.state.requests.filter(request => request.method === "POST").length, 1);
  await f.controller.setForeground(false); release.resolve(); await renewing;
  await f.controller.recordForegroundActivity();
  assert.equal(f.state.requests.filter(request => request.method === "POST").length, 1);
  assert.equal(f.controller.getSnapshot().account, null);
});

test("failed persistence never exposes an issued account and attempts only its own revocation", async t => {
  const f = fixture(); t.after(() => f.controller.dispose()); await f.controller.setForeground(true);
  f.secret.failWrite = true;
  await f.controller.signIn(input);
  assert.equal(f.controller.getSnapshot().phase, "signed-out");
  assert.equal(f.controller.getSnapshot().problem, "storage-unavailable");
  assert.equal(f.controller.getSnapshot().revocation, "confirmed");
  assert.ok(f.state.snapshots.every(snapshot => snapshot.account === null));
  assert.equal(f.state.requests.filter(request => pathIs(request, "/session/logout"))[0].headers.Authorization, "Bearer " + newToken);
});

test("lost password response stays unconfirmed and is never automatically retried", async t => {
  const f = fixture(); t.after(() => f.controller.dispose()); await f.controller.setForeground(true);
  f.state.onRequest = async () => { throw Error(input.password); };
  await f.controller.signIn(input);
  assert.equal(f.controller.getSnapshot().problem, "sign-in-unconfirmed");
  assert.equal(f.controller.getSnapshot().account, null);
  assert.equal(f.state.requests.length, 1); assert.equal(f.secret.value, null);
});

test("sign-out during unknown restoration reports remote uncertainty instead of unnecessary revocation", async t => {
  const f = fixture(); t.after(() => f.controller.dispose()); await f.seed();
  const reached = deferred(), release = deferred();
  const read = f.secret.read.bind(f.secret);
  f.secret.read = async () => { reached.resolve(); await release.promise; return read(); };
  const restoring = f.controller.setForeground(true); await reached.promise;
  const signingOut = f.controller.signOut(); release.resolve(); await restoring;
  assert.deepEqual(await signingOut, { local: "cleared", remote: "unconfirmed" });
  assert.equal(f.controller.getSnapshot().account, null);
});

test("stale final activation carries unconfirmed cleanup through the concealed state", async t => {
  const f = fixture(); t.after(() => f.controller.dispose()); await f.controller.setForeground(true);
  const write = f.marker.write.bind(f.marker);
  f.marker.write = async value => {
    await write(value);
    if (value.includes('"active"')) { await f.controller.setForeground(false); f.marker.failWrite = true; f.secret.ignoreRemove = true; }
  };
  await f.controller.signIn(input);
  assert.equal(f.controller.getSnapshot().phase, "concealed");
  assert.equal(f.controller.getSnapshot().cleanup, "unconfirmed");
  await f.controller.setForeground(true);
  assert.equal(f.controller.getSnapshot().account, null);
  assert.equal(f.controller.getSnapshot().cleanup, "unconfirmed");
});

test("disposed controller cannot restore, dispatch or retain visible account state", async () => {
  const f = fixture(); await f.seed(); await f.controller.setForeground(true); f.controller.dispose();
  await f.controller.setForeground(true); await f.controller.signIn(input); await f.controller.recordForegroundActivity();
  assert.equal(f.controller.getSnapshot().account, null);
  assert.equal(f.controller.getSnapshot().foreground, false);
  assert.equal(f.state.requests.length, 2); assert.equal(f.timers.size, 0);
});

test("background cancellation settles pending revocation conservatively across foreground return", async t => {
  const f = fixture(); t.after(() => f.controller.dispose()); await f.seed(); await f.controller.setForeground(true);
  const reached = deferred(), release = deferred();
  f.state.onRequest = async request => { if (pathIs(request, "/session/logout")) { reached.resolve(); await release.promise; } };
  const signingOut = f.controller.signOut(); await reached.promise;
  await f.controller.setForeground(false); await f.controller.setForeground(true);
  release.resolve(); await signingOut;
  assert.equal(f.controller.getSnapshot().phase, "signed-out");
  assert.equal(f.controller.getSnapshot().revocation, "unconfirmed");
});

test("failed logout cleanup is not lost when the foreground epoch changes", async t => {
  const f = fixture(); t.after(() => f.controller.dispose()); await f.seed(); await f.controller.setForeground(true);
  const reached = deferred(), release = deferred();
  f.marker.write = async () => { reached.resolve(); await release.promise; throw Error("Marker write failed"); };
  f.secret.ignoreRemove = true;
  const signingOut = f.controller.signOut(); await reached.promise;
  await f.controller.setForeground(false);
  const returning = f.controller.setForeground(true);
  release.resolve(); await Promise.all([signingOut, returning]);
  assert.equal(f.controller.getSnapshot().account, null);
  assert.equal(f.controller.getSnapshot().cleanup, "unconfirmed");
});

test("confirmed revocation during foreground activity removes the local candidate", async t => {
  const f = fixture(); t.after(() => f.controller.dispose()); await f.seed(); await f.controller.setForeground(true);
  f.state.onRequest = async request => request.method === "POST" ? rejected() : undefined;
  await f.controller.recordForegroundActivity();
  assert.equal(f.controller.getSnapshot().phase, "signed-out");
  assert.equal(f.controller.getSnapshot().problem, "sign-in-required");
  assert.equal(f.secret.value, null);
});

test("subscriber-triggered sign-out invalidates the original sign-in before any issuance", async t => {
  const f = fixture(); t.after(() => f.controller.dispose()); await f.controller.setForeground(true);
  let signingOut: Promise<unknown> | null = null;
  const unsubscribe = f.controller.subscribe(() => {
    if (f.controller.getSnapshot().phase === "signing-in") signingOut = f.controller.signOut();
  });
  await f.controller.signIn(input); await signingOut; unsubscribe();
  assert.equal(f.controller.getSnapshot().phase, "signed-out");
  assert.equal(f.controller.getSnapshot().account, null);
  assert.equal(f.state.requests.length, 0);
  assert.equal(f.secret.value, null);
});

test("subscriber-triggered sign-out during restore cannot let the outer restore adopt its epoch", async t => {
  const f = fixture(); t.after(() => f.controller.dispose()); await f.seed();
  let signingOut: Promise<unknown> | null = null;
  const unsubscribe = f.controller.subscribe(() => {
    if (f.controller.getSnapshot().phase === "verifying") signingOut = f.controller.signOut();
  });
  await f.controller.setForeground(true); await signingOut; unsubscribe();
  assert.equal(f.controller.getSnapshot().phase, "signed-out");
  assert.equal(f.controller.getSnapshot().account, null);
  assert.equal(f.state.requests.length, 0);
});
