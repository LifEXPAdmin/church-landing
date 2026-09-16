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
test("message return retains only owned navigation candidates, never text or chosen actors", () => {
  assert.equal(
    safeAccountReturn(
      "/platform/messages?archived=true&after=next1&content=secret"
    ),
    "/platform/messages?archived=true&after=next1"
  );
  assert.equal(
    safeAccountReturn(
      "/platform/messages/thread1?message=item1&recipientId=other&text=secret"
    ),
    "/platform/messages/thread1?message=item1"
  );
  assert.equal(
    safeAccountReturn(
      "/platform/messages/requests?recipientId=person1&purpose=secret"
    ),
    "/platform/messages/requests?recipientId=person1"
  );
  assert.equal(
    safeAccountReturn("/platform/messages/thread1/anything"),
    "/platform"
  );
  for (const [path, retained] of [
    ["", "archived=true&after=next1"],
    ["/thread1", "archived=true&after=next1&message=item1"],
    ["/requests", "recipientId=person1"]
  ]) {
    assert.equal(
      safeAccountReturn(
        `/platform/messages${path}/?archived=true&after=next1&message=item1&recipientId=person1&q=private&content=secret&purpose=secret`
      ),
      `/platform/messages${path}?${retained}`
    );
  }
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

test("photo review and signup returns keep the exact destination but discard prior-session actions and cursors", () => {
  assert.equal(
    safeAccountReturn(
      "/platform/photo-tags?tag=tag1&operation=accept&after=old&recipientId=other"
    ),
    "/platform/photo-tags?tag=tag1"
  );
  assert.equal(
    safeAccountReturn("/platform/photo-tags/?profile=adult1&after=old"),
    "/platform/photo-tags?profile=adult1"
  );
  assert.equal(
    safeAccountReturn(
      "/platform/photo-tags?view=preferences&choice=EVERYONE&tag=ignored"
    ),
    "/platform/photo-tags?view=preferences"
  );
  assert.equal(
    safeAccountReturn("/platform/photo-tags?scope=sent&after=old"),
    "/platform/photo-tags?scope=sent"
  );
  assert.equal(
    safeAccountReturn(
      "/platform/commitments?signup=signup1&operation=cancel&month=2000-01"
    ),
    "/platform/commitments?signup=signup1"
  );
});
