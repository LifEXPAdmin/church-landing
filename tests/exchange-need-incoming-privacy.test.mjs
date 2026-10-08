import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import test from "node:test";
import {
  button,
  clientHarness,
  input,
  nodes,
  textContent
} from "./fixtures/client-hook-harness.mjs";

const owner = "coordinator-a";
const needId = "need-a";
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
  own: false,
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
  contributor: { name: "Private contributor name" },
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
    progressRefreshes: 0,
    progressListings: [],
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
      const query = new URL(path, "https://fixture.invalid").searchParams;
      assert.equal(query.get("view"), "need-contributors");
      assert.equal(query.get("id"), needId);
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

async function incomingServer(after, account = owner, need = null) {
  const h = clientHarness({ URLSearchParams });
  const ExchangeNeedContributions = () => null,
    NeedContributionCard = () => null;
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
        NeedContributionCard,
        NeedOrganizerActions: "organizer",
        NeedPostLinks: "posts",
        NeedVolunteerReceipt: "volunteer"
      },
      "./exchange-need-contributions": { ExchangeNeedContributions },
      "./exchange-need-progress": {
        ExchangeNeedProgressProvider: ({ children }) => children,
        NeedSlotProgress: "progress"
      },
      "./regional-presentation": { RegionalTime: "time" },
      "@/lib/platform/session": {
        getCurrentPlatformUser: async () => ({ id: account })
      },
      "@/lib/platform/exchange-session": {
        exchangeNeedPage: async (query) => {
          calls.push(query);
          return query.view === "contributors"
            ? listPage()
            : {
                listingId: needId,
                title: "Public need title",
                listingState: "ACTIVE",
                canManage: false,
                canCoordinate: false,
                need
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
    listingId: needId,
    query: { view: "contributors", ...(after ? { after } : {}) }
  });
  const incoming = nodes(
    page,
    (n) => typeof n.type === "function" && n.type.name === "IncomingNeeds"
  );
  assert.equal(incoming.length, 1);
  const output = await incoming[0].type(incoming[0].props);
  assert.equal(nodes(output, (n) => n.type === "unavailable").length, 0);
  const [entry] = nodes(output, (n) => n.type === ExchangeNeedContributions);
  assert.ok(entry);
  return {
    page,
    output,
    Entry: ExchangeNeedContributions,
    Card: NeedContributionCard,
    calls,
    entry
  };
}

test("incoming coordinator bootstrap omits contribution identities, names, notes and quotes", async () => {
  const { output, entry, calls } = await incomingServer();
  const serialized = JSON.stringify(output);
  for (const secret of [
    "contribution-a",
    "Private contributor name",
    "Private retained contribution note",
    "18765"
  ])
    assert.ok(
      !serialized.includes(secret),
      `Private incoming bootstrap contains ${secret}`
    );
  assert.equal(calls[1].view, "contributors");
  assert.equal(calls[1].id, needId);
  assert.equal(entry.props.owner, owner);
  assert.equal(entry.props.query.view, "incoming");
  assert.equal(entry.props.query.needId, needId);
  assert.equal(entry.props.query.path, `/platform/exchange/${needId}/needs`);
  assert.equal("contributions" in entry.props, false);
});

test("progress client props contain only public counters, not the complete slot", async () => {
  const { page } = await incomingServer(undefined, owner, {
    id: needId,
    version: 1,
    open: true,
    coordinatorCurrent: true,
    names: [],
    updates: [],
    contributions: [],
    slots: [
      {
        id: "slot-a",
        action: "DONATE",
        label: "Food parcels",
        status: "Open",
        target: 10,
        unit: "parcels",
        committed: 5,
        received: 2,
        returned: 0,
        loan: false,
        volunteer: { signup: { id: "private-signup-marker" } }
      }
    ]
  });
  const [provider] = nodes(
    page,
    (node) =>
      typeof node.type === "function" &&
      node.type.name === "ExchangeNeedProgressProvider"
  );
  const [counter] = nodes(page, (node) => node.type === "progress");
  assert.ok(
    provider && counter,
    "The actual need page renders both progress boundaries"
  );
  assert.equal(provider.props.needVersion, 1);
  const fields = [
    "id",
    "status",
    "target",
    "unit",
    "committed",
    "received",
    "returned",
    "loan"
  ];
  assert.deepEqual(
    Object.keys(provider.props.slots[0]).sort(),
    [...fields].sort()
  );
  assert.deepEqual(Object.keys(counter.props.slot).sort(), [...fields].sort());
  assert.ok(
    !JSON.stringify(provider.props.slots).includes("private-signup-marker")
  );
  assert.ok(
    !JSON.stringify(counter.props.slot).includes("private-signup-marker")
  );
});

