"use client";
import { flushSync } from "react-dom";
import { settlePhotoNavigation } from "./use-photo-back-guard";
import { useRouter } from "next/navigation";
import { useCallback, useId, useRef, useState } from "react";
import { socialRequest, SocialClientError } from "@/lib/platform/social-client";
import { usePrivateRecovery } from "./private-snapshot-guard";
import { useReadVisibility } from "./read-visibility";
import { useUnsavedSocialWork } from "./use-unsaved-social-work";

export function usePrivateChoiceAction(
  endpoint: string,
  owner: string,
  dirty = false,
  onSaved?: (receipt: { id: string; version: number; message: string }) => void,
  protectBack = false
) {
  const router = useRouter(),
    visible = useReadVisibility(),
    id = useId();
  const [pending, setPending] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [conflict, setConflict] = useState(false),
    [message, setMessage] = useState(""),
    [saved, setSaved] = useState(false);
  const flight = useRef(false);
  const send = useCallback(
    async (body: string) => {
      if (flight.current) return false;
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
          typeof data.message !== "string"
        )
          throw new SocialClientError(
            503,
            "The response could not be confirmed. Confirm the original save before another change."
          );
        flushSync(() => {
          setPending(null);
          setBusy(false);
          setConflict(false);
          if (protectBack) setSaved(true);
          setMessage(data.message);
        });
        if (protectBack) await settlePhotoNavigation();
        onSaved?.(data);
        router.refresh();
        return true;
      } catch (error) {
        if (
          error instanceof SocialClientError &&
          !error.needsAuthenticator &&
          [400, 403, 404, 409, 429].includes(error.status)
        ) {
          setPending(null);
          setConflict([403, 404, 409].includes(error.status));
        }
        if (error instanceof SocialClientError && error.status === 401)
          router.refresh();
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
    { dirty: dirty && !saved, saving: busy || !!pending, conflict },
    () => setMessage("Save or resolve your private choice before leaving."),
    protectBack
  );
  return {
    blocked: !visible || busy || !!pending || conflict || saved,
    async command(value: Record<string, unknown>) {
      if (!visible || flight.current || pending || conflict || saved)
        return false;
      return send(
        JSON.stringify({ ...value, mutationId: crypto.randomUUID() })
      );
    },
    status: (
      <div className="space-y-2" aria-live="polite">
        {message && <p role="status">{message}</p>}
        {pending && (
          <button
            className="gc-button gc-button-quiet"
            type="button"
            disabled={busy}
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
