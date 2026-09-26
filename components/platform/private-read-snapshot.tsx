"use client";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode
} from "react";
import { socialRequest } from "@/lib/platform/social-client";

// For read-only snapshots, never pending form/retry owners. Callers key this
// boundary by owner and URL so navigation starts a new confirmed snapshot.
export function PrivateReadSnapshot<T>({
  owner,
  url,
  label,
  changedNotice,
  children
}: {
  owner: string;
  url: string;
  label: string;
  changedNotice: string;
  children: (data: T) => ReactNode;
}) {
  const [data, setData] = useState<T | null>(null);
  const [notice, setNotice] = useState(`Checking current ${label} access…`);
  const checksum = useRef<string | null>(null);
  const generation = useRef(0),
    active = useRef(false),
    reading = useRef(false),
    queued = useRef(false);
  const latest = useRef<() => Promise<void>>(async () => {});
  const load = useCallback(async () => {
    if (!active.current || document.visibilityState === "hidden") return;
    if (reading.current) {
      queued.current = true;
      return;
    }
    reading.current = true;
    const seq = ++generation.current;
    setData(null);
    setNotice(`Checking current ${label} access…`);
    try {
      const { data } = await socialRequest<T>(url, undefined, owner);
      const digest = Array.from(
        new Uint8Array(
          await crypto.subtle.digest(
            "SHA-256",
            new TextEncoder().encode(JSON.stringify(data))
          )
        ),
        (b) => b.toString(16).padStart(2, "0")
      ).join("");
      if (seq !== generation.current) return;
      if (checksum.current !== null && checksum.current !== digest) {
        setNotice(changedNotice);
      } else {
        checksum.current = digest;
        setData(data);
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
      reading.current = false;
      if (queued.current && active.current) {
        queued.current = false;
        void latest.current();
      }
    }
  }, [owner, url, label, changedNotice]);
  latest.current = load;
  useEffect(() => {
    const hide = () => {
      active.current = false;
      queued.current = false;
      generation.current++;
      setData(null);
      setNotice(`Checking current ${label} access…`);
    };
    const resume = () => {
      if (document.visibilityState !== "hidden") {
        active.current = true;
        void load();
      }
    };
    const visibility = () =>
      document.visibilityState === "hidden" ? hide() : resume();
    resume();
    window.addEventListener("blur", hide);
    window.addEventListener("pagehide", hide);
    window.addEventListener("offline", hide);
    window.addEventListener("focus", resume);
    window.addEventListener("online", resume);
    window.addEventListener("pageshow", resume);
    window.addEventListener("social-relationships-changed", resume);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      hide();
      window.removeEventListener("blur", hide);
      window.removeEventListener("pagehide", hide);
      window.removeEventListener("offline", hide);
      window.removeEventListener("focus", resume);
      window.removeEventListener("online", resume);
      window.removeEventListener("pageshow", resume);
      window.removeEventListener("social-relationships-changed", resume);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [load, label]);
  if (data === null)
    return (
      <div className="space-y-3 rounded-xl border p-4">
        <p role="status">{notice}</p>
        <button
          type="button"
          className="gc-button gc-button-quiet"
          onClick={() => {
            if (document.visibilityState !== "hidden") {
              active.current = true;
              void load();
            }
          }}
        >
          Recheck current access
        </button>
        <button
          type="button"
          className="gc-button gc-button-quiet"
          onClick={() => window.location.reload()}
        >
          Reload current information
        </button>
      </div>
    );
  return children(data);
}
