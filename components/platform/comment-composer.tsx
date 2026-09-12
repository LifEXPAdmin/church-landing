"use client";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { CommentDraftController } from "@/lib/platform/comment-draft-controller";
import { socialRequest } from "@/lib/platform/social-client";
import { CommentMentions } from "./comment-mentions";
import { useUnsavedSocialWork } from "./use-unsaved-social-work";

export function CommentComposer({
  postId,
  owner,
  replyToId = null,
  replyName,
  draftId,
  hidden,
  unavailable = false,
  onSent
}: {
  postId: string;
  owner: string;
  replyToId?: string | null;
  replyName?: string;
  draftId?: string;
  hidden: boolean;
  unavailable?: boolean;
  onSent: () => void;
}) {
  const controller = useMemo(
    () =>
      new CommentDraftController(
        async <T,>(path: string, body?: string) =>
          (await socialRequest<T>(path, body, owner)).data,
        postId,
        replyToId,
        undefined,
        draftId
      ),
    [postId, owner, replyToId, draftId]
  );
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot
  );
  const [churches, setChurches] = useState<
    { id: string; name: string; canPublish: boolean }[]
  >([]);
  const [notice, setNotice] = useState("");
  useEffect(() => {
    void controller.start();
    return controller.dispose;
  }, [controller]);
  useEffect(() => {
    controller.visibility(hidden || unavailable);
  }, [controller, hidden, unavailable]);
  useEffect(() => {
    let active = true;
    if (!hidden)
      void socialRequest<{ churches: typeof churches }>(
        "/api/platform/posts?view=composer",
        undefined,
        owner
      )
        .then(({ data }) => {
          if (active) setChurches(data.churches.filter((c) => c.canPublish));
        })
        .catch(() => {
          if (active) setChurches([]);
        });
    return () => {
      active = false;
    };
  }, [owner, hidden]);
  useUnsavedSocialWork(
    {
      dirty: state.dirty,
      saving: state.busy || state.retry,
      conflict: state.conflict
    },
    () =>
      setNotice(
        "Save or resolve this comment before leaving. Your text is still here."
      )
  );
  const disabled = !state.ready || state.sending || !!state.createdId;
  if (hidden) return null;
  if (unavailable)
    return (
      <section
        aria-label="Unavailable comment target"
        className="space-y-2 rounded border p-3"
      >
        <p>
          The target is unavailable or replies are no longer permitted. Your own
          text is preserved here.
        </p>
        <textarea
          aria-label="Your unsent comment text"
          readOnly
          value={state.fields.content}
          className="block min-h-28 w-full rounded border p-2"
        />
        <button
          type="button"
          className="gc-button gc-button-quiet"
          onClick={() =>
            void navigator.clipboard.writeText(state.fields.content).then(
              () => setNotice("Text copied."),
              () => setNotice("Select the text and copy it manually.")
            )
          }
        >
          Copy unsent text
        </button>
        <button
          type="button"
          className="gc-button gc-button-quiet"
          onClick={onSent}
        >
          Close this working copy
        </button>
        <p role="status">{notice}</p>
      </section>
    );
  if (state.createdId)
    return (
      <div role="status" className="space-y-2">
        <p>Comment sent.</p>
        <button
          type="button"
          className="gc-button gc-button-quiet"
          onClick={onSent}
        >
          Write another comment
        </button>
      </div>
    );
  return (
    <form
      aria-label={replyToId ? "Write a reply" : "Write a comment"}
      className="space-y-3 rounded-lg border border-gc-divider p-3"
      onSubmit={(e) => {
        e.preventDefault();
        void controller.send().then((sent) => {
          if (sent) onSent();
        });
      }}
    >
      <h3 className="font-semibold">
        {replyToId
          ? `Reply to ${replyName ?? "this comment"}`
          : "Write a comment"}
      </h3>
      <label className="block">
        Comment text
        <textarea
          aria-label="Comment text"
          className="mt-1 block min-h-28 w-full rounded border p-2"
          value={state.fields.content}
          maxLength={10000}
          disabled={disabled}
          onChange={(e) =>
            controller.change({ ...state.fields, content: e.target.value })
          }
        />
      </label>
      <p className="text-sm text-gc-muted">
        {state.fields.content.replace(/\r\n?/g, "\n").trim().length}/1,500
        characters to send. Drafts can keep up to 10,000.
      </p>
      <label className="block">
        Speaking as
        <select
          className="ml-2 max-w-full rounded border p-2"
          disabled={disabled}
          value={state.fields.authorChurchId ?? ""}
          onChange={(e) =>
            controller.change({
              ...state.fields,
              authorChurchId: e.target.value || null
            })
          }
        >
          <option value="">My personal profile</option>
          {state.fields.authorChurchId &&
            !churches.some((c) => c.id === state.fields.authorChurchId) && (
              <option value={state.fields.authorChurchId}>
                Saved church identity · access must be checked
              </option>
            )}
          {churches.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <CommentMentions
        postId={postId}
        owner={owner}
        ids={state.fields.mentionIds}
        disabled={disabled}
        onChange={(mentionIds, person) =>
          controller.change({
            ...state.fields,
            mentionIds,
            content: person
              ? `${state.fields.content}${state.fields.content ? " " : ""}@${person.username}`
              : state.fields.content
          })
        }
      />
      <p role="status">{notice || state.message}</p>
      {state.conflict && (
        <div className="space-y-2">
          <p>
            The saved draft changed or became unavailable. Your unsent text
            stays above. Copy it before replacing it with a saved copy.
          </p>
          <button
            type="button"
            className="gc-button gc-button-quiet"
            onClick={() => void controller.review()}
          >
            Review saved copy
          </button>
        </div>
      )}
      {state.latest && (
        <aside
          aria-label="Saved comment copy"
          className="space-y-2 rounded border p-3"
        >
          <p className="whitespace-pre-wrap break-words">
            {state.latest.content}
          </p>
          <p>
            {state.latest.mentionIds.length} selected mentions ·{" "}
            {state.latest.authorChurchId
              ? "Church identity"
              : "Personal profile"}
          </p>
          <button
            type="button"
            className="gc-button gc-button-quiet"
            onClick={controller.useLatest}
          >
            Replace my text with saved copy
          </button>
        </aside>
      )}
      <div className="flex flex-wrap gap-2">
        {!state.ready && (
          <button
            type="button"
            className="gc-button gc-button-quiet"
            onClick={() => void controller.start()}
          >
            Retry loading draft
          </button>
        )}
        {state.retry && (
          <button
            type="button"
            className="gc-button gc-button-quiet"
            disabled={state.busy}
            onClick={() =>
              void controller.retry().then((ok) => {
                if (ok && controller.getSnapshot().createdId) onSent();
              })
            }
          >
            Retry same request
          </button>
        )}
        <button
          type="button"
          className="gc-button gc-button-quiet"
          disabled={
            disabled ||
            state.busy ||
            state.conflict ||
            state.retry ||
            !state.dirty
          }
          onClick={() => {
            setNotice("");
            void controller.save();
          }}
        >
          Save comment draft
        </button>
        <button
          className="gc-button gc-button-primary"
          disabled={
            disabled ||
            state.busy ||
            state.conflict ||
            state.retry ||
            state.fields.content.trim().length < 2 ||
            state.fields.content.trim().length > 1500
          }
        >
          Send comment
        </button>
      </div>
    </form>
  );
}
