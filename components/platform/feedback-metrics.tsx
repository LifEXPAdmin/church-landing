import type { MetricReport } from "@/lib/platform/metric-report";

const entryLabels: Record<string, string> = {
  VOLUNTARY: "Voluntary Menu feedback",
  PROMPT: "Linked to a displayed prompt",
  UNATTRIBUTED: "Unattributed — prompt evidence unavailable"
};

export function FeedbackMetrics({
  feedback
}: {
  feedback: MetricReport["feedback"];
}) {
  return (
    <div className="space-y-4">
      <p>{feedback.message}</p>
      <p>
        Raw prompt evidence is retained from{" "}
        {new Date(feedback.retainedFrom).toISOString()}.
        {feedback.exposureCoveragePartial || feedback.comparisonCoveragePartial
          ? " At least one interval extends beyond retained evidence and has partial exposure coverage."
          : " Only currently retained and eligible exposures count; missing historical use is not inferred."}
      </p>
      <div className="grid gap-4 lg:grid-cols-2">
        {(["current", "previous"] as const).map((period) => {
          const value = feedback[period];
          return (
            <section
              className="space-y-3 rounded-xl border border-gc-divider p-4"
              key={period}
            >
              <h3 className="text-xl">
                {period === "current"
                  ? "Selected interval"
                  : "Preceding equal interval"}
              </h3>
              <p>{value.message}</p>
              <dl className="space-y-2">
                <div>
                  <dt>Feedback submissions / distinct people</dt>
                  <dd>
                    {value.feedbackCount} / {value.requesters}
                  </dd>
                </div>
                <div>
                  <dt>Ratings / arithmetic mean</dt>
                  <dd>
                    {value.ratingCount} /{" "}
                    {value.mean === null
                      ? "No submitted ratings"
                      : value.mean.toFixed(2) + " out of 5"}
                  </dd>
                </div>
                <div>
                  <dt>Responses / displayed prompt exposures</dt>
                  <dd>
                    {value.prompt.numerator} / {value.prompt.denominator}
                    {value.prompt.percent === null
                      ? " — no eligible displayed exposures"
                      : ` — ${value.prompt.percent.toFixed(1)}%`}
                  </dd>
                </div>
              </dl>
              <p>
                Ratings describe website satisfaction. Rating-free feedback
                remains included in submissions.
              </p>
              <h4 className="font-semibold">Rating distribution</h4>
              {value.distributionSuppressed && (
                <p>
                  Detailed cells are suppressed because a category has fewer
                  than {feedback.minimumGroup} people.
                </p>
              )}
              <dl className="space-y-1">
                {value.distribution.map((row) => (
                  <div className="flex flex-wrap gap-x-3" key={row.rating}>
                    <dt>{row.rating} out of 5</dt>
                    <dd>{row.count ?? "Suppressed"}</dd>
                  </div>
                ))}
              </dl>
              <h4 className="font-semibold">How feedback was submitted</h4>
              {value.entriesSuppressed && (
                <p>
                  Small categories and their complementary counts are
                  suppressed.
                </p>
              )}
              <dl className="space-y-2">
                {value.entries.map((row) => (
                  <div key={row.key}>
                    <dt>{entryLabels[row.key]}</dt>
                    <dd>
                      {row.cases === null
                        ? "Suppressed"
                        : `${row.cases} submissions / ${row.requesters} distinct people`}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          );
        })}
      </div>
    </div>
  );
}
