import Link from "next/link";
import {
  supportCategories,
  supportStatuses,
  featureDecisions,
  type SupportRow,
  type SupportDetail
} from "@/lib/platform/support-types";
import { PortalCard, PortalEmpty, portalLinkClass } from "./portal-ui";
export function SupportTime({ value }: { value: string }) {
  return (
    <time dateTime={value}>
      {new Date(value).toLocaleString("en-US", {
        timeZone: "UTC",
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit"
      })}{" "}
      UTC
    </time>
  );
}
export function SupportRows({
  rows,
  demo = false,
  detailBase = "/platform/help/cases"
}: {
  rows: SupportRow[];
  demo?: boolean;
  detailBase?: string;
}) {
  return rows.length ? (
    <div className="space-y-4">
      {rows.map((c) => (
        <article
          key={c.id}
          className="rounded-xl border border-gc-divider bg-gc-surface p-5"
        >
          <p className="text-xs font-semibold uppercase tracking-wider text-gc-accent">
            {supportCategories[c.category]}
            {c.unread ? " / Updated" : ""}
          </p>
          <h2 className="mt-2 break-words text-2xl text-gc-text">
            <Link
              className={portalLinkClass + " text-xl"}
              href={
                demo
                  ? "/platform/demo/support-case"
                  : `${detailBase}/${encodeURIComponent(c.id)}`
              }
            >
              {c.subject}
            </Link>
          </h2>
          <p className="mt-2 text-sm text-gc-muted">
            {supportStatuses[c.status]}
            {c.unassigned ? " / Awaiting assignment" : ""}
          </p>
          <p className="mt-2 text-xs text-gc-muted">
            Updated <SupportTime value={c.updatedAt} />
          </p>
        </article>
      ))}
    </div>
  ) : (
    <PortalEmpty>
      No requests to show here. New replies will appear with an Updated label.
    </PortalEmpty>
  );
}
export function SupportConversation({ detail: c }: { detail: SupportDetail }) {
  return (
    <div className="space-y-5">
      <PortalCard title="Your request">
        <p className="text-sm text-gc-accent">
          {supportCategories[c.category]} / {supportStatuses[c.status]}
        </p>
        <p className="whitespace-pre-wrap leading-relaxed text-gc-text">
          {c.description}
        </p>
        <p className="text-xs text-gc-muted">
          Received <SupportTime value={c.createdAt} />
        </p>
        {c.church && (
          <p className="text-sm text-gc-muted">
            Church context: {c.church.name}. This request stays with its
            original context.
          </p>
        )}
        <p className="text-sm text-gc-muted">
          Who can read and reply: {c.requester.name} (requester),{" "}
          {c.owner
            ? `${c.owner.name} (${c.reconsideration ? "assigned report reviewer" : "Godschurches support owner"})`
            : c.reconsideration
              ? "the assigned report reviewer is not currently authorized"
              : "no assigned support owner"}
          {c.coordinator
            ? `, ${c.coordinator.name} (shared church coordinator)`
            : ". No church coordinator included"}
          .
        </p>
        {!c.owner && (
          <PortalEmpty>
            {c.reconsideration
              ? "Your case is saved, but the assigned reviewer currently lacks access. No substitute reviewer is assigned automatically."
              : "Awaiting assignment. Your request is saved, but no active support owner is assigned. Use direct contact if needed."}
          </PortalEmpty>
        )}
        {c.reconsideration && (
          <p className="text-sm">
            This is reconsideration by the assigned report reviewer, who may be
            the original decision maker. It is not independent review. Case
            replies and closure do not automatically lift a content restriction.
          </p>
        )}
        {c.reviewHref && (
          <Link href={c.reviewHref} className="text-sm underline">
            Review the selected report and content
          </Link>
        )}
        {c.featureDecision && (
          <p className="text-sm text-gc-accent">
            Suggestion decision: {featureDecisions[c.featureDecision]}. This is
            separate from the request status and is not a promise to build.
          </p>
        )}
        {c.resolution && (
          <div className="rounded-xl border border-gc-divider p-4">
            <h3 className="text-xl text-gc-text">Resolution</h3>
            <p className="mt-2 whitespace-pre-wrap text-gc-muted">
              {c.resolution}
            </p>
          </div>
        )}
      </PortalCard>
      <PortalCard title="Conversation">
        {c.messages.length ? (
          <ol className="space-y-5">
            {c.messages.map((m) => (
              <li key={m.id} className="border-l-2 border-gc-action pl-4">
                <p className="font-semibold text-gc-text">
                  {m.author}{" "}
                  <span className="font-normal text-gc-muted">
                    /{" "}
                    {(
                      {
                        REPLY: "Reply",
                        TRANSITION: "Status update",
                        RESOLUTION: "Resolution",
                        REOPEN: "Reopened",
                        FEATURE: "Suggestion update"
                      } as Record<string, string>
                    )[m.kind] ?? "Update"}
                  </span>
                </p>
                <p className="my-2 whitespace-pre-wrap leading-relaxed text-gc-muted">
                  {m.body}
                </p>
                <p className="text-xs text-gc-muted">
                  <SupportTime value={m.createdAt} />
                  {m.redacted ? " / Privacy redaction" : ""}
                </p>
              </li>
            ))}
          </ol>
        ) : (
          <PortalEmpty>
            No replies yet. Your request has been received, but that does not
            mean someone has read it.
          </PortalEmpty>
        )}
      </PortalCard>
    </div>
  );
}
