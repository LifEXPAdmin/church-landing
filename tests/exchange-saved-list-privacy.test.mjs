import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  button,
  clientHarness,
  nodes,
  textContent
} from "./fixtures/client-hook-harness.mjs";

const response = (data, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: new Headers(),
  body: { cancel: async () => {} },
  json: async () => data
});
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
const listPage = (view, ids = ["a", "b", "c"]) => ({
  ownerId: "owner-a",
  [view]: ids.map((id) =>
    view === "favorites"
      ? {
          id: "favorite-" + id,
          version: 1,
          listing: {
            id: "listing-" + id,
            title: "Private favorite association " + id,
            intent: "FREE",
            state: "ACTIVE",
            currency: null,
            priceMinor: null,
            servicePricing: null,
            serviceUnit: null,
            placeLabel: "Private favorite place " + id
          }
        }
      : {
          id: "search-" + id,
          version: 1,
          name: "Private named search " + id,
          schema: 1,
          criteria: { q: "Private saved criteria " + id },
          alerts: false,
          href:
            "/platform/exchange?" +
            new URLSearchParams({ q: "Private saved criteria " + id })
        }
  ),
  after: null
});
const targetId = (view, id = "a") =>
  (view === "favorites" ? "favorite-" : "search-") + id;
const removeText = (view) =>
  view === "favorites" ? "Remove favorite" : "Remove search";

