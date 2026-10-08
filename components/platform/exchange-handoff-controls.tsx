"use client";
import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { ExchangeHandoffView } from "@/lib/platform/exchange-handoffs";
import type { readExchangeDefaults } from "@/lib/platform/exchange-defaults";
import {
  exchangeCancellationReasons,
  EXCHANGE_HANDOFF_SCHEMA,
  type ExchangeCancellationReason
} from "@/lib/platform/exchange-handoff-options";
import { socialRequest } from "@/lib/platform/social-client";
import { useReadVisibility } from "./read-visibility";
import { useExchangeAction } from "./exchange-saved-controls";
import {
  usePrivateChoiceAction,
  type PrivateChoiceAccess
} from "./use-private-choice-action";
import { portalInputClass } from "./portal-action-form";

type Inquiry = NonNullable<ExchangeHandoffView["inquiry"]>;
type Target = NonNullable<ExchangeHandoffView["target"]>;
type Contact = NonNullable<ExchangeHandoffView["contact"]>;

export function ExchangeInquiryForm({
  owner,
  target,
  privacy
}: {
  owner: string;
  target: Target;
  privacy: PrivateChoiceAccess;
}) {
  const [purpose, setPurpose] = useState("");
  const id = useId(),
    reference = useRef<string | null>(null);
  const visible = useReadVisibility();
  const action = usePrivateChoiceAction(
    "/api/platform/exchange",
    owner,
    !!purpose,
    undefined,
    true,
    { ...privacy, expectedReceiptId: () => reference.current }
  );
  // Keep the command owner mounted, but remove private values from the DOM.
  if (!visible) return action.status;
  if (target.activeId)
    return (
      <Link
        prefetch={false}
        className="gc-button"
        href={`/platform/exchange/handoffs/${target.activeId}`}
      >
        Open your existing inquiry
      </Link>
    );
  if (!target.available)
    return <p>New inquiries are unavailable for this listing right now.</p>;
  return (
    <form
      className="space-y-3"
      aria-label="Send a private inquiry"
      onSubmit={(event) => {
        event.preventDefault();
        reference.current ??= crypto.randomUUID();
        void action.command({
          operation: "handoff-inquire",
          id: reference.current,
          expectedVersion: 0,
          listingId: target.listingId,
          listingVersion: target.listingVersion,
          contactVersion: target.contactVersion,
          purpose
        });
      }}
    >
      <p>
        Your inquiry goes privately to {target.receiver.name}, the receiving
        adult for this listing. This does not open a general conversation or
        reserve the listing.
      </p>
      <fieldset disabled={action.blocked} className="min-w-0 space-y-3">
        <label className="block space-y-2" htmlFor={`${id}-purpose`}>
          <span>Brief purpose</span>
          <textarea
            id={`${id}-purpose`}
            className={portalInputClass}
            required
            maxLength={1000}
            rows={4}
            value={purpose}
            onChange={(event) => setPurpose(event.target.value)}
          />
        </label>
        <p className="text-sm text-gc-muted">
          Use up to 1,000 characters. Leave out private addresses, financial
          credentials and details about children. Unselected inquiries expire
          after 14 days.
        </p>
        <button className="gc-button" type="submit">
          Send private inquiry
        </button>
        {purpose && (
          <button
            className="gc-button gc-button-quiet"
            type="button"
            onClick={() => setPurpose("")}
          >
            Discard unsent inquiry
          </button>
        )}
      </fieldset>
      {action.status}
    </form>
  );
}

