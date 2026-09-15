"use client";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode
} from "react";
import { socialRequest } from "@/lib/platform/social-client";
import { ReadVisibility, useReadVisibility } from "./read-visibility";

/** Retained public details disappear when their current publication or account changes.
 * Keep mounted forms and require explicit reload instead of rebasing unsaved work. */
export function TopicReadBoundary({
  owner,
  url,
  checksum,
  children
}: {
  owner: string | null;
  url: string;
  checksum: string;
  children: ReactNode;
}) {
  const [visible, setVisible] = useState(true),
    [notice, setNotice] = useState("");
  const generation = useRef(0),
    parentVisible = useReadVisibility();
  const check = useCallback(async () => {
    if (document.visibilityState === "hidden") return;
    const seq = ++generation.current;
    try {
      const { data } = await socialRequest<unknown>(url, undefined, owner);
      const digest = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(JSON.stringify(data))
      );
      if (seq !== generation.current) return;
      const same =
        Array.from(new Uint8Array(digest), (b) =>
          b.toString(16).padStart(2, "0")
        ).join("") === checksum;
      setVisible(same);
      setNotice(
        same
          ? ""
          : "Topic information changed. Reload to read the current page."
      );
    } catch {
      if (seq === generation.current) {
        setVisible(false);
        setNotice(
          "Current topic access could not be confirmed. Reconnect and check again."
        );
      }
    }
  }, [owner, url, checksum]);
  useEffect(() => {
    const hide = () => {
      generation.current++;
      setVisible(false);
    };
    const resume = () => {
      void check();
    };
    const visibility = () =>
      document.visibilityState === "hidden" ? hide() : resume();
    void check();
    const timer = setInterval(resume, 30000);
    window.addEventListener("blur", hide);
    window.addEventListener("offline", hide);
    for (const event of [
      "focus",
      "online",
      "pageshow",
      "social-relationships-changed"
    ])
      window.addEventListener(event, resume);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      hide();
      clearInterval(timer);
      window.removeEventListener("blur", hide);
      window.removeEventListener("offline", hide);
      for (const event of [
        "focus",
        "online",
        "pageshow",
        "social-relationships-changed"
      ])
        window.removeEventListener(event, resume);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [check]);
  return (
    <>
      {!visible && (
        <div className="space-y-3 rounded-xl border border-gc-divider p-4">
          <p role="status">{notice || "Checking current topic information…"}</p>
          <button
            className="gc-button gc-button-quiet"
            type="button"
            onClick={() => void check()}
          >
            Check topic access
          </button>{" "}
          <button
            className="gc-button gc-button-quiet"
            type="button"
            onClick={() => {
              if (
                confirm(
                  "Reload the current page? Any unsaved local entries will be cleared. An unconfirmed request may already be saved."
                )
              )
                window.location.reload();
            }}
          >
            Reload current topic page
          </button>
        </div>
      )}
      <ReadVisibility.Provider value={visible && parentVisible}>
        <div hidden={!visible} inert={!visible}>
          {children}
        </div>
      </ReadVisibility.Provider>
    </>
  );
}
