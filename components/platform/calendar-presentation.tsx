import Link from "next/link";
import type {
  getCalendarAgenda,
  getCalendarCommitments,
  getCalendars
} from "@/lib/platform/calendar-reads";
import {
  eventWhen,
  type monthRange,
  type CalendarQuery
} from "@/lib/platform/calendar-view";
import {
  CalendarForm,
  CalendarFields,
  DeviceZoneButton
} from "./calendar-form";
import { PortalEmpty, portalLinkClass } from "./portal-ui";
import { portalInputClass, portalButtonClass } from "./portal-action-form";
import { LocalEventTime } from "./local-event-time";

export type CalendarSummary = Awaited<
  ReturnType<typeof getCalendars>
>["calendars"][number];
export type CalendarEvent = Awaited<
  ReturnType<typeof getCalendarAgenda>
>["events"][number];
type Commitment = Awaited<
  ReturnType<typeof getCalendarCommitments>
>["commitments"][number];
export const eventPath = (id: string) =>
  `/platform/events/${encodeURIComponent(id)}`;
export const calendarPath = (id: string) =>
  `/platform/calendars/${encodeURIComponent(id)}`;
export function CalendarNavigation({ churchId }: { churchId?: string }) {
  return (
    <nav
      aria-label="Calendar sections"
      className="flex flex-wrap gap-x-5 gap-y-1"
    >
      <Link className={portalLinkClass} href="/platform/calendars">
        My calendars
      </Link>
      <Link className={portalLinkClass} href="/platform/commitments">
        My commitments
      </Link>
      {churchId && (
        <>
          <Link
            className={portalLinkClass}
            href={`/platform/churches/${encodeURIComponent(churchId)}/calendar`}
          >
            Church calendar
          </Link>
          <Link
            className={portalLinkClass}
            href={`/platform/churches/${encodeURIComponent(churchId)}`}
          >
            Public church page
          </Link>
        </>
      )}
    </nav>
  );
}
export function CalendarRange({
  range,
  path,
  query,
  calendars,
  selected = []
}: {
  range: ReturnType<typeof monthRange>;
  path: string;
  query: CalendarQuery;
  calendars?: CalendarSummary[];
  selected?: string[];
}) {
  const href = (month: string) => {
    const p = new URLSearchParams({ month, timeZone: range.timeZone });
    if (query.cursor) p.set("cursor", query.cursor);
    if (calendars) {
      p.set("layers", "selected");
      for (const id of selected) p.append("layer", id);
    }
    return `${path}?${p}`;
  };
  return (
    <section
      aria-label="Calendar dates and layers"
      className="space-y-4 rounded-xl border border-gc-divider bg-gc-surface p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        {range.previous >= "2000-01" ? (
          <a href={href(range.previous)} className={portalLinkClass}>
            Previous month
          </a>
        ) : (
          <span />
        )}
        <h2 className="text-3xl">{range.label}</h2>
        {range.next <= "2099-12" && (
          <a href={href(range.next)} className={portalLinkClass}>
            Next month
          </a>
        )}
      </div>
      <form
        action={path}
        className="space-y-4"
        aria-label="Change calendar view"
      >
        {query.cursor && (
          <input type="hidden" name="cursor" value={query.cursor} />
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="font-semibold">
            Month
            <input
              name="month"
              type="month"
              required
              min="2000-01"
              max="2099-12"
              defaultValue={range.month}
              className={portalInputClass}
            />
          </label>
          <div>
            <label className="font-semibold">
              Viewing time zone
              <input
                name="timeZone"
                defaultValue={range.timeZone}
                required
                maxLength={100}
                className={portalInputClass}
              />
            </label>
            <DeviceZoneButton />
          </div>
        </div>
        {calendars && (
          <fieldset className="space-y-2">
            <legend className="mb-2 font-semibold">Calendar layers</legend>
            <input type="hidden" name="layers" value="selected" />
            {calendars.length ? (
              calendars.map((c) => (
                <label key={c.id} className="flex min-h-11 items-center gap-3">
                  <input
                    type="checkbox"
                    name="layer"
                    value={c.id}
                    defaultChecked={selected.includes(c.id)}
                    className="h-6 w-6 shrink-0 accent-gc-action"
                  />
                  <span>
                    {c.name}{" "}
                    <span className="text-sm text-gc-muted">
                      · {c.source.label}
                    </span>
                  </span>
                </label>
              ))
            ) : (
              <p className="text-gc-muted">
                No calendar layers are available here yet.
              </p>
            )}
          </fieldset>
        )}
        <button type="submit" className={portalButtonClass}>
          Update view
        </button>
      </form>
      <p className="text-sm text-gc-muted">
        Timed events use {range.timeZone}. All-day events keep their original
        dates.
      </p>
    </section>
  );
}
export function CalendarAgenda({
  events,
  timeZone,
  commitments = false,
  deviceLocal = false
}: {
  events: (CalendarEvent | Commitment)[];
  timeZone: string;
  commitments?: boolean;
  deviceLocal?: boolean;
}) {
  if (!events.length)
    return (
      <PortalEmpty>
        {commitments
          ? "No Going or Maybe responses in this month."
          : "No events in this month for the selected calendars."}
      </PortalEmpty>
    );
  return (
    <ol
      aria-label={commitments ? "Your commitments" : "Event agenda"}
      className="space-y-4"
    >
      {events.map((event) => (
        <li
          key={event.id}
          className="min-w-0 space-y-2 rounded-xl border border-gc-divider bg-gc-surface p-5 [overflow-wrap:anywhere]"
        >
          <p className="text-sm text-gc-muted">{event.source.label}</p>
          <h3 className="text-2xl">
            <Link
              className="text-gc-accent underline underline-offset-4"
              href={
                eventPath(event.id) +
                `?timeZone=${encodeURIComponent(timeZone)}`
              }
            >
              {event.title}
            </Link>
          </h3>
          {deviceLocal ? (
            <LocalEventTime event={event} rsvp />
          ) : (
            <p>{eventWhen(event, timeZone)}</p>
          )}
          {event.canceled && (
            <p className="font-semibold text-gc-error">
              Canceled · no new RSVPs
            </p>
          )}
          {event.location && <p>{event.location}</p>}
          {event.recurring && (
            <p className="text-sm text-gc-muted">
              Weekly event
              {event.isException
                ? " · this occurrence was edited separately"
                : ""}
            </p>
          )}
          {event.response && (
            <p className="text-sm">
              Your response:{" "}
              {responseLabels[event.response.state] ?? event.response.state}
            </p>
          )}
          {"conflict" in event && event.conflict && (
            <p className="rounded-lg border border-gc-divider p-3 text-sm">
              {event.conflict}
            </p>
          )}
          {commitments && event.response && (
            <CalendarForm
              operation="withdraw-response"
              payload={{
                occurrenceId: event.id,
                expectedVersion: event.response.version
              }}
              label="Withdraw my response"
            />
          )}
        </li>
      ))}
    </ol>
  );
}
export const responseLabels: Record<string, string> = {
  GOING: "Going",
  MAYBE: "Maybe",
  DECLINED: "Not going"
};
export type ShareSummary = {
  churchId: string;
  level: "BUSY" | "DETAILS";
  version: number;
  revoked: boolean;
};
export function CalendarSharing({
  kind,
  id,
  shares,
  churches,
  calendarShares = []
}: {
  kind: "calendar" | "event";
  id: string;
  shares: ShareSummary[];
  churches: { id: string; name: string }[];
  calendarShares?: ShareSummary[];
}) {
  return (
    <div className="space-y-5">
      <p className="text-gc-muted">
        {kind === "calendar"
          ? "Sharing a whole calendar includes its current and future events. You can share an individual event from its event page instead."
          : "This shares every occurrence of this event series. Other events on the calendar keep their own sharing choices."}{" "}
        Busy only reveals time and availability. Full details also reveals the
        title, notes, location, online link and organizer.
      </p>
      <p className="text-sm text-gc-muted">
        Calendar shares and event shares are independent. Ending one leaves the
        other active. Information already seen cannot be recalled.
      </p>
      {kind === "event" && calendarShares.some((s) => !s.revoked) && (
        <p className="rounded-lg border border-gc-divider p-3">
          This event is also covered by an active whole-calendar share. Manage
          that share on its calendar page.
        </p>
      )}
      {!churches.length && (
        <PortalEmpty>
          An approved church connection is needed before you can share.
        </PortalEmpty>
      )}
      {churches.map((church) => {
        const prior = shares.find((s) => s.churchId === church.id);
        const payload = {
          [kind === "calendar" ? "calendarId" : "eventId"]: id,
          churchId: church.id,
          expectedVersion: prior?.version ?? 0
        };
        return (
          <section
            key={church.id}
            className="space-y-4 rounded-lg border border-gc-divider p-4"
          >
            <h3 className="text-2xl">{church.name}</h3>
            <p>
              Current {kind} sharing:{" "}
              {prior && !prior.revoked
                ? prior.level === "BUSY"
                  ? "Busy only"
                  : "Full details"
                : "Off"}
            </p>
            <CalendarForm
              operation={`share-${kind}`}
              payload={payload}
              label={`Save ${kind} sharing with ${church.name}`}
              confirmation={`Share this ${kind === "calendar" ? "whole calendar" : "event series"} with approved members of ${church.name} at the level selected above.`}
            >
              <CalendarFields
                fields={[
                  {
                    name: "level",
                    label: "Information to share",
                    type: "select",
                    value: prior && !prior.revoked ? prior.level : "BUSY",
                    options: [
                      { value: "BUSY", label: "Busy only" },
                      { value: "DETAILS", label: "Full event details" }
                    ]
                  }
                ]}
              />
            </CalendarForm>
            {prior && !prior.revoked && (
              <CalendarForm
                operation={`revoke-${kind}-share`}
                payload={payload}
                label={`End ${kind} sharing with ${church.name}`}
              />
            )}
          </section>
        );
      })}
    </div>
  );
}
