import assert from "node:assert/strict";
import { createHash } from "node:crypto";
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
const row = (extra = {}) => ({
  id: "search-a",
  version: 3,
  schema: 1,
  name: "Private saved name",
  alerts: false,
  criteria: { q: "Previously saved criterion" },
  href: "/platform/exchange?q=Previously+saved+criterion",
  ...extra
});
const page = (searches = []) => ({ ownerId: "owner-a", searches, after: null });
const alertLabel = "Alert me about new matching available listings";

// Execute real source and transport. Only clocks, browser infrastructure and
// explicit component boundaries are mocked; this does not replace browser QA.
function environment(existing) {
  const window = new EventTarget(),
    document = new EventTarget(),
    navigator = { onLine: true };
  document.visibilityState = "visible";
  document.hasFocus = () => true;
  window.location = { reload() {} };
  const deadlines = new Map(),
    intervals = new Map(),
    requests = [],
    confirmed = [],
    dispatched = [];
  let timerId = 0;
  const state = {
    owner: "owner-a",
    visible: true,
    access: true,
    existing,
    result: page(existing ? [existing] : []),
    query: {
      q: "Current criterion",
      currency: "KWD",
      basis: "item",
      maxPriceMinor: 1001,
      after: "page-cursor"
    },
    acceptedReceipt: null,
    guard: null,
    recovery: null,
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
          id: body.searchId,
          version: body.expectedVersion + 1,
          message: "Fictional search saved"
        });
      }
      const url = new URL(path, "https://fixture.invalid");
      assert.equal(url.pathname, "/api/platform/exchange");
      assert.ok(["search", "searches"].includes(url.searchParams.get("view")));
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
    "./read-visibility": { useReadVisibility: () => state.visible },
    "./private-snapshot-guard": {
      usePrivateRecovery(_id, pending, busy, retry) {
        state.recovery = pending ? { busy, retry } : null;
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
function formHarness(t, existing, currentProps) {
  const s = environment(existing);
  const { ExchangeSaveSearchForm } = s.h.load(
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
    ExchangeSaveSearchForm({
      owner: "owner-a",
      query: s.state.query,
      existing: s.state.existing,
      privacy: s.privacy(),
      acceptedReceipt: s.state.acceptedReceipt,
      onRequest(value) {
        s.dispatched.push(value);
        s.state.acceptedReceipt = null;
      },
      ...currentProps?.()
    })
  );
  t.after(() => s.h.unmount());
  return {
    ...s,
    name() {
      return input(s.h.output, "Search name");
    },
    alerts() {
      return input(s.h.output, alertLabel);
    },
    change(name, alerts) {
      input(s.h.output, "Search name").props.onChange({
        target: { value: name }
      });
      if (alerts !== undefined)
        input(s.h.output, alertLabel).props.onChange({
          target: { checked: alerts }
        });
      s.h.render();
    },
    submit() {
      nodes(s.h.output, (n) => n.type === "form")[0].props.onSubmit({
        preventDefault() {}
      });
      s.h.render();
    },
    accept(receipt, existing = s.state.existing) {
      s.state.acceptedReceipt = receipt;
      s.state.existing = existing;
      s.h.render();
    },
    blocked() {
      return nodes(s.h.output, (n) => n.type === "fieldset")[0].props.disabled;
    }
  };
}

test("saved-search server bootstrap keeps canonical authorization without serializing the saved row", async () => {
  const h = clientHarness({ URLSearchParams }),
    calls = [];
  const ExchangeSearchSaveEntry = () => null,
    ExchangeSaveSearchForm = () => null;
  const options = h.load("lib/platform/exchange-options.ts");
  const { ExchangeList } = h.load("components/platform/exchange-page-ui.tsx", {
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
    "./exchange-saved-controls": { ExchangeSaveSearchForm },
    "./exchange-saved-list": { ExchangeSavedList: "list" },
    "./exchange-saved-search-entry": { ExchangeSearchSaveEntry },
    "@/lib/platform/post-input": { postId: (value) => value },
    "./exchange-search-position": { ExchangeSearchPosition: "position" },
    "@/lib/platform/exchange-navigation": {},
    "./exchange-filters": { ExchangeFilters: "filters" },
    "@/lib/platform/account-entry": {},
    "@/lib/platform/portal-policy": { PortalError: Error },
    "@/lib/platform/session": {
      getCurrentPlatformUser: async () => ({ id: "owner-a" })
    },
    "@/lib/platform/exchange-session": {
      exchangeListPage: async () => ({
        ownerId: "owner-a",
        listings: [],
        churches: [],
        canSave: true,
        pageCursor: "page",
        after: null
      }),
      exchangeSavedPage: async (query) => {
        calls.push(query);
        return page([row()]);
      }
    },
    "@/lib/platform/exchange-options": options,
    "@/lib/platform/discovery-options": {},
    "@/lib/platform/exchange-input": {
      parseExchangeListQuery: (query) => query
    }
  });
  const tree = await ExchangeList({
    query: { q: "Current criterion", savedSearch: "search-a" }
  });
  const region = nodes(
    tree,
    (n) => n.type?.name === "ExchangeSearchSaveRegion"
  );
  assert.equal(region.length, 1);
  const result = await region[0].type(region[0].props);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].view, "search");
  assert.equal(calls[0].searchId, "search-a");
  assert.ok(!JSON.stringify(result).includes("Private saved name"));
  assert.ok(!JSON.stringify(result).includes("Previously saved criterion"));
  const entry = nodes(result, (n) => n.type === ExchangeSearchSaveEntry);
  assert.equal(entry.length, 1);
  assert.equal(entry[0].props.owner, "owner-a");
  assert.equal(entry[0].props.searchId, "search-a");
  assert.deepEqual(Object.keys(entry[0].props).sort(), [
    "owner",
    "query",
    "searchId"
  ]);
});

