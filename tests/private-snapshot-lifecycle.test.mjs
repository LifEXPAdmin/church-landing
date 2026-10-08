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
