"use client";
import { useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type {
  VolunteerOpportunityView,
  VolunteerApplicationView
} from "@/lib/platform/volunteer-reads";
import { usePrivateChoiceAction } from "./use-private-choice-action";
import { portalInputClass } from "./portal-action-form";

const endpoint = "/api/platform/volunteers";
const snapshot = (opportunity: VolunteerOpportunityView) => ({
  opportunityVersion: opportunity.version,
  slotVersion: opportunity.slotVersion,
  eventVersion: opportunity.eventVersion,
  occurrenceVersion: opportunity.occurrenceVersion
});

export function VolunteerOpportunityForm({
  owner,
  postId,
  postVersion,
  event,
  opportunity
}: {
  owner: string;
  postId: string;
  postVersion: number;
  event: { startLocal: string; endLocal: string; timeZone: string } | null;
  opportunity?: VolunteerOpportunityView;
}) {
  const formId = useId(),
    router = useRouter(),
    id = useRef<string | null>(null);
  const initial = {
    title: opportunity?.title ?? "",
    duties: opportunity?.duties ?? "",
    requirements: opportunity?.requirements ?? "",
    contact: opportunity?.contact ?? "",
    commitment: opportunity?.commitment ?? "",
    capacity: String(opportunity?.capacity ?? 1),
    closed: opportunity?.applicationsClosed ?? false,
    independentTime: opportunity?.shift?.independent ?? false,
    shiftStartLocal: opportunity?.shift?.startLocal ?? event?.startLocal ?? "",
    shiftEndLocal: opportunity?.shift?.endLocal ?? event?.endLocal ?? ""
  };
  const [values, setValues] = useState(initial);
  const action = usePrivateChoiceAction(
    endpoint,
    owner,
    JSON.stringify(initial) !== JSON.stringify(values),
    (receipt) => router.push(`/platform/serve/${receipt.id}`),
    true
  );
  return (
    <form
      aria-label={
        opportunity
          ? "Edit volunteer opportunity"
          : "Create volunteer opportunity"
      }
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (action.blocked) return;
        id.current ??= crypto.randomUUID();
        void action.command({
          operation: "save",
          id: opportunity?.id ?? id.current,
          postId,
          postVersion,
          expectedVersion: opportunity?.version ?? 0,
          slotVersion: opportunity?.slotVersion ?? null,
          ...values,
          capacity: Number(values.capacity),
          ...(!event || !values.independentTime
            ? { shiftStartLocal: undefined, shiftEndLocal: undefined }
            : {})
        });
      }}
    >
      <p>
        Applications require coordinator approval. Publishing this opportunity
        or accepting someone does not appoint church staff or grant access.
      </p>
      <p className="text-sm text-gc-muted">
        Once an application exists, keep the title, duties, requirements and
        commitment unchanged. Publish a new opportunity for a different duty.
      </p>
      <fieldset disabled={action.blocked} className="space-y-4">
        <legend className="sr-only">Opportunity details</legend>
        {(
          [
            ["title", "Role title", 100, true],
            ["duties", "Purpose and duties", 2000, true],
            ["requirements", "Requirements", 1000, false],
            [
              "contact",
              "Published coordinator contact or contact instructions",
              300,
              false
            ],
            [
              "commitment",
              event
                ? "Additional commitment details"
                : "Ongoing commitment and scheduling arrangements",
              300,
              !event
            ]
          ] as const
        ).map(([key, label, max, required]) => (
          <label
            className="block space-y-2"
            key={key}
            htmlFor={`${formId}-${key}`}
          >
            <span>{label}</span>
            <textarea
              id={`${formId}-${key}`}
              rows={key === "duties" ? 4 : 2}
              className={portalInputClass}
              required={required}
              maxLength={max}
              value={values[key]}
              onChange={(e) => setValues({ ...values, [key]: e.target.value })}
            />
          </label>
        ))}
        <p className="text-sm text-gc-muted">
          Describe expectations only. Do not request screening documents, health
          details or information about children.
        </p>
        <label className="block space-y-2" htmlFor={`${formId}-capacity`}>
          <span>Places available in total</span>
          <input
            id={`${formId}-capacity`}
            className={portalInputClass}
            required
            type="number"
            min={1}
            max={500}
            step={1}
            value={values.capacity}
            onChange={(e) => setValues({ ...values, capacity: e.target.value })}
          />
        </label>
        {event && (
          <div className="space-y-3 rounded-xl border p-4">
            <p>
              Parent event: {event.startLocal.replace("T", " ")} to{" "}
              {event.endLocal.replace("T", " ")} ({event.timeZone}).
            </p>
            <label className="flex min-h-11 items-center gap-3">
              <input
                type="checkbox"
                checked={values.independentTime}
                onChange={(e) =>
                  setValues({ ...values, independentTime: e.target.checked })
                }
              />
              Use a shorter shift within this event
            </label>
            {values.independentTime && (
              <>
                <p>
                  These times stay fixed when the parent event changes.
                  Conflicting shifts pause new applications until reviewed.
                </p>
                {(["shiftStartLocal", "shiftEndLocal"] as const).map(
                  (key, index) => (
                    <label
                      key={key}
                      className="block space-y-2"
                      htmlFor={`${formId}-${key}`}
                    >
                      <span>
                        {index ? "Shift ends" : "Shift starts"} (
                        {event.timeZone})
                      </span>
                      <input
                        id={`${formId}-${key}`}
                        type="datetime-local"
                        step={60}
                        required
                        className={portalInputClass}
                        value={values[key]}
                        onChange={(e) =>
                          setValues({ ...values, [key]: e.target.value })
                        }
                      />
                    </label>
                  )
                )}
              </>
            )}
          </div>
        )}
        <label className="flex min-h-11 items-center gap-3">
          <input
            type="checkbox"
            checked={values.closed}
            onChange={(e) => setValues({ ...values, closed: e.target.checked })}
          />
          Close new applications and approvals
        </label>
        <button className="gc-button" type="submit">
          Save opportunity
        </button>
      </fieldset>
      {action.status}
    </form>
  );
}

