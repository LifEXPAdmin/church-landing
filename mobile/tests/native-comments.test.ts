import assert from "node:assert/strict";
import test from "node:test";
import { RequestClientError, type ApiComment, type ApiResponse } from "@godschurches/shared-core";
import { apiResponseExamples, examplePost } from "../../lib/platform/api-contract-examples.ts";
import { createNativeCommentController, type CommentSnapshot, type NativeCommentReadPort } from "../src/reading/comment-controller.ts";
import { createNativeReadController, type ReadingSnapshot } from "../src/reading/read-controller.ts";
import type { SessionSnapshot } from "../src/session/session-controller.ts";

type Query = Parameters<NativeCommentReadPort["comments"]>[2];
type Response = ApiResponse<"comments">;
const owner = "fictional-member";
const row = (id = "root", rootId: string | null = null): ApiComment => ({
  id, rootId, parentId: rootId, createdAt: "2026-10-07T00:00:00.000Z", replyCount: rootId ? 0 : 2,
  available: true, requiresWeb: false, content: "Fictional comment " + id, author: examplePost.author,
  version: 1, editedAt: null, prayerUpdateKind: null, isPostAuthor: false, replyTo: null,
  mentions: [], likeCount: null, ownReaction: null, canReply: false, canEdit: false, canDelete: false
});
function response(postId = examplePost.id, query: Query = { view: "roots", sort: "oldest", rootId: null, commentId: null, cursor: null }): Response {
  const rootId = query.rootId ?? "root", root = row(rootId);
  return { apiVersion: "1", viewerId: owner, data: { ...apiResponseExamples.comments.data, postId, sort: query.sort,
    items: query.view === "roots" ? [root] : [row("reply", rootId)],
    root: query.view === "roots" ? null : root,
    target: query.view === "context" ? row(query.commentId!, rootId) : null
  } };
}
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function authority() {
  const accounts = new Set<() => void>(), readings = new Set<() => void>();
  let account: SessionSnapshot = { generation: 1, foreground: true, phase: "ready",
    account: { id: owner, name: "Fictional member", username: "fictional_member" }, problem: null, cleanup: null, revocation: "none" };
  let detail: ReadingSnapshot = { kind: "idle" };
  const rejections: Array<{ error: unknown; owner: string; generation: number }> = [];
  const session = {
    getSnapshot: () => account,
    subscribe(listener: () => void) { accounts.add(listener); return () => { accounts.delete(listener); }; },
    async reportReadRejection(error: unknown, id: string, generation: number) {
      rejections.push({ error, owner: id, generation });
      if (account.account?.id === id && account.generation === generation) setAccount({ phase: "signed-out", account: null, generation: generation + 1 });
    }
  };
  const reading = {
    getSnapshot: () => detail,
    subscribe(listener: () => void) { readings.add(listener); return () => { readings.delete(listener); }; }
  };
  function setAccount(change: Partial<SessionSnapshot>) { account = { ...account, ...change }; for (const fn of accounts) fn(); }
  function setReading(next: ReadingSnapshot) { detail = next; for (const fn of readings) fn(); }
  function open(post = examplePost, revealed = false) { setReading({ kind: "post", post, revealed }); }
  return { session, reading, setAccount, setReading, open, rejections, accounts, readings };
}
function fixture(t: { after(cleanup: () => void): void }) {
  const a = authority();
  const calls: Array<{ owner: string; postId: string; query: Query; signal: AbortSignal }> = [];
  const capabilities: AbortSignal[] = [];
  const state = {
    capability: { apiVersion: "1", viewerId: owner, data: { supportedVersions: ["1"], features: [{ name: "comments.read", available: true }] } } as ApiResponse<"capabilities">,
    beforeCapabilities: null as null | (() => Promise<void>),
    reply: (postId: string, query: Query): Promise<Response> => Promise.resolve(response(postId, query))
  };
  const client: NativeCommentReadPort = {
    async capabilities(_owner, signal) { capabilities.push(signal!); await state.beforeCapabilities?.(); return state.capability; },
    comments(id, postId, query, signal) { calls.push({ owner: id, postId, query, signal }); return state.reply(postId, query); }
  };
  const comments = createNativeCommentController(a.session, a.reading, client); t.after(comments.dispose);
  return { ...a, calls, capabilities, state, client, comments,
    async roots(sort: "oldest" | "newest" = "oldest") { await comments.openRoots(comments.getSnapshot(), sort); return comments.getSnapshot(); }
  };
}
function ready(f: ReturnType<typeof fixture>) {
  const state = f.comments.getSnapshot(); assert.equal(state.phase, "ready");
  if (state.phase !== "ready") throw Error("Expected fictional comments");
  return state;
}

