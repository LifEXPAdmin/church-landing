import assert from "node:assert/strict";
import test from "node:test";
import { apiResponseExamples, examplePost } from "../../lib/platform/api-contract-examples.ts";
import type { NativeWireRequest, NativeWireResponse } from "../src/platform/request-adapter.ts";
import { createCredentialVault, type TextStore } from "../src/session/credential-vault.ts";
import { createNativeRuntime } from "../src/session/runtime.ts";

const origin = "https://fictional.example.invalid", owner = "fictional-member";
const input = { email: "fictional@example.invalid", password: "fictional password" };
const post = { kind: "post", postId: examplePost.id } as const;
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
  return { status, retryAfter, apiVersion: "1", contentType: "application/json", cacheControl: "no-store", body: JSON.stringify(value) };
}
const denied = (code: string, status: number) => response({ apiVersion: "1", error: { code, message: "Fictional failure", retryAfterSeconds: null } }, status);
function fixture(enabled = true, homeAvailable = true) {
  let nonce = 0, elapsed = 0;
  const timers = new Set<{ at: number; callback: () => void }>();
  const secret = store(), marker = store();
  const state = { requests: [] as NativeWireRequest[], signingOwner: owner, token: "a".repeat(43),
    intercept: null as ((request: NativeWireRequest) => Promise<NativeWireResponse | void>) | null };
  const vault = createCredentialVault("staging|" + origin, { secret, marker,
    randomId: () => `00000000-0000-4000-8000-${String(++nonce).padStart(12, "0")}` });
  const activity = (id: string) => ({ owner: id, legacy: false, deadline: "2026-10-07T12:01:00.000Z",
    absoluteExpiresAt: "2026-11-06T12:00:00.000Z", serverTime: "2026-10-07T12:00:00.000Z" });
  const runtime = createNativeRuntime({ configuration: { environment: "staging", origin }, vault,
    clock: { now: () => elapsed, schedule(callback, delayMs) {
      const timer = { at: elapsed + delayMs, callback }; timers.add(timer); return () => { timers.delete(timer); };
    } },
    ...(enabled ? { availability: { screens: homeAvailable ? ["home"] : [], resources: ["post"] } } : {}),
    wire: async request => {
      state.requests.push(request);
      const result = await state.intercept?.(request); if (result) return result;
      const id = request.headers["X-Expected-Account"] ?? state.signingOwner;
      const account = { state: "authenticated", account: { id, name: "Fictional Member", username: "fictional_member" } };
      const envelope = (data: unknown) => response({ apiVersion: "1", viewerId: id, data });
      if (path(request).endsWith("/auth/password")) return envelope({ tokenType: "Bearer", token: state.token, session: account, activity: activity(id) });
      if (path(request).endsWith("/session")) return envelope(account);
      if (path(request).endsWith("/session/activity")) return envelope(activity(id));
      if (path(request).endsWith("/session/logout")) return envelope({ ownerId: id, signedOut: true });
      if (path(request).endsWith("/capabilities")) return envelope({ supportedVersions: ["1"], features: [
        { name: "feed.read", available: true }, { name: "post.read", available: true }] });
      if (path(request).endsWith("/feed")) {
        const query = new URL(request.url).searchParams;
        const second = query.get("cursor") === "next.page";
        return envelope({ ...apiResponseExamples.feed.data, mode: query.get("mode"), scope: "current-scope",
          pageCursor: second ? "second.page" : "first.page",
          page: { items: [{ ...examplePost, id: second ? "second-post" : examplePost.id }], nextCursor: second ? null : "next.page" } });
      }
      if (path(request).includes("/posts/")) return envelope({ ...examplePost, body: { ...examplePost.body,
        contentNote: "Sensitive fictional topic", safeExcerpt: "A safe fictional excerpt", text: "Fresh authorized detail" } });
      throw Error("Unexpected fictional route");
    }
  });
  return { runtime, state, secret, timers,
    async signIn() { await runtime.setForeground(true); await runtime.signIn(input); },
    advance(ms: number) { elapsed += ms; },
    runDueTimers() { for (const timer of [...timers]) if (timer.at <= elapsed) { timers.delete(timer); timer.callback(); } },
    reads(suffix: string) { return state.requests.filter(r => path(r).endsWith(suffix)); },
    dispose() { runtime.dispose(); }
  };
}

