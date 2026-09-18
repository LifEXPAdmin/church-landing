"use client";
import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useFeedbackSnapshot } from "./use-feedback-snapshot";
import { FeedBreakReminder } from "./feed-break-reminder";
const DiscoverySettings = dynamic(
  () => import("./discovery-settings").then((m) => m.DiscoverySettings),
  { loading: () => <p role="status">Loading feed settings…</p> }
);
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
  followingLists?: {
    selectedId: string | null;
    lists: Array<{ id: string; name: string }>;
    version: number;
  } | null;
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
  // A visible native select can be changed before React owns its events.
  // Keep the server-rendered controls unavailable until their handlers mount.
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  const [settingsOpen, setSettingsOpen] = useState(false);
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
  async function choose(
    mode: FeedMode,
    retry = false,
    followingListId?: string | null
  ) {
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
            ...(followingListId !== undefined
              ? {
                  followingListId,
                  expectedListsVersion: value.followingLists?.version ?? 0
                }
              : {}),
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
      id="feed-choice"
      tabIndex={-1}
      className="mb-2 space-y-2"
      data-reader-busy={!ready || busy}
      data-reader-dirty={!!pending.current}
    >
      <div
        role="group"
        aria-label="Main feeds"
        className="flex flex-wrap gap-1"
      >
        {FEED_MODES.slice(0, 4).map((mode) => (
          <button
            key={mode}
            type="button"
            className="gc-feed-choice"
            aria-pressed={value.mode === mode}
            disabled={!ready || busy || !!pending.current}
            onClick={() => void choose(mode)}
          >
            {feedChoices[mode].label}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <label className="flex flex-wrap items-center gap-2 text-sm">
          More feeds
          <select
            aria-label="Choose feed"
            className="min-h-11 max-w-full rounded-lg border border-gc-border bg-gc-surface px-3 py-2"
            value={FEED_MODES.slice(4).includes(value.mode) ? value.mode : ""}
            disabled={!ready || busy || !!pending.current}
            onChange={(event) => void choose(event.target.value as FeedMode)}
          >
            <option value="" disabled>
              Choose another feed
            </option>
            {FEED_MODES.slice(4).map((mode) => (
              <option key={mode} value={mode}>
                {feedChoices[mode].label}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="inline-flex min-h-11 items-center text-sm underline"
          disabled={!ready || busy || !!pending.current}
          aria-expanded={settingsOpen}
          onClick={() => {
            if (canChange()) setSettingsOpen(!settingsOpen);
          }}
        >
          Feed Settings
        </button>
      </div>
      <p className="text-sm text-gc-muted">
        {feedChoices[value.mode].description}
      </p>
      {value.ownerId && value.mode === "following" && value.followingLists && (
        <PrivateFollowingChoice
          owner={value.ownerId}
          value={value.followingLists}
          disabled={!ready || busy || !!pending.current}
          onChoose={(id) => void choose("following", false, id)}
        />
      )}
      {settingsOpen && (
        <DiscoverySettings
          key={value.ownerId ?? "guest"}
          owner={value.ownerId}
          initialMode={value.mode}
          onSaved={(mode) => {
            setSettingsOpen(false);
            onNavigate(destination(mode));
          }}
        />
      )}
      <FeedBreakReminder showSettings={settingsOpen} />
      {empty && value.mode !== "latest" && (
        <button
          type="button"
          className="gc-button gc-button-quiet"
          disabled={!ready || busy || !!pending.current}
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

function PrivateFollowingChoice({
  owner,
  value,
  disabled,
  onChoose
}: {
  owner: string;
  value: NonNullable<FeedChoiceState["followingLists"]>;
  disabled: boolean;
  onChoose: (id: string | null) => void;
}) {
  const snapshot = useFeedbackSnapshot<typeof value & { ownerId: string }>(
    owner,
    "/api/platform/following-lists?view=feed",
    (next) => {
      if (next.ownerId !== owner) return false;
      if (
        next.version !== value.version ||
        next.selectedId !== value.selectedId ||
        JSON.stringify(next.lists) !== JSON.stringify(value.lists)
      )
        throw Error(
          "Your private lists changed. Reload current feed settings before choosing a list."
        );
      return true;
    },
    "private feed choices"
  );
  return (
    <div className="space-y-2">
      <div hidden={!snapshot.visible}>
        <label className="flex flex-wrap items-center gap-3 font-semibold">
          Private list
          <select
            aria-label="Choose private following list"
            className="min-h-11 max-w-full rounded-lg border border-gc-border bg-gc-surface px-3 py-2"
            value={value.selectedId ?? ""}
            disabled={disabled || !snapshot.visible}
            onChange={(event) => onChoose(event.target.value || null)}
          >
            <option value="">All following</option>
            {value.lists.map((list) => (
              <option key={list.id} value={list.id}>
                {list.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      {!snapshot.visible && (
        <p role="status">
          {snapshot.notice || "Checking your private list choices…"}
        </p>
      )}
      <Link
        prefetch={false}
        className="inline-flex min-h-11 items-center underline"
        href="/platform/relationships/lists"
      >
        Manage private following lists
      </Link>
    </div>
  );
}
