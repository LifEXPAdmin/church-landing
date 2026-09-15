"use client";
import {
  useCallback,
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
  onDone
}: {
  owner: string;
  payload: Record<string, unknown>;
  label: string;
  children?: ReactNode;
  fields?: (data: FormData) => Record<string, unknown>;
  onDone?: (receipt: Receipt, request: Record<string, unknown>) => void;
}) {
  const router = useRouter(),
    id = useId(),
    form = useRef<HTMLFormElement>(null),
    flight = useRef(false);
  const base = useRef(payload),
    [dirty, setDirty] = useState(false),
    [pending, setPending] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [saved, setSaved] = useState(false),
    [conflict, setConflict] = useState(false),
    [message, setMessage] = useState("");
  const key = JSON.stringify(payload),
    previous = useRef(key);
  useLayoutEffect(() => {
    if (key === previous.current || pending || busy || (dirty && !saved))
      return;
    previous.current = key;
    base.current = JSON.parse(key);
    form.current?.reset();
    setSaved(false);
    setConflict(false);
    setDirty(false);
  }, [key, pending, busy, dirty, saved]);
  const retry = useCallback(() => form.current?.requestSubmit(), []);
  usePrivateRecovery(id, !!pending, busy, retry);
  useUnsavedSocialWork(
    { dirty, saving: busy || !!pending, conflict },
    () =>
      setMessage(
        "Finish, retry or discard these local topic entries before leaving."
      ),
    true
  );
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
        if (flight.current || busy || conflict || saved) return;
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
          const { data } = await socialRequest<Receipt>(
            "/api/platform/topics",
            body,
            owner
          );
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
          flushSync(() => {
            setPending(null);
            setDirty(false);
            setBusy(false);
            setSaved(true);
            setConflict(false);
            setMessage(data.message);
          });
          await settlePhotoNavigation();
          if (onDone) onDone(data, JSON.parse(body));
          else router.refresh();
        } catch (error) {
          if (
            error instanceof SocialClientError &&
            [400, 403, 404, 409, 429].includes(error.status)
          ) {
            setPending(null);
            if ([403, 404, 409].includes(error.status)) setConflict(true);
          }
          if (error instanceof SocialClientError && error.status === 401) {
            const current = await currentSocialOwner().catch(() => undefined);
            if (current && current !== owner) {
              form.current?.reset();
              setPending(null);
              setDirty(false);
              setConflict(true);
            }
          }
          setMessage(
            error instanceof Error
              ? error.message
              : "The response was lost. Retry the same topic request."
          );
        } finally {
          flight.current = false;
          setBusy(false);
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
      <button
        className="gc-button"
        type="submit"
        disabled={busy || saved || conflict}
      >
        {pending ? "Retry the same topic request" : saved ? "Saved" : label}
      </button>
      {conflict && (
        <p className="text-sm text-gc-muted">
          Your entries are retained. Current permissions or saved values
          changed. Review the current topic before trying another change.
        </p>
      )}
      {(conflict || dirty) && !pending && !busy && (
        <button
          type="button"
          className="gc-button gc-button-quiet"
          onClick={async () => {
            flushSync(() => {
              setDirty(false);
              setConflict(false);
              form.current?.reset();
            });
            await settlePhotoNavigation();
            window.location.reload();
          }}
        >
          Discard local entries and reload current controls
        </button>
      )}
    </form>
  );
}