test("private composition proves sign-in, bounded feed, fresh post, reveal and safe sign-out", async t => {
  const f = fixture(); t.after(f.dispose);
  assert.equal(f.state.requests.length, 0); assert.equal(f.runtime.reading.getSnapshot().kind, "concealed");
  await f.signIn();
  assert.equal(f.runtime.reading.getSnapshot().kind, "feed");
  await f.runtime.open(post);
  const detail = f.runtime.reading.getSnapshot();
  assert.equal(detail.kind, "post");
  if (detail.kind !== "post") return;
  assert.equal(detail.post.body.text, "Fresh authorized detail"); assert.equal(detail.revealed, false);
  assert.equal(detail.post.likeCount, null); assert.equal(detail.post.requiresWeb, true);
  assert.throws(() => Object.assign(detail.post.body, { text: "Changed" }));
  f.runtime.reveal(); assert.equal(f.runtime.reading.getSnapshot().kind, "post");
  assert.deepEqual(await f.runtime.signOut(), { local: "cleared", remote: "confirmed" });
  assert.deepEqual(f.runtime.reading.getSnapshot(), { kind: "concealed" });
  assert.equal(f.runtime.navigation.getSnapshot().destination, null); assert.equal(await f.secret.read(), null);
  assert.equal(f.reads("/posts/" + post.postId).length, 1);
  assert.deepEqual(Object.keys(f.runtime.session).sort(), ["getSnapshot", "subscribe"]);
});

test("next page replaces the current page and back reauthorizes the exact returned cursor and scope", async t => {
  const f = fixture(); t.after(f.dispose); await f.signIn(); await f.runtime.nextPage();
  const page = f.runtime.reading.getSnapshot();
  assert.equal(page.kind, "feed");
  if (page.kind !== "feed") return;
  assert.deepEqual(page.feed.page.items.map(item => item.id), ["second-post"]);
  let query = new URL(f.reads("/feed").at(-1)!.url).searchParams;
  assert.equal(query.get("cursor"), "next.page"); assert.equal(query.get("scope"), "current-scope");
  await f.runtime.open(post); await f.runtime.backToFeed();
  query = new URL(f.reads("/feed").at(-1)!.url).searchParams;
  assert.equal(query.get("cursor"), "second.page"); assert.equal(query.get("scope"), "current-scope");
  await f.runtime.refresh(); query = new URL(f.reads("/feed").at(-1)!.url).searchParams;
  assert.equal(query.has("cursor"), false); assert.equal(query.has("scope"), false);
});

test("missing, disabled, duplicate or incompatible capabilities cannot dispatch a content read", async t => {
  for (const capability of [
    { supportedVersions: ["1"], features: [] },
    { supportedVersions: ["1"], features: [{ name: "feed.read", available: false }] },
    { supportedVersions: ["1"], features: [{ name: "feed.read", available: true }, { name: "feed.read", available: true }] },
    { supportedVersions: ["2"], features: [{ name: "feed.read", available: true }] }
  ]) {
    const f = fixture(); t.after(f.dispose);
    f.state.intercept = async r => path(r).endsWith("/capabilities") ? response({ apiVersion: "1", viewerId: owner, data: capability }) : undefined;
    await f.signIn(); assert.equal(f.runtime.reading.getSnapshot().kind, "error"); assert.equal(f.reads("/feed").length, 0);
  }
});

test("superseded feed reads abort and late data cannot replace the current mode", async t => {
  const f = fixture(); t.after(f.dispose); await f.signIn();
  const reached = deferred(), release = deferred(); let held: NativeWireRequest | undefined;
  f.state.intercept = async r => { if (path(r).endsWith("/feed") && r.url.includes("mode=friends")) { held = r; reached.resolve(); await release.promise; } };
  const old = f.runtime.startFeed("friends"); await reached.promise;
  await f.runtime.startFeed("latest"); const current = f.runtime.reading.getSnapshot();
  assert.equal(held!.signal.aborted, true); release.resolve(); await old;
  assert.equal(f.runtime.reading.getSnapshot(), current);
});

