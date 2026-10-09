import assert from "node:assert/strict";
import test from "node:test";
import { clientHarness, nodes } from "./fixtures/client-hook-harness.mjs";
const source = "components/platform/exchange-need-posts.tsx";
function model(t, initialFocus = true, hold = false) {
  const window = new EventTarget(),
    document = new EventTarget();
  const state = {
    focused: initialFocus,
    reads: 0,
    timer: null,
    refreshes: 0,
    hold,
    release: null,
  };
  document.visibilityState = "visible";
  document.hasFocus = () => state.focused;
  window.location = { reload() {} };
  const data = {
    ownerId: "owner-a",
    postsListingId: "listing-a",
    postsNeedId: "need-a",
    postsNeedVersion: 3,
    postsCanLink: true,
    posts: [
      {
        id: "post-a",
        version: 4,
        excerpt: "Fictional private post",
        linked: false,
      },
    ],
    next: null,
  };
  const h = clientHarness({
    window,
    document,
    navigator: { onLine: true },
    Error,
    URLSearchParams,
    AbortController,
    setTimeout: () => 1,
    clearTimeout() {},
    setInterval: (fn) => {
      state.timer = fn;
      return 1;
    },
    clearInterval() {
      state.timer = null;
    },
    confirm: () => true,
  });
  class SocialClientError extends Error {}
  const router = {
    refresh() {
      state.refreshes++;
    },
  };
  const view = h.load(source, {
    "next/link": { default: "a" },
    "next/navigation": { useRouter: () => router },
    "@/lib/platform/social-client": {
      SocialClientError,
      currentSocialOwner: async () => "owner-a",
      socialRequest: async (path, body, owner) => {
        assert.equal(owner, "owner-a");
        assert.equal(body, undefined);
        assert.equal(
          new URL(path, "https://fictional.invalid").searchParams.get("view"),
          "need-posts",
        );
        state.reads++;
        if (state.hold)
          return new Promise((resolve) => {
            state.release = () => resolve({ data: structuredClone(data) });
          });
        return { data: structuredClone(data) };
      },
    },
    "./exchange-need-actions": { NeedPostLinks: "post-links" },
    "./read-visibility": {
      ReadVisibility: { Provider: "read-visibility" },
      useReadVisibility: () => true,
    },
  });
  const entry = view.ExchangeNeedPosts({
    owner: "owner-a",
    listingId: "listing-a",
    needId: "need-a",
    path: "/needs/a",
  });
  h.mount(() => entry.type(entry.props));
  t.after(() => {
    h.unmount();
    assert.equal(state.timer, null);
  });
  return {
    h,
    state,
    document,
    window,
    shown: () =>
      nodes(h.output, (n) => n.type === "read-visibility")[0].props.value,
  };
}
test("focused current read initializes the actual post component", async (t) => {
  const x = model(t);
  await x.h.settle();
  assert.equal(x.state.reads, 1);
  assert.equal(x.shown(), true);
});
test("visible but unfocused visibility return must not admit a private post read", async (t) => {
  const x = model(t, false);
  await x.h.settle();
  assert.equal(x.state.reads, 0);
  assert.equal(x.shown(), false);
  x.document.dispatchEvent(new Event("visibilitychange"));
  await x.h.settle();
  assert.equal(
    x.state.reads,
    0,
    "visibilitychange must not admit reads without document focus",
  );
  assert.equal(x.shown(), false);
  x.state.focused = true;
  x.window.dispatchEvent(new Event("focus"));
  await x.h.settle();
  assert.equal(x.state.reads, 1);
  assert.equal(x.shown(), true);
});
test("periodic callback must not admit a read after focus loss without a blur event", async (t) => {
  const x = model(t);
  await x.h.settle();
  assert.equal(x.state.reads, 1);
  x.state.focused = false;
  x.state.timer();
  await x.h.settle();
  assert.equal(
    x.state.reads,
    1,
    "load must independently reject a visible unfocused admission",
  );
  assert.equal(x.shown(), false, "the callback must conceal the retained page");
  assert.equal(
    nodes(x.h.output, (n) => n.type === "post-links")[0].props.privacy.currentAccess,
    false,
    "the callback must revoke retained action admission",
  );
  x.state.focused = true;
  x.window.dispatchEvent(new Event("focus"));
  await x.h.settle();
  assert.equal(x.state.reads, 2, "refocus must perform a new pinned read");
  assert.equal(x.shown(), true, "the matching read restores the retained page");
});

test("held private post reply must not publish after focus loss without a blur event", async (t) => {
  const x = model(t, true, true);
  await x.h.settle();
  assert.equal(x.state.reads, 1);
  assert.equal(x.shown(), false);
  x.state.focused = false;
  x.state.release();
  await x.h.settle();
  assert.equal(
    x.shown(),
    false,
    "settlement must not expose a held private page without current focus",
  );
  assert.equal(nodes(x.h.output, (n) => n.type === "post-links").length, 0);
});
