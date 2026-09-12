"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  currentSocialOwner,
  socialRequest,
  SocialClientError
} from "@/lib/platform/social-client";
import { accountEntryHref } from "@/lib/platform/account-entry";
import { useDraftWorkspace } from "./draft-workspace-provider";
import { useUnsavedSocialWork } from "./use-unsaved-social-work";
export type RelationshipStatus = {
  version: number;
  following: boolean;
  friends?: boolean;
  favorite: boolean;
  muted: boolean;
  snoozedUntil: string | null;
  blocked: boolean;
};
export function RelationshipControls({
  kind,
  targetId,
  name
}: {
  kind: "person" | "church";
  targetId: string;
  name: string;
}) {
  const [open, setOpen] = useState(false),
    [owner, setOwner] = useState<string | null | undefined>(),
    [data, setData] = useState<RelationshipStatus | null>(null),
    [hidden, setHidden] = useState(true),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const [pending, setPending] = useState<string | null>(null),
    [conflict, setConflict] = useState(false);
  const generation = useRef(0),
    inFlight = useRef(false);
  const { controller } = useDraftWorkspace();
  const router = useRouter();
  const ownerRef = useRef<string | null | undefined>(undefined);
  useUnsavedSocialWork(
    { dirty: false, saving: !!pending, conflict: false },
    () => setMessage("Resolve the pending relationship change before leaving.")
  );
  const load = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setHidden(true);
    const seq = ++generation.current;
    try {
      const actor = await currentSocialOwner();
      if (seq !== generation.current) return;
      if (ownerRef.current !== undefined && ownerRef.current !== actor) {
        setPending(null);
        setConflict(false);
        router.refresh();
      }
      ownerRef.current = actor;
      setOwner(actor);
      if (!actor || actor === targetId) {
        setData(null);
        setHidden(false);
        return;
      }
      const r = await socialRequest<RelationshipStatus>(
        `/api/platform/relationships?${new URLSearchParams({ view: "status", kind, targetId })}`,
        undefined,
        actor
      );
      if (seq !== generation.current) return;
      setData(r.data);
      setHidden(false);
      setConflict(false);
      setMessage("");
    } catch (e) {
      if (seq === generation.current) {
        setData(null);
        setMessage(
          e instanceof Error
            ? e.message
            : "Relationship choices could not be checked."
        );
      }
    } finally {
      if (seq === generation.current) {
        inFlight.current = false;
        setBusy(false);
      }
    }
  }, [kind, targetId, router]);
  useEffect(() => {
    if (!open) return;
    void load();
    const conceal = () => {
      generation.current++;
      setHidden(true);
      inFlight.current = false;
      setBusy(false);
    };
    const restore = () => {
      if (document.visibilityState !== "hidden") void load();
    };
    const visibility = () =>
      document.visibilityState === "hidden" ? conceal() : restore();
    window.addEventListener("blur", conceal);
    window.addEventListener("focus", restore);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      conceal();
      window.removeEventListener("blur", conceal);
      window.removeEventListener("focus", restore);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [open, load]);
  function safeToChange() {
    const s = controller.getSnapshot();
    if (
      s.dirty ||
      s.saving ||
      s.publishing ||
      s.retry ||
      s.conflict ||
      s.externalWork.saving ||
      s.externalWork.dirty ||
      s.externalWork.conflict
    ) {
      setMessage(
        "Save or resolve your current draft before changing relationships."
      );
      return false;
    }
    return true;
  }
  async function send(body: string) {
    if (inFlight.current || hidden || !owner) return;
    inFlight.current = true;
    setBusy(true);
    setPending(body);
    setMessage("Saving relationship choice…");
    try {
      await socialRequest("/api/platform/relationships", body, owner);
      setPending(null);
      setData(null);
      setHidden(true);
      setOpen(false);
      window.dispatchEvent(new Event("social-relationships-changed"));
      // Next refresh replaces its route/prefetch cache while retaining unrelated client drafts.
      router.refresh();
    } catch (e) {
      const status = e instanceof SocialClientError ? e.status : 503;
      if ([400, 401, 403, 404, 409, 429].includes(status)) setPending(null);
      if ([401, 403, 404, 409].includes(status)) setConflict(true);
      setMessage(
        e instanceof Error
          ? e.message
          : "The response was lost. Retry the same intended change."
      );
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  function change(operation: string, desired?: boolean, days?: number) {
    if (!data || pending || !safeToChange()) return;
    if (
      operation === "block" &&
      desired &&
      !window.confirm(
        "Block this personal account? Direct social interactions and follows between you will stop. Public material may still be viewed while signed out. Church-authored posts and your church duties are separate. Unblocking will not restore follows or favorites."
      )
    )
      return;
    if (
      operation === "block" &&
      desired === false &&
      !window.confirm(
        "Unblock this personal account? Your block will be removed, but following, favorites, friendship and conversation subscriptions will not be restored. Other access restrictions still apply."
      )
    )
      return;
    void send(
      JSON.stringify({
        operation,
        kind,
        targetId,
        expectedVersion: data.version,
        mutationId: crypto.randomUUID(),
        ...(desired === undefined ? {} : { desired }),
        ...(days ? { days } : {})
      })
    );
  }
  const snoozed =
    data?.snoozedUntil && Date.parse(data.snoozedUntil) > Date.now();
  return (
    <details
      open={open}
      className="relative rounded-lg border border-gc-divider p-2"
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary className="min-h-11 cursor-pointer py-2 font-semibold">
        Connections with {name}
      </summary>
      {open && (
        <div
          role="group"
          className="space-y-3"
          aria-label={`Relationship choices for ${name}`}
        >
          <p role="status">
            {busy ? "Checking relationship choices…" : message}
          </p>
          {!hidden && owner === null && (
            <Link
              className="gc-button gc-button-quiet"
              href={accountEntryHref(
                "join",
                location.pathname + location.search,
                "follow"
              )}
            >
              Sign in for relationship choices
            </Link>
          )}
          {!hidden && owner === targetId && <p>This is your own profile.</p>}
          {!hidden && data && (
            <>
              <p className="text-sm text-gc-muted">
                {kind === "church"
                  ? "Following a church does not grant membership or access to private church content."
                  : "Favorites and these controls are private to your account."}
              </p>
              {snoozed && (
                <p>
                  Snoozed until{" "}
                  <time dateTime={data.snoozedUntil!}>
                    {new Date(data.snoozedUntil!).toLocaleString()}
                  </time>
                </p>
              )}
              {!snoozed && data.snoozedUntil && <p>Your snooze has ended.</p>}
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="gc-button gc-button-quiet"
                  disabled={busy || !!pending || conflict || data.blocked}
                  aria-label={
                    data.friends ? "Friends — remove friendship" : undefined
                  }
                  onClick={() => change("follow", !data.following)}
                >
                  {data.friends
                    ? "Remove friendship"
                    : data.following
                      ? "Unfollow"
                      : "Follow"}
                </button>
                <button
                  type="button"
                  className="gc-button gc-button-quiet"
                  disabled={
                    busy ||
                    !!pending ||
                    conflict ||
                    !data.following ||
                    data.blocked
                  }
                  onClick={() => change("favorite", !data.favorite)}
                >
                  {data.favorite ? "Remove favorite" : "Add private favorite"}
                </button>
                <button
                  type="button"
                  className="gc-button gc-button-quiet"
                  disabled={busy || !!pending || conflict}
                  onClick={() => change("mute", !data.muted && !snoozed)}
                >
                  {data.muted || snoozed ? "Restore in feed" : "Mute in feed"}
                </button>
                {[1, 7, 30].map((days) => (
                  <button
                    key={days}
                    type="button"
                    className="gc-button gc-button-quiet"
                    disabled={busy || !!pending || conflict}
                    onClick={() => change("snooze", undefined, days)}
                  >
                    Snooze {days} {days === 1 ? "day" : "days"}
                  </button>
                ))}
                {kind === "person" && (
                  <button
                    type="button"
                    className="gc-button gc-button-quiet"
                    disabled={busy || !!pending || conflict}
                    onClick={() => change("block", !data.blocked)}
                  >
                    {data.blocked ? "Unblock" : "Block personal account"}
                  </button>
                )}
              </div>
            </>
          )}
          {pending && !hidden && (
            <button
              type="button"
              className="gc-button gc-button-quiet"
              disabled={busy}
              onClick={() => void send(pending)}
            >
              Retry same relationship change
            </button>
          )}
          {!pending && (
            <button
              type="button"
              className="gc-button gc-button-quiet"
              disabled={busy}
              onClick={() => void load()}
            >
              Refresh relationship choices
            </button>
          )}
        </div>
      )}
    </details>
  );
}
