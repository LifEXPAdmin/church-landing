import assert from "node:assert/strict";
import test from "node:test";
import {
  button,
  clientHarness,
  input,
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
const inquiry = (extra = {}) => ({
  id: "inquiry-a",
  version: 3,
  planVersion: 1,
  state: "SELECTED",
  side: "incoming",
  listing: { id: "listing-a", title: "Private fixture listing" },
  person: { name: "Private fixture participant", username: null },
  purpose: "Private fixture inquiry purpose",
  createdAt: "2026-10-01T12:00:00.000Z",
  expiresAt: "2026-10-04T12:00:00.000Z",
  windowStart: "2026-10-04T12:00:00.000Z",
  windowEnd: "2026-10-04T13:00:00.000Z",
  timeZone: "UTC",
  pickupDetails: "Saved private pickup",
  cancelReason: null,
  cancelNote: "",
  available: true,
  reportable: true,
  pickupReportable: false,
  noShowAvailable: false,
  history: [{ action: "SELECTED", version: 3, at: "2026-10-01T12:00:00.000Z" }],
  canClear: false,
  completionRecordedBy: null,
  endedAt: null,
  ...extra
});

// Execute the real transport, action hook and component bodies. Timers and leaf
// infrastructure are controlled; this is not a React DOM or browser substitute.
function environment() {
  const window = new EventTarget(),
    document = new EventTarget(),
    navigator = { onLine: true };
  document.visibilityState = "visible";
  document.hasFocus = () => true;
  window.location = { reload() {} };
  let timerId = 0;
  const deadlines = new Map(),
    intervals = new Map(),
    requests = [],
    confirmed = [],
    requested = [],
    navigations = [];
  const state = {
    owner: "owner-a",
    visible: true,
    access: true,
    dirty: true,
    guard: null,
    identityHandler: null,
    readHandler: null,
    writeHandler: null,
    settleHandler: async () => {},
    receiptVersion: 4,
    inquiry: inquiry(),
    acceptedVersion: undefined
  };
  const defaults = {
    ownerId: "owner-a",
    version: 1,
    recoveryRequired: false,
    available: true,
    fields: {
      intent: "GIVE",
      audience: "PUBLIC",
      audienceChurchId: null,
      country: "",
      placeId: null,
      pickupDetails: "Copied private pickup"
    },
    churches: [],
    place: null
  };
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
      assert.equal(
        ms,
        15000,
        "Access and defaults reads own a bounded deadline"
      );
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
        return state.writeHandler
          ? state.writeHandler(options)
          : response({
              id: "inquiry-a",
              version: state.receiptVersion,
              message: "Fictional handoff saved"
            });
      }
      if (state.readHandler) return state.readHandler(options, path);
      if (path === "/api/platform/exchange?view=defaults")
        return response(defaults);
      assert.equal(
        path,
        "/api/platform/exchange?view=handoff-detail&id=inquiry-a"
      );
      return response({ ownerId: "owner-a", inquiry: state.inquiry });
    }
  });
  const social = h.load("lib/platform/social-client.ts", {
    "./privileged-auth-navigation": {
      announcePrivilegedChallenge: (data) =>
        data.code === "PRIVILEGED_AUTH_REQUIRED"
    }
  });
  const hook = h.load("components/platform/use-private-choice-action.tsx", {
    "./use-photo-back-guard": {
      settlePhotoNavigation: () => state.settleHandler()
    },
    "next/navigation": {
      useRouter: () => ({
        push: (path) => navigations.push(path),
        refresh() {}
      })
    },
    "@/lib/platform/social-client": social,
    "./private-snapshot-guard": { usePrivateRecovery() {} },
    "./read-visibility": { useReadVisibility: () => state.visible },
    "./use-unsaved-social-work": {
      useUnsavedSocialWork(value) {
        state.guard = value;
      }
    }
  });
  const privacy = () => ({
    currentAccess: state.access,
    expectedReceiptId: () => "inquiry-a",
    preserveDirty: true,
    onAccessDenied() {
      state.access = false;
    },
    onConfirmed(value) {
      confirmed.push(value);
    }
  });
  return {
    h,
    state,
    social,
    hook,
    privacy,
    defaults,
    requests,
    confirmed,
    requested,
    navigations,
    document,
    navigator,
    deadlines,
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
    writes() {
      return requests.filter((request) => request.body);
    },
    setVisible(value) {
      state.visible = value;
      h.render();
    }
  };
}
function actionHarness(t, extra = {}) {
  const s = environment();
  s.state.inquiry = inquiry(extra);
  const { ExchangeHandoffActions } = s.h.load(
    "components/platform/exchange-handoff-controls.tsx",
    {
      "next/link": { default: "a" },
      "@/lib/platform/exchange-handoff-options": s.h.load(
        "lib/platform/exchange-handoff-options.ts"
      ),
      "@/lib/platform/social-client": s.social,
      "./read-visibility": { useReadVisibility: () => s.state.visible },
      "./exchange-saved-controls": {
        useExchangeAction: (...args) =>
          s.hook.usePrivateChoiceAction("/api/platform/exchange", ...args)
      },
      "./use-private-choice-action": s.hook,
      "./portal-action-form": { portalInputClass: "" }
    }
  );
  s.h.mount(() =>
    ExchangeHandoffActions({
      owner: "owner-a",
      inquiry: s.state.inquiry,
      privacy: s.privacy(),
      acceptedVersion: s.state.acceptedVersion,
      onRequest: (operation) => s.requested.push(operation)
    })
  );
  t.after(() => s.h.unmount());
  return {
    ...s,
    change(label, value) {
      input(s.h.output, label).props.onChange({ target: { value } });
      s.h.render();
    },
    submitPlan() {
      nodes(s.h.output, (n) => n.type === "form")[0].props.onSubmit({
        preventDefault() {}
      });
      s.h.render();
    },
    adopt(value, acceptedVersion = value.version) {
      s.state.inquiry = value;
      s.state.acceptedVersion = acceptedVersion;
      s.h.render();
    }
  };
}
const pickupLabel = "Private pickup instructions (optional)",
  noteLabel = "Private explanation (optional)";

