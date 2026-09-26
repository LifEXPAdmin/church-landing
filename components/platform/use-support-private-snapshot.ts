"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { SupportSnapshot } from "@/lib/platform/support-types";
import { socialRequest, SocialClientError } from "@/lib/platform/social-client";

// Keep the original account-bound context and mounted command owners.
// By default, a current read never replaces dirty or uncertain context.
// Feedback may accept a newer snapshot only while its command owners survive.
export function useSupportPrivateSnapshot(
  owner: string,
  url: string,
  label: string,
  options?: {
    verifySnapshot?: (snapshot: SupportSnapshot) => boolean;
    canReplaceSnapshot?: (
      before: SupportSnapshot,
      next: SupportSnapshot
    ) => boolean;
  }
) {
  const rules = useRef(options);
  rules.current = options;
  const accepted = useRef<SupportSnapshot | null>(null);
  const [snapshot, setSnapshot] = useState<SupportSnapshot | null>(null);
  const [visible, setVisible] = useState(false);
  const [currentAccess, setCurrentAccess] = useState(false);
  const [notice, setNotice] = useState(`Checking current ${label} access…`);
  const [denied, setDenied] = useState(false);
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
    setVisible(false);
    setCurrentAccess(false);
    setNotice(`Checking current ${label} access…`);
    setDenied(false);
    try {
      const { data } = await socialRequest<SupportSnapshot>(
        url,
        undefined,
        owner
      );
      if (
        data.viewer.id !== owner ||
        rules.current?.verifySnapshot?.(data) === false
      )
        throw Error("This view is not available to the current account.");
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
      setCurrentAccess(true);
      const changed = checksum.current !== null && checksum.current !== digest;
      if (
        changed &&
        !(
          accepted.current &&
          rules.current?.canReplaceSnapshot?.(accepted.current, data)
        )
      ) {
        setNotice(
          `This ${label} or its access changed. Reload to inspect current details. Unsaved entries will be cleared; an unconfirmed request may already be saved.`
        );
      } else {
        if (checksum.current === null || changed) {
          checksum.current = digest;
          accepted.current = data;
          setSnapshot(data);
        }
        setVisible(true);
        setNotice("");
      }
    } catch (error) {
      if (seq === generation.current) {
        setDenied(error instanceof SocialClientError && error.status === 404);
        setNotice(
          error instanceof Error
            ? error.message
            : `Current ${label} access could not be confirmed.`
        );
      }
    } finally {
      reading.current = false;
      if (queued.current && active.current) {
        queued.current = false;
        void latest.current();
      }
    }
  }, [owner, url, label]);
  latest.current = load;
  const hide = useCallback(() => {
    active.current = false;
    queued.current = false;
    generation.current++;
    setVisible(false);
    setCurrentAccess(false);
    setNotice(`Checking current ${label} access…`);
  }, [label]);
  useEffect(() => {
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
  }, [load, hide]);
  const recheck = useCallback(() => {
    if (document.visibilityState !== "hidden") {
      active.current = true;
      void load();
    }
  }, [load]);
  return { snapshot, visible, currentAccess, notice, denied, hide, recheck };
}
