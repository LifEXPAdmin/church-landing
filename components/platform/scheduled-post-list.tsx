"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { getScheduledPosts } from "@/lib/platform/post-editor";
import { socialRequest } from "@/lib/platform/social-client";

type ScheduledPage = Awaited<ReturnType<typeof getScheduledPosts>>;

// This read-only list owns no pending writes. Fetch private excerpts only after
// hydration, and discard them on concealment instead of serializing server
// children into the page. Only the first confirmed digest survives rechecks.
export function ScheduledPostList({
  owner,
  url
}: {
  owner: string;
  url: string;
}) {
  const [page, setPage] = useState<ScheduledPage | null>(null);
  const [notice, setNotice] = useState(
    "Checking current scheduled posts access…"
  );
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
    setPage(null);
    setNotice("Checking current scheduled posts access…");
    try {
      const { data } = await socialRequest<ScheduledPage>(
        url,
        undefined,
        owner
      );
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
      if (checksum.current !== null && checksum.current !== digest) {
        setNotice(
          "Your scheduled posts or publishing access changed. Reload to inspect current details."
        );
      } else {
        checksum.current = digest;
        setPage(data);
        setNotice("");
      }
    } catch (error) {
      if (seq === generation.current)
        setNotice(
          error instanceof Error
            ? error.message
            : "Current scheduled posts access could not be confirmed."
        );
    } finally {
      reading.current = false;
      if (queued.current && active.current) {
        queued.current = false;
        void latest.current();
      }
    }
  }, [owner, url]);
  latest.current = load;
  useEffect(() => {
    const hide = () => {
      active.current = false;
      queued.current = false;
      generation.current++;
      setPage(null);
      setNotice("Checking current scheduled posts access…");
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
  }, [load]);
  if (!page)
    return (
      <div className="space-y-3 rounded-xl border p-4">
        <p role="status">{notice}</p>
        <button
          type="button"
          className="gc-button gc-button-quiet"
          onClick={() => void load()}
        >
          Recheck current access
        </button>
        <button
          type="button"
          className="gc-button gc-button-quiet"
          onClick={() => window.location.reload()}
        >
          Reload current information
        </button>
      </div>
    );
  return (
    <>
      {page.items.length ? (
        <ul className="space-y-4">
          {page.items.map((post) => (
            <li
              key={post.id}
              className="space-y-2 rounded-xl border border-gc-divider p-4"
            >
              <h2 className="break-words text-xl">{post.church}</h2>
              <p className="break-words">{post.excerpt}</p>
              <p className="break-words text-sm">
                {post.status === "SCHEDULED"
                  ? `${post.scheduleLocal?.replace("T", " ")} · ${post.scheduleZone}`
                  : "Draft · publication needs review"}
              </p>
              <Link
                className="gc-button"
                href={`/platform/scheduled-posts/${post.id}`}
              >
                Manage scheduled post
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p>No unpublished church posts are available on this page.</p>
      )}
      {page.nextCursor && (
        <Link
          className="gc-button"
          href={`/platform/scheduled-posts?after=${page.nextCursor}`}
        >
          More scheduled posts
        </Link>
      )}
      {new URLSearchParams(url.split("?")[1]).has("after") && (
        <Link
          className="gc-button gc-button-quiet"
          href="/platform/scheduled-posts"
        >
          Back to first page
        </Link>
      )}
    </>
  );
}
