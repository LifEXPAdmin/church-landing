import type { MetricReport } from "@/lib/platform/metric-report";

type Props = Pick<
  MetricReport,
  "modules" | "window" | "configuration" | "checkedAt" | "definitions"
>;
type Value =
  MetricReport["modules"]["groups"][number]["actions"][number]["current"];

const coverageLabels = {
  complete: "Complete collection coverage",
  partial: "Partial collection coverage",
  unavailable: "Unavailable"
} as const;

function count(value: number | null, state: Value["state"]) {
  if (state === "unavailable") return "Unavailable";
  if (state === "suppressed") return "Suppressed";
  if (value === null) return "Unavailable";
  return state === "partial" ? `${value} (partial)` : String(value);
}

export function MetricModuleSummaries({
  modules,
  window: interval,
  configuration,
  checkedAt,
  definitions
}: Props) {
  const time = (value: string) =>
    new Intl.DateTimeFormat(undefined, {
      timeZone: interval.zone,
      dateStyle: "medium",
      timeStyle: "short"
    }).format(new Date(value));
  const periods = [
    {
      key: "current",
      label: "Selected period",
      from: interval.from,
      through: interval.through
    },
    {
      key: "previous",
      label: "Preceding period",
      from: interval.comparison.from,
      through: interval.comparison.through
    }
  ] as const;
  return (
    <section className="space-y-4" aria-labelledby="metric-modules">
      <h2 id="metric-modules" className="text-2xl">
        Platform module summaries
      </h2>
      <p>
        Platform scope. These are the six existing successful source actions,
        grouped for reading. Each row counts distinct actors and actions
        separately. The same person can appear in several rows, so rows are
        never added together as a count of people.
      </p>
      <p>
        {modules.denominator.label}: {modules.denominator.measuredAccounts}.
        Selected share is each action’s distinct actors divided by this current
        measured population; it is not a share of all registered accounts.
      </p>
      <p className="text-sm text-gc-muted">
        Reporting zone: {interval.zone}. Collection version{" "}
        {configuration.version}. Collection baseline:{" "}
        <time dateTime={configuration.startedAt}>
          {time(configuration.startedAt)}
        </time>
        . Refreshed <time dateTime={checkedAt}>{time(checkedAt)}</time>. Current
        source records with unknown successful-state times are excluded; there
        is no historical backfill.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {periods.map(({ key, label, from, through }) => {
          const period = modules.periods[key];
          return (
            <section
              key={key}
              aria-labelledby={`metric-module-${key}`}
              className="rounded-xl border border-gc-divider p-4"
            >
              <h3 id={`metric-module-${key}`} className="font-semibold">
                {label}
              </h3>
              <p>
                {from} through {through}
              </p>
              {key === "current" && interval.partial && (
                <p>The selected calendar period is still in progress.</p>
              )}
              <p className="font-semibold">{coverageLabels[period.coverage]}</p>
              {period.reason && <p className="text-sm">{period.reason}</p>}
              {period.observedFrom && (
                <p className="text-sm text-gc-muted">
                  Retained observations from{" "}
                  <time dateTime={period.observedFrom}>
                    {time(period.observedFrom)}
                  </time>{" "}
                  through <time dateTime={period.end}>{time(period.end)}</time>{" "}
                  ({interval.zone}).
                </p>
              )}
            </section>
          );
        })}
      </div>
      <p className="text-sm">
        Zero is a measured value only where coverage is available. Partial
        values cover retained observations only. Suppressed cells protect small
        groups and their complementary breakdown; they are not zero. Event
        responses express RSVP intent, and volunteer signups reserve
        participation. Neither records attendance or completed service.
      </p>
      <div className="space-y-4">
        {modules.groups.map((group) => (
          <section
            key={group.key}
            aria-labelledby={`metric-module-group-${group.key}`}
            className="min-w-0 space-y-2 rounded-xl border border-gc-divider p-4"
          >
            <h3 id={`metric-module-group-${group.key}`} className="text-xl">
              {group.label}
            </h3>
            <div
              className="max-w-full overflow-x-auto"
              role="region"
              tabIndex={0}
              aria-label={`${group.label}: successful source actions`}
            >
              <table className="w-full text-left text-sm [overflow-wrap:normal]">
                <caption className="py-3 text-left font-semibold">
                  {group.label}: successful source actions
                </caption>
                <thead>
                  <tr>
                    {[
                      "Action and source",
                      "Selected actors",
                      "Selected actions",
                      "Preceding actors",
                      "Preceding actions",
                      "Selected share"
                    ].map((label) => (
                      <th
                        key={label}
                        scope="col"
                        className="whitespace-nowrap border-b border-gc-divider p-3"
                      >
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {group.actions.map((action) => (
                    <tr key={action.key}>
                      <th
                        scope="row"
                        className="min-w-48 border-b border-gc-divider p-3 font-normal"
                      >
                        <span className="font-semibold">{action.label}</span>
                        <span className="mt-1 block text-gc-muted">
                          {action.source}
                        </span>
                        {action.current.reason && (
                          <span className="mt-1 block">
                            Selected: {action.current.reason}
                          </span>
                        )}
                        {action.current.percentReason &&
                          action.current.percentReason !==
                            action.current.reason && (
                            <span className="mt-1 block">
                              Selected share: {action.current.percentReason}
                            </span>
                          )}
                        {action.previous.reason && (
                          <span className="mt-1 block">
                            Preceding: {action.previous.reason}
                          </span>
                        )}
                      </th>
                      {periods.flatMap(({ key }) =>
                        (["actors", "actions"] as const).map((unit) => (
                          <td
                            key={`${key}-${unit}`}
                            className="whitespace-nowrap border-b border-gc-divider p-3"
                          >
                            {count(action[key][unit], action[key].state)}
                          </td>
                        ))
                      )}
                      <td className="whitespace-nowrap border-b border-gc-divider p-3">
                        {action.current.percent === null
                          ? action.current.state === "suppressed"
                            ? "Suppressed"
                            : "Unavailable"
                          : `${action.current.percent.toFixed(1)}%${action.current.state === "partial" ? " (partial)" : ""}`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))}
      </div>
      <section className="space-y-2" aria-labelledby="metric-module-scopes">
        <h3 id="metric-module-scopes" className="text-xl">
          Unavailable scopes
        </h3>
        <dl className="grid gap-3 sm:grid-cols-2">
          {modules.unavailableScopes.map((scope) => (
            <div
              key={scope.key}
              className="rounded-xl border border-gc-divider p-4"
            >
              <dt className="font-semibold">{scope.label}</dt>
              <dd>Unavailable. {scope.reason}</dd>
            </div>
          ))}
        </dl>
      </section>
      <div
        className="max-w-full overflow-x-auto rounded-xl border border-gc-divider"
        role="region"
        tabIndex={0}
        aria-label="Outcomes and modules not measured"
      >
        <table className="w-full text-left text-sm [overflow-wrap:normal]">
          <caption className="p-3 text-left font-semibold">
            Outcomes and modules not measured
          </caption>
          <thead>
            <tr>
              {["Outcome or module", "Status", "Definition and reason"].map(
                (label) => (
                  <th
                    key={label}
                    scope="col"
                    className="whitespace-nowrap border-b border-gc-divider p-3"
                  >
                    {label}
                  </th>
                )
              )}
            </tr>
          </thead>
          <tbody>
            {modules.unavailable.map((item) => (
              <tr key={item.key}>
                <th
                  scope="row"
                  className="min-w-40 border-b border-gc-divider p-3 font-normal"
                >
                  {item.label}
                  <span className="mt-1 block text-gc-muted">
                    {item.module}
                  </span>
                </th>
                <td className="border-b border-gc-divider p-3">Unavailable</td>
                <td className="min-w-64 border-b border-gc-divider p-3">
                  {item.definitionKey && (
                    <p>{definitions[item.definitionKey]}</p>
                  )}
                  <p className="mt-2">{item.reason}</p>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