test("server detail bootstrap keeps authorization but serializes only owner and inquiry identity", async () => {
  const h = clientHarness({ URLSearchParams });
  const ExchangeHandoffDetail = () => null,
    ExchangeHandoffActions = () => null,
    calls = [];
  const options = h.load("lib/platform/exchange-handoff-options.ts");
  const { ExchangeHandoffsPage } = h.load(
    "components/platform/exchange-handoff-page.tsx",
    {
      "next/link": { default: "a" },
      "./platform-shell": { PlatformShell: "shell" },
      "./private-snapshot-guard": { PrivateSnapshotGuard: "guard" },
      "./exchange-page-ui": {
        ExchangeNavigation: "navigation",
        ExchangeAccountLinks: "account",
        ExchangeUnavailable: "unavailable",
        exchangeChecksum: () => "fictional-checksum"
      },
      "./exchange-handoff-controls": { ExchangeHandoffActions },
      "./exchange-handoff-detail": { ExchangeHandoffDetail },
      "./exchange-inquiry-composer": { ExchangeInquiryComposer: "composer" },
      "./exchange-defaults-entry": { ExchangeDefaultsEntry: "defaults" },
      "./exchange-inquiry-list": { ExchangeInquiryList: "list" },
      "./regional-presentation": { RegionalTime: "time" },
      "@/lib/platform/session": {
        getCurrentPlatformUser: async () => ({ id: "owner-a" })
      },
      "@/lib/platform/exchange-session": {
        exchangeHandoffPage: async (query) => {
          calls.push(query);
          return { ownerId: "owner-a", inquiry: inquiry() };
        }
      },
      "@/lib/platform/exchange-handoff-options": options,
      "@/lib/platform/community-report-types": {
        reportEntryHref: () => "/report"
      },
      "@/lib/platform/portal-policy": { PortalError: Error }
    }
  );
  const tree = await ExchangeHandoffsPage({ id: "inquiry-a" });
  assert.deepEqual(JSON.parse(JSON.stringify(calls)), [
    { view: "detail", id: "inquiry-a" }
  ]);
  for (const marker of [
    "Private fixture inquiry purpose",
    "Saved private pickup",
    "Private fixture participant"
  ])
    assert.ok(
      !JSON.stringify(tree).includes(marker),
      `${marker} is absent from initial element props and markup`
    );
  const detail = nodes(tree, (n) => n.type === ExchangeHandoffDetail);
  assert.equal(detail.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(detail[0].props)), {
    owner: "owner-a",
    inquiryId: "inquiry-a"
  });
});

