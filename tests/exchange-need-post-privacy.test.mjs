import assert from "node:assert/strict";
import test from "node:test";
import { clientHarness, nodes } from "./fixtures/client-hook-harness.mjs";

const postPage = (extra = {}) => ({
  ownerId: "owner-a",
  postsListingId: "listing-a",
  postsNeedId: "need-a",
  postsNeedVersion: 3,
  postsCanLink: true,
  posts: [
    {
      id: "post-a",
      version: 4,
      excerpt: "Private eligible Need post",
      linked: false,
    },
    { id: "post-b", version: 7, excerpt: "Unchanged sibling", linked: true },
  ],
  next: "post-cursor",
  ...extra,
});
function pageHarness(t, initial = postPage()) {
  const window = new EventTarget(),
    document = new EventTarget();
  document.visibilityState = "visible";
  document.hasFocus = () => true;
  window.location = { reload() {} };
  const state = {
    data: initial,
    owner: "owner-a",
    visible: true,
    error: null,
    reads: [],
    refreshes: 0,
    handler: null,
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
    setInterval: () => 1,
    clearInterval() {},
    confirm: () => true,
  });
  class SocialClientError extends Error {
    constructor(status) {
      super("Access denied");
      this.status = status;
    }
  }
  const router = {
    refresh() {
      state.refreshes++;
    },
  };
  const mod = h.load("components/platform/exchange-need-posts.tsx", {
    "next/link": { default: "a" },
    "next/navigation": { useRouter: () => router },
    "@/lib/platform/social-client": {
      SocialClientError,
      currentSocialOwner: async () => state.owner,
      socialRequest: async (path, _body, owner, _method, _dispatch, signal) => {
        assert.equal(owner, "owner-a");
        state.reads.push({ path, signal });
        if (state.handler) return state.handler(signal);
        if (state.error) throw new SocialClientError(state.error);
        return { data: structuredClone(state.data) };
      },
    },
    "./exchange-need-actions": { NeedPostLinks: "post-links" },
    "./read-visibility": {
      ReadVisibility: { Provider: "visibility" },
      useReadVisibility: () => state.visible,
    },
  });
  const props = {
    owner: "owner-a",
    listingId: "listing-a",
    needId: "need-a",
    path: "/needs/a",
    after: "page-a",
  };
  const entry = mod.ExchangeNeedPosts(props);
  h.mount(() => entry.type(entry.props));
  t.after(() => h.unmount());
  return {
    h,
    state,
    mod,
    props,
    leaf: () => nodes(h.output, (n) => n.type === "post-links")[0],
    shown: () => nodes(h.output, (n) => n.type === "visibility")[0].props.value,
    event(name) {
      window.dispatchEvent(new Event(name));
      h.render();
    },
    request() {
      this.leaf().props.onRequest({
        id: "need-a",
        expectedVersion: 3,
        postId: "post-a",
        postVersion: 4,
        linked: true,
      });
      h.render();
    },
    receipt(extra = {}) {
      this.leaf().props.privacy.onConfirmed({
        id: "need-a",
        version: 4,
        message: "Saved",
        ...extra,
      });
      h.render();
    },
  };
}
test("current post page binds account, listing, need and page cursor before initialization", async (t) => {
  const s = pageHarness(t);
  assert.equal(s.leaf(), undefined);
  await s.h.settle();
  assert.equal(s.shown(), true);
  const q = new URL(s.state.reads[0].path, "https://fixture.invalid")
    .searchParams;
  assert.equal(q.get("view"), "need-posts");
  assert.equal(q.get("listingId"), "listing-a");
  assert.equal(q.get("after"), "page-a");
  assert.equal(s.leaf().props.posts[0].excerpt, "Private eligible Need post");
});
for (const [key, value] of [
  ["ownerId", "other"],
  ["postsListingId", "other"],
  ["postsNeedId", "other"],
  ["postsNeedVersion", 0],
  ["postsNeedVersion", 1.5],
  ["postsCanLink", false],
  ["next", 4],
  ["posts", [{ id: "a", version: 1, excerpt: "x".repeat(181), linked: false }]],
])
  test(`current post page rejects invalid ${key} ${String(value)}`, async (t) => {
    const s = pageHarness(t, postPage({ [key]: value }));
    await s.h.settle();
    assert.equal(s.leaf(), undefined);
    assert.equal(s.shown(), false);
  });
