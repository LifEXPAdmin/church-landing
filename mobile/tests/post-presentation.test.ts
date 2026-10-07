import assert from "node:assert/strict";
import test from "node:test";
import { examplePost } from "../../lib/platform/api-contract-examples.ts";
import { authorLabel, postBodyPresentation, postMeta, postParts } from "../src/ui/post-presentation.ts";

test("a content note conceals body extras and text until the current detail is revealed", () => {
  const post = { ...examplePost, body: { ...examplePost.body, text: "Private body", contentNote: "A difficult topic",
    safeExcerpt: "Author's safe preview", scripture: "Private scripture", linkUrl: "javascript:private",
    linkTitle: "Private title", linkDescription: "Private description" } };
  for (const [detail, revealed] of [[false, false], [false, true], [true, false]]) {
    const view = postBodyPresentation(post, detail, revealed);
    assert.equal(view.text, "Author's safe preview"); assert.equal(view.full, false);
    assert.equal(view.link, null); assert.equal(view.scripture, null);
    assert.equal(JSON.stringify(view).includes("Private"), false);
  }
  const full = postBodyPresentation(post, true, true);
  assert.equal(full.text, "Private body"); assert.equal(full.scripture, "Private scripture");
  assert.equal(full.link?.url, "javascript:private", "A link remains inert text, never an automatic navigation target");
});

test("missing safe excerpts do not expose noted text; unnoted detail retains the author's body", () => {
  const post = { ...examplePost, body: { ...examplePost.body, text: "Body", contentNote: "Note", safeExcerpt: null } };
  assert.equal(postBodyPresentation(post, true, false).text, "Open this post when you’re ready to read more.");
  const plain = { ...post, body: { ...post.body, contentNote: null, safeExcerpt: "Preview" } };
  assert.equal(postBodyPresentation(plain, false, false).text, "Preview");
  assert.equal(postBodyPresentation(plain, true, false).text, "Body");
});

test("plain reposts display only the current original projection and never resurrect a missing source", () => {
  const source = { ...examplePost, id: "original", body: { ...examplePost.body, text: "Current source" } };
  const post = { ...examplePost, body: { ...examplePost.body, text: "Obsolete wrapper" },
    repost: { kind: "PLAIN" as const, source } };
  assert.equal(postParts(post).primary, source); assert.equal(postParts(post).quoted, null);
  const missing = postParts({ ...post, repost: { kind: "PLAIN", source: null } });
  assert.equal(missing.primary, null); assert.equal(missing.missingSource, true);
});

test("quotes keep commentary and source separate, including an unavailable original", () => {
  const source = { ...examplePost, id: "original", body: { ...examplePost.body, text: "Hidden quoted text", contentNote: "Quote note", safeExcerpt: null } };
  const post = { ...examplePost, body: { ...examplePost.body, contentNote: null }, repost: { kind: "QUOTE" as const, source } };
  const parts = postParts(post);
  assert.equal(parts.primary, post); assert.equal(parts.quoted, source);
  assert.notEqual(postBodyPresentation(parts.quoted!, false, true).text, "Hidden quoted text");
  assert.equal(postParts({ ...post, repost: { kind: "QUOTE", source: null } }).primary?.body, post.body);
});

test("a quote wrapper's content note also conceals its quoted preview until explicit detail reveal", () => {
  const post = { ...examplePost, body: { ...examplePost.body, contentNote: "Wrapper note" },
    repost: { kind: "QUOTE" as const, source: { ...examplePost, id: "quoted-original" } } };
  assert.equal(postParts(post, true, false).quoted, null);
  assert.equal(postParts(post, false, true).quoted, null);
  assert.equal(postParts(post, true, true).quoted?.id, "quoted-original");
});

test("hidden counts, church identity, audience and discussion status retain their distinct meanings", () => {
  const church = { ...examplePost, author: { kind: "church" as const, id: "church", name: "Fictional Church" },
    audience: "GROUP" as const, likeCount: null, commentCount: 0, canReply: false, discussionClosed: true };
  assert.equal(authorLabel(church.author), "Fictional Church");
  assert.deepEqual(postMeta(church), { audience: "Group", type: "Prayer", likes: "Like count hidden", comments: "0 comments", discussion: "Discussion closed" });
  assert.equal(postMeta({ ...church, likeCount: 0 }).likes, "0 likes");
  assert.equal(postMeta({ ...church, likeCount: 1 }).likes, "1 like");
  assert.equal(postMeta({ ...church, discussionClosed: false }).discussion, "Replies unavailable");
});
