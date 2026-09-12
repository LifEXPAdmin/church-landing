"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Repeat2 } from "lucide-react";
import { portalInputClass } from "./portal-action-form";
import { ActionPopover } from "./action-popover";
import { useUnsavedSocialWork } from "./use-unsaved-social-work";
import { socialRequest, SocialClientError } from "@/lib/platform/social-client";
import { accountEntryHref } from "@/lib/platform/account-entry";
import type { PostComposerOptions } from "@/lib/platform/post-editor";
import type { OriginalPostView } from "@/lib/platform/post-reads";
type Options = {
  source: OriginalPostView | null;
  sourceId: string | null;
  existing: {
    id: string;
    version: number;
    audience: "PUBLIC" | "CHURCH";
  } | null;
  canRepost: boolean;
  message: string;
};
export function RepostControl({
  postId,
  accountId,
  ownEntry,
  undoOnly = false
}: {
  postId: string;
  accountId: string | null;
  ownEntry?: { id: string; version: number };
  undoOnly?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false),
    [options, setOptions] = useState<Options | null>(null),
    [churches, setChurches] = useState<PostComposerOptions["churches"]>([]),
    [destination, setDestination] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [pending, setPending] = useState<{
      path: string;
      body: string;
      quoteId?: string;
    } | null>(null);
  const generation = useRef(0),
    inFlight = useRef(false);
  useUnsavedSocialWork(
    { dirty: false, saving: !!pending, conflict: false },
    () => {
      setOpen(true);
      setMessage("Confirm the pending action before leaving.");
    }
  );
  const load = useCallback(async () => {
    if (!accountId || inFlight.current || undoOnly) return;
    const seq = ++generation.current;
    setOptions(null);
    setBusy(true);
    try {
      const q = new URLSearchParams({
        sourceId: postId,
        ...(destination
          ? {
              authorChurchId: destination,
              audienceChurchId: destination,
              audience: "CHURCH"
            }
          : {})
      });
      const [r, c] = await Promise.all([
        socialRequest<Options>(
          `/api/platform/reposts?${q}`,
          undefined,
          accountId
        ),
        socialRequest<PostComposerOptions>(
          "/api/platform/posts?view=composer",
          undefined,
          accountId
        )
      ]);
      if (seq !== generation.current) return;
      setOptions(r.data);
      setChurches(c.data.churches.filter((c) => c.canPublish));
      setMessage(r.data.message);
    } catch (e) {
      if (seq === generation.current)
        setMessage(
          e instanceof Error
            ? e.message
            : "Repost choices could not be checked."
        );
    } finally {
      if (seq === generation.current) setBusy(false);
    }
  }, [accountId, postId, destination, undoOnly]);
  useEffect(() => {
    if (!open) return;
    void load();
    const hide = () => {
      generation.current++;
      setOptions(null);
      setBusy(false);
    };
    const restore = () => {
      if (document.visibilityState !== "hidden") void load();
    };
    const visibility = () =>
      document.visibilityState === "hidden" ? hide() : restore();
    window.addEventListener("blur", hide);
    window.addEventListener("focus", restore);
    window.addEventListener("online", restore);
    window.addEventListener("offline", hide);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      hide();
      window.removeEventListener("blur", hide);
      window.removeEventListener("focus", restore);
      window.removeEventListener("online", restore);
      window.removeEventListener("offline", hide);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [open, load]);
  async function send(work: NonNullable<typeof pending>) {
    if (inFlight.current || !accountId) return;
    inFlight.current = true;
    setBusy(true);
    setPending(work);
    setMessage("Confirming your action…");
    try {
      const r = await socialRequest<{ message: string }>(
        work.path,
        work.body,
        accountId
      );
      setPending(null);
      setMessage(r.data.message);
      setOptions(null);
      if (work.quoteId) {
        setOpen(false);
        router.push(
          `/platform/drafts?resume=${encodeURIComponent(work.quoteId)}`
        );
      } else {
        router.refresh();
      }
    } catch (e) {
      if (
        e instanceof SocialClientError &&
        [400, 401, 403, 404, 409, 429].includes(e.status)
      ) {
        setPending(null);
        setOptions(null);
        if (e.status === 401) setOpen(false);
        if ([401, 403, 404, 409].includes(e.status)) router.refresh();
      }
      setMessage(
        e instanceof Error
          ? e.message
          : "The response was lost. Retry the same action to confirm it."
      );
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  function action(kind: "repost" | "quote" | "undo") {
    if (pending || busy) return;
    if (kind === "quote" && options?.sourceId) {
      const id = crypto.randomUUID();
      void send({
        path: "/api/platform/post-workspace",
        quoteId: id,
        body: JSON.stringify({
          operation: "save-draft",
          mutationId: crypto.randomUUID(),
          id,
          expectedVersion: 0,
          payload: {
            content: "",
            quoteSourceId: options.sourceId,
            replyAudience: "VIEWERS",
            audience: destination ? "CHURCH" : "PUBLIC",
            authorChurchId: destination || null,
            audienceChurchId: destination || null
          }
        })
      });
      return;
    }
    const existing = undoOnly ? ownEntry : options?.existing;
    if (kind === "undo" && existing)
      void send({
        path: "/api/platform/reposts",
        body: JSON.stringify({
          operation: "undo",
          mutationId: crypto.randomUUID(),
          id: existing.id,
          expectedVersion: existing.version
        })
      });
    if (kind === "repost" && options?.source)
      void send({
        path: "/api/platform/reposts",
        body: JSON.stringify({
          operation: "repost",
          mutationId: crypto.randomUUID(),
          sourceId: options.sourceId,
          expectedSourceVersion: options.source.version,
          ...(destination
            ? {
                authorChurchId: destination,
                audienceChurchId: destination,
                audience: "CHURCH"
              }
            : {})
        })
      });
  }
  return (
    <ActionPopover
      label={undoOnly ? "Undo repost" : "Repost choices"}
      open={open}
      onOpenChange={setOpen}
      trigger={
        <>
          <Repeat2 aria-hidden="true" />
          <span className="gc-post-action-label">
            {undoOnly ? "Undo repost" : "Repost"}
          </span>
          {pending && <span aria-label="Confirmation needed">!</span>}
        </>
      }
    >
      {!accountId ? (
        <Link
          className="gc-button gc-button-quiet"
          href={accountEntryHref(
            "join",
            `/platform/posts/${postId}`,
            "account"
          )}
        >
          Sign in to repost
        </Link>
      ) : (
        <div className="space-y-3" aria-busy={busy}>
          {!undoOnly && churches.length > 0 && (
            <label className="block text-sm">
              Repost destination
              <select
                aria-label="Repost destination"
                className={portalInputClass}
                value={destination}
                disabled={!!pending || busy}
                onChange={(e) => setDestination(e.target.value)}
              >
                <option value="">My public profile</option>
                {churches.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} · church members
                  </option>
                ))}
              </select>
            </label>
          )}
          {options?.existing && (
            <p className="text-sm text-gc-muted">
              Existing repost:{" "}
              {options.existing.audience === "PUBLIC"
                ? "Public"
                : "Church members"}
              .
            </p>
          )}
          {pending ? (
            <button
              type="button"
              className="gc-button gc-button-primary"
              disabled={busy}
              onClick={() => void send(pending)}
            >
              Retry same action
            </button>
          ) : (
            <>
              {undoOnly || options?.existing ? (
                <button
                  type="button"
                  className="gc-button gc-button-quiet"
                  disabled={busy}
                  onClick={() => action("undo")}
                >
                  Undo repost
                </button>
              ) : (
                <button
                  type="button"
                  className="gc-button gc-button-quiet"
                  disabled={busy || !options?.canRepost}
                  onClick={() => action("repost")}
                >
                  Repost
                </button>
              )}
              {!undoOnly && (
                <button
                  type="button"
                  className="gc-button gc-button-quiet"
                  disabled={busy || !options?.canRepost}
                  onClick={() => action("quote")}
                >
                  Add your thoughts
                </button>
              )}
              {!undoOnly && (
                <button
                  type="button"
                  className="text-sm underline"
                  disabled={busy}
                  onClick={() => void load()}
                >
                  Refresh choices
                </button>
              )}
            </>
          )}
          <p role="status" className="text-sm text-gc-muted">
            {busy
              ? "Checking…"
              : message ||
                (undoOnly
                  ? "This removes your repost and leaves the original unchanged."
                  : "Checking current permissions…")}
          </p>
        </div>
      )}
    </ActionPopover>
  );
}
