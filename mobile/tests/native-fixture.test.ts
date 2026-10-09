import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { createNativeFixture } from "../src/spike/native-fixture.ts";
import { handleAndroidBack } from "../src/platform/android-back.ts";

function fixture(t: { after: (cleanup: () => void) => void }) {
  const f = createNativeFixture({ latencyMs: 0 }); t.after(f.runtime.dispose); return f;
}

test("the bundled preview uses the canonical journey without an HTTP fetch or persistent account", async t => {
  const f = fixture(t); let networkCalls = 0; const original = globalThis.fetch;
  globalThis.fetch = async () => { networkCalls++; throw Error("Unexpected real network"); };
  t.after(() => { globalThis.fetch = original; });
  await f.runtime.setForeground(true);
  assert.equal(f.runtime.session.getSnapshot().phase, "signed-out");
  await f.signIn(); assert.equal(f.runtime.session.getSnapshot().account?.name, "Alex, demo member");
  const feed = f.runtime.reading.getSnapshot(); assert.equal(feed.kind, "feed");
  if (feed.kind === "feed") assert.equal(feed.feed.page.items.length, 2);
  await f.runtime.open({ kind: "post", postId: "fixture-prayer" });
  const detail = f.runtime.reading.getSnapshot(); assert.equal(detail.kind, "post");
  if (detail.kind === "post") assert.equal(detail.revealed, false);
  await f.runtime.reveal();
  assert.deepEqual(await f.runtime.signOut(), { local: "cleared", remote: "confirmed" });
  assert.equal(f.runtime.reading.getSnapshot().kind, "concealed"); assert.equal(networkCalls, 0);
  const fresh = fixture(t); await fresh.runtime.setForeground(true);
  assert.equal(fresh.runtime.session.getSnapshot().phase, "signed-out");
});

test("preview issuance accepts only its fixed fictional input", async t => {
  const f = fixture(t); await f.runtime.setForeground(true);
  assert.equal(Object.isFrozen(f.credentials), true);
  assert.equal(f.credentials.email, "demo@example.invalid");
  await f.runtime.signIn({ email: "different@example.invalid", password: "fictional-other-password" });
  assert.equal(f.runtime.session.getSnapshot().phase, "signed-out");
  assert.equal(f.runtime.session.getSnapshot().problem, "sign-in-failed");
  await f.runtime.signIn(f.credentials); assert.equal(f.runtime.session.getSnapshot().phase, "ready");
});

test("fictional password submissions use one in-flight issuance and preserve the intended post", async t => {
  const f = createNativeFixture({ latencyMs: 5 }); t.after(f.runtime.dispose);
  await f.runtime.setForeground(true);
  assert.equal(await f.runtime.open({ kind: "post", postId: "fixture-prayer" }), "sign-in-required");
  const first = f.runtime.signIn(f.credentials);
  const generation = f.runtime.session.getSnapshot().generation;
  assert.equal(f.runtime.session.getSnapshot().phase, "signing-in");
  await f.runtime.signIn({ email: "different@example.invalid", password: "fictional-other-password" });
  assert.equal(f.runtime.session.getSnapshot().generation, generation);
  assert.equal(f.runtime.session.getSnapshot().phase, "signing-in");
  await first;
  assert.equal(f.runtime.session.getSnapshot().phase, "ready");
  const reading = f.runtime.reading.getSnapshot(); assert.equal(reading.kind, "post");
  if (reading.kind === "post") { assert.equal(reading.post.id, "fixture-prayer"); assert.equal(reading.revealed, false); }
});

test("cancelling fictional password issuance cannot restore its session or retained post", async t => {
  const f = createNativeFixture({ latencyMs: 5 }); t.after(f.runtime.dispose);
  await f.runtime.setForeground(true);
  await f.runtime.open({ kind: "post", postId: "fixture-prayer" });
  const pending = f.runtime.signIn(f.credentials);
  assert.equal(f.runtime.session.getSnapshot().phase, "signing-in");
  await f.runtime.cancelSignIn(); await pending;
  assert.equal(f.runtime.session.getSnapshot().phase, "signed-out");
  assert.equal(f.runtime.reading.getSnapshot().kind, "concealed");
  await f.runtime.setForeground(false); await f.runtime.setForeground(true);
  assert.equal(f.runtime.session.getSnapshot().phase, "signed-out");
  await f.runtime.signIn(f.credentials);
  assert.equal(f.runtime.session.getSnapshot().phase, "ready");
  assert.equal(f.runtime.reading.getSnapshot().kind, "feed");
});

