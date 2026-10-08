import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import {
  button,
  clientHarness,
  textContent
} from "./fixtures/client-hook-harness.mjs";

const endpoint = "/api/platform/exchange?view=handoff-incoming";
const response = (data, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: new Headers(),
  body: { cancel: async () => {} },
  json: async () => data
});
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};
const digest = (algorithm, bytes) => {
  assert.equal(algorithm, "SHA-256");
  return Uint8Array.from(createHash("sha256").update(bytes).digest()).buffer;
};
function setup(t, { focused = true, online = true, hidden = false } = {}) {
  const window = new EventTarget(),
    document = new EventTarget();
  document.visibilityState = hidden ? "hidden" : "visible";
  document.hasFocus = () => focused;
  let reloads = 0;
  window.location = {
    reload() {
      reloads++;
    }
  };
  const navigator = { onLine: online },
    deadlines = new Map(),
    requests = [];
  let id = 0,
    owner = "owner-a",
    readHandler,
    identityHandler,
    digestHandler;
  let data = {
    ownerId: owner,
    inquiries: [{ id: "inquiry-a", person: { name: "Private participant A" } }],
    after: null
  };
  const h = clientHarness({
    window,
    document,
    navigator,
    Error,
    TypeError,
    AbortController,
    TextEncoder,
    Uint8Array,
    crypto: {
      subtle: {
        digest: async (...args) =>
          digestHandler ? digestHandler(...args) : digest(...args)
      }
    },
    setTimeout(fn, ms) {
      assert.equal(ms, 15000);
      deadlines.set(++id, fn);
      return id;
    },
    clearTimeout(id) {
      deadlines.delete(id);
    },
    fetch: async (path, options) => {
      requests.push({ path, ...options });
      if (path === "/api/platform/profile?view=identity")
        return identityHandler
          ? identityHandler(options)
          : response({ id: owner });
      assert.equal(path, endpoint);
      assert.equal(options.method, "GET");
      assert.equal(options.cache, "no-store");
      assert.equal(options.headers["X-Expected-Account"], "owner-a");
      return readHandler ? readHandler(options) : response(data);
    }
  });
  const social = h.load("lib/platform/social-client.ts", {
    "./privileged-auth-navigation": { announcePrivilegedChallenge: () => false }
  });
  const { PrivateReadSnapshot } = h.load(
    "components/platform/private-read-snapshot.tsx",
    { "@/lib/platform/social-client": social }
  );
  h.mount(() =>
    PrivateReadSnapshot({
      owner: "owner-a",
      url: endpoint,
      label: "inquiry list",
      changedNotice: "Inquiry list changed. Reload to review.",
      children: (data) =>
        data.inquiries.map((row) => ({
          type: "a",
          props: { href: "/inquiry/" + row.id, children: row.person.name }
        }))
    })
  );
  t.after(() => h.unmount());
  return {
    h,
    document,
    navigator,
    requests,
    get data() {
      return data;
    },
    set data(value) {
      data = value;
    },
    set owner(value) {
      owner = value;
    },
    set readHandler(value) {
      readHandler = value;
    },
    set identityHandler(value) {
      identityHandler = value;
    },
    set digestHandler(value) {
      digestHandler = value;
    },
    get reads() {
      return requests.filter((r) => r.path === endpoint);
    },
    get deadlines() {
      return deadlines.size;
    },
    get reloads() {
      return reloads;
    },
    expire() {
      for (const [id, fn] of [...deadlines]) {
        deadlines.delete(id);
        fn();
      }
      h.render();
    },
    emit(event) {
      window.dispatchEvent(new Event(event));
      h.render();
    },
    visibility(value) {
      document.visibilityState = value;
      document.dispatchEvent(new Event("visibilitychange"));
      h.render();
    },
    retry() {
      button(h.output, "Recheck current access").props.onClick();
      h.render();
    }
  };
}
const concealed = (s) =>
  assert.ok(!textContent(s.h.output).includes("Private participant"));
const accepted = (s, name = "A") =>
  assert.equal(textContent(s.h.output), "Private participant " + name);

test("private reader starts empty and accepts only the real account-pinned no-store read", async (t) => {
  const s = setup(t);
  concealed(s);
  await s.h.settle();
  accepted(s);
  assert.equal(s.reads.length, 1);
  assert.equal(s.deadlines, 0);
});

test("unfocused, hidden and offline mounts wait for a usable explicit return", async (t) => {
  for (const options of [
    { focused: false },
    { hidden: true },
    { online: false }
  ]) {
    const s = setup(t, options);
    await s.h.settle();
    concealed(s);
    assert.equal(s.requests.length, 0);
    s.emit("online");
    s.emit("social-relationships-changed");
    await s.h.settle();
    concealed(s);
    assert.equal(s.requests.length, 0);
    s.navigator.onLine = true;
    s.document.visibilityState = "visible";
    s.document.hasFocus = () => true;
    s.emit("focus");
    await s.h.settle();
    accepted(s);
    s.h.unmount();
  }
});

test("blur, pagehide, offline and hidden visibility remove rows; passive events do not reopen them", async (t) => {
  const s = setup(t);
  await s.h.settle();
  for (const event of ["blur", "pagehide", "offline", "hidden"]) {
    if (event === "hidden") s.visibility("hidden");
    else s.emit(event);
    concealed(s);
    const before = s.reads.length;
    s.emit("online");
    s.emit("social-relationships-changed");
    await s.h.settle();
    concealed(s);
    assert.equal(s.reads.length, before);
    s.document.visibilityState = "visible";
    s.emit("focus");
    await s.h.settle();
    accepted(s);
  }
});

