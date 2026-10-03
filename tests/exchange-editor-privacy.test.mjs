import assert from "node:assert/strict";
import test from "node:test";
import {
  button,
  clientHarness,
  input,
  nodes,
  textContent
} from "./fixtures/client-hook-harness.mjs";

const titleLabel = "Title (required to publish)";
const descriptionLabel = "Description (required to publish)";
const draftTitle = "Unsent private title";
const draftDescription = "Unsent private description";
const noop = () => null;
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};
const response = (data, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: new Headers(),
  body: { cancel: async () => {} },
  json: async () => data
});

function stalledReads() {
  const pending = [];
  const hold = (options = {}) =>
    new Promise((resolve, reject) => {
      const read = { signal: options.signal, aborted: false, settled: false };
      const finish = (settle, value) => {
        read.settled = true;
        read.signal?.removeEventListener("abort", abort);
        settle(value);
      };
      const abort = () => {
        read.aborted = true;
        finish(
          reject,
          read.signal.reason ?? new DOMException("Aborted", "AbortError")
        );
      };
      read.resolve = (value) => finish(resolve, value);
      pending.push(read);
      if (read.signal?.aborted) abort();
      else read.signal?.addEventListener("abort", abort, { once: true });
    });
  return { pending, hold };
}

function setup(t, { fresh = false } = {}) {
  const window = new EventTarget(),
    document = new EventTarget();
  let focused = true,
    owner = "owner-a",
    identityHandler = null,
    readHandler = null;
  document.visibilityState = "visible";
  document.hasFocus = () => focused;
  window.location = { origin: "https://example.test", reload: noop };
  window.confirm = () => true;
  const timers = new Map(),
    accessDeadlines = new Map(),
    requests = [],
    navigations = [],
    guards = [];
  let timerId = 0,
    mutationHandler,
    defaultsHandler;
  // Only the owned access-read deadline is virtual. Other component timeouts
  // retain their normal behavior, and polling requires an explicit tick below.
  const schedule = (fn, delay, ...args) => {
    if (delay !== 15_000) return setTimeout(fn, delay, ...args);
    const id = ++timerId;
    accessDeadlines.set(id, () => fn(...args));
    return id;
  };
  const unschedule = (id) => {
    if (!accessDeadlines.delete(id)) clearTimeout(id);
  };
  window.setTimeout = schedule;
  window.clearTimeout = unschedule;
  const globals = {
    window,
    document,
    navigator: { onLine: true },
    confirm: () => true,
    AbortController,
    AbortSignal,
    DOMException,
    setTimeout: schedule,
    clearTimeout: unschedule,
    setInterval: (fn, delay) => {
      timers.set(++timerId, { fn, delay });
      return timerId;
    },
    clearInterval: (id) => timers.delete(id),
    fetch: async (path, options) => {
      requests.push({ path, ...options });
      if (path === "/api/platform/profile?view=identity")
        return identityHandler
          ? identityHandler(options)
          : response({ id: owner });
      if (options?.body) return mutationHandler(path, options);
      if (path === "/api/platform/exchange?view=defaults")
        return defaultsHandler();
      if (readHandler) return readHandler(path, options);
      if (path === "/api/platform/exchange?view=context")
        return response(access);
      if (path.startsWith("/api/platform/exchange?view=editor&id="))
        return response(saved);
      assert.fail(`Unexpected request: ${path}`);
    }
  };
  const h = clientHarness(globals),
    fieldsHarness = clientHarness(globals);
  const options = h.load("lib/platform/exchange-options.ts");
  const social = h.load("lib/platform/social-client.ts", {
    "./privileged-auth-navigation": { announcePrivilegedChallenge: () => false }
  });
  const access = {
    ownerId: "owner-a",
    churches: [],
    publishingChurchIds: [],
    managingChurchIds: []
  };
  let saved = {
    listing: { id: "listing-a", version: 4, state: "DRAFT", ownerChurch: null },
    fields: {
      ...options.emptyExchangeFields(),
      title: "Saved private title",
      description: "Saved private description"
    },
    moderationState: "VISIBLE",
    recoveryRequired: false,
    photos: []
  };
  mutationHandler = async (_path, request) => {
    const body = JSON.parse(request.body);
    saved = {
      ...saved,
      listing: { ...saved.listing, version: saved.listing.version + 1 },
      fields: body.fields ?? saved.fields
    };
    return response({
      id: saved.listing.id,
      version: saved.listing.version,
      message: "Saved"
    });
  };
  const { ExchangeEditorFields } = fieldsHarness.load(
    "components/platform/exchange-editor-fields.tsx",
    {
      "@/lib/platform/exchange-options": options,
      "./discovery-place-picker": { DiscoveryPlacePicker: noop },
      "./portal-action-form": { portalInputClass: "" }
    }
  );
  const { ExchangeEditor } = h.load("components/platform/exchange-editor.tsx", {
    "next/navigation": {
      useRouter: () => ({ replace: (url) => navigations.push(url) })
    },
    "next/link": { default: "a" },
    "@/lib/platform/exchange-options": options,
    "@/lib/platform/social-client": social,
    "./exchange-editor-fields": { ExchangeEditorFields },
    "./exchange-photos": { ExchangePhotos: noop },
    "./read-visibility": { ReadVisibility: { Provider: "read-visibility" } },
    "./use-unsaved-social-work": {
      useUnsavedSocialWork: (state) => guards.push(state)
    },
    "./use-photo-back-guard": { settlePhotoNavigation: async () => {} },
    "./portal-action-form": { portalInputClass: "" }
  });
  // Execute the real field child in its own hook lifetime. Keep hidden/inert
  // subtrees: those attributes do not remove private values from the DOM.
  // Place lookup and photo controllers are outside this parent-editor suite.
  function expand(tree) {
    if (Array.isArray(tree)) return tree.map((child) => expand(child));
    if (!tree || typeof tree !== "object") return tree;
    if (tree.type === ExchangeEditorFields)
      return expand(
        fieldsHarness.mount(() => ExchangeEditorFields(tree.props))
      );
    if (typeof tree.type === "function") return null;
    return {
      ...tree,
      props: { ...tree.props, children: expand(tree.props.children) }
    };
  }
  const dom = () => expand(h.output);
  const initial = fresh ? null : saved;
  h.mount(() => ExchangeEditor({ access, initial }));
  t.after(() => {
    h.unmount();
    fieldsHarness.unmount();
  });
  return {
    h,
    dom,
    requests,
    navigations,
    guards,
    social,
    get saved() {
      return saved;
    },
    set saved(value) {
      saved = value;
    },
    set owner(value) {
      owner = value;
    },
    set identityHandler(value) {
      identityHandler = value;
    },
    set readHandler(value) {
      readHandler = value;
    },
    set mutationHandler(value) {
      mutationHandler = value;
    },
    set defaultsHandler(value) {
      defaultsHandler = value;
    },
    get visible() {
      return nodes(h.output, (n) => n.type === "read-visibility")[0].props
        .value;
    },
    event(type) {
      if (type === "blur") focused = false;
      if (type === "focus") focused = true;
      if (type === "offline") globals.navigator.onLine = false;
      if (type === "online") globals.navigator.onLine = true;
      if (type === "hidden") {
        document.visibilityState = "hidden";
        document.dispatchEvent(new Event("visibilitychange"));
      } else if (type === "visible") {
        document.visibilityState = "visible";
        document.dispatchEvent(new Event("visibilitychange"));
      } else window.dispatchEvent(new Event(type));
      h.render();
    },
    tickInterval(delay) {
      for (const timer of timers.values())
        if (timer.delay === delay) timer.fn();
      h.render();
    },
    expireAccessDeadline() {
      for (const [id, callback] of [...accessDeadlines]) {
        accessDeadlines.delete(id);
        callback();
      }
      h.render();
    },
    get pendingAccessDeadlines() {
      return accessDeadlines.size;
    },
    edit(label, value) {
      input(dom(), label).props.onChange({ target: { value } });
      h.render();
    },
    submit() {
      nodes(
        dom(),
        (n) => n.type === "form" && n.props["aria-label"] === "Listing editor"
      )[0].props.onSubmit({ preventDefault() {} });
      h.render();
    }
  };
}

