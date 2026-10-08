import assert from "node:assert/strict";
import test from "node:test";
import {
  clientHarness,
  nodes,
  textContent
} from "./fixtures/client-hook-harness.mjs";

function formHarness(t) {
  let visible = true;
  const h = clientHarness();
  const options = h.load("lib/platform/exchange-handoff-options.ts");
  const listing = h.load("lib/platform/exchange-options.ts");
  const DiscoveryPlacePicker = () => null;
  const action = () => ({
    blocked: !visible,
    command: async () => true,
    status: null
  });
  const { ExchangeDefaultsForm } = h.load(
    "components/platform/exchange-defaults-form.tsx",
    {
      "next/link": { default: "a" },
      "@/lib/platform/exchange-handoff-options": options,
      "@/lib/platform/exchange-options": listing,
      "./discovery-place-picker": { DiscoveryPlacePicker },
      "./portal-action-form": { portalInputClass: "" },
      "./exchange-saved-controls": { useExchangeAction: action },
      "./use-private-choice-action": { usePrivateChoiceAction: action },
      "./read-visibility": { useReadVisibility: () => visible }
    }
  );
  const initial = {
    ownerId: "owner-a",
    version: 3,
    fields: {
      ...options.emptyExchangeDefaults(),
      pickupDetails: "Saved private pickup"
    },
    churches: [{ id: "church-a", name: "Private church choice" }],
    available: true,
    recoveryRequired: false,
    placeLabel: null,
    draftFields: null
  };
  h.mount(() =>
    ExchangeDefaultsForm({
      initial,
      privacy: { currentAccess: visible, onAccessDenied() {}, onConfirmed() {} }
    })
  );
  t.after(() => h.unmount());
  return {
    h,
    setVisible(value) {
      visible = value;
      h.render();
    },
    picker() {
      return nodes(h.output, (n) => n.type === DiscoveryPlacePicker)[0];
    },
    pickup() {
      return nodes(h.output, (n) => n.type === "textarea")[0];
    }
  };
}

test("concealment removes private defaults DOM while its mounted owner retains unsaved text", (t) => {
  const s = formHarness(t);
  s.pickup().props.onChange({ target: { value: "Unsaved private pickup" } });
  s.h.render();
  s.setVisible(false);
  assert.equal(
    s.pickup(),
    undefined,
    "Private controls must be omitted, not disabled or hidden"
  );
  assert.equal(s.picker(), undefined);
  s.setVisible(true);
  assert.equal(s.pickup().props.value, "Unsaved private pickup");
});

