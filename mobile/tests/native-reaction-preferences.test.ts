import assert from "node:assert/strict";
import test from "node:test";
import { apiContracts } from "@godschurches/shared-core";
import { examplePost } from "../../lib/platform/api-contract-examples.ts";
import { createCredentialVault, type TextStore } from "../src/session/credential-vault.ts";
import { createNativeRuntime } from "../src/session/runtime.ts";
import type { NativeWireRequest, NativeWireResponse } from "../src/platform/request-adapter.ts";

const origin = "https://fictional.example.invalid";
const credentials = { email: "fictional@example.invalid", password: "fictional password" };
const preferencePath = "/api/platform/v1/reaction-preferences";
const path = (request: NativeWireRequest) => new URL(request.url).pathname;
function deferred() {
  let resolve: () => void = () => {};
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}
function store(): TextStore {
  let value: string | null = null;
  return { async read() { return value; }, async write(next) { value = next; }, async remove() { value = null; } };
}
function response(value: unknown, status = 200, retryAfter: string | null = null): NativeWireResponse {
  return { status, retryAfter, apiVersion: "1", contentType: "application/json", cacheControl: "private, no-store", body: JSON.stringify(value) };
}
function failure(code: string, status: number, retryAfter: string | null = null) {
  return response({ apiVersion: "1", error: { code, message: "Fictional rejection", retryAfterSeconds: null } }, status, retryAfter);
}
let operation = 0;

/** Real session, request decoder and runtime; only the credential stores, clock
 * and wire are fictional. This is not native transport or server acceptance. */
function fixture(idSource: (() => string) | null = () => "preference-" + String(++operation)) {
  let nonce = 0, elapsed = 0, expireOnClockRead: number | null = null;
  const timers = new Set<{ at: number; callback: () => void }>();
  const state = {
    requests: [] as NativeWireRequest[], owner: "fictional-member", token: "a".repeat(43),
    hideCounts: false, recoveryRequired: false, version: 0, commits: 0,
    features: [{ name: "feed.read", available: true }, { name: "post.read", available: true },
      { name: "reactionPreferences.read", available: true }, { name: "reactionPreferences.write", available: true }],
    intercept: null as ((request: NativeWireRequest) => Promise<NativeWireResponse | void>) | null,
    afterWrite: null as ((request: NativeWireRequest, result: NativeWireResponse) => Promise<NativeWireResponse>) | null
  };
  const receipts = new Map<string, { owner: string; body: string; result: NativeWireResponse }>();
  const vault = createCredentialVault("staging|" + origin, { secret: store(), marker: store(),
    randomId: () => `00000000-0000-4000-8000-${String(++nonce).padStart(12, "0")}` });
  const runtime = createNativeRuntime({ configuration: { environment: "staging", origin }, vault,
    availability: { screens: ["home"], resources: ["post"] },
    ...(idSource ? { mutationId: idSource } : {}),
    clock: { now() {
      if (expireOnClockRead !== null && --expireOnClockRead === 0) { expireOnClockRead = null; elapsed += 1800001; }
      return elapsed;
    }, schedule(callback, delay) {
      const timer = { at: elapsed + delay, callback }; timers.add(timer); return () => { timers.delete(timer); };
    } },
    wire: async request => {
      state.requests.push(request);
      const intercepted = await state.intercept?.(request); if (intercepted) return intercepted;
      const owner = request.headers["X-Expected-Account"] ?? state.owner;
      const envelope = (data: unknown) => response({ apiVersion: "1", viewerId: owner, data });
      const account = { state: "authenticated", account: { id: owner, name: "Fictional Member", username: "fictional_member" } };
      const activity = { owner, legacy: false, deadline: "2026-10-07T12:30:00.000Z",
        absoluteExpiresAt: "2026-11-06T12:00:00.000Z", serverTime: "2026-10-07T12:00:00.000Z" };
      if (path(request).endsWith("/auth/password")) return envelope({ tokenType: "Bearer", token: state.token, session: account, activity });
      if (path(request).endsWith("/session")) return envelope(account);
      if (path(request).endsWith("/session/activity")) return envelope(activity);
      if (path(request).endsWith("/session/logout")) return envelope({ ownerId: owner, signedOut: true });
      if (path(request).endsWith("/capabilities")) return envelope({ supportedVersions: ["1"], features: state.features });
      if (path(request).endsWith("/feed")) return envelope({ mode: new URL(request.url).searchParams.get("mode"), scope: "fictional",
        pageCursor: "fictional.page", notice: null, page: { items: [examplePost], nextCursor: "fictional.next" } });
      if (path(request).startsWith("/api/platform/v1/posts/")) return envelope({ ...examplePost,
        id: path(request).slice("/api/platform/v1/posts/".length) });
      if (path(request) === preferencePath) {
        if (request.method === "GET") return envelope({ ownerId: owner, hideAuthoredReactionCounts: state.hideCounts,
          version: state.version, recoveryRequired: state.recoveryRequired });
        const input = apiContracts.setReactionPreferences.body.parse(JSON.parse(request.body!));
        const previous = receipts.get(input.mutationId);
        if (previous) {
          assert.equal(previous.owner, owner); assert.equal(previous.body, request.body);
          return state.afterWrite ? state.afterWrite(request, previous.result) : previous.result;
        }
        if (input.expectedVersion !== state.version) return failure("conflict", 409);
        state.version++; state.hideCounts = input.hideAuthoredReactionCounts; state.recoveryRequired = false; state.commits++;
        const result = envelope({ id: owner, version: state.version, message: "Fictional receipt" });
        receipts.set(input.mutationId, { owner, body: request.body!, result });
        return state.afterWrite ? state.afterWrite(request, result) : result;
      }
      throw Error("Unexpected fictional request: " + path(request));
    }
  });
  return { state, runtime, receipts,
    async signIn() { await runtime.setForeground(true); await runtime.signIn(credentials); },
    async open() { await runtime.openReactionPreferences(runtime.reactionPreferences.getSnapshot()); return runtime.reactionPreferences.getSnapshot(); },
    preferences() { return state.requests.filter(request => path(request) === preferencePath); },
    writes() { return state.requests.filter(request => path(request) === preferencePath && request.method === "POST"); },
    reads() { return state.requests.filter(request => /\/(?:feed|posts\/)/.test(path(request))); },
    expireDuringContinuity() { expireOnClockRead = 2; },
    advance(ms: number) {
      elapsed += ms;
      for (const timer of [...timers]) if (timer.at <= elapsed) { timers.delete(timer); timer.callback(); }
    }
  };
}

