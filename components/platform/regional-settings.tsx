"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { socialRequest, SocialClientError } from "@/lib/platform/social-client";
import type { RegionalState } from "@/lib/platform/regional-preferences";
import {
  defaultRegionalPreferences,
  formatRegionalTimestamp,
  type RegionalPreferences
} from "@/lib/platform/regional-format";

export function RegionalSettings({ initial }: { initial: RegionalState }) {
  const owner = initial.ownerId,
    router = useRouter();
  const [state, setState] = useState<RegionalState | null>(initial),
    [draft, setDraft] = useState<RegionalPreferences>(initial),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const pending = useRef<string | null>(null),
    dirty = useRef(false),
    version = useRef(initial.version),
    generation = useRef(0),
    saving = useRef(false);
  const failed = useCallback((error: unknown) => {
    if (error instanceof SocialClientError && error.status === 401) {
      setState(null);
      setDraft(defaultRegionalPreferences);
      dirty.current = false;
      pending.current = null;
    }
    return error instanceof Error
      ? error.message
      : "Your formats could not be checked. Reconnect and try again.";
  }, []);
  const load = useCallback(async () => {
    const seq = ++generation.current;
    setState(null);
    setBusy(true);
    try {
      const { data } = await socialRequest<RegionalState>(
        "/api/platform/regional",
        undefined,
        owner
      );
      if (seq !== generation.current) return;
      setState(data);
      if (!dirty.current) {
        setDraft(data);
        version.current = data.version;
      }
    } catch (error) {
      if (seq === generation.current) setMessage(failed(error));
    } finally {
      if (seq === generation.current) setBusy(false);
    }
  }, [owner, failed]);
  useEffect(() => {
    const hide = () => {
      generation.current++;
      setState(null);
    };
    const show = () => {
      if (document.visibilityState === "visible") void load();
    };
    const visibility = () =>
      document.visibilityState === "hidden" ? hide() : show();
    window.addEventListener("blur", hide);
    window.addEventListener("focus", show);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      hide();
      window.removeEventListener("blur", hide);
      window.removeEventListener("focus", show);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [load]);
  async function save(retry = false) {
    if (!state || busy || saving.current) return;
    const body = retry
      ? pending.current
      : JSON.stringify({
          mutationId: crypto.randomUUID(),
          expectedVersion: version.current,
          dateFormat: draft.dateFormat,
          timeFormat: draft.timeFormat
        });
    if (!body) return;
    pending.current = body;
    saving.current = true;
    setBusy(true);
    setMessage("");
    const seq = generation.current;
    try {
      await socialRequest("/api/platform/regional", body, owner);
      if (seq !== generation.current) return;
      pending.current = null;
      dirty.current = false;
      setMessage("Your date and time formats were saved.");
      await load();
      router.refresh();
    } catch (error) {
      if (seq !== generation.current) return;
      if (error instanceof SocialClientError && error.status < 500)
        pending.current = null;
      setMessage(
        failed(error) +
          (pending.current
            ? " Retry the same save to confirm the result."
            : " Reload saved formats before editing again.")
      );
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }
  return (
    <section className="space-y-4" aria-labelledby="regional-formats-title">
      <h2 id="regional-formats-title" className="text-2xl">
        Date and time formats
      </h2>
      <p>
        Saved to your account for this device and future sign-ins. Event time
        zones, all-day dates and notification quiet hours stay separate.
      </p>
      {message && <p role="status">{message}</p>}
      {!state ? (
        <button
          type="button"
          className="gc-button gc-button-quiet"
          disabled={busy}
          onClick={() => void load()}
        >
          {busy ? "Checking saved formats…" : "Check saved formats"}
        </button>
      ) : (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <fieldset className="space-y-4" disabled={busy || !!pending.current}>
            <legend className="sr-only">Your regional formats</legend>
            <div>
              <label htmlFor="regional-date-format">Date format</label>
              <select
                id="regional-date-format"
                className="gc-input mt-2 w-full"
                value={draft.dateFormat}
                onChange={(e) => {
                  dirty.current = true;
                  setDraft({
                    ...draft,
                    dateFormat: e.target
                      .value as RegionalPreferences["dateFormat"]
                  });
                }}
              >
                <option value="DEFAULT">Website default</option>
                <option value="MDY">Month/day/year</option>
                <option value="DMY">Day/month/year</option>
                <option value="YMD">Year-month-day</option>
              </select>
            </div>
            <div>
              <label htmlFor="regional-time-format">Time format</label>
              <select
                id="regional-time-format"
                className="gc-input mt-2 w-full"
                value={draft.timeFormat}
                onChange={(e) => {
                  dirty.current = true;
                  setDraft({
                    ...draft,
                    timeFormat: e.target
                      .value as RegionalPreferences["timeFormat"]
                  });
                }}
              >
                <option value="DEFAULT">Website default</option>
                <option value="H12">12-hour</option>
                <option value="H24">24-hour</option>
              </select>
            </div>
            <p aria-live="polite">
              Preview:{" "}
              <span data-regional-preview>
                {formatRegionalTimestamp("2026-09-16T18:05:00Z", draft, {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                  timeZone: "America/Chicago",
                  timeZoneName: "short"
                })}
              </span>
              . Example time zone: America/Chicago.
            </p>
          </fieldset>
          <div className="flex flex-wrap gap-3">
            <button className="gc-button" disabled={busy || !!pending.current}>
              Save date and time formats
            </button>
            {pending.current && (
              <button
                type="button"
                className="gc-button"
                disabled={busy}
                onClick={() => void save(true)}
              >
                Retry the same save
              </button>
            )}
            <button
              type="button"
              className="gc-button gc-button-quiet"
              disabled={busy || !!pending.current}
              onClick={() => {
                dirty.current = false;
                void load();
              }}
            >
              Discard edits and reload saved formats
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
