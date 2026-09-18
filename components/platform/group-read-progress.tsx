"use client";
import { useEffect, useRef, useState } from "react";
import {
  socialRequest,
  type CommentThreadPage
} from "@/lib/platform/social-client";

export type GroupReadPage = { proof: string; scope: string; ids: string[] };
export function groupReadPage(page: CommentThreadPage): GroupReadPage | null {
  if (!page.readProof || !page.readScope) return null;
  return {
    proof: page.readProof,
    scope: page.readScope,
    ids: [
      ...new Set(
        [
          ...page.items,
          ...(page.root ? [page.root] : []),
          ...(page.target ? [page.target] : [])
        ]
          .filter((row) => !row.unavailable)
          .map((row) => row.id)
      )
    ]
  };
}
// The server proof bounds the page. The observer narrows it to comment bodies
// actually presented on screen, without marking unseen earlier pages or following.
export function GroupReadProgress({
  postId,
  owner,
  pages,
  visible
}: {
  postId: string;
  owner: string | null | undefined;
  pages: GroupReadPage[];
  visible: boolean;
}) {
  const state = useRef({ key: "", post: false, ids: new Set<string>() });
  const [message, setMessage] = useState("");
  useEffect(() => {
    if (
      !owner ||
      !visible ||
      !pages.length ||
      !document.hasFocus() ||
      document.visibilityState === "hidden"
    )
      return;
    const scope = pages.at(-1)!.scope,
      key = `${owner}:${postId}:${scope}`;
    if (state.current.key !== key)
      state.current = { key, post: false, ids: new Set() };
    const current = pages.filter((p) => p.scope === scope),
      seen = new Set<string>(),
      failed = new Set<string>();
    const root = document.querySelector(
      `[data-comment-thread][data-post-id="${postId}"]`
    );
    if (!root) return;
    let active = true,
      sawHeading = false,
      busy = false,
      timer: ReturnType<typeof setTimeout> | undefined;
    const flush = async () => {
      if (
        !active ||
        busy ||
        !document.hasFocus() ||
        document.visibilityState === "hidden"
      )
        return;
      busy = true;
      try {
        for (const page of current) {
          if (!active || failed.has(page.proof)) continue;
          const ids = page.ids.filter(
            (id) => seen.has(id) && !state.current.ids.has(id)
          );
          if (!ids.length && (!sawHeading || state.current.post)) continue;
          try {
            await socialRequest(
              "/api/platform/groups",
              JSON.stringify({
                operation: "read-progress",
                postId,
                proof: page.proof,
                shownIds: ids
              }),
              owner
            );
            if (!active || state.current.key !== key) return;
            state.current.post = true;
            for (const id of ids) state.current.ids.add(id);
            // A reopened page can acknowledge old positions again. Bound local memory.
            if (state.current.ids.size > 1000)
              state.current.ids = new Set([...state.current.ids].slice(-500));
            setMessage("");
          } catch {
            failed.add(page.proof);
            if (active)
              setMessage(
                "Read progress could not be saved. Reload the discussion to retry; following is unchanged."
              );
          }
        }
      } finally {
        busy = false;
      }
    };
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries)
          if (entry.isIntersecting) {
            const id = (entry.target as HTMLElement).dataset
              .groupCommentContent;
            if (id) seen.add(id);
            else sawHeading = true;
          }
        clearTimeout(timer);
        timer = setTimeout(() => void flush(), 600);
      },
      { threshold: 0.25 }
    );
    root
      .querySelectorAll(
        "[data-group-comment-content], [data-group-read-heading]"
      )
      .forEach((node) => observer.observe(node));
    return () => {
      active = false;
      observer.disconnect();
      clearTimeout(timer);
    };
  }, [owner, postId, pages, visible]);
  return message ? (
    <p role="status" className="text-sm text-gc-muted">
      {message}
    </p>
  ) : null;
}
