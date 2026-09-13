"use client";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { socialRequest, SocialClientError } from "@/lib/platform/social-client";
import { useUnsavedSocialWork } from "./use-unsaved-social-work";
import { usePrivateRecovery } from "./private-snapshot-guard";
export type SupportField = {
  name: string;
  label: string;
  type?: "text" | "textarea" | "select" | "checkbox";
  max?: number;
  min?: number;
  options?: { value: string; label: string }[];
  optional?: boolean;
};
export function SupportForm({
  owner,
  operation,
  fixed = {},
  fields = [],
  button,
  destination,
  caution
}: {
  owner: string;
  operation: string;
  fixed?: Record<string, unknown>;
  fields?: SupportField[];
  button: string;
  destination?: string;
  caution?: string;
}) {
  const id = useId();
  const initialFixed = useRef(fixed);
  const [pending, setBusy] = useState(false);
  const inFlight = useRef(false);
  const busy = pending;
  const [feedback, setFeedback] = useState("");
  const [failed, setFailed] = useState(false);
  const feedbackRef = useRef<HTMLParagraphElement>(null);
  const [retryBody, setRetryBody] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [navigation, setNavigation] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const retryOriginal = useCallback(() => formRef.current?.requestSubmit(), []);
  usePrivateRecovery(id, !!retryBody, busy, retryOriginal);
  useUnsavedSocialWork(
    { dirty, saving: busy || !!retryBody, conflict: false },
    () =>
      setFeedback("Save, retry or discard these local entries before leaving."),
    true
  );
  useEffect(() => {
    if (navigation) window.location.assign(navigation);
  }, [navigation]);
  useEffect(() => {
    if (feedback && !busy) feedbackRef.current?.focus();
  }, [feedback, busy]);
  return (
    <form
      ref={formRef}
      onChange={() => setDirty(true)}
      aria-label={button}
      aria-busy={busy}
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        if (busy || inFlight.current) return;
        const form = e.currentTarget;
        const data = new FormData(form);
        const payload: Record<string, unknown> = {
          ...initialFixed.current,
          operation
        };
        fields.forEach((f) => {
          payload[f.name] =
            f.type === "checkbox"
              ? data.get(f.name) === "on"
              : data.get(f.name);
        });
        // Choice values carry both the opaque assignment and the disclosed current version.
        for (const [choice, key, versionKey] of [
          ["appointmentChoice", "appointmentId", "appointmentVersion"],
          ["ownerChoice", "ownerGrantId", "ownerGrantVersion"]
        ]) {
          if (typeof payload[choice] === "string") {
            const [value, version] = (payload[choice] as string).split(":");
            payload[key] = value;
            payload[versionKey] = Number(version);
            delete payload[choice];
          }
        }
        const serialized =
          retryBody ??
          JSON.stringify({ ...payload, requestKey: crypto.randomUUID() });
        setRetryBody(serialized);
        inFlight.current = true;
        setBusy(true);
        setFeedback("");
        try {
          const { data: result } = await socialRequest<{
            caseId: string;
            version: number;
            message: string;
          }>("/api/platform/support", serialized, owner);
          if (
            typeof result.caseId !== "string" ||
            !Number.isSafeInteger(result.version) ||
            result.version < 1
          )
            throw new SocialClientError(
              503,
              "The save result is unconfirmed. Retry the original request."
            );
          setFailed(false);
          setFeedback(result.message);
          setRetryBody(null);
          setDirty(false);
          form.reset();
          if (["create", "appeal"].includes(operation))
            setNavigation(
              `/platform/help/cases/${encodeURIComponent(result.caseId)}?received=1`
            );
          else if (destination) setNavigation(destination);
          // A fresh private document discards stale client route data after a write.
          else setNavigation(window.location.href);
        } catch (error) {
          if (
            error instanceof SocialClientError &&
            [400, 409, 429].includes(error.status)
          )
            setRetryBody(null);
          setFailed(true);
          setFeedback(
            error instanceof Error
              ? error.message
              : "We could not confirm that this saved. Retry the original request; it will not duplicate it."
          );
        } finally {
          inFlight.current = false;
          setBusy(false);
        }
      }}
    >
      <fieldset disabled={busy || !!retryBody} className="space-y-4">
        {fields.map((f) => (
          <div key={f.name}>
            <label
              htmlFor={`${id}-${f.name}`}
              className="mb-2 block text-sm font-semibold text-gc-text"
            >
              {f.label}
              {f.optional ? " (optional)" : ""}
            </label>
            {f.type === "checkbox" ? (
              <input
                id={`${id}-${f.name}`}
                name={f.name}
                type="checkbox"
                required={!f.optional}
                className="h-6 w-6 accent-[#e6b56c] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#f4c98c]"
              />
            ) : f.type === "select" ? (
              <select
                id={`${id}-${f.name}`}
                name={f.name}
                required={!f.optional}
                className={inputClass}
              >
                {f.options?.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            ) : f.type === "textarea" ? (
              <textarea
                id={`${id}-${f.name}`}
                name={f.name}
                required={!f.optional}
                minLength={f.min}
                maxLength={f.max}
                rows={4}
                className={inputClass}
              />
            ) : (
              <input
                id={`${id}-${f.name}`}
                name={f.name}
                required={!f.optional}
                minLength={f.min}
                maxLength={f.max}
                className={inputClass}
              />
            )}
            {f.max && (
              <p className="mt-1 text-xs text-gc-muted">
                Up to {f.max.toLocaleString()} characters. Plain text only.
              </p>
            )}
          </div>
        ))}
      </fieldset>
      {caution && (
        <p className="text-sm leading-relaxed text-gc-muted">{caution}</p>
      )}
      <p
        ref={feedbackRef}
        tabIndex={-1}
        role={failed ? "alert" : "status"}
        aria-live="polite"
        className={`break-words text-sm focus:outline-none ${failed ? "text-gc-error" : "text-gc-accent"}`}
      >
        {feedback}
      </p>
      {failed && (
        <button
          type="button"
          onClick={() => {
            if (
              confirm(
                "Reload this page and discard local entries? An earlier unconfirmed request may already be saved."
              )
            ) {
              setDirty(false);
              setRetryBody(null);
              setNavigation(window.location.href);
            }
          }}
          className="inline-flex min-h-11 items-center text-sm text-gc-accent underline"
        >
          Load the latest page (clears this draft)
        </button>
      )}
      {(dirty || retryBody) && (
        <button
          type="button"
          disabled={busy}
          className="gc-button gc-button-quiet"
          onClick={() => {
            if (
              retryBody &&
              !confirm(
                "This request may already be saved. Clear only this browser's pending retry and entries?"
              )
            )
              return;
            setRetryBody(null);
            setDirty(false);
            formRef.current?.reset();
            setFeedback(
              "Local entries discarded. Previously saved changes remain."
            );
          }}
        >
          Discard local entries
        </button>
      )}
      <button
        disabled={busy}
        type="submit"
        className="min-h-11 rounded-xl bg-gc-action px-5 py-3 text-sm font-semibold text-gc-on-action hover:bg-gc-action focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#f4c98c] disabled:opacity-60"
      >
        {busy ? "Saving..." : retryBody ? "Retry original request" : button}
      </button>
    </form>
  );
}
const inputClass =
  "block min-h-11 w-full min-w-0 rounded-xl border border-gc-divider bg-gc-canvas px-3 py-3 text-base text-gc-text focus:border-gc-action focus:outline-none focus:ring-2 focus:ring-gc-focus";
