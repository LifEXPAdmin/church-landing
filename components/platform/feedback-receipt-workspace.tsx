"use client";
import { useCallback, useRef } from "react";
import type { SupportSnapshot } from "@/lib/platform/support-types";
import { feedbackKinds } from "@/lib/platform/feedback-types";
import { FeedbackChoices } from "./feedback-form";
import { PortalCard } from "./portal-ui";
import { ReadVisibility } from "./read-visibility";
import { SupportViews, supportStatusOptions } from "./support-views";
import { useSupportPrivateSnapshot } from "./use-support-private-snapshot";

// Current versions and conversation content may refresh without replacing a
// mounted command. A changed action/choice/attachment set must not destroy work.
function commandStructure(snapshot: SupportSnapshot) {
  const c = snapshot.detail;
  if (!c?.feedback) return "unavailable";
  const closed = ["RESOLVED", "CLOSED"].includes(c.status);
  const canTransition =
    (c.access.requester || c.access.owner) && c.status !== "CLOSED";
  return JSON.stringify({
    caseId: c.id,
    requester: c.requester.id,
    access: c.access,
    reply: !closed && (c.feedback.contactAllowed || c.access.requester),
    reopen: closed && (c.access.requester || c.access.owner),
    status: canTransition ? supportStatusOptions(c).map((o) => o.value) : null,
    kind: c.feedback.kind,
    redacted: !!c.feedback.redactedAt,
    attachments: c.feedback.attachments.map((image) => image.id),
    feature: c.access.owner && !!c.featureDecision,
    handoff: c.access.owner ? c.ownerOptions.map((o) => [o.id, o.version]) : []
  });
}

export function FeedbackReceiptWorkspace({
  owner,
  query,
  received
}: {
  owner: string;
  query: string;
  received?: boolean;
}) {
  const work = useRef(new Set<string>());
  const onWorkChange = useCallback((id: string, pending: boolean) => {
    if (pending) work.current.add(id);
    else work.current.delete(id);
  }, []);
  const { snapshot, visible, currentAccess, notice, hide, recheck } =
    useSupportPrivateSnapshot(
      owner,
      `/api/platform/feedback?${query}`,
      "feedback receipt",
      {
        verifySnapshot: (next) =>
          !!(next.detail?.feedback && next.detail.access.requester),
        canReplaceSnapshot: (before, next) =>
          work.current.size === 0 ||
          (commandStructure(before) === commandStructure(next) &&
            // Adding an unread action preserves every existing command owner.
            // Removing it could erase an uncertain mark-read request.
            (!before.detail?.unread || !!next.detail?.unread))
      }
    );
  const onNavigate = useCallback(
    (id: string, destination: string) => {
      if ([...work.current].some((other) => other !== id)) recheck();
      else window.location.assign(destination);
    },
    [recheck]
  );
  const c = snapshot?.detail;
  const privacy = {
    visible,
    currentAccess,
    onAccessDenied: hide,
    onWorkChange,
    onNavigate
  };
  return (
    <div className="space-y-6" data-feedback-receipt>
      {!visible && (
        <div className="space-y-3 rounded-xl border border-gc-divider p-5">
          <p role="status">{notice}</p>
          <button
            type="button"
            className="gc-button gc-button-quiet"
            onClick={recheck}
          >
            Recheck current access
          </button>
          <button
            type="button"
            className="gc-button gc-button-quiet"
            onClick={() => {
              if (
                confirm(
                  "Reload current details and discard local entries? A previous unconfirmed request may already be saved."
                )
              )
                window.location.reload();
            }}
          >
            Reload current information
          </button>
        </div>
      )}
      {snapshot && c?.feedback && (
        <ReadVisibility.Provider value={visible}>
          {visible && (
            <h2 className="break-words text-3xl font-semibold">{c.subject}</h2>
          )}
          <PortalCard title={visible ? "Your feedback choices" : ""}>
            {visible && (
              <>
                <p>
                  {feedbackKinds[
                    c.feedback.kind as keyof typeof feedbackKinds
                  ] ?? "Feedback"}{" "}
                  ·{" "}
                  {c.feedback.rating === null
                    ? "No rating shared"
                    : `${c.feedback.rating} out of 5`}
                </p>
                <p className="text-sm text-gc-muted">
                  {c.feedback.contactAllowed
                    ? "Follow-up permission is on for your selected channels."
                    : "Follow-up permission is off."}{" "}
                  This is separate from permission to publish a reviewed
                  suggestion.
                </p>
                {c.feedback.contextRelease && (
                  <p className="text-sm text-gc-muted">
                    Technical context you shared: version{" "}
                    {c.feedback.contextRelease}; device{" "}
                    {c.feedback.contextDevice}; browser{" "}
                    {c.feedback.contextBrowser}
                    {c.feedback.contextErrorRef
                      ? `; reference ${c.feedback.contextErrorRef}`
                      : ""}
                    .
                  </p>
                )}
              </>
            )}
            {c.feedback.redactedAt ? (
              visible && (
                <p>Private feedback content and choices have been removed.</p>
              )
            ) : (
              <details open={!visible ? true : undefined}>
                {visible && (
                  <summary className="min-h-11 cursor-pointer py-2 font-semibold text-gc-accent">
                    Change contact and sharing choices
                  </summary>
                )}
                <FeedbackChoices
                  owner={owner}
                  detail={c}
                  onRefresh={recheck}
                  privacy={{
                    ...privacy,
                    recoveryLabel: "Save contact and sharing choices"
                  }}
                />
              </details>
            )}
          </PortalCard>
          <SupportViews
            snapshot={snapshot}
            view="detail"
            received={received}
            navigation={false}
            detailBase={`/platform/feedback/cases/${encodeURIComponent(c.id)}`}
            handoffDestination="/platform/feedback/requests"
            onRefresh={recheck}
            privacy={privacy}
          />
        </ReadVisibility.Provider>
      )}
    </div>
  );
}