test("concealment physically removes plan and cancellation controls while retaining both drafts", (t) => {
  const s = actionHarness(t);
  s.change(pickupLabel, "Unsent private plan");
  s.change(noteLabel, "Unsent private cancellation");
  s.setVisible(false);
  assert.equal(
    nodes(s.h.output, (n) => ["input", "textarea", "select"].includes(n.type))
      .length,
    0
  );
  assert.ok(!JSON.stringify(s.h.output).includes("Unsent private"));
  s.setVisible(true);
  assert.equal(
    input(s.h.output, pickupLabel).props.value,
    "Unsent private plan"
  );
  assert.equal(
    input(s.h.output, noteLabel).props.value,
    "Unsent private cancellation"
  );
});

test("a replacement plan cannot inherit agreement to the previous plan version", (t) => {
  const s = actionHarness(t, { side: "outgoing" });
  const checkbox = () =>
    nodes(s.h.output, (n) => n.props.type === "checkbox")[0];
  checkbox().props.onChange({ target: { checked: true } });
  s.h.render();
  assert.equal(checkbox().props.checked, true);
  s.adopt(inquiry({ side: "outgoing", version: 4, planVersion: 2 }));
  assert.equal(checkbox().props.checked, false);
  assert.equal(button(s.h.output, "Agree to pickup plan").props.disabled, true);
  assert.equal(s.writes().length, 0);
});

test("confirmed plan replacement preserves a dirty cancellation sibling and allows the next action", async (t) => {
  const s = actionHarness(t);
  s.change(pickupLabel, "Submitted replacement pickup");
  s.change(noteLabel, "Unsent cancellation sibling");
  s.submitPlan();
  await s.h.settle();
  assert.equal(s.confirmed.length, 1);
  s.adopt(
    inquiry({
      version: 4,
      planVersion: 2,
      pickupDetails: "Submitted replacement pickup"
    })
  );
  await s.h.settle();
  assert.equal(
    input(s.h.output, noteLabel).props.value,
    "Unsent cancellation sibling"
  );
  assert.equal(s.state.guard.dirty, true);
  assert.equal(
    button(s.h.output, "Discard unsaved handoff choices").props.disabled,
    false
  );
  s.state.receiptVersion = 5;
  button(s.h.output, "Cancel handoff").props.onClick();
  await s.h.settle();
  const bodies = s.writes().map((request) => JSON.parse(request.body));
  assert.deepEqual(
    bodies.map((body) => body.operation),
    ["handoff-plan", "handoff-cancel"]
  );
  assert.equal(bodies[1].expectedVersion, 4);
  assert.equal(bodies[1].note, "Unsent cancellation sibling");
  assert.notEqual(bodies[0].mutationId, bodies[1].mutationId);
});

test("a confirmed plan retains its submitted inputs before refreshed props and can submit the next plan after acceptance", async (t) => {
  const s = actionHarness(t);
  const fields = {
    "Window begins": "2026-10-04T14:00",
    "Window ends": "2026-10-04T15:00",
    "Time zone": "UTC",
    [pickupLabel]: "First submitted private instructions"
  };
  for (const [label, value] of Object.entries(fields)) s.change(label, value);
  s.change(noteLabel, "Retained cancellation sibling");
  s.submitPlan();
  await s.h.settle();
  assert.equal(s.confirmed.length, 1);
  assert.equal(s.state.inquiry.version, 3, "Readback has not arrived yet");
  assert.equal(s.state.acceptedVersion, undefined);
  for (const [label, value] of Object.entries(fields))
    assert.equal(input(s.h.output, label).props.value, value);
  assert.equal(
    input(s.h.output, noteLabel).props.value,
    "Retained cancellation sibling"
  );
  assert.equal(s.state.guard.dirty, true);
  s.submitPlan();
  await s.h.settle();
  assert.equal(s.writes().length, 1, "Receipt alone cannot unlock a new plan");

  s.adopt(
    inquiry({
      version: 4,
      planVersion: 2,
      windowStart: "2026-10-04T14:00:00.000Z",
      windowEnd: "2026-10-04T15:00:00.000Z",
      pickupDetails: fields[pickupLabel]
    })
  );
  await s.h.settle();
  for (const [label, value] of Object.entries(fields))
    assert.equal(input(s.h.output, label).props.value, value);
  s.change(pickupLabel, "Second submitted private instructions");
  s.state.receiptVersion = 5;
  s.submitPlan();
  await s.h.settle();
  const bodies = s.writes().map((request) => JSON.parse(request.body));
  assert.equal(bodies.length, 2);
  assert.deepEqual(
    bodies.map((body) => body.operation),
    ["handoff-plan", "handoff-plan"]
  );
  assert.equal(bodies[1].expectedVersion, 4);
  assert.notEqual(bodies[0].mutationId, bodies[1].mutationId);
  assert.deepEqual(bodies[1].plan, {
    startLocal: "2026-10-04T14:00",
    endLocal: "2026-10-04T15:00",
    timeZone: "UTC",
    pickupDetails: "Second submitted private instructions"
  });
  assert.equal(s.confirmed.length, 2);
  assert.equal(
    input(s.h.output, noteLabel).props.value,
    "Retained cancellation sibling"
  );
  assert.equal(s.state.guard.dirty, true);
});

