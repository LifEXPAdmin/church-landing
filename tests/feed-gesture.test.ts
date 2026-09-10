import test from "node:test";
import assert from "node:assert/strict";
import {
  feedGestureAxis,
  feedGestureResult
} from "../lib/platform/feed-gesture";
import { safeAccountReturn } from "../lib/platform/account-entry";

test("short deliberate horizontal swipes turn posts; small, diagonal and slow gestures do not", () => {
  assert.equal(feedGestureAxis(4, 5, true, false), null);
  assert.equal(feedGestureAxis(-55, 8, false, false), "horizontal");
  assert.equal(feedGestureResult("horizontal", -55, 8, 250), "next");
  assert.equal(feedGestureResult("horizontal", 55, 8, 250), "previous");
  assert.equal(feedGestureResult("horizontal", 25, 8, 250), null);
  assert.equal(feedGestureResult("horizontal", 55, 48, 250), null);
  assert.equal(feedGestureResult("horizontal", 55, 8, 1800), null);
});

test("vertical reading stays inside long posts; closing needs a deliberate outward drag from an edge", () => {
  assert.equal(feedGestureAxis(3, -100, true, false), "scroll");
  assert.equal(feedGestureAxis(3, 100, false, true), "scroll");
  assert.equal(feedGestureAxis(3, 100, true, false), "dismiss");
  assert.equal(feedGestureAxis(3, -100, false, true), "dismiss");
  assert.equal(feedGestureResult("dismiss", 3, 65, 250), null);
  assert.equal(feedGestureResult("dismiss", 3, 165, 350), "close");
  assert.equal(feedGestureResult("dismiss", 3, -165, 350), "close");
  assert.equal(feedGestureResult("scroll", 3, 260, 350), null);
  assert.equal(feedGestureResult(null, 3, 260, 350), null);
});

test("account returns retain the focused reader and reading position without private or foreign destinations", () => {
  assert.equal(
    safeAccountReturn(
      "/platform/feed?post=example&mode=list&token=private#secret"
    ),
    "/platform/feed?post=example&mode=list"
  );
  for (const path of [
    "//evil.test/platform/feed",
    "/platform/feed/unknown",
    "/platform/feed/%2f%2fevil.test"
  ])
    assert.equal(safeAccountReturn(path), "/platform");
});
