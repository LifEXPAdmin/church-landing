"use client";
import { RegionalWallTime, RegionalTime } from "./regional-presentation";
import {
  useEffect,
  useCallback,
  useId,
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
import { socialRequest, SocialClientError } from "@/lib/platform/social-client";
import { useUnsavedSocialWork } from "./use-unsaved-social-work";
import { usePrivateRecovery } from "./private-snapshot-guard";

export function PostActionForm({
  owner,
  payload,
  label,
  children,
  fields,
  validate,
  onLatest,
  onSuccess,
  returnHref,
  disabled = false
}: {
  owner: string;
  payload: Record<string, unknown>;
  label: string;
  children: ReactNode;
  fields?: (data: FormData) => Record<string, unknown>;
  validate?: () => string | null;
  onLatest?: (post: PostEditorView) => void;
  onSuccess?: (id: string) => void;
  returnHref?: string;
  disabled?: boolean;
}) {
  const router = useRouter(),
    form = useRef<HTMLFormElement>(null),
    inFlight = useRef(false),
    version = useRef(payload.expectedVersion),
    status = useRef<HTMLParagraphElement>(null);
  const id = useId();
  const [dirty, setDirty] = useState(false),
    [retry, setRetry] = useState<string | null>(null);
  const [pending, setPending] = useState(false),
    [refreshing, refresh] = useTransition();
  const [message, setMessage] = useState("");
  const [saved, setSaved] = useState(false),
    [conflict, setConflict] = useState(false),
    [latest, setLatest] = useState<PostEditorView | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [needsSignIn, setNeedsSignIn] = useState(false);
  const busy = pending || refreshing;
  const retryOriginal = useCallback(() => form.current?.requestSubmit(), []);
  usePrivateRecovery(id, !!retry, busy, retryOriginal);
  useUnsavedSocialWork(
    { dirty, saving: busy || !!retry, conflict },
    () =>
      setMessage("Save or discard these local post changes before leaving."),
    true
  );
  useEffect(() => {
    if (message) status.current?.focus();
  }, [message]);
  return (
    <form
      ref={form}
      aria-label={label}
      aria-busy={busy}
      className="space-y-4"
      onChange={() => setDirty(true)}
      onSubmit={async (e) => {
        e.preventDefault();
        if (inFlight.current || busy || conflict || saved || disabled) return;
        const problem = retry ? null : validate?.();
        if (problem) {
          setMessage(problem);
          return;
        }
        const data = new FormData(e.currentTarget);
        const body =
          retry ??
          JSON.stringify({
            ...payload,
            expectedVersion: version.current,
            ...fields?.(data),
            mutationId: crypto.randomUUID()
          });
        setRetry(body);
        inFlight.current = true;
        setPending(true);
        setMessage("");
        try {
          const { data: result } = await socialRequest<{
            id: string;
            version: number;
            message: string;
          }>("/api/platform/posts", body, owner);
          if (
            typeof result.id !== "string" ||
            !Number.isInteger(result.version) ||
            typeof result.message !== "string"
          )
            throw new SocialClientError(
              503,
              "The response could not be confirmed. Retry the original request."
            );
          setNeedsSignIn(false);
          setMessage(result.message);
          setRetry(null);
          setDirty(false);
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
        } catch (error) {
          if (
            error instanceof SocialClientError &&
            [400, 409, 429].includes(error.status)
          )
            setRetry(null);
          setNeedsSignIn(
            error instanceof SocialClientError && error.status === 401
          );
          if (
            error instanceof SocialClientError &&
            error.status === 409 &&
            payload.postId
          ) {
            setConflict(true);
            setLatest(null);
            setMessage(
              `${error.message} Your entries are still here. Load the latest saved post and review it before saving again.`
            );
          } else
            setMessage(
              error instanceof Error
                ? error.message
                : "The response was interrupted. Your entries are still here. Retry the original request."
            );
        } finally {
          inFlight.current = false;
          setPending(false);
        }
      }}
    >
      <fieldset
        disabled={busy || !!retry || saved || disabled}
        className="min-w-0 space-y-4"
      >
        {children}
      </fieldset>
      {!saved && (
        <button
          type="submit"
          className={portalButtonClass}
          disabled={busy || conflict || disabled}
        >
          {busy ? "Saving…" : retry ? "Retry original request" : label}
        </button>
      )}
      {(dirty || retry || conflict) && (
        <button
          type="button"
          className={portalButtonClass}
          disabled={busy}
          onClick={() => {
            if (
              confirm(
                "Reload and discard these local post changes? An unconfirmed request may already be saved."
              )
            )
              window.location.reload();
          }}
        >
          Discard local changes and reload
        </button>
      )}
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
            returnHref ??
              (payload.postId
                ? `/platform/posts/${payload.postId}`
                : "/platform"),
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
              const { data: result } = await socialRequest<PostEditorView>(
                `/api/platform/posts?postId=${encodeURIComponent(String(payload.postId))}`,
                undefined,
                owner
              );
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
          <p className="whitespace-pre-wrap break-words">
            Content note: {latest.contentNote || "None"}
          </p>
          <p className="whitespace-pre-wrap break-words">
            Safe excerpt: {latest.safeExcerpt || "None"}
          </p>
          <p>Scripture: {latest.scripture || "None"}</p>
          <p className="[overflow-wrap:anywhere]">
            Link: {latest.linkUrl || "None"}. Preview:{" "}
            {latest.linkTitle || latest.linkDescription || "None"}
          </p>
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
          <p>
            Reposting:{" "}
            {latest.allowReposts ? "Allowed for public sources" : "Not allowed"}
            .
          </p>
          <p>Pinned until: {latest.pinUntil ? <RegionalTime value={latest.pinUntil} defaultText={latest.pinUntil} options={{year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "UTC", timeZoneName: "short"}} /> : "Not pinned"}</p>
          {latest.churchAuthor && (
            <p className="break-words">
              Publication:{" "}
              {latest.status === "SCHEDULED"
                ? <><RegionalWallTime value={latest.scheduleLocal} /> in {latest.scheduleZone}</>
                : latest.status === "DRAFT"
                  ? "Draft; no active plan"
                  : "Published"}
              .
            </p>
          )}
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
