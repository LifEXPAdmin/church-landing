"use client";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode
} from "react";
import { socialRequest, SocialClientError } from "@/lib/platform/social-client";
import { useUnsavedSocialWork } from "./use-unsaved-social-work";
import { usePrivateRecovery } from "./private-snapshot-guard";
import { settlePhotoNavigation } from "./use-photo-back-guard";
export type SupportField = {
  name: string;
  label: string;
  type?: "text" | "textarea" | "select" | "checkbox";
  max?: number;
  min?: number;
  options?: { value: string; label: string }[];
  optional?: boolean;
};
export type SupportFormPrivacy = {
  visible: boolean;
  currentAccess: boolean;
  onAccessDenied: () => void;
};
export function SupportForm({
  owner,
  operation,
  fixed = {},
  fields = [],
  button,
  destination,
  caution,
  onRefresh,
  endpoint = "/api/platform/support",
  children,
  readFields,
  onDiscard,
  createdBase = "/platform/help/cases",
  available = true,
  additionalWork,
  onConfirmed,
  receiptKey = "caseId",
  requestKey = "requestKey",
  privacy
}: {
  owner: string;
  operation: string;
  fixed?: Record<string, unknown>;
  fields?: SupportField[];
  button: string;
  destination?: string;
  caution?: string;
  onRefresh?: () => void;
  endpoint?: string;
  children?: ReactNode;
  readFields?: (data: FormData) => Record<string, unknown>;
  onDiscard?: () => void;
  createdBase?: string;
  available?: boolean;
  additionalWork?: { dirty: boolean; saving: boolean };
  onConfirmed?: () => void;
  receiptKey?: "caseId" | "id";
  requestKey?: "requestKey" | "mutationId";
  privacy?: SupportFormPrivacy;
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
  const [values, setValues] = useState<Record<string, string | boolean>>({});
  const [sourceChanged, setSourceChanged] = useState(false);
  const [navigation, setNavigation] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const latestSubmit = useRef<() => void>(() => {});
  const retryOriginal = useCallback(() => latestSubmit.current(), []);
  usePrivateRecovery(id, !!retryBody, busy, retryOriginal);
  useUnsavedSocialWork(
    {
      dirty: dirty || !!additionalWork?.dirty,
      saving: busy || !!retryBody || !!additionalWork?.saving,
      conflict: false
    },
    () =>
      setFeedback("Save, retry or discard these local entries before leaving."),
    true
  );
  useEffect(() => {
    if (!dirty && !retryBody) {
      initialFixed.current = fixed;
      setSourceChanged(false);
    } else if (
      onRefresh &&
      JSON.stringify(initialFixed.current) !== JSON.stringify(fixed)
    )
      setSourceChanged(true);
  }, [fixed, dirty, retryBody, onRefresh]);
  const navigationAllowed = privacy?.currentAccess ?? true;
  useEffect(() => {
    let active = true;
    if (navigation && navigationAllowed)
      void settlePhotoNavigation().then(() => {
        if (active) window.location.assign(navigation);
      });
    return () => {
      active = false;
    };
  }, [navigation, navigationAllowed]);
  useEffect(() => {
    if (feedback && !busy) feedbackRef.current?.focus();
  }, [feedback, busy]);
  const submit = async (form?: HTMLFormElement) => {
    if (
      (privacy &&
        (!privacy.currentAccess || (!privacy.visible && !retryBody))) ||
      busy ||
      inFlight.current ||
      ((sourceChanged || !available) && !retryBody)
    )
      return;
    if (!retryBody && !form) return;
    const data = form ? new FormData(form) : new FormData();
    const payload: Record<string, unknown> = {
      ...initialFixed.current,
      operation
    };
    fields.forEach((f) => {
      payload[f.name] =
        f.type === "checkbox" ? data.get(f.name) === "on" : data.get(f.name);
    });
    if (readFields && !retryBody) Object.assign(payload, readFields(data));
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
      JSON.stringify({ ...payload, [requestKey]: crypto.randomUUID() });
    setRetryBody(serialized);
    inFlight.current = true;
    setBusy(true);
    setFeedback("");
    try {
      const { data: result } = await socialRequest<{
        caseId: string;
        id?: string;
        version: number;
        message: string;
      }>(endpoint, serialized, owner);
      if (
        typeof result[receiptKey] !== "string" ||
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
      onConfirmed?.();
      setValues({});
      form?.reset();
      if (["create", "appeal", "feedback-create"].includes(operation))
        setNavigation(
          `${createdBase}/${encodeURIComponent(result.caseId)}?received=1`
        );
      else if (destination) setNavigation(destination);
      else if (onRefresh) onRefresh();
      // A fresh private document discards stale client route data after a write.
      else setNavigation(window.location.href);
    } catch (error) {
      if (
        error instanceof SocialClientError &&
        [401, 403].includes(error.status)
      )
        privacy?.onAccessDenied();
      if (
        onRefresh &&
        error instanceof SocialClientError &&
        error.status === 409
      )
        setSourceChanged(true);
      // Rate limiting precedes receipt lookup. A 429 cannot disprove an earlier
      // accepted request whose response was lost, so retain its exact retry key.
      if (
        error instanceof SocialClientError &&
        [400, 409].includes(error.status)
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
  };
  latestSubmit.current = () => void submit(formRef.current ?? undefined);
  if (privacy && !privacy.visible) {
    return privacy.currentAccess ? (
      <div className="space-y-3">
        {failed && (
          <p role="alert" className="text-sm text-gc-error">
            {retryBody
              ? "We could not confirm the original request. Recheck access and retry the same request."
              : "This request could not be applied. Reload current information and review the form before sending again."}
          </p>
        )}
        {retryBody && (
          <button
            type="button"
            className="gc-button"
            disabled={busy}
            onClick={retryOriginal}
          >
            {busy ? "Confirming original request…" : "Confirm original request"}
          </button>
        )}
      </div>
    ) : null;
  }
  return (
    <form
      ref={formRef}
      onChange={() => setDirty(true)}
      aria-label={button}
      aria-busy={busy}
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        void submit(event.currentTarget);
      }}
    >
      <fieldset disabled={busy || !!retryBody} className="min-w-0 space-y-4">
        {children}
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
                checked={privacy ? values[f.name] === true : undefined}
                onChange={
                  privacy
                    ? (event) =>
                        setValues((current) => ({
                          ...current,
                          [f.name]: event.target.checked
                        }))
                    : undefined
                }
                required={!f.optional}
                className="h-6 w-6 accent-[#e6b56c] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#f4c98c]"
              />
            ) : f.type === "select" ? (
              <select
                value={
                  privacy
                    ? String(values[f.name] ?? f.options?.[0]?.value ?? "")
                    : undefined
                }
                onChange={
                  privacy
                    ? (event) =>
                        setValues((current) => ({
                          ...current,
                          [f.name]: event.target.value
                        }))
                    : undefined
                }
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
                value={privacy ? String(values[f.name] ?? "") : undefined}
                onChange={
                  privacy
                    ? (event) =>
                        setValues((current) => ({
                          ...current,
                          [f.name]: event.target.value
                        }))
                    : undefined
                }
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
                value={privacy ? String(values[f.name] ?? "") : undefined}
                onChange={
                  privacy
                    ? (event) =>
                        setValues((current) => ({
                          ...current,
                          [f.name]: event.target.value
                        }))
                    : undefined
                }
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
      {sourceChanged && !retryBody && onRefresh && (
        <div className="space-y-3 rounded-xl border border-gc-divider p-4">
          <p>
            The request changed. Your reply or reason is still here. Refresh and
            review the current request before applying these entries.
          </p>
          <button
            type="button"
            className="gc-button gc-button-quiet"
            onClick={onRefresh}
          >
            Refresh this request
          </button>
          <button
            type="button"
            className="gc-button gc-button-quiet"
            onClick={() => {
              initialFixed.current = fixed;
              setSourceChanged(false);
              setFeedback(
                "Current version selected. Review these retained entries, then save."
              );
            }}
          >
            Use current request with these entries
          </button>
        </div>
      )}
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
            setSourceChanged(false);
            initialFixed.current = fixed;
            setValues({});
            formRef.current?.reset();
            onDiscard?.();
            setFeedback(
              "Local entries discarded. Previously saved changes remain."
            );
          }}
        >
          Discard local entries
        </button>
      )}
      <button
        disabled={busy || ((sourceChanged || !available) && !retryBody)}
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
