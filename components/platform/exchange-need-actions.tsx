"use client";
import Link from "next/link";
import { useId, useState } from "react";
import type {
  NeedContributionView,
  NeedSlotView,
  NeedView
} from "@/lib/platform/exchange-need-reads";
import { needContributionLabels } from "@/lib/platform/exchange-need-options";
import { reportEntryHref } from "@/lib/platform/community-report-types";
import { useExchangeAction } from "./exchange-saved-controls";
import { portalInputClass } from "./portal-action-form";
import { RegionalTime } from "./regional-presentation";

export function NeedContributionCard({
  owner,
  row
}: {
  owner: string;
  row: NeedContributionView;
}) {
  const id = useId(),
    [quantity, setQuantity] = useState(String(row.received)),
    [returned, setReturned] = useState(String(row.returned)),
    [reason, setReason] = useState("");
  const action = useExchangeAction(
    owner,
    quantity !== String(row.received) ||
      returned !== String(row.returned) ||
      !!reason,
    undefined,
    true
  );
  const active = ["COMMITTED", "QUOTED", "WAITLISTED"].includes(row.state);
  const command = (operation: string, extra: Record<string, unknown> = {}) =>
    void action.command({
      operation: `need-${operation}`,
      id: row.id,
      expectedVersion: row.version,
      ...extra
    });
  return (
    <article
      className="space-y-3 rounded-xl border border-gc-divider p-4"
      aria-label={row.own ? "Your need contribution" : "Private contribution"}
    >
      <h3 className="text-xl">{row.title}</h3>
      {row.contributor && <p>Contributor: {row.contributor.name}</p>}
      <p>
        {needContributionLabels[
          row.state as keyof typeof needContributionLabels
        ] ?? row.state}
        . Promised {row.quantity}. Received {row.received}.
      </p>
      {row.note && (
        <p className="whitespace-pre-wrap break-words">
          Private note: {row.note}
        </p>
      )}
      {row.quoteMinor !== null && (
        <p>
          Quoted total:{" "}
          {new Intl.NumberFormat("en", {
            style: "currency",
            currency: row.quoteCurrency!
          }).format(
            row.quoteMinor /
              10 **
                new Intl.NumberFormat("en", {
                  style: "currency",
                  currency: row.quoteCurrency!
                }).resolvedOptions().maximumFractionDigits!
          )}
          . Acceptance records coordination only.
        </p>
      )}
      {row.loanReturnAt && (
        <p>
          Equipment returned {row.returned} of {row.received} received. Return
          due <RegionalTime value={row.loanReturnAt} />.{" "}
          {row.loanResponsibility}
        </p>
      )}
      {!row.current && (
        <p>
          Current source details and private access are unavailable. Your
          remaining promise may still be withdrawn, and you may confirm
          equipment returned to you.
        </p>
      )}
      {row.disputed && <p>Private dispute flagged. {row.disputeNote}</p>}
      <fieldset disabled={action.blocked} className="min-w-0 space-y-3">
        {row.own && active && (
          <button
            className="gc-button gc-button-quiet"
            type="button"
            onClick={() => {
              if (
                confirm(
                  "Withdraw the unreceived part of this promise? Existing receipts and equipment returns are preserved."
                )
              )
                command("withdraw");
            }}
          >
            Withdraw remaining promise
          </button>
        )}
        {!row.own && row.current && row.state === "QUOTED" && (
          <div className="flex flex-wrap gap-3">
            <button
              className="gc-button"
              type="button"
              onClick={() => command("accept")}
            >
              Accept quote and reserve quantity
            </button>
            <button
              className="gc-button gc-button-quiet"
              type="button"
              onClick={() => command("decline")}
            >
              Decline quote
            </button>
          </div>
        )}
        {!row.own && row.current && row.state === "WAITLISTED" && (
          <button
            className="gc-button gc-button-quiet"
            type="button"
            onClick={() => command("decline")}
          >
            Decline waitlist entry
          </button>
        )}
        {!row.own &&
          row.current &&
          (row.state === "COMMITTED" || row.received > 0) && (
            <>
              <label className="block space-y-2" htmlFor={`${id}-received`}>
                <span>Total quantity actually received</span>
                <input
                  id={`${id}-received`}
                  className={portalInputClass}
                  type="number"
                  min={0}
                  max={row.quantity}
                  step={1}
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                />
              </label>
              <button
                className="gc-button"
                type="button"
                onClick={() =>
                  command("receive", { quantity: Number(quantity), reason })
                }
              >
                Record actual receipt
              </button>
            </>
          )}
        {row.loanReturnAt && row.received > 0 && (row.own || row.current) && (
          <>
            <label className="block space-y-2" htmlFor={`${id}-returned`}>
              <span>Total equipment actually returned</span>
              <input
                id={`${id}-returned`}
                className={portalInputClass}
                type="number"
                min={row.own ? row.returned : 0}
                max={row.received}
                step={1}
                value={returned}
                onChange={(e) => setReturned(e.target.value)}
              />
            </label>
            <button
              className="gc-button"
              type="button"
              onClick={() =>
                command(row.own ? "confirm-return" : "return-loan", {
                  quantity: Number(returned),
                  ...(!row.own ? { reason } : {})
                })
              }
            >
              {row.own
                ? "Confirm equipment returned to me"
                : "Record equipment return"}
            </button>
          </>
        )}
        {row.current && (
          <>
            <label className="block space-y-2" htmlFor={`${id}-reason`}>
              <span>
                {row.own
                  ? "Private dispute note"
                  : "Correction reason, required when reducing a receipt or return"}
              </span>
              <textarea
                id={`${id}-reason`}
                className={portalInputClass}
                maxLength={500}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </label>
            {row.own && (
              <div className="flex flex-wrap gap-3">
                <button
                  className="gc-button gc-button-quiet"
                  type="button"
                  onClick={() =>
                    command("attribution", { shareName: !row.shareName })
                  }
                >
                  {row.shareName
                    ? "Stop showing my contributor name"
                    : "Allow my contributor name to be shown"}
                </button>
                <button
                  className="gc-button gc-button-quiet"
                  type="button"
                  disabled={reason.trim().length < 3}
                  onClick={() => command("dispute", { note: reason })}
                >
                  Flag a private dispute
                </button>
              </div>
            )}
          </>
        )}
        <button
          className="gc-button gc-button-quiet"
          type="button"
          onClick={() => {
            setQuantity(String(row.received));
            setReturned(String(row.returned));
            setReason("");
          }}
        >
          Discard local receipt entries
        </button>
      </fieldset>
      {row.current && row.listingId && (
        <Link
          prefetch={false}
          className="inline-flex min-h-11 items-center underline"
          href={`/platform/exchange/${row.listingId}/needs`}
        >
          Open current need
        </Link>
      )}
      <Link
        prefetch={false}
        className="inline-flex min-h-11 items-center underline"
        href={reportEntryHref("NEED_CONTRIBUTION", row.id)}
      >
        Preview selected contribution evidence and report
      </Link>
      {action.status}
    </article>
  );
}

