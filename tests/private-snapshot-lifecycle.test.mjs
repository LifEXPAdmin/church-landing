import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  clientHarness,
  nodes,
  button
} from "./fixtures/client-hook-harness.mjs";
function setup(t, { focused = true, online = true } = {}) {
  const events = new Map(),
    state = { focused, online, reads: 0, handler: null };
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
  h.mount(() => PrivateSnapshotGuard(props));
  t.after(() => h.unmount());
  return {
    h,
    state,
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
