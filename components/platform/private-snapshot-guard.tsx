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
import {
  currentSocialOwner,
  socialRequest,
  SocialClientError
} from "@/lib/platform/social-client";
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
type Props = {
  owner: string;
  url: string;
  checksum: string;
  label?: string;
  project?: (data: unknown) => unknown;
  onVerified?: (snapshot: unknown) => void;
  recoverWithoutSnapshot?: boolean;
  children: ReactNode;
};
export function PrivateSnapshotGuard(props: Props) {
  return <SnapshotGuard key={props.owner} {...props} />;
}
function SnapshotGuard({
  owner,
  url,
  checksum,
  label = "private information",
  project,
  onVerified,
  recoverWithoutSnapshot = false,
  children
}: Props) {
  const parentVisible = useReadVisibility();
  const [visible, setVisible] = useState(false),
    [notice, setNotice] = useState(`Checking current ${label} access…`);
  const [currentAccess, setCurrentAccess] = useState(false);
  const replaced = useRef(false),
    [accountChanged, setAccountChanged] = useState(false);
  const [recoveries, setRecoveries] = useState<Record<string, PendingRecovery>>(
    {}
  );
  const [confirmedChecksum, setConfirmedChecksum] = useState(checksum);
  const [confirmedChildren, setConfirmedChildren] = useState(children);
  // A sibling reader can refresh the server tree after a write whose response
  // was lost. Keep the original management snapshot until its owner confirms
  // that exact request; refreshing props cannot confirm it on the owner's behalf.
  useEffect(() => {
    if (!replaced.current && Object.keys(recoveries).length === 0) {
      setConfirmedChecksum(checksum);
      setConfirmedChildren(children);
    }
  }, [checksum, children, recoveries]);
  const register = useCallback(
    (id: string, recovery: PendingRecovery | null) => {
      if (replaced.current) return;
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
    identityGeneration = useRef(0),
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
      replaced.current ||
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
    const seq = ++generation.current,
      identity = ++identityGeneration.current;
    setVisible(false);
    setCurrentAccess(false);
    try {
      const { data } = await socialRequest<unknown>(url, undefined, owner);
      const snapshot = project ? project(data) : data;
      const digest = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(JSON.stringify(snapshot))
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
        onVerified?.(snapshot);
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
      if (error instanceof SocialClientError && error.status === 401) {
        const actual = await currentSocialOwner().catch(() => undefined);
        if (
          active.current &&
          identity === identityGeneration.current &&
          actual !== undefined &&
          actual !== owner
        ) {
          replaced.current = true;
          queued.current = false;
          conceal();
          setAccountChanged(true);
          setRecoveries({});
          setConfirmedChildren(null);
          setNotice(
            "Your sign-in changed. Private entries and requests were cleared. Reload for your current account."
          );
        }
      }
    } finally {
      checking.current = false;
      if (queued.current && active.current && !replaced.current) {
        queued.current = false;
        // A route or confirmed snapshot may have changed during this request.
        // Retry its current callback, never the old URL/checksum closure.
        void latestCheck.current();
      }
    }
  }, [owner, url, confirmedChecksum, label, project, onVerified, conceal]);
  latestCheck.current = check;
  const resume = useCallback(() => {
    if (
      !replaced.current &&
      document.visibilityState !== "hidden" &&
      document.hasFocus() &&
      navigator.onLine !== false
    ) {
      foreground.current = true;
      void check();
    }
  }, [check]);
  useEffect(() => {
    const accountGeneration = identityGeneration;
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
      accountGeneration.current++;
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
          {!accountChanged && (
            <button
              type="button"
              className="gc-button gc-button-quiet"
              onClick={resume}
            >
              Recheck current access
            </button>
          )}
          <button
            type="button"
            className="gc-button gc-button-quiet"
            onClick={() => {
              if (
                accountChanged ||
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
          {accountChanged
            ? null
            : Object.keys(recoveries).length
              ? confirmedChildren
              : children}
        </div>
      </ReadVisibility.Provider>
    </RecoveryContext.Provider>
  );
}
