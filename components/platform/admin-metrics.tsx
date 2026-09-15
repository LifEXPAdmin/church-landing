"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import type { MetricSnapshot } from "@/lib/platform/metric-report";
import {
  metricActions,
  metricBrowsers,
  metricDevices,
  metricReferrals
} from "@/lib/platform/metric-policy";
import { socialRequest } from "@/lib/platform/social-client";
import type { ReactNode } from "react";
const box = "rounded-xl border border-gc-divider p-4";
const labels: Record<string, string> = {
  ...metricActions,
  EVENT: "Creating calendar events",
  ...metricReferrals,
  ...metricDevices,
  ...metricBrowsers,
  existing: "Current registered accounts",
  enabled: "Enabled",
  deactivated: "Deactivated",
  suspended: "Suspended",
  listings: "Community church listings",
  newListings: "New listings in period",
  pendingClaims: "Pending representative claims",
  managedChurches: "Approved and activated managed churches",
  newManagedChurches: "First activations in period",
  topicSpaces: "Active topic spaces",
  newTopicSpaces: "New topic spaces in period",
  activeChurches: "Churches with a permitted action in 30 days",
  activeTopics: "Topic spaces with a publication in 30 days",
  EMAIL: "Email",
  GOOGLE: "Google",
  UNKNOWN: "Unknown or not shared"
};
function percent(value: {
  numerator: number;
  denominator: number;
  percent: number | null;
}) {
  return value.percent === null
    ? "Unavailable — no mature eligible denominator"
    : `${value.percent.toFixed(1)}% (${value.numerator} / ${value.denominator})`;
}
function Table({
  caption,
  heads,
  rows
}: {
  caption: string;
  heads: string[];
  rows: ReactNode[][];
}) {
  return (
    <div
      className="max-w-full overflow-x-auto rounded-xl border border-gc-divider"
      tabIndex={0}
      role="region"
      aria-label={caption}
    >
      <table className="w-full text-left text-sm">
        <caption className="p-3 text-left font-semibold">{caption}</caption>
        <thead>
          <tr>
            {heads.map((h) => (
              <th
                scope="col"
                className="whitespace-nowrap border-b border-gc-divider p-3"
                key={h}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((cells, i) => (
            <tr key={i}>
              {cells.map((cell, j) =>
                j === 0 ? (
                  <th
                    key={j}
                    scope="row"
                    className="border-b border-gc-divider p-3 font-normal"
                  >
                    {cell}
                  </th>
                ) : (
                  <td className="border-b border-gc-divider p-3" key={j}>
                    {cell}
                  </td>
                )
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
export function AdminMetrics({ data }: { data: MetricSnapshot }) {
  const r = data.report,
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const requestKey = useRef<string | null>(null);
  const todayParts = new Intl.DateTimeFormat("en-US", {
    timeZone: r.window.zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date(r.checkedAt));
  const reportingToday = ["year", "month", "day"]
    .map((key) => todayParts.find((part) => part.type === key)?.value)
    .join("-");
  const time = (at: string) =>
    new Intl.DateTimeFormat(undefined, {
      timeZone: r.window.zone,
      dateStyle: "medium",
      timeStyle: "short"
    }).format(new Date(at));
  async function download() {
    if (busy) return;
    setBusy(true);
    setMessage("");
    requestKey.current ??= crypto.randomUUID();
    try {
      const { data: result } = await socialRequest<{
        csv: string;
        filename: string;
        receipt: string;
      }>(
        "/api/platform/admin",
        JSON.stringify({
          operation: "metrics-export",
          requestKey: requestKey.current,
          from: r.window.from,
          through: r.window.through
        }),
        data.navigation.viewer.id
      );
      const url = URL.createObjectURL(
          new Blob([result.csv], { type: "text/csv;charset=utf-8" })
        ),
        a = document.createElement("a");
      a.href = url;
      a.download = result.filename;
      a.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 2000);
      setMessage(
        "Current aggregate export downloaded. Audit receipt: " + result.receipt
      );
      requestKey.current = null;
    } catch (e) {
      setMessage(
        e instanceof Error ? e.message : "The export could not be confirmed."
      );
      requestKey.current = null;
    } finally {
      setBusy(false);
    }
  }
  const comparisons = [
    ["New registrations", r.current.registrations, r.previous.registrations],
    [
      "Distinct measured foreground accounts",
      r.current.active,
      r.previous.active
    ],
    [
      "First currently retained ordinary value",
      r.current.firstValues,
      r.previous.firstValues
    ]
  ];
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-semibold">Platform growth</h1>
      <p>
        Aggregate platform outcomes. These reports do not grant access to
        individual accounts, church activity or private cases.
      </p>
      <div className={box + " space-y-2"}>
        <p>
          <strong>
            {r.window.from} through {r.window.through}
          </strong>{" "}
          · {r.window.zone} · Collection version {r.configuration.version}
        </p>
        <p>
          Refreshed {time(r.checkedAt)} ({r.window.zone}).{" "}
          {r.window.partial
            ? "Current period is partial; comparison uses the complete preceding calendar period."
            : "Selected calendar period is complete."}
        </p>
        <p>
          Collection baseline: {time(r.configuration.startedAt)} (
          {r.window.zone}). Optional collection is{" "}
          {r.configuration.collecting
            ? "available for people who choose it"
            : "paused"}
          . Current eligible opted-in population: {r.coverage.measuredAccounts}.
        </p>
        <p className="text-sm text-gc-muted">
          Optional raw facts last {r.configuration.rawDays} days. Withdrawal,
          source removal, account eligibility and recovery can restate results.
          Historical or expired use is unknown. Current operational source
          counts are separate from the recorded lifecycle ledger.
        </p>
        {(r.coverage.partial || r.coverage.comparisonPartial) && (
          <p role="status">
            Incomplete measurement coverage in{" "}
            {r.coverage.partial ? "the selected period" : ""}
            {r.coverage.partial && r.coverage.comparisonPartial ? " and " : ""}
            {r.coverage.comparisonPartial ? "the comparison period" : ""}.
            Displayed measured totals cover retained observations only; missing
            history is not zero activity.
          </p>
        )}
      </div>
      <nav aria-label="Report periods" className="flex flex-wrap gap-2">
        {[
          ["1", "Today"],
          ["7", "7 days"],
          ["30", "30 days"],
          ["90", "90 days"]
        ].map(([n, label]) => (
          <Link
            className="gc-button gc-button-quiet"
            key={n}
            href={"/platform/admin/growth?preset=" + n}
          >
            {label}
          </Link>
        ))}
      </nav>
      <form
        key={r.window.from + ":" + r.window.through}
        action="/platform/admin/growth"
        className="flex flex-wrap items-end gap-3"
      >
        <label>
          From
          <input
            className="gc-input mt-1 block"
            type="date"
            name="from"
            required
            defaultValue={r.window.from}
          />
        </label>
        <label>
          Through
          <input
            className="gc-input mt-1 block"
            type="date"
            name="through"
            required
            defaultValue={r.window.through}
            max={reportingToday}
          />
        </label>
        <button className="gc-button">Apply dates</button>
      </form>
      {data.navigation.capabilities.includes("EXPORT_PLATFORM_METRICS") && (
        <button
          className="gc-button gc-button-quiet"
          disabled={busy}
          onClick={() => void download()}
        >
          {busy
            ? "Preparing current export…"
            : "Export current aggregates as CSV"}
        </button>
      )}
      {message && <p role="status">{message}</p>}
      <section className="space-y-3" aria-labelledby="metric-accounts">
        <h2 id="metric-accounts" className="text-2xl">
          Registration and current population
        </h2>
        <p>
          {r.definitions.registrations} {r.definitions.population}
        </p>
        <dl className="grid gap-3 sm:grid-cols-2">
          {Object.entries(r.population).map(([key, n]) => (
            <div className={box} key={key}>
              <dt>{labels[key]}</dt>
              <dd className="text-3xl font-semibold">{n}</dd>
            </div>
          ))}
        </dl>
        <Table
          caption="Equal preceding-period comparison"
          heads={["Metric", "Selected period", "Preceding period"]}
          rows={comparisons}
        />
        <p className="text-sm">
          Preceding dates: {r.window.comparison.from} through{" "}
          {r.window.comparison.through}. No rate is scaled to a complete period.
        </p>
        <Table
          caption="Original creation method in selected period"
          heads={["Method", "Registrations"]}
          rows={
            r.current.methods.rows.length
              ? r.current.methods.rows.map((v) => [
                  labels[v.key] ?? v.key,
                  v.count ?? "Suppressed — small breakdown"
                ])
              : [["No eligible registrations", 0]]
          }
        />
      </section>
      <section className="space-y-3">
        <h2 className="text-2xl">Recorded account lifecycle</h2>
        <p>{r.definitions.lifecycle}</p>
        {r.lifecycle.coveragePartial && (
          <p>
            The interval begins before this ledger baseline. Opening and closing
            values reconcile the covered portion only.
          </p>
        )}
        <Table
          caption="Lifecycle balance for covered interval"
          heads={["State", "Opening", "Closing"]}
          rows={(["ENABLED", "DEACTIVATED", "SUSPENDED"] as const).map((k) => [
            k.toLowerCase(),
            r.lifecycle.opening.states[k],
            r.lifecycle.closing.states[k]
          ])}
        />
        <p>
          Recorded creations since this baseline:{" "}
          {r.lifecycle.recordedCreations}. Recorded deletions since this
          baseline: {r.lifecycle.recordedDeletions}. Neither is a lifetime total
          before collection.
        </p>
        <Table
          caption="State transitions"
          heads={["Day", "From", "To", "Reason", "Count"]}
          rows={
            r.lifecycle.transitions.length
              ? r.lifecycle.transitions.map((e) => [
                  e.day,
                  e.from,
                  e.to,
                  e.reason,
                  e.count
                ])
              : [["No recorded transitions", "—", "—", "—", 0]]
          }
        />
      </section>
      <section className="space-y-3">
        <h2 className="text-2xl">Measured use and daily trends</h2>
        <p>{r.definitions.activity}</p>
        <dl className="grid gap-3 sm:grid-cols-3">
          {Object.entries(r.active).map(([key, n]) => (
            <div className={box} key={key}>
              <dt>
                {key === "day"
                  ? "Today"
                  : key === "week"
                    ? "Trailing 7 days"
                    : "Trailing 30 days"}
              </dt>
              <dd className="text-3xl font-semibold">{n}</dd>
            </div>
          ))}
        </dl>
        <p className="text-sm">
          Trailing windows end at this refresh, independently of the date
          filter. The daily chart below uses the selected dates. Bar length
          compares registration counts; the same exact values appear in its
          table.
        </p>
        <div aria-label="Daily registration chart" className="space-y-1">
          {r.series.map((d) => (
            <div
              key={d.day}
              className="grid grid-cols-[6rem_minmax(0,1fr)_3rem] items-center gap-2 text-xs"
            >
              <span>{d.day}</span>
              <span
                aria-hidden="true"
                className="block h-2 rounded bg-gc-action"
                style={{
                  width:
                    (d.registrations /
                      Math.max(1, ...r.series.map((x) => x.registrations))) *
                      100 +
                    "%"
                }}
              />
              <span>{d.registrations}</span>
            </div>
          ))}
        </div>
        <Table
          caption="Daily registration and measured foreground counts"
          heads={["Day", "Registrations", "Distinct foreground accounts"]}
          rows={r.series.map((d) => [
            d.day,
            d.registrations,
            d.activityAvailable ? d.active : "Not collected or expired"
          ])}
        />
      </section>
      <section className="space-y-3">
        <h2 className="text-2xl">First value and return cohorts</h2>
        <p>
          {r.definitions.firstValue} {r.definitions.funnel}
        </p>
        <Table
          caption="Mature seven-day signup funnel"
          heads={["Step", "Result"]}
          rows={[
            ["Eligible measured signup accounts", r.funnel.cohortAccounts],
            ["Mature seven-day denominator", r.funnel.matureAccounts],
            ["First measured foreground use", percent(r.funnel.foreground)],
            ["First ordinary value", percent(r.funnel.firstValue)],
            ["Not mature yet", r.funnel.immatureAccounts]
          ]}
        />
        <p>{r.definitions.returns}</p>
        <Table
          caption="Exact-day return rates"
          heads={["Observation", "Mature result", "Not mature yet"]}
          rows={[
            ["Day 7", percent(r.returns.d7), r.returns.d7Immature],
            ["Day 30", percent(r.returns.d30), r.returns.d30Immature]
          ]}
        />
        <Table
          caption="Signup-calendar-day cohorts"
          heads={["Signup day", "Accounts", "Day 7", "Day 30"]}
          rows={
            r.cohorts.length
              ? r.cohorts.map((c) => [
                  c.day,
                  c.accounts ?? "Suppressed",
                  c.suppressed
                    ? "Suppressed"
                    : !c.d7Mature
                      ? "Not mature yet"
                      : c.d7
                        ? percent(c.d7)
                        : "Unavailable",
                  c.suppressed
                    ? "Suppressed"
                    : !c.d30Mature
                      ? "Not mature yet"
                      : c.d30
                        ? percent(c.d30)
                        : "Unavailable"
                ])
              : [["No measured signup cohort", "—", "—", "—"]]
          }
        />
      </section>
      <section className="space-y-3">
        <h2 className="text-2xl">
          Getting started and optional church connection
        </h2>
        <p>
          Getting started begins when its hints are displayed under current
          measurement choice. A deliberate finish or save-for-later choice ends
          that optional walkthrough. No profile, photo or church membership is
          required. Historical starts are unknown.
        </p>
        <Table
          caption="Getting-started starts in the selected period"
          heads={["Observed step", "Accounts"]}
          rows={[
            ["Started", r.onboarding.started],
            ["Explicitly finished", r.onboarding.completed],
            ["Explicitly saved for later", r.onboarding.skipped],
            ["Finished or saved for later (distinct)", r.onboarding.finished]
          ]}
        />
        <p>
          Church connections use their separate current request and approval
          records. The denominator is measured requests in this period;
          withdrawing a request removes it. First permitted action means an
          ordinary post, reply, RSVP, event creation or volunteer signup after
          approval and by this period’s end.
        </p>
        <Table
          caption="Optional church connection funnel"
          heads={["Step", "Connections"]}
          rows={[
            ["Requested", r.churchFunnel.requested],
            ["Currently approved", r.churchFunnel.approved],
            ["First permitted church action", r.churchFunnel.acted]
          ]}
        />
      </section>
      <section className="space-y-3">
        <h2 className="text-2xl">Feature adoption</h2>
        <p>
          {r.definitions.adoption} Denominator: {r.coverage.measuredAccounts}{" "}
          currently eligible opted-in accounts. Current source records with
          unknown successful-state times are excluded, with no historical
          backfill.
        </p>
        <Table
          caption="Successful ordinary actions in selected period"
          heads={[
            "Feature",
            "Distinct actors",
            "Actions",
            "Share of measured population"
          ]}
          rows={Object.keys({ ...metricActions, EVENT: "" }).map((key) => {
            const a = r.current.adoption.find((a) => a.key === key);
            return [
              labels[key],
              a?.suppressed ? "Suppressed" : (a?.actors ?? 0),
              a?.suppressed ? "Suppressed" : (a?.actions ?? 0),
              a?.suppressed
                ? "Suppressed — small complementary breakdown"
                : r.coverage.measuredAccounts
                  ? (
                      ((a?.actors ?? 0) / r.coverage.measuredAccounts) *
                      100
                    ).toFixed(1) + "%"
                  : "Unavailable"
            ];
          })}
        />
      </section>
      <section className="space-y-3">
        <h2 className="text-2xl">Churches and topic spaces</h2>
        <p>{r.definitions.organizations}</p>
        <Table
          caption="Current organization sources and selected-period growth"
          heads={["Source", "Count"]}
          rows={Object.entries(r.organizations).map(([key, n]) => [
            labels[key],
            n
          ])}
        />
      </section>
      <section className="space-y-3">
        <h2 className="text-2xl">Support workload and response</h2>
        <p>{r.definitions.support}</p>
        <p>
          These are cases received in the selected interval, observed at this
          refresh. Help, bug, suggestion and appeal response means a human reply
          or resolution. Content reports and claims use first authorized
          decision instead; these different time definitions are never combined.
          Resolution is receipt to the latest closure, including waiting and
          reopened time. Claim resubmissions remain the same case; a reopen
          proportion for claims is unavailable.
        </p>
        <Table
          caption="Unique received cases by source type"
          heads={[
            "Type",
            "Cases",
            "Requesters",
            "Open",
            "Unassigned open",
            "Open ≥7 days",
            "Responses",
            "Mean response hours",
            "Resolved",
            "Mean resolution hours",
            "Reopened"
          ]}
          rows={
            r.support.length
              ? r.support.map((s) => [
                  s.type,
                  s.cases,
                  s.requesters,
                  s.open,
                  s.unassigned,
                  s.aged,
                  s.responded,
                  s.meanFirstResponseHours?.toFixed(2) ?? "Unavailable",
                  s.resolved,
                  s.meanResolutionHours?.toFixed(2) ?? "Unavailable",
                  s.type === "CLAIM"
                    ? "Unavailable"
                    : `${s.reopened} (${s.reopenedPercent?.toFixed(1) ?? "—"}%)`
                ])
              : [
                  [
                    "No cases received in this interval",
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    "Unavailable",
                    0,
                    "Unavailable",
                    "Unavailable"
                  ]
                ]
          }
        />
      </section>
      <section className="space-y-3">
        <h2 className="text-2xl">Optional referral and device breakdowns</h2>
        <p>
          {r.definitions.breakdowns} Population: distinct foreground accounts in
          the selected interval. Device/browser uses the latest retained day per
          account, so people are counted once.
        </p>
        {Object.entries(r.dimensions).map(([key, value]) => (
          <Table
            key={key}
            caption={
              key === "referral"
                ? "Declared referral"
                : key === "device"
                  ? "Device family"
                  : "Browser family"
            }
            heads={["Category", "Accounts"]}
            rows={
              value.rows.length
                ? value.rows.map((v) => [
                    labels[v.key] ?? v.key,
                    v.count ?? "Suppressed — small complementary breakdown"
                  ])
                : [["No eligible observations", "Unavailable"]]
            }
          />
        ))}
      </section>
      <section className="space-y-3">
        <h2 className="text-2xl">Feedback and prompt coverage</h2>
        <p>{r.definitions.feedback}</p>
        <p>{r.feedback.message}</p>
      </section>
      <section className="space-y-3">
        <h2 className="text-2xl">Release context and definitions</h2>
        <p>
          Release notes provide context only; a change in an outcome does not
          establish that a release caused it.
        </p>
        <Link className="underline" href="/platform/releases">
          Read published release notes
        </Link>
        <ul>
          {r.releaseContext.map((v) => (
            <li key={v.version}>
              {v.date} · {v.version} · {v.summary}
            </li>
          ))}
        </ul>
        {!r.releaseContext.length && (
          <p>No release note falls in these dates.</p>
        )}
        <details className={box}>
          <summary className="min-h-11 cursor-pointer font-semibold">
            Full metric dictionary and coverage
          </summary>
          <dl className="space-y-3">
            {Object.entries(r.definitions).map(([key, definition]) => (
              <div key={key}>
                <dt className="font-semibold">{key}</dt>
                <dd>{definition}</dd>
              </div>
            ))}
          </dl>
        </details>
      </section>
    </div>
  );
}