export function VolunteerApplyForm({
  owner,
  opportunity,
  application
}: {
  owner: string;
  opportunity: VolunteerOpportunityView;
  application: VolunteerApplicationView | null;
}) {
  const router = useRouter(),
    id = useId(),
    [statement, setStatement] = useState(application?.statement ?? ""),
    [availability, setAvailability] = useState(application?.availability ?? ""),
    [confirmed, setConfirmed] = useState(false);
  const action = usePrivateChoiceAction(
    endpoint,
    owner,
    statement !== (application?.statement ?? "") ||
      availability !== (application?.availability ?? "") ||
      confirmed,
    () => router.push("/platform/serve/applications"),
    true
  );
  return (
    <form
      className="space-y-4"
      aria-label="Volunteer application"
      onSubmit={(e) => {
        e.preventDefault();
        void action.command({
          operation: "apply",
          opportunityId: opportunity.id,
          ...snapshot(opportunity),
          expectedVersion: application?.version ?? 0,
          statement,
          availability,
          confirmed
        });
      }}
    >
      <fieldset
        disabled={action.blocked || opportunity.closed}
        className="space-y-4"
      >
        <legend className="font-semibold">
          {application?.state === "SUBMITTED"
            ? "Confirm changed details"
            : application
              ? "Apply again"
              : "Apply for this opportunity"}
        </legend>
        <label className="block space-y-2" htmlFor={id}>
          <span>Optional note to the coordinator</span>
          <textarea
            id={id}
            className={portalInputClass}
            rows={4}
            maxLength={1000}
            value={statement}
            onChange={(e) => setStatement(e.target.value)}
          />
        </label>
        <p className="text-sm text-gc-muted">
          Only you and an authorized coordinator can read your application. Keep
          out health details, screening documents and information about
          children.
        </p>
        <label className="block space-y-2" htmlFor={`${id}-availability`}>
          <span>Availability for this opportunity (optional)</span>
          <textarea
            id={`${id}-availability`}
            className={portalInputClass}
            rows={3}
            maxLength={500}
            value={availability}
            onChange={(e) => setAvailability(e.target.value)}
            aria-describedby={`${id}-availability-help`}
          />
        </label>
        <p id={`${id}-availability-help`} className="text-sm text-gc-muted">
          Share preferred days or times with this opportunity’s authorized
          coordinators. Include your time zone if helpful. This does not share
          your calendar, reserve a place or change the published shift.
        </p>
        <label className="flex min-h-11 items-start gap-3">
          <input
            className="mt-1"
            type="checkbox"
            required
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
          />
          <span>
            I have reviewed the current duties, requirements and commitment. I
            understand that applying reserves no place and requires coordinator
            approval.
          </span>
        </label>
        <button className="gc-button" type="submit">
          {application?.state === "SUBMITTED"
            ? "Confirm current details"
            : "Submit application"}
        </button>
      </fieldset>
      {action.status}
    </form>
  );
}

