"use client";
import Link from "next/link";
import {
  feedbackIdeaStates,
  type FeedbackIdeasSnapshot,
  type PublicFeedbackIdea
} from "@/lib/platform/feedback-idea-types";
import { useFeedbackSnapshot } from "./use-feedback-snapshot";
import { SupportForm } from "./support-form";
import { PortalCard, PortalEmpty, portalLinkClass } from "./portal-ui";
import { ReadVisibility } from "./read-visibility";
import { SupportTime } from "./support-presentation";
import { reportEntryHref } from "@/lib/platform/community-report-types";
const base = "/platform/feedback/ideas";
export function FeedbackIdeas({
  owner,
  query
}: {
  owner: string | null;
  query: string;
}) {
  const { data, visible, notice, busy, load } =
    useFeedbackSnapshot<FeedbackIdeasSnapshot>(
      owner,
      "/api/platform/feedback/ideas?" + query,
      (s) => s.ownerId === owner
    );
  const refresh = () => void load();
  return (
    <div className="space-y-6">
      <nav aria-label="Feedback" className="flex flex-wrap gap-5">
        <Link href="/platform/feedback" className={portalLinkClass}>
          Share feedback
        </Link>
        <Link href="/platform/feedback/requests" className={portalLinkClass}>
          My feedback
        </Link>
        <Link href={base} className={portalLinkClass}>
          Reviewed ideas
        </Link>
      </nav>
      <p>
        Public summaries reviewed by God’s Churches, with the contributor’s
        permission. Votes express interest and do not promise a delivery date.
      </p>
      <p>
        Considering, Planned, Building and Testing are work in progress.
        Released ideas link to the changes that are available. A contributor’s
        name is shown only with their separate permission; private submissions
        and screenshots stay private.
      </p>
      {!visible && (
        <div className="space-y-3 rounded-xl border border-gc-divider p-4">
          <p role="status">
            {notice || "Checking the current ideas and your account…"}
          </p>
          <button
            className="gc-button gc-button-quiet"
            disabled={busy}
            onClick={refresh}
          >
            Recheck current ideas
          </button>
        </div>
      )}
      <ReadVisibility.Provider value={visible}>
        <div
          hidden={!visible}
          style={{ display: visible ? undefined : "none" }}
          className="space-y-6"
        >
          {data && !data.available && (
            <PortalEmpty>
              The reviewed idea board is not available yet. Existing private
              feedback receipts remain in My feedback.
            </PortalEmpty>
          )}
          {data?.available && !data.detail && (
            <>
              <form action={base} className="space-y-3" role="search">
                <label className="block font-semibold" htmlFor="idea-search">
                  Search public ideas
                </label>
                <input
                  id="idea-search"
                  name="q"
                  maxLength={80}
                  defaultValue={data.query}
                  className="gc-input w-full min-w-0"
                />
                <button className="gc-button">Search ideas</button>
              </form>
              {data.ideas.length ? (
                data.ideas.map((idea) => <IdeaCard key={idea.id} idea={idea} />)
              ) : (
                <PortalEmpty>
                  No reviewed public ideas match this view. Private submissions
                  are not searched or shown here.
                </PortalEmpty>
              )}
              <nav aria-label="Idea pages" className="flex flex-wrap gap-5">
                {data.page > 0 && (
                  <Link
                    className={portalLinkClass}
                    href={`${base}?${new URLSearchParams({ q: data.query, page: String(data.page - 1) })}`}
                  >
                    Previous page
                  </Link>
                )}
                {data.more && data.page < 99 && (
                  <Link
                    className={portalLinkClass}
                    href={`${base}?${new URLSearchParams({ q: data.query, page: String(data.page + 1) })}`}
                  >
                    Next page
                  </Link>
                )}
              </nav>
            </>
          )}
          {data?.detail && (
            <>
              {data.destination && (
                <p className="rounded-xl border border-gc-divider p-4">
                  This idea was merged into{" "}
                  <Link
                    className={portalLinkClass}
                    href={`${base}/${data.destination.id}`}
                  >
                    {data.destination.title}
                  </Link>
                  . The current combined idea is shown below; private receipts
                  remain separate.
                </p>
              )}
              <IdeaCard idea={data.detail} detail />
              {owner && data.interest && !data.interest.canVote && (
                <PortalEmpty>
                  Verify your email and confirm adult account eligibility before
                  voting or choosing updates. Your retained choices have not
                  been saved.
                </PortalEmpty>
              )}
              {owner && (
                <Link
                  className={portalLinkClass}
                  href={reportEntryHref("FEEDBACK_IDEA", data.detail.id)}
                >
                  Report this public idea
                </Link>
              )}
              {owner && data.interest ? (
                <>
                  <PortalCard title="Your vote">
                    <p>
                      {data.interest.voted
                        ? "Your vote is included."
                        : "You have not voted for this idea."}
                    </p>
                    <SupportForm
                      owner={owner}
                      endpoint="/api/platform/feedback/ideas"
                      operation="idea-vote"
                      receiptKey="id"
                      requestKey="mutationId"
                      available={data.interest.canVote}
                      fixed={{
                        ideaId: data.detail.id,
                        expectedVersion: data.detail.version,
                        interestVersion: data.interest.voteVersion,
                        active: !data.interest.voted
                      }}
                      button={
                        data.interest.voted ? "Remove my vote" : "Add my vote"
                      }
                      onRefresh={refresh}
                    />
                  </PortalCard>
                  <PortalCard title="Updates about this idea">
                    <p>
                      Choose any channels, or clear them all to unsubscribe.
                      Your account notification preferences and available
                      delivery services also apply.
                    </p>
                    <SupportForm
                      owner={owner}
                      endpoint="/api/platform/feedback/ideas"
                      operation="idea-subscribe"
                      receiptKey="id"
                      requestKey="mutationId"
                      available={data.interest.canVote}
                      fixed={{
                        ideaId: data.detail.id,
                        expectedVersion: data.detail.version,
                        interestVersion: data.interest.subscriptionVersion
                      }}
                      button="Save idea update choices"
                      onRefresh={refresh}
                      readFields={(form) => ({
                        inApp: form.get("inApp") === "on",
                        email: form.get("email") === "on",
                        push: form.get("push") === "on"
                      })}
                    >
                      <div className="space-y-3">
                        {(["inApp", "email", "push"] as const).map(
                          (channel) => (
                            <label
                              key={channel}
                              className="flex min-h-11 items-center gap-3"
                            >
                              <input
                                type="checkbox"
                                name={channel}
                                defaultChecked={data.interest![channel]}
                                className="h-6 w-6"
                              />
                              {channel === "inApp"
                                ? "In-app Activity"
                                : channel === "email"
                                  ? "Email"
                                  : "Push notifications"}
                            </label>
                          )
                        )}
                      </div>
                    </SupportForm>
                    <Link
                      href="/platform/settings/notifications/availability"
                      className={portalLinkClass}
                    >
                      Account notification settings
                    </Link>
                  </PortalCard>
                </>
              ) : (
                <PortalEmpty>
                  {owner ? (
                    "Verify your email and confirm adult account eligibility to vote or subscribe."
                  ) : (
                    <Link
                      href={`/platform/login?next=${encodeURIComponent(`${base}/${data.detail.id}`)}`}
                      className={portalLinkClass}
                    >
                      Sign in to vote or choose updates
                    </Link>
                  )}
                </PortalEmpty>
              )}
              <PortalCard title="Public status history">
                {data.history?.map((event) => (
                  <div
                    key={event.version}
                    className="space-y-2 border-b border-gc-divider pb-4"
                  >
                    <p className="font-semibold">
                      {feedbackIdeaStates[event.status]} ·{" "}
                      <SupportTime value={event.createdAt} />
                    </p>
                    <p className="whitespace-pre-wrap break-words">
                      {event.explanation}
                    </p>
                    {event.releaseId && (
                      <Link
                        className={portalLinkClass}
                        href={`/platform/releases/${encodeURIComponent(event.releaseId)}`}
                      >
                        View released change
                      </Link>
                    )}
                  </div>
                ))}
              </PortalCard>
            </>
          )}
        </div>
      </ReadVisibility.Provider>
    </div>
  );
}
function IdeaCard({
  idea,
  detail = false
}: {
  idea: PublicFeedbackIdea;
  detail?: boolean;
}) {
  return (
    <article className="space-y-4 rounded-2xl border border-gc-divider p-5 sm:p-6">
      <h2 className="break-words text-2xl font-semibold">
        {detail ? (
          idea.title
        ) : (
          <Link href={`${base}/${idea.id}`} className={portalLinkClass}>
            {idea.title}
          </Link>
        )}
      </h2>
      <p className="text-sm">
        {feedbackIdeaStates[idea.status]} · {idea.votes}{" "}
        {idea.votes === 1 ? "vote" : "votes"}
      </p>
      <p className="whitespace-pre-wrap break-words">{idea.summary}</p>
      <p className="whitespace-pre-wrap break-words text-gc-muted">
        {idea.explanation}
      </p>
      {idea.attribution && (
        <p className="text-sm">
          Contribution acknowledged, by choice: {idea.attribution}
        </p>
      )}
      {idea.releaseId && (
        <Link
          href={`/platform/releases/${encodeURIComponent(idea.releaseId)}`}
          className={portalLinkClass}
        >
          Read the released change
        </Link>
      )}
    </article>
  );
}