function incomingReader(t, row = contribution({ contributor: null }), after) {
  const s = environment(row);
  s.state.result = listPage([row]);
  const router = {
    refresh() {
      s.state.refreshes++;
    }
  };
  const visibility = s.h.load("components/platform/read-visibility.ts");
  const refreshProgress = async () => {
    s.state.progressRefreshes++;
    s.state.progressListings.push([owner, needId]);
  };
  const loaded = s.h.load(
    "components/platform/exchange-need-contributions.tsx",
    {
      "next/link": { default: "a" },
      "next/navigation": { useRouter: () => router },
      "@/lib/platform/social-client": s.social,
      "./exchange-need-actions": {
        NeedContributionCard: s.actions.NeedContributionCard
      },
      "./exchange-need-progress": {
        useNeedProgressRefresh: (account, listingId) => {
          assert.equal(account, owner);
          assert.equal(listingId, needId);
          return refreshProgress;
        }
      },
      "./read-visibility": visibility
    }
  );
  const query = {
    view: "incoming",
    needId,
    path: `/platform/exchange/${needId}/needs`,
    ...(after ? { after } : {})
  };
  s.h.mount(() => loaded.ExchangeNeedContributions({ owner, query }));
  t.after(() => s.h.unmount());
  return s;
}

test("incoming reader requests the current coordinator-only page and admits only its account, need and row projection", async (t) => {
  const row = contribution({ contributor: null });
  const s = incomingReader(t, row, "cursor-z");
  assert.ok(!JSON.stringify(s.h.output).includes(row.id));
  await s.h.settle();
  const read = s.reads()[0];
  assert.ok(read);
  const url = new URL(read.path, "https://fixture.invalid");
  assert.equal(url.searchParams.get("view"), "need-contributors");
  assert.equal(url.searchParams.get("id"), needId);
  assert.equal(url.searchParams.get("after"), "cursor-z");
  assert.equal(read.method, "GET");
  assert.equal(read.headers["X-Expected-Account"], owner);
  assert.equal(read.cache, "no-store");
  assert.equal(
    nodes(s.h.output, (n) => n.type === s.actions.NeedContributionCard).length,
    1
  );
  assert.ok(!textContent(s.h.output).includes("Private contributor name"));
});

test("incoming reader rejects a different account, another need and unredacted self rows", async (t) => {
  const row = contribution({ contributor: null });
  const staleSelf = contribution({
    own: true,
    current: false,
    needId: null,
    slotId: null,
    listingId: null,
    title: "Unavailable need",
    note: "Private retained contribution note",
    quoteMinor: null,
    quoteCurrency: null,
    shareName: false,
    disputeNote: "",
    loanResponsibility: "",
    contributor: null
  });
  const cases = [
    {
      page: { ...listPage([row]), ownerId: "coordinator-b" },
      secret: row.note
    },
    {
      page: listPage([contribution({ contributor: null, needId: "need-b" })]),
      secret: row.note
    },
    { page: listPage([staleSelf]), secret: staleSelf.note }
  ];
  for (const { page, secret } of cases) {
    const s = incomingReader(t, row);
    s.state.readHandler = async () => response(page);
    await s.h.settle();
    assert.equal(
      nodes(s.h.output, (n) => n.type === s.actions.NeedContributionCard)
        .length,
      0
    );
    assert.ok(!JSON.stringify(s.h.output).includes(row.id));
    assert.ok(!textContent(s.h.output).includes(secret));
  }
});

test("incoming reader accepts a coordinator's own row only in the canonical redacted form", async (t) => {
  const row = contribution({
    own: true,
    current: false,
    needId: null,
    slotId: null,
    listingId: null,
    title: "Unavailable need",
    note: "",
    quoteMinor: null,
    quoteCurrency: null,
    shareName: false,
    disputeNote: "",
    loanResponsibility: "",
    contributor: null
  });
  const s = incomingReader(t, row);
  await s.h.settle();
  assert.equal(
    nodes(s.h.output, (n) => n.type === s.actions.NeedContributionCard).length,
    1
  );
  assert.ok(
    !textContent(s.h.output).includes("Private retained contribution note")
  );
});