test("held and failed data checks conceal rows and permit a fresh explicit retry", async (t) => {
  const s = setup(t),
    held = deferred();
  s.readHandler = () => held.promise;
  await s.h.settle();
  concealed(s);
  held.resolve(response({ message: "Current list unavailable" }, 503));
  await s.h.settle();
  concealed(s);
  assert.ok(textContent(s.h.output).includes("Current list unavailable"));
  s.readHandler = null;
  s.retry();
  await s.h.settle();
  accepted(s);
});

test("held identity failure never reaches the private endpoint and explicit retry recovers", async (t) => {
  const s = setup(t);
  await s.h.settle();
  const held = deferred();
  s.identityHandler = () => held.promise;
  s.emit("social-relationships-changed");
  await s.h.settle();
  concealed(s);
  assert.equal(s.reads.length, 1);
  held.resolve(response({ message: "Identity unavailable" }, 503));
  await s.h.settle();
  concealed(s);
  assert.equal(s.reads.length, 1);
  s.identityHandler = null;
  s.retry();
  await s.h.settle();
  accepted(s);
});

test("a newer queued check invalidates the older response before it can establish the checksum", async (t) => {
  const s = setup(t),
    held = deferred();
  s.readHandler = () => held.promise;
  await s.h.settle();
  s.emit("social-relationships-changed");
  s.data = {
    ...s.data,
    inquiries: [{ id: "inquiry-b", person: { name: "Private participant B" } }]
  };
  s.readHandler = null;
  held.resolve(
    response({
      ...s.data,
      inquiries: [
        { id: "inquiry-a", person: { name: "Private participant A" } }
      ]
    })
  );
  await s.h.settle();
  accepted(s, "B");
  assert.equal(s.reads.length, 2);
});

test("the owned deadline aborts a hung read and drains one fresh queued check", async (t) => {
  const s = setup(t),
    held = deferred();
  let signal;
  s.readHandler = (options) => {
    signal = options.signal;
    signal?.addEventListener("abort", () => held.reject(signal.reason), {
      once: true
    });
    return held.promise;
  };
  await s.h.settle();
  assert.equal(s.deadlines, 1);
  s.emit("social-relationships-changed");
  s.emit("social-relationships-changed");
  s.readHandler = null;
  s.expire();
  await s.h.settle();
  assert.equal(signal.aborted, true);
  accepted(s);
  assert.equal(s.reads.length, 2);
  assert.equal(s.deadlines, 0);
});

test("identity deadline stays concealed and permits retry after the stalled identity request", async (t) => {
  const s = setup(t);
  await s.h.settle();
  const held = deferred();
  let signal;
  s.identityHandler = (options) => {
    signal = options.signal;
    signal?.addEventListener("abort", () => held.reject(signal.reason), {
      once: true
    });
    return held.promise;
  };
  s.emit("social-relationships-changed");
  await s.h.settle();
  s.expire();
  await s.h.settle();
  concealed(s);
  assert.equal(signal?.aborted, true);
  assert.ok(textContent(s.h.output).includes("timed out"));
  s.identityHandler = null;
  s.retry();
  await s.h.settle();
  accepted(s);
});

test("a deadline during checksum calculation cannot accept the expired snapshot", async (t) => {
  const s = setup(t),
    held = deferred();
  s.digestHandler = () => held.promise;
  await s.h.settle();
  assert.equal(s.deadlines, 1);
  s.expire();
  held.resolve(
    digest("SHA-256", new TextEncoder().encode(JSON.stringify(s.data)))
  );
  await s.h.settle();
  concealed(s);
  assert.ok(textContent(s.h.output).includes("timed out"));
  s.digestHandler = null;
  s.retry();
  await s.h.settle();
  accepted(s);
});

test("a concealed pending response cannot reinsert private rows", async (t) => {
  const s = setup(t),
    held = deferred();
  s.readHandler = () => held.promise;
  await s.h.settle();
  s.emit("blur");
  held.resolve(response(s.data));
  await s.h.settle();
  concealed(s);
  s.readHandler = null;
  s.emit("focus");
  await s.h.settle();
  accepted(s);
});

test("changed snapshots stay concealed through rechecks and require explicit reload", async (t) => {
  const s = setup(t);
  await s.h.settle();
  s.data = {
    ...s.data,
    inquiries: [{ id: "inquiry-b", person: { name: "Private participant B" } }]
  };
  s.emit("social-relationships-changed");
  await s.h.settle();
  concealed(s);
  assert.ok(textContent(s.h.output).includes("Inquiry list changed"));
  s.retry();
  await s.h.settle();
  concealed(s);
  assert.ok(textContent(s.h.output).includes("Inquiry list changed"));
  button(s.h.output, "Reload current information").props.onClick();
  assert.equal(s.reloads, 1);
});

test("account replacement fails closed without restoring the prior participant rows", async (t) => {
  const s = setup(t);
  await s.h.settle();
  s.owner = "owner-b";
  s.emit("social-relationships-changed");
  await s.h.settle();
  concealed(s);
  s.retry();
  await s.h.settle();
  concealed(s);
  assert.equal(s.reads.length, 1);
});

test("unmount cancels only the owned read and removes event subscriptions", async (t) => {
  const s = setup(t),
    held = deferred();
  let signal;
  s.readHandler = (options) => {
    signal = options.signal;
    signal?.addEventListener("abort", () => held.reject(signal.reason), {
      once: true
    });
    return held.promise;
  };
  await s.h.settle();
  s.h.unmount();
  await s.h.settle();
  assert.equal(signal?.aborted, true);
  assert.equal(s.deadlines, 0);
  s.emit("focus");
  await s.h.settle();
  assert.equal(s.reads.length, 1);
});