test("comment reads are explicit and need a current authorized detail, not a revealed body", async t => {
  const f = fixture(t);
  await f.roots(); assert.equal(f.calls.length, 0); assert.equal(f.capabilities.length, 0);
  f.open({ ...examplePost, body: { ...examplePost.body, contentNote: "Fictional note" } }, false);
  assert.equal(f.comments.getSnapshot().phase, "idle"); assert.equal(f.capabilities.length, 0);
  await f.roots(); const before = ready(f);
  const detail = f.reading.getSnapshot(); assert.equal(detail.kind, "post");
  if (detail.kind === "post") f.setReading({ ...detail, revealed: true });
  assert.equal(f.comments.getSnapshot(), before, "Reveal keeps the exact parent response");
  assert.equal(f.calls.length, 1); assert.equal(f.calls[0].owner, owner);
  assert.equal(Object.isFrozen(before.thread.items[0]), true);
});

test("plain reposts read the permitted source while quote comments remain on the quote", async t => {
  const f = fixture(t);
  for (const kind of ["PLAIN", "QUOTE"] as const) {
    f.open({ ...examplePost, id: "wrapper", repost: { kind, source: { ...examplePost, id: "original" } } });
    await f.roots(); assert.equal(ready(f).postId, kind === "PLAIN" ? "original" : "wrapper");
  }
  f.open({ ...examplePost, repost: { kind: "PLAIN", source: null } });
  await f.roots(); assert.equal(f.calls.length, 2); assert.equal(f.comments.getSnapshot().postId, null);
});

test("pages replace rows and sort or refresh reset the cursor without retaining earlier bodies", async t => {
  const f = fixture(t); f.open();
  f.state.reply = async (id, query) => ({ ...response(id, query), data: { ...response(id, query).data,
    items: Array.from({ length: 20 }, (_, n) => row((query.cursor ? "second-" : "first-") + n)), nextCursor: query.cursor ? null : "opaque-bound-cursor" } });
  await f.roots(); await f.comments.nextPage(ready(f));
  const second = ready(f); assert.equal(second.thread.items.length, 20);
  assert.equal(JSON.stringify(second).includes("first-"), false);
  assert.equal(f.calls.at(-1)!.query.cursor, "opaque-bound-cursor");
  await f.comments.openRoots(second, "newest");
  assert.deepEqual(f.calls.at(-1)!.query, { view: "roots", sort: "newest", rootId: null, commentId: null, cursor: null });
  await f.comments.nextPage(ready(f)); await f.comments.refresh(ready(f));
  assert.equal(f.calls.at(-1)!.query.sort, "newest"); assert.equal(f.calls.at(-1)!.query.cursor, null);
  f.comments.close(ready(f)); assert.deepEqual(f.comments.getSnapshot(), { phase: "idle", postId: examplePost.id });
});

test("unavailable roots still open permitted replies without granting comment write authority", async t => {
  const f = fixture(t); f.open();
  f.state.reply = async (id, query) => {
    const result = response(id, query);
    const hidden: ApiComment = { id: "root", rootId: null, parentId: null, createdAt: "2026-10-07T00:00:00.000Z", replyCount: 2, available: false };
    if (query.view === "roots") result.data.items = [hidden]; else result.data.root = hidden;
    return result;
  };
  await f.roots(); const first = ready(f);
  await f.comments.openReplies(first, "not-on-this-page"); assert.equal(f.calls.length, 1);
  await f.comments.openReplies(first, "root");
  assert.equal(ready(f).thread.root?.available, false); assert.equal(ready(f).thread.items[0].available, true);
  assert.deepEqual(f.calls.at(-1)!.query, { view: "replies", sort: "oldest", rootId: "root", commentId: null, cursor: null });
  assert.equal(Object.keys(f.comments).some(name => /write|like|delete|edit|pin/i.test(name)), false);
});

