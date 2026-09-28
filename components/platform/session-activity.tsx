"use client";

import { useEffect, useRef, useState } from "react";

const ACTIVITY_INTERVAL = 60_000;
const WARNING_INTERVAL = 120_000;
const REQUEST_TIMEOUT = 10_000;
type Status =
  | "checking"
  | "active"
  | "legacy"
  | "warning"
  | "expired"
  | "unavailable"
  | "changed";
type SessionClock = {
  deadline: number;
  serverTime: number;
  startedAt: number;
  wallStartedAt: number;
  elapsed: number;
  legacy: boolean;
};
const acceptsActivity = (status: Status) =>
  status === "active" || status === "legacy" || status === "warning";

function sessionClock(
  value: unknown,
  owner: string,
  startedAt: number,
  wallStartedAt: number
): SessionClock | null {
  if (!value || typeof value !== "object") return null;
  const body = value as Record<string, unknown>;
  if (
    body.owner !== owner ||
    typeof body.deadline !== "string" ||
    typeof body.absoluteExpiresAt !== "string" ||
    typeof body.serverTime !== "string" ||
    typeof body.legacy !== "boolean"
  )
    return null;
  const deadline = Date.parse(body.deadline),
    absolute = Date.parse(body.absoluteExpiresAt),
    serverTime = Date.parse(body.serverTime);
  if (
    !Number.isFinite(deadline) ||
    !Number.isFinite(absolute) ||
    !Number.isFinite(serverTime) ||
    deadline > absolute
  )
    return null;
  // Count the whole round trip conservatively. A slow response must not give
  // this tab extra time after the server's deadline. Wall time may only shorten
  // this display budget if the monotonic clock stops while the device sleeps.
  return {
    deadline,
    serverTime,
    startedAt,
    wallStartedAt,
    elapsed: 0,
    legacy: body.legacy
  };
}

