import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { PortalError } from "@/lib/platform/portal";
import { getCurrentPlatformUser } from "@/lib/platform/session";
import { readCalendarEvent } from "@/lib/platform/calendar-session";
import { getPublicCalendarEvent } from "@/lib/platform/calendar-reads";
import { calendarZone } from "@/lib/platform/calendar-time";
import { eventWhen } from "@/lib/platform/calendar-view";
import { accountEntryHref } from "@/lib/platform/account-entry";
import { PlatformShell } from "./platform-shell";
import { PortalCard, PortalHeading, portalLinkClass } from "./portal-ui";
import {
  CalendarForm,
  CalendarEventForm,
  type EventDraft
} from "./calendar-form";
import {
  CalendarNavigation,
  CalendarSharing,
  eventPath,
  calendarPath,
  responseLabels
} from "./calendar-presentation";
import { CalendarDevelopment, CalendarUnavailable } from "./calendar-page";

export async function CalendarEventPage({
  id,
  timeZone
}: {
  id: string;
  timeZone?: string;
}) {
  if (process.env.NODE_ENV !== "production") return <CalendarDevelopment />;
  const user = await getCurrentPlatformUser();
  let privateData: Awaited<ReturnType<typeof readCalendarEvent>> | undefined;
  try {
    if (user) {
      try {
        privateData = await readCalendarEvent(id);
      } catch (error) {
        if (
          !(error instanceof PortalError) ||
          ![401, 403].includes(error.status)
        )
          throw error;
      }
    }
    const event =
      privateData?.event ?? (await getPublicCalendarEvent(prisma, id)).event;
    if (!event) throw new PortalError(404, "Event unavailable.");
    const zone = calendarZone(timeZone ?? event.timeZone);
    const draft: EventDraft | undefined = event.version
      ? {
          title: event.title,
          description: event.description ?? "",
          location: event.location ?? "",
          onlineUrl: event.onlineUrl ?? "",
          organizer: event.organizer ?? "",
          allDay: event.allDay,
          timeZone: event.timeZone,
          startLocal: event.startLocal,
          endLocal: event.endLocal,
          weeklyUntil: null
        }
      : undefined;
    const editing = {
      eventId: event.eventId,
      occurrenceId: event.id,
      expectedVersion: event.eventVersion,
      occurrenceVersion: event.version
    };
    return (
      <PlatformShell user={user}>
        <section
          key={id}
          className="container-shell min-w-0 space-y-6 py-8 [overflow-wrap:anywhere]"
        >
          <PortalHeading title={event.title} description={event.source.label} />
          <CalendarNavigation churchId={event.source.churchId} />
          {privateData && (
            <Link
              className={portalLinkClass}
              href={calendarPath(event.calendarId)}
            >
              View this calendar and its sharing
            </Link>
          )}
          <PortalCard title="Event details">
            <p>{eventWhen(event, zone)}</p>
            {!event.allDay && (
              <p className="text-sm text-gc-muted">
                Viewing in {zone}. Event time zone: {event.timeZone}.
              </p>
            )}
            {event.canceled && (
              <p className="font-semibold text-gc-error">
                Canceled · this occurrence is no longer accepting RSVPs.
              </p>
            )}
            {event.access === "BUSY" ? (
              <p>
                Only this busy period is shared with you. Its title, notes,
                location and organizer are private.
              </p>
            ) : (
              <>
                <p className="whitespace-pre-wrap">
                  {event.description || "No description has been added."}
                </p>
                {event.location && <p>Location: {event.location}</p>}
                {event.onlineUrl && (
                  <a
                    href={event.onlineUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={portalLinkClass}
                  >
                    Open online event
                  </a>
                )}
                {event.organizer && <p>Organizer: {event.organizer}</p>}
                <p className="text-sm text-gc-muted">
                  {event.visibility === "PUBLIC"
                    ? "Visible to everyone"
                    : event.visibility === "CHURCH"
                      ? "Visible to approved church members"
                      : event.source.kind === "CHURCH"
                        ? "Private draft · calendar editors and publishers"
                        : "Personal event · shared only through its chosen calendar or event audience"}
                  {event.recurring ? " · Weekly series" : ""}
                  {event.isException
                    ? " · This occurrence has individual edits"
                    : ""}
                </p>
              </>
            )}
          </PortalCard>
          {privateData && privateData.occurrences.length > 1 && (
            <details className="rounded-xl border border-gc-divider p-5">
              <summary className="min-h-11 cursor-pointer py-2 font-semibold">
                Occurrences in this series ({privateData.occurrences.length})
              </summary>
              <ul className="grid gap-2 sm:grid-cols-2">
                {privateData.occurrences.map((row) => (
                  <li key={row.id}>
                    <Link
                      className={portalLinkClass}
                      href={eventPath(row.id)}
                      aria-current={row.id === id ? "page" : undefined}
                    >
                      {row.startLocal.replace("T", " · ")}
                      {row.canceled ? " · Canceled" : ""}
                    </Link>
                  </li>
                ))}
              </ul>
            </details>
          )}
          {!event.canceled && event.version && (
            <PortalCard title="Your response">
              {privateData ? (
                <>
                  <p>
                    {event.response
                      ? `Current response: ${responseLabels[event.response.state] ?? event.response.state}`
                      : "You have not responded to this occurrence."}
                  </p>
                  <CalendarForm
                    operation="rsvp"
                    payload={{
                      eventId: event.eventId,
                      occurrenceId: event.id,
                      occurrenceVersion: event.version,
                      expectedVersion: event.response?.version ?? 0
                    }}
                    label="Save my RSVP"
                    fields={[
                      {
                        name: "state",
                        label: "RSVP for this occurrence",
                        type: "select",
                        value: event.response?.state ?? "MAYBE",
                        options: [
                          { value: "GOING", label: "Going" },
                          { value: "MAYBE", label: "Maybe" },
                          { value: "DECLINED", label: "Not going" }
                        ]
                      }
                    ]}
                  />
                </>
              ) : (
                <>
                  <p>
                    {user
                      ? "Verify your email and confirm adult eligibility before responding."
                      : "You can read public events freely. Join or sign in to respond."}
                  </p>
                  <div className="flex flex-wrap gap-x-5 gap-y-2">
                    <Link
                      className={portalLinkClass}
                      href={
                        user
                          ? "/platform/my-church"
                          : accountEntryHref("signup", eventPath(id), "calendar")
                      }
                    >
                      {user ? "Review account eligibility" : "Join to respond"}
                    </Link>
                    {!user && (
                      <Link
                        className={portalLinkClass}
                        href={accountEntryHref("login", eventPath(id), "calendar")}
                      >
                        Sign in
                      </Link>
                    )}
                  </div>
                </>
              )}
            </PortalCard>
          )}
          {privateData && event.canEdit && draft && !event.canceled && (
            <div className="max-w-3xl space-y-6">
              <PortalCard title="Edit this occurrence">
                <p>
                  This changes only the occurrence shown above. Its existing
                  RSVPs remain attached.
                </p>
                <CalendarEventForm
                  payload={{ ...editing, scope: "OCCURRENCE" }}
                  draft={draft}
                />
              </PortalCard>
              {privateData.series && event.recurring && (
                <details className="rounded-xl border border-gc-divider p-5">
                  <summary className="min-h-11 cursor-pointer py-2 font-semibold">
                    Edit the whole series
                  </summary>
                  <div className="mt-4 space-y-4">
                    <p>
                      Current saved series: {privateData.series.title},{" "}
                      {privateData.series.startLocal.replace("T", " ")} to{" "}
                      {privateData.series.endLocal.replace("T", " ")}, weekly
                      through {privateData.series.weeklyUntil} (
                      {privateData.series.timeZone}). Review this saved version
                      before applying your entries to the series.
                    </p>
                    <CalendarEventForm
                      series
                      payload={{ ...editing, scope: "SERIES" }}
                      draft={privateData.series}
                    />
                  </div>
                </details>
              )}
              <PortalCard title="Cancel an event">
                <CalendarForm
                  operation="cancel-event"
                  payload={editing}
                  label="Cancel selected event scope"
                  fields={[
                    {
                      name: "scope",
                      label: "What should be canceled?",
                      type: "select",
                      value: "OCCURRENCE",
                      options: [
                        { value: "OCCURRENCE", label: "Only this occurrence" },
                        {
                          value: "SERIES",
                          label: "Every occurrence in this series"
                        }
                      ]
                    }
                  ]}
                  confirmation="Cancel the selected occurrence or series. Existing responses will show the cancellation."
                />
              </PortalCard>
            </div>
          )}
          {privateData && event.canPublish && !event.canceled && (
            <PortalCard title="Church publication">
              <p>
                Choose who can read the entire event series. Publishing
                permission is separate from permission to edit its details.
              </p>
              <CalendarForm
                operation="set-visibility"
                payload={{
                  eventId: event.eventId,
                  expectedVersion: event.eventVersion
                }}
                label="Save event audience"
                fields={[
                  {
                    name: "visibility",
                    label: "Event series audience",
                    type: "select",
                    value: event.visibility,
                    options: [
                      {
                        value: "PRIVATE",
                        label: "Private draft · calendar editors and publishers"
                      },
                      { value: "CHURCH", label: "Approved church members" },
                      { value: "PUBLIC", label: "Everyone, including guests" }
                    ]
                  }
                ]}
                confirmation="Apply this audience to the entire event series."
              />
            </PortalCard>
          )}
          {privateData?.shares && (
            <PortalCard title="Share this event">
              <CalendarSharing
                kind="event"
                id={event.eventId}
                shares={privateData.shares}
                calendarShares={privateData.calendarShares}
                churches={privateData.churches}
              />
            </PortalCard>
          )}
        </section>
      </PlatformShell>
    );
  } catch (error) {
    return (
      <PlatformShell user={user}>
        <CalendarUnavailable
          message={
            error instanceof PortalError && error.status === 400
              ? error.message
              : "This event is unavailable to your current account. Guests can read events that a church has published for everyone."
          }
        />
        {!user && (
          <div className="container-shell flex flex-wrap gap-5 pb-8">
            <Link
              className={portalLinkClass}
              href={accountEntryHref("signup", eventPath(id), "calendar")}
            >
              Join to check shared event access
            </Link>
            <Link
              className={portalLinkClass}
              href={accountEntryHref("login", eventPath(id), "calendar")}
            >
              Sign in
            </Link>
          </div>
        )}
      </PlatformShell>
    );
  }
}
