"use client";
import Link from "next/link";
import { useCallback, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
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
import { portalInputClass } from "./portal-action-form";

type Inquiry = NonNullable<ExchangeHandoffView["inquiry"]>;
type Target = NonNullable<ExchangeHandoffView["target"]>;
type Contact = NonNullable<ExchangeHandoffView["contact"]>;

export function ExchangeInquiryForm({
  owner,
  target
}: {
  owner: string;
  target: Target;
}) {
  const [purpose, setPurpose] = useState(""),
    id = useId(),
    reference = useRef<string | null>(null),
    router = useRouter();
  const saved = useCallback(
    (receipt: { id: string }) => {
      setPurpose("");
      router.push(`/platform/exchange/handoffs/${receipt.id}`);
    },
    [router]
  );
  const action = useExchangeAction(owner, !!purpose, saved);
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
  intake
}: {
  owner: string;
  contact: Contact;
  intake: boolean;
}) {
  const [confirmed, setConfirmed] = useState(false);
  const saved = useCallback(() => setConfirmed(false), []);
  const action = useExchangeAction(owner, confirmed, saved);
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
  inquiry
}: {
  owner: string;
  inquiry: Inquiry;
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
    [agree, setAgree] = useState(false),
    [reason, setReason] = useState<ExchangeCancellationReason>("CHANGED_PLANS"),
    [note, setNote] = useState("");
  const [defaultsNotice, setDefaultsNotice] = useState(""),
    [loadingDefaults, setLoadingDefaults] = useState(false);
  const dirty =
    JSON.stringify(plan) !== JSON.stringify(initial) ||
    agree ||
    !!note ||
    reason !== "CHANGED_PLANS";
  const action = useExchangeAction(owner, dirty);
  const canPlan =
    inquiry.available &&
    inquiry.side === "incoming" &&
    ["INQUIRED", "SELECTED"].includes(inquiry.state);
  const held =
    inquiry.available && ["SELECTED", "RESERVED"].includes(inquiry.state);
  const command = (operation: string, extra: Record<string, unknown> = {}) =>
    action.command({
      operation: `handoff-${operation}`,
      id: inquiry.id,
      expectedVersion: inquiry.version,
      ...extra
    });
  const discard = () => {
    setPlan(initial);
    setAgree(false);
    setReason("CHANGED_PLANS");
    setNote("");
    setDefaultsNotice("");
  };
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
                  onChange={(e) =>
                    setPlan({ ...plan, [field]: e.target.value })
                  }
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
                onChange={(e) => setPlan({ ...plan, timeZone: e.target.value })}
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
                onChange={(e) =>
                  setPlan({ ...plan, pickupDetails: e.target.value })
                }
              />
            </label>
            <button
              type="button"
              className="gc-button gc-button-quiet"
              onClick={async () => {
                if (!visible) return;
                setLoadingDefaults(true);
                try {
                  const { data } = await socialRequest<
                    Awaited<ReturnType<typeof readExchangeDefaults>>
                  >("/api/platform/exchange?view=defaults", undefined, owner);
                  if (!data.recoveryRequired) {
                    setPlan((previous) => ({
                      ...previous,
                      pickupDetails: data.fields.pickupDetails
                    }));
                    setDefaultsNotice(
                      "Copied your private default. Review it for this handoff before proposing the plan."
                    );
                  } else
                    setDefaultsNotice(
                      "Review your recovered defaults before using them."
                    );
                } catch (error) {
                  setDefaultsNotice(
                    error instanceof Error
                      ? error.message
                      : "Your private defaults could not be checked."
                  );
                } finally {
                  setLoadingDefaults(false);
                }
              }}
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
      {inquiry.available &&
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
                checked={agree}
                disabled={action.blocked}
                onChange={(e) => setAgree(e.target.checked)}
              />
              I agree to this exact pickup window and understand its expiry.
            </label>
            <button
              type="button"
              className="gc-button"
              disabled={action.blocked || !agree}
              onClick={() =>
                void command("confirm", { planVersion: inquiry.planVersion })
              }
            >
              Agree to pickup plan
            </button>
          </section>
        )}
      {inquiry.available && inquiry.state === "INQUIRED" && (
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
                {Object.entries(exchangeCancellationReasons).map(
                  ([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  )
                )}
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
      {inquiry.canClear && (
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
