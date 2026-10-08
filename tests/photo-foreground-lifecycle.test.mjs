import assert from "node:assert/strict";
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
// Actual component body, deterministic hook lifetimes. React DOM coverage is
// separate in qa-photo-foreground-client.mjs; this suite starts no browser.
function fixture(t, options = {}) {
  const window = new EventTarget(),
    document = new EventTarget();
  const state = {
    focused: options.focused ?? true,
    online: options.online ?? true,
    visible: true
  };
  document.visibilityState = "visible";
  document.hasFocus = () => state.focused;
  document.body = { style: { overflow: "" } };
  document.activeElement = { focus() {} };
  window.history = {
    state: {},
    pushState(value) {
      this.state = value;
    },
    back() {}
  };
  const h = clientHarness({
    window,
    document,
    navigator: {
      get onLine() {
        return state.online;
      }
    },
    crypto: { randomUUID: () => "fictional-history" }
  });
  const reads = [];
  const { PhotoViewer } = h.load("components/platform/photo-viewer.tsx", {
    "next/link": { default: "a" },
    "./read-visibility": { useReadVisibility: () => state.visible },
    "./reading-preferences": {
      useReadingPreferences: () => ({ preferences: { reduceData: true } })
    },
    "@/lib/platform/social-client": {
      socialRequest(...args) {
        const read = deferred();
        reads.push({ ...read, args });
        return read.promise;
      }
    }
  });
  const dialog = { showModal() {}, close() {} };
  h.mount(() => {
    const tree = PhotoViewer({
      source: "/fictional/gallery",
      accountId: "owner-a",
      initialId: "photo-a",
      onClose() {}
    });
    for (const node of nodes(tree, (n) => n.type === "dialog"))
      node.props.ref.current = dialog;
    return tree;
  });
  t.after(() => h.unmount());
  const image = {
    id: "photo-a",
    version: 1,
    alt: "Fictional photo",
    caption: "",
    variants: {
      thumb: { url: "/fictional/thumb", width: 20, height: 20, bytes: 20 },
      large: { url: "/fictional/large", width: 100, height: 100, bytes: 100 }
    }
  };
  return {
    h,
    state,
    reads,
    document,
    photos: () => nodes(h.output, (n) => n.type === "img"),
    async reply(index) {
      reads[index].resolve({ data: { images: [image] } });
      await h.settle();
    },
    signal(name, focused = state.focused, online = state.online) {
      state.focused = focused;
      state.online = online;
      (name === "visibilitychange" ? document : window).dispatchEvent(
        new Event(name)
      );
      h.render();
    }
  };
}
for (const event of [
  "online",
  "visibilitychange",
  "social-relationships-changed"
]) {
  test(
    "photo " + event + " cannot reload a visible but unfocused document",
    async (t) => {
      const f = fixture(t);
      await f.reply(0);
      assert.equal(f.photos().length, 1);
      f.signal("blur", false);
      assert.equal(f.photos().length, 0);
      f.signal(event);
      await f.h.settle();
      assert.equal(f.reads.length, 1);
      assert.equal(f.photos().length, 0);
      f.signal("focus", true);
      await f.reply(1);
      assert.equal(f.photos().length, 1);
    }
  );
}
for (const lost of ["focused", "online"]) {
  test("held gallery reply rejects silent " + lost + " loss", async (t) => {
    const f = fixture(t);
    f.state[lost] = false;
    await f.reply(0);
    assert.equal(f.photos().length, 0);
  });
}
test("photo initial offline and unfocused states wait for a current foreground read", async (t) => {
  const f = fixture(t, { focused: false, online: false });
  assert.equal(f.reads.length, 0);
  f.signal("online", false, true);
  assert.equal(f.reads.length, 0);
  f.signal("focus", true);
  assert.equal(f.reads.length, 1);
  assert.deepEqual(Array.from(f.reads[0].args), [
    "/fictional/gallery",
    undefined,
    "owner-a"
  ]);
  await f.reply(0);
  assert.equal(f.photos().length, 1);
});
test("concealed source invalidates old reply and accepts only the new current read", async (t) => {
  const f = fixture(t);
  f.state.visible = false;
  f.h.render();
  await f.reply(0);
  assert.equal(f.photos().length, 0);
  f.state.visible = true;
  f.h.render();
  await f.reply(1);
  assert.equal(f.photos().length, 1);
});
test("access refresh resets explicit large-photo choice without changing the original account", async (t) => {
  const f = fixture(t);
  await f.reply(0);
  const action = nodes(
    f.h.output,
    (n) => n.type === "button" && n.props.children === "Load larger photo"
  )[0];
  assert.ok(action);
  action.props.onClick({ currentTarget: {} });
  f.h.render();
  assert.equal(f.photos()[0].props.src, "/fictional/large");
  f.signal("blur", false);
  f.signal("focus", true);
  await f.reply(1);
  assert.equal(f.photos()[0].props.src, "/fictional/thumb");
  assert.deepEqual(Array.from(f.reads[1].args), [
    "/fictional/gallery",
    undefined,
    "owner-a"
  ]);
});
test("old failure cannot erase a newer successfully checked photo", async (t) => {
  const f = fixture(t);
  f.signal("blur", false);
  f.signal("focus", true);
  await f.reply(1);
  f.reads[0].reject(Error("Fictional older failure"));
  await f.h.settle();
  assert.equal(f.photos().length, 1);
});