test("finite pages replace each other and Back reauthorizes the current page", async t => {
  const f = fixture(t); await f.runtime.setForeground(true); await f.signIn(); await f.runtime.nextPage();
  const second = f.runtime.reading.getSnapshot(); assert.equal(second.kind, "feed");
  if (second.kind === "feed") assert.deepEqual(second.feed.page.items.map(item => item.id), ["fixture-quote", "fixture-unavailable"]);
  await f.runtime.open({ kind: "post", postId: "fixture-quote" });
  let keyboard = true;
  const actions = { isKeyboardVisible: () => keyboard, dismissKeyboard: () => { keyboard = false; },
    goBack: () => {
      if (f.runtime.navigation.getSnapshot().destination?.kind !== "post") return false;
      void f.runtime.backToFeed(); return true;
    } };
  const detail = f.runtime.reading.getSnapshot();
  assert.equal(handleAndroidBack(actions), true); assert.equal(f.runtime.reading.getSnapshot(), detail);
  const ready = new Promise<void>(resolve => {
    const stop = f.runtime.reading.subscribe(() => { if (f.runtime.reading.getSnapshot().kind === "feed") { stop(); resolve(); } });
  });
  assert.equal(handleAndroidBack(actions), true); await ready;
  const restored = f.runtime.reading.getSnapshot();
  assert.equal(restored.kind, "feed");
  if (restored.kind === "feed") assert.equal(restored.feed.pageCursor, "fixture.second");
  assert.equal(handleAndroidBack(actions), false);
});

test("one-shot interrupted and empty reads use the same explicit recovery path", async t => {
  const f = fixture(t); await f.runtime.setForeground(true); await f.signIn();
  f.failNextRead(); await f.runtime.refresh(); assert.equal(f.runtime.reading.getSnapshot().kind, "error");
  await f.runtime.retry(); assert.equal(f.runtime.reading.getSnapshot().kind, "feed");
  f.emptyNextFeed(); await f.runtime.refresh();
  const empty = f.runtime.reading.getSnapshot(); assert.equal(empty.kind, "feed");
  if (empty.kind === "feed") { assert.equal(empty.feed.page.items.length, 0); assert.equal(empty.feed.page.nextCursor, null); }
  await f.runtime.refresh();
  const normal = f.runtime.reading.getSnapshot(); if (normal.kind === "feed") assert.equal(normal.feed.page.items.length, 2);
});

test("contextual demo sign-in uses the sole session navigation return and logout drops it", async t => {
  const f = fixture(t); await f.runtime.setForeground(true);
  assert.equal(await f.runtime.open({ kind: "post", postId: "fixture-prayer" }), "sign-in-required");
  await f.signIn(); assert.equal(f.runtime.reading.getSnapshot().kind, "post");
  await f.runtime.signOut(); await f.signIn(); assert.equal(f.runtime.reading.getSnapshot().kind, "feed");
});

test("backgrounding conceals and resuming verifies again; a new runtime does not inherit the fixture session", async t => {
  const f = fixture(t); await f.runtime.setForeground(true); await f.signIn();
  await f.runtime.setForeground(false); assert.equal(f.runtime.reading.getSnapshot().kind, "concealed");
  await f.runtime.setForeground(true); assert.equal(f.runtime.reading.getSnapshot().kind, "feed");
  f.runtime.dispose(); assert.equal(f.runtime.session.getSnapshot().phase, "concealed");
  const replacement = fixture(t); await replacement.runtime.setForeground(true);
  assert.equal(replacement.runtime.session.getSnapshot().phase, "signed-out");
});

test("a delayed fictional read cancels promptly when the runtime is concealed", async t => {
  const f = createNativeFixture({ latencyMs: 5 }); t.after(f.runtime.dispose);
  await f.runtime.setForeground(true); await f.signIn();
  const opening = f.runtime.open({ kind: "post", postId: "fixture-prayer" });
  await f.runtime.setForeground(false); await opening;
  assert.equal(f.runtime.reading.getSnapshot().kind, "concealed");
});


