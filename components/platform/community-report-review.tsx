"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { socialRequest, SocialClientError } from "@/lib/platform/social-client";
import {
  communityReportReasons,
  communityReportStatusLabels,
  communityReportTargetLabels,
  reportReviewHref,
  type CommunityReviewPage
} from "@/lib/platform/community-report-types";
import { useUnsavedSocialWork } from "./use-unsaved-social-work";
import {
  contentReviewActions,
  contentDecisionReasons,
  contentVisibilityLabels,
  type ContentReviewAction,
  type ContentDecisionReason
} from "@/lib/platform/content-moderation-types";

export function CommunityReportReview({
  owner,
  id,
  closed,
  after
}: {
  owner: string;
  id?: string;
  closed: boolean;
  after?: string;
}) {
  const [data, setData] = useState<CommunityReviewPage | null>(null),
    [hidden, setHidden] = useState(true),
    [busy, setBusy] = useState(false),
    [reason, setReason] = useState(""),
    [resolution, setResolution] = useState("CLOSED"),
    [contentAction, setContentAction] = useState<ContentReviewAction | "NONE">(
      "NONE"
    ),
    [authorReason, setAuthorReason] = useState<ContentDecisionReason>(
      "PRIVATE_INFORMATION"
    ),
    [confirmed, setConfirmed] = useState(false),
    [pending, setPending] = useState<string | null>(null),
    [conflict, setConflict] = useState(false),
    [waitingUntil, setWaitingUntil] = useState(0),
    [readError, setReadError] = useState(""),
    [notice, setNotice] = useState("Checking your report-review access…");
  const generation = useRef(0),
    reading = useRef(false),
    writing = useRef(false),
    queued = useRef(false),
    active = useRef(true);
  useUnsavedSocialWork(
    {
      dirty: !!reason || resolution !== "CLOSED" || contentAction !== "NONE",
      saving: !!pending,
      conflict
    },
    () =>
      setNotice("Record, retry or discard your unsaved review before leaving."),
    true
  );
  const load = useCallback(async () => {
    if (!active.current || document.visibilityState === "hidden") return;
    if (reading.current || writing.current) {
      queued.current = true;
      return;
    }
    reading.current = true;
    const seq = ++generation.current;
    setBusy(true);
    setHidden(true);
    setData(null);
    try {
      const { data } = await socialRequest<CommunityReviewPage>(
        `/api/platform/community-reports?${new URLSearchParams(
          id
            ? { view: "review", id }
            : {
                view: "queue",
                status: closed ? "CLOSED" : "OPEN",
                ...(after ? { after } : {})
              }
        )}`,
        undefined,
        owner
      );
      if (seq !== generation.current) return;
      setData(data);
      setHidden(false);
      setReadError("");
      setNotice((v) => (v === "Checking your report-review access…" ? "" : v));
    } catch (error) {
      if (seq === generation.current)
        setReadError(
          error instanceof Error
            ? error.message
            : "Review access could not be checked. Private work is concealed."
        );
    } finally {
      reading.current = false;
      if (seq === generation.current) setBusy(false);
      if (queued.current && !writing.current && active.current) {
        queued.current = false;
        void load();
      }
    }
  }, [owner, id, closed, after]);
  useEffect(() => {
    const hide = () => {
      active.current = false;
      generation.current++;
      setHidden(true);
      setData(null);
      setBusy(false);
    };
    const resume = () => {
      if (document.visibilityState !== "hidden") {
        active.current = true;
        void load();
      }
    };
    const visibility = () =>
      document.visibilityState === "hidden" ? hide() : resume();
    active.current = true;
    void load();
    window.addEventListener("blur", hide);
    window.addEventListener("focus", resume);
    window.addEventListener("online", resume);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      hide();
      queued.current = false;
      window.removeEventListener("blur", hide);
      window.removeEventListener("focus", resume);
      window.removeEventListener("online", resume);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [load]);
  useEffect(() => {
    if (!waitingUntil) return;
    const timer = setTimeout(
      () => setWaitingUntil(0),
      Math.max(0, waitingUntil - Date.now())
    );
    return () => clearTimeout(timer);
  }, [waitingUntil]);
  async function send(body: string) {
    if (writing.current || reading.current || hidden || waitingUntil) return;
    writing.current = true;
    const seq = ++generation.current;
    setBusy(true);
    setPending(body);
    setNotice("Recording the review…");
    try {
      const { data } = await socialRequest<{
        id: string;
        version: number;
        message: string;
      }>("/api/platform/community-reports", body, owner);
      if (seq !== generation.current) return;
      if (
        data.id !== id ||
        !Number.isSafeInteger(data.version) ||
        data.version < 1
      )
        throw new SocialClientError(
          503,
          "The result is unconfirmed. Retry the same review."
        );
      setPending(null);
      setReason("");
      setResolution("CLOSED");
      setContentAction("NONE");
      setConfirmed(false);
      setConflict(false);
      setNotice(data.message);
      queued.current = true;
    } catch (error) {
      if (seq !== generation.current) return;
      const status = error instanceof SocialClientError ? error.status : 503;
      // Review authority is checked BEFORE receipt replay. Losing it cannot
      // prove an earlier uncertain decision failed; preserve the original key.
      if ([400, 409, 429].includes(status)) setPending(null);
      if ([401, 403, 404, 409].includes(status) || status >= 500) {
        setHidden(true);
        setData(null);
      }
      // A transport failure can precede the final owner check. Conceal first,
      // then recheck both the account and case authority without resending.
      if (status >= 500) queued.current = true;
      if (status === 409) setConflict(true);
      if (error instanceof SocialClientError && error.retryAfter)
        setWaitingUntil(Date.now() + Math.min(86400, error.retryAfter) * 1000);
      setNotice(
        error instanceof Error
          ? error.message
          : "The response was lost. Retry the same review."
      );
    } finally {
      writing.current = false;
      setBusy(false);
      if (queued.current) {
        queued.current = false;
        void load();
      }
    }
  }
  function discard() {
    if (
      pending &&
      !confirm(
        "This review may already be recorded. Clear this browser’s retry, then check the case when your access is available?"
      )
    )
      return;
    setReason("");
    setResolution("CLOSED");
    setContentAction("NONE");
    setConfirmed(false);
    setPending(null);
    setConflict(false);
    setNotice(
      "Local review entries discarded. Recorded decisions are unchanged."
    );
  }
  const report = data?.report;
  return (
    <div className="space-y-5">
      <h1 className="text-3xl">
        {id ? "Review a report" : "Report review queue"}
      </h1>
      <p>
        Only cases within your current review authority appear here. A report is
        an allegation, not a finding.
      </p>
      <p role="status" aria-live="polite">
        {busy ? "Checking or saving this private review…" : readError || notice}
      </p>
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          className="gc-button gc-button-quiet"
          disabled={busy}
          onClick={() => void load()}
        >
          Refresh review access
        </button>
        {(reason ||
          pending ||
          resolution !== "CLOSED" ||
          contentAction !== "NONE") && (
          <button
            type="button"
            className="gc-button gc-button-quiet"
            disabled={busy}
            onClick={discard}
          >
            Discard local review
          </button>
        )}
      </div>
      {hidden && (
        <p className="text-sm">
          Case details and unsaved review text stay concealed until your current
          access is verified.
        </p>
      )}
      {!id && (
        <>
          <nav aria-label="Review queue status" className="flex gap-4">
            <Link
              prefetch={false}
              className="underline"
              aria-current={!closed ? "page" : undefined}
              href={reportReviewHref()}
            >
              Open reviews
            </Link>
            <Link
              prefetch={false}
              className="underline"
              aria-current={closed ? "page" : undefined}
              href={reportReviewHref(undefined, true)}
            >
              Closed reviews
            </Link>
          </nav>
          {after && (
            <Link
              prefetch={false}
              className="underline"
              href={reportReviewHref(undefined, closed)}
            >
              Newest reviews
            </Link>
          )}
        </>
      )}
      {!hidden && data && (
        <>
          {!id && (
            <>
              {data.reviews?.length ? (
                <ul className="space-y-3" aria-label="Authorized reports">
                  {data.reviews.map((row) => (
                    <li key={row.id} className="rounded-xl border p-4">
                      <Link
                        prefetch={false}
                        className="block space-y-1 underline"
                        href={reportReviewHref(row.id, closed, after)}
                      >
                        <strong className="block">
                          {communityReportReasons[row.reason]} ·{" "}
                          {communityReportTargetLabels[row.type]}
                        </strong>
                        <span className="block">
                          {communityReportStatusLabels[row.status]} ·{" "}
                          {row.churchScoped
                            ? "Church scope"
                            : row.topicScoped
                              ? "Topic scope"
                              : "Platform scope"}
                        </span>
                        <time dateTime={row.createdAt}>
                          {new Date(row.createdAt).toLocaleString()}
                        </time>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p>
                  No authorized {closed ? "closed" : "open"} reports on this
                  page.
                </p>
              )}
              {data.after && (
                <Link
                  prefetch={false}
                  className="gc-button gc-button-quiet"
                  href={reportReviewHref(undefined, closed, data.after)}
                >
                  Older reviews
                </Link>
              )}
            </>
          )}
          {report && (
            <>
              <article
                aria-label="Selected report"
                className="space-y-3 rounded-xl border p-4"
              >
                <h2 className="text-2xl">
                  {communityReportStatusLabels[report.status]}
                </h2>
                <p>
                  {communityReportReasons[report.reason]} ·{" "}
                  {communityReportTargetLabels[report.target.type]}
                </p>
                <p className="break-all text-sm">
                  Reference: {report.id} · Review version {report.version}
                </p>
                <h3 className="font-semibold">Submitted report details</h3>
                <p className="whitespace-pre-wrap break-words">
                  {report.details || "No additional details were submitted."}
                </p>
                {data.evidence && (
                  <section
                    aria-label="Selected source evidence"
                    className="space-y-2 border-t pt-3"
                  >
                    <h3 className="font-semibold">Selected source only</h3>
                    {data.evidence.contentNote && (
                      <p className="whitespace-pre-wrap break-words">
                        <strong>Content note:</strong>{" "}
                        {data.evidence.contentNote}
                      </p>
                    )}
                    {data.evidence.safeExcerpt && (
                      <p className="whitespace-pre-wrap break-words">
                        <strong>Safe excerpt:</strong>{" "}
                        {data.evidence.safeExcerpt}
                      </p>
                    )}
                    <p className="whitespace-pre-wrap break-words">
                      {data.evidence.content ??
                        data.evidence.purpose ??
                        "No text on this selected record."}
                    </p>
                    {data.evidence.version &&
                      data.evidence.version !== data.reportedVersion && (
                        <p className="text-sm">
                          This source changed after the report. This is its
                          current text, not a saved snapshot.
                        </p>
                      )}
                    <p className="text-sm">
                      Other posts, messages and conversation history are not
                      included.
                    </p>
                  </section>
                )}
                {!data.evidence && (
                  <p className="text-sm">
                    No source text is available in this case view. The submitted
                    details and review history remain available.
                  </p>
                )}
                {report.relatedReview && (
                  <Link
                    prefetch={false}
                    className="underline"
                    href={report.relatedReview}
                  >
                    Open the existing church representative workflow
                  </Link>
                )}
              </article>
              {!!data.reconsiderationCases?.length && (
                <section
                  className="space-y-3"
                  aria-label="Assigned reconsideration cases"
                >
                  <h2 className="text-2xl">Author reconsideration</h2>
                  <p>
                    These help cases are assigned to you through this report.
                    Resolve the appeal separately from any content restriction.
                  </p>
                  {data.reconsiderationCases.map((c) => (
                    <Link
                      key={c.id}
                      prefetch={false}
                      className="block underline"
                      href={`/platform/help/cases/${c.id}`}
                    >
                      Open reconsideration case ·{" "}
                      {c.status.toLowerCase().replaceAll("_", " ")}
                    </Link>
                  ))}
                </section>
              )}
              <form
                aria-label="Record report review"
                className="space-y-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (
                    pending ||
                    conflict ||
                    busy ||
                    waitingUntil ||
                    (contentAction !== "NONE" && (!confirmed || !data.source))
                  )
                    return;
                  void send(
                    JSON.stringify({
                      operation:
                        contentAction === "NONE" ? "resolve" : "moderate",
                      mutationId: crypto.randomUUID(),
                      id,
                      expectedVersion: report.version,
                      ...(contentAction === "NONE"
                        ? { resolution }
                        : {
                            action: contentAction,
                            authorReason,
                            expectedSourceVersion: data.source!.version,
                            expectedContextVersion: data.source!.contextVersion
                          }),
                      decisionReason: reason
                    })
                  );
                }}
              >
                <h2 className="text-2xl">Record a review decision</h2>
                <p className="text-sm">
                  Case status and content restrictions are separate. Content
                  decisions use the selected source’s current version and send
                  the author a separate explanation. Account permissions stay
                  unchanged.
                </p>
                {data.source && (
                  <fieldset
                    className="space-y-3"
                    disabled={busy || !!pending || conflict}
                  >
                    <legend className="font-semibold">Selected content</legend>
                    <p>
                      {contentVisibilityLabels[data.source.visibility]} · Source
                      version {data.source.version}
                      {data.source.contextVersion
                        ? ` · Post version ${data.source.contextVersion}`
                        : ""}
                    </p>
                    {data.source.authorWithdrawn && (
                      <p>
                        The author has withdrawn this content or its parent.
                        Lifting a moderation restriction will not publish it.
                      </p>
                    )}
                    <label className="block" htmlFor="content-action">
                      Content action
                    </label>
                    <select
                      id="content-action"
                      className="w-full rounded border p-3"
                      value={contentAction}
                      onChange={(e) => {
                        const next = e.target.value as
                          | ContentReviewAction
                          | "NONE";
                        setContentAction(next);
                        setConfirmed(false);
                        setAuthorReason(
                          ["NO_VIOLATION", "RESTORE"].includes(next)
                            ? "NO_VIOLATION"
                            : "PRIVATE_INFORMATION"
                        );
                      }}
                    >
                      <option value="NONE">Record case status only</option>
                      {Object.entries(contentReviewActions).map(
                        ([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        )
                      )}
                    </select>
                    {contentAction !== "NONE" && (
                      <>
                        <label className="block" htmlFor="author-reason">
                          Explanation for the author
                        </label>
                        <select
                          id="author-reason"
                          className="w-full rounded border p-3"
                          value={authorReason}
                          onChange={(e) =>
                            setAuthorReason(
                              e.target.value as ContentDecisionReason
                            )
                          }
                        >
                          {Object.entries(contentDecisionReasons)
                            .filter(
                              ([value]) =>
                                ["NO_VIOLATION", "RESTORE"].includes(
                                  contentAction
                                ) ===
                                [
                                  "NO_VIOLATION",
                                  "CORRECTION_COMPLETE"
                                ].includes(value)
                            )
                            .map(([value, label]) => (
                              <option key={value} value={value}>
                                {label}
                              </option>
                            ))}
                        </select>
                        <div
                          className="space-y-2 rounded border p-3"
                          aria-label="Author notice preview"
                        >
                          <strong>{contentReviewActions[contentAction]}</strong>
                          <p>{contentDecisionReasons[authorReason]}</p>
                          <p className="text-sm">
                            The author can ask the assigned reviewer for
                            reconsideration. Reporter details and your private
                            reason below are excluded.
                          </p>
                        </div>
                        <label className="flex items-start gap-3">
                          <input
                            type="checkbox"
                            required
                            checked={confirmed}
                            onChange={(e) => setConfirmed(e.target.checked)}
                            className="mt-1 h-5 w-5"
                          />
                          Apply this decision to the selected content and create
                          this author notice.
                        </label>
                      </>
                    )}
                  </fieldset>
                )}
                {contentAction === "NONE" && (
                  <>
                    <label className="block" htmlFor="review-resolution">
                      Review outcome
                    </label>
                    <select
                      id="review-resolution"
                      className="block w-full rounded border p-3"
                      value={resolution}
                      disabled={busy || !!pending || conflict}
                      onChange={(e) => setResolution(e.target.value)}
                    >
                      <option value="CLOSED">Close this review</option>
                      <option value="FOLLOW_UP_REQUIRED">
                        Further review required
                      </option>
                    </select>
                  </>
                )}
                <label className="block" htmlFor="review-reason">
                  Private decision reason
                </label>
                <textarea
                  id="review-reason"
                  className="block min-h-32 w-full rounded border p-3"
                  required
                  minLength={5}
                  maxLength={1000}
                  value={reason}
                  disabled={busy || !!pending || conflict}
                  onChange={(e) => setReason(e.target.value)}
                />
                <p className="text-sm">
                  Only authorized case reviewers can read this reason. Include
                  only what this decision needs.
                </p>
                {conflict && (
                  <button
                    type="button"
                    className="gc-button gc-button-quiet"
                    onClick={() => {
                      setConflict(false);
                      setConfirmed(false);
                      setNotice(
                        "Current review version checked. Your unsaved reason is kept; review it before recording again."
                      );
                    }}
                  >
                    Use this current review version
                  </button>
                )}
                {pending ? (
                  <button
                    type="button"
                    className="gc-button"
                    disabled={busy || !!waitingUntil}
                    onClick={() => void send(pending)}
                  >
                    Retry same review
                  </button>
                ) : (
                  <button
                    className="gc-button"
                    disabled={
                      busy ||
                      conflict ||
                      !!waitingUntil ||
                      reason.trim().length < 5
                    }
                  >
                    Record review
                  </button>
                )}
              </form>
              <section
                aria-label="Private review history"
                className="space-y-3"
              >
                <h2 className="text-2xl">Recent review history</h2>
                {data.decisions?.length ? (
                  <ol className="space-y-3">
                    {data.decisions.map((row) => (
                      <li key={row.version} className="rounded-xl border p-3">
                        <p>
                          {communityReportStatusLabels[row.fromStatus]} →{" "}
                          {communityReportStatusLabels[row.toStatus]} · Version{" "}
                          {row.version}
                        </p>
                        {row.action && (
                          <p className="text-sm">
                            {
                              contentReviewActions[
                                row.action as keyof typeof contentReviewActions
                              ]
                            }{" "}
                            · {row.fromVisibility} → {row.toVisibility} · Source
                            version {row.sourceVersion}
                          </p>
                        )}
                        <p className="whitespace-pre-wrap break-words">
                          {row.reason}
                        </p>
                        <time className="text-sm" dateTime={row.createdAt}>
                          {new Date(row.createdAt).toLocaleString()}
                        </time>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p>No review decision has been recorded.</p>
                )}
                {data.decisions?.length === 30 && (
                  <p className="text-sm">
                    Showing the 30 most recent decisions.
                  </p>
                )}
              </section>
            </>
          )}
        </>
      )}
      {id && (
        <Link
          prefetch={false}
          className="block underline"
          href={reportReviewHref(undefined, closed, after)}
        >
          Back to review queue
        </Link>
      )}
      <Link
        prefetch={false}
        className="block underline"
        href="/platform/reports"
      >
        Your private reports
      </Link>
    </div>
  );
}