test("confirmed completion keeps an unsent cancellation draft guarded after controls disappear", async (t) => {
  const s = actionHarness(t, { state: "RESERVED", pickupReportable: true });
  s.change(noteLabel, "Completion must not acknowledge this note");
  button(s.h.output, "Mark handoff complete").props.onClick();
  await s.h.settle();
  s.adopt(
    inquiry({
      state: "COMPLETED",
      version: 4,
      canClear: true,
      pickupDetails: ""
    })
  );
  await s.h.settle();
  assert.equal(s.state.guard.dirty, true);
  assert.equal(
    button(s.h.output, "Discard unsaved handoff choices").props.disabled,
    false
  );
  button(s.h.output, "Discard unsaved handoff choices").props.onClick();
  s.h.render();
  assert.equal(s.state.guard.dirty, false);
});

test("a defaults reply after concealment cannot replace the retained pickup draft", async (t) => {
  const s = actionHarness(t),
    held = deferred();
  s.change(pickupLabel, "Keep my unsent pickup");
  s.state.readHandler = () => held.promise;
  const copying = button(
    s.h.output,
    "Copy my private pickup default"
  ).props.onClick();
  await s.h.settle();
  s.setVisible(false);
  held.resolve(response(s.defaults));
  await copying;
  await s.h.settle();
  s.setVisible(true);
  assert.equal(
    input(s.h.output, pickupLabel).props.value,
    "Keep my unsent pickup"
  );
});

test("a stalled defaults copy expires, retains edits, and allows a fresh explicit copy", async (t) => {
  const s = actionHarness(t);
  s.change(pickupLabel, "Retain through defaults outage");
  let signal;
  s.state.readHandler = (options) =>
    new Promise((_resolve, reject) => {
      signal = options.signal;
      signal?.addEventListener("abort", () => reject(signal.reason), {
        once: true
      });
    });
  void button(s.h.output, "Copy my private pickup default").props.onClick();
  await s.h.settle();
  assert.equal(s.deadlines.size, 1);
  assert.ok(signal instanceof AbortSignal);
  s.expire();
  await s.h.settle();
  assert.equal(signal.aborted, true);
  assert.equal(
    input(s.h.output, pickupLabel).props.value,
    "Retain through defaults outage"
  );
  assert.equal(s.deadlines.size, 0);
  s.state.readHandler = null;
  await button(s.h.output, "Copy my private pickup default").props.onClick();
  await s.h.settle();
  assert.equal(
    input(s.h.output, pickupLabel).props.value,
    "Copied private pickup"
  );
});

for (const corruption of [{ ownerId: "owner-b" }, { recoveryRequired: true }])
  test(`defaults with ${Object.keys(corruption)[0]} cannot replace a local plan`, async (t) => {
    const s = actionHarness(t);
    s.change(pickupLabel, "Retain my private draft");
    s.state.readHandler = () => response({ ...s.defaults, ...corruption });
    await button(s.h.output, "Copy my private pickup default").props.onClick();
    await s.h.settle();
    assert.equal(
      input(s.h.output, pickupLabel).props.value,
      "Retain my private draft"
    );
  });

