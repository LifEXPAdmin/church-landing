import Link from "next/link";
import {
  calendarMonthDays,
  type monthRange
} from "@/lib/platform/calendar-view";
import { CalendarAgenda, eventPath } from "./calendar-presentation";
import { RegionalEventTime } from "./regional-presentation";
import { calendarLayerColor } from "@/lib/platform/calendar-layer-options";

export function CalendarDisplay({
  events,
  range,
  mode,
  weekStart,
  commitments = false,
  layerColors = {},
  agendaHref
}: {
  agendaHref: string;
  events: Parameters<typeof CalendarAgenda>[0]["events"];
  range: ReturnType<typeof monthRange>;
  mode: "AGENDA" | "MONTH";
  weekStart: 0 | 1;
  commitments?: boolean;
  layerColors?: Record<string, string>;
}) {
  if (mode === "AGENDA")
    return (
      <CalendarAgenda
        events={events}
        timeZone={range.timeZone}
        commitments={commitments}
        layerColors={layerColors}
      />
    );
  const cells = calendarMonthDays(
    range.month,
    range.timeZone,
    weekStart,
    events
  );
  const weekdays = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday"
  ];
  const headings = [
    ...weekdays.slice(weekStart),
    ...weekdays.slice(0, weekStart)
  ];
  return (
    <div className="min-w-0 space-y-3">
      <p className="text-sm text-gc-muted">
        Week starts on {weekdays[weekStart]}. Scroll within the month to see
        every day. Open an event for its details and response controls.
      </p>
      <div
        className="max-w-full overflow-x-auto rounded-xl border border-gc-divider focus-visible:outline focus-visible:outline-2"
        tabIndex={0}
        role="region"
        aria-label="Scrollable calendar month"
      >
        <table className="w-full min-w-[56rem] table-fixed border-collapse">
          <caption className="p-3 text-xl">
            {range.label}
            {commitments ? " commitments" : " events"}
          </caption>
          <thead>
            <tr>
              {headings.map((day) => (
                <th
                  key={day}
                  scope="col"
                  className="border border-gc-divider p-2 text-left"
                >
                  {day}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: cells.length / 7 }, (_, row) => (
              <tr key={row}>
                {cells.slice(row * 7, row * 7 + 7).map((cell, col) => (
                  <td
                    key={cell?.date ?? col}
                    className="border border-gc-divider p-2 align-top [overflow-wrap:anywhere]"
                  >
                    {cell && (
                      <>
                        <time dateTime={cell.date} className="font-semibold">
                          {Number(cell.date.slice(-2))}
                        </time>
                        <ul className="mt-2 space-y-3">
                          {cell.events.slice(0, 3).map((event) => (
                            <li
                              key={event.id}
                              className="space-y-1 rounded-lg border border-gc-divider p-2"
                            >
                              <Link
                                className="block py-2 font-semibold text-gc-accent underline"
                                href={`${eventPath(event.id)}?${new URLSearchParams({ timeZone: range.timeZone })}`}
                              >
                                {event.title}
                              </Link>
                              <p className="text-sm">{event.source.label}</p>
                              {calendarLayerColor(
                                layerColors[event.calendarId]
                              ) && (
                                <p className="text-sm">
                                  {
                                    calendarLayerColor(
                                      layerColors[event.calendarId]
                                    )!.label
                                  }{" "}
                                  layer
                                </p>
                              )}
                              <p className="text-sm">
                                <RegionalEventTime
                                  event={event}
                                  timeZone={range.timeZone}
                                />
                              </p>
                              {event.canceled && (
                                <p className="font-semibold text-gc-error">
                                  Canceled
                                </p>
                              )}
                              {event.response && (
                                <p className="text-sm">
                                  Your response:{" "}
                                  {event.response.state === "GOING"
                                    ? "Going"
                                    : event.response.state === "MAYBE"
                                      ? "Maybe"
                                      : "Not going"}
                                </p>
                              )}
                              {"conflict" in event &&
                                typeof event.conflict === "string" && (
                                  <p className="text-sm">{event.conflict}</p>
                                )}
                            </li>
                          ))}
                        </ul>
                        {cell.events.length > 3 && (
                          <Link
                            className="block py-3 text-gc-accent underline"
                            href={`${agendaHref}#calendar-event-${cell.events[3].id}`}
                          >
                            {cell.events.length - 3} more in agenda
                          </Link>
                        )}
                      </>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!events.length && (
        <p>No events in this month for the selected calendars.</p>
      )}
    </div>
  );
}
