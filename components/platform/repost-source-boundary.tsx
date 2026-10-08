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
import { usePrivatePostWorkspace } from "./private-post-workspace";
import { ReadVisibility, useReadVisibility } from "./read-visibility";
const hasCurrentForeground = () =>
  document.visibilityState === "visible" &&
  document.hasFocus() &&
  navigator.onLine;
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
  const privateScope = usePrivatePostWorkspace();
  const privateRefresh = privateScope?.refresh;
  // Back/Forward can remount cached server children. Their retained versions
  // identify the reading position, but do not confirm current access.
  const [active, setActive] = useState(false),
    [visible, setVisible] = useState(false),
    [denied, setDenied] = useState(false),
    [message, setMessage] = useState("Checking this post…");
  const check = useCallback(async () => {
    if (!!privateRefresh) return;
    if (!hasCurrentForeground()) {
      generation.current++;
      setVisible(false);
      return;
    }
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
      if (!hasCurrentForeground()) {
        setVisible(false);
        return;
      }
      const match =
        r.data.available &&
        r.data.entryVersion === entryVersion &&
        r.data.sourceVersion === sourceVersion &&
        (commentCount === undefined || r.data.commentCount === commentCount) &&
        (likeCount === undefined || r.data.likeCount === likeCount);
      setVisible(match);
      setDenied(!r.data.available);
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
    router,
    privateRefresh
  ]);
  useEffect(() => {
    if (privateRefresh || !root.current) return;
    const observer = new IntersectionObserver((entries) =>
      setActive(entries.some((e) => e.isIntersecting))
    );
    observer.observe(root.current);
    return () => observer.disconnect();
  }, [privateRefresh]);
  useEffect(() => {
    if (privateRefresh) return;
    activeReader.current = active;
    if (active) void check();
  }, [active, check, parentVisible, privateRefresh]);
  useEffect(() => {
    if (privateRefresh) return;
    const hide = () => {
      generation.current++;
      setVisible(false);
      setMessage("Checking this post…");
    };
    const restore = () => {
      hide();
      if (hasCurrentForeground()) void check();
    };
    const visibility = () =>
      document.visibilityState === "hidden" ? hide() : restore();
    const timer = setInterval(() => {
      // Routine checks keep mounted work usable while awaiting revalidation.
      if (activeReader.current) void check();
    }, 30000);
    window.addEventListener("blur", hide);
    window.addEventListener("pagehide", hide);
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
      window.removeEventListener("pagehide", hide);
      window.removeEventListener("focus", restore);
      window.removeEventListener("offline", hide);
      window.removeEventListener("online", restore);
      window.removeEventListener("pageshow", restore);
      window.removeEventListener("social-relationships-changed", restore);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [check, privateRefresh]);
  // The private stream owns one bounded current selection/source read. Running
  // another per-card refresh owner would duplicate reads and can form a loop.
  if (privateRefresh)
    return originalPost || sourceVersion !== null ? (
      children
    ) : parentVisible ? (
      <p>Original post unavailable.</p>
    ) : null;
  // Keep a returning List's geometry while authorization is pending. Opacity
  // conceals the entire subtree even if a descendant sets its own visibility.
  // Only a confirmed denial collapses retained content; forms keep their owner.
  const reserveSpace =
    !visible && !denied && (originalPost || sourceVersion !== null);
  return (
    <div ref={root} className="relative">
      {!visible && (
        <div
          className={`rounded-xl border border-gc-border p-4 text-sm ${reserveSpace ? "absolute inset-x-0 top-0" : ""}`}
        >
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
      {originalPost || preserveMounted || visible || reserveSpace ? (
        <ReadVisibility.Provider value={visible && parentVisible}>
          <div
            hidden={!visible && !reserveSpace}
            inert={!visible}
            aria-hidden={!visible || undefined}
            style={
              reserveSpace
                ? {
                    visibility: "hidden",
                    opacity: 0,
                    pointerEvents: "none"
                  }
                : undefined
            }
          >
            {children}
          </div>
        </ReadVisibility.Provider>
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
