import test from "node:test";
import assert from "node:assert/strict";
import {
  destinationWebPath,
  parseDestinationPath,
  resourceDestination,
  screenWebPath,
  type AppDestination,
  type NavigationId
} from "../packages/shared-core/src/destinations";
import {
  canonicalSharePath,
  destinationHttpsUrl,
  parseDestinationLink
} from "../lib/platform/destination-links";
import { navigationRegistry } from "../lib/platform/navigation-registry";
import { PortalError } from "../lib/platform/portal-policy";

const origin = "https://godschurches.com";
const resources: [AppDestination, string][] = [
  [{ kind: "post", postId: "post_123" }, "/platform/posts/post_123"],
  [
    { kind: "comment", postId: "post_123", commentId: "comment_456" },
    "/platform/posts/post_123?comment=comment_456"
  ],
  [{ kind: "church", churchId: "church_123" }, "/platform/churches/church_123"],
  [
    { kind: "event", occurrenceId: "occurrence_123" },
    "/platform/events/occurrence_123"
  ],
  [{ kind: "profile", username: "member_123" }, "/platform/profile/member_123"],
  [{ kind: "topic", slug: "shared-prayer" }, "/platform/topics/shared-prayer"]
];

test("semantic resource identities round-trip through canonical paths and trusted HTTPS links", () => {
  for (const [destination, path] of resources) {
    assert.equal(destinationWebPath(destination), path);
    assert.deepEqual(parseDestinationPath(path), destination);
    assert.equal(destinationHttpsUrl(destination, origin), origin + path);
    assert.deepEqual(parseDestinationLink(origin + path, origin), destination);
    assert.deepEqual(parseDestinationLink(path, origin), destination);
  }
  assert.deepEqual(
    parseDestinationPath("/platform?post=post_123"),
    resources[0][0]
  );
  assert.deepEqual(
    parseDestinationPath("/platform/feed?post=post_123&comment=comment_456"),
    resources[1][0]
  );
  assert.deepEqual(
    parseDestinationPath("/platform/posts/%70ost_123"),
    resources[0][0]
  );
});

test("all existing navigation paths keep their screen identity, including static route precedence", () => {
  for (const id of Object.keys(navigationRegistry) as NavigationId[]) {
    const href = navigationRegistry[id].href;
    assert.equal(screenWebPath(id), href);
    assert.deepEqual(parseDestinationPath(href), {
      kind: "screen",
      screen: id === "editProfile" ? "profile" : id
    });
    assert.equal(destinationWebPath({ kind: "screen", screen: id }), href);
  }
  assert.deepEqual(parseDestinationPath("/platform/invitations"), {
    kind: "screen",
    screen: "invitations"
  });
  assert.deepEqual(parseDestinationPath("/platform/topics/following"), {
    kind: "screen",
    screen: "followedTopics"
  });
});

test("legacy sharing keeps identifier normalization, paths and validation errors", () => {
  for (const [destination, path] of resources) {
    assert.notEqual(destination.kind, "screen");
    const id =
      "postId" in destination
        ? destination.postId
        : "churchId" in destination
          ? destination.churchId
          : "occurrenceId" in destination
            ? destination.occurrenceId
            : "username" in destination
              ? destination.username
              : "slug" in destination
                ? destination.slug
                : "";
    assert.equal(
      canonicalSharePath(
        destination.kind,
        ` ${id} `,
        "commentId" in destination ? destination.commentId : undefined
      ),
      path
    );
  }
  for (const [args, message] of [
    [["fundraisingCampaign", "id"], "Choose a supported sharing destination."],
    [["topic", "NOT-a-topic"], "Choose a valid topic address."],
    [["topic", "ab"], "Choose a valid topic address."],
    [["post", "../other"], "Use a valid post or church reference."],
    [["comment", "post_1", "bad/id"], "Use a valid post or church reference."]
  ] as const) {
    assert.throws(
      () =>
        canonicalSharePath(
          args[0],
          args[1],
          args.length === 3 ? args[2] : undefined
        ),
      (error: unknown) =>
        error instanceof PortalError &&
        error.status === 400 &&
        error.message === message
    );
  }
});

