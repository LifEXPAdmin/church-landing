"use client";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode
} from "react";
import { socialRequest } from "@/lib/platform/social-client";

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
  const [visible, setVisible] = useState(false),
    [notice, setNotice] = useState(`Checking current ${label} access…`);
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
    try {
      const { data } = await socialRequest<unknown>(url, undefined, owner);
      const digest = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(JSON.stringify(data))
      );
      if (seq !== generation.current) return;
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
    window.addEventListener("pageshow", resume);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      active.current = false;
      queued.current = false;
      hide();
      window.removeEventListener("blur", hide);
      window.removeEventListener("focus", resume);
      window.removeEventListener("online", resume);
      window.removeEventListener("pageshow", resume);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [check]);
  return (
    <>
      {!visible && (
        <div className="space-y-3 rounded-xl border p-4">
          <p role="status">{notice || `Checking current ${label} access…`}</p>
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
      <div hidden={!visible}>{children}</div>
    </>
  );
}
