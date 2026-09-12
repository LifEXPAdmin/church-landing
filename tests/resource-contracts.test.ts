import test from "node:test";
import assert from "node:assert/strict";
import {
  resourceContracts,
  requireImplementedResource,
  ResourceUnavailableError,
  type ResourceReference
} from "../lib/platform/resource-contracts";

test("reserved and unknown resource kinds cannot select a working service", () => {
  for (const kind of [
    "exchangeListing",
    "gatherGroup",
    "mediaCatalogItem",
    "volunteerOpportunity",
    "fundraisingCampaign",
    "family",
    "__proto__",
    "constructor",
    "toString",
    "POST",
    "",
    null,
    { kind: "exchangeListing", enabled: true, authority: "post-commands" }
  ]) {
    assert.throws(
      () => requireImplementedResource(kind),
      (error: unknown) =>
        error instanceof ResourceUnavailableError && error.status === 503
    );
  }
  assert.throws(
    () =>
      Object.assign(resourceContracts.exchangeListing, {
        state: "implemented",
        authority: "post-commands"
      }),
    TypeError
  );
  assert.throws(
    () =>
      Object.assign(resourceContracts, {
        exchangeListing: resourceContracts.post
      }),
    TypeError
  );
  assert.throws(
    () => requireImplementedResource("exchangeListing"),
    ResourceUnavailableError
  );
});

test("implemented resources point to their existing authority without granting access", () => {
  for (const kind of [
    "post",
    "church",
    "eventOccurrence",
    "imageAsset",
    "personalPhoto",
    "photoAlbum",
    "setting"
  ] as const) {
    const contract = requireImplementedResource(kind);
    assert.equal(contract.state, "implemented");
    assert.equal(contract, resourceContracts[kind]);
    assert.ok(contract.authority);
    assert.equal("canRead" in contract, false);
    assert.equal("canWrite" in contract, false);
  }
});

// Compile-time assertions prevent settings scopes, events and media IDs from being
// substituted merely because each source happens to use an opaque string ID.
function typedAddresses() {
  const post: ResourceReference<"post"> = { kind: "post", id: "same-id" };
  const image: ResourceReference<"imageAsset"> = {
    kind: "imageAsset",
    id: "same-id"
  };
  const setting: ResourceReference<"setting"> = {
    kind: "setting",
    settingId: "appearance",
    scope: { kind: "browser" }
  };
  // @ts-expect-error Image addresses are not post addresses.
  const wrongPost: ResourceReference<"post"> = image;
  const unscoped: ResourceReference<"setting"> = {
    kind: "setting",
    // @ts-expect-error Settings require an explicit scope, not a generic row ID.
    id: "appearance"
  };
  const family: ResourceReference<"setting"> = {
    kind: "setting",
    settingId: "appearance",
    // @ts-expect-error Inactive family policy is not an active scope.
    scope: { kind: "family" }
  };
  return [post, setting, wrongPost, unscoped, family];
}
void typedAddresses;
