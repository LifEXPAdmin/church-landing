import test from "node:test";
import assert from "node:assert/strict";
import {
  CHART_DRAFT_MAX_AGE,
  CHART_DRAFT_MAX_BYTES,
  churchChartDraftKey,
  readStoredChartDraft
} from "../lib/platform/church-chart-draft";
const now = 1_800_000_000_000;
const change = {
  id: "position",
  parentId: null,
  placement: "UNCONNECTED",
  layout: null
};
const record = () => ({
  format: 1,
  churchId: "church",
  connectionId: "member",
  updatedAt: now,
  version: 4,
  changes: [change],
  retry: null as null | {
    expectedVersion: number;
    requestKey: string;
    changes: (typeof change)[];
  }
});
const read = (value: unknown, church = "church", member = "member") =>
  readStoredChartDraft(JSON.stringify(value), church, member, now);

test("chart drafts restore only bounded geometry for the same church and member", () => {
  assert.deepEqual(read(record()), record());
  assert.notEqual(
    churchChartDraftKey("church", "member"),
    churchChartDraftKey("church", "other")
  );
  assert.equal(read(record(), "other"), null);
  assert.equal(read(record(), "church", "other"), null);
  for (const value of [
    null,
    [],
    { ...record(), name: "Private Name" },
    { ...record(), capabilities: ["MANAGE_STRUCTURE"] },
    { ...record(), confirmed: true },
    { ...record(), changes: [{ ...change, assignmentId: "private" }] },
    { ...record(), changes: [{ ...change, layout: { x: 1, y: 20 } }] },
    { ...record(), changes: [] },
    { ...record(), changes: Array(201).fill(change) }
  ])
    assert.equal(read(value), null);
});

test("expired, future, oversized and malformed drafts cannot become recovery choices", () => {
  for (const updatedAt of [
    now - CHART_DRAFT_MAX_AGE - 1,
    now + 300_001,
    "today"
  ])
    assert.equal(read({ ...record(), updatedAt }), null);
  for (const version of [-1, 1.5, "4", 2_147_483_648])
    assert.equal(read({ ...record(), version }), null);
  assert.equal(
    readStoredChartDraft(
      "x".repeat(CHART_DRAFT_MAX_BYTES + 1),
      "church",
      "member",
      now
    ),
    null
  );
  assert.equal(readStoredChartDraft("{", "church", "member", now), null);
});

test("an uncertain retry keeps its exact version/reference/geometry but never restores confirmation or grants", () => {
  const value = record();
  value.retry = {
    expectedVersion: 4,
    requestKey: "same-reviewed-request",
    changes: [change]
  };
  assert.deepEqual(read(value), value);
  assert.equal(
    read({ ...value, retry: { ...value.retry, confirmed: true } }),
    null
  );
  assert.equal(
    read({
      ...value,
      retry: { ...value.retry, changes: [{ ...change, placement: "ROOT" }] }
    }),
    null
  );
  assert.equal(
    read({ ...value, retry: { ...value.retry, requestKey: "short" } }),
    null
  );
});
