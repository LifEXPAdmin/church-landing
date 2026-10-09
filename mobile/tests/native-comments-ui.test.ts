import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { RequestClientError, type ApiComment, type ApiResponse } from "@godschurches/shared-core";
import { apiResponseExamples, examplePost } from "../../lib/platform/api-contract-examples.ts";
import { createNativeCommentController, type CommentSnapshot, type NativeCommentReadPort } from "../src/reading/comment-controller.ts";
import type { ReadingSnapshot } from "../src/reading/read-controller.ts";
import type { SessionSnapshot } from "../src/session/session-controller.ts";
import { authorLabel } from "../src/ui/post-presentation.ts";
import type { CommentAction } from "../src/ui/NativeCommentThread.tsx";

type Element = { type: unknown; props: Record<string, unknown> };
type Button = { label: string; selected?: boolean; hint?: string; onPress(): void };
type Props = { state: CommentSnapshot; onAction(expected: CommentSnapshot, action: CommentAction): void };
const jsx = (type: unknown, props: Element["props"]): Element => ({ type, props });
const modules: Record<string, unknown> = {
  "react/jsx-runtime": { jsx, jsxs: jsx, Fragment: "Fragment" },
  "./primitives": { Button: "Button", Card: "Card", Text: "Text" },
  "./post-presentation": { authorLabel }
};
const code = ts.transpileModule(readFileSync(new URL("../src/ui/NativeCommentThread.tsx", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 }
}).outputText;
const output: { NativeCommentThread?: (props: Props) => Element | null } = {};
runInNewContext(code, { exports: output, require(name: string) {
  assert.ok(Object.hasOwn(modules, name), "Unexpected comment presentation dependency: " + name); return modules[name];
} }, { timeout: 1000 });
assert.equal(typeof output.NativeCommentThread, "function");
function elements(value: unknown): Element[] {
  if (Array.isArray(value)) return Array.from(value).flatMap(elements);
  if (!value || typeof value !== "object") return [];
  const element = value as Element;
  return [element, ...elements(element.props?.children)];
}
function text(value: unknown): string {
  if (Array.isArray(value)) return Array.from(value).map(text).join("");
  if (typeof value === "string" || typeof value === "number") return String(value);
  return value && typeof value === "object" ? text((value as Element).props?.children) : "";
}
const basic = { rootId: null, parentId: null, createdAt: "2026-10-07T00:00:00.000Z", replyCount: 0 };
const hidden: ApiComment = { ...basic, id: "hidden-parent", available: false, replyCount: 2 };
const legacy: ApiComment = { ...basic, id: "legacy", available: true, requiresWeb: true, replyCount: 1 };
const full: ApiComment = { ...basic, id: "visible-root", available: true, requiresWeb: false,
  content: "F".repeat(1500), author: { kind: "church", id: "fictional-church", name: "Fictional Church" }, version: 1,
  editedAt: "2026-10-07T01:00:00.000Z", prayerUpdateKind: "PRAISE", isPostAuthor: true,
  replyTo: { id: "unavailable-reply-parent", name: null }, mentions: [{ id: "fictional-mention", name: "Fictional Mention", username: "fictional_mention" }],
  likeCount: null, ownReaction: { liked: true, version: 1 }, canReply: true, canEdit: true, canDelete: true };
const empty: ApiComment = { ...full, id: "empty", content: "", likeCount: 12, ownReaction: null, mentions: [], replyTo: null, prayerUpdateKind: "UNKNOWN_FUTURE_KIND" };

/** Real leaf handlers and the actual comment controller, with fictional read
 * ports. Descriptors do not prove native layout, screen readers or runtime wiring. */
