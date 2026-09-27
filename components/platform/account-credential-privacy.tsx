"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { currentSocialOwner } from "@/lib/platform/social-client";

// Keep the command owner mounted. Concealment removes presentation, while the
// caller retains its draft and uncertain outcome in memory, never storage.
export function useCredentialPrivacy(owner?: string, enabled = true) {
  const originalOwner = useRef(owner).current;
  const [visible, setVisible] = useState(false);
  const [notice, setNotice] = useState("Checking your current account…");
  const active = useRef(false),
    busy = useRef(false),
    generation = useRef(0);
  const redirect = useRef<string | null>(null);
  const hide = useCallback(() => {
    active.current = false;
    generation.current++;
    setVisible(false);
    setNotice(
      "Private entries are concealed. Recheck your current account to continue. If a response was lost, check your inbox or sign in before making another change."
    );
  }, []);
  const refresh = useCallback(async () => {
    if (
      !active.current ||
      busy.current ||
      document.visibilityState === "hidden" ||
      navigator.onLine === false
    )
      return;
    const request = ++generation.current;
    setVisible(false);
    setNotice("Checking your current account…");
    try {
      const current = await currentSocialOwner();
      if (request !== generation.current || !active.current) return;
      if (redirect.current) {
        // A confirmed password/email change intentionally revokes its session.
        // A missing session is not success unless the command returned success.
        if (current === null) window.location.replace(redirect.current);
        else
          setNotice(
            "The change was confirmed. Your sign-in has since changed. Reload before continuing."
          );
        return;
      }
      if (!originalOwner || current !== originalOwner) {
        setNotice(
          "Your sign-in changed. Private entries remain concealed. If a response was lost, try signing in with your new password or email and check your inbox before submitting another change."
        );
        return;
      }
      setVisible(true);
      setNotice("");
    } catch {
      if (request === generation.current && active.current)
        setNotice(
          "Your account could not be checked. Reconnect and recheck before continuing. No change is automatically repeated."
        );
    }
  }, [originalOwner]);
  const resume = useCallback(() => {
    if (document.visibilityState !== "hidden" && navigator.onLine !== false) {
      active.current = true;
      void refresh();
    }
  }, [refresh]);
  useEffect(() => {
    if (!enabled) return;
    const visibility = () =>
      document.visibilityState === "hidden" ? hide() : resume();
    resume();
    window.addEventListener("blur", hide);
    window.addEventListener("offline", hide);
    window.addEventListener("pagehide", hide);
    window.addEventListener("focus", resume);
    window.addEventListener("online", resume);
    window.addEventListener("pageshow", resume);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      hide();
      window.removeEventListener("blur", hide);
      window.removeEventListener("offline", hide);
      window.removeEventListener("pagehide", hide);
      window.removeEventListener("focus", resume);
      window.removeEventListener("online", resume);
      window.removeEventListener("pageshow", resume);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [enabled, hide, resume]);
  return {
    visible: !enabled || visible,
    notice,
    resume,
    begin: async () => {
      if (busy.current || !active.current || !visible || !originalOwner)
        throw new Error("Recheck your current account before continuing.");
      busy.current = true;
      const current = await currentSocialOwner();
      if (current !== originalOwner || !active.current)
        throw new Error("Your sign-in changed. Recheck before continuing.");
    },
    finish: (next?: unknown) => {
      if (typeof next === "string" && /^\/platform(?:[/?]|$)/.test(next))
        redirect.current = next;
      busy.current = false;
      setVisible(false);
      if (active.current) void refresh();
    }
  };
}

export function CredentialPrivacyNotice({
  value
}: {
  value: ReturnType<typeof useCredentialPrivacy>;
}) {
  return (
    <div className="space-y-3" data-credential-concealed>
      <p role="status">{value.notice}</p>
      <button
        type="button"
        className="gc-button gc-button-quiet"
        onClick={value.resume}
      >
        Recheck current account
      </button>
      <a className="block underline" href="/platform/login">
        Sign in
      </a>
    </div>
  );
}
