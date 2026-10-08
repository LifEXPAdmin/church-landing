import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import test from "node:test";
import {
  button,
  clientHarness,
  nodes,
  textContent
} from "./fixtures/client-hook-harness.mjs";

const owner = "owner-a",
  listingId = "listing-a";
const favoriteId = createHash("sha256")
  .update(JSON.stringify(["exchange-favorite-v1", owner, listingId]))
  .digest("hex");
const favorite = (extra = {}) => ({
  id: favoriteId,
  version: 3,
  saved: true,
  ...extra
});
const page = (value = favorite()) => ({ ownerId: owner, favorite: value });
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
const digest = (algorithm, bytes) => {
  assert.equal(algorithm, "SHA-256");
  return Uint8Array.from(createHash("sha256").update(bytes).digest()).buffer;
};

// Execute actual components, the shared command hook and pinned transport.
// Timers/browser boundaries and component leaves are controlled explicitly.
function environment(value = favorite(), view = "favorite") {
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
    dispatched = [];
  let timerId = 0;
  const state = {
    owner,
    visible: true,
    access: true,
    favorite: value,
    result: page(value),
    acceptedReceipt: null,
    guard: null,
    recovery: null,
    refreshes: 0,
    identityHandler: null,
    readHandler: null,
    writeHandler: null,
    digestHandler: null
  };
  const h = clientHarness({
    window,
    document,
    navigator,
    Error,
    TypeError,
    AbortController,
    URLSearchParams,
    TextEncoder,
    Uint8Array,
    confirm: () => true,
    crypto: {
      randomUUID,
      subtle: {
        digest: async (...args) =>
          state.digestHandler ? state.digestHandler(...args) : digest(...args)
      }
    },
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
      assert.equal(options.headers["X-Expected-Account"], owner);
      assert.equal(options.cache, "no-store");
      if (options.body) {
        assert.equal(path, "/api/platform/exchange");
        if (state.writeHandler) return state.writeHandler(options);
        const body = JSON.parse(options.body);
        return response({
          id: favoriteId,
          version: body.expectedVersion + 1,
          message: "Fictional favorite saved"
        });
      }
      const url = new URL(path, "https://fixture.invalid");
      assert.equal(url.pathname, "/api/platform/exchange");
      assert.equal(url.searchParams.get("view"), view);
      assert.equal(
        url.searchParams.get(view === "listing" ? "id" : "listingId"),
        listingId
      );
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
    "next/navigation": {
      useRouter: () => ({
        refresh() {
          state.refreshes++;
        }
      })
    },
    "@/lib/platform/social-client": social,
    "./read-visibility": { useReadVisibility: () => state.visible },
    "./private-snapshot-guard": {
      usePrivateRecovery(_id, pending, busy, retry, allowed) {
        state.recovery = pending ? { busy, retry, allowed } : null;
      }
    },
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
    document,
    navigator,
    deadlines,
    requests,
    confirmed,
    dispatched,
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
    visibility(value) {
      document.visibilityState = value;
      document.dispatchEvent(new Event("visibilitychange"));
      h.render();
    },
    expire() {
      for (const [id, fn] of [...deadlines]) {
        deadlines.delete(id);
        fn();
      }
      h.render();
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
    },
    reads() {
      return requests.filter(
        (r) => !r.body && r.path !== "/api/platform/profile?view=identity"
      );
    }
  };
}
function leafHarness(t, value = favorite()) {
  const s = environment(value);
  const { ExchangeFavoriteButton } = s.h.load(
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
    ExchangeFavoriteButton({
      owner,
      listingId,
      favoriteId,
      favorite: s.state.favorite,
      privacy: s.privacy(),
      acceptedReceipt: s.state.acceptedReceipt,
      onRequest(target) {
        s.dispatched.push(target);
        s.state.acceptedReceipt = null;
      }
    })
  );
  t.after(() => s.h.unmount());
  return {
    ...s,
    control() {
      return nodes(
        s.h.output,
        (n) => n.type === "button" && "aria-pressed" in n.props
      )[0];
    },
    click() {
      this.control().props.onClick();
      s.h.render();
    },
    accept(receipt, value) {
      s.state.acceptedReceipt = receipt;
      s.state.favorite = value;
      s.h.render();
    }
  };
}

test("favorite server bootstrap retains listing authorization but sends no favorite row", async () => {
  const h = clientHarness({ URLSearchParams });
  const result = {
    listing: {
      id: listingId,
      version: 7,
      intent: "FREE",
      state: "ACTIVE",
      audience: "PUBLIC",
      title: "Fictional listing",
      description: "Public description",
      category: "FURNITURE",
      condition: "GOOD",
      owner: {
        id: "publisher",
        name: "Fictional publisher",
        username: "publisher"
      }
    },
    canSave: true,
    canManage: false,
    structuredNeed: null,
    favorite: favorite()
  };
  let reads = 0;
  const ExchangeFavoriteEntry = () => null,
    ExchangeFavoriteButton = () => null;
  const projection = h.load("lib/platform/exchange-listing-snapshot.ts");
  const { default: Page } = h.load("app/platform/exchange/[id]/page.tsx", {
    "next/link": { default: "a" },
    "@/lib/platform/share-metadata": { publicResourceMetadata: async () => ({}) },
    "@/lib/indexing-policy": { publicPageIdentity: () => ({ filtered: false }) },
    "@/components/platform/public-structured-data": {
      PublicStructuredData: "public-structured-data"
    },
    "@/components/platform/public-share-controls": {
      PublicShareControls: "public-share-controls"
    },
    "@/components/platform/interchurch-help-page": {
      InterchurchHelpPage: "help"
    },
    "@/components/platform/exchange-handoff-page": {
      ExchangeInquiryEntry: "inquiry"
    },
    "@/lib/platform/exchange-navigation": {
      exchangeReturnHref: () => "/platform/exchange"
    },
    "@/components/platform/platform-shell": { PlatformShell: "shell" },
    "@/components/platform/topic-read-boundary": {
      TopicReadBoundary: "public-guard"
    },
    "@/components/platform/private-snapshot-guard": {
      PrivateSnapshotGuard: "private-guard"
    },
    "@/components/platform/relationship-controls": {
      RelationshipControls: "relationships"
    },
    "@/components/platform/exchange-saved-controls": { ExchangeFavoriteButton },
    "@/components/platform/exchange-favorite-entry": {
      ExchangeFavoriteEntry,
      ExchangeListingGuard: "listing-guard"
    },
    "@/lib/platform/exchange-listing-snapshot": projection,
    "@/components/platform/exchange-photos": { ExchangePhotos: "photos" },
    "@/components/platform/regional-presentation": { RegionalWallTime: "time" },
    "@/components/platform/exchange-page-ui": {
      ExchangeNavigation: "nav",
      ExchangePrice: "price",
      ExchangeUnavailable: "unavailable",
      exchangeChecksum: (data) =>
        createHash("sha256").update(JSON.stringify(data)).digest("hex")
    },
    "@/lib/platform/session": {
      getCurrentPlatformUser: async () => ({ id: owner })
    },
    "@/lib/platform/exchange-session": {
      exchangeListingPage: async (id) => {
        assert.equal(id, listingId);
        reads++;
        return result;
      }
    },
    "@/lib/platform/exchange-options": h.load(
      "lib/platform/exchange-options.ts"
    )
  });
  const output = await Page({
    params: Promise.resolve({ id: listingId }),
    searchParams: Promise.resolve({})
  });
  assert.equal(reads, 1);
  assert.ok(
    !JSON.stringify(output).includes(favoriteId),
    "Private favorite identity must not be a serialized page prop"
  );
  const entry = nodes(output, (n) => n.type === ExchangeFavoriteEntry);
  assert.equal(entry.length, 1);
  assert.deepEqual(Object.keys(entry[0].props).sort(), ["listingId", "owner"]);
  assert.equal(entry[0].props.owner, owner);
  assert.equal(entry[0].props.listingId, listingId);
  const guard = nodes(output, (n) => n.type === "listing-guard");
  assert.equal(guard.length, 1);
  assert.equal(
    guard[0].props.checksum,
    createHash("sha256")
      .update(JSON.stringify(projection.exchangeListingSnapshot(result)))
      .digest("hex")
  );
});

test("concealed favorite physically omits its saved-state button and label", (t) => {
  const s = leafHarness(t);
  assert.equal(s.control().props["aria-pressed"], true);
  s.setVisible(false);
  assert.equal(nodes(s.h.output, (n) => "aria-pressed" in n.props).length, 0);
  assert.ok(!textContent(s.h.output).includes("Remove favorite"));
  s.setVisible(true);
  assert.equal(s.control().props["aria-pressed"], true);
});

for (const malformed of ["target", "version"])
  test(`a wrong favorite receipt ${malformed} retains the exact pending command`, async (t) => {
    const s = leafHarness(t);
    s.state.writeHandler = () =>
      response({
        id: malformed === "target" ? "unrelated-favorite" : favoriteId,
        version: malformed === "version" ? 2 : 4,
        message: "Injected old or unrelated receipt"
      });
    s.click();
    await s.h.settle();
    assert.ok(
      s.state.recovery,
      "A malformed receipt cannot consume the original pending request"
    );
    assert.equal(s.confirmed.length, 0);
    assert.equal(s.state.refreshes, 0);
    const original = s.writes()[0].body;
    s.state.writeHandler = null;
    s.state.recovery.retry();
    await s.h.settle();
    assert.equal(s.writes()[1].body, original);
    assert.equal(s.confirmed.length, 1);
  });

function ownerHarness(t, value = favorite(), setup) {
  const s = environment(value);
  setup?.(s);
  const ExchangeFavoriteButton = () => null;
  const projection = s.h.load("lib/platform/exchange-listing-snapshot.ts");
  const { ExchangeFavoriteEntry } = s.h.load(
    "components/platform/exchange-favorite-entry.tsx",
    {
      "next/link": { default: "a" },
      "@/lib/platform/social-client": s.social,
      "@/lib/platform/exchange-listing-snapshot": projection,
      "./private-snapshot-guard": { PrivateSnapshotGuard: "listing-guard" },
      "./exchange-saved-controls": { ExchangeFavoriteButton },
      "./read-visibility": {
        ReadVisibility: { Provider: "visibility" },
        useReadVisibility: () => s.state.visible
      }
    }
  );
  s.h.mount(() => ExchangeFavoriteEntry({ owner, listingId }));
  t.after(() => s.h.unmount());
  return {
    ...s,
    leaf() {
      return nodes(s.h.output, (n) => n.type === ExchangeFavoriteButton)[0];
    },
    visible() {
      return (
        nodes(s.h.output, (n) => n.type === "visibility")[0]?.props.value ??
        false
      );
    },
    request(expectedVersion = 3) {
      this.leaf().props.onRequest({ id: favoriteId, expectedVersion });
      s.h.render();
    },
    confirm(receipt) {
      this.leaf().props.privacy.onConfirmed(receipt);
      s.h.render();
    }
  };
}
const receipt = (version = 4) => ({
  id: favoriteId,
  version,
  message: "Fictional favorite saved"
});

test("an unsaved favorite validates its deterministic identity before accepting the first receipt", async (t) => {
  const s = leafHarness(t, null);
  assert.equal(s.control().props["aria-pressed"], false);
  s.click();
  await s.h.settle();
  const body = JSON.parse(s.writes()[0].body);
  assert.equal(body.operation, "favorite-add");
  assert.equal(body.listingId, listingId);
  assert.equal(body.expectedVersion, 0);
  assert.equal(s.dispatched.length, 1);
  assert.equal(s.dispatched[0].id, favoriteId);
  assert.equal(s.dispatched[0].expectedVersion, 0);
  assert.equal(s.confirmed[0].id, favoriteId);
  assert.equal(s.confirmed[0].version, 1);
  assert.equal(s.control().props.disabled, true);
  assert.equal(s.state.refreshes, 0);
});

test("lost favorite removal survives hidden retries and changing props without replacing its exact request", async (t) => {
  const s = leafHarness(t);
  s.state.writeHandler = () => {
    throw new TypeError("Fictional reply lost");
  };
  s.click();
  await s.h.settle();
  const original = s.writes()[0].body;
  s.state.favorite = favorite({ version: 5, saved: true });
  s.setVisible(false);
  assert.equal(s.control(), undefined);
  assert.ok(s.state.recovery);
  for (const status of [429, 503]) {
    s.state.writeHandler = () =>
      response({ message: "Fictional retry failure" }, status);
    s.state.recovery.retry();
    await s.h.settle();
    assert.ok(s.state.recovery);
    assert.equal(s.control(), undefined);
  }
  s.state.writeHandler = null;
  s.state.recovery.retry();
  await s.h.settle();
  assert.equal(s.writes().length, 4);
  assert.ok(s.writes().every((r) => r.body === original));
  assert.equal(JSON.parse(original).expectedVersion, 3);
  assert.equal(s.confirmed.length, 1);
  assert.equal(s.control(), undefined);
});

test("favorite reuse requires the identical consumed receipt at a visible boundary and adopts a newer current version", async (t) => {
  const s = leafHarness(t);
  s.click();
  await s.h.settle();
  const first = s.confirmed[0];
  assert.ok(first);
  s.accept({ ...first }, favorite({ version: 5, saved: true }));
  await s.h.settle();
  assert.equal(
    s.control().props.disabled,
    true,
    "An equal receipt object is not the consumed object"
  );
  s.setVisible(false);
  s.accept(first, favorite({ version: 5, saved: true }));
  await s.h.settle();
  assert.equal(s.control(), undefined);
  s.setVisible(true);
  await s.h.settle();
  assert.equal(s.control().props.disabled, false);
  s.click();
  await s.h.settle();
  const next = JSON.parse(s.writes()[1].body);
  assert.equal(next.expectedVersion, 5);
  assert.equal(next.favoriteId, favoriteId);
  assert.notEqual(next.mutationId, JSON.parse(s.writes()[0].body).mutationId);
  s.accept(first, favorite({ version: 6, saved: false }));
  await s.h.settle();
  assert.equal(
    s.control().props.disabled,
    true,
    "The first acceptance cannot rearm the second command"
  );
  s.accept(s.confirmed[1], favorite({ version: 6, saved: false }));
  await s.h.settle();
  assert.equal(s.control().props.disabled, false);
  assert.equal(s.control().props["aria-pressed"], false);
});

test("back-to-back favorite clicks register one immutable target and one command", async (t) => {
  const s = leafHarness(t);
  const click = s.control().props.onClick;
  click();
  click();
  await s.h.settle();
  assert.equal(s.dispatched.length, 1);
  assert.equal(s.writes().length, 1);
  assert.equal(s.confirmed.length, 1);
});

test("a favorite conflict cannot rearm or issue a new command without deliberate reload", async (t) => {
  const s = leafHarness(t);
  s.state.writeHandler = () =>
    response({ message: "Fictional newer version" }, 409);
  s.click();
  await s.h.settle();
  assert.equal(s.state.recovery, null);
  assert.equal(s.control().props.disabled, true);
  assert.equal(s.confirmed.length, 0);
  assert.ok(button(s.h.output, "Reload current saved choices"));
  s.control().props.onClick();
  await s.h.settle();
  assert.equal(s.writes().length, 1);
});

for (const value of [null, favorite()])
  test(`favorite initialization holds ${value ? "saved" : "empty"} state until a complete current read`, async (t) => {
    const held = deferred();
    const s = ownerHarness(t, value, (s) => {
      s.state.readHandler = () => held.promise;
    });
    await s.h.settle();
    assert.equal(s.leaf(), undefined);
    assert.equal(s.visible(), false);
    held.resolve(response(page(value)));
    await s.h.settle();
    assert.equal(s.visible(), true);
    assert.equal(s.leaf().props.favorite, value);
    assert.equal(s.leaf().props.favoriteId, favoriteId);
    assert.equal(s.leaf().props.owner, owner);
    assert.equal(s.reads().length, 1);
    assert.equal(s.deadlines.size, 0);
  });

for (const invalid of ["denial", "owner", "favorite", "missing"])
  test(`initial favorite ${invalid} cannot initialize a command owner`, async (t) => {
    const s = ownerHarness(t, favorite(), (s) => {
      s.state.readHandler = () =>
        invalid === "denial"
          ? response({ message: "Fictional eligibility denial" }, 403)
          : response(
              invalid === "owner"
                ? { ...page(), ownerId: "owner-b" }
                : invalid === "favorite"
                  ? page(favorite({ id: "foreign-favorite" }))
                  : { ownerId: owner }
            );
    });
    await s.h.settle();
    assert.equal(s.leaf(), undefined);
    assert.equal(s.visible(), false);
    s.state.readHandler = null;
    button(s.h.output, "Recheck current access").props.onClick();
    await s.h.settle();
    assert.equal(s.visible(), true);
  });

test("favorite owner survives concealment but passive events cannot restore private presentation", async (t) => {
  const s = ownerHarness(t);
  await s.h.settle();
  const initial = s.leaf();
  for (const event of ["blur", "pagehide", "offline", "hidden"]) {
    if (event === "hidden") s.visibility("hidden");
    else s.emit(event);
    assert.equal(s.visible(), false);
    assert.equal(s.leaf().props.privacy.currentAccess, false);
    const before = s.reads().length;
    s.emit("online");
    s.emit("social-relationships-changed");
    s.poll();
    await s.h.settle();
    assert.equal(s.reads().length, before);
    assert.equal(s.visible(), false);
    s.document.visibilityState = "visible";
    s.emit("focus");
    await s.h.settle();
    assert.equal(s.visible(), true);
    assert.equal(s.leaf().key, initial.key);
    assert.equal(s.leaf().props.favorite, initial.props.favorite);
  }
  s.setVisible(false);
  assert.equal(s.visible(), false);
  assert.equal(
    s.leaf().props.privacy.currentAccess,
    true,
    "Outer listing concealment must not disable a separately authorized exact retry"
  );
});

test("an unexpected favorite change stays concealed without rebasing an original command", async (t) => {
  const s = ownerHarness(t);
  await s.h.settle();
  const initial = s.leaf().props.favorite;
  s.request();
  s.state.result = page(favorite({ version: 4, saved: false }));
  s.emit("focus");
  await s.h.settle();
  assert.equal(s.visible(), false);
  assert.equal(s.leaf().props.privacy.currentAccess, true);
  assert.equal(s.leaf().props.favorite, initial);
  assert.equal(s.leaf().props.acceptedReceipt, null);
});

for (const version of [4, 5])
  test(`an exact favorite receipt accepts current canonical version ${version} without inferring acknowledgment from the row`, async (t) => {
    const s = ownerHarness(t);
    await s.h.settle();
    s.request();
    const accepted = receipt(),
      current = favorite({ version, saved: version === 5 });
    s.state.result = page(current);
    s.confirm(accepted);
    await s.h.settle();
    assert.equal(s.visible(), true);
    assert.equal(s.leaf().props.favorite, current);
    assert.equal(s.leaf().props.acceptedReceipt, accepted);
    s.request(version);
    assert.equal(s.leaf().props.acceptedReceipt, null);
  });

for (const current of [null, favorite({ version: 2 })])
  test(`confirmed favorite with ${current ? "older" : "missing"} canonical state stays concealed without rearm`, async (t) => {
    const s = ownerHarness(t);
    await s.h.settle();
    const initial = s.leaf().props.favorite;
    s.request();
    s.state.result = page(current);
    s.confirm(receipt());
    await s.h.settle();
    assert.equal(s.visible(), false);
    assert.equal(s.leaf().props.favorite, initial);
    assert.equal(s.leaf().props.acceptedReceipt, null);
  });

test("a hidden favorite receipt and an older held read cannot acknowledge or present stale state", async (t) => {
  const s = ownerHarness(t);
  await s.h.settle();
  const initial = s.leaf().props.favorite,
    held = deferred();
  s.state.readHandler = () => held.promise;
  s.emit("focus");
  await s.h.settle();
  s.request();
  s.emit("blur");
  const accepted = receipt();
  s.confirm(accepted);
  held.resolve(response(page(initial)));
  await s.h.settle();
  assert.equal(s.visible(), false);
  assert.equal(s.leaf().props.acceptedReceipt, null);
  assert.equal(s.leaf().props.favorite, initial);
  const current = favorite({ version: 4, saved: false });
  s.state.result = page(current);
  s.state.readHandler = null;
  s.emit("focus");
  await s.h.settle();
  assert.equal(s.visible(), true);
  assert.equal(s.leaf().props.favorite, current);
  assert.equal(s.leaf().props.acceptedReceipt, accepted);
});

for (const stage of ["identity", "favorite"])
  test(`a hung favorite ${stage} read aborts and drains a queued current check`, async (t) => {
    const s = ownerHarness(t);
    await s.h.settle();
    const initial = s.leaf(),
      signals = [];
    const hold = (options) =>
      new Promise((_resolve, reject) => {
        signals.push(options.signal);
        options.signal.addEventListener(
          "abort",
          () => reject(options.signal.reason),
          { once: true }
        );
      });
    if (stage === "identity") s.state.identityHandler = hold;
    else s.state.readHandler = hold;
    s.emit("focus");
    await s.h.settle();
    s.emit("focus");
    await s.h.settle();
    assert.equal(signals.length, 1, "Only one access read may be in flight");
    s.state.identityHandler = null;
    s.state.readHandler = null;
    s.expire();
    await s.h.settle();
    assert.equal(signals[0].aborted, true);
    assert.equal(s.deadlines.size, 0);
    assert.equal(s.visible(), true);
    assert.equal(s.leaf().key, initial.key);
    assert.equal(s.leaf().props.favorite, initial.props.favorite);
  });

test("confirmed replacement account clears favorite ownership despite concurrent blur", async (t) => {
  const s = ownerHarness(t);
  await s.h.settle();
  s.state.identityHandler = () => {
    s.emit("blur");
    return response({ id: "owner-b" });
  };
  s.emit("focus");
  await s.h.settle();
  assert.equal(s.leaf(), undefined);
  assert.equal(s.visible(), false);
  assert.match(textContent(s.h.output), /sign-in changed/i);
  s.state.identityHandler = null;
  s.emit("focus");
  await s.h.settle();
  assert.equal(
    s.leaf(),
    undefined,
    "A cleared owner cannot silently return on A-to-B-to-A"
  );
});

test("listing projection ignores only favorite state and preserves every other checksum input", () => {
  const h = clientHarness();
  const { exchangeListingSnapshot: project } = h.load(
    "lib/platform/exchange-listing-snapshot.ts"
  );
  const data = {
    listing: {
      id: listingId,
      version: 7,
      audience: "PUBLIC",
      title: "Fictional listing"
    },
    favorite: favorite(),
    canSave: true,
    canManage: false,
    structuredNeed: { id: "need-a", remaining: 2 },
    futurePermission: { allowed: true }
  };
  const checksum = (value) =>
    createHash("sha256")
      .update(JSON.stringify(project(value)))
      .digest("hex");
  const projected = project(data),
    expected = { ...data, favorite: null };
  assert.deepEqual(JSON.parse(JSON.stringify(projected)), expected);
  assert.equal(projected.listing, data.listing);
  assert.equal(
    data.favorite.saved,
    true,
    "Projection must not mutate the canonical response"
  );
  assert.equal(
    checksum(data),
    checksum({ ...data, favorite: favorite({ version: 9, saved: false }) })
  );
  assert.equal(checksum(data), checksum({ ...data, favorite: null }));
  for (const change of [
    { listing: { ...data.listing, version: 8 } },
    { listing: { ...data.listing, audience: "CHURCH" } },
    { canSave: false },
    { canManage: true },
    { structuredNeed: { ...data.structuredNeed, remaining: 0 } },
    { futurePermission: { allowed: false } }
  ])
    assert.notEqual(checksum(data), checksum({ ...data, ...change }));
  for (const invalid of [null, undefined, [], "listing", 42])
    assert.throws(() => project(invalid));
});

test("the listing guard passes the actual projection without replacing its existing guard contract", () => {
  const s = environment();
  const projection = s.h.load("lib/platform/exchange-listing-snapshot.ts");
  const PrivateSnapshotGuard = () => null;
  const { ExchangeListingGuard } = s.h.load(
    "components/platform/exchange-favorite-entry.tsx",
    {
      "next/link": { default: "a" },
      "@/lib/platform/social-client": s.social,
      "@/lib/platform/exchange-listing-snapshot": projection,
      "./private-snapshot-guard": { PrivateSnapshotGuard },
      "./exchange-saved-controls": { ExchangeFavoriteButton: () => null },
      "./read-visibility": {
        ReadVisibility: { Provider: "visibility" },
        useReadVisibility: () => true
      }
    }
  );
  const children = {
    type: "article",
    props: { children: "Fictional listing" }
  };
  const props = {
    owner,
    url: "/api/platform/exchange?view=listing&id=listing-a",
    checksum: "canonical-checksum",
    label: "listing",
    children
  };
  const result = ExchangeListingGuard(props);
  assert.equal(result.type, PrivateSnapshotGuard);
  for (const key of Object.keys(props))
    assert.equal(result.props[key], props[key]);
  assert.equal(result.props.project, projection.exchangeListingSnapshot);
  assert.equal(result.props.recoverWithoutSnapshot, true);
});

test("an obsolete replacement-account read cannot clear a favorite after a newer current-owner check was requested", async (t) => {
  const s = ownerHarness(t);
  await s.h.settle();
  const initial = s.leaf(),
    held = deferred();
  let calls = 0;
  s.state.identityHandler = () =>
    ++calls === 1 ? response({ id: "owner-b" }) : held.promise;
  s.emit("focus");
  await s.h.settle();
  assert.equal(calls, 2);
  s.emit("focus");
  assert.equal(s.visible(), false);
  s.state.identityHandler = null;
  held.resolve(response({ id: "owner-b" }));
  await s.h.settle();
  assert.equal(s.visible(), true);
  assert.equal(s.leaf().key, initial.key);
  assert.equal(s.leaf().props.favorite, initial.props.favorite);
});

test("unmount cancels the favorite owner's current read without starting a queued replacement", async (t) => {
  let signal;
  const s = ownerHarness(t, favorite(), (s) => {
    s.state.readHandler = (options) =>
      new Promise((_resolve, reject) => {
        signal = options.signal;
        signal.addEventListener("abort", () => reject(signal.reason), {
          once: true
        });
      });
  });
  await s.h.settle();
  s.emit("focus");
  const count = s.requests.length;
  s.h.unmount();
  await s.h.settle();
  assert.equal(signal.aborted, true);
  assert.equal(s.requests.length, count);
  assert.equal(s.deadlines.size, 0);
  assert.equal(s.leaf(), undefined);
});

test("favorite pending recovery registers current actor authority independently of hidden listing presentation", async (t) => {
  const s = leafHarness(t);
  s.state.writeHandler = () => {
    throw new TypeError("Fictional reply lost");
  };
  s.click();
  await s.h.settle();
  s.setVisible(false);
  assert.equal(s.state.recovery.allowed, true);
  const original = s.writes()[0].body;
  s.state.access = false;
  s.h.render();
  assert.equal(s.state.recovery.allowed, false);
  s.state.recovery.retry();
  await s.h.settle();
  assert.equal(
    s.writes().length,
    1,
    "Revoked actor authority cannot dispatch an original retry"
  );
  s.state.access = true;
  s.h.render();
  assert.equal(s.state.recovery.allowed, true);
  s.state.writeHandler = null;
  s.state.recovery.retry();
  await s.h.settle();
  assert.equal(s.writes()[1].body, original);
  assert.equal(s.control(), undefined);
});

function guardHarness(
  t,
  {
    optIn = false,
    projected = false,
    failure = 404,
    changedFavorite = false
  } = {}
) {
  const s = environment(favorite(), "listing");
  const initial = {
    listing: { id: listingId, version: 7 },
    favorite: favorite(),
    canSave: true
  };
  s.state.result = changedFavorite
    ? { ...initial, favorite: favorite({ version: 4, saved: false }) }
    : initial;
  s.state.failure = failure;
  s.state.readHandler = () =>
    s.state.failure
      ? response({ message: "Fictional listing unavailable" }, s.state.failure)
      : response(s.state.result);
  const projection = s.h.load("lib/platform/exchange-listing-snapshot.ts");
  const { PrivateSnapshotGuard } = s.h.load(
    process.env.FAVORITE_GUARD_SOURCE ??
      "components/platform/private-snapshot-guard.tsx",
    {
      "@/lib/platform/social-client": s.social,
      "./read-visibility": {
        ReadVisibility: { Provider: "visibility" },
        useReadVisibility: () => true
      }
    }
  );
  let retries = 0;
  const children = {
    type: "article",
    props: { children: "Fictional retained listing" }
  };
  const checksum = createHash("sha256")
    .update(
      JSON.stringify(
        projected ? projection.exchangeListingSnapshot(initial) : initial
      )
    )
    .digest("hex");
  s.h.mount(() =>
    PrivateSnapshotGuard({
      owner,
      url: "/api/platform/exchange?view=listing&id=listing-a",
      checksum,
      label: "listing",
      children,
      ...(optIn ? { recoverWithoutSnapshot: true } : {}),
      ...(projected ? { project: projection.exchangeListingSnapshot } : {})
    })
  );
  t.after(() => s.h.unmount());
  return {
    ...s,
    get retries() {
      return retries;
    },
    register(allowed, busy = false, present = true) {
      s.h.output.props.value(
        "favorite-original",
        present
          ? {
              allowed,
              busy,
              retry() {
                retries++;
              }
            }
          : null
      );
      s.h.render();
    },
    recoveryButtons() {
      return nodes(
        s.h.output,
        (n) =>
          n.type === "button" &&
          ["Confirm original request", "Confirming original request…"].includes(
            textContent(n)
          )
      );
    },
    visible() {
      return nodes(s.h.output, (n) => n.type === "visibility")[0].props.value;
    },
    hiddenTree() {
      return nodes(
        s.h.output,
        (n) => n.type === "div" && "inert" in n.props
      )[0];
    },
    refresh() {
      button(s.h.output, "Recheck current access").props.onClick();
      s.h.render();
    }
  };
}

test("shared listing guard permits independent retained recovery only by explicit opt-in", async (t) => {
  for (const [optIn, allowed, expected] of [
    [false, true, 0],
    [true, undefined, 0],
    [true, false, 0],
    [true, true, 1]
  ]) {
    const s = guardHarness(t, { optIn });
    await s.h.settle();
    s.register(allowed);
    assert.equal(s.recoveryButtons().length, expected);
    assert.equal(s.visible(), false);
    assert.equal(s.hiddenTree().props.hidden, true);
    assert.equal(
      nodes(s.hiddenTree(), (n) => n.type === "button").length,
      0,
      "Recovery must be outside the concealed listing subtree"
    );
    if (expected) {
      assert.equal(s.recoveryButtons()[0].props.disabled, false);
      s.recoveryButtons()[0].props.onClick();
      assert.equal(s.retries, 1);
      assert.equal(
        s.visible(),
        false,
        "Retry authority does not reveal the listing"
      );
    }
    s.h.unmount();
  }
});

test("shared listing guard removes independent recovery when authority or pending work is withdrawn", async (t) => {
  const s = guardHarness(t, { optIn: true });
  await s.h.settle();
  s.register(true, true);
  assert.equal(s.recoveryButtons().length, 1);
  assert.equal(s.recoveryButtons()[0].props.disabled, true);
  s.register(false);
  assert.equal(s.recoveryButtons().length, 0);
  s.register(true);
  assert.equal(s.recoveryButtons().length, 1);
  s.register(true, false, false);
  assert.equal(s.recoveryButtons().length, 0);
  assert.equal(s.visible(), false);
  assert.equal(s.retries, 0);
});

test("shared listing guard preserves default checksums and existing recovery while its projection ignores only favorites", async (t) => {
  const original = guardHarness(t, { failure: 0, changedFavorite: true });
  await original.h.settle();
  assert.equal(
    original.visible(),
    false,
    "Default checksum must still include favorite state"
  );
  original.register(undefined);
  assert.equal(
    original.recoveryButtons().length,
    1,
    "Existing canonical access still permits legacy recovery without the new authority option"
  );
  const projected = guardHarness(t, {
    failure: 0,
    changedFavorite: true,
    projected: true
  });
  await projected.h.settle();
  assert.equal(projected.visible(), true);
  projected.state.result = {
    ...projected.state.result,
    listing: { ...projected.state.result.listing, version: 8 }
  };
  projected.emit("focus");
  await projected.h.settle();
  assert.equal(
    projected.visible(),
    false,
    "Listing changes remain in the actual guard checksum"
  );
});