type Runtime = ReturnType<typeof createNativeFixture>["runtime"];
type Like = ReturnType<Runtime["likes"]["getSnapshot"]>;
function waitLike(runtime: Runtime, predicate: (state: Like) => boolean) {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => { stop(); reject(Error("Expected Like state was not reached")); }, 1000);
    const check = () => { if (predicate(runtime.likes.getSnapshot())) { clearTimeout(timer); stop(); resolve(); } };
    const stop = runtime.likes.subscribe(check); check();
  });
}
async function detail(runtime: Runtime, id: string) {
  await runtime.open({ kind: "post", postId: id });
  await waitLike(runtime, state => state.currentPostId === id && state.phase !== "loading");
  return runtime.likes.getSnapshot();
}

test("fictional Like receipts are reconciled once and current counts come from a new read", async t => {
  const f = fixture(t), r = f.runtime; await r.setForeground(true); await f.signIn();
  let state = await detail(r, "fixture-quote");
  assert.equal(state.liked, false); assert.equal(state.count, 0);
  f.interruptNextLikeReply(); await r.setLike(state, true);
  state = r.likes.getSnapshot(); assert.equal(state.phase, "unconfirmed");
  assert.equal(state.canChoose, false); assert.equal(state.hasPending, true);
  await r.backToFeed();
  assert.equal(r.likes.getSnapshot().currentPostId, null);
  assert.equal(r.likes.getSnapshot().canReviewPending, true);
  await r.reviewPendingLike(r.likes.getSnapshot());
  await waitLike(r, next => next.canRetry);
  state = r.likes.getSnapshot(); assert.equal(state.currentPostId, "fixture-quote");
  assert.equal(state.liked, true); assert.equal(state.count, 1);
  await r.retryLike(state);
  state = r.likes.getSnapshot(); assert.equal(state.phase, "ready");
  assert.equal(state.hasPending, false); assert.equal(state.liked, true); assert.equal(state.count, 1);
  await r.backToFeed(); await r.nextPage();
  const refreshed = r.reading.getSnapshot(); assert.equal(refreshed.kind, "feed");
  if (refreshed.kind === "feed") assert.equal(refreshed.feed.page.items.find(p => p.id === "fixture-quote")?.likeCount, 1);
  state = await detail(r, "fixture-quote");
  await r.setLike(state, false);
  state = r.likes.getSnapshot(); assert.equal(state.liked, false); assert.equal(state.count, 0);
});

test("plain repost Like uses the original while hidden counts remain hidden and quotes stay separate", async t => {
  const f = fixture(t), r = f.runtime; await r.setForeground(true); await f.signIn();
  let state = await detail(r, "fixture-repost");
  assert.equal(state.currentPostId, "fixture-repost"); assert.equal(state.count, null);
  await r.setLike(state, true);
  state = r.likes.getSnapshot(); assert.equal(state.liked, true); assert.equal(state.count, null);
  state = await detail(r, "fixture-welcome"); assert.equal(state.liked, true); assert.equal(state.count, null);
  state = await detail(r, "fixture-quote"); assert.equal(state.liked, false); assert.equal(state.count, 0);
  await r.open({ kind: "post", postId: "fixture-unavailable" });
  assert.equal(r.likes.getSnapshot().canChoose, false);
  assert.equal(r.likes.getSnapshot().liked, null);
});

type Element = { type: unknown; props: Record<string, unknown> };
type LikeButton = { label: string; disabled?: boolean; onPress(): void };
const likeCode = ts.transpileModule(readFileSync(new URL("../src/ui/NativePostLike.tsx", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 }
}).outputText;
/** Real leaf callbacks and canonical fixture runtime; no React/native rendering
 * or announcement-delivery claim is made by this descriptor harness. */
