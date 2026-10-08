import test from "node:test";
import assert from "node:assert/strict";
import {
  metricAdoptionCoverage,
  metricModuleProjection
} from "../lib/platform/metric-modules";
import { metricDefinitions } from "../lib/platform/metric-policy";

const keys = ["FOLLOW", "POST", "REPLY", "RSVP", "VOLUNTEER", "EVENT"];
const rows = (actors = 0, actions = actors, suppressed = false) =>
  keys.map((key) => ({ key, actors, actions, suppressed }));
const interval = {
  start: "2026-08-10T05:00:00.000Z",
  end: "2026-08-11T05:00:00.000Z"
};
const boundaries = {
  startedAt: "2026-08-01T05:00:00.000Z",
  retainedFrom: "2026-07-01T05:00:00.000Z"
};
const covered = (input = rows()) =>
  metricAdoptionCoverage(input, interval, boundaries);

test("authoritative covered zeros remain measured, while missing source summaries do not become zero", () => {
  const input = rows();
  const actual = covered(input);
  assert.equal(actual.period.coverage, "complete");
  assert.equal(actual.period.observedFrom, interval.start);
  assert.ok(
    actual.adoption.every(
      (row) =>
        row.actors === 0 &&
        row.actions === 0 &&
        row.state === "measured" &&
        row.reason === null
    )
  );
  assert.deepEqual(input, rows());
  const sparse = covered([
    { key: "POST", actors: 6, actions: 8, suppressed: false },
    { key: "UNAPPROVED", actors: 99, actions: 99, suppressed: false }
  ]);
  assert.deepEqual(
    sparse.adoption.map((row) => row.key),
    keys
  );
  for (const row of sparse.adoption) {
    if (row.key === "POST") {
      assert.equal(row.actors, 6);
      assert.equal(row.actions, 8);
      assert.equal(row.state, "measured");
    } else {
      assert.equal(row.actors, null);
      assert.equal(row.actions, null);
      assert.equal(row.state, "unavailable");
      assert.match(row.reason!, /source summary/);
    }
  }
});

test("exclusive period end and the later collection or retention boundary distinguish absent from partial coverage", () => {
  for (const cutoff of [
    { startedAt: interval.end, retainedFrom: boundaries.retainedFrom },
    { startedAt: boundaries.startedAt, retainedFrom: interval.end },
    { startedAt: "2026-08-12T05:00:00Z", retainedFrom: interval.start }
  ]) {
    const actual = metricAdoptionCoverage(rows(6, 9), interval, cutoff);
    assert.equal(actual.period.coverage, "unavailable");
    assert.equal(actual.period.observedFrom, null);
    assert.ok(
      actual.adoption.every(
        (row) =>
          row.actors === null &&
          row.actions === null &&
          row.state === "unavailable"
      )
    );
  }
  for (const cutoff of [
    {
      startedAt: "2026-08-10T12:00:00.000Z",
      retainedFrom: boundaries.retainedFrom
    },
    {
      startedAt: boundaries.startedAt,
      retainedFrom: "2026-08-10T12:00:00.000Z"
    }
  ]) {
    const actual = metricAdoptionCoverage(rows(6, 9), interval, cutoff);
    assert.equal(actual.period.coverage, "partial");
    assert.equal(actual.period.observedFrom, "2026-08-10T12:00:00.000Z");
    assert.ok(
      actual.adoption.every(
        (row) =>
          row.actors === 6 && row.actions === 9 && row.state === "partial"
      )
    );
  }
  assert.equal(
    metricAdoptionCoverage(rows(), interval, {
      ...boundaries,
      startedAt: interval.start
    }).period.coverage,
    "complete"
  );
});

test("suppressed rows and their complementary cells stay null through coverage and module projection", () => {
  const input = rows(6, 12, true);
  const actual = covered(input);
  assert.ok(
    actual.adoption.every(
      (row) =>
        row.suppressed &&
        row.actors === null &&
        row.actions === null &&
        row.state === "suppressed"
    )
  );
  const partial = metricAdoptionCoverage(input, interval, {
    ...boundaries,
    retainedFrom: "2026-08-10T12:00:00Z"
  });
  assert.equal(partial.period.coverage, "partial");
  assert.ok(partial.adoption.every((row) => row.state === "suppressed"));
  const unavailable = metricAdoptionCoverage(input, interval, {
    ...boundaries,
    startedAt: interval.end
  });
  assert.ok(
    unavailable.adoption.every(
      (row) =>
        row.suppressed &&
        row.actors === null &&
        row.actions === null &&
        row.state === "unavailable"
    )
  );
  const projection = metricModuleProjection(actual, partial, 20);
  for (const group of projection.groups)
    for (const action of group.actions) {
      assert.equal(action.current.percent, null);
      assert.ok(action.current.percentReason);
      assert.equal(action.current.actors, null);
      assert.equal(action.previous.actions, null);
    }
  assert.deepEqual(input, rows(6, 12, true));
});

