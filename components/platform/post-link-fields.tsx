"use client";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction
} from "react";
import type { PostDraft } from "./post-draft-fields";
import { portalInputClass, portalButtonClass } from "./portal-action-form";
import { PostLink } from "./post-link";
export function PostLinkFields({
  draft,
  change
}: {
  draft: PostDraft;
  change: Dispatch<SetStateAction<PostDraft>>;
}) {
  const id = useId(),
    active = useRef<AbortController | null>(null),
    root = useRef<HTMLDivElement>(null);
  const [pending, setPending] = useState(false),
    [message, setMessage] = useState("");
  useEffect(() => {
    const form = root.current?.closest("form");
    const stop = () => {
      active.current?.abort();
      active.current = null;
      setPending(false);
    };
    form?.addEventListener("submit", stop);
    return () => {
      active.current?.abort();
      form?.removeEventListener("submit", stop);
    };
  }, []);
  function reset(linkUrl: string) {
    active.current?.abort();
    active.current = null;
    setPending(false);
    setMessage("");
    change((d) => ({
      ...d,
      linkUrl,
      linkReceipt: undefined,
      linkPreview: null,
      keepLinkPreview: false
    }));
  }
  async function preview() {
    if (active.current) return;
    const controller = new AbortController();
    active.current = controller;
    setPending(true);
    setMessage("");
    try {
      const response = await fetch("/api/platform/posts", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        signal: controller.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operation: "preview-link",
          linkUrl: draft.linkUrl
        })
      });
      const result = await response.json();
      if (controller.signal.aborted) return;
      setMessage(
        result.message ??
          "A preview is unavailable. You can still publish the plain link."
      );
      if (response.ok)
        change((d) => ({
          ...d,
          linkUrl: result.url,
          linkReceipt: result.receipt,
          linkPreview: result.preview,
          keepLinkPreview: !!result.preview
        }));
    } catch {
      if (!controller.signal.aborted)
        setMessage(
          "A preview is unavailable. You can still publish the plain link."
        );
    } finally {
      if (active.current === controller) {
        active.current = null;
        setPending(false);
      }
    }
  }
  return (
    <div ref={root} className="min-w-0 space-y-2">
      <label className="block font-semibold" htmlFor={id}>
        Optional public HTTPS link
      </label>
      <input
        id={id}
        type="url"
        inputMode="url"
        autoComplete="off"
        className={portalInputClass}
        value={draft.linkUrl ?? ""}
        onChange={(e) => reset(e.target.value)}
        aria-describedby={`${id}-help`}
      />
      <p id={`${id}-help`} className="text-sm text-gc-muted">
        Share a page anyone can open. Add a text preview if you want; a plain
        link works too.
      </p>
      {draft.linkUrl && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={portalButtonClass}
            disabled={pending}
            onClick={() => void preview()}
          >
            {pending ? "Loading preview…" : "Get link preview"}
          </button>
          {draft.keepLinkPreview && (
            <button
              type="button"
              className={portalButtonClass}
              onClick={() => {
                active.current?.abort();
                active.current = null;
                setPending(false);
                change((d) => ({
                  ...d,
                  keepLinkPreview: false,
                  linkPreview: null
                }));
                setMessage(
                  "Preview removed. Your plain link will still be included."
                );
              }}
            >
              Remove preview
            </button>
          )}
          <button
            type="button"
            className={portalButtonClass}
            onClick={() => reset("")}
          >
            Remove link
          </button>
        </div>
      )}
      <p role="status" className="text-sm text-gc-muted">
        {pending
          ? "Loading preview. You can publish with a plain link while you wait."
          : message}
      </p>
      {draft.keepLinkPreview && draft.linkPreview && (
        <PostLink
          linkUrl={draft.linkUrl}
          linkTitle={draft.linkPreview.title}
          linkDescription={draft.linkPreview.description}
          linkSourceUrl={draft.linkPreview.sourceUrl}
        />
      )}
    </div>
  );
}
