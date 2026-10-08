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
  const controller = useRef<AbortController | null>(null);
  const load = useCallback(async () => {
    if (
      !active.current ||
      document.visibilityState === "hidden" ||
      navigator.onLine === false
    )
      return;
    // A queued request supersedes the current result immediately, including
    // the first checksum. Only the newest check may establish a snapshot.
    const seq = ++generation.current;
    setData(null);
    setNotice(`Checking current ${label} access…`);
    if (reading.current) {
      queued.current = true;
      return;
    }
    reading.current = true;
    queued.current = false;
    const request = new AbortController();
    controller.current = request;
    const deadline = setTimeout(() => request.abort(), 15000);
    try {
      const { data } = await socialRequest<T>(
        url,
        undefined,
        owner,
        "POST",
        undefined,
        request.signal
      );
      const digest = Array.from(
        new Uint8Array(
          await crypto.subtle.digest(
            "SHA-256",
            new TextEncoder().encode(JSON.stringify(data))
          )
        ),
        (b) => b.toString(16).padStart(2, "0")
      ).join("");
      request.signal.throwIfAborted();
      if (seq !== generation.current || !active.current) return;
      if (checksum.current !== null && checksum.current !== digest) {
        setNotice(changedNotice);
      } else {
        checksum.current = digest;
        setData(data);
        setNotice("");
      }
    } catch (error) {
      if (seq === generation.current && active.current)
        setNotice(
          request.signal.aborted
            ? `Your ${label} access check timed out. Try again.`
            : error instanceof Error
              ? error.message
              : `Current ${label} access could not be confirmed.`
        );
    } finally {
      clearTimeout(deadline);
      request.abort();
      if (controller.current === request) controller.current = null;
      reading.current = false;
      if (queued.current && active.current) {
        queued.current = false;
        void latest.current();
      }
    }
  }, [owner, url, label, changedNotice]);
  latest.current = load;
  useEffect(() => {
    const currentRead = controller;
    const hide = () => {
      active.current = false;
      queued.current = false;
      generation.current++;
      setData(null);
      setNotice(`Checking current ${label} access…`);
    };
    const resume = () => {
      if (
        document.hasFocus() &&
        document.visibilityState !== "hidden" &&
        navigator.onLine !== false
      ) {
        active.current = true;
        void load();
      }
    };
    // Background connectivity or relationship updates do not establish that
    // this private page is foreground again. Focus or an explicit recheck does.
    const refresh = () => {
      if (active.current) void load();
    };
    const visibility = () =>
      document.visibilityState === "hidden" ? hide() : resume();
    if (document.hasFocus()) resume();
    else hide();
    window.addEventListener("blur", hide);
    window.addEventListener("pagehide", hide);
    window.addEventListener("offline", hide);
    window.addEventListener("focus", resume);
    window.addEventListener("online", refresh);
    window.addEventListener("pageshow", resume);
    window.addEventListener("social-relationships-changed", refresh);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      hide();
      currentRead.current?.abort();
      window.removeEventListener("blur", hide);
      window.removeEventListener("pagehide", hide);
      window.removeEventListener("offline", hide);
      window.removeEventListener("focus", resume);
      window.removeEventListener("online", refresh);
      window.removeEventListener("pageshow", resume);
      window.removeEventListener("social-relationships-changed", refresh);
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
            if (
              document.hasFocus() &&
              document.visibilityState !== "hidden" &&
              navigator.onLine !== false
            ) {
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
