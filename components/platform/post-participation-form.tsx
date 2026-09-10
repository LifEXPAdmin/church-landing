"use client";
import {
  useEffect,
  useId,
  useRef,
  useState,
  useTransition,
  type ReactNode
} from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { ParticipationView } from "@/lib/platform/post-participation-reads";
import type { getCalendarCommitments } from "@/lib/platform/calendar-reads";
import { accountEntryHref } from "@/lib/platform/account-entry";
import { portalInputClass, portalButtonClass } from "./portal-action-form";

function ParticipationForm({
  payload,
  fields,
  children,
  label,
  disabled = false
}: {
  payload: Record<string, unknown>;
  fields?: (form: FormData) => Record<string, unknown>;
  children?: ReactNode;
  label: string;
  disabled?: boolean;
}) {
  const router = useRouter(),
    resultRef = useRef<HTMLParagraphElement>(null),
    inFlight = useRef(false),
    creationKey = useRef(payload.requestKey);
  const [created, setCreated] = useState(false);
  const [pending, setPending] = useState(false),
    [refreshing, refresh] = useTransition();
  const [result, setResult] = useState<{
    message: string;
    failed: boolean;
  } | null>(null);
  useEffect(() => {
    if (result) resultRef.current?.focus();
  }, [result]);
  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        if (inFlight.current || refreshing || disabled) return;
        inFlight.current = true;
        setPending(true);
        const form = new FormData(e.currentTarget);
        try {
          const response = await fetch("/api/platform/participation", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "same-origin",
            body: JSON.stringify({
              ...payload,
              ...(creationKey.current
                ? { requestKey: creationKey.current }
                : {}),
              ...fields?.(form)
            })
          });
          const body = await response.json();
          setResult({
            message: body.message ?? "Refresh to check this submission.",
            failed: !response.ok
          });
          if (response.ok) {
            if (payload.operation === "configure-slot" && !payload.slotId)
              setCreated(true);
            refresh(() => router.refresh());
          } else if (
            response.status === 409 &&
            payload.operation === "volunteer"
          ) {
            // Reservation forms have no text draft. Re-read current capacity
            // while retaining the refusal message beside the updated count.
            refresh(() => router.refresh());
          }
        } catch {
          setResult({
            message:
              "The response was interrupted. Your entries are still here. Refresh to check whether the action was saved before trying again.",
            failed: true
          });
        } finally {
          inFlight.current = false;
          setPending(false);
        }
      }}
    >
      <fieldset
        disabled={pending || refreshing || created || disabled}
        className="min-w-0 space-y-3"
      >
        {children}
        <button className={portalButtonClass} type="submit">
          {pending || refreshing ? "Saving…" : label}
        </button>
      </fieldset>
      {result && (
        <p
          ref={resultRef}
          tabIndex={-1}
          role={result.failed ? "alert" : "status"}
          className={result.failed ? "text-gc-error" : "text-gc-action"}
        >
          {result.message}
        </p>
      )}
      {created && (
        <button
          type="button"
          className={portalButtonClass}
          onClick={(e) => {
            creationKey.current = crypto.randomUUID();
            e.currentTarget.form?.reset();
            setCreated(false);
            setResult(null);
          }}
        >
          Add another role
        </button>
      )}
    </form>
  );
}
function TextField({
  label,
  name,
  value = "",
  type = "text",
  maxLength = 100
}: {
  label: string;
  name: string;
  value?: string;
  type?: string;
  maxLength?: number;
}) {
  const id = useId();
  return (
    <label htmlFor={id} className="block font-semibold">
      {label}
      <input
        id={id}
        name={name}
        type={type}
        defaultValue={value}
        maxLength={maxLength}
        required
        className={portalInputClass}
      />
    </label>
  );
}
function EventTime({
  event,
  timeZone = event.timeZone
}: {
  event: NonNullable<ParticipationView["event"]>;
  timeZone?: string;
}) {
  const time = (value: string) =>
    new Intl.DateTimeFormat("en-US", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone
    }).format(new Date(value));
  return (
    <p className="text-sm text-gc-muted">
      {event.allDay
        ? `${event.startLocal} through ${event.endLocal} (end date exclusive)`
        : `${time(event.startAt)} – ${time(event.endAt)}`}{" "}
      · {timeZone}
      {event.organizer && ` · Organized by ${event.organizer}`}
    </p>
  );
}
function Roster({ slotId }: { slotId: string }) {
  const [pending, setPending] = useState(false),
    [error, setError] = useState("");
  const [roster, setRoster] = useState<{
    people: { id: string; name: string }[];
    total: number;
    nextCursor: string | null;
  } | null>(null);
  async function load(cursor?: string) {
    setPending(true);
    setError("");
    try {
      const response = await fetch(
        `/api/platform/participation?view=roster&slotId=${encodeURIComponent(slotId)}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
        { cache: "no-store", credentials: "same-origin" }
      );
      const body = await response.json();
      if (!response.ok) {
        setRoster(null);
        setError(body.message ?? "Roster unavailable.");
        return;
      }
      setRoster((prior) => ({
        ...body,
        people: cursor
          ? [...(prior?.people ?? []), ...body.people]
          : body.people
      }));
    } catch {
      setRoster(null);
      setError("The roster could not be loaded. Try again.");
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="space-y-2">
      <button
        type="button"
        className={portalButtonClass}
        disabled={pending}
        onClick={() => load()}
      >
        {pending
          ? "Loading…"
          : roster
            ? "Refresh authorized roster"
            : "Show authorized roster"}
      </button>
      {error && <p role="alert">{error}</p>}
      {roster && (
        <>
          <p>
            {roster.total} current signup{roster.total === 1 ? "" : "s"}
          </p>
          <ul className="list-disc pl-5">
            {roster.people.map((p) => (
              <li key={p.id}>{p.name}</li>
            ))}
          </ul>
          {roster.nextCursor && (
            <button
              type="button"
              className={portalButtonClass}
              disabled={pending}
              onClick={() => load(roster.nextCursor!)}
            >
              More volunteers
            </button>
          )}
        </>
      )}
    </div>
  );
}
function ConfigurePoll({
  view,
  defaultClose
}: {
  view: ParticipationView;
  defaultClose: string;
}) {
  const poll = view.poll,
    id = useId();
  return (
    <details className="space-y-3">
      <summary className="cursor-pointer py-3 font-semibold">
        {poll ? "Edit poll" : "Add a poll"}
      </summary>
      <ParticipationForm
        label="Save poll"
        payload={{
          operation: "configure-poll",
          postId: view.postId,
          expectedVersion: poll?.version ?? 0
        }}
        fields={(form) => ({
          question: form.get("question"),
          options: String(form.get("options") ?? "")
            .split(/\r?\n/)
            .filter((line) => line.trim()),
          multiple: form.get("multiple") === "on",
          closesLocal: form.get("closesLocal"),
          timeZone: form.get("timeZone")
        })}
      >
        <TextField
          name="question"
          label="Poll question"
          value={poll?.question}
          maxLength={200}
        />
        <label htmlFor={id} className="block font-semibold">
          Options — one per line
          <textarea
            id={id}
            name="options"
            defaultValue={poll?.options.map((o) => o.label).join("\n") ?? ""}
            required
            maxLength={808}
            rows={4}
            className={portalInputClass}
          />
        </label>
        <p className="text-sm text-gc-muted">
          Use 2–8 distinct options, up to 100 characters each. The question,
          choices and closing time lock after the first vote.
        </p>
        <label className="flex min-h-11 items-center gap-3">
          <input
            type="checkbox"
            name="multiple"
            defaultChecked={poll?.multiple}
          />
          Allow more than one choice
        </label>
        <TextField
          name="closesLocal"
          label="Closing date and time"
          type="datetime-local"
          value={poll?.closesLocal ?? defaultClose}
        />
        <TextField
          name="timeZone"
          label="Closing time zone"
          value={poll?.timeZone ?? "UTC"}
          maxLength={80}
        />
        <p className="text-sm text-gc-muted">
          Use an IANA zone such as America/Chicago or UTC. Skipped or repeated
          local times must be changed.
        </p>
      </ParticipationForm>
    </details>
  );
}
function ConfigureSlot({
  view,
  slot,
  requestKey
}: {
  view: ParticipationView;
  slot?: ParticipationView["slots"][number];
  requestKey: string;
}) {
  return (
    <details className="space-y-3">
      <summary className="cursor-pointer py-3 font-semibold">
        {slot ? "Manage volunteer role" : "Add a volunteer role"}
      </summary>
      <ParticipationForm
        label="Save volunteer role"
        payload={{
          operation: "configure-slot",
          postId: view.postId,
          slotId: slot?.id,
          requestKey,
          expectedVersion: slot?.version ?? 0
        }}
        fields={(form) => ({
          role: form.get("role"),
          capacity: Number(form.get("capacity")),
          closed: form.get("closed") === "on"
        })}
      >
        <TextField
          label="Role or task"
          name="role"
          value={slot?.role}
          maxLength={100}
        />
        <TextField
          label="Number of places (1–500)"
          name="capacity"
          type="number"
          value={String(slot?.capacity ?? 1)}
        />
        <label className="flex min-h-11 items-center gap-3">
          <input type="checkbox" name="closed" defaultChecked={slot?.closed} />
          Close this role to new signups
        </label>
        <p className="text-sm text-gc-muted">
          This role uses the current event time. Closing it preserves existing
          signups. Its name locks after participation; capacity cannot drop
          below reserved places.
        </p>
      </ParticipationForm>
    </details>
  );
}
export function PostParticipationControls({
  view,
  manage,
  requestKey,
  defaultClose
}: {
  view: ParticipationView;
  manage: boolean;
  requestKey: string;
  defaultClose: string;
}) {
  const poll = view.poll;
  return (
    <section
      className="my-5 space-y-5 border-y border-gc-divider py-5"
      aria-label="Poll and volunteer participation"
    >
      {poll && (
        <section className="space-y-3" aria-label="Poll">
          <h3 className="font-semibold">{poll.question}</h3>
          <p className="text-sm text-gc-muted">
            {poll.closed
              ? "Voting closed"
              : `Closes ${poll.closesLocal.replace("T", " ")} · ${poll.timeZone}`}{" "}
            · {poll.total} ballot{poll.total === 1 ? "" : "s"}.{" "}
            {poll.multiple
              ? "Multiple choices per ballot."
              : "One choice per ballot."}
          </p>
          {view.eligible && !poll.closed ? (
            <ParticipationForm
              label={poll.ballot ? "Save changed vote" : "Submit vote"}
              payload={{
                operation: "vote",
                postId: view.postId,
                pollVersion: poll.version,
                expectedVersion: poll.ballot?.version ?? 0
              }}
              fields={(form) => ({ optionIds: form.getAll("optionIds") })}
            >
              <fieldset key={poll.ballot?.version ?? 0} className="min-w-0">
                <legend className="sr-only">{poll.question}</legend>
                {poll.options.map((o) => (
                  <label
                    key={o.id}
                    className="flex min-h-11 items-center gap-3 py-2"
                  >
                    <input
                      type={poll.multiple ? "checkbox" : "radio"}
                      name="optionIds"
                      value={o.id}
                      defaultChecked={poll.ballot?.optionIds.includes(o.id)}
                    />
                    <span>
                      {o.label} — {o.count}
                    </span>
                  </label>
                ))}
              </fieldset>
              <p className="text-sm text-gc-muted">
                One ballot per member. You can change it before closing. Results
                show totals; other members cannot see your choices.
              </p>
            </ParticipationForm>
          ) : (
            <ul className="space-y-2">
              {poll.options.map((o) => (
                <li key={o.id}>
                  {o.label} — {o.count}
                </li>
              ))}
            </ul>
          )}
          {manage && view.canEdit && !poll.closed && (
            <ParticipationForm
              label="Close voting"
              payload={{
                operation: "close-poll",
                postId: view.postId,
                expectedVersion: poll.version
              }}
            />
          )}
        </section>
      )}
      {(poll || view.slots.length > 0) && !view.eligible && (
        <p className="text-sm">
          {view.signedIn ? (
            view.churchScoped ? (
              "Voting and volunteering require a verified adult account and current approval from this church."
            ) : (
              "Voting requires a verified adult account."
            )
          ) : (
            <Link
              className="inline-flex min-h-11 items-center underline"
              href={accountEntryHref(
                "join",
                `/platform/posts/${view.postId}`,
                "participate"
              )}
            >
              Join or sign in to participate
            </Link>
          )}
        </p>
      )}
      {view.slots.length > 0 && view.event && (
        <section className="space-y-4" aria-label="Volunteer roles">
          <h3 className="font-semibold">Volunteer for {view.event.title}</h3>
          <EventTime event={view.event} />
          {view.event.canceled && (
            <p role="status">
              This event is canceled. No new places can be reserved.
            </p>
          )}
          {view.slots.map((slot) => (
            <section
              key={slot.id}
              className="space-y-3 rounded-lg border border-gc-divider p-4"
              aria-label={slot.role}
            >
              <h4 className="font-semibold">{slot.role}</h4>
              <p>
                {slot.filled} of {slot.capacity} places reserved ·{" "}
                {slot.closed || !view.active
                  ? "Closed to new signups"
                  : `${Math.max(0, slot.capacity - slot.filled)} available`}
              </p>
              {slot.signup?.state === "ACTIVE" ? (
                <>
                  <p className="text-gc-action">Your place is reserved.</p>
                  {slot.signup.detailsChanged && (
                    <p role="status">
                      Event details changed since you signed up. Review the
                      current event details.
                    </p>
                  )}
                  <ParticipationForm
                    label="Cancel my signup"
                    payload={{
                      operation: "cancel-volunteer",
                      signupId: slot.signup.id,
                      expectedVersion: slot.signup.version
                    }}
                  />
                </>
              ) : view.eligible && view.active && !slot.closed ? (
                <ParticipationForm
                  label={
                    slot.filled >= slot.capacity
                      ? "Role full"
                      : "Reserve a place"
                  }
                  disabled={slot.filled >= slot.capacity}
                  payload={{
                    operation: "volunteer",
                    postId: view.postId,
                    slotId: slot.id,
                    slotVersion: slot.version,
                    expectedVersion: slot.signup?.version ?? 0
                  }}
                />
              ) : null}
              {manage && view.canOrganize && (
                <>
                  <ConfigureSlot view={view} slot={slot} requestKey={slot.id} />
                  <Roster slotId={slot.id} />
                </>
              )}
            </section>
          ))}
          <Link
            className="inline-flex min-h-11 items-center underline"
            href="/platform/commitments"
          >
            My commitments
          </Link>
        </section>
      )}
      {manage && view.canEdit && (!poll || (!poll.locked && !poll.closed)) && (
        <ConfigurePoll view={view} defaultClose={defaultClose} />
      )}
      {manage && view.canOrganize && view.active && view.slots.length < 12 && (
        <ConfigureSlot view={view} requestKey={requestKey} />
      )}
    </section>
  );
}
export function VolunteerCommitments({
  rows,
  timeZone
}: {
  rows: Awaited<
    ReturnType<typeof getCalendarCommitments>
  >["volunteerCommitments"];
  timeZone: string;
}) {
  return (
    <section className="space-y-4" aria-label="Your volunteer commitments">
      <h2 className="font-serif text-xl">Volunteer commitments</h2>
      {!rows.length && <p>No volunteer commitments in this date range.</p>}
      {rows.map((row) => (
        <article
          key={row.id}
          className="space-y-3 rounded-lg border border-gc-divider bg-gc-surface p-5"
        >
          <h3 className="font-semibold">{row.role}</h3>
          {row.event ? (
            <>
              <Link
                className="inline-flex min-h-11 items-center underline"
                href={`/platform/events/${row.event.id}`}
              >
                {row.event.title}
              </Link>
              <EventTime event={row.event} timeZone={timeZone} />
              {row.event.canceled && <p>This event is canceled.</p>}
            </>
          ) : (
            <p>
              The source is no longer available to your account. You can still
              cancel your reservation.
            </p>
          )}
          {row.detailsChanged && (
            <p>
              Event details changed since you signed up. Review the current
              details.
            </p>
          )}
          {row.conflict && <p>{row.conflict}</p>}
          {row.postId && (
            <Link
              className="inline-flex min-h-11 items-center underline"
              href={`/platform/posts/${row.postId}`}
            >
              View volunteer post
            </Link>
          )}
          <ParticipationForm
            label="Cancel my signup"
            payload={{
              operation: "cancel-volunteer",
              signupId: row.id,
              expectedVersion: row.version
            }}
          />
        </article>
      ))}
    </section>
  );
}