function hookHarness(t, { preserveDirty = true } = {}) {
  const s = environment();
  s.h.mount(() =>
    s.hook.usePrivateChoiceAction(
      "/api/platform/exchange",
      "owner-a",
      s.state.dirty,
      undefined,
      true,
      { ...s.privacy(), preserveDirty }
    )
  );
  t.after(() => s.h.unmount());
  return s;
}

test("rearm requires a consumed matching receipt and current access, and each receipt is consumed once", async (t) => {
  const s = hookHarness(t),
    settled = deferred();
  assert.equal(typeof s.h.output.rearm, "function");
  assert.equal(s.h.output.rearm(4), false);
  s.state.settleHandler = () => settled.promise;
  await s.h.output.command({
    operation: "handoff-plan",
    id: "inquiry-a",
    expectedVersion: 3
  });
  await s.h.settle();
  assert.equal(s.h.output.rearm(4), false, "Receipt delivery is still pending");
  settled.resolve();
  await s.h.settle();
  assert.equal(s.confirmed.length, 1);
  assert.equal(s.h.output.rearm(3), false);
  assert.equal(s.h.output.rearm(5), false);
  s.state.access = false;
  s.h.render();
  assert.equal(s.h.output.rearm(4), false);
  s.state.access = true;
  s.h.render();
  assert.equal(s.h.output.rearm(4), true);
  s.h.render();
  assert.equal(s.h.output.rearm(4), false);
  s.state.receiptVersion = 5;
  assert.equal(
    await s.h.output.command({
      operation: "handoff-cancel",
      id: "inquiry-a",
      expectedVersion: 4
    }),
    true
  );
  await s.h.settle();
  assert.equal(s.confirmed.length, 2);
});

for (const preserveDirty of [true, false])
  test(`successful receipt keeps dirty sibling protection only with preserveDirty=${preserveDirty}`, async (t) => {
    const s = hookHarness(t, { preserveDirty });
    await s.h.output.command({
      operation: "handoff-plan",
      id: "inquiry-a",
      expectedVersion: 3
    });
    await s.h.settle();
    assert.equal(s.confirmed.length, 1);
    assert.equal(s.state.guard.dirty, preserveDirty);
  });

test("a lost action response cannot rearm or mint a replacement and retries exact request bytes", async (t) => {
  const s = hookHarness(t);
  s.state.writeHandler = () => {
    throw new TypeError("Fictional lost reply");
  };
  assert.equal(
    await s.h.output.command({
      operation: "handoff-clear",
      id: "inquiry-a",
      expectedVersion: 3
    }),
    false
  );
  await s.h.settle();
  assert.equal(typeof s.h.output.rearm, "function");
  assert.equal(s.h.output.rearm(4), false);
  assert.equal(
    await s.h.output.command({
      operation: "handoff-clear",
      id: "inquiry-a",
      expectedVersion: 4
    }),
    false
  );
  assert.equal(s.writes().length, 1);
  const original = s.writes()[0].body;
  s.state.writeHandler = null;
  button(s.h.output.status, "Confirm original save").props.onClick();
  await s.h.settle();
  assert.equal(s.writes().length, 2);
  assert.equal(s.writes()[1].body, original);
  assert.equal(s.confirmed.length, 1);
});

function detailHarness(t, { holdFirst = false } = {}) {
  const s = environment(),
    first = deferred();
  if (holdFirst) s.state.readHandler = () => first.promise;
  const ExchangeHandoffActions = () => null;
  const { ExchangeHandoffDetail } = s.h.load(
    "components/platform/exchange-handoff-detail.tsx",
    {
      "next/link": { default: "a" },
      "next/navigation": {
        useRouter: () => ({
          push: (path) => s.navigations.push(path),
          refresh() {}
        })
      },
      "@/lib/platform/social-client": s.social,
      "./exchange-handoff-controls": { ExchangeHandoffActions },
      "./regional-presentation": { RegionalTime: "time" },
      "@/lib/platform/exchange-handoff-options": s.h.load(
        "lib/platform/exchange-handoff-options.ts"
      ),
      "@/lib/platform/community-report-types": {
        reportEntryHref: () => "/report"
      },
      "./read-visibility": {
        ReadVisibility: { Provider: "visibility" },
        useReadVisibility: () => s.state.visible
      }
    }
  );
  s.h.mount(() =>
    ExchangeHandoffDetail({ owner: "owner-a", inquiryId: "inquiry-a" })
  );
  t.after(() => s.h.unmount());
  return {
    ...s,
    first,
    actions() {
      return nodes(s.h.output, (n) => n.type === ExchangeHandoffActions)[0];
    },
    visible() {
      const providers = nodes(s.h.output, (n) => n.type === "visibility");
      return providers.length ? providers[0].props.value : false;
    }
  };
}

