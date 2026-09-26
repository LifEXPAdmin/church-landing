"use client";
import type { SupportSnapshot } from "@/lib/platform/support-types";
import { PrivateReadSnapshot } from "./private-read-snapshot";
import {
  SupportNavigation,
  SupportEligibility,
  SupportListRows
} from "./support-list-presentation";

export function SupportIndex({
  owner,
  url,
  view
}: {
  owner: string;
  url: string;
  view: "requests" | "inbox";
}) {
  return (
    <PrivateReadSnapshot<SupportSnapshot>
      owner={owner}
      url={url}
      label="support request list"
      changedNotice="Your requests or access changed. Reload to inspect current details."
    >
      {(snapshot) => (
        <div className="space-y-6">
          <SupportNavigation staff={snapshot.staff} />
          <SupportEligibility adult={snapshot.viewer.adult} />
          <SupportListRows snapshot={snapshot} view={view} />
        </div>
      )}
    </PrivateReadSnapshot>
  );
}
