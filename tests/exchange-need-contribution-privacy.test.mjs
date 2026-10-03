import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import test from "node:test";
import {
  button,
  clientHarness,
  nodes,
  textContent
} from "./fixtures/client-hook-harness.mjs";

const owner = "contributor-a";
const contribution = (extra = {}) => ({
  id: "contribution-a",
  version: 3,
  state: "COMMITTED",
  quantity: 5,
  received: 3,
  returned: 0,
  createdAt: "2026-10-01T10:00:00.000Z",
  endedAt: null,
  current: true,
  own: true,
  needId: "need-a",
  slotId: "slot-a",
  listingId: "listing-a",
  title: "Private contribution title",
  note: "Private retained contribution note",
  quoteMinor: 18765,
  quoteCurrency: "USD",
  shareName: false,
  disputed: false,
  disputeNote: "",
  loanReturnAt: "2026-10-10T10:00:00.000Z",
  loanResponsibility: "Private loan terms",
  contributor: null,
  ...extra
});
const listPage = (rows = [contribution()]) => ({
  ownerId: owner,
  contributions: rows,
  next: null
});
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
const receipt = (extra = {}) => ({
  id: "contribution-a",
  version: 4,
  message: "Fictional contribution saved",
  ...extra
});

// Execute actual component and command-hook bodies with real pinned transport.
// Timers and presentation boundaries are controlled; this is not a DOM renderer.
function environment(row = contribution()) {
  const window = new EventTarget(),
    document = new EventTarget();
  document.visibilityState = "visible";
  document.hasFocus = () => true;
  window.location = { reload() {} };
  const navigator = { onLine: true },
    deadlines = new Map(),
    intervals = new Map();
  let timerId = 0;
  const requests = [],
    confirmed = [],
    dispatched = [];
  const state = {
    owner,
    visible: true,
    access: true,
    row,
    result: listPage([row]),
    acceptedReceipt: null,
    guard: null,
    recovery: null,
    refreshes: 0,
    identityHandler: null,
    readHandler: null,
    writeHandler: null
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
        digest: async (algorithm, bytes) => {
          assert.equal(algorithm, "SHA-256");
          return Uint8Array.from(createHash("sha256").update(bytes).digest())
            .buffer;
        }
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
        return response(
          receipt({ id: body.id, version: body.expectedVersion + 1 })
        );
      }
      assert.equal(
        new URL(path, "https://fixture.invalid").searchParams.get("view"),
        "need-mine"
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
      useUnsavedSocialWork(value, _blocked, protectBack) {
        state.guard = { ...value, protectBack };
      }
    }
  });
  const controls = h.load("components/platform/exchange-saved-controls.tsx", {
    "next/link": { default: "a" },
    "./use-private-choice-action": hook,
    "./read-visibility": { useReadVisibility: () => state.visible },
    "@/lib/platform/exchange-options": h.load(
      "lib/platform/exchange-options.ts"
    ),
    "./portal-action-form": { portalInputClass: "" }
  });
  const actions = h.load("components/platform/exchange-need-actions.tsx", {
    "next/link": { default: "a" },
    "./exchange-saved-controls": controls,
    "./use-private-choice-action": hook,
    "./read-visibility": { useReadVisibility: () => state.visible },
    "@/lib/platform/exchange-need-options": h.load(
      "lib/platform/exchange-need-options.ts"
    ),
    "@/lib/platform/community-report-types": {
      reportEntryHref: (_type, id) => "/report/" + id
    },
    "./portal-action-form": { portalInputClass: "" },
    "./regional-presentation": { RegionalTime: "time" }
  });
  return {
    h,
    state,
    social,
    hook,
    actions,
    document,
    navigator,
    deadlines,
    intervals,
    requests,
    confirmed,
    dispatched,
    privacy() {
      return {
        currentAccess: state.access,
        onAccessDenied() {
          state.access = false;
        },
        onConfirmed(value) {
          confirmed.push(value);
        }
      };
    },
    emit(name) {
      window.dispatchEvent(new Event(name));
      h.render();
    },
    visible(value) {
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
    }
  };
}
function cardHarness(t, row = contribution(), privacy = true) {
  const s = environment(row);
  s.h.mount(() =>
    s.actions.NeedContributionCard({
      owner,
      row: s.state.row,
      ...(privacy
        ? {
            privacy: s.privacy(),
            acceptedReceipt: s.state.acceptedReceipt,
            onRequest(target) {
              s.dispatched.push(target);
              s.state.acceptedReceipt = null;
            }
          }
        : {})
    })
  );
  t.after(() => s.h.unmount());
  return {
    ...s,
    click(label) {
      button(s.h.output, label).props.onClick();
      s.h.render();
    },
    field(kind = "textarea") {
      return nodes(s.h.output, (n) => n.type === kind)[0];
    },
    change(kind, value) {
      this.field(kind).props.onChange({ target: { value } });
      s.h.render();
    }
  };
}

