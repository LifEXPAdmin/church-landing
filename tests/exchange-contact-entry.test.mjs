import assert from "node:assert/strict";
import test from "node:test";
import { webcrypto } from "node:crypto";
import {
  button,
  clientHarness,
  nodes,
  textContent
} from "./fixtures/client-hook-harness.mjs";

const endpoint =
  "/api/platform/exchange?view=handoff-contact&listingId=listing-a";
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

function setup(t) {
  let visible = true,
    owner = "owner-a",
    listingVersion = 4,
    readHandler = null,
    digestHandler = null;
  let data = {
    ownerId: "owner-a",
    contact: {
      listingId: "listing-a",
      listingVersion: 4,
      version: 2,
      enabled: false,
      receiving: false,
      canEnable: true
    },
    intake: true
  };
  const requests = [],
    deadlines = new Map();
  let deadlineId = 0;
  const globals = {
    Error,
    TypeError,
    AbortController,
    URLSearchParams,
    TextEncoder,
    Uint8Array,
    crypto: {
      subtle: {
        digest: (...args) =>
          digestHandler
            ? digestHandler(...args)
            : webcrypto.subtle.digest(...args)
      }
    },
    setTimeout(callback, delay) {
      assert.equal(
        delay,
        15_000,
        "Contact initialization owns its read deadline"
      );
      const id = ++deadlineId;
      deadlines.set(id, callback);
      return id;
    },
    clearTimeout(id) {
      deadlines.delete(id);
    },
    fetch: async (path, options) => {
      requests.push({ path, ...options });
      if (path === "/api/platform/profile?view=identity")
        return response({ id: owner });
      assert.equal(path, endpoint);
      assert.equal(options.method, "GET");
      assert.equal(options.headers["X-Expected-Account"], "owner-a");
      return readHandler ? readHandler(options) : response(data);
    }
  };
  const h = clientHarness(globals);
  const social = h.load("lib/platform/social-client.ts", {
    "./privileged-auth-navigation": { announcePrivilegedChallenge: () => false }
  });
  // Exercise this loader and the real identity/response transport. Existing
  // guard and mutation controllers remain explicit leaf seams; their exact
  // request recovery is also exercised in the hosted handoff browser suite.
  const PrivateSnapshotGuard = () => null;
  const ExchangeContactChoice = () => null;
  const { ExchangeContactEntry } = h.load(
    "components/platform/exchange-contact-entry.tsx",
    {
      "next/link": { default: "a" },
      "@/lib/platform/social-client": social,
      "./exchange-handoff-controls": { ExchangeContactChoice },
      "./private-snapshot-guard": { PrivateSnapshotGuard },
      "./read-visibility": { useReadVisibility: () => visible }
    }
  );
  h.mount(() =>
    ExchangeContactEntry({
      owner: "owner-a",
      listingId: "listing-a",
      listingVersion
    })
  );
  t.after(() => h.unmount());
  return {
    h,
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
    set digestHandler(value) {
      digestHandler = value;
    },
    get contactReads() {
      return requests.filter((request) => request.path === endpoint);
    },
    get pendingDeadlines() {
      return deadlines.size;
    },
    expireDeadline() {
      for (const [id, callback] of [...deadlines]) {
        deadlines.delete(id);
        callback();
      }
    },
    setVisible(value) {
      visible = value;
      h.render();
    },
    setListingVersion(value) {
      listingVersion = value;
      h.render();
    },
    presentation() {
      const wrappers = nodes(
        h.output,
        (node) => node.type === "div" && typeof node.props.hidden === "boolean"
      );
      assert.equal(wrappers.length, 1);
      return wrappers[0];
    },
    choices() {
      return nodes(h.output, (node) => node.type === ExchangeContactChoice);
    },
    guard() {
      const guards = nodes(
        h.output,
        (node) => node.type === PrivateSnapshotGuard
      );
      assert.equal(guards.length, 1);
      return guards[0];
    }
  };
}

