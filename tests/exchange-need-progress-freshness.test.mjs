import assert from "node:assert/strict";
import test from "node:test";
import {
  button,
  clientHarness,
  textContent
} from "./fixtures/client-hook-harness.mjs";

const initial = {
  id: "slot-a",
  status: "Open",
  target: 10,
  unit: "parcels",
  committed: 10,
  received: 0,
  returned: 0,
  loan: false
};
function fixture(t, owner = "account-a") {
  const deadlines = new Map();
  let timerId = 0;
  const h = clientHarness({
    URLSearchParams,
    AbortController,
    setTimeout(fn, ms) {
      assert.equal(ms, 15000);
      deadlines.set(++timerId, fn);
      return timerId;
    },
    clearTimeout(id) {
      deadlines.delete(id);
    }
  });
  const reads = [];
  const progress = h.load("components/platform/exchange-need-progress.tsx", {
    "@/lib/platform/social-client": {
      socialRequest: (url, body, expectedOwner, method, dispatch, signal) => {
        assert.equal(expectedOwner, owner);
        assert.equal(body, undefined);
        assert.equal(
          url,
          "/api/platform/exchange?view=need-need&listingId=listing-a"
        );
        return new Promise((resolve, reject) =>
          reads.push({ resolve, reject, signal })
        );
      }
    }
  });
  let props = {
    owner,
    listingId: "listing-a",
    needVersion: 1,
    slots: [initial],
    children: null
  };
  let refresh;
  h.mount(() => {
    const outer = progress.ExchangeNeedProgressProvider(props);
    const context = outer.type(outer.props);
    context.type(context.props);
    refresh = progress.useNeedProgressRefresh(owner, "listing-a");
    // The real recovery boundary retains this original child across new props.
    return progress.NeedSlotProgress({
      owner,
      listingId: "listing-a",
      slot: initial
    });
  });
  t.after(() => h.unmount());
  return {
    reads,
    expire() {
      const callbacks = [...deadlines.values()];
      deadlines.clear();
      callbacks.forEach((fn) => fn());
      h.render();
    },
    retryDisabled: () => button(h.output, "Check progress").props.disabled,
    text: () => textContent(h.output),
    props(version, changes = {}, slots) {
      props = {
        ...props,
        needVersion: version,
        slots: slots ?? [{ ...initial, ...changes }]
      };
      h.render();
    },
    refresh: () => refresh(),
    captureRefresh: () => refresh,
    async reply(index, version, changes = {}, overrides = {}) {
      reads[index].resolve({
        data: {
          ownerId: owner,
          listingId: "listing-a",
          need: {
            id: "listing-a",
            version,
            slots: [{ ...initial, ...changes }]
          },
          ...overrides
        }
      });
      await h.settle();
    },
    async fail(index) {
      reads[index].reject(new Error("Fictional read interruption"));
      await h.settle();
    },
    settle: () => h.settle()
  };
}

test("newer props replace a confirmed read after failure, and later older props cannot regress it", async (t) => {
  const f = fixture(t);
  const first = f.refresh();
  await f.reply(0, 2, { received: 5 });
  await first;
  const failed = f.refresh();
  const rejected = assert.rejects(failed);
  await f.fail(1);
  await rejected;
  f.props(8, { status: "Closed", target: 20, received: 8 });
  assert.match(
    f.text(),
    /Closed\. Target: 20 parcels\. Committed: 10\. Received: 8\./
  );
  f.props(7, { received: 7 });
  assert.match(
    f.text(),
    /Closed\. Target: 20 parcels\. Committed: 10\. Received: 8\./
  );
});

test("a retained command callback reads the generation at invocation", async (t) => {
  const f = fixture(t);
  const retained = f.captureRefresh();
  f.props(1, { committed: null, received: null });
  assert.equal(f.reads.length, 1);
  const current = retained();
  assert.equal(f.reads[0].signal.aborted, true);
  await f.reply(1, 1, { committed: null, received: null });
  await current;
  assert.match(f.text(), /Target: 10/);
  assert.doesNotMatch(f.text(), /Received:|Committed:|unavailable|Checking/);
});