test("context keeps the exact separate target and never recasts its cursor as a replies cursor", async t => {
  const f = fixture(t); f.open();
  f.state.reply = async (id, query) => ({ ...response(id, query), data: { ...response(id, query).data,
    pinned: row("other-root"), nextCursor: query.cursor ? null : "context-cursor" } });
  await f.comments.openContext(f.comments.getSnapshot(), "target-after-page");
  const current = ready(f); assert.equal(current.thread.target?.id, "target-after-page");
  assert.equal(current.thread.items.some(item => item.id === "target-after-page"), false);
  assert.equal(current.thread.pinned?.id, "other-root");
  await f.comments.nextPage(current);
  assert.deepEqual(f.calls.at(-1)!.query, { view: "context", sort: "oldest", rootId: null, commentId: "target-after-page", cursor: "context-cursor" });
  await f.comments.openReplies(ready(f), "root");
  assert.equal(f.calls.at(-1)!.query.view, "replies"); assert.equal(f.calls.at(-1)!.query.cursor, null);
});

test("wrong owner, post, sort, root, target, row relationships and duplicate rows never publish", async t => {
  const changes: Array<{ view: "roots" | "replies" | "context"; change(result: Response): void }> = [
    { view: "roots", change: r => { r.viewerId = "other-member"; } },
    { view: "roots", change: r => { r.data.postId = "other-post"; } },
    { view: "roots", change: r => { r.data.sort = "newest"; } },
    { view: "roots", change: r => { r.data.root = row(); } },
    { view: "roots", change: r => { r.data.target = row(); } },
    { view: "roots", change: r => { r.data.items = [row("reply", "root")]; } },
    { view: "roots", change: r => { r.data.items = [row(), row()]; } },
    { view: "replies", change: r => { r.data.root = row("different-root"); } },
    { view: "replies", change: r => { r.data.target = row("unexpected-target", "root"); } },
    { view: "context", change: r => { r.data.target = row("wrong-target", "root"); } },
    { view: "context", change: r => { r.data.target = row("target", "other-root"); } },
    { view: "context", change: r => { r.data.root = null; } },
    { view: "context", change: r => { r.data.root = row("root", "another-root"); } },
    { view: "context", change: r => { r.data.items = [row("reply", "wrong-root")]; } }
  ];
  for (const item of changes) {
    const f = fixture(t); f.open();
    if (item.view === "replies") await f.roots();
    f.state.reply = async (id, query) => { const result = response(id, query); item.change(result); return result; };
    if (item.view === "replies") await f.comments.openReplies(ready(f), "root");
    else if (item.view === "context") await f.comments.openContext(f.comments.getSnapshot(), "target");
    else await f.roots();
    const state = f.comments.getSnapshot(); assert.equal(state.phase, "error");
    if (state.phase === "error") assert.equal(state.problem, "unavailable");
    assert.equal("thread" in state, false);
  }
});

test("the canonical decoder strips unavailable body additions and rejects unbounded pages", async t => {
  const f = fixture(t); f.open();
  f.state.reply = async (id, query) => ({ ...response(id, query), data: { ...response(id, query).data,
    items: [{ ...row(), available: false, content: "never display this hidden addition" } as ApiComment] } });
  await f.roots(); assert.equal(JSON.stringify(ready(f)).includes("never display"), false);
  f.state.reply = async (id, query) => ({ ...response(id, query), data: { ...response(id, query).data,
    items: Array.from({ length: 21 }, (_, i) => row("too-many-" + i)) } });
  await f.comments.refresh(ready(f)); assert.equal(f.comments.getSnapshot().phase, "error");
});

