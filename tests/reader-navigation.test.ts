import test from "node:test";
import assert from "node:assert/strict";
import {
  readerDate,
  readerId,
  readerHref,
  touchTurn,
  wheelTurn,
  newWheelGesture
} from "../lib/platform/reader-navigation";
import {
  safeAccountReturn,
  accountEntryHref
} from "../lib/platform/account-entry";
import { parseReadingPreferences } from "../lib/platform/reading-preferences";

test("reader touch direction is literal and rejects slow, short, vertical and invalid gestures", () => {
  assert.equal(touchTurn(80, 19, 650), 1);
  assert.equal(touchTurn(-80, -19, 650), -1);
  for (const [x, y, t] of [
    [79, 0, 100],
    [120, 20, 100],
    [-120, -20, 100],
    [120, 0, 651],
    [120, 0, -1],
    [NaN, 0, 100],
    [0, 0, 100]
  ])
    assert.equal(touchTurn(x, y, t), 0);
});
test("wheel bursts accumulate horizontal motion but consume momentum once, including reduced-motion turns", () => {
  let state = newWheelGesture();
  const step = (
    x: number,
    y: number,
    time: number,
    blocked = false,
    mode = 0
  ) => {
    const result = wheelTurn(state, { x, y, time, blocked, mode, height: 800 });
    state = result.state;
    return result.delta;
  };
  assert.equal(step(40, 1, 0), 0);
  assert.equal(step(41, 1, 100), 1);
  assert.equal(step(100, 0, 200), 0);
  assert.equal(step(-200, 0, 300), 0);
  assert.equal(step(-80, 0, 600), -1);
  assert.equal(step(300, 0, 950, true), 0);
  assert.equal(step(300, 0, 1000), 0);
  assert.equal(step(5, 0, 1300, false, 1), 1);
  assert.equal(step(-1, 0, 1600, false, 2), -1);
});
test("vertical and interactive wheel bursts never become a later page turn", () => {
  let result = wheelTurn(newWheelGesture(), {
    x: 0,
    y: 80,
    time: 0,
    blocked: false,
    mode: 0,
    height: 800
  });
  assert.equal(result.delta, 0);
  result = wheelTurn(result.state, {
    x: 400,
    y: 0,
    time: 100,
    blocked: false,
    mode: 0,
    height: 800
  });
  assert.equal(result.delta, 0);
  result = wheelTurn(result.state, {
    x: 100,
    y: 0,
    time: 500,
    blocked: true,
    mode: 0,
    height: 800
  });
  assert.equal(result.delta, 0);
  result = wheelTurn(result.state, {
    x: 100,
    y: 0,
    time: 600,
    blocked: false,
    mode: 0,
    height: 800
  });
  assert.equal(result.delta, 0);
});
test("reading URLs retain the current batch across turns, modes, account entry and native action returns", () => {
  const anchor = { id: "post_a", at: "2026-09-10T12:00:00.000Z" };
  const first = readerHref(
    "/platform?before=2026-09-11T00%3A00%3A00.000Z&cursor=older",
    "post_b",
    "pages",
    anchor
  );
  const next = readerHref(first, "post_c", "list", {
    id: "newer",
    at: "2026-09-11T12:00:00.000Z"
  });
  const url = new URL(next, "https://test.invalid");
  assert.equal(url.searchParams.get("post"), "post_c");
  assert.equal(url.searchParams.get("mode"), "list");
  assert.equal(url.searchParams.get("anchor"), anchor.id);
  assert.equal(url.searchParams.get("through"), anchor.at);
  assert.equal(url.searchParams.get("cursor"), "older");
  const normalized = safeAccountReturn(next + "&token=secret#private");
  assert.deepEqual(
    Object.fromEntries(new URL(normalized, url).searchParams),
    Object.fromEntries(url.searchParams)
  );
  assert.equal(
    new URL(accountEntryHref("join", next, "comment"), url).searchParams.get(
      "next"
    ),
    normalized
  );
});
test("reader anchors reject malformed dates/identifiers and cannot smuggle navigation or credentials", () => {
  for (const date of [
    undefined,
    "2026-02-30T12:00:00Z",
    "2026-09-10",
    "2026-09-10T12:00:00+00:00",
    "x".repeat(2000)
  ])
    assert.equal(readerDate(date), null);
  for (const id of [undefined, "../evil", "a&token=secret", "a".repeat(101)])
    assert.equal(readerId(id), undefined);
  const fixed = readerHref(
    "/platform?through=bad&anchor=../evil",
    "b",
    "pages",
    { id: "a", at: "2026-09-10T12:00:00.000Z" }
  );
  assert.equal(
    new URL(fixed, "https://test.invalid").searchParams.get("anchor"),
    "a"
  );
  assert.equal(
    safeAccountReturn("/platform?through=bad&anchor=a&token=secret"),
    "/platform"
  );
  assert.equal(
    safeAccountReturn(
      "/platform/settings?through=2026-09-10T12:00:00Z&anchor=a"
    ),
    "/platform/settings"
  );
  assert.equal(safeAccountReturn("//evil.test/platform?anchor=a"), "/platform");
});
test("first use chooses Pages while prior List, appearance, size and reduced-motion choices survive", () => {
  assert.equal(parseReadingPreferences().mode, "pages");
  assert.equal(parseReadingPreferences("invalid").mode, "pages");
  const prior = {
    mode: "list",
    appearance: "dark",
    size: "largest",
    reduceMotion: true
  };
  assert.deepEqual(
    parseReadingPreferences(encodeURIComponent(JSON.stringify(prior))),
    prior
  );
});

