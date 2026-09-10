import { randomUUID } from "node:crypto";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { PortalError } from "@/lib/platform/portal";
import { getCurrentPlatformUser } from "@/lib/platform/session";
import {
  readCalendars,
  readCalendar,
  readCalendarAgenda,
  readCalendarCommitments
} from "@/lib/platform/calendar-session";
import { getPublicChurchAgenda } from "@/lib/platform/calendar-reads";
import { calendarZone } from "@/lib/platform/calendar-time";
import { monthRange, type CalendarQuery } from "@/lib/platform/calendar-view";
import { PlatformShell } from "./platform-shell";
import { GuestAccountPrompt } from "./guest-account-prompt";
import { PortalCard, PortalHeading, portalLinkClass } from "./portal-ui";
import { CalendarForm, CalendarEventForm } from "./calendar-form";
import { VolunteerCommitments } from "./post-participation-form";
import {
  CalendarNavigation,
  CalendarRange,
  CalendarAgenda,
  CalendarSharing,
  calendarPath
} from "./calendar-presentation";

export function CalendarUnavailable({
  message = "This calendar is unavailable. Your access may have changed, or the service may be temporarily unavailable."
}: {
  message?: string;
}) {
  return (
    <section className="container-shell space-y-4 py-8">
      <PortalHeading title="Calendar unavailable" description={message} />
      <div className="flex flex-wrap gap-x-5 gap-y-2">
        <Link className={portalLinkClass} href="/platform/calendars">
          My calendars
        </Link>
        <Link className={portalLinkClass} href="/platform/my-church">
          My church and account eligibility
        </Link>
        <Link className={portalLinkClass} href="/platform/churches">
          Browse public churches
        </Link>
      </div>
    </section>
  );
}
export function CalendarDevelopment() {
  return (
    <PlatformShell user={null}>
      <section className="container-shell py-8">
        <PortalHeading
          title="Open the calendar production preview"
          description="Private calendar pages use the isolated production preview so development diagnostics cannot contain personal events or account information."
        />
      </section>
    </PlatformShell>
  );
}
export async function CalendarPage({
  view,
  id,
  query = {}
}: {
  view: "calendars" | "calendar" | "church" | "commitments";
  id?: string;
  query?: CalendarQuery;
}) {
  if (process.env.NODE_ENV !== "production") return <CalendarDevelopment />;
  const path =
    view === "church"
      ? `/platform/churches/${encodeURIComponent(id ?? "")}/calendar`
      : view === "calendar"
        ? calendarPath(id ?? "")
        : view === "commitments"
          ? "/platform/commitments"
          : "/platform/calendars";
  const user = await getCurrentPlatformUser();
  if (!user && view !== "church")
    return (
      <PlatformShell user={null}>
        <GuestAccountPrompt next={path} reason="calendar" />
      </PlatformShell>
    );
  try {
    const range = monthRange(
      query.month,
      calendarZone(query.timeZone ?? "UTC")
    );
    if (view === "commitments") {
      const result = await readCalendarCommitments(range);
      return (
        <PlatformShell user={user}>
          <section
            key={path}
            className="container-shell min-w-0 space-y-6 py-8"
          >
            <PortalHeading
              title="My commitments"
              description="Your event responses and volunteer reservations, with private conflict hints visible only to you. Canceled events stay clearly marked."
            />
            <CalendarNavigation />
            <CalendarRange range={range} path={path} query={query} />
            <CalendarAgenda
              events={result.commitments}
              timeZone={range.timeZone}
              commitments
            />
            <VolunteerCommitments
              rows={result.volunteerCommitments}
              timeZone={range.timeZone}
            />
          </section>
        </PlatformShell>
      );
    }
    if (view === "calendar") {
      const { calendar, churches } = await readCalendar(id ?? "");
      const agenda = await readCalendarAgenda({
        ...range,
        calendarIds: [calendar.id]
      });
      return (
        <PlatformShell user={user}>
          <section
            key={path}
            className="container-shell min-w-0 space-y-6 py-8 [overflow-wrap:anywhere]"
          >
            <PortalHeading
              title={calendar.name}
              description={`${calendar.source.label} · ${calendar.own ? "Your personal calendar. Choose explicitly what to share." : "Events are shown according to your current access."}`}
            />
            <CalendarNavigation churchId={calendar.source.churchId} />
            <CalendarRange range={range} path={path} query={query} />
            <CalendarAgenda events={agenda.events} timeZone={range.timeZone} />
            {calendar.canEdit && (
              <div className="max-w-3xl space-y-6">
                <PortalCard title="Create an event">
                  <p>
                    {calendar.own
                      ? "This event starts private and follows any whole-calendar sharing you have enabled."
                      : "Events start as private drafts. A church publisher can make them visible to approved members or everyone."}
                  </p>
                  <CalendarEventForm
                    create
                    canPublish={calendar.canPublish}
                    payload={{
                      calendarId: calendar.id,
                      expectedVersion: calendar.version,
                      requestKey: randomUUID()
                    }}
                    draft={{
                      title: "",
                      description: "",
                      location: "",
                      onlineUrl: "",
                      organizer: "",
                      allDay: false,
                      timeZone: calendar.timeZone ?? range.timeZone,
                      startLocal: range.from + "T09:00",
                      endLocal: range.from + "T10:00",
                      weeklyUntil: null
                    }}
                  />
                </PortalCard>
                <PortalCard title="Calendar settings">
                  <CalendarForm
                    operation="rename-calendar"
                    payload={{
                      calendarId: calendar.id,
                      expectedVersion: calendar.version
                    }}
                    label="Save calendar settings"
                    fields={[
                      {
                        name: "name",
                        label: "Calendar name",
                        value: calendar.name,
                        maxLength: 100,
                        required: true
                      },
                      {
                        name: "timeZone",
                        label: "Default time zone for new events",
                        value: calendar.timeZone,
                        maxLength: 100,
                        required: true,
                        hint: "Existing events keep their saved time zones and times."
                      }
                    ]}
                  />
                </PortalCard>
                {calendar.own && (
                  <PortalCard title="Share this calendar">
                    <CalendarSharing
                      kind="calendar"
                      id={calendar.id}
                      shares={calendar.shares ?? []}
                      churches={churches}
                    />
                  </PortalCard>
                )}
                <details className="rounded-xl border border-gc-divider p-5">
                  <summary className="min-h-11 cursor-pointer py-2 font-semibold">
                    Archive calendar
                  </summary>
                  <p className="my-4 text-sm text-gc-muted">
                    First cancel every active event series. Archived calendars
                    disappear from normal views.
                  </p>
                  <CalendarForm
                    operation="archive-calendar"
                    payload={{
                      calendarId: calendar.id,
                      expectedVersion: calendar.version
                    }}
                    label="Archive calendar"
                    destination="/platform/calendars"
                    confirmation="Archive this calendar after its events have been canceled."
                  />
                </details>
              </div>
            )}
          </section>
        </PlatformShell>
      );
    }
    let publicAgenda:
      | Awaited<ReturnType<typeof getPublicChurchAgenda>>
      | undefined;
    let listing: Awaited<ReturnType<typeof readCalendars>> | undefined;
    if (view === "church") {
      publicAgenda = await getPublicChurchAgenda(prisma, {
        ...range,
        churchId: id ?? ""
      });
      if (user) {
        try {
          listing = await readCalendars({ churchId: id, cursor: query.cursor });
        } catch (error) {
          if (
            !(error instanceof PortalError) ||
            ![401, 403].includes(error.status)
          )
            throw error;
        }
      }
    } else listing = await readCalendars({ cursor: query.cursor });
    const selected =
      query.layers === "selected"
        ? Array.isArray(query.layer)
          ? query.layer
          : query.layer
            ? [query.layer]
            : []
        : (listing?.calendars.map((c) => c.id) ?? []);
    // A supplied stale/foreign layer must fail through the authoritative reader;
    // silently ignoring it would hide a revoked-access state from the viewer.
    const events = listing
      ? (await readCalendarAgenda({ ...range, calendarIds: selected })).events
      : publicAgenda!.events;
    const title = publicAgenda
      ? `${publicAgenda.church.name} calendar`
      : "My calendars";
    return (
      <PlatformShell user={user}>
        <section
          key={path}
          className="container-shell min-w-0 space-y-6 py-8 [overflow-wrap:anywhere]"
        >
          <PortalHeading
            title={title}
            description={
              listing
                ? "Choose personal, church and shared calendars for your agenda. Busy-only layers reveal availability without private event details."
                : "Public church events are open to everyone. Join or sign in when you want to respond or see calendars shared with your approved church."
            }
          />
          <CalendarNavigation churchId={publicAgenda?.church.id} />
          <CalendarRange
            range={range}
            path={path}
            query={query}
            calendars={listing?.calendars}
            selected={selected}
          />
          <CalendarAgenda events={events} timeZone={range.timeZone} />
          {listing && (
            <>
              <PortalCard title="Available calendars">
                <ul className="space-y-3">
                  {listing.calendars.map((c) => (
                    <li key={c.id}>
                      <Link
                        className={portalLinkClass}
                        href={calendarPath(c.id)}
                      >
                        {c.name}
                      </Link>
                      <p className="text-sm text-gc-muted">
                        {c.source.label} ·{" "}
                        {c.canEdit ? "Can edit" : "View access"}
                        {c.canPublish ? " · Can publish" : ""}
                      </p>
                    </li>
                  ))}
                </ul>
                {listing.cursor && (
                  <a
                    href={`${path}?${new URLSearchParams({ cursor: listing.cursor, month: range.month, timeZone: range.timeZone })}`}
                    className={portalLinkClass}
                  >
                    More calendar layers
                  </a>
                )}
                {query.cursor && (
                  <a
                    href={`${path}?${new URLSearchParams({ month: range.month, timeZone: range.timeZone })}`}
                    className={portalLinkClass}
                  >
                    First calendar layers
                  </a>
                )}
              </PortalCard>
              {(view === "calendars" ||
                listing.churches.some((c) => c.id === id && c.canCreate)) && (
                <div className="max-w-2xl">
                  <PortalCard title="Create a calendar">
                    <p className="text-gc-muted">
                      Personal calendars are private until you choose to share.
                      Church calendars use separate editing and publication
                      permissions.
                    </p>
                    <CalendarForm
                      operation="create-calendar"
                      payload={{ requestKey: randomUUID() }}
                      label="Create calendar"
                      destination="calendar"
                      fields={[
                        {
                          name: "name",
                          label: "Calendar name",
                          required: true,
                          maxLength: 100
                        },
                        {
                          name: "churchId",
                          label: "Calendar owner",
                          type: "select",
                          value: view === "church" ? id : "",
                          options: [
                            { value: "", label: "Me · personal calendar" },
                            ...listing.churches
                              .filter((c) => c.canCreate)
                              .map((c) => ({
                                value: c.id,
                                label: c.name + " · church calendar"
                              }))
                          ]
                        },
                        {
                          name: "timeZone",
                          label: "Default event time zone",
                          value: range.timeZone,
                          required: true,
                          maxLength: 100,
                          hint: "For example America/Chicago, Europe/London or Pacific/Auckland."
                        }
                      ]}
                    />
                  </PortalCard>
                </div>
              )}
            </>
          )}
        </section>
      </PlatformShell>
    );
  } catch (error) {
    return (
      <PlatformShell user={user}>
        <CalendarUnavailable
          message={
            error instanceof PortalError && [400, 409].includes(error.status)
              ? error.message
              : undefined
          }
        />
      </PlatformShell>
    );
  }
}
