"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { socialRequest, SocialClientError } from "@/lib/platform/social-client";
import {
  HelpCheck,
  HelpSelect,
  helpButton,
  type HelpCommand,
  type HelpPageData
} from "./interchurch-help-editor";

type Choices = Extract<HelpPageData, { view: "schedule" }>;
type Choice = Choices["choices"][number];
export type HelpLinkedSchedule = Choice & { changed: boolean };

export function HelpScheduleLink({
  owner,
  offerId,
  expectedVersion,
  requestTermsVersion,
  current,
  visible,
  blocked,
  command,
  onAccessDenied,
  onDirty
}: {
  owner: string;
  offerId: string;
  expectedVersion: number;
  requestTermsVersion: number;
  current: HelpLinkedSchedule | null;
  visible: boolean;
  blocked: boolean;
  command: HelpCommand;
  onAccessDenied: () => void;
  onDirty: (dirty: boolean) => void;
}) {
  const [kind, setKind] = useState("EVENT");
  const [page, setPage] = useState<Choices | null>(null);
  const [selected, setSelected] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState("");
  const live = useRef(false),
    generation = useRef(0);
  useEffect(() => {
    live.current =
      visible &&
      document.visibilityState !== "hidden" &&
      navigator.onLine !== false;
    const invalidate = () => {
      live.current = false;
      generation.current++;
    };
    const conceal = () => {
      invalidate();
      setPage(null);
      setSelected("");
      setLoading(false);
    };
    const visibility = () => {
      if (document.visibilityState === "hidden") conceal();
    };
    if (!visible) conceal();
    window.addEventListener("blur", conceal);
    window.addEventListener("offline", conceal);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      invalidate();
      window.removeEventListener("blur", conceal);
      window.removeEventListener("offline", conceal);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [visible]);

  async function load(after?: string) {
    if (blocked || loading || !live.current) return;
    const seq = ++generation.current;
    setLoading(true);
    setPage(null);
    setSelected("");
    setAccepted(false);
    setNotice("Checking schedules available to both participants…");
    try {
      const result = await socialRequest<Choices>(
        "/api/platform/exchange?" +
          new URLSearchParams({
            view: "help-schedule",
            id: offerId,
            category: kind,
            ...(after ? { after } : {})
          }),
        undefined,
        owner
      );
      if (seq !== generation.current || !live.current) return;
      if (result.data.view !== "schedule" || result.data.owner !== owner)
        throw new SocialClientError(
          401,
          "Your sign-in changed. Refresh this agreement."
        );
      setPage(result.data);
      setNotice(
        result.data.choices.length
          ? "Choose a current schedule below."
          : result.data.next
            ? "No eligible schedules in this group. Continue to the next group."
            : "No current schedules are available to both participants. Linking grants no access."
      );
    } catch (error) {
      if (seq !== generation.current || !live.current) return;
      if (
        error instanceof SocialClientError &&
        [401, 403, 404].includes(error.status)
      ) {
        live.current = false;
        generation.current++;
        setPage(null);
        setSelected("");
        setAccepted(false);
        setLoading(false);
        onAccessDenied();
        return;
      }
      setNotice(
        error instanceof Error
          ? error.message
          : "Schedules could not be checked. Try again."
      );
    } finally {
      if (seq === generation.current) setLoading(false);
    }
  }
  function change(schedule: Choice | null) {
    if (blocked || loading || !live.current || !accepted) return;
    void command({
      operation: "help-link-schedule",
      offerId,
      expectedVersion,
      requestTermsVersion,
      acceptTerms: true,
      schedule: schedule
        ? {
            kind: schedule.kind,
            id: schedule.id,
            fingerprint: schedule.fingerprint
          }
        : null
    });
  }
  if (!visible) return null;
  const choice = page?.choices.find((value) => value.id === selected);
  return (
    <section
      className="min-w-0 space-y-3 rounded-xl border p-3"
      aria-label="Agreement schedule link"
    >
      <h4 className="text-lg">Linked event or volunteer shift</h4>
      <p>
        Use the requesting church’s current schedule. Both participants need
        access. A link reserves no places, sends no RSVP and signs up no
        volunteers.
      </p>
      {current ? (
        <div className="space-y-2">
          <p>
            <Link prefetch={false} className="underline" href={current.href}>
              {current.title}
            </Link>
          </p>
          <p>
            {current.startLocal} to {current.endLocal} ({current.timeZone}).
            {current.allDay ? " All-day event; the end date is exclusive." : ""}
          </p>
          {current.changed && (
            <p role="status">
              The linked schedule changed. The terms above retain the previously
              agreed time. Review this current schedule and update the link
              before either participant acknowledges or shares contact details.
            </p>
          )}
        </div>
      ) : (
        <p>
          No event or shift is linked. The agreement keeps its own proposed
          time.
        </p>
      )}
      <fieldset className="min-w-0 space-y-3" disabled={blocked || loading}>
        <HelpSelect
          label="Schedule type"
          value={kind}
          choices={{ EVENT: "Event", VOLUNTEER_SLOT: "Volunteer shift" }}
          onChange={(value) => {
            generation.current++;
            setKind(value);
            setPage(null);
            setSelected("");
            setAccepted(false);
            setNotice("");
          }}
        />
        <button
          type="button"
          className={helpButton}
          onClick={() => void load()}
        >
          Find current schedules
        </button>
        {page && page.choices.length > 0 && (
          <HelpSelect
            label="Current schedule"
            value={selected}
            choices={Object.fromEntries(
              page.choices.map((v) => [
                v.id,
                `${v.title}: ${v.startLocal} (${v.timeZone})`
              ])
            )}
            onChange={(value) => {
              setSelected(value);
              setAccepted(false);
              onDirty(true);
            }}
          />
        )}
        {choice && (
          <p>
            {choice.startLocal} to {choice.endLocal} ({choice.timeZone}).
            {choice.allDay ? " All-day event; the end date is exclusive." : ""}
          </p>
        )}
        {page?.next && (
          <button
            type="button"
            className={helpButton}
            onClick={() => void load(page.next!)}
          >
            Next schedules
          </button>
        )}
        <HelpCheck
          checked={accepted}
          onChange={(value) => {
            setAccepted(value);
            onDirty(true);
          }}
        >
          I propose this schedule change. Both participants must acknowledge the
          resulting agreement again, and previous contact sharing will be
          cleared.
        </HelpCheck>
        {choice && (
          <button
            type="button"
            className={helpButton}
            disabled={!accepted}
            onClick={() => change(choice)}
          >
            Link selected schedule
          </button>
        )}
        {current?.changed && (
          <button
            type="button"
            className={helpButton}
            disabled={!accepted}
            onClick={() => change(current)}
          >
            Use current linked schedule
          </button>
        )}
        {current && (
          <button
            type="button"
            className={helpButton}
            disabled={!accepted}
            onClick={() => change(null)}
          >
            Remove schedule link
          </button>
        )}
      </fieldset>
      <p role="status">{notice}</p>
    </section>
  );
}
