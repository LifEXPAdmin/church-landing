"use client";
import Link from "next/link";
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
export function SavePostControl({ postId }: { postId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false),
    [owner, setOwner] = useState<string | null | undefined>(),
    [item, setItem] = useState<Item | null>(null),
    [ready, setReady] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [pending, setPending] = useState<string | null>(null);
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
      setItem(r.data.item);
      setReady(true);
    } catch (e) {
      if (seq === generation.current)
        setMessage(
          e instanceof Error ? e.message : "Saved status could not be checked."
        );
    } finally {
      if (seq === generation.current) {
        inFlight.current = false;
        setBusy(false);
      }
    }
  }, [postId, router]);
  useEffect(() => {
    if (!open) return;
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
  }, [open, load]);
  async function send(body: string) {
    if (inFlight.current || !ready || !owner) return;
    inFlight.current = true;
    setBusy(true);
    setPending(body);
    setMessage("Saving your choice…");
    const seq = generation.current;
    try {
      await socialRequest("/api/platform/post-workspace", body, owner);
      if (seq !== generation.current) return;
      setPending(null);
      inFlight.current = false;
      await load();
      setMessage(
        JSON.parse(body).operation === "remove-item"
          ? "Removed from your saved posts."
          : "Post saved privately to Unfiled."
      );
    } catch (e) {
      if (seq === generation.current) {
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
    <details
      open={open}
      onToggle={(e) => setOpen(e.currentTarget.open)}
      className="rounded border border-gc-divider p-2"
    >
      <summary className="min-h-11 cursor-pointer py-2 font-semibold">
        Save post
      </summary>
      {open && (
        <div
          role="group"
          aria-label="Private save choices"
          className="space-y-3"
        >
          <p role="status">{busy ? "Checking saved status…" : message}</p>
          {ready && owner === null && (
            <Link
              className="gc-button gc-button-quiet"
              href={accountEntryHref(
                "join",
                `/platform/posts/${postId}`,
                "account"
              )}
            >
              Sign in to save this post
            </Link>
          )}
          {ready && owner && (
            <>
              <p>
                Only you can see your saved posts. Saving does not extend access
                to the original.
              </p>
              <button
                type="button"
                className="gc-button gc-button-quiet"
                disabled={busy || !!pending}
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
                {item ? "Remove from saved" : "Save privately"}
              </button>
              <Link
                prefetch={false}
                className="gc-button gc-button-quiet"
                href="/platform/saved"
              >
                Manage saved collections
              </Link>
            </>
          )}
          {pending && (
            <button
              type="button"
              className="gc-button gc-button-quiet"
              disabled={busy || !ready}
              onClick={() => void send(pending)}
            >
              Retry same save choice
            </button>
          )}
          <button
            type="button"
            className="gc-button gc-button-quiet"
            disabled={busy}
            onClick={() => void load()}
          >
            Refresh saved status
          </button>
        </div>
      )}
    </details>
  );
}