test("module groups preserve separate canonical categories and only the approved selected-population rate", () => {
  const current = covered(rows(6, 9));
  const previous = covered(rows(5, 7));
  const projection = metricModuleProjection(current, previous, 20);
  assert.equal(projection.scope, "platform");
  assert.equal(projection.denominator.measuredAccounts, 20);
  assert.deepEqual(
    projection.groups.map((group) => [
      group.key,
      group.actions.map((action) => action.key)
    ]),
    [
      ["connections", ["FOLLOW"]],
      ["publishing", ["POST", "REPLY"]],
      ["events", ["RSVP", "EVENT"]],
      ["serving", ["VOLUNTEER"]]
    ]
  );
  for (const group of projection.groups) {
    assert.deepEqual(Object.keys(group).sort(), ["actions", "key", "label"]);
    for (const action of group.actions) {
      assert.equal(action.current.actors, 6);
      assert.equal(action.current.actions, 9);
      assert.equal(action.current.percent, 30);
      assert.equal(action.previous.actors, 5);
      assert.equal(action.previous.actions, 7);
      assert.equal("percent" in action.previous, false);
      assert.ok(action.source);
    }
  }
  assert.equal("total" in projection, false);
  assert.equal("percent" in projection, false);
  const empty = metricModuleProjection(covered(), covered(), 0);
  assert.ok(
    empty.groups.every((group) =>
      group.actions.every(
        (action) =>
          action.current.actors === 0 &&
          action.current.percent === null &&
          action.current.percentReason
      )
    )
  );
  const missing = metricAdoptionCoverage([], interval, boundaries);
  assert.ok(
    metricModuleProjection(missing, previous, 20).groups.every((group) =>
      group.actions.every((action) => action.current.percent === null)
    )
  );
});

test("definition-only outcomes, unmeasured modules and unsupported scopes never acquire counts from adoption", () => {
  const projection = metricModuleProjection(
    covered(rows(8)),
    covered(rows(9)),
    20
  );
  assert.deepEqual(
    projection.unavailable.map((item) => item.key),
    [
      "fulfilledNeeds",
      "eventAttendance",
      "completedService",
      "savedHelpfulResources",
      "successfulIntroductions",
      "exchangeActivity",
      "mediaActivity"
    ]
  );
  for (const item of projection.unavailable) {
    assert.equal(item.count, null);
    assert.ok(item.reason);
    if (item.definitionKey)
      assert.match(
        metricDefinitions[item.definitionKey],
        /^Not measured in this report\./
      );
  }
  assert.deepEqual(
    projection.unavailableScopes.map((scope) => scope.key),
    ["owner", "church"]
  );
  assert.ok(
    projection.unavailableScopes.every(
      (scope) => scope.reason && !("count" in scope)
    )
  );
});

test("invalid or empty time bounds cannot appear as measured history", () => {
  assert.throws(
    () =>
      metricAdoptionCoverage(
        rows(),
        { ...interval, start: "invalid" },
        boundaries
      ),
    /coverage interval/
  );
  assert.throws(
    () =>
      metricAdoptionCoverage(
        rows(),
        { start: interval.end, end: interval.start },
        boundaries
      ),
    /coverage interval/
  );
  assert.throws(
    () =>
      metricAdoptionCoverage(rows(), interval, {
        ...boundaries,
        retainedFrom: "invalid"
      }),
    /coverage interval/
  );
  const empty = metricAdoptionCoverage(
    rows(),
    { start: interval.end, end: interval.end },
    boundaries
  );
  assert.equal(empty.period.coverage, "unavailable");
  const absent = metricAdoptionCoverage(
    [{ key: "POST", actors: null, actions: null, suppressed: false }],
    interval,
    boundaries
  );
  assert.equal(
    absent.adoption.find((row) => row.key === "POST")?.state,
    "unavailable"
  );
});
