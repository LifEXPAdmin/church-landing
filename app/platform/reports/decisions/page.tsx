import { RegionalTime } from "@/components/platform/regional-presentation";
import type { Metadata } from "next";
import { createHash } from "node:crypto";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { privateCookies } from "@/lib/platform/private-cookies";
import {
  getCurrentPlatformUser,
  PLATFORM_SESSION_COOKIE
} from "@/lib/platform/session";
import { readCommunityReports } from "@/lib/platform/community-reports";
import {
  contentDecisionReasons,
  contentReviewActions,
  contentVisibilityLabels,
  contentNoticeHref
} from "@/lib/platform/content-moderation-types";
import { readerId } from "@/lib/platform/reader-navigation";
import { PlatformShell } from "@/components/platform/platform-shell";
import { GuestAccountPrompt } from "@/components/platform/guest-account-prompt";
import { PrivateSnapshotGuard } from "@/components/platform/private-snapshot-guard";
import { SupportForm } from "@/components/platform/support-form";
import { PortalError } from "@/lib/platform/portal-policy";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Your content decisions",
  robots: { index: false, follow: false }
};

export default async function ContentDecisionsPage({
  searchParams
}: {
  searchParams: Promise<{ id?: string; after?: string }>;
}) {
  const user = await getCurrentPlatformUser(),
    q = await searchParams;
  const id = readerId(q.id),
    after = id ? undefined : readerId(q.after);
  const query = {
    view: "decisions",
    ...(id ? { id } : {}),
    ...(after ? { after } : {})
  };
  if (!user)
    return (
      <PlatformShell user={null}>
        <GuestAccountPrompt
          next={contentNoticeHref(id, after)}
          reason="account"
        />
      </PlatformShell>
    );
  let page: Awaited<ReturnType<typeof readCommunityReports>> | null = null,
    error = "";
  if (process.env.NODE_ENV === "production") {
    try {
      page = await readCommunityReports(
        prisma,
        (await privateCookies()).get(PLATFORM_SESSION_COOKIE)?.value,
        query
      );
    } catch (e) {
      error =
        e instanceof PortalError
          ? e.message
          : "Content decisions could not be loaded. Try again when your connection is available.";
    }
  } else
    error =
      "Open the isolated production preview to inspect private content decisions.";
  return (
    <PlatformShell user={user}>
      <section className="container-shell py-10">
        <div className="mx-auto max-w-2xl space-y-5">
          <h1 className="text-3xl">Your content decisions</h1>
          <p>
            Private notices about your own content or a church you currently
            publish for. The explanation here is separate from the reporter’s
            identity and private review notes.
          </p>
          <nav className="flex flex-wrap gap-4">
            <Link
              prefetch={false}
              className="underline"
              href="/platform/activity?category=reports"
            >
              Report activity
            </Link>
            <Link
              prefetch={false}
              className="underline"
              href="/platform/reports"
            >
              Your submitted reports
            </Link>
            <Link
              prefetch={false}
              className="underline"
              href="/platform/help/requests"
            >
              Your help cases
            </Link>
          </nav>
          {error && <p role="alert">{error}</p>}
          {page && (
            <PrivateSnapshotGuard
              owner={user.id}
              label="content decision"
              url={`/api/platform/community-reports?${new URLSearchParams(query)}`}
              checksum={createHash("sha256")
                .update(JSON.stringify(page))
                .digest("hex")}
            >
              <div className="space-y-5">
                {page.notices?.length ? (
                  page.notices.map((n) => (
                    <article
                      key={n.id}
                      aria-label="Your content decision"
                      className="space-y-3 rounded-xl border p-4"
                    >
                      <h2 className="text-2xl">
                        {contentReviewActions[n.action]}
                      </h2>
                      <p>
                        {n.church ? "Church" : "Your"} {n.type.toLowerCase()} ·{" "}
                        <time dateTime={n.createdAt}>
                          {<RegionalTime value={n.createdAt} />}
                        </time>
                      </p>
                      <p>{contentDecisionReasons[n.reason]}</p>
                      <p className="font-semibold">
                        Decision: {contentVisibilityLabels[n.visibility]}
                      </p>
                      <p className="text-sm">
                        This records the decision at that time. Later edits,
                        withdrawal, audience choices and account access still
                        apply. Lifting a restriction does not republish deleted
                        or withdrawn content.
                      </p>
                      {!id && (
                        <Link
                          prefetch={false}
                          className="underline"
                          href={contentNoticeHref(n.id)}
                        >
                          Open decision and reconsideration
                        </Link>
                      )}
                    </article>
                  ))
                ) : (
                  <p>You have no content decisions on this page.</p>
                )}
                {page.ownSource && (
                  <section
                    className="space-y-3 rounded-xl border p-4"
                    aria-label="Your selected content"
                  >
                    <h2 className="text-2xl">Your selected content</h2>
                    <p className="text-sm">
                      Current text · Version {page.ownSource.version}
                    </p>
                    {page.ownSource.contentNote && (
                      <p className="whitespace-pre-wrap break-words">
                        <strong>Content note:</strong>{" "}
                        {page.ownSource.contentNote}
                      </p>
                    )}
                    {page.ownSource.safeExcerpt && (
                      <p className="whitespace-pre-wrap break-words">
                        <strong>Safe excerpt:</strong>{" "}
                        {page.ownSource.safeExcerpt}
                      </p>
                    )}
                    <p className="whitespace-pre-wrap break-words">
                      {page.ownSource.content ||
                        "This source's text is no longer available."}
                    </p>
                    <Link
                      prefetch={false}
                      className="underline"
                      href={page.ownSource.href}
                    >
                      Open source if currently available
                    </Link>
                    <p className="text-sm">
                      This private author view does not change who can see the
                      source.
                    </p>
                  </section>
                )}
                {page.appeal && (
                  <section
                    className="space-y-4"
                    aria-label="Request reconsideration"
                  >
                    <h2 className="text-2xl">Reconsideration</h2>
                    <p>{page.appeal.message}</p>
                    {page.appeal.reviewerName && (
                      <p>
                        Assigned report reviewer:{" "}
                        <strong>{page.appeal.reviewerName}</strong>
                      </p>
                    )}
                    {page.appeal.caseId ? (
                      <Link
                        prefetch={false}
                        className="gc-button gc-button-quiet"
                        href={`/platform/help/cases/${page.appeal.caseId}`}
                      >
                        Open your reconsideration case
                      </Link>
                    ) : page.appeal.available && id ? (
                      <SupportForm
                        owner={user.id}
                        operation="appeal"
                        fixed={{
                          decisionId: id,
                          decisionVersion: page.appeal.decisionVersion,
                          reportVersion: page.appeal.reportVersion,
                          notice: page.appeal.notice
                        }}
                        fields={[
                          {
                            name: "description",
                            label: "Why should this decision be reconsidered?",
                            type: "textarea",
                            min: 10,
                            max: 3000
                          },
                          {
                            name: "consent",
                            label:
                              "I agree to share this explanation and future replies with the assigned report reviewer.",
                            type: "checkbox"
                          }
                        ]}
                        button="Request reconsideration"
                        caution="Include only relevant context. Do not include passwords, sign-in codes or unrelated private information. Sending this request does not automatically change the content restriction."
                      />
                    ) : (
                      page.appeal.alreadyRequested && (
                        <p>
                          Reconsideration has already been requested for this
                          decision.
                        </p>
                      )
                    )}
                  </section>
                )}
                {page.after && (
                  <Link
                    prefetch={false}
                    className="gc-button gc-button-quiet"
                    href={contentNoticeHref(undefined, page.after)}
                  >
                    Older content decisions
                  </Link>
                )}
                {(id || after) && (
                  <Link
                    prefetch={false}
                    className="underline"
                    href={contentNoticeHref()}
                  >
                    All your content decisions
                  </Link>
                )}
              </div>
            </PrivateSnapshotGuard>
          )}
        </div>
      </section>
    </PlatformShell>
  );
}