test("only one available capability for the supported version permits a read", async t => {
  for (const features of [[], [{ name: "comments.read", available: false }],
    [{ name: "comments.read", available: true }, { name: "comments.read", available: true }]]) {
    const f = fixture(t); f.open(); f.state.capability.data.features = features; await f.roots();
    const state = f.comments.getSnapshot(); assert.equal(state.phase, "error");
    if (state.phase === "error") assert.equal(state.problem, "feature-unavailable");
    assert.equal(f.calls.length, 0);
  }
  const f = fixture(t); f.open(); f.state.capability.data.supportedVersions = ["2"];
  await f.roots(); const update = f.comments.getSnapshot();
  if (update.phase !== "error") throw Error("Expected unsupported version");
  assert.equal(update.problem, "update-required"); assert.equal(f.calls.length, 0);
  f.state.capability.viewerId = "other-member"; await f.comments.refresh(update);
  assert.equal(f.calls.length, 0);
});

test("concealment, navigation, close and disposal abort held reads and drop late responses", async t => {
  for (const action of ["conceal", "navigate", "close", "dispose"] as const) {
    const f = fixture(t); f.open(); const held = deferred<Response>(), reached = deferred<void>();
    f.state.reply = () => { reached.resolve(); return held.promise; };
    const work = f.roots(); await reached.promise;
    const loading = f.comments.getSnapshot(); assert.equal(loading.phase, "loading");
    if (action === "conceal") f.setAccount({ foreground: false, phase: "concealed", generation: 2, account: null });
    if (action === "navigate") f.setReading({ kind: "idle" });
    if (action === "close") f.comments.close(loading);
    if (action === "dispose") f.comments.dispose();
    const after = f.comments.getSnapshot(); assert.equal(f.calls[0].signal.aborted, true);
    held.resolve(response()); await work;
    assert.equal(f.comments.getSnapshot(), after); assert.equal("thread" in after, false);
  }
});

test("late capability results cannot dispatch after an account replacement or route change", async t => {
  for (const replace of [false, true]) {
    const f = fixture(t); f.open(); const held = deferred<void>(); f.state.beforeCapabilities = () => held.promise;
    const work = f.roots();
    if (replace) f.setAccount({ generation: 2, account: { id: "other-member", name: "Other", username: "other" } });
    else f.setReading({ kind: "loading", target: "post" });
    held.resolve(); await work;
    assert.equal(f.capabilities[0].aborted, true); assert.equal(f.calls.length, 0);
  }
});

test("A to B to A generations and a same-ID parent replacement invalidate retained actions", async t => {
  const f = fixture(t); f.open(); await f.roots(); const before = ready(f);
  f.setAccount({ generation: 2, account: { id: "other-member", name: "Other", username: "other" } });
  f.setAccount({ generation: 3, account: { id: owner, name: "Fictional member", username: "fictional_member" } });
  await f.comments.openRoots(before); await f.comments.nextPage(before); await f.comments.openContext(before, "target");
  await f.comments.openReplies(before, "root"); await f.comments.refresh(before); await f.comments.retry(before); f.comments.close(before);
  assert.equal(f.calls.length, 1);
  await f.roots(); const current = ready(f);
  f.open({ ...examplePost });
  assert.equal(f.comments.getSnapshot().phase, "idle");
  await f.comments.openRoots(current); assert.equal(f.calls.length, 2);
});

test("a getter-triggered session expiry conceals before returning previously visible comments", async t => {
  const f = fixture(t); f.open(); await f.roots();
  const get = f.reading.getSnapshot;
  f.reading.getSnapshot = () => { f.setAccount({ phase: "unavailable", generation: 2, account: null }); return get(); };
  assert.equal(f.comments.getSnapshot().phase, "concealed");
  assert.equal("thread" in f.comments.getSnapshot(), false);
});