function subject(t: { after(cleanup: () => void): void }) {
  let session: SessionSnapshot = { generation: 1, foreground: true, phase: "ready", account: { id: "fictional-member", name: "Fictional Member", username: "fictional_member" }, problem: null, cleanup: null, revocation: "none" };
  let detail: ReadingSnapshot = { kind: "post", post: examplePost, revealed: false };
  const accounts = new Set<() => void>(), readings = new Set<() => void>();
  const calls: Array<Parameters<NativeCommentReadPort["comments"]>[2]> = [], pending: Promise<void>[] = [];
  let issue: Error | null = null;
  const comments = createNativeCommentController({ getSnapshot: () => session,
    subscribe(listener) { accounts.add(listener); return () => { accounts.delete(listener); }; },
    async reportReadRejection() { throw Error("Unexpected session rejection"); }
  }, { getSnapshot: () => detail, subscribe(listener) { readings.add(listener); return () => { readings.delete(listener); }; } }, {
    async capabilities() { return { apiVersion: "1", viewerId: "fictional-member", data: { supportedVersions: ["1"], features: [{ name: "comments.read", available: true }] } }; },
    async comments(_owner, id, query): Promise<ApiResponse<"comments">> {
      calls.push(query); if (issue) throw issue;
      const root = query.rootId === hidden.id ? hidden : full;
      return { apiVersion: "1", viewerId: "fictional-member", data: { ...apiResponseExamples.comments.data,
        postId: id, sort: query.sort, discussionClosed: true, conversation: { mode: "MUTE", version: 3 },
        items: query.view === "roots" ? query.cursor ? [empty] : [hidden, legacy, full, empty] : [{ ...empty, rootId: root.id, parentId: root.id }],
        nextCursor: query.cursor ? null : "fictional-bound-cursor",
        pinned: full,
        root: query.view === "roots" ? null : root,
        target: query.view === "context" ? full : null
      } };
    }
  });
  t.after(comments.dispose);
  function onAction(expected: CommentSnapshot, action: CommentAction) {
    const work = action.kind === "roots" ? comments.openRoots(expected, action.sort) :
      action.kind === "replies" ? comments.openReplies(expected, action.rootId) :
      action.kind === "context" ? comments.openContext(expected, action.commentId) :
      action.kind === "next" ? comments.nextPage(expected) :
      action.kind === "refresh" ? comments.refresh(expected) :
      action.kind === "retry" ? comments.retry(expected) : Promise.resolve(comments.close(expected));
    pending.push(work);
  }
  function render() {
    const state = comments.getSnapshot(), before = calls.length;
    const tree = output.NativeCommentThread!({ state, onAction });
    assert.equal(comments.getSnapshot(), state); assert.equal(calls.length, before, "Rendering never reads");
    return { tree, elements: elements(tree), buttons: elements(tree).filter(x => x.type === "Button").map(x => x.props as unknown as Button), text: text(tree) };
  }
  return { comments, calls, render, fail(error: Error | null) { issue = error; },
    async settle() { await Promise.all(pending.splice(0)); },
    async press(label: string) { const button = render().buttons.find(x => x.label === label); assert.ok(button, "Missing control: " + label); button.onPress(); await Promise.all(pending.splice(0)); },
    conceal() { session = { ...session, foreground: false, phase: "concealed", account: null, generation: 2 }; for (const listener of accounts) listener(); },
    replaceDetail() { detail = { kind: "post", post: { ...examplePost }, revealed: false }; for (const listener of readings) listener(); }
  };
}

test("Read comments is inert until pressed and uses shared semantic controls without clipping member text", async t => {
  const s = subject(t); assert.equal(s.calls.length, 0);
  assert.deepEqual(s.render().buttons.map(x => x.label), ["Read comments"]);
  await s.press("Read comments"); const rendered = s.render();
  assert.equal(s.calls.length, 1); assert.equal(rendered.text.includes("F".repeat(1500)), true);
  assert.equal(rendered.text.split("F".repeat(1500)).length - 1, 1, "Pinned duplicate is displayed once");
  assert.equal(rendered.elements.filter(x => x.type === "Text").some(x => "numberOfLines" in x.props || "maxFontSizeMultiplier" in x.props), false);
  assert.equal(rendered.elements.some(x => x.type === "Text" && x.props.variant === "reader" && x.props.children === ""), true);
  for (const expected of ["Fictional Church", "Comment unavailable.", "Read this comment on the website.", "Like count hidden", "12 likes", "You liked this comment", "Replying to an unavailable comment", "Mentions: Fictional Mention", "Praise report", "Prayer update", "Post author", "Edited", "Discussion closed.", "You muted this conversation."])
    assert.equal(rendered.text.includes(expected), true, expected);
  assert.equal(rendered.buttons.some(x => ["Reply", "Like", "Unlike", "Edit", "Delete", "Pin"].includes(x.label)), false);
});

