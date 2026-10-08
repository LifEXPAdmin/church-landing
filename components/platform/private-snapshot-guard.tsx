"use client";
import {
  useCallback,
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode
} from "react";
import { socialRequest } from "@/lib/platform/social-client";
import { ReadVisibility, useReadVisibility } from "./read-visibility";

type PendingRecovery = { retry: () => void; busy: boolean; allowed?: boolean };
const RecoveryContext = createContext<
  ((id: string, recovery: PendingRecovery | null) => void) | null
>(null);
export function usePrivateRecovery(
  id: string,
  pending: boolean,
  busy: boolean,
  retry: () => void,
  allowed?: boolean
) {
  const register = useContext(RecoveryContext);
  useLayoutEffect(() => {
    register?.(id, pending ? { retry, busy, allowed } : null);
    return () => register?.(id, null);
  }, [register, id, pending, busy, retry, allowed]);
}

// Keep form state mounted but concealed while rechecking. A changed version
// requires deliberate reload, so this guard never rebases an uncertain write.
export function PrivateSnapshotGuard({
  owner,
  url,
  checksum,
  label = "private information",
  project,
  recoverWithoutSnapshot = false,
  children
}: {
  owner: string;
  url: string;
  checksum: string;
  label?: string;
  project?: (data: unknown) => unknown;
  recoverWithoutSnapshot?: boolean;
  children: ReactNode;
}) {
  const parentVisible = useReadVisibility();
  const [visible, setVisible] = useState(false),
    [notice, setNotice] = useState(`Checking current ${label} access…`);
  const [currentAccess, setCurrentAccess] = useState(false);
  const [recoveries, setRecoveries] = useState<Record<string, PendingRecovery>>(
    {}
  );
  const [confirmedChecksum, setConfirmedChecksum] = useState(checksum);
  const [confirmedChildren, setConfirmedChildren] = useState(children);
  // A sibling reader can refresh the server tree after a write whose response
  // was lost. Keep the original management snapshot until its owner confirms
  // that exact request; refreshing props cannot confirm it on the owner's behalf.
  useEffect(() => {
    if (Object.keys(recoveries).length === 0) {
      setConfirmedChecksum(checksum);
      setConfirmedChildren(children);
    }
  }, [checksum, children, recoveries]);
  const register = useCallback(
    (id: string, recovery: PendingRecovery | null) => {
      setRecoveries((current) => {
        if (!recovery && !current[id]) return current;
        const next = { ...current };
        if (recovery) next[id] = recovery;
        else delete next[id];
        return next;
      });
    },
    []
  );
  const generation = useRef(0),
    checking = useRef(false),
    queued = useRef(false),
    active = useRef(true);
  const foreground = useRef(
    typeof document !== "undefined" &&
      document.hasFocus() &&
      navigator.onLine !== false
  );
  const latestCheck = useRef<() => Promise<void>>(async () => {});
  const conceal = useCallback(() => {
    generation.current++;
    setVisible(false);
    setCurrentAccess(false);
  }, []);
  const check = useCallback(async () => {
    if (
      !active.current ||
      !foreground.current ||
      document.visibilityState === "hidden" ||
      navigator.onLine === false
    )
      return;
    if (checking.current) {
      queued.current = true;
      return;
    }
    checking.current = true;
    const seq = ++generation.current;
    setVisible(false);
    setCurrentAccess(false);
    try {
      const { data } = await socialRequest<unknown>(url, undefined, owner);
      const digest = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(JSON.stringify(project ? project(data) : data))
      );
      if (seq !== generation.current) return;
      setCurrentAccess(true);
      if (
        Array.from(new Uint8Array(digest), (b) =>
          b.toString(16).padStart(2, "0")
        ).join("") !== confirmedChecksum
      ) {
        setNotice(
          `This ${label} or its access changed. Reload to inspect current details. Unsaved entries will be cleared; an unconfirmed request may already be saved.`
        );
      } else {
        setVisible(true);
        setNotice("");
      }
    } catch (error) {
      if (seq === generation.current)
        setNotice(
          error instanceof Error
            ? error.message
            : `Current ${label} access could not be confirmed.`
        );
    } finally {
      checking.current = false;
      if (queued.current && active.current) {
        queued.current = false;
        // A route or confirmed snapshot may have changed during this request.
        // Retry its current callback, never the old URL/checksum closure.
        void latestCheck.current();
      }
    }
  }, [owner, url, confirmedChecksum, label, project]);
  latestCheck.current = check;
  const resume = useCallback(() => {
    if (
      document.visibilityState !== "hidden" &&
      document.hasFocus() &&
      navigator.onLine !== false
    ) {
      foreground.current = true;
      void check();
    }
  }, [check]);
  useEffect(() => {
    active.current = true;
    const hide = () => {
      foreground.current = false;
      conceal();
    };
    const refresh = () => void check();
    const visibility = () =>
      document.visibilityState === "hidden" ? hide() : resume();
    void check();
    window.addEventListener("blur", hide);
    window.addEventListener("pagehide", hide);
    window.addEventListener("focus", resume);
    window.addEventListener("online", refresh);
    window.addEventListener("offline", hide);
    window.addEventListener("social-relationships-changed", refresh);
    window.addEventListener("pageshow", resume);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      active.current = false;
      queued.current = false;
      // Invalidate old reads without replacing foreground state on a changed
      // checksum/URL or React's development effect replay.
      conceal();
      window.removeEventListener("blur", hide);
      window.removeEventListener("pagehide", hide);
      window.removeEventListener("focus", resume);
      window.removeEventListener("online", refresh);
      window.removeEventListener("offline", hide);
      window.removeEventListener("social-relationships-changed", refresh);
      window.removeEventListener("pageshow", resume);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [check, resume, conceal]);
  return (
    <RecoveryContext.Provider value={register}>
      {!visible && (
        <div className="space-y-3 rounded-xl border p-4">
          <p role="status">{notice || `Checking current ${label} access…`}</p>
          {Object.entries(recoveries)
            .filter(
              ([, recovery]) =>
                currentAccess ||
                (recoverWithoutSnapshot && recovery.allowed === true)
            )
            .map(([id, recovery]) => (
              <button
                key={id}
                type="button"
                className="gc-button"
                disabled={recovery.busy}
                onClick={recovery.retry}
              >
                {recovery.busy
                  ? "Confirming original request…"
                  : "Confirm original request"}
              </button>
            ))}
          <button
            type="button"
            className="gc-button gc-button-quiet"
            onClick={resume}
          >
            Recheck current access
          </button>
          <button
            type="button"
            className="gc-button gc-button-quiet"
            onClick={() => {
              if (
                confirm(
                  "Reload current details and discard local entries? A previous unconfirmed request may already be saved."
                )
              )
                window.location.reload();
            }}
          >
            Reload current information
          </button>
        </div>
      )}
      <ReadVisibility.Provider value={visible && parentVisible}>
        <div hidden={!visible} inert={!visible}>
          {Object.keys(recoveries).length ? confirmedChildren : children}
        </div>
      </ReadVisibility.Provider>
    </RecoveryContext.Provider>
  );
}