export function VolunteerApplicationActions({
  owner,
  application,
  opportunity,
  coordinator = false
}: {
  owner: string;
  application: VolunteerApplicationView;
  opportunity?: VolunteerOpportunityView | null;
  coordinator?: boolean;
}) {
  const id = useId(),
    [note, setNote] = useState("");
  const action = usePrivateChoiceAction(endpoint, owner, !!note);
  const command = (operation: string, prompt: string) => {
    if (!action.blocked && window.confirm(prompt))
      void action.command({
        operation,
        id: application.id,
        expectedVersion: application.version,
        ...(operation === "accept" && opportunity ? snapshot(opportunity) : {}),
        ...(operation === "decline" ? { note } : {})
      });
  };
  return (
    <div className="space-y-3">
      {application.availability && (
        <p className="whitespace-pre-wrap break-words">
          Availability for this opportunity: {application.availability}
        </p>
      )}
      {application.own &&
        (application.canEditAvailability ||
          application.canClearAvailability) && (
          <VolunteerAvailabilityForm owner={owner} application={application} />
        )}
      {application.own && application.canWithdraw && (
        <button
          className="gc-button gc-button-quiet"
          disabled={action.blocked}
          type="button"
          onClick={() =>
            command(
              "withdraw",
              "Withdraw this application or cancel its uncompleted volunteer assignment? This releases any reserved place."
            )
          }
        >
          Withdraw application or assignment
        </button>
      )}
      {coordinator && application.state === "SUBMITTED" && (
        <>
          <button
            type="button"
            className="gc-button"
            disabled={
              action.blocked ||
              application.detailsChanged ||
              opportunity?.closed ||
              !opportunity ||
              opportunity.filled >= opportunity.capacity
            }
            onClick={() =>
              command(
                "accept",
                "Accept this application and confirm one volunteer assignment for the displayed commitment? This grants no church authority or additional access."
              )
            }
          >
            Accept application
          </button>
          {application.detailsChanged && (
            <p>
              The applicant must confirm the changed commitment before approval.
            </p>
          )}
          <label className="block space-y-2" htmlFor={id}>
            <span>
              Optional explanation for declining, visible to the applicant
            </span>
            <textarea
              id={id}
              rows={2}
              maxLength={500}
              className={portalInputClass}
              disabled={action.blocked}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>
          <button
            type="button"
            className="gc-button gc-button-quiet"
            disabled={action.blocked}
            onClick={() =>
              command(
                "decline",
                "Decline this application with the explanation shown? The decision will remain in its private history."
              )
            }
          >
            Decline application
          </button>
        </>
      )}
      {coordinator &&
        application.state === "ACCEPTED" &&
        !application.completed && (
          <button
            type="button"
            className="gc-button gc-button-quiet"
            disabled={action.blocked}
            onClick={() =>
              command(
                "cancel",
                "Cancel this uncompleted volunteer assignment and release its place? Its decision history will remain."
              )
            }
          >
            Cancel assignment
          </button>
        )}
      {action.status}
    </div>
  );
}

function VolunteerAvailabilityForm({
  owner,
  application
}: {
  owner: string;
  application: VolunteerApplicationView;
}) {
  const id = useId();
  const [availability, setAvailability] = useState(application.availability);
  const action = usePrivateChoiceAction(
    endpoint,
    owner,
    availability !== application.availability
  );
  const save = (value: string) => {
    if (!action.blocked)
      void action.command({
        operation: "availability",
        id: application.id,
        expectedVersion: application.version,
        availability: value
      });
  };
  return (
    <form
      aria-label="Private volunteer availability"
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        save(availability);
      }}
    >
      <fieldset disabled={action.blocked} className="space-y-3">
        <legend className="font-semibold">Your availability</legend>
        {application.canEditAvailability ? (
          <>
            <label className="block space-y-2" htmlFor={id}>
              <span>
                Preferred days or times for this opportunity (optional)
              </span>
              <textarea
                id={id}
                rows={3}
                maxLength={500}
                className={portalInputClass}
                value={availability}
                aria-describedby={`${id}-help`}
                onChange={(e) => setAvailability(e.target.value)}
              />
            </label>
            <p id={`${id}-help`} className="text-sm text-gc-muted">
              Only you and this opportunity’s current authorized coordinators
              can read this preference. Include a time zone if needed. Keep out
              health details, screening documents and information about
              children. Saving does not change your assignment or calendar.
            </p>
          </>
        ) : (
          <p>You can still remove your saved availability.</p>
        )}
        <div className="flex flex-wrap gap-2">
          {application.canEditAvailability && (
            <button type="submit" className="gc-button">
              Save availability
            </button>
          )}
          {application.canClearAvailability && (
            <button
              type="button"
              className="gc-button gc-button-quiet"
              onClick={() => save("")}
            >
              Remove availability
            </button>
          )}
        </div>
      </fieldset>
      {action.status}
    </form>
  );
}
