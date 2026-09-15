import test from "node:test";
import assert from "node:assert/strict";
import {
  metricAddDays,
  metricDay,
  metricDayStart,
  metricReturnObservation,
  metricWindow
} from "../lib/platform/metric-time";
import {
  metricBreakdown,
  metricFeedbackSummary,
  metricLifecycleBalance,
  metricRatio
} from "../lib/platform/metric-math";
import { escapeCsvCell } from "../lib/csv";

test("report dates use real Chicago DST boundaries and equal calendar comparison windows", () => {
  const spring = metricWindow(
    { from: "2026-03-08", through: "2026-03-08" },
    new Date("2026-03-10T12:00:00Z")
  );
  assert.equal(spring.start, "2026-03-08T06:00:00.000Z");
  assert.equal(spring.end, "2026-03-09T05:00:00.000Z");
  assert.equal(Date.parse(spring.end) - Date.parse(spring.start), 23 * 3600000);
  assert.equal(spring.comparison.start, "2026-03-07T06:00:00.000Z");
  assert.equal(spring.comparison.end, spring.start);
  const autumn = metricWindow(
    { from: "2026-11-01", through: "2026-11-01" },
    new Date("2026-11-03T12:00:00Z")
  );
  assert.equal(Date.parse(autumn.end) - Date.parse(autumn.start), 25 * 3600000);
  assert.equal(metricDay(new Date("2026-09-15T04:59:59Z")), "2026-09-14");
  assert.equal(metricDay(new Date("2026-09-15T05:00:00Z")), "2026-09-15");
});

test("current partial periods are explicit, bounded, and never accepted from unknown filters", () => {
  const now = new Date("2026-09-15T17:00:00Z"),
    period = metricWindow({ preset: "7" }, now);
  assert.equal(period.from, "2026-09-09");
  assert.equal(period.through, "2026-09-15");
  assert.equal(period.end, now.toISOString());
  assert.equal(period.calendarEnd, "2026-09-16T05:00:00.000Z");
  assert.equal(period.partial, true);
  assert.equal(period.comparison.from, "2026-09-02");
  assert.equal(period.comparison.through, "2026-09-08");
  for (const input of [
    { preset: "999" },
    { from: "2026-02-30", through: "2026-03-01" },
    { from: "2026-09-15" },
    { from: "2026-09-16", through: "2026-09-16" },
    { from: "2026-01-01", through: "2026-09-15" },
    { from: "2026-09-15", through: "2026-09-14" },
    { preset: "7", from: "2026-09-09", through: "2026-09-15" },
    { accountId: "must-not-be-a-drilldown" },
    { timezone: "UTC" }
  ])
    assert.throws(() => metricWindow(input, now));
  assert.throws(() => metricDayStart("2026-09-15", "+02:00"));
  assert.throws(() => metricAddDays("2026-09-15", 1.5));
});

test("exact-day returns mature only after the whole observation day, including DST", () => {
  const before = metricReturnObservation(
    "2026-03-01",
    7,
    new Date("2026-03-09T04:59:59Z")
  );
  assert.deepEqual(before, { day: "2026-03-08", mature: false });
  assert.equal(
    metricReturnObservation("2026-03-01", 7, new Date("2026-03-09T05:00:00Z"))
      .mature,
    true
  );
  assert.equal(
    metricReturnObservation("2026-03-01", 30, new Date("2026-03-11T12:00:00Z"))
      .mature,
    false
  );
  assert.deepEqual(
    metricReturnObservation("2026-03-01", 30, new Date("2026-04-01T05:00:00Z")),
    { day: "2026-03-31", mature: true }
  );
  assert.deepEqual(metricRatio(4, 10), {
    numerator: 4,
    denominator: 10,
    percent: 40
  });
  assert.deepEqual(metricRatio(2, 10), {
    numerator: 2,
    denominator: 10,
    percent: 20
  });
  assert.equal(metricRatio(0, 0).percent, null);
  assert.throws(() => metricRatio(2, 1));
});

