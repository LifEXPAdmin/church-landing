"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { ExchangeHandoffView } from "@/lib/platform/exchange-handoffs";
import {
  currentSocialOwner,
  socialRequest,
  SocialClientError
} from "@/lib/platform/social-client";
import { ExchangeHandoffActions } from "./exchange-handoff-controls";
import { RegionalTime } from "./regional-presentation";
import {
  exchangeInquiryStateLabels,
  exchangeHandoffActionLabels,
  exchangeCancellationReasons,
  type ExchangeInquiryState,
  type ExchangeCancellationReason
} from "@/lib/platform/exchange-handoff-options";
import { reportEntryHref } from "@/lib/platform/community-report-types";
import { ReadVisibility, useReadVisibility } from "./read-visibility";

type Snapshot = Pick<ExchangeHandoffView, "ownerId" | "inquiry">;
const checking = "Checking your current handoff access…";

// Retain one action owner through concealment and uncertain saves. Private
// details arrive only in a current participant read, never in server props.
export function ExchangeHandoffDetail({
  owner,
  inquiryId
}: {
  owner: string;
  inquiryId: string;
}) {
  const parentVisible = useReadVisibility();
  const receipt = useRef<{ id: string; version: number } | null>(null);
  const operation = useRef<string | null>(null);
  const [acceptedVersion, setAcceptedVersion] = useState<number>();
  const [cleared, setCleared] = useState(false);
  const didClear = useRef(false);
  const [page, setPage] = useState<Snapshot | null>(null);
  const [visible, setVisible] = useState(false);
  const [currentAccess, setCurrentAccess] = useState(false);
  const [notice, setNotice] = useState(checking);
  const [changedAccount, setChangedAccount] = useState(false);
  const snapshot = useRef<Snapshot | null>(null);
  const generation = useRef(0),
    identityGeneration = useRef(0);
  const active = useRef(false),
    changed = useRef(false),
    reading = useRef(false),
    queued = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const latest = useRef<() => Promise<void>>(async () => {});
  const hide = useCallback(() => {
    active.current = false;
    queued.current = false;
    generation.current++;
    setVisible(false);
    setCurrentAccess(false);
    if (!changed.current) setNotice(checking);
  }, []);
  const clearAccount = useCallback(() => {
    changed.current = true;
    snapshot.current = null;
    receipt.current = null;
    operation.current = null;
    didClear.current = false;
    setCleared(false);
    setAcceptedVersion(undefined);
    identityGeneration.current++;
    hide();
    setPage(null);
    setChangedAccount(true);
    setNotice(
      "Your sign-in changed. Private entries were cleared. Reload for your current account."
    );
  }, [hide]);
  const load = useCallback(async () => {
    if (
      !active.current ||
      changed.current ||
      document.visibilityState === "hidden" ||
      navigator.onLine === false
    )
      return;
    const seq = ++generation.current;
    const identity = ++identityGeneration.current;
    setVisible(false);
    setCurrentAccess(false);
    setNotice(checking);
    if (reading.current) {
      queued.current = true;
      return;
    }
    reading.current = true;
    queued.current = false;
    const request = new AbortController();
    controller.current = request;
    const deadline = setTimeout(() => request.abort(), 15000);
    try {
      const { data } = await socialRequest<Snapshot>(
        `/api/platform/exchange?${new URLSearchParams({ view: "handoff-detail", id: inquiryId })}`,
        undefined,
        owner,
        "POST",
        undefined,
        request.signal
      );
      const inquiry = data.inquiry;
      if (
        data.ownerId !== owner ||
        !inquiry ||
        inquiry.id !== inquiryId ||
        !Number.isInteger(inquiry.version) ||
        inquiry.version < 0 ||
        !Number.isInteger(inquiry.planVersion) ||
        !Array.isArray(inquiry.history) ||
        typeof inquiry.available !== "boolean" ||
        typeof inquiry.purpose !== "string" ||
        typeof inquiry.pickupDetails !== "string" ||
        typeof inquiry.cancelNote !== "string" ||
        !["incoming", "outgoing"].includes(inquiry.side)
      )
        throw Error(
          "Current handoff access could not be confirmed. Try again."
        );
      if (seq !== generation.current || !active.current) return;
      setCurrentAccess(true);
      const prior = snapshot.current;
      const confirmed = receipt.current;
      if (confirmed && inquiry.version < confirmed.version) {
        setNotice(
          "The latest saved handoff is still being checked. Your local choices are retained. Recheck current access."
        );
      } else if (
        prior?.inquiry &&
        JSON.stringify(inquiry) !== JSON.stringify(prior.inquiry) &&
        !(confirmed && inquiry.version >= confirmed.version)
      ) {
        setNotice(
          "This handoff changed. Your local choices are retained and concealed. Confirm any original save, then reload to review current information."
        );
      } else {
        snapshot.current = data;
        setPage(data);
        if (confirmed && inquiry.version >= confirmed.version) {
          setAcceptedVersion(confirmed.version);
          receipt.current = null;
        }
        setVisible(true);
        setNotice("");
      }
    } catch (error) {
      if (seq === generation.current && active.current) {
        setNotice(
          request.signal.aborted
            ? "Your handoff access check timed out. Try again. Your entries are retained."
            : error instanceof Error
              ? error.message
              : "Current handoff access could not be confirmed."
        );
      }
      // Clearing deliberately removes this participant's detail projection.
      // Only a retained original clear may retry after a fresh owner check;
      // every replay still goes through the canonical command authorization.
      if (
        error instanceof SocialClientError &&
        error.status === 404 &&
        operation.current === "clear"
      ) {
        const actual = await currentSocialOwner(request.signal).catch(
          () => undefined
        );
        if (
          identity === identityGeneration.current &&
          actual !== undefined &&
          actual !== owner
        )
          clearAccount();
        else if (
          actual === owner &&
          seq === generation.current &&
          active.current &&
          !changed.current
        ) {
          setCurrentAccess(true);
          setVisible(didClear.current);
          setNotice(
            "This inquiry is no longer in your history. Confirm the original clear to check its result."
          );
        }
      }
      // A blur from the session owner conceals presentation but must not suppress
      // a fresh confirmation that this page belongs to a different account.
      if (error instanceof SocialClientError && error.status === 401) {
        const actual = await currentSocialOwner(request.signal).catch(
          () => undefined
        );
        if (
          identity === identityGeneration.current &&
          !changed.current &&
          actual !== undefined &&
          actual !== owner
        )
          clearAccount();
      }
    } finally {
      clearTimeout(deadline);
      request.abort();
      if (controller.current === request) controller.current = null;
      reading.current = false;
      if (queued.current && active.current && !changed.current) {
        queued.current = false;
        void latest.current();
      }
    }
  }, [owner, inquiryId, clearAccount]);
  latest.current = load;
  const recheck = useCallback(() => {
    if (
      document.visibilityState === "hidden" ||
      navigator.onLine === false ||
      changed.current
    )
      return;
    active.current = true;
    void load();
  }, [load]);
  useEffect(() => {
    const identity = identityGeneration,
      currentRead = controller;
    const refresh = () => {
      if (active.current) void load();
    };
    const visibility = () =>
      document.visibilityState === "hidden" ? hide() : recheck();
    if (document.hasFocus()) recheck();
    else hide();
    const timer = setInterval(refresh, 30000);
    for (const event of ["blur", "pagehide", "offline"])
      window.addEventListener(event, hide);
    for (const event of ["focus", "pageshow"])
      window.addEventListener(event, recheck);
    for (const event of ["online", "social-relationships-changed"])
      window.addEventListener(event, refresh);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      hide();
      identity.current++;
      currentRead.current?.abort();
      clearInterval(timer);
      for (const event of ["blur", "pagehide", "offline"])
        window.removeEventListener(event, hide);
      for (const event of ["focus", "pageshow"])
        window.removeEventListener(event, recheck);
      for (const event of ["online", "social-relationships-changed"])
        window.removeEventListener(event, refresh);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [hide, load, recheck]);
  const onRequest = useCallback((value: string) => {
    operation.current = value;
  }, []);
  const onConfirmed = useCallback((value: { id: string; version: number }) => {
    if (changed.current) return;
    if (operation.current === "clear") {
      didClear.current = true;
      setCleared(true);
      setAcceptedVersion(value.version);
      setVisible(true);
      setNotice("");
    } else {
      receipt.current = value;
      void latest.current();
    }
  }, []);
  const presented = visible && parentVisible;
  const inquiry = page?.inquiry;
  return (
    <section className="space-y-5" aria-label="Private handoff details">
      {!presented && (
        <div className="space-y-3 rounded-xl border p-4">
          <p role="status">{notice || checking}</p>
          {!changedAccount && (
            <button
              type="button"
              className="gc-button gc-button-quiet"
              onClick={recheck}
            >
              Recheck current access
            </button>
          )}
          <button
            type="button"
            className="gc-button gc-button-quiet"
            onClick={() => {
              if (
                changedAccount ||
                confirm(
                  "Reload current handoff information and discard local entries? An unconfirmed save may already be received."
                )
              )
                window.location.reload();
            }}
          >
            Reload current information
          </button>
        </div>
      )}
      <ReadVisibility.Provider value={presented}>
        {presented && !cleared && inquiry ? (
          <article className="space-y-5 [overflow-wrap:anywhere]">
            <h2 className="text-2xl">
              {inquiry.listing?.title ?? "Unavailable listing"}
            </h2>
            <p className="font-semibold">
              {
                exchangeInquiryStateLabels[
                  inquiry.state as ExchangeInquiryState
                ]
              }
            </p>
            {inquiry.person && (
              <p>
                {inquiry.side === "incoming"
                  ? "Inquiry from"
                  : "Receiving adult"}
                : {inquiry.person.name}
              </p>
            )}
            {inquiry.purpose && (
              <section className="space-y-2">
                <h3 className="font-semibold">Inquiry purpose</h3>
                <p className="whitespace-pre-wrap">{inquiry.purpose}</p>
              </section>
            )}
            {!inquiry.available && (
              <p>
                Current access to this source is unavailable. Private details
                are concealed. The original inquiry cannot be revived by
                restoring an account, connection or duty.
              </p>
            )}
            {inquiry.windowStart && inquiry.windowEnd && inquiry.timeZone && (
              <section className="space-y-2" aria-label="Pickup window">
                <h3 className="font-semibold">Pickup window</h3>
                <p>
                  <RegionalTime
                    value={inquiry.windowStart}
                    options={{
                      timeZone: inquiry.timeZone,
                      dateStyle: "medium",
                      timeStyle: "short"
                    }}
                  />{" "}
                  to{" "}
                  <RegionalTime
                    value={inquiry.windowEnd}
                    options={{
                      timeZone: inquiry.timeZone,
                      dateStyle: "medium",
                      timeStyle: "short"
                    }}
                  />{" "}
                  ({inquiry.timeZone})
                </p>
              </section>
            )}
            {inquiry.pickupDetails && (
              <section
                className="space-y-2 rounded-xl border border-gc-divider p-4"
                aria-label="Private pickup instructions"
              >
                <h3 className="font-semibold">Private pickup instructions</h3>
                <p className="whitespace-pre-wrap">{inquiry.pickupDetails}</p>
              </section>
            )}
            {inquiry.available &&
              ["INQUIRED", "SELECTED", "RESERVED"].includes(inquiry.state) && (
                <p>
                  Deadline:{" "}
                  <RegionalTime
                    value={inquiry.expiresAt}
                    options={{
                      timeZone: inquiry.timeZone ?? "UTC",
                      dateStyle: "medium",
                      timeStyle: "short"
                    }}
                  />{" "}
                  ({inquiry.timeZone ?? "UTC"}). An expired hold leaves the
                  listing closed for owner review.
                </p>
              )}
            {inquiry.cancelReason && (
              <p>
                Private cancellation reason:{" "}
                {
                  exchangeCancellationReasons[
                    inquiry.cancelReason as ExchangeCancellationReason
                  ]
                }
              </p>
            )}
            {inquiry.cancelNote && (
              <p className="whitespace-pre-wrap">{inquiry.cancelNote}</p>
            )}
            {inquiry.state === "COMPLETED" && (
              <p>
                Completion was recorded by {inquiry.completionRecordedBy}. This
                records that participant’s statement about the handoff.
              </p>
            )}
            {!!inquiry.history.length && (
              <section
                className="space-y-3"
                aria-label="Handoff status history"
              >
                <h3 className="font-semibold">Recent status changes</h3>
                <ol className="space-y-2 border-l border-gc-divider pl-4">
                  {inquiry.history.map((item) => (
                    <li key={item.version}>
                      <p>
                        {exchangeHandoffActionLabels[item.action] ??
                          "Handoff updated"}
                      </p>
                      <p className="text-sm text-gc-muted">
                        <RegionalTime value={item.at} />
                      </p>
                    </li>
                  ))}
                </ol>
                {inquiry.history.length === 20 && (
                  <p className="text-sm text-gc-muted">
                    Showing the latest 20 status changes.
                  </p>
                )}
              </section>
            )}
            {inquiry.listing && (
              <Link
                prefetch={false}
                className="inline-flex min-h-11 items-center underline"
                href={`/platform/exchange/${inquiry.listing.id}`}
              >
                Open current listing
              </Link>
            )}
            <div className="flex flex-wrap gap-4">
              {inquiry.reportable && (
                <Link
                  prefetch={false}
                  className="inline-flex min-h-11 items-center underline"
                  href={reportEntryHref("EXCHANGE_INQUIRY", inquiry.id)}
                >
                  Report this inquiry
                </Link>
              )}
              {inquiry.pickupReportable && (
                <Link
                  prefetch={false}
                  className="inline-flex min-h-11 items-center underline"
                  href={reportEntryHref("EXCHANGE_HANDOFF", inquiry.id)}
                >
                  Report this agreed pickup plan
                </Link>
              )}
            </div>
          </article>
        ) : null}
        {presented && cleared && (
          <p role="status">This inquiry was cleared from your history.</p>
        )}
        {inquiry && (
          <ExchangeHandoffActions
            owner={owner}
            inquiry={inquiry}
            acceptedVersion={acceptedVersion}
            cleared={cleared}
            onRequest={onRequest}
            privacy={{ currentAccess, onAccessDenied: hide, onConfirmed }}
          />
        )}
      </ReadVisibility.Provider>
    </section>
  );
}
