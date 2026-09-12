"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { accountEntryHref } from "@/lib/platform/account-entry";
import {
  socialRequest,
  SocialClientError,
  mergeComments,
  type CommentItem,
  type CommentThreadPage
} from "@/lib/platform/social-client";

import { CommentComposer } from "./comment-composer";
import { CommentActions } from "./comment-actions";
import { useUnsavedSocialWork } from "./use-unsaved-social-work";

export function CommentThread({
  postId,
  commentId
}: {
  postId: string;
  commentId?: string;
}) {
  const [sort, setSort] = useState<"oldest" | "newest">("oldest");
  const [data, setData] = useState<CommentThreadPage | null>(null);
  const [replies, setReplies] = useState<
    Record<string, { items: CommentItem[]; nextCursor: string | null }>
  >({});
  const [context, setContext] = useState<CommentThreadPage | null>(null);
  const [owner, setOwner] = useState<string | null | undefined>(undefined);
  const [hidden, setHidden] = useState(true),
    [pending, setPending] = useState(false),
    [error, setError] = useState("");
  const [reply, setReply] = useState<CommentItem | null>(null);
  const [editing, setEditing] = useState<CommentItem | null>(null);
  const [composerEpoch, setComposerEpoch] = useState(0);
  const [mutation, setMutation] = useState<{
    body: string;
    label: string;
  } | null>(null);
  const [mutating, setMutating] = useState(false);
  const mutationBusy = useRef(false);
  useUnsavedSocialWork(
    { dirty: false, saving: !!mutation, conflict: false },
    () => setError("Resolve the pending comment action before leaving.")
  );
  const sequence = useRef(0),
    busy = useRef(false);
  const load = useCallback(
    async (after?: string, rootId?: string) => {
      if (busy.current) return;
      busy.current = true;
      const seq = ++sequence.current;
      setPending(true);
      setError("");
      if (!after && !rootId) {
        setHidden(true);
        setData(null);
        setReplies({});
        setContext(null);
      }
      try {
        const q = new URLSearchParams({
          postId,
          view: rootId ? "replies" : "roots",
          sort: rootId ? "oldest" : sort,
          ...(after ? { after } : {}),
          ...(rootId ? { rootId } : {})
        });
        const result = await socialRequest<CommentThreadPage>(
          `/api/platform/comments?${q}`,
          undefined,
          after || rootId ? owner : undefined
        );
        if (seq !== sequence.current) return;
        if (owner !== undefined && owner !== result.owner) {
          setReply(null);
          setEditing(null);
          setMutation(null);
        }
        setOwner(result.owner);
        if (rootId)
          setReplies((previous) => ({
            ...previous,
            [rootId]: {
              items: mergeComments(
                after ? (previous[rootId]?.items ?? []) : [],
                result.data.items
              ),
              nextCursor: result.data.nextCursor
            }
          }));
        else
          setData((previous) => ({
            ...result.data,
            items: mergeComments(
              after ? (previous?.items ?? []) : [],
              result.data.items
            )
          }));
        if (commentId && !after && !rootId) {
          try {
            const linked = await socialRequest<CommentThreadPage>(
              `/api/platform/comments?${new URLSearchParams({ postId, view: "context", commentId })}`,
              undefined,
              result.owner
            );
            if (seq !== sequence.current) return;
            setContext(linked.data);
            if (linked.data.root)
              setReplies((previous) => ({
                ...previous,
                [linked.data.root!.id]: {
                  items: mergeComments(
                    linked.data.items,
                    linked.data.target?.rootId ? [linked.data.target] : []
                  ).sort(
                    (a, b) =>
                      a.createdAt.localeCompare(b.createdAt) ||
                      a.id.localeCompare(b.id)
                  ),
                  nextCursor: linked.data.nextCursor
                }
              }));
          } catch {
            if (seq === sequence.current)
              setError(
                "The linked comment is unavailable. You can read the permitted discussion below."
              );
          }
        }
        setHidden(false);
      } catch (e) {
        if (seq === sequence.current) {
          setError(
            e instanceof Error
              ? e.message
              : "The discussion could not be loaded."
          );
          if (!after && !rootId) setData(null);
        }
      } finally {
        if (seq === sequence.current) {
          busy.current = false;
          setPending(false);
        }
      }
    },
    [postId, sort, commentId, owner]
  );
  const loadRef = useRef(load);
  loadRef.current = load;
  useEffect(() => {
    void loadRef.current();
    return () => {
      // This counter invalidates outstanding requests, rather than tracking a DOM node.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      sequence.current++;
      busy.current = false;
    };
  }, [postId, sort, commentId]);
  useEffect(() => {
    const conceal = () => {
      sequence.current++;
      busy.current = false;
      setHidden(true);
      setPending(false);
    };
    const restore = () => {
      if (document.visibilityState !== "hidden") void loadRef.current();
    };
    const visibility = () =>
      document.visibilityState === "hidden" ? conceal() : restore();
    window.addEventListener("blur", conceal);
    window.addEventListener("focus", restore);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      window.removeEventListener("blur", conceal);
      window.removeEventListener("focus", restore);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, []);
  useEffect(() => {
    if (context?.target && !hidden) {
      const element = document.getElementById(`comment-${context.target.id}`);
      element?.focus({ preventScroll: true });
      element?.scrollIntoView({ block: "nearest" });
    }
  }, [context, hidden]);
  async function act(body: string, label: string) {
    if (mutationBusy.current || hidden || !owner) return;
    mutationBusy.current = true;
    setMutating(true);
    setMutation({ body, label });
    try {
      await socialRequest("/api/platform/comments", body, owner);
      setMutation(null);
      await load();
    } catch (e) {
      const status = e instanceof SocialClientError ? e.status : 503;
      if ([400, 401, 403, 404, 409, 429].includes(status)) setMutation(null);
      setError(
        e instanceof Error
          ? e.message
          : "The response was lost. Retry the same action."
      );
    } finally {
      mutationBusy.current = false;
      setMutating(false);
    }
  }
  function item(row: CommentItem, nested = false) {
    return (
      <article
        id={`comment-${row.id}`}
        key={row.id}
        data-comment-id={row.id}
        tabIndex={-1}
        data-linked-comment={row.id === context?.target?.id || undefined}
        className={`${row.id === context?.target?.id ? "ring-2 ring-gc-accent" : ""} min-w-0 space-y-2 rounded-lg border border-gc-divider p-3 ${nested ? "ml-3 border-l-4" : ""}`}
      >
        {row.unavailable ? (
          <p className="text-gc-muted">Comment unavailable</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              {row.author && (
                <Link
                  prefetch={false}
                  className="font-semibold underline"
                  href={
                    row.author.churchId
                      ? `/platform/churches/${row.author.churchId}`
                      : `/platform/profile/${row.author.username}`
                  }
                >
                  {row.author.name}
                </Link>
              )}
              {row.author?.churchId && (
                <span className="text-sm text-gc-muted">Church publisher</span>
              )}
              {row.isPostAuthor && (
                <span className="text-sm text-gc-muted">Post author</span>
              )}
              {row.editedAt && (
                <span className="text-sm text-gc-muted">Edited</span>
              )}
              <time className="text-sm text-gc-muted" dateTime={row.createdAt}>
                {new Date(row.createdAt).toLocaleDateString()}
              </time>
            </div>
            {row.replyTo && (
              <p className="text-sm text-gc-muted">
                Replying to {row.replyTo.name ?? "an unavailable comment"}
              </p>
            )}
            <p className="whitespace-pre-wrap break-words text-[length:var(--gc-reader-size)] leading-relaxed">
              {row.content}
            </p>
            <Link
              prefetch={false}
              className="inline-flex min-h-11 items-center text-sm underline"
              href={row.href}
            >
              Link to comment
            </Link>
            {owner && !row.rootId && data?.canPin && (
              <button
                type="button"
                className="gc-button gc-button-quiet"
                disabled={!!mutation}
                onClick={() =>
                  void act(
                    JSON.stringify({
                      operation: "pin",
                      mutationId: crypto.randomUUID(),
                      postId,
                      commentId: data.pinned?.id === row.id ? null : row.id,
                      expectedVersion: data.pinVersion
                    }),
                    "pin"
                  )
                }
              >
                {data.pinned?.id === row.id
                  ? "Unpin comment"
                  : "Pin helpful comment"}
              </button>
            )}
            {owner && (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="gc-button gc-button-quiet"
                  disabled={!!mutation}
                  onClick={() =>
                    void act(
                      JSON.stringify({
                        operation: "like",
                        mutationId: crypto.randomUUID(),
                        postId,
                        commentId: row.id,
                        desired: !row.liked,
                        expectedVersion: row.likeVersion
                      }),
                      "like"
                    )
                  }
                >
                  {row.liked ? "Unlike" : "Like"} ({row.likeCount})
                </button>
                {row.canReply && (
                  <button
                    type="button"
                    className="gc-button gc-button-quiet"
                    disabled={!!reply}
                    onClick={() => setReply(row)}
                  >
                    Reply
                  </button>
                )}
                {row.canEdit && (
                  <button
                    type="button"
                    className="gc-button gc-button-quiet"
                    disabled={!!editing}
                    onClick={() => setEditing(row)}
                  >
                    Edit
                  </button>
                )}
                {row.canDelete && (
                  <button
                    type="button"
                    className="gc-button gc-button-quiet"
                    disabled={!!mutation}
                    onClick={() => {
                      if (
                        window.confirm(
                          "Delete this comment? Replies may remain beneath an unavailable comment."
                        )
                      )
                        void act(
                          JSON.stringify({
                            operation: "delete",
                            mutationId: crypto.randomUUID(),
                            postId,
                            commentId: row.id,
                            expectedVersion: row.version
                          }),
                          "delete"
                        );
                    }}
                  >
                    Delete
                  </button>
                )}
              </div>
            )}
            {row.mentions.length > 0 && (
              <p className="text-sm">
                Mentions: {row.mentions.map((m) => m.name).join(", ")}
              </p>
            )}
          </>
        )}
        {!nested && row.replyCount > 0 && (
          <div className="space-y-3">
            {replies[row.id]?.items.map((reply) => item(reply, true))}
            {(!replies[row.id] || replies[row.id].nextCursor) && (
              <button
                type="button"
                className="gc-button gc-button-quiet"
                disabled={pending}
                onClick={() =>
                  void load(replies[row.id]?.nextCursor ?? undefined, row.id)
                }
              >
                {replies[row.id]
                  ? "More replies"
                  : `Read replies (${row.replyCount})`}
              </button>
            )}
          </div>
        )}
      </article>
    );
  }
  return (
    <section
      aria-label="Full discussion"
      className="space-y-4"
      data-comment-thread
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl">
          Discussion{data && !hidden ? ` · ${data.visibleCount}` : ""}
        </h2>
        <label>
          Comment order{" "}
          <select
            aria-label="Comment order"
            className="rounded border p-2"
            value={sort}
            disabled={pending}
            onChange={(e) => setSort(e.target.value as typeof sort)}
          >
            <option value="oldest">Oldest</option>
            <option value="newest">Newest</option>
          </select>
        </label>
      </div>
      {error && <p role="status">{error}</p>}
      {!hidden && data && (
        <div className="space-y-2">
          <button
            type="button"
            className="gc-button gc-button-quiet"
            disabled={pending || !!mutation}
            onClick={() => void load()}
          >
            Refresh discussion
          </button>
          {owner && (
            <fieldset className="space-y-2" disabled={!!mutation}>
              <legend>Conversation preference</legend>
              <p className="text-sm text-gc-muted">
                Saved for your account. These controls do not enable email or
                push delivery.
              </p>
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    ["DEFAULT", "Default"],
                    ["FOLLOW", "Follow conversation"],
                    ["MUTE", "Mute conversation"]
                  ] as const
                ).map(([mode, label]) => (
                  <button
                    key={mode}
                    type="button"
                    className="gc-button gc-button-quiet"
                    aria-pressed={data.conversation.mode === mode}
                    onClick={() =>
                      void act(
                        JSON.stringify({
                          operation: "conversation",
                          mutationId: crypto.randomUUID(),
                          postId,
                          mode,
                          expectedVersion: data.conversation.version
                        }),
                        "conversation preference"
                      )
                    }
                  >
                    {label}
                  </button>
                ))}
              </div>
            </fieldset>
          )}
          {data.pinned && (
            <aside
              aria-label="Pinned helpful comment"
              className="space-y-2 rounded border p-3"
            >
              <p className="font-semibold">Pinned helpful comment</p>
              <p>{data.pinned.author?.name}</p>
              <p className="whitespace-pre-wrap break-words text-[length:var(--gc-reader-size)] leading-relaxed">
                {data.pinned.content}
              </p>
              <Link
                prefetch={false}
                className="underline"
                href={data.pinned.href}
              >
                Open pinned comment
              </Link>
              {data.canPin && (
                <button
                  type="button"
                  className="gc-button gc-button-quiet"
                  disabled={!!mutation}
                  onClick={() =>
                    void act(
                      JSON.stringify({
                        operation: "pin",
                        mutationId: crypto.randomUUID(),
                        postId,
                        commentId: null,
                        expectedVersion: data.pinVersion
                      }),
                      "unpin"
                    )
                  }
                >
                  Unpin helpful comment
                </button>
              )}
            </aside>
          )}
        </div>
      )}
      {pending && <p role="status">Loading discussion…</p>}
      {mutation && !hidden && (
        <button
          type="button"
          className="gc-button gc-button-quiet"
          disabled={mutating}
          onClick={() => void act(mutation.body, mutation.label)}
        >
          {mutating ? "Saving comment action…" : `Retry same ${mutation.label}`}
        </button>
      )}
      {owner && (
        <CommentComposer
          key={`${owner}-root-${composerEpoch}`}
          postId={postId}
          owner={owner}
          hidden={hidden}
          unavailable={!data?.canReply}
          onSent={() => {
            setComposerEpoch((n) => n + 1);
            void load();
          }}
        />
      )}
      {owner && reply && (
        <CommentComposer
          key={`${owner}-${reply.id}`}
          postId={postId}
          owner={owner}
          replyToId={reply.id}
          replyName={reply.author?.name}
          hidden={hidden}
          unavailable={!data?.canReply}
          onSent={() => {
            setReply(null);
            void load();
          }}
        />
      )}
      {owner && editing && (
        <CommentActions
          key={`${owner}-${editing.id}`}
          postId={postId}
          owner={owner}
          row={editing}
          hidden={hidden}
          onDone={() => {
            setEditing(null);
            void load();
          }}
        />
      )}
      {hidden || !data ? (
        <button
          type="button"
          disabled={pending}
          className="gc-button gc-button-quiet"
          onClick={() => void load()}
        >
          Reload discussion
        </button>
      ) : (
        <>
          {context?.root && (
            <section aria-label="Linked comment" className="space-y-2">
              <h3 className="font-semibold">Linked comment</h3>
              {item(context.root)}
            </section>
          )}
          {data.items
            .filter((row) => row.id !== context?.root?.id)
            .map((row) => item(row))}
          {!data.items.length && !context && (
            <p>No comments yet. Make room for a thoughtful conversation.</p>
          )}
          {data.nextCursor && (
            <button
              type="button"
              className="gc-button gc-button-quiet"
              disabled={pending}
              onClick={() => void load(data.nextCursor!)}
            >
              More comments
            </button>
          )}
          {!owner && (
            <Link
              className="gc-button gc-button-quiet"
              href={accountEntryHref(
                "join",
                `/platform/posts/${postId}${commentId ? `?comment=${commentId}` : ""}`,
                "comment"
              )}
            >
              Sign in to take part
            </Link>
          )}
        </>
      )}
    </section>
  );
}