function likeUi(runtime: Runtime) {
  const pending: Promise<unknown>[] = [], cleanups: (() => void)[] = []; let activities = 0;
  const uiRuntime: Runtime = { ...runtime,
    recordForegroundActivity() { activities++; return runtime.recordForegroundActivity(); },
    setLike(...args) { const work = runtime.setLike(...args); pending.push(work); return work; },
    retryLike(...args) { const work = runtime.retryLike(...args); pending.push(work); return work; },
    refreshLike(...args) { const work = runtime.refreshLike(...args); pending.push(work); return work; },
    reviewPendingLike(...args) { const work = runtime.reviewPendingLike(...args); pending.push(work); return work; }
  };
  const jsx = (type: unknown, props: Element["props"]): Element => ({ type, props });
  const modules: Record<string, unknown> = {
    "react": { useEffect() {}, useRef: (value: unknown) => ({ current: value }),
      useLayoutEffect(work: () => () => void) { cleanups.push(work()); }, useSyncExternalStore(_subscribe: unknown, get: () => unknown) { return get(); } },
    "react/jsx-runtime": { jsx, jsxs: jsx, Fragment: "Fragment" },
    "react-native": { Platform: { OS: "ios" }, AccessibilityInfo: { announceForAccessibility() {} } },
    "./primitives": { Button: "Button", Text: "Text" }
  };
  const output: { NativePostLike?: (props: { runtime: Runtime; postId: string }) => unknown;
    NativePendingLike?: (props: { runtime: Runtime }) => unknown } = {};
  runInNewContext(likeCode, { exports: output, require(name: string) {
    assert.ok(Object.hasOwn(modules, name), "Unexpected Like UI dependency: " + name); return modules[name];
  } }, { timeout: 1000 });
  function elements(value: unknown): Element[] {
    if (Array.isArray(value)) return Array.from(value).flatMap(elements);
    if (!value || typeof value !== "object") return [];
    const element = value as Element; return [element, ...elements(element.props?.children)];
  }
  return {
    render(postId: string | null) {
      const tree = [postId ? output.NativePostLike!({ runtime: uiRuntime, postId }) : null,
        output.NativePendingLike!({ runtime: uiRuntime })];
      return { buttons: elements(tree).filter(x => x.type === "Button").map(x => x.props as unknown as LikeButton),
        text: JSON.stringify(tree) };
    },
    activities: () => activities,
    unmount() { for (const cleanup of cleanups.splice(0)) cleanup(); },
    async drain() { await Promise.all(pending.splice(0)); }
  };
}

test("Like UI shows hidden totals and rejects retained callbacks before renewing activity", async t => {
  const f = fixture(t), r = f.runtime; await r.setForeground(true); await f.signIn();
  await detail(r, "fixture-welcome"); const ui = likeUi(r); t.after(ui.unmount);
  const first = ui.render("fixture-welcome"), stale = first.buttons.find(b => b.label === "Like");
  assert.ok(stale); assert.ok(first.text.includes("Like count hidden")); assert.equal(ui.activities(), 0);
  stale.onPress(); stale.onPress(); await ui.drain();
  assert.equal(ui.activities(), 1); assert.equal(r.likes.getSnapshot().liked, true);
  assert.ok(ui.render("fixture-welcome").buttons.some(b => b.label === "Unlike"));
  await detail(r, "fixture-quote"); stale.onPress(); await ui.drain();
  assert.equal(ui.activities(), 1); assert.equal(r.likes.getSnapshot().liked, false);
  assert.equal(ui.render("fixture-welcome").text.includes("Like count hidden"), false);
  const concealStale = ui.render("fixture-quote").buttons.find(b => b.label === "Like")!;
  await r.setForeground(false); concealStale.onPress(); await ui.drain();
  assert.equal(ui.activities(), 1); assert.deepEqual(ui.render("fixture-quote").buttons, []);
});

test("Like UI offers explicit pending review and exact retry without creating a second choice", async t => {
  const f = fixture(t), r = f.runtime; await r.setForeground(true); await f.signIn();
  await detail(r, "fixture-quote"); const ui = likeUi(r); t.after(ui.unmount);
  f.interruptNextLikeReply(); ui.render("fixture-quote").buttons.find(b => b.label === "Like")!.onPress(); await ui.drain();
  let view = ui.render("fixture-quote");
  assert.equal(view.buttons.find(b => b.label === "Like")?.disabled, true);
  assert.ok(view.buttons.some(b => b.label === "Retry same Like choice"));
  await r.backToFeed();
  const review = ui.render(null).buttons.find(b => b.label === "Review pending Like choice"); assert.ok(review);
  review.onPress(); review.onPress(); await ui.drain(); await waitLike(r, s => s.canRetry);
  view = ui.render("fixture-quote");
  const retry = view.buttons.find(b => b.label === "Retry same Like choice"); assert.ok(retry);
  retry.onPress(); retry.onPress(); await ui.drain();
  assert.equal(r.likes.getSnapshot().hasPending, false); assert.equal(r.likes.getSnapshot().count, 1);
  assert.equal(ui.activities(), 3);
});


