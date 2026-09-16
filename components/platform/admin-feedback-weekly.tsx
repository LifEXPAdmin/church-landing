"use client";
import Link from "next/link";
import type { FeedbackWeeklySnapshot } from "@/lib/platform/feedback-weekly";
import { AdminForm, adminInputClass } from "./admin-form";
import { FeedbackMetrics } from "./feedback-metrics";

type Weekly = FeedbackWeeklySnapshot["weekly"];
function Cases({ rows }: { rows: Weekly["cases"]["highImpact"] }) {
  return rows.length ? (
    <ul className="space-y-3">
      {rows.map((row) => (
        <li key={row.id}>
          <Link
            className="underline"
            href={`/platform/admin/cases/SUPPORT/${encodeURIComponent(row.id)}`}
          >
            {row.title}
          </Link>
          <p>
            {row.state.replaceAll("_", " ")} · {row.priority.toLowerCase()}{" "}
            priority
          </p>
          {!!row.buildUrl && (
            <a
              className="underline"
              href={row.buildUrl}
              target="_blank"
              rel="noreferrer"
            >
              Linked build work
            </a>
          )}
        </li>
      ))}
    </ul>
  ) : (
    <p>No currently authorized cases match.</p>
  );
}
function Themes({ rows }: { rows: Weekly["cases"]["themes"] }) {
  return rows.length ? (
    <ul className="space-y-4">
      {rows.map((row) => (
        <li
          className="space-y-2 rounded-xl border border-gc-divider p-4"
          key={row.key}
        >
          <h3 className="font-semibold">{row.title}</h3>
          <p>
            {row.cases} cases · {row.messages} messages · {row.requesters}{" "}
            distinct people · {row.open} currently open
          </p>
          {row.requesters < 5 && (
            <p>
              Fewer than five people; this does not establish a widespread
              request.
            </p>
          )}
          <Cases rows={row.sources} />
          {row.cases > row.sources.length && (
            <p>
              Showing the first {row.sources.length} authorized source links.
              Use Feedback requests to inspect the rest.
            </p>
          )}
        </li>
      ))}
    </ul>
  ) : (
    <p>No reviewed tags or duplicate groups match this section.</p>
  );
}
export function AdminFeedbackWeekly({
  data,
  onRefresh
}: {
  data: FeedbackWeeklySnapshot;
  onRefresh: () => void;
}) {
  const w = data.weekly;
  return (
    <div className="space-y-7">
      <header className="space-y-3">
        <h1 className="text-3xl font-semibold">Weekly feedback review</h1>
        <p>
          {w.window.from} through {w.window.through} · {w.window.zone}.
          Refreshed {w.checkedAt}.
        </p>
        <form action="/platform/admin/feedback/weekly" className="space-y-2">
          <label htmlFor="feedback-review-week">Week beginning Monday</label>
          <input
            className={adminInputClass}
            id="feedback-review-week"
            type="date"
            name="week"
            defaultValue={w.window.from}
            required
          />
          <p>Choose a completed week within the last twelve weeks.</p>
          <button className="gc-button" type="submit">
            Open week
          </button>
        </form>
        <p>
          Case summaries use only feedback you can currently read. Tags and
          duplicate groups are manual; overlapping themes must not be added
          together. Source links recheck access when opened.
        </p>
        <Link className="underline" href="/platform/admin/feedback">
          Open Feedback requests
        </Link>
      </header>
      <section className="space-y-3">
        <h2 className="text-2xl">New and returning accounts</h2>
        {w.growth ? (
          <>
            <p>
              {w.growth.registrations} new registrations · {w.growth.active}{" "}
              measured active accounts · {w.growth.returning} returning accounts
              created before this week.
            </p>
            <p>
              Current opted-in population: {w.growth.measuredAccounts}.
              Returning means retained foreground use in this week, not
              exact-day D7/D30 retention.{" "}
              {w.growth.coveragePartial
                ? "Some requested dates precede available measurement coverage."
                : "Optional measurement does not cover every account or guest."}
            </p>
            <Link
              className="underline"
              href={`/platform/admin/growth?from=${w.window.from}&through=${w.window.through}`}
            >
              Open definitions, exact-day cohorts and permitted exports in
              Growth
            </Link>
          </>
        ) : (
          <p>
            Platform-wide growth and rating reports require the separate
            aggregate-metrics permission.
          </p>
        )}
      </section>
      {w.feedback && (
        <section className="space-y-3">
          <h2 className="text-2xl">Ratings and response coverage</h2>
          <FeedbackMetrics feedback={w.feedback} />
        </section>
      )}
      <section className="space-y-3">
        <h2 className="text-2xl">Feedback received this week</h2>
        <p>
          {w.cases.cases} cases · {w.cases.messages} retained messages across
          those cases · {w.cases.requesters} distinct requesters. Message totals
          include the original submission and later replies through this
          refresh.
        </p>
        <p>
          {w.cases.untagged} cases have no manual tag or duplicate group.{" "}
          {w.cases.themeCount} themes; at most twenty per list are shown,
          ordered by distinct people and then cases.
        </p>
        <Themes rows={w.cases.themes} />
      </section>
      <section className="space-y-3">
        <h2 className="text-2xl">Top reported problems</h2>
        <p>
          Manual themes containing at least one bug report; counts describe the
          whole linked theme.
        </p>
        <Themes rows={w.cases.problems} />
      </section>
      <section className="space-y-3">
        <h2 className="text-2xl">Repeated suggestions</h2>
        <p>
          Themes containing at least two suggestion cases; repeated messages
          from one person remain one requester.
        </p>
        <Themes rows={w.cases.repeatedSuggestions} />
      </section>
      <section className="space-y-3">
        <h2 className="text-2xl">Unresolved high-impact bugs</h2>
        <p>
          {w.cases.highImpactCount} currently open with high or urgent manual
          priority, including cases received before this week. Showing up to
          twenty.
        </p>
        <Cases rows={w.cases.highImpact} />
      </section>
      <section className="space-y-3">
        <h2 className="text-2xl">Reopened after resolution</h2>
        <p>
          {w.cases.reopenedCount} cases reopened in this week after a recorded
          resolution or closure. Showing up to twenty.
        </p>
        <Cases rows={w.cases.reopened} />
      </section>
      <section className="space-y-3">
        <h2 className="text-2xl">Released changes during the week</h2>
        <p>
          Release notes provide context; a change in feedback does not establish
          that a release caused it.
        </p>
        {w.releases.length ? (
          <ul className="space-y-3">
            {w.releases.map((r) => (
              <li key={r.id}>
                {r.date} · {r.version} · {r.summary}
              </li>
            ))}
          </ul>
        ) : (
          <p>No published release note falls in this week.</p>
        )}
        <Link className="underline" href="/platform/releases">
          Read release notes
        </Link>
      </section>
      <section className="space-y-3">
        <h2 className="text-2xl">Your private review notes</h2>
        <p>
          Only your current product-review account can open these notes. Keep
          personal case details in the source case. Link accepted work to one
          canonical task or specification.
        </p>
        <AdminForm
          owner={data.navigation.viewer.id}
          operation="feedback-review"
          fixed={{ week: w.window.from, expectedVersion: w.notes.version }}
          fields={[
            {
              name: "learned",
              label: "What we learned",
              type: "textarea",
              value: w.notes.learned,
              max: 2000,
              optional: true
            },
            {
              name: "tryNext",
              label: "What we will try",
              type: "textarea",
              value: w.notes.tryNext,
              max: 2000,
              optional: true
            },
            {
              name: "checkNext",
              label: "What we will check next",
              type: "textarea",
              value: w.notes.checkNext,
              max: 2000,
              optional: true
            },
            {
              name: "buildUrl",
              label: "Canonical build task or specification",
              value: w.notes.buildUrl,
              max: 500,
              optional: true
            }
          ]}
          button="Save private review"
          onSaved={onRefresh}
        />
      </section>
    </div>
  );
}
