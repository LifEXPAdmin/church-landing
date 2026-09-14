"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { socialRequest, SocialClientError } from "@/lib/platform/social-client";
import {
  prayerUpdateLabels,
  type PrayerSavedPage
} from "@/lib/platform/prayer-types";
import { PrayerControl } from "./prayer-workspace";
import { useUnsavedSocialWork } from "./use-unsaved-social-work";

export function SavedPrayers({ owner }: { owner: string }) {
  const [page, setPage] = useState<PrayerSavedPage | null>(null),
    [busy, setBusy] = useState(false),
    [pending, setPending] = useState<string | null>(null),
    [message, setMessage] = useState("Checking your private prayer list…");
  const sequence = useRef(0),
    flight = useRef(false);
  useUnsavedSocialWork(
    { dirty: false, saving: !!pending, conflict: false },
    () => setMessage("Confirm your pending prayer-list change before leaving.")
  );
  const refresh = useCallback(
    async (after?: string) => {
      const seq = ++sequence.current;
      if (!after) setPage(null);
      try {
        const result = await socialRequest<PrayerSavedPage>(
          `/api/platform/prayers?view=saved${after ? `&after=${encodeURIComponent(after)}` : ""}`,
          undefined,
          owner
        );
        if (sequence.current !== seq) return;
        setPage((previous) => ({
          ...result.data,
          items: [
            ...new Map(
              [
                ...(after ? (previous?.items ?? []) : []),
                ...result.data.items
              ].map((item) => [item.id, item])
            ).values()
          ]
        }));
        setMessage("");
      } catch (error) {
        if (sequence.current !== seq) return;
        setPage(null);
        if (error instanceof SocialClientError && error.status === 401)
          setPending(null);
        setMessage(
          error instanceof Error
            ? error.message
            : "Your private prayer list could not be checked."
        );
      }
    },
    [owner]
  );
  useEffect(() => {
    const counter = sequence;
    const check = () => {
      if (!flight.current && document.visibilityState !== "hidden")
        void refresh();
    };
    const conceal = () => {
      sequence.current++;
      setPage(null);
    };
    const visibility = () =>
      document.visibilityState === "hidden" ? conceal() : check();
    check();
    window.addEventListener("focus", check);
    window.addEventListener("blur", conceal);
    window.addEventListener("online", check);
    window.addEventListener("pageshow", check);
    window.addEventListener("gc-prayers-changed", check);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      counter.current++;
      window.removeEventListener("focus", check);
      window.removeEventListener("blur", conceal);
      window.removeEventListener("online", check);
      window.removeEventListener("pageshow", check);
      window.removeEventListener("gc-prayers-changed", check);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [refresh]);
  async function remove(body: string) {
    if (flight.current) return;
    flight.current = true;
    setBusy(true);
    setPending(body);
    try {
      await socialRequest("/api/platform/prayers", body, owner);
      setPending(null);
      await refresh();
      setMessage(
        "Private save removed. Your prayer acknowledgment is unchanged."
      );
    } catch (error) {
      setPage(null);
      if (
        error instanceof SocialClientError &&
        [400, 401, 403, 404, 409, 429].includes(error.status)
      )
        setPending(null);
      setMessage(
        error instanceof Error
          ? error.message
          : "The response was lost. Retry the same private-save removal."
      );
    } finally {
      flight.current = false;
      setBusy(false);
    }
  }
  return (
    <div className="space-y-4">
      <p>
        Only you can see this list. Save a post or comment from its Pray button.
        Saving is separate from choosing I prayed and sharing your name.
      </p>
      <p role="status">
        {busy ? "Checking your prayer-list change…" : message}
      </p>
      {pending ? (
        <button
          type="button"
          className="gc-button"
          disabled={busy}
          onClick={() => void remove(pending)}
        >
          Retry same private-save removal
        </button>
      ) : (
        <button
          type="button"
          className="gc-button gc-button-quiet"
          disabled={busy}
          onClick={() => void refresh()}
        >
          Refresh private prayer list
        </button>
      )}
      {page && !page.items.length && <p>No saved prayers yet.</p>}
      {page?.items.map((row) => (
        <article
          key={row.id}
          className="space-y-3 rounded-xl border border-gc-border p-4"
        >
          {row.available && row.href ? (
            <>
              <h2 className="text-xl">
                <Link href={row.href} prefetch={false} className="underline">
                  {row.label}
                </Link>
              </h2>
              {row.latestUpdate && (
                <p>{prayerUpdateLabels[row.latestUpdate.kind]}</p>
              )}
              <p>
                {row.choice.updates
                  ? "Future author updates are on in Activity."
                  : "Author updates are off."}
              </p>
              <PrayerControl
                owner={owner}
                postId={row.postId}
                commentId={row.commentId}
              />
            </>
          ) : (
            <>
              <h2 className="text-xl">Source unavailable</h2>
              <p>
                This source is no longer available to your account. Its text and
                author details are hidden.
              </p>
            </>
          )}
          <button
            type="button"
            className="gc-button gc-button-quiet"
            disabled={busy || !!pending}
            onClick={() =>
              void remove(
                JSON.stringify({
                  operation: "followup",
                  postId: row.postId,
                  commentId: row.commentId,
                  desired: false,
                  updates: false,
                  expectedVersion: row.choice.version,
                  mutationId: crypto.randomUUID()
                })
              )
            }
          >
            Remove private save
          </button>
        </article>
      ))}
      {page?.nextCursor && (
        <button
          type="button"
          className="gc-button gc-button-quiet"
          disabled={busy || !!pending}
          onClick={() => void refresh(page.nextCursor!)}
        >
          More saved prayers
        </button>
      )}
      <Link
        href="/platform/settings/notifications/availability"
        className="inline-flex min-h-11 items-center underline"
      >
        Prayer phone-alert choices
      </Link>
    </div>
  );
}