test("route changes discard visible data before a held detail resolves", async t => {
  const f = fixture(); t.after(f.dispose); await f.signIn();
  const reached = deferred(), release = deferred();
  f.state.intercept = async r => { if (path(r).includes("/posts/")) { reached.resolve(); await release.promise; } };
  const opening = f.runtime.open(post); await reached.promise;
  assert.deepEqual(f.runtime.reading.getSnapshot(), { kind: "loading", target: "post" });
  await f.runtime.setForeground(false);
  assert.deepEqual(f.runtime.reading.getSnapshot(), { kind: "concealed" });
  release.resolve(); await opening; assert.equal(f.runtime.reading.getSnapshot().kind, "concealed");
  f.state.intercept = null; await f.runtime.setForeground(true);
  assert.equal(f.runtime.reading.getSnapshot().kind, "feed");
});

test("confirmed current read rejection routes through session authority and clears its exact candidate", async t => {
  const f = fixture(); t.after(f.dispose); await f.signIn();
  f.state.intercept = async r => path(r).includes("/posts/") ? denied("unauthenticated", 401) : undefined;
  await f.runtime.open(post);
  assert.equal(f.runtime.session.getSnapshot().phase, "signed-out"); assert.equal(await f.secret.read(), null);
  assert.equal(f.runtime.navigation.getSnapshot().destination, null); assert.equal(f.runtime.reading.getSnapshot().kind, "concealed");
});

test("lost reads conceal old content, retain no raw error, and retry only on explicit request", async t => {
  const f = fixture(); t.after(f.dispose); await f.signIn();
  f.state.intercept = async r => { if (path(r).endsWith("/feed")) throw Error("private response body " + input.password); };
  await f.runtime.refresh(); const error = f.runtime.reading.getSnapshot();
  assert.deepEqual(error, { kind: "error", target: "feed", problem: "unavailable", retryAfterSeconds: null });
  assert.equal(f.reads("/feed").length, 2); assert.equal(f.runtime.session.getSnapshot().phase, "ready");
  f.state.intercept = null; await f.runtime.retry();
  assert.equal(f.reads("/feed").length, 3); assert.equal(f.runtime.reading.getSnapshot().kind, "feed");
});

test("canonical cursor recovery and rate-limit hints remain bounded explicit UI states", async t => {
  const f = fixture(); t.after(f.dispose); await f.signIn();
  f.state.intercept = async r => path(r).endsWith("/feed") ? denied("cursor_invalid", 409) : undefined;
  await f.runtime.nextPage(); assert.deepEqual(f.runtime.reading.getSnapshot(), { kind: "error", target: "feed", problem: "refresh-required", retryAfterSeconds: null });
  f.state.intercept = async r => path(r).endsWith("/feed") ? { ...denied("rate_limited", 429), retryAfter: "9" } : undefined;
  await f.runtime.refresh(); assert.deepEqual(f.runtime.reading.getSnapshot(), { kind: "error", target: "feed", problem: "rate-limited", retryAfterSeconds: 9 });
});

test("wrong post identity and oversized feed cardinality never become readable state", async t => {
  const f = fixture(); t.after(f.dispose); await f.signIn();
  f.state.intercept = async r => path(r).includes("/posts/") ? response({ apiVersion: "1", viewerId: owner, data: { ...examplePost, id: "different-post" } }) : undefined;
  await f.runtime.open(post); assert.equal(f.runtime.reading.getSnapshot().kind, "error");
  f.state.intercept = async r => path(r).endsWith("/feed") ? response({ ...apiResponseExamples.feed,
    data: { ...apiResponseExamples.feed.data, page: { items: Array(31).fill(examplePost), nextCursor: null } } }) : undefined;
  await f.runtime.refresh(); assert.equal(f.runtime.reading.getSnapshot().kind, "error");
});

