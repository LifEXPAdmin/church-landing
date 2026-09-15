"use client";
import { useId } from "react";
import { portalInputClass } from "./portal-action-form";
export function PostScheduleFields({
  local,
  zone,
  change
}: {
  local: string;
  zone: string;
  change: (local: string, zone: string) => void;
}) {
  const id = useId();
  return (
    <div className="min-w-0 space-y-3">
      <label className="block font-semibold" htmlFor={`${id}-time`}>
        Publication date and time
      </label>
      <input
        id={`${id}-time`}
        type="datetime-local"
        required
        value={local}
        className={`${portalInputClass} min-w-0 max-w-full`}
        onChange={(event) => change(event.target.value, zone)}
      />
      <label className="block font-semibold" htmlFor={`${id}-zone`}>
        Publication time zone
      </label>
      <input
        id={`${id}-zone`}
        required
        value={zone}
        maxLength={100}
        spellCheck={false}
        className={portalInputClass}
        placeholder="America/Chicago"
        onChange={(event) => change(local, event.target.value)}
      />
      <p className="break-words text-sm text-gc-muted">
        Use a time zone such as America/Chicago. Choose a future time within one
        year. A repeated or skipped daylight-saving time needs a different time.
        The post stays hidden until publication. Publishing access and linked
        content are checked again then. A restored plan, lost access or a delay
        over one day returns it to a draft for review.
      </p>
    </div>
  );
}
