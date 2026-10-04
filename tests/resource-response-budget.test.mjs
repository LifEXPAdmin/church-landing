import test from "node:test";
import assert from "node:assert/strict";
import { createResourceResponseBudget } from "../scripts/resource-response-budget.mjs";

test("response collection preserves complete chunks and counts across reads", async () => {
  const budget = createResourceResponseBudget(8, 5);
  const body = new ReadableStream({
    start(c) {
      c.enqueue(new Uint8Array([1, 2]));
      c.enqueue(new Uint8Array([3, 4, 5]));
      c.close();
    }
  });
  assert.deepEqual(await budget.read(body), Buffer.from([1, 2, 3, 4, 5]));
  assert.equal((await budget.read(new Response("abc").body)).toString(), "abc");
  assert.equal(budget.totalBytes, 8);
  assert.equal(budget.signal.aborted, false);
});

test("oversized response aborts before retaining the crossing chunk", async () => {
  const budget = createResourceResponseBudget(20, 3);
  const observed = [];
  let cancelled = false;
  const body = new ReadableStream({
    start(c) {
      c.enqueue(new Uint8Array(2));
      c.enqueue(new Uint8Array(2));
    },
    cancel() {
      cancelled = true;
    }
  });
  await assert.rejects(
    budget.read(body, (row) => observed.push(row)),
    /collection budget exceeded/
  );
  assert.equal(budget.totalBytes, 2);
  assert.equal(budget.totalReceivedBytes, 4);
  assert.deepEqual(observed, [
    { receivedBytes: 2, retainedBytes: 2 },
    { receivedBytes: 4, retainedBytes: 2 }
  ]);
  assert.equal(budget.signal.aborted, true);
  assert.equal(cancelled, true);
});

test("concurrent readers share one cap and pending bodies cancel on exhaustion", async () => {
  const budget = createResourceResponseBudget(5, 5);
  const observed = [[], []];
  let cancelled = false;
  const pendingBody = new ReadableStream({
    start(c) {
      c.enqueue(new Uint8Array(2));
    },
    cancel() {
      cancelled = true;
    }
  });
  const pending = budget.read(pendingBody, (row) => observed[0].push(row));
  const crossing = budget.read(new Response("abcd").body, (row) =>
    observed[1].push(row)
  );
  const results = await Promise.allSettled([pending, crossing]);
  assert.ok(results.every((result) => result.status === "rejected"));
  assert.ok(
    results.every((result) =>
      /collection budget exceeded/.test(result.reason.message)
    )
  );
  assert.equal(budget.totalBytes, 2);
  assert.equal(budget.totalReceivedBytes, 6);
  assert.deepEqual(observed, [
    [{ receivedBytes: 2, retainedBytes: 2 }],
    [{ receivedBytes: 4, retainedBytes: 0 }]
  ]);
  assert.equal(cancelled, true);
  assert.equal(budget.signal.aborted, true);
  await assert.rejects(
    budget.read(new Response("x").body),
    /collection budget exceeded/
  );
});

test("failed body cancels the whole workload instead of accepting a partial response", async () => {
  const budget = createResourceResponseBudget(8, 5);
  const error = new Error("fictional stream failure");
  const body = new ReadableStream({
    start(c) {
      c.error(error);
    }
  });
  await assert.rejects(budget.read(body), error);
  assert.equal(budget.signal.reason, error);
  assert.equal(budget.totalBytes, 0);
});

test("empty response has no bytes and abort still rejects an empty body", async () => {
  const budget = createResourceResponseBudget(8, 5);
  assert.equal((await budget.read(null)).length, 0);
  const error = new Error("fictional cancellation");
  budget.abort(error);
  await assert.rejects(budget.read(null), error);
});

test("invalid response budgets are rejected before reads", () => {
  for (const value of [
    0,
    -1,
    0.5,
    NaN,
    Infinity,
    Number.MAX_SAFE_INTEGER + 1
  ]) {
    assert.throws(() => createResourceResponseBudget(value, 5));
    assert.throws(() => createResourceResponseBudget(8, value));
  }
});

test("observer snapshots remain per-read while received totals span completed responses", async () => {
  const budget = createResourceResponseBudget(8, 5);
  const observed = [[], []];
  assert.equal(
    (
      await budget.read(new Response("abc").body, (row) =>
        observed[0].push(row)
      )
    ).toString(),
    "abc"
  );
  assert.equal(
    (
      await budget.read(new Response("defgh").body, (row) =>
        observed[1].push(row)
      )
    ).toString(),
    "defgh"
  );
  assert.deepEqual(observed, [
    [{ receivedBytes: 3, retainedBytes: 3 }],
    [{ receivedBytes: 5, retainedBytes: 5 }]
  ]);
  assert.equal(budget.totalReceivedBytes, 8);
  assert.equal(budget.totalBytes, 8);
});

test("observer retains partial byte evidence when a later body read fails", async () => {
  const budget = createResourceResponseBudget(8, 5);
  const observed = [];
  const error = new Error("fictional failure after a partial body");
  let pulls = 0;
  const body = new ReadableStream({
    pull(c) {
      if (pulls++ === 0) c.enqueue(new Uint8Array([1, 2]));
      else c.error(error);
    }
  });
  await assert.rejects(
    budget.read(body, (row) => observed.push(row)),
    (actual) => actual === error
  );
  assert.deepEqual(observed, [{ receivedBytes: 2, retainedBytes: 2 }]);
  assert.equal(budget.totalReceivedBytes, 2);
  assert.equal(budget.totalBytes, 2);
  assert.equal(budget.signal.reason, error);
});

test("a chunk delivered during shared abort is received but never retained", async () => {
  const budget = createResourceResponseBudget(8, 5);
  const error = new Error("fictional concurrent abort");
  const observed = [];
  let reads = 0,
    cancellations = 0,
    released = false;
  const body = {
    getReader: () => ({
      read: async () => {
        reads++;
        budget.abort(error);
        return { value: new Uint8Array([1, 2, 3]), done: false };
      },
      cancel: async () => cancellations++,
      releaseLock: () => {
        released = true;
      }
    })
  };
  await assert.rejects(
    budget.read(body, (row) => observed.push(row)),
    (actual) => actual === error
  );
  assert.deepEqual(observed, [{ receivedBytes: 3, retainedBytes: 0 }]);
  assert.equal(budget.totalReceivedBytes, 3);
  assert.equal(budget.totalBytes, 0);
  assert.equal(reads, 1);
  assert.ok(cancellations > 0);
  assert.equal(released, true);
  assert.equal(budget.signal.reason, error);
});

test("an observer failure cannot replace an existing shared abort reason", async () => {
  const budget = createResourceResponseBudget(8, 5);
  const error = new Error("fictional original abort");
  const body = {
    getReader: () => ({
      read: async () => {
        budget.abort(error);
        return { value: new Uint8Array(2), done: false };
      },
      cancel: async () => {},
      releaseLock: () => {}
    })
  };
  await assert.rejects(
    budget.read(body, () => {
      throw new Error("fictional observer failure");
    }),
    (actual) => actual === error
  );
  assert.equal(budget.totalReceivedBytes, 2);
  assert.equal(budget.totalBytes, 0);
  assert.equal(budget.signal.reason, error);
});
