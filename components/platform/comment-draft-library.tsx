"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  SocialClientError,
  socialRequest,
  type CommentThreadPage
} from "@/lib/platform/social-client";
import type { SavedCommentDraft } from "@/lib/platform/comment-draft-controller";
import { CommentComposer } from "./comment-composer";
import { useDraftWorkspace } from "./draft-workspace-provider";
import { useUnsavedSocialWork } from "./use-unsaved-social-work";
type Page = {
  items: (SavedCommentDraft & { updatedAt: string })[];
  nextCursor: string | null;
};
export function CommentDraftLibrary({ owner }: { owner: string }) {
  const [data, setData] = useState<Page | null>(null),
    [hidden, setHidden] = useState(true),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const [selected, setSelected] = useState<SavedCommentDraft | null>(null),
    [target, setTarget] = useState<{
      canReply: boolean;
      name: string | null;
    } | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const generation = useRef(0),
    inFlight = useRef(false),
    selectedRef = useRef(selected);
  selectedRef.current = selected;
  const { state } = useDraftWorkspace();
  const protectedWork =
    state.externalWork.dirty ||
    state.externalWork.saving ||
    state.externalWork.conflict;
  useUnsavedSocialWork(
    { dirty: false, saving: !!pending, conflict: false },
    () => setMessage("Resolve the pending discard before leaving.")
  );
  const checkTarget = useCallback(
    async (row: SavedCommentDraft) => {
      const q = new URLSearchParams({
        postId: row.postId,
        view: row.replyToId ? "context" : "roots",
        ...(row.replyToId ? { commentId: row.replyToId } : {})
      });
      return (
        await socialRequest<CommentThreadPage>(
          `/api/platform/comments?${q}`,
          undefined,
          owner
        )
      ).data;
    },
    [owner]
  );
  const load = useCallback(
    async (after?: string) => {
      if (inFlight.current) return;
      inFlight.current = true;
      setBusy(true);
      const seq = ++generation.current;
      if (!after) {
        setHidden(true);
        setTarget(null);
      }
      try {
        const { data: page } = await socialRequest<Page>(
          `/api/platform/comments?${new URLSearchParams({ view: "drafts", ...(after ? { after } : {}) })}`,
          undefined,
          owner
        );
        if (seq !== generation.current) return;
        setData((old) => ({
          ...page,
          items: [
            ...new Map(
              [...(after ? (old?.items ?? []) : []), ...page.items].map(
                (row) => [row.id, row]
              )
            ).values()
          ]
        }));
        setHidden(false);
        setMessage("");
        if (selectedRef.current) {
          try {
            const thread = await checkTarget(selectedRef.current);
            if (seq === generation.current)
              setTarget({
                canReply: thread.canReply,
                name: thread.target?.author?.name ?? null
              });
          } catch {
            if (seq === generation.current)
              setTarget({ canReply: false, name: null });
          }
        }
      } catch (e) {
        if (seq === generation.current) {
          setData(null);
          setHidden(true);
          setMessage(
            e instanceof Error ? e.message : "Your drafts could not be loaded."
          );
        }
      } finally {
        if (seq === generation.current) {
          inFlight.current = false;
          setBusy(false);
        }
      }
    },
    [owner, checkTarget]
  );
  useEffect(() => {
    void load();
    const conceal = () => {
      generation.current++;
      inFlight.current = false;
      setBusy(false);
      setHidden(true);
      setTarget(null);
    };
    const restore = () => {
      if (document.visibilityState !== "hidden") void load();
    };
    const visibility = () =>
      document.visibilityState === "hidden" ? conceal() : restore();
    window.addEventListener("blur", conceal);
    window.addEventListener("focus", restore);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      conceal();
      window.removeEventListener("blur", conceal);
      window.removeEventListener("focus", restore);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [load]);
  async function resume(row: SavedCommentDraft) {
    if (protectedWork) {
      setMessage(
        "Save or resolve the open comment before choosing another draft."
      );
      return;
    }
    setSelected(row);
    setTarget(null);
    const seq = generation.current;
    try {
      const t = await checkTarget(row);
      if (seq === generation.current)
        setTarget({
          canReply: t.canReply,
          name: t.target?.author?.name ?? null
        });
    } catch {
      if (seq === generation.current)
        setTarget({ canReply: false, name: null });
    }
  }
  async function discard(body: string) {
    if (inFlight.current || hidden) return;
    inFlight.current = true;
    setBusy(true);
    setPending(body);
    setMessage("Discarding draft…");
    try {
      await socialRequest("/api/platform/comments", body, owner);
      setPending(null);
      setSelected(null);
      setTarget(null);
      inFlight.current = false;
      await load();
      setMessage("Draft discarded.");
    } catch (e) {
      const status = e instanceof SocialClientError ? e.status : 503;
      if ([400, 401, 403, 404, 409, 429].includes(status)) setPending(null);
      setMessage(
        e instanceof Error
          ? e.message
          : "The response was lost. Retry the same discard."
      );
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  return (
    <section aria-label="Private comment drafts" className="space-y-4">
      <p>
        Only your account can read these unsent comments. Sending or discarding
        a draft removes it from this list.
      </p>
      <p role="status">{busy ? "Checking your drafts…" : message}</p>
      <button
        type="button"
        className="gc-button gc-button-quiet"
        disabled={busy || !!pending}
        onClick={() => void load()}
      >
        Refresh comment drafts
      </button>
      {pending && !hidden && (
        <button
          type="button"
          className="gc-button gc-button-quiet"
          disabled={busy}
          onClick={() => void discard(pending)}
        >
          Retry same discard
        </button>
      )}
      {!hidden && data && (
        <div className="space-y-4">
          {!data.items.length && <p>No saved comment drafts.</p>}
          {data.items.map((row) => (
            <article
              key={row.id}
              data-comment-draft-id={row.id}
              className="space-y-2 rounded border p-3"
            >
              <h2 className="font-semibold">
                {row.replyToId ? "Unsent reply" : "Unsent comment"}
              </h2>
              <time dateTime={row.updatedAt}>
                {new Date(row.updatedAt).toLocaleString()}
              </time>
              <textarea
                aria-label="Saved draft text"
                readOnly
                value={row.content}
                className="block min-h-24 w-full rounded border p-2"
              />
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="gc-button gc-button-quiet"
                  disabled={busy || !!pending}
                  onClick={() => void resume(row)}
                >
                  Resume comment draft
                </button>
                <button
                  type="button"
                  className="gc-button gc-button-quiet"
                  onClick={() =>
                    void navigator.clipboard.writeText(row.content).then(
                      () => setMessage("Draft text copied."),
                      () =>
                        setMessage(
                          "Copy is unavailable. Select the draft text above and copy it manually."
                        )
                    )
                  }
                >
                  Copy draft text
                </button>
                <button
                  type="button"
                  className="gc-button gc-button-quiet"
                  disabled={busy || protectedWork}
                  onClick={() => {
                    if (
                      window.confirm(
                        "Discard this saved comment draft? This cannot be undone."
                      )
                    )
                      void discard(
                        JSON.stringify({
                          operation: "draft-delete",
                          mutationId: crypto.randomUUID(),
                          draftId: row.id,
                          expectedVersion: row.version
                        })
                      );
                  }}
                >
                  Discard comment draft
                </button>
              </div>
            </article>
          ))}
          {data.nextCursor && (
            <button
              type="button"
              className="gc-button gc-button-quiet"
              disabled={busy}
              onClick={() => void load(data.nextCursor!)}
            >
              More comment drafts
            </button>
          )}
        </div>
      )}
      {selected && (
        <section aria-label="Resume saved comment" className="space-y-3">
          {!hidden &&
            target &&
            (target.canReply ? (
              <>
                <p>
                  {selected.replyToId
                    ? `Replying to ${target.name ?? "this comment"}`
                    : "Post is available for your comment."}
                </p>
                <Link
                  className="underline"
                  prefetch={false}
                  href={`/platform/posts/${selected.postId}${selected.replyToId ? `?comment=${selected.replyToId}` : ""}`}
                >
                  Open permitted discussion
                </Link>
              </>
            ) : (
              <p>
                The target is unavailable or replies are no longer permitted.
                Your own saved text remains above for copying or discarding.
              </p>
            ))}
          <CommentComposer
            key={selected.id}
            postId={selected.postId}
            owner={owner}
            replyToId={selected.replyToId}
            draftId={selected.id}
            replyName={target?.name ?? undefined}
            hidden={hidden || !target}
            unavailable={!!target && !target.canReply}
            onSent={() => {
              setSelected(null);
              setTarget(null);
              void load();
            }}
          />
        </section>
      )}
    </section>
  );
}
