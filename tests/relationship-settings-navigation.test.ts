import test from "node:test";
import assert from "node:assert/strict";
import { relationshipSearch } from "../lib/platform/relationship-navigation";
import { safeAccountReturn } from "../lib/platform/account-entry";

test("safety list search is bounded and only valid for supported private views", () => {
  assert.equal(relationshipSearch("blocked", "  Alice  "), "Alice");
  assert.equal(relationshipSearch("muted", "x".repeat(101)).length, 100);
  assert.equal(relationshipSearch("following", "Alice"), "");
  assert.equal(relationshipSearch("blocked", ["Alice"]), "");
  assert.equal(relationshipSearch("blocked", "a\nb"), "");
});
test("sign-in return preserves bounded list search and cursor without introducing unsupported query state", () => {
  const url = new URL(
    safeAccountReturn(
      "/platform/relationships?view=blocked&q=%20Alice%20&after=cursor1&ownerId=other"
    ),
    "https://return.invalid"
  );
  assert.equal(url.searchParams.get("q"), "Alice");
  assert.equal(url.searchParams.get("after"), "cursor1");
  assert.equal(url.searchParams.has("ownerId"), false);
  assert.equal(
    new URL(
      safeAccountReturn("/platform/relationships?view=following&q=Alice"),
      "https://return.invalid"
    ).searchParams.has("q"),
    false
  );
  assert.equal(
    new URL(
      safeAccountReturn(
        "/platform/relationships?view=blocked&q=" + "x".repeat(150)
      ),
      "https://return.invalid"
    ).searchParams.get("q")?.length,
    100
  );
});
