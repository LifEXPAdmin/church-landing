"use client";
import Link from "next/link";
import { useCallback, useId, useRef, useState } from "react";
import type {
  NeedDetailView,
  NeedSlotView,
  NeedView
} from "@/lib/platform/exchange-need-reads";
import {
  NEED_SCHEMA,
  needActionLabels,
  type NeedAction
} from "@/lib/platform/exchange-need-options";
import { exchangeCurrencies } from "@/lib/platform/exchange-options";
import { useExchangeAction } from "./exchange-saved-controls";
import { portalInputClass } from "./portal-action-form";

export type NeedRoleChoice = {
  id: string;
  role: string;
  capacity: number;
  eventTitle: string;
  startAt: string;
  postId: string;
};
export function NeedSetupForm({
  owner,
  detail
}: {
  owner: string;
  detail: NeedDetailView;
}) {
  const id = useId();
  const initial = {
    deadline: detail.need?.deadlineLocal ?? "",
    zone: detail.need?.timeZone ?? "UTC",
    accepted: detail.canCoordinate
  };
  const [fields, setFields] = useState(initial);
  const action = useExchangeAction(
    owner,
    JSON.stringify(fields) !== JSON.stringify(initial),
    undefined,
    true
  );
  const ended = detail.need?.closed || detail.need?.canceled;
  if (ended)
    return (
      <p>
        Repeat this need from the listing editor to prepare a new private draft
        with fresh dates and consent.
      </p>
    );
  return (
    <form
      className="space-y-3 rounded-xl border border-gc-divider p-4"
      aria-label="Need deadline and coordinator"
      onSubmit={(e) => {
        e.preventDefault();
        void action.command({
          operation: "need-configure",
          listingId: detail.listingId,
          listingVersion: detail.listingVersion,
          expectedVersion: detail.need?.version ?? 0,
          deadlineLocal: fields.deadline,
          timeZone: fields.zone,
          acceptCoordinator: fields.accepted
        });
      }}
    >
      <h2 className="text-2xl">Deadline and private coordinator</h2>
      {!detail.need && (
        <p>
          Setting up action slots returns this listing to a private draft. Add
          the needed help, then review and publish from its listing editor.
        </p>
      )}
      <p>
        The responsible adult receives private contribution notes and quotes.
        Changing the coordinator ends previous promises and private access.
        Existing receipts and loan obligations are preserved.
      </p>
      <fieldset disabled={action.blocked} className="min-w-0 space-y-3">
        <label className="block space-y-2" htmlFor={`${id}-deadline`}>
          <span>Exact need deadline</span>
          <input
            className={portalInputClass}
            id={`${id}-deadline`}
            type="datetime-local"
            required
            value={fields.deadline}
            onChange={(e) => setFields({ ...fields, deadline: e.target.value })}
          />
        </label>
        <label className="block space-y-2" htmlFor={`${id}-zone`}>
          <span>Time zone, for example America/Chicago</span>
          <input
            className={portalInputClass}
            id={`${id}-zone`}
            required
            maxLength={100}
            value={fields.zone}
            onChange={(e) => setFields({ ...fields, zone: e.target.value })}
          />
        </label>
        <label className="flex min-h-11 items-start gap-3">
          <input
            className="mt-1"
            type="checkbox"
            checked={fields.accepted}
            onChange={(e) =>
              setFields({ ...fields, accepted: e.target.checked })
            }
          />
          <span>
            I accept responsibility as the current coordinator for private
            offers to this need.
          </span>
        </label>
        <p className="text-sm">
          Clearing this choice turns off contribution consent and ends existing
          unreceived promises. Your{" "}
          <Link
            prefetch={false}
            className="underline"
            href="/platform/settings/privacy/messages?context=exchange"
          >
            contact request choices
          </Link>{" "}
          also govern new offers.
        </p>
        <button className="gc-button" type="submit">
          Save deadline and coordinator choice
        </button>
        <button
          className="gc-button gc-button-quiet"
          type="button"
          onClick={() => setFields(initial)}
        >
          Discard local changes
        </button>
      </fieldset>
      {action.status}
    </form>
  );
}