test("an unmounted Like leaf cannot dispatch or renew activity while its runtime remains ready", async t => {
  const f = fixture(t), r = f.runtime; await r.setForeground(true); await f.signIn();
  await detail(r, "fixture-quote"); const ui = likeUi(r);
  const retained = ui.render("fixture-quote").buttons.find(b => b.label === "Like")!;
  ui.unmount(); retained.onPress(); await ui.drain();
  assert.equal(ui.activities(), 0); assert.equal(r.likes.getSnapshot().liked, false);
});

test("count setting changes only personal authored totals and close reauthorizes the saved page", async t => {
  const f = fixture(t), r = f.runtime; await r.setForeground(true); await f.signIn();
  await r.startFeed("weekly"); await r.nextPage();
  await r.openReactionPreferences(r.reactionPreferences.getSnapshot());
  assert.equal(r.reading.getSnapshot().kind, "idle");
  assert.equal(r.reactionPreferences.getSnapshot().hideCounts, true);
  await r.setReactionPreferences(r.reactionPreferences.getSnapshot(), false);
  assert.equal(r.reactionPreferences.getSnapshot().hideCounts, false);
  await r.closeReactionPreferences(r.reactionPreferences.getSnapshot());
  const page = r.reading.getSnapshot(); assert.equal(page.kind, "feed");
  if (page.kind === "feed") { assert.equal(page.feed.mode, "weekly"); assert.equal(page.feed.pageCursor, "fixture.second"); }
  let state = await detail(r, "fixture-welcome"); assert.equal(state.count, 0);
  await r.setLike(state, true); state = r.likes.getSnapshot(); assert.equal(state.count, 1);
  await r.openReactionPreferences(r.reactionPreferences.getSnapshot());
  assert.equal(r.likes.getSnapshot().count, null);
  await r.setReactionPreferences(r.reactionPreferences.getSnapshot(), true);
  await r.closeReactionPreferences(r.reactionPreferences.getSnapshot());
  await waitLike(r, next => next.phase === "ready");
  assert.equal(r.likes.getSnapshot().currentPostId, "fixture-welcome"); assert.equal(r.likes.getSnapshot().count, null);
  state = await detail(r, "fixture-repost"); assert.equal(state.count, null);
  state = await detail(r, "fixture-quote"); assert.equal(state.count, 0, "Church totals remain visible.");
  state = await detail(r, "fixture-prayer"); assert.equal(state.count, null, "Another author's setting is unchanged.");
});

test("fictional interrupted preference reply keeps reading blocked until explicit exact recovery", async t => {
  const f = fixture(t), r = f.runtime; await r.setForeground(true); await f.signIn();
  await r.openReactionPreferences(r.reactionPreferences.getSnapshot());
  f.interruptNextPreferenceReply(); await r.setReactionPreferences(r.reactionPreferences.getSnapshot(), false);
  assert.equal(r.reactionPreferences.getSnapshot().canRetry, true);
  assert.equal(r.reactionPreferences.getSnapshot().canClose, false);
  await r.closeReactionPreferences(r.reactionPreferences.getSnapshot()); await r.refresh(); await r.backToFeed();
  assert.equal(await r.open({ kind: "post", postId: "fixture-welcome" }), "unavailable");
  assert.equal(r.reading.getSnapshot().kind, "idle");
  await r.refreshReactionPreferences(r.reactionPreferences.getSnapshot());
  assert.equal(r.reactionPreferences.getSnapshot().hideCounts, false);
  assert.equal(r.reactionPreferences.getSnapshot().hasPending, true, "A GET cannot settle an interrupted write.");
  await r.setForeground(false); assert.equal(r.reactionPreferences.getSnapshot().phase, "concealed");
  await r.setForeground(true); assert.equal(r.reading.getSnapshot().kind, "idle");
  assert.equal(r.reactionPreferences.getSnapshot().hasPending, true);
  await r.openReactionPreferences(r.reactionPreferences.getSnapshot());
  await r.retryReactionPreferences(r.reactionPreferences.getSnapshot());
  assert.equal(r.reactionPreferences.getSnapshot().hasPending, false);
  await r.closeReactionPreferences(r.reactionPreferences.getSnapshot());
  const feed = r.reading.getSnapshot(); assert.equal(feed.kind, "feed");
  if (feed.kind === "feed") assert.equal(feed.feed.page.items[0].likeCount, 0);
});
