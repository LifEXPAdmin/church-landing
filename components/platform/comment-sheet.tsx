"use client";
import { useEffect, useRef, useState } from "react";
import { MessageCircle } from "lucide-react";
import { CommentThread } from "./comment-thread";
import { useDraftWorkspace } from "./draft-workspace-provider";
export function CommentSheet({
  postId,
  count
}: {
  postId: string;
  count: number;
}) {
  const [open, setOpen] = useState(false),
    [notice, setNotice] = useState("");
  const dialog = useRef<HTMLDialogElement>(null),
    opener = useRef<HTMLButtonElement>(null);
  const { controller } = useDraftWorkspace();
  useEffect(() => {
    if (!open) return;
    const node = dialog.current!,
      button = opener.current;
    node.showModal();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      node.close();
      document.body.style.overflow = overflow;
      button?.focus({ preventScroll: true });
    };
  }, [open]);
  function close() {
    const work = controller.getSnapshot().externalWork;
    if (work.dirty || work.saving || work.conflict) {
      setNotice("Save or resolve your comment before closing this discussion.");
      return;
    }
    setOpen(false);
    setNotice("");
  }
  return (
    <>
      <button
        ref={opener}
        type="button"
        className="gc-button gc-button-quiet"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        <MessageCircle aria-hidden="true" />
        Discussion ({count})
      </button>
      {open && (
        <dialog
          ref={dialog}
          aria-label="Post discussion"
          onCancel={(e) => {
            e.preventDefault();
            close();
          }}
          className="m-auto max-h-[90dvh] w-[calc(100%_-_1rem)] max-w-3xl overscroll-contain rounded-xl border border-gc-divider bg-gc-surface p-4 text-gc-text backdrop:bg-black/50"
        >
          <header className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-xl">Post discussion</h2>
            <button
              type="button"
              className="gc-button gc-button-quiet"
              onClick={close}
            >
              Close discussion
            </button>
          </header>
          <p role="status">{notice}</p>
          <CommentThread postId={postId} />
        </dialog>
      )}
    </>
  );
}
