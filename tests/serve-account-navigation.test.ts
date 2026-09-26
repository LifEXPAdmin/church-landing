import test from "node:test";
import assert from "node:assert/strict";
import {
  accountEntryHref,
  safeAccountReturn
} from "../lib/platform/account-entry";

const origin = "https://navigation.example.test";

test("Serve account entry retains each existing destination without replaying private state", () => {
  for (const path of [
    "/platform/serve",
    "/platform/serve/applications",
    "/platform/serve/new",
    "/platform/serve/opportunity_1",
    "/platform/serve/opportunity_1/edit",
    "/platform/serve/opportunity_1/applications"
  ]) {
    const next =
      path +
      "/?operation=apply&action=approve&after=private-cursor&token=secret&postId=private-post&statement=private-note#confirm";
    assert.equal(safeAccountReturn(next), path);
    for (const method of ["join", "login", "signup"] as const) {
      const entry = new URL(accountEntryHref(method, next), origin);
      assert.equal(entry.pathname, "/platform/" + method);
      assert.equal(entry.searchParams.get("next"), path);
      assert.doesNotMatch(entry.search, /private-|secret|operation|statement/);
    }
  }
});

test("public Serve returns preserve only a bounded search and a single valid church reference", () => {
  const value =
    "/platform/serve/?q=%20food%20pantry%20&churchId=church_12-Ab&after=cursor&operation=apply&token=secret#private";
  assert.equal(
    safeAccountReturn(value),
    "/platform/serve?q=food+pantry&churchId=church_12-Ab"
  );
  assert.equal(
    new URL(accountEntryHref("login", value), origin).searchParams.get("next"),
    "/platform/serve?q=food+pantry&churchId=church_12-Ab"
  );
  assert.equal(
    safeAccountReturn("/platform/serve?q=" + "a".repeat(70)),
    "/platform/serve?q=" + "a".repeat(70)
  );
  assert.equal(
    safeAccountReturn("/platform/serve?churchId=" + "a".repeat(100)),
    "/platform/serve?churchId=" + "a".repeat(100)
  );
  for (const path of [
    "/platform/serve/applications",
    "/platform/serve/new",
    "/platform/serve/opportunity_1",
    "/platform/serve/opportunity_1/edit",
    "/platform/serve/opportunity_1/applications"
  ])
    assert.equal(
      safeAccountReturn(
        path +
          "?q=pantry&churchId=church_12&postId=private&after=cursor#details"
      ),
      path
    );
});

test("malformed or ambiguous Serve filters are dropped without carrying arbitrary state", () => {
  for (const query of [
    "q=" + "a".repeat(71),
    "q=%20%20%20",
    "q=first&q=second",
    "q=before%00after",
    "q=before%0Aafter",
    "q=before%7Fafter",
    "churchId=" + "a".repeat(101),
    "churchId=../other",
    "churchId=church%2Fprivate",
    "churchId=%20church%20",
    "churchId=first&churchId=second",
    "view=applications&action=approve&after=old&cursor=old&postId=private&token=secret&statement=private"
  ])
    assert.equal(
      safeAccountReturn("/platform/serve?" + query),
      "/platform/serve",
      query
    );
  assert.equal(
    safeAccountReturn(
      "/platform/serve?q=valid&churchId=%2Foutside&token=secret"
    ),
    "/platform/serve?q=valid"
  );
  assert.equal(
    safeAccountReturn("/platform/serve?q=first&q=second&churchId=church1"),
    "/platform/serve?churchId=church1"
  );
});

test("unsafe or unsupported Serve destinations fall back to Home", () => {
  for (const value of [
    "https://elsewhere.invalid/platform/serve",
    "//elsewhere.invalid/platform/serve/applications",
    "javascript:alert(1)",
    "/platform\\serve",
    "/platform/serve\n/applications",
    "/platform/serve//applications",
    "/platform/serve/opportunity_1/delete",
    "/platform/serve/opportunity_1/edit/confirm",
    "/platform/serve/opportunity_1/applications/approve",
    "/platform/serve/%2Foutside",
    "/platform/serve/%2e%2e/%2e%2e/outside",
    "/platform/serve/" + "a".repeat(101)
  ])
    assert.equal(safeAccountReturn(value), "/platform", value);
});
