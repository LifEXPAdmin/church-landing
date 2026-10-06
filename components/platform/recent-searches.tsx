"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { currentSocialOwner } from "@/lib/platform/social-client";
import {
  changeRecentSearches,
  readRecentSearches,
  recentSearchKey,
  type RecentSearchChange,
  type RecentSearchState
} from "@/lib/platform/recent-searches";
import { searchHref } from "@/lib/platform/search-navigation";

const historyForeground = () =>
  navigator.onLine &&
  document.visibilityState === "visible" &&
  document.hasFocus();

export function useRecentSearches(owner: string | null) {
  const [state, setState] = useState<RecentSearchState | null>(null);
  const [message, setMessage] = useState("");
  const generation = useRef(0);
  const available = useRef(false);
  const run = useCallback(
    async (change?: RecentSearchChange) => {
      if (!owner || !available.current || !historyForeground()) return;
      const sequence = ++generation.current;
      try {
        const before =
          change?.action === "record"
            ? localStorage.getItem(recentSearchKey(owner))
            : undefined;
        const currentOwner = await currentSocialOwner();
        if (
          sequence !== generation.current ||
          !available.current ||
          !historyForeground()
        )
          return;
        if (currentOwner !== owner) {
          setState(null);
          setMessage(
            "Your sign-in changed. Reload to see your recent searches."
          );
          return;
        }
        if (
          change?.action === "record" &&
          before !== localStorage.getItem(recentSearchKey(owner))
        )
          return;
        // Read storage only after the current identity check. A delayed response
        // carries no history and cannot restore a removed entry.
        const next = change
          ? changeRecentSearches(localStorage, owner, change)
          : readRecentSearches(localStorage, owner);
        setState(next);
        setMessage(
          change?.action === "clear"
            ? "Recent searches cleared."
            : change?.action === "remove"
              ? "Search removed."
              : change?.action === "disable"
                ? "Recent searches turned off and cleared."
                : ""
        );
      } catch {
        if (sequence !== generation.current) return;
        setState(null);
        setMessage(
          "Recent searches are unavailable. Check your connection and browser storage settings. You can still search."
        );
      }
    },
    [owner]
  );
  useEffect(() => {
    if (!owner) return;
    const hide = () => {
      available.current = false;
      generation.current++;
      setState(null);
      setMessage("");
    };
    const refresh = () => {
      if (!historyForeground()) return hide();
      available.current = true;
      void run();
    };
    const storage = (event: StorageEvent) => {
      if (event.key === null || event.key === recentSearchKey(owner ?? "")) {
        hide();
        refresh();
      }
    };
    refresh();
    window.addEventListener("blur", hide);
    window.addEventListener("pagehide", hide);
    window.addEventListener("offline", hide);
    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
    window.addEventListener("pageshow", refresh);
    window.addEventListener("social-relationships-changed", refresh);
    window.addEventListener("storage", storage);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      hide();
      window.removeEventListener("blur", hide);
      window.removeEventListener("pagehide", hide);
      window.removeEventListener("offline", hide);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("online", refresh);
      window.removeEventListener("pageshow", refresh);
      window.removeEventListener("social-relationships-changed", refresh);
      window.removeEventListener("storage", storage);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [owner, run]);
  return { state, message, run };
}

export function RecentSearches({
  history
}: {
  history: ReturnType<typeof useRecentSearches>;
}) {
  const { state, message, run } = history;
  const heading = useRef<HTMLHeadingElement>(null);
  async function remove(change: RecentSearchChange) {
    await run(change);
    heading.current?.focus();
  }
  return (
    <section
      aria-label="Recent searches"
      className="mt-6 space-y-3 border-t border-gc-divider pt-4"
    >
      <h2 ref={heading} tabIndex={-1} className="text-xl font-semibold">
        Recent searches
      </h2>
      <p className="text-sm text-gc-muted">
        Optional, for your account in this browser only. Shows your last 20
        searches from the past 30 days. They do not sync to other devices.
        Turning this off clears them.
      </p>
      {state ? (
        <>
          <label className="flex min-h-11 items-center gap-3">
            <input
              type="checkbox"
              checked={state.enabled}
              onChange={(event) =>
                void run({
                  action: event.target.checked ? "enable" : "disable"
                })
              }
            />
            Remember my searches in this browser
          </label>
          {state.enabled &&
            (state.items.length ? (
              <>
                <ul className="space-y-2">
                  {state.items.map((item) => (
                    <li
                      key={JSON.stringify([item.kind, item.q])}
                      className="flex flex-col items-start gap-2 sm:flex-row sm:items-center"
                    >
                      <a
                        href={searchHref(item)}
                        className="w-full min-w-0 break-words py-3 text-gc-accent underline sm:flex-1"
                      >
                        {item.q}{" "}
                        <span className="text-sm capitalize">
                          ({item.kind})
                        </span>
                      </a>
                      <button
                        type="button"
                        className="gc-button gc-button-quiet"
                        aria-label={`Remove ${item.q} from recent ${item.kind} searches`}
                        onClick={() =>
                          void remove({ action: "remove", ...item })
                        }
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  className="gc-button gc-button-quiet"
                  onClick={() => void remove({ action: "clear" })}
                >
                  Clear all recent searches
                </button>
              </>
            ) : (
              <p>No recent searches. Submit a search to start your list.</p>
            ))}
        </>
      ) : (
        <button
          type="button"
          className="gc-button gc-button-quiet"
          onClick={() => void run()}
        >
          Check recent searches
        </button>
      )}
      <p role="status" aria-live="polite">
        {message}
      </p>
    </section>
  );
}