test("detail starts without private summary or command props until a current pinned read completes", async (t) => {
  const s = detailHarness(t, { holdFirst: true });
  assert.equal(s.actions(), undefined);
  assert.ok(!textContent(s.h.output).includes("Private fixture"));
  await s.h.settle();
  assert.equal(s.visible(), false);
  s.first.resolve(response({ ownerId: "owner-a", inquiry: s.state.inquiry }));
  await s.h.settle();
  assert.equal(s.visible(), true);
  assert.equal(
    s.actions().props.inquiry.purpose,
    "Private fixture inquiry purpose"
  );
  assert.ok(
    textContent(s.h.output).includes("Private fixture inquiry purpose")
  );
  assert.equal(s.deadlines.size, 0);
});

test("detail concealment removes its private summary, retaining one command owner through rechecks", async (t) => {
  const s = detailHarness(t);
  await s.h.settle();
  const original = s.actions();
  s.emit("blur");
  assert.equal(s.visible(), false);
  assert.equal(s.actions().key, original.key);
  assert.equal(s.actions().props.inquiry, original.props.inquiry);
  assert.equal(s.actions().props.privacy.currentAccess, false);
  assert.ok(!textContent(s.h.output).includes("Private fixture"));
  const count = s.requests.length;
  s.emit("online");
  s.poll();
  await s.h.settle();
  assert.equal(s.requests.length, count);
  s.emit("focus");
  await s.h.settle();
  assert.equal(s.visible(), true);
  assert.equal(s.actions().key, original.key);
});

test("an unsolicited changed inquiry stays concealed without rebasing retained action fields", async (t) => {
  const s = detailHarness(t);
  await s.h.settle();
  const original = s.actions();
  s.state.inquiry = inquiry({
    version: 4,
    planVersion: 2,
    pickupDetails: "Changed saved pickup"
  });
  s.emit("focus");
  await s.h.settle();
  assert.equal(s.visible(), false);
  assert.equal(s.actions().props.inquiry, original.props.inquiry);
  assert.equal(s.actions().key, original.key);
  assert.equal(
    s.actions().props.privacy.currentAccess,
    true,
    "Current participant access can permit exact original replay"
  );
  assert.equal(s.actions().props.acceptedVersion, undefined);
});

test("same-version source redaction cannot silently replace the retained command snapshot", async (t) => {
  const s = detailHarness(t);
  await s.h.settle();
  const original = s.actions().props.inquiry;
  s.state.inquiry = inquiry({
    state: "REVOKED",
    available: false,
    pickupDetails: "",
    purpose: "",
    canClear: true
  });
  s.emit("focus");
  await s.h.settle();
  assert.equal(s.visible(), false);
  assert.equal(s.actions().props.inquiry, original);
  assert.equal(s.actions().props.privacy.currentAccess, true);
});

test("same-version virtual expiry conceals the retained snapshot without acknowledging any command", async (t) => {
  const s = detailHarness(t);
  await s.h.settle();
  const original = s.actions();
  s.state.inquiry = inquiry({ state: "EXPIRED", canClear: true });
  assert.equal(s.state.inquiry.version, original.props.inquiry.version);
  s.emit("focus");
  await s.h.settle();
  assert.equal(s.visible(), false);
  assert.ok(!textContent(s.h.output).includes("Private fixture"));
  assert.equal(s.actions().key, original.key);
  assert.equal(s.actions().props.inquiry, original.props.inquiry);
  assert.equal(s.actions().props.privacy.currentAccess, true);
  assert.equal(s.actions().props.acceptedVersion, undefined);
  assert.equal(s.writes().length, 0);
});