/** A sibling notice, never a wrapper that unmounts dirty or uncertain commands. */
export function SessionActivity({ owner }: { owner: string | null }) {
  // A retained layout may receive new props after sign-in. Only a full remount
  // may adopt that account, including a guest becoming signed in.
  const [loadedOwner] = useState(owner);
  const [view, setView] = useState<{ status: Status; busy: boolean }>({
    status: "checking",
    busy: false
  });
  const notice = useRef<HTMLDivElement>(null);
  const actions = useRef<{
    activity: (event: Event) => void;
    recheck: () => void;
  } | null>(null);

  useEffect(() => {
    if (!loadedOwner) return;
    let live = true,
      status: Status = "checking",
      clock: SessionClock | null = null,
      suspended = true,
      concealed = false,
      ownFocus = false,
      expiryProbeAvailable = false,
      generation = 0,
      request: AbortController | null = null,
      timer: number | undefined,
      lastActivity = -Infinity,
      scrollIntent = -Infinity;
    let channel: BroadcastChannel | null = null;
    const foreground = () =>
      document.visibilityState === "visible" && document.hasFocus();
    const publish = () => {
      if (live) setView({ status, busy: request !== null });
    };
    const remaining = () => {
      if (!clock) return 0;
      clock.elapsed = Math.max(
        clock.elapsed,
        0,
        performance.now() - clock.startedAt,
        Date.now() - clock.wallStartedAt
      );
      return clock.deadline - clock.serverTime - clock.elapsed;
    };
    const cancel = () => {
      generation++;
      request?.abort();
      request = null;
      publish();
    };
    const conceal = () => {
      concealed = true;
      suspended = true;
      // Existing privacy owners invalidate reads and conceal their snapshots
      // on blur without throwing away mounted fields or original command keys.
      window.dispatchEvent(new Event("blur"));
    };
    const stop = (next: "expired" | "unavailable" | "changed") => {
      status = next;
      expiryProbeAvailable = false;
      window.clearTimeout(timer);
      conceal();
      publish();
    };
    const schedule = () => {
      window.clearTimeout(timer);
      if (live && clock && acceptsActivity(status))
        timer = window.setTimeout(
          tick,
          Math.max(1, Math.min(30_000, remaining()))
        );
    };
    const expire = () => {
      if (!acceptsActivity(status)) return;
      cancel();
      stop("expired");
      // One passive probe can discover activity in another tab. A denial or
      // failed probe stays paused until the user explicitly rechecks.
      expiryProbeAvailable = true;
      automaticCheck();
    };
    const check = async (activity = false) => {
      if (!live || request || status === "changed" || !foreground()) return;
      const controller = new AbortController(),
        seq = ++generation;
      request = controller;
      const startedAt = performance.now(),
        wallStartedAt = Date.now();
      publish();
      const timeout = window.setTimeout(
        () => controller.abort(),
        REQUEST_TIMEOUT
      );
      const current = () => live && seq === generation && foreground();
      try {
        const response = await fetch("/api/platform/session", {
          method: activity ? "POST" : "GET",
          cache: "no-store",
          credentials: "same-origin",
          signal: controller.signal,
          headers: {
            "X-Expected-Account": loadedOwner,
            ...(activity ? { "Content-Type": "application/json" } : {})
          },
          ...(activity
            ? { body: JSON.stringify({ activity: "foreground" }) }
            : {})
        });
        let body: unknown;
        if (response.ok) body = await response.json();
        else await response.body?.cancel();
        if (!current()) return;
        if (!response.ok && response.status !== 401)
          throw new Error("Session unavailable");
        // Recheck after the response, matching the existing social transport's
        // late-account-change defense. Share the abort deadline with this read.
        const identity = await fetch("/api/platform/profile?view=identity", {
          cache: "no-store",
          credentials: "same-origin",
          signal: controller.signal
        });
        let currentOwner: unknown = null;
        if (identity.ok) {
          const value: unknown = await identity.json();
          if (
            !value ||
            typeof value !== "object" ||
            typeof (value as Record<string, unknown>).id !== "string"
          )
            throw new Error("Identity unavailable");
          currentOwner = (value as Record<string, unknown>).id;
        } else {
          await identity.body?.cancel();
          if (identity.status !== 401) throw new Error("Identity unavailable");
        }
        if (!current()) return;
        if (currentOwner !== null && currentOwner !== loadedOwner) {
          stop("changed");
          return;
        }
        if (!response.ok || currentOwner === null) {
          stop("expired");
          return;
        }
        const next = sessionClock(body, loadedOwner, startedAt, wallStartedAt);
        if (!next) throw new Error("Session unavailable");
        clock = next;
        if (remaining() <= 0) {
          stop("expired");
          return;
        }
        status = next.legacy
          ? "legacy"
          : remaining() <= WARNING_INTERVAL
            ? "warning"
            : "active";
        suspended = false;
        expiryProbeAvailable = false;
        schedule();
        if (concealed) {
          concealed = false;
          // Only same-owner verification can ask retained readers to reveal
          // their current snapshots again. Their own read checks still apply.
          ownFocus = true;
          window.dispatchEvent(new Event("focus"));
          ownFocus = false;
        }
        if (activity) {
          try {
            channel?.postMessage("activity");
          } catch {
            /* Optional passive cross-tab hint. */
          }
        }
      } catch {
        if (current()) stop("unavailable");
      } finally {
        window.clearTimeout(timeout);
        if (live && seq === generation) {
          request = null;
          publish();
        }
      }
    };
    function automaticCheck() {
      if (!foreground() || request || !live) return;
      if (status === "expired" && expiryProbeAvailable) {
        expiryProbeAvailable = false;
        void check();
      } else if (status === "checking" || acceptsActivity(status)) void check();
    }
    function tick() {
      if (!live || !acceptsActivity(status)) return;
      if (remaining() <= 0) {
        expire();
        return;
      }
      const next = clock?.legacy
        ? "legacy"
        : remaining() <= WARNING_INTERVAL
          ? "warning"
          : "active";
      if (next !== status) {
        status = next;
        publish();
      }
      // Deadline display is local. Idle tabs do not need periodic network
      // polling; focus, cross-tab hints and the expiry probe recheck authority.
      schedule();
    }
    const activity = (event: Event) => {
      if (
        !event.isTrusted ||
        !live ||
        suspended ||
        !foreground() ||
        request ||
        !acceptsActivity(status)
      )
        return;
      if (remaining() <= 0) {
        expire();
        return;
      }
      const now = performance.now();
      if (now - lastActivity < ACTIVITY_INTERVAL) return;
      // Failed requests also consume this local interval. Nothing queues or
      // automatically retries a foreground write when connectivity returns.
      lastActivity = now;
      void check(true);
    };
    const interaction = (event: Event) => {
      if (!event.isTrusted || !foreground()) return;
      if (
        event.target instanceof Node &&
        notice.current?.contains(event.target)
      )
        return;
      if (event instanceof KeyboardEvent && event.repeat) return;
      if (event.type === "scroll") {
        // Browser-dispatched scroll is trusted even after programmatic scroll.
        // Require recent trusted wheel, touch, pointer or keyboard intent.
        if (performance.now() - scrollIntent > 1500) return;
      } else scrollIntent = performance.now();
      activity(event);
    };
    const scrollGesture = (event: Event) => {
      if (event.isTrusted && foreground()) scrollIntent = performance.now();
    };
    const resume = () => {
      if (ownFocus || !foreground()) return;
      if (acceptsActivity(status) && remaining() <= 0) expire();
      else automaticCheck();
    };
    const suspend = () => {
      suspended = true;
      scrollIntent = -Infinity;
      cancel();
    };
    const blur = (event: Event) => {
      if (event.isTrusted) suspend();
    };
    const visibility = () => {
      if (document.visibilityState !== "visible") suspend();
      else resume();
    };
    const offline = () => {
      cancel();
      stop("unavailable");
    };
    actions.current = {
      activity,
      recheck: () => {
        if (status !== "changed") void check();
      }
    };
    try {
      channel = new BroadcastChannel("platform-session-activity");
      channel.onmessage = (event: MessageEvent<unknown>) => {
        if (event.data === "activity") automaticCheck();
      };
    } catch {
      /* Focus and the expiry probe work without BroadcastChannel. */
    }
    window.addEventListener("pointerdown", interaction, { passive: true });
    window.addEventListener("keydown", interaction);
    window.addEventListener("scroll", interaction, {
      passive: true,
      capture: true
    });
    window.addEventListener("wheel", scrollGesture, { passive: true });
    window.addEventListener("touchmove", scrollGesture, { passive: true });
    window.addEventListener("focus", resume);
    window.addEventListener("blur", blur);
    window.addEventListener("pageshow", resume);
    window.addEventListener("pagehide", suspend);
    window.addEventListener("offline", offline);
    document.addEventListener("visibilitychange", visibility);
    automaticCheck();
    return () => {
      live = false;
      cancel();
      window.clearTimeout(timer);
      channel?.close();
      actions.current = null;
      window.removeEventListener("pointerdown", interaction);
      window.removeEventListener("keydown", interaction);
      window.removeEventListener("scroll", interaction, true);
      window.removeEventListener("wheel", scrollGesture);
      window.removeEventListener("touchmove", scrollGesture);
      window.removeEventListener("focus", resume);
      window.removeEventListener("blur", blur);
      window.removeEventListener("pageshow", resume);
      window.removeEventListener("pagehide", suspend);
      window.removeEventListener("offline", offline);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [loadedOwner]);

  if (!loadedOwner || view.status === "checking" || view.status === "active")
    return null;
  return (
    <div
      ref={notice}
      className="m-4 space-y-3 rounded-xl border p-4"
      aria-label="Sign-in status"
    >
      <p role="status">
        {view.status === "legacy"
          ? "This existing sign-in keeps its current expiration until you interact with the updated website. Interacting starts protection that ends your sign-in after about 30 minutes without activity. Its original 30-day maximum stays unchanged."
          : view.status === "warning"
            ? "Your sign-in ends soon. Sign-ins expire after about 30 minutes without activity, with a maximum of 30 days from sign-in."
            : view.status === "expired"
              ? "This sign-in has ended. Your entries stay in this tab. Sign in to the same account in another tab, then recheck here."
              : view.status === "changed"
                ? "The signed-in account changed. This tab keeps its original account and entries. Reload before using a different account."
                : "Your sign-in could not be checked. Your entries stay in this tab. Reconnect, then recheck before continuing."}
      </p>
      <div className="flex flex-wrap gap-3">
        {view.status === "warning" || view.status === "legacy" ? (
          <button
            type="button"
            className="gc-button"
            disabled={view.busy}
            onClick={(event) => actions.current?.activity(event.nativeEvent)}
          >
            {view.busy
              ? "Checking sign-in…"
              : view.status === "legacy"
                ? "Start inactivity protection"
                : "Continue signed in"}
          </button>
        ) : view.status === "changed" ? (
          <button
            type="button"
            className="gc-button"
            onClick={() => {
              if (
                window.confirm(
                  "Reload and discard local entries? A previous unconfirmed request may already be saved."
                )
              )
                window.location.reload();
            }}
          >
            Reload for the current account
          </button>
        ) : (
          <>
            <a
              className="gc-button gc-button-quiet"
              href="/platform/login?reason=account"
              target="_blank"
              rel="noopener noreferrer"
            >
              Open sign-in in another tab
            </a>
            <button
              type="button"
              className="gc-button"
              disabled={view.busy}
              onClick={() => actions.current?.recheck()}
            >
              {view.busy ? "Checking sign-in…" : "Recheck this sign-in"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