test("root sorting, one next page and refresh dispatch their exact bounded selections", async t => {
  const s = subject(t); await s.press("Read comments");
  assert.deepEqual(s.render().buttons.filter(x => x.selected).map(x => x.label), ["Oldest comments first"]);
  await s.press("Newest comments first");
  assert.deepEqual(s.render().buttons.filter(x => x.selected).map(x => x.label), ["Newest comments first"]);
  assert.equal(s.calls.at(-1)!.sort, "newest"); assert.equal(s.calls.at(-1)!.cursor, null);
  await s.press("Next comment page"); assert.equal(s.calls.at(-1)!.cursor, "fictional-bound-cursor");
  assert.equal(s.render().text.includes("Comment unavailable."), false);
  await s.press("Refresh comments"); assert.equal(s.calls.at(-1)!.cursor, null); assert.equal(s.calls.at(-1)!.sort, "newest");
});

test("neutral parent reply controls and pinned context use distinct queries and retain permitted siblings", async t => {
  const s = subject(t); await s.press("Read comments");
  await s.press("Read 2 replies"); assert.equal(s.calls.at(-1)!.rootId, hidden.id); assert.equal(s.calls.at(-1)!.view, "replies");
  const replies = s.render(); assert.equal(replies.text.includes("Parent comment"), true); assert.equal(replies.text.includes("Comment unavailable."), true);
  assert.equal(replies.text.includes("12 likes"), true);
  await s.press("Back to comments"); await s.press("Read pinned comment in context");
  assert.equal(s.calls.at(-1)!.view, "context"); assert.equal(s.calls.at(-1)!.commentId, full.id);
  assert.equal(s.render().text.includes("Selected comment"), true);
  assert.equal(s.render().text.split("F".repeat(1500)).length - 1, 1);
});

test("old leaf handlers cannot read another detail and concealment renders no content or controls", async t => {
  const s = subject(t); await s.press("Read comments");
  const old = s.render().buttons.find(x => x.label === "Next comment page")!;
  s.replaceDetail(); old.onPress(); await s.settle(); assert.equal(s.calls.length, 1);
  assert.deepEqual(s.render().buttons.map(x => x.label), ["Read comments"]);
  await s.press("Read comments"); s.conceal(); old.onPress(); await s.settle();
  assert.equal(s.render().tree, null); assert.equal(s.calls.length, 2);
});

test("generic errors have explicit recovery, no stale rows, and a live region", async t => {
  const s = subject(t); await s.press("Read comments");
  s.fail(new RequestClientError(409, "private server text", undefined, false, "cursor_invalid", true, true));
  await s.press("Next comment page");
  const failed = s.render(); assert.equal(failed.text.includes("private server"), false); assert.equal(failed.text.includes("Fictional Church"), false);
  assert.equal(failed.elements.some(x => x.type === "Text" && x.props.accessibilityLiveRegion === "polite"), true);
  assert.equal(failed.buttons.some(x => x.label === "Try reading comments again"), false);
  s.fail(null); await s.press("Refresh comments"); assert.equal(s.calls.at(-1)!.cursor, null);
  s.fail(new RequestClientError(429, "private rate detail", 30, false, "rate_limited", true, true));
  await s.press("Refresh comments"); assert.equal(s.render().text.includes("pause of 30 seconds"), true);
  s.fail(null); await s.press("Try reading comments again"); assert.equal(s.comments.getSnapshot().phase, "ready");
  await s.press("Hide comments"); assert.deepEqual(s.render().buttons.map(x => x.label), ["Read comments"]);
});

test("loading and empty pages explain their state and allow safe closure", () => {
  const query = { view: "roots", sort: "oldest", rootId: null, commentId: null, cursor: null } as const;
  const actions: CommentAction[] = [];
  const loading: CommentSnapshot = { phase: "loading", postId: examplePost.id, query };
  const tree = output.NativeCommentThread!({ state: loading, onAction(expected, action) { assert.equal(expected, loading); actions.push(action); } });
  assert.equal(text(tree).includes("Checking current access"), true);
  const buttons = elements(tree).filter(x => x.type === "Button"); assert.equal(buttons.length, 1);
  (buttons[0].props as unknown as Button).onPress(); assert.equal(actions[0].kind, "close");
  const emptyTree = output.NativeCommentThread!({ state: { phase: "ready", postId: examplePost.id, query,
    thread: { ...apiResponseExamples.comments.data, items: [] } }, onAction() { throw Error("Rendering must not dispatch"); } });
  assert.equal(text(emptyTree).includes("No comments are available on this page."), true);
  assert.equal(text(emptyTree).includes("End of this comment page."), true);
});
