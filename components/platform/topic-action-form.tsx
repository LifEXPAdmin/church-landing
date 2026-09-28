"use client";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useId,
  useRef,
  useState,
  type ReactNode
} from "react";
import { useRouter } from "next/navigation";
import { flushSync } from "react-dom";
import {
  currentSocialOwner,
  socialRequest,
  SocialClientError
} from "@/lib/platform/social-client";
import { useUnsavedSocialWork } from "./use-unsaved-social-work";
import { usePrivateRecovery } from "./private-snapshot-guard";
import { settlePhotoNavigation } from "./use-photo-back-guard";

type Receipt = { id: string; version: number; message: string };
/** Topic forms keep one immutable request until its outcome is confirmed. */
export function TopicActionForm({
  owner,
  payload,
  label,
  children,
  fields,
  onDone,
  concealed = false,
  accessVersion
}: {
  owner: string;
  payload: Record<string, unknown>;
  label: string;
  children?: ReactNode;
  fields?: (data: FormData) => Record<string, unknown>;
  onDone?: (receipt: Receipt, request: Record<string, unknown>) => void;
  concealed?: boolean;
  accessVersion?: () => number | null;
}) {
  const router = useRouter(),
    id = useId(),
    form = useRef<HTMLFormElement>(null),
    mounted = useRef(true),
    flight = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const originalOwner = useRef(owner).current,
    attempts = useRef(0),
    accepted = useRef<Receipt | null>(null),
    base = useRef(payload),
    [dirty, setDirty] = useState(false),
    [pending, setPending] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [saved, setSaved] = useState(false),
    [confirmed, setConfirmed] = useState(false),
    [conflict, setConflict] = useState(false),
    [retryAt, setRetryAt] = useState(0),
    [now, setNow] = useState(0),
    [message, setMessage] = useState("");
  const cooldown = Math.max(0, Math.ceil((retryAt - now) / 1000));
  useEffect(() => {
    if (!cooldown) return;
    const timer = window.setTimeout(() => setNow(Date.now()), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);
  const key = JSON.stringify(payload),
    previous = useRef(key);
  useLayoutEffect(() => {
    if (key === previous.current || pending || busy || (dirty && !saved))
      return;
    previous.current = key;
    base.current = JSON.parse(key);
    form.current?.reset();
    setSaved(false);
    setConfirmed(false);
    accepted.current = null;
    attempts.current = 0;
    setConflict(false);
    setDirty(false);
  }, [key, pending, busy, dirty, saved]);
  const retry = useCallback(() => form.current?.requestSubmit(), []);
  usePrivateRecovery(id, !!pending, busy || cooldown > 0, retry);
  useUnsavedSocialWork(
    { dirty, saving: !confirmed && (busy || !!pending), conflict },
    () =>
      setMessage(
        "Finish, retry or discard these local topic entries before leaving."
      ),
    true
  );
  // The controller and immutable request stay mounted; private controls do not.
  if (concealed) return null;
  return (
    <form
      ref={form}
      aria-label={label}
      className="space-y-3"
      aria-busy={busy}
      onChange={() => {
        setDirty(true);
        setSaved(false);
      }}
      onSubmit={async (event) => {
        event.preventDefault();
        const accessAtStart = accessVersion?.();
        if (
          accessAtStart === null ||
          flight.current ||
          busy ||
          (conflict && !pending) ||
          saved ||
          Date.now() < retryAt
        )
          return;
        const body =
          pending ??
          JSON.stringify({
            ...(dirty ? base.current : payload),
            ...fields?.(new FormData(event.currentTarget)),
            mutationId: crypto.randomUUID()
          });
        flight.current = true;
        setBusy(true);
        setPending(body);
        setMessage("");
        try {
          let data = accepted.current;
          if (!data) {
            data = (
              await socialRequest<Receipt>(
                "/api/platform/topics",
                body,
                originalOwner,
                "POST",
                () => {
                  attempts.current++;
                }
              )
            ).data;
          }
          if (!mounted.current) return;
          if (
            !data ||
            typeof data.id !== "string" ||
            !Number.isInteger(data.version) ||
            typeof data.message !== "string"
          )
            throw new SocialClientError(
              503,
              "The result could not be confirmed. Retry the same topic request."
            );
          // Clearing protected work removes its same-address Back entry.
          // Finish that traversal before navigating or refreshing the route.
          accepted.current = data;
          flushSync(() => {
            setDirty(false);
            setConfirmed(true);
            setConflict(false);
            setMessage(data.message);
          });
          await settlePhotoNavigation();
          if (!mounted.current) return;
          const continuationAllowed = () =>
            !accessVersion || accessVersion() === accessAtStart;
          if (!continuationAllowed()) {
            setMessage(
              "Your topic change was saved. Recheck current access, then continue after the saved change."
            );
            return;
          }
          const currentOwner = await currentSocialOwner();
          if (!mounted.current) return;
          if (currentOwner !== originalOwner)
            throw new SocialClientError(
              401,
              "Your topic change was saved. Return to the original account to continue, or reload current information."
            );
          if (!continuationAllowed()) {
            setMessage(
              "Your topic change was saved. Recheck current access, then continue after the saved change."
            );
            return;
          }
          setPending(null);
          setSaved(true);
          if (onDone) onDone(data, JSON.parse(body));
          else router.refresh();
        } catch (error) {
          if (!mounted.current) return;
          if (
            error instanceof SocialClientError &&
            !error.needsAuthenticator &&
            error.status === 400 &&
            error.code === "TOPIC_INPUT_REJECTED" &&
            attempts.current === 1 &&
            !accepted.current
          ) {
            setPending(null);
            setConflict(false);
            attempts.current = 0;
          }
          if (error instanceof SocialClientError) {
            if (
              !accepted.current &&
              !error.needsAuthenticator &&
              [403, 404, 409].includes(error.status)
            )
              setConflict(true);
            if (
              error.status === 429 &&
              Number.isSafeInteger(error.retryAfter) &&
              error.retryAfter! > 0 &&
              error.retryAfter! <= 86400
            ) {
              const time = Date.now();
              setNow(time);
              setRetryAt(time + error.retryAfter! * 1000);
            }
          }
          setMessage(
            error instanceof SocialClientError &&
              error.status === 401 &&
              !accepted.current
              ? "Your sign-in changed. Return to the original account to retry this same topic request, or stop retrying and reload."
              : error instanceof Error
                ? error.message
                : "The response was lost. Retry the same topic request."
          );
        } finally {
          flight.current = false;
          if (mounted.current) setBusy(false);
        }
      }}
    >
      <fieldset
        className="min-w-0 space-y-3"
        disabled={busy || !!pending || saved || conflict}
      >
        {children}
      </fieldset>
      <p role="status">{busy ? "Confirming this topic change…" : message}</p>
      {cooldown > 0 && (
        <p className="text-sm text-gc-muted">
          Retry the original request in {cooldown} seconds. Your entries are
          retained.
        </p>
      )}
      <button
        className="gc-button"
        type="submit"
        disabled={busy || cooldown > 0 || saved || (conflict && !pending)}
      >
        {confirmed && pending
          ? "Continue after saved topic change"
          : pending
            ? "Retry the same topic request"
            : saved
              ? "Saved"
              : label}
      </button>
      {conflict && (
        <p className="text-sm text-gc-muted">
          Your entries are retained. Current permissions or saved values
          changed. Review the current topic before trying another change.
        </p>
      )}
      {(conflict || dirty || pending) && !busy && (
        <button
          type="button"
          className="gc-button gc-button-quiet"
          onClick={async () => {
            if (
              !confirm(
                pending
                  ? "Stop retrying and reload current information? This request may already be saved. Reloading clears only your local entries and does not undo saved changes."
                  : "Discard these local topic entries and reload current information?"
              )
            )
              return;
            flushSync(() => {
              setPending(null);
              setDirty(false);
              setConflict(false);
              form.current?.reset();
            });
            await settlePhotoNavigation();
            window.location.reload();
          }}
        >
          {pending
            ? "Stop retrying and reload current information"
            : "Discard local entries and reload current controls"}
        </button>
      )}
    </form>
  );
}
