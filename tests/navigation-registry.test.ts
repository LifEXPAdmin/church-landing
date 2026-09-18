import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  aboutNavigation,
  administrationNavigation,
  menuNavigation,
  navigationItem,
  navigationRegistry,
  primaryNavigation,
  type NavigationId
} from "../lib/platform/navigation-registry";
import { resourceContracts } from "../lib/platform/resource-contracts";

test("primary navigation preserves five working destinations and the current church entry", () => {
  const guest = primaryNavigation();
  const member = primaryNavigation("navigation_fixture");
  assert.deepEqual(
    guest.map((item) => item.title),
    ["Home", "Churches", "Explore", "Messages", "Menu"]
  );
  assert.deepEqual(
    member.map((item) => item.title),
    ["Home", "My church", "Explore", "Messages", "Menu"]
  );
  assert.equal(guest[1].href, "/platform/churches");
  assert.equal(member[1].href, "/platform/my-church");
  assert.equal(guest.find((item) => item.id === "messages")?.prefetch, false);
  assert.ok(!JSON.stringify(member).includes("navigation_fixture"));
  for (const item of member) {
    assert.equal("description" in item, false);
    assert.equal("resource" in item, false);
  }
});

test("Menu separates private entries from guest reading without inventing administrator authority", () => {
  const guest = menuNavigation({});
  const member = menuNavigation({ username: "navigation_fixture" });
  assert.deepEqual(
    guest.map((group) => group.title),
    ["Community", "Discover", "My activity", "Account"]
  );
  const guestIds = guest.flatMap((group) => group.items.map((item) => item.id));
  const memberIds = member.flatMap((group) =>
    group.items.map((item) => item.id)
  );
  for (const id of [
    "exchange",
    "groups",
    "topics",
    "profile",
    "settings",
    "calendars",
    "commitments"
  ])
    assert.ok(guestIds.includes(id as NavigationId), id);
  for (const id of [
    "activity",
    "saved",
    "drafts",
    "helpRequests",
    "feedback",
    "reports",
    "contactRequests",
    "messages"
  ] as const) {
    assert.ok(!guestIds.includes(id), id);
    assert.ok(memberIds.includes(id), id);
  }
  assert.equal(new Set(memberIds).size, memberIds.length);
  assert.deepEqual(
    administrationNavigation({ username: "navigation_fixture" }),
    []
  );
  assert.deepEqual(administrationNavigation({ adminAvailable: true }), []);
  assert.equal(
    administrationNavigation({
      username: "navigation_fixture",
      adminAvailable: true
    })[0].href,
    "/platform/admin"
  );
  assert.equal(navigationItem("profile", {}).href, "/platform/profile/me");
  assert.equal(
    navigationItem("profile", { username: "navigation_fixture" }).href,
    "/platform/profile/navigation_fixture"
  );
  assert.equal(navigationItem("qr", {}).href, "/platform/share?qr=1");
  assert.equal(
    navigationItem("qr", { username: "navigation_fixture" }).href,
    "/platform/invitations"
  );
});

// Resolve against the actual App Router tree, including existing dynamic pages.
// A declaration alone must not make a missing placeholder a usable destination.
function hasPage(directory: string, segments: string[]): boolean {
  if (!segments.length) return existsSync(join(directory, "page.tsx"));
  const [segment, ...rest] = segments;
  return readdirSync(directory, { withFileTypes: true }).some(
    (entry) =>
      entry.isDirectory() &&
      (entry.name === segment || /^\[[a-zA-Z]+\]$/.test(entry.name)) &&
      hasPage(join(directory, entry.name), rest)
  );
}
test("every registered destination resolves to a real page and optional modules require their actual resource owner", () => {
  const contexts = [
    {},
    { username: "navigation_fixture", adminAvailable: true }
  ];
  const reachable = new Set<NavigationId>(["qr"]);
  for (const context of contexts) {
    for (const id of Object.keys(navigationRegistry) as NavigationId[]) {
      const item = navigationItem(id, context);
      const url = new URL(item.href, "https://navigation.invalid");
      assert.equal(url.origin, "https://navigation.invalid");
      assert.ok(
        hasPage("app", url.pathname.split("/").filter(Boolean)),
        item.href
      );
      if (item.resource)
        assert.equal(resourceContracts[item.resource].state, "implemented");
    }
    const projected = [
      ...menuNavigation(context).flatMap((group) => group.items),
      ...administrationNavigation(context),
      ...aboutNavigation,
      ...primaryNavigation(context.username)
    ];
    for (const item of projected) {
      reachable.add(item.id);
      assert.ok(
        !/^\/platform\/(?:media|businesses|foundry)(?:\/|$)/.test(item.href),
        item.href
      );
    }
  }
  assert.deepEqual(reachable, new Set(Object.keys(navigationRegistry)));
});

test("resolved navigation is fresh data and changing one projection cannot corrupt a later account's links", () => {
  const previous = menuNavigation({ username: "previous_member" });
  const profile = previous
    .flatMap((group) => group.items)
    .find((item) => item.id === "profile")!;
  profile.href = "https://untrusted.invalid";
  const current = menuNavigation({ username: "current_member" });
  const serialized = JSON.stringify(current);
  assert.ok(!serialized.includes("previous_member"));
  assert.ok(!serialized.includes("untrusted.invalid"));
  assert.ok(serialized.includes("/platform/profile/current_member"));
  assert.equal(navigationRegistry.profile.href, "/platform/profile/me");
});
