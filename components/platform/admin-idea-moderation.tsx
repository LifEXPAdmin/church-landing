"use client";
import Link from "next/link";
import type { FeedbackIdeaModeration } from "@/lib/platform/feedback-idea-admin";
import { feedbackIdeaStates } from "@/lib/platform/feedback-idea-types";
import { AdminForm, adminInputClass } from "./admin-form";
import { portalLinkClass } from "./portal-ui";
const base = "/platform/admin/feedback/ideas";
export function AdminIdeaModeration({
  data: s,
  onRefresh
}: {
  data: FeedbackIdeaModeration;
  onRefresh: () => void;
}) {
  return (
    <div className="space-y-5">
      <h1 className="text-3xl font-semibold">Review published ideas</h1>
      <p>
        This view contains public summaries only. Product-review permission
        allows withdrawing a public copy; private source feedback keeps its
        separate access rules.
      </p>
      <form action={base} className="space-y-3">
        <label className="font-semibold" htmlFor="public-idea-review-search">
          Search public titles
        </label>
        <input
          id="public-idea-review-search"
          name="q"
          defaultValue={s.query}
          maxLength={80}
          className={adminInputClass}
        />
        <button className="gc-button gc-button-quiet">
          Search published ideas
        </button>
      </form>
      {s.ideas.length === 0 && <p>No published ideas match this view.</p>}
      {s.ideas.map((idea) => (
        <article
          key={idea.id}
          className="space-y-4 rounded-xl border border-gc-divider p-5"
        >
          <h2 className="break-words text-2xl font-semibold">{idea.title}</h2>
          <p>{feedbackIdeaStates[idea.status]}</p>
          <p className="whitespace-pre-wrap break-words">{idea.summary}</p>
          <p className="whitespace-pre-wrap break-words">{idea.explanation}</p>
          {s.detail ? (
            <AdminForm
              owner={s.navigation.viewer.id}
              operation="idea-withdraw"
              fixed={{
                ideaId: idea.id,
                expectedVersion: idea.version,
                grantVersion: s.grantVersion
              }}
              fields={[
                {
                  name: "explanation",
                  label: "Internal withdrawal reason",
                  type: "textarea",
                  min: 3,
                  max: 1000
                }
              ]}
              button="Withdraw public idea"
              onSaved={onRefresh}
              caution="This retracts only public publication and preserves the private case. A saved withdrawal is protected against older backups."
            />
          ) : (
            <Link
              className={portalLinkClass}
              href={`/platform/admin/feedback/public/${idea.id}`}
            >
              Review this public idea
            </Link>
          )}
        </article>
      ))}
      <nav aria-label="Published idea pages" className="flex flex-wrap gap-5">
        {s.page > 0 && (
          <Link
            className={portalLinkClass}
            href={`${base}?${new URLSearchParams({ q: s.query, page: String(s.page - 1) })}`}
          >
            Previous page
          </Link>
        )}
        {s.more && s.page < 99 && (
          <Link
            className={portalLinkClass}
            href={`${base}?${new URLSearchParams({ q: s.query, page: String(s.page + 1) })}`}
          >
            Next page
          </Link>
        )}
      </nav>
    </div>
  );
}