export function NeedSlotForm({
  owner,
  need,
  slot,
  roles
}: {
  owner: string;
  need: NeedView;
  slot?: NeedSlotView;
  roles: NeedRoleChoice[];
}) {
  const id = useId(),
    reference = useRef<string | null>(slot?.id ?? null);
  const initial = {
    action: (slot?.action ?? "DONATE") as NeedAction,
    label: slot?.label ?? "",
    unit: slot?.unit ?? "items",
    target: String(slot?.target ?? 1),
    loan: slot?.loan ?? false,
    returnLocal: slot?.returnLocal ?? "",
    returnTimeZone: slot?.returnTimeZone ?? need.timeZone ?? "UTC",
    returnResponsibility: slot?.returnResponsibility ?? "",
    volunteerSlotId: slot?.volunteer?.id ?? ""
  };
  const [fields, setFields] = useState(initial);
  const action = useExchangeAction(
    owner,
    JSON.stringify(initial) !== JSON.stringify(fields),
    undefined,
    true
  );
  const locked = !!slot && ((slot.committed ?? 0) > 0 || !!slot.volunteer);
  return (
    <details className="space-y-3 rounded-xl border border-gc-divider p-4">
      <summary className="min-h-11 cursor-pointer py-2 font-semibold">
        {slot ? `Edit ${slot.label}` : "Add an action slot"}
      </summary>
      <form
        className="space-y-3"
        aria-label={slot ? `Edit slot ${slot.label}` : "Add need action slot"}
        onSubmit={(e) => {
          e.preventDefault();
          reference.current ??= crypto.randomUUID();
          void action.command({
            operation: "need-slot",
            needId: need.id,
            slotId: reference.current,
            expectedVersion: slot?.version ?? 0,
            schema: NEED_SCHEMA,
            fields: {
              ...fields,
              target: Number(fields.target),
              volunteerSlotId:
                fields.action === "VOLUNTEER" ? fields.volunteerSlotId : null,
              returnLocal: fields.loan ? fields.returnLocal : null,
              returnTimeZone: fields.loan ? fields.returnTimeZone : null,
              returnResponsibility: fields.loan
                ? fields.returnResponsibility
                : ""
            }
          });
        }}
      >
        <fieldset disabled={action.blocked} className="min-w-0 space-y-3">
          <label className="block space-y-2" htmlFor={`${id}-action`}>
            <span>Help requested</span>
            <select
              id={`${id}-action`}
              className={portalInputClass}
              disabled={locked}
              value={fields.action}
              onChange={(e) =>
                setFields({
                  ...fields,
                  action: e.target.value as NeedAction,
                  loan: false,
                  volunteerSlotId: "",
                  unit: e.target.value === "VOLUNTEER" ? "places" : "items"
                })
              }
            >
              {Object.entries(needActionLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="block space-y-2" htmlFor={`${id}-label`}>
            <span>Item or help description</span>
            <input
              id={`${id}-label`}
              className={portalInputClass}
              required
              minLength={2}
              maxLength={120}
              disabled={locked}
              value={fields.label}
              onChange={(e) => setFields({ ...fields, label: e.target.value })}
            />
          </label>
          {fields.action === "VOLUNTEER" ? (
            <>
              <label className="block space-y-2" htmlFor={`${id}-role`}>
                <span>Current event role</span>
                <select
                  id={`${id}-role`}
                  className={portalInputClass}
                  required
                  disabled={locked}
                  value={fields.volunteerSlotId}
                  onChange={(e) => {
                    const role = roles.find((r) => r.id === e.target.value);
                    setFields({
                      ...fields,
                      volunteerSlotId: e.target.value,
                      unit: "places",
                      target: String(role?.capacity ?? 1)
                    });
                  }}
                >
                  <option value="">Choose a role</option>
                  {roles.map((role) => (
                    <option key={role.id} value={role.id}>
                      {role.eventTitle}: {role.role} ({role.capacity} places)
                    </option>
                  ))}
                </select>
              </label>
              <p className="text-sm">
                The role keeps its existing places and signups. Creating or
                changing a role requires your current volunteer organizer duty.{" "}
                <Link
                  prefetch={false}
                  className="underline"
                  href="/platform/calendar"
                >
                  Open Calendar and its event post
                </Link>{" "}
                to create a role first.
              </p>
            </>
          ) : (
            <label className="block space-y-2" htmlFor={`${id}-unit`}>
              <span>Quantity unit, for example parcels or trips</span>
              <input
                id={`${id}-unit`}
                className={portalInputClass}
                required
                maxLength={40}
                disabled={locked}
                value={fields.unit}
                onChange={(e) => setFields({ ...fields, unit: e.target.value })}
              />
            </label>
          )}
          <label className="block space-y-2" htmlFor={`${id}-target`}>
            <span>Target quantity</span>
            <input
              id={`${id}-target`}
              className={portalInputClass}
              type="number"
              min={1}
              max={10000}
              step={1}
              required
              disabled={fields.action === "VOLUNTEER"}
              value={fields.target}
              onChange={(e) => setFields({ ...fields, target: e.target.value })}
            />
          </label>
          {fields.action === "DONATE" && (
            <label className="flex min-h-11 items-start gap-3">
              <input
                className="mt-1"
                type="checkbox"
                checked={fields.loan}
                disabled={locked}
                onChange={(e) =>
                  setFields({ ...fields, loan: e.target.checked })
                }
              />
              This is a physical equipment loan that must be returned
            </label>
          )}
          {fields.loan && (
            <>
              <label className="block space-y-2" htmlFor={`${id}-return`}>
                <span>Equipment return date and time</span>
                <input
                  id={`${id}-return`}
                  className={portalInputClass}
                  type="datetime-local"
                  required
                  disabled={locked}
                  value={fields.returnLocal}
                  onChange={(e) =>
                    setFields({ ...fields, returnLocal: e.target.value })
                  }
                />
              </label>
              <label className="block space-y-2" htmlFor={`${id}-return-zone`}>
                <span>Return time zone</span>
                <input
                  id={`${id}-return-zone`}
                  className={portalInputClass}
                  required
                  maxLength={100}
                  disabled={locked}
                  value={fields.returnTimeZone}
                  onChange={(e) =>
                    setFields({ ...fields, returnTimeZone: e.target.value })
                  }
                />
              </label>
              <label
                className="block space-y-2"
                htmlFor={`${id}-responsibility`}
              >
                <span>Who is responsible for returning the equipment</span>
                <textarea
                  id={`${id}-responsibility`}
                  className={portalInputClass}
                  required
                  minLength={3}
                  maxLength={500}
                  disabled={locked}
                  value={fields.returnResponsibility}
                  onChange={(e) =>
                    setFields({
                      ...fields,
                      returnResponsibility: e.target.value
                    })
                  }
                />
              </label>
            </>
          )}
          {locked && (
            <p>
              Existing participation fixes this action’s original terms. Add a
              new slot for different help.
            </p>
          )}
          <button className="gc-button" type="submit">
            Save action slot
          </button>
          <button
            className="gc-button gc-button-quiet"
            type="button"
            onClick={() => setFields(initial)}
          >
            Discard local slot changes
          </button>
        </fieldset>
        {action.status}
      </form>
    </details>
  );
}

export function NeedClaimForm({
  owner,
  need,
  slot
}: {
  owner: string;
  need: NeedView;
  slot: NeedSlotView;
}) {
  const id = useId(),
    reference = useRef<string | null>(null);
  const [quantity, setQuantity] = useState("1"),
    [note, setNote] = useState(""),
    [price, setPrice] = useState(""),
    [currency, setCurrency] = useState("USD"),
    [share, setShare] = useState(false),
    [loan, setLoan] = useState(false);
  const reset = useCallback(() => {
    setQuantity("1");
    setNote("");
    setPrice("");
    setShare(false);
    setLoan(false);
  }, []);
  const action = useExchangeAction(
    owner,
    quantity !== "1" || !!note || !!price || share || loan,
    reset,
    true
  );
  const full = (slot.committed ?? 0) >= slot.target;
  const own = need.contributions.find(
    (c) =>
      c.slotId === slot.id &&
      ["COMMITTED", "WAITLISTED", "QUOTED"].includes(c.state)
  );
  if (own)
    return (
      <p>
        Your{" "}
        {own.state === "WAITLISTED"
          ? "waitlist entry"
          : own.state === "QUOTED"
            ? "quote"
            : "commitment"}{" "}
        is saved below. Withdraw it before making a different offer.
      </p>
    );
  if (slot.action === "VOLUNTEER")
    return (
      <div className="space-y-3">
        {slot.volunteer?.signup ? (
          <p>
            Your event signup is{" "}
            {slot.volunteer.signup.completedAt
              ? "recorded as completed"
              : slot.volunteer.signup.state.toLowerCase()}
            .
          </p>
        ) : null}
        {slot.volunteer && (
          <Link
            prefetch={false}
            className="gc-button gc-button-quiet"
            href={`/platform/posts/${slot.volunteer.postId}`}
          >
            Open the event role and your signup
          </Link>
        )}
        {slot.volunteer?.open &&
          slot.volunteer.signup?.state !== "ACTIVE" &&
          !slot.volunteer.signup?.completedAt && (
            <button
              type="button"
              className="gc-button"
              disabled={action.blocked || full || !need.canContribute}
              onClick={() =>
                void action.command({
                  operation: "need-volunteer",
                  needId: need.id,
                  slotId: slot.id,
                  slotVersion: slot.version,
                  expectedVersion: need.consentVersion,
                  signupVersion: slot.volunteer?.signup?.version ?? 0
                })
              }
            >
              Reserve one volunteer place
            </button>
          )}
        {action.status}
      </div>
    );
  if (!need.canContribute || slot.closed)
    return (
      <p>
        New offers are currently unavailable to this account. Existing
        contributions and returns remain below.
      </p>
    );
  return (
    <form
      className="space-y-3"
      aria-label={`Offer help for ${slot.label}`}
      onSubmit={(e) => {
        e.preventDefault();
        reference.current ??= crypto.randomUUID();
        void action.command({
          operation: "need-claim",
          needId: need.id,
          slotId: slot.id,
          slotVersion: slot.version,
          consentVersion: need.consentVersion,
          id: reference.current,
          expectedVersion: 0,
          quantity: Number(quantity),
          note,
          price: slot.action === "SELL" ? price : null,
          currency: slot.action === "SELL" ? currency : null,
          shareName: share,
          loanAccepted: loan,
          waitlist: full && slot.action !== "SELL"
        });
      }}
    >
      <fieldset disabled={action.blocked} className="min-w-0 space-y-3">
        <label className="block space-y-2" htmlFor={`${id}-quantity`}>
          <span>Quantity in {slot.unit}</span>
          <input
            id={`${id}-quantity`}
            className={portalInputClass}
            type="number"
            min={1}
            max={slot.target}
            step={1}
            required
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
          />
        </label>
        <label className="block space-y-2" htmlFor={`${id}-note`}>
          <span>
            {slot.action === "SELL"
              ? "Exact scope of this quote"
              : "Optional private note to the coordinator"}
          </span>
          <textarea
            id={`${id}-note`}
            className={portalInputClass}
            maxLength={2000}
            required={slot.action === "SELL"}
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </label>
        {slot.action === "SELL" && (
          <>
            <label className="block space-y-2" htmlFor={`${id}-price`}>
              <span>Total quoted amount for this quantity</span>
              <input
                id={`${id}-price`}
                className={portalInputClass}
                inputMode="decimal"
                required
                maxLength={16}
                value={price}
                onChange={(e) => setPrice(e.target.value)}
              />
            </label>
            <label className="block space-y-2" htmlFor={`${id}-currency`}>
              <span>Quote currency</span>
              <select
                id={`${id}-currency`}
                className={portalInputClass}
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
              >
                {Object.keys(exchangeCurrencies).map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
            <p>
              A quote reserves nothing until accepted. This website does not
              collect payments or issue tax receipts.
            </p>
          </>
        )}
        <label className="flex min-h-11 items-start gap-3">
          <input
            className="mt-1"
            type="checkbox"
            checked={share}
            onChange={(e) => setShare(e.target.checked)}
          />
          Show my name as a contributor to current permitted readers
        </label>
        {slot.loan && (
          <label className="flex min-h-11 items-start gap-3">
            <input
              className="mt-1"
              type="checkbox"
              required
              checked={loan}
              onChange={(e) => setLoan(e.target.checked)}
            />
            I agree to the displayed equipment return date and responsibility.
          </label>
        )}
        <p className="text-sm">
          Notes and quotes go only to you and the current responsible
          coordinator. Leave out financial credentials and details about
          children.
        </p>
        {full && slot.action !== "SELL" && (
          <p>
            This slot is full. Joining its waitlist reserves nothing. You must
            choose a fresh commitment if space opens.
          </p>
        )}
        <button className="gc-button" type="submit">
          {slot.action === "SELL"
            ? "Submit private quote"
            : full
              ? "Join waitlist without reserving"
              : "Commit this quantity"}
        </button>
        <button
          className="gc-button gc-button-quiet"
          type="button"
          onClick={reset}
        >
          Discard unsent offer
        </button>
      </fieldset>
      {action.status}
    </form>
  );
}