export function NeedOrganizerActions({
  owner,
  need,
  slot
}: {
  owner: string;
  need: NeedView;
  slot?: NeedSlotView;
}) {
  const id = useId(),
    [reason, setReason] = useState(""),
    [text, setText] = useState("");
  const action = useExchangeAction(owner, !!reason || !!text, undefined, true);
  const close = (cancel: boolean) => {
    if (
      confirm(
        cancel
          ? "Cancel this need and release unreceived promises? Recorded receipts and outstanding equipment returns will be preserved."
          : "Close this request with the current received and unmet quantities? Existing promises and returns remain separate."
      )
    )
      void action.command(
        slot
          ? {
              operation: "need-close-slot",
              needId: need.id,
              slotId: slot.id,
              expectedVersion: slot.version,
              reason
            }
          : {
              operation: "need-close",
              needId: need.id,
              expectedVersion: need.version,
              reason,
              cancel
            }
      );
  };
  return (
    <section
      className="space-y-3"
      aria-label={
        slot ? `Close ${slot.label}` : "Organizer updates and closing"
      }
    >
      <fieldset disabled={action.blocked} className="min-w-0 space-y-3">
        {!slot && !need.canceled && (
          <form
            className="space-y-3"
            aria-label="Publish need update"
            onSubmit={(e) => {
              e.preventDefault();
              void action.command({
                operation: "need-update",
                needId: need.id,
                expectedVersion: need.version,
                text
              });
            }}
          >
            <label className="block space-y-2" htmlFor={`${id}-update`}>
              <span>Public organizer update</span>
              <textarea
                id={`${id}-update`}
                className={portalInputClass}
                minLength={3}
                maxLength={2000}
                required
                value={text}
                onChange={(e) => setText(e.target.value)}
              />
            </label>
            <button className="gc-button" type="submit">
              Publish update for current contributors
            </button>
          </form>
        )}
        {!(slot?.closed || need.closed) && (
          <>
            <label className="block space-y-2" htmlFor={`${id}-reason`}>
              <span>Public reason for closing, including any unmet help</span>
              <textarea
                id={`${id}-reason`}
                className={portalInputClass}
                minLength={3}
                maxLength={500}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </label>
            <button
              className="gc-button gc-button-quiet"
              type="button"
              disabled={reason.trim().length < 3}
              onClick={() => close(false)}
            >
              {slot ? "Close this slot" : "Close need with current progress"}
            </button>
            {!slot && (
              <button
                className="gc-button gc-button-quiet"
                type="button"
                disabled={reason.trim().length < 3}
                onClick={() => close(true)}
              >
                Cancel need and release unreceived promises
              </button>
            )}
          </>
        )}
        <button
          className="gc-button gc-button-quiet"
          type="button"
          onClick={() => {
            setReason("");
            setText("");
          }}
        >
          Discard unsent organizer entries
        </button>
      </fieldset>
      {action.status}
    </section>
  );
}

