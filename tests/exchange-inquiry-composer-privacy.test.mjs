import assert from "node:assert/strict";
import test from "node:test";
import {
  clientHarness,
  nodes,
  textContent
} from "./fixtures/client-hook-harness.mjs";

function formHarness(t, { activeId = null } = {}) {
  let visible = true;
  const h = clientHarness();
  const action = () => ({
    blocked: !visible,
    command: async () => true,
    status: null
  });
  const router = { push() {}, refresh() {} };
  const options = h.load("lib/platform/exchange-handoff-options.ts");
  const { ExchangeInquiryForm } = h.load(
    "components/platform/exchange-handoff-controls.tsx",
    {
      "next/link": { default: "a" },
      "next/navigation": { useRouter: () => router },
      "@/lib/platform/exchange-handoff-options": options,
      "@/lib/platform/social-client": {
        socialRequest: async () => ({ data: {} })
      },
      "./read-visibility": { useReadVisibility: () => visible },
      "./exchange-saved-controls": { useExchangeAction: action },
      "./use-private-choice-action": { usePrivateChoiceAction: action },
      "./portal-action-form": { portalInputClass: "" }
    }
  );
  const target = {
    listingId: "listing-a",
    listingVersion: 3,
    contactVersion: 2,
    receiver: { id: "receiver-a", name: "Private named receiver" },
    activeId,
    available: true
  };
  h.mount(() =>
    ExchangeInquiryForm({
      owner: "requester-a",
      target,
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
    textarea() {
      return nodes(h.output, (n) => n.type === "textarea")[0];
    }
  };
}

test("concealment removes the purpose and receiver DOM while one mounted form retains unsent text", (t) => {
  const s = formHarness(t);
  s.textarea().props.onChange({ target: { value: "Unsent private purpose" } });
  s.h.render();
  s.setVisible(false);
  assert.equal(
    s.textarea(),
    undefined,
    "Private textarea is physically omitted"
  );
  assert.ok(!textContent(s.h.output).includes("Private named receiver"));
  s.setVisible(true);
  assert.equal(s.textarea().props.value, "Unsent private purpose");
});

test("the existing inquiry association is omitted while access is unconfirmed", (t) => {
  const s = formHarness(t, { activeId: "private-inquiry-a" });
  assert.ok(JSON.stringify(s.h.output).includes("private-inquiry-a"));
  s.setVisible(false);
  assert.ok(!JSON.stringify(s.h.output).includes("private-inquiry-a"));
  s.setVisible(true);
  assert.ok(JSON.stringify(s.h.output).includes("private-inquiry-a"));
});

const response = (data, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: new Headers(),
  body: { cancel: async () => {} },
  json: async () => data
});
function receiptHarness(
  t,
  { expectedId, receiptId = "inquiry-a", custom = true } = {}
) {
  let visible = true,
    access = true;
  const confirmed = [],
    requests = [];
  const h = clientHarness({
    Error,
    TypeError,
    document: { visibilityState: "visible" },
    navigator: { onLine: true },
    window: { location: { reload() {} } },
    confirm: () => false,
    fetch: async (path, options) => {
      requests.push({ path, ...options });
      if (path === "/api/platform/profile?view=identity")
        return response({ id: "owner-a" });
      assert.equal(path, "/api/platform/exchange");
      assert.equal(options.headers["X-Expected-Account"], "owner-a");
      return response({
        id: receiptId,
        version: 1,
        message: "Fictional saved receipt"
      });
    }
  });
  const social = h.load("lib/platform/social-client.ts", {
    "./privileged-auth-navigation": { announcePrivilegedChallenge: () => false }
  });
  const { usePrivateChoiceAction } = h.load(
    "components/platform/use-private-choice-action.tsx",
    {
      "./use-photo-back-guard": { settlePhotoNavigation: async () => {} },
      "next/navigation": { useRouter: () => ({ refresh() {} }) },
      "@/lib/platform/social-client": social,
      "./private-snapshot-guard": { usePrivateRecovery() {} },
      "./read-visibility": { useReadVisibility: () => visible },
      "./use-unsaved-social-work": { useUnsavedSocialWork() {} }
    }
  );
  h.mount(() =>
    usePrivateChoiceAction(
      "/api/platform/exchange",
      "owner-a",
      true,
      undefined,
      true,
      {
        currentAccess: access,
        onAccessDenied() {
          access = false;
        },
        onConfirmed(receipt) {
          confirmed.push(receipt);
        },
        ...(custom ? { expectedReceiptId: () => expectedId ?? null } : {})
      }
    )
  );
  t.after(() => h.unmount());
  return {
    h,
    confirmed,
    requests,
    setVisible(value) {
      visible = value;
      h.render();
    }
  };
}

test("a minted inquiry reference accepts only its exact receipt through the real pinned transport", async (t) => {
  const s = receiptHarness(t, { expectedId: "inquiry-a" });
  assert.equal(
    await s.h.output.command({
      operation: "handoff-inquire",
      id: "inquiry-a",
      purpose: "Private purpose"
    }),
    true
  );
  await s.h.settle();
  assert.equal(s.confirmed.length, 1);
  assert.equal(s.confirmed[0].id, "inquiry-a");
});

test("an unminted custom inquiry reference cannot fall back to accepting the account ID", async (t) => {
  const s = receiptHarness(t, { expectedId: null, receiptId: "owner-a" });
  assert.equal(
    await s.h.output.command({
      operation: "handoff-inquire",
      purpose: "Private purpose"
    }),
    false
  );
  await s.h.settle();
  assert.equal(s.confirmed.length, 0);
  assert.ok(textContent(s.h.output.status).includes("Confirm original save"));
});

test("a different inquiry receipt stays uncertain and cannot confirm local work", async (t) => {
  const s = receiptHarness(t, {
    expectedId: "inquiry-a",
    receiptId: "inquiry-b"
  });
  assert.equal(
    await s.h.output.command({ operation: "handoff-inquire", id: "inquiry-a" }),
    false
  );
  await s.h.settle();
  assert.equal(s.confirmed.length, 0);
  assert.ok(textContent(s.h.output.status).includes("Confirm original save"));
});

test("default privacy receipt matching retains the existing owner-ID contract", async (t) => {
  const s = receiptHarness(t, { custom: false, receiptId: "owner-a" });
  assert.equal(await s.h.output.command({ operation: "defaults-save" }), true);
  await s.h.settle();
  assert.equal(s.confirmed.length, 1);
  assert.equal(s.confirmed[0].id, "owner-a");
});

test("default privacy mode still rejects a foreign receipt ID", async (t) => {
  const s = receiptHarness(t, { custom: false, receiptId: "owner-b" });
  assert.equal(await s.h.output.command({ operation: "defaults-save" }), false);
  await s.h.settle();
  assert.equal(s.confirmed.length, 0);
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
  let parentVisible = true;
  const navigations = [];
  const router = { push: (value) => navigations.push(value) };
  let owner = "owner-a",
    readHandler = null,
    identityHandler = null,
    id = 0;
  const first = deferred();
  let data = {
    ownerId: "owner-a",
    target: {
      listingId: "listing-a",
      listingVersion: 3,
      contactVersion: 2,
      receiver: { id: "receiver-a", name: "Private receiver", username: null },
      activeId: null,
      available: true
    }
  };
  if (holdFirst) readHandler = () => first.promise;
  const h = clientHarness({
    window,
    document,
    navigator,
    Error,
    TypeError,
    AbortController,
    URLSearchParams,
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
      assert.equal(
        path,
        "/api/platform/exchange?view=handoff-target&listingId=listing-a"
      );
      assert.equal(options.headers["X-Expected-Account"], "owner-a");
      return readHandler ? readHandler(options) : response(data);
    }
  });
  const social = h.load("lib/platform/social-client.ts", {
    "./privileged-auth-navigation": { announcePrivilegedChallenge: () => false }
  });
  const ExchangeInquiryForm = () => null;
  const { ExchangeInquiryComposer } = h.load(
    "components/platform/exchange-inquiry-composer.tsx",
    {
      "@/lib/platform/social-client": social,
      "next/navigation": { useRouter: () => router },
      "./exchange-handoff-controls": { ExchangeInquiryForm },
      "./read-visibility": {
        ReadVisibility: { Provider: "visibility" },
        useReadVisibility: () => parentVisible
      }
    }
  );
  h.mount(() =>
    ExchangeInquiryComposer({ owner: "owner-a", listingId: "listing-a" })
  );
  t.after(() => h.unmount());
  return {
    h,
    requests,
    navigations,
    set parentVisible(value) {
      parentVisible = value;
      h.render();
    },
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
      return nodes(h.output, (n) => n.type === ExchangeInquiryForm)[0];
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

test("inquiry composer initializes only after a current account-pinned read", async (t) => {
  const s = entryHarness(t, { holdFirst: true });
  assert.equal(s.form(), undefined);
  assert.equal(s.visible(), false);
  await s.h.settle();
  s.first.resolve(response(s.data));
  await s.h.settle();
  assert.equal(s.visible(), true);
  assert.equal(s.form().props.target.receiver.name, "Private receiver");
  assert.equal(s.deadlines, 0);
});
for (const event of ["blur", "pagehide", "offline"])
  test(`${event} conceals inquiry target and passive events cannot reopen them`, async (t) => {
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
test("held first response cannot initialize concealed inquiry target", async (t) => {
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
test("failed identity and denied inquiry target reads conceal but retain original form", async (t) => {
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

for (const stage of ["identity", "target"])
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

test("an older held owner mismatch cannot clear the composer before a queued original-owner check", async (t) => {
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

for (const change of [
  "activeId",
  "receiver",
  "listingVersion",
  "contactVersion",
  "available",
  "revoked"
])
  test(`changed ${change} conceals retained target without rebasing the form`, async (t) => {
    const s = entryHarness(t);
    await s.h.settle();
    const original = s.form().props.target;
    const target = { ...s.data.target };
    if (change === "revoked") s.data = { ...s.data, target: null };
    else {
      target[change] =
        change === "receiver"
          ? { id: "receiver-b", name: "New receiver" }
          : change === "activeId"
            ? "other-inquiry"
            : change === "available"
              ? false
              : 9;
      s.data = { ...s.data, target };
    }
    s.emit("focus");
    await s.h.settle();
    assert.equal(s.visible(), false);
    assert.equal(s.form().props.target, original);
    assert.equal(s.form().props.target.activeId, null);
    assert.equal(s.form().props.privacy.currentAccess, change !== "revoked");
    assert.deepEqual(s.navigations, []);
  });
test("the parent visibility boundary conceals fields and defers a confirmed receipt navigation", async (t) => {
  const s = entryHarness(t);
  await s.h.settle();
  s.parentVisible = false;
  assert.equal(s.visible(), false);
  // Current authorization remains available to the ancestor's exact-retry control.
  assert.equal(s.form().props.privacy.currentAccess, true);
  s.form().props.privacy.onConfirmed({ id: "inquiry-a", version: 1 });
  await s.h.settle();
  assert.deepEqual(s.navigations, []);
  s.parentVisible = true;
  await s.h.settle();
  assert.deepEqual(s.navigations, ["/platform/exchange/handoffs/inquiry-a"]);
  s.parentVisible = false;
  s.parentVisible = true;
  await s.h.settle();
  assert.equal(s.navigations.length, 1);
});
test("changed activeId permits the exact confirmed receipt without treating the target as a receipt", async (t) => {
  const s = entryHarness(t);
  await s.h.settle();
  s.data = { ...s.data, target: { ...s.data.target, activeId: "inquiry-a" } };
  s.emit("focus");
  await s.h.settle();
  assert.equal(s.visible(), false);
  assert.deepEqual(s.navigations, []);
  s.form().props.privacy.onConfirmed({ id: "inquiry-a", version: 1 });
  await s.h.settle();
  assert.deepEqual(s.navigations, ["/platform/exchange/handoffs/inquiry-a"]);
});
for (const malformed of [
  { ownerId: "owner-b" },
  { target: undefined },
  { target: { listingId: "listing-b" } }
])
  test("malformed or mismatched target response cannot initialize private fields", async (t) => {
    const s = entryHarness(t, { holdFirst: true });
    await s.h.settle();
    s.first.resolve(response({ ...s.data, ...malformed }));
    await s.h.settle();
    assert.equal(s.form(), undefined);
    assert.equal(s.visible(), false);
  });
