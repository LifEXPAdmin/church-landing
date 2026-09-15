"use client";
import { useEffect, useState } from "react";
const KEY = "gc-reading-break-minutes";
export function FeedBreakReminder() {
  const [minutes, setMinutes] = useState(0),
    [due, setDue] = useState(false),
    [message, setMessage] = useState("");
  useEffect(() => {
    try {
      const value = Number(localStorage.getItem(KEY));
      if ([15, 30, 60].includes(value)) setMinutes(value);
    } catch {
      /* Session-only choice remains available. */
    }
  }, []);
  useEffect(() => {
    if (!minutes || due) return;
    let remaining = minutes * 60000,
      started = 0,
      timer: ReturnType<typeof setTimeout> | undefined;
    const pause = () => {
      if (timer) {
        clearTimeout(timer);
        timer = undefined;
        remaining = Math.max(0, remaining - (Date.now() - started));
      }
    };
    const resume = () => {
      if (timer || document.visibilityState === "hidden") return;
      started = Date.now();
      timer = setTimeout(() => {
        timer = undefined;
        setDue(true);
      }, remaining);
    };
    const visibility = () =>
      document.visibilityState === "hidden" ? pause() : resume();
    resume();
    document.addEventListener("visibilitychange", visibility);
    return () => {
      pause();
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [minutes, due]);
  return (
    <>
      <details className="text-sm">
        <summary className="min-h-11 cursor-pointer py-3">
          Optional reading break reminder
        </summary>
        <label className="flex min-h-11 flex-wrap items-center gap-2">
          Remind me after
          <select
            className="min-h-11 rounded-lg border border-gc-border bg-gc-surface px-2"
            value={minutes}
            onChange={(e) => {
              const value = Number(e.target.value);
              setMinutes(value);
              setDue(false);
              setMessage("");
              try {
                localStorage.setItem(KEY, String(value));
              } catch {
                setMessage(
                  "This reminder applies to the current reading session; browser storage was unavailable."
                );
              }
            }}
          >
            <option value={0}>Off</option>
            <option value={15}>15 minutes</option>
            <option value={30}>30 minutes</option>
            <option value={60}>60 minutes</option>
          </select>
        </label>
        <p className="text-gc-muted">
          This browser’s timer pauses when the page is hidden. Reading time
          stays in memory and is never sent to the server.
        </p>
        {message && <p role="status">{message}</p>}
      </details>
      {due && (
        <div role="status" className="my-3 rounded-lg border p-3">
          <p>
            You’ve reached your chosen reading interval. This is a good place to
            pause if you’d like.
          </p>
          <button
            type="button"
            className="gc-button gc-button-quiet mt-2"
            onClick={() => setDue(false)}
          >
            Continue and start another interval
          </button>
        </div>
      )}
    </>
  );
}
