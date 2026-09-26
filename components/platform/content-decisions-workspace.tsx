"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { RegionalTime } from "./regional-presentation";
import { SupportForm } from "./support-form";
import { socialRequest } from "@/lib/platform/social-client";
import {
  contentDecisionReasons,
  contentReviewActions,
  contentVisibilityLabels,
  contentNoticeHref,
  type ContentDecisionNotice,
  type ContentAppealOffer
} from "@/lib/platform/content-moderation-types";

type DecisionPage = {
  ownerId: string;
  notices: ContentDecisionNotice[];
  after?: string | null;
  appeal?: ContentAppealOffer;
  ownSource?: {
    href: string;
    content: string;
    contentNote?: string | null;
    safeExcerpt?: string | null;
    version: number;
  } | null;
};

// The route keys this owner by account, decision and cursor. Keep the original
// form mounted; current reads may conceal it but never replace its command.
export function ContentDecisionsWorkspace({
  owner,
  id,
  after
}: {
  owner: string;
  id?: string;
  after?: string;
}) {
  const [page, setPage] = useState<DecisionPage | null>(null);
  const [visible, setVisible] = useState(false);
  const [currentAccess, setCurrentAccess] = useState(false);
  const [notice, setNotice] = useState(
    "Checking current content decision access…"
  );
  const accepted = useRef<string | null>(null);
  const generation = useRef(0),
    active = useRef(false),
    reading = useRef(false),
    queued = useRef(false);
  const load = useCallback(async () => {
    if (
      !active.current ||
      document.visibilityState === "hidden" ||
      navigator.onLine === false
    )
      return;
    if (reading.current) {
      queued.current = true;
      return;
    }
    reading.current = true;
    const seq = ++generation.current;
    setVisible(false);
    setCurrentAccess(false);
    setNotice("Checking current content decision access…");
    try {
      const { data } = await socialRequest<DecisionPage>(
        `/api/platform/community-reports?${new URLSearchParams({ view: "decisions", ...(id ? { id } : {}), ...(after ? { after } : {}) })}`,
        undefined,
        owner
      );
      if (seq !== generation.current || !active.current) return;
      if (data.ownerId !== owner)
        throw Error("This view is not available to the current account.");
      const signature = JSON.stringify(data);
      setCurrentAccess(true);
      if (accepted.current !== null && accepted.current !== signature) {
        setNotice(
          "This content decision or its access changed. Reload to inspect current details. Unsaved entries will be cleared; an unconfirmed request may already be saved."
        );
      } else {
        if (accepted.current === null) {
          accepted.current = signature;
          setPage(data);
        }
        setVisible(true);
        setNotice("");
      }
    } catch (error) {
      if (seq === generation.current && active.current)
        setNotice(
          error instanceof Error
            ? error.message
            : "Current content decision access could not be confirmed."
        );
    } finally {
      reading.current = false;
      if (queued.current && active.current) {
        queued.current = false;
        void load();
      }
    }
  }, [owner, id, after]);
  const hide = useCallback(() => {
    active.current = false;
    queued.current = false;
    generation.current++;
    setVisible(false);
    setCurrentAccess(false);
    setNotice("Checking current content decision access…");
  }, []);
  const recheck = useCallback(() => {
    if (document.visibilityState !== "hidden" && navigator.onLine !== false) {
      active.current = true;
      void load();
    }
  }, [load]);
  useEffect(() => {
    const visibility = () =>
      document.visibilityState === "hidden" ? hide() : recheck();
    recheck();
    window.addEventListener("blur", hide);
    window.addEventListener("offline", hide);
    window.addEventListener("pagehide", hide);
    window.addEventListener("focus", recheck);
    window.addEventListener("online", recheck);
    window.addEventListener("pageshow", recheck);
    window.addEventListener("social-relationships-changed", recheck);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      hide();
      window.removeEventListener("blur", hide);
      window.removeEventListener("offline", hide);
      window.removeEventListener("pagehide", hide);
      window.removeEventListener("focus", recheck);
      window.removeEventListener("online", recheck);
      window.removeEventListener("pageshow", recheck);
      window.removeEventListener("social-relationships-changed", recheck);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [hide, recheck]);
  return (
    <div className="space-y-5">
      {!visible && (
        <div className="space-y-3 rounded-xl border p-4">
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
      {visible && page && (
        <div className="space-y-5">
          {page.notices?.length ? (
            page.notices.map((n) => (
              <article
                key={n.id}
                aria-label="Your content decision"
                className="space-y-3 rounded-xl border p-4"
              >
                <h2 className="text-2xl">{contentReviewActions[n.action]}</h2>
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
                  withdrawal, audience choices and account access still apply.
                  Lifting a restriction does not republish deleted or withdrawn
                  content.
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
                  <strong>Content note:</strong> {page.ownSource.contentNote}
                </p>
              )}
              {page.ownSource.safeExcerpt && (
                <p className="whitespace-pre-wrap break-words">
                  <strong>Safe excerpt:</strong> {page.ownSource.safeExcerpt}
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
                This private author view does not change who can see the source.
              </p>
            </section>
          )}
          {page.appeal && (
            <section className="space-y-4" aria-label="Request reconsideration">
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
      )}
      {page?.appeal?.available && !page.appeal.caseId && id && (
        <SupportForm
          owner={owner}
          privacy={{
            visible,
            currentAccess,
            onAccessDenied: hide,
            recoveryLabel: "reconsideration"
          }}
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
      )}
    </div>
  );
}
