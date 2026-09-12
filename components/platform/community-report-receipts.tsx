"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { socialRequest } from "@/lib/platform/social-client";
import {
  communityReportReasons,
  communityReportStatusLabels,
  communityReportTargetLabels,
  type CommunityReportTarget,
  type CommunityReportReason
} from "@/lib/platform/community-report-types";
type Receipt = {
  id: string;
  target: { type: CommunityReportTarget; id: string };
  reason: CommunityReportReason;
  details: string;
  status: keyof typeof communityReportStatusLabels;
  createdAt: string;
  relatedReview?: string;
};
type Page = { report?: Receipt; reports?: Receipt[]; after?: string | null };
export function CommunityReportReceipts({
  owner,
  id,
  after
}: {
  owner: string;
  id?: string;
  after?: string;
}) {
  const [data, setData] = useState<Page | null>(null),
    [message, setMessage] = useState("Loading your private reports…"),
    [busy, setBusy] = useState(false);
  const generation = useRef(0);
  const load = useCallback(async () => {
    const seq = ++generation.current;
    setData(null);
    setBusy(true);
    try {
      const result = await socialRequest<Page>(
        `/api/platform/community-reports?${new URLSearchParams(id ? { view: "receipt", id } : { view: "mine", ...(after ? { after } : {}) })}`,
        undefined,
        owner
      );
      if (seq !== generation.current) return;
      setData(result.data);
      setMessage("");
    } catch (error) {
      if (seq === generation.current)
        setMessage(
          error instanceof Error
            ? error.message
            : "Private reports could not be loaded."
        );
    } finally {
      if (seq === generation.current) setBusy(false);
    }
  }, [owner, id, after]);
  useEffect(() => {
    void load();
    const conceal = () => {
      generation.current++;
      setData(null);
      setBusy(false);
    };
    const restore = () => {
      if (document.visibilityState !== "hidden") void load();
    };
    const visibility = () =>
      document.visibilityState === "hidden" ? conceal() : restore();
    window.addEventListener("blur", conceal);
    window.addEventListener("focus", restore);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      conceal();
      window.removeEventListener("blur", conceal);
      window.removeEventListener("focus", restore);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [load]);
  const receipt = data?.report;
  return (
    <div className="space-y-5">
      <h1 className="text-3xl">
        {id ? "Your private report receipt" : "Your private reports"}
      </h1>
      <p>
        Only your own submissions appear here. A received report is not a
        finding against the reported person.
      </p>
      <p role="status">{busy ? "Checking private report access…" : message}</p>
      <button
        type="button"
        className="gc-button gc-button-quiet"
        disabled={busy}
        onClick={() => void load()}
      >
        Refresh private reports
      </button>
      {receipt && (
        <article
          className="space-y-3 rounded-xl border p-4"
          aria-label="Private report receipt"
        >
          <h2 className="text-2xl">
            {communityReportStatusLabels[receipt.status]}
          </h2>
          <p>
            Reported {communityReportTargetLabels[receipt.target.type]} ·{" "}
            {communityReportReasons[receipt.reason]}
          </p>
          <p>
            Submitted{" "}
            <time dateTime={receipt.createdAt}>
              {new Date(receipt.createdAt).toLocaleString()}
            </time>
          </p>
          <p className="break-all text-sm">Reference: {receipt.id}</p>
          {receipt.details && (
            <div>
              <h3 className="font-semibold">Your submitted details</h3>
              <p className="whitespace-pre-wrap break-words">
                {receipt.details}
              </p>
            </div>
          )}
          {receipt.relatedReview && (
            <Link
              prefetch={false}
              className="underline"
              href={receipt.relatedReview}
            >
              Open the existing church claim review
            </Link>
          )}
        </article>
      )}
      {data?.reports && (
        <>
          {data.reports.length === 0 ? (
            <p>You have no private reports on this page.</p>
          ) : (
            <ul className="space-y-3">
              {data.reports.map((row) => (
                <li key={row.id} className="rounded-xl border p-4">
                  <Link
                    prefetch={false}
                    className="block space-y-1 underline"
                    href={`/platform/reports?receipt=${encodeURIComponent(row.id)}`}
                  >
                    <strong className="block">
                      {communityReportReasons[row.reason]} ·{" "}
                      {communityReportTargetLabels[row.target.type]}
                    </strong>
                    <span>
                      {communityReportStatusLabels[row.status]} ·{" "}
                      {new Date(row.createdAt).toLocaleDateString()}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {data.after && (
            <Link
              prefetch={false}
              className="gc-button gc-button-quiet"
              href={`/platform/reports?after=${encodeURIComponent(data.after)}`}
            >
              Older private reports
            </Link>
          )}
        </>
      )}
      {(id || after) && (
        <Link prefetch={false} className="underline" href="/platform/reports">
          All your private reports
        </Link>
      )}
      <p className="text-sm">
        For website help, use{" "}
        <Link prefetch={false} href="/help" className="underline">
          Help
        </Link>
        .
      </p>
    </div>
  );
}
