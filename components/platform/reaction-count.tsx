"use client";
import { useReadingPreferences } from "./reading-preferences";

/** A hidden total is absent from rendered text and accessible names, not zero. */
export function ReactionCount({
  count,
  prefix = "",
  suffix = "",
  hide
}: {
  count: number | null;
  prefix?: string;
  suffix?: string;
  hide?: boolean;
}) {
  const { preferences } = useReadingPreferences();
  if (
    (hide ?? preferences.hideReactionCounts) ||
    count === null ||
    !Number.isSafeInteger(count) ||
    count < 0
  )
    return null;
  return (
    <span className="gc-reaction-count">
      {prefix}
      {count}
      {suffix}
    </span>
  );
}