function assertEmpty(s) {
  assert.equal(nodes(s.h.output, (node) => node.type !== "fragment").length, 0);
  assert.equal(textContent(s.h.output), "");
}

test("contact initialization starts without private snapshot props and accepts only a current read", async (t) => {
  const s = setup(t);
  assert.equal(s.choices().length, 0);
  assert.ok(!JSON.stringify(s.h.output).includes("canEnable"));
  await s.h.settle();
  assert.equal(s.contactReads.length, 1);
  assert.equal(s.choices().length, 1);
  assert.equal(s.choices()[0].props.contact, s.data.contact);
  assert.equal(s.guard().props.url, endpoint);
  assert.match(s.guard().props.checksum, /^[a-f0-9]{64}$/);
  assert.equal(s.pendingDeadlines, 0);
});

test("held then failed contact initialization stays empty and explicitly retries current data", async (t) => {
  const s = setup(t),
    held = deferred();
  s.readHandler = () => held.promise;
  await s.h.settle();
  assert.equal(s.choices().length, 0);
  assert.equal(s.contactReads.length, 1);
  held.resolve(
    response({ message: "Current inquiry choices unavailable" }, 503)
  );
  await s.h.settle();
  assert.equal(s.choices().length, 0);
  assert.ok(
    textContent(s.h.output).includes("Current inquiry choices unavailable")
  );
  assert.equal(s.pendingDeadlines, 0);
  s.readHandler = null;
  button(s.h.output, "Check inquiry choices again").props.onClick();
  await s.h.settle();
  assert.equal(s.contactReads.length, 2);
  assert.equal(s.choices()[0].props.contact, s.data.contact);
});

test("contact deadline aborts the actual read and permits fresh retry without accepting a late result", async (t) => {
  const s = setup(t),
    held = deferred();
  let signal;
  s.readHandler = (options) => {
    signal = options.signal;
    signal.addEventListener("abort", () => held.reject(signal.reason), {
      once: true
    });
    return held.promise;
  };
  await s.h.settle();
  assert.equal(s.pendingDeadlines, 1);
  s.expireDeadline();
  await s.h.settle();
  assert.equal(signal.aborted, true);
  assert.equal(s.choices().length, 0);
  assert.ok(textContent(s.h.output).includes("timed out"));
  assert.equal(s.pendingDeadlines, 0);
  s.readHandler = null;
  button(s.h.output, "Check inquiry choices again").props.onClick();
  await s.h.settle();
  const accepted = s.choices()[0].props.contact;
  held.resolve(response({ ...s.data, contact: { ...accepted, version: 99 } }));
  await s.h.settle();
  assert.equal(s.choices()[0].props.contact, accepted);
  assert.equal(s.contactReads.length, 2);
});

test("a contact deadline during checksum calculation exposes retry instead of accepting the expired snapshot", async (t) => {
  const s = setup(t),
    held = deferred();
  s.digestHandler = () => held.promise;
  await s.h.settle();
  assert.equal(s.contactReads.length, 1);
  assert.equal(s.choices().length, 0);
  s.expireDeadline();
  held.resolve(new Uint8Array(32).buffer);
  await s.h.settle();
  assert.equal(s.choices().length, 0);
  assert.ok(textContent(s.h.output).includes("timed out"));
  s.digestHandler = null;
  button(s.h.output, "Check inquiry choices again").props.onClick();
  await s.h.settle();
  assert.equal(s.choices()[0].props.contact, s.data.contact);
  assert.equal(s.pendingDeadlines, 0);
});

for (const invalid of ["owner", "listing", "missing contact"]) {
  test(`contact initialization rejects ${invalid} mismatch before mounting private choices`, async (t) => {
    const s = setup(t);
    const malformed =
      invalid === "owner"
        ? { ...s.data, ownerId: "owner-b" }
        : invalid === "listing"
          ? {
              ...s.data,
              contact: { ...s.data.contact, listingId: "listing-b" }
            }
          : { ...s.data, contact: undefined };
    s.readHandler = () => response(malformed);
    await s.h.settle();
    assert.equal(s.choices().length, 0);
    assert.equal(s.pendingDeadlines, 0);
    s.readHandler = null;
    button(s.h.output, "Check inquiry choices again").props.onClick();
    await s.h.settle();
    assert.equal(s.choices()[0].props.contact, s.data.contact);
    assert.equal(s.contactReads.length, 2);
  });
}

