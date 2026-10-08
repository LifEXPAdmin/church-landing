import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  clientHarness,
  nodes,
  button
} from "./fixtures/client-hook-harness.mjs";
class IdentityError extends Error {
  constructor(status) {
    super("Fictional denied read");
    this.status = status;
  }
}
function setup(t, { focused = true, online = true } = {}) {
  const events = new Map(),
    state = {
      focused, online, reads: 0, handler: null,
      identity: "owner-a", identityHandler: null
    };
  const document = {
    visibilityState: "visible",
    hasFocus: () => state.focused,
    addEventListener: (n, f) => events.set(n, f),
    removeEventListener: (n) => events.delete(n)
  };
  const window = {
    addEventListener: (n, f) => events.set(n, f),
    removeEventListener: (n) => events.delete(n)
  };
  const data = { ownerId: "owner-a", version: 1 };
  const props = {
    owner: "owner-a",
    url: "/api/private",
    checksum: createHash("sha256").update(JSON.stringify(data)).digest("hex"),
    children: { type: "form", props: { children: "Fictional retained entry" } }
  };
  const h = clientHarness({
    window,
    document,
    // These cases exercise lifecycle ordering, not the browser crypto worker.
    // Compute the same digest without a thread-pool completion race under CI.
    crypto: {
      subtle: {
        digest: async (algorithm, bytes) => {
          assert.equal(algorithm, "SHA-256");
          return createHash("sha256").update(bytes).digest();
        }
      }
    },
    navigator: {
      get onLine() {
        return state.online;
      }
    },
    TextEncoder
  });
  const { PrivateSnapshotGuard } = h.load(
    "components/platform/private-snapshot-guard.tsx",
    {
      "@/lib/platform/social-client": {
        SocialClientError: IdentityError,
        currentSocialOwner: async () =>
          state.identityHandler ? state.identityHandler() : state.identity,
        socialRequest: async (...args) => {
          state.reads++;
          return state.handler ? state.handler(...args) : { data };
        }
      },
      "./read-visibility": {
        ReadVisibility: { Provider: "visibility" },
        useReadVisibility: () => true
      }
    }
  );
  h.mount(() => {
    const view = PrivateSnapshotGuard(props);
    // The receiving guard returns its provider directly; the proposed guard
    // wraps the same owner in a keyed component. Do not execute the provider.
    return view.props.owner === props.owner && typeof view.type === "function"
      ? view.type(view.props)
      : view;
  });
  t.after(() => h.unmount());
  return {
    h,
    state,
    guardWrapper: PrivateSnapshotGuard,
    props,
    document,
    async event(name) {
      events.get(name)?.();
      await h.settle();
    },
    visible: () =>
      nodes(h.output, (n) => n.type === "visibility")[0].props.value,
    recheck: async () => {
      button(h.output, "Recheck current access").props.onClick();
      await h.settle();
    }
  };
}
test("unfocused initial private guard does not read or reveal until foreground return", async (t) => {
  const s = setup(t, { focused: false });
  await s.h.settle();
  assert.equal(s.state.reads, 0);
  assert.equal(s.visible(), false);
  s.state.focused = true;
  await s.event("focus");
  assert.equal(s.visible(), true);
});
for (const passive of ["online", "social-relationships-changed"])
  test(`blurred private guard stays concealed through passive ${passive}`, async (t) => {
    const s = setup(t);
    await s.h.settle();
    assert.equal(s.visible(), true);
    s.state.focused = false;
    await s.event("blur");
    const reads = s.state.reads;
    await s.event(passive);
    assert.equal(s.visible(), false);
    assert.equal(s.state.reads, reads);
    s.state.focused = true;
    await s.event("focus");
    assert.equal(s.visible(), true);
  });
