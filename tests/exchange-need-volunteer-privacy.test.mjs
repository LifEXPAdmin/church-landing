import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  clientHarness,
  input,
  nodes,
  textContent
} from "./fixtures/client-hook-harness.mjs";

const owner = "organizer-a";
const signup = {
  id: "private-signup-marker",
  version: 2,
  name: "Private volunteer name",
  state: "ACTIVE",
  completedAt: "2026-10-01T12:00:00.000Z"
};

async function volunteerServer(extra = {}) {
  const h = clientHarness({ URLSearchParams });
  const calls = [];
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
        NeedContributionCard: "contribution",
        NeedOrganizerActions: "organizer",
        NeedPostLinks: "posts",
        NeedVolunteerReceipt: "volunteer"
      },
      "./exchange-need-contributions": {
        ExchangeNeedContributions: "contributions"
      },
      "./exchange-need-volunteers": {
        ExchangeNeedVolunteers: "volunteers-client"
      },
      "./exchange-need-progress": {
        ExchangeNeedProgressProvider: ({ children }) => children,
        NeedSlotProgress: "progress"
      },
      "./regional-presentation": { RegionalTime: "time" },
      "@/lib/platform/session": {
        getCurrentPlatformUser: async () => ({ id: owner })
      },
      "@/lib/platform/exchange-session": {
        exchangeNeedPage: async (query) => {
          calls.push(query);
          return query.view === "volunteers"
            ? {
                ownerId: owner,
                volunteerNeedId: "listing-a",
                volunteerSlotId: "slot-a",
                volunteerRole: "Private volunteer role",
                volunteers: [signup],
                next: "private-next-signup",
                ...extra
              }
            : {
                listingId: "listing-a",
                title: "Public need",
                listingState: "ACTIVE",
                canManage: false,
                canCoordinate: false,
                need: {
                  id: "listing-a",
                  version: 1,
                  open: true,
                  coordinatorCurrent: true,
                  names: [],
                  updates: [],
                  slots: [],
                  contributions: []
                }
              };
        }
      },
      "@/lib/platform/exchange-need-options": h.load(
        "lib/platform/exchange-need-options.ts"
      ),
      "@/lib/platform/portal-policy": { PortalError: class extends Error {} },
      "@/lib/platform/post-input": { postId: (id) => id }
    }
  );
  const page = await ExchangeNeedsPage({
    listingId: "listing-a",
    query: { volunteers: "slot-a" }
  });
  const [boundary] = nodes(
    page,
    (node) =>
      typeof node.type === "function" && node.type.name === "VolunteerNeeds"
  );
  assert.ok(boundary, "Expected actual volunteer server boundary");
  const output = await boundary.type(boundary.props);

  return { output, calls };
}

test("volunteer bootstrap omits signup identities, names, role and pagination data", async () => {
  const { output, calls } = await volunteerServer();
  assert.equal(nodes(output, (n) => n.type === "unavailable").length, 0);
  const serialized = JSON.stringify(output);
  for (const secret of [
    signup.id,
    signup.name,
    "Private volunteer role",
    "private-next-signup"
  ]) {
    assert.ok(
      !serialized.includes(secret),
      `Private volunteer bootstrap contains ${secret}`
    );
  }
  assert.equal(calls[1].view, "volunteers");
  assert.equal(calls[1].id, "slot-a");
});

