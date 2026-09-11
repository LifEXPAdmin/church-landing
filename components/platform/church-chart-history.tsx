"use client";

import Link from "next/link";
import { useState } from "react";
import type { ChartHistoryPage } from "@/lib/platform/church-chart-history";
import type { StructureSnapshot } from "@/lib/platform/church-structure-types";
import { useChurchRefresh } from "./use-church-refresh";
import { portalLinkClass } from "./portal-ui";
import { chartControlClass } from "./church-chart-editor-controls";

type Placement =
  ChartHistoryPage["entries"][number]["changes"][number]["before"];
const describe = (value: Placement) =>
  `${value.placement === "ROOT" ? "Top of chart" : value.placement === "UNCONNECTED" ? "Not connected yet" : `Reports to ${value.parentName}`}; ${value.layout ? `grid ${value.layout.x}, ${value.layout.y}` : "automatic layout"}`;
export function ChurchChartHistory({
  churchId,
  initial,
  cursor
}: {
  churchId: string;
  initial: ChartHistoryPage;
  cursor?: string;
}) {
  const [current, setCurrent] = useState<ChartHistoryPage | null>(initial);
  const base = `/platform/churches/${encodeURIComponent(churchId)}/structure`;
  const { pending, refresh } = useChurchRefresh({
    url: `/api/platform/church-structure?${new URLSearchParams({ churchId, view: "history", ...(cursor ? { cursor } : {}) })}`,
    onData(value) {
      const data = value as StructureSnapshot;
      if (
        data.church?.id !== churchId ||
        !data.capabilities?.includes("MANAGE_STRUCTURE") ||
        !data.chartHistory ||
        !Array.isArray(data.chartHistory.entries)
      )
        throw new Error("History is unavailable");
      setCurrent(data.chartHistory);
    },
    onUnavailable() {
      setCurrent(null);
    }
  });
  return (
    <section aria-label="Saved chart history" className="space-y-5">
      <Link className={portalLinkClass} href={base}>
        Back to church chart
      </Link>
      <p className="text-sm text-gc-muted">
        Saved reporting and layout changes. Names reflect current church
        sharing; unlisted members and unavailable positions stay unnamed. This
        history does not restore assignments or permissions.
      </p>
      {current ? (
        <>
          {!current.entries.length && (
            <p>No chart saves are available on this page.</p>
          )}
          <ol className="space-y-5">
            {current.entries.map((entry) => (
              <li
                key={entry.version}
                className="space-y-3 rounded-2xl border border-gc-divider bg-gc-surface p-5"
              >
                <h2 className="text-2xl">Chart version {entry.version}</h2>
                <p className="text-sm text-gc-muted">
                  Saved by {entry.actor} ·{" "}
                  <time dateTime={entry.savedAt}>
                    {entry.savedAt
                      .replace("T", " ")
                      .replace(/\.\d{3}Z$/, " UTC")}
                  </time>
                </p>
                {entry.changesUnavailable ? (
                  <p>These saved change details are unavailable.</p>
                ) : (
                  <ul className="space-y-3">
                    {entry.changes.map((change, index) => (
                      <li
                        key={change.positionId ?? index}
                        className="space-y-1"
                      >
                        {change.positionId ? (
                          <Link
                            className={portalLinkClass}
                            href={`${base}/${encodeURIComponent(change.positionId)}`}
                          >
                            {change.name} · {change.positionId.slice(-6)}
                          </Link>
                        ) : (
                          <p className="font-semibold">{change.name}</p>
                        )}
                        <p className="text-sm">
                          <span className="font-semibold">Before:</span>{" "}
                          {describe(change.before)}
                        </p>
                        <p className="text-sm">
                          <span className="font-semibold">After:</span>{" "}
                          {describe(change.after)}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ol>
          {current.cursor && (
            <Link
              className={portalLinkClass}
              href={`${base}/history?cursor=${encodeURIComponent(current.cursor)}`}
            >
              Older chart changes
            </Link>
          )}
          {cursor && (
            <Link className={portalLinkClass} href={`${base}/history`}>
              Latest chart changes
            </Link>
          )}
        </>
      ) : (
        <p role="status" className="rounded-xl bg-gc-subtle p-4">
          Current history access could not be confirmed. Saved details are
          hidden until your connection and church permission are available.
        </p>
      )}
      <button
        className={chartControlClass}
        type="button"
        disabled={pending}
        onClick={() => void refresh()}
      >
        {pending ? "Checking chart history…" : "Refresh chart history"}
      </button>
    </section>
  );
}