test("late old rejection and detached logout cannot erase a new owner or substitute the revocation client", async t => {
  const f = fixture(); t.after(f.dispose); await f.signIn();
  const reached = deferred(), release = deferred();
  f.state.intercept = async r => { if (path(r).includes("/posts/")) { reached.resolve(); await release.promise; return denied("account_changed", 401); } };
  const old = f.runtime.open(post); await reached.promise;
  await f.runtime.signOut(); f.state.signingOwner = "second-account"; f.state.token = "b".repeat(43);
  await f.runtime.signIn(input); const current = f.runtime.reading.getSnapshot();
  release.resolve(); await old;
  assert.equal(f.runtime.session.getSnapshot().account?.id, "second-account"); assert.equal(f.runtime.reading.getSnapshot(), current);
  assert.equal(f.reads("/feed").at(-1)!.headers["X-Expected-Account"], "second-account");
  assert.equal(f.reads("/feed").at(-1)!.headers.Authorization, "Bearer " + "b".repeat(43));
});

test("deadline expiry and reentrant disposal prevent further private reads", async t => {
  const f = fixture(); t.after(f.dispose); await f.signIn(); f.advance(60001);
  assert.equal(f.runtime.reading.getSnapshot().kind, "concealed");
  const g = fixture(); t.after(g.dispose); await g.signIn(); const count = g.state.requests.length;
  g.runtime.reading.subscribe(() => { if (g.runtime.reading.getSnapshot().kind === "loading") g.runtime.dispose(); });
  await g.runtime.refresh();
  assert.equal(g.state.requests.length, count); assert.equal(g.runtime.reading.getSnapshot().kind, "concealed");
});

test("unimplemented renderers do not activate reads even with a verified account", async t => {
  const f = fixture(false); t.after(f.dispose); await f.signIn();
  assert.equal(f.runtime.session.getSnapshot().phase, "ready"); assert.equal(f.reads("/feed").length, 0);
  assert.equal(await f.runtime.open(post), "unavailable"); assert.equal(f.reads("/posts/" + post.postId).length, 0);
});

test("feed mode and continuation scope must match the original request", async t => {
  for (const mismatch of ["mode", "scope"]) {
    const f = fixture(); t.after(f.dispose); await f.signIn();
    f.state.intercept = async r => path(r).endsWith("/feed") ? response({ ...apiResponseExamples.feed,
      data: { ...apiResponseExamples.feed.data, mode: mismatch === "mode" ? "friends" : "latest",
        scope: mismatch === "scope" ? "foreign-scope" : "current-scope" } }) : undefined;
    await f.runtime.nextPage();
    assert.equal(f.runtime.reading.getSnapshot().kind, "error", mismatch);
  }
});

test("one visible recheck reauthorizes the same page without renewing the session", async t => {
  const f = fixture(); t.after(f.dispose); await f.signIn();
  assert.equal(f.timers.size, 2, "One session expiry timer and one visible recheck");
  const reached = deferred(), release = deferred();
  f.state.intercept = async r => { if (path(r).endsWith("/feed")) { reached.resolve(); await release.promise; } };
  f.advance(30001);
  assert.equal(f.runtime.reading.getSnapshot().kind, "idle", "An overdue timer cannot preserve rendered content");
  f.runDueTimers(); await reached.promise;
  assert.equal(f.runtime.reading.getSnapshot().kind, "loading");
  const query = new URL(f.reads("/feed").at(-1)!.url).searchParams;
  assert.equal(query.get("cursor"), "first.page"); assert.equal(query.get("scope"), "current-scope");
  assert.equal(f.reads("/session/activity").filter(r => r.method === "POST").length, 0);
  release.resolve();
  await new Promise<void>(resolve => {
    const stop = f.runtime.reading.subscribe(() => { if (f.runtime.reading.getSnapshot().kind === "feed") { stop(); resolve(); } });
  });
  assert.equal(f.timers.size, 2);
});

test("failed visible recheck stops without an automatic error retry or retained body", async t => {
  const f = fixture(); t.after(f.dispose); await f.signIn();
  f.state.intercept = async r => path(r).endsWith("/feed") ? denied("not_found", 404) : undefined;
  const failed = new Promise<void>(resolve => {
    const stop = f.runtime.reading.subscribe(() => { if (f.runtime.reading.getSnapshot().kind === "error") { stop(); resolve(); } });
  });
  f.advance(30001); f.runDueTimers(); await failed;
  assert.equal(f.runtime.reading.getSnapshot().kind, "error"); assert.equal(f.timers.size, 1);
  assert.equal(f.reads("/feed").length, 2);
  await f.runtime.setForeground(false); assert.equal(f.timers.size, 0);
});