function assertPrivateAbsent(s, ...values) {
  const tree = s.dom();
  const rendered = [
    textContent(tree),
    ...nodes(tree, (n) => ["input", "textarea", "select"].includes(n.type)).map(
      (n) => String(n.props.value ?? "")
    )
  ];
  for (const value of values)
    assert.equal(
      rendered.some((text) => text.includes(value)),
      false,
      `Concealed DOM retains private value: ${value}`
    );
}
async function dirtyEditor(t, options) {
  const s = setup(t, options);
  await s.h.settle();
  assert.equal(s.visible, true);
  s.edit(titleLabel, draftTitle);
  s.edit(descriptionLabel, draftDescription);
  assert.equal(s.guards.at(-1).dirty, true);
  return s;
}

test("initial identity check physically omits saved private fields", async (t) => {
  const s = setup(t);
  assert.equal(s.visible, false);
  assertPrivateAbsent(s, "Saved private title", "Saved private description");
  await s.h.settle();
  assert.equal(input(s.dom(), titleLabel).props.value, "Saved private title");
});

test("same-owner conceal and resume retains unsaved fields and dirty guard", async (t) => {
  const s = await dirtyEditor(t);
  s.event("blur");
  assert.equal(s.visible, false);
  s.event("focus");
  await s.h.settle();
  assert.equal(s.visible, true);
  assert.equal(input(s.dom(), titleLabel).props.value, draftTitle);
  assert.equal(input(s.dom(), descriptionLabel).props.value, draftDescription);
  assert.equal(s.guards.at(-1).dirty, true);
});

