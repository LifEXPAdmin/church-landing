import { randomUUID } from "node:crypto";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { PortalError } from "@/lib/platform/portal";
import { safeAccountReturn } from "@/lib/platform/account-entry";
import { getCurrentPlatformUser } from "@/lib/platform/session";
import {
  readCalendars,
  readCalendar,
  readCalendarAgenda,
  readCalendarCommitments
} from "@/lib/platform/calendar-session";
import { getPublicChurchAgenda } from "@/lib/platform/calendar-reads";
import { calendarZone } from "@/lib/platform/calendar-time";
import {
  monthRange,
  calendarDisplayView,
  type CalendarQuery
} from "@/lib/platform/calendar-view";
import { calendarDisplayPreferences } from "@/lib/platform/calendar-display";
import { CalendarDeviceZone } from "./calendar-device-zone";
import { CalendarDisplay } from "./calendar-month";
import { PlatformShell } from "./platform-shell";
import { GuestAccountPrompt } from "./guest-account-prompt";
import { PortalCard, PortalHeading, portalLinkClass } from "./portal-ui";
import { CalendarForm, CalendarEventForm } from "./calendar-form";
import { VolunteerCommitments } from "./post-participation-form";
import { CalendarSnapshot, calendarReadUrl } from "./calendar-snapshot";
import {
  CalendarNavigation,
  CalendarRange,
  CalendarSharing,
  CalendarLayerChoices,
  CalendarChurchScope,
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
          ? safeAccountReturn(
              "/platform/commitments" +
                (typeof query.signup === "string"
                  ? "?" + new URLSearchParams({ signup: query.signup })
                  : "")
            )
          : "/platform/calendars";
  const user = await getCurrentPlatformUser();
  if (!user && view !== "church")
    return (
      <PlatformShell user={null} signInReturnTo={path}>
        <GuestAccountPrompt next={path} reason="calendar" />
      </PlatformShell>
    );
  try {
    const display = calendarDisplayView(
      query,
      calendarDisplayPreferences(user)
    );
    const range = monthRange(query.month, calendarZone(display.timeZone));
    query = { ...query, mode: display.mode, zoneMode: display.zoneMode };
    const viewParams = {
      month: range.month,
      timeZone: range.timeZone,
      mode: display.mode,
      zoneMode: display.zoneMode
    };
    const agendaParams = new URLSearchParams({ ...viewParams, mode: "AGENDA" });
    if (query.cursor) agendaParams.set("cursor", query.cursor);
    if (query.layers === "selected") {
      agendaParams.set("layers", "selected");
      for (const layer of Array.isArray(query.layer)
        ? query.layer
        : query.layer
          ? [query.layer]
          : [])
        agendaParams.append("layer", layer);
    }
    const agendaHref = `${path.split("?")[0]}?${agendaParams}`;
    const rangeQuery = {
      from: range.from,
      until: range.until,
      timeZone: range.timeZone
    };
    if (view === "commitments") {
      const result = await readCalendarCommitments({
        ...range,
        signup: query.signup
      });
      return (
        <PlatformShell user={user}>
          <CalendarDeviceZone
            key={`${path}:${range.month}:${display.zoneMode}:${range.timeZone}`}
            enabled={display.zoneMode === "DEVICE"}
            timeZone={range.timeZone}
          >
            <CalendarSnapshot
              owner={user?.id}
              url={calendarReadUrl("commitments", {
                ...rangeQuery,
                signup: query.signup
              })}
              snapshot={result}
              label="commitments"
            >
              <section
                key={path}
                className="container-shell min-w-0 space-y-6 py-8"
              >
                <PortalHeading
                  title="My commitments"
                  description="Your event responses and volunteer reservations, with private conflict hints visible only to you. Canceled events stay clearly marked."
                />
                <CalendarNavigation />
                {query.signup ? (
                  <a href="/platform/commitments" className="underline">
                    All my commitments
                  </a>
                ) : (
                  <CalendarRange range={range} path={path} query={query} />
                )}
                {!query.signup && (
                  <CalendarDisplay
                    events={result.commitments}
                    range={range}
                    mode={display.mode}
                    weekStart={display.weekStart}
                    agendaHref={agendaHref}
                    commitments
                  />
                )}
                <VolunteerCommitments
                  rows={result.volunteerCommitments}
                  timeZone={range.timeZone}
                />
              </section>
            </CalendarSnapshot>
          </CalendarDeviceZone>
        </PlatformShell>
      );
    }
    if (view === "calendar") {
      const result = await readCalendar(id ?? "");
      const { calendar, churches } = result;
      const agenda = await readCalendarAgenda({
        ...range,
        calendarIds: [calendar.id]
      });
      return (
        <PlatformShell user={user}>
          <CalendarDeviceZone
            key={`${path}:${range.month}:${display.zoneMode}:${range.timeZone}`}
            enabled={display.zoneMode === "DEVICE"}
            timeZone={range.timeZone}
          >
            <CalendarSnapshot
              owner={user?.id}
              url={calendarReadUrl("calendar", { calendarId: calendar.id })}
              snapshot={result}
              label="calendar"
            >
              <section
                key={path}
                className="container-shell min-w-0 space-y-6 py-8 [overflow-wrap:anywhere]"
              >
                <PortalHeading
                  title={calendar.name}
                  description={`${calendar.source.label} · ${calendar.own ? "Your personal calendar. Choose explicitly what to share." : "Events are shown according to your current access."}`}
                />
                <CalendarNavigation churchId={calendar.source.churchId} />
                <CalendarChurchScope
                  source={calendar.source}
                  canEdit={calendar.canEdit}
                  canPublish={calendar.canPublish}
                />
                <CalendarLayerChoices
                  calendar={calendar}
                  destination={`/platform/calendars?${new URLSearchParams({ ...viewParams })}`}
                />
                <CalendarRange range={range} path={path} query={query} />
                <CalendarSnapshot
                  owner={user?.id}
                  url={calendarReadUrl("agenda", {
                    ...rangeQuery,
                    calendarId: [calendar.id]
                  })}
                  snapshot={agenda}
                  label="calendar agenda"
                >
                  <CalendarDisplay
                    events={agenda.events}
                    range={range}
                    mode={display.mode}
                    weekStart={display.weekStart}
                    agendaHref={agendaHref}
                    layerColors={{ [calendar.id]: calendar.layer.color }}
                  />
                </CalendarSnapshot>
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
                          previewEvent={agenda.events.find(
                            (event) => !event.canceled
                          )}
                          timeZone={range.timeZone}
                        />
                      </PortalCard>
                    )}
                    <details className="rounded-xl border border-gc-divider p-5">
                      <summary className="min-h-11 cursor-pointer py-2 font-semibold">
                        Archive calendar
                      </summary>
                      <p className="my-4 text-sm text-gc-muted">
                        First cancel every active event series. Archived
                        calendars disappear from normal views.
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
            </CalendarSnapshot>
          </CalendarDeviceZone>
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
        : (listing?.calendars
            .filter(
              (c) =>
                view !== "calendars" ||
                (c.layer.followed &&
                  c.layer.visible &&
                  !c.layer.recoveryRequired)
            )
            .map((c) => c.id) ?? []);
    // A supplied stale/foreign layer must fail through the authoritative reader;
    // silently ignoring it would hide a revoked-access state from the viewer.
    const savedViewPath = `/platform/calendars?${new URLSearchParams({ ...viewParams, ...(view === "calendars" && query.cursor ? { cursor: query.cursor } : {}) })}`;
    const agenda = listing
      ? await readCalendarAgenda({ ...range, calendarIds: selected })
      : undefined;
    const events = agenda?.events ?? publicAgenda!.events;
    const title = publicAgenda
      ? `${publicAgenda.church.name} calendar`
      : "My calendars";
    return (
      <PlatformShell user={user}>
        <CalendarDeviceZone
          key={`${path}:${range.month}:${display.zoneMode}:${range.timeZone}`}
          enabled={display.zoneMode === "DEVICE"}
          timeZone={range.timeZone}
        >
          <CalendarSnapshot
            owner={listing ? user?.id : undefined}
            url={calendarReadUrl("calendars", {
              churchId: view === "church" ? id : undefined,
              cursor: query.cursor
            })}
            snapshot={listing}
            label="calendar layers"
          >
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
              {listing && (
                <p className="text-sm text-gc-muted">
                  {query.layers === "selected"
                    ? "Showing a temporary selection."
                    : view === "calendars"
                      ? "Showing your saved choices for this page of available calendars."
                      : "Showing the calendars currently available through this church."}{" "}
                  <a className={portalLinkClass} href={savedViewPath}>
                    Use my saved calendar choices
                  </a>
                </p>
              )}
              <CalendarRange
                range={range}
                path={path}
                query={query}
                calendars={listing?.calendars}
                selected={selected}
              />
              <CalendarSnapshot
                owner={agenda ? user?.id : undefined}
                url={calendarReadUrl("agenda", {
                  ...rangeQuery,
                  calendarId: selected
                })}
                snapshot={agenda}
                label="calendar agenda"
              >
                <CalendarDisplay
                  events={events}
                  range={range}
                  mode={display.mode}
                  weekStart={display.weekStart}
                  agendaHref={agendaHref}
                  layerColors={Object.fromEntries(
                    (listing?.calendars ?? []).map((c) => [c.id, c.layer.color])
                  )}
                />
              </CalendarSnapshot>
              {listing && (
                <>
                  <PortalCard title="Available calendars">
                    <ul className="space-y-3">
                      {listing.calendars.map((c) => (
                        <li key={c.id} className="min-w-0">
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
                          {c.source.kind === "CHURCH" &&
                            (c.canEdit || c.canPublish) && (
                              <Link
                                className={portalLinkClass}
                                href={`${calendarPath(c.id)}#calendar-administration`}
                              >
                                Manage church calendar
                              </Link>
                            )}
                          <CalendarLayerChoices
                            calendar={c}
                            destination={savedViewPath}
                          />
                        </li>
                      ))}
                    </ul>
                    {listing.cursor && (
                      <a
                        href={`${path}?${new URLSearchParams({ ...viewParams, cursor: listing.cursor })}`}
                        className={portalLinkClass}
                      >
                        More calendar layers
                      </a>
                    )}
                    {query.cursor && (
                      <a
                        href={`${path}?${new URLSearchParams({ ...viewParams })}`}
                        className={portalLinkClass}
                      >
                        First calendar layers
                      </a>
                    )}
                  </PortalCard>
                  {(view === "calendars" ||
                    listing.churches.some(
                      (c) => c.id === id && c.canCreate
                    )) && (
                    <div className="max-w-2xl">
                      <PortalCard title="Create a calendar">
                        <p className="text-gc-muted">
                          Personal calendars are private until you choose to
                          share. Church calendars use separate editing and
                          publication permissions.
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
          </CalendarSnapshot>
        </CalendarDeviceZone>
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