test("concealed volunteer controls omit names and unsent corrections while retaining the edit", () => {
  const h = clientHarness();
  let visible = true;
  const action = {
    blocked: false,
    status: null,
    rearm: () => true,
    command: async () => ({})
  };
  const actions = h.load("components/platform/exchange-need-actions.tsx", {
    "next/link": { default: "a" },
    "./use-private-choice-action": { usePrivateChoiceAction: () => action },
    "./read-visibility": { useReadVisibility: () => visible },
    "@/lib/platform/exchange-need-options": h.load(
      "lib/platform/exchange-need-options.ts"
    ),
    "@/lib/platform/community-report-types": {
      reportEntryHref: () => "/report"
    },
    "./exchange-saved-controls": { useExchangeAction: () => action },
    "./portal-action-form": { portalInputClass: "" },
    "./regional-presentation": { RegionalTime: "time" }
  });
  h.mount(() =>
    actions.NeedVolunteerReceipt({
      owner,
      needId: "listing-a",
      signup,
      privacy: {
        currentAccess: true,
        onConfirmed() {},
        onConflict() {},
        onAccountChanged() {}
      }
    })
  );
  input(h.output, "Reason for correcting completed help").props.onChange({
    target: { value: "Private unsent correction" }
  });
  h.render();
  visible = false;
  h.render();
  assert.equal(
    nodes(h.output, (node) =>
      ["textarea", "input", "button"].includes(node.type)
    ).length,
    0
  );
  assert.ok(!textContent(h.output).includes(signup.name));
  visible = true;
  h.render();
  assert.equal(
    input(h.output, "Reason for correcting completed help").props.value,
    "Private unsent correction"
  );
  h.unmount();
});

const pageData = (extra = {}) => ({
  ownerId: owner,
  volunteerNeedId: "listing-a",
  volunteerSlotId: "slot-a",
  volunteerRole: "Private role",
  volunteers: [signup],
  next: "private-cursor",
  ...extra
});
function pageHarness(t, initial = pageData()) {
  const window = new EventTarget(),
    document = new EventTarget();
  document.visibilityState = "visible";
  let focused = true;
  document.hasFocus = () => focused;
  window.location = { reload() {} };
  const state = {
    data: initial,
    owner,
    error: null,
    reads: 0,
    refreshes: 0,
    totals: 0
  };
  const timers = new Map();
  let timerId = 0;
  const h = clientHarness({
    window,
    document,
    navigator: { onLine: true },
    Error,
    URLSearchParams,
    AbortController,
    setTimeout: (fn) => {
      timers.set(++timerId, fn);
      return timerId;
    },
    clearTimeout: (id) => timers.delete(id),
    setInterval: () => 0,
    clearInterval() {}
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
    }
  };
  const refresh = async () => {
    state.totals++;
  };
  const provider = () => {};
  const mod = h.load("components/platform/exchange-need-volunteers.tsx", {
    "next/link": { default: "a" },
    "next/navigation": { useRouter: () => router },
    "./read-visibility": {
      ReadVisibility: { Provider: provider },
      useReadVisibility: () => true
    },
    "./exchange-need-actions": { NeedVolunteerReceipt: "card" },
    "./exchange-need-progress": {
      useNeedProgressRefresh: (account, id) => {
        assert.equal(account, owner);
        assert.equal(id, "listing-a");
        return refresh;
      }
    },
    "@/lib/platform/social-client": {
      SocialClientError,
      currentSocialOwner: async () => state.owner,
      socialRequest: async (url, body, account, method, dispatch, signal) => {
        assert.equal(account, owner);
        assert.equal(body, undefined);
        assert.ok(signal);
        const query = new URL(url, "https://fixture.invalid").searchParams;
        assert.equal(query.get("view"), "need-volunteers");
        assert.equal(query.get("id"), "slot-a");
        state.reads++;
        if (state.error) throw state.error;
        return { data: state.data };
      }
    }
  });
  const entry = mod.ExchangeNeedVolunteers({
    owner,
    needId: "listing-a",
    slotId: "slot-a",
    path: "/need-a"
  });
  h.mount(() => entry.type(entry.props));
  t.after(() => h.unmount());
  return {
    h,
    state,
    SocialClientError,
    window,
    document,
    setFocused(value) {
      focused = value;
    },
    shown() {
      return nodes(h.output, (n) => n.type === provider)[0].props.value;
    },
    card() {
      return nodes(h.output, (n) => n.type === "card")[0]?.props;
    },
    async recheck() {
      window.dispatchEvent(new Event("focus"));
      await h.settle();
    },
    hide() {
      window.dispatchEvent(new Event("blur"));
      h.render();
    }
  };
}

