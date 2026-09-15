"use client";
import Link from "next/link";
import { useState } from "react";
import type { OnboardingView } from "@/lib/platform/onboarding";
import { useWelcomeView } from "./use-welcome-view";
import { claimStatusLabels } from "@/lib/platform/church-claim-data";

const button = "gc-button gc-button-quiet";
export function OnboardingHome({
  ownerId,
  full = false
}: {
  ownerId: string;
  full?: boolean;
}) {
  const [churchId, setChurchId] = useState(""),
    [expanded, setExpanded] = useState(full);
  const { data, message, saving, save, refresh, unconfirmed, retry } =
    useWelcomeView<OnboardingView>(
      "/api/platform/church-tools?view=home" +
        (churchId ? "&churchId=" + encodeURIComponent(churchId) : ""),
      ownerId,
      expanded
    );
  const visible = data?.steps.filter((s) => !s.done && !s.dismissed) ?? [];
  const connectionLabels: Record<string, string> = {
    PENDING:
      "Your church request is pending review. Private church access begins only after approval.",
    DECLINED:
      "Your request was not approved. Review its status or contact Help.",
    REMOVED:
      "Your church connection has ended. Former private church information is unavailable.",
    LEFT: "You left your church connection. You can review current options in My church.",
    WITHDRAWN:
      "You withdrew your request. You can review your next options in My church."
  };
  return (
    <details
      open={expanded}
      onToggle={(e) => setExpanded(e.currentTarget.open)}
      aria-label={full ? "Getting started" : "Your next steps and this week"}
      className="my-4 space-y-5 rounded-xl border border-gc-divider bg-gc-surface p-4"
    >
      <summary className="min-h-11 cursor-pointer py-2 font-semibold">
        {full ? "Your saved next steps" : "Next steps and this week"}
        {!full && data?.week?.events[0] && (
          <span className="ml-2 font-normal">
            · {data.week.events[0].title}
          </span>
        )}
      </summary>
      {message && <p role="status">{message}</p>}
      {unconfirmed && (
        <button
          className="gc-button gc-button-quiet"
          disabled={saving}
          onClick={() => void retry()}
        >
          Retry unconfirmed change
        </button>
      )}
      {!data ? (
        <>
          <p>Checking your next steps…</p>
          <button className={button} onClick={() => void refresh()}>
            Check again
          </button>
        </>
      ) : (
        <>
          {(full || visible.length > 0) && (
            <section
              aria-labelledby="getting-started-title"
              className="space-y-3"
            >
              <h2 id="getting-started-title" className="text-xl">
                {full ? "Getting started" : "Make yourself at home"}
              </h2>
              <p className="text-sm text-gc-muted">
                Choose what is useful now. Photos, introductions, interests and
                contact sharing are optional.
              </p>
              {!data.verified && (
                <p>
                  <Link className="underline" href="/platform/account/verify">
                    Verify your email
                  </Link>{" "}
                  before using church tools. You can keep browsing.
                </p>
              )}
              {data.connection && data.connection.state !== "APPROVED" && (
                <p>
                  {connectionLabels[data.connection.state] ??
                    "Review your church request and current options in My church."}{" "}
                  <Link className="underline" href="/platform/my-church">
                    View request
                  </Link>
                </p>
              )}
              <ul className="space-y-2">
                {(full ? data.steps : visible.slice(0, 2)).map((step) => (
                  <li
                    key={step.id}
                    className="flex flex-wrap items-center justify-between gap-2"
                  >
                    <Link href={step.href} className="min-h-11 py-2 underline">
                      {step.label}
                      {step.done
                        ? " · Done"
                        : step.dismissed
                          ? " · Saved for later"
                          : ""}
                    </Link>
                    {!step.done && (
                      <button
                        disabled={saving}
                        className={button}
                        onClick={() =>
                          void save({
                            operation: "onboarding",
                            step: step.id,
                            dismissed: !step.dismissed,
                            expectedVersion: data.version
                          })
                        }
                      >
                        {step.dismissed ? "Show hint" : "Later"}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
              {full && (
                <p className="text-sm text-gc-muted">
                  An introduction can be a few words about yourself or what
                  brought you here. Publish only what you want your chosen
                  audience to read. On a church post, Manage post → Welcome and
                  questions lets you label an introduction or question.
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                {visible.length > 0 && (
                  <button
                    disabled={saving}
                    className={button}
                    onClick={() =>
                      void save({
                        operation: "onboarding",
                        step: "all",
                        dismissed: true,
                        expectedVersion: data.version
                      })
                    }
                  >
                    Save hints for later
                  </button>
                )}
                {full && (
                  <button
                    disabled={saving}
                    className={button}
                    onClick={() =>
                      void save({
                        operation: "onboarding",
                        step: "all",
                        dismissed: false,
                        expectedVersion: data.version
                      })
                    }
                  >
                    Restore optional hints
                  </button>
                )}
                <Link className={button} href="/platform/help">
                  Help and contacts
                </Link>
              </div>
            </section>
          )}
          {full && (
            <section className="space-y-3" aria-label="Church setup">
              <h2 className="text-xl">Adding or representing a church</h2>
              <p>
                Search for an existing church first. Choose a short community
                listing or private representative setup. A saved draft gives no
                church authority.
              </p>
              <Link href="/platform/churches" className={button}>
                Find your church
              </Link>
              <div className="flex flex-wrap gap-2">
                <Link href="/platform/church-listings" className={button}>
                  Community listing drafts
                </Link>
                <Link href="/platform/church-claims" className={button}>
                  Representative setup and status
                </Link>
              </div>
              {data.listings.map((l) => (
                <p key={l.id}>
                  <Link
                    className="underline"
                    href={"/platform/church-listings/" + l.id}
                  >
                    Resume community listing ·{" "}
                    {claimStatusLabels[l.status] ?? l.status}
                  </Link>
                </p>
              ))}
              {data.claims.map((c) => (
                <p key={c.id}>
                  <Link
                    className="underline"
                    href={"/platform/church-claims/" + c.id}
                  >
                    Open representative setup ·{" "}
                    {claimStatusLabels[c.status] ?? c.status}
                    {c.status === "APPROVED" && !c.activated
                      ? " · Review before activation"
                      : ""}
                  </Link>
                </p>
              ))}
            </section>
          )}
          {data.week && (
            <section className="space-y-3" aria-labelledby="this-week-title">
              <h2 id="this-week-title" className="text-xl">
                This week at {data.week.church.name}
              </h2>
              <p className="text-sm text-gc-muted">
                The next seven days, from your current church calendar and
                posts.
              </p>
              {data.churches.length > 1 && (
                <label className="block">
                  Church
                  <select
                    className="gc-input w-full"
                    value={data.week.church.id}
                    onChange={(e) => setChurchId(e.target.value)}
                  >
                    {data.churches.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {data.week.welcome && (
                <div>
                  <h3 className="font-semibold">Start here</h3>
                  <Link className="underline" href={data.week.welcome.href}>
                    {data.week.welcome.label}
                  </Link>
                </div>
              )}
              <div>
                <h3 className="font-semibold">Next events</h3>
                {data.week.events.length ? (
                  <ul className="space-y-2">
                    {data.week.events.map((e) => (
                      <li key={e.id}>
                        <Link className="underline" href={e.href}>
                          {e.title}
                        </Link>
                        <p className="text-sm">
                          {e.allDay
                            ? e.startLocal.slice(0, 10) + " · All day"
                            : e.startLocal.replace("T", " ") +
                              " · " +
                              e.timeZone}
                          {e.response
                            ? " · Your RSVP: " + e.response.toLowerCase()
                            : ""}
                        </p>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>
                    No upcoming church events are available in the next seven
                    days.
                  </p>
                )}
              </div>
              {data.week.notices.length > 0 && (
                <div>
                  <h3 className="font-semibold">Recent church notices</h3>
                  <ul>
                    {data.week.notices.map((p) => (
                      <li key={p.id}>
                        <Link
                          className="inline-block min-h-11 py-2 underline"
                          href={p.href}
                        >
                          {p.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div>
                <h3 className="font-semibold">
                  Serving opportunities and your commitments
                </h3>
                {data.week.roles.length ? (
                  <ul>
                    {data.week.roles.map((r) => (
                      <li key={r.id}>
                        <Link
                          className="inline-block min-h-11 py-2 underline"
                          href={r.href}
                        >
                          {r.role} ·{" "}
                          {r.committed ? "You are signed up" : r.open + " open"}
                          {r.detailsChanged
                            ? " · Details changed; review your commitment"
                            : ""}
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>
                    No open serving roles or volunteer commitments are shown for
                    this week.
                  </p>
                )}
                {data.week.moreRoles && (
                  <p>More roles may be available on church posts.</p>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <Link
                  className={button}
                  href={"/platform/churches/" + data.week.church.id}
                >
                  Open church
                </Link>
                <Link className={button} href="/platform/calendars">
                  Calendars and my commitments
                </Link>
              </div>
            </section>
          )}
          {(full || !data.week) && (
            <section className="space-y-3" aria-label="Explore real community">
              <h2 className="text-xl">Find your next connection</h2>
              {data.suggestedChurches.map((c) => (
                <p key={c.id}>
                  <Link
                    className="underline"
                    href={"/platform/churches/" + c.id}
                  >
                    {c.name}
                  </Link>
                  <span className="block text-sm text-gc-muted">
                    Listed in the church directory
                    {c.city || c.region
                      ? " · " + [c.city, c.region].filter(Boolean).join(", ")
                      : ""}
                  </span>
                </p>
              ))}
              {data.suggestions.map((p) => (
                <p key={p.href}>
                  <Link className="underline" href={p.href}>
                    {p.name}
                  </Link>
                  <span className="block text-sm text-gc-muted">
                    {p.reason}
                  </span>
                </p>
              ))}
              {!data.suggestedChurches.length && !data.suggestions.length && (
                <p>
                  The community is still small. Explore real topics, find a
                  church, or share your first contribution.
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                <Link className={button} href="/platform/search">
                  Explore people and churches
                </Link>
                <Link className={button} href="/platform/topics">
                  Explore topics
                </Link>
              </div>
              <p className="text-sm text-gc-muted">
                Open a profile or church to decide whether to follow. No one is
                followed automatically.
              </p>
            </section>
          )}
          {!full && (
            <Link
              className="inline-block min-h-11 py-2 underline"
              href="/platform/getting-started"
            >
              All getting-started steps
            </Link>
          )}
        </>
      )}
    </details>
  );
}