export function ExchangeContactChoice({
  owner,
  contact,
  intake,
  onSaved
}: {
  owner: string;
  contact: Contact;
  intake: boolean;
  onSaved?: () => void;
}) {
  const [confirmed, setConfirmed] = useState(false);
  const saved = useCallback(() => {
    setConfirmed(false);
    onSaved?.();
  }, [onSaved]);
  const action = useExchangeAction(owner, confirmed, saved, true);
  return (
    <section
      className="space-y-3 rounded-xl border border-gc-divider p-4"
      aria-label="Listing inquiry consent"
    >
      <h2 className="text-2xl">Receive private inquiries</h2>
      <p>
        {contact.enabled
          ? contact.receiving
            ? "You are this listing’s named receiving adult."
            : "Another authorized adult receives this listing’s inquiries. Their private history is not shared with you."
          : "Private inquiries are off for this listing."}
      </p>
      <p>
        Enable this separately for each published listing. Your{" "}
        <Link
          prefetch={false}
          className="underline"
          href="/platform/settings/privacy/messages?context=exchange"
        >
          contact request choices
        </Link>{" "}
        still govern new inquiries. Changing the receiver ends active handoffs;
        previous private history never transfers.
      </p>
      {!intake && (
        <p>
          An authorized platform report reviewer must be available before
          inquiries can open.
        </p>
      )}
      <fieldset disabled={action.blocked} className="min-w-0 space-y-3">
        {contact.canEnable &&
          intake &&
          (!contact.receiving || !contact.enabled) && (
            <label className="flex min-h-11 items-start gap-3">
              <input
                className="mt-1"
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
              />
              I volunteer as the receiving adult and understand that replacing
              the receiver ends existing handoffs.
            </label>
          )}
        {contact.canEnable && intake && (
          <button
            type="button"
            className="gc-button"
            disabled={(contact.enabled && contact.receiving) || !confirmed}
            onClick={() =>
              void action.command({
                operation: "handoff-contact",
                listingId: contact.listingId,
                listingVersion: contact.listingVersion,
                expectedVersion: contact.version,
                enabled: true
              })
            }
          >
            Enable inquiries with me as receiver
          </button>
        )}
        {contact.enabled && (
          <button
            type="button"
            className="gc-button gc-button-quiet"
            onClick={() => {
              if (
                confirm(
                  "Turn off new inquiries and end active handoffs? Held listings will stay closed for owner review."
                )
              )
                void action.command({
                  operation: "handoff-contact",
                  listingId: contact.listingId,
                  listingVersion: contact.listingVersion,
                  expectedVersion: contact.version,
                  enabled: false
                });
            }}
          >
            Turn off inquiries and end handoffs
          </button>
        )}
        {confirmed && (
          <button
            type="button"
            className="gc-button gc-button-quiet"
            onClick={() => setConfirmed(false)}
          >
            Discard this consent choice
          </button>
        )}
      </fieldset>
      <Link
        prefetch={false}
        className="inline-flex min-h-11 items-center underline"
        href={`/platform/exchange/handoffs?view=incoming&listingId=${contact.listingId}`}
      >
        Open your inquiries for this listing
      </Link>
      {action.status}
    </section>
  );
}

function localValue(instant: string | null, zone: string | null) {
  if (!instant || !zone) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(new Date(instant));
  const value = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return `${value.year}-${value.month}-${value.day}T${value.hour}:${value.minute}`;
}