test("canonical volunteer read is account, need and slot bound and conceals metadata on blur", async (t) => {
  const s = pageHarness(t);
  await s.h.settle();
  assert.equal(s.shown(), true);
  assert.ok(textContent(s.h.output).includes("Private role"));
  assert.equal(nodes(s.h.output, (n) => n.type === "a").length, 1);
  s.hide();
  assert.equal(s.shown(), false);
  assert.ok(!textContent(s.h.output).includes("Private role"));
  assert.equal(nodes(s.h.output, (n) => n.type === "a").length, 0);
  await s.recheck();
  assert.equal(s.shown(), true);
});

for (const [name, extra] of Object.entries({
  owner: { ownerId: "other" },
  need: { volunteerNeedId: "other" },
  slot: { volunteerSlotId: "other" },
  duplicates: { volunteers: [signup, signup] },
  excessive: {
    volunteers: Array.from({ length: 21 }, (_, i) => ({
      ...signup,
      id: String(i)
    }))
  },
  version: { volunteers: [{ ...signup, version: 1.5 }] },
  state: { volunteers: [{ ...signup, state: "UNKNOWN" }] },
  date: { volunteers: [{ ...signup, completedAt: "invalid" }] },
  name: { volunteers: [{ ...signup, name: null }] },
  cursor: { next: 23 }
}))
  test(`volunteer read fails closed for malformed ${name}`, async (t) => {
    const s = pageHarness(t, pageData(extra));
    await s.h.settle();
    assert.equal(s.shown(), false);
    assert.equal(s.card(), undefined);
  });

test("account A to B to A clears volunteer owners permanently until reload", async (t) => {
  const s = pageHarness(t);
  await s.h.settle();
  s.state.owner = "other";
  s.state.error = new s.SocialClientError(401);
  await s.recheck();
  assert.equal(s.card(), undefined);
  assert.equal(s.shown(), false);
  const reads = s.state.reads;
  s.state.owner = owner;
  s.state.error = null;
  await s.recheck();
  assert.equal(s.card(), undefined);
  assert.equal(s.state.reads, reads);
});

test("only exact command receipt and canonical completion state refresh public totals", async (t) => {
  const s = pageHarness(t);
  await s.h.settle();
  s.card().onRequest({ id: signup.id, expectedVersion: 2, completed: false });
  s.card().privacy.onConfirmed({
    id: signup.id,
    version: 4,
    message: "wrong version"
  });
  await s.h.settle();
  assert.equal(s.state.refreshes, 0);
  s.state.data = pageData({ volunteers: [{ ...signup, version: 3 }] });
  const receipt = { id: signup.id, version: 3, message: "Saved" };
  s.card().privacy.onConfirmed(receipt);
  await s.h.settle();
  assert.equal(s.shown(), false);
  assert.equal(s.state.refreshes, 0);
  s.state.data = pageData({
    volunteers: [{ ...signup, version: 3, completedAt: null }]
  });
  await s.recheck();
  assert.equal(s.shown(), true);
  assert.equal(s.card().acceptedReceipt, receipt);
  assert.equal(s.state.refreshes, 1);
  assert.equal(s.state.totals, 1);
});

test("a confirmed row cannot authorize changes to its private name or sibling", async (t) => {
  const second = { ...signup, id: "second" };
  const s = pageHarness(t, pageData({ volunteers: [signup, second] }));
  await s.h.settle();
  s.card().onRequest({ id: signup.id, expectedVersion: 2, completed: false });
  s.state.data = pageData({
    volunteers: [
      { ...signup, version: 3, completedAt: null },
      { ...second, name: "Changed sibling" }
    ]
  });
  s.card().privacy.onConfirmed({ id: signup.id, version: 3, message: "Saved" });
  await s.h.settle();
  assert.equal(s.shown(), false);
  assert.equal(s.state.refreshes, 0);
  s.state.data = pageData({
    volunteers: [
      { ...signup, version: 3, completedAt: null, name: "Changed name" },
      second
    ]
  });
  await s.recheck();
  assert.equal(s.shown(), false);
  assert.equal(s.state.refreshes, 0);
});