async function serverPage(after, account = owner) {
  const h = clientHarness({ URLSearchParams });
  const ExchangeNeedContributions = () => null,
    NeedContributionCard = () => null;
  const result = listPage();
  const { ExchangeNeedsPage } = h.load(
    "components/platform/exchange-needs-page.tsx",
    {
      "next/link": { default: "a" },
      "./platform-shell": { PlatformShell: "shell" },
      "./private-snapshot-guard": { PrivateSnapshotGuard: "guard" },
      "./topic-read-boundary": { TopicReadBoundary: "public-guard" },
      "./exchange-page-ui": {
        ExchangeAccountLinks: "account",
        ExchangeNavigation: "navigation",
        ExchangeUnavailable: "unavailable",
        exchangeChecksum: (value) =>
          createHash("sha256").update(JSON.stringify(value)).digest("hex")
      },
      "./exchange-need-forms": {
        NeedClaimForm: "claim",
        NeedSetupForm: "setup",
        NeedSlotForm: "slot"
      },
      "./exchange-need-actions": {
        NeedContributionCard,
        NeedOrganizerActions: "organizer",
        NeedPostLinks: "posts",
        NeedVolunteerReceipt: "volunteer"
      },
      "./exchange-need-contributions": { ExchangeNeedContributions },
      "./regional-presentation": { RegionalTime: "time" },
      "@/lib/platform/session": {
        getCurrentPlatformUser: async () => ({ id: account })
      },
      "@/lib/platform/exchange-session": {
        exchangeNeedPage: async () => result
      },
      "@/lib/platform/exchange-need-options": h.load(
        "lib/platform/exchange-need-options.ts"
      ),
      "@/lib/platform/portal-policy": { PortalError: class extends Error {} },
      "@/lib/platform/post-input": { postId: (id) => id }
    }
  );
  return {
    output: await ExchangeNeedsPage({ query: after ? { after } : {} }),
    Entry: ExchangeNeedContributions
  };
}

test("standalone My Needs bootstrap omits private contribution rows, notes and quotes", async () => {
  const { output, Entry } = await serverPage();
  assert.equal(nodes(output, (n) => n.type === "unavailable").length, 0);
  const serialized = JSON.stringify(output);
  for (const secret of [
    "contribution-a",
    "Private retained contribution note",
    "18765"
  ])
    assert.ok(
      !serialized.includes(secret),
      `Private bootstrap contains ${secret}`
    );
  const entries = nodes(output, (n) => n.type === Entry);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].props.owner, owner);
  assert.ok(
    Object.keys(entries[0].props).every((key) =>
      ["owner", "query"].includes(key)
    )
  );
  assert.equal(entries[0].props.query.view, "mine");
});

test("concealment physically removes saved notes and unsent dispute/return values", (t) => {
  const s = cardHarness(t);
  s.change("textarea", "Unsent private dispute");
  s.change("input", "2");
  s.visible(false);
  assert.equal(
    nodes(s.h.output, (n) => ["textarea", "input"].includes(n.type)).length,
    0
  );
  assert.ok(
    !textContent(s.h.output).includes("Private retained contribution note")
  );
  assert.equal(nodes(s.h.output, (n) => n.type === "a").length, 0);
  s.visible(true);
  assert.equal(s.field().props.value, "Unsent private dispute");
  assert.equal(s.field("input").props.value, "2");
});

