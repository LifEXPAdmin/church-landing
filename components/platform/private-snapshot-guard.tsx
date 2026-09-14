"use client";
import {
  useCallback,
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode
} from "react";
import { socialRequest } from "@/lib/platform/social-client";
import { ReadVisibility, useReadVisibility } from "./read-visibility";

type PendingRecovery = { retry: () => void; busy: boolean };
const RecoveryContext = createContext<
  ((id: string, recovery: PendingRecovery | null) => void) | null
>(null);
export function usePrivateRecovery(
  id: string,
  pending: boolean,
  busy: boolean,
  retry: () => void
) {
  const register = useContext(RecoveryContext);
  useEffect(() => {
    register?.(id, pending ? { retry, busy } : null);
    return () => register?.(id, null);
  }, [register, id, pending, busy, retry]);
}

// Keep form state mounted but concealed while rechecking. A changed version
// requires deliberate reload, so this guard never rebases an uncertain write.
export function PrivateSnapshotGuard({
  owner,
  url,
  checksum,
  label = "private information",
  children
}: {
  owner: string;
  url: string;
  checksum: string;
  label?: string;
  children: ReactNode;
}) {
  const parentVisible = useReadVisibility();
  const [visible, setVisible] = useState(false),
    [notice, setNotice] = useState(`Checking current ${label} access…`);
  const [currentAccess, setCurrentAccess] = useState(false);
  const [recoveries, setRecoveries] = useState<Record<string, PendingRecovery>>(
    {}
  );
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
  const check = useCallback(async () => {
    if (!active.current || document.visibilityState === "hidden") return;
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
        new TextEncoder().encode(JSON.stringify(data))
      );
      if (seq !== generation.current) return;
      setCurrentAccess(true);
      if (
        Array.from(new Uint8Array(digest), (b) =>
          b.toString(16).padStart(2, "0")
        ).join("") !== checksum
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
        void check();
      }
    }
  }, [owner, url, checksum, label]);
  useEffect(() => {
    active.current = true;
    const hide = () => {
      generation.current++;
      setVisible(false);
      setCurrentAccess(false);
    };
    const resume = () => {
      if (document.visibilityState !== "hidden") void check();
    };
    const visibility = () =>
      document.visibilityState === "hidden" ? hide() : resume();
    void check();
    window.addEventListener("blur", hide);
    window.addEventListener("focus", resume);
    window.addEventListener("online", resume);
    window.addEventListener("offline", hide);
    window.addEventListener("social-relationships-changed", resume);
    window.addEventListener("pageshow", resume);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      active.current = false;
      queued.current = false;
      hide();
      window.removeEventListener("blur", hide);
      window.removeEventListener("focus", resume);
      window.removeEventListener("online", resume);
      window.removeEventListener("offline", hide);
      window.removeEventListener("social-relationships-changed", resume);
      window.removeEventListener("pageshow", resume);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [check]);
  return (
    <RecoveryContext.Provider value={register}>
      {!visible && (
        <div className="space-y-3 rounded-xl border p-4">
          <p role="status">{notice || `Checking current ${label} access…`}</p>
          {currentAccess &&
            Object.entries(recoveries).map(([id, recovery]) => (
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
            onClick={() => void check()}
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
          {children}
        </div>
      </ReadVisibility.Provider>
    </RecoveryContext.Provider>
  );
}
