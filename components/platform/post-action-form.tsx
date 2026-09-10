"use client";
import {
  useEffect,
  useRef,
  useState,
  useTransition,
  type ReactNode
} from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { PostEditorView } from "@/lib/platform/post-editor";
import { accountEntryHref } from "@/lib/platform/account-entry";
import { portalButtonClass } from "./portal-action-form";

export function PostActionForm({
  payload,
  label,
  children,
  fields,
  validate,
  onLatest,
  onSuccess,
  disabled = false
}: {
  payload: Record<string, unknown>;
  label: string;
  children: ReactNode;
  fields?: (data: FormData) => Record<string, unknown>;
  validate?: () => string | null;
  onLatest?: (post: PostEditorView) => void;
  onSuccess?: (id: string) => void;
  disabled?: boolean;
}) {
  const router = useRouter(),
    inFlight = useRef(false),
    version = useRef(payload.expectedVersion),
    requestKey = useRef(payload.requestKey),
    status = useRef<HTMLParagraphElement>(null);
  const [pending, setPending] = useState(false),
    [refreshing, refresh] = useTransition();
  const [message, setMessage] = useState("");
  const [saved, setSaved] = useState(false),
    [conflict, setConflict] = useState(false),
    [latest, setLatest] = useState<PostEditorView | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [needsSignIn, setNeedsSignIn] = useState(false);
  const busy = pending || refreshing;
  useEffect(() => {
    if (message) status.current?.focus();
  }, [message]);
  return (
    <form
      aria-label={label}
      aria-busy={busy}
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        if (inFlight.current || busy || conflict || saved || disabled) return;
        const problem = validate?.();
        if (problem) {
          setMessage(problem);
          return;
        }
        const data = new FormData(e.currentTarget);
        inFlight.current = true;
        setPending(true);
        setMessage("");
        try {
          const response = await fetch("/api/platform/posts", {
            method: "POST",
            credentials: "same-origin",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              ...payload,
              expectedVersion: version.current,
              requestKey: requestKey.current,
              ...fields?.(data)
            })
          });
          const result = await response.json();
          setNeedsSignIn(response.status === 401);
          setMessage(
            typeof result.message === "string"
              ? result.message
              : "The response could not be confirmed. Your entries are still here."
          );
          if (response.ok) {
            version.current = result.version;
            setSaved(true);
            setSavedId(result.id);
            setLatest(null);
            onSuccess?.(result.id);
            if (payload.operation === "withdraw") {
              window.location.assign("/platform");
              return;
            }
            refresh(() => router.refresh());
          } else if (response.status === 409 && payload.postId) {
            setConflict(true);
            setLatest(null);
            setMessage(
              `${result.message} Your entries are still here. Load the latest saved post and review it before saving again.`
            );
          }
        } catch {
          setMessage(
            "The response was interrupted. Your entries are still here. Try again to check or save this same request."
          );
        } finally {
          inFlight.current = false;
          setPending(false);
        }
      }}
    >
      <fieldset
        disabled={busy || saved || disabled}
        className="min-w-0 space-y-4"
      >
        {children}
        <button type="submit" className={portalButtonClass} disabled={conflict}>
          {busy ? "Saving…" : label}
        </button>
      </fieldset>
      <p
        ref={status}
        role="status"
        tabIndex={-1}
        className="text-sm text-gc-text focus:outline-none"
      >
        {message}
      </p>
      {needsSignIn && (
        <a
          className="inline-flex min-h-11 items-center text-gc-accent underline"
          target="_blank"
          rel="noopener noreferrer"
          href={accountEntryHref(
            "login",
            payload.postId ? `/platform/posts/${payload.postId}` : "/platform",
            "participate"
          )}
        >
          Sign in in a new tab, then return to this draft
        </a>
      )}
      {saved && payload.operation === "create" && savedId && (
        <Link
          className="inline-flex min-h-11 items-center text-gc-accent underline"
          href={`/platform/posts/${savedId}`}
        >
          View saved post
        </Link>
      )}
      {saved &&
        payload.operation !== "create" &&
        payload.operation !== "withdraw" && (
          <button
            type="button"
            disabled={busy}
            className={portalButtonClass}
            onClick={() => {
              setSaved(false);
              setMessage("");
            }}
          >
            Make another change
          </button>
        )}
      {conflict && (
        <button
          type="button"
          disabled={busy}
          className={portalButtonClass}
          onClick={async () => {
            if (inFlight.current) return;
            inFlight.current = true;
            setPending(true);
            try {
              const response = await fetch(
                `/api/platform/posts?postId=${encodeURIComponent(String(payload.postId))}`,
                { credentials: "same-origin", cache: "no-store" }
              );
              const result = await response.json();
              if (!response.ok) {
                setLatest(null);
                setMessage(
                  result.message ?? "The latest post could not be loaded."
                );
                return;
              }
              setLatest(result);
              setMessage(
                "The latest saved post is shown below. Your form entries are unchanged."
              );
            } catch {
              setLatest(null);
              setMessage(
                "The latest post could not be loaded. Your draft is still here; try again."
              );
            } finally {
              inFlight.current = false;
              setPending(false);
            }
          }}
        >
          Load latest saved post
        </button>
      )}
      {conflict && latest && (
        <section
          aria-label="Latest saved post"
          className="space-y-3 rounded-xl border border-gc-divider p-4"
        >
          <h3 className="text-xl">Latest saved post</h3>
          <p className="whitespace-pre-wrap break-words">{latest.content}</p>
          <p>Scripture: {latest.scripture || "None"}</p>
          <p>Topics: {latest.topics.join(", ") || "None"}</p>
          <p>
            Audience:{" "}
            {latest.audience === "PUBLIC"
              ? "Public"
              : "Approved church members"}
            . Discussion: {latest.discussionClosed ? "Closed" : "Open"}.
            Replies:{" "}
            {latest.replyAudience === "VIEWERS"
              ? "Eligible viewers"
              : "Approved church members"}
            .
          </p>
          <p>Pinned until: {latest.pinUntil ?? "Not pinned"}</p>
          <button
            type="button"
            className={portalButtonClass}
            disabled={busy}
            onClick={() => {
              version.current = latest.version;
              onLatest?.(latest);
              setConflict(false);
              setLatest(null);
              setMessage(
                "Latest version reviewed. Check your retained entries and audience before saving."
              );
            }}
          >
            I reviewed this version; keep my draft
          </button>
        </section>
      )}
    </form>
  );
}
