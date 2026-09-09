"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export type PortalOperation =
  | "ack-adult"
  | "request"
  | "transition"
  | "share"
  | "establish"
  | "grant"
  | "revoke-grant"
  | "assign-contact"
  | "revoke-contact"
  | "suspend";

export type PortalField = {
  name: string;
  label: string;
  type?: "text" | "email" | "tel" | "textarea" | "select" | "checkbox";
  value?: string | boolean;
  required?: boolean;
  maxLength?: number;
  pattern?: string;
  hint?: string;
  options?: { value: string; label: string }[];
};

export const portalInputClass =
  "mt-2 block min-h-11 w-full rounded-xl border border-gc-divider bg-gc-canvas px-3 py-3 text-base text-gc-text placeholder:text-gc-muted focus:outline-none focus:ring-2 focus:ring-gc-focus disabled:opacity-60";
export const portalButtonClass =
  "inline-flex min-h-11 items-center justify-center rounded-full bg-gc-action px-5 py-3 text-sm font-semibold text-gc-on-action hover:bg-gc-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gc-focus focus-visible:ring-offset-2 focus-visible:ring-offset-gc-surface disabled:cursor-not-allowed disabled:opacity-60";

export function PortalActionForm({
  operation,
  payload,
  fields = [],
  label,
  description,
  confirmation,
  disabled = false
}: {
  operation: PortalOperation;
  payload: {
    expectedVersion: number;
    [key: string]: string | number | boolean;
  };
  fields?: PortalField[];
  label: string;
  description?: string;
  confirmation?: string;
  disabled?: boolean;
}) {
  const id = useId();
  const router = useRouter();
  const resultRef = useRef<HTMLParagraphElement>(null);
  const inFlight = useRef(false);
  const [pending, setPending] = useState(false);
  const [refreshing, startRefresh] = useTransition();
  const [result, setResult] = useState<{
    failed: boolean;
    message: string;
  } | null>(null);
  const busy = pending || refreshing;

  useEffect(() => {
    if (result) resultRef.current?.focus();
  }, [result]);

  return (
    <form
      aria-label={label}
      aria-busy={busy}
      className="space-y-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (inFlight.current || busy || disabled) return;
        const form = event.currentTarget;
        const data = new FormData(form);
        const values = Object.fromEntries(
          fields.map((field) => [
            field.name,
            field.type === "checkbox"
              ? data.has(field.name)
              : String(data.get(field.name) ?? "")
          ])
        );
        inFlight.current = true;
        setPending(true);
        setResult(null);
        try {
          const response = await fetch("/api/platform/portal", {
            method: "POST",
            credentials: "same-origin",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...values, ...payload, operation })
          });
          const body: unknown = await response.json().catch(() => null);
          const message =
            body &&
            typeof body === "object" &&
            "message" in body &&
            typeof body.message === "string"
              ? body.message
              : response.ok
                ? "Your change was saved."
                : "Your change could not be saved. Please try again.";
          setResult({
            failed: !response.ok,
            message:
              response.status === 409
                ? "This information changed since you opened it. The latest details are being loaded. Review them before trying again."
                : response.status === 401
                  ? "Your session has ended. Sign in again before continuing."
                  : message
          });
          // Refresh on errors too: permissions and versions may have changed.
          startRefresh(() => router.refresh());
        } catch {
          setResult({
            failed: true,
            message:
              "We could not confirm your change. Check the refreshed information before trying again."
          });
          startRefresh(() => router.refresh());
        } finally {
          inFlight.current = false;
          setPending(false);
        }
      }}
    >
      {description && (
        <p className="text-sm leading-relaxed text-gc-muted">{description}</p>
      )}
      <fieldset
        key={JSON.stringify(payload)}
        disabled={busy || disabled}
        className="min-w-0 space-y-4"
      >
        <legend className="sr-only">{label}</legend>
        {fields.map((field) => {
          const inputId = `${id}-${field.name}`;
          const describedBy = field.hint ? `${inputId}-hint` : undefined;
          return (
            <div key={field.name}>
              <label
                htmlFor={inputId}
                className={`text-sm font-semibold text-gc-text ${field.type === "checkbox" ? "flex min-h-11 items-start gap-3" : "block"}`}
              >
                {field.type === "checkbox" && (
                  <input
                    id={inputId}
                    name={field.name}
                    type="checkbox"
                    defaultChecked={field.value === true}
                    required={field.required}
                    aria-describedby={describedBy}
                    className="mt-1 h-5 w-5 shrink-0 accent-[#f4c98c] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gc-focus"
                  />
                )}
                {field.label}
                {field.required ? " (required)" : ""}
              </label>
              {field.type === "select" ? (
                <select
                  id={inputId}
                  name={field.name}
                  defaultValue={
                    typeof field.value === "string" ? field.value : ""
                  }
                  required={field.required}
                  aria-describedby={describedBy}
                  className={portalInputClass}
                >
                  {field.options?.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              ) : field.type === "textarea" ? (
                <textarea
                  id={inputId}
                  name={field.name}
                  defaultValue={
                    typeof field.value === "string" ? field.value : ""
                  }
                  required={field.required}
                  maxLength={field.maxLength}
                  aria-describedby={describedBy}
                  rows={4}
                  className={portalInputClass}
                />
              ) : field.type !== "checkbox" ? (
                <input
                  id={inputId}
                  name={field.name}
                  type={field.type ?? "text"}
                  defaultValue={
                    typeof field.value === "string" ? field.value : ""
                  }
                  required={field.required}
                  maxLength={field.maxLength}
                  pattern={field.pattern}
                  aria-describedby={describedBy}
                  className={portalInputClass}
                />
              ) : null}
              {field.hint && (
                <p
                  id={describedBy}
                  className="mt-2 text-sm leading-relaxed text-gc-muted"
                >
                  {field.hint}
                </p>
              )}
            </div>
          );
        })}
        {confirmation && (
          <label
            htmlFor={`${id}-confirmation`}
            className="flex min-h-11 items-start gap-3 text-sm text-gc-muted"
          >
            <input
              id={`${id}-confirmation`}
              type="checkbox"
              required
              className="mt-1 h-5 w-5 shrink-0 accent-[#f4c98c] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gc-focus"
            />
            {confirmation}
          </label>
        )}
        <button
          type="submit"
          disabled={busy || disabled}
          className={`${portalButtonClass} w-full sm:w-auto`}
        >
          {busy ? "Please wait..." : label}
        </button>
      </fieldset>
      {result && (
        <p
          ref={resultRef}
          tabIndex={-1}
          role={result.failed ? "alert" : "status"}
          className={`rounded-xl border p-3 text-sm focus:outline-none focus:ring-2 focus:ring-gc-focus ${result.failed ? "border-gc-error bg-gc-error-surface text-gc-error" : "border-gc-action text-gc-accent"}`}
        >
          {result.message}
        </p>
      )}
    </form>
  );
}
