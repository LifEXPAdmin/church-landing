import { randomUUID } from "node:crypto";
import {
  CALENDAR_LAYER_COLORS,
  calendarLayerColor
} from "@/lib/platform/calendar-layer-options";
import { RegionalEventTime } from "./regional-presentation";
import Link from "next/link";
import type {
  getCalendarAgenda,
  getCalendarCommitments,
  getCalendars
} from "@/lib/platform/calendar-reads";
import {
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
import { CalendarSharingPreview } from "./calendar-sharing-preview";

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
export function CalendarChurchScope({
  source,
  canEdit,
  canPublish
}: {
  source: CalendarSummary["source"];
  canEdit?: boolean;
  canPublish?: boolean;
}) {
  if (source.kind !== "CHURCH" || (!canEdit && !canPublish)) return null;
  return (
    <section
      id="calendar-administration"
      aria-label="Church calendar administration"
      className="space-y-3 rounded-xl border border-gc-divider p-5"
    >
      <h2 className="text-2xl">Church calendar administration</h2>
      <p className="font-semibold">Selected church: {source.label}</p>
      <p>Your current permissions for this calendar or event:</p>
      <ul className="list-inside list-disc">
        {canEdit && <li>Calendar editor: Edit details</li>}
        {canPublish && <li>Event publisher: Publish event audiences</li>}
      </ul>
      <p>
        Editing and publishing are separate duties. Personal calendar settings
        cannot grant either duty or change an existing event’s audience.
      </p>
      <Link
        className={portalLinkClass}
        href={`/platform/churches/${encodeURIComponent(source.churchId)}/responsibilities`}
      >
        My roles and permissions at {source.label}
      </Link>
    </section>
  );
}
export function CalendarLayerChoices({
  calendar,
  destination
}: {
  calendar: CalendarSummary;
  destination: string;
}) {
  const layer = calendar.layer,
    color = calendarLayerColor(layer.color)!;
  return (
    <details className="my-3 min-w-0 rounded-xl border border-gc-divider p-4">
      <summary className="cursor-pointer font-semibold">
        My choices for {calendar.name}
      </summary>
      <div className="mt-4 min-w-0 space-y-4">
        <p>
          {layer.followed
            ? layer.visible
              ? "Following · shown in My calendars"
              : "Following · hidden from My calendars"
            : "Not following · removed from My calendars"}{" "}
          · {color.label} color
        </p>
        <p className="text-sm text-gc-muted">
          These choices are private to your account and carry across sign-ins.
          Following does not join a church, expand access, change an RSVP or
          send notifications. You can still open an available calendar directly.
        </p>
        {layer.recoveryRequired && (
          <p role="status">
            This layer was turned off during recovery. Review and save your
            choices before showing it again.
          </p>
        )}
        <CalendarForm
          operation="save-layer"
          payload={{
            calendarId: calendar.id,
            expectedVersion: layer.version,
            requestKey: randomUUID()
          }}
          label={`Save my choices for ${calendar.name}`}
          destination={destination}
          fields={[
            {
              name: "followed",
              type: "checkbox",
              label: "Follow this calendar",
              value: layer.followed,
              hint: "Unfollow to remove this calendar from your saved overlay."
            },
            {
              name: "visible",
              type: "checkbox",
              label: "Show in My calendars",
              value: layer.visible,
              hint: "Hide without unfollowing. This applies when following is on."
            },
            {
              name: "color",
              type: "select",
              label: "My calendar color",
              value: layer.color,
              options: [...CALENDAR_LAYER_COLORS]
            }
          ]}
        />
      </div>
    </details>
  );
}
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
    const p = new URLSearchParams({
      month,
      timeZone: range.timeZone,
      mode: query.mode ?? "AGENDA",
      zoneMode: query.zoneMode ?? "FIXED"
    });
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
        <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="min-w-0 font-semibold">
            Month
            <input
              name="month"
              type="month"
              required
              min="2000-01"
              max="2099-12"
              defaultValue={range.month}
              className={portalInputClass + " min-w-0 max-w-full"}
            />
          </label>
          <label className="min-w-0 font-semibold">
            Calendar view
            <select
              name="mode"
              defaultValue={query.mode ?? "AGENDA"}
              className={portalInputClass}
            >
              <option value="AGENDA">Agenda</option>
              <option value="MONTH">Month</option>
            </select>
          </label>
          <label className="min-w-0 font-semibold">
            Viewing time zone behavior
            <select
              name="zoneMode"
              defaultValue={query.zoneMode ?? "FIXED"}
              className={portalInputClass}
            >
              <option value="FIXED">Use a fixed time zone</option>
              <option value="DEVICE">Follow this device’s time zone</option>
            </select>
          </label>
          <div className="min-w-0">
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
            <p className="text-sm text-gc-muted">
              This view is temporary. Save following, visibility and colors
              under Available calendars to use them across sign-ins.
            </p>
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
        {query.zoneMode === "DEVICE"
          ? "Following this device’s time zone"
          : "Fixed viewing time zone"}
        : {range.timeZone}. All-day events keep their original dates. These view
        controls are temporary. Save defaults in Calendar Settings.
      </p>
    </section>
  );
}
export function CalendarAgenda({
  events,
  timeZone,
  commitments = false,
  deviceLocal = false,
  layerColors = {}
}: {
  events: (CalendarEvent | Commitment)[];
  timeZone: string;
  commitments?: boolean;
  deviceLocal?: boolean;
  layerColors?: Record<string, string>;
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
          id={`calendar-event-${event.id}`}
          className="min-w-0 space-y-2 rounded-xl border border-gc-divider bg-gc-surface p-5 [overflow-wrap:anywhere]"
        >
          <p className="text-sm text-gc-muted">
            {event.source.label}
            {calendarLayerColor(layerColors[event.calendarId]) && (
              <span className="ml-2 inline-flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className="inline-block h-3 w-3 rounded-full"
                  style={{
                    backgroundColor: calendarLayerColor(
                      layerColors[event.calendarId]
                    )!.swatch
                  }}
                />
                {calendarLayerColor(layerColors[event.calendarId])!.label} layer
              </span>
            )}
          </p>
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
            <p>{<RegionalEventTime event={event} timeZone={timeZone} />}</p>
          )}
          {event.canceled && (
            <p className="font-semibold text-gc-error">
              Canceled · no new RSVPs
            </p>
          )}
          {event.location && <p>{event.location}</p>}
          {!event.canceled &&
            (event.canPublish ||
              (event.source.kind === "PERSONAL" && event.canEdit)) && (
              <Link
                className={portalLinkClass}
                href={`${eventPath(event.id)}?timeZone=${encodeURIComponent(timeZone)}#event-privacy`}
              >
                Manage event privacy
              </Link>
            )}
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
  calendarShares = [],
  previewEvent,
  timeZone = "UTC"
}: {
  kind: "calendar" | "event";
  id: string;
  shares: ShareSummary[];
  churches: { id: string; name: string }[];
  calendarShares?: ShareSummary[];
  previewEvent?: CalendarEvent;
  timeZone?: string;
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
      {!!churches.length && (
        <CalendarSharingPreview
          event={previewEvent}
          timeZone={timeZone}
          wholeCalendar={kind === "calendar"}
        />
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
