import test from "node:test";
import assert from "node:assert/strict";
import {
  profileFeaturedReferences,
  featuredReferenceFromLink
} from "../lib/platform/profile-featured-input";
import {
  validateProfileModules,
  readProfileModules,
  emptyProfileModules
} from "../lib/platform/profile-modules";

test("featured references enforce a separate six-item strict typed bound and canonical same-site links", () => {
  const six = Array.from({ length: 6 }, (_, i) => ({
    kind: "mediaCatalogItem",
    id: "x".repeat(99) + i
  }));
  assert.deepEqual(profileFeaturedReferences(six), six);
  for (const bad of [
    undefined,
    null,
    {},
    [...six, { kind: "mediaCatalogItem", id: "extra" }],
    [six[0], six[0]],
    [{ kind: "post", id: "x" }],
    [{ kind: "eventOccurrence", id: "x" }],
    [{ kind: "mediaCatalogItem", id: "x", title: "forged" }],
    [{ kind: "mediaCatalogItem", id: "../x" }],
    [{ kind: "exchangeListing", id: "x".repeat(101) }]
  ]) {
    assert.throws(() => profileFeaturedReferences(bad));
    assert.deepEqual(
      readProfileModules({ ...emptyProfileModules(), featuredResources: bad }),
      emptyProfileModules()
    );
  }
  for (const [route, kind] of [
    ["exchange", "exchangeListing"],
    ["exchange/help", "exchangeListing"],
    ["media", "mediaCatalogItem"],
    ["serve", "volunteerOpportunity"]
  ])
    assert.deepEqual(
      featuredReferenceFromLink(
        `/platform/${route}/some-id`,
        "https://example.test"
      ),
      { kind, id: "some-id" }
    );
  for (const link of [
    "https://elsewhere.test/platform/media/x",
    "https://user:pass@example.test/platform/media/x",
    "/platform/media/x?edit=1",
    "/platform/media/x#secret",
    "/platform/posts/x",
    "/platform/help/x",
    "javascript:alert(1)"
  ])
    assert.throws(() =>
      featuredReferenceFromLink(link, "https://example.test")
    );
  assert.deepEqual(
    validateProfileModules({ ...emptyProfileModules(), featuredResources: [] })
      .featuredResources,
    []
  );
});
