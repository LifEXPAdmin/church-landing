import { FeedbackAttachmentImages } from "./feedback-attachment-images";
import type {
  SupportSnapshot,
  SupportView
} from "@/lib/platform/support-types";
import {
  supportCategories,
  supportStatuses,
  featureDecisions
} from "@/lib/platform/support-types";
import { SupportForm, type SupportField } from "./support-form";
import {
  SupportConversation,
  SupportTime
} from "./regional-support-presentation";
import { PortalCard, PortalEmpty } from "./portal-ui";
import {
  SupportNavigation,
  SupportEligibility,
  SupportListRows,
  SupportPagination as Pagination
} from "./support-list-presentation";
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
  received,
  detailBase,
  handoffDestination,
  onRefresh,
  navigation = true
}: {
  snapshot: SupportSnapshot;
  view: Exclude<SupportView, "new">;
  received?: boolean;
  detailBase?: string;
  handoffDestination?: string;
  onRefresh?: () => void;
  navigation?: boolean;
}) {
  const c = s.detail;
  return (
    <div className="space-y-6">
      {navigation && <SupportNavigation staff={s.staff} />}
      <SupportEligibility adult={s.viewer.adult} />
      {(view === "requests" || view === "inbox") && (
        <SupportListRows snapshot={s} view={view} />
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
                  onRefresh={onRefresh}
                  owner={s.viewer.id}
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
          <FeedbackAttachmentImages
            owner={s.viewer.id}
            detail={c}
            onRefresh={onRefresh}
          />
          <Pagination
            page={c.messagePage}
            more={c.moreMessages}
            base={detailBase ?? `/platform/help/cases/${c.id}`}
          />
          {c.unread && (
            <SupportForm
              onRefresh={onRefresh}
              owner={s.viewer.id}
              operation="mark-read"
              fixed={{ caseId: c.id, expectedVersion: c.version }}
              button="Mark these updates as seen"
            />
          )}
          {!["RESOLVED", "CLOSED"].includes(c.status) ? (
            c.feedback && !c.feedback.contactAllowed && !c.access.requester ? (
              <PortalEmpty>
                Follow-up permission is off. You can record a status or
                resolution, but cannot ask the requester to reply.
              </PortalEmpty>
            ) : (
              <PortalCard title="Add a reply">
                <p className="text-sm text-gc-muted">
                  Visible to {c.requester.name}
                  {c.owner ? `, ${c.owner.name}` : " (awaiting an owner)"}
                  {c.coordinator ? `, and ${c.coordinator.name}` : ""}. Do not
                  include passwords, codes or sensitive personal details.
                </p>
                <SupportForm
                  onRefresh={onRefresh}
                  owner={s.viewer.id}
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
            )
          ) : (
            (c.access.requester || c.access.owner) && (
              <PortalCard title="Still need help?">
                <SupportForm
                  onRefresh={onRefresh}
                  owner={s.viewer.id}
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
                onRefresh={onRefresh}
                owner={s.viewer.id}
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
                          !(
                            v === "WAITING_FOR_REQUESTER" &&
                            c.feedback &&
                            !c.feedback.contactAllowed
                          ) &&
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
          {c.access.requester && !c.feedback && (
            <PortalCard title="Church coordinator sharing">
              {c.coordinator ? (
                <>
                  <p className="text-gc-muted">
                    {c.coordinator.name} can read this history and future
                    replies. Removing access stops future access here; it cannot
                    erase information already seen.
                  </p>
                  <SupportForm
                    onRefresh={onRefresh}
                    owner={s.viewer.id}
                    operation="revoke"
                    fixed={{ caseId: c.id, expectedVersion: c.version }}
                    button="Remove coordinator access"
                  />
                </>
              ) : c.shareOptions.length &&
                !["RESOLVED", "CLOSED"].includes(c.status) ? (
                <SupportForm
                  onRefresh={onRefresh}
                  owner={s.viewer.id}
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
                  onRefresh={onRefresh}
                  owner={s.viewer.id}
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
                  onRefresh={onRefresh}
                  owner={s.viewer.id}
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
                  destination={handoffDestination ?? "/platform/help/inbox"}
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
                    onRefresh={onRefresh}
                    owner={s.viewer.id}
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
