import type { PositionSummary } from "./church-structure-types";

export const CHART_CARD_WIDTH = 280;
const GAP = 40;
const LEVEL_GAP = 76;
const PADDING = 24;
export type ChartNode = {
  position: PositionSummary;
  x: number;
  y: number;
  logicalX: number;
  logicalY: number;
  height: number;
  children: number;
};

// Layout consumes only the member-safe projection. Saved coordinates place
// cards, while parent IDs alone determine reporting relationships.
export function churchChartLayout(
  positions: PositionSummary[],
  collapsed: ReadonlySet<string> = new Set(),
  heights: ReadonlyMap<string, number> = new Map()
) {
  const children = new Map<string, PositionSummary[]>();
  for (const p of positions) {
    if (!p.parentId) continue;
    const siblings = children.get(p.parentId) ?? [];
    siblings.push(p);
    children.set(p.parentId, siblings);
  }
  const roots = positions.filter((p) => p.placement === "ROOT" && !p.parentId);
  const connected = new Set<string>();
  const visitConnected = (p: PositionSummary) => {
    if (connected.has(p.id)) return;
    connected.add(p.id);
    for (const child of children.get(p.id) ?? []) visitConnected(child);
  };
  roots.forEach(visitConnected);
  const widths = new Map<string, number>();
  const levels: number[] = [];
  const measure = (p: PositionSummary, depth: number): number => {
    // Defensive cycle guard; saved graphs are validated independently by server.
    if (widths.has(p.id)) return 0;
    widths.set(p.id, CHART_CARD_WIDTH);
    levels[depth] = Math.max(levels[depth] ?? 0, heights.get(p.id) ?? 340);
    const visible = collapsed.has(p.id) ? [] : (children.get(p.id) ?? []);
    const width = Math.max(
      CHART_CARD_WIDTH,
      visible.reduce((sum, child) => sum + measure(child, depth + 1), 0) +
        Math.max(0, visible.length - 1) * GAP
    );
    widths.set(p.id, width);
    return width;
  };
  roots.forEach((p) => measure(p, 0));
  const offsets = levels.map(
    (_, depth) =>
      PADDING +
      levels.slice(0, depth).reduce((sum, h) => sum + h + LEVEL_GAP, 0)
  );
  const nodes: ChartNode[] = [];
  const seen = new Set<string>();
  const place = (p: PositionSummary, left: number, depth: number) => {
    if (seen.has(p.id)) return;
    seen.add(p.id);
    nodes.push({
      position: p,
      x: left + ((widths.get(p.id) ?? CHART_CARD_WIDTH) - CHART_CARD_WIDTH) / 2,
      y: offsets[depth],
      logicalX: 0,
      logicalY: 0,
      height: heights.get(p.id) ?? 340,
      children: children.get(p.id)?.length ?? 0
    });
    if (collapsed.has(p.id)) return;
    for (const child of children.get(p.id) ?? []) {
      place(child, left, depth + 1);
      left += (widths.get(child.id) ?? CHART_CARD_WIDTH) + GAP;
    }
  };
  let left = PADDING;
  for (const root of roots) {
    place(root, left, 0);
    left += (widths.get(root.id) ?? CHART_CARD_WIDTH) + GAP;
  }
  const byId = new Map(nodes.map((node) => [node.position.id, node]));
  const translations = new Map<string, { x: number; y: number }>();
  for (const node of nodes) {
    const inherited = translations.get(node.position.parentId ?? "");
    node.logicalX = node.position.layout?.x ?? node.x + (inherited?.x ?? 0);
    node.logicalY = node.position.layout?.y ?? node.y + (inherited?.y ?? 0);
    translations.set(node.position.id, {
      x: node.logicalX - node.x,
      y: node.logicalY - node.y
    });
  }
  // Moving a parent carries automatically placed descendants with it. Their
  // derived coordinates can extend left/up of zero; shift the view, not the
  // persisted grid coordinates, so every card remains reachable.
  const originX = Math.max(
    0,
    PADDING - Math.min(PADDING, ...nodes.map((n) => n.logicalX))
  );
  const originY = Math.max(
    0,
    PADDING - Math.min(PADDING, ...nodes.map((n) => n.logicalY))
  );
  for (const node of nodes) {
    node.x = node.logicalX + originX;
    node.y = node.logicalY + originY;
  }
  return {
    nodes,
    connected,
    unconnected: positions.filter((p) => !connected.has(p.id)),
    originX,
    originY,
    width: Math.max(
      CHART_CARD_WIDTH + PADDING * 2,
      ...nodes.map((n) => n.x + CHART_CARD_WIDTH + PADDING)
    ),
    height: Math.max(200, ...nodes.map((n) => n.y + n.height + PADDING)),
    edges: nodes.flatMap((node) => {
      const parent = node.position.parentId
        ? byId.get(node.position.parentId)
        : undefined;
      return parent ? [{ parent, child: node }] : [];
    })
  };
}

export function searchChurchPositions(
  positions: PositionSummary[],
  query: string
) {
  const words = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  return positions.filter((p) => {
    const text = [p.name, ...p.assignments.map((a) => a.name ?? "")]
      .join(" ")
      .toLocaleLowerCase();
    return words.every((word) => text.includes(word));
  });
}

export function chartAncestors(
  positions: PositionSummary[],
  id: string
): string[] {
  const byId = new Map(positions.map((p) => [p.id, p]));
  const ancestors: string[] = [];
  const seen = new Set([id]);
  let parent = byId.get(id)?.parentId;
  while (parent && !seen.has(parent)) {
    seen.add(parent);
    ancestors.push(parent);
    parent = byId.get(parent)?.parentId;
  }
  return ancestors;
}
