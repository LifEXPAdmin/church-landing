import test from "node:test";
import assert from "node:assert/strict";
import {
  CHART_CARD_WIDTH,
  chartAncestors,
  churchChartLayout,
  searchChurchPositions
} from "../lib/platform/church-chart-layout";
import type { PositionSummary } from "../lib/platform/church-structure-types";

function position(
  id: string,
  parentId: string | null = null,
  placement: PositionSummary["placement"] = parentId ? "REPORTING" : "ROOT"
): PositionSummary {
  return {
    id,
    parentId,
    placement,
    name: `Role ${id}`,
    description: "",
    assignments: []
  };
}
function noOverlap(layout: ReturnType<typeof churchChartLayout>) {
  for (const [index, a] of layout.nodes.entries()) {
    assert.ok(a.x >= 0 && a.y >= 0);
    assert.ok(a.x + CHART_CARD_WIDTH <= layout.width);
    assert.ok(a.y + a.height <= layout.height);
    for (const b of layout.nodes.slice(index + 1))
      assert.ok(
        a.x + CHART_CARD_WIDTH <= b.x ||
          b.x + CHART_CARD_WIDTH <= a.x ||
          a.y + a.height <= b.y ||
          b.y + b.height <= a.y,
        `${a.position.id} overlaps ${b.position.id}`
      );
  }
  for (const { parent, child } of layout.edges) {
    assert.equal(child.position.parentId, parent.position.id);
    assert.ok(
      parent.y + parent.height < child.y,
      "A child must be below its parent, including enlarged text"
    );
  }
}

test("saved roots, unconnected branches and repeated titles remain distinct without changing assignments", () => {
  const positions = [
    position("a"),
    position("b", "a"),
    position("c"),
    position("u", null, "UNCONNECTED"),
    position("v", "u")
  ];
  positions[0].name = positions[1].name = "Volunteer";
  positions[0].assignments = [
    {
      id: "listed-a",
      name: "Shared Alex",
      connectionId: "listed",
      isSelf: false
    },
    { id: "unlisted-a", isSelf: false }
  ];
  positions[1].assignments = [
    {
      id: "listed-b",
      name: "Shared Alex",
      connectionId: "listed",
      isSelf: false
    }
  ];
  const before = structuredClone(positions);
  const layout = churchChartLayout(positions);
  assert.deepEqual(
    layout.nodes.map((n) => n.position.id),
    ["a", "b", "c"]
  );
  assert.deepEqual(
    layout.unconnected.map((p) => p.id),
    ["u", "v"]
  );
  assert.equal(layout.nodes[0].position.assignments.length, 2);
  assert.equal(layout.nodes[1].position.assignments.length, 1);
  assert.equal(layout.edges.length, 1);
  noOverlap(layout);
  assert.deepEqual(positions, before);
});

test("collapse hides descendants only; search can reopen a deep branch without exposing hidden identifiers", () => {
  const positions = [
    position("root"),
    position("branch", "root"),
    position("leaf", "branch"),
    position("other")
  ];
  positions[2].assignments = [{ id: "private-assignment-code", isSelf: false }];
  positions[2].description = "Description is not a directory search field";
  const collapsed = new Set(["branch"]);
  const layout = churchChartLayout(positions, collapsed);
  assert.deepEqual(
    layout.nodes.map((n) => n.position.id),
    ["root", "branch", "other"]
  );
  assert.equal(layout.connected.size, 4);
  assert.equal(
    layout.unconnected.length,
    0,
    "Collapsed descendants are still connected"
  );
  assert.equal(layout.nodes[1].children, 1);
  assert.deepEqual(chartAncestors(positions, "leaf"), ["branch", "root"]);
  assert.deepEqual(
    searchChurchPositions(positions, "private-assignment-code"),
    []
  );
  assert.deepEqual(searchChurchPositions(positions, "directory search"), []);
  assert.deepEqual(
    searchChurchPositions(positions, "  ROLE   LEAF ").map((p) => p.id),
    ["leaf"]
  );
  assert.deepEqual(searchChurchPositions(positions, " "), []);
  assert.deepEqual([...collapsed], ["branch"]);
});

test("a permitted person's search returns every separate role, including unconnected duties", () => {
  const positions = [
    position("one"),
    position("two"),
    position("three", null, "UNCONNECTED")
  ];
  for (const p of positions)
    p.assignments = [
      {
        id: `assignment-${p.id}`,
        name: "Shared Alex Example",
        connectionId: "same-person",
        isSelf: true
      }
    ];
  assert.deepEqual(
    searchChurchPositions(positions, " alex SHARED ").map((p) => p.id),
    ["one", "two", "three"]
  );
  assert.deepEqual(searchChurchPositions(positions, "same-person"), []);
});

test("200 positions with variable-height cards have bounded, non-overlapping layout", () => {
  const positions = Array.from({ length: 200 }, (_, index) =>
    position(String(index), index ? String(Math.floor((index - 1) / 3)) : null)
  );
  const heights = new Map(
    positions.map((p, index) => [p.id, 260 + (index % 7) * 110])
  );
  const layout = churchChartLayout(positions, new Set(), heights);
  assert.equal(layout.nodes.length, 200);
  assert.equal(layout.edges.length, 199);
  assert.ok(layout.width < 200 * (CHART_CARD_WIDTH + 40));
  noOverlap(layout);
  const deep = Array.from({ length: 12 }, (_, index) =>
    position(String(index), index ? String(index - 1) : null)
  );
  const deepLayout = churchChartLayout(deep, new Set(), heights);
  assert.equal(deepLayout.nodes.length, 12);
  assert.equal(deepLayout.width, CHART_CARD_WIDTH + 48);
  noOverlap(deepLayout);
});

test("an empty or incomplete projection never invents a root or a reporting edge", () => {
  assert.equal(churchChartLayout([]).nodes.length, 0);
  const positions = [
    position("missing-parent", "missing"),
    position("cycle-a", "cycle-b"),
    position("cycle-b", "cycle-a")
  ];
  const layout = churchChartLayout(positions);
  assert.equal(layout.nodes.length, 0);
  assert.equal(layout.edges.length, 0);
  assert.equal(layout.unconnected.length, 3);
  assert.deepEqual(chartAncestors(positions, "cycle-a"), ["cycle-b"]);
});
