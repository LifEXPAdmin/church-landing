"use client";
import { useEffect, useId, useRef, useState } from "react";
import { socialRequest, SocialClientError } from "@/lib/platform/social-client";
import { useUnsavedSocialWork } from "./use-unsaved-social-work";
import { AccountConfirmation, useAccountConfirmation } from "./google-account";
import type { RecentAuthenticationPurpose } from "@/lib/platform/account-credential";

export type AdminField = {
  name: string;
  label: string;
  type?:
    | "text"
    | "password"
    | "textarea"
    | "select"
    | "tags"
    | "datetime-local"
    | "number"
    | "checkbox";
  value?: string | number;
  max?: number;
  min?: number;
  optional?: boolean;
  options?: { value: string; label: string }[];
};
export const adminInputClass =
  "block min-h-11 w-full min-w-0 rounded-xl border border-gc-divider bg-gc-canvas px-3 py-3 text-base text-gc-text focus:border-gc-action focus:outline-none focus:ring-2 focus:ring-gc-focus";
export function AdminForm({
  owner,
  operation,
  fixed = {},
  fields = [],
  button,
  onSaved,
  caution,
  onDraftChange,
  onResult,
  confirmationPurpose,
  endpoint = "/api/platform/admin",
  available = true
}: {
  owner: string;
  operation: string;
  fixed?: Record<string, unknown>;
  fields?: AdminField[];
  button: string;
  onSaved: () => void;
  caution?: string;
  onDraftChange?: (dirty: boolean) => void;
  onResult?: (result: Record<string, unknown>) => void;
  confirmationPurpose?: RecentAuthenticationPurpose;
  endpoint?: "/api/platform/admin" | "/api/platform/authenticator";
  available?: boolean;
}) {
  const confirmation = useAccountConfirmation(
    confirmationPurpose ?? "manage-admin-access"
  );
  const id = useId(),
    form = useRef<HTMLFormElement>(null),
    writing = useRef(false),
    original = useRef(fixed);
  const [busy, setBusy] = useState(false),
    [dirty, setDirty] = useState(false),
    [pending, setPending] = useState<string | null>(null),
    [notice, setNotice] = useState(""),
    [failed, setFailed] = useState(false),
    [conflict, setConflict] = useState(false),
    [retryAt, setRetryAt] = useState(0);
  const status = useRef<HTMLParagraphElement>(null);
  const focusPending = useRef(false);
  useUnsavedSocialWork(
    { dirty, saving: busy || !!pending, conflict },
    () =>
      setNotice("Save, retry or discard these local entries before leaving."),
    true
  );
  useEffect(() => {
    if (!dirty && !pending) original.current = fixed;
    else if (JSON.stringify(original.current) !== JSON.stringify(fixed))
      setConflict(true);
  }, [fixed, dirty, pending]);
  useEffect(() => {
    onDraftChange?.(dirty || !!pending);
  }, [onDraftChange, dirty, pending]);
  useEffect(() => {
    if (notice && !busy) focusPending.current = true;
    const focus = () => {
      if (focusPending.current && status.current?.getClientRects().length) {
        status.current.focus();
        focusPending.current = false;
      }
    };
    focus();
    window.addEventListener("admin-view-visible", focus);
    return () => window.removeEventListener("admin-view-visible", focus);
  }, [notice, busy]);
  useEffect(() => {
    if (retryAt) {
      const timer = setTimeout(
        () => setRetryAt(0),
        Math.max(0, retryAt - Date.now())
      );
      return () => clearTimeout(timer);
    }
  }, [retryAt]);
  return (
    <form
      ref={form}
      aria-label={button}
      aria-busy={busy}
      className="space-y-4"
      onChange={() => setDirty(true)}
      onSubmit={async (event) => {
        event.preventDefault();
        if (
          writing.current ||
          (!available && !pending) ||
          retryAt ||
          (conflict && !pending) ||
          (confirmationPurpose && !confirmation.ready && !pending)
        )
          return;
        const data = new FormData(event.currentTarget),
          payload: Record<string, unknown> = {
            ...original.current,
            operation,
            ...(confirmationPurpose ? confirmation.credentials(data) : {})
          };
        for (const field of fields) {
          const value = String(data.get(field.name) ?? "");
          payload[field.name] =
            field.type === "checkbox"
              ? data.get(field.name) === "on"
              : field.type === "tags"
                ? value
                    .split(",")
                    .map((v) => v.trim())
                    .filter(Boolean)
                : field.type === "number"
                  ? Number(value)
                  : field.type === "datetime-local"
                    ? value
                      ? new Date(value).toISOString()
                      : ""
                    : value;
        }
        if (typeof payload.destinationChoice === "string") {
          const [destinationId, version] = payload.destinationChoice.split(":");
          payload.destinationId = destinationId;
          payload.destinationVersion = Number(version);
          delete payload.destinationChoice;
        }
        const body =
          pending ??
          JSON.stringify({ ...payload, requestKey: crypto.randomUUID() });
        writing.current = true;
        setBusy(true);
        setPending(body);
        setNotice("");
        try {
          const { data: result } = await socialRequest<{
            version?: number;
            message: string;
            results?: {
              sourceType: string;
              sourceId: string;
              ok: boolean;
              status: number;
              message: string;
            }[];
          }>(endpoint, body, owner);
          if (
            typeof result.message !== "string" ||
            (!result.results &&
              (!Number.isSafeInteger(result.version) ||
                Number(result.version) < 1))
          )
            throw new SocialClientError(
              503,
              "This result is unconfirmed. Retry the original action."
            );
          const uncertain = result.results?.some(
            (r) =>
              !r.ok && ([401, 403, 404].includes(r.status) || r.status >= 500)
          );
          const incomplete = result.results?.some((r) => !r.ok);
          setNotice(
            result.message +
              (result.results
                ? "\n" +
                  result.results
                    .map(
                      (r, i) =>
                        `${i + 1}. ${r.ok ? "Saved" : "Unconfirmed"}: ${r.message}`
                    )
                    .join("\n")
                : "")
          );
          setFailed(!!incomplete);
          setPending(uncertain ? body : null);
          setDirty(!!incomplete);
          setConflict(!!incomplete && !uncertain);
          if (!incomplete) {
            form.current?.reset();
            if (confirmationPurpose) confirmation.finish();
          }
          onResult?.(result);
          onSaved();
        } catch (error) {
          const code = error instanceof SocialClientError ? error.status : 503;
          // Rate limiting can run before an already accepted request's receipt
          // is read. Keep its original bytes and key through the cooldown.
          if ([400, 409].includes(code)) setPending(null);
          if (code === 409) setConflict(true);
          if (error instanceof SocialClientError && error.retryAfter)
            setRetryAt(Date.now() + Math.min(86400, error.retryAfter) * 1000);
          setFailed(true);
          setNotice(
            error instanceof Error
              ? error.message
              : "Could not confirm this action. Keep your entries and retry."
          );
          if ([401, 403, 404].includes(code))
            window.dispatchEvent(new Event("admin-access-changed"));
        } finally {
          writing.current = false;
          setBusy(false);
        }
      }}
    >
      <fieldset className="min-w-0 space-y-4" disabled={busy || !!pending}>
        {confirmationPurpose && (
          <AccountConfirmation
            value={confirmation}
            id={`${id}-confirmation`}
            label="Confirm your current sign-in for this action"
          />
        )}
        {fields.map((field) => (
          <div key={field.name}>
            <label
              className="mb-2 block text-sm font-semibold"
              htmlFor={`${id}-${field.name}`}
            >
              {field.label}
              {field.optional ? " (optional)" : ""}
            </label>
            {field.type === "checkbox" ? (
              <input
                id={`${id}-${field.name}`}
                name={field.name}
                type="checkbox"
                required={!field.optional}
                className="h-6 w-6 accent-gc-accent"
              />
            ) : field.type === "textarea" ? (
              <textarea
                id={`${id}-${field.name}`}
                name={field.name}
                defaultValue={field.value}
                required={!field.optional}
                minLength={field.min}
                maxLength={field.max}
                rows={4}
                className={adminInputClass}
              />
            ) : field.type === "select" ? (
              <select
                id={`${id}-${field.name}`}
                name={field.name}
                defaultValue={field.value}
                required={!field.optional}
                className={adminInputClass}
              >
                {field.options?.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            ) : (
              <input
                id={`${id}-${field.name}`}
                name={field.name}
                type={
                  field.type === "datetime-local" || field.type === "number" || field.type === "password"
                    ? field.type
                    : "text"
                }
                defaultValue={field.value}
                required={!field.optional}
                minLength={field.min}
                maxLength={field.max}
                min={field.type === "number" ? field.min : undefined}
                className={adminInputClass}
              />
            )}
          </div>
        ))}
      </fieldset>
      {caution && <p className="text-sm text-gc-muted">{caution}</p>}
      <p
        ref={status}
        tabIndex={-1}
        role={failed ? "alert" : "status"}
        className="whitespace-pre-wrap break-words text-sm focus:outline-none"
      >
        {notice}
      </p>
      {conflict && !pending && (
        <div className="space-y-3 rounded-xl border border-gc-divider p-4">
          <p>
            The request or selection changed. Your entries are still here.
            Review the current details before applying them.
          </p>
          <button
            type="button"
            className="gc-button gc-button-quiet"
            onClick={() => onSaved()}
          >
            Refresh current details
          </button>
          <button
            type="button"
            className="gc-button gc-button-quiet"
            onClick={() => {
              original.current = fixed;
              setConflict(false);
              setNotice(
                "Current version selected. Review your retained entries, then save."
              );
            }}
          >
            Use current version with these entries
          </button>
        </div>
      )}
      <div className="flex flex-wrap gap-3">
        <button
          className="gc-button"
          disabled={
            busy ||
            (!available && !pending) ||
            !!retryAt ||
            (conflict && !pending) ||
            !!(confirmationPurpose && !confirmation.ready && !pending)
          }
        >
          {busy ? "Saving…" : pending ? "Retry original action" : button}
        </button>
        {(dirty || pending) && (
          <button
            type="button"
            className="gc-button gc-button-quiet"
            disabled={busy}
            onClick={() => {
              if (
                pending &&
                !confirm(
                  "This action may already be saved. Discard only this browser’s entries and pending retry?"
                )
              )
                return;
              setPending(null);
              setDirty(false);
              setConflict(false);
              original.current = fixed;
              form.current?.reset();
              setNotice("Local entries discarded. Saved changes remain.");
            }}
          >
            Discard local entries
          </button>
        )}
      </div>
    </form>
  );
}