test("a timed-out transport cannot trap recovery or clear a newer retry", async (t) => {
  const f = fixture(t);
  f.props(1, { committed: null, received: null });
  assert.equal(f.retryDisabled(), true);
  f.expire();
  assert.equal(f.reads[0].signal.aborted, true);
  assert.equal(f.retryDisabled(), false);
  const retry = f.refresh();
  await f.settle();
  assert.equal(f.retryDisabled(), true);
  await f.reply(0, 2, { received: 9 });
  assert.equal(f.retryDisabled(), true);
  assert.doesNotMatch(f.text(), /Received: 9/);
  await f.reply(1, 1, { committed: null, received: null });
  await retry;
  assert.doesNotMatch(f.text(), /Received:|Committed:/);
  assert.match(f.text(), /Target: 10/);
});

test("a pending older read cannot replace newer props even when its transport ignores abort", async (t) => {
  const f = fixture(t);
  const pending = f.refresh();
  f.props(8, { received: 8 });
  assert.equal(f.reads[0].signal.aborted, true);
  await f.reply(0, 9, { received: 9 });
  await pending;
  assert.match(f.text(), /Received: 8\./);
  const old = f.refresh();
  await f.reply(1, 7, { received: 7 });
  await old;
  assert.match(f.text(), /Received: 8\./);
});

test("equal-version permission changes conceal frozen totals and fail without a retry loop", async (t) => {
  const f = fixture(t);
  f.props(1, { committed: null, received: null });
  assert.doesNotMatch(f.text(), /Committed:|Received:|Target:/);
  assert.equal(f.reads.length, 1);
  await f.fail(0);
  f.props(1, { committed: null, received: null });
  await f.settle();
  assert.match(f.text(), /Current progress is unavailable/);
  assert.equal(f.reads.length, 1);
  const retry = f.refresh();
  await f.reply(1, 1, { committed: null, received: null });
  await retry;
  assert.match(f.text(), /Target: 10 parcels/);
  assert.doesNotMatch(f.text(), /Committed:|Received:|Unreceived/);
});

test("strictly newer props recover a disputed summary without a successful recheck", async (t) => {
  const f = fixture(t);
  f.props(1, { committed: null, received: null });
  await f.fail(0);
  f.props(2, { status: "Closed", received: 6 });
  assert.match(f.text(), /Closed.*Received: 6\./);
  assert.equal(f.reads.length, 1);
});

test("anonymous progress reads pin the null account and canonical loan changes reach a retained child", async (t) => {
  const f = fixture(t, null);
  const pending = f.refresh();
  await f.reply(0, 2, { loan: true, received: 5, returned: 2 });
  await pending;
  assert.match(f.text(), /Equipment loan\. Returned: 2 of 5 received/);
  const next = f.refresh();
  await f.reply(1, 3, { loan: false, received: 4 });
  await next;
  assert.doesNotMatch(f.text(), /Equipment loan/);
});

test("a removed slot never falls back to frozen counters", async (t) => {
  const f = fixture(t);
  f.props(2, {}, []);
  assert.match(f.text(), /Current progress is unavailable/);
  assert.doesNotMatch(f.text(), /Target:|Committed:|Received:/);
});

test("canonical progress rejects missing, noninteger and invalid revisions and loan flags", async (t) => {
  const f = fixture(t);
  for (const version of [
    undefined,
    null,
    0,
    -1,
    1.5,
    "2",
    Number.MAX_SAFE_INTEGER + 1
  ]) {
    const p = f.refresh();
    const rejected = assert.rejects(p);
    await f.reply(f.reads.length - 1, version, { received: 9 });
    await rejected;
    assert.match(f.text(), /Received: 0\./);
  }
  const p = f.refresh();
  const rejected = assert.rejects(p);
  await f.reply(f.reads.length - 1, 2, { loan: undefined, received: 9 });
  await rejected;
  assert.match(f.text(), /Received: 0\./);
});