for (const edit of [false, true])
  test(`${edit ? "existing" : "new"} saved-search concealment omits private fields while retaining name and alert choice`, (t) => {
    const s = formHarness(t, edit ? row() : undefined);
    const details = () => nodes(s.h.output, (n) => n.type === "details")[0];
    assert.equal(details().props.open, edit);
    if (!edit) {
      details().props.onToggle({ currentTarget: { open: true } });
      s.h.render();
    }
    s.change("Unsent private name", true);
    s.setVisible(false);
    assert.equal(
      nodes(s.h.output, (n) => n.type === "input" || n.type === "form").length,
      0
    );
    assert.ok(!JSON.stringify(s.h.output).includes("Unsent private name"));
    assert.equal(s.state.guard.dirty, true);
    assert.equal(s.state.guard.protectBack, true);
    s.setVisible(true);
    assert.equal(details().props.open, true);
    assert.equal(s.name().props.value, "Unsent private name");
    assert.equal(s.alerts().props.checked, true);
  });

for (const edit of [false, true])
  test(`${edit ? "existing" : "new"} lost save keeps its minted target, criteria and exact bytes through outer-parent retry`, async (t) => {
    const s = formHarness(t, edit ? row() : undefined);
    s.change("Unsent private name", true);
    s.state.writeHandler = () => {
      throw new TypeError("Fictional accepted reply lost");
    };
    s.submit();
    await s.h.settle();
    const original = s.writes()[0].body,
      body = JSON.parse(original);
    assert.equal(body.expectedVersion, edit ? 3 : 0);
    assert.ok(body.searchId);
    if (edit) assert.equal(body.searchId, "search-a");
    assert.equal(body.criteria.q, "Current criterion");
    assert.equal(body.criteria.maxPrice, "1.001");
    assert.equal(body.criteria.after, undefined);
    s.state.query = { q: "Newer route criterion" };
    s.setVisible(false);
    assert.ok(
      s.state.recovery,
      "The outer snapshot guard retains an exact-retry callback"
    );
    s.state.writeHandler = () =>
      response({
        id: "wrong-target",
        version: body.expectedVersion + 1,
        message: "Wrong target"
      });
    s.state.recovery.retry();
    await s.h.settle();
    assert.equal(s.confirmed.length, 0);
    assert.equal(
      s.state.guard.saving,
      true,
      "Wrong-target receipt cannot release original pending work"
    );
    assert.ok(s.state.recovery);
    s.state.writeHandler = () =>
      response({
        id: body.searchId,
        version: body.expectedVersion,
        message: "Wrong version"
      });
    s.state.recovery.retry();
    await s.h.settle();
    assert.equal(s.confirmed.length, 0);
    assert.equal(
      s.state.guard.saving,
      true,
      "Wrong-version receipt cannot release original pending work"
    );
    assert.ok(s.state.recovery);
    s.state.writeHandler = null;
    s.state.recovery.retry();
    await s.h.settle();
    assert.equal(s.writes().length, 4);
    assert.ok(s.writes().every((request) => request.body === original));
    assert.equal(s.confirmed.length, 1);
    assert.equal(s.confirmed[0].id, body.searchId);
    assert.equal(s.confirmed[0].version, body.expectedVersion + 1);
    assert.equal(nodes(s.h.output, (n) => n.type === "input").length, 0);
  });

