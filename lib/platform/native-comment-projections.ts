import type { ApiComment } from "./api-contracts";
import type { readComments } from "./comment-reads";

type Thread = Extract<
  Awaited<ReturnType<typeof readComments>>,
  { kind: "thread" }
>;
type Comment = Thread["items"][number];

function nativeComment(row: Comment, viewerId: string | null): ApiComment {
  const structure = {
    id: row.id,
    rootId: row.rootId,
    parentId: row.parentId,
    createdAt: row.createdAt.toISOString(),
    replyCount: row.replyCount
  };
  if (row.unavailable) return { ...structure, available: false };
  if (!row.author || row.content === null || row.version === null)
    throw new Error("Native comment projection unavailable");
  // Legacy SQL text has no length constraint. Never shorten permitted text or
  // lose the rest of a bounded page because one old comment needs the website.
  if (row.content.length > 1500)
    return { ...structure, available: true, requiresWeb: true };
  return {
    ...structure,
    available: true,
    requiresWeb: false,
    content: row.content,
    author: row.author.churchId
      ? { kind: "church", id: row.author.churchId, name: row.author.name }
      : {
          kind: "person",
          identity: {
            id: row.author.id,
            name: row.author.name,
            username: row.author.username!
          }
        },
    version: row.version,
    editedAt: row.editedAt?.toISOString() ?? null,
    prayerUpdateKind: row.prayerUpdateKind,
    isPostAuthor: row.isPostAuthor,
    replyTo: row.replyTo
      ? { id: row.replyTo.id, name: row.replyTo.name }
      : null,
    mentions: row.mentions.map((person) => ({
      id: person.id,
      name: person.name,
      username: person.username
    })),
    likeCount: row.likeCount,
    ownReaction: viewerId
      ? { liked: row.liked, version: row.likeVersion }
      : null,
    canReply: row.canReply,
    canEdit: row.canEdit,
    canDelete: row.canDelete
  };
}

/** Explicit allowlist over the canonical, currently authorized thread view. */
export function nativeCommentThread(view: Thread, nextCursor: string | null) {
  const comment = (row: Comment | null) =>
    row ? nativeComment(row, view.viewerId) : null;
  return {
    postId: view.postId,
    sort: view.sort,
    items: view.items.map((row) => nativeComment(row, view.viewerId)),
    nextCursor,
    root: comment(view.root),
    target: comment(view.target),
    pinned: comment(view.pinned),
    pinVersion: view.pinVersion,
    canPin: view.canPin,
    canReply: view.canReply,
    discussionClosed: view.discussionClosed,
    visibleCount: view.visibleCount,
    conversation: {
      mode: view.conversation.mode,
      version: view.conversation.version
    },
    requiresWeb: true
  };
}