test("preferences perform no implicit request and expose no command or credential material", async t => {
  for (const enabled of [false, true]) {
    const f = fixture(enabled ? () => "fictional-choice" : null); t.after(f.runtime.dispose);
    assert.equal(f.state.requests.length, 0); assert.equal(f.runtime.reactionPreferences.getSnapshot().phase, "concealed");
    await f.signIn(); assert.equal(f.runtime.reading.getSnapshot().kind, "feed");
    await f.runtime.open({ kind: "post", postId: examplePost.id });
    assert.equal(f.preferences().length, 0);
    const ready = await f.open();
    assert.equal(ready.phase, "ready"); assert.equal(ready.canChoose, enabled);
    assert.equal(f.preferences().length, 1); assert.equal(f.runtime.reading.getSnapshot().kind, "idle");
    for (const secret of [f.state.token, "credentialId", "installationId", "expectedVersion", "mutationId"])
      assert.equal(JSON.stringify(ready).includes(secret), false);
    await f.runtime.closeReactionPreferences(ready);
    assert.equal(f.runtime.reading.getSnapshot().kind, "post"); assert.equal(f.preferences().length, 1);
  }
});

test("capability absence, pause and duplicate read declarations fail closed", async t => {
  for (const replacements of [[], [{ name: "reactionPreferences.read", available: false }],
    [{ name: "reactionPreferences.read", available: true }, { name: "reactionPreferences.read", available: true }]]) {
    const f = fixture(); t.after(f.runtime.dispose);
    f.state.features = [...f.state.features.filter(item => !item.name.startsWith("reactionPreferences.")), ...replacements];
    await f.signIn(); const state = await f.open();
    assert.equal(state.problem, "feature-unavailable"); assert.equal(state.canChoose, false);
    assert.equal(f.preferences().length, 0); assert.equal(state.canClose, true);
  }
  const f = fixture(); t.after(f.runtime.dispose);
  f.state.features = f.state.features.filter(item => item.name !== "reactionPreferences.write");
  await f.signIn(); const state = await f.open();
  assert.equal(state.hideCounts, false); assert.equal(state.canChoose, false);
  await f.runtime.setReactionPreferences(state, true); assert.equal(f.writes().length, 0);
});

