import test from "node:test";
import assert from "node:assert/strict";
import {
  churchReturnContext,
  churchReturnHref,
  churchReturnQuery
} from "../lib/platform/church-return-context";

test("contact and assignment returns stay within the originating church and retain the chosen role instance", () => {
  for (const from of [
    "chart",
    "outline",
    "directory",
    "responsibilities",
    "person"
  ] as const) {
    const context = churchReturnContext(from, "specific-role_123")!;
    const href = churchReturnHref("church-one", context);
    assert.ok(href.startsWith("/platform/churches/church-one/"));
    assert.ok(href.includes("specific-role_123"));
    assert.equal(
      new URLSearchParams(churchReturnQuery(context)).get("from"),
      from
    );
  }
  assert.equal(
    churchReturnHref("church-one", { from: "outline", focus: "position-two" }),
    "/platform/churches/church-one/structure?focus=position-two&mode=outline"
  );
});

test("external destinations, traversal, arrays, encoded delimiters and oversized identifiers are not return contexts", () => {
  for (const from of [
    undefined,
    ["chart"],
    "https://elsewhere.test",
    "//elsewhere.test",
    "../../settings",
    "access"
  ])
    assert.equal(churchReturnContext(from, "position"), undefined);
  for (const focus of [
    undefined,
    ["position"],
    "../other-church",
    "%2fprivate",
    "a?next=https://elsewhere.test",
    "a#fragment",
    "a".repeat(101)
  ])
    assert.equal(churchReturnContext("chart", focus), undefined);
});

test("contact refresh invalidates withdrawn identities and authority without losing an uncertain assignment retry on version changes", async () => {
  const { churchContactPrivacy } =
    await import("../lib/platform/church-contact-privacy");
  const snapshot = {
    church: { id: "church" },
    viewer: { id: "viewer" },
    ownConnectionId: "viewer-connection",
    version: 1,
    capabilities: ["MANAGE_STRUCTURE"],
    candidates: [{ id: "member", name: "Chosen church name" }],
    positions: [{ id: "position", assignments: [] }]
  } as unknown as import("../lib/platform/church-structure-types").StructureSnapshot;
  const original = churchContactPrivacy(snapshot);
  const assigned = structuredClone(snapshot);
  assigned.version = 2;
  assigned.positions[0].assignments.push({
    id: "new-assignment",
    connectionId: "member",
    name: "Chosen church name",
    isSelf: false
  });
  assert.deepEqual(churchContactPrivacy(assigned), original);
  assigned.capabilities = [];
  assert.notDeepEqual(churchContactPrivacy(assigned), original);
  const withdrawn = structuredClone(snapshot);
  withdrawn.candidates = [];
  assert.notDeepEqual(churchContactPrivacy(withdrawn), original);
  const renamed = structuredClone(snapshot);
  renamed.candidates![0].name = "New chosen name";
  assert.notDeepEqual(churchContactPrivacy(renamed), original);
});