// Real hook/component bodies and the account-pinned transport run here. Only
// browser infrastructure, clocks and leaf boundaries are controlled.
function environment(view = "favorites", after = null) {
  const window = new EventTarget(),
    document = new EventTarget();
  document.visibilityState = "visible";
  document.hasFocus = () => true;
  window.location = { reload() {} };
  const navigator = { onLine: true },
    deadlines = new Map(),
    intervals = new Map();
  const requests = [],
    confirmed = [],
    dispatches = [];
  let timerId = 0;
  const state = {
    owner: "owner-a",
    visible: true,
    access: true,
    result: listPage(view),
    acceptedReceipt: null,
    guard: null,
    identityHandler: null,
    readHandler: null,
    writeHandler: null
  };
  const params = new URLSearchParams({ view, ...(after ? { after } : {}) });
  const url = "/api/platform/exchange?" + params;
  const returnHref = "/platform/exchange/saved?" + params;
  const h = clientHarness({
    window,
    document,
    navigator,
    Error,
    TypeError,
    AbortController,
    URLSearchParams,
    confirm: () => true,
    setTimeout(fn, ms) {
      assert.equal(ms, 15000);
      deadlines.set(++timerId, fn);
      return timerId;
    },
    clearTimeout(id) {
      deadlines.delete(id);
    },
    setInterval(fn, ms) {
      assert.equal(ms, 30000);
      intervals.set(++timerId, fn);
      return timerId;
    },
    clearInterval(id) {
      intervals.delete(id);
    },
    fetch: async (path, options) => {
      requests.push({ path, ...options });
      if (path === "/api/platform/profile?view=identity")
        return state.identityHandler
          ? state.identityHandler(options)
          : response({ id: state.owner });
      assert.equal(options.headers["X-Expected-Account"], "owner-a");
      if (options.body) {
        assert.equal(path, "/api/platform/exchange");
        if (state.writeHandler) return state.writeHandler(options);
        const body = JSON.parse(options.body);
        return response({
          id: body.favoriteId ?? body.searchId,
          version: body.expectedVersion + 1,
          message: "Fictional choice removed"
        });
      }
      assert.ok([url, "/api/platform/exchange?view=" + view].includes(path));
      return state.readHandler
        ? state.readHandler(options, path)
        : response(state.result);
    }
  });
  const social = h.load("lib/platform/social-client.ts", {
    "./privileged-auth-navigation": { announcePrivilegedChallenge: () => false }
  });
  const hook = h.load("components/platform/use-private-choice-action.tsx", {
    "./use-photo-back-guard": { settlePhotoNavigation: async () => {} },
    "next/navigation": { useRouter: () => ({ refresh() {} }) },
    "@/lib/platform/social-client": social,
    "./private-snapshot-guard": { usePrivateRecovery() {} },
    "./read-visibility": { useReadVisibility: () => state.visible },
    "./use-unsaved-social-work": {
      useUnsavedSocialWork(value, _onBlocked, protectBack) {
        state.guard = { ...value, protectBack };
      }
    }
  });
  return {
    h,
    state,
    social,
    hook,
    view,
    url,
    returnHref,
    document,
    navigator,
    requests,
    confirmed,
    dispatches,
    deadlines,
    privacy() {
      return {
        currentAccess: state.access,
        onAccessDenied() {
          state.access = false;
        },
        onConfirmed(receipt) {
          confirmed.push(receipt);
        }
      };
    },
    emit(name) {
      window.dispatchEvent(new Event(name));
      h.render();
    },
    expire() {
      for (const [id, fn] of [...deadlines]) {
        deadlines.delete(id);
        fn();
      }
    },
    poll() {
      for (const fn of intervals.values()) fn();
      h.render();
    },
    setVisible(value) {
      state.visible = value;
      h.render();
    },
    writes() {
      return requests.filter((r) => r.body);
    }
  };
}
function itemsHarness(t, view = "favorites") {
  const s = environment(view);
  const { ExchangeSavedItems } = s.h.load(
    "components/platform/exchange-saved-controls.tsx",
    {
      "next/link": { default: "a" },
      "./use-private-choice-action": s.hook,
      "./read-visibility": { useReadVisibility: () => s.state.visible },
      "@/lib/platform/exchange-options": s.h.load(
        "lib/platform/exchange-options.ts"
      ),
      "./portal-action-form": { portalInputClass: "" }
    }
  );
  s.h.mount(() =>
    ExchangeSavedItems({
      owner: "owner-a",
      result: s.state.result,
      view,
      returnHref: s.returnHref,
      privacy: s.privacy(),
      acceptedReceipt: s.state.acceptedReceipt,
      onRequest() {
        s.dispatches.push(true);
        s.state.acceptedReceipt = null;
      }
    })
  );
  t.after(() => s.h.unmount());
  return {
    ...s,
    removeButtons() {
      return nodes(
        s.h.output,
        (n) => n.type === "button" && textContent(n).trim() === removeText(view)
      );
    },
    rows(ids) {
      s.state.result = listPage(view, ids);
      s.h.render();
    },
    accept(receipt) {
      s.state.acceptedReceipt = receipt;
      s.h.render();
    }
  };
}

