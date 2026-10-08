import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { resolve } from "node:path";
import test from "node:test";
import {
  clientHarness,
  nodes,
  textContent
} from "./fixtures/client-hook-harness.mjs";

// Deterministic actual-component/transport state tests; no React DOM, browser,
// native-window focus, real network, database, or automatic writes are exercised.
const sourceRoot = process.env.FOREGROUND_SOURCE_ROOT || process.cwd();
const owner = "owner-a";
const search = {
  id: "search-a",
  version: 3,
  schema: 1,
  name: "Private saved name",
  alerts: false,
  criteria: { q: "Private search criterion" },
  href: "/platform/exchange?q=private"
};
const response = (data, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: new Headers(),
  body: { cancel: async () => {} },
  json: async () => data
});
const digest = async (algorithm, bytes) => {
  assert.equal(algorithm, "SHA-256");
  return Uint8Array.from(createHash("sha256").update(bytes).digest()).buffer;
};
function environment(kind) {
  const window = new EventTarget(),
    document = new EventTarget();
  const state = {
    focused: true,
    parentVisible: true,
    requests: [],
    last: null
  };
  document.visibilityState = "visible";
  document.hasFocus = () => state.focused;
  window.location = { reload() {}, assign() {} };
  let timerId = 0;
  const timers = new Map();
  const data =
    kind === "contributions" || kind === "incoming"
      ? {
          ownerId: owner,
          contributions: [
            {
              id: "contribution-a",
              version: 3,
              state: "COMMITTED",
              quantity: 5,
              received: 3,
              returned: 0,
              createdAt: "2026-10-01T10:00:00.000Z",
              endedAt: null,
              current: true,
              own: kind !== "incoming",
              needId: "need-a",
              slotId: "slot-a",
              listingId: kind === "incoming" ? "need-a" : "listing-a",
              title: "Private contribution title",
              note: "Private retained contribution note",
              quoteMinor: 18765,
              quoteCurrency: "USD",
              shareName: false,
              disputed: false,
              disputeNote: "",
              loanReturnAt: "2026-10-10T10:00:00.000Z",
              loanResponsibility: "Private loan terms",
              contributor: null
            }
          ],
          next: null
        }
      : kind === "defaults"
        ? {
            ownerId: owner,
            version: 3,
            fields: { pickupDetails: "PRIVATE DEFAULT PICKUP" },
            churches: [],
            available: true,
            recoveryRequired: false
          }
        : kind === "composer"
          ? {
              ownerId: owner,
              target: {
                listingId: "listing-a",
                listingVersion: 3,
                contactVersion: 2,
                receiver: { id: "receiver-a", name: "Private named receiver" },
                activeId: null,
                available: true
              }
            }
          : kind === "detail"
            ? {
                ownerId: owner,
                inquiry: {
                  id: "inquiry-a",
                  version: 3,
                  planVersion: 1,
                  history: [],
                  available: true,
                  purpose: "PRIVATE PURPOSE",
                  pickupDetails: "PRIVATE PICKUP",
                  cancelNote: "",
                  side: "incoming",
                  state: "DECLINED",
                  listing: { id: "listing-a", title: "Private handoff" },
                  person: null
                }
              }
            : { ownerId: owner, searches: [search], after: null };
  const h = clientHarness({
    window,
    document,
    navigator: { onLine: true },
    Error,
    TypeError,
    AbortController,
    URLSearchParams,
    TextEncoder,
    Uint8Array,
    confirm: () => true,
    crypto: { randomUUID, subtle: { digest } },
    setTimeout(fn, ms) {
      assert.equal(ms, 15000);
      timers.set(++timerId, fn);
      return timerId;
    },
    clearTimeout(id) {
      timers.delete(id);
    },
    setInterval(fn, ms) {
      assert.equal(ms, 30000);
      timers.set(++timerId, fn);
      return timerId;
    },
    clearInterval(id) {
      timers.delete(id);
    },
    fetch: async (path, options) => {
      state.requests.push({ path, ...options });
      if (path === "/api/platform/profile?view=identity")
        return response({ id: owner });
      assert.equal(options.headers["X-Expected-Account"], owner);
      assert.equal(options.cache, "no-store");
      assert.equal(options.method, "GET");
      assert.equal(
        new URL(path, "https://fixture.invalid").pathname,
        "/api/platform/exchange"
      );
      if (kind === "contributions" || kind === "incoming") {
        const params = new URL(path, "https://fixture.invalid").searchParams;
        assert.equal(
          params.get("view"),
          kind === "incoming" ? "need-contributors" : "need-mine"
        );
        assert.equal(params.get("id"), kind === "incoming" ? "need-a" : null);
      }
      return response(data);
    }
  });
  const load = (path, mocks = {}) => h.load(resolve(sourceRoot, path), mocks);
  const social = load("lib/platform/social-client.ts", {
    "./privileged-auth-navigation": { announcePrivilegedChallenge: () => false }
  });
  const readVisibility = {
    ReadVisibility: { Provider: "visibility" },
    useReadVisibility: () => state.parentVisible
  };
  const common = {
    "next/link": { default: "a" },
    "@/lib/platform/social-client": social,
    "./read-visibility": readVisibility
  };
  const router = { refresh() {} };
  let Component, props;
  if (kind === "search") {
    ({ ExchangeSearchSaveEntry: Component } = load(
      "components/platform/exchange-saved-search-entry.tsx",
      {
        ...common,
        "./exchange-saved-controls": { ExchangeSaveSearchForm: "private-leaf" }
      }
    ));
    props = { owner, query: { q: "Current criterion" }, searchId: "search-a" };
  } else if (kind === "list") {
    ({ ExchangeSavedList: Component } = load(
      "components/platform/exchange-saved-list.tsx",
      {
        ...common,
        "./exchange-saved-controls": { ExchangeSavedItems: "private-leaf" }
      }
    ));
    props = {
      owner,
      url: "/api/platform/exchange?view=searches",
      view: "searches",
      returnHref: "/platform/exchange/saved?view=searches"
    };
  } else if (kind === "contributions" || kind === "incoming") {
    ({ ExchangeNeedContributions: Component } = load(
      "components/platform/exchange-need-contributions.tsx",
      {
        ...common,
        "next/navigation": { useRouter: () => router },
        "./exchange-need-progress": { useNeedProgressRefresh: () => null },
        "./exchange-need-actions": { NeedContributionCard: "private-leaf" }
      }
    ));
    props = {
      owner,
      query:
        kind === "incoming"
          ? {
              view: "incoming",
              needId: "need-a",
              path: "/platform/exchange/need-a/needs"
            }
          : { view: "mine" }
    };
  } else if (kind === "defaults") {
    ({ ExchangeDefaultsEntry: Component } = load(
      "components/platform/exchange-defaults-entry.tsx",
      {
        ...common,
        "./exchange-defaults-form": { ExchangeDefaultsForm: "private-leaf" }
      }
    ));
    props = { owner };
  } else if (kind === "reader") {
    ({ PrivateReadSnapshot: Component } = load(
      "components/platform/private-read-snapshot.tsx",
      { "@/lib/platform/social-client": social }
    ));
    props = {
      owner,
      url: "/api/platform/exchange?view=handoff-incoming",
      label: "private inquiries",
      changedNotice: "Changed",
      children: () => ({
        type: "private-read-result",
        props: { children: "PRIVATE PARTICIPANT" }
      })
    };
  } else if (kind === "composer") {
    const router = {
      push() {
        throw Error("Unexpected navigation");
      },
      refresh() {}
    };
    ({ ExchangeInquiryComposer: Component } = load(
      "components/platform/exchange-inquiry-composer.tsx",
      {
        ...common,
        "next/navigation": { useRouter: () => router },
        "./exchange-handoff-controls": { ExchangeInquiryForm: "private-leaf" }
      }
    ));
    props = { owner, listingId: "listing-a" };
  } else {
    ({ ExchangeHandoffDetail: Component } = load(
      "components/platform/exchange-handoff-detail.tsx",
      {
        ...common,
        "./exchange-handoff-controls": {
          ExchangeHandoffActions: "private-leaf"
        },
        "./regional-presentation": { RegionalTime: "time" },
        "@/lib/platform/exchange-handoff-options": {
          exchangeInquiryStateLabels: { DECLINED: "Declined" },
          exchangeHandoffActionLabels: {},
          exchangeCancellationReasons: {}
        },
        "@/lib/platform/community-report-types": {
          reportEntryHref: () => "/report"
        }
      }
    ));
    props = { owner, inquiryId: "inquiry-a" };
  }
  h.mount(() => Component(props));
  return {
    h,
    state,
    document,
    async emit(name) {
      (name === "visibilitychange" ? document : window).dispatchEvent(
        new Event(name)
      );
      h.render();
      await h.settle();
    },
    reads() {
      return state.requests.filter(
        (r) => r.path !== "/api/platform/profile?view=identity"
      ).length;
    },
    visible() {
      return kind === "reader"
        ? nodes(h.output, (n) => n.type === "private-read-result").length === 1
        : nodes(h.output, (n) => n.type === "visibility")[0]?.props.value;
    },
    access() {
      return nodes(h.output, (n) => n.type === "private-leaf")[0]?.props.privacy
        ?.currentAccess;
    }
  };
}
for (const kind of [
  "search",
  "detail",
  "list",
  "composer",
  "contributions",
  "incoming",
  "defaults",
  "reader"
])
  for (const event of ["pageshow", "visibilitychange"]) {
    test(`${kind}: unfocused ${event} does not restore private access`, async (t) => {
      const s = environment(kind);
      t.after(() => s.h.unmount());
      await s.h.settle();
      assert.equal(s.visible(), true, "positive initial owner read");
      if (kind === "detail")
        assert.match(textContent(s.h.output), /PRIVATE PURPOSE/);
      s.state.focused = false;
      await s.emit("blur");
      assert.equal(s.visible(), false);
      const reads = s.reads();
      await s.emit("online");
      await s.emit("social-relationships-changed");
      assert.equal(s.reads(), reads, "passive refresh stays concealed");
      await s.emit(event);
      const observed = {
        kind,
        event,
        focused: s.state.focused,
        readsAfterBlur: reads,
        readsAfterUnfocusedResume: s.reads(),
        privatePresented: s.visible(),
        currentAccess: s.access() ?? null,
        privatePurposeRendered:
          kind === "detail" &&
          textContent(s.h.output).includes("PRIVATE PURPOSE")
      };
      console.log("FOREGROUND_OBSERVATION " + JSON.stringify(observed));
      const unfocusedReads = s.reads(),
        unfocusedVisible = s.visible();
      s.state.focused = true;
      await s.emit("focus");
      assert.equal(
        s.visible(),
        true,
        "genuine focus restores same-owner content"
      );
      assert.equal(
        s.state.requests.some((r) => r.body),
        false,
        "lifecycle never writes"
      );
      assert.equal(
        unfocusedReads,
        reads,
        "unfocused resume must not start a pinned private read"
      );
      assert.equal(
        unfocusedVisible,
        false,
        "unfocused resume must remain concealed"
      );
    });
  }

