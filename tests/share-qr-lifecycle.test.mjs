import assert from "node:assert/strict";
import test from "node:test";
import {
  button,
  clientHarness,
  nodes
} from "./fixtures/client-hook-harness.mjs";

const source = "components/platform/public-share-controls.tsx";
const urlA = "https://fixture.invalid/platform/media/media-a";
const urlB = "https://fixture.invalid/platform/media/media-b";
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};
function mocks(request, renderer) {
  return {
    "lucide-react": { Share2: () => null, Copy: () => null },
    "./private-post-workspace": {
      usePrivatePostWorkspace: () => null,
      usePrivatePostConcealed: () => false
    },
    "./read-visibility": { useReadVisibility: () => true },
    "./action-popover": { ActionPopover: () => null },
    "@/lib/platform/social-client": { socialRequest: request },
    qrcode: { toCanvas: renderer }
  };
}
// These checks execute the real component bodies with the existing deterministic
// hook harness. They do not establish React DOM, canvas pixels or browser behavior.
function publicFixture(t, owner = "account-a") {
  const window = new EventTarget(),
    document = new EventTarget();
  let focused = true;
  document.hasFocus = () => focused;
  document.visibilityState = "visible";
  const navigator = { onLine: true },
    reads = [];
  const h = clientHarness({
    window,
    document,
    navigator,
    URLSearchParams,
    HTMLElement: class {}
  });
  const { PublicShareControls, ShareQr } = h.load(
    source,
    mocks((path, body, expectedOwner) => {
      assert.equal(path, "/api/platform/share-preview?kind=media&id=media-a");
      assert.equal(body, undefined);
      const pending = deferred();
      reads.push({ ...pending, owner: expectedOwner });
      return pending.promise;
    })
  );
  let props = { kind: "media", id: "media-a", accountId: owner };
  h.mount(() => PublicShareControls(props));
  const details = () => nodes(h.output, (n) => n.type === "details")[0];
  details().props.onToggle({ currentTarget: { open: true } });
  h.render();
  t.after(() => h.unmount());
  return {
    h,
    reads,
    qr: () => nodes(h.output, (n) => n.type === ShareQr)[0],
    async reply(index, available = true, url = urlA) {
      reads[index].resolve({
        data: { available, url, title: "Fictional", description: "Public copy" }
      });
      await h.settle();
    },
    async show() {
      await this.reply(reads.length - 1);
      button(h.output, "Show QR code").props.onClick();
      await this.reply(reads.length - 1);
      assert.ok(this.qr());
    },
    owner(value) {
      props = { ...props, accountId: value };
      h.render();
    },
    signal(name, focus = focused) {
      focused = focus;
      if (name === "offline") navigator.onLine = false;
      if (name === "online") navigator.onLine = true;
      window.dispatchEvent(new Event(name));
      h.render();
    }
  };
}
function qrFixture(t, extras = {}) {
  const draws = [],
    downloads = [],
    validations = [];
  const canvas = {
    style: {},
    toDataURL: () => "data:image/png;fixture," + canvas.url
  };
  const dialog = {
    open: false,
    showModal() {
      this.open = true;
    },
    close() {
      this.open = false;
    }
  };
  const document = {
    createElement: () => ({
      click() {
        downloads.push({ href: this.href, name: this.download });
      }
    })
  };
  const h = clientHarness({ document });
  const { ShareQr } = h.load(
    source,
    mocks(undefined, (node, url) => {
      node.url = url;
      const pending = deferred();
      draws.push({ ...pending, url });
      return pending.promise;
    })
  );
  let props = {
    url: urlA,
    onDownload: (url) => {
      const pending = deferred();
      validations.push({ ...pending, url });
      return pending.promise;
    },
    ...extras
  };
  h.mount(() => {
    const tree = ShareQr(props);
    nodes(tree, (n) => n.type === "canvas").forEach((n) => {
      n.props.ref.current = canvas;
    });
    nodes(tree, (n) => n.type === "dialog").forEach((n) => {
      n.props.ref.current = dialog;
    });
    return tree;
  });
  t.after(() => h.unmount());
  return {
    h,
    draws,
    downloads,
    validations,
    download: () => button(h.output, "Download QR PNG"),
    async ready() {
      await h.settle();
      draws.at(-1).resolve();
      await h.settle();
    },
    replace(url) {
      props = { ...props, url };
      h.render();
    },
    close() {
      dialog.close();
      nodes(h.output, (n) => n.type === "dialog")[0].props.onClose();
      h.render();
    }
  };
}

