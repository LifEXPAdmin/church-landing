"use client";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { socialRequest, SocialClientError } from "@/lib/platform/social-client";
import {
  suspensionReasons,
  accountRestorationReasons
} from "@/lib/platform/account-restriction-types";
import { useUnsavedSocialWork } from "./use-unsaved-social-work";
import { usePrivateRecovery } from "./private-snapshot-guard";
import { portalInputClass } from "./portal-action-form";

export function AccountRestrictionForm({
  owner,
  target,
  onProtected
}: {
  owner: string;
  target: { id: string; name: string; version: number; suspended?: boolean };
  onProtected: (protectedWork: boolean) => void;
}) {
  const id = useId();
  const form = useRef<HTMLFormElement>(null);
  const flight = useRef(false);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [saved, setSaved] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const feedback = useRef<HTMLParagraphElement>(null);
  const [reload, setReload] = useState(false);
  const protectedWork = dirty || busy || !!retry || conflict;
  useEffect(() => {
    onProtected(protectedWork || saved);
    return () => onProtected(false);
  }, [onProtected, protectedWork, saved]);
  useEffect(() => {
    if (reload) window.location.reload();
  }, [reload]);
  useEffect(() => {
    if (message && !busy) feedback.current?.focus();
  }, [message, busy]);
  const retryOriginal = useCallback(() => form.current?.requestSubmit(), []);
  usePrivateRecovery(id, !!retry, busy, retryOriginal);
  useUnsavedSocialWork(
    { dirty, saving: busy || !!retry, conflict },
    () => setMessage("Retry or discard this local decision before leaving."),
    true
  );
  const label = target.suspended ? "Restore account access" : "Suspend account";
  return (
    <form
      ref={form}
      aria-label={label}
      aria-busy={busy}
      className="space-y-4"
      onChange={() => setDirty(true)}
      onSubmit={async (event) => {
        event.preventDefault();
        if (flight.current || saved || conflict) return;
        const data = new FormData(event.currentTarget);
        const body =
          retry ??
          JSON.stringify({
            operation: "suspend",
            mutationId: crypto.randomUUID(),
            userId: target.id,
            expectedVersion: target.version,
            suspended: !target.suspended,
            reason: data.get("reason")
          });
        setRetry(body);
        flight.current = true;
        setBusy(true);
        setMessage("");
        try {
          const { data: result } = await socialRequest<{ message: string }>(
            "/api/platform/portal",
            body,
            owner
          );
          if (typeof result.message !== "string" || !result.message)
            throw new SocialClientError(
              503,
              "The result is unconfirmed. Retry the original request."
            );
          setSaved(true);
          setDirty(false);
          setRetry(null);
          setFailed(false);
          setMessage(result.message);
        } catch (error) {
          if (
            error instanceof SocialClientError &&
            [400, 409, 429].includes(error.status)
          ) {
            setRetry(null);
            if (error.status === 409) setConflict(true);
          }
          setFailed(true);
          setMessage(
            error instanceof Error
              ? error.message
              : "The result is unconfirmed. Retry the original request."
          );
        } finally {
          flight.current = false;
          setBusy(false);
        }
      }}
    >
      <fieldset
        disabled={busy || !!retry || saved || conflict}
        className="space-y-4"
      >
        <label htmlFor={`${id}-reason`} className="block text-sm font-semibold">
          Reason for this decision
        </label>
        <select
          id={`${id}-reason`}
          name="reason"
          required
          className={portalInputClass}
          defaultValue=""
        >
          <option value="">Choose a reason</option>
          {Object.entries(
            target.suspended ? accountRestorationReasons : suspensionReasons
          ).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <p className="text-sm text-gc-muted">
          The account access audit records this reason. Keep report details in
          the existing restricted report or help case.
        </p>
        <label className="flex items-start gap-3 text-sm">
          <input type="checkbox" required className="mt-1 h-5 w-5 shrink-0" />
          <span>
            {target.suspended
              ? `Restore account access for ${target.name} without restoring old assignments.`
              : `Suspend ${target.name}'s account and end their sessions and private assignments.`}
          </span>
        </label>
      </fieldset>
      <p
        ref={feedback}
        tabIndex={-1}
        role={failed ? "alert" : "status"}
        className={`break-words text-sm ${failed ? "text-gc-error" : "text-gc-accent"}`}
      >
        {message}
      </p>
      {!saved && !conflict && (
        <button
          type="submit"
          disabled={busy}
          className="gc-button gc-button-primary"
        >
          {busy ? "Saving…" : retry ? "Retry original request" : label}
        </button>
      )}
      {(protectedWork || saved) && (
        <button
          type="button"
          disabled={busy}
          className="gc-button gc-button-quiet"
          onClick={() => {
            if (
              !saved &&
              !confirm(
                "Reload and discard this local decision? An unconfirmed request may already be saved."
              )
            )
              return;
            setDirty(false);
            setRetry(null);
            setConflict(false);
            setReload(true);
          }}
        >
          {saved
            ? "Inspect current account access"
            : "Discard local decision and reload"}
        </button>
      )}
    </form>
  );
}
