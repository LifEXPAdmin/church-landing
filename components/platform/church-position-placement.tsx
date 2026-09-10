"use client";

import { useState } from "react";
import type { PositionSummary } from "@/lib/platform/church-structure-types";
import {
  canReportTo,
  positionPlacementLabel
} from "@/lib/platform/church-position-placement";
import { PortalActionForm, portalInputClass } from "./portal-action-form";

type PlacementPosition = Pick<
  PositionSummary,
  "id" | "name" | "parentId" | "placement"
>;

export function ChurchPositionPlacement({
  churchId,
  version,
  row,
  positions
}: {
  churchId: string;
  version: number;
  row: PlacementPosition;
  positions: PlacementPosition[];
}) {
  const [target, setTarget] = useState(row.parentId ?? row.placement);
  const [busy, setBusy] = useState(false);
  const placement =
    target === "ROOT" || target === "UNCONNECTED" ? target : "REPORTING";
  const parentId = placement === "REPORTING" ? target : null;
  return (
    <div className="space-y-4">
      <p>
        Current placement: {positionPlacementLabel(row, positions)}. Moving this
        position keeps its branch, assignments and permissions.
      </p>
      <label className="block font-semibold">
        Reports to or placement
        <select
          className={portalInputClass}
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          disabled={busy}
        >
          <option value="UNCONNECTED">Not connected yet</option>
          <option value="ROOT">Top of chart</option>
          {positions
            .filter((p) => canReportTo(row.id, p.id, positions))
            .map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} · {p.id.slice(-6)}
              </option>
            ))}
        </select>
      </label>
      <PortalActionForm
        structureAction="place"
        onBusyChange={setBusy}
        payload={{
          churchId,
          positionId: row.id,
          expectedVersion: version,
          placement,
          parentId: parentId ?? ""
        }}
        label="Save placement"
        description="Choose a reporting position, the top of the chart, or Not connected yet. This does not change anyone’s privileges."
      />
    </div>
  );
}