test("wrong-owner and malformed current responses never expose a setting", async t => {
  for (const data of [
    { ownerId: "other-member", hideAuthoredReactionCounts: true, version: 0, recoveryRequired: false },
    { ownerId: "fictional-member", hideAuthoredReactionCounts: true, version: -1, recoveryRequired: false }
  ]) {
    const f = fixture(); t.after(f.runtime.dispose); await f.signIn();
    f.state.intercept = async request => path(request) === preferencePath ? response({ apiVersion: "1", viewerId: f.state.owner, data }) : undefined;
    const state = await f.open();
    assert.equal(state.phase, "error"); assert.equal(state.hideCounts, null); assert.equal(state.canChoose, false);
    assert.equal(state.hasPending, false);
  }
});

test("one dispatched choice is immutable, duplicates are inert and a lost committed reply retries exactly", async t => {
  const f = fixture(); t.after(f.runtime.dispose); await f.signIn(); const ready = await f.open();
  const reached = deferred(), release = deferred(); t.after(release.resolve);
  f.state.afterWrite = async () => { reached.resolve(); await release.promise; throw Error("Private wire detail"); };
  const writing = f.runtime.setReactionPreferences(ready, true); await reached.promise;
  assert.equal(f.runtime.reactionPreferences.getSnapshot().phase, "saving");
  await f.runtime.setReactionPreferences(ready, true); await f.runtime.setReactionPreferences(ready, false);
  assert.equal(f.writes().length, 1);
  release.resolve(); await writing;
  const uncertain = f.runtime.reactionPreferences.getSnapshot();
  assert.equal(uncertain.phase, "unconfirmed"); assert.equal(uncertain.hideCounts, false);
  assert.equal(uncertain.canRetry, true); assert.equal(uncertain.canClose, false);
  assert.equal(JSON.stringify(uncertain).includes("Private"), false);
  f.state.afterWrite = null;
  await f.runtime.retryReactionPreferences(uncertain);
  assert.equal(f.writes().length, 2); assert.equal(f.writes()[0].body, f.writes()[1].body); assert.equal(f.state.commits, 1);
  const saved = f.runtime.reactionPreferences.getSnapshot();
  assert.equal(saved.phase, "ready"); assert.equal(saved.hideCounts, true); assert.equal(saved.hasPending, false);
  await f.runtime.retryReactionPreferences(uncertain); await f.runtime.setReactionPreferences(ready, false);
  assert.equal(f.writes().length, 2);
});

test("canonical unconfirmed 503 and invalid successful receipts preserve the exact command", async t => {
  for (const invalid of [failure("unconfirmed", 503),
    response({ apiVersion: "1", viewerId: "fictional-member", data: { id: "other-member", version: 1, message: "Fictional receipt" } }),
    response({ apiVersion: "1", viewerId: "fictional-member", data: { id: "fictional-member", version: 2, message: "Fictional receipt" } })]) {
    const f = fixture(); t.after(f.runtime.dispose); await f.signIn(); const ready = await f.open();
    f.state.afterWrite = async () => invalid;
    await f.runtime.setReactionPreferences(ready, true);
    const uncertain = f.runtime.reactionPreferences.getSnapshot();
    assert.equal(uncertain.phase, "unconfirmed"); assert.equal(uncertain.hasPending, true); assert.equal(uncertain.canRetry, true);
    assert.equal(uncertain.hideCounts, false);
    f.state.afterWrite = null; await f.runtime.retryReactionPreferences(uncertain);
    assert.equal(f.writes()[0].body, f.writes()[1].body); assert.equal(f.state.commits, 1);
    assert.equal(f.runtime.reactionPreferences.getSnapshot().hasPending, false);
  }
});

