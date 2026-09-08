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
  demo = false
}: {
  rows: SupportRow[];
  demo?: boolean;
}) {
  return rows.length ? (
    <div className="space-y-4">
      {rows.map((c) => (
        <article
          key={c.id}
          className="rounded-2xl border border-[#f2d8af]/20 bg-[#1a120c] p-5"
        >
          <p className="text-xs font-semibold uppercase tracking-wider text-[#f4c98c]">
            {supportCategories[c.category]}
            {c.unread ? " / Updated" : ""}
          </p>
          <h2 className="mt-2 break-words text-2xl text-white">
            <Link
              className={portalLinkClass + " text-xl"}
              href={
                demo
                  ? "/platform/demo/support-case"
                  : `/platform/help/cases/${encodeURIComponent(c.id)}`
              }
            >
              {c.subject}
            </Link>
          </h2>
          <p className="mt-2 text-sm text-[#d8c4a8]">
            {supportStatuses[c.status]}
            {c.unassigned ? " / Awaiting assignment" : ""}
          </p>
          <p className="mt-2 text-xs text-[#d8c4a8]">
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
        <p className="text-sm text-[#f4c98c]">
          {supportCategories[c.category]} / {supportStatuses[c.status]}
        </p>
        <p className="whitespace-pre-wrap leading-relaxed text-[#f3dfc3]">
          {c.description}
        </p>
        <p className="text-xs text-[#d8c4a8]">
          Received <SupportTime value={c.createdAt} />
        </p>
        {c.church && (
          <p className="text-sm text-[#d8c4a8]">
            Church context: {c.church.name}. This request stays with its
            original context.
          </p>
        )}
        <p className="text-sm text-[#d8c4a8]">
          Who can read and reply: {c.requester.name} (requester),{" "}
          {c.owner
            ? `${c.owner.name} (Godschurches support owner)`
            : "no assigned support owner"}
          {c.coordinator
            ? `, ${c.coordinator.name} (shared church coordinator)`
            : ". No church coordinator included"}
          .
        </p>
        {!c.owner && (
          <PortalEmpty>
            Awaiting assignment. Your request is saved, but no active support
            owner is assigned. Use direct contact if needed.
          </PortalEmpty>
        )}
        {c.featureDecision && (
          <p className="text-sm text-[#f4c98c]">
            Suggestion decision: {featureDecisions[c.featureDecision]}. This is
            separate from the request status and is not a promise to build.
          </p>
        )}
        {c.resolution && (
          <div className="rounded-xl border border-[#f2d8af]/20 p-4">
            <h3 className="text-xl text-white">Resolution</h3>
            <p className="mt-2 whitespace-pre-wrap text-[#d8c4a8]">
              {c.resolution}
            </p>
          </div>
        )}
      </PortalCard>
      <PortalCard title="Conversation">
        {c.messages.length ? (
          <ol className="space-y-5">
            {c.messages.map((m) => (
              <li key={m.id} className="border-l-2 border-[#f4c98c]/40 pl-4">
                <p className="font-semibold text-[#f3dfc3]">
                  {m.author}{" "}
                  <span className="font-normal text-[#d8c4a8]">
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
                <p className="my-2 whitespace-pre-wrap leading-relaxed text-[#d8c4a8]">
                  {m.body}
                </p>
                <p className="text-xs text-[#d8c4a8]">
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