for (const event of ["blur", "pagehide", "hidden", "offline"]) {
  test(`${event} physically omits private entries without discarding the dirty draft`, async (t) => {
    const s = await dirtyEditor(t);
    s.event(event);
    assert.equal(s.visible, false);
    assertPrivateAbsent(s, draftTitle, draftDescription);
    assert.equal(s.guards.at(-1).dirty, true);
  });
}

test("focus conceals immediately while the current identity read is held", async (t) => {
  const s = await dirtyEditor(t);
  const held = deferred();
  s.identityHandler = () => held.promise;
  s.event("focus");
  assert.equal(s.visible, false);
  assertPrivateAbsent(s, draftTitle, draftDescription);
  held.resolve(response({ id: "owner-a" }));
  await s.h.settle();
  assert.equal(input(s.dom(), titleLabel).props.value, draftTitle);
});

test("failed held identity check stays concealed and preserves the same-owner draft", async (t) => {
  const s = await dirtyEditor(t);
  const held = deferred();
  s.identityHandler = () => held.promise;
  s.event("focus");
  held.resolve(response({}, 503));
  await s.h.settle();
  assert.equal(s.visible, false);
  assertPrivateAbsent(s, draftTitle, draftDescription);
  s.identityHandler = null;
  s.event("focus");
  await s.h.settle();
  assert.equal(input(s.dom(), titleLabel).props.value, draftTitle);
  assert.equal(s.guards.at(-1).dirty, true);
});

test("changed-account identity clears private entries without dispatching an editor read", async (t) => {
  const s = await dirtyEditor(t);
  const start = s.requests.length;
  s.owner = "owner-b";
  s.event("focus");
  await s.h.settle();
  assert.equal(s.visible, false);
  assertPrivateAbsent(s, draftTitle, draftDescription, "Saved private title");
  assert.equal(
    s.requests
      .slice(start)
      .some((r) => r.path.startsWith("/api/platform/exchange")),
    false
  );
  assert.equal(s.guards.at(-1).dirty, false);
});

test("accepted mutation readback after blur cannot restore private presentation", async (t) => {
  const s = await dirtyEditor(t);
  const held = deferred();
  s.mutationHandler = () => held.promise;
  s.submit();
  await s.h.settle();
  s.event("blur");
  s.saved = {
    ...s.saved,
    listing: { ...s.saved.listing, version: 5 },
    fields: {
      ...s.saved.fields,
      title: draftTitle,
      description: draftDescription
    }
  };
  held.resolve(response({ id: "listing-a", version: 5, message: "Saved" }));
  await s.h.settle();
  assert.equal(s.visible, false);
  assertPrivateAbsent(s, draftTitle, draftDescription);
  assert.deepEqual(s.navigations, []);
});