test("private comment draft entry remains an allowed sign-in return", () => {
  assert.equal(
    safeAccountReturn("/platform/comment-drafts"),
    "/platform/comment-drafts"
  );
});

test("relationship return retains validated view and cursor without granting authority", () => {
  assert.equal(
    safeAccountReturn(
      "/platform/relationships?view=blocked&after=cursor-123&owner=another&token=secret"
    ),
    "/platform/relationships?view=blocked&after=cursor-123"
  );
  assert.equal(
    safeAccountReturn(
      "/platform/relationships?view=private-admin&after=%2Foutside"
    ),
    "/platform/relationships"
  );
});

test("saved return preserves only valid collection and cursor state", () => {
  assert.equal(
    safeAccountReturn(
      "/platform/saved?collectionId=unfiled&after=item-123&owner=other&token=secret"
    ),
    "/platform/saved?collectionId=unfiled&after=item-123"
  );
  assert.equal(
    safeAccountReturn("/platform/saved?collectionId=%2Foutside"),
    "/platform/saved"
  );
});

test("search return retains bounded query/category/filter/cursor without owner authority", () => {
  assert.equal(
    safeAccountReturn(
      "/platform/search?q=%E4%B8%AD%E6%96%87&kind=posts&topic=prayer&churchId=church-1&after=opaque_123&owner=other"
    ),
    "/platform/search?kind=posts&after=opaque_123&topic=prayer&churchId=church-1&q=%E4%B8%AD%E6%96%87"
  );
  assert.equal(
    safeAccountReturn("/platform/search?kind=admin&after=%2Fexternal"),
    "/platform/search"
  );
});

test("personal invitation navigation survives sign-in without accepting arbitrary routes or credentials", () => {
  const code = "a".repeat(43);
  assert.equal(
    safeAccountReturn("/platform/invitations"),
    "/platform/invitations"
  );
  assert.equal(
    safeAccountReturn(`/platform/invite/${code}?token=secret`),
    `/platform/invite/${code}`
  );
  assert.equal(safeAccountReturn("/platform/invite/bad"), "/platform");
  assert.equal(
    safeAccountReturn("https://elsewhere.invalid/platform/invitations"),
    "/platform"
  );
});