for (const malformed of ["target", "version"])
  test(`a wrong contribution receipt ${malformed} retains its original request`, async (t) => {
    const s = cardHarness(t);
    s.state.writeHandler = () =>
      response(
        receipt(
          malformed === "target"
            ? { id: "another-contribution" }
            : { version: 2 }
        )
      );
    s.click("Allow my contributor name to be shown");
    await s.h.settle();
    assert.ok(
      s.state.recovery,
      "Malformed receipt cannot consume the pending contribution request"
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

function acknowledge(s, row, value = s.confirmed.at(-1)) {
  s.state.row = row;
  s.state.acceptedReceipt = value;
  s.h.render();
}

test("attribution acknowledgment preserves dirty return and dispute siblings before sequential commands", async (t) => {
  const s = cardHarness(t);
  s.change("textarea", "Retained dispute sibling");
  s.change("input", "2");
  s.click("Allow my contributor name to be shown");
  await s.h.settle();
  assert.equal(s.confirmed.length, 1);
  acknowledge(s, contribution({ version: 4, shareName: true }));
  assert.equal(s.field().props.value, "Retained dispute sibling");
  assert.equal(s.field("input").props.value, "2");
  assert.equal(s.state.guard.dirty, true);
  s.click("Confirm equipment returned to me");
  await s.h.settle();
  const saved = JSON.parse(s.writes()[1].body);
  assert.equal(saved.operation, "need-confirm-return");
  assert.equal(saved.expectedVersion, 4);
  assert.equal(saved.quantity, 2);
  acknowledge(s, contribution({ version: 5, shareName: true, returned: 2 }));
  assert.equal(s.field().props.value, "Retained dispute sibling");
  assert.equal(s.state.guard.dirty, true);
  s.click("Flag a private dispute");
  await s.h.settle();
  const dispute = JSON.parse(s.writes()[2].body);
  assert.equal(dispute.expectedVersion, 5);
  assert.equal(dispute.note, "Retained dispute sibling");
  acknowledge(
    s,
    contribution({
      version: 6,
      shareName: true,
      returned: 2,
      disputed: true,
      disputeNote: dispute.note
    })
  );
  assert.equal(s.field().props.value, "");
  assert.equal(s.state.guard.dirty, false);
});

test("equal-version or cloned receipt objects cannot acknowledge another card", async (t) => {
  const s = cardHarness(t);
  s.click("Allow my contributor name to be shown");
  await s.h.settle();
  const accepted = s.confirmed[0];
  assert.ok(accepted);
  const row = contribution({ version: 4, shareName: true });
  for (const wrong of [receipt({ id: "contribution-b" }), { ...accepted }]) {
    acknowledge(s, row, wrong);
    s.click("Stop showing my contributor name");
    await s.h.settle();
    assert.equal(s.writes().length, 1);
  }
  acknowledge(s, row, accepted);
  s.click("Stop showing my contributor name");
  await s.h.settle();
  assert.equal(s.writes().length, 2);
  assert.equal(JSON.parse(s.writes()[1].body).expectedVersion, 4);
});

test("hidden accepted receipt cannot reset fields or rearm before visible acknowledgment", async (t) => {
  const s = cardHarness(t);
  const held = deferred();
  s.state.writeHandler = () => held.promise;
  s.change("textarea", "Submitted private dispute");
  s.change("input", "2");
  s.click("Flag a private dispute");
  await s.h.settle();
  s.visible(false);
  s.state.access = false;
  s.h.render();
  held.resolve(response(receipt()));
  await s.h.settle();
  assert.equal(s.confirmed.length, 0);
  assert.equal(
    nodes(s.h.output, (n) => n.type === "textarea" || n.type === "input")
      .length,
    0
  );
  s.state.access = true;
  s.h.render();
  await s.h.settle();
  assert.equal(s.confirmed.length, 1);
  acknowledge(
    s,
    contribution({
      version: 4,
      disputed: true,
      disputeNote: "Submitted private dispute"
    })
  );
  assert.equal(nodes(s.h.output, (n) => n.type === "textarea").length, 0);
  assert.equal(s.state.guard.dirty, true);
  s.visible(true);
  assert.equal(s.field().props.value, "");
  assert.equal(s.field("input").props.value, "2");
  assert.equal(s.state.guard.dirty, true);
});

test("lost, rate-limited and unavailable replies preserve one immutable command across changing row props", async (t) => {
  const s = cardHarness(t);
  s.change("textarea", "Original immutable dispute");
  s.state.writeHandler = () => {
    throw new TypeError("Lost reply");
  };
  s.click("Flag a private dispute");
  await s.h.settle();
  assert.ok(s.state.recovery);
  const original = s.writes()[0].body;
  s.state.row = contribution({ version: 90, note: "Different current value" });
  s.visible(false);
  for (const status of [429, 503]) {
    s.state.writeHandler = () =>
      response({ error: "Temporarily unavailable" }, status);
    s.state.recovery.retry();
    await s.h.settle();
    assert.ok(s.state.recovery);
  }
  s.state.writeHandler = () => response(receipt());
  s.state.recovery.retry();
  await s.h.settle();
  assert.equal(s.writes().length, 4);
  for (const request of s.writes()) assert.equal(request.body, original);
  assert.equal(s.confirmed.length, 1);
  assert.equal(s.state.refreshes, 0);
});

test("back-to-back card commands cannot replace the target or request before React commits", async (t) => {
  const s = cardHarness(t);
  s.change("textarea", "Distinct sibling action");
  const first = button(s.h.output, "Allow my contributor name to be shown")
    .props.onClick;
  const second = button(s.h.output, "Flag a private dispute").props.onClick;
  first();
  second();
  s.h.render();
  await s.h.settle();
  assert.equal(s.writes().length, 1);
  assert.equal(s.dispatched.length, 1);
  assert.equal(JSON.parse(s.writes()[0].body).operation, "need-attribution");
});

test("legacy contribution callers retain their existing command and refresh behavior", async (t) => {
  const s = cardHarness(t, contribution(), false);
  s.click("Allow my contributor name to be shown");
  await s.h.settle();
  assert.equal(s.state.refreshes, 1);
  assert.equal(s.confirmed.length, 0);
  assert.equal(s.dispatched.length, 0);
  assert.equal(JSON.parse(s.writes()[0].body).operation, "need-attribution");
});

function ownerHarness(t, setup, after) {
  const s = environment();
  setup?.(s);
  const NeedContributionCard = () => null,
    router = { refresh() {} };
  const { ExchangeNeedContributions } = s.h.load(
    "components/platform/exchange-need-contributions.tsx",
    {
      "next/link": { default: "a" },
      "next/navigation": { useRouter: () => router },
      "@/lib/platform/social-client": s.social,
      "./exchange-need-actions": { NeedContributionCard },
      "./read-visibility": {
        ReadVisibility: { Provider: "visibility" },
        useReadVisibility: () => s.state.visible
      }
    }
  );
  const query = { view: "mine", ...(after ? { after } : {}) };
  s.h.mount(() => ExchangeNeedContributions({ owner, query }));
  t.after(() => s.h.unmount());
  return {
    ...s,
    cards() {
      return nodes(s.h.output, (n) => n.type === NeedContributionCard);
    },
    card(id = "contribution-a") {
      return this.cards().find((n) => n.props.row.id === id);
    },
    shown() {
      return (
        nodes(s.h.output, (n) => n.type === "visibility")[0]?.props.value ??
        false
      );
    },
    request(id = "contribution-a", expectedVersion = 3) {
      this.card(id).props.onRequest({ id, expectedVersion });
      s.h.render();
    },
    confirm(value = receipt()) {
      this.card(value.id).props.privacy.onConfirmed(value);
      s.h.render();
    },
    retry() {
      const controls = nodes(
        s.h.output,
        (n) =>
          n.type === "button" && /Recheck current access/.test(textContent(n))
      );
      assert.equal(controls.length, 1);
      controls[0].props.onClick();
      s.h.render();
    }
  };
}
const aborted = (signal) =>
  new Promise((_resolve, reject) => {
    if (signal.aborted) return reject(new Error("Aborted owned request"));
    signal.addEventListener(
      "abort",
      () => reject(new Error("Aborted owned request")),
      { once: true }
    );
  });

test("contribution bootstrap waits for a complete pinned first read and retains the supplied page cursor", async (t) => {
  const gate = deferred();
  const s = ownerHarness(
    t,
    (s) => {
      s.state.readHandler = () => gate.promise;
    },
    "cursor-a"
  );
  await s.h.settle();
  assert.equal(s.cards().length, 0);
  assert.equal(s.shown(), false);
  assert.equal(
    new URL(s.reads()[0].path, "https://fixture.invalid").searchParams.get(
      "after"
    ),
    "cursor-a"
  );
  gate.resolve(response(listPage()));
  await s.h.settle();
  assert.equal(s.shown(), true);
  assert.equal(s.card().props.row.note, contribution().note);
  assert.equal(s.card().key, "contribution-a");
});

for (const failure of [
  "denied",
  "wrong-owner",
  "missing-rows",
  "duplicate-id",
  "not-own"
])
  test(`invalid initial ${failure} read never initializes contribution cards`, async (t) => {
    const s = ownerHarness(t, (s) => {
      if (failure === "denied")
        s.state.readHandler = () => response({ error: "Unavailable" }, 403);
      else if (failure === "wrong-owner")
        s.state.result.ownerId = "other-owner";
      else if (failure === "missing-rows") delete s.state.result.contributions;
      else if (failure === "duplicate-id")
        s.state.result.contributions.push(contribution());
      else s.state.result.contributions[0].own = false;
    });
    await s.h.settle();
    assert.equal(s.cards().length, 0);
    assert.equal(s.shown(), false);
    s.state.readHandler = null;
    s.state.result = listPage();
    s.retry();
    await s.h.settle();
    assert.equal(s.shown(), true);
  });

test("all concealment events retain card identity and passive signals cannot reopen it", async (t) => {
  const s = ownerHarness(t);
  await s.h.settle();
  const key = s.card().key;
  for (const event of ["blur", "pagehide", "offline"]) {
    s.emit(event);
    assert.equal(s.shown(), false);
    assert.equal(s.card().props.privacy.currentAccess, false);
    assert.equal(s.card().key, key);
    const before = s.reads().length;
    s.emit("online");
    s.poll();
    await s.h.settle();
    assert.equal(s.reads().length, before);
    assert.equal(s.shown(), false);
    s.emit("focus");
    await s.h.settle();
    assert.equal(s.shown(), true);
  }
});

for (const changed of ["row", "order", "next"])
  test(`unconfirmed contribution ${changed} changes freeze presentation without replacing retained owners`, async (t) => {
    const s = ownerHarness(t, (s) => {
      s.state.result = listPage([
        contribution(),
        contribution({ id: "contribution-b" })
      ]);
    });
    await s.h.settle();
    const original = s.cards().map((card) => card.props.row);
    if (changed === "row")
      s.state.result = listPage([
        contribution({ version: 4 }),
        contribution({ id: "contribution-b" })
      ]);
    else if (changed === "order")
      s.state.result = listPage([...original].reverse());
    else s.state.result = { ...listPage(original), next: "new-page" };
    s.emit("focus");
    await s.h.settle();
    assert.equal(s.shown(), false);
    assert.equal(s.card().props.privacy.currentAccess, true);
    assert.deepEqual(
      s.cards().map((card) => card.props.row),
      original
    );
    assert.equal(s.card().props.acceptedReceipt ?? null, null);
  });

test("one exact receipt cannot authorize changed sibling rows with the same version", async (t) => {
  const second = contribution({ id: "contribution-b" });
  const s = ownerHarness(t, (s) => {
    s.state.result = listPage([contribution(), second]);
  });
  await s.h.settle();
  s.request();
  s.request(second.id);
  s.state.result = listPage([
    contribution({ version: 4, shareName: true }),
    { ...second, version: 4, shareName: true }
  ]);
  const firstReceipt = receipt(),
    secondReceipt = receipt({ id: second.id });
  s.confirm(firstReceipt);
  await s.h.settle();
  assert.equal(s.shown(), false);
  assert.equal(s.card().props.acceptedReceipt ?? null, null);
  s.confirm(secondReceipt);
  await s.h.settle();
  assert.equal(s.shown(), true);
  assert.equal(s.card().props.acceptedReceipt, firstReceipt);
  assert.equal(s.card(second.id).props.acceptedReceipt, secondReceipt);
  assert.deepEqual(
    s.cards().map((card) => card.key),
    ["contribution-a", "contribution-b"]
  );
});

for (const version of [2, 5])
  test(`receipt version four does not accept canonical contribution version ${version}`, async (t) => {
    const s = ownerHarness(t);
    await s.h.settle();
    s.request();
    s.state.result = listPage([contribution({ version })]);
    s.confirm();
    await s.h.settle();
    assert.equal(s.shown(), false);
    assert.equal(s.card().props.acceptedReceipt ?? null, null);
    assert.equal(s.card().props.row.version, 3);
  });

test("hidden receipt waits for current foreground read before exposing exact acceptance", async (t) => {
  const s = ownerHarness(t);
  await s.h.settle();
  s.request();
  const value = receipt();
  s.emit("blur");
  s.state.result = listPage([contribution({ version: 4 })]);
  s.confirm(value);
  await s.h.settle();
  assert.equal(s.shown(), false);
  assert.equal(s.card().props.acceptedReceipt ?? null, null);
  s.emit("focus");
  await s.h.settle();
  assert.equal(s.shown(), true);
  assert.equal(s.card().props.acceptedReceipt, value);
});

for (const phase of ["identity", "data"])
  test(`stalled ${phase} reads abort at the owned deadline and drain one queued fresh check`, async (t) => {
    const s = ownerHarness(t);
    await s.h.settle();
    let signal;
    const hang = (options) => {
      signal = options.signal;
      return aborted(signal);
    };
    if (phase === "identity") s.state.identityHandler = hang;
    else s.state.readHandler = hang;
    s.emit("focus");
    await s.h.settle();
    s.emit("focus");
    s.emit("focus");
    assert.equal(s.shown(), false);
    s.state.identityHandler = null;
    s.state.readHandler = null;
    s.expire();
    await s.h.settle();
    assert.equal(signal.aborted, true);
    assert.equal(s.shown(), true);
    assert.equal(s.card().props.row.note, contribution().note);
    assert.equal(s.deadlines.size, 0);
  });

test("confirmed account replacement clears retained card owners even after blur", async (t) => {
  const held = deferred();
  const s = ownerHarness(t);
  await s.h.settle();
  let count = 0;
  s.state.identityHandler = () =>
    ++count === 1 ? response({ id: "other-owner" }) : held.promise;
  s.emit("focus");
  await s.h.settle();
  s.emit("blur");
  held.resolve(response({ id: "other-owner" }));
  await s.h.settle();
  assert.equal(s.cards().length, 0);
  assert.equal(s.shown(), false);
  s.state.identityHandler = null;
  s.emit("focus");
  await s.h.settle();
  assert.equal(s.cards().length, 0);
});

test("redacted own contributions retain canonical withdrawal and loan-return controls without source disclosures", async (t) => {
  const row = contribution({
    current: false,
    title: "Unavailable need",
    needId: null,
    slotId: null,
    listingId: null,
    note: "",
    quoteMinor: null,
    quoteCurrency: null,
    shareName: false,
    loanResponsibility: "",
    disputeNote: ""
  });
  const s = cardHarness(t, row);
  assert.equal(nodes(s.h.output, (n) => n.type === "textarea").length, 0);
  assert.ok(
    !textContent(s.h.output).includes("Private retained contribution note")
  );
  assert.ok(!textContent(s.h.output).includes("Allow my contributor name"));
  s.change("input", "2");
  s.click("Withdraw remaining promise");
  await s.h.settle();
  acknowledge(s, { ...row, version: 4, state: "CANCELED" });
  assert.equal(s.field("input").props.value, "2");
  assert.equal(s.state.guard.dirty, true);
  s.click("Confirm equipment returned to me");
  await s.h.settle();
  const value = JSON.parse(s.writes()[1].body);
  assert.equal(value.operation, "need-confirm-return");
  assert.equal(value.expectedVersion, 4);
  assert.equal(value.quantity, 2);
});

test("confirmed but missing contribution cannot accept a receipt or silently drop its retained owner", async (t) => {
  const s = ownerHarness(t);
  await s.h.settle();
  s.request();
  s.state.result = listPage([]);
  s.confirm();
  await s.h.settle();
  assert.equal(s.shown(), false);
  assert.ok(s.card());
  assert.equal(s.card().props.acceptedReceipt ?? null, null);
});

test("obsolete identity confirmation cannot clear the draft after a newer foreground check was requested", async (t) => {
  const held = deferred();
  const s = ownerHarness(t);
  await s.h.settle();
  let calls = 0;
  s.state.identityHandler = () =>
    ++calls === 1 ? response({ id: "other-owner" }) : held.promise;
  s.emit("focus");
  await s.h.settle();
  assert.equal(calls, 2);
  s.state.identityHandler = null;
  s.emit("focus");
  assert.equal(s.shown(), false);
  assert.ok(s.card());
  held.resolve(response({ id: "other-owner" }));
  await s.h.settle();
  assert.equal(s.shown(), true);
  assert.equal(s.card().props.row.note, contribution().note);
});

test("unmount aborts the outstanding contribution read without later presenting its result", async (t) => {
  let signal;
  const s = ownerHarness(t, (s) => {
    s.state.readHandler = (options) => {
      signal = options.signal;
      return aborted(signal);
    };
  });
  await s.h.settle();
  s.h.unmount();
  assert.equal(signal.aborted, true);
  await s.h.settle();
  assert.equal(s.cards().length, 0);
  assert.equal(s.deadlines.size, 0);
});

test("server bootstrap keys retained owners by both account and canonical cursor", async () => {
  const first = await serverPage();
  const next = await serverPage("cursor-b");
  const other = await serverPage(undefined, "other-owner");
  const entry = (value) =>
    nodes(value.output, (n) => n.type === value.Entry)[0];
  assert.equal(entry(next).props.query.after, "cursor-b");
  assert.notEqual(entry(first).key, entry(next).key);
  assert.notEqual(entry(first).key, entry(other).key);
  for (const result of [first, next, other]) {
    assert.ok(!JSON.stringify(result.output).includes("contribution-a"));
    assert.ok(
      Object.keys(entry(result).props).every((key) =>
        ["owner", "query"].includes(key)
      )
    );
  }
});

test("a held obsolete data response cannot replace the retained page after a fresh check is queued", async (t) => {
  const s = ownerHarness(t);
  await s.h.settle();
  const originalRow = s.card().props.row;
  const gate = deferred();
  s.state.readHandler = () => gate.promise;
  s.emit("focus");
  await s.h.settle();
  s.state.readHandler = null;
  s.emit("focus");
  assert.equal(s.shown(), false);
  assert.equal(s.card().props.row, originalRow);
  gate.resolve(
    response(
      listPage([
        contribution({ version: 99, note: "Obsolete private response" })
      ])
    )
  );
  await s.h.settle();
  assert.equal(s.shown(), true);
  assert.equal(s.card().props.row.version, 3);
  assert.equal(s.card().props.row.note, contribution().note);
  assert.equal(s.card().props.acceptedReceipt ?? null, null);
});