test("pending choice blocks every reading command and resume until explicit same-credential reconciliation", async t => {
  const f = fixture(); t.after(f.runtime.dispose); await f.signIn(); const ready = await f.open();
  f.state.afterWrite = async () => { throw Error("Lost reply"); };
  await f.runtime.setReactionPreferences(ready, true); f.state.afterWrite = null;
  const reads = f.reads().length, navigation = f.runtime.navigation.getSnapshot();
  await f.runtime.closeReactionPreferences(f.runtime.reactionPreferences.getSnapshot());
  assert.equal(await f.runtime.open({ kind: "post", postId: examplePost.id }), "unavailable");
  await f.runtime.startFeed("weekly"); await f.runtime.backToFeed(); await f.runtime.refresh();
  await f.runtime.nextPage(); await f.runtime.retry(); await f.runtime.reveal();
  assert.equal(f.runtime.navigation.getSnapshot(), navigation); assert.equal(f.reads().length, reads);
  f.advance(30000); await new Promise<void>(resolve => setImmediate(resolve));
  assert.equal(f.reads().length, reads, "No passive reading while preference outcome is unknown");
  await f.runtime.setForeground(false);
  assert.equal(f.runtime.reactionPreferences.getSnapshot().phase, "concealed");
  await f.runtime.setForeground(true);
  const returned = f.runtime.reactionPreferences.getSnapshot();
  assert.equal(returned.phase, "closed"); assert.equal(returned.hasPending, true);
  assert.equal(f.reads().length, reads); assert.equal(f.writes().length, 1, "Resume never replays a write");
  await f.runtime.retryReactionPreferences(ready); assert.equal(f.writes().length, 1);
  const reviewed = await f.open(); assert.equal(reviewed.canRetry, true); assert.equal(reviewed.hideCounts, true);
  await f.runtime.retryReactionPreferences(reviewed);
  assert.equal(f.writes()[0].body, f.writes()[1].body); assert.equal(f.state.commits, 1);
  await f.runtime.closeReactionPreferences(f.runtime.reactionPreferences.getSnapshot());
  assert.equal(f.runtime.reading.getSnapshot().kind, "feed"); assert.ok(f.reads().length > reads);
});

test("a canceled held POST cannot overlap a retry after credential re-verification", async t => {
  const f = fixture(); t.after(f.runtime.dispose); await f.signIn(); const ready = await f.open();
  const reached = deferred(), release = deferred(); t.after(release.resolve);
  f.state.afterWrite = async (_request, result) => { reached.resolve(); await release.promise; return result; };
  const writing = f.runtime.setReactionPreferences(ready, true); await reached.promise;
  await f.runtime.setForeground(false); assert.equal(f.writes()[0].signal.aborted, true);
  await f.runtime.setForeground(true); const held = await f.open();
  assert.equal(held.hasPending, true); assert.equal(held.canRetry, false); assert.equal(held.canChoose, false);
  await f.runtime.retryReactionPreferences(held); assert.equal(f.writes().length, 1);
  release.resolve(); await writing; f.state.afterWrite = null;
  const settled = f.runtime.reactionPreferences.getSnapshot(); assert.equal(settled.canRetry, true);
  await f.runtime.retryReactionPreferences(held); assert.equal(f.writes().length, 1);
  await f.runtime.retryReactionPreferences(settled);
  assert.equal(f.writes()[0].body, f.writes()[1].body); assert.equal(f.state.commits, 1);
});

test("logout and A to B to A credential replacement discard pending and late completion", async t => {
  const f = fixture(); t.after(f.runtime.dispose); await f.signIn(); const ready = await f.open();
  const reached = deferred(), release = deferred(); t.after(release.resolve);
  f.state.afterWrite = async (_request, result) => { reached.resolve(); await release.promise; return result; };
  const writing = f.runtime.setReactionPreferences(ready, true); await reached.promise;
  await f.runtime.signOut(); f.state.owner = "other-member"; f.state.token = "b".repeat(43);
  await f.runtime.signIn(credentials); assert.equal(f.runtime.reactionPreferences.getSnapshot().hasPending, false);
  await f.runtime.signOut(); f.state.owner = "fictional-member"; f.state.token = "c".repeat(43);
  await f.runtime.signIn(credentials);
  release.resolve(); await writing; f.state.afterWrite = null;
  assert.equal(f.runtime.reactionPreferences.getSnapshot().hasPending, false);
  await f.runtime.retryReactionPreferences(ready); assert.equal(f.writes().length, 1);
  const current = await f.open(); assert.equal(current.canChoose, true);
});

