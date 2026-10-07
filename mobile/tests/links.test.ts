import test from "node:test";
import assert from "node:assert/strict";
import { fixturePostFromLink } from "../src/spike/links.ts";
test("only exact credential-free fixture links enter the spike", () => {
  assert.equal(fixturePostFromLink("godschurches-dev://spike/post/fixture-welcome"), "fixture-welcome");
  assert.equal(fixturePostFromLink("godschurches-staging://spike/post/fixture-prayer"), "fixture-prayer");
  for (const url of [
    "https://godschurches.com/platform/posts/fixture-welcome",
    "godschurches-dev://spike/post/fixture-welcome?token=example",
    "godschurches-dev://spike/post/fixture-welcome#fragment",
    "godschurches-dev://spike/post/%66ixture-welcome",
    "godschurches-dev://attacker@spike/post/fixture-welcome",
    "godschurches-prod://spike/post/fixture-welcome"
  ]) assert.equal(fixturePostFromLink(url), null);
});
