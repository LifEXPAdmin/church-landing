"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { usePhotoBackGuard } from "./use-photo-back-guard";

/** Presentation only: draft and publication authority stay in the callers. */
export function ComposerDialog({
  title,
  onClose,
  children
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  usePhotoBackGuard(true, onClose);
  useEffect(() => {
    const dialog = ref.current!;
    const opener = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const viewport = window.visualViewport;
    const resize = () => {
      const height = viewport?.height ?? window.innerHeight;
      const available = Math.max(0, height - 16);
      const panelHeight =
        window.innerWidth >= 640 ? Math.min(720, available) : available;
      dialog.style.height = `${panelHeight}px`;
      dialog.style.top = `${(viewport?.offsetTop ?? 0) + (height - panelHeight) / 2}px`;
    };
    resize();
    dialog.showModal();
    const focus = requestAnimationFrame(() =>
      dialog
        .querySelector<HTMLTextAreaElement>("textarea:not(:disabled)")
        ?.focus({ preventScroll: true })
    );
    viewport?.addEventListener("resize", resize);
    viewport?.addEventListener("scroll", resize);
    window.addEventListener("resize", resize);
    return () => {
      cancelAnimationFrame(focus);
      viewport?.removeEventListener("resize", resize);
      viewport?.removeEventListener("scroll", resize);
      window.removeEventListener("resize", resize);
      dialog.close();
      document.body.style.overflow = overflow;
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, []);
  return (
    <dialog
      ref={ref}
      aria-label={title}
      className="gc-composer-dialog fixed bottom-auto m-auto max-h-none w-[calc(100%_-_1rem)] max-w-[600px] overflow-hidden rounded-2xl border border-gc-divider bg-gc-surface p-0 text-gc-text shadow-xl backdrop:bg-black/40"
      onCancel={(event) => {
        if (event.target !== event.currentTarget) return;
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }}
    >
      {children}
    </dialog>
  );
}
export function ComposerFrame({
  title,
  onClose,
  save,
  footer,
  children
}: {
  title: string;
  onClose: () => void;
  save: ReactNode;
  footer: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex shrink-0 items-center justify-between gap-2 border-b border-gc-divider p-3">
        <button
          type="button"
          aria-label="Close composer"
          title="Close"
          className="gc-button gc-button-quiet"
          onClick={onClose}
        >
          <X aria-hidden="true" />
        </button>
        <h2 className="sr-only min-w-0 text-lg font-semibold sm:not-sr-only">
          {title}
        </h2>
        <span className="shrink-0 whitespace-nowrap">{save}</span>
      </header>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-4">
        {children}
      </div>
      <footer className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-gc-divider bg-gc-surface p-3 pb-[max(.75rem,env(safe-area-inset-bottom))]">
        {footer}
      </footer>
    </div>
  );
}
export function ComposerCloseChoice({
  busy,
  recover,
  conflict = false,
  onSave,
  onDiscard,
  onCancel
}: {
  busy: boolean;
  recover: boolean;
  conflict?: boolean;
  onSave: () => void;
  onDiscard: () => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  return (
    <div
      ref={ref}
      tabIndex={-1}
      role="group"
      aria-label="Keep your draft"
      className="space-y-3 rounded-xl border border-gc-divider bg-gc-canvas p-3"
    >
      <p className="font-semibold">Keep your draft before closing?</p>
      <p className="text-sm">
        Save your latest changes, discard only unsent changes, or keep writing.
        Any previously saved draft remains available.
      </p>
      {conflict && (
        <p>
          The saved copy changed. Review it below, or discard this unsent
          working copy and reopen the current saved draft.
        </p>
      )}
      {recover && (
        <p role="status">
          Resolve the pending request or photo changes below before closing.
          Your entries are still here.
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="gc-button gc-button-primary"
          disabled={busy || recover || conflict}
          onClick={onSave}
        >
          Save and close
        </button>
        <button
          type="button"
          className="gc-button gc-button-quiet"
          disabled={busy || recover}
          onClick={onDiscard}
        >
          Discard unsent changes
        </button>
        <button
          type="button"
          className="gc-button gc-button-quiet"
          onClick={() => {
            const text = ref.current
              ?.closest("form")
              ?.querySelector<HTMLTextAreaElement>("textarea");
            onCancel();
            text?.focus();
          }}
        >
          Keep writing
        </button>
      </div>
    </div>
  );
}