test("pagehide conceals and passive signals cannot restore a cached private page", async (t) => {
  const s = setup(t);
  await s.h.settle();
  await s.event("pagehide");
  assert.equal(s.visible(), false);
  await s.event("social-relationships-changed");
  assert.equal(s.visible(), false);
  await s.event("pageshow");
  assert.equal(s.visible(), true);
});
test("offline initialization and reconnect remain concealed until an explicit recheck", async (t) => {
  const s = setup(t, { online: false });
  await s.h.settle();
  assert.equal(s.state.reads, 0);
  assert.equal(s.visible(), false);
  s.state.online = true;
  await s.event("online");
  assert.equal(s.visible(), false);
  await s.recheck();
  assert.equal(s.visible(), true);
});
test("late in-flight read after blur cannot reopen; focus queues a fresh check", async (t) => {
  const s = setup(t);
  await s.h.settle();
  let resolve;
  s.state.handler = () =>
    new Promise((done) => {
      resolve = done;
    });
  const held = s.event("social-relationships-changed");
  await held;
  s.state.focused = false;
  await s.event("blur");
  s.state.focused = true;
  await s.event("focus");
  s.state.handler = null;
  resolve({ data: { ownerId: "owner-a", version: 1 } });
  await s.h.settle();
  assert.equal(s.state.reads, 3);
  assert.equal(s.visible(), true);
});
test("hidden route/checksum replacement uses current closure on return and preserves children", async (t) => {
  const s = setup(t);
  await s.h.settle();
  s.state.focused = false;
  await s.event("blur");
  s.props.url = "/api/private?next=2";
  s.h.render();
  await s.h.settle();
  assert.equal(s.visible(), false);
  let used;
  s.state.handler = async (url) => {
    used = url;
    return { data: { ownerId: "owner-a", version: 1 } };
  };
  s.state.focused = true;
  await s.event("focus");
  assert.equal(used, s.props.url);
  assert.equal(s.visible(), true);
  assert.equal(
    nodes(s.h.output, (n) => n.type === "form")[0],
    s.props.children
  );
});
test("concealment retains the registered exact original recovery callback", async (t) => {
  const s = setup(t);
  await s.h.settle();
  let retries = 0;
  s.h.output.props.value("original", {
    retry() {
      retries++;
    },
    busy: false,
    allowed: true
  });
  s.h.render();
  s.state.focused = false;
  await s.event("blur");
  assert.equal(s.visible(), false);
  s.props.checksum = "changed-server-checksum";
  s.h.render();
  await s.h.settle();
  s.state.focused = true;
  await s.event("focus");
  assert.equal(s.visible(), true);
  assert.equal(retries, 0);
});

test("pageshow and explicit recheck cannot reveal while the document remains unfocused", async (t) => {
  const s = setup(t);
  await s.h.settle();
  s.state.focused = false;
  await s.event("blur");
  const reads = s.state.reads;
  await s.event("pageshow");
  await s.recheck();
  assert.equal(s.visible(), false);
  assert.equal(s.state.reads, reads);
});
test("unmounted guard rejects a late read without starting a queued request", async (t) => {
  const s = setup(t);
  await s.h.settle();
  let resolve;
  s.state.handler = () => new Promise((done) => (resolve = done));
  await s.event("social-relationships-changed");
  await s.event("social-relationships-changed");
  s.h.unmount();
  resolve({ data: { ownerId: "owner-a", version: 1 } });
  await s.h.settle();
  assert.equal(s.visible(), false);
  assert.equal(s.state.reads, 2);
});