for (const view of ["favorites", "searches"])
  test(`${view} server bootstrap authorizes the route without serializing private rows`, async () => {
    const h = clientHarness({ URLSearchParams }),
      calls = [];
    const ExchangeSavedList = () => null,
      ExchangeSavedItems = () => null;
    const { ExchangeSavedPage } = h.load(
      "components/platform/exchange-page-ui.tsx",
      {
        "@/lib/platform/pantry-session": {},
        "@/lib/platform/privileged-auth-policy": {
          PrivilegedAuthenticationError: Error
        },
        "@/lib/platform/privileged-auth-navigation": {},
        "node:crypto": { createHash },
        "next/link": { default: "a" },
        "./platform-shell": { PlatformShell: "shell" },
        "./private-snapshot-guard": { PrivateSnapshotGuard: "guard" },
        "./topic-read-boundary": { TopicReadBoundary: "boundary" },
        "./exchange-editor": { ExchangeEditor: "editor" },
        "./exchange-saved-controls": {
          ExchangeSavedItems,
          ExchangeSaveSearchForm: "form"
        },
        "./exchange-saved-list": { ExchangeSavedList },
        "@/lib/platform/post-input": { postId: (value) => value },
        "./exchange-search-position": {},
        "@/lib/platform/exchange-navigation": {},
        "./exchange-filters": {},
        "@/lib/platform/account-entry": {},
        "@/lib/platform/portal-policy": { PortalError: Error },
        "@/lib/platform/session": {
          getCurrentPlatformUser: async () => ({ id: "owner-a" })
        },
        "@/lib/platform/exchange-session": {
          exchangeSavedPage: async (query) => {
            calls.push(query);
            return listPage(view);
          }
        },
        "@/lib/platform/exchange-options": h.load(
          "lib/platform/exchange-options.ts"
        ),
        "@/lib/platform/discovery-options": {},
        "@/lib/platform/exchange-input": {}
      }
    );
    const tree = await ExchangeSavedPage({
      query: { view, after: "cursor-a" }
    });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].view, view);
    assert.equal(calls[0].after, "cursor-a");
    assert.ok(!JSON.stringify(tree).includes("Private "));
    const owner = nodes(tree, (n) => n.type === ExchangeSavedList);
    assert.equal(owner.length, 1);
    assert.deepEqual(JSON.parse(JSON.stringify(owner[0].props)), {
      owner: "owner-a",
      url: `/api/platform/exchange?view=${view}&after=cursor-a`,
      view,
      returnHref: `/platform/exchange/saved?view=${view}&after=cursor-a`
    });
  });

for (const view of ["favorites", "searches"])
  test(`${view} concealment physically removes private row text and links`, (t) => {
    const s = itemsHarness(t, view);
    assert.match(textContent(s.h.output), /Private /);
    s.setVisible(false);
    assert.ok(!JSON.stringify(s.h.output).includes("Private "));
    assert.equal(nodes(s.h.output, (n) => n.type === "li").length, 0);
    assert.equal(
      nodes(
        s.h.output,
        (n) =>
          n.type === "a" && /listing-|savedSearch=|Private/.test(n.props.href)
      ).length,
      0
    );
    s.setVisible(true);
    assert.match(textContent(s.h.output), /Private /);
  });

for (const view of ["favorites", "searches"])
  test(`${view} lost removal survives row disappearance and wrong-target replies with identical retry bytes`, async (t) => {
    const s = itemsHarness(t, view);
    s.state.writeHandler = () => {
      throw new TypeError("Fictional accepted reply lost");
    };
    s.removeButtons()[0].props.onClick();
    await s.h.settle();
    assert.equal(s.writes().length, 1);
    assert.equal(s.state.guard.saving, true);
    assert.equal(s.state.guard.protectBack, true);
    const original = s.writes()[0].body;
    s.rows([]);
    s.setVisible(false);
    s.state.writeHandler = () =>
      response({ id: targetId(view, "b"), version: 2, message: "Wrong row" });
    button(s.h.output, "Confirm original save").props.onClick();
    await s.h.settle();
    assert.equal(s.confirmed.length, 0);
    assert.equal(s.state.guard.saving, true);
    s.state.writeHandler = null;
    button(s.h.output, "Confirm original save").props.onClick();
    await s.h.settle();
    assert.equal(s.writes().length, 3);
    assert.ok(s.writes().every((r) => r.body === original));
    assert.equal(s.confirmed.length, 1);
    assert.equal(s.confirmed[0].id, targetId(view));
  });

test("back-to-back row clicks cannot rebase the first dispatch's expected receipt target", async (t) => {
  const s = itemsHarness(t),
    buttons = s.removeButtons();
  buttons[0].props.onClick();
  buttons[1].props.onClick();
  await s.h.settle();
  assert.equal(s.writes().length, 1);
  assert.equal(JSON.parse(s.writes()[0].body).favoriteId, "favorite-a");
  assert.equal(s.dispatches.length, 1);
  assert.equal(s.confirmed.length, 1);
  assert.equal(s.confirmed[0].id, "favorite-a");
});

