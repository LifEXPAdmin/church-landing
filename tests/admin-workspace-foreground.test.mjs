import assert from "node:assert/strict";
import test from "node:test";
import { resolve } from "node:path";
import { clientHarness, nodes } from "./fixtures/client-hook-harness.mjs";

// Executes the actual parent body with deterministic hooks. The stateful child
// and actual React DOM are covered separately by qa-admin-workspace-foreground-client.
function fixture(
  t,
  { focused = true, online = true, section = "growth" } = {}
) {
  const window = new EventTarget(),
    document = new EventTarget();
  const state = { focused, online };
  document.visibilityState = "visible";
  document.hasFocus = () => state.focused;
  const reads = [];
  let visibleEvents = 0,
    pending = 0,
    maxPending = 0,
    unmounted = false;
  window.addEventListener("admin-view-visible", () => visibleEvents++);
  window.location = {
    assign() {
      throw Error("Unexpected navigation");
    }
  };
  const h = clientHarness({
    window,
    document,
    Event,
    URLSearchParams,
    navigator: {
      get onLine() {
        return state.online;
      }
    }
  });
  const visibility = h.load("components/platform/read-visibility.ts");
  function FakeReport() {}
  const empty = () => null;
  const { AdminWorkspace } = h.load(
    resolve(
      process.env.ADMIN_FOREGROUND_SOURCE_ROOT ?? process.cwd(),
      "components/platform/admin-workspace.tsx"
    ),
    {
      "next/link": { default: "a" },
      "next/dynamic": { default: () => FakeReport },
      "@/components/platform/regional-presentation": { RegionalTime: empty },
      "./admin-worklist": { AdminWorklist: empty },
      "./admin-case": { AdminCase: empty },
      "./admin-form": { adminInputClass: "fixture" },
      "./admin-access": { AdminAccess: empty },
      "./admin-operations": {
        AdminPeople: empty,
        AdminChurches: empty,
        AdminAudit: empty
      },
      "./admin-overview": { AdminOverview: empty },
      "./read-visibility": visibility,
      "@/lib/platform/social-client": {
        socialRequest(...args) {
          pending++;
          maxPending = Math.max(maxPending, pending);
          return new Promise((resolveRead, reject) => {
            reads.push({
              args,
              resolve(value) {
                pending--;
                resolveRead(value);
              },
              reject(error) {
                pending--;
                reject(error);
              }
            });
          });
        }
      }
    }
  );
  const nav = (owner = "owner-a", allowed = true) => ({
    viewer: { id: owner, name: "Fictional operator" },
    sections: allowed
      ? [{ key: section, href: "/platform/admin/" + section, label: section }]
      : [],
    capabilities: []
  });
  const payload = (owner = "owner-a", allowed = true) =>
    section === "health"
      ? {
          navigation: nav(owner, allowed),
          available: true,
          emailDelivery: "test-sink",
          health: {
            checkedAt: "2026-01-01T00:00:00Z",
            needsAttention: false,
            configuration: {},
            queues: {},
            alerts: []
          }
        }
      : { navigation: nav(owner, allowed), report: { fictional: true } };
  const props = {
    navigation: nav(),
    section,
    query: "view=" + section,
    back: "/platform/admin"
  };
  h.mount(() => AdminWorkspace(props));
  const cleanup = () => {
    if (!unmounted) {
      unmounted = true;
      h.unmount();
    }
  };
  t.after(cleanup);
  const visible = () =>
    nodes(h.output, (n) => n.type === visibility.ReadVisibility.Provider)[0]
      .props.value;
  const child = () => nodes(h.output, (n) => n.type === FakeReport)[0];
  return {
    h,
    state,
    reads,
    visible,
    child,
    cleanup,
    get maxPending() {
      return maxPending;
    },
    get visibleEvents() {
      return visibleEvents;
    },
    signal(name, focus = state.focused, online = state.online) {
      state.focused = focus;
      state.online = online;
      (name === "visibilitychange" ? document : window).dispatchEvent(
        new Event(name)
      );
      if (!unmounted) h.render();
    },
    async reply(index, owner = "owner-a", allowed = true) {
      assert.ok(reads[index], "Expected admitted read");
      reads[index].resolve({ data: payload(owner, allowed) });
      await h.settle();
    },
    refresh() {
      window.dispatchEvent(new Event("admin-access-changed"));
      h.render();
    }
  };
}