test("a first conflict releases pending but a conflict after uncertainty cannot release the reading barrier", async t => {
  const f = fixture(); t.after(f.runtime.dispose); await f.signIn(); const ready = await f.open();
  f.state.version = 1; await f.runtime.setReactionPreferences(ready, true);
  const conflict = f.runtime.reactionPreferences.getSnapshot();
  assert.equal(conflict.phase, "error"); assert.equal(conflict.problem, "refresh-required");
  assert.equal(conflict.hasPending, false); assert.equal(conflict.canRetry, false); assert.equal(conflict.canClose, true);
  await f.runtime.refreshReactionPreferences(conflict);
  const fresh = f.runtime.reactionPreferences.getSnapshot();
  f.state.afterWrite = async () => { throw Error("Lost reply"); };
  await f.runtime.setReactionPreferences(fresh, true); f.state.afterWrite = null;
  const original = JSON.parse(f.writes()[0].body!), second = JSON.parse(f.writes()[1].body!);
  assert.notEqual(original.mutationId, second.mutationId); assert.equal(second.expectedVersion, 1);
  f.state.intercept = async request => path(request) === preferencePath && request.method === "POST" ? failure("conflict", 409) : undefined;
  await f.runtime.retryReactionPreferences(f.runtime.reactionPreferences.getSnapshot());
  const uncertain = f.runtime.reactionPreferences.getSnapshot();
  assert.equal(uncertain.hasPending, true); assert.equal(uncertain.problem, "refresh-required");
  assert.equal(uncertain.canRetry, false); assert.equal(uncertain.canClose, false); assert.equal(uncertain.hideCounts, null);
  f.state.intercept = null; await f.runtime.refreshReactionPreferences(uncertain);
  assert.equal(f.runtime.reactionPreferences.getSnapshot().hasPending, true);
  await f.runtime.retryReactionPreferences(f.runtime.reactionPreferences.getSnapshot());
  assert.equal(f.writes()[1].body, f.writes()[3].body); assert.equal(f.state.commits, 1);
});

test("paused writes and reads preserve pending identity until a fresh allowed explicit retry", async t => {
  const f = fixture(); t.after(f.runtime.dispose); await f.signIn(); const ready = await f.open();
  f.state.afterWrite = async () => { throw Error("Lost reply"); };
  await f.runtime.setReactionPreferences(ready, true); f.state.afterWrite = null;
  f.state.intercept = async request => path(request) === preferencePath && request.method === "POST" ? failure("rate_limited", 429, "30") : undefined;
  await f.runtime.retryReactionPreferences(f.runtime.reactionPreferences.getSnapshot());
  const limited = f.runtime.reactionPreferences.getSnapshot();
  assert.equal(limited.problem, "rate-limited"); assert.equal(limited.retryAfterSeconds, 30);
  assert.equal(limited.canRetry, false); assert.equal(limited.hasPending, true);
  f.state.intercept = null;
  f.state.features = f.state.features.map(item => item.name === "reactionPreferences.write" ? { ...item, available: false } : item);
  await f.runtime.refreshReactionPreferences(limited);
  const paused = f.runtime.reactionPreferences.getSnapshot();
  assert.equal(paused.hideCounts, true); assert.equal(paused.hasPending, true); assert.equal(paused.canRetry, false);
  await f.runtime.retryReactionPreferences(paused); assert.equal(f.writes().length, 2);
  f.state.features = f.state.features.map(item => item.name.startsWith("reactionPreferences.") ? { ...item, available: false } : item);
  await f.runtime.refreshReactionPreferences(paused);
  const noRead = f.runtime.reactionPreferences.getSnapshot();
  assert.equal(noRead.problem, "feature-unavailable"); assert.equal(noRead.hideCounts, null); assert.equal(noRead.canClose, false);
  f.state.features = f.state.features.map(item => ({ ...item, available: true }));
  await f.runtime.refreshReactionPreferences(noRead); await f.runtime.retryReactionPreferences(f.runtime.reactionPreferences.getSnapshot());
  assert.equal(f.writes()[0].body, f.writes()[2].body); assert.equal(f.state.commits, 1);
});

test("recovery-required hidden state admits an explicit same-hidden repair but ordinary same choice is a no-op", async t => {
  const f = fixture(); t.after(f.runtime.dispose); await f.signIn(); let state = await f.open();
  await f.runtime.setReactionPreferences(state, false); assert.equal(f.writes().length, 0);
  f.state.hideCounts = false; f.state.recoveryRequired = true;
  await f.runtime.refreshReactionPreferences(state); state = f.runtime.reactionPreferences.getSnapshot();
  assert.equal(state.recoveryRequired, true); assert.equal(state.canChoose, true);
  assert.equal(state.hideCounts, true, "Recovery overrides an inconsistent shown-counts DTO");
  await f.runtime.setReactionPreferences(state, true);
  assert.equal(f.writes().length, 1); assert.equal(f.state.commits, 1);
  assert.equal(f.runtime.reactionPreferences.getSnapshot().recoveryRequired, false);
  await f.runtime.setReactionPreferences(f.runtime.reactionPreferences.getSnapshot(), true); assert.equal(f.writes().length, 1);
});

