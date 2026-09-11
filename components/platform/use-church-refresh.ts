"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// One current read per visible page, including when returning from another tab.
// Callers clear protected fields on failure and keep any geometry-only drafts.
export function useChurchRefresh({
  url,
  onData,
  onUnavailable,
  paused,
  revision
}: {
  url: string;
  onData: (value: unknown) => void | Promise<void>;
  onUnavailable: (status: number | null) => void;
  paused?: () => boolean;
  revision?: () => number;
}) {
  const callbacks = useRef({ onData, onUnavailable, paused, revision });
  callbacks.current = { onData, onUnavailable, paused, revision };
  const controller = useRef<AbortController | null>(null);
  const mounted = useRef(false);
  const [pending, setPending] = useState(false);
  const refresh = useCallback(async () => {
    if (
      !mounted.current ||
      document.visibilityState === "hidden" ||
      controller.current ||
      callbacks.current.paused?.()
    )
      return;
    const startedAt = callbacks.current.revision?.();
    const stillCurrent = () =>
      mounted.current &&
      controller.current === request &&
      !callbacks.current.paused?.() &&
      startedAt === callbacks.current.revision?.();
    const request = new AbortController();
    controller.current = request;
    const timer = window.setTimeout(() => request.abort(), 15_000);
    setPending(true);
    try {
      const response = await fetch(url, {
        cache: "no-store",
        credentials: "same-origin",
        signal: request.signal
      });
      if (!stillCurrent()) return;
      if (!response.ok) {
        callbacks.current.onUnavailable(response.status);
        return;
      }
      const value: unknown = await response.json();
      if (stillCurrent()) await callbacks.current.onData(value);
    } catch {
      if (stillCurrent()) callbacks.current.onUnavailable(null);
    } finally {
      window.clearTimeout(timer);
      if (controller.current === request) {
        controller.current = null;
        if (mounted.current) setPending(false);
      }
    }
  }, [url]);
  useEffect(() => {
    mounted.current = true;
    const visible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    const focus = () => void refresh();
    const interval = window.setInterval(() => void refresh(), 15_000);
    document.addEventListener("visibilitychange", visible);
    window.addEventListener("focus", focus);
    window.addEventListener("pageshow", focus);
    void refresh();
    return () => {
      mounted.current = false;
      controller.current?.abort();
      controller.current = null;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", visible);
      window.removeEventListener("focus", focus);
      window.removeEventListener("pageshow", focus);
    };
  }, [refresh]);
  return { pending, refresh };
}