test("verified snapshot is delivered only after the complete checksum matches", async (t) => {
  const s = setup(t);
  await s.h.settle();
  const values = [];
  s.props.onVerified = (value) => values.push(value);
  s.h.render();
  await s.h.settle();
  assert.deepEqual(values, [{ ownerId: "owner-a", version: 1 }]);
  s.state.handler = async () => ({ data: { ownerId: "owner-a", version: 2 } });
  await s.event("social-relationships-changed");
  assert.equal(values.length, 1);
  assert.equal(s.visible(), false);
});
test("verified callback receives only the projected checksum snapshot", async (t) => {
  const s = setup(t);
  await s.h.settle();
  let accepted;
  s.props.project = (value) => ({
    ownerId: value.ownerId,
    version: value.version
  });
  s.props.onVerified = (value) => (accepted = value);
  s.state.handler = async () => ({
    data: { ownerId: "owner-a", version: 1, unverified: "not in checksum" }
  });
  s.h.render();
  await s.h.settle();
  assert.deepEqual(accepted, { ownerId: "owner-a", version: 1 });
  assert.equal(s.visible(), true);
});
test("late and denied responses never reach the verified consumer", async (t) => {
  const s = setup(t);
  await s.h.settle();
  const values = [];
  s.props.onVerified = (v) => values.push(v);
  let resolve;
  s.state.handler = () => new Promise((done) => (resolve = done));
  s.h.render();
  await s.h.settle();
  s.state.focused = false;
  await s.event("blur");
  resolve({ data: { ownerId: "owner-a", version: 1 } });
  await s.h.settle();
  assert.equal(values.length, 0);
  s.state.handler = async () => {
    throw Error("Denied");
  };
  s.state.focused = true;
  await s.event("focus");
  assert.equal(values.length, 0);
  assert.equal(s.visible(), false);
});
test("consumer rejection conceals the guard without accepting invalid data", async (t) => {
  const s = setup(t);
  await s.h.settle();
  s.props.onVerified = () => {
    throw Error("Invalid private shape");
  };
  s.h.render();
  await s.h.settle();
  assert.equal(s.visible(), false);
});

for (const identity of ["owner-b", null])
  test(
    "confirmed identity " +
      identity +
      " clears original forms and prevents A-to-B-to-A resurrection",
    async (t) => {
      const s = setup(t);
      await s.h.settle();
      s.props.recoverWithoutSnapshot = true;
      s.h.render();
      s.h.output.props.value("original", {
        retry() {
          throw Error("Must not retry");
        },
        busy: false,
        allowed: true
      });
      s.h.render();
      s.state.identity = identity;
      s.state.handler = async () => {
        throw new IdentityError(401);
      };
      await s.event("social-relationships-changed");
      assert.equal(nodes(s.h.output, (n) => n.type === "form").length, 0);
      assert.equal(
        nodes(
          s.h.output,
          (n) =>
            n.type === "button" &&
            n.props.children === "Confirm original request"
        ).length,
        0
      );
      const reads = s.state.reads;
      s.state.identity = "owner-a";
      s.state.handler = null;
      await s.event("focus");
      assert.equal(nodes(s.h.output, (n) => n.type === "form").length, 0);
      assert.equal(s.visible(), false);
      assert.equal(s.state.reads, reads);
    }
  );
test("same-account denial retains the original owner for a later current read", async (t) => {
  const s = setup(t);
  await s.h.settle();
  s.state.handler = async () => {
    throw new IdentityError(401);
  };
  await s.event("social-relationships-changed");
  assert.equal(
    nodes(s.h.output, (n) => n.type === "form")[0],
    s.props.children
  );
  assert.equal(s.visible(), false);
  s.state.handler = null;
  await s.event("focus");
  assert.equal(s.visible(), true);
});
test("unavailable identity proof does not falsely erase a retained form", async (t) => {
  const s = setup(t);
  await s.h.settle();
  s.state.identityHandler = async () => {
    throw new IdentityError(503);
  };
  s.state.handler = async () => {
    throw new IdentityError(401);
  };
  await s.event("social-relationships-changed");
  assert.equal(
    nodes(s.h.output, (n) => n.type === "form")[0],
    s.props.children
  );
  assert.equal(s.visible(), false);
});
test("blur cannot undo a currently resolving confirmed account replacement", async (t) => {
  const s = setup(t);
  await s.h.settle();
  let finish;
  s.state.identityHandler = () => new Promise((done) => (finish = done));
  s.state.handler = async () => {
    throw new IdentityError(401);
  };
  await s.event("social-relationships-changed");
  s.state.focused = false;
  await s.event("blur");
  assert.equal(typeof finish, "function");
  finish("owner-b");
  await s.h.settle();
  assert.equal(nodes(s.h.output, (n) => n.type === "form").length, 0);
});