test("parent concealment aborts initialization and prevents a late snapshot from mounting", async (t) => {
  const s = setup(t),
    held = deferred();
  let signal;
  s.readHandler = (options) => {
    signal = options.signal;
    // Deliberately deliver a late response even if the fetch implementation
    // ignores cancellation. The real transport/loader must reject it too.
    return held.promise;
  };
  await s.h.settle();
  s.setVisible(false);
  assert.equal(signal.aborted, true);
  assert.equal(s.pendingDeadlines, 0);
  held.resolve(response(s.data));
  await s.h.settle();
  assertEmpty(s);
  assert.equal(s.choices().length, 0);
  s.data = { ...s.data, contact: { ...s.data.contact, version: 3 } };
  s.readHandler = null;
  s.setVisible(true);
  await s.h.settle();
  assert.equal(s.choices()[0].props.contact.version, 3);
  assert.equal(s.contactReads.length, 2);
});

test("an accepted contact child survives concealment until its confirmed-save callback requests a fresh snapshot", async (t) => {
  const s = setup(t);
  await s.h.settle();
  const original = s.choices()[0],
    checksum = s.guard().props.checksum;
  s.setVisible(false);
  await s.h.settle();
  assert.equal(s.presentation().props.hidden, true);
  assert.equal(s.presentation().props.inert, true);
  assert.equal(s.choices()[0].type, original.type);
  assert.equal(s.choices()[0].props.contact, original.props.contact);
  assert.equal(s.guard().props.checksum, checksum);
  s.setVisible(true);
  await s.h.settle();
  assert.equal(s.presentation().props.hidden, false);
  assert.equal(s.presentation().props.inert, false);
  assert.equal(s.contactReads.length, 1);
  assert.equal(s.choices()[0].props.contact, original.props.contact);

  // Only the existing action controller's confirmed-save notification may
  // replace this child. Its pending state is not inferred from a later read.
  s.setVisible(false);
  original.props.onSaved();
  await s.h.settle();
  assertEmpty(s);
  assert.equal(s.contactReads.length, 1);
  s.data = {
    ...s.data,
    contact: { ...s.data.contact, version: 3, enabled: true, receiving: true }
  };
  s.setVisible(true);
  await s.h.settle();
  assert.equal(s.contactReads.length, 2);
  assert.equal(s.choices()[0].props.contact.version, 3);
  assert.equal(s.choices()[0].props.contact.enabled, true);
  assert.notEqual(s.guard().props.checksum, checksum);
});

test("a failed parent-version refresh preserves the original guard and child until current data is deliberately retried", async (t) => {
  const s = setup(t);
  s.data = { ...s.data, contact: { ...s.data.contact, canEnable: false } };
  await s.h.settle();
  const oldGuard = s.guard(),
    oldChild = s.choices()[0],
    held = deferred();
  s.readHandler = () => held.promise;
  s.setListingVersion(5);
  await s.h.settle();
  assert.equal(s.guard().type, oldGuard.type);
  assert.equal(s.guard().key, oldGuard.key);
  assert.equal(s.choices()[0].key, oldChild.key);
  assert.equal(s.choices()[0].props.contact, oldChild.props.contact);
  assert.equal(s.presentation().props.hidden, true);
  assert.equal(s.presentation().props.inert, true);
  held.resolve(
    response({ message: "Current publication state unavailable" }, 503)
  );
  await s.h.settle();
  assert.equal(s.guard().props.checksum, oldGuard.props.checksum);
  assert.equal(s.choices()[0].key, oldChild.key);
  assert.equal(s.presentation().props.hidden, true);
  s.data = {
    ...s.data,
    contact: { ...s.data.contact, listingVersion: 5, canEnable: true }
  };
  s.readHandler = null;
  button(s.h.output, "Check inquiry choices again").props.onClick();
  await s.h.settle();
  // The guard keeps its lifetime and recovery registry. It receives a new
  // keyed child to use only after its existing pending-child rule permits it.
  assert.equal(s.guard().type, oldGuard.type);
  assert.equal(s.guard().key, oldGuard.key);
  assert.notEqual(s.choices()[0].key, oldChild.key);
  assert.equal(s.choices()[0].props.contact.canEnable, true);
  assert.equal(s.presentation().props.hidden, false);
  assert.equal(s.contactReads.length, 3);
});

