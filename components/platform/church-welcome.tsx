import Link from "next/link";
import { accountEntryHref } from "@/lib/platform/account-entry";
import type { ChurchSummary } from "@/lib/platform/portal-types";
import type { ChurchToolsView } from "@/lib/platform/church-tools";

export function ChurchWelcome({
  church,
  data
}: {
  church: ChurchSummary;
  data: ChurchToolsView;
}) {
  const root = `/platform/churches/${encodeURIComponent(church.id)}`;
  const next = data.welcome;
  const link = "gc-button gc-button-quiet";
  return (
    <section
      aria-label="Church welcome and next steps"
      className="space-y-3 rounded-xl bg-gc-canvas p-[12px]"
    >
      <h2 className="text-2xl">
        {data.member ? "Your next steps" : `Welcome to ${church.name}`}
      </h2>
      <p className="text-sm text-gc-muted">
        Get to know this community at your own pace. Following a church and
        requesting membership are separate choices.
      </p>
      <nav aria-label="Church next steps" className="flex flex-wrap gap-3">
        <Link className={link} href={`${root}#church-upcoming`}>
          See upcoming events
        </Link>
        {church.website && (
          <a className={link} href={church.website} rel="noreferrer noopener">
            Explore programs on the church website
          </a>
        )}
        {!data.ownerId && (
          <Link
            className={link}
            href={accountEntryHref("join", root, "connection")}
          >
            Join or sign in for your next steps
          </Link>
        )}
        {next && !next.following && (
          <Link className={link} href={`${root}#church-relationships`}>
            Choose whether to follow
          </Link>
        )}
        {next?.needsIntroduction && (
          <Link className={link} href="/platform/profile/me">
            Add an introduction to your profile
          </Link>
        )}
        {next?.needsPhoto && (
          <Link className={link} href="/platform/profile/me">
            Add a profile photo
          </Link>
        )}
        {next && !next.eligible && (
          <Link className={link} href={`${root}#church-eligibility`}>
            Finish participation eligibility
          </Link>
        )}
        {next?.eligible &&
          !next.connectedElsewhere &&
          !["APPROVED", "PENDING"].includes(next.connectionState ?? "") &&
          church.connectionsAvailable !== false && (
            <Link className={link} href={`${root}#church-connection`}>
              Review connection options
            </Link>
          )}
        {next?.connectedElsewhere && !data.member && (
          <Link className={link} href="/platform/my-church">
            Review your existing church connection
          </Link>
        )}
        {data.member && (
          <>
            <Link className={link} href={`${root}/structure`}>
              Explore ministries and teams
            </Link>
            <Link className={link} href={`${root}/responsibilities`}>
              My responsibilities
            </Link>
          </>
        )}
      </nav>
      {next?.following && (
        <p className="text-sm text-gc-muted">You already follow this church.</p>
      )}
      {next?.connectionState === "PENDING" && (
        <p className="text-sm text-gc-muted">
          Your connection request is awaiting review. You do not need to request
          again.
        </p>
      )}
      {!data.member && church.connectionsAvailable === false && (
        <p className="text-sm text-gc-muted">
          Member connections will open when an authorized church reviewer is in
          place. You can explore the public page and events meanwhile.
        </p>
      )}
      {(next?.needsIntroduction || next?.needsPhoto) && (
        <p className="text-sm text-gc-muted">
          Your profile introduction and photo are optional. Completed steps
          disappear when you return.
        </p>
      )}
    </section>
  );
}