test("guard identity changes on owner replacement but preserves checksum recovery", (t) => {
  const s = setup(t),
    key = s.guardWrapper(s.props).key;
  assert.notEqual(s.guardWrapper({ ...s.props, owner: "owner-b" }).key, key);
  assert.equal(
    s.guardWrapper({ ...s.props, checksum: "next-checksum" }).key,
    key
  );
});
test("stale identity result from an abandoned check cannot clear the newer scope", async (t) => {
  const s = setup(t);
  await s.h.settle();
  let finish;
  s.state.identityHandler = () => new Promise((done) => (finish = done));
  s.state.handler = async () => {
    throw new IdentityError(401);
  };
  await s.event("social-relationships-changed");
  s.props.url = "/api/private?new-scope";
  s.state.handler = null;
  s.h.render();
  await s.h.settle();
  finish("owner-b");
  await s.h.settle();
  assert.equal(s.visible(), true);
  assert.equal(
    nodes(s.h.output, (n) => n.type === "form")[0],
    s.props.children
  );
});

// Controlled hook lifetimes execute three real guards and the real leaf
// registration hook. This is not React DOM or native browser-focus evidence.
function nestedRecoverySetup(t) {
  const events = new EventTarget();
  const state = {
    focused: true,
    identity: "owner-a",
    handler: null,
    parentVisible: true,
    pending: true,
    busy: false,
    allowed: true,
    retried: []
  };
  const originalBody = Object.freeze({ operation: "need-slot", slotId: "original-slot", version: 1 });
  const retry = () => state.retried.push(originalBody);
  const external = new Map();
  const outerRegister = (id, recovery) => {
    if (recovery) external.set(id, recovery);
    else external.delete(id);
  };
  const scopes = ["need", "intermediate", "roles"];
  const data = Object.fromEntries(scopes.map((scope) => [scope, { scope, version: 1 }]));
  const props = scopes.map((scope) => ({
    owner: "owner-a",
    url: "/api/" + scope,
    checksum: createHash("sha256").update(JSON.stringify(data[scope])).digest("hex"),
    children: { type: "form", props: { children: "Original " + scope } }
  }));
  const h = clientHarness({
    window: events,
    document: {
      visibilityState: "visible",
      hasFocus: () => state.focused,
      addEventListener: events.addEventListener.bind(events),
      removeEventListener: events.removeEventListener.bind(events)
    },
    navigator: { onLine: true },
    TextEncoder,
    crypto: { subtle: { digest: async (algorithm, bytes) => {
      assert.equal(algorithm, "SHA-256");
      return createHash("sha256").update(bytes).digest();
    } } }
  });
  const { PrivateSnapshotGuard, usePrivateRecovery } = h.load(
    "components/platform/private-snapshot-guard.tsx",
    {
      "@/lib/platform/social-client": {
        SocialClientError: IdentityError,
        currentSocialOwner: async () => state.identity,
        socialRequest: async (url) => state.handler
          ? state.handler(url)
          : { data: data[url.slice(5)] }
      },
      "./read-visibility": {
        ReadVisibility: { Provider: "visibility" },
        useReadVisibility: () => state.parentVisible
      }
    }
  );
  let provider;
  h.mount(() => {
    provider?.({ value: outerRegister, children: null });
    state.parentVisible = true;
    const trees = props.map((p) => {
      const wrapper = PrivateSnapshotGuard(p);
      const tree = wrapper.type(wrapper.props);
      provider = tree.type;
      provider(tree.props);
      state.parentVisible = nodes(tree, (n) => n.type === "visibility")[0].props.value;
      return tree;
    });
    usePrivateRecovery("leaf-original", state.pending, state.busy, retry, state.allowed);
    provider({ value: null, children: null });
    return trees;
  });
  t.after(() => h.unmount());
  return {
    h, state, data, props, external, retry, originalBody,
    async event(name) {
      events.dispatchEvent(new Event(name));
      await h.settle();
    },
    visible: (index) => nodes(h.output[index], (n) => n.type === "visibility")[0].props.value,
    confirmations: (index) => nodes(h.output[index], (n) =>
      n.type === "button" && /Confirm(?:ing)? original request/.test(n.props.children))
  };
}

