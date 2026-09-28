"use client";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode
} from "react";
import Link from "next/link";
import { socialRequest } from "@/lib/platform/social-client";
import { TopicCreateForm } from "./topic-controls";
import { ReadVisibility, useReadVisibility } from "./read-visibility";

// Keep the original create controller above the shell's account-keyed providers.
// A guest has no draft yet; the first authenticated tree becomes its owner.
export function TopicCreateScope({
  owner,
  children
}: {
  owner: string | null;
  children: ReactNode;
}) {
  const [original, setOriginal] = useState({ owner, children });
  const previousOwner = useRef(owner);
  const parentVisible = useReadVisibility();
  if (!original.owner && owner) setOriginal({ owner, children });
  useLayoutEffect(() => {
    if (previousOwner.current === owner) return;
    previousOwner.current = owner;
    window.dispatchEvent(new Event("blur"));
    if (owner === original.owner) window.dispatchEvent(new Event("focus"));
  }, [owner, original.owner]);
  return (
    <>
      {original.owner && owner !== original.owner && (
        <p role="status" className="m-4 rounded-xl border p-4">
          This topic draft belongs to the account that opened it. Return to that
          account to continue, or reload to start with the current account.
        </p>
      )}
      <ReadVisibility.Provider
        value={parentVisible && (!original.owner || owner === original.owner)}
      >
        {original.owner ? original.children : children}
      </ReadVisibility.Provider>
    </>
  );
}

// Eligibility is read only after hydration. The controller stays mounted while
// its private input presentation is removed; access refresh never rebases a save.
export function TopicCreateWorkspace({ owner }: { owner: string }) {
  const originalOwner = useRef(owner).current;
  const scopeVisible = useReadVisibility();
  const [visible, setVisible] = useState(false);
  const [opened, setOpened] = useState(false);
  const [notice, setNotice] = useState(
    "Checking current topic account access…"
  );
  const active = useRef(false),
    foreground = useRef(false),
    reading = useRef(false),
    queued = useRef(false),
    generation = useRef(0),
    visibleNow = useRef(false),
    scopeNow = useRef(scopeVisible);
  const latest = useRef<() => Promise<void>>(async () => {});
  const hide = useCallback(() => {
    active.current = false;
    queued.current = false;
    generation.current++;
    visibleNow.current = false;
    setVisible(false);
    setNotice("Checking current topic account access…");
  }, []);
  useLayoutEffect(() => {
    scopeNow.current = scopeVisible;
    if (!scopeVisible) hide();
  }, [scopeVisible, hide]);
  const read = useCallback(async () => {
    if (
      !active.current ||
      !scopeNow.current ||
      document.visibilityState === "hidden"
    )
      return;
    if (reading.current) {
      queued.current = true;
      return;
    }
    reading.current = true;
    const seq = ++generation.current;
    visibleNow.current = false;
    setVisible(false);
    setNotice("Checking current topic account access…");
    try {
      const { data } = await socialRequest<{
        accountId: string | null;
        eligible: boolean;
      }>("/api/platform/topics?view=eligibility", undefined, originalOwner);
      if (seq !== generation.current || !active.current || !scopeNow.current)
        return;
      if (
        data.accountId !== originalOwner ||
        typeof data.eligible !== "boolean"
      )
        throw Error(
          "Your topic account access could not be confirmed. Recheck before continuing."
        );
      if (!data.eligible) {
        setNotice(
          "Verify your email and adult participation before creating or joining topics. Your local draft is retained."
        );
        return;
      }
      visibleNow.current = true;
      setOpened(true);
      setVisible(true);
      setNotice("");
    } catch (error) {
      if (seq === generation.current && active.current)
        setNotice(
          error instanceof Error
            ? error.message
            : "Current topic account access could not be confirmed."
        );
    } finally {
      reading.current = false;
      if (queued.current && active.current) {
        queued.current = false;
        void latest.current();
      }
    }
  }, [originalOwner]);
  latest.current = read;
  useEffect(() => {
    const conceal = () => {
      foreground.current = false;
      hide();
    };
    const resume = () => {
      if (!scopeNow.current || document.visibilityState === "hidden") return;
      foreground.current = true;
      active.current = true;
      void read();
    };
    const refresh = () => {
      if (foreground.current) resume();
    };
    const visibility = () =>
      document.visibilityState === "hidden" ? conceal() : resume();
    if (scopeVisible) resume();
    else conceal();
    window.addEventListener("blur", conceal);
    window.addEventListener("pagehide", conceal);
    window.addEventListener("offline", conceal);
    window.addEventListener("focus", resume);
    window.addEventListener("pageshow", resume);
    window.addEventListener("online", refresh);
    window.addEventListener("social-relationships-changed", refresh);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      conceal();
      window.removeEventListener("blur", conceal);
      window.removeEventListener("pagehide", conceal);
      window.removeEventListener("offline", conceal);
      window.removeEventListener("focus", resume);
      window.removeEventListener("pageshow", resume);
      window.removeEventListener("online", refresh);
      window.removeEventListener("social-relationships-changed", refresh);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [scopeVisible, read, hide]);
  const accessVersion = useCallback(
    () =>
      active.current && visibleNow.current && scopeNow.current
        ? generation.current
        : null,
    []
  );
  const concealed = !visible || !scopeVisible;
  return (
    <>
      {concealed && (
        <div className="space-y-3 rounded-xl border p-4">
          <p role="status">
            {notice || "Checking current topic account access…"}
          </p>
          <button
            type="button"
            className="gc-button gc-button-quiet"
            onClick={() => {
              if (!scopeNow.current || document.visibilityState === "hidden")
                return;
              foreground.current = true;
              active.current = true;
              void read();
            }}
          >
            Recheck current access
          </button>
          <button
            type="button"
            className="gc-button gc-button-quiet"
            onClick={() => {
              if (
                confirm(
                  "Reload current information and discard this local topic draft? An unconfirmed request may already be saved. Reloading does not undo saved changes."
                )
              )
                window.location.reload();
            }}
          >
            Reload current information
          </button>
          <Link
            prefetch={false}
            className="inline-flex min-h-11 items-center underline"
            href="/platform/settings/account"
          >
            Review account verification
          </Link>
        </div>
      )}
      {opened && (
        <TopicCreateForm
          owner={originalOwner}
          concealed={concealed}
          accessVersion={accessVersion}
        />
      )}
    </>
  );
}