test("equal per-row versions require each exact consumed receipt object before the next removal", async (t) => {
  const s = itemsHarness(t);
  s.removeButtons()[0].props.onClick();
  await s.h.settle();
  assert.equal(s.confirmed.length, 1);
  const first = s.confirmed[0];
  s.rows(["b", "c"]);
  s.accept(first);
  await s.h.settle();
  assert.equal(s.removeButtons()[0].props.disabled, false);
  s.removeButtons()[0].props.onClick();
  await s.h.settle();
  assert.equal(s.confirmed.length, 2);
  const second = s.confirmed[1];
  assert.equal(second.version, first.version);
  assert.notEqual(second.id, first.id);
  s.rows(["c"]);
  s.accept(first);
  await s.h.settle();
  assert.equal(s.removeButtons()[0].props.disabled, true);
  s.accept({ ...second });
  await s.h.settle();
  assert.equal(
    s.removeButtons()[0].props.disabled,
    true,
    "Matching fields are not the accepted receipt object"
  );
  s.accept(second);
  await s.h.settle();
  assert.equal(s.removeButtons()[0].props.disabled, false);
  s.removeButtons()[0].props.onClick();
  await s.h.settle();
  assert.equal(s.writes().length, 3);
  assert.equal(s.confirmed[2].id, "favorite-c");
  assert.equal(
    new Set(s.writes().map((r) => JSON.parse(r.body).mutationId)).size,
    3
  );
});

test("definitive validation rejection permits a fresh target without leaving the dispatch latch stuck", async (t) => {
  const s = itemsHarness(t);
  s.state.writeHandler = () =>
    response({ message: "Fictional validation rejection" }, 400);
  s.removeButtons()[0].props.onClick();
  await s.h.settle();
  assert.equal(s.confirmed.length, 0);
  assert.equal(s.state.guard.saving, false);
  s.state.writeHandler = null;
  s.removeButtons()[1].props.onClick();
  await s.h.settle();
  assert.equal(s.confirmed.length, 1);
  assert.equal(s.confirmed[0].id, "favorite-b");
});

test("an unavailable favorite remains removable without restoring its source content", async (t) => {
  const s = itemsHarness(t);
  s.state.result = {
    ...listPage("favorites", ["a"]),
    favorites: [{ id: "favorite-a", version: 1, listing: null }]
  };
  s.h.render();
  assert.match(textContent(s.h.output), /Listing unavailable/);
  assert.ok(!textContent(s.h.output).includes("Private favorite"));
  s.removeButtons()[0].props.onClick();
  await s.h.settle();
  assert.equal(JSON.parse(s.writes()[0].body).favoriteId, "favorite-a");
  assert.equal(s.confirmed.length, 1);
});

function ownerHarness(
  t,
  { view = "favorites", after = null, holdFirst = false } = {}
) {
  const s = environment(view, after),
    first = deferred();
  if (holdFirst) s.state.readHandler = () => first.promise;
  const ExchangeSavedItems = () => null;
  const { ExchangeSavedList } = s.h.load(
    "components/platform/exchange-saved-list.tsx",
    {
      "next/link": { default: "a" },
      "@/lib/platform/social-client": s.social,
      "./exchange-saved-controls": { ExchangeSavedItems },
      "./read-visibility": {
        ReadVisibility: { Provider: "visibility" },
        useReadVisibility: () => s.state.visible
      }
    }
  );
  s.h.mount(() =>
    ExchangeSavedList({
      owner: "owner-a",
      url: s.url,
      view,
      returnHref: s.returnHref
    })
  );
  t.after(() => s.h.unmount());
  return {
    ...s,
    first,
    items() {
      return nodes(s.h.output, (n) => n.type === ExchangeSavedItems)[0];
    },
    visible() {
      const providers = nodes(s.h.output, (n) => n.type === "visibility");
      return providers.length ? providers[0].props.value : false;
    },
    reads() {
      return s.requests.filter(
        (r) => !r.body && r.path !== "/api/platform/profile?view=identity"
      );
    }
  };
}
const removedReceipt = (id = "favorite-a") => ({
  id,
  version: 2,
  message: "Fictional choice removed"
});