test("a historical ACK loads newer current state and an ACK followed by failed GET can close to fresh reading", async t => {
  const f = fixture(); t.after(f.runtime.dispose); await f.signIn(); const ready = await f.open();
  f.state.afterWrite = async (_request, result) => { f.state.version++; f.state.hideCounts = false; return result; };
  await f.runtime.setReactionPreferences(ready, true);
  const current = f.runtime.reactionPreferences.getSnapshot();
  assert.equal(current.phase, "ready"); assert.equal(current.hideCounts, false); assert.equal(current.hasPending, false);
  f.state.afterWrite = async (_request, result) => {
    f.state.intercept = async request => path(request) === preferencePath && request.method === "GET" ? failure("feature_unavailable", 503) : undefined;
    return result;
  };
  await f.runtime.setReactionPreferences(current, true);
  const unavailable = f.runtime.reactionPreferences.getSnapshot();
  assert.equal(unavailable.phase, "error"); assert.equal(unavailable.hasPending, false);
  assert.equal(unavailable.canRetry, false); assert.equal(unavailable.canClose, true); assert.equal(unavailable.hideCounts, null);
  const reads = f.reads().length;
  await f.runtime.closeReactionPreferences(unavailable);
  assert.equal(f.runtime.reading.getSnapshot().kind, "feed"); assert.ok(f.reads().length > reads);
  assert.equal(f.writes().length, 2);
});

test("expiry, sign-out before dispatch and disposal revoke retained callbacks and late responses", async t => {
  const f = fixture(); t.after(f.runtime.dispose); await f.signIn(); const ready = await f.open();
  const writing = f.runtime.setReactionPreferences(ready, true);
  await f.runtime.signOut(); await writing; assert.equal(f.writes().length, 0);
  await f.runtime.signIn(credentials); const beforeExpiry = await f.open();
  f.advance(1800001);
  await f.runtime.setReactionPreferences(beforeExpiry, true);
  assert.equal(f.runtime.reactionPreferences.getSnapshot().phase, "concealed"); assert.equal(f.writes().length, 0);
  const g = fixture(); t.after(g.runtime.dispose); await g.signIn(); const before = await g.open();
  const reached = deferred(), release = deferred(); t.after(release.resolve);
  g.state.afterWrite = async (_request, result) => { reached.resolve(); await release.promise; return result; };
  const pending = g.runtime.setReactionPreferences(before, true); await reached.promise;
  g.runtime.dispose(); assert.equal(g.writes()[0].signal.aborted, true);
  release.resolve(); await pending;
  await g.runtime.retryReactionPreferences(before); await g.runtime.refreshReactionPreferences(before);
  assert.equal(g.runtime.reactionPreferences.getSnapshot().phase, "concealed"); assert.equal(g.writes().length, 1);
});

test("expiry inside the continuity getter retains pending through a fresh verified return", async t => {
  const f = fixture(); t.after(f.runtime.dispose); await f.signIn(); const ready = await f.open();
  f.state.afterWrite = async () => { throw Error("Lost reply"); };
  await f.runtime.setReactionPreferences(ready, true); f.state.afterWrite = null;
  const reads = f.reads().length;
  // First clock read admits the session snapshot; the second expires it inside
  // command continuity, before the controller re-reads the session snapshot.
  f.expireDuringContinuity();
  assert.equal(f.runtime.reactionPreferences.getSnapshot().phase, "concealed");
  assert.equal(f.runtime.session.getSnapshot().phase, "unavailable");
  await f.runtime.retryVerification();
  const returned = f.runtime.reactionPreferences.getSnapshot();
  assert.equal(returned.hasPending, true); assert.equal(returned.open, false);
  assert.equal(f.reads().length, reads); assert.equal(f.writes().length, 1);
  const reviewed = await f.open(); assert.equal(reviewed.canRetry, true);
  await f.runtime.retryReactionPreferences(reviewed);
  assert.equal(f.writes()[0].body, f.writes()[1].body); assert.equal(f.state.commits, 1);
});

