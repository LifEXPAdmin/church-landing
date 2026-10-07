import { metricActions, type metricDefinitions } from "./metric-policy";
import { metricRatio } from "./metric-math";

type ActionKey = keyof typeof metricActions | "EVENT";
type PermittedAdoption = {
  key: string;
  actors: number | null;
  actions: number | null;
  suppressed: boolean;
};
export type MetricModulePeriod = {
  start: string;
  end: string;
  coverage: "complete" | "partial" | "unavailable";
  observedFrom: string | null;
  reason: string | null;
};
export type MetricModuleValue = {
  actors: number | null;
  actions: number | null;
  suppressed: boolean;
  state: "measured" | "partial" | "unavailable" | "suppressed";
  reason: string | null;
};
type CoveredAdoption = {
  period: MetricModulePeriod;
  adoption: (MetricModuleValue & { key: ActionKey })[];
};

const actions = {
  FOLLOW: {
    label: metricActions.FOLLOW,
    source:
      "Current people, church and topic follows at their successful follow time."
  },
  POST: {
    label: metricActions.POST,
    source:
      "Currently published ordinary posts at publication time. Prayer posts and reposts are excluded."
  },
  REPLY: {
    label: metricActions.REPLY,
    source:
      "Current visible replies to ordinary posts at creation time. Prayer replies are excluded."
  },
  RSVP: {
    label: metricActions.RSVP,
    source:
      "Current Going responses to permitted calendar occurrences at their successful response time."
  },
  VOLUNTEER: {
    label: metricActions.VOLUNTEER,
    source:
      "Current active signups for ordinary post volunteer slots at their successful signup time."
  },
  EVENT: {
    label: "Creating calendar events",
    source:
      "Current permitted calendar events at creation time, attributed to the recorded creator."
  }
} satisfies Record<ActionKey, { label: string; source: string }>;
const actionKeys = Object.keys(actions) as ActionKey[];

/** Applies coverage to an already authorized and suppressed adoption projection. */
export function metricAdoptionCoverage(
  rows: readonly PermittedAdoption[],
  interval: { start: string; end: string },
  boundaries: { startedAt: Date | string; retainedFrom: Date | string }
): CoveredAdoption {
  const start = Date.parse(interval.start),
    end = Date.parse(interval.end),
    startedAt = new Date(boundaries.startedAt).getTime(),
    retainedFrom = new Date(boundaries.retainedFrom).getTime();
  if (
    ![start, end, startedAt, retainedFrom].every(Number.isFinite) ||
    end < start
  )
    throw new RangeError("Invalid metric coverage interval");
  const availableFrom = Math.max(startedAt, retainedFrom);
  const coverage =
    end <= availableFrom || end === start
      ? "unavailable"
      : start < availableFrom
        ? "partial"
        : "complete";
  const period: MetricModulePeriod = {
    start: interval.start,
    end: interval.end,
    coverage,
    observedFrom:
      coverage === "unavailable"
        ? null
        : new Date(Math.max(start, availableFrom)).toISOString(),
    reason:
      coverage === "unavailable"
        ? "This period has no retained measurement coverage."
        : coverage === "partial"
          ? "Only the part of this period within retained measurement coverage is available."
          : null
  };
  return {
    period,
    adoption: actionKeys.map((key) => {
      const row = rows.find((candidate) => candidate.key === key);
      const suppressed = row?.suppressed ?? false;
      const unavailable = (
        reason: string
      ): MetricModuleValue & { key: ActionKey } => ({
        key,
        actors: null,
        actions: null,
        suppressed,
        state: "unavailable",
        reason
      });
      if (coverage === "unavailable") return unavailable(period.reason!);
      if (!row)
        return unavailable("The permitted source summary is unavailable.");
      // Suppression belongs to the existing report, including complementary cells.
      if (suppressed)
        return {
          key,
          actors: null,
          actions: null,
          suppressed,
          state: "suppressed",
          reason:
            "Small groups and their complementary breakdown are suppressed."
        };
      if (
        row.actors === null ||
        row.actions === null ||
        !Number.isSafeInteger(row.actors) ||
        !Number.isSafeInteger(row.actions) ||
        row.actors < 0 ||
        row.actions < row.actors
      )
        return unavailable("The permitted source summary is unavailable.");
      return {
        key,
        actors: row.actors,
        actions: row.actions,
        suppressed,
        state: coverage === "partial" ? "partial" : "measured",
        reason: null
      };
    })
  };
}