for (const field of ["ownerId", "volunteerNeedId", "volunteerSlotId"]) {
  test(`server volunteer boundary rejects mismatched ${field}`, async () => {
    const { output } = await volunteerServer({ [field]: "other" });
    assert.equal(nodes(output, (n) => n.type === "unavailable").length, 1);
    assert.equal(
      nodes(output, (n) => n.type === "volunteers-client").length,
      0
    );
  });
}

test("retained volunteer owner resets on account, need, slot or cursor replacement", () => {
  const h = clientHarness();
  const loaded = h.load("components/platform/exchange-need-volunteers.tsx", {
    "next/link": {},
    "next/navigation": {},
    "@/lib/platform/social-client": {},
    "./exchange-need-progress": {},
    "./exchange-need-actions": {},
    "./read-visibility": {}
  });
  const props = {
    owner,
    needId: "need-a",
    slotId: "slot-a",
    after: "cursor-a",
    path: "/need-a"
  };
  const key = loaded.ExchangeNeedVolunteers(props).key;
  for (const field of ["owner", "needId", "slotId", "after"])
    assert.notEqual(
      loaded.ExchangeNeedVolunteers({ ...props, [field]: "different" }).key,
      key
    );
  assert.equal(
    loaded.ExchangeNeedVolunteers({ ...props, path: "/another-path" }).key,
    key
  );
});


// Controlled Node hook-lifetime admission checks, not React DOM or native focus
// evidence. The separate Chrome harness runs the actual React component tree.
test("visible unfocused passive volunteer events do not read or restore access", async (t) => {
  const s = pageHarness(t);
  await s.h.settle();
  assert.equal(s.shown(), true);
  const before = { reads: s.state.reads, refreshes: s.state.refreshes, totals: s.state.totals };
  s.hide();
  s.setFocused(false);
  assert.equal(s.document.visibilityState, "visible");
  assert.equal(s.document.hasFocus(), false);
  try {
    s.window.dispatchEvent(new Event("pageshow"));
    s.document.dispatchEvent(new Event("visibilitychange"));
    await s.h.settle();
    assert.deepEqual(
      { reads: s.state.reads, presented: s.shown(), currentAccess: s.card()?.privacy.currentAccess,
        refreshes: s.state.refreshes, totals: s.state.totals },
      { ...before, presented: false, currentAccess: false },
      "Visible/unfocused passive events must preserve the concealed admission boundary"
    );
    assert.ok(!textContent(s.h.output).includes("Private role"));
    assert.equal(nodes(s.h.output, (n) => n.type === "a").length, 0);
  } finally {
    s.setFocused(true);
    await s.recheck();
  }
  assert.equal(s.shown(), true, "True focused recheck restores the original current snapshot");
  assert.ok(s.state.reads > before.reads);
});

test("visible unfocused active volunteer refresh does not admit a direct load", async (t) => {
  const s = pageHarness(t);
  await s.h.settle();
  assert.equal(s.shown(), true);
  const before = { reads: s.state.reads, refreshes: s.state.refreshes, totals: s.state.totals };
  // Deliberately change only the focus predicate while active remains true.
  // This isolates load admission from blur/recheck; it is not an OS event claim.
  s.setFocused(false);
  assert.equal(s.document.visibilityState, "visible");
  assert.equal(s.document.hasFocus(), false);
  try {
    s.window.dispatchEvent(new Event("social-relationships-changed"));
    await s.h.settle();
    assert.deepEqual(
      { reads: s.state.reads, refreshes: s.state.refreshes, totals: s.state.totals },
      before,
      "The active refresh path must check actual foreground admission before another private read"
    );
  } finally {
    s.setFocused(true);
    await s.recheck();
  }
  assert.equal(s.shown(), true);
  assert.ok(s.state.reads > before.reads, "Focused recovery still performs a current read");
});