test("saved-list initialization exposes no private row props until the complete current pinned read", async (t) => {
  const s = ownerHarness(t, { holdFirst: true });
  assert.equal(s.items(), undefined);
  assert.ok(!JSON.stringify(s.h.output).includes("Private "));
  await s.h.settle();
  assert.equal(s.visible(), false);
  assert.equal(s.items(), undefined);
  s.first.resolve(response(s.state.result));
  await s.h.settle();
  assert.equal(s.visible(), true);
  assert.equal(s.items().props.result, s.state.result);
  assert.equal(s.items().props.privacy.currentAccess, true);
  assert.equal(s.deadlines.size, 0);
});

test("a denied initial list cannot mint a blank command owner and recovers on explicit recheck", async (t) => {
  const s = ownerHarness(t, { holdFirst: true });
  s.first.resolve(response({ message: "Fictional list unavailable" }, 403));
  await s.h.settle();
  assert.equal(s.items(), undefined);
  assert.equal(s.visible(), false);
  assert.ok(!JSON.stringify(s.h.output).includes("Private "));
  s.state.readHandler = null;
  button(s.h.output, "Recheck current access").props.onClick();
  await s.h.settle();
  assert.equal(s.visible(), true);
  assert.equal(s.items().props.privacy.currentAccess, true);
});

test("concealment retains the leaf but passive online and polling cannot reopen it", async (t) => {
  const s = ownerHarness(t);
  await s.h.settle();
  const original = s.items();
  for (const event of ["blur", "pagehide", "offline"]) {
    s.emit(event);
    assert.equal(s.visible(), false);
    assert.equal(s.items().key, original.key);
    assert.equal(s.items().props.result, original.props.result);
    assert.equal(s.items().props.privacy.currentAccess, false);
    const count = s.requests.length;
    s.emit("online");
    s.poll();
    await s.h.settle();
    assert.equal(s.requests.length, count);
    s.emit("focus");
    await s.h.settle();
    assert.equal(s.visible(), true);
  }
  s.document.visibilityState = "hidden";
  s.document.dispatchEvent(new Event("visibilitychange"));
  s.h.render();
  assert.equal(s.visible(), false);
  s.document.visibilityState = "visible";
  s.document.dispatchEvent(new Event("visibilitychange"));
  await s.h.settle();
  assert.equal(s.visible(), true);
  s.setVisible(false);
  assert.equal(
    s.visible(),
    false,
    "Parent read concealment reaches retained leaf context"
  );
  s.setVisible(true);
  assert.equal(s.visible(), true);
});

test("unexpected deletion or source redaction conceals a pinned list without rebasing its pending owner", async (t) => {
  const s = ownerHarness(t);
  await s.h.settle();
  const original = s.items();
  s.state.result = listPage("favorites", ["b", "c"]);
  s.emit("focus");
  await s.h.settle();
  assert.equal(s.visible(), false);
  assert.equal(s.items().props.result, original.props.result);
  assert.equal(s.items().key, original.key);
  assert.equal(s.items().props.privacy.currentAccess, true);
  assert.equal(s.items().props.acceptedReceipt ?? null, null);
  s.state.result = listPage("favorites");
  s.state.result.favorites[0].listing = null;
  s.emit("focus");
  await s.h.settle();
  assert.equal(s.visible(), false);
  assert.equal(s.items().props.result, original.props.result);
  assert.equal(s.items().props.acceptedReceipt ?? null, null);
});