test("uncertain mutation retains the exact owner, body and key across same-owner resume", async (t) => {
  const s = await dirtyEditor(t);
  const held = deferred();
  s.mutationHandler = (_path, request) => {
    // The server commits once but the acknowledgment is lost. The retry below
    // returns the receipt for that same mutation, with no second saved effect.
    s.saved = {
      ...s.saved,
      listing: { ...s.saved.listing, version: 5 },
      fields: JSON.parse(request.body).fields
    };
    return held.promise;
  };
  s.submit();
  await s.h.settle();
  const first = s.requests.find((r) => r.body);
  assert.equal(first.headers["X-Expected-Account"], "owner-a");
  s.event("blur");
  held.reject(new TypeError("Connection closed before acknowledgment"));
  await s.h.settle();
  assert.equal(s.guards.at(-1).saving, true);
  s.event("focus");
  await s.h.settle();
  s.mutationHandler = async () =>
    response({ id: "listing-a", version: 5, message: "Already saved" });
  button(s.dom(), "Retry the same listing request").props.onClick();
  await s.h.settle();
  const attempts = s.requests.filter((r) => r.body);
  assert.equal(attempts.length, 2);
  assert.equal(attempts[1].body, first.body);
  assert.equal(attempts[1].method, first.method);
  assert.equal(attempts[1].headers["X-Expected-Account"], "owner-a");
});

test("accepted create response while hidden does not navigate or restore the private editor", async (t) => {
  const s = await dirtyEditor(t, { fresh: true });
  const held = deferred();
  s.mutationHandler = () => held.promise;
  s.submit();
  await s.h.settle();
  s.event("hidden");
  s.saved = {
    ...s.saved,
    listing: { ...s.saved.listing, version: 1 },
    fields: {
      ...s.saved.fields,
      title: draftTitle,
      description: draftDescription
    }
  };
  held.resolve(response({ id: "listing-a", version: 1, message: "Saved" }));
  await s.h.settle();
  assert.deepEqual(s.navigations, []);
  assert.equal(s.visible, false);
  assertPrivateAbsent(s, draftTitle, draftDescription);
  assert.equal(s.requests.filter((request) => request.body).length, 1);
});

test("focus during a held mutation queues a fresh access check after settlement without a timer", async (t) => {
  const s = await dirtyEditor(t);
  const held = deferred();
  s.mutationHandler = () => held.promise;
  s.submit();
  await s.h.settle();
  const start = s.requests.length;
  s.event("blur");
  s.event("focus");
  s.saved = {
    ...s.saved,
    listing: { ...s.saved.listing, version: 5 },
    fields: {
      ...s.saved.fields,
      title: draftTitle,
      description: draftDescription
    }
  };
  held.resolve(response({ id: "listing-a", version: 5, message: "Saved" }));
  await s.h.settle();
  assert.ok(
    s.requests
      .slice(start)
      .some(
        (request) => request.path === "/api/platform/exchange?view=context"
      ),
    "The focus revalidation must run after the held mutation, without a polling tick"
  );
  assert.equal(s.visible, true);
  assert.equal(input(s.dom(), titleLabel).props.value, draftTitle);
  assert.equal(s.requests.filter((request) => request.body).length, 1);
});

test("accepted create waits through blur and a held current-owner check, then navigates once", async (t) => {
  const s = await dirtyEditor(t, { fresh: true });
  const accepted = deferred();
  s.mutationHandler = () => accepted.promise;
  s.submit();
  await s.h.settle();
  s.event("blur");
  s.saved = {
    ...s.saved,
    listing: { ...s.saved.listing, version: 1 },
    fields: {
      ...s.saved.fields,
      title: draftTitle,
      description: draftDescription
    }
  };
  accepted.resolve(response({ id: "listing-a", version: 1, message: "Saved" }));
  await s.h.settle();
  assert.deepEqual(s.navigations, []);
  assert.equal(s.visible, false);
  assertPrivateAbsent(s, draftTitle, draftDescription);
  const identity = deferred();
  s.identityHandler = () => identity.promise;
  s.event("focus");
  await s.h.settle();
  assert.deepEqual(s.navigations, []);
  assert.equal(s.visible, false);
  assertPrivateAbsent(s, draftTitle, draftDescription);
  identity.resolve(response({ id: "owner-a" }));
  await s.h.settle();
  assert.deepEqual(s.navigations, ["/platform/exchange/listing-a/edit"]);
  s.identityHandler = null;
  s.event("focus");
  await s.h.settle();
  assert.deepEqual(s.navigations, ["/platform/exchange/listing-a/edit"]);
  assert.equal(s.requests.filter((request) => request.body).length, 1);
});