test("real parent read freshness clears selection and requires explicit reopening after its passive recheck", async t => {
  const a = authority(); let elapsed = 0, calls = 0;
  const timers = new Set<{ at: number; callback: () => void }>();
  const capabilities = async (): Promise<ApiResponse<"capabilities">> => ({ apiVersion: "1", viewerId: owner,
    data: { supportedVersions: ["1"], features: ["post.read", "comments.read"].map(name => ({ name, available: true })) } });
  const reading = createNativeReadController(a.session, {
    capabilities, feed: async () => apiResponseExamples.feed,
    post: async () => ({ apiVersion: "1", viewerId: owner, data: { ...examplePost } })
  }, { now: () => elapsed, schedule(callback, delay) { const timer = { at: elapsed + delay, callback }; timers.add(timer); return () => { timers.delete(timer); }; } });
  const comments = createNativeCommentController(a.session, reading, { capabilities,
    async comments(_owner, id, query) { calls++; return response(id, query); } });
  t.after(() => { comments.dispose(); reading.dispose(); });
  await reading.openPost(examplePost.id);
  await comments.openContext(comments.getSnapshot(), "target");
  assert.equal(comments.getSnapshot().phase, "ready");
  elapsed = 30000;
  assert.equal(comments.getSnapshot().phase, "idle", "Getter enforces expiry even before the timer fires");
  for (const timer of [...timers]) if (timer.at <= elapsed) { timers.delete(timer); timer.callback(); }
  await new Promise<void>(resolve => setImmediate(resolve));
  assert.equal(reading.getSnapshot().kind, "post"); assert.equal(comments.getSnapshot().phase, "idle"); assert.equal(calls, 1);
  await comments.openRoots(comments.getSnapshot());
  const fresh = comments.getSnapshot(); assert.equal(fresh.phase, "ready");
  if (fresh.phase === "ready") assert.deepEqual(fresh.query, { view: "roots", sort: "oldest", rootId: null, commentId: null, cursor: null });
});

test("confirmed errors retain only generic status and invalid cursors require a fresh page", async t => {
  const pairs = [["not_found", 404, "not-found"], ["forbidden", 403, "not-found"], ["cursor_invalid", 409, "refresh-required"],
    ["conflict", 409, "refresh-required"], ["recovery_required", 409, "recovery-required"],
    ["unsupported_version", 426, "update-required"], ["feature_unavailable", 503, "feature-unavailable"], ["rate_limited", 429, "rate-limited"]] as const;
  for (const [code, status, expected] of pairs) {
    const f = fixture(t); f.open();
    f.state.reply = async (id, query) => ({ ...response(id, query), data: { ...response(id, query).data, nextCursor: "cursor" } });
    await f.roots();
    f.state.reply = async () => { throw new RequestClientError(status, "private server diagnostics", 25, false, code, true, true); };
    await f.comments.nextPage(ready(f)); const failed = f.comments.getSnapshot();
    assert.equal(failed.phase, "error"); if (failed.phase !== "error") throw Error("Expected generic error");
    assert.equal(failed.problem, expected); assert.equal(failed.retryAfterSeconds, 25);
    assert.equal(JSON.stringify(failed).includes("private server"), false); assert.equal("thread" in failed, false);
    const before = f.calls.length; await f.comments.retry(failed);
    assert.equal(f.calls.length, before + (code === "rate_limited" ? 1 : 0));
    f.state.reply = async (id, query) => response(id, query);
    await f.comments.refresh(f.comments.getSnapshot()); assert.equal(f.calls.at(-1)!.query.cursor, null);
  }
});