export function NeedPostLinks({
  owner,
  need,
  posts
}: {
  owner: string;
  need: NeedView;
  posts: { id: string; version: number; excerpt: string; linked: boolean }[];
}) {
  const action = useExchangeAction(owner, false, undefined, true);
  return (
    <section className="space-y-3" aria-label="Church Need post links">
      <h2 className="text-2xl">Church Need posts</h2>
      <p>
        Link an existing authorized church Need post to these same action slots.
        Its readers must also have current listing access.
      </p>
      {!posts.length && (
        <p>
          No current eligible Need post appears on this page. Create a church
          Need post through the existing post composer first.
        </p>
      )}
      {posts.map((post) => (
        <div
          className="space-y-2 rounded-xl border border-gc-divider p-3"
          key={post.id}
        >
          <p className="break-words">{post.excerpt}</p>
          <button
            className="gc-button gc-button-quiet"
            disabled={action.blocked}
            type="button"
            onClick={() =>
              void action.command({
                operation: "need-link-post",
                needId: need.id,
                expectedVersion: need.version,
                postId: post.id,
                postVersion: post.version,
                linked: !post.linked
              })
            }
          >
            {post.linked
              ? "Remove this need link"
              : "Link this post to this need"}
          </button>
        </div>
      ))}
      {action.status}
    </section>
  );
}

export function NeedVolunteerReceipt({
  owner,
  needId,
  signup
}: {
  owner: string;
  needId: string;
  signup: {
    id: string;
    version: number;
    name: string;
    state: string;
    completedAt: string | null;
  };
}) {
  const id = useId(),
    [reason, setReason] = useState("");
  const action = useExchangeAction(owner, !!reason, undefined, true);
  return (
    <section className="space-y-3 rounded-xl border border-gc-divider p-3">
      <h3 className="text-lg">{signup.name}</h3>
      <p>
        {signup.completedAt
          ? "Help recorded as completed"
          : signup.state === "ACTIVE"
            ? "Reserved, completion not confirmed"
            : "Canceled"}
      </p>
      <fieldset disabled={action.blocked} className="min-w-0 space-y-3">
        {signup.completedAt && (
          <label className="block space-y-2" htmlFor={`${id}-reason`}>
            <span>Reason for correcting completed help</span>
            <textarea
              id={`${id}-reason`}
              className={portalInputClass}
              minLength={3}
              maxLength={500}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
        )}
        {(signup.state === "ACTIVE" || signup.completedAt) && (
          <button
            type="button"
            className="gc-button"
            disabled={!!signup.completedAt && reason.trim().length < 3}
            onClick={() =>
              void action.command({
                operation: "need-complete-volunteer",
                needId,
                signupId: signup.id,
                expectedVersion: signup.version,
                completed: !signup.completedAt,
                reason
              })
            }
          >
            {signup.completedAt
              ? "Correct completion record"
              : "Confirm help actually completed"}
          </button>
        )}
      </fieldset>
      {action.status}
    </section>
  );
}