function favoriteEnvironment() {
  const window = new EventTarget(),
    document = new EventTarget();
  const state = {
    focused: true,
    readVisible: true,
    requests: [],
    guard: null,
    entry: null,
    leaf: null
  };
  document.visibilityState = "visible";
  document.hasFocus = () => state.focused;
  window.location = { reload() {} };
  const favoriteId = createHash("sha256")
    .update(JSON.stringify(["exchange-favorite-v1", owner, "listing-a"]))
    .digest("hex");
  const data = {
    ownerId: owner,
    listing: { id: "listing-a", title: "Fictional listing", version: 1 },
    favorite: { id: favoriteId, version: 3, saved: true }
  };
  let timerId = 0;
  const timers = new Map();
  const h = clientHarness({
    window,
    document,
    navigator: { onLine: true },
    Error,
    TypeError,
    AbortController,
    URLSearchParams,
    TextEncoder,
    Uint8Array,
    crypto: { randomUUID, subtle: { digest } },
    confirm: () => true,
    setTimeout(fn) {
      timers.set(++timerId, fn);
      return timerId;
    },
    clearTimeout(id) {
      timers.delete(id);
    },
    setInterval(fn) {
      timers.set(++timerId, fn);
      return timerId;
    },
    clearInterval(id) {
      timers.delete(id);
    },
    fetch: async (path, options) => {
      state.requests.push({ path, ...options });
      if (path === "/api/platform/profile?view=identity")
        return response({ id: owner });
      assert.equal(options.headers["X-Expected-Account"], owner);
      assert.equal(options.cache, "no-store");
      if (options.body) {
        assert.equal(path, "/api/platform/exchange");
        return response({ message: "Controlled lost reply" }, 503);
      }
      const url = new URL(path, "https://fixture.invalid");
      assert.equal(url.pathname, "/api/platform/exchange");
      assert.ok(["listing", "favorite"].includes(url.searchParams.get("view")));
      return response(data);
    }
  });
  const load = (p, m = {}) => h.load(resolve(sourceRoot, p), m);
  const social = load("lib/platform/social-client.ts", {
    "./privileged-auth-navigation": { announcePrivilegedChallenge: () => false }
  });
  const read = {
    "./read-visibility": {
      ReadVisibility: { Provider: "visibility" },
      useReadVisibility: () => state.readVisible
    }
  };
  const guard = load("components/platform/private-snapshot-guard.tsx", {
    "@/lib/platform/social-client": social,
    ...read
  });
  const router = {
    refresh() {
      throw Error("Unexpected router refresh");
    }
  };
  const hook = load("components/platform/use-private-choice-action.tsx", {
    "./use-photo-back-guard": { settlePhotoNavigation: async () => {} },
    "next/navigation": { useRouter: () => router },
    "@/lib/platform/social-client": social,
    ...read,
    "./private-snapshot-guard": guard,
    "./use-unsaved-social-work": { useUnsavedSocialWork() {} }
  });
  const controls = load("components/platform/exchange-saved-controls.tsx", {
    "next/link": { default: "a" },
    "./use-private-choice-action": hook,
    ...read,
    "@/lib/platform/exchange-options": load("lib/platform/exchange-options.ts"),
    "./portal-action-form": { portalInputClass: "" }
  });
  const projection = load("lib/platform/exchange-listing-snapshot.ts");
  const entry = load("components/platform/exchange-favorite-entry.tsx", {
    "@/lib/platform/social-client": social,
    "@/lib/platform/exchange-listing-snapshot": projection,
    "./private-snapshot-guard": guard,
    "./exchange-saved-controls": { ExchangeFavoriteButton: "favorite-leaf" },
    ...read
  });
  const checksum = createHash("sha256")
    .update(JSON.stringify(projection.exchangeListingSnapshot(data)))
    .digest("hex");
  const guardProps = {
    owner,
    url: "/api/platform/exchange?view=listing&id=listing-a",
    checksum,
    project: projection.exchangeListingSnapshot,
    recoverWithoutSnapshot: true,
    children: "stable-child"
  };
  h.mount(() => {
    state.readVisible = true;
    state.guard = guard.PrivateSnapshotGuard(guardProps);
    // Execute the real recovery Provider so the actual hook registers with the
    // actual enclosing guard. Visibility propagation is explicit in this harness.
    state.guard.type(state.guard.props);
    state.readVisible = nodes(
      state.guard,
      (n) => n.type === "visibility"
    )[0].props.value;
    state.entry = entry.ExchangeFavoriteEntry({
      owner,
      listingId: "listing-a"
    });
    state.readVisible = nodes(
      state.entry,
      (n) => n.type === "visibility"
    )[0].props.value;
    const leaf = nodes(state.entry, (n) => n.type === "favorite-leaf")[0];
    state.leaf = leaf ? controls.ExchangeFavoriteButton(leaf.props) : null;
    return [state.guard, state.entry, state.leaf];
  });
  return {
    h,
    state,
    async emit(name) {
      (name === "visibilitychange" ? document : window).dispatchEvent(
        new Event(name)
      );
      h.render();
      await h.settle();
    },
    reads() {
      return state.requests.filter(
        (r) => !r.body && r.path !== "/api/platform/profile?view=identity"
      ).length;
    },
    writes() {
      return state.requests.filter((r) => r.body);
    },
    parentVisible() {
      return nodes(state.guard, (n) => n.type === "visibility")[0].props.value;
    },
    recovery() {
      return nodes(
        state.guard,
        (n) =>
          n.type === "button" && textContent(n) === "Confirm original request"
      );
    }
  };
}
for (const event of ["pageshow", "visibilitychange"])
  test(`favorite: unfocused ${event} cannot re-enable actual pending recovery outside parent mask`, async (t) => {
    const s = favoriteEnvironment();
    t.after(() => s.h.unmount());
    await s.h.settle();
    assert.equal(s.parentVisible(), true);
    const toggle = nodes(
      s.state.leaf,
      (n) => n.type === "button" && n.props["aria-pressed"] === true
    );
    assert.equal(toggle.length, 1);
    toggle[0].props.onClick();
    s.h.render();
    await s.h.settle();
    assert.equal(s.writes().length, 1, "one deliberate uncertain command");
    const originalBody = s.writes()[0].body;
    s.state.focused = false;
    await s.emit("blur");
    assert.equal(s.parentVisible(), false);
    assert.equal(s.recovery().length, 0);
    const reads = s.reads();
    await s.emit("online");
    await s.emit("social-relationships-changed");
    assert.equal(s.reads(), reads);
    await s.emit(event);
    const observed = {
      kind: "favorite",
      event,
      focused: s.state.focused,
      readsAfterBlur: reads,
      readsAfterUnfocusedResume: s.reads(),
      parentVisible: s.parentVisible(),
      outerRecoveryButtons: s.recovery().length,
      favoriteButtonRendered: nodes(
        s.state.leaf,
        (n) => n.type === "button" && "aria-pressed" in n.props
      ).length,
      writes: s.writes().length
    };
    console.log("FOREGROUND_OBSERVATION " + JSON.stringify(observed));
    const unfocusedReads = s.reads(),
      unfocusedRecovery = s.recovery().length;
    assert.equal(
      s.parentVisible(),
      false,
      "corrected parent remains concealed"
    );
    assert.equal(s.writes().length, 1, "no automatic replay");
    s.state.focused = true;
    await s.emit("focus");
    assert.equal(s.parentVisible(), true);
    const retry = nodes(
      s.state.leaf,
      (n) => n.type === "button" && textContent(n) === "Confirm original save"
    );
    assert.equal(retry.length, 1);
    assert.equal(retry[0].props.disabled, false);
    retry[0].props.onClick();
    s.h.render();
    await s.h.settle();
    assert.equal(s.writes().length, 2);
    assert.equal(
      s.writes()[1].body,
      originalBody,
      "genuine focus preserves exact pending body"
    );
    assert.equal(
      unfocusedReads,
      reads,
      "unfocused resume cannot restart favorite access"
    );
    assert.equal(
      unfocusedRecovery,
      0,
      "original recovery must stay unavailable while unfocused"
    );
  });