const groups = [
  { key: "connections", label: "Connections", actions: ["FOLLOW"] },
  { key: "publishing", label: "Publishing", actions: ["POST", "REPLY"] },
  { key: "events", label: "Events", actions: ["RSVP", "EVENT"] },
  { key: "serving", label: "Serving", actions: ["VOLUNTEER"] }
] as const;

const unavailable = [
  {
    key: "fulfilledNeeds",
    label: "Fulfilled needs",
    module: "Exchange",
    definitionKey: "fulfilledNeeds",
    reason:
      "Fulfilled needs are not measured in this report. Promises and reservations do not establish fulfillment."
  },
  {
    key: "eventAttendance",
    label: "Event attendance",
    module: "Events",
    definitionKey: "eventAttendance",
    reason:
      "Attendance is not measured in this report. RSVP responses record intention."
  },
  {
    key: "completedService",
    label: "Completed service",
    module: "Serving",
    definitionKey: "completedService",
    reason:
      "Completed service is not measured in this report. Active signups record planned participation."
  },
  {
    key: "savedHelpfulResources",
    label: "Saved and helpful resources",
    module: "Resources",
    definitionKey: "savedHelpfulResources",
    reason:
      "Resource saves and helpfulness are not measured in this report. Saving a resource does not establish that it was helpful."
  },
  {
    key: "successfulIntroductions",
    label: "Successful introductions",
    module: "Connections",
    definitionKey: "successfulIntroductions",
    reason:
      "Successful introductions are not measured in this report. Following alone does not establish an accepted introduction."
  },
  {
    key: "exchangeActivity",
    label: "Exchange activity",
    module: "Exchange",
    definitionKey: null,
    reason:
      "The six approved action sources do not measure Exchange listing or commitment activity."
  },
  {
    key: "mediaActivity",
    label: "Media activity",
    module: "Media",
    definitionKey: null,
    reason:
      "The six approved action sources do not measure Media publishing or use."
  }
] satisfies {
  key: string;
  label: string;
  module: string;
  definitionKey: keyof typeof metricDefinitions | null;
  reason: string;
}[];

/** Groups the existing permitted rows without combining actors or action totals. */
export function metricModuleProjection(
  current: CoveredAdoption,
  previous: CoveredAdoption,
  measuredAccounts: number
) {
  const value = (
    period: CoveredAdoption,
    key: ActionKey
  ): MetricModuleValue => {
    const row = period.adoption.find((candidate) => candidate.key === key)!;
    return {
      actors: row.actors,
      actions: row.actions,
      suppressed: row.suppressed,
      state: row.state,
      reason: row.reason
    };
  };
  return {
    scope: "platform" as const,
    denominator: {
      label: "Currently eligible, opted-in measured accounts",
      measuredAccounts
    },
    unavailableScopes: [
      {
        key: "owner" as const,
        label: "Owner scope",
        reason:
          "Personal activity summaries are unavailable. Platform counts are not personal totals."
      },
      {
        key: "church" as const,
        label: "Church scope",
        reason:
          "Church activity summaries are unavailable. These platform counts cannot be attributed to a church."
      }
    ],
    periods: { current: current.period, previous: previous.period },
    groups: groups.map((group) => ({
      key: group.key,
      label: group.label,
      actions: group.actions.map((key) => {
        const selected = value(current, key);
        return {
          key,
          ...actions[key],
          current: {
            ...selected,
            percent:
              selected.actors === null || measuredAccounts === 0
                ? null
                : metricRatio(selected.actors, measuredAccounts).percent,
            percentReason:
              selected.actors === null
                ? selected.reason
                : measuredAccounts === 0
                  ? "The measured population is empty."
                  : null
          },
          previous: value(previous, key)
        };
      })
    })),
    unavailable: unavailable.map((item) => ({ ...item, count: null }))
  };
}
