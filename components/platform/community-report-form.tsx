"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  currentSocialOwner,
  socialRequest,
  SocialClientError
} from "@/lib/platform/social-client";
import {
  communityReportReasons,
  communityReportTargetLabels,
  type CommunityReportTarget
} from "@/lib/platform/community-report-types";
import { useUnsavedSocialWork } from "./use-unsaved-social-work";

type Target = {
  version: number;
  contextVersion: number;
  source: { label: string; href: string };
};
export function CommunityReportForm({
  owner,
  type,
  id
}: {
  owner: string;
  type: CommunityReportTarget;
  id: string;
}) {
  const [target, setTarget] = useState<Target | null>(null),
    [available, setAvailable] = useState(false);
  const [reason, setReason] = useState(""),
    [details, setDetails] = useState("");
  const [message, setMessage] = useState("Checking reporting access…"),
    [hidden, setHidden] = useState(true);
  const [busy, setBusy] = useState(false),
    [pending, setPending] = useState<string | null>(null),
    [receipt, setReceipt] = useState<string | null>(null);
  const [waitingUntil, setWaitingUntil] = useState(0),
    [remaining, setRemaining] = useState(0);
  const generation = useRef(0),
    inFlight = useRef(false),
    refreshQueued = useRef(false);
  const dirty = !receipt && (!!reason || !!details);
  useUnsavedSocialWork(
    { dirty, saving: !!pending, conflict: false },
    () =>
      setMessage(
        "Send or discard this report before leaving. If its response was lost, retry the same report first."
      ),
    true
  );
  const load = useCallback(async () => {
    if (inFlight.current) {
      refreshQueued.current = true;
      return;
    }
    const seq = ++generation.current;
    setBusy(true);
    setHidden(true);
    try {
      const result = await socialRequest<{
        target: Target;
        available: boolean;
      }>(
        `/api/platform/community-reports?${new URLSearchParams({ view: "target", targetType: type, targetId: id })}`,
        undefined,
        owner
      );
      if (seq !== generation.current) return;
      setTarget(result.data.target);
      setAvailable(result.data.available);
      setHidden(false);
      setMessage(
        result.data.available
          ? "Report target checked. Your entries are unchanged."
          : "Reporting is unavailable for this item right now. No new report has been submitted."
      );
    } catch (error) {
      if (seq !== generation.current) return;
      const current = await currentSocialOwner().catch(() => null);
      if (seq !== generation.current) return;
      setTarget(null);
      setAvailable(false);
      setHidden(current !== owner);
      setMessage(
        error instanceof Error
          ? error.message
          : "Access could not be checked. Your entries are unchanged."
      );
    } finally {
      if (seq === generation.current) setBusy(false);
    }
  }, [owner, type, id]);
  useEffect(() => {
    void load();
    const conceal = () => {
      generation.current++;
      setHidden(true);
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
      refreshQueued.current = false;
      window.removeEventListener("blur", conceal);
      window.removeEventListener("focus", restore);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [load]);
  useEffect(() => {
    if (!waitingUntil) return;
    const tick = () => {
      const seconds = Math.max(
        0,
        Math.ceil((waitingUntil - Date.now()) / 1000)
      );
      setRemaining(seconds);
      if (!seconds) setWaitingUntil(0);
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [waitingUntil]);
  async function send(body: string) {
    if (inFlight.current || hidden || remaining) return;
    inFlight.current = true;
    const seq = generation.current;
    setBusy(true);
    setPending(body);
    setMessage("Sending your private report…");
    try {
      const result = await socialRequest<{ id: string; message: string }>(
        "/api/platform/community-reports",
        body,
        owner
      );
      if (seq !== generation.current) return;
      setPending(null);
      setDetails("");
      setReason("");
      setReceipt(result.data.id);
      setMessage(result.data.message);
    } catch (error) {
      if (seq !== generation.current) return;
      const status = error instanceof SocialClientError ? error.status : 503;
      if ([400, 401, 403, 404, 409, 429].includes(status)) setPending(null);
      if ([403, 404, 409].includes(status)) {
        setTarget(null);
        setAvailable(false);
      }
      if (status === 401) setHidden(true);
      if (error instanceof SocialClientError && error.retryAfter)
        setWaitingUntil(Date.now() + Math.min(86400, error.retryAfter) * 1000);
      setMessage(
        error instanceof Error
          ? error.message
          : "The response was lost. Your entries are kept; retry this exact report."
      );
    } finally {
      inFlight.current = false;
      setBusy(false);
      if (refreshQueued.current) {
        refreshQueued.current = false;
        void load();
      }
    }
  }
  function discard() {
    if (
      pending &&
      !window.confirm(
        "The report may already have been received. Clear this browser's retry and check Your private reports before submitting again?"
      )
    )
      return;
    setPending(null);
    setReason("");
    setDetails("");
    setMessage(
      pending
        ? "Local retry cleared. Check your private reports to confirm whether it was received."
        : "Unsent report details discarded."
    );
  }
  return (
    <div className="space-y-5">
      <h1 className="text-3xl">
        Report this {communityReportTargetLabels[type]}
      </h1>
      <p>
        Reports are private. Your identity is not shown to the reported person
        or the community. Share only the context needed for review.
      </p>
      <p role="status" aria-live="polite">
        {message}
      </p>
      <button
        type="button"
        className="gc-button gc-button-quiet"
        disabled={busy}
        onClick={() => void load()}
      >
        Check reporting access
      </button>
      {hidden && dirty && (
        <button
          type="button"
          className="gc-button gc-button-quiet"
          disabled={busy}
          onClick={discard}
        >
          Discard this form
        </button>
      )}
      {!hidden && target && (
        <p>
          Reporting:{" "}
          <Link
            prefetch={false}
            href={target.source.href}
            className="underline"
          >
            {target.source.label}
          </Link>
        </p>
      )}
      {!hidden && receipt ? (
        <div className="space-y-3">
          <p>A report does not automatically restrict content or accounts.</p>
          <Link
            prefetch={false}
            className="gc-button gc-button-primary"
            href={`/platform/reports?receipt=${encodeURIComponent(receipt)}`}
          >
            View your private receipt
          </Link>
        </div>
      ) : (
        !hidden && (
          <form
            className="space-y-4"
            aria-label="Private report"
            onSubmit={(event) => {
              event.preventDefault();
              if (!target || !available || pending || !reason) return;
              void send(
                JSON.stringify({
                  operation: "create",
                  mutationId: crypto.randomUUID(),
                  targetType: type,
                  targetId: id,
                  expectedTargetVersion: target.version,
                  expectedContextVersion: target.contextVersion,
                  reason,
                  details
                })
              );
            }}
          >
            <label className="block">
              Reason
              <select
                required
                aria-label="Report reason"
                className="mt-1 block w-full rounded border p-3"
                value={reason}
                disabled={busy || !!pending}
                onChange={(e) => setReason(e.target.value)}
              >
                <option value="">Choose a reason</option>
                {Object.entries(communityReportReasons).map(
                  ([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  )
                )}
              </select>
            </label>
            <label className="block">
              Details (optional)
              <textarea
                aria-label="Report details"
                className="mt-1 block min-h-32 w-full rounded border p-3"
                maxLength={2000}
                value={details}
                disabled={busy || !!pending}
                onChange={(e) => setDetails(e.target.value)}
              />
            </label>
            {remaining > 0 && (
              <p>Try again in {remaining} seconds. Your entries are kept.</p>
            )}
            <div className="flex flex-wrap gap-3">
              <button
                className="gc-button gc-button-primary"
                disabled={
                  busy ||
                  !!pending ||
                  !target ||
                  !available ||
                  !reason ||
                  remaining > 0
                }
              >
                Send private report
              </button>
              {pending && (
                <button
                  type="button"
                  className="gc-button gc-button-primary"
                  disabled={busy || remaining > 0}
                  onClick={() => void send(pending)}
                >
                  Retry same report
                </button>
              )}
              <button
                type="button"
                className="gc-button gc-button-quiet"
                disabled={busy}
                onClick={discard}
              >
                {pending ? "Stop retrying" : "Discard report"}
              </button>
            </div>
          </form>
        )
      )}
      <div className="space-y-2 text-sm">
        <p>
          For an ordinary website problem, use{" "}
          <Link prefetch={false} href="/help" className="underline">
            Help
          </Link>
          .
        </p>
        {type === "CHURCH" && (
          <p>
            A disputed representative uses the{" "}
            <Link
              prefetch={false}
              href={`/platform/church-claims/new?churchId=${encodeURIComponent(id)}`}
              className="underline"
            >
              existing church claim review
            </Link>
            .
          </p>
        )}
        <Link prefetch={false} href="/platform/reports" className="underline">
          Your private reports
        </Link>
      </div>
    </div>
  );
}
