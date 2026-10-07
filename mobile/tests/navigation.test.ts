import test from "node:test";
import assert from "node:assert/strict";
import { URL as ExpoURL } from "whatwg-url-minimum";
import type { AppDestination } from "@godschurches/shared-core";
import { createNativeLinkReader } from "../src/navigation/link-adapter.ts";
import { defaultNativeTabs, nativePrimaryNavigation } from "../src/navigation/primary-navigation.ts";
import { nativeNavigationSupport } from "../src/navigation/availability.ts";

const origin = "https://navigation.example.test";
const read = createNativeLinkReader(origin);

test("native link intake requires an exact trusted HTTPS origin and no credentials", () => {
  for (const bad of ["http://navigation.example.test", origin + "/", origin + "/path", origin + "?key=value", "https://user@navigation.example.test", "not a URL"])
    assert.throws(() => createNativeLinkReader(bad));
  for (const bad of ["/platform", "//navigation.example.test/platform", "http://navigation.example.test/platform", "godschurches-dev://platform", origin + ".evil.test/platform", "https://user@navigation.example.test/platform", "https://navigation.example.test:444/platform", "https://foreign.example.test/platform", origin, null, {}, " " + origin + "/platform"])
    assert.equal(read(bad), null);
  assert.deepEqual(read(origin + "/platform"), { kind: "screen", screen: "home" });
});

test("raw traversal, encoded separators, control characters and oversized links stay rejected", () => {
  for (const path of ["/platform/../platform/posts/one", "/platform/%2e%2e/platform/posts/one", "/platform/posts/a%2fb", "/platform/posts/a%5cb", "/platform//posts/one", "/platform/posts/%252e%252e", "/platform/posts/one\n", "/platform/posts/one?x=%00", "/platform/posts/one?x=" + "a".repeat(4100)])
    assert.equal(read(origin + path), null, JSON.stringify(path.slice(0, 100)));
});

test("only canonical destination identity survives link intake", () => {
  const target = read(origin + "/platform/feed?post=post_1&comment=comment_2&token=secret&cursor=private&action=delete#private-body");
  assert.deepEqual(target, { kind: "comment", postId: "post_1", commentId: "comment_2" });
  assert.equal(read(origin + "/platform?post=one&post=two"), null);
  assert.equal(read(origin + "/platform/posts/one?comment=a&comment=b"), null);
  assert.equal(read(origin + "/platform/posts/one?post=x&post=y"), null);
});

test("canonical static routes and reserved paths retain their meaning", () => {
  assert.deepEqual(read(origin + "/platform/topics/following"), { kind: "screen", screen: "followedTopics" });
  assert.deepEqual(read(origin + "/platform/profile/me"), { kind: "screen", screen: "profile" });
  assert.deepEqual(read(origin + "/platform/churches/church_1"), { kind: "church", churchId: "church_1" });
  for (const path of ["/platform/topics/new", "/platform/topics/manage", "/platform/unknown", "/platform/invitations/token/private"])
    assert.equal(read(origin + path), null);
});

test("the installed Expo URL implementation preserves the native link boundary", () => {
  // Expo.fx -> winter/runtime.native installs this exact locked implementation.
  // Exercise it as well as Node's URL without claiming a native device run.
  const original = globalThis.URL;
  try {
    globalThis.URL = ExpoURL as unknown as typeof URL;
    const nativeRead = createNativeLinkReader(origin);
    assert.throws(() => createNativeLinkReader(origin + "/"));
    assert.throws(() => createNativeLinkReader("https://user@navigation.example.test"));
    for (const link of [origin + ".evil.test/platform", "https://user@navigation.example.test/platform", origin + "/platform/../platform", origin + "/platform/%2e%2e/platform", origin + "/platform/posts/a%2fb", origin + "/platform?post=a&post=b", origin + "/platform/posts/a?x=%00"])
      assert.equal(nativeRead(link), null);
    assert.deepEqual(nativeRead(origin + "/platform/posts/one?token=private&action=delete"), { kind: "post", postId: "one" });
    assert.deepEqual(nativeRead(origin + "/platform/topics/following"), { kind: "screen", screen: "followedTopics" });
  } finally { globalThis.URL = original; }
});

test("primary tabs preserve website semantics without carrying account data", () => {
  const guest = nativePrimaryNavigation(false), member = nativePrimaryNavigation(true);
  assert.deepEqual(guest.map((tab) => tab.label), ["Home", "Churches", "Explore", "Messages", "Menu"]);
  assert.deepEqual(member.map((tab) => tab.label), ["Home", "My church", "Explore", "Messages", "Menu"]);
  assert.deepEqual(guest[1].destination, { kind: "screen", screen: "churches" });
  assert.deepEqual(member[1].destination, { kind: "screen", screen: "myChurch" });
  assert.equal(member[1].id, guest[1].id);
  assert.deepEqual(Object.keys(member[1]), ["id", "label", "destination"]);
});

test("one layout change rearranges labels and order while stable route identity remains", () => {
  const changed = nativePrimaryNavigation(false, [...defaultNativeTabs].reverse().map((item) => ({ ...item, label: item.id === "menu" ? "More" : undefined })));
  assert.deepEqual(changed.map((tab) => tab.id), ["menu", "messages", "explore", "churches", "home"]);
  assert.equal(changed[0].label, "More");
  assert.deepEqual(changed[0].destination, { kind: "screen", screen: "menu" });
  assert.throws(() => Object.assign(changed[0].destination, { screen: "admin" }));
  assert.deepEqual(nativePrimaryNavigation(false)[0].destination, { kind: "screen", screen: "home" });
  assert.throws(() => nativePrimaryNavigation(false, defaultNativeTabs.slice(1)));
  assert.throws(() => nativePrimaryNavigation(false, defaultNativeTabs.map(() => ({ id: "home" }))));
  assert.throws(() => nativePrimaryNavigation(false, defaultNativeTabs.map((item) => ({ ...item, label: " " }))));
});

test("unimplemented destinations have an explicit fallback and cannot silently enable a feature", () => {
  const post = read(origin + "/platform/posts/one?token=secret")!;
  assert.deepEqual(nativeNavigationSupport(post), { kind: "unavailable", websitePath: "/platform/posts/one" });
  assert.deepEqual(nativeNavigationSupport(post, { screens: ["home"], resources: [] }), { kind: "unavailable", websitePath: "/platform/posts/one" });
  assert.deepEqual(nativeNavigationSupport(post, { screens: [], resources: ["post"] }), { kind: "native", requiresCurrentAccess: true });
  assert.deepEqual(nativeNavigationSupport({ kind: "screen", screen: "home" }, { screens: ["home"], resources: [] }), { kind: "native", requiresCurrentAccess: true });
  assert.deepEqual(nativeNavigationSupport({ kind: "post", postId: "../private" }, { screens: [], resources: ["post"] }), { kind: "invalid" });
  assert.deepEqual(nativeNavigationSupport({ kind: "screen", screen: "unknown" } as AppDestination), { kind: "invalid" });
});
