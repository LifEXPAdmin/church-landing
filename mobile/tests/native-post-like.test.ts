import assert from "node:assert/strict";
import test from "node:test";
import { apiContracts } from "@godschurches/shared-core";
import { examplePost } from "../../lib/platform/api-contract-examples.ts";
import { createCredentialVault, type TextStore } from "../src/session/credential-vault.ts";
import { createNativeRuntime } from "../src/session/runtime.ts";
import type { NativeWireRequest, NativeWireResponse } from "../src/platform/request-adapter.ts";
import type { PostLikeSnapshot } from "../src/interactions/post-like-controller.ts";

const origin = "https://fictional.example.invalid";
const credentials = { email: "fictional@example.invalid", password: "fictional password" };
const path = (r: NativeWireRequest) => new URL(r.url).pathname;
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
function fixture(idSource: (() => string) | null = () => "like-" + String(++operation)) {
  let nonce = 0, elapsed = 0;
  const timers = new Set<{ at: number; callback: () => void }>();
  const state = {
    requests: [] as NativeWireRequest[], owner: "fictional-member", token: "a".repeat(43),
    post: { ...examplePost, likeCount: 7 } as typeof examplePost,
    liked: false, version: 0, count: 7 as number | null, commits: 0,
    features: [{ name: "feed.read", available: true }, { name: "post.read", available: true },
      { name: "likes.read", available: true }, { name: "likes.write", available: true }],
    intercept: null as ((request: NativeWireRequest) => Promise<NativeWireResponse | void>) | null,
    afterLike: null as ((request: NativeWireRequest, result: NativeWireResponse) => Promise<NativeWireResponse>) | null
  };
  const receipts = new Map<string, { owner: string; path: string; body: string; result: NativeWireResponse }>();
  const secret = store(), marker = store();
  const vault = createCredentialVault("staging|" + origin, { secret, marker,
    randomId: () => `00000000-0000-4000-8000-${String(++nonce).padStart(12, "0")}` });
  const runtime = createNativeRuntime({ configuration: { environment: "staging", origin }, vault,
    availability: { screens: ["home"], resources: ["post"] },
    ...(idSource ? { mutationId: idSource } : {}),
    clock: { now: () => elapsed, schedule(callback, delay) {
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
      if (path(request).endsWith("/feed")) return envelope({ mode: "latest", scope: "fictional",
        pageCursor: "fictional.page", notice: null, page: { items: [state.post], nextCursor: null } });
      const primary = state.post.repost?.kind === "PLAIN" ? state.post.repost.source : state.post;
      if (path(request).endsWith("/like")) {
        if (!primary) return failure("not_found", 404);
        if (request.method === "GET") return envelope({ id: primary.id, liked: state.liked, version: state.version, count: state.count });
        const body = apiContracts.setLike.body.parse(JSON.parse(request.body!));
        const old = receipts.get(body.mutationId);
        if (old) {
          assert.equal(old.owner, owner); assert.equal(old.path, path(request)); assert.equal(old.body, request.body);
          return state.afterLike ? state.afterLike(request, old.result) : old.result;
        }
        if (body.expectedVersion !== state.version) return failure("conflict", 409);
        state.version++; state.liked = body.desired; state.commits++;
        if (state.count !== null) state.count += body.desired ? 1 : -1;
        const result = envelope({ id: primary.id, version: state.version, message: "Fictional receipt" });
        receipts.set(body.mutationId, { owner, path: path(request), body: request.body!, result });
        return state.afterLike ? state.afterLike(request, result) : result;
      }
      if (path(request).startsWith("/api/platform/v1/posts/")) return envelope({ ...state.post,
        id: path(request).slice("/api/platform/v1/posts/".length) });
      throw Error("Unexpected fictional request");
    }
  });
  function waitFor(accept: (snapshot: PostLikeSnapshot) => boolean) {
    if (accept(runtime.likes.getSnapshot())) return Promise.resolve(runtime.likes.getSnapshot());
    return new Promise<PostLikeSnapshot>((resolve, reject) => {
      const timer = setTimeout(() => { unsubscribe(); reject(Error("Like snapshot did not settle")); }, 2000);
      const unsubscribe = runtime.likes.subscribe(() => {
        const snapshot = runtime.likes.getSnapshot();
        if (accept(snapshot)) { clearTimeout(timer); unsubscribe(); resolve(snapshot); }
      });
    });
  }
  return { state, runtime, receipts,
    async signIn() { await runtime.setForeground(true); await runtime.signIn(credentials); },
    async open(id = state.post.id) {
      await runtime.open({ kind: "post", postId: id });
      return waitFor(s => s.currentPostId === id && ["ready", "unconfirmed", "error"].includes(s.phase));
    },
    waitFor,
    likes() { return state.requests.filter(r => path(r).endsWith("/like")); },
    writes() { return state.requests.filter(r => path(r).endsWith("/like") && r.method === "POST"); },
    advance(ms: number) {
      elapsed += ms;
      for (const timer of [...timers]) if (timer.at <= elapsed) { timers.delete(timer); timer.callback(); }
    }
  };
}
let operation = 0;

test("Like consumer performs no startup/feed work and optional old runtimes remain inactive", async t => {
  for (const enabled of [false, true]) {
    const f = fixture(enabled ? () => "fixture-choice" : null); t.after(f.runtime.dispose);
    assert.equal(f.state.requests.length, 0); assert.equal(f.runtime.likes.getSnapshot().phase, "concealed");
    await f.signIn(); assert.equal(f.likes().length, 0);
    const snapshot = await f.open();
    assert.equal(snapshot.phase, enabled ? "ready" : "error");
    assert.equal(snapshot.canChoose, enabled); assert.equal(f.likes().length, enabled ? 1 : 0);
    assert.deepEqual(Object.keys(f.runtime.session).sort(), ["getSnapshot", "subscribe"]);
    const text = JSON.stringify(snapshot);
    for (const secret of [f.state.token, "credentialId", "installationId", "expectedVersion", "mutationId"])
      assert.equal(text.includes(secret), false);
  }
});

test("only unique enabled Like capabilities admit the selected detail request", async t => {
  for (const features of [[], [{ name: "likes.read", available: false }],
    [{ name: "likes.read", available: true }, { name: "likes.read", available: true }]]) {
    const f = fixture(); t.after(f.runtime.dispose);
    f.state.features = [...f.state.features.filter(x => !x.name.startsWith("likes.")), ...features];
    await f.signIn(); const snapshot = await f.open();
    assert.equal(snapshot.problem, "feature-unavailable"); assert.equal(snapshot.canChoose, false);
    assert.equal(f.likes().length, 0);
  }
  const f = fixture(); t.after(f.runtime.dispose);
  f.state.features = f.state.features.filter(x => x.name !== "likes.write");
  await f.signIn(); const snapshot = await f.open();
  assert.equal(snapshot.liked, false); assert.equal(snapshot.canChoose, false);
  await f.runtime.setLike(snapshot, true); assert.equal(f.writes().length, 0);
});

test("hidden totals win and plain repost commands keep their requested path", async t => {
  const f = fixture(); t.after(f.runtime.dispose);
  f.state.post = { ...examplePost, id: "plain-wrapper", likeCount: 900,
    repost: { kind: "PLAIN", source: { ...examplePost, id: "original-source", likeCount: null } } };
  await f.signIn(); const snapshot = await f.open();
  assert.equal(snapshot.count, null); assert.equal(snapshot.currentPostId, "plain-wrapper");
  await f.runtime.setLike(snapshot, true);
  const after = f.runtime.likes.getSnapshot(); assert.equal(after.liked, true); assert.equal(after.count, null);
  assert.equal(path(f.writes()[0]), "/api/platform/v1/posts/plain-wrapper/like");
  assert.equal([...f.receipts.values()][0].body, f.writes()[0].body);
  f.state.count = null;
  await f.runtime.refreshLike(after); assert.equal(f.runtime.likes.getSnapshot().count, null);
});

test("lost committed reply retains one immutable choice and duplicate presses never replay", async t => {
  const f = fixture(); t.after(f.runtime.dispose); await f.signIn(); const before = await f.open();
  const reached = deferred(), release = deferred();
  f.state.afterLike = async () => { reached.resolve(); await release.promise; throw Error("private transport detail"); };
  const first = f.runtime.setLike(before, true); await reached.promise;
  assert.equal(f.runtime.likes.getSnapshot().phase, "saving");
  await f.runtime.setLike(before, true); assert.equal(f.writes().length, 1);
  release.resolve(); await first;
  const uncertain = f.runtime.likes.getSnapshot();
  assert.equal(uncertain.phase, "unconfirmed"); assert.equal(uncertain.canRetry, true);
  assert.equal(uncertain.liked, false, "Do not optimistically adopt the command");
  assert.equal(f.state.commits, 1);
  f.state.afterLike = null;
  await f.runtime.retryLike(uncertain);
  const after = f.runtime.likes.getSnapshot();
  assert.equal(after.phase, "ready"); assert.equal(after.liked, true); assert.equal(after.hasPending, false);
  assert.equal(f.writes().length, 2); assert.equal(f.writes()[0].body, f.writes()[1].body);
  assert.equal(f.state.commits, 1);
  await f.runtime.retryLike(uncertain); await f.runtime.setLike(before, false);
  assert.equal(f.writes().length, 2, "Retained stale callbacks have no authority");
});

test("a confirmed historical receipt requires current state and never becomes another retry on read failure", async t => {
  const f = fixture(); t.after(f.runtime.dispose); await f.signIn(); const before = await f.open();
  f.state.afterLike = async (_request, result) => {
    f.state.intercept = async r => r.method === "GET" && path(r).endsWith("/like") ? failure("not_found", 404) : undefined;
    return result;
  };
  await f.runtime.setLike(before, true);
  const failedRead = f.runtime.likes.getSnapshot();
  assert.equal(failedRead.phase, "error"); assert.equal(failedRead.problem, "not-found");
  assert.equal(failedRead.count, null); assert.equal(failedRead.liked, null);
  assert.equal(failedRead.hasPending, false); assert.equal(failedRead.canRetry, false); assert.equal(failedRead.canRefresh, true);
  await f.runtime.retryLike(failedRead); assert.equal(f.writes().length, 1);
  f.state.intercept = null;
  await f.runtime.refreshLike(failedRead);
  assert.equal(f.runtime.likes.getSnapshot().liked, true); assert.equal(f.writes().length, 1);
});

test("conceal and reverified same credential allow only an explicit identical retry", async t => {
  const f = fixture(); t.after(f.runtime.dispose); await f.signIn(); const before = await f.open();
  const reached = deferred(), release = deferred();
  f.state.afterLike = async (_request, result) => { reached.resolve(); await release.promise; return result; };
  const first = f.runtime.setLike(before, true); await reached.promise;
  await f.runtime.setForeground(false);
  const hidden = f.runtime.likes.getSnapshot();
  assert.equal(hidden.phase, "concealed"); assert.equal(hidden.currentPostId, null); assert.equal(hidden.hasPending, false);
  assert.equal(f.writes()[0].signal.aborted, true);
  await f.runtime.setLike(before, false); await f.runtime.retryLike(before);
  await f.runtime.setForeground(true);
  assert.equal(f.runtime.reading.getSnapshot().kind, "feed");
  assert.equal(f.runtime.likes.getSnapshot().canReviewPending, true);
  assert.equal(f.writes().length, 1, "Foreground restoration never replays a write");
  release.resolve(); await first; f.state.afterLike = null;
  await f.runtime.reviewPendingLike(f.runtime.likes.getSnapshot());
  const pending = await f.waitFor(s => s.phase === "unconfirmed" && s.canRetry);
  await f.runtime.retryLike(pending);
  assert.equal(f.writes().length, 2); assert.equal(f.writes()[0].body, f.writes()[1].body);
  assert.equal(f.state.commits, 1); assert.equal(f.runtime.likes.getSnapshot().hasPending, false);
});

test("pending choice survives Back and cannot retarget another detail", async t => {
  const f = fixture(); t.after(f.runtime.dispose); await f.signIn(); const before = await f.open();
  f.state.afterLike = async () => { throw Error("Lost reply"); };
  await f.runtime.setLike(before, true); f.state.afterLike = null;
  const originalBody = f.writes()[0].body;
  await f.runtime.backToFeed();
  assert.equal(f.runtime.likes.getSnapshot().currentPostId, null);
  assert.equal(f.runtime.likes.getSnapshot().canReviewPending, true);
  // Another current detail must not acquire the old command or create a new one.
  f.state.post = { ...examplePost, id: "another-post", likeCount: 7 };
  const other = await f.open();
  assert.equal(other.canChoose, false); assert.equal(other.canReviewPending, true);
  await f.runtime.setLike(other, false); assert.equal(f.writes().length, 1);
  f.state.post = { ...examplePost, likeCount: 7 };
  await f.runtime.reviewPendingLike(other);
  const restored = await f.waitFor(s => s.phase === "unconfirmed" && s.canRetry);
  assert.equal(restored.currentPostId, examplePost.id);
  await f.runtime.retryLike(restored);
  assert.equal(f.writes()[1].body, originalBody); assert.equal(f.state.commits, 1);
});

test("returning to pending detail before a canceled flight settles cannot overlap its POST", async t => {
  const f = fixture(); t.after(f.runtime.dispose); await f.signIn(); const before = await f.open();
  const reached = deferred(), release = deferred(); t.after(release.resolve);
  f.state.afterLike = async (_request, result) => { reached.resolve(); await release.promise; return result; };
  const first = f.runtime.setLike(before, true); await reached.promise;
  await f.runtime.setForeground(false); await f.runtime.setForeground(true);
  await f.runtime.reviewPendingLike(f.runtime.likes.getSnapshot());
  const waiting = await f.waitFor(s => s.phase === "unconfirmed");
  assert.equal(waiting.liked, true); assert.equal(waiting.hasPending, true);
  assert.equal(waiting.canRetry, false); assert.equal(waiting.canChoose, false);
  await f.runtime.retryLike(waiting); await f.runtime.setLike(waiting, false);
  assert.equal(f.writes().length, 1);
  release.resolve(); await first; f.state.afterLike = null;
  const settled = f.runtime.likes.getSnapshot(); assert.equal(settled.canRetry, true);
  await f.runtime.retryLike(waiting); assert.equal(f.writes().length, 1, "The former disabled snapshot stays stale");
  await f.runtime.retryLike(settled);
  assert.equal(f.writes().length, 2); assert.equal(f.writes()[0].body, f.writes()[1].body);
  assert.equal(f.state.commits, 1); assert.equal(f.runtime.likes.getSnapshot().hasPending, false);
});

test("logout and A to B to A replacement clear pending command and reject late completion", async t => {
  const f = fixture(); t.after(f.runtime.dispose); await f.signIn(); const before = await f.open();
  const reached = deferred(), release = deferred();
  f.state.afterLike = async (_request, result) => { reached.resolve(); await release.promise; return result; };
  const writing = f.runtime.setLike(before, true); await reached.promise;
  await f.runtime.signOut();
  f.state.owner = "other-member"; f.state.token = "b".repeat(43);
  await f.runtime.signIn(credentials);
  assert.equal(f.runtime.likes.getSnapshot().hasPending, false);
  await f.runtime.signOut(); f.state.owner = "fictional-member"; f.state.token = "c".repeat(43);
  await f.runtime.signIn(credentials);
  release.resolve(); await writing; f.state.afterLike = null;
  assert.equal(f.runtime.likes.getSnapshot().hasPending, false);
  await f.runtime.retryLike(before); assert.equal(f.writes().length, 1);
  const current = await f.open();
  assert.equal(current.canChoose, true); assert.equal(current.liked, true);
});

test("sign-out before dispatch and disposal with a held request never start another write", async t => {
  const f = fixture(); t.after(f.runtime.dispose); await f.signIn(); const before = await f.open();
  const notDispatched = f.runtime.setLike(before, true);
  await f.runtime.signOut(); await notDispatched;
  assert.equal(f.writes().length, 0);
  await f.runtime.signIn(credentials); const current = await f.open();
  const reached = deferred(), release = deferred();
  f.state.afterLike = async (_request, result) => { reached.resolve(); await release.promise; return result; };
  const writing = f.runtime.setLike(current, true); await reached.promise;
  f.runtime.dispose(); release.resolve(); await writing;
  assert.equal(f.runtime.likes.getSnapshot().phase, "concealed");
  await f.runtime.retryLike(current); await f.runtime.setLike(current, false);
  assert.equal(f.writes().length, 1);
});

test("ID-source failure and wrong interaction replies never dispatch or expose private diagnostics", async t => {
  for (const idSource of [() => { throw Error("private generator text"); }, () => "bad key"]) {
    const f = fixture(idSource); t.after(f.runtime.dispose); await f.signIn(); const before = await f.open();
    await f.runtime.setLike(before, true);
    assert.equal(f.runtime.likes.getSnapshot().problem, "unavailable"); assert.equal(f.writes().length, 0);
    assert.equal(JSON.stringify(f.runtime.likes.getSnapshot()).includes("private"), false);
  }
  const f = fixture(); t.after(f.runtime.dispose); await f.signIn();
  f.state.intercept = async r => path(r).endsWith("/like") ? response({ apiVersion: "1", viewerId: f.state.owner,
    data: { id: "wrong-resource", liked: false, version: 0, count: 5 } }) : undefined;
  const bad = await f.open();
  assert.equal(bad.phase, "error"); assert.equal(bad.count, null); assert.equal(bad.canChoose, false);
});

test("paused retry retains exact pending identity and requires a fresh explicit status check", async t => {
  const f = fixture(); t.after(f.runtime.dispose); await f.signIn(); const before = await f.open();
  f.state.afterLike = async () => { throw Error("Lost reply"); };
  await f.runtime.setLike(before, true); f.state.afterLike = null;
  f.state.intercept = async r => path(r).endsWith("/like") && r.method === "POST" ? failure("rate_limited", 429, "30") : undefined;
  await f.runtime.retryLike(f.runtime.likes.getSnapshot());
  const paused = f.runtime.likes.getSnapshot();
  assert.equal(paused.phase, "unconfirmed"); assert.equal(paused.hasPending, true);
  assert.equal(paused.problem, "rate-limited"); assert.equal(paused.retryAfterSeconds, 30);
  assert.equal(paused.canRetry, false); assert.equal(paused.canRefresh, true);
  await f.runtime.retryLike(paused); assert.equal(f.writes().length, 2);
  f.state.intercept = null;
  await f.runtime.refreshLike(paused);
  await f.runtime.retryLike(f.runtime.likes.getSnapshot());
  assert.equal(f.writes().length, 3); assert.equal(f.writes()[0].body, f.writes()[2].body);
  assert.equal(f.state.commits, 1);
});

test("passive detail recheck preserves pending identity and a held old read cannot restore navigated content", async t => {
  const f = fixture(); t.after(f.runtime.dispose); await f.signIn(); const before = await f.open();
  f.state.afterLike = async () => { throw Error("Lost reply"); };
  await f.runtime.setLike(before, true); f.state.afterLike = null;
  const originalBody = f.writes()[0].body, old = f.runtime.likes.getSnapshot();
  f.advance(30000);
  const rechecked = await f.waitFor(s => s !== old && s.phase === "unconfirmed" && s.canRetry);
  assert.equal(rechecked.hasPending, true); assert.equal(rechecked.liked, true);
  assert.equal(f.writes().length, 1, "The passive timer checks current state without replaying the choice");
  const reached = deferred(), release = deferred(); let held: NativeWireRequest | null = null;
  t.after(release.resolve);
  f.state.intercept = async request => {
    if (!held && path(request) === "/api/platform/v1/posts/" + f.state.post.id) {
      held = request; reached.resolve(); await release.promise;
    }
  };
  f.advance(30000); await reached.promise;
  await f.runtime.backToFeed();
  const feed = f.runtime.reading.getSnapshot(), pending = f.runtime.likes.getSnapshot();
  assert.equal(feed.kind, "feed"); assert.equal(pending.currentPostId, null);
  assert.equal(pending.canReviewPending, true); assert.equal((held as NativeWireRequest | null)?.signal.aborted, true);
  release.resolve();
  // Let the canceled wire's completed promise and decoder continuations settle.
  await new Promise<void>(resolve => setImmediate(resolve));
  assert.equal(f.runtime.reading.getSnapshot(), feed);
  assert.equal(f.runtime.likes.getSnapshot(), pending); assert.equal(f.writes().length, 1);
  f.state.intercept = null;
  await f.runtime.reviewPendingLike(pending);
  const restored = await f.waitFor(s => s.phase === "unconfirmed" && s.canRetry);
  await f.runtime.retryLike(restored);
  assert.equal(f.writes()[1].body, originalBody); assert.equal(f.state.commits, 1);
});

test("malformed and wrong-interaction successful receipts retain the exact original choice for retry", async t => {
  for (const data of [{ version: 1, message: "Incomplete fictional receipt" },
    { id: "wrong-interaction", version: 1, message: "Wrong fictional identity" }]) {
    const f = fixture(); t.after(f.runtime.dispose); await f.signIn(); const before = await f.open();
    f.state.afterLike = async () => response({ apiVersion: "1", viewerId: f.state.owner, data });
    await f.runtime.setLike(before, true);
    const uncertain = f.runtime.likes.getSnapshot();
    assert.equal(uncertain.phase, "unconfirmed"); assert.equal(uncertain.hasPending, true);
    assert.equal(uncertain.canRetry, true); assert.equal(uncertain.liked, false);
    f.state.afterLike = null;
    await f.runtime.retryLike(uncertain);
    assert.equal(f.writes().length, 2); assert.equal(f.writes()[0].body, f.writes()[1].body);
    assert.equal(f.state.commits, 1); assert.equal(f.runtime.likes.getSnapshot().hasPending, false);
    assert.equal(f.runtime.likes.getSnapshot().liked, true);
  }
});

test("a first confirmed conflict clears pending and requires a fresh read before a new explicit choice", async t => {
  const f = fixture(); t.after(f.runtime.dispose); await f.signIn(); const before = await f.open();
  f.state.version = 1;
  await f.runtime.setLike(before, true);
  const conflict = f.runtime.likes.getSnapshot();
  assert.equal(conflict.phase, "error"); assert.equal(conflict.problem, "refresh-required");
  assert.equal(conflict.hasPending, false); assert.equal(conflict.canRetry, false);
  assert.equal(conflict.canChoose, false); assert.equal(conflict.canRefresh, true);
  assert.equal(conflict.liked, null); assert.equal(conflict.count, null);
  await f.runtime.retryLike(conflict); await f.runtime.setLike(conflict, true);
  assert.equal(f.writes().length, 1); assert.equal(f.state.commits, 0);
  await f.runtime.refreshLike(conflict);
  const refreshed = f.runtime.likes.getSnapshot(); assert.equal(refreshed.canChoose, true);
  await f.runtime.setLike(refreshed, true);
  const original = JSON.parse(f.writes()[0].body!), next = JSON.parse(f.writes()[1].body!);
  assert.notEqual(next.mutationId, original.mutationId); assert.equal(original.expectedVersion, 0);
  assert.equal(next.expectedVersion, 1); assert.equal(f.state.commits, 1);
});
