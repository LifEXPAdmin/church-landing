import assert from "node:assert/strict";
import test from "node:test";
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
  await f.runtime.signIn({ email: "different@example.invalid", password: "fictional-other-password" });
  assert.equal(f.runtime.session.getSnapshot().phase, "signed-out");
  assert.equal(f.runtime.session.getSnapshot().problem, "sign-in-failed");
  await f.signIn(); assert.equal(f.runtime.session.getSnapshot().phase, "ready");
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
