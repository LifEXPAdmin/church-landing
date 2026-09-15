import type { Metadata } from "next";
import Link from "next/link";
import { PlatformShell } from "@/components/platform/platform-shell";
import { PrivateSnapshotGuard } from "@/components/platform/private-snapshot-guard";
import { TopicManagement } from "@/components/platform/topic-controls";
import {
  TopicAccountLinks,
  TopicNavigation,
  TopicUnavailable,
  topicChecksum
} from "@/components/platform/topic-page-ui";
import { getCurrentPlatformUser } from "@/lib/platform/session";
import { topicManagementPage } from "@/lib/platform/topic-session";
import { topicHref, topicRestrictionReasons } from "@/lib/platform/topic-types";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Manage topic",
  robots: { index: false, follow: false }
};
export default async function ManageTopicPage({
  params,
  searchParams
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ after?: string; auditAfter?: string }>;
}) {
  const user = await getCurrentPlatformUser(),
    { slug } = await params,
    { after, auditAfter } = await searchParams,
    path = `${topicHref(slug)}/manage`;
  let content;
  if (!user) content = <TopicAccountLinks next={path} />;
  else {
    try {
      const data = await topicManagementPage(
        slug,
        typeof after === "string" ? after : undefined,
        typeof auditAfter === "string" ? auditAfter : undefined
      );
      content = (
        <PrivateSnapshotGuard
          key={user.id}
          owner={user.id}
          url={`/api/platform/topics?${new URLSearchParams({ view: "management", slug, ...(typeof after === "string" ? { after } : {}), ...(typeof auditAfter === "string" ? { auditAfter } : {}) })}`}
          checksum={topicChecksum(data)}
          label="topic management"
        >
          <div className="space-y-6">
            <h1 className="break-words text-4xl">
              Manage {data.view.community.name}
            </h1>
            <p>
              {data.view.community.lifecycle === "ACTIVE"
                ? "Active topic"
                : "Archived topic"}{" "}
              ·{" "}
              {data.view.community.moderationState === "VISIBLE"
                ? "No topic visibility restriction"
                : "Topic visibility is restricted by moderation"}
            </p>
            <Link className="gc-button gc-button-quiet" href={topicHref(slug)}>
              Open public topic
            </Link>
            {after && (
              <Link className="gc-button gc-button-quiet" href={path}>
                First member page
              </Link>
            )}
            <TopicManagement
              view={data.view}
              members={data.members}
              owner={user.id}
            />
            {data.history && (
              <section
                className="space-y-4"
                aria-label="Topic management history"
              >
                <h2 className="text-2xl">Management history</h2>
                <p>
                  Topic changes and reasons are retained for accountable review.
                  Private follow choices are excluded.
                </p>
                {auditAfter && (
                  <Link className="gc-button gc-button-quiet" href={path}>
                    Latest history
                  </Link>
                )}
                <ol className="space-y-3">
                  {data.history.entries.map((entry) => (
                    <li
                      key={entry.id}
                      className="rounded-xl border border-gc-divider p-4"
                    >
                      <p className="font-semibold">
                        {(
                          {
                            CREATED: "Topic created",
                            EDITED: "Details or rules updated",
                            LIFECYCLE: "Topic visibility changed",
                            ROLE_ACCEPTED: "Responsibility accepted",
                            "OFFER-ROLE": "Responsibility offered",
                            "CANCEL-ROLE": "Role offer cancelled",
                            "REVOKE-ROLE": "Moderator role revoked",
                            RESTRICT: "Participation restriction reviewed",
                            DISCUSSION_MODERATED:
                              "Discussion permissions changed"
                          } as Record<string, string>
                        )[entry.action] ?? "Topic management change"}
                      </p>
                      <p className="text-sm text-gc-muted">
                        <time dateTime={entry.createdAt.toISOString()}>
                          {entry.createdAt
                            .toISOString()
                            .replace("T", " ")
                            .slice(0, 16)}{" "}
                          UTC
                        </time>
                      </p>
                      {entry.reason && (
                        <p>
                          {topicRestrictionReasons[
                            entry.reason as keyof typeof topicRestrictionReasons
                          ] ?? "A fixed moderation reason was recorded."}
                        </p>
                      )}
                    </li>
                  ))}
                </ol>
                {data.history.after && (
                  <Link
                    className="gc-button gc-button-quiet"
                    href={`${path}?${new URLSearchParams({ auditAfter: data.history.after })}`}
                  >
                    Older management history
                  </Link>
                )}
              </section>
            )}
          </div>
        </PrivateSnapshotGuard>
      );
    } catch (error) {
      content = <TopicUnavailable error={error} href={path} />;
    }
  }
  return (
    <PlatformShell user={user}>
      <section className="container-shell py-8 sm:py-10">
        <div className="mx-auto max-w-3xl space-y-6">
          <TopicNavigation />
          {content}
        </div>
      </section>
    </PlatformShell>
  );
}
