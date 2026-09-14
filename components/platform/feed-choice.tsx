"use client";
import { useRef, useState } from "react";
import {
  FEED_MODES,
  GUEST_FEED_COOKIE,
  feedChoices,
  type FeedMode
} from "@/lib/platform/feed-options";
import {
  currentSocialOwner,
  socialRequest,
  SocialClientError
} from "@/lib/platform/social-client";

export type FeedChoiceState = {
  mode: FeedMode;
  scope: string;
  ownerId: string | null;
  preferenceVersion: number;
  pageCursor: string;
  requestedCursor?: string;
};
export function FeedChoice({
  value,
  empty,
  canChange,
  onNavigate
}: {
  value: FeedChoiceState;
  empty: boolean;
  canChange: () => boolean;
  onNavigate: (href: string) => void;
}) {
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const pending = useRef<{
    body: string;
    mode: FeedMode;
    owner: string;
  } | null>(null);
  function destination(mode: FeedMode) {
    const url = new URL(location.href);
    for (const key of [
      "post",
      "before",
      "cursor",
      "through",
      "anchor",
      "feedCursor",
      "refreshFeed"
    ])
      url.searchParams.delete(key);
    url.searchParams.set("feed", mode);
    url.searchParams.set("feedScope", value.scope);
    return url.pathname + url.search;
  }
  async function choose(mode: FeedMode, retry = false) {
    if (busy || (!retry && !canChange())) return;
    setBusy(true);
    setMessage("");
    try {
      if (value.ownerId) {
        const request = pending.current ?? {
          owner: value.ownerId,
          mode,
          body: JSON.stringify({
            mode,
            expectedVersion: value.preferenceVersion,
            mutationId: crypto.randomUUID()
          })
        };
        pending.current = request;
        await socialRequest("/api/platform/feed", request.body, request.owner);
        pending.current = null;
        onNavigate(destination(request.mode));
      } else {
        if ((await currentSocialOwner()) !== null)
          throw new SocialClientError(
            401,
            "Your sign-in changed. Reload before choosing a feed."
          );
        document.cookie = `${GUEST_FEED_COOKIE}=${mode}; Path=/; Max-Age=31536000; SameSite=Lax; Secure`;
        onNavigate(destination(mode));
      }
    } catch (error) {
      // Keep an uncertain request byte-for-byte. A known rejection made no
      // preference change, and can be resolved by reloading current settings.
      if (
        error instanceof SocialClientError &&
        [400, 403, 409].includes(error.status)
      )
        pending.current = null;
      setMessage(
        error instanceof Error
          ? error.message
          : "Your feed choice could not be confirmed."
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div
      className="mb-4 space-y-2"
      data-reader-busy={busy}
      data-reader-dirty={!!pending.current}
    >
      <label className="flex flex-wrap items-center gap-3 font-semibold">
        Feed
        <select
          aria-label="Choose feed"
          className="min-h-11 max-w-full rounded-lg border border-gc-border bg-gc-surface px-3 py-2"
          value={value.mode}
          disabled={busy || !!pending.current}
          onChange={(event) => void choose(event.target.value as FeedMode)}
        >
          {FEED_MODES.map((mode) => (
            <option key={mode} value={mode}>
              {feedChoices[mode].label}
            </option>
          ))}
        </select>
      </label>
      <p className="text-sm text-gc-muted">
        {feedChoices[value.mode].description}
      </p>
      {empty && value.mode !== "latest" && (
        <button
          type="button"
          className="gc-button gc-button-quiet"
          disabled={busy || !!pending.current}
          onClick={() => void choose("latest")}
        >
          Open Latest
        </button>
      )}
      {busy && <p role="status">Saving your feed choice…</p>}
      {message && (
        <div role="status" className="space-y-2 text-sm">
          <p>{message}</p>
          {pending.current ? (
            <button
              type="button"
              className="gc-button gc-button-quiet"
              disabled={busy}
              onClick={() => void choose(pending.current!.mode, true)}
            >
              Retry the same feed choice
            </button>
          ) : (
            <button
              type="button"
              className="gc-button gc-button-quiet"
              onClick={() => {
                if (canChange()) location.reload();
              }}
            >
              Reload feed settings
            </button>
          )}
        </div>
      )}
    </div>
  );
}