test("an earlier parent subscriber cannot see or refresh old comments during getter expiry", async t => {
  const a = authority(); let elapsed = 0, capabilities = 0;
  const client = {
    async capabilities(): Promise<ApiResponse<"capabilities">> { capabilities++; return { apiVersion: "1", viewerId: owner,
      data: { supportedVersions: ["1"], features: ["post.read", "comments.read"].map(name => ({ name, available: true })) } }; },
    feed: async () => apiResponseExamples.feed,
    post: async () => ({ apiVersion: "1" as const, viewerId: owner, data: { ...examplePost } })
  };
  const reading = createNativeReadController(a.session, client, { now: () => elapsed, schedule: () => () => {} });
  let comments: ReturnType<typeof createNativeCommentController> | null = null;
  let observed: CommentSnapshot | undefined;
  let retained: CommentSnapshot | null = null;
  let attempted: Promise<void> | undefined;
  const unsubscribe = reading.subscribe(() => {
    if (elapsed && comments && retained) {
      observed = comments.getSnapshot();
      attempted = comments.refresh(retained);
    }
  });
  comments = createNativeCommentController(a.session, reading, { capabilities: client.capabilities,
    async comments(_owner, id, query) { return response(id, query); } });
  t.after(() => { unsubscribe(); comments?.dispose(); reading.dispose(); });
  await reading.openPost(examplePost.id); await comments.openRoots(comments.getSnapshot());
  retained = comments.getSnapshot(); assert.equal(retained.phase, "ready"); const before = capabilities;
  elapsed = 30000; const after = comments.getSnapshot(); await attempted;
  assert.equal(after.phase, "idle"); assert.equal("thread" in observed!, false);
  assert.equal(capabilities, before, "A reentrant callback must not dispatch while authority is unresolved");
});

test("confirmed current session rejection goes through existing authority; a late rejection cannot sign out its replacement", async t => {
  for (const late of [false, true]) {
    const f = fixture(t); f.open(); const held = deferred<Response>(), reached = deferred<void>();
    f.state.reply = () => { reached.resolve(); return held.promise; };
    const work = f.roots(); await reached.promise;
    if (late) f.setAccount({ generation: 2 });
    held.reject(new RequestClientError(401, "private rejection", undefined, false, "account_changed", true, true));
    await work;
    assert.equal(f.rejections.length, late ? 0 : 1);
    assert.equal(f.comments.getSnapshot().phase, late ? "idle" : "concealed");
  }
});

test("duplicate actions from the loading or previous snapshot never overlap a read", async t => {
  const f = fixture(t); f.open(); const held = deferred<Response>(), reached = deferred<void>();
  f.state.reply = () => { reached.resolve(); return held.promise; };
  const before = f.comments.getSnapshot(), work = f.comments.openRoots(before); await reached.promise;
  await f.comments.openRoots(before); await f.comments.openContext(before, "target");
  await f.comments.openRoots(f.comments.getSnapshot()); await f.comments.openContext(f.comments.getSnapshot(), "target");
  assert.equal(f.calls.length, 1); held.resolve(response()); await work;
  await f.comments.openRoots(before); assert.equal(f.calls.length, 1);
});

test("disposal unsubscribes authorities and throwing subscribers cannot prevent concealment", async t => {
  const f = fixture(t); f.open(); await f.roots();
  f.comments.subscribe(() => { throw Error("Fictional subscriber failure"); });
  f.setAccount({ foreground: false }); assert.equal(f.comments.getSnapshot().phase, "concealed");
  f.comments.dispose(); assert.equal(f.accounts.size, 0); assert.equal(f.readings.size, 0);
  f.setAccount({ foreground: true }); f.open(); await f.roots(); assert.equal(f.calls.length, 1);
});

test("getter-triggered disposal cannot recreate a view and subscribers observe settled snapshots", async t => {
  const f = fixture(t), observed: CommentSnapshot[] = [];
  f.comments.subscribe(() => { observed.push(f.comments.getSnapshot()); });
  f.open(); assert.equal(observed.at(-1)?.phase, "idle"); await f.roots();
  assert.equal(observed.at(-1)?.phase, "ready");
  const get = f.reading.getSnapshot;
  f.reading.getSnapshot = () => { f.comments.dispose(); return get(); };
  assert.equal(f.comments.getSnapshot().phase, "concealed");
  assert.equal(observed.at(-1)?.phase, "concealed", "Mounted subscribers must receive the final concealment before removal");
  await f.comments.openRoots(observed.at(-1)!); assert.equal(f.calls.length, 1);
  assert.equal(f.accounts.size, 0); assert.equal(f.readings.size, 0);
});
