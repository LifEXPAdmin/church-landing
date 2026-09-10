import test from "node:test";
import assert from "node:assert/strict";
import {
  applyChartChanges,
  chartChanges,
  moveChartBranch,
  parseChartChanges,
  snapChartCoordinate,
  validateChartGraph,
  type ChartPlacement
} from "../lib/platform/church-chart-model";

const node = (id: string, parentId: string | null = null): ChartPlacement => ({
  id,
  parentId,
  placement: parentId ? "REPORTING" : "ROOT",
  layout: null
});

test("draft moves preserve the branch and extra assignment fields; undo uses geometry only", () => {
  const positions = [node("a"), node("b", "a"), node("c", "b"), node("d")].map(
    (p) => ({
      ...p,
      assignments: [
        { id: `assignment-${p.id}`, capabilities: ["PUBLISH_CHURCH_POSTS"] }
      ]
    })
  );
  const original = structuredClone(positions);
  const moved = moveChartBranch(positions, "b", "REPORTING", "d");
  assert.equal(moved.find((p) => p.id === "b")?.parentId, "d");
  assert.equal(moved.find((p) => p.id === "c")?.parentId, "b");
  assert.deepEqual(
    moved.map((p) => p.assignments),
    original.map((p) => p.assignments)
  );
  assert.deepEqual(chartChanges(positions, moved), [{ ...node("b", "d") }]);
  assert.deepEqual(positions, original);
  const detached = moveChartBranch(moved, "b", "UNCONNECTED", null);
  assert.equal(detached.find((p) => p.id === "c")?.parentId, "b");
  assert.equal(detached.find((p) => p.id === "b")?.placement, "UNCONNECTED");
  assert.equal(
    JSON.stringify(chartChanges(moved, detached)).includes("assignment"),
    false
  );
});

test("layout changes snap and preserve reporting; automatic placement can be restored", () => {
  const positions = [node("a"), node("b", "a")];
  const next = applyChartChanges(positions, [
    {
      ...node("b", "a"),
      layout: { x: snapChartCoordinate(453), y: snapChartCoordinate(-30) }
    }
  ]);
  assert.deepEqual(next[1].layout, { x: 460, y: 0 });
  assert.equal(next[1].parentId, "a");
  assert.equal(snapChartCoordinate(100_001), 100_000);
  assert.deepEqual(applyChartChanges(next, [{ ...node("b", "a") }]), positions);
});

test("invalid self, descendant, absent target and excessive depth moves leave drafts unchanged", () => {
  const positions = [node("a"), node("b", "a"), node("c", "b")];
  const before = structuredClone(positions);
  for (const parent of ["a", "b", "c", "another-church-position"])
    assert.throws(() => moveChartBranch(positions, "a", "REPORTING", parent));
  assert.throws(() => applyChartChanges(positions, [node("absent")]));
  assert.throws(() => applyChartChanges(positions, [node("a"), node("a")]));
  const deep = Array.from({ length: 13 }, (_, i) =>
    node(String(i), i ? String(i - 1) : null)
  );
  assert.throws(() => validateChartGraph(deep), /12 levels/);
  assert.deepEqual(positions, before);
});

test("reviewed payload rejects forged authority, duplicate IDs and malformed layout or placement", () => {
  const good = node("position");
  assert.deepEqual(parseChartChanges([good]), [good]);
  for (const bad of [
    undefined,
    [],
    [good, good],
    [{ ...good, capabilities: ["MANAGE_STRUCTURE"] }],
    [{ ...good, connectionId: "private" }],
    [{ ...good, placement: "REPORTING" }],
    [{ ...good, parentId: "other" }],
    [{ ...good, parentId: ["other"] }],
    [{ ...good, layout: { x: 2, y: 20 } }],
    [{ ...good, layout: { x: 20, y: Infinity } }],
    [{ ...good, layout: { x: -20, y: 0 } }],
    [{ ...good, layout: { x: 0, y: 100020 } }],
    [{ ...good, layout: { x: 0, y: 0, permissions: [] } }],
    Array.from({ length: 201 }, (_, i) => node(String(i)))
  ])
    assert.throws(() => parseChartChanges(bad));
});

test("a combined edge inversion validates the final graph rather than an intermediate cycle", () => {
  const before = [node("a"), node("b", "a"), node("c", "b")];
  assert.throws(() => applyChartChanges(before, [node("a", "b")]));
  const next = applyChartChanges(before, [node("a", "b"), node("b")]);
  assert.equal(next[0].parentId, "b");
  assert.equal(next[1].parentId, null);
  assert.equal(next[2].parentId, "b");
});