test("malformed, ambiguous, external, traversal and account-entry paths cannot become app destinations", () => {
  const invalid = [
    null,
    12,
    {},
    "",
    "/",
    "platform/posts/post_1",
    "//evil.invalid/platform",
    "/\\evil.invalid/platform",
    "/platform//posts/post_1",
    "/platform/posts/../settings",
    "/platform/posts/%2E%2E/settings",
    "/platform/posts/%252e%252e",
    "/platform/posts/a%2fb",
    "/platform/posts/a%5cb",
    "/platform/posts/%00",
    "/platform/posts/%",
    "/platform/posts/%ef%bf%bd",
    "/platform/posts/a%3fb",
    "/platform/posts/a%23b",
    "/platform/posts/post_1\n",
    "/platform/posts/post_1?comment=a&comment=b",
    "/platform/posts/post_1?%63omment=a&comment=b",
    "/platform?post=a&post=b",
    "/platform/posts/post_1?comment=",
    "/platform/posts/post_1?comment=%2fadmin",
    "/platform/posts/post_1?unknown=%",
    "/platform/posts/post_1?unknown=%0a",
    "/platform/share?qr=1&qr=0",
    "/platform/share?qr=0",
    "/account?returnTo=/platform",
    "/platform/account",
    "/platform/sign-in",
    "/platform/posts/" + "a".repeat(101),
    "/" + "a".repeat(2048)
  ];
  for (const input of invalid)
    assert.equal(parseDestinationPath(input), null, String(input));
  for (const input of [
    "https://evil.invalid/platform",
    "https://godschurches.com.evil.invalid/platform",
    "http://godschurches.com/platform",
    "https://user:password@godschurches.com/platform",
    "https://godschurches.com:8443/platform",
    "https://godschurches.com/platform/posts/../settings",
    "https://godschurches.com/platform/posts/%2e%2e/settings",
    "https://godschurches.com\\@evil.invalid/platform",
    "https://godschurches.com\n/platform",
    "javascript:alert(1)",
    "godschurches://platform/posts/post_1"
  ])
    assert.equal(parseDestinationLink(input, origin), null, input);
  for (const untrustedOrigin of [
    "http://godschurches.com",
    "https://user@godschurches.com",
    origin + "/platform",
    origin + "?host=evil",
    ""
  ])
    assert.equal(parseDestinationLink("/platform", untrustedOrigin), null);
});

test("incoming links retain only destination identity and never replay actions or grant private access", () => {
  const incoming = parseDestinationLink(
    origin +
      "/platform/posts/post_123?publish=1&token=secret&cursor=private&next=https%3A%2F%2Fevil.invalid&role=admin#secret",
    origin
  );
  assert.deepEqual(incoming, { kind: "post", postId: "post_123" });
  assert.deepEqual(
    parseDestinationPath(
      "/platform/settings?save=1&returnTo=https://evil.invalid"
    ),
    { kind: "screen", screen: "settings" }
  );
  assert.deepEqual(
    parseDestinationPath("/platform/profile/member_123?public=true"),
    { kind: "profile", username: "member_123" }
  );
  assert.equal("available" in incoming!, false);
  assert.equal("canRead" in incoming!, false);
  assert.equal("canShare" in incoming!, false);
});

test("unknown or reserved resources cannot activate a destination and source-projected routes stay authoritative", () => {
  for (const kind of [
    "fundraisingCampaign",
    "family",
    "exchangeListing",
    "mediaCatalogItem",
    "__proto__",
    "constructor",
    "toString",
    "POST",
    null,
    { kind: "post" }
  ])
    assert.equal(resourceDestination(kind, "id_1"), null);
  for (const path of [
    "/platform/fundraisers/id_1",
    "/platform/businesses/id_1",
    "/platform/exchange/id_1",
    "/platform/exchange/help/id_1",
    "/platform/invite/server_token"
  ])
    assert.equal(parseDestinationPath(path), null);
  for (const id of [null, {}, "", "../other", " has-space ", "a".repeat(101)])
    assert.equal(resourceDestination("post", id), null);
  assert.equal(
    destinationWebPath({
      kind: "screen",
      screen: "constructor"
    } as unknown as AppDestination),
    null
  );
  assert.equal(
    destinationWebPath({ kind: "post", postId: "../settings" }),
    null
  );
});

test("topic creation and reserved management addresses cannot masquerade as topic identities", () => {
  for (const path of [
    "/platform/topics/new",
    "/platform/topics/%6eew",
    "/platform/topics/manage",
    "/platform/topics/%6danage"
  ])
    assert.equal(parseDestinationPath(path), null, path);
  // Existing public-share syntax validation remains unchanged; service checks own existence.
  assert.equal(canonicalSharePath("topic", "new"), "/platform/topics/new");
  assert.deepEqual(parseDestinationPath("/platform/topics/following"), {
    kind: "screen",
    screen: "followedTopics"
  });
});
