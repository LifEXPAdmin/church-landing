"use client";

import Link from "next/link";
import { useState } from "react";
import type { PortalSnapshot } from "@/lib/platform/portal-types";
import {
  churchFocus,
  churchReturnQuery
} from "@/lib/platform/church-return-context";
import { PortalContactDetails, portalLinkClass } from "./portal-ui";
import { chartControlClass } from "./church-chart-editor-controls";
import { ChurchReturnFocus } from "./church-return-focus";
import { useChurchRefresh } from "./use-church-refresh";

type Entries = NonNullable<PortalSnapshot["directory"]>;
export function ChurchDirectory({
  churchId,
  entries,
  canAssign,
  focus
}: {
  churchId: string;
  entries: Entries;
  canAssign: boolean;
  focus?: string;
}) {
  const [current, setCurrent] = useState<{
    entries: Entries;
    canAssign: boolean;
  } | null>({ entries, canAssign });
  const [notice, setNotice] = useState("");
  const base = `/platform/churches/${encodeURIComponent(churchId)}`;
  const { pending, refresh } = useChurchRefresh({
    url: `/api/platform/portal?${new URLSearchParams({ view: "directory", churchId })}`,
    onData(value) {
      const data = value as PortalSnapshot;
      if (data.church?.id !== churchId || !Array.isArray(data.directory))
        throw new Error("Directory is unavailable.");
      const latest = data.directory.map((entry) => {
        if (!churchFocus(entry.connectionId) || typeof entry.name !== "string")
          throw new Error("Directory entry is unavailable.");
        return {
          connectionId: entry.connectionId,
          name: entry.name,
          ...(typeof entry.email === "string" ? { email: entry.email } : {}),
          ...(typeof entry.phone === "string" ? { phone: entry.phone } : {})
        };
      });
      setCurrent({
        entries: latest,
        canAssign: data.directoryCanAssignRoles === true
      });
      setNotice("");
    },
    onUnavailable(status) {
      setCurrent(null);
      setNotice(
        status === 401 || status === 403 || status === 404
          ? "Your current church directory access is unavailable. Shared details are hidden."
          : "Current directory information could not be confirmed. Shared details are hidden until the connection is restored."
      );
    }
  });
  return (
    <section aria-label="Shared church directory" className="space-y-4">
      {current ? (
        <>
          {current.canAssign && (
            <Link className={portalLinkClass} href={`${base}/structure/assign`}>
              Assign role and review privileges
            </Link>
          )}
          {current.entries.length ? (
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {current.entries.map((entry) => (
                <li
                  key={entry.connectionId}
                  className="min-w-0 break-words rounded-xl border border-gc-divider bg-gc-surface p-5"
                >
                  <h2 className="text-2xl text-gc-text">
                    <Link
                      className={portalLinkClass}
                      data-church-focus={entry.connectionId}
                      href={`${base}/people/${encodeURIComponent(entry.connectionId)}?${churchReturnQuery({ from: "directory", focus: entry.connectionId })}`}
                    >
                      {entry.name}
                    </Link>
                  </h2>
                  <PortalContactDetails
                    email={entry.email}
                    phone={entry.phone}
                  />
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-gc-muted">
              No members have chosen to share a directory listing yet.
            </p>
          )}
          <ChurchReturnFocus focus={focus} />
        </>
      ) : (
        <p role="status" className="rounded-xl bg-gc-subtle p-3 text-sm">
          {notice}
        </p>
      )}
      <button
        type="button"
        className={chartControlClass}
        disabled={pending}
        onClick={() => void refresh()}
      >
        {pending ? "Checking directory…" : "Refresh directory"}
      </button>
    </section>
  );
}
