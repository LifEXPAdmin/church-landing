"use client";
import { useRef, useState } from "react";
import {
  SocialClientError,
  socialRequest,
  type CommentItem
} from "@/lib/platform/social-client";
import { CommentMentions } from "./comment-mentions";
import { useUnsavedSocialWork } from "./use-unsaved-social-work";

/** Kept outside the reloadable thread so an access refresh cannot discard unsent edits. */
export function CommentActions({
  postId,
  owner,
  row,
  hidden,
  onDone
}: {
  postId: string;
  owner: string;
  row: CommentItem;
  hidden: boolean;
  onDone: () => void;
}) {
  const [content, setContent] = useState(row.content ?? ""),
    [mentionIds, setMentionIds] = useState(row.mentions.map((m) => m.id));
  const [message, setMessage] = useState(""),
    [pending, setPending] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [conflict, setConflict] = useState(false);
  const inFlight = useRef(false);
  const dirty =
    content !== row.content ||
    JSON.stringify(mentionIds) !==
      JSON.stringify(row.mentions.map((m) => m.id));
  useUnsavedSocialWork({ dirty, saving: busy || !!pending, conflict }, () =>
    setMessage("Save your edit or explicitly discard it before leaving.")
  );
  async function send(body: string) {
    if (inFlight.current || hidden) return;
    inFlight.current = true;
    setBusy(true);
    setPending(body);
    setMessage("Saving change…");
    try {
      await socialRequest("/api/platform/comments", body, owner);
      setPending(null);
      onDone();
    } catch (e) {
      const status = e instanceof SocialClientError ? e.status : 503;
      if ([400, 401, 403, 404, 409, 429].includes(status)) setPending(null);
      if ([401, 403, 404, 409].includes(status)) setConflict(true);
      setMessage(
        e instanceof Error
          ? e.message
          : "The response was lost. Retry the exact same change."
      );
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  if (hidden) return null;
  return (
    <form
      data-reader-dirty={dirty || !!pending || conflict}
      data-reader-busy={busy}
      aria-label="Edit comment"
      className="space-y-3 rounded border p-3"
      onSubmit={(e) => {
        e.preventDefault();
        void send(
          JSON.stringify({
            operation: "edit",
            mutationId: crypto.randomUUID(),
            postId,
            commentId: row.id,
            expectedVersion: row.version,
            content,
            mentionIds
          })
        );
      }}
    >
      <h3 className="font-semibold">Edit your comment</h3>
      <label className="block">
        Edited comment text
        <textarea
          aria-label="Edited comment text"
          className="block min-h-28 w-full rounded border p-2 text-[length:var(--gc-reader-size)] leading-relaxed"
          maxLength={10000}
          value={content}
          disabled={busy || !!pending}
          onChange={(e) => setContent(e.target.value)}
        />
      </label>
      <CommentMentions
        postId={postId}
        owner={owner}
        ids={mentionIds}
        disabled={busy || !!pending}
        onChange={(ids, person) => {
          setMentionIds(ids);
          if (person) setContent((old) => `${old} @${person.username}`);
        }}
      />
      <p role="status">{message}</p>
      {conflict && (
        <p>
          Your edit is preserved. Copy it before discarding and reopening the
          current comment; another version will not be overwritten.
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button
          className="gc-button gc-button-primary"
          disabled={
            busy ||
            !!pending ||
            conflict ||
            !dirty ||
            content.trim().length < 2 ||
            content.trim().length > 1500
          }
        >
          Save edit
        </button>
        {pending && !busy && (
          <button
            type="button"
            className="gc-button gc-button-quiet"
            onClick={() => void send(pending)}
          >
            Retry same edit
          </button>
        )}
        <button
          type="button"
          className="gc-button gc-button-quiet"
          disabled={busy || !!pending}
          onClick={onDone}
        >
          Discard edit
        </button>
      </div>
    </form>
  );
}
