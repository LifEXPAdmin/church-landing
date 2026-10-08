import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { clientHarness, nodes } from "./fixtures/client-hook-harness.mjs";

const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};
const matching = {
  available: true,
  entryVersion: 3,
  commentCount: 0,
  likeCount: 0
};
// Deterministic execution of the real component bodies. Actual React DOM,
// mounted draft preservation and browser visibility are checked separately by
// qa-resource-foreground-client.mjs; this source suite launches no browser.
function environment() {
  const window = new EventTarget(),
    document = new EventTarget();
  const state = { focused: true, online: true };
  document.visibilityState = "visible";
  document.hasFocus = () => state.focused;
  document.cookie = "";
  const intervals = [],
    observers = [],
    digests = [];
  const h = clientHarness({
    window,
    document,
    navigator: {
      get onLine() {
        return state.online;
      }
    },
    TextEncoder,
    crypto: {
      subtle: {
        digest(algorithm, bytes) {
          assert.equal(algorithm, "SHA-256");
          const job = deferred();
          digests.push({ ...job, bytes });
          return job.promise;
        }
      }
    },
    setInterval(callback, delay) {
      const entry = { callback, delay, active: true };
      intervals.push(entry);
      return entry;
    },
    clearInterval(entry) {
      entry.active = false;
    },
    IntersectionObserver: class {
      constructor(callback) {
        this.callback = callback;
        observers.push(this);
      }
      observe() {}
      disconnect() {}
    }
  });
  return {
    h,
    window,
    document,
    state,
    intervals,
    observers,
    digests,
    signal(name, focused = state.focused, online = state.online) {
      state.focused = focused;
      state.online = online;
      (name === "visibilitychange" ? document : window).dispatchEvent(
        new Event(name)
      );
      h.render();
    },
    async digest(index) {
      const job = digests[index];
      assert.ok(job, "Expected the held digest");
      job.resolve(
        Uint8Array.from(createHash("sha256").update(job.bytes).digest()).buffer
      );
      await h.settle();
    }
  };
}
function postFixture(t, options = {}) {
  const f = environment(),
    reads = [];
  let props = {
    entryId: "post-a",
    entryVersion: 3,
    sourceVersion: null,
    originalPost: true,
    accountId: "account-a",
    commentCount: 0,
    likeCount: 0,
    children: "fictional retained content"
  };
  f.state.focused = options.focused ?? true;
  f.state.online = options.online ?? true;
  const router = {
    refresh() {
      throw Error("No refresh expected for matching fixture");
    }
  };
  const { RepostSourceBoundary } = f.h.load(
    "components/platform/repost-source-boundary.tsx",
    {
      "next/navigation": { useRouter: () => router },
      "@/lib/platform/social-client": {
        socialRequest() {
          throw Error("Unexpected repost branch");
        }
      },
      "@/lib/platform/post-availability-client": {
        currentPostAvailability(...args) {
          const read = deferred();
          reads.push({ ...read, args });
          return read.promise;
        }
      },
      "./private-post-workspace": { usePrivatePostWorkspace: () => null },
      "./read-visibility": {
        useReadVisibility: () => true,
        ReadVisibility: { Provider: "visibility" }
      }
    }
  );
  f.h.mount(() => {
    const tree = RepostSourceBoundary(props);
    for (const node of nodes(tree, (node) => node.props.ref))
      node.props.ref.current = {};
    return tree;
  });
  t.after(() => f.h.unmount());
  return {
    ...f,
    reads,
    visible() {
      const providers = nodes(f.h.output, (node) => node.type === "visibility");
      return providers[0]?.props.value === true;
    },
    intersect() {
      assert.equal(f.observers.length, 1);
      f.observers[0].callback([{ isIntersecting: true }]);
      f.h.render();
    },
    tick() {
      const timers = f.intervals.filter(
        (entry) => entry.active && entry.delay === 30000
      );
      assert.equal(timers.length, 1);
      timers[0].callback();
      f.h.render();
    },
    async reply(index, value = matching) {
      reads[index].resolve(value);
      await f.h.settle();
    },
    replaceOwner(owner) {
      props = { ...props, accountId: owner };
      f.h.render();
    }
  };
}
function guestFixture(t, options = {}) {
  const f = environment(),
    reads = [];
  f.state.focused = options.focused ?? true;
  f.state.online = options.online ?? true;
  const types = f.h.load("lib/platform/portal-types.ts");
  const policy = f.h.load("lib/platform/portal-policy.ts", {
    "./portal-types": types
  });
  const posts = f.h.load("lib/platform/post-options.ts");
  const choices = f.h.load("lib/platform/discovery-options.ts", {
    "../../data/discovery/countries.json": {
      default: JSON.parse(readFileSync("data/discovery/countries.json"))
    },
    "../../data/discovery/languages.json": {
      default: JSON.parse(readFileSync("data/discovery/languages.json"))
    },
    "./post-options": posts,
    "./portal-policy": policy
  });
  const feeds = f.h.load("lib/platform/feed-options.ts", {
    "./discovery-options": choices
  });
  const preferences = choices.defaultDiscoveryPreferences();
  preferences.hiddenWords = ["fictional original"];
  f.document.cookie =
    choices.GUEST_DISCOVERY_COOKIE +
    "=" +
    encodeURIComponent(JSON.stringify(preferences));
  class SocialClientError extends Error {
    constructor(status, message) {
      super(message);
      this.status = status;
    }
  }
  const { DiscoverySettings } = f.h.load(
    "components/platform/discovery-settings.tsx",
    {
      "next/dynamic": { default: () => () => null },
      "@/lib/platform/social-client": {
        currentSocialOwner() {
          const job = deferred();
          reads.push(job);
          return job.promise;
        },
        socialRequest() {
          throw Error("No account transport in guest fixture");
        },
        SocialClientError
      },
      "@/lib/platform/discovery-options": choices,
      "@/lib/platform/feed-options": feeds,
      "@/lib/platform/post-options": posts,
      "@/lib/platform/portal-policy": policy,
      "./private-snapshot-guard": {
        PrivateSnapshotGuard() {
          throw Error("Guest fixture must not enter account guard");
        },
        usePrivateRecovery() {}
      },
      "./use-unsaved-social-work": { useUnsavedSocialWork() {} },
      "./use-photo-back-guard": {
        settlePhotoNavigation() {
          throw Error("No navigation expected");
        }
      },
      "./discovery-place-picker": { DiscoveryPlacePicker() {} },
      "./portal-action-form": { portalInputClass: "" }
    }
  );
  f.h.mount(() => DiscoverySettings({ owner: null }));
  t.after(() => f.h.unmount());
  const shell = () =>
    nodes(
      f.h.output,
      (node) => node.type === "div" && typeof node.props.hidden === "boolean"
    )[0];
  return {
    ...f,
    reads,
    visible: () => shell()?.props.hidden === false,
    form: () => shell()?.props.children,
    async identity(index, value = null) {
      reads[index].resolve(value);
      await f.h.settle();
    },
    async ready() {
      await this.identity(0);
      await f.digest(0);
      assert.equal(this.visible(), true);
    }
  };
}
test("post interval never reopens a blurred but visible document, and focus rereads", async (t) => {
  const f = postFixture(t);
  f.intersect();
  await f.reply(0);
  assert.equal(f.visible(), true);
  f.signal("blur", false);
  f.tick();
  assert.equal(f.reads.length, 1);
  assert.equal(f.visible(), false);
  f.signal("focus", true);
  assert.equal(f.reads.length, 2);
  assert.equal(f.visible(), false);
  await f.reply(1);
  assert.equal(f.visible(), true);
});
for (const field of ["focused", "online"]) {
  test(
    "post matching settlement checks current " +
      field +
      " without a lifecycle event",
    async (t) => {
      const f = postFixture(t);
      f.intersect();
      await f.reply(0);
      f.tick();
      f.state[field] = false;
      await f.reply(1);
      assert.equal(f.visible(), false);
    }
  );
}
test("post offline and unfocused online admission performs no private read", async (t) => {
  const f = postFixture(t, { online: false });
  f.intersect();
  assert.equal(f.reads.length, 0);
  f.signal("online", false, true);
  assert.equal(f.reads.length, 0);
  f.signal("focus", true);
  assert.equal(f.reads.length, 1);
  await f.reply(0);
  assert.equal(f.visible(), true);
});
test("post old-owner settlement cannot replace the current owner's denial", async (t) => {
  const f = postFixture(t);
  f.intersect();
  f.replaceOwner("account-b");
  assert.equal(f.reads[0].args[1], "account-a");
  assert.equal(f.reads.at(-1).args[1], "account-b");
  await f.reply(f.reads.length - 1, { ...matching, available: false });
  await f.reply(0);
  assert.equal(f.visible(), false);
});
test("guest initial digest after blur remains hidden and focused return loads again", async (t) => {
  const f = guestFixture(t);
  await f.identity(0);
  assert.equal(f.digests.length, 1);
  f.signal("blur", false);
  await f.digest(0);
  assert.equal(f.visible(), false);
  assert.equal(f.form(), undefined);
  f.signal("focus", true);
  assert.equal(f.reads.length, 2);
  await f.identity(1);
  await f.digest(1);
  assert.equal(f.visible(), true);
});
test("guest identity-only return retains the exact existing snapshot and form key", async (t) => {
  const f = guestFixture(t);
  await f.ready();
  const form = f.form(),
    cookie = f.document.cookie;
  f.signal("blur", false);
  assert.equal(f.visible(), false);
  f.signal("focus", true);
  await f.identity(1);
  assert.equal(f.visible(), true);
  assert.equal(f.form().key, form.key);
  assert.equal(f.form().props.data, form.props.data);
  assert.equal(f.digests.length, 1);
  assert.equal(f.document.cookie, cookie);
});
test("guest replacement-account response wins over an older held guest identity", async (t) => {
  const f = guestFixture(t);
  await f.ready();
  f.signal("blur", false);
  f.signal("focus", true);
  f.signal("focus", true);
  await f.identity(2, "account-b");
  await f.identity(1, null);
  assert.equal(f.visible(), false);
});
test("guest held identity cannot restore after silent focus loss", async (t) => {
  const f = guestFixture(t);
  await f.ready();
  f.signal("blur", false);
  f.signal("focus", true);
  f.state.focused = false;
  await f.identity(1);
  assert.equal(f.visible(), false);
});
test("guest held digest checks current focus even without a blur event", async (t) => {
  const f = guestFixture(t);
  await f.identity(0);
  f.state.focused = false;
  await f.digest(0);
  assert.equal(f.visible(), false);
});
test("guest offline and visible-unfocused online events wait for real foreground", async (t) => {
  const f = guestFixture(t, { online: false });
  assert.equal(f.reads.length, 0);
  f.signal("online", false, true);
  assert.equal(f.reads.length, 0);
  f.signal("focus", true);
  assert.equal(f.reads.length, 1);
  await f.ready();
});
