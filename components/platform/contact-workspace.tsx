"use client";
import Link from "next/link";
import {
  contactAudiences,
  contactStatusLabels,
  type ContactAudience,
  type ContactRequest
} from "@/lib/platform/adult-contact-types";
import { reportEntryHref } from "@/lib/platform/community-report-types";
import { RelationshipControls } from "./relationship-controls";
import { useContactWorkspace } from "./use-contact-workspace";
type View = "received" | "sent" | "receipt" | "compose" | "preferences";
const requestsHref = (id: string) =>
  `/platform/messages/requests?${new URLSearchParams({ id })}`;

export function ContactWorkspace({
  owner,
  view,
  id,
  recipientId,
  after
}: {
  owner: string;
  view: View;
  id?: string;
  recipientId?: string;
  after?: string;
}) {
  const query = new URLSearchParams({
    view: view === "compose" ? "target" : view,
    ...(id ? { id } : {}),
    ...(recipientId ? { recipientId } : {}),
    ...(after ? { after } : {})
  }).toString();
  const {
    state: s,
    setState,
    dirty,
    load,
    send,
    act,
    discard
  } = useContactWorkspace(owner, query);
  const busy = s.busy || !!s.pending || !!s.waitingUntil;
  const canCreate =
    !!s.data?.available &&
    !!s.data.target &&
    !s.data.activeRequest &&
    !s.data.conversation;
  const heading =
    view === "preferences"
      ? "Who can send you contact requests"
      : view === "compose"
        ? "Send a contact request"
        : view === "receipt"
          ? "Private contact request"
          : view === "sent"
            ? "Sent requests"
            : "Received requests";
  const Heading = view === "preferences" ? "h2" : "h1";
  const rows = s.data?.request ? [s.data.request] : (s.data?.requests ?? []);
  const nav = (
    <nav aria-label="Contact request views" className="flex flex-wrap gap-4">
      <Link
        prefetch={false}
        className="underline"
        href="/platform/messages/requests"
      >
        Received
      </Link>
      <Link
        prefetch={false}
        className="underline"
        href="/platform/messages/requests?view=sent"
      >
        Sent
      </Link>
      <Link
        prefetch={false}
        className="underline"
        href="/platform/settings/privacy/messages"
      >
        Contact preferences
      </Link>
    </nav>
  );
  function entry(row: ContactRequest) {
    return (
      <article
        key={row.id}
        aria-label="Contact request"
        className="space-y-3 rounded-xl border p-4"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl">
              {row.direction === "sent" ? "To " : "From "}
              {row.person ? (
                <Link
                  prefetch={false}
                  className="underline"
                  href={`/platform/profile/${row.person.username}`}
                >
                  {row.person.name}
                </Link>
              ) : (
                "an unavailable account"
              )}
            </h2>
            <p>{contactStatusLabels[row.status]}</p>
          </div>
          {row.person && (
            <RelationshipControls
              compact
              kind="person"
              targetId={row.person.id}
              name={row.person.name}
              menuLabel={`More options for ${row.person.name}'s contact request`}
              reportTarget={{
                type: "CONTACT_REQUEST",
                id: row.id,
                label: "Report this request"
              }}
            />
          )}
        </div>
        <p className="whitespace-pre-wrap break-words">{row.purpose}</p>
        <p className="text-sm text-gc-muted">
          Sent{" "}
          <time dateTime={row.createdAt}>
            {new Date(row.createdAt).toLocaleString()}
          </time>
        </p>
        {row.status === "PENDING" && (
          <p className="text-sm">
            Expires {new Date(row.expiresAt).toLocaleDateString()}. Acceptance
            opens contact only between the two of you.
          </p>
        )}
        {row.conversation && (
          <p className="text-sm">
            {row.conversation.sendingAllowed
              ? "This request was accepted. Its original purpose is kept here."
              : "New messages are unavailable. This retained request does not restore contact permission."}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          {row.canAccept && (
            <button
              type="button"
              className="gc-button gc-button-primary"
              disabled={busy}
              onClick={() =>
                act("accept", { id: row.id, expectedVersion: row.version })
              }
            >
              Accept request
            </button>
          )}
          {row.canDecline && (
            <button
              type="button"
              className="gc-button gc-button-quiet"
              disabled={busy}
              onClick={() =>
                act("decline", { id: row.id, expectedVersion: row.version })
              }
            >
              Decline request
            </button>
          )}
          {row.canWithdraw && (
            <button
              type="button"
              className="gc-button gc-button-quiet"
              disabled={busy}
              onClick={() =>
                act("withdraw", { id: row.id, expectedVersion: row.version })
              }
            >
              Withdraw request
            </button>
          )}
          {!row.person && (
            <Link
              prefetch={false}
              className="gc-button gc-button-quiet"
              href={reportEntryHref("CONTACT_REQUEST", row.id)}
            >
              Report this request
            </Link>
          )}
          {view !== "receipt" && (
            <Link
              prefetch={false}
              className="gc-button gc-button-quiet"
              href={requestsHref(row.id)}
            >
              Open request
            </Link>
          )}
        </div>
      </article>
    );
  }
  return (
    <section className="space-y-5" aria-label="Private contact workspace">
      <Heading className="text-3xl">{heading}</Heading>
      {view !== "preferences" && nav}
      <p>
        Contact requests are private between eligible adult accounts. A request
        does not grant church access or start a conversation without acceptance.
      </p>
      <p role="status" aria-live="polite">
        {s.message}
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="gc-button gc-button-quiet"
          disabled={s.busy}
          onClick={() => void load()}
        >
          Refresh contact access
        </button>
        {s.pending && !s.hidden && (
          <button
            type="button"
            className="gc-button gc-button-primary"
            disabled={s.busy || !!s.waitingUntil}
            onClick={() => void send(s.pending!)}
          >
            Retry same contact action
          </button>
        )}
        {(dirty || s.pending || s.conflict) && (
          <button
            type="button"
            className="gc-button gc-button-quiet"
            disabled={s.busy}
            onClick={discard}
          >
            {s.pending ? "Clear local retry" : "Discard unsent entries"}
          </button>
        )}
      </div>
      {s.waitingUntil > 0 && !s.hidden && (
        <p>
          Try again after {new Date(s.waitingUntil).toLocaleString()}. Your
          unsent entries are kept.
        </p>
      )}
      {!s.hidden && (
        <>
          {s.data && !s.data.available && (
            <p className="rounded border p-3">
              New contact is unavailable right now. Saved requests remain
              private, and you can still decline or withdraw a pending request.
              No new request has been submitted by this page.
            </p>
          )}
          {view === "preferences" &&
            s.choice &&
            (s.data?.preferences || dirty || s.pending || s.conflict) && (
              <form
                className="space-y-4"
                aria-label="Contact preferences"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (
                    !s.saved ||
                    !s.data ||
                    (!s.data.available && s.choice !== "NOBODY") ||
                    s.conflict ||
                    s.pending
                  )
                    return;
                  act("preferences", {
                    audience: s.choice,
                    expectedVersion: s.saved.version
                  });
                }}
              >
                <label className="block">
                  Who can send you a request
                  <select
                    aria-label="Who can send you a request"
                    className="mt-1 block w-full rounded border p-3"
                    value={s.choice}
                    disabled={busy || !s.data}
                    onChange={(e) =>
                      setState((v) => ({
                        ...v,
                        choice: e.target.value as ContactAudience,
                        message: "Contact choices are not saved yet."
                      }))
                    }
                  >
                    {Object.entries(contactAudiences).map(([value, label]) => (
                      <option
                        key={value}
                        value={value}
                        disabled={!s.data?.available && value !== "NOBODY"}
                      >
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <p className="text-sm">
                  You must accept each request. “Adults I follow” uses accounts
                  you follow. Blocks always apply. This choice affects new and
                  pending requests; use Block to stop an accepted contact.
                </p>
                <button
                  className="gc-button gc-button-primary"
                  disabled={
                    busy ||
                    !dirty ||
                    s.conflict ||
                    !s.data ||
                    (!s.data.available && s.choice !== "NOBODY")
                  }
                >
                  Save contact preferences
                </button>
                {s.latest && (
                  <aside
                    className="space-y-2 rounded border p-3"
                    aria-label="Saved contact preferences"
                  >
                    <p>
                      Last checked saved choice:{" "}
                      {contactAudiences[s.latest.audience]}.
                    </p>
                    <button
                      type="button"
                      className="gc-button gc-button-quiet"
                      disabled={!!s.pending || s.busy}
                      onClick={discard}
                    >
                      Use saved contact choices
                    </button>
                  </aside>
                )}
                <p className="text-sm text-gc-muted">
                  Child contact is unavailable; family restrictions remain
                  managed by the parent. Presence, read receipts and group
                  invitations are unavailable here.
                </p>
              </form>
            )}
          {view === "compose" && (
            <>
              {s.data?.target && (
                <h2 className="text-xl">To {s.data.target.name}</h2>
              )}
              {s.receiptId && (
                <Link
                  prefetch={false}
                  className="gc-button gc-button-primary"
                  href={requestsHref(s.receiptId)}
                >
                  View saved request
                </Link>
              )}
              {s.data?.activeRequest && (
                <Link
                  prefetch={false}
                  className="underline"
                  href={requestsHref(s.data.activeRequest.id)}
                >
                  Review the existing request
                </Link>
              )}
              {s.data?.conversation && (
                <p>
                  You already have an accepted contact with this person. A
                  second request is not needed.
                </p>
              )}
              {!s.receiptId &&
                ((!s.data?.activeRequest && !s.data?.conversation) ||
                  !!s.purpose) && (
                  <form
                    className="space-y-4"
                    aria-label="Contact request"
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (
                        !canCreate ||
                        !s.data?.target ||
                        s.pending ||
                        !s.purpose.trim()
                      )
                        return;
                      act("create", {
                        recipientId: s.data.target.id,
                        expectedRecipientVersion:
                          s.data.expectedRecipientVersion,
                        purpose: s.purpose
                      });
                    }}
                  >
                    <label className="block">
                      Why would you like to connect?
                      <textarea
                        aria-label="Request purpose"
                        maxLength={1000}
                        required
                        rows={5}
                        className="mt-1 block w-full rounded border p-3"
                        value={s.purpose}
                        disabled={busy}
                        onChange={(e) =>
                          setState((v) => ({
                            ...v,
                            purpose: e.target.value,
                            message: "Your request has not been sent."
                          }))
                        }
                      />
                    </label>
                    <p className="text-sm">
                      Keep it brief. Your purpose will be shared with this
                      person when you send the request.
                    </p>
                    <button
                      className="gc-button gc-button-primary"
                      disabled={busy || !canCreate || !s.purpose.trim()}
                    >
                      Send contact request
                    </button>
                  </form>
                )}
            </>
          )}
          {["received", "sent", "receipt"].includes(view) && s.data && (
            <>
              {!rows.length && (
                <p>
                  {view === "sent"
                    ? "You have no sent requests on this page."
                    : "You have no received requests on this page."}
                </p>
              )}
              {rows.map(entry)}
              {s.data.after && (
                <Link
                  prefetch={false}
                  className="gc-button gc-button-quiet"
                  href={`/platform/messages/requests?${new URLSearchParams({ view, after: s.data.after })}`}
                >
                  Older requests
                </Link>
              )}
            </>
          )}
        </>
      )}
      <div className="flex flex-wrap gap-4">
        {view === "preferences" && (
          <Link
            prefetch={false}
            className="underline"
            href="/platform/messages/requests"
          >
            Open contact requests
          </Link>
        )}
        <Link
          prefetch={false}
          className="underline"
          href="/platform/relationships?view=blocked"
        >
          Manage blocked accounts
        </Link>
      </div>
    </section>
  );
}
