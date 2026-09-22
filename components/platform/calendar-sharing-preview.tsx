import type { CalendarOccurrenceView } from "@/lib/platform/calendar-access";
import { RegionalEventTime } from "./regional-presentation";

/** Owner-only illustration from an already authorized occurrence, never a grant. */
export function CalendarSharingPreview({
  event,
  timeZone,
  wholeCalendar
}: {
  event?: CalendarOccurrenceView;
  timeZone: string;
  wholeCalendar: boolean;
}) {
  if (!event || event.access === "BUSY" || event.canceled)
    return (
      <p className="text-sm text-gc-muted">
        {wholeCalendar
          ? "Add an event or choose a month with an active event to compare a real example. Whole-calendar sharing still includes current and future events."
          : "This occurrence has no active sharing preview. Review any existing calendar and event-series shares below."}
      </p>
    );
  // Pass only time fields into the client formatter, never the private details.
  const timing = {
    allDay: event.allDay,
    startAt: event.startAt,
    endAt: event.endAt,
    startLocal: event.startLocal,
    endLocal: event.endLocal
  };
  return (
    <section className="space-y-3" aria-label="Compare sharing levels">
      <h3 className="text-2xl">Compare sharing levels</h3>
      <p>
        Preview only. Choose an approved church audience and confirm saving
        below to share. Existing shares stay in effect. A full-detail share on
        either the calendar or event can still reveal details.
      </p>
      <p className="text-sm text-gc-muted">
        {wholeCalendar
          ? "This is one active event in the month you are viewing, not the full shared calendar."
          : "This preview shows the current occurrence. Sharing applies to every occurrence in this event series."}
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <details className="min-w-0 rounded-lg border border-gc-divider p-4">
          <summary className="min-h-11 cursor-pointer py-2 font-semibold">
            Busy-only preview
          </summary>
          <div className="space-y-2" aria-label="Busy-only preview">
            <p className="font-semibold">Busy</p>
            <p>
              <RegionalEventTime event={timing} timeZone={timeZone} />
            </p>
            <p className="text-sm text-gc-muted">
              Only time and availability are shown.
            </p>
          </div>
        </details>
        <details className="min-w-0 rounded-lg border border-gc-divider p-4">
          <summary className="min-h-11 cursor-pointer py-2 font-semibold">
            Full-details preview
          </summary>
          <div
            className="space-y-2 [overflow-wrap:anywhere]"
            aria-label="Full-details preview"
          >
            <p className="font-semibold">{event.title}</p>
            <p>
              <RegionalEventTime event={timing} timeZone={timeZone} />
            </p>
            <p className="whitespace-pre-wrap">
              {event.description || "No description has been added."}
            </p>
            {event.location && <p>Location: {event.location}</p>}
            {event.onlineUrl && <p>Online event: {event.onlineUrl}</p>}
            {event.organizer && <p>Organizer: {event.organizer}</p>}
          </div>
        </details>
      </div>
    </section>
  );
}