test("an exactly acknowledged incoming receipt refreshes the parent need summary", async (t) => {
  const row = contribution({ contributor: null });
  const s = incomingReader(t, row);
  await s.h.settle();
  assert.equal(s.state.refreshes, 0);
  const [card] = nodes(
    s.h.output,
    (n) => n.type === s.actions.NeedContributionCard
  );
  s.state.result = listPage([
    contribution({ ...row, version: 4, received: 5 })
  ]);
  card.props.onRequest({ id: row.id, expectedVersion: row.version });
  card.props.privacy.onConfirmed({
    id: row.id,
    version: 4,
    message: "Receipt accepted"
  });
  await s.h.settle();
  assert.equal(s.state.refreshes, 1);
  assert.equal(s.state.progressRefreshes, 1);
  assert.deepEqual(s.state.progressListings, [[owner, needId]]);
  const [updated] = nodes(
    s.h.output,
    (n) => n.type === s.actions.NeedContributionCard
  );
  assert.equal(updated.props.row.received, 5);
});

test("incoming card omits sharing-disabled names and removes private drafts from concealed DOM while retaining the values", async (t) => {
  const row = contribution({
    shareName: false,
    contributor: { name: "Private contributor name" }
  });
  const s = cardHarness(t, row, true);
  assert.ok(!textContent(s.h.output).includes("Private contributor name"));
  input(
    s.h.output,
    "Correction reason, required when reducing a receipt or return"
  ).props.onChange({
    target: { value: "Private unsent coordinator correction" }
  });
  input(s.h.output, "Total equipment actually returned").props.onChange({
    target: { value: "1" }
  });
  s.h.render();
  s.visible(false);
  assert.equal(
    nodes(s.h.output, (n) => ["textarea", "input"].includes(n.type)).length,
    0
  );
  assert.equal(
    nodes(
      s.h.output,
      (n) =>
        n.type === "button" &&
        textContent(n).includes("Record equipment return")
    ).length,
    0
  );
  assert.ok(
    !textContent(s.h.output).includes("Private retained contribution note")
  );
  assert.ok(!textContent(s.h.output).includes("Private contributor name"));
  s.visible(true);
  assert.equal(
    input(
      s.h.output,
      "Correction reason, required when reducing a receipt or return"
    ).props.value,
    "Private unsent coordinator correction"
  );
  assert.equal(
    input(s.h.output, "Total equipment actually returned").props.value,
    "1"
  );
});

test("need progress island adopts only the current account and need summary", async (t) => {
  const h = clientHarness({
    window: {},
    URLSearchParams,
    AbortController,
    setTimeout,
    clearTimeout
  });
  let summary = {
    ownerId: owner,
    listingId: "listing-a",
    need: {
      id: "listing-a",
      version: 1,
      slots: [
        {
          id: "slot-a",
          status: "Covered, receipt pending",
          target: 10,
          unit: "parcels",
          committed: 10,
          received: 0,
          returned: 0,
          loan: false,
          privateNote: "Fictional coordinator note",
          contributor: { name: "Fictional private contributor" }
        }
      ]
    }
  };
  const progress = h.load("components/platform/exchange-need-progress.tsx", {
    "@/lib/platform/social-client": {
      socialRequest: async (path, body, account) => {
        assert.equal(
          path,
          "/api/platform/exchange?view=need-need&listingId=listing-a"
        );
        assert.equal(body, undefined);
        assert.equal(account, owner);
        return { owner: account, data: summary };
      }
    }
  });
  let slot = {
    id: "slot-a",
    status: "Covered, receipt pending",
    target: 10,
    unit: "parcels",
    committed: 10,
    received: 0,
    returned: 0,
    loan: false
  };
  let refresh;
  h.mount(() => {
    const provider = progress.ExchangeNeedProgressProvider({
      owner,
      listingId: "listing-a",
      needVersion: 1,
      slots: [slot],
      children: null
    });
    const context = provider.type(provider.props);
    context.type(context.props);
    refresh = progress.useNeedProgressRefresh(owner, "listing-a");
    return progress.NeedSlotProgress({ owner, listingId: "listing-a", slot });
  });
  t.after(() => h.unmount());
  assert.match(textContent(h.output), /Committed: 10\. Received: 0\./);

  summary = {
    ...summary,
    need: {
      ...summary.need,
      version: 2,
      slots: [{ ...summary.need.slots[0], received: 5 }]
    }
  };
  await refresh();
  h.render();
  assert.match(textContent(h.output), /Committed: 10\. Received: 5\./);
  assert.match(textContent(h.output), /Unreceived target: 5 parcels\./);
  assert.ok(!textContent(h.output).includes("Fictional coordinator note"));
  assert.ok(!textContent(h.output).includes("Fictional private contributor"));

  summary = { ...summary, ownerId: "another-account" };
  await assert.rejects(refresh());
  h.render();
  assert.match(textContent(h.output), /Committed: 10\. Received: 5\./);

  summary = { ...summary, ownerId: owner, listingId: "another-listing" };
  await assert.rejects(refresh());
  h.render();
  assert.match(textContent(h.output), /Committed: 10\. Received: 5\./);
});
