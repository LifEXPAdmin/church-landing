"use client";

import Link from "next/link";
import { useState } from "react";
import type { StructureSnapshot } from "@/lib/platform/church-structure-types";
import {
  churchContactCardData,
  type ChurchContactCardData
} from "@/lib/platform/church-contact-card";
import {
  churchReturnHref,
  churchReturnLabel,
  churchReturnQuery,
  type ChurchReturnContext
} from "@/lib/platform/church-return-context";
import { useChurchRefresh } from "./use-church-refresh";
import { portalLinkClass, PortalContactDetails } from "./portal-ui";
import { chartControlClass } from "./church-chart-editor-controls";

export function ChurchContactCard({
  churchId,
  connectionId,
  initial,
  returnContext
}: {
  churchId: string;
  connectionId: string;
  initial: ChurchContactCardData;
  returnContext?: ChurchReturnContext;
}) {
  const [current, setCurrent] = useState<ChurchContactCardData | null>(initial);
  const [notice, setNotice] = useState("");
  const base = `/platform/churches/${encodeURIComponent(churchId)}`;
  const back = returnContext ?? {
    from: "directory" as const,
    focus: connectionId
  };
  const onward = returnContext ?? {
    from: "person" as const,
    focus: connectionId
  };
  const suffix = churchReturnQuery(onward);
  const { pending, refresh } = useChurchRefresh({
    url: `/api/platform/church-structure?${new URLSearchParams({ churchId, view: "person", connectionId })}`,
    onData(value) {
      const next = churchContactCardData(
        value as StructureSnapshot,
        connectionId
      );
      setCurrent(next);
      setNotice("");
    },
    onUnavailable(status) {
      setCurrent(null);
      setNotice(
        status === 401 || status === 403 || status === 404
          ? "This contact is no longer available to you. Church membership and sharing choices may have changed."
          : "Current contact information could not be confirmed. Shared details are hidden until the connection is restored."
      );
    }
  });
  return (
    <section
      aria-label="Shared church contact"
      className="space-y-5 rounded-2xl border border-gc-divider bg-gc-surface p-5"
    >
      <Link href={churchReturnHref(churchId, back)} className={portalLinkClass}>
        {churchReturnLabel(back)}
      </Link>
      {current ? (
        <>
          <h2 className="break-words text-3xl">{current.person.name}</h2>
          <PortalContactDetails
            email={current.person.email}
            phone={current.person.phone}
          />
          {!!current.person.email && !current.person.phone && (
            <p className="text-sm text-gc-muted">No phone number shared.</p>
          )}
          {!!current.person.phone && !current.person.email && (
            <p className="text-sm text-gc-muted">No contact email shared.</p>
          )}
          <div className="space-y-3">
            <h3 className="text-2xl">Church roles and responsibilities</h3>
            {current.roles.length ? (
              <ul className="space-y-3">
                {current.roles.map((role) => (
                  <li
                    key={role.positionId}
                    className="space-y-2 rounded-xl border border-gc-divider p-3"
                  >
                    <Link
                      className={portalLinkClass}
                      href={`${base}/structure/${encodeURIComponent(role.positionId)}?${suffix}`}
                    >
                      {role.name}
                    </Link>
                    <p className="text-sm text-gc-muted">{role.placement}</p>
                    <p className="whitespace-pre-wrap text-sm">
                      {role.description ||
                        "Responsibilities have not been added yet."}
                    </p>
                    {current.canManage && (
                      <Link
                        className={portalLinkClass}
                        href={`${base}/structure/assign?${new URLSearchParams({ positionId: role.positionId, assignmentId: role.assignmentId })}&${suffix}`}
                      >
                        Review privileges for {role.name}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-gc-muted">
                No current church roles are assigned.
              </p>
            )}
          </div>
          {current.canManage && (
            <Link
              className={portalLinkClass}
              href={`${base}/structure/assign?connectionId=${encodeURIComponent(connectionId)}&${suffix}`}
            >
              Assign role and review privileges
            </Link>
          )}
          <p className="text-sm text-gc-muted">
            These are the details this member currently shares with the church.
            Opening this card does not call or message them.
          </p>
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
        {pending ? "Checking shared details…" : "Refresh shared details"}
      </button>
    </section>
  );
}
