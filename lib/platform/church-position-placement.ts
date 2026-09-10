import type { PositionSummary } from "./church-structure-types";

type PlacementPosition = Pick<PositionSummary, "id" | "parentId" | "placement">;

export function positionPlacementLabel(
  position: PlacementPosition,
  positions: PlacementPosition[]
): string {
  const seen = new Set<string>();
  let current = position;
  while (current.parentId && !seen.has(current.id)) {
    seen.add(current.id);
    const parent = positions.find((p) => p.id === current.parentId);
    if (!parent) return "Placement is unavailable";
    current = parent;
  }
  if (current.placement === "UNCONNECTED")
    return position.parentId
      ? "In a branch not connected yet"
      : "Not connected yet";
  return position.placement === "ROOT" ? "Top of chart" : "Connected in chart";
}

export function canReportTo(
  positionId: string,
  parentId: string,
  positions: PlacementPosition[]
): boolean {
  const seen = new Set<string>();
  let current = positions.find((p) => p.id === parentId);
  while (current && !seen.has(current.id)) {
    if (current.id === positionId) return false;
    seen.add(current.id);
    current = positions.find((p) => p.id === current?.parentId);
  }
  return true;
}
