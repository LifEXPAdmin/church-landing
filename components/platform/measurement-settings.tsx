"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { socialRequest, SocialClientError } from "@/lib/platform/social-client";
import type { MeasurementState } from "@/lib/platform/platform-measurement";
import { metricReferrals } from "@/lib/platform/metric-policy";

export function MeasurementSettings({ owner }: { owner: string }) {
  const [state, setState] = useState<MeasurementState | null>(null),
    [enabled, setEnabled] = useState(false),
    [device, setDevice] = useState(false),
    [referral, setReferral] = useState("UNKNOWN"),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const pending = useRef<string | null>(null),
    generation = useRef(0),
    dirty = useRef(false),
    editVersion = useRef<number | null>(null);
  function editing() {
    dirty.current = true;
    editVersion.current ??= state?.version ?? null;
  }
  const load = useCallback(async () => {
    const seq = ++generation.current;
    setBusy(true);
    setState(null);
    try {
      const { data } = await socialRequest<MeasurementState>(
        "/api/platform/measurement",
        undefined,
        owner
      );
      if (seq !== generation.current) return;
      setState(data);
      if (!dirty.current) {
        setEnabled(data.enabled);
        setDevice(data.shareDevice);
        setReferral(data.referral);
        editVersion.current = null;
      }
    } catch (e) {
      if (seq === generation.current)
        setMessage(
          e instanceof Error
            ? e.message
            : "Your current choices could not be loaded."
        );
    } finally {
      if (seq === generation.current) setBusy(false);
    }
  }, [owner]);
  useEffect(() => {
    void load();
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
    if (!state || busy) return;
    const body = retry
      ? pending.current
      : JSON.stringify({
          operation: "choice",
          mutationId: crypto.randomUUID(),
          expectedVersion: editVersion.current ?? state.version,
          enabled,
          shareDevice: enabled && device,
          referral: enabled ? referral : "UNKNOWN"
        });
    if (!body) return;
    pending.current = body;
    setBusy(true);
    setMessage("");
    try {
      await socialRequest("/api/platform/measurement", body, owner);
      pending.current = null;
      dirty.current = false;
      editVersion.current = null;
      window.dispatchEvent(new Event("platform-measurement-changed"));
      setMessage("Your measurement choices were saved.");
      await load();
    } catch (e) {
      if (e instanceof SocialClientError && e.status < 500) {
        pending.current = null;
      }
      setMessage(
        (e instanceof Error ? e.message : "The save could not be confirmed.") +
          (pending.current
            ? " You can retry the same change."
            : " Your unsaved choices are retained. Reload saved choices to review the current version.")
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="gc-settings space-y-5"
      aria-label="Optional platform measurement"
    >
      <h2 className="text-2xl">Optional platform measurement</h2>
      <p>
        Help us understand whether people can get started and return. This is
        off by default. You can use the website with it off.
      </p>
      <p>
        When enabled, limited foreground interactions on Home, Menu and
        discovery pages record your account and reporting day. We also count
        successful ordinary follows, posts, replies, event responses and
        volunteering from their current records. We do not collect page
        addresses, reading time, private message or prayer content, or an
        attention or faith score.
      </p>
      <p>
        Optional use and session facts are kept for up to 90 days. Turning this
        off removes those facts and optional source/device choices. Account,
        church and support operational totals remain separate. Restricted
        administrators see aggregates; small breakdowns are suppressed.
      </p>
      {message && <p role="status">{message}</p>}
      {!state ? (
        <button
          className="gc-button gc-button-quiet"
          disabled={busy}
          onClick={() => void load()}
        >
          {busy ? "Checking current choice…" : "Check current choice"}
        </button>
      ) : (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <p>
            {state.message} Reporting zone: {state.zone}.
          </p>
          <label className="flex min-h-11 items-center gap-3">
            <input
              type="checkbox"
              checked={enabled}
              disabled={
                busy ||
                !!pending.current ||
                (!state.available && !state.enabled)
              }
              onChange={(e) => {
                editing();
                setEnabled(e.target.checked);
              }}
            />
            Allow optional platform measurement
          </label>
          <fieldset
            className="space-y-4"
            disabled={!enabled || busy || !!pending.current || !state.available}
          >
            <legend className="font-semibold">
              Additional optional choices
            </legend>
            <label className="flex min-h-11 items-center gap-3">
              <input
                type="checkbox"
                checked={device}
                onChange={(e) => {
                  editing();
                  setDevice(e.target.checked);
                }}
              />
              Share a coarse device and browser family
            </label>
            <label className="block">
              How did you hear about God’s Churches?
              <select
                className="gc-input mt-2 w-full"
                value={referral}
                onChange={(e) => {
                  editing();
                  setReferral(e.target.value);
                }}
              >
                {Object.entries(metricReferrals).map(([key, label]) => (
                  <option value={key} key={key}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </fieldset>
          {!enabled && state.enabled && (
            <p>
              Saving removes your optional use history. Re-enabling later starts
              new coverage.
            </p>
          )}
          <button
            className="gc-button"
            disabled={
              busy || !!pending.current || (!state.available && enabled)
            }
          >
            Save measurement choices
          </button>
          <button
            type="button"
            className="gc-button gc-button-quiet ml-2"
            disabled={busy}
            onClick={() => {
              dirty.current = false;
              editVersion.current = null;
              pending.current = null;
              void load();
            }}
          >
            Reload saved choices
          </button>
          {pending.current && (
            <button
              type="button"
              disabled={busy}
              className="gc-button gc-button-quiet ml-2"
              onClick={() => void save(true)}
            >
              Retry unconfirmed change
            </button>
          )}
        </form>
      )}
    </section>
  );
}