test("a confirmed removal adopts a fresh canonical re-added favorite instead of requiring absence", async (t) => {
  const s = ownerHarness(t);
  await s.h.settle();
  const original = s.items(),
    receipt = removedReceipt();
  s.items().props.onRequest();
  s.state.result = listPage("favorites");
  s.state.result.favorites[0].version = 3;
  s.items().props.privacy.onConfirmed(receipt);
  await s.h.settle();
  assert.equal(s.visible(), true);
  assert.equal(s.items().key, original.key);
  assert.equal(s.items().props.result, s.state.result);
  assert.equal(s.items().props.result.favorites[0].version, 3);
  assert.equal(s.items().props.acceptedReceipt, receipt);
});

test("receipt delivery while concealed cannot reveal or rearm before a fresh foreground read", async (t) => {
  const s = ownerHarness(t, { view: "searches" });
  await s.h.settle();
  const original = s.items(),
    receipt = removedReceipt("search-a");
  s.items().props.onRequest();
  s.emit("blur");
  s.state.result = listPage("searches", ["b", "c"]);
  s.items().props.privacy.onConfirmed(receipt);
  await s.h.settle();
  assert.equal(s.visible(), false);
  assert.equal(s.items().props.result, original.props.result);
  assert.equal(s.items().props.acceptedReceipt ?? null, null);
  s.emit("focus");
  await s.h.settle();
  assert.equal(s.visible(), true);
  assert.equal(s.items().props.result, s.state.result);
  assert.equal(s.items().props.acceptedReceipt, receipt);
});

test("a read started before confirmation cannot accept its old snapshot after the receipt arrives", async (t) => {
  const s = ownerHarness(t);
  await s.h.settle();
  const original = s.items(),
    old = deferred(),
    current = deferred(),
    receipt = removedReceipt();
  s.items().props.onRequest();
  s.state.readHandler = () => old.promise;
  s.emit("focus");
  await s.h.settle();
  s.items().props.privacy.onConfirmed(receipt);
  s.state.readHandler = () => current.promise;
  old.resolve(response(original.props.result));
  await s.h.settle();
  assert.equal(s.visible(), false);
  assert.equal(s.items().props.acceptedReceipt ?? null, null);
  s.state.result = listPage("favorites", ["b", "c"]);
  current.resolve(response(s.state.result));
  await s.h.settle();
  assert.equal(s.visible(), true);
  assert.equal(s.items().props.acceptedReceipt, receipt);
  assert.equal(s.items().props.result, s.state.result);
});

test("a cursor conflict without an original dispatch cannot authorize new commands through a fallback", async (t) => {
  const s = ownerHarness(t, { after: "cursor-a" });
  await s.h.settle();
  const original = s.items();
  s.state.readHandler = () =>
    response({ message: "Cursor no longer available" }, 409);
  s.emit("focus");
  await s.h.settle();
  assert.equal(s.visible(), false);
  assert.equal(s.items().props.result, original.props.result);
  assert.equal(s.items().props.privacy.currentAccess, false);
  assert.equal(
    s.reads().filter((r) => r.path === "/api/platform/exchange?view=favorites")
      .length,
    0
  );
  assert.equal(s.items().props.acceptedReceipt ?? null, null);
});

