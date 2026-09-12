import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { PortalError } from "@/lib/platform/portal";
import { getPublicChurchAgenda } from "@/lib/platform/calendar-reads";
import {
  readCalendars,
  readCalendarAgenda
} from "@/lib/platform/calendar-session";
import { CalendarAgenda } from "./calendar-presentation";
export async function ChurchUpcoming({
  churchId,
  signedIn
}: {
  churchId: string;
  signedIn: boolean;
}) {
  const now = new Date(),
    end = new Date(now.getTime() + 30 * 86400000);
  const range = {
    from: now.toISOString().slice(0, 10),
    until: end.toISOString().slice(0, 10),
    timeZone: "UTC"
  };
  try {
    let events = (await getPublicChurchAgenda(prisma, { ...range, churchId }))
      .events;
    if (signedIn) {
      try {
        const listing = await readCalendars({ churchId });
        events = (
          await readCalendarAgenda({
            ...range,
            calendarIds: listing.calendars.map((c) => c.id)
          })
        ).events;
      } catch (error) {
        if (
          !(error instanceof PortalError) ||
          ![401, 403].includes(error.status)
        )
          throw error;
      }
    }
    return (
      <section
        aria-labelledby="church-upcoming"
        className="my-8 space-y-4 rounded-xl border border-gc-divider bg-gc-surface p-5"
      >
        <h2 id="church-upcoming" className="text-2xl">
          Upcoming events
        </h2>
        <p className="text-gc-muted">
          The next 30 days, shown in UTC. Open an event for local times and
          RSVP.
        </p>
        <CalendarAgenda events={events.slice(0, 5)} timeZone="UTC" />
        <Link
          className="gc-button gc-button-quiet"
          href={`/platform/churches/${encodeURIComponent(churchId)}/calendar`}
        >
          Full church calendar
        </Link>
      </section>
    );
  } catch {
    return (
      <section className="my-8 rounded-xl border border-gc-divider p-5">
        <h2 className="text-2xl">Upcoming events</h2>
        <p>
          Events could not be loaded. Open the church calendar to check current
          access and try again.
        </p>
        <Link
          className="gc-button gc-button-quiet"
          href={`/platform/churches/${encodeURIComponent(churchId)}/calendar`}
        >
          Open church calendar
        </Link>
      </section>
    );
  }
}
