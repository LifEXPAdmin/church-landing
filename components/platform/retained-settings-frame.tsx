"use client";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode
} from "react";
import { useRouter } from "next/navigation";
import { ReadVisibility } from "./read-visibility";
const foreground = () =>
  document.hasFocus() &&
  document.visibilityState !== "hidden" &&
  navigator.onLine;

/** Preserve the working tree above the account-keyed shell while separately
 * checking each fresh server identity and current browser access. */
export function RetainedSettingsFrame({
  owner,
  children,
  returnTo = "/platform/settings/display/reading",
  reactivation = false
}: {
  owner: string | null;
  children: ReactNode;
  returnTo?: string;
  reactivation?: boolean;
}) {
  const [original, setOriginal] = useState(
    owner ? { owner, frame: children } : null
  );
  if (!original) {
    if (owner) setOriginal({ owner, frame: children });
    return children;
  }
  return (
    <OriginalSettingsFrame
      owner={owner}
      original={original}
      revision={children}
      returnTo={returnTo}
      reactivation={reactivation}
    />
  );
}
function OriginalSettingsFrame({
  owner,
  original,
  revision,
  returnTo,
  reactivation
}: {
  owner: string | null;
  original: { owner: string; frame: ReactNode };
  revision: ReactNode;
  returnTo: string;
  reactivation: boolean;
}) {
  const router = useRouter();
  const [visible, setVisible] = useState(false),
    [notice, setNotice] = useState("Checking current settings access…");
  const generation = useRef(0),
    matches = useRef(owner === original.owner);
  const flight = useRef<AbortController | null>(null);
  const hide = useCallback(() => {
    generation.current++;
    flight.current?.abort();
    setVisible(false);
  }, []);
  const check = useCallback(async () => {
    hide();
    if (!matches.current) {
      setNotice(
        "This page keeps the original account and unsaved choices. Return to that account to continue."
      );
    }
    if (!foreground()) return;
    const seq = generation.current,
      abort = new AbortController();
    flight.current = abort;
    const timer = setTimeout(() => abort.abort(), 10000);
    try {
      const response = await fetch("/api/platform/profile?view=identity", {
        credentials: "same-origin",
        cache: "no-store",
        signal: abort.signal,
        headers: { "X-Expected-Account": original.owner }
      });
      const data = await response.json();
      if (!response.ok || data.id !== original.owner)
        throw Error(
          "Return to the original account to recover your unsaved settings."
        );
      if (seq !== generation.current || !foreground()) return;
      if (!matches.current) {
        setNotice(
          "The original account is back. Checking the current page before restoring your choices…"
        );
        router.refresh();
        return;
      }
      setVisible(true);
      setNotice("");
    } catch (error) {
      if (seq === generation.current)
        setNotice(
          error instanceof Error
            ? error.message
            : "Reconnect to check your original settings access."
        );
    } finally {
      clearTimeout(timer);
    }
  }, [hide, original.owner, router]);
  useLayoutEffect(() => {
    matches.current = owner === original.owner;
    void check();
    return hide;
  }, [owner, original.owner, check, hide, revision]);
  useEffect(() => {
    const restore = () => void check();
    const visibility = () =>
      document.visibilityState === "hidden" ? hide() : restore();
    for (const event of ["blur", "offline", "pagehide"])
      window.addEventListener(event, hide);
    for (const event of ["focus", "online", "pageshow"])
      window.addEventListener(event, restore);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      hide();
      for (const event of ["blur", "offline", "pagehide"])
        window.removeEventListener(event, hide);
      for (const event of ["focus", "online", "pageshow"])
        window.removeEventListener(event, restore);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [check, hide]);
  const allowed = visible && owner === original.owner;
  return (
    <>
      {!allowed && (
        <section
          className="container-shell space-y-3 py-8"
          aria-label="Original settings access"
        >
          <p role="status">{notice || "Checking current settings access…"}</p>
          <button
            type="button"
            className="gc-button"
            onClick={() => void check()}
          >
            Recheck original settings access
          </button>
          <a
            className="gc-button gc-button-quiet"
            href={"/platform/login?next=" + encodeURIComponent(returnTo)}
            target="_blank"
            rel="noopener noreferrer"
          >
            Sign in in another tab to recover settings
          </a>
          {reactivation && (
            <p>
              If a deactivation response was lost, check sign-in or{" "}
              <a
                className="underline"
                href="/platform/account/reactivate"
                target="_blank"
                rel="noopener noreferrer"
              >
                reactivation in another tab
              </a>{" "}
              before submitting again. No request is automatically repeated.
            </p>
          )}
          <button
            type="button"
            className="gc-button gc-button-quiet"
            onClick={() => window.location.reload()}
          >
            Reload settings and discard retained entries
          </button>
        </section>
      )}
      <ReadVisibility.Provider value={allowed}>
        <div hidden={!allowed} inert={!allowed}>
          {original.frame}
        </div>
      </ReadVisibility.Provider>
    </>
  );
}