test("opening preferences aborts held feed and post reads and prevents late or periodic republication", async t => {
  for (const target of ["feed", "post"] as const) {
    const f = fixture(); t.after(f.runtime.dispose); await f.signIn();
    const reached = deferred(), release = deferred(); t.after(release.resolve);
    let held: NativeWireRequest | null = null;
    f.state.intercept = async request => {
      if (!held && (target === "feed" ? path(request).endsWith("/feed") : path(request).startsWith("/api/platform/v1/posts/"))) {
        held = request; reached.resolve(); await release.promise;
      }
    };
    const loading = target === "feed" ? f.runtime.refresh() : f.runtime.open({ kind: "post", postId: examplePost.id });
    await reached.promise; assert.equal(f.runtime.reading.getSnapshot().kind, "loading");
    const settings = await f.open(), readCount = f.reads().length;
    assert.equal(settings.phase, "ready"); assert.equal(f.runtime.reading.getSnapshot().kind, "idle");
    assert.equal((held as NativeWireRequest | null)?.signal.aborted, true);
    release.resolve(); await loading;
    f.advance(30000); await new Promise<void>(resolve => setImmediate(resolve));
    assert.equal(f.runtime.reading.getSnapshot().kind, "idle"); assert.equal(f.reads().length, readCount);
    assert.equal(f.runtime.reactionPreferences.getSnapshot(), settings);
  }
});

test("opening preferences removes Like totals and aborts held Like reads or writes without replay", async t => {
  for (const method of ["GET", "POST"] as const) {
    const f = fixture(); t.after(f.runtime.dispose);
    f.state.features.push({ name: "likes.read", available: true }, { name: "likes.write", available: true });
    let shouldHold = false, held: NativeWireRequest | null = null;
    const reached = deferred(), release = deferred(); t.after(release.resolve);
    f.state.intercept = async request => {
      if (path(request) === "/api/platform/v1/posts/" + examplePost.id)
        return response({ apiVersion: "1", viewerId: f.state.owner, data: { ...examplePost, likeCount: 7 } });
      if (!path(request).endsWith("/like")) return;
      if (shouldHold && request.method === method) { held = request; reached.resolve(); await release.promise; }
      return response({ apiVersion: "1", viewerId: f.state.owner, data: request.method === "GET"
        ? { id: examplePost.id, liked: false, version: 0, count: 7 }
        : { id: examplePost.id, version: 1, message: "Fictional Like receipt" } });
    };
    await f.signIn(); await f.runtime.open({ kind: "post", postId: examplePost.id });
    if (f.runtime.likes.getSnapshot().phase !== "ready") await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => { unsubscribe(); reject(Error("Fictional Like did not become ready")); }, 2000);
      const unsubscribe = f.runtime.likes.subscribe(() => {
        if (f.runtime.likes.getSnapshot().phase === "ready") { clearTimeout(timer); unsubscribe(); resolve(); }
      });
    });
    const before = f.runtime.likes.getSnapshot(); assert.equal(before.count, 7);
    shouldHold = true;
    const flight = method === "GET" ? f.runtime.refreshLike(before) : f.runtime.setLike(before, true);
    await reached.promise;
    if (method === "POST") assert.equal(f.runtime.likes.getSnapshot().count, 7);
    const opening = f.runtime.openReactionPreferences(f.runtime.reactionPreferences.getSnapshot());
    assert.equal(f.runtime.likes.getSnapshot().count, null, "Opening removes the old Like projection synchronously");
    assert.equal((held as NativeWireRequest | null)?.signal.aborted, true);
    await opening;
    const requestCount = f.state.requests.length;
    await f.runtime.setLike(before, true); await f.runtime.retryLike(before); await f.runtime.refreshLike(before);
    release.resolve(); await flight; await new Promise<void>(resolve => setImmediate(resolve));
    assert.equal(f.runtime.likes.getSnapshot().count, null); assert.equal(f.runtime.likes.getSnapshot().currentPostId, null);
    assert.equal(f.runtime.reactionPreferences.getSnapshot().open, true); assert.equal(f.runtime.reading.getSnapshot().kind, "idle");
    assert.equal(f.state.requests.length, requestCount, "Late Like completion does not issue another read or write");
    assert.equal(f.state.requests.filter(request => path(request).endsWith("/like") && request.method === "POST").length, method === "POST" ? 1 : 0);
  }
});