test("AW01 visible-unfocused initial admission waits for focus and pins the original owner", async (t) => {
  const f = fixture(t, { focused: false });
  assert.equal(f.reads.length, 0, "Unfocused initial mount must not read");
  assert.equal(f.visible(), false);
  f.signal("focus", true);
  assert.equal(f.reads.length, 1);
  assert.deepEqual(Array.from(f.reads[0].args), [
    "/api/platform/admin?view=growth",
    undefined,
    "owner-a"
  ]);
  await f.reply(0);
  assert.equal(f.visible(), true);
});

test("AW02 pageshow online and visible visibilitychange cannot reactivate a blurred workspace", async (t) => {
  const f = fixture(t);
  await f.reply(0);
  f.signal("blur", false);
  assert.equal(f.visible(), false);
  for (const event of ["pageshow", "online", "visibilitychange"])
    f.signal(event);
  await f.h.settle();
  assert.equal(
    f.reads.length,
    1,
    "Unfocused lifecycle events must not admit reads"
  );
  assert.equal(f.visible(), false);
});

test("AW03 a held read after blur cannot publish and focus requires a fresh read", async (t) => {
  const f = fixture(t);
  f.signal("blur", false);
  await f.reply(0);
  assert.equal(f.visible(), false);
  assert.equal(f.visibleEvents, 0);
  f.signal("focus", true);
  await f.reply(1);
  assert.equal(f.visible(), true);
  f.refresh();
  f.state.focused = false;
  await f.reply(2);
  assert.equal(
    f.visible(),
    false,
    "A held reply must recheck current focus even without a blur event"
  );
  f.signal("focus", true);
  await f.reply(3);
  assert.equal(f.visible(), true);
});

test("AW04 same-owner recovery retains the existing child data while concealed", async (t) => {
  const f = fixture(t);
  await f.reply(0);
  const before = f.child();
  assert.ok(before);
  f.signal("blur", false);
  assert.equal(f.visible(), false);
  assert.equal(f.child().type, before.type);
  assert.equal(f.child().props.data, before.props.data);
  f.signal("focus", true);
  assert.equal(f.visible(), false);
  assert.equal(f.child().props.data, before.props.data);
  await f.reply(1);
  assert.equal(f.visible(), true);
  assert.equal(f.child().type, before.type);
});

test("AW05 wrong-owner missing-section and failed responses cannot authorize retained contents", async (t) => {
  const f = fixture(t);
  await f.reply(0, "owner-b");
  assert.equal(f.visible(), false);
  f.signal("focus", true);
  await f.reply(1, "owner-a", false);
  assert.equal(f.visible(), false);
  f.signal("focus", true);
  f.reads[2].reject(Error("Fictional unavailable read"));
  await f.h.settle();
  assert.equal(f.visible(), false);
  assert.equal(f.visibleEvents, 0);
});

test("AW06 overlapping refreshes coalesce and queued reads do not drain after blur", async (t) => {
  const f = fixture(t);
  f.refresh();
  f.refresh();
  assert.equal(f.reads.length, 1);
  assert.equal(f.maxPending, 1);
  f.signal("blur", false);
  await f.reply(0);
  assert.equal(f.reads.length, 1);
  assert.equal(f.visible(), false);
  f.signal("focus", true);
  await f.reply(1);
  // A coalesced queued read may follow the current one, but is never parallel.
  if (f.reads.length === 3) await f.reply(2);
  assert.equal(f.maxPending, 1);
  assert.equal(f.visible(), true);
});

test("AW07 health uses current owner and section checks through the shared visibility boundary", async (t) => {
  const f = fixture(t, { section: "health" });
  await f.reply(0);
  assert.equal(f.visible(), true);
  f.signal("blur", false);
  assert.equal(f.visible(), false);
  f.signal("focus", true);
  await f.reply(1, "owner-b");
  assert.equal(f.visible(), false);
  f.signal("focus", true);
  await f.reply(2, "owner-a", false);
  assert.equal(f.visible(), false);
});

test("AW08 unmount retires listeners and prevents held-read follow-up effects", async (t) => {
  const f = fixture(t);
  f.refresh();
  f.cleanup();
  f.reads[0].resolve({ data: { viewer: { id: "owner-a" }, sections: [] } });
  for (let i = 0; i < 4; i++)
    await new Promise((resolve) => setImmediate(resolve));
  for (const event of [
    "focus",
    "online",
    "pageshow",
    "admin-access-changed",
    "visibilitychange"
  ])
    f.signal(event, true);
  assert.equal(f.reads.length, 1);
  assert.equal(f.visibleEvents, 0);
});
