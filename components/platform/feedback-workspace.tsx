"use client";
import Link from "next/link";
import { useRef } from "react";
import { useFeedbackSnapshot } from "./use-feedback-snapshot";
import type { SupportSnapshot } from "@/lib/platform/support-types";
import { FeedbackForm } from "./feedback-form";
import { PortalCard, PortalEmpty, portalLinkClass } from "./portal-ui";
import { SupportRows } from "./regional-support-presentation";
import { FeedbackReceiptWorkspace } from "./feedback-receipt-workspace";
import { ReadVisibility } from "./read-visibility";
import { FeedbackPromptPreferences } from "./feedback-prompt-preferences";

type FeedbackWorkspaceProps = {
  owner: string;
  query: string;
  view: "new" | "requests" | "detail";
  release: string;
  received?: boolean;
  promptClaimId?: string;
};
export function FeedbackWorkspace(props: FeedbackWorkspaceProps) {
  return (
    <div className="space-y-6">
      <FeedbackNavigation view={props.view} />
      {props.view === "detail" ? (
        <FeedbackReceiptWorkspace
          owner={props.owner}
          query={props.query}
          received={props.received}
        />
      ) : (
        <FeedbackOrdinaryWorkspace {...props} />
      )}
    </div>
  );
}
function FeedbackOrdinaryWorkspace({
  owner,
  query,
  view,
  release,
  promptClaimId
}: FeedbackWorkspaceProps) {
  const { data, visible, notice, busy, load } =
    useFeedbackSnapshot<SupportSnapshot>(
      owner,
      `/api/platform/feedback?${query}`,
      (next) => next.viewer.id === owner
    );
  return (
    <div className="space-y-6">
      {!visible && (
        <div className="space-y-3 rounded-xl border border-gc-divider p-5">
          <p role="status">
            {notice ||
              "Checking current access. Private details and unsent entries are concealed."}
          </p>
          <button
            type="button"
            className="gc-button gc-button-quiet"
            disabled={busy}
            onClick={() => void load()}
          >
            {busy ? "Checking…" : "Recheck current access"}
          </button>
        </div>
      )}
      <ReadVisibility.Provider value={visible}>
        <div
          hidden={!visible}
          style={{ display: visible ? undefined : "none" }}
          className="space-y-6"
        >
          {data && (
            <FeedbackViews
              snapshot={data}
              view={view}
              release={release}
              promptClaimId={promptClaimId}
              onRefresh={() => void load()}
            />
          )}
        </div>
      </ReadVisibility.Provider>
    </div>
  );
}
function FeedbackViews({
  snapshot: s,
  view,
  release,
  onRefresh,
  promptClaimId
}: {
  snapshot: SupportSnapshot;
  view: "new" | "requests" | "detail";
  release: string;
  onRefresh: () => void;
  promptClaimId?: string;
}) {
  const everReady = useRef(false);
  if (s.intake.available) everReady.current = true;
  return (
    <>
      {view === "new" && (
        <>
          <PortalCard title="Help us improve your experience">
            <p>
              This optional feedback is about the website. Share a rating,
              describe a problem or suggest an improvement. You can use the
              website without responding.
            </p>
            <p className="text-sm text-gc-muted">
              Feedback is confidential and linked to your account. Only
              authorized God’s Churches staff can see this feedback unless you
              choose to share an idea.
            </p>
            <p className="text-sm text-gc-muted">
              For an account problem needing help,{" "}
              <Link
                href="/platform/help/new"
                className="text-gc-accent underline"
              >
                get help
              </Link>
              . For inappropriate content, use that item’s Report action. Church
              verification stays in{" "}
              <Link
                href="/platform/church-claims"
                className="text-gc-accent underline"
              >
                church requests
              </Link>
              . This form is not an emergency, pastoral-care or independent
              complaints service.
            </p>
            {s.intake.available && s.intake.recipient ? (
              <p className="rounded-xl border border-gc-action p-4">
                Recipient: {s.intake.recipient.name}, your assigned God’s
                Churches support owner. Your original feedback is private to you
                and the currently authorized assigned owner. Church
                representatives and ordinary members are not included.
              </p>
            ) : (
              <PortalEmpty>
                Feedback intake is not available yet. The recipient and privacy
                setup must be ready before a new submission can be accepted. An
                existing draft stays on this page; it has not been saved.
              </PortalEmpty>
            )}
            {!s.viewer.adult && (
              <PortalEmpty>
                Private feedback intake is for adults. You can still use Help
                and contacts.
              </PortalEmpty>
            )}
            {everReady.current && (
              <FeedbackForm
                snapshot={s}
                release={release}
                promptClaimId={promptClaimId}
                onRefresh={onRefresh}
              />
            )}
          </PortalCard>
        </>
      )}
      {view === "requests" && (
        <>
          {s.rows.length ? (
            <SupportRows rows={s.rows} detailBase="/platform/feedback/cases" />
          ) : (
            <PortalEmpty>
              No feedback receipts yet. Sending optional feedback creates a
              private receipt here.
            </PortalEmpty>
          )}
          <FeedbackPagination page={s.page} more={s.more} />
        </>
      )}
      {view !== "detail" && <FeedbackPromptPreferences owner={s.viewer.id} />}
    </>
  );
}
function FeedbackPagination({ page, more }: { page: number; more: boolean }) {
  if (!page && !more) return null;
  return (
    <nav aria-label="Feedback pages" className="flex flex-wrap gap-5">
      {page > 0 && (
        <Link
          href={`/platform/feedback/requests?page=${page - 1}`}
          className={portalLinkClass}
        >
          Previous page
        </Link>
      )}
      {more && page < 99 && (
        <Link
          href={`/platform/feedback/requests?page=${page + 1}`}
          className={portalLinkClass}
        >
          Next page
        </Link>
      )}
    </nav>
  );
}

function FeedbackNavigation({
  view
}: {
  view: FeedbackWorkspaceProps["view"];
}) {
  return (
    <nav aria-label="Feedback" className="flex flex-wrap gap-x-6 gap-y-2">
      <Link
        href="/platform/feedback"
        className={portalLinkClass}
        aria-current={view === "new" ? "page" : undefined}
      >
        Share feedback
      </Link>
      <Link
        href="/platform/feedback/requests"
        className={portalLinkClass}
        aria-current={view === "requests" ? "page" : undefined}
      >
        My feedback
      </Link>
      <Link href="/platform/help" className={portalLinkClass}>
        Help and contacts
      </Link>
      <Link href="/platform/feedback/ideas" className={portalLinkClass}>
        Reviewed ideas
      </Link>
    </nav>
  );
}
