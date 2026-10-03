"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { ExchangeHandoffView } from "@/lib/platform/exchange-handoffs";
import { socialRequest } from "@/lib/platform/social-client";
import { ExchangeContactChoice } from "./exchange-handoff-controls";
import { PrivateSnapshotGuard } from "./private-snapshot-guard";
import { useReadVisibility } from "./read-visibility";

// Bootstrap from a current authorized read. Once accepted, the existing guard
// owns version checks and exact-request recovery without remounting local work.
export function ExchangeContactEntry({
  owner,
  listingId,
  listingVersion
}: {
  owner: string;
  listingId: string;
  listingVersion: number;
}) {
  const visible = useReadVisibility();
  const [snapshot, setSnapshot] = useState<{
    data: ExchangeHandoffView;
    checksum: string;
    requestedVersion: number;
  } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [notice, setNotice] = useState("");
  const confirmed = useCallback(() => setSnapshot(null), []);
  const needsRead = !snapshot || snapshot.requestedVersion !== listingVersion;
  const url = `/api/platform/exchange?${new URLSearchParams({ view: "handoff-contact", listingId })}`;
  useEffect(() => {
    if (!visible || !needsRead) return;
    const controller = new AbortController();
    let current = true;
    const deadline = setTimeout(() => controller.abort(), 15000);
    setNotice("");
    void (async () => {
      try {
        const { data } = await socialRequest<ExchangeHandoffView>(
          url,
          undefined,
          owner,
          "POST",
          undefined,
          controller.signal
        );
        if (
          data.ownerId !== owner ||
          !data.contact ||
          data.contact.listingId !== listingId
        )
          throw new Error(
            "Current listing inquiry choices could not be confirmed. Try again."
          );
        const digest = await crypto.subtle.digest(
          "SHA-256",
          new TextEncoder().encode(JSON.stringify(data))
        );
        if (!current) return;
        controller.signal.throwIfAborted();
        setSnapshot({
          data,
          requestedVersion: listingVersion,
          checksum: Array.from(new Uint8Array(digest), (b) =>
            b.toString(16).padStart(2, "0")
          ).join("")
        });
      } catch (error) {
        if (current)
          setNotice(
            controller.signal.aborted
              ? "Checking your listing inquiry choices timed out. Try again."
              : error instanceof Error
                ? error.message
                : "Your listing inquiry choices could not be checked."
          );
      } finally {
        clearTimeout(deadline);
      }
    })();
    return () => {
      current = false;
      clearTimeout(deadline);
      controller.abort();
    };
  }, [owner, listingId, listingVersion, url, visible, needsRead, attempt]);
  return (
    <>
      {snapshot && (
        <div hidden={!visible || needsRead} inert={!visible || needsRead}>
          <PrivateSnapshotGuard
            owner={owner}
            url={url}
            checksum={snapshot.checksum}
            label="listing inquiry choices"
          >
            {snapshot.data.contact && (
              <ExchangeContactChoice
                key={`${listingId}:${snapshot.data.contact.listingVersion}:${snapshot.data.contact.version}`}
                owner={owner}
                contact={snapshot.data.contact}
                intake={!!snapshot.data.intake}
                onSaved={confirmed}
              />
            )}
          </PrivateSnapshotGuard>
        </div>
      )}
      {visible && needsRead && (
        <section className="space-y-3" aria-label="Listing inquiry choices">
          <p role="status">
            {notice || "Checking your listing inquiry choices…"}
          </p>
          {notice && (
            <div className="flex flex-wrap gap-3">
              <button
                className="gc-button gc-button-quiet"
                type="button"
                onClick={() => setAttempt((value) => value + 1)}
              >
                Check inquiry choices again
              </button>
              <Link className="underline" href="/platform/settings/account">
                Review account verification
              </Link>
            </div>
          )}
        </section>
      )}
    </>
  );
}
