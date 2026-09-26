import { createHash } from "node:crypto";
import Link from "next/link";
import type { ReactNode } from "react";
import { PlatformShell } from "./platform-shell";
import { PrivateSnapshotGuard } from "./private-snapshot-guard";
import { TopicReadBoundary } from "./topic-read-boundary";
import { RegionalTime } from "./regional-presentation";
import {
  VolunteerApplyForm,
  VolunteerApplicationActions,
  VolunteerOpportunityForm
} from "./volunteer-forms";
import { volunteerPage } from "@/lib/platform/volunteer-session";
import type {
  VolunteerApplicationView,
  VolunteerOpportunityView
} from "@/lib/platform/volunteer-reads";
import { getCurrentPlatformUser } from "@/lib/platform/session";
import { accountEntryHref } from "@/lib/platform/account-entry";
import { PortalError } from "@/lib/platform/portal-policy";
import { PrivilegedAuthenticationError } from "@/lib/platform/privileged-auth-policy";
import { privilegedChallengeHref } from "@/lib/platform/privileged-auth-navigation";

export type VolunteerPageQuery = Record<string, string | string[] | undefined>;
const linkClass = "inline-flex min-h-11 items-center underline";
const titles: Record<string, string> = {
  list: "Volunteer opportunities",
  new: "Create volunteer opportunity",
  edit: "Edit volunteer opportunity",
  opportunity: "Volunteer opportunity",
  applications: "Private volunteer applications"
};
function Opportunity({
  row,
  detail = false
}: {
  row: VolunteerOpportunityView;
  detail?: boolean;
}) {
  return (
    <article className="space-y-3 rounded-xl border border-gc-divider p-4 max-[359px]:px-[12px]">
      <h2 className="text-2xl">
        <Link
          prefetch={false}
          className={linkClass}
          href={`/platform/serve/${row.id}`}
        >
          {row.title}
        </Link>
      </h2>
      <p className="whitespace-pre-wrap break-words">{row.duties}</p>
      {row.shift ? (
        <>
          <p>
            <RegionalTime value={row.shift.startAt} /> to{" "}
            <RegionalTime value={row.shift.endAt} />
          </p>
          <p className="text-sm">
            Source schedule: {row.shift.startLocal.replace("T", " ")} to{" "}
            {row.shift.endLocal.replace("T", " ")} ({row.shift.timeZone}).
          </p>
          {row.shift.conflict && (
            <p role="status">
              This fixed shift no longer fits the parent event. New applications
              and approvals are paused until the coordinator reviews it.
            </p>
          )}
        </>
      ) : (
        <p>
          Ongoing role. Scheduling is arranged with the coordinator; this does
          not add a timed calendar commitment.
        </p>
      )}
      {row.commitment && (
        <p className="whitespace-pre-wrap break-words">
          Commitment: {row.commitment}
        </p>
      )}
      <p>
        {row.filled} of {row.capacity} places assigned.{" "}
        {row.closed
          ? "Closed to new applications and approvals."
          : `${Math.max(0, row.capacity - row.filled)} places available.`}
      </p>
      <p>Coordinator approval required. Applying does not reserve a place.</p>
      {detail && (
        <>
          <h3 className="font-semibold">Requirements</h3>
          <p className="whitespace-pre-wrap break-words">
            {row.requirements || "No additional requirements listed."}
          </p>
          <h3 className="font-semibold">Coordinator contact</h3>
          <p className="whitespace-pre-wrap break-words">
            {row.contact || "Use the church’s published contact route."}
          </p>
          <div className="flex flex-wrap gap-4">
            <Link
              prefetch={false}
              className={linkClass}
              href={`/platform/posts/${row.postId}`}
            >
              Church recruitment post
            </Link>
            {row.eventId && (
              <Link
                prefetch={false}
                className={linkClass}
                href={`/platform/events/${row.eventId}`}
              >
                Parent event
              </Link>
            )}
          </div>
        </>
      )}
    </article>
  );
}
function Application({ row }: { row: VolunteerApplicationView }) {
  return (
    <div className="space-y-3">
      <p className="font-semibold">
        Application: {row.state.toLowerCase()}.{" "}
        {row.completed ? "Completed help is retained." : ""}
      </p>
      {!row.current && (
        <p>
          The source is unavailable to this account. Only your minimal
          application status and available withdrawal action are shown.
        </p>
      )}
      {row.statement && (
        <p className="whitespace-pre-wrap break-words">
          Your application note: {row.statement}
        </p>
      )}
      {row.decisionNote && (
        <p className="whitespace-pre-wrap break-words">
          Coordinator explanation: {row.decisionNote}
        </p>
      )}
      {row.detailsChanged && row.current && (
        <p role="status">
          The commitment changed. Review its current details before proceeding.
        </p>
      )}
      {!!row.history.length && (
        <details>
          <summary className="min-h-11 cursor-pointer py-2">
            Recent private history
          </summary>
          <ol className="space-y-2">
            {row.history.map((event) => (
              <li key={event.version}>
                {event.action.toLowerCase()} on{" "}
                <RegionalTime value={event.createdAt} />
                {event.note && (
                  <p className="whitespace-pre-wrap break-words">
                    {event.note}
                  </p>
                )}
              </li>
            ))}
          </ol>
        </details>
      )}
    </div>
  );
}
export async function VolunteerPage({
  view,
  id,
  path,
  query
}: {
  view: string;
  id?: string;
  path: string;
  query: VolunteerPageQuery;
}) {
  const user = await getCurrentPlatformUser();
  let content: ReactNode;
  try {
    if (
      Object.entries(query).some(
        ([key, value]) =>
          !["after", "churchId", "q", "postId"].includes(key) ||
          (value !== undefined && typeof value !== "string")
      )
    )
      throw new PortalError(
        400,
        "Use the current volunteer navigation and filters."
      );
    const values = Object.fromEntries(
      Object.entries(query).filter(
        (entry): entry is [string, string] => typeof entry[1] === "string"
      )
    );
    if (!user && !["list", "opportunity"].includes(view))
      content = (
        <p>
          Sign in to view your private volunteer records.{" "}
          <Link className={linkClass} href={accountEntryHref("login", path)}>
            Sign in
          </Link>
        </p>
      );
    else {
      const result = await volunteerPage({ ...values, view, id });
      const parameters = new URLSearchParams({
        ...values,
        view,
        ...(id ? { id } : {})
      });
      const api = `/api/platform/volunteers?${parameters}`;
      let body: ReactNode;
      if (result.view === "list") {
        const filters = new URLSearchParams({
          ...(result.q ? { q: result.q } : {}),
          ...(result.churchId ? { churchId: result.churchId } : {})
        });
        const firstHref = path + (filters.size ? `?${filters}` : "");
        body = (
          <div className="space-y-5">
            <p>
              Find a way to serve through a church’s published opportunities.
              Application notes and decisions stay private.
            </p>
            <form className="flex flex-wrap items-end gap-3" action={path}>
              {result.churchId && (
                <input type="hidden" name="churchId" value={result.churchId} />
              )}
              <label className="block min-w-0 flex-1 space-y-2">
                <span>Search opportunity titles</span>
                <input
                  type="search"
                  name="q"
                  maxLength={70}
                  defaultValue={result.q}
                  className="w-full rounded-lg border p-3"
                />
              </label>
              <button type="submit" className="gc-button">
                Search
              </button>
              {filters.size > 0 && result.items.length > 0 && (
                <Link
                  className={linkClass}
                  prefetch={false}
                  href="/platform/serve"
                >
                  Clear filters
                </Link>
              )}
            </form>
            {!result.items.length && (
              <section className="space-y-3 rounded-xl border border-gc-divider p-5">
                <h2 className="text-2xl">
                  {values.after || result.nextCursor
                    ? "No opportunities on this page"
                    : filters.size
                      ? "No opportunities match these filters"
                      : "No volunteer opportunities to show yet"}
                </h2>
                <p>
                  {result.nextCursor
                    ? "Use Next opportunities to continue looking for available opportunities."
                    : values.after
                      ? "Return to the first page to check the opportunities currently available."
                      : filters.size
                        ? "Try another title or clear the filters to browse available opportunities."
                        : "Opportunities will appear here as churches publish them. Explore church pages for other ways to connect and serve."}
                </p>
                <div className="flex flex-wrap gap-3">
                  {values.after && (
                    <Link
                      prefetch={false}
                      className="gc-button gc-button-quiet"
                      href={firstHref}
                    >
                      Back to first opportunities
                    </Link>
                  )}
                  {filters.size > 0 && (
                    <Link
                      prefetch={false}
                      className="gc-button gc-button-quiet"
                      href="/platform/serve"
                    >
                      Clear filters
                    </Link>
                  )}
                  <Link
                    prefetch={false}
                    className="gc-button gc-button-quiet"
                    href="/platform/churches"
                  >
                    Explore churches
                  </Link>
                  <Link
                    prefetch={false}
                    className="gc-button gc-button-quiet"
                    href={
                      user
                        ? "/platform/serve/applications"
                        : accountEntryHref(
                            "login",
                            "/platform/serve/applications"
                          )
                    }
                  >
                    {user
                      ? "Review my applications"
                      : "Sign in to review my applications"}
                  </Link>
                </div>
              </section>
            )}
            {result.items.map((row) => (
              <Opportunity key={row.id} row={row} />
            ))}
            {result.nextCursor && (
              <Link
                prefetch={false}
                className="gc-button gc-button-quiet"
                href={`${path}?${new URLSearchParams({ ...values, after: result.nextCursor })}`}
              >
                Next opportunities
              </Link>
            )}
            <p>
              Coordinators can create an opportunity from a church post they are
              authorized to edit.
            </p>
          </div>
        );
      } else if (result.view === "new")
        body = (
          <VolunteerOpportunityForm
            owner={result.ownerId}
            postId={result.postId}
            postVersion={result.postVersion}
            event={result.event}
          />
        );
      else if (result.view === "edit")
        body = (
          <VolunteerOpportunityForm
            key={`${result.opportunity.id}:${result.opportunity.version}`}
            owner={result.ownerId!}
            postId={result.opportunity.postId}
            postVersion={result.opportunity.postVersion}
            event={result.parentEvent}
            opportunity={result.opportunity}
          />
        );
      else if (result.view === "opportunity")
        body = (
          <div className="space-y-5">
            <Opportunity row={result.opportunity} detail />
            <div className="flex flex-wrap gap-4">
              {result.canEdit && (
                <Link
                  prefetch={false}
                  className="gc-button gc-button-quiet"
                  href={`${path}/edit`}
                >
                  Edit opportunity
                </Link>
              )}
              {result.canReview && (
                <Link
                  prefetch={false}
                  className="gc-button gc-button-quiet"
                  href={`${path}/applications`}
                >
                  Review applications
                </Link>
              )}
            </div>
            {result.application && (
              <section
                aria-label="Your application"
                className="space-y-4 rounded-xl border p-4 max-[359px]:px-[12px]"
              >
                <h2 className="text-2xl">Your application</h2>
                <Application row={result.application} />
                <VolunteerApplicationActions
                  key={result.application.version}
                  owner={result.ownerId!}
                  application={result.application}
                />
              </section>
            )}
            {result.ownerId &&
              result.eligible &&
              !result.opportunity.closed &&
              (!result.application ||
                ["WITHDRAWN", "DECLINED"].includes(result.application.state) ||
                (result.application.state === "SUBMITTED" &&
                  result.application.detailsChanged)) && (
                <VolunteerApplyForm
                  key={`${result.opportunity.version}:${result.application?.version ?? 0}`}
                  owner={result.ownerId}
                  opportunity={result.opportunity}
                  application={result.application}
                />
              )}
            {!result.eligible && (
              <p>
                A currently eligible adult account with access to this church
                post is required to apply.{" "}
                {!user && (
                  <Link
                    className={linkClass}
                    href={accountEntryHref("login", path)}
                  >
                    Sign in
                  </Link>
                )}
              </p>
            )}
          </div>
        );
      else
        body = (
          <div className="space-y-5">
            {result.opportunity && <Opportunity row={result.opportunity} />}
            <p>
              {result.opportunity
                ? "Only current authorized coordinators can review eligible applicants for this opportunity."
                : "Your ongoing assignments and timed applications appear here. Accepted timed shifts also appear in My commitments."}
            </p>
            {!result.items.length && (
              <p>No applications are available on this page.</p>
            )}
            {result.items.map((row) => (
              <article
                key={`${row.id}:${row.version}`}
                className="space-y-4 rounded-xl border p-4 max-[359px]:px-[12px]"
              >
                <h2 className="text-2xl">{row.applicantName ?? row.title}</h2>
                {row.opportunityId && (
                  <Link
                    className={linkClass}
                    prefetch={false}
                    href={`/platform/serve/${row.opportunityId}`}
                  >
                    View opportunity
                  </Link>
                )}
                <Application row={row} />
                <VolunteerApplicationActions
                  owner={result.ownerId}
                  application={row}
                  opportunity={result.opportunity}
                  coordinator={!!result.opportunity}
                />
              </article>
            ))}
            {result.nextCursor && (
              <Link
                prefetch={false}
                className="gc-button gc-button-quiet"
                href={`${path}?after=${encodeURIComponent(result.nextCursor)}`}
              >
                Next applications
              </Link>
            )}
          </div>
        );
      const checksum = createHash("sha256")
        .update(JSON.stringify(result))
        .digest("hex");
      content = user ? (
        <PrivateSnapshotGuard
          owner={user.id}
          url={api}
          checksum={checksum}
          label="volunteer information"
        >
          {body}
        </PrivateSnapshotGuard>
      ) : (
        <TopicReadBoundary
          owner={null}
          url={api}
          checksum={checksum}
          label="volunteer opportunity"
        >
          {body}
        </TopicReadBoundary>
      );
    }
  } catch (error) {
    content = (
      <div className="space-y-3 rounded-xl border p-4">
        <p role="status">
          {error instanceof PortalError
            ? error.message
            : "Volunteer information could not be loaded. Reconnect and try again."}
        </p>
        {error instanceof PrivilegedAuthenticationError && (
          <Link
            className="gc-button"
            href={privilegedChallengeHref(error.purpose)!}
          >
            Confirm privileged access
          </Link>
        )}
        <Link
          prefetch={false}
          className="gc-button gc-button-quiet"
          href={path}
        >
          Retry
        </Link>
      </div>
    );
  }
  return (
    <PlatformShell user={user} signInReturnTo={path}>
      <section className="mx-auto w-full max-w-4xl space-y-5 px-4 py-8 max-[359px]:px-0">
        <h1 className="text-4xl">{titles[view]}</h1>
        <nav
          aria-label="Volunteer navigation"
          className="flex flex-wrap gap-x-5 gap-y-2"
        >
          <Link prefetch={false} className={linkClass} href="/platform/serve">
            Browse opportunities
          </Link>
          <Link
            prefetch={false}
            className={linkClass}
            href="/platform/serve/applications"
          >
            My applications and assignments
          </Link>
          <Link
            prefetch={false}
            className={linkClass}
            href="/platform/commitments"
          >
            My timed commitments
          </Link>
        </nav>
        {content}
      </section>
    </PlatformShell>
  );
}
