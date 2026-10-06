import test from "node:test";
import assert from "node:assert/strict";
import {
  safeAccountReturn,
  accountEntryHref
} from "../lib/platform/account-entry";

test("media account entry preserves only known destinations and an explicit playlist editor view", () => {
  for (const path of [
    "/platform/media",
    "/platform/media/new",
    "/platform/media/studio",
    "/platform/media/saved",
    "/platform/media/playlists",
    "/platform/media/playlists/item-1",
    "/platform/media/item-1",
    "/platform/media/item-1/edit"
  ])
    assert.equal(
      safeAccountReturn(
        path + "/?token=private&after=old&save=1&draft=private#secret"
      ),
      path
    );
  assert.equal(
    safeAccountReturn("/platform/media/playlists/item-1?edit=1&publish=1"),
    "/platform/media/playlists/item-1?edit=1"
  );
  for (const path of [
    "/platform/media/item/unknown",
    "/platform/media/playlists/item/edit",
    "/platform/media/%2f%2fevil.test",
    "/platform/media/" + "a".repeat(101)
  ])
    assert.equal(safeAccountReturn(path), "/platform");
});

test("search account entry retains current resource category and public filters but restarts pagination", () => {
  for (const kind of [
    "posts",
    "people",
    "churches",
    "events",
    "topics",
    "listings",
    "media",
    "opportunities",
    "groups"
  ]) {
    const result = new URL(
      safeAccountReturn(
        `/platform/search/?kind=${kind}&q=faith&after=old&cursor=old&token=private&save=1`
      ),
      "https://local.invalid"
    );
    assert.equal(result.pathname, "/platform/search");
    assert.equal(result.searchParams.get("kind"), kind);
    assert.equal(result.searchParams.get("q"), "faith");
    assert.deepEqual([...result.searchParams.keys()].sort(), ["kind", "q"]);
  }
  const location = new URL(
    safeAccountReturn(
      "/platform/search?kind=listings&q=chair&country=US&placeId=4887398&radiusKm=25"
    ),
    "https://local.invalid"
  );
  assert.equal(location.searchParams.get("country"), "US");
  assert.equal(location.searchParams.get("placeId"), "4887398");
  assert.equal(location.searchParams.get("radiusKm"), "25");
  assert.equal(
    new URL(
      safeAccountReturn(
        "/platform/search?kind=media&q=faith&churchId=church-1"
      ),
      "https://local.invalid"
    ).searchParams.get("churchId"),
    "church-1"
  );
});

test("ambiguous or invalid public search state returns to a fresh search", () => {
  for (const query of [
    "kind=media&kind=groups&q=faith",
    "kind=unknown&q=faith",
    "kind=media&q=faith&q=other",
    "kind=groups&q=" + "x".repeat(81),
    "kind=listings&q=chair&placeId=4887398",
    "kind=listings&q=chair&country=US&placeId=4887398&radiusKm=11",
    "kind=media&q=faith%00secret"
  ])
    assert.equal(
      safeAccountReturn("/platform/search?" + query),
      "/platform/search"
    );
});

test("join, login and signup retain the same destination without replaying the requested action", () => {
  for (const flow of ["join", "login", "signup"] as const) {
    const href = new URL(
      accountEntryHref(
        flow,
        "/platform/media/item-1?save=1&token=private",
        "account"
      ),
      "https://local.invalid"
    );
    assert.equal(href.pathname, "/platform/" + flow);
    assert.equal(href.searchParams.get("next"), "/platform/media/item-1");
  }
});