export function ExchangeHandoffActions({
  owner,
  inquiry,
  privacy,
  acceptedVersion,
  onRequest,
  cleared = false
}: {
  owner: string;
  inquiry: Inquiry;
  privacy: PrivateChoiceAccess;
  acceptedVersion?: number;
  onRequest?: (operation: string) => void;
  cleared?: boolean;
}) {
  const id = useId(),
    visible = useReadVisibility();
  const initial = {
    startLocal: localValue(inquiry.windowStart, inquiry.timeZone),
    endLocal: localValue(inquiry.windowEnd, inquiry.timeZone),
    timeZone: inquiry.timeZone ?? "UTC",
    pickupDetails: inquiry.pickupDetails
  };
  const [plan, setPlan] = useState(initial),
    [agree, setAgree] = useState<number | null>(null),
    [reason, setReason] = useState<ExchangeCancellationReason>("CHANGED_PLANS"),
    [note, setNote] = useState("");
  const [defaultsNotice, setDefaultsNotice] = useState(""),
    [loadingDefaults, setLoadingDefaults] = useState(false);
  const [baseline, setBaseline] = useState(initial);
  const planDirty = JSON.stringify(plan) !== JSON.stringify(baseline);
  const dirty =
    planDirty || agree !== null || !!note || reason !== "CHANGED_PLANS";
  const submitted = useRef<{
    target: Readonly<{ id: string; version: number }>;
    operation: string;
    plan: typeof plan;
    agree: number | null;
    reason: ExchangeCancellationReason;
    note: string;
  } | null>(null);
  const dispatching = useRef(false);
  const confirmed = useRef<number | null>(null);
  const latest = useRef({
    plan,
    agree,
    reason,
    note,
    visible,
    currentAccess: privacy.currentAccess
  });
  latest.current = {
    plan,
    agree,
    reason,
    note,
    visible,
    currentAccess: privacy.currentAccess
  };
  const copyGeneration = useRef(0),
    copyController = useRef<AbortController | null>(null);
  const invalidateCopy = useCallback(() => {
    copyGeneration.current++;
    copyController.current?.abort();
    copyController.current = null;
    setLoadingDefaults(false);
  }, []);
  useEffect(() => {
    invalidateCopy();
    return invalidateCopy;
  }, [visible, privacy.currentAccess, inquiry, invalidateCopy]);
  const action = usePrivateChoiceAction(
    "/api/platform/exchange",
    owner,
    dirty,
    undefined,
    true,
    {
      ...privacy,
      preserveDirty: true,
      expectedReceiptId: () => submitted.current?.target.id ?? null,
      expectedReceiptVersion: () => submitted.current?.target.version ?? null,
      onConfirmed(receipt) {
        const sent = submitted.current;
        if (!sent) return;
        invalidateCopy();
        if (["select", "plan"].includes(sent.operation)) setBaseline(sent.plan);
        if (sent.operation === "confirm" && latest.current.agree === sent.agree)
          setAgree(null);
        if (sent.operation === "cancel") {
          if (latest.current.reason === sent.reason) setReason("CHANGED_PLANS");
          if (latest.current.note === sent.note) setNote("");
        }
        confirmed.current = receipt.version;
        privacy.onConfirmed(receipt);
      }
    }
  );
  const rearm = action.rearm;
  useEffect(() => {
    if (
      confirmed.current !== null &&
      acceptedVersion === confirmed.current &&
      rearm(confirmed.current)
    ) {
      confirmed.current = null;
      submitted.current = null;
    }
  }, [acceptedVersion, rearm]);
  const adopted = useRef(inquiry);
  // Only clean fields follow a newly authorized snapshot. Dirty siblings retain
  // their own baseline and agreement always stays bound to its original plan.
  useEffect(() => {
    if (adopted.current === inquiry) return;
    adopted.current = inquiry;
    const fresh = {
      startLocal: localValue(inquiry.windowStart, inquiry.timeZone),
      endLocal: localValue(inquiry.windowEnd, inquiry.timeZone),
      timeZone: inquiry.timeZone ?? "UTC",
      pickupDetails: inquiry.pickupDetails
    };
    if (!planDirty && JSON.stringify(baseline) !== JSON.stringify(fresh)) {
      setPlan(fresh);
      setBaseline(fresh);
    }
  }, [inquiry, planDirty, baseline]);
  const canPlan =
    !cleared &&
    inquiry.available &&
    inquiry.side === "incoming" &&
    ["INQUIRED", "SELECTED"].includes(inquiry.state);
  const held =
    !cleared &&
    inquiry.available &&
    ["SELECTED", "RESERVED"].includes(inquiry.state);
  const command = (operation: string, extra: Record<string, unknown> = {}) => {
    if (action.blocked || dispatching.current) return;
    invalidateCopy();
    submitted.current = {
      target: Object.freeze({ id: inquiry.id, version: inquiry.version + 1 }),
      operation,
      plan,
      agree,
      reason,
      note
    };
    dispatching.current = true;
    onRequest?.(operation);
    return action
      .command({
        operation: `handoff-${operation}`,
        id: inquiry.id,
        expectedVersion: inquiry.version,
        ...extra
      })
      .finally(() => {
        dispatching.current = false;
      });
  };
  const discard = () => {
    invalidateCopy();
    setPlan(initial);
    setBaseline(initial);
    setAgree(null);
    setReason("CHANGED_PLANS");
    setNote("");
    setDefaultsNotice("");
  };
  const copyDefaults = async () => {
    if (!visible || action.blocked) return;
    invalidateCopy();
    const seq = copyGeneration.current,
      request = new AbortController();
    copyController.current = request;
    const deadline = setTimeout(() => request.abort(), 15000);
    const pickupAtStart = plan.pickupDetails;
    setLoadingDefaults(true);
    try {
      const { data } = await socialRequest<
        Awaited<ReturnType<typeof readExchangeDefaults>>
      >(
        "/api/platform/exchange?view=defaults",
        undefined,
        owner,
        "POST",
        undefined,
        request.signal
      );
      if (
        request.signal.aborted ||
        seq !== copyGeneration.current ||
        !latest.current.visible ||
        !latest.current.currentAccess ||
        latest.current.plan.pickupDetails !== pickupAtStart
      )
        return;
      if (
        data.ownerId !== owner ||
        typeof data.fields?.pickupDetails !== "string" ||
        typeof data.recoveryRequired !== "boolean"
      )
        throw Error("Your private defaults could not be confirmed.");
      if (data.recoveryRequired)
        setDefaultsNotice("Review your recovered defaults before using them.");
      else {
        setPlan((previous) => ({
          ...previous,
          pickupDetails: data.fields.pickupDetails
        }));
        setDefaultsNotice(
          "Copied your private default. Review it for this handoff before proposing the plan."
        );
      }
    } catch (error) {
      if (seq === copyGeneration.current && latest.current.visible)
        setDefaultsNotice(
          request.signal.aborted
            ? "Your private defaults check timed out. Try again."
            : error instanceof Error
              ? error.message
              : "Your private defaults could not be checked."
        );
    } finally {
      clearTimeout(deadline);
      request.abort();
      if (copyController.current === request) copyController.current = null;
      if (seq === copyGeneration.current) setLoadingDefaults(false);
    }
  };
  if (!visible) return action.status;
  return (
    <div className="space-y-5">
      {canPlan && (
        <form
          className="space-y-3 rounded-xl border border-gc-divider p-4"
          aria-label="Propose pickup window"
          onSubmit={(event) => {
            event.preventDefault();
            void command(inquiry.state === "INQUIRED" ? "select" : "plan", {
              schema: EXCHANGE_HANDOFF_SCHEMA,
              plan
            });
          }}
        >
          <h2 className="text-2xl">
            {inquiry.state === "INQUIRED"
              ? "Select this inquirer"
              : "Replace the unconfirmed plan"}
          </h2>
          <p>
            Selecting creates the listing’s only hold. The inquirer must agree
            within 48 hours and before the window ends. Instructions stay hidden
            from them until they confirm this exact plan.
          </p>
          <fieldset
            disabled={action.blocked || loadingDefaults}
            className="min-w-0 space-y-3"
          >
            {(["startLocal", "endLocal"] as const).map((field, index) => (
              <label
                key={field}
                className="block space-y-2"
                htmlFor={`${id}-${field}`}
              >
                <span>{index ? "Window ends" : "Window begins"}</span>
                <input
                  id={`${id}-${field}`}
                  type="datetime-local"
                  required
                  className={portalInputClass}
                  value={plan[field]}
                  onChange={(e) => {
                    invalidateCopy();
                    setPlan({ ...plan, [field]: e.target.value });
                  }}
                />
              </label>
            ))}
            <label className="block space-y-2" htmlFor={`${id}-zone`}>
              <span>Time zone</span>
              <input
                id={`${id}-zone`}
                required
                maxLength={100}
                className={portalInputClass}
                value={plan.timeZone}
                onChange={(e) => {
                  invalidateCopy();
                  setPlan({ ...plan, timeZone: e.target.value });
                }}
              />
            </label>
            <p className="text-sm text-gc-muted">
              Use a named time zone such as America/Chicago or UTC. Choose a
              future window within 30 days, lasting at most 24 hours. Ambiguous
              daylight-saving times need a different time.
            </p>
            <label className="block space-y-2" htmlFor={`${id}-pickup`}>
              <span>Private pickup instructions (optional)</span>
              <textarea
                id={`${id}-pickup`}
                rows={4}
                maxLength={2000}
                className={portalInputClass}
                value={plan.pickupDetails}
                onChange={(e) => {
                  invalidateCopy();
                  setPlan({ ...plan, pickupDetails: e.target.value });
                }}
              />
            </label>
            <button
              type="button"
              className="gc-button gc-button-quiet"
              onClick={() => void copyDefaults()}
            >
              Copy my private pickup default
            </button>
            {defaultsNotice && <p role="status">{defaultsNotice}</p>}
            <button type="submit" className="gc-button">
              {inquiry.state === "INQUIRED"
                ? "Select and propose this plan"
                : "Replace proposed plan"}
            </button>
          </fieldset>
        </form>
      )}
      {!cleared &&
        inquiry.available &&
        inquiry.state === "SELECTED" &&
        inquiry.side === "outgoing" && (
          <section className="space-y-3" aria-label="Confirm pickup agreement">
            <p>
              Review the window above. Precise instructions appear only after
              agreement. Cancel before changing an agreed window. If neither
              person closes the handoff, it expires 48 hours after the window
              ends and the listing stays closed for owner review.
            </p>
            <label className="flex min-h-11 items-start gap-3">
              <input
                type="checkbox"
                className="mt-1"
                checked={agree === inquiry.planVersion}
                disabled={action.blocked}
                onChange={(e) =>
                  setAgree(e.target.checked ? inquiry.planVersion : null)
                }
              />
              I agree to this exact pickup window and understand its expiry.
            </label>
            <button
              type="button"
              className="gc-button"
              disabled={action.blocked || agree !== inquiry.planVersion}
              onClick={() =>
                void command("confirm", { planVersion: inquiry.planVersion })
              }
            >
              Agree to pickup plan
            </button>
          </section>
        )}
      {!cleared && inquiry.available && inquiry.state === "INQUIRED" && (
        <button
          type="button"
          className="gc-button gc-button-quiet"
          disabled={action.blocked}
          onClick={() =>
            void command(inquiry.side === "incoming" ? "decline" : "withdraw")
          }
        >
          {inquiry.side === "incoming" ? "Decline inquiry" : "Withdraw inquiry"}
        </button>
      )}
      {held && (
        <section className="space-y-3" aria-label="Close or cancel handoff">
          {inquiry.state === "RESERVED" && (
            <button
              type="button"
              className="gc-button"
              disabled={action.blocked}
              onClick={() => {
                if (
                  confirm(
                    "Record that this handoff is complete and close the listing?"
                  )
                )
                  void command("complete");
              }}
            >
              Mark handoff complete
            </button>
          )}
          <p>
            Either participant can cancel. The listing stays closed until its
            owner reopens it. A missed handoff is a private reason, not a public
            accusation or misconduct decision.
          </p>
          <fieldset disabled={action.blocked} className="min-w-0 space-y-3">
            <label className="block space-y-2" htmlFor={`${id}-reason`}>
              <span>Cancellation reason</span>
              <select
                id={`${id}-reason`}
                className={portalInputClass}
                value={reason}
                onChange={(e) =>
                  setReason(e.target.value as ExchangeCancellationReason)
                }
              >
                {Object.entries(exchangeCancellationReasons)
                  .filter(
                    ([value]) => value !== "NO_SHOW" || inquiry.noShowAvailable
                  )
                  .map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
              </select>
            </label>
            <label className="block space-y-2" htmlFor={`${id}-note`}>
              <span>Private explanation (optional)</span>
              <textarea
                id={`${id}-note`}
                maxLength={500}
                rows={3}
                className={portalInputClass}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </label>
            <button
              type="button"
              className="gc-button gc-button-quiet"
              onClick={() => {
                if (
                  confirm(
                    "Cancel this handoff and leave the listing closed for owner review?"
                  )
                )
                  void command("cancel", { reason, note });
              }}
            >
              Cancel handoff
            </button>
          </fieldset>
        </section>
      )}
      {!cleared && inquiry.canClear && (
        <button
          type="button"
          className="gc-button gc-button-quiet"
          disabled={action.blocked}
          onClick={() => {
            if (
              confirm(
                "Clear this inquiry from your history? The other participant's receipt and selected report evidence are unchanged."
              )
            )
              void command("clear");
          }}
        >
          Clear from my history
        </button>
      )}
      {dirty && (!canPlan || !held || cleared) && (
        <details className="space-y-3 rounded-xl border p-4">
          <summary className="min-h-11 cursor-pointer">
            Review retained unsent choices
          </summary>
          <p>
            These local choices have not been submitted. Discard them
            deliberately when they are no longer needed.
          </p>
          {planDirty && !canPlan && (
            <div>
              <p>
                {plan.startLocal} to {plan.endLocal} ({plan.timeZone})
              </p>
              <p className="whitespace-pre-wrap">{plan.pickupDetails}</p>
            </div>
          )}
          {!held && (note || reason !== "CHANGED_PLANS") && (
            <div>
              <p>{exchangeCancellationReasons[reason]}</p>
              <p className="whitespace-pre-wrap">{note}</p>
            </div>
          )}
          {agree !== null && (
            <p>
              Your unsent agreement was for pickup plan {agree}. It does not
              apply to a replacement plan.
            </p>
          )}
        </details>
      )}
      {dirty && (
        <button
          type="button"
          className="gc-button gc-button-quiet"
          disabled={action.blocked}
          onClick={discard}
        >
          Discard unsaved handoff choices
        </button>
      )}
      {action.status}
    </div>
  );
}
