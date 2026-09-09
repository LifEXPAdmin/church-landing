import Link from "next/link";
import type {
  SupportSnapshot,
  SupportView
} from "@/lib/platform/support-types";
import {
  SUPPORT_INTAKE_NOTE,
  supportCategories,
  supportStatuses,
  featureDecisions
} from "@/lib/platform/support-types";
import { SupportForm, type SupportField } from "./support-form";
import {
  SupportConversation,
  SupportRows,
  SupportTime
} from "./support-presentation";
import {
  PortalCard,
  PortalEmpty,
  PortalHelpContact,
  portalLinkClass
} from "./portal-ui";
const reason: SupportField = {
  name: "reason",
  label: "Explain the update",
  type: "textarea",
  min: 3,
  max: 1000
};
export function SupportViews({
  snapshot: s,
  view,
  churchId,
  received
}: {
  snapshot: SupportSnapshot;
  view: SupportView;
  churchId?: string;
  received?: boolean;
}) {
  const c = s.detail;
  return (
    <div className="space-y-6">
      <nav aria-label="Support" className="flex flex-wrap gap-x-6 gap-y-2">
        <Link className={portalLinkClass} href="/platform/help">
          Help and contacts
        </Link>
        <Link className={portalLinkClass} href="/platform/help/new">
          Get help
        </Link>
        <Link className={portalLinkClass} href="/platform/help/requests">
          My requests
        </Link>
        {s.staff.respond && (
          <Link className={portalLinkClass} href="/platform/help/inbox">
            Assigned inbox
          </Link>
        )}
        {s.staff.assign && (
          <Link className={portalLinkClass} href="/platform/help/routing">
            Assign requests
          </Link>
        )}
      </nav>
      {!s.viewer.adult && (
        <PortalEmpty>
          Private requests are for adults.{" "}
          <Link className={portalLinkClass} href="/platform/my-church">
            Review your eligibility
          </Link>{" "}
          or use direct contact without submitting a request.
        </PortalEmpty>
      )}
      {view === "new" && (
        <>
          <PortalCard title="A little help, with a clear audience">
            <p className="text-gc-muted">{SUPPORT_INTAKE_NOTE}</p>
            <p className="text-sm text-gc-muted">
              This is not an emergency, pastoral care or independent complaints
              service. If a concern involves your church representative, use the
              direct Godschurches contact rather than sharing it with that
              representative. Our published contact is Andrew; it is not an
              independent route for a complaint about Andrew.
            </p>
            {s.churches.length > 0 && (
              <div>
                <p className="text-sm text-gc-muted">
                  Choose the context before writing. Changing it opens a fresh
                  form.
                </p>
                <div className="flex flex-wrap gap-4">
                  <Link className={portalLinkClass} href="/platform/help/new">
                    General account or website
                  </Link>
                  {s.churches.map((ch) => (
                    <Link
                      className={portalLinkClass}
                      key={ch.id}
                      href={`/platform/help/new?churchId=${encodeURIComponent(ch.id)}`}
                    >
                      {ch.name} (
                      {ch.state === "PENDING"
                        ? "pending connection"
                        : "your church"}
                      )
                    </Link>
                  ))}
                </div>
              </div>
            )}
            {s.intake.available && s.intake.recipient ? (
              <>
                <p className="rounded-xl border border-gc-action p-4 text-gc-text">
                  Recipient: {s.intake.recipient.name}, your Godschurches
                  support owner. Only you and this assigned owner can read the
                  request at first. A church representative is not automatically
                  included.
                </p>
                {!s.viewer.verified && (
                  <p className="text-sm text-gc-muted">
                    Until your email is verified, you can request Account or
                    website help. This does not give access to private church
                    pages.
                  </p>
                )}
                <SupportForm
                  key={churchId ?? "general"}
                  operation="create"
                  fixed={{
                    churchId: churchId ?? null,
                    recipientId: s.intake.recipient.id,
                    recipientVersion: s.intake.recipient.version,
                    notice: s.intake.notice
                  }}
                  fields={[
                    {
                      name: "category",
                      label: "What do you need help with?",
                      type: "select",
                      options: Object.entries(supportCategories)
                        .filter(
                          ([key]) =>
                            s.viewer.verified || key === "ACCOUNT_WEBSITE"
                        )
                        .map(([value, label]) => ({ value, label }))
                    },
                    {
                      name: "subject",
                      label: "Short summary",
                      min: 3,
                      max: 120
                    },
                    {
                      name: "description",
                      label: "What happened, and what would help?",
                      type: "textarea",
                      min: 10,
                      max: 3000
                    },
                    {
                      name: "consent",
                      label:
                        "I have read the notice and agree to share this request with the named Godschurches support owner.",
                      type: "checkbox"
                    }
                  ]}
                  button="Send request"
                  caution="Up to five new requests each day. This saves an in-app request, not an email. Check My requests for replies; no response time is guaranteed."
                />
              </>
            ) : (
              <PortalEmpty>
                Private request intake is not available yet. We are completing
                the support recipient and privacy setup. Nothing can be
                submitted here for now. Use direct contact below.
              </PortalEmpty>
            )}
          </PortalCard>
          <PortalHelpContact />
        </>
      )}
      {(view === "requests" || view === "inbox") && (
        <>
          <SupportRows rows={s.rows} />
          <Pagination
            page={s.page}
            more={s.more}
            base={`/platform/help/${view}`}
          />
        </>
      )}
      {view === "routing" && (
        <>
          <PortalEmpty>
            This queue contains only routing information, not request subjects,
            people or conversations. Assigning a request does not let you read
            it.
          </PortalEmpty>
          {s.routing.length === 0 && (
            <PortalEmpty>No open requests are awaiting assignment.</PortalEmpty>
          )}
          {s.routing.map((row) => (
            <PortalCard key={row.id} title={supportCategories[row.category]}>
              <p className="break-all text-xs text-gc-muted">
                Reference: {row.id}
                {row.churchId
                  ? ` / Church scope: ${row.churchId}`
                  : " / General support"}
              </p>
              <p className="text-sm text-gc-muted">
                {supportStatuses[row.status]} / Received{" "}
                <SupportTime value={row.createdAt} />
              </p>
              {s.ownerOptions.length ? (
                <SupportForm
                  operation="handoff"
                  fixed={{ caseId: row.id, expectedVersion: row.version }}
                  fields={[
                    {
                      name: "ownerChoice",
                      label: "Assign an authorized support owner",
                      type: "select",
                      options: s.ownerOptions.map((o) => ({
                        value: `${o.id}:${o.version}`,
                        label: o.name
                      }))
                    }
                  ]}
                  button="Assign request"
                />
              ) : (
                <PortalEmpty>
                  No eligible support owner is available.
                </PortalEmpty>
              )}
            </PortalCard>
          ))}
          <Pagination
            page={s.page}
            more={s.more}
            base="/platform/help/routing"
          />
        </>
      )}
      {c && (
        <>
          {received && (
            <p
              role="status"
              className="rounded-xl border border-gc-action p-4 text-gc-accent"
            >
              Your request is saved. Check this conversation for replies. No
              email was sent.
            </p>
          )}
          <SupportConversation detail={c} />
          <Pagination
            page={c.messagePage}
            more={c.moreMessages}
            base={`/platform/help/cases/${c.id}`}
          />
          {c.unread && (
            <SupportForm
              operation="mark-read"
              fixed={{ caseId: c.id, expectedVersion: c.version }}
              button="Mark these updates as seen"
            />
          )}
          {!["RESOLVED", "CLOSED"].includes(c.status) ? (
            <PortalCard title="Add a reply">
              <p className="text-sm text-gc-muted">
                Visible to {c.requester.name}
                {c.owner ? `, ${c.owner.name}` : " (awaiting an owner)"}
                {c.coordinator ? `, and ${c.coordinator.name}` : ""}. Do not
                include passwords, codes or sensitive personal details.
              </p>
              <SupportForm
                operation="reply"
                fixed={{ caseId: c.id, expectedVersion: c.version }}
                fields={[
                  {
                    name: "body",
                    label: "Your reply",
                    type: "textarea",
                    max: 2000
                  }
                ]}
                button="Save reply"
              />
            </PortalCard>
          ) : (
            c.access.requester && (
              <PortalCard title="Still need help?">
                <SupportForm
                  operation="reopen"
                  fixed={{ caseId: c.id, expectedVersion: c.version }}
                  fields={[
                    { ...reason, label: "Why are you reopening this request?" }
                  ]}
                  button="Reopen request"
                  caution="The original church context stays fixed. Revoked sharing is not restored. If no authorized owner is available, this will await assignment."
                />
              </PortalCard>
            )
          )}
          {(c.access.owner || c.access.requester) && c.status !== "CLOSED" && (
            <PortalCard title="Update the request status">
              <SupportForm
                operation="transition"
                fixed={{ caseId: c.id, expectedVersion: c.version }}
                fields={[
                  {
                    name: "status",
                    label: "New status",
                    type: "select",
                    options: Object.entries(supportStatuses)
                      .filter(
                        ([v]) =>
                          v !== c.status &&
                          (c.status === "RESOLVED"
                            ? v === "CLOSED"
                            : c.access.owner
                              ? v !== "RECEIVED"
                              : ["RESOLVED", "CLOSED"].includes(v))
                      )
                      .map(([value, label]) => ({ value, label }))
                  },
                  { ...reason, label: "What changed or resolved the issue?" }
                ]}
                button="Save status"
              />
            </PortalCard>
          )}
          {c.access.requester && (
            <PortalCard title="Church coordinator sharing">
              {c.coordinator ? (
                <>
                  <p className="text-gc-muted">
                    {c.coordinator.name} can read this history and future
                    replies. Removing access stops future access here; it cannot
                    erase information already seen.
                  </p>
                  <SupportForm
                    operation="revoke"
                    fixed={{ caseId: c.id, expectedVersion: c.version }}
                    button="Remove coordinator access"
                  />
                </>
              ) : c.shareOptions.length &&
                !["RESOLVED", "CLOSED"].includes(c.status) ? (
                <SupportForm
                  operation="share"
                  fixed={{ caseId: c.id, expectedVersion: c.version }}
                  fields={[
                    {
                      name: "appointmentChoice",
                      label: "Choose the person who can read this request",
                      type: "select",
                      options: c.shareOptions.map((o) => ({
                        value: `${o.id}:${o.version}`,
                        label: `${o.name} (${o.slot === "PRIMARY" ? "primary" : "backup"} coordinator)`
                      }))
                    },
                    {
                      name: "agreeHistory",
                      label:
                        "I agree that this person can read the entire existing conversation and future replies, and reply to everyone in this request.",
                      type: "checkbox"
                    }
                  ]}
                  button="Share with this coordinator"
                  caution="Sharing is optional. You may remove access here at any time. A new church connection does not move or share this history."
                />
              ) : (
                <p className="text-gc-muted">
                  No coordinator is included. Sharing requires an open
                  church-context request, your approved connection and an
                  eligible appointed coordinator.
                </p>
              )}
            </PortalCard>
          )}
          {c.access.owner && (
            <PortalCard title="Support owner tools">
              {c.featureDecision && (
                <SupportForm
                  operation="feature"
                  fixed={{ caseId: c.id, expectedVersion: c.version }}
                  fields={[
                    {
                      name: "decision",
                      label: "Suggestion decision",
                      type: "select",
                      options: Object.entries(featureDecisions).map(
                        ([value, label]) => ({ value, label })
                      )
                    },
                    reason
                  ]}
                  button="Update suggestion decision"
                  caution="This label is separate from the case status. Do not mark Delivered unless that work actually shipped."
                />
              )}
              {c.ownerOptions.length > 0 && (
                <SupportForm
                  operation="handoff"
                  fixed={{ caseId: c.id, expectedVersion: c.version }}
                  fields={[
                    {
                      name: "ownerChoice",
                      label: "Hand off to an authorized support owner",
                      type: "select",
                      options: c.ownerOptions.map((o) => ({
                        value: `${o.id}:${o.version}`,
                        label: o.name
                      }))
                    }
                  ]}
                  button="Hand off request"
                  destination="/platform/help/inbox"
                  caution="This transfers the whole conversation to the selected support owner and removes your assignment in the same step. Only use an approved handoff."
                />
              )}
              {c.access.redact && (
                <details className="rounded-xl border border-gc-divider p-4">
                  <summary className="min-h-11 cursor-pointer font-semibold text-gc-accent">
                    Restricted privacy redaction
                  </summary>
                  <p className="my-4 text-sm text-gc-muted">
                    Only after verifying the request under the support
                    operations procedure. This removes the subject, description
                    and conversation content from the active case. Backup
                    handling is separate. This cannot be undone here.
                  </p>
                  <SupportForm
                    operation="redact"
                    fixed={{ caseId: c.id, expectedVersion: c.version }}
                    fields={[
                      {
                        name: "reason",
                        label: "Verified redaction reason",
                        type: "select",
                        options: [
                          {
                            value: "SECRET",
                            label: "Accidentally submitted secret"
                          },
                          {
                            value: "PRIVATE_INFORMATION",
                            label: "Verified private information request"
                          }
                        ]
                      }
                    ]}
                    button="Redact case content"
                  />
                </details>
              )}
            </PortalCard>
          )}
        </>
      )}
    </div>
  );
}
function Pagination({
  page,
  more,
  base
}: {
  page: number;
  more: boolean;
  base: string;
}) {
  return (
    (page > 0 || more) && (
      <nav aria-label="Request pages" className="flex gap-6">
        {page > 0 && (
          <Link className={portalLinkClass} href={`${base}?page=${page - 1}`}>
            Previous page
          </Link>
        )}
        {more && page < 99 && (
          <Link className={portalLinkClass} href={`${base}?page=${page + 1}`}>
            Next page
          </Link>
        )}
      </nav>
    )
  );
}