test("old same-account 401 cannot clear a replacement session and no cursor survives logout", async t => {
  const f = fixture(); t.after(f.dispose); await f.signIn(); await f.runtime.nextPage();
  const reached = deferred(), release = deferred();
  f.state.intercept = async r => { if (path(r).includes("/posts/")) { reached.resolve(); await release.promise; return denied("unauthenticated", 401); } };
  const old = f.runtime.open(post); await reached.promise;
  await f.runtime.signOut(); f.state.token = "b".repeat(43); await f.runtime.signIn(input);
  const current = f.runtime.reading.getSnapshot(); release.resolve(); await old;
  assert.equal(f.runtime.reading.getSnapshot(), current); assert.ok((await f.secret.read())?.includes(f.state.token));
  assert.equal(new URL(f.reads("/feed").at(-1)!.url).searchParams.has("cursor"), false);
});

test("ignored sign-in and verification commands cannot trigger extra reads in a ready session", async t => {
  const f = fixture(); t.after(f.dispose); await f.signIn(); const count = f.state.requests.length;
  await f.runtime.signIn(input); await f.runtime.retryVerification();
  assert.equal(f.state.requests.length, count);
});

test("a newer feed choice during account publication survives verification completion", async t => {
  const f = fixture(); t.after(f.dispose); let newer: Promise<void> | undefined, changed = false;
  f.runtime.session.subscribe(() => {
    if (!changed && f.runtime.session.getSnapshot().phase === "ready") { changed = true; newer = f.runtime.startFeed("friends"); }
  });
  await f.signIn(); await newer;
  const state = f.runtime.reading.getSnapshot(); assert.equal(state.kind, "feed");
  if (state.kind === "feed") assert.equal(state.feed.mode, "friends");
});

test("a newer route selected inside a navigation publication wins over the outer feed command", async t => {
  const f = fixture(); t.after(f.dispose); await f.signIn(); let newer: Promise<unknown> | undefined, changed = false;
  f.runtime.reading.subscribe(() => {
    if (!changed && f.runtime.reading.getSnapshot().kind === "idle") { changed = true; newer = f.runtime.open(post); }
  });
  await f.runtime.startFeed("friends"); await newer;
  assert.deepEqual(f.runtime.navigation.getSnapshot().destination, post);
  assert.equal(f.runtime.reading.getSnapshot().kind, "post");
});

test("expiry concealment cannot let an outer clear cancel a newer post read", async t => {
  const f = fixture(); t.after(f.dispose); await f.signIn(); f.advance(30001);
  let newer: Promise<unknown> | undefined, changed = false;
  f.runtime.reading.subscribe(() => {
    if (!changed && f.runtime.reading.getSnapshot().kind === "idle") { changed = true; newer = f.runtime.open(post); }
  });
  await f.runtime.open({ kind: "screen", screen: "home" }); await newer;
  assert.deepEqual(f.runtime.navigation.getSnapshot().destination, post);
  assert.equal(f.runtime.reading.getSnapshot().kind, "post");
});

test("ignored destinations cannot suppress the initial verified feed read", async t => {
  const f = fixture(); t.after(f.dispose); let ignored: Promise<unknown> | undefined;
  f.runtime.session.subscribe(() => {
    if (f.runtime.session.getSnapshot().phase === "ready") ignored = f.runtime.open({ kind: "screen", screen: "messages" });
  });
  await f.signIn(); assert.equal(await ignored, "unavailable");
  assert.equal(f.runtime.reading.getSnapshot().kind, "feed");
});

test("unavailable Home commands cannot suppress a verified contextual post read", async t => {
  const f = fixture(true, false); t.after(f.dispose); await f.runtime.setForeground(true); await f.runtime.open(post);
  let ignored: Promise<void> | undefined;
  f.runtime.session.subscribe(() => {
    if (f.runtime.session.getSnapshot().phase === "ready") ignored = f.runtime.startFeed("latest");
  });
  await f.runtime.signIn(input); await ignored;
  assert.deepEqual(f.runtime.navigation.getSnapshot().destination, post);
  assert.equal(f.runtime.reading.getSnapshot().kind, "post");
});