test("new searches require each exact visible acknowledgment even when every receipt is version one", async (t) => {
  const s = formHarness(t);
  s.change("First private name", true);
  s.submit();
  await s.h.settle();
  assert.equal(s.confirmed.length, 1);
  const first = s.confirmed[0];
  assert.equal(s.name().props.value, "First private name");
  s.setVisible(false);
  s.accept(first);
  await s.h.settle();
  assert.equal(nodes(s.h.output, (n) => n.type === "input").length, 0);
  assert.equal(
    s.state.guard.dirty,
    true,
    "Concealed acknowledgment cannot clear the retained draft"
  );
  s.setVisible(true);
  await s.h.settle();
  assert.equal(s.name().props.value, "");
  assert.equal(s.alerts().props.checked, false);
  assert.equal(s.blocked(), false);
  s.change("Second private name", false);
  s.submit();
  await s.h.settle();
  const second = s.confirmed[1];
  assert.equal(first.version, 1);
  assert.equal(second.version, 1);
  assert.notEqual(first.id, second.id);
  s.accept(first);
  await s.h.settle();
  assert.equal(s.blocked(), true);
  assert.equal(s.name().props.value, "Second private name");
  s.accept({ ...second });
  await s.h.settle();
  assert.equal(s.blocked(), true);
  s.accept(second);
  await s.h.settle();
  assert.equal(s.name().props.value, "");
  assert.equal(s.blocked(), false);
  assert.equal(
    new Set(s.writes().map((r) => JSON.parse(r.body).mutationId)).size,
    2
  );
});

test("accepted existing search updates its baseline/version while preserving independently changed local fields", async (t) => {
  const s = formHarness(t, row());
  s.change("Submitted name", true);
  s.submit();
  await s.h.settle();
  assert.equal(s.confirmed.length, 1);
  s.change("Newer unsent name", false);
  s.accept(
    s.confirmed[0],
    row({ version: 4, name: "Submitted name", alerts: true })
  );
  await s.h.settle();
  assert.equal(s.name().props.value, "Newer unsent name");
  assert.equal(s.alerts().props.checked, false);
  assert.equal(s.state.guard.dirty, true);
  assert.equal(s.blocked(), false);
  s.submit();
  await s.h.settle();
  const second = JSON.parse(s.writes()[1].body);
  assert.equal(second.searchId, "search-a");
  assert.equal(second.expectedVersion, 4);
  assert.equal(second.name, "Newer unsent name");
  assert.equal(second.alerts, false);
});

test("definitive validation failure keeps entries but permits a fresh corrected request", async (t) => {
  const s = formHarness(t);
  s.change("Rejected name", true);
  s.state.writeHandler = () =>
    response({ message: "Fictional invalid choice" }, 400);
  s.submit();
  await s.h.settle();
  assert.equal(s.confirmed.length, 0);
  assert.equal(s.state.guard.saving, false);
  assert.equal(s.blocked(), false);
  s.change("Corrected name", false);
  s.state.writeHandler = null;
  s.submit();
  await s.h.settle();
  assert.equal(s.confirmed.length, 1);
  assert.equal(JSON.parse(s.writes()[1].body).name, "Corrected name");
  assert.notEqual(
    JSON.parse(s.writes()[1].body).mutationId,
    JSON.parse(s.writes()[0].body).mutationId
  );
});

test("back-to-back submissions cannot replace the first target or register a second dispatch", async (t) => {
  const s = formHarness(t);
  s.change("One private name", true);
  const submit = nodes(s.h.output, (n) => n.type === "form")[0].props.onSubmit;
  submit({ preventDefault() {} });
  submit({ preventDefault() {} });
  await s.h.settle();
  assert.equal(s.writes().length, 1);
  assert.equal(s.dispatched.length, 1);
  assert.equal(s.confirmed.length, 1);
  assert.equal(s.confirmed[0].id, JSON.parse(s.writes()[0].body).searchId);
});

