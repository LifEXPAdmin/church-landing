"use client";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode
} from "react";
import { useRouter } from "next/navigation";
import { socialRequest } from "@/lib/platform/social-client";
/** Retained server content is concealed on loss of focus/access and refreshed by version. */
export function RepostSourceBoundary({
  entryId,
  entryVersion,
  sourceVersion,
  accountId,
  children
}: {
  entryId: string;
  entryVersion: number;
  sourceVersion: number | null;
  accountId: string | null;
  children: ReactNode;
}) {
  const router = useRouter(),
    root = useRef<HTMLDivElement>(null),
    generation = useRef(0);
  const [active, setActive] = useState(false),
    [visible, setVisible] = useState(sourceVersion !== null),
    [message, setMessage] = useState("Original post unavailable.");
  const check = useCallback(async () => {
    if (document.visibilityState === "hidden") return;
    const seq = ++generation.current;
    try {
      const r = await socialRequest<{
        available: boolean;
        entryVersion: number | null;
        sourceVersion: number | null;
      }>(
        `/api/platform/reposts?view=entry&id=${encodeURIComponent(entryId)}`,
        undefined,
        accountId
      );
      if (seq !== generation.current) return;
      const match =
        r.data.available &&
        r.data.entryVersion === entryVersion &&
        r.data.sourceVersion === sourceVersion;
      setVisible(match);
      setMessage("Original post unavailable.");
      if (r.data.available && !match) {
        setMessage("Refreshing the original post…");
        router.refresh();
      }
    } catch {
      if (seq === generation.current) {
        setVisible(false);
        setMessage("Reconnect to check the original post.");
      }
    }
  }, [accountId, entryId, entryVersion, sourceVersion, router]);
  useEffect(() => {
    if (!root.current) return;
    const observer = new IntersectionObserver((entries) =>
      setActive(entries.some((e) => e.isIntersecting))
    );
    observer.observe(root.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!active) return;
    void check();
    const hide = () => {
      generation.current++;
      setVisible(false);
    };
    const restore = () => {
      if (document.visibilityState !== "hidden") void check();
    };
    const visibility = () =>
      document.visibilityState === "hidden" ? hide() : restore();
    const timer = setInterval(restore, 30000);
    window.addEventListener("blur", hide);
    window.addEventListener("focus", restore);
    window.addEventListener("offline", hide);
    window.addEventListener("online", restore);
    window.addEventListener("social-relationships-changed", restore);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      hide();
      clearInterval(timer);
      window.removeEventListener("blur", hide);
      window.removeEventListener("focus", restore);
      window.removeEventListener("offline", hide);
      window.removeEventListener("online", restore);
      window.removeEventListener("social-relationships-changed", restore);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [active, check]);
  return (
    <div ref={root}>
      {visible ? (
        children
      ) : (
        <div className="rounded-xl border border-gc-border p-4 text-sm">
          <p role="status">{message}</p>
          <button
            type="button"
            className="mt-2 min-h-11 underline"
            onClick={() => void check()}
          >
            Check original availability
          </button>
        </div>
      )}
    </div>
  );
}
