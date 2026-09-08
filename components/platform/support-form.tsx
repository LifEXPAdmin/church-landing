"use client";
import { useEffect, useId, useRef, useState } from "react";
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
  operation,
  fixed = {},
  fields = [],
  button,
  destination,
  caution
}: {
  operation: string;
  fixed?: Record<string, unknown>;
  fields?: SupportField[];
  button: string;
  destination?: string;
  caution?: string;
}) {
  const id = useId();
  const [pending, setBusy] = useState(false);
  const inFlight = useRef(false);
  const busy = pending;
  const [feedback, setFeedback] = useState("");
  const [failed, setFailed] = useState(false);
  const feedbackRef = useRef<HTMLParagraphElement>(null);
  const retry = useRef<{ serialized: string; key: string } | null>(null);
  useEffect(() => {
    if (feedback && !busy) feedbackRef.current?.focus();
  }, [feedback, busy]);
  return (
    <form
      aria-label={button}
      aria-busy={busy}
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        if (busy || inFlight.current) return;
        const form = e.currentTarget;
        const data = new FormData(form);
        const payload: Record<string, unknown> = { ...fixed, operation };
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
        const serialized = JSON.stringify(payload);
        if (retry.current?.serialized !== serialized)
          retry.current = { serialized, key: crypto.randomUUID() };
        inFlight.current = true;
        setBusy(true);
        setFeedback("");
        try {
          const response = await fetch("/api/platform/support", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...payload, requestKey: retry.current.key }),
            cache: "no-store"
          });
          const result = await response.json();
          if (!response.ok) {
            setFailed(true);
            setFeedback(
              result.message ||
                "Please try again. Your request has not been confirmed."
            );
          } else {
            setFailed(false);
            setFeedback(result.message);
            retry.current = null;
            form.reset();
            if (operation === "create" && typeof result.caseId === "string")
              window.location.assign(
                `/platform/help/cases/${encodeURIComponent(result.caseId)}?received=1`
              );
            else if (destination) window.location.assign(destination);
            // A fresh private document discards stale client route data after a write.
            else window.location.reload();
          }
        } catch {
          setFailed(true);
          setFeedback(
            "We could not confirm that this saved. Keep this form open and retry with the same information; a retry will not duplicate it."
          );
        } finally {
          inFlight.current = false;
          setBusy(false);
        }
      }}
    >
      {fields.map((f) => (
        <div key={f.name}>
          <label
            htmlFor={`${id}-${f.name}`}
            className="mb-2 block text-sm font-semibold text-[#f3dfc3]"
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
            <p className="mt-1 text-xs text-[#d8c4a8]">
              Up to {f.max.toLocaleString()} characters. Plain text only.
            </p>
          )}
        </div>
      ))}
      {caution && (
        <p className="text-sm leading-relaxed text-[#d8c4a8]">{caution}</p>
      )}
      <p
        ref={feedbackRef}
        tabIndex={-1}
        role={failed ? "alert" : "status"}
        aria-live="polite"
        className={`break-words text-sm focus:outline-none ${failed ? "text-rose-200" : "text-[#f4c98c]"}`}
      >
        {feedback}
      </p>
      {failed && (
        <a
          href=""
          className="inline-flex min-h-11 items-center text-sm text-[#f4c98c] underline"
        >
          Load the latest page (clears this draft)
        </a>
      )}
      <button
        disabled={busy}
        type="submit"
        className="min-h-11 rounded-xl bg-[#e6b56c] px-5 py-3 text-sm font-semibold text-[#21170d] hover:bg-[#f4c98c] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#f4c98c] disabled:opacity-60"
      >
        {busy ? "Saving..." : button}
      </button>
    </form>
  );
}
const inputClass =
  "block min-h-11 w-full min-w-0 rounded-xl border border-[#f2d8af]/30 bg-[#130e09] px-3 py-3 text-base text-white focus:border-[#f4c98c] focus:outline-none focus:ring-2 focus:ring-[#f4c98c]/50";