test("three nested guards expose only the exact original recovery outside a changed enclosing snapshot", async (t) => {
  const s = nestedRecoverySetup(t);
  await s.h.settle();
  assert.equal(s.visible(2), true);
  s.data.need = { scope: "need", version: 2 };
  s.state.focused = false;
  await s.event("blur");
  s.state.focused = true;
  await s.event("focus");
  assert.equal(s.visible(0), false);
  assert.equal(s.visible(2), false);
  assert.equal(s.state.retried.length, 0);
  const confirm = button(s.h.output[0], "Confirm original request");
  assert.equal(confirm.props.onClick, s.retry);
  assert.equal(confirm.props.disabled, false);
  assert.equal(s.confirmations(1).length, 0);
  assert.equal(s.confirmations(2).length, 0);
  assert.deepEqual([...s.external.keys()], ["leaf-original"]);
  confirm.props.onClick();
  assert.deepEqual(s.state.retried, [s.originalBody]);
  assert.equal(s.state.retried[0], s.originalBody);
});

test("descendant denial blocks ancestor recovery without rebasing pending children and later preserves busy and leaf permission", async (t) => {
  const s = nestedRecoverySetup(t);
  await s.h.settle();
  const original = s.props[0].children;
  s.data.need = { scope: "need", version: 2 };
  s.state.handler = async (url) => {
    if (url === "/api/intermediate") throw new IdentityError(403);
    return { data: s.data[url.slice(5)] };
  };
  await s.event("social-relationships-changed");
  assert.deepEqual([...s.external.keys()], ["leaf-original"]);
  assert.equal(s.external.get("leaf-original").scopeAllowed, false);
  assert.equal(s.confirmations(0).length, 0);
  s.props[0].checksum = createHash("sha256").update(JSON.stringify(s.data.need)).digest("hex");
  s.props[0].children = { type: "form", props: { children: "New server children" } };
  s.state.busy = true;
  s.state.allowed = false;
  s.h.render();
  await s.h.settle();
  assert.equal(nodes(s.h.output[0], (n) => n.type === "form")[0], original);
  assert.equal(s.external.get("leaf-original").allowed, false);
  assert.equal(s.external.get("leaf-original").busy, true);
  s.state.handler = null;
  await s.event("focus");
  assert.equal(s.visible(0), false);
  const busy = button(s.h.output[0], "Confirming original request…");
  assert.equal(busy.props.disabled, true);
  assert.equal(busy.props.onClick, s.retry);
  assert.equal(s.state.retried.length, 0);
  s.state.pending = false;
  s.h.render();
  await s.h.settle();
  assert.equal(s.external.size, 0);
  assert.equal(s.confirmations(0).length, 0);
  assert.equal(nodes(s.h.output[0], (n) => n.type === "form")[0], s.props[0].children);
});

for (const identity of ["owner-b", null])
  test("inner confirmed identity " + identity + " clears all ancestor recovery registrations permanently", async (t) => {
    const s = nestedRecoverySetup(t);
    await s.h.settle();
    s.data.need = { scope: "need", version: 2 };
    await s.event("social-relationships-changed");
    assert.equal(s.confirmations(0).length, 1);
    s.state.identity = identity;
    s.state.handler = async (url) => {
      if (url === "/api/roles") throw new IdentityError(401);
      return { data: s.data[url.slice(5)] };
    };
    await s.event("social-relationships-changed");
    assert.equal(s.external.size, 0);
    assert.equal(s.confirmations(0).length, 0);
    assert.equal(nodes(s.h.output[2], (n) => n.type === "form").length, 0);
    s.state.identity = "owner-a";
    s.state.handler = null;
    await s.event("focus");
    assert.equal(s.external.size, 0);
    assert.equal(s.confirmations(0).length, 0);
    assert.equal(s.state.retried.length, 0);
  });

test("nested recovery registration changes retain one leaf ID and unmount clears its enclosing relay", async (t) => {
  const s = nestedRecoverySetup(t);
  await s.h.settle();
  assert.deepEqual([...s.external.keys()], ["leaf-original"]);
  assert.equal(s.external.get("leaf-original").retry, s.retry);
  s.state.busy = true;
  s.h.render();
  await s.h.settle();
  assert.deepEqual([...s.external.keys()], ["leaf-original"]);
  assert.equal(s.external.get("leaf-original").busy, true);
  assert.equal(s.external.get("leaf-original").allowed, true);
  s.h.unmount();
  assert.equal(s.external.size, 0);
  assert.equal(s.state.retried.length, 0);
});