for (const view of ["favorites", "searches"])
  test(`${view} cursor conflict authorizes only the retained original retry without adopting the fallback`, async (t) => {
    const s = ownerHarness(t, { view, after: "cursor-a" });
    await s.h.settle();
    const original = s.items(),
      receipt = removedReceipt(targetId(view));
    s.items().props.onRequest();
    const firstPage = listPage(view, ["z"]);
    s.state.readHandler = (_options, path) =>
      path === s.url
        ? response({ message: "Cursor no longer available" }, 409)
        : response(firstPage);
    s.emit("focus");
    await s.h.settle();
    assert.equal(s.visible(), false);
    assert.equal(s.items().props.result, original.props.result);
    assert.equal(s.items().props.privacy.currentAccess, true);
    assert.equal(s.items().props.acceptedReceipt ?? null, null);
    assert.equal(s.reads().at(-1).path, "/api/platform/exchange?view=" + view);
    s.items().props.privacy.onConfirmed(receipt);
    await s.h.settle();
    assert.equal(s.visible(), false);
    assert.equal(s.items().props.result, original.props.result);
    assert.equal(
      s.items().props.acceptedReceipt ?? null,
      null,
      "Fallback never rearms commands on the abandoned page"
    );
    assert.equal(
      nodes(
        s.h.output,
        (n) =>
          n.type === "a" &&
          n.props.href === "/platform/exchange/saved?view=" + view
      ).length,
      1
    );
    s.state.readHandler = null;
    s.state.result = listPage(view, ["b", "c"]);
    s.emit("focus");
    await s.h.settle();
    assert.equal(s.visible(), true);
    assert.equal(s.items().props.acceptedReceipt, receipt);
    assert.equal(s.items().props.result, s.state.result);
    s.state.readHandler = () =>
      response({ message: "Cursor no longer available" }, 409);
    const count = s.reads().length;
    s.emit("focus");
    await s.h.settle();
    assert.equal(s.items().props.privacy.currentAccess, false);
    assert.equal(
      s.reads().length,
      count + 1,
      "Consumed receipt clears original-request fallback permission"
    );
  });

test("same-account identity outage and denied fallback preserve concealed state without granting access", async (t) => {
  const s = ownerHarness(t, { after: "cursor-a" });
  await s.h.settle();
  const original = s.items();
  s.items().props.onRequest();
  s.state.identityHandler = () => response({}, 503);
  s.emit("focus");
  await s.h.settle();
  assert.equal(s.visible(), false);
  assert.equal(s.items().props.result, original.props.result);
  assert.equal(s.items().props.privacy.currentAccess, false);
  s.state.identityHandler = null;
  s.state.readHandler = (_options, path) =>
    response({ message: "Unavailable" }, path === s.url ? 409 : 403);
  s.emit("focus");
  await s.h.settle();
  assert.equal(s.items().props.privacy.currentAccess, false);
  assert.equal(s.items().props.result, original.props.result);
  assert.equal(s.visible(), false);
  assert.equal(s.items().props.acceptedReceipt ?? null, null);
  s.state.readHandler = null;
  s.emit("focus");
  await s.h.settle();
  assert.equal(s.visible(), true);
});

for (const stage of ["identity", "list"])
  test(`a hung saved-list ${stage} read cancels at its deadline and drains one queued fresh read`, async (t) => {
    const s = ownerHarness(t);
    await s.h.settle();
    const original = s.items();
    let signal;
    const hold = (options) =>
      new Promise((_resolve, reject) => {
        signal = options.signal;
        signal.addEventListener("abort", () => reject(signal.reason), {
          once: true
        });
      });
    if (stage === "identity") s.state.identityHandler = hold;
    else s.state.readHandler = hold;
    s.emit("focus");
    await s.h.settle();
    s.emit("focus");
    assert.equal(s.visible(), false);
    s.state.identityHandler = null;
    s.state.readHandler = null;
    s.expire();
    await s.h.settle();
    assert.equal(signal.aborted, true);
    assert.equal(s.visible(), true);
    assert.equal(s.items().key, original.key);
    assert.equal(s.items().props.result, original.props.result);
    assert.equal(s.deadlines.size, 0);
  });

test("confirmed account replacement clears the retained owner even if the identity response also blurs", async (t) => {
  const s = ownerHarness(t);
  await s.h.settle();
  s.items().props.onRequest();
  s.state.identityHandler = () => {
    s.emit("blur");
    return response({ id: "owner-b" });
  };
  s.emit("focus");
  await s.h.settle();
  assert.equal(s.visible(), false);
  assert.equal(s.items(), undefined);
  assert.ok(!JSON.stringify(s.h.output).includes("Private favorite"));
  s.state.identityHandler = null;
  s.emit("focus");
  await s.h.settle();
  assert.equal(
    s.items(),
    undefined,
    "A cleared account cannot recover the prior account's retained owner"
  );
});
