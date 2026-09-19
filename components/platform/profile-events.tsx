"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { ProfileEventView } from "@/lib/platform/profile-events";
import { socialRequest } from "@/lib/platform/social-client";
import { accountInputClass } from "./account-form";
import { LocalEventTime } from "./local-event-time";
import { useReadVisibility } from "./read-visibility";

export function ProfileEventPicker({
  owner,
  selected,
  disabled,
  onSelect,
  onBusy
}: {
  owner: string;
  selected: string | null | undefined;
  disabled: boolean;
  onSelect: (id: string | null) => void;
  onBusy: (busy: boolean) => void;
}) {
  const [link, setLink] = useState(
    selected ? `/platform/events/${selected}` : ""
  );
  const [choice, setChoice] = useState<ProfileEventView | null>(null);
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const generation = useRef(0),
    busy = useRef(false);
  const visible = useReadVisibility();
  useEffect(() => {
    const counter = generation;
    const clear = () => {
      counter.current++;
      setChoice(null);
    };
    if (!visible) clear();
    window.addEventListener("blur", clear);
    window.addEventListener("social-relationships-changed", clear);
    return () => {
      counter.current++;
      window.removeEventListener("blur", clear);
      window.removeEventListener("social-relationships-changed", clear);
    };
  }, [visible]);
  return (
    <fieldset className="min-w-0 space-y-3" disabled={disabled || pending}>
      <legend className="text-2xl">Selected event (optional)</legend>
      <p className="text-sm text-gc-muted">
        Choose one existing event to show on your profile. Its own audience
        still applies. Selecting it does not publish a private calendar, RSVP or
        change the event.
      </p>
      <Link
        className="gc-profile-text-button"
        href="/platform/calendars"
        prefetch={false}
      >
        Find an event in My calendars
      </Link>
      <label className="block" htmlFor="profile-event-link">
        Existing event page link
      </label>
      <input
        id="profile-event-link"
        className={accountInputClass}
        maxLength={500}
        value={link}
        onChange={(event) => {
          setLink(event.target.value);
          generation.current++;
          setChoice(null);
          setMessage("");
        }}
        aria-describedby="profile-event-selection"
      />
      <button
        type="button"
        className="gc-profile-text-button"
        onClick={async () => {
          if (busy.current || !visible) return;
          busy.current = true;
          setPending(true);
          onBusy(true);
          const seq = ++generation.current;
          setChoice(null);
          setMessage("Checking the original event...");
          try {
            const url = new URL(link, location.origin),
              match = url.pathname.match(
                /^\/platform\/events\/([A-Za-z0-9_-]{1,100})$/
              );
            if (
              url.origin !== location.origin ||
              !match ||
              [...url.searchParams.keys()].some((key) => key !== "timeZone") ||
              url.searchParams.getAll("timeZone").length > 1 ||
              url.hash ||
              url.username ||
              url.password
            )
              throw Error(
                "Paste an event page link from this website without extra options or fragment values."
              );
            const { data } = await socialRequest<{
              viewerId: string;
              event: ProfileEventView;
            }>(
              `/api/platform/profile?${new URLSearchParams({ view: "event-choice", occurrenceId: match[1] })}`,
              undefined,
              owner
            );
            if (data.viewerId !== owner)
              throw Error("Your sign-in changed. Reload before continuing.");
            if (seq === generation.current) {
              setChoice(data.event);
              setMessage("");
            }
          } catch (error) {
            if (seq === generation.current)
              setMessage(
                error instanceof Error
                  ? error.message
                  : "The event could not be checked."
              );
          } finally {
            busy.current = false;
            setPending(false);
            onBusy(false);
          }
        }}
      >
        Check original event
      </button>
      {visible && choice && (
        <div className="space-y-2 rounded-lg border border-gc-divider p-3">
          <p className="font-semibold">{choice.title}</p>
          <LocalEventTime event={choice} />
          <button
            type="button"
            className="gc-profile-text-button"
            onClick={() => {
              onSelect(choice.id);
              setChoice(null);
              setMessage("Event selected. Save profile to apply this choice.");
            }}
          >
            Use this event
          </button>
        </div>
      )}
      <p id="profile-event-selection" className="text-sm">
        {selected
          ? "One event is selected. Viewers see it only while they have access to the original event."
          : "No event is selected."}
      </p>
      {selected && (
        <button
          type="button"
          className="gc-profile-text-button"
          onClick={() => {
            generation.current++;
            setChoice(null);
            setLink("");
            onSelect(null);
            setMessage(
              "Selection removed. Save profile to apply this change. The event is unchanged."
            );
          }}
        >
          Remove selected event
        </button>
      )}
      <p role="status">{message}</p>
    </fieldset>
  );
}