test("blur during changed-owner confirmation still clears the draft without a timer", async (t) => {
  const s = await dirtyEditor(t);
  const identity = deferred();
  let identityCalls = 0;
  s.owner = "owner-b";
  // Both transport prechecks detect the replacement account; hold the
  // component's subsequent confirmation before it clears the private draft.
  s.identityHandler = () =>
    ++identityCalls <= 2 ? response({ id: "owner-b" }) : identity.promise;
  s.event("focus");
  await s.h.settle();
  assert.ok(
    identityCalls >= 3,
    "The final changed-owner confirmation is pending"
  );
  s.event("blur");
  identity.resolve(response({ id: "owner-b" }));
  await s.h.settle();
  assert.equal(
    s.guards.at(-1).dirty,
    false,
    "A presentation concealment must not defer a confirmed account change to the polling interval"
  );
  assert.equal(s.visible, false);
  assertPrivateAbsent(s, draftTitle, draftDescription, "Saved private title");
});

test("older held owner mismatch cannot clear the draft before a queued original-owner check", async (t) => {
  const s = await dirtyEditor(t);
  const identity = deferred();
  let identityCalls = 0;
  s.owner = "owner-b";
  s.identityHandler = () =>
    ++identityCalls <= 2 ? response({ id: "owner-b" }) : identity.promise;
  s.event("focus");
  await s.h.settle();
  assert.ok(
    identityCalls >= 3,
    "The earlier changed-owner confirmation is pending"
  );
  s.owner = "owner-a";
  s.identityHandler = null;
  s.event("focus");
  await s.h.settle();
  assert.equal(s.visible, false);
  assertPrivateAbsent(s, draftTitle, draftDescription);
  assert.equal(s.guards.at(-1).dirty, true);
  identity.resolve(response({ id: "owner-b" }));
  await s.h.settle();
  assert.equal(s.visible, true);
  assert.equal(s.guards.at(-1).dirty, true);
  assert.equal(input(s.dom(), titleLabel).props.value, draftTitle);
  assert.equal(input(s.dom(), descriptionLabel).props.value, draftDescription);
});

test("online and polling after blur cannot reveal the draft before a foreground recheck", async (t) => {
  const s = await dirtyEditor(t);
  s.event("blur");
  s.event("online");
  await s.h.settle();
  assert.equal(s.visible, false);
  assertPrivateAbsent(s, draftTitle, draftDescription);
  s.tickInterval(30_000);
  await s.h.settle();
  assert.equal(s.visible, false);
  assertPrivateAbsent(s, draftTitle, draftDescription);
  assert.equal(s.guards.at(-1).dirty, true);
  s.event("focus");
  await s.h.settle();
  assert.equal(s.visible, true);
  assert.equal(input(s.dom(), titleLabel).props.value, draftTitle);
  assert.equal(input(s.dom(), descriptionLabel).props.value, draftDescription);
});