test("lifecycle balance keeps deletion separate from prior deactivation and suspension restoration", () => {
  const result = metricLifecycleBalance(
    { ENABLED: 10, DEACTIVATED: 0, SUSPENDED: 0 },
    [
      { from: "ENABLED", to: "DEACTIVATED", count: 2 },
      { from: "DEACTIVATED", to: "ENABLED", count: 1 },
      { from: "ENABLED", to: "DEACTIVATED", count: 1 },
      { from: "DEACTIVATED", to: "DELETED", count: 1 }
    ]
  );
  assert.deepEqual(result, {
    states: { ENABLED: 8, DEACTIVATED: 1, SUSPENDED: 0 },
    existing: 9
  });
  const states = metricLifecycleBalance(result.states, [
    { from: "DEACTIVATED", to: "SUSPENDED", count: 1 },
    { from: "SUSPENDED", to: "DEACTIVATED", count: 1 },
    { from: "ENABLED", to: "EXCLUDED", count: 2 }
  ]);
  assert.deepEqual(states, {
    states: { ENABLED: 6, DEACTIVATED: 1, SUSPENDED: 0 },
    existing: 7
  });
  assert.throws(() =>
    metricLifecycleBalance(result.states, [
      { from: "ENABLED", to: "DELETED", count: 20 }
    ])
  );
});

test("feedback A2 deduplicates receipts and displayed exposures without treating rating-free feedback as a score", () => {
  const receipts = [1, 3, 4, 5, 5, null].map((rating, i) => ({
    id: "receipt-" + i,
    rating,
    exposureId: i < 2 ? "shown-" + i : null
  }));
  const shown = Array.from({ length: 10 }, (_, i) => "shown-" + i);
  const actual = metricFeedbackSummary({
    receipts: [...receipts, ...receipts],
    displayedExposureIds: [...shown, ...shown]
  });
  assert.equal(actual.feedbackCount, 6);
  assert.equal(actual.ratingCount, 5);
  assert.equal(actual.mean, 3.6);
  assert.deepEqual(actual.distribution, [
    { rating: 1, count: 1 },
    { rating: 2, count: 0 },
    { rating: 3, count: 1 },
    { rating: 4, count: 1 },
    { rating: 5, count: 2 }
  ]);
  assert.equal(actual.voluntary, 4);
  assert.deepEqual(actual.prompt, {
    numerator: 2,
    denominator: 10,
    percent: 20
  });
  assert.equal(
    metricFeedbackSummary({
      receipts: [{ id: "only-text", rating: null, exposureId: null }],
      displayedExposureIds: []
    }).mean,
    null
  );
  assert.equal(
    metricFeedbackSummary({
      receipts: [{ id: "reserved", rating: 5, exposureId: "not-shown" }],
      displayedExposureIds: []
    }).prompt.numerator,
    0
  );
  assert.throws(() =>
    metricFeedbackSummary({
      receipts: [{ id: "invalid", rating: 0, exposureId: null }],
      displayedExposureIds: []
    })
  );
  assert.throws(() =>
    metricFeedbackSummary({
      receipts: [receipts[0], { ...receipts[0], rating: 5 }],
      displayedExposureIds: shown
    })
  );
});

test("small detail categories also suppress complementary cells and aggregate CSV reuses formula protection", () => {
  assert.deepEqual(
    metricBreakdown([
      { key: "EMAIL", count: 6 },
      { key: "GOOGLE", count: 4 },
      { key: "UNKNOWN", count: 0 }
    ]),
    {
      suppressed: true,
      minimum: 5,
      rows: [
        { key: "EMAIL", count: null },
        { key: "GOOGLE", count: null },
        { key: "UNKNOWN", count: null }
      ]
    }
  );
  assert.equal(
    metricBreakdown([
      { key: "EMAIL", count: 5 },
      { key: "GOOGLE", count: 5 }
    ]).suppressed,
    false
  );
  assert.equal(metricBreakdown([{ key: "EMAIL", count: 0 }]).rows[0].count, 0);
  assert.throws(() => metricBreakdown([{ key: "bad", count: -1 }]));
  assert.equal(escapeCsvCell("=1+1"), "'=1+1");
  assert.equal(escapeCsvCell("-1"), "'-1");
  assert.equal(escapeCsvCell('A,"B"'), '"A,""B"""');
});
