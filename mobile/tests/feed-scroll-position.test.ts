import assert from "node:assert/strict";
import test from "node:test";
import { captureScrollPosition, restoreScrollPosition,
  type ScrollIdentity } from "../src/ui/feed-scroll-position.ts";

const identity = (): Extract<ScrollIdentity, { kind: "feed" }> => ({
  kind: "feed", owner: "fictional-member", generation: 3, mode: "weekly", scope: "fictional-scope", pageCursor: "second.page"
});
const bounds = { contentHeight: 1800, viewportHeight: 600 };

test("the exact current page restores a finite fractional offset without rounding", () => {
  const page = identity(), position = captureScrollPosition(page, 425.75);
  assert.ok(position);
  assert.equal(restoreScrollPosition(position, { ...page }, bounds), 425.75);
  assert.equal(restoreScrollPosition(captureScrollPosition(page, 0), page, bounds), 0);
  assert.equal(restoreScrollPosition(captureScrollPosition(page, -0), page, bounds), 0);
});

test("every owner, generation and canonical page-address mismatch rejects restoration", () => {
  const page = identity(), position = captureScrollPosition(page, 425);
  const changes: Partial<Extract<ScrollIdentity, { kind: "feed" }>>[] = [
    { owner: "another-fictional-member" }, { generation: page.generation + 1 },
    { mode: "trending" }, { scope: "another-scope" }, { pageCursor: "first.page" }
  ];
  for (const change of changes)
    assert.equal(restoreScrollPosition(position, { ...page, ...change }, bounds), null, JSON.stringify(change));
});

test("capture copies only page identity and freezes the bookmark without freezing the caller", () => {
  const page = { ...identity(), body: "Do not retain fictional private content", token: "Do not retain a token" };
  const expected = identity(), position = captureScrollPosition(page, 55.5);
  assert.ok(position);
  page.owner = "changed-owner"; page.generation++;
  page.mode = "trending"; page.scope = "changed-scope"; page.pageCursor = "changed-page";
  assert.notEqual(position.identity, page);
  assert.deepEqual(position, { identity: expected, y: 55.5 });
  assert.deepEqual(Object.keys(position).sort(), ["identity", "y"]);
  assert.deepEqual(Object.keys(position.identity).sort(), ["generation", "kind", "mode", "owner", "pageCursor", "scope"]);
  assert.equal(Object.isFrozen(page), false);
  assert.equal(Object.isFrozen(position), true); assert.equal(Object.isFrozen(position.identity), true);
  assert.throws(() => Object.assign(position, { y: 99 }), TypeError);
  assert.throws(() => Object.assign(position.identity, { owner: "changed-owner" }), TypeError);
});

test("shorter, empty and fractional layouts clamp to their current scrollable bounds", () => {
  const page = identity(), position = captureScrollPosition(page, 800);
  assert.equal(restoreScrollPosition(position, page, { contentHeight: 1000, viewportHeight: 600 }), 400);
  assert.equal(restoreScrollPosition(position, page, { contentHeight: 625.75, viewportHeight: 600.25 }), 25.5);
  assert.equal(restoreScrollPosition(position, page, { contentHeight: 600, viewportHeight: 600 }), 0);
  assert.equal(restoreScrollPosition(position, page, { contentHeight: 300, viewportHeight: 600 }), 0);
  assert.equal(restoreScrollPosition(position, page, { contentHeight: 0, viewportHeight: 600 }), 0);
  assert.equal(restoreScrollPosition(captureScrollPosition(page, 1200), page, bounds), 1200);
});

test("invalid offsets and unmeasured or invalid layouts never produce a restoration", () => {
  const page = identity(), position = captureScrollPosition(page, 100);
  for (const y of [-0.5, -1, NaN, Infinity, -Infinity]) {
    assert.equal(captureScrollPosition(page, y), null);
    assert.equal(restoreScrollPosition({ identity: page, y }, page, bounds), null);
  }
  for (const contentHeight of [-0.5, NaN, Infinity, -Infinity])
    assert.equal(restoreScrollPosition(position, page, { ...bounds, contentHeight }), null);
  for (const viewportHeight of [0, -0.5, NaN, Infinity, -Infinity])
    assert.equal(restoreScrollPosition(position, page, { ...bounds, viewportHeight }), null);
});

test("a cleared bookmark stays empty and independent captures retain no shared history", () => {
  const page = identity(), first = captureScrollPosition(page, 20);
  const next = captureScrollPosition({ ...page, mode: "trending" }, 40);
  assert.equal(restoreScrollPosition(null, page, bounds), null);
  assert.equal(restoreScrollPosition(first, page, bounds), 20);
  assert.equal(restoreScrollPosition(next, page, bounds), null);
  assert.equal(restoreScrollPosition(null, { ...page, mode: "trending" }, bounds), null);
});

test("detail bookmarks retain only a copied owner, generation, post address and finite offset", () => {
  const detail = { kind: "post" as const, owner: "fictional-member", generation: 3, postId: "fictional-post",
    body: "Do not retain content", revealed: true, token: "Do not retain credentials" };
  const position = captureScrollPosition(detail, 425.75);
  assert.deepEqual(position, { identity: { kind: "post", owner: detail.owner, generation: 3, postId: detail.postId }, y: 425.75 });
  assert.equal(Object.isFrozen(position), true); assert.equal(Object.isFrozen(position?.identity), true);
  detail.body = "changed"; detail.revealed = false; detail.postId = "another-post";
  const address = { ...detail, postId: "fictional-post" };
  assert.equal(restoreScrollPosition(position, address, bounds), 425.75);
  assert.equal(restoreScrollPosition(position, address, { contentHeight: 620, viewportHeight: 600 }), 20);
  assert.equal(restoreScrollPosition(position, address, { contentHeight: 0, viewportHeight: 600 }), 0);
  for (const change of [{ owner: "other" }, { generation: 4 }, { postId: "other" }])
    assert.equal(restoreScrollPosition(position, { ...address, ...change }, bounds), null);
  assert.equal(restoreScrollPosition(position, identity(), bounds), null);
  assert.equal(restoreScrollPosition(captureScrollPosition(identity(), 42), address, bounds), null);
  assert.equal(captureScrollPosition(address, NaN), null);
  assert.equal(restoreScrollPosition(null, address, bounds), null);
});
