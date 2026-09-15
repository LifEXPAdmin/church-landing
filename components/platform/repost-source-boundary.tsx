"use client";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode
} from "react";
import type { FeedMode } from "@/lib/platform/feed-options";
import { useRouter } from "next/navigation";
import { socialRequest } from "@/lib/platform/social-client";
import { currentPostAvailability } from "@/lib/platform/post-availability-client";
import { ReadVisibility, useReadVisibility } from "./read-visibility";
/** Retained server content is concealed on loss of focus/access and refreshed by version. */
export function RepostSourceBoundary({
  entryId,
  entryVersion,
  sourceVersion,
  accountId,
  originalPost = false,
  preserveMounted = false,
  commentCount,
  likeCount,
  feedMode,
  feedKey,
  children
}: {
  entryId: string;
  entryVersion: number;
  sourceVersion: number | null;
  accountId: string | null;
  originalPost?: boolean;
  preserveMounted?: boolean;
  commentCount?: number;
  likeCount?: number;
  feedMode?: FeedMode;
  feedKey?: string;
  children: ReactNode;
}) {
  const router = useRouter(),
    root = useRef<HTMLDivElement>(null),
    activeReader = useRef(false),
    generation = useRef(0);
  const parentVisible = useReadVisibility();
  const [active, setActive] = useState(false),
    [visible, setVisible] = useState(originalPost || sourceVersion !== null),
    [message, setMessage] = useState("Original post unavailable.");
  const check = useCallback(async () => {
    if (document.visibilityState === "hidden") return;
    const seq = ++generation.current;
    try {
      const r = originalPost
        ? {
            data: {
              ...(await currentPostAvailability(
                entryId,
                accountId,
                feedMode,
                feedKey
              )),
              sourceVersion: null
            }
          }
        : await socialRequest<{
            available: boolean;
            entryVersion: number | null;
            sourceVersion: number | null;
            commentCount: number | null;
            likeCount: number | null;
          }>(
            `/api/platform/reposts?view=entry&id=${encodeURIComponent(entryId)}`,
            undefined,
            accountId
          );
      if (seq !== generation.current) return;
      const match =
        r.data.available &&
        r.data.entryVersion === entryVersion &&
        r.data.sourceVersion === sourceVersion &&
        (commentCount === undefined || r.data.commentCount === commentCount) &&
        (likeCount === undefined || r.data.likeCount === likeCount);
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
  }, [
    accountId,
    entryId,
    entryVersion,
    sourceVersion,
    originalPost,
    commentCount,
    likeCount,
    feedMode,
    feedKey,
    router
  ]);
  useEffect(() => {
    if (!root.current) return;
    const observer = new IntersectionObserver((entries) =>
      setActive(entries.some((e) => e.isIntersecting))
    );
    observer.observe(root.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    activeReader.current = active;
    if (active) void check();
  }, [active, check]);
  useEffect(() => {
    const hide = () => {
      generation.current++;
      setVisible(false);
    };
    const restore = () => {
      if (document.visibilityState !== "hidden") void check();
    };
    const visibility = () =>
      document.visibilityState === "hidden" ? hide() : restore();
    const timer = setInterval(() => {
      if (activeReader.current) restore();
    }, 30000);
    window.addEventListener("blur", hide);
    window.addEventListener("focus", restore);
    window.addEventListener("offline", hide);
    window.addEventListener("online", restore);
    window.addEventListener("pageshow", restore);
    window.addEventListener("social-relationships-changed", restore);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      hide();
      clearInterval(timer);
      window.removeEventListener("blur", hide);
      window.removeEventListener("focus", restore);
      window.removeEventListener("offline", hide);
      window.removeEventListener("online", restore);
      window.removeEventListener("pageshow", restore);
      window.removeEventListener("social-relationships-changed", restore);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [check]);
  return (
    <div ref={root}>
      {!visible && (
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
      {originalPost || preserveMounted ? (
        <ReadVisibility.Provider value={visible && parentVisible}>
          <div hidden={!visible} inert={!visible}>
            {children}
          </div>
        </ReadVisibility.Provider>
      ) : visible ? (
        children
      ) : null}
    </div>
  );
}

// Ordinary and full readers share the revocation owner. Conceal mounted forms
// without losing their local draft or uncertain request.
export function PostReadBoundary({
  enabled,
  postId,
  version,
  accountId,
  commentCount,
  likeCount,
  feedMode,
  feedKey,
  children
}: {
  enabled: boolean;
  postId: string;
  version: number;
  accountId: string | null;
  commentCount?: number;
  likeCount?: number;
  feedMode?: FeedMode;
  feedKey?: string;
  children: ReactNode;
}) {
  return enabled ? (
    <RepostSourceBoundary
      originalPost
      entryId={postId}
      entryVersion={version}
      sourceVersion={null}
      accountId={accountId}
      commentCount={commentCount}
      likeCount={likeCount}
      feedMode={feedMode}
      feedKey={feedKey}
    >
      {children}
    </RepostSourceBoundary>
  ) : (
    children
  );
}