function ownerHarness(t, { edit = true, holdFirst = false } = {}) {
  const s = environment(edit ? row() : undefined),
    first = deferred();
  if (holdFirst) s.state.readHandler = () => first.promise;
  const ExchangeSaveSearchForm = () => null;
  const { ExchangeSearchSaveEntry } = s.h.load(
    "components/platform/exchange-saved-search-entry.tsx",
    {
      "next/link": { default: "a" },
      "@/lib/platform/social-client": s.social,
      "./exchange-saved-controls": { ExchangeSaveSearchForm },
      "./read-visibility": {
        ReadVisibility: { Provider: "visibility" },
        useReadVisibility: () => s.state.visible
      }
    }
  );
  s.h.mount(() =>
    ExchangeSearchSaveEntry({
      owner: "owner-a",
      query: s.state.query,
      ...(edit ? { searchId: "search-a" } : {})
    })
  );
  t.after(() => s.h.unmount());
  return {
    ...s,
    first,
    form() {
      return nodes(s.h.output, (n) => n.type === ExchangeSaveSearchForm)[0];
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
const receipt = (edit = true, extra = {}) => ({
  id: edit ? "search-a" : "minted-search",
  version: edit ? 4 : 1,
  message: "Fictional search saved",
  ...extra
});

for (const edit of [false, true])
  test(`${edit ? "existing" : "new"} entry holds all form props until its first current pinned read completes`, async (t) => {
    const s = ownerHarness(t, { edit, holdFirst: true });
    assert.equal(s.form(), undefined);
    assert.ok(!JSON.stringify(s.h.output).includes("Private saved name"));
    await s.h.settle();
    assert.equal(s.visible(), false);
    s.first.resolve(response(s.state.result));
    await s.h.settle();
    assert.equal(s.visible(), true);
    assert.equal(s.form().props.privacy.currentAccess, true);
    assert.equal(s.form().props.existing?.id, edit ? "search-a" : undefined);
    assert.equal(
      s.reads()[0].path,
      "/api/platform/exchange?view=" +
        (edit ? "search&searchId=search-a" : "searches")
    );
    assert.equal(s.deadlines.size, 0);
  });

test("new entry ignores unrelated saved-search rows and does not adopt them as its draft", async (t) => {
  const s = ownerHarness(t, { edit: false, holdFirst: true });
  s.first.resolve(response(page([row()])));
  await s.h.settle();
  const first = s.form();
  assert.equal(first.props.existing, undefined);
  s.state.readHandler = () =>
    response(page([row({ id: "other-search", version: 8 })]));
  s.emit("focus");
  await s.h.settle();
  assert.equal(s.visible(), true);
  assert.equal(s.form().key, first.key);
  assert.equal(s.form().props.existing, undefined);
  assert.ok(!JSON.stringify(s.h.output).includes("Private saved name"));
});

test("initial existing-search 404 cannot initialize a blank new editor or grant fallback access", async (t) => {
  const s = ownerHarness(t, { holdFirst: true });
  s.first.resolve(response({ message: "Saved search unavailable" }, 404));
  await s.h.settle();
  assert.equal(s.form(), undefined);
  assert.equal(s.visible(), false);
  assert.equal(s.reads().length, 1);
  s.state.readHandler = null;
  button(s.h.output, "Recheck current access").props.onClick();
  await s.h.settle();
  assert.equal(s.form().props.existing.id, "search-a");
  assert.equal(s.visible(), true);
});

test("saved-search entry retains its owner through concealment and ignores passive resume events", async (t) => {
  const s = ownerHarness(t);
  await s.h.settle();
  const original = s.form();
  for (const event of ["blur", "pagehide", "offline"]) {
    s.emit(event);
    assert.equal(s.visible(), false);
    assert.equal(s.form().key, original.key);
    assert.equal(s.form().props.existing, original.props.existing);
    assert.equal(s.form().props.privacy.currentAccess, false);
    const count = s.requests.length;
    s.emit("online");
    s.poll();
    await s.h.settle();
    assert.equal(s.requests.length, count);
    s.emit("focus");
    await s.h.settle();
    assert.equal(s.visible(), true);
  }
  s.setVisible(false);
  assert.equal(s.visible(), false);
  assert.equal(
    s.form().props.privacy.currentAccess,
    true,
    "Outer concealment cannot disable separately authorized exact retries"
  );
  s.setVisible(true);
  assert.equal(s.visible(), true);
});

test("an unsolicited saved version change stays concealed without rebasing the retained form", async (t) => {
  const s = ownerHarness(t);
  await s.h.settle();
  const original = s.form();
  s.state.result = page([
    row({ version: 4, name: "Changed elsewhere", alerts: true })
  ]);
  s.emit("focus");
  await s.h.settle();
  assert.equal(s.visible(), false);
  assert.equal(s.form().key, original.key);
  assert.equal(s.form().props.existing, original.props.existing);
  assert.equal(s.form().props.privacy.currentAccess, true);
  assert.equal(s.form().props.acceptedReceipt ?? null, null);
});

test("a minted new row appearing after a lost response cannot silently turn the draft into an edit", async (t) => {
  const s = ownerHarness(t, { edit: false });
  await s.h.settle();
  const original = s.form();
  s.form().props.onRequest({ id: "minted-search", expectedVersion: 0 });
  s.state.result = page([row({ id: "minted-search", version: 1 })]);
  s.emit("focus");
  await s.h.settle();
  assert.equal(
    s.reads().at(-1).path,
    "/api/platform/exchange?view=search&searchId=minted-search"
  );
  assert.equal(s.visible(), false);
  assert.equal(s.form().key, original.key);
  assert.equal(s.form().props.existing, undefined);
  assert.equal(s.form().props.privacy.currentAccess, true);
  assert.equal(s.form().props.acceptedReceipt ?? null, null);
});

for (const edit of [false, true])
  test(`${edit ? "existing" : "new"} exact receipt plus equal-version canonical read acknowledges only that request`, async (t) => {
    const s = ownerHarness(t, { edit });
    await s.h.settle();
    const original = s.form(),
      accepted = receipt(edit);
    s.form().props.onRequest({
      id: accepted.id,
      expectedVersion: accepted.version - 1
    });
    s.state.result = page([
      row({
        id: accepted.id,
        version: accepted.version,
        name: "Submitted name",
        alerts: true
      })
    ]);
    s.form().props.privacy.onConfirmed(accepted);
    await s.h.settle();
    assert.equal(s.visible(), true);
    assert.equal(s.form().key, original.key);
    assert.equal(s.form().props.acceptedReceipt, accepted);
    assert.equal(s.form().props.existing?.version, edit ? 4 : undefined);
    if (!edit) {
      s.state.result = page([row({ id: "unrelated" })]);
      s.emit("focus");
      await s.h.settle();
      assert.equal(
        s.reads().at(-1).path,
        "/api/platform/exchange?view=searches"
      );
      assert.equal(s.visible(), true);
      assert.equal(s.form().props.existing, undefined);
    }
  });

test("a newer-than-receipt saved row remains concealed for explicit review without acceptance or rearm", async (t) => {
  const s = ownerHarness(t);
  await s.h.settle();
  const original = s.form(),
    accepted = receipt();
  s.form().props.onRequest({ id: accepted.id, expectedVersion: 3 });
  s.state.result = page([row({ version: 5, name: "A later unrelated edit" })]);
  s.form().props.privacy.onConfirmed(accepted);
  await s.h.settle();
  assert.equal(s.visible(), false);
  assert.equal(s.form().props.existing, original.props.existing);
  assert.equal(s.form().props.acceptedReceipt ?? null, null);
  assert.equal(s.form().props.privacy.currentAccess, true);
});

test("hidden confirmation and an older held read cannot acknowledge a pre-save snapshot", async (t) => {
  const s = ownerHarness(t);
  await s.h.settle();
  const original = s.form(),
    accepted = receipt(),
    held = deferred();
  s.form().props.onRequest({ id: accepted.id, expectedVersion: 3 });
  s.state.readHandler = () => held.promise;
  s.emit("focus");
  await s.h.settle();
  s.emit("blur");
  s.form().props.privacy.onConfirmed(accepted);
  held.resolve(response(page([row()])));
  await s.h.settle();
  assert.equal(s.visible(), false);
  assert.equal(s.form().props.acceptedReceipt ?? null, null);
  assert.equal(s.form().props.existing, original.props.existing);
  s.state.readHandler = null;
  s.state.result = page([row({ version: 4 })]);
  s.emit("focus");
  await s.h.settle();
  assert.equal(s.visible(), true);
  assert.equal(s.form().props.acceptedReceipt, accepted);
});

for (const edit of [false, true])
  test(`${edit ? "existing" : "new"} retained-original 404 permits actor-pinned replay but confirmed disappearance never rearms`, async (t) => {
    const s = ownerHarness(t, { edit });
    await s.h.settle();
    const original = s.form(),
      accepted = receipt(edit);
    s.form().props.onRequest({
      id: accepted.id,
      expectedVersion: accepted.version - 1
    });
    s.state.readHandler = (_options, path) =>
      new URL(path, "https://fixture.invalid").searchParams.get("view") ===
      "search"
        ? response({ message: "Saved search unavailable" }, 404)
        : response(page());
    s.emit("focus");
    await s.h.settle();
    assert.equal(s.visible(), false);
    assert.equal(s.form().key, original.key);
    assert.equal(s.form().props.privacy.currentAccess, true);
    assert.equal(s.form().props.acceptedReceipt ?? null, null);
    assert.equal(s.reads().at(-1).path, "/api/platform/exchange?view=searches");
    s.form().props.privacy.onConfirmed(accepted);
    await s.h.settle();
    assert.equal(s.visible(), false);
    assert.equal(s.form().props.existing, original.props.existing);
    assert.equal(s.form().props.acceptedReceipt ?? null, null);
    assert.match(textContent(s.h.output), /confirmed|saved/i);
    assert.match(textContent(s.h.output), /unavailable|removed|no longer/i);
  });

test("lost actor authority cannot be bypassed by saved-search 404 fallback", async (t) => {
  const s = ownerHarness(t);
  await s.h.settle();
  const original = s.form();
  s.form().props.onRequest({ id: "search-a", expectedVersion: 3 });
  s.state.readHandler = (_options, path) =>
    response(
      { message: "Unavailable" },
      path.includes("view=search&") ? 404 : 403
    );
  s.emit("focus");
  await s.h.settle();
  assert.equal(s.form().props.privacy.currentAccess, false);
  assert.equal(s.form().props.existing, original.props.existing);
  assert.equal(s.visible(), false);
  s.state.readHandler = null;
  s.state.identityHandler = () => response({}, 503);
  s.emit("focus");
  await s.h.settle();
  assert.equal(s.form().props.privacy.currentAccess, false);
  assert.equal(s.form().props.existing, original.props.existing);
});

for (const stage of ["identity", "search"])
  test(`a stalled saved-search ${stage} read aborts and a queued fresh check restores the retained owner`, async (t) => {
    const s = ownerHarness(t);
    await s.h.settle();
    const original = s.form();
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
    s.state.identityHandler = null;
    s.state.readHandler = null;
    s.expire();
    await s.h.settle();
    assert.equal(signal.aborted, true);
    assert.equal(s.visible(), true);
    assert.equal(s.form().key, original.key);
    assert.equal(s.form().props.existing, original.props.existing);
    assert.equal(s.deadlines.size, 0);
  });

test("a confirmed replacement account clears saved-search ownership despite concurrent blur", async (t) => {
  const s = ownerHarness(t);
  await s.h.settle();
  s.state.identityHandler = () => {
    s.emit("blur");
    return response({ id: "owner-b" });
  };
  s.emit("focus");
  await s.h.settle();
  assert.equal(s.visible(), false);
  assert.equal(s.form(), undefined);
  assert.ok(!JSON.stringify(s.h.output).includes("Private saved name"));
});

test("new-search definitive validation rejection cannot strand the retained draft on resume", async (t) => {
  const owner = ownerHarness(t, { edit: false });
  await owner.h.settle();
  const form = formHarness(t, undefined, () => owner.form().props);
  form.change("Rejected private name", true);
  form.state.writeHandler = () =>
    response({ message: "Fictional invalid choice" }, 400);
  form.submit();
  await form.h.settle();
  await owner.h.settle();
  assert.equal(
    form.state.recovery,
    null,
    "Definitive rejection has no original request to retry"
  );
  owner.state.readHandler = (_options, path) =>
    response(
      path.includes("view=search&")
        ? { message: "This new target was never created" }
        : page(),
      path.includes("view=search&") ? 404 : 200
    );
  owner.emit("blur");
  form.setVisible(owner.visible());
  assert.equal(nodes(form.h.output, (n) => n.type === "input").length, 0);
  owner.emit("focus");
  await owner.h.settle();
  form.setVisible(owner.visible());
  assert.equal(
    owner.visible(),
    true,
    "An uncreated target after definitive 400 cannot force replay-only concealment"
  );
  assert.equal(form.name().props.value, "Rejected private name");
  assert.equal(form.alerts().props.checked, true);
  assert.equal(form.blocked(), false);
  form.change("Corrected private name", false);
  form.state.writeHandler = null;
  form.submit();
  await form.h.settle();
  assert.equal(form.writes().length, 2);
  assert.equal(
    JSON.parse(form.writes()[1].body).name,
    "Corrected private name"
  );
  assert.equal(JSON.parse(form.writes()[1].body).expectedVersion, 0);
});
