"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { socialRequest } from "@/lib/platform/social-client";
/** Preserve unsent forms while a current account/source check conceals the view. */
export function useFeedbackSnapshot<T>(
  owner: string | null,
  url: string,
  verify: (value: T) => boolean,
  label = "feedback"
) {
  const verifyCurrent = useRef(verify);
  verifyCurrent.current = verify;
  const [data, setData] = useState<T | null>(null),
    [visible, setVisible] = useState(false),
    [notice, setNotice] = useState(`Checking your current ${label} access…`),
    [busy, setBusy] = useState(false);
  const generation = useRef(0),
    active = useRef(true),
    reading = useRef(false),
    queued = useRef(false),
    latest = useRef<() => Promise<void>>(async () => {});
  const load = useCallback(async () => {
    if (!active.current || document.visibilityState === "hidden") return;
    if (reading.current) {
      queued.current = true;
      return;
    }
    reading.current = true;
    setBusy(true);
    setVisible(false);
    const seq = ++generation.current;
    try {
      const { data: next } = await socialRequest<T>(url, undefined, owner);
      if (seq !== generation.current) return;
      if (!verifyCurrent.current(next))
        throw Error("This view is not available to the current account.");
      setData(next);
      setVisible(true);
      setNotice("");
    } catch (error) {
      if (seq === generation.current)
        setNotice(
          error instanceof Error
            ? error.message
            : `Your ${label} could not be loaded. Your retained entries are concealed.`
        );
    } finally {
      reading.current = false;
      if (seq === generation.current) setBusy(false);
      if (queued.current && active.current) {
        queued.current = false;
        void latest.current();
      }
    }
  }, [owner, url, label]);
  latest.current = load;
  useEffect(() => {
    const hide = () => {
      active.current = false;
      generation.current++;
      setVisible(false);
      setBusy(false);
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
    window.addEventListener("offline", hide);
    window.addEventListener("focus", resume);
    window.addEventListener("online", resume);
    window.addEventListener("pageshow", resume);
    window.addEventListener("social-relationships-changed", resume);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      hide();
      queued.current = false;
      window.removeEventListener("blur", hide);
      window.removeEventListener("offline", hide);
      window.removeEventListener("focus", resume);
      window.removeEventListener("online", resume);
      window.removeEventListener("pageshow", resume);
      window.removeEventListener("social-relationships-changed", resume);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [load]);
  return { data, visible, notice, busy, load };
}