test("an obsolete parent-version read is cancelled and cannot replace the newer accepted contact state", async (t) => {
  const s = setup(t);
  await s.h.settle();
  const held = deferred();
  let obsoleteSignal;
  s.readHandler = (options) => {
    obsoleteSignal = options.signal;
    return held.promise;
  };
  s.setListingVersion(5);
  await s.h.settle();
  const obsoleteData = {
    ...s.data,
    contact: { ...s.data.contact, listingVersion: 5 }
  };
  s.data = {
    ...s.data,
    contact: { ...s.data.contact, listingVersion: 6, version: 3, enabled: true }
  };
  s.readHandler = null;
  s.setListingVersion(6);
  assert.equal(obsoleteSignal.aborted, true);
  await s.h.settle();
  const accepted = s.choices()[0];
  assert.equal(accepted.props.contact.listingVersion, 6);
  assert.equal(s.presentation().props.hidden, false);
  held.resolve(response(obsoleteData));
  await s.h.settle();
  assert.equal(s.choices()[0].key, accepted.key);
  assert.equal(s.choices()[0].props.contact, accepted.props.contact);
  assert.equal(s.contactReads.length, 3);
  assert.equal(s.pendingDeadlines, 0);
});

test("a current API contact version newer than the parent is accepted without an automatic read loop", async (t) => {
  const s = setup(t);
  await s.h.settle();
  s.data = {
    ...s.data,
    contact: { ...s.data.contact, listingVersion: 8, version: 6, enabled: true }
  };
  s.setListingVersion(5);
  await s.h.settle();
  assert.equal(s.choices()[0].props.contact.listingVersion, 8);
  assert.equal(s.presentation().props.hidden, false);
  assert.equal(s.contactReads.length, 2);
  s.h.render();
  s.setListingVersion(5);
  await s.h.settle();
  assert.equal(s.contactReads.length, 2);
  s.setListingVersion(6);
  await s.h.settle();
  assert.equal(s.contactReads.length, 3);
  assert.equal(s.choices()[0].props.contact.listingVersion, 8);
  assert.equal(s.pendingDeadlines, 0);
});

test("an account replacement during contact initialization cannot install the prior owner's response", async (t) => {
  const s = setup(t),
    held = deferred();
  s.readHandler = () => held.promise;
  await s.h.settle();
  assert.equal(s.contactReads.length, 1);
  s.owner = "owner-b";
  held.resolve(response(s.data));
  await s.h.settle();
  assert.equal(s.choices().length, 0);
  assert.ok(textContent(s.h.output).includes("Your sign-in changed."));
  assert.equal(s.pendingDeadlines, 0);
});

test("unmount aborts a held contact initialization and releases its deadline", async (t) => {
  const s = setup(t),
    held = deferred();
  let signal;
  s.readHandler = (options) => {
    signal = options.signal;
    signal.addEventListener("abort", () => held.reject(signal.reason), {
      once: true
    });
    return held.promise;
  };
  await s.h.settle();
  s.h.unmount();
  await s.h.settle();
  assert.equal(signal.aborted, true);
  assert.equal(s.pendingDeadlines, 0);
  assert.equal(s.choices().length, 0);
});