test("unselected town query stays in the retained defaults owner through concealment", (t) => {
  const s = formHarness(t);
  assert.equal(typeof s.picker().props.onQueryChange, "function");
  s.picker().props.onQueryChange("Unselected private town");
  s.h.render();
  s.setVisible(false);
  s.setVisible(true);
  assert.equal(s.picker().props.queryValue, "Unselected private town");
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
function entryHarness(t, { holdFirst = false, focused = true } = {}) {
  const window = new EventTarget(),
    document = new EventTarget();
  document.visibilityState = "visible";
  document.hasFocus = () => focused;
  window.location = { reload() {} };
  const navigator = { onLine: true },
    deadlines = new Map(),
    timers = new Map(),
    requests = [];
  let owner = "owner-a",
    readHandler = null,
    identityHandler = null,
    id = 0;
  const first = deferred();
  let data = {
    ownerId: "owner-a",
    version: 3,
    fields: {
      intent: "FREE",
      audience: "PUBLIC",
      audienceChurchId: null,
      country: null,
      placeId: null,
      pickupDetails: "Private saved pickup"
    },
    churches: [],
    available: true,
    recoveryRequired: false
  };
  if (holdFirst) readHandler = () => first.promise;
  const h = clientHarness({
    window,
    document,
    navigator,
    Error,
    TypeError,
    AbortController,
    confirm: () => false,
    setTimeout(fn, ms) {
      assert.equal(ms, 15000);
      deadlines.set(++id, fn);
      return id;
    },
    clearTimeout(id) {
      deadlines.delete(id);
    },
    setInterval(fn, ms) {
      assert.equal(ms, 30000);
      timers.set(++id, fn);
      return id;
    },
    clearInterval(id) {
      timers.delete(id);
    },
    fetch: async (path, options) => {
      requests.push({ path, ...options });
      if (path === "/api/platform/profile?view=identity")
        return identityHandler
          ? identityHandler(options)
          : response({ id: owner });
      assert.equal(path, "/api/platform/exchange?view=defaults");
      assert.equal(options.headers["X-Expected-Account"], "owner-a");
      return readHandler ? readHandler(options) : response(data);
    }
  });
  const social = h.load("lib/platform/social-client.ts", {
    "./privileged-auth-navigation": { announcePrivilegedChallenge: () => false }
  });
  const ExchangeDefaultsForm = () => null;
  const { ExchangeDefaultsEntry } = h.load(
    "components/platform/exchange-defaults-entry.tsx",
    {
      "@/lib/platform/social-client": social,
      "./exchange-defaults-form": { ExchangeDefaultsForm },
      "./read-visibility": { ReadVisibility: { Provider: "visibility" } }
    }
  );
  h.mount(() => ExchangeDefaultsEntry({ owner: "owner-a" }));
  t.after(() => h.unmount());
  return {
    h,
    requests,
    first,
    navigator,
    document,
    get data() {
      return data;
    },
    set data(v) {
      data = v;
    },
    set owner(v) {
      owner = v;
    },
    set readHandler(v) {
      readHandler = v;
    },
    set identityHandler(v) {
      identityHandler = v;
    },
    form() {
      return nodes(h.output, (n) => n.type === ExchangeDefaultsForm)[0];
    },
    visible() {
      return nodes(h.output, (n) => n.type === "visibility")[0].props.value;
    },
    emit(name) {
      window.dispatchEvent(new Event(name));
      h.render();
    },
    poll() {
      for (const fn of timers.values()) fn();
      h.render();
    },
    expire() {
      for (const [id, fn] of [...deadlines]) {
        deadlines.delete(id);
        fn();
      }
    },
    get deadlines() {
      return deadlines.size;
    }
  };
}

test("private defaults initialize only after a current account-pinned read", async (t) => {
  const s = entryHarness(t, { holdFirst: true });
  assert.equal(s.form(), undefined);
  assert.equal(s.visible(), false);
  await s.h.settle();
  s.first.resolve(response(s.data));
  await s.h.settle();
  assert.equal(s.visible(), true);
  assert.equal(
    s.form().props.initial.fields.pickupDetails,
    "Private saved pickup"
  );
  assert.equal(s.deadlines, 0);
});
for (const event of ["blur", "pagehide", "offline"])
  test(`${event} conceals defaults and passive events cannot reopen them`, async (t) => {
    const s = entryHarness(t);
    await s.h.settle();
    const original = s.form().key;
    s.emit(event);
    assert.equal(s.visible(), false);
    assert.equal(s.form().props.privacy.currentAccess, false);
    const count = s.requests.length;
    s.emit("online");
    s.emit("social-relationships-changed");
    s.poll();
    await s.h.settle();
    assert.equal(s.requests.length, count);
    assert.equal(s.visible(), false);
    assert.equal(s.form().key, original);
    s.emit("focus");
    await s.h.settle();
    assert.equal(s.visible(), true);
    assert.equal(s.form().key, original);
  });
test("held first response cannot initialize concealed defaults", async (t) => {
  const s = entryHarness(t, { holdFirst: true });
  await s.h.settle();
  s.emit("blur");
  s.first.resolve(response(s.data));
  await s.h.settle();
  assert.equal(s.form(), undefined);
  assert.equal(s.visible(), false);
  s.readHandler = null;
  s.emit("focus");
  await s.h.settle();
  assert.equal(s.visible(), true);
});
test("a page initialized in the background waits for an explicit return", async (t) => {
  const s = entryHarness(t, { focused: false });
  await s.h.settle();
  assert.equal(s.requests.length, 0);
  s.emit("online");
  s.poll();
  await s.h.settle();
  assert.equal(s.requests.length, 0);
  s.document.hasFocus = () => true;
  s.emit("focus");
  await s.h.settle();
  assert.equal(s.visible(), true);
});
test("failed identity and denied defaults reads conceal but retain original form", async (t) => {
  const s = entryHarness(t);
  await s.h.settle();
  const original = s.form();
  s.identityHandler = () => response({ message: "Temporary outage" }, 503);
  s.emit("focus");
  await s.h.settle();
  assert.equal(s.visible(), false);
  assert.equal(s.form().key, original.key);
  assert.equal(s.form().props.privacy.currentAccess, false);
  s.identityHandler = null;
  s.readHandler = () => response({ message: "Unavailable" }, 403);
  s.emit("focus");
  await s.h.settle();
  assert.equal(s.visible(), false);
  assert.equal(s.form().key, original.key);
  s.readHandler = null;
  s.emit("focus");
  await s.h.settle();
  assert.equal(s.visible(), true);
});
test("confirmed changed identity clears the old form despite simultaneous session blur", async (t) => {
  const s = entryHarness(t);
  await s.h.settle();
  s.owner = "owner-b";
  s.identityHandler = () => {
    s.emit("blur");
    return response({ id: "owner-b" });
  };
  s.emit("focus");
  await s.h.settle();
  assert.equal(s.visible(), false);
  assert.equal(s.form(), undefined);
  assert.match(textContent(s.h.output), /Private entries were cleared/);
});
test("unexpected saved version is concealed while original command owner can confirm its retry", async (t) => {
  const s = entryHarness(t);
  await s.h.settle();
  const original = s.form();
  s.data = {
    ...s.data,
    version: 4,
    fields: { ...s.data.fields, pickupDetails: "New saved pickup" }
  };
  s.emit("focus");
  await s.h.settle();
  assert.equal(s.visible(), false);
  assert.equal(s.form().key, original.key);
  assert.equal(
    s.form().props.initial.fields.pickupDetails,
    "Private saved pickup"
  );
  assert.equal(s.form().props.privacy.currentAccess, true);
  s.form().props.privacy.onConfirmed({ version: 4 });
  await s.h.settle();
  assert.equal(s.visible(), true);
  assert.notEqual(s.form().key, original.key);
  assert.equal(s.form().props.initial.fields.pickupDetails, "New saved pickup");
});
test("authority-only refresh updates church choices without remounting dirty form", async (t) => {
  const s = entryHarness(t);
  await s.h.settle();
  const key = s.form().key;
  s.data = {
    ...s.data,
    churches: [{ id: "church-current", name: "Current approved choice" }],
    available: false
  };
  s.emit("focus");
  await s.h.settle();
  assert.equal(s.visible(), true);
  assert.equal(s.form().key, key);
  assert.equal(s.form().props.initial.available, false);
  assert.equal(s.form().props.initial.churches[0].id, "church-current");
});
test("same-version changed fields and recovery state do not silently replace local entries", async (t) => {
  const s = entryHarness(t);
  await s.h.settle();
  s.data = {
    ...s.data,
    recoveryRequired: true,
    fields: { ...s.data.fields, pickupDetails: "" }
  };
  s.emit("focus");
  await s.h.settle();
  assert.equal(s.visible(), false);
  assert.equal(
    s.form().props.initial.fields.pickupDetails,
    "Private saved pickup"
  );
});
test("a receipt invalidates older reads and waits for at least its saved version", async (t) => {
  const s = entryHarness(t);
  await s.h.settle();
  const pending = deferred();
  let reads = 0;
  s.readHandler = () => (++reads === 1 ? pending.promise : response(s.data));
  s.emit("focus");
  await s.h.settle();
  s.form().props.privacy.onConfirmed({ version: 5 });
  pending.resolve(response(s.data));
  await s.h.settle();
  assert.equal(s.visible(), false);
  assert.equal(s.form().props.initial.version, 3);
  assert.equal(reads, 2);
  s.data = { ...s.data, version: 5 };
  s.readHandler = null;
  s.emit("focus");
  await s.h.settle();
  assert.equal(s.visible(), true);
  assert.equal(s.form().props.initial.version, 5);
});
for (const stage of ["identity", "defaults"])
  test(`hung ${stage} read expires and a queued current read recovers`, async (t) => {
    const s = entryHarness(t);
    await s.h.settle();
    let signal;
    const hold = (options) =>
      new Promise((_resolve, reject) => {
        signal = options.signal;
        signal.addEventListener("abort", () => reject(signal.reason), {
          once: true
        });
      });
    if (stage === "identity") s.identityHandler = hold;
    else s.readHandler = hold;
    s.emit("focus");
    await s.h.settle();
    s.emit("focus");
    assert.equal(s.visible(), false);
    s.identityHandler = null;
    s.readHandler = null;
    s.expire();
    await s.h.settle();
    assert.equal(signal.aborted, true);
    assert.equal(s.visible(), true);
    assert.equal(s.deadlines, 0);
  });
test("unmount aborts its own pending access read", async (t) => {
  const s = entryHarness(t);
  await s.h.settle();
  let signal;
  s.readHandler = (options) =>
    new Promise((_resolve, reject) => {
      signal = options.signal;
      signal.addEventListener("abort", () => reject(signal.reason), {
        once: true
      });
    });
  s.emit("focus");
  await s.h.settle();
  s.h.unmount();
  await s.h.settle();
  assert.equal(signal.aborted, true);
  assert.equal(s.deadlines, 0);
});

test("an older held owner mismatch cannot clear defaults before a queued original-owner check", async (t) => {
  const s = entryHarness(t);
  await s.h.settle();
  const original = s.form().key,
    held = deferred();
  let calls = 0;
  s.identityHandler = () =>
    ++calls === 1 ? response({ id: "owner-b" }) : held.promise;
  s.emit("focus");
  await s.h.settle();
  assert.equal(calls, 2);
  s.identityHandler = null;
  s.emit("focus");
  await s.h.settle();
  assert.equal(s.visible(), false);
  held.resolve(response({ id: "owner-b" }));
  await s.h.settle();
  assert.equal(s.visible(), true);
  assert.equal(s.form().key, original);
});
