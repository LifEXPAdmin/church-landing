"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { socialRequest } from "@/lib/platform/social-client";
import type { OriginalPostView } from "@/lib/platform/post-reads";
import { PostText } from "./post-text";
import { PostPhotos } from "./post-photos";
import { PostLink } from "./post-link";
export function SourcePreview({
  source,
  accountId
}: {
  source: OriginalPostView;
  accountId: string | null;
}) {
  return (
    <div
      className="min-w-0 space-y-3 rounded-xl border border-gc-border p-4"
      aria-label="Original post preview"
    >
      <Link
        className="font-semibold underline"
        href={`/platform/posts/${source.id}`}
      >
        Original post by {source.author.name}
      </Link>
      <p className="text-sm text-gc-muted">
        <time dateTime={new Date(source.createdAt).toISOString()}>
          {new Date(source.createdAt).toLocaleString("en", {
            timeZone: "UTC",
            dateStyle: "medium",
            timeStyle: "short"
          })}
        </time>
        {" UTC"}
        {source.editedAt ? " · Edited" : ""} · Public
      </p>
      <PostText content={source.content} />
      <PostLink {...source} />
      {source.scripture && <p>{source.scripture}</p>}
      {source.photoCount > 0 && (
        <PostPhotos postId={source.id} accountId={accountId} />
      )}
    </div>
  );
}
export function QuoteDraftPreview({
  sourceId,
  accountId,
  onAvailability
}: {
  sourceId: string;
  accountId: string;
  onAvailability: (available: boolean) => void;
}) {
  const [source, setSource] = useState<OriginalPostView | null>(null),
    [message, setMessage] = useState("Checking the original post…"),
    generation = useRef(0),
    change = useRef(onAvailability);
  change.current = onAvailability;
  const load = useCallback(async () => {
    const seq = ++generation.current;
    setSource(null);
    change.current(false);
    try {
      const r = await socialRequest<{
        source: OriginalPostView | null;
        canRepost: boolean;
        message: string;
      }>(
        `/api/platform/reposts?sourceId=${encodeURIComponent(sourceId)}`,
        undefined,
        accountId
      );
      if (seq === generation.current) {
        setSource(r.data.source);
        setMessage(r.data.message);
        change.current(r.data.canRepost);
      }
    } catch (e) {
      if (seq === generation.current)
        setMessage(
          e instanceof Error ? e.message : "Original post unavailable."
        );
    }
  }, [sourceId, accountId]);
  useEffect(() => {
    void load();
    const hide = () => {
      generation.current++;
      setSource(null);
      change.current(false);
    };
    const restore = () => {
      if (document.visibilityState !== "hidden") void load();
    };
    const visibility = () =>
      document.visibilityState === "hidden" ? hide() : restore();
    const timer = setInterval(restore, 30000);
    window.addEventListener("blur", hide);
    window.addEventListener("focus", restore);
    window.addEventListener("offline", hide);
    window.addEventListener("online", restore);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      hide();
      clearInterval(timer);
      window.removeEventListener("blur", hide);
      window.removeEventListener("focus", restore);
      window.removeEventListener("offline", hide);
      window.removeEventListener("online", restore);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [load]);
  return (
    <div>
      {source ? (
        <SourcePreview source={source} accountId={accountId} />
      ) : (
        <p
          role="status"
          className="rounded-xl border border-gc-border p-4 text-sm"
        >
          {message}
        </p>
      )}
      <button
        type="button"
        className="min-h-11 text-sm underline"
        onClick={() => void load()}
      >
        Check original post
      </button>
    </div>
  );
}
