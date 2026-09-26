"use client";
import { flushSync } from "react-dom";
import { settlePhotoNavigation } from "./use-photo-back-guard";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { socialRequest, SocialClientError } from "@/lib/platform/social-client";
import { usePrivateRecovery } from "./private-snapshot-guard";
import { useReadVisibility } from "./read-visibility";
import { useUnsavedSocialWork } from "./use-unsaved-social-work";

type ChoiceReceipt = { id: string; version: number; message: string };
export type PrivateChoiceAccess = {
  currentAccess: boolean;
  onAccessDenied: () => void;
  onConfirmed: (receipt: ChoiceReceipt) => void;
};

export function usePrivateChoiceAction(
  endpoint: string,
  owner: string,
  dirty = false,
  onSaved?: (receipt: ChoiceReceipt) => void,
  protectBack = false,
  privacy?: PrivateChoiceAccess
) {
  const router = useRouter(),
    visible = useReadVisibility(),
    id = useId();
  const [pending, setPending] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [conflict, setConflict] = useState(false),
    [message, setMessage] = useState(""),
    [saved, setSaved] = useState(false);
  const [confirmation, setConfirmation] = useState<ChoiceReceipt | null>(null);
  const latest = useRef({ privacy, onSaved });
  latest.current = { privacy, onSaved };
  const flight = useRef(false);
  useEffect(() => {
    if (confirmation && privacy?.currentAccess) setSaved(true);
  }, [confirmation, privacy?.currentAccess]);
  useEffect(() => {
    if (!confirmation || !saved || !privacy?.currentAccess) return;
    let cancelled = false;
    void (async () => {
      if (protectBack) await settlePhotoNavigation();
      if (
        cancelled ||
        !latest.current.privacy?.currentAccess ||
        document.visibilityState === "hidden" ||
        navigator.onLine === false
      )
        return;
      latest.current.onSaved?.(confirmation);
      latest.current.privacy.onConfirmed(confirmation);
      setConfirmation(null);
    })();
    return () => {
      cancelled = true;
    };
  }, [confirmation, saved, privacy?.currentAccess, protectBack]);
  const send = useCallback(
    async (body: string) => {
      if (
        flight.current ||
        (latest.current.privacy && !latest.current.privacy.currentAccess)
      )
        return false;
      flight.current = true;
      setBusy(true);
      setPending(body);
      setMessage("Saving your private choice…");
      try {
        const { data } = await socialRequest<{
          id: string;
          version: number;
          message: string;
        }>(endpoint, body, owner);
        if (
          typeof data.id !== "string" ||
          !Number.isInteger(data.version) ||
          typeof data.message !== "string" ||
          (latest.current.privacy && data.id !== owner)
        )
          throw new SocialClientError(
            503,
            "The response could not be confirmed. Confirm the original save before another change."
          );
        flushSync(() => {
          setPending(null);
          setBusy(false);
          setConflict(false);
          if (protectBack && !latest.current.privacy) setSaved(true);
          if (latest.current.privacy) setConfirmation(data);
          setMessage(data.message);
        });
        if (latest.current.privacy) return true;
        if (protectBack) await settlePhotoNavigation();
        onSaved?.(data);
        router.refresh();
        return true;
      } catch (error) {
        if (
          error instanceof SocialClientError &&
          !error.needsAuthenticator &&
          (latest.current.privacy
            ? [400, 409]
            : [400, 403, 404, 409, 429]
          ).includes(error.status)
        ) {
          setPending(null);
          setConflict([403, 404, 409].includes(error.status));
        }
        if (error instanceof SocialClientError) {
          if (latest.current.privacy && [401, 403, 404].includes(error.status))
            latest.current.privacy.onAccessDenied();
          else if (error.status === 401) router.refresh();
        }
        setMessage(
          error instanceof Error
            ? error.message
            : "The reply was lost. Keep these entries and confirm the same request."
        );
        return false;
      } finally {
        flight.current = false;
        setBusy(false);
      }
    },
    [endpoint, owner, router, onSaved, protectBack]
  );
  const retry = useCallback(() => {
    if (pending) void send(pending);
  }, [pending, send]);
  usePrivateRecovery("private-choice-" + id, !!pending, busy, retry);
  useUnsavedSocialWork(
    {
      dirty: dirty && !saved,
      saving: busy || !!pending || (!!confirmation && !saved),
      conflict
    },
    () => setMessage("Save or resolve your private choice before leaving."),
    protectBack
  );
  return {
    blocked:
      !visible ||
      (privacy && !privacy.currentAccess) ||
      busy ||
      !!pending ||
      !!confirmation ||
      conflict ||
      saved,
    async command(value: Record<string, unknown>) {
      if (
        !visible ||
        flight.current ||
        pending ||
        confirmation ||
        conflict ||
        saved
      )
        return false;
      return send(
        JSON.stringify({ ...value, mutationId: crypto.randomUUID() })
      );
    },
    status: (
      <div className="space-y-2" aria-live="polite">
        {message && (
          <p role="status">
            {privacy && !visible
              ? "Your local choices and any original save are retained. Recheck current access before continuing."
              : message}
          </p>
        )}
        {pending && (
          <button
            className="gc-button gc-button-quiet"
            type="button"
            disabled={busy || (privacy && !privacy.currentAccess)}
            onClick={retry}
          >
            {busy ? "Confirming save…" : "Confirm original save"}
          </button>
        )}
        {conflict && (
          <button
            className="gc-button gc-button-quiet"
            type="button"
            onClick={() => {
              if (
                confirm(
                  "Reload current saved choices and discard these local entries?"
                )
              )
                window.location.reload();
            }}
          >
            Reload current saved choices
          </button>
        )}
      </div>
    )
  };
}
