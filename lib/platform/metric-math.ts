import {
  METRIC_MINIMUM_GROUP,
  type MetricAccountState,
  type MetricStateCounts
} from "./metric-policy";

const count = (value: number) => {
  if (!Number.isSafeInteger(value) || value < 0)
    throw Error("Invalid metric count");
  return value;
};
export function metricRatio(numerator: number, denominator: number) {
  count(numerator);
  count(denominator);
  if (numerator > denominator)
    throw Error("Metric numerator exceeds its population");
  return {
    numerator,
    denominator,
    percent: denominator ? (100 * numerator) / denominator : null
  };
}

/** All detail cells disappear if a small cell would be recoverable by subtraction. */
export function metricBreakdown<T extends string>(
  rows: { key: T; count: number }[],
  minimum = METRIC_MINIMUM_GROUP
) {
  const suppressed = rows.some(
    (row) => count(row.count) > 0 && row.count < minimum
  );
  return {
    suppressed,
    minimum,
    rows: rows.map((row) => ({
      key: row.key,
      count: suppressed ? null : row.count
    }))
  };
}

/** Replay state edges, never subtract both request-to-delete and eventual erasure from enabled. */
export function metricLifecycleBalance(
  opening: MetricStateCounts,
  transitions: {
    from: MetricAccountState;
    to: MetricAccountState;
    count: number;
  }[]
) {
  const result = { ...opening };
  for (const n of Object.values(result)) count(n);
  for (const edge of transitions) {
    count(edge.count);
    if (edge.from in result)
      result[edge.from as keyof MetricStateCounts] -= edge.count;
    if (edge.to in result)
      result[edge.to as keyof MetricStateCounts] += edge.count;
  }
  for (const n of Object.values(result)) count(n);
  return {
    states: result,
    existing: result.ENABLED + result.DEACTIVATED + result.SUSPENDED
  };
}

export type MetricFeedbackInput = {
  receipts: { id: string; rating: number | null; exposureId: string | null }[];
  displayedExposureIds: string[];
};
/** Shared 30/31 aggregation contract: inputs must already pass source/period/lifecycle eligibility. */
export function metricFeedbackSummary(input: MetricFeedbackInput) {
  const unique = new Map<string, MetricFeedbackInput["receipts"][number]>();
  for (const receipt of input.receipts) {
    if (
      !receipt.id ||
      (receipt.rating !== null &&
        (!Number.isInteger(receipt.rating) ||
          receipt.rating < 1 ||
          receipt.rating > 5))
    )
      throw Error("Invalid feedback aggregate source");
    const previous = unique.get(receipt.id);
    if (
      previous &&
      (previous.rating !== receipt.rating ||
        previous.exposureId !== receipt.exposureId)
    )
      throw Error("Conflicting feedback receipt source");
    unique.set(receipt.id, receipt);
  }
  const exposures = new Set(input.displayedExposureIds),
    responses = new Set<string>();
  const distribution = [1, 2, 3, 4, 5].map((rating) => ({ rating, count: 0 }));
  let ratingCount = 0,
    total = 0,
    voluntary = 0;
  for (const receipt of unique.values()) {
    if (receipt.rating !== null) {
      distribution[receipt.rating - 1].count++;
      ratingCount++;
      total += receipt.rating;
    }
    if (receipt.exposureId === null) voluntary++;
    else if (exposures.has(receipt.exposureId))
      responses.add(receipt.exposureId);
  }
  return {
    feedbackCount: unique.size,
    ratingCount,
    mean: ratingCount ? total / ratingCount : null,
    distribution,
    voluntary,
    prompt: metricRatio(responses.size, exposures.size)
  };
}