test("focus during a held personal-defaults read rechecks access after settlement without a timer", async (t) => {
  const s = await dirtyEditor(t, { fresh: true });
  const defaults = deferred();
  s.defaultsHandler = () => defaults.promise;
  button(s.dom(), "Apply my personal defaults").props.onClick();
  s.h.render();
  await s.h.settle();
  const start = s.requests.length;
  assert.equal(
    s.requests.filter(
      (request) => request.path === "/api/platform/exchange?view=defaults"
    ).length,
    1
  );
  s.event("focus");
  await s.h.settle();
  assert.equal(s.visible, false);
  assertPrivateAbsent(s, draftTitle, draftDescription);
  defaults.resolve(
    response({
      available: true,
      draftFields: {
        intent: "SALE",
        audience: "PUBLIC",
        audienceChurchId: "",
        country: "US",
        placeId: null
      }
    })
  );
  await s.h.settle();
  assert.ok(
    s.requests
      .slice(start)
      .some(
        (request) => request.path === "/api/platform/exchange?view=context"
      ),
    "Focus must be serviced when the held defaults read settles, without polling"
  );
  assert.equal(s.visible, true);
  assert.equal(input(s.dom(), titleLabel).props.value, draftTitle);
  assert.equal(input(s.dom(), descriptionLabel).props.value, draftDescription);
  assert.equal(s.guards.at(-1).dirty, true);
});

for (const phase of ["identity", "Exchange data"]) {
  test(`stalled ${phase} reads abort at the deadline and allow a fresh retry without losing the draft`, async (t) => {
    const s = await dirtyEditor(t);
    const stalled = stalledReads();
    if (phase === "identity") s.identityHandler = stalled.hold;
    else
      s.readHandler = (path, options) => {
        const promise = stalled.hold(options);
        stalled.pending.at(-1).path = path;
        return promise;
      };
    s.event("focus");
    await s.h.settle();
    assert.equal(
      stalled.pending.length,
      2,
      "Both access-read branches are held"
    );
    assert.equal(s.visible, false);
    assertPrivateAbsent(s, draftTitle, draftDescription);
    assert.equal(
      stalled.pending.some((read) => read.aborted),
      false
    );
    s.identityHandler = null;
    s.readHandler = null;
    s.expireAccessDeadline();
    await s.h.settle();
    assert.equal(
      stalled.pending.every((read) => read.aborted && read.settled),
      true,
      "The deadline must cancel the actual fetches, not abandon accumulating requests"
    );
    assert.equal(s.visible, false);
    assert.equal(s.guards.at(-1).dirty, true);
    assert.equal(s.pendingAccessDeadlines, 0);
    const beforeRetry = s.requests.length;
    button(s.dom(), "Check current listing access").props.onClick();
    s.h.render();
    await s.h.settle();
    assert.ok(
      s.requests.length > beforeRetry,
      "Manual retry must issue fresh access reads"
    );
    assert.equal(s.visible, true);
    assert.equal(input(s.dom(), titleLabel).props.value, draftTitle);
    assert.equal(
      input(s.dom(), descriptionLabel).props.value,
      draftDescription
    );
    assert.equal(
      s.pendingAccessDeadlines,
      0,
      "Successful reads release their deadlines"
    );
    // A late completion attempted by the old transport cannot restore an old
    // owner or introduce a stale saved-version conflict after the fresh retry.
    for (const read of stalled.pending)
      read.resolve(
        response(
          phase === "identity"
            ? { id: "owner-b" }
            : read.path.includes("view=context")
              ? {
                  ownerId: "owner-a",
                  churches: [],
                  publishingChurchIds: [],
                  managingChurchIds: []
                }
              : {
                  ...s.saved,
                  listing: { ...s.saved.listing, version: 99 },
                  fields: { ...s.saved.fields, title: "Stale private response" }
                }
        )
      );
    await s.h.settle();
    assert.equal(s.visible, true);
    assert.equal(s.guards.at(-1).dirty, true);
    assert.equal(s.guards.at(-1).conflict, false);
    assert.equal(input(s.dom(), titleLabel).props.value, draftTitle);
    assert.equal(
      input(s.dom(), descriptionLabel).props.value,
      draftDescription
    );
  });
}

test("unmount aborts held access reads and releases their deadline", async (t) => {
  const s = await dirtyEditor(t);
  const stalled = stalledReads();
  s.identityHandler = stalled.hold;
  s.event("focus");
  await s.h.settle();
  assert.equal(stalled.pending.length, 2);
  s.h.unmount();
  await s.h.settle();
  assert.equal(
    stalled.pending.every((read) => read.aborted && read.settled),
    true
  );
  assert.equal(s.pendingAccessDeadlines, 0);
});