test("exact need receipt and intended post change rearm only after canonical acknowledgment", async (t) => {
  const s = pageHarness(t);
  await s.h.settle();
  s.request();
  s.state.data = postPage({
    postsNeedVersion: 4,
    posts: [
      {
        id: "post-a",
        version: 5,
        excerpt: "Private eligible Need post",
        linked: true,
      },
      postPage().posts[1],
    ],
  });
  s.receipt();
  await s.h.settle();
  assert.equal(s.shown(), true);
  assert.equal(s.leaf().props.need.version, 4);
  assert.equal(s.leaf().props.acceptedReceipt.version, 4);
  assert.equal(s.state.refreshes, 1);
});
for (const [name, change] of [
  ["wrong need version", (p) => ({ ...p, postsNeedVersion: 5 })],
  [
    "wrong target version",
    (p) => ({ ...p, posts: [{ ...p.posts[0], version: 6 }, p.posts[1]] }),
  ],
  [
    "wrong link state",
    (p) => ({ ...p, posts: [{ ...p.posts[0], linked: false }, p.posts[1]] }),
  ],
  [
    "changed target excerpt",
    (p) => ({
      ...p,
      posts: [{ ...p.posts[0], excerpt: "Changed" }, p.posts[1]],
    }),
  ],
  [
    "changed sibling",
    (p) => ({
      ...p,
      posts: [p.posts[0], { ...p.posts[1], excerpt: "Changed" }],
    }),
  ],
  ["changed cursor", (p) => ({ ...p, next: null })],
  ["changed order", (p) => ({ ...p, posts: [...p.posts].reverse() })],
  ["lost target", (p) => ({ ...p, posts: [p.posts[1]] })],
])
  test(`confirmed post receipt conceals ${name} and preserves its original snapshot`, async (t) => {
    const s = pageHarness(t);
    await s.h.settle();
    s.request();
    s.state.data = change(
      postPage({
        postsNeedVersion: 4,
        posts: [
          {
            id: "post-a",
            version: 5,
            excerpt: "Private eligible Need post",
            linked: true,
          },
          postPage().posts[1],
        ],
      }),
    );
    s.receipt();
    await s.h.settle();
    assert.equal(s.shown(), false);
    assert.equal(s.leaf().props.need.version, 3);
    assert.equal(s.leaf().props.posts[0].linked, false);
    assert.equal(s.state.refreshes, 0);
  });
test("unacknowledged and wrong receipts do not accept a changed page", async (t) => {
  const s = pageHarness(t);
  await s.h.settle();
  s.request();
  s.state.data = postPage({ postsNeedVersion: 4 });
  s.receipt({ id: "other" });
  s.event("focus");
  await s.h.settle();
  assert.equal(s.shown(), false);
  assert.equal(s.state.refreshes, 0);
});
test("A to B to A sign-in clears original post entries and does not resurrect them", async (t) => {
  const s = pageHarness(t);
  await s.h.settle();
  s.request();
  s.state.owner = "owner-b";
  s.state.error = 401;
  s.event("focus");
  await s.h.settle();
  assert.equal(s.leaf(), undefined);
  s.state.owner = "owner-a";
  s.state.error = null;
  s.event("focus");
  await s.h.settle();
  assert.equal(s.leaf(), undefined);
});
test("route identity replaces the post owner but presentation path alone does not", (t) => {
  const s = pageHarness(t);
  const key = s.mod.ExchangeNeedPosts(s.props).key;
  for (const field of ["owner", "listingId", "needId", "after"])
    assert.notEqual(
      s.mod.ExchangeNeedPosts({ ...s.props, [field]: "other" }).key,
      key,
    );
  assert.equal(
    s.mod.ExchangeNeedPosts({ ...s.props, path: "/elsewhere" }).key,
    key,
  );
});

test("posts service preserves manager/MFA and audience scopes while adding current link identity", async () => {
  const h = clientHarness();
  let coordinator = true,
    publisher = true;
  const lookups = [],
    filters = [];
  const need = {
    id: "need-a",
    listingId: "listing-a",
    version: 6,
    coordinatorId: "owner-a",
    closedAt: null,
    canceledAt: null,
  };
  const tx = {
    exchangeNeed: {
      findUnique: async (args) => {
        lookups.push(args);
        return need;
      },
    },
    platformPost: {
      findMany: async (args) => {
        filters.push(args);
        return [
          {
            id: "post-a",
            version: 4,
            content: "Private excerpt",
            exchangeNeedId: null,
          },
        ];
      },
    },
  };
  const mod = h.load("lib/platform/exchange-need-reads.ts", {
    "./account-read": {
      withAccountRead: async (_db, _token, fn) => fn(tx, "owner-a"),
    },
    "./exchange-policy": {},
    "./exchange-need-policy": {
      managedNeedListing: async (_tx, owner, id) => {
        assert.equal(owner, "owner-a");
        assert.equal(id, "listing-a");
        return { listing: { id, ownerChurchId: "church-a" } };
      },
      needCoordinatorCurrent: async () => coordinator,
      unavailableNeed: () => Error("Unavailable"),
    },
    "./exchange-need-options": { NEED_PAGE: 20 },
    "./post-access": {
      postContext: async () => ({
        publishers: new Set(publisher ? ["church-a"] : []),
      }),
      postReadableWhere: () => ({ audience: "current" }),
    },
    "./post-input": { postId: (x) => x },
    "./post-participation": {},
    "./privileged-auth-policy": {},
    "./social-policy": {},
    "./portal-policy": { PortalError: Error },
    "./volunteer-shift": {},
    "./volunteer-policy": {},
    "./exchange-need-read-access": {},
  });
  const read = () =>
    mod.readExchangeNeeds({}, "fictional-token", {
      view: "posts",
      listingId: "listing-a",
    });
  const first = await read();
  assert.equal(first.postsListingId, "listing-a");
  assert.equal(first.postsNeedId, "need-a");
  assert.equal(first.postsNeedVersion, 6);
  assert.equal(first.postsCanLink, true);
  assert.equal(first.posts[0].excerpt, "Private excerpt");
  assert.equal(lookups[0].where.listingId, "listing-a");
  assert.equal(filters[0].take, 21);
  assert.equal(filters[0].where.AND[0].audience, "current");
  assert.equal(filters[0].where.AND[1].authorChurchId, "church-a");
  coordinator = false;
  assert.equal((await read()).postsCanLink, false);
  coordinator = true;
  need.closedAt = new Date();
  assert.equal((await read()).postsCanLink, false);
  need.closedAt = null;
  publisher = false;
  const denied = await read();
  assert.equal(denied.postsCanLink, false);
  assert.equal(denied.posts.length, 0);
});
