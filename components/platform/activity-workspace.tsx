"use client";
import { RegionalTime } from "./regional-presentation";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  activityCategories,
  type ActivityCategory,
  type ActivityPage
} from "@/lib/platform/activity-types";
import { socialRequest, SocialClientError } from "@/lib/platform/social-client";
import { useUnsavedSocialWork } from "./use-unsaved-social-work";
import {
  notificationChanged,
  onNotificationChanged
} from "./notification-refresh";
const labels: Record<ActivityCategory, string> = {
  messages: "Messages",
  requests: "Contact requests",
  comments: "Replies and updates",
  reports: "Reports",
  founder: "Founder announcements",
  posts: "Author posts",
  reactions: "Reactions",
  prayer: "Prayer",
  church: "Church connections",
  feedback: "Feedback and ideas",
  photos: "Photo tags",
  exchange: "Exchange",
  commitments: "Commitments"
};
const endpoint = "/api/platform/activity";
export function ActivityWorkspace({
  owner,
  category,
  filter = "all",
  cursor
}: {
  owner: string;
  category?: ActivityCategory;
  filter?: "all" | "unread";
  cursor?: string;
}) {
  const router = useRouter();
  const [view, setView] = useState<ActivityPage | null>(null);
  const [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<string | null>(null),
    [message, setMessage] = useState("");
  const generation = useRef(0),
    mounted = useRef(true),
    inFlight = useRef(false),
    pendingBody = useRef<string | null>(null),
    reading = useRef(false),
    reload = useRef<() => void>(() => {});
  const query = new URLSearchParams({
    ...(category ? { category } : {}),
    ...(cursor ? { cursor } : {}),
    ...(filter === "unread" ? { filter } : {})
  }).toString();
  const href = (choice: "all" | "unread", selected?: ActivityCategory) => {
    const params = new URLSearchParams({
      ...(selected ? { category: selected } : {}),
      ...(choice === "unread" ? { filter: choice } : {})
    });
    return "/platform/activity" + (params.size ? "?" + params : "");
  };
  const newestHref = href(filter, category);
  useUnsavedSocialWork(
    { dirty: false, saving: busy || !!pending, conflict: false },
    () => setMessage("Retry or stop retrying this read change before leaving."),
    true
  );
  const load = useCallback(async () => {
    if (reading.current) return false;
    reading.current = true;
    const current = ++generation.current;
    setLoading(true);
    setView(null);
    try {
      const { data } = await socialRequest<ActivityPage>(
        endpoint + (query ? "?" + query : ""),
        undefined,
        owner
      );
      if (current !== generation.current || !mounted.current) return false;
      if (data.ownerId !== owner)
        throw new SocialClientError(
          401,
          "Your sign-in changed. Reload activity."
        );
      setView(data);
      setMessage("");
      return true;
    } catch (error) {
      if (current !== generation.current || !mounted.current) return false;
      setMessage(
        error instanceof Error
          ? error.message
          : "Activity could not be loaded. Reconnect and refresh."
      );
      if (error instanceof SocialClientError && error.status === 401) {
        pendingBody.current = null;
        setPending(null);
        router.refresh();
      }
      return false;
    } finally {
      reading.current = false;
      if (current === generation.current && mounted.current) setLoading(false);
      else if (
        mounted.current &&
        document.visibilityState !== "hidden" &&
        !inFlight.current &&
        !pendingBody.current
      )
        reload.current();
    }
  }, [owner, query, router]);
  reload.current = () => {
    void load();
  };
  useEffect(() => {
    mounted.current = true;
    void load();
    const refresh = () => {
      if (
        document.visibilityState !== "hidden" &&
        !inFlight.current &&
        !pendingBody.current
      )
        void load();
    };
    const visibility = () => {
      if (document.visibilityState === "hidden") {
        generation.current++;
        setView(null);
      } else refresh();
    };
    const unsubscribe = onNotificationChanged(owner, refresh);
    const timer = setInterval(refresh, 60000);
    window.addEventListener("messages-changed", refresh);
    window.addEventListener("social-relationships-changed", refresh);
    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      mounted.current = false;
      clearInterval(timer);
      unsubscribe();
      window.removeEventListener("messages-changed", refresh);
      window.removeEventListener("social-relationships-changed", refresh);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("online", refresh);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [load, owner]);
  async function act(id?: string, unread = false) {
    if (inFlight.current || (!pendingBody.current && !view)) return;
    const body =
      pendingBody.current ??
      JSON.stringify({
        operation: id ? (unread ? "unread" : "read") : "read-all",
        mutationId: crypto.randomUUID(),
        ownerId: owner,
        boundary: view!.boundary,
        ...(id ? { id } : {})
      });
    pendingBody.current = body;
    setPending(body);
    inFlight.current = true;
    setBusy(true);
    setMessage("");
    try {
      const { data } = await socialRequest<{ message: string }>(
        endpoint,
        body,
        owner
      );
      if (!mounted.current) return;
      pendingBody.current = null;
      setPending(null);
      notificationChanged(owner);
      if (await load()) setMessage(data.message);
    } catch (error) {
      if (!mounted.current) return;
      setMessage(
        error instanceof Error
          ? error.message
          : "This read change could not be confirmed. Retry the same request."
      );
      if (
        error instanceof SocialClientError &&
        [400, 401, 403, 404, 409, 429].includes(error.status)
      ) {
        pendingBody.current = null;
        setPending(null);
        setView(null);
        if (error.status === 401) router.refresh();
      }
    } finally {
      inFlight.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  const blocked = busy || !!pending;
  return (
    <section className="space-y-6" aria-busy={loading || busy}>
      <header className="space-y-3">
        <p className="gc-eyebrow">Your updates</p>
        <h1>Notifications</h1>
        <p className="text-gc-muted">
          Updates for you, newest first. Marking a notification read does not
          mark its messages read.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/platform/messages"
            prefetch={false}
            className="gc-button gc-button-quiet"
          >
            Open Messages
          </Link>
          <Link
            href="/platform/settings/notifications"
            prefetch={false}
            className="gc-button gc-button-quiet"
          >
            Notification choices
          </Link>
          <Link
            href="/platform/photo-tags"
            prefetch={false}
            className="gc-button gc-button-quiet"
          >
            Review photo tags
          </Link>
          <button
            type="button"
            className="gc-button gc-button-quiet"
            disabled={blocked || loading}
            onClick={() => void load()}
          >
            Refresh activity
          </button>
        </div>
      </header>
      <nav aria-label="Notification status" className="flex flex-wrap gap-2">
        {(["all", "unread"] as const).map((choice) => (
          <Link
            key={choice}
            href={href(choice, category)}
            prefetch={false}
            aria-current={filter === choice ? "page" : undefined}
            className="gc-button gc-button-quiet"
          >
            {choice === "all" ? "All notifications" : "Unread notifications"}
          </Link>
        ))}
      </nav>
      <nav aria-label="Activity categories" className="flex flex-wrap gap-2">
        <Link
          href={href(filter)}
          prefetch={false}
          aria-current={!category ? "page" : undefined}
          className="gc-button gc-button-quiet"
        >
          All
        </Link>
        {activityCategories.map((c) => (
          <Link
            key={c}
            href={href(filter, c)}
            prefetch={false}
            aria-current={category === c ? "page" : undefined}
            className="gc-button gc-button-quiet"
          >
            {labels[c]}
          </Link>
        ))}
      </nav>
      {message && (
        <p role="status" className="rounded-xl border border-gc-border p-4">
          {message}
        </p>
      )}
      {pending && !busy && (
        <div className="space-y-3">
          <p>The earlier read change may already have been saved.</p>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              className="gc-button"
              onClick={() => void act()}
            >
              Retry read change
            </button>
            <button
              type="button"
              className="gc-button gc-button-quiet"
              onClick={() => {
                pendingBody.current = null;
                setPending(null);
                void load();
              }}
            >
              Stop retrying and refresh
            </button>
          </div>
        </div>
      )}
      {loading ? (
        <p role="status">Loading activity…</p>
      ) : view ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p aria-live="polite">
              {view.unread} unread update{view.unread === 1 ? "" : "s"} across
              all categories
            </p>
            <button
              type="button"
              className="gc-button"
              disabled={blocked || view.unread === 0}
              onClick={() => void act()}
            >
              {busy ? "Saving read status…" : "Mark all read"}
            </button>
          </div>
          {!view.items.length ? (
            <p>
              {filter === "unread"
                ? "No unread notifications in this view."
                : category
                  ? "No activity in this category yet."
                  : "No activity yet."}
            </p>
          ) : (
            <ul aria-label="Activity updates" className="space-y-4">
              {view.items.map((item) => (
                <li
                  key={item.id}
                  className="rounded-2xl border border-gc-border p-4 [overflow-wrap:anywhere]"
                >
                  <article
                    aria-labelledby={"activity-" + item.id}
                    className="space-y-3"
                  >
                    <h2 id={"activity-" + item.id}>
                      {item.available
                        ? labels[item.category]
                        : "Activity unavailable"}
                    </h2>
                    {item.summary ? (
                      <p>{item.summary}</p>
                    ) : !item.available ? (
                      <p>The item or your access may have changed.</p>
                    ) : null}
                    <p className="text-sm text-gc-muted">
                      {item.count} update{item.count === 1 ? "" : "s"} ·{" "}
                      {item.unread ? `${item.unread} unread` : "Read"} ·{" "}
                      <time dateTime={item.createdAt}>
                        <RegionalTime
                          value={item.createdAt}
                          options={{ dateStyle: "medium", timeStyle: "short" }}
                        />
                      </time>
                    </p>
                    <div className="flex flex-wrap gap-3">
                      {item.available && item.href && (
                        <Link
                          href={item.href}
                          prefetch={false}
                          className="gc-button gc-button-quiet"
                        >
                          Open item
                        </Link>
                      )}
                      {item.unread > 0 ? (
                        <button
                          type="button"
                          className="gc-button gc-button-quiet"
                          disabled={blocked}
                          onClick={() => void act(item.id)}
                        >
                          Mark group read
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="gc-button gc-button-quiet"
                          disabled={blocked}
                          onClick={() => void act(item.id, true)}
                        >
                          Mark group unread
                        </button>
                      )}
                    </div>
                  </article>
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap gap-3">
            {cursor && (
              <Link
                className="gc-button gc-button-quiet"
                href={newestHref}
                prefetch={false}
              >
                Newest activity
              </Link>
            )}
            {view.nextCursor && (
              <Link
                className="gc-button gc-button-quiet"
                href={
                  newestHref +
                  (newestHref.includes("?") ? "&" : "?") +
                  "cursor=" +
                  encodeURIComponent(view.nextCursor)
                }
                prefetch={false}
              >
                Older activity
              </Link>
            )}
          </div>
          <p className="text-sm text-gc-muted">
            Times are shown in your time zone. Messages and pending requests
            stay available in Messages even when optional alerts are off.
          </p>
        </>
      ) : !pending ? (
        <Link
          href={newestHref}
          prefetch={false}
          className="gc-button gc-button-quiet"
        >
          Start from newest activity
        </Link>
      ) : null}
    </section>
  );
}
