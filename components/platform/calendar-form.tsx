"use client";
import { useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { portalInputClass, portalButtonClass } from "./portal-action-form";

export type CalendarField = {
  name: string;
  label: string;
  type?:
    | "text"
    | "textarea"
    | "select"
    | "checkbox"
    | "date"
    | "datetime-local"
    | "url";
  value?: string | boolean;
  required?: boolean;
  maxLength?: number;
  hint?: string;
  options?: { value: string; label: string }[];
};
export function CalendarFields({ fields }: { fields: CalendarField[] }) {
  const prefix = useId();
  return (
    <>
      {fields.map((field) => {
        const id = `${prefix}-${field.name}`,
          hint = field.hint ? `${id}-hint` : undefined;
        return (
          <div key={field.name}>
            <label htmlFor={id} className="block font-semibold text-gc-text">
              {field.label}
            </label>
            {field.type === "textarea" ? (
              <textarea
                id={id}
                name={field.name}
                defaultValue={String(field.value ?? "")}
                required={field.required}
                maxLength={field.maxLength}
                aria-describedby={hint}
                className={portalInputClass}
                rows={4}
              />
            ) : field.type === "select" ? (
              <select
                id={id}
                name={field.name}
                defaultValue={String(field.value ?? "")}
                required={field.required}
                aria-describedby={hint}
                className={portalInputClass}
              >
                {field.options?.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            ) : field.type === "checkbox" ? (
              <input
                id={id}
                name={field.name}
                type="checkbox"
                defaultChecked={field.value === true}
                required={field.required}
                aria-describedby={hint}
                className="mt-2 h-6 w-6 accent-gc-action"
              />
            ) : (
              <input
                id={id}
                name={field.name}
                type={field.type ?? "text"}
                defaultValue={String(field.value ?? "")}
                required={field.required}
                maxLength={field.maxLength}
                aria-describedby={hint}
                className={portalInputClass}
              />
            )}
            {field.hint && (
              <p id={hint} className="mt-2 text-sm text-gc-muted">
                {field.hint}
              </p>
            )}
          </div>
        );
      })}
    </>
  );
}
export function CalendarForm({
  operation,
  payload,
  fields = [],
  label,
  children,
  destination,
  checkboxNames = [],
  confirmation
}: {
  operation: string;
  payload: Record<string, string | number | boolean | null | undefined>;
  fields?: CalendarField[];
  label: string;
  children?: React.ReactNode;
  destination?: "calendar" | "event" | string;
  checkboxNames?: string[];
  confirmation?: string;
}) {
  const router = useRouter();
  const requestKey = useRef(payload.requestKey);
  const locked = useRef(false);
  const [pending, setPending] = useState(false);
  const [refreshing, startRefresh] = useTransition();
  const [conflict, setConflict] = useState(false);
  const [message, setMessage] = useState("");
  const status = useRef<HTMLParagraphElement>(null);
  const busy = pending || refreshing;
  const tell = (text: string) => {
    setMessage(text);
    requestAnimationFrame(() => status.current?.focus());
  };
  return (
    <form
      aria-label={label}
      aria-busy={busy}
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        if (locked.current || busy || conflict) return;
        const form = e.currentTarget,
          data = new FormData(form);
        const values: Record<string, unknown> = Object.fromEntries(
          data.entries()
        );
        for (const name of [
          ...checkboxNames,
          ...fields.filter((f) => f.type === "checkbox").map((f) => f.name),
          ...(confirmation ? ["confirmed"] : [])
        ])
          values[name] = data.has(name);
        if ("weeklyUntil" in values && !values.weeklyUntil)
          values.weeklyUntil = null;
        locked.current = true;
        setPending(true);
        setMessage("");
        try {
          const response = await fetch("/api/platform/calendars", {
            method: "POST",
            credentials: "same-origin",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              ...values,
              ...payload,
              ...(requestKey.current ? { requestKey: requestKey.current } : {}),
              operation
            })
          });
          const body: unknown = await response.json().catch(() => null);
          const result =
            body && typeof body === "object"
              ? (body as Record<string, unknown>)
              : {};
          const text =
            typeof result.message === "string"
              ? result.message
              : "The save could not be confirmed. Your entries are still here. Try again.";
          tell(text);
          if (response.ok) {
            let next: string | undefined;
            if (destination === "calendar" && typeof result.id === "string")
              next = `/platform/calendars/${encodeURIComponent(result.id)}`;
            else if (
              destination === "event" &&
              typeof result.occurrenceId === "string"
            )
              next = `/platform/events/${encodeURIComponent(result.occurrenceId)}`;
            else if (destination?.startsWith("/platform/")) next = destination;
            if (next) {
              // Load the saved destination without racing navigation against a
              // refresh of the form's former route.
              window.location.assign(next);
              return;
            }
            startRefresh(() => router.refresh());
          } else if (response.status === 409) {
            setConflict(true);
            tell(
              `${text} Your entries are still here. Load the latest saved version, review it, then save again.`
            );
          } else if ([401, 403, 404].includes(response.status)) {
            // Replace private content promptly when this session or its access ends.
            startRefresh(() => router.refresh());
          }
        } catch {
          tell(
            "The save could not be confirmed. Your entries are still here. Check your connection and try again."
          );
        } finally {
          locked.current = false;
          setPending(false);
        }
      }}
    >
      <fieldset disabled={busy} className="min-w-0 space-y-4">
        <CalendarFields fields={fields} />
        {children}
        {confirmation && (
          <CalendarFields
            fields={[
              {
                name: "confirmed",
                label: confirmation,
                type: "checkbox",
                required: true
              }
            ]}
          />
        )}
        <button type="submit" disabled={conflict} className={portalButtonClass}>
          {busy ? "Saving…" : label}
        </button>
      </fieldset>
      <p
        ref={status}
        role="status"
        aria-live="polite"
        tabIndex={-1}
        className="text-sm text-gc-text focus:outline-none"
      >
        {message}
      </p>
      {conflict && (
        <button
          type="button"
          disabled={busy}
          className={portalButtonClass}
          onClick={() => {
            startRefresh(() => {
              router.refresh();
            });
            setConflict(false);
            tell(
              "Reloading the latest saved information. Your form entries are preserved. Review the saved details and your entries before submitting again."
            );
          }}
        >
          Load latest saved version
        </button>
      )}
    </form>
  );
}
export type EventDraft = {
  title: string;
  description: string;
  location: string;
  onlineUrl: string;
  organizer: string;
  allDay: boolean;
  timeZone: string;
  startLocal: string;
  endLocal: string;
  weeklyUntil: string | null;
};
export function CalendarEventForm({
  draft,
  payload,
  create = false,
  series = false,
  canPublish = false
}: {
  draft: EventDraft;
  payload: Parameters<typeof CalendarForm>[0]["payload"];
  create?: boolean;
  series?: boolean;
  canPublish?: boolean;
}) {
  const [allDay, setAllDay] = useState(draft.allDay);
  const [weekly, setWeekly] = useState(!!draft.weeklyUntil);
  const id = useId();
  return (
    <CalendarForm
      operation={create ? "create-event" : "edit-event"}
      payload={payload}
      label={
        create
          ? "Create event"
          : series
            ? "Save series"
            : "Save this occurrence"
      }
      destination={create ? "event" : undefined}
      checkboxNames={["allDay", "replaceExceptions"]}
      confirmation={
        series && !create
          ? "Apply these details and times to every active occurrence in this series. Existing RSVPs stay attached."
          : undefined
      }
    >
      <CalendarFields
        fields={[
          {
            name: "title",
            label: "Event title",
            value: draft.title,
            maxLength: 160,
            required: true
          },
          {
            name: "description",
            label: "Description",
            value: draft.description,
            maxLength: 5000,
            type: "textarea"
          }
        ]}
      />
      <label
        className="flex min-h-11 items-center gap-3"
        htmlFor={`${id}-all-day`}
      >
        <input
          id={`${id}-all-day`}
          name="allDay"
          type="checkbox"
          className="h-6 w-6 accent-gc-action"
          checked={allDay}
          onChange={(e) => setAllDay(e.target.checked)}
        />
        All-day event
      </label>
      <CalendarFields
        key={allDay ? "dates" : "times"}
        fields={[
          {
            name: "startLocal",
            label: allDay ? "First day" : "Start date and time",
            type: allDay ? "date" : "datetime-local",
            required: true,
            value: allDay
              ? draft.startLocal.slice(0, 10)
              : draft.startLocal.length === 10
                ? draft.startLocal + "T09:00"
                : draft.startLocal
          },
          {
            name: "endLocal",
            label: allDay
              ? "End date (first day after the event)"
              : "End date and time",
            type: allDay ? "date" : "datetime-local",
            required: true,
            value: allDay
              ? draft.endLocal.slice(0, 10)
              : draft.endLocal.length === 10
                ? draft.endLocal + "T10:00"
                : draft.endLocal,
            hint: allDay
              ? "For a one-day event on November 1, choose November 2 as the end. All-day dates stay the same in every time zone."
              : undefined
          }
        ]}
      />
      <CalendarFields
        fields={[
          {
            name: "timeZone",
            label: "Event time zone",
            value: draft.timeZone,
            required: true,
            maxLength: 100,
            hint: "Use an IANA zone such as America/Chicago. Weekly events keep their local start time through daylight saving changes. Repeated or missing clock times require another time."
          }
        ]}
      />
      {(create || series) && (
        <>
          <label
            htmlFor={`${id}-weekly`}
            className="flex min-h-11 items-center gap-3"
          >
            <input
              id={`${id}-weekly`}
              type="checkbox"
              className="h-6 w-6 accent-gc-action"
              checked={weekly}
              onChange={(e) => setWeekly(e.target.checked)}
            />
            Repeat every week
          </label>
          {weekly ? (
            <CalendarFields
              fields={[
                {
                  name: "weeklyUntil",
                  label: "Last repeat date",
                  type: "date",
                  required: true,
                  value: draft.weeklyUntil ?? "",
                  hint: "Up to 52 occurrences. To change the number of occurrences in an existing series, create a separate series."
                }
              ]}
            />
          ) : (
            <input type="hidden" name="weeklyUntil" value="" />
          )}
        </>
      )}
      <CalendarFields
        fields={[
          {
            name: "location",
            label: "Location",
            value: draft.location,
            maxLength: 300
          },
          {
            name: "onlineUrl",
            label: "Online event link",
            value: draft.onlineUrl,
            maxLength: 2000,
            type: "url"
          },
          {
            name: "organizer",
            label: "Organizer shown on the event",
            value: draft.organizer,
            maxLength: 100,
            hint: "Only include contact information you intend to share with the event’s audience."
          },
          ...(create && canPublish
            ? [
                {
                  name: "visibility",
                  label: "Who can view this church event?",
                  type: "select" as const,
                  value: "PRIVATE",
                  options: [
                    {
                      value: "PRIVATE",
                      label: "Private draft · calendar editors and publishers"
                    },
                    { value: "CHURCH", label: "Approved church members" },
                    { value: "PUBLIC", label: "Everyone, including guests" }
                  ]
                }
              ]
            : []),
          ...(series && !create
            ? [
                {
                  name: "replaceExceptions",
                  label: "Also replace individual edits to active occurrences",
                  type: "checkbox" as const,
                  hint: "Leave unchecked unless you intend to replace separately edited occurrences. Canceled occurrences stay canceled."
                }
              ]
            : [])
        ]}
      />
    </CalendarForm>
  );
}
export function DeviceZoneButton() {
  return (
    <button
      type="button"
      className="min-h-11 text-sm font-semibold text-gc-accent underline"
      onClick={(e) => {
        const input = e.currentTarget
          .closest("form")
          ?.elements.namedItem("timeZone");
        if (input instanceof HTMLInputElement)
          input.value = Intl.DateTimeFormat().resolvedOptions().timeZone;
      }}
    >
      Use my device time zone
    </button>
  );
}
