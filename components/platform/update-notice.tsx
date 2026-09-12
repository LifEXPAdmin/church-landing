"use client";
import { LoadedVersion, useLoadedRelease } from "./loaded-release";
import { ReleaseDetails } from "./release-details";
import {
  parseReleaseNotes,
  type ReleaseEntry
} from "@/lib/platform/release-content";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  installationUpdateDecision,
  publicReleaseId
} from "@/lib/platform/install-policy";
import { useDraftWorkspace } from "./draft-workspace-provider";

export function UpdateNotice({ release }: { release: string | null }) {
  // The server-rendered identity belongs to this loaded layout, even if a new
  // deployment appears before our first request or during client navigation.
  const [loaded] = useState(release);
  const loadedProduct = useLoadedRelease();
  const [notes, setNotes] = useState<ReleaseEntry | null>(null);
  const [notesOpen, setNotesOpen] = useState(false);
  const [viewed, setViewed] = useState(false);
  const notesDialog = useRef<HTMLDialogElement>(null);
  const notesButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (notesOpen) notesDialog.current?.showModal();
    else if (notesDialog.current?.open) notesDialog.current.close();
  }, [notesOpen]);
  const [available, setAvailable] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  const [connectionNeeded, setConnectionNeeded] = useState(false);
  const [checking, setChecking] = useState(false);
  const active = useRef<AbortController | null>(null);
  const lastCheck = useRef<number | null>(null);
  const { controller, state } = useDraftWorkspace();
  const work = () => {
    const s = controller.getSnapshot();
    return {
      dirty: s.dirty || s.retry || !!s.resumeId || s.externalWork.dirty,
      saving: s.saving || s.publishing || s.externalWork.saving,
      conflict: s.conflict || s.externalWork.conflict
    };
  };
  const check = useCallback(async (explicit: boolean) => {
    if (
      active.current ||
      (!explicit &&
        lastCheck.current !== null &&
        Date.now() - lastCheck.current < 60000)
    )
      return;
    lastCheck.current = Date.now();
    const abort = new AbortController();
    active.current = abort;
    setChecking(true);
    try {
      const response = await fetch("/api/platform/release", {
        cache: "no-store",
        credentials: "same-origin",
        signal: abort.signal
      });
      if (!response.ok) throw Error();
      const data = await response.json();
      if (abort.signal.aborted) return;
      const found = publicReleaseId(data.release);
      setAvailable(found);
      const entry = parseReleaseNotes(data.notes);
      const matched =
        found &&
        data.product?.build === found &&
        data.product?.id === entry?.id &&
        data.product?.version === entry?.version
          ? entry
          : null;
      setNotes(matched);
      const last = document.cookie
        .split("; ")
        .find((v) => v.startsWith("gc_release_viewed="))
        ?.split("=")[1];
      setViewed(!!matched && last === matched.id);
      setConnectionNeeded(false);
      setChecked(true);
    } catch {
      if (!abort.signal.aborted) {
        setAvailable(null);
        setNotes(null);
        setConnectionNeeded(true);
        setChecked(true);
      }
    } finally {
      if (active.current === abort) {
        active.current = null;
        setChecking(false);
      }
    }
  }, []);
  useEffect(() => {
    const foreground = () => {
      if (document.visibilityState !== "hidden") void check(false);
    };
    const offline = () => {
      active.current?.abort();
      active.current = null;
      setChecking(false);
      setAvailable(null);
      setNotes(null);
      setConnectionNeeded(true);
      setChecked(true);
    };
    window.addEventListener("focus", foreground);
    document.addEventListener("visibilitychange", foreground);
    window.addEventListener("offline", offline);
    if (!navigator.onLine) offline();
    return () => {
      active.current?.abort();
      active.current = null;
      window.removeEventListener("focus", foreground);
      document.removeEventListener("visibilitychange", foreground);
      window.removeEventListener("offline", offline);
    };
  }, [check]);
  const decision = installationUpdateDecision(loaded, available, work());
  const message = connectionNeeded
    ? "A connection is needed. Keep this tab open to retain unsent work, then retry."
    : decision === "keep-work"
      ? "An update is available. Finish saving or resolve your current draft before refreshing."
      : decision === "offer-refresh"
        ? "An update is available. Refresh when you are ready."
        : decision === "current"
          ? "This tab is up to date."
          : "Update status is unknown. You can keep using this tab.";
  return (
    <aside
      aria-label="Updates and connection"
      data-update-decision={decision}
      className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-gc-divider bg-gc-surface px-4 py-2 text-sm"
    >
      <LoadedVersion />
      {available && (
        <p className="text-xs text-gc-muted">
          Loaded: {loadedProduct.version ?? "unknown"} · Available:{" "}
          {notes?.version ?? "unknown"}
        </p>
      )}
      {available && available !== loaded && (
        <>
          <button
            ref={notesButton}
            className="gc-button gc-button-quiet"
            onClick={() => {
              setNotesOpen(true);
              if (notes) {
                document.cookie = `gc_release_viewed=${notes.id}; Path=/platform; Max-Age=31536000; SameSite=Lax; Secure`;
                setViewed(true);
              }
            }}
          >
            {viewed ? "Read what’s new again" : "See what’s new"}
          </button>
          <dialog
            ref={notesDialog}
            aria-label="What’s new in the available release"
            className="max-h-[85dvh] w-[min(92vw,42rem)] overflow-auto rounded-xl border border-gc-divider bg-gc-surface p-5 text-gc-text backdrop:bg-black/50"
            onClose={() => {
              setNotesOpen(false);
              notesButton.current?.focus();
            }}
          >
            <p className="mb-4">
              This tab is still running{" "}
              {loadedProduct.version ?? "an unknown version"}. Reading these
              notes does not refresh it.
            </p>
            {notes ? (
              <ReleaseDetails entry={notes} />
            ) : (
              <p>
                Release notes are unavailable for this build. Your current work
                is unchanged. Reconnect and check again.
              </p>
            )}
            <button
              className="gc-button mt-5"
              onClick={() => notesDialog.current?.close()}
            >
              Close notes
            </button>
          </dialog>
        </>
      )}
      {(checked || checking) && (
        <p role="status">{checking ? "Checking for updates…" : message}</p>
      )}
      <button
        type="button"
        className="gc-button gc-button-quiet"
        disabled={checking}
        onClick={() => {
          void check(true);
          if (connectionNeeded || state.hidden) void controller.verify();
        }}
      >
        {connectionNeeded ? "Retry connection" : "Check for updates"}
      </button>
      {decision === "offer-refresh" && !checking && (
        <button
          type="button"
          className="gc-button gc-button-quiet"
          onClick={() => {
            if (
              installationUpdateDecision(loaded, available, work()) ===
              "offer-refresh"
            )
              window.location.reload();
          }}
        >
          Refresh now
        </button>
      )}
    </aside>
  );
}