test("a redacted terminal inquiry still initializes the participant's permitted clear action", async (t) => {
  const s = detailHarness(t, { holdFirst: true });
  await s.h.settle();
  const redacted = inquiry({
    state: "REVOKED",
    available: false,
    canClear: true,
    purpose: "",
    pickupDetails: "",
    person: null,
    listing: null,
    history: []
  });
  s.first.resolve(response({ ownerId: "owner-a", inquiry: redacted }));
  await s.h.settle();
  assert.equal(s.visible(), true);
  assert.equal(s.actions().props.inquiry.canClear, true);
  assert.equal(s.actions().props.privacy.currentAccess, true);
});

test("a confirmed command cannot rearm until an authorized snapshot reaches its receipt version", async (t) => {
  const s = detailHarness(t);
  await s.h.settle();
  const key = s.actions().key;
  s.actions().props.onRequest("plan");
  s.actions().props.privacy.onConfirmed({
    id: "inquiry-a",
    version: 4,
    message: "Saved"
  });
  await s.h.settle();
  assert.equal(s.visible(), false);
  assert.ok(!textContent(s.h.output).includes("Private fixture"));
  assert.equal(s.actions().props.acceptedVersion, undefined);
  assert.equal(s.actions().props.inquiry.version, 3);
  s.state.inquiry = inquiry({
    version: 5,
    planVersion: 2,
    pickupDetails: "Confirmed pickup"
  });
  s.emit("focus");
  await s.h.settle();
  assert.equal(s.visible(), true);
  assert.equal(s.actions().key, key);
  assert.equal(s.actions().props.acceptedVersion, 4);
  assert.equal(s.actions().props.inquiry.pickupDetails, "Confirmed pickup");
});

test("a hidden accepted action cannot reopen summary or rearm before a foreground current read", async (t) => {
  const s = detailHarness(t);
  await s.h.settle();
  s.actions().props.onRequest("plan");
  s.emit("blur");
  s.state.inquiry = inquiry({ version: 4, planVersion: 2 });
  s.actions().props.privacy.onConfirmed({
    id: "inquiry-a",
    version: 4,
    message: "Saved"
  });
  await s.h.settle();
  assert.equal(s.visible(), false);
  assert.equal(s.actions().props.acceptedVersion, undefined);
  assert.ok(!textContent(s.h.output).includes("Private fixture"));
  s.emit("focus");
  await s.h.settle();
  assert.equal(s.visible(), true);
  assert.equal(s.actions().props.acceptedVersion, 4);
});

for (const operation of ["plan", "clear"])
  test(`detail 404 permits only original clear replay, requested operation=${operation}`, async (t) => {
    const s = detailHarness(t);
    if (operation === "clear")
      s.state.inquiry = inquiry({ state: "CANCELED", canClear: true });
    await s.h.settle();
    const original = s.actions();
    s.actions().props.onRequest(operation);
    s.state.readHandler = () =>
      response({ message: "Inquiry unavailable" }, 404);
    s.emit("focus");
    await s.h.settle();
    assert.equal(s.visible(), false);
    assert.equal(s.actions().key, original.key);
    assert.equal(
      s.actions().props.privacy.currentAccess,
      operation === "clear"
    );
    assert.equal(
      s.actions().props.acceptedVersion,
      undefined,
      "A read denial is not a command receipt"
    );
    if (operation === "clear") {
      s.actions().props.privacy.onConfirmed({
        id: "inquiry-a",
        version: 4,
        message: "Cleared"
      });
      await s.h.settle();
      assert.ok(!textContent(s.h.output).includes("Private fixture"));
      assert.ok(
        s.navigations.length === 1 || /cleared/i.test(textContent(s.h.output)),
        "A confirmed clear has a terminal acknowledgment despite detail 404"
      );
    }
  });

for (const stage of ["identity", "detail"])
  test(`a hung ${stage} read is cancelled and a queued fresh check recovers the retained owner`, async (t) => {
    const s = detailHarness(t);
    await s.h.settle();
    const original = s.actions();
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
    assert.equal(s.actions().key, original.key);
    assert.equal(s.deadlines.size, 0);
  });

test("a confirmed account change clears retained detail even when its identity response also causes blur", async (t) => {
  const s = detailHarness(t);
  await s.h.settle();
  s.state.identityHandler = () => {
    s.emit("blur");
    return response({ id: "owner-b" });
  };
  s.emit("focus");
  await s.h.settle();
  assert.equal(s.visible(), false);
  assert.equal(s.actions(), undefined);
  assert.match(textContent(s.h.output), /Private entries were cleared/);
});
