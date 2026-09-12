"use client";
import Link from "next/link";
import { Bookmark, AlertCircle } from "lucide-react";
import { ActionPopover } from "./action-popover";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  currentSocialOwner,
  socialRequest,
  SocialClientError
} from "@/lib/platform/social-client";
import { accountEntryHref } from "@/lib/platform/account-entry";
import { useUnsavedSocialWork } from "./use-unsaved-social-work";
type Item = { id: string; version: number; collectionId: string | null };
export function SavePostControl({
  postId,
  accountId
}: {
  postId: string;
  accountId: string | null;
}) {
  const router = useRouter();
  const [active, setActive] = useState(false),
    [recovery, setRecovery] = useState(false),
    [failed, setFailed] = useState(false),
    [owner, setOwner] = useState<string | null | undefined>(),
    [item, setItem] = useState<Item | null>(null),
    [ready, setReady] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [pending, setPending] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const actorRef = useRef<string | null | undefined>(undefined),
    generation = useRef(0),
    inFlight = useRef(false);
  useUnsavedSocialWork(
    { dirty: false, saving: !!pending, conflict: false },
    () => setMessage("Resolve the pending save before leaving.")
  );
  const load = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setReady(false);
    setFailed(false);
    const seq = ++generation.current;
    try {
      const actor = await currentSocialOwner();
      if (seq !== generation.current) return;
      if (actorRef.current !== undefined && actorRef.current !== actor) {
        setPending(null);
        router.refresh();
      }
      actorRef.current = actor;
      setOwner(actor);
      if (!actor) {
        setItem(null);
        setReady(true);
        return;
      }
      const r = await socialRequest<{ item: Item | null }>(
        `/api/platform/post-workspace?view=saved-status&postId=${encodeURIComponent(postId)}`,
        undefined,
        actor
      );
      if (seq !== generation.current) return;
      const recoveryHadFocus = document.activeElement?.closest(
        '[role="dialog"][aria-label="Bookmark recovery"]'
      );
      setItem(r.data.item);
      setReady(true);
      setRecovery(false);
      setMessage("Bookmark status checked.");
      if (recoveryHadFocus)
        requestAnimationFrame(() =>
          root.current
            ?.querySelector<HTMLButtonElement>("button.gc-post-action")
            ?.focus()
        );
    } catch (e) {
      if (seq === generation.current) {
        setFailed(true);
        setMessage(
          e instanceof Error ? e.message : "Saved status could not be checked."
        );
      }
    } finally {
      if (seq === generation.current) {
        inFlight.current = false;
        setBusy(false);
      }
    }
  }, [postId, router]);
  useEffect(() => {
    if (!accountId || active || !root.current) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setActive(true);
        observer.disconnect();
      }
    });
    observer.observe(root.current);
    return () => observer.disconnect();
  }, [accountId, active]);
  useEffect(() => {
    if (!active) return;
    void load();
    const conceal = () => {
      generation.current++;
      inFlight.current = false;
      setBusy(false);
      setReady(false);
    };
    const restore = () => {
      if (document.visibilityState !== "hidden") void load();
    };
    const visibility = () =>
      document.visibilityState === "hidden" ? conceal() : restore();
    window.addEventListener("blur", conceal);
    window.addEventListener("focus", restore);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      conceal();
      window.removeEventListener("blur", conceal);
      window.removeEventListener("focus", restore);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [active, load]);
  async function send(body: string) {
    if (inFlight.current || !ready || !owner) return;
    inFlight.current = true;
    setBusy(true);
    setPending(body);
    setFailed(false);
    setMessage("Saving your bookmark…");
    const seq = generation.current;
    try {
      await socialRequest("/api/platform/post-workspace", body, owner);
      if (seq !== generation.current) return;
      setPending(null);
      inFlight.current = false;
      await load();
      if (recovery) {
        setRecovery(false);
        requestAnimationFrame(() =>
          root.current
            ?.querySelector<HTMLButtonElement>("button.gc-post-action")
            ?.focus()
        );
      }
      setMessage(
        JSON.parse(body).operation === "remove-item"
          ? "Bookmark removed."
          : "Bookmarked privately in Unfiled."
      );
    } catch (e) {
      if (seq === generation.current) {
        setFailed(true);
        setRecovery(true);
        const status = e instanceof SocialClientError ? e.status : 503;
        if ([400, 401, 403, 404, 409, 429].includes(status)) setPending(null);
        if ([401, 403, 404, 409].includes(status)) setReady(false);
        if ([401, 403, 404].includes(status)) router.refresh();
        setMessage(
          e instanceof Error
            ? e.message
            : "The response was lost. Retry the same save choice."
        );
      }
    } finally {
      if (seq === generation.current) {
        inFlight.current = false;
        setBusy(false);
      }
    }
  }
  return (
    <div ref={root} className="gc-bookmark-control">
      {!accountId || owner === null ? (
        <Link
          className="gc-post-action"
          aria-label="Sign in to bookmark this post"
          href={accountEntryHref(
            "join",
            `/platform/posts/${postId}`,
            "account"
          )}
        >
          <Bookmark aria-hidden="true" />
          <span className="gc-post-action-label">Bookmark</span>
        </Link>
      ) : (
        <button
          type="button"
          className="gc-post-action"
          aria-label={ready && item ? "Remove bookmark" : "Bookmark"}
          aria-pressed={ready ? !!item : undefined}
          aria-busy={busy && !!pending}
          disabled={busy || !ready || !!pending}
          onClick={() =>
            void send(
              JSON.stringify({
                operation: item ? "remove-item" : "save-item",
                mutationId: crypto.randomUUID(),
                expectedVersion: item?.version ?? 0,
                ...(item ? { id: item.id } : { postId })
              })
            )
          }
        >
          <Bookmark
            aria-hidden="true"
            className={ready && item ? "fill-current" : ""}
          />
          <span className="gc-post-action-label">
            {busy ? "Checking…" : ready && item ? "Bookmarked" : "Bookmark"}
          </span>
        </button>
      )}
      <span role="status" className="sr-only">
        {busy
          ? pending
            ? "Saving bookmark…"
            : "Checking bookmark status…"
          : message}
      </span>
      {(failed || (!!pending && !busy) || recovery) && (
        <ActionPopover
          label="Bookmark recovery"
          trigger={
            <>
              <AlertCircle aria-hidden="true" />
              <span>Retry</span>
            </>
          }
          open={recovery}
          onOpenChange={setRecovery}
        >
          <p role="status">{busy ? "Checking bookmark…" : message}</p>
          {pending && (
            <button
              type="button"
              disabled={busy || !ready}
              onClick={() => void send(pending)}
            >
              Retry same save choice
            </button>
          )}
          <button type="button" disabled={busy} onClick={() => void load()}>
            Refresh saved status
          </button>
          <Link prefetch={false} href="/platform/saved">
            Open Bookmarks
          </Link>
        </ActionPopover>
      )}
    </div>
  );
}
