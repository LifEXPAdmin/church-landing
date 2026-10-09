import type { CommentSnapshot } from "../reading/comment-controller";
import { Button, Card, Text } from "./primitives";
import { authorLabel } from "./post-presentation";

export type CommentAction =
  | { kind: "roots"; sort: "oldest" | "newest" }
  | { kind: "replies"; rootId: string }
  | { kind: "context"; commentId: string }
  | { kind: "next" | "refresh" | "retry" | "close" };
type Props = { state: CommentSnapshot; onAction(expected: CommentSnapshot, action: CommentAction): void };
const messages = {
  unavailable: "Comments could not be checked. Try again when your connection is available.",
  "feature-unavailable": "Comments are currently unavailable in the app.",
  "not-found": "This discussion is unavailable or your access has changed.",
  "refresh-required": "This comment page has changed. Refresh comments to continue.",
  "recovery-required": "Your account needs attention on the website before you can continue.",
  "update-required": "Update the app before reading these comments.",
  "rate-limited": "Please wait before trying again."
};
const prayerLabels: Record<string, string> = {
  REQUESTING: "Still requesting prayer", UPDATE: "An update", PRAISE: "Praise report", RESOLVED: "Follow-up complete"
};

/** A replaceable semantic leaf. Its owner subscribes to the controller and
 * supplies guarded actions. Every handler carries its exact rendered snapshot. */
export function NativeCommentThread({ state, onAction }: Props) {
  if (state.phase === "concealed" || state.postId === null) return null;
  const act = (action: CommentAction) => onAction(state, action);
  if (state.phase === "idle") return <Button label="Read comments" secondary onPress={() => act({ kind: "roots", sort: "oldest" })} />;
  if (state.phase === "loading") return <Card>
    <Text accessibilityLiveRegion="polite">Checking current access and loading comments...</Text>
    <Button label="Hide comments" secondary onPress={() => act({ kind: "close" })} />
  </Card>;
  if (state.phase === "error") return <Card>
    <Text accessibilityLiveRegion="polite">{messages[state.problem]}</Text>
    {state.problem === "rate-limited" && state.retryAfterSeconds !== null ?
      <Text variant="small" tone="muted">The server requested a pause of {state.retryAfterSeconds} seconds.</Text> : null}
    {state.problem === "refresh-required" ? <Button label="Refresh comments" onPress={() => act({ kind: "refresh" })} /> :
      ["unavailable", "rate-limited"].includes(state.problem) ? <Button label="Try reading comments again" onPress={() => act({ kind: "retry" })} /> : null}
    {state.query.view !== "roots" ? <Button label="Back to comments" secondary onPress={() => act({ kind: "roots", sort: "oldest" })} /> : null}
    <Button label="Hide comments" secondary onPress={() => act({ kind: "close" })} />
  </Card>;
  const thread = state.thread;
  type Row = typeof thread.items[number];
  function comment(row: Row, heading?: string) {
    return <Card key={row.id}>
      {heading ? <Text variant="subheading">{heading}</Text> : null}
      {!row.available ? <Text>Comment unavailable.</Text> : row.requiresWeb ? <Text>Read this comment on the website.</Text> : <>
        <Text variant="subheading">{authorLabel(row.author)}</Text>
        <Text variant="small" tone="muted">{new Date(row.createdAt).toLocaleString()}{row.editedAt ? " · Edited" : ""}{row.isPostAuthor ? " · Post author" : ""}</Text>
        {row.replyTo ? <Text variant="small" tone="muted">Replying to {row.replyTo.name ?? "an unavailable comment"}</Text> : null}
        {row.prayerUpdateKind ? <Text variant="small">{prayerLabels[row.prayerUpdateKind] ?? "Prayer update"}</Text> : null}
        <Text variant="reader">{row.content}</Text>
        {row.mentions.length ? <Text variant="small">Mentions: {row.mentions.map(person => person.name).join(", ")}</Text> : null}
        <Text variant="small" tone="muted">{row.likeCount === null ? "Like count hidden" : `${row.likeCount} ${row.likeCount === 1 ? "like" : "likes"}`}{row.ownReaction?.liked ? " · You liked this comment" : ""}</Text>
      </>}
      {row.rootId === null && row.replyCount > 0 ? <Button label={`Read ${row.replyCount} ${row.replyCount === 1 ? "reply" : "replies"}`}
        hint="Open replies to this comment" secondary onPress={() => act({ kind: "replies", rootId: row.id })} /> : null}
    </Card>;
  }
  const primaryIds = new Set([thread.root?.id, thread.target?.id, thread.pinned?.id]);
  const pinnedSeparate = thread.pinned && thread.pinned.id !== thread.root?.id && thread.pinned.id !== thread.target?.id;
  return <Card>
    <Text variant="heading">{state.query.view === "roots" ? "Comments" : state.query.view === "replies" ? "Replies" : "Comment in context"}</Text>
    {thread.discussionClosed ? <Text variant="small" tone="muted">Discussion closed.</Text> : null}
    {thread.conversation.mode === "FOLLOW" ? <Text variant="small" tone="muted">You follow this conversation.</Text> :
      thread.conversation.mode === "MUTE" ? <Text variant="small" tone="muted">You muted this conversation.</Text> : null}
    {state.query.view === "roots" ? <>
      <Button label="Oldest comments first" secondary selected={state.query.sort === "oldest"}
        onPress={() => act({ kind: "roots", sort: "oldest" })} />
      <Button label="Newest comments first" secondary selected={state.query.sort === "newest"}
        onPress={() => act({ kind: "roots", sort: "newest" })} />
    </> : <Button label="Back to comments" secondary onPress={() => act({ kind: "roots", sort: "oldest" })} />}
    {pinnedSeparate && thread.pinned ? <>
      {comment(thread.pinned, "Pinned comment")}
      <Button label="Read pinned comment in context" secondary onPress={() => act({ kind: "context", commentId: thread.pinned!.id })} />
    </> : null}
    {thread.root ? comment(thread.root, thread.target?.id === thread.root.id ? "Selected comment" : "Parent comment") : null}
    {thread.target && thread.target.id !== thread.root?.id ? comment(thread.target, "Selected comment") : null}
    {thread.items.filter(row => !primaryIds.has(row.id)).map(row => comment(row))}
    {thread.items.length === 0 ? <Text>{state.query.view === "roots" ? "No comments are available on this page." : "No replies are available on this page."}</Text> : null}
    {thread.nextCursor ? <Button label="Next comment page" onPress={() => act({ kind: "next" })} /> :
      <Text variant="small" tone="muted">End of this comment page.</Text>}
    <Button label="Refresh comments" secondary onPress={() => act({ kind: "refresh" })} />
    <Button label="Hide comments" secondary onPress={() => act({ kind: "close" })} />
    <Text variant="small" tone="muted">Writing, reactions and conversation settings are available on the website.</Text>
  </Card>;
}
