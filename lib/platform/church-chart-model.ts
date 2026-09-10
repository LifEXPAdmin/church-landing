import type { PositionSummary } from "./church-structure-types";

export const CHART_GRID = 20;
export const CHART_MAX_COORDINATE = 100_000;
export const CHART_MAX_POSITIONS = 200;
export const CHART_MAX_DEPTH = 12;
export type ChartPlacement = Pick<
  PositionSummary,
  "id" | "parentId" | "placement"
> & {
  layout: { x: number; y: number } | null;
};
export type ChartChange = ChartPlacement;

export class ChartDraftError extends Error {}

export function snapChartCoordinate(value: number): number {
  return Math.max(
    0,
    Math.min(CHART_MAX_COORDINATE, Math.round(value / CHART_GRID) * CHART_GRID)
  );
}

// Shared by draft gestures, the non-drag picker and the transaction. This accepts
// geometry/placement only; assignment IDs, people and permissions are never drafts.
export function parseChartChanges(value: unknown): ChartChange[] {
  if (
    !Array.isArray(value) ||
    !value.length ||
    value.length > CHART_MAX_POSITIONS
  )
    throw new ChartDraftError("Review between one and 200 position changes.");
  const ids = new Set<string>();
  return value.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item))
      throw new ChartDraftError("Check the proposed position changes.");
    if (
      Object.keys(item).some(
        (key) => !["id", "parentId", "placement", "layout"].includes(key)
      )
    )
      throw new ChartDraftError(
        "Chart changes can only change placement and layout."
      );
    const { id, parentId, placement, layout } = item;
    if (
      typeof id !== "string" ||
      !/^[A-Za-z0-9_-]{1,100}$/.test(id) ||
      ids.has(id)
    )
      throw new ChartDraftError("Each changed position must appear once.");
    ids.add(id);
    if (
      (parentId !== null &&
        (typeof parentId !== "string" ||
          !/^[A-Za-z0-9_-]{1,100}$/.test(parentId))) ||
      !["ROOT", "UNCONNECTED", "REPORTING"].includes(placement) ||
      (placement === "REPORTING") !== (parentId !== null)
    )
      throw new ChartDraftError(
        "Choose one reporting parent, Top of chart or Not connected yet."
      );
    if (
      layout !== null &&
      (!layout ||
        typeof layout !== "object" ||
        Array.isArray(layout) ||
        Object.keys(layout).length !== 2 ||
        !Object.hasOwn(layout, "x") ||
        !Object.hasOwn(layout, "y") ||
        [layout.x, layout.y].some(
          (number) =>
            !Number.isSafeInteger(number) ||
            number < 0 ||
            number > CHART_MAX_COORDINATE ||
            number % CHART_GRID !== 0
        ))
    )
      throw new ChartDraftError(
        "Use a position inside the chart grid, or automatic placement."
      );
    return {
      id,
      parentId,
      placement,
      layout: layout === null ? null : { x: layout.x, y: layout.y }
    };
  });
}

export function validateChartGraph(positions: ChartPlacement[]) {
  if (positions.length > CHART_MAX_POSITIONS)
    throw new ChartDraftError("Use no more than 200 active positions.");
  const byId = new Map(positions.map((p) => [p.id, p]));
  if (byId.size !== positions.length)
    throw new ChartDraftError("Each position must appear once.");
  for (const p of positions) {
    if ((p.placement === "REPORTING") !== (p.parentId !== null))
      throw new ChartDraftError(
        "Choose one reporting parent, Top of chart or Not connected yet."
      );
    const seen = new Set<string>();
    let current: string | null = p.id;
    while (current) {
      if (seen.has(current))
        throw new ChartDraftError(
          "A position cannot report to itself or one of its descendants."
        );
      seen.add(current);
      if (seen.size > CHART_MAX_DEPTH)
        throw new ChartDraftError(
          "Use no more than 12 levels of reporting positions."
        );
      const row = byId.get(current);
      if (!row)
        throw new ChartDraftError(
          "Choose an active reporting position in this church."
        );
      current = row.parentId;
    }
  }
}

export function applyChartChanges<T extends ChartPlacement>(
  positions: T[],
  changes: ChartChange[]
): T[] {
  const updates = new Map(changes.map((change) => [change.id, change]));
  if (
    updates.size !== changes.length ||
    changes.some((change) => !positions.some((p) => p.id === change.id))
  )
    throw new ChartDraftError(
      "A changed position is no longer available in this church. Keep your draft and review current positions."
    );
  const next = positions.map((p) => ({ ...p, ...(updates.get(p.id) ?? {}) }));
  validateChartGraph(next);
  return next;
}

export function chartChanges(
  before: ChartPlacement[],
  after: ChartPlacement[]
): ChartChange[] {
  const original = new Map(before.map((p) => [p.id, p]));
  return after
    .filter((p) => {
      const old = original.get(p.id);
      return (
        !old ||
        old.parentId !== p.parentId ||
        old.placement !== p.placement ||
        old.layout?.x !== p.layout?.x ||
        old.layout?.y !== p.layout?.y
      );
    })
    .map(({ id, parentId, placement, layout }) => ({
      id,
      parentId,
      placement,
      layout
    }));
}

export function chartBranch(
  positions: ChartPlacement[],
  id: string
): Set<string> {
  const branch = new Set([id]);
  for (let index = 0; index < CHART_MAX_DEPTH; index++) {
    const count = branch.size;
    for (const p of positions)
      if (p.parentId && branch.has(p.parentId)) branch.add(p.id);
    if (count === branch.size) break;
  }
  return branch;
}

export function moveChartBranch<T extends ChartPlacement>(
  positions: T[],
  id: string,
  placement: ChartPlacement["placement"],
  parentId: string | null
): T[] {
  const branch = chartBranch(positions, id);
  const changes = positions
    .filter((p) => branch.has(p.id))
    .map((p) => ({
      id: p.id,
      parentId: p.id === id ? parentId : p.parentId,
      placement: p.id === id ? placement : p.placement,
      layout: null
    }));
  if (!changes.length)
    throw new ChartDraftError("This position is no longer available.");
  return applyChartChanges(positions, changes);
}
