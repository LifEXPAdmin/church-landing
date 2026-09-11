"use client";
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
      dirty: s.dirty || s.retry || !!s.resumeId,
      saving: s.saving || s.publishing,
      conflict: s.conflict
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
      setAvailable(publicReleaseId(data.release));
      setConnectionNeeded(false);
      setChecked(true);
    } catch {
      if (!abort.signal.aborted) {
        setAvailable(null);
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
      className="border-b border-gc-divider bg-gc-surface px-4 py-2 text-sm"
    >
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
