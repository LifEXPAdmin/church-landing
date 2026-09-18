import { createHash } from "node:crypto";
import type { ReactNode } from "react";
import { PrivateSnapshotGuard } from "./private-snapshot-guard";
import { CalendarFormOwner } from "./calendar-form";

export function calendarReadUrl(
  view: string,
  query: Record<string, string | string[] | undefined> = {}
) {
  const params = new URLSearchParams({ view });
  for (const [key, value] of Object.entries(query)) {
    if (Array.isArray(value)) value.forEach((item) => params.append(key, item));
    else if (value !== undefined) params.set(key, value);
  }
  return `/api/platform/calendars?${params}`;
}

// Use the same canonical projection as its GET boundary. Public fallback pages
// remain readable without a session; private snapshots wait for current access.
export function CalendarSnapshot({
  owner,
  url,
  snapshot,
  label,
  children
}: {
  owner?: string | null;
  url: string;
  snapshot: unknown;
  label: string;
  children: ReactNode;
}) {
  if (!owner) return children;
  return (
    <PrivateSnapshotGuard
      key={`${owner}:${url}`}
      owner={owner}
      url={url}
      checksum={createHash("sha256")
        .update(JSON.stringify(snapshot))
        .digest("hex")}
      label={label}
    >
      <CalendarFormOwner owner={owner}>{children}</CalendarFormOwner>
    </PrivateSnapshotGuard>
  );
}