test("guest QR download checks current access with the explicit guest identity", async (t) => {
  const f = publicFixture(t, null);
  await f.show();
  const count = f.reads.length;
  const pending = f.qr().props.onDownload(urlA);
  assert.equal(f.reads.length, count + 1);
  assert.equal(f.reads.at(-1).owner, null);
  await f.reply(count);
  assert.equal(await pending, true);
});
test("revoked or changed canonical destinations reject an already displayed QR download", async (t) => {
  const f = publicFixture(t);
  for (const [available, url] of [
    [false, urlA],
    [true, urlB]
  ]) {
    await f.show();
    const pending = f.qr().props.onDownload(urlA);
    await f.reply(f.reads.length - 1, available, url);
    assert.equal(await pending, false);
    assert.equal(f.qr(), undefined);
    button(f.h.output, "Refresh public link").props.onClick();
  }
});
test("account replacement invalidates a held original-owner QR validation", async (t) => {
  const f = publicFixture(t);
  await f.show();
  const pending = f.qr().props.onDownload(urlA),
    held = f.reads.length - 1;
  assert.equal(f.reads[held].owner, "account-a");
  f.owner("account-b");
  assert.equal(f.reads.at(-1).owner, "account-b");
  await f.reply(held);
  assert.equal(await pending, false);
  assert.equal(f.qr(), undefined);
});
test("blur discards pending download and visible-but-unfocused return starts no read", async (t) => {
  const f = publicFixture(t);
  await f.show();
  const pending = f.qr().props.onDownload(urlA),
    held = f.reads.length - 1;
  f.signal("blur", false);
  const count = f.reads.length;
  f.signal("pageshow", false);
  assert.equal(f.reads.length, count);
  await f.reply(held);
  assert.equal(await pending, false);
  assert.equal(f.qr(), undefined);
  f.signal("focus", true);
  assert.equal(f.reads.length, count + 1);
});
test("offline and failed current-access reads cannot retain a downloadable QR", async (t) => {
  const f = publicFixture(t);
  await f.show();
  const pending = f.qr().props.onDownload(urlA),
    held = f.reads.length - 1;
  f.signal("offline");
  await f.reply(held);
  assert.equal(await pending, false);
  assert.equal(f.qr(), undefined);
  f.signal("online");
  await f.show();
  const failed = f.qr().props.onDownload(urlA);
  f.reads.at(-1).reject(new Error("Fictional access failure"));
  await f.h.settle();
  assert.equal(await failed, false);
  assert.equal(f.qr(), undefined);
});
test("an earlier render completion cannot enable a replacement QR before its own render finishes", async (t) => {
  const f = qrFixture(t);
  await f.h.settle();
  f.replace(urlB);
  await f.h.settle();
  assert.equal(f.draws.length, 2);
  f.draws[0].resolve();
  await f.h.settle();
  assert.equal(f.download().props.disabled, true);
  f.draws[1].resolve();
  await f.h.settle();
  assert.equal(f.download().props.disabled, false);
});
test("QR URL replacement discards a held download and later saves only the replacement canvas", async (t) => {
  const f = qrFixture(t);
  await f.ready();
  const old = f.download().props.onClick();
  assert.equal(f.validations[0].url, urlA);
  f.replace(urlB);
  await f.ready();
  f.validations[0].resolve(true);
  await old;
  assert.deepEqual(f.downloads, []);
  const current = f.download().props.onClick();
  assert.equal(f.validations[1].url, urlB);
  f.validations[1].resolve(true);
  await current;
  assert.equal(f.downloads.length, 1);
  assert.ok(f.downloads[0].href.endsWith(urlB));
});
test("closing the actual QR dialog invalidates a held download callback", async (t) => {
  const f = qrFixture(t);
  await f.ready();
  const pending = f.download().props.onClick();
  f.close();
  f.validations[0].resolve(true);
  await pending;
  assert.deepEqual(f.downloads, []);
});
test("unmount invalidates pending QR validation even when its callback resolves true", async (t) => {
  const f = qrFixture(t);
  await f.ready();
  const pending = f.download().props.onClick();
  f.h.unmount();
  f.validations[0].resolve(true);
  await pending;
  assert.deepEqual(f.downloads, []);
});
test("personal QR callback denies stale downloads and permits one current download without duplicate dispatch", async (t) => {
  const f = qrFixture(t, { inline: true, personal: true });
  await f.ready();
  const click = f.download().props.onClick;
  const denied = click();
  await click();
  assert.equal(f.validations.length, 1);
  f.validations[0].resolve(false);
  await denied;
  assert.deepEqual(f.downloads, []);
  await f.h.settle();
  const accepted = f.download().props.onClick();
  f.validations[1].resolve(true);
  await accepted;
  assert.equal(f.downloads.length, 1);
  assert.equal(f.downloads[0].name, "godschurches-invitation-qr.png");
});
