"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { socialRequest } from "@/lib/platform/social-client";
import { claimStatusLabels } from "@/lib/platform/church-claim-data";
import type { ChurchToolsView } from "@/lib/platform/church-tools";
import type { ChurchSummary } from "@/lib/platform/portal-types";
import { ChurchWelcome } from "./church-welcome";
export function ChurchTools({
  churchId,
  welcome
}: {
  churchId: string;
  welcome?: ChurchSummary;
}) {
  const [data, setData] = useState<ChurchToolsView | null>(null),
    [message, setMessage] = useState("");
  const generation = useRef(0);
  const load = useCallback(async () => {
    const turn = ++generation.current;
    try {
      const result = await socialRequest<ChurchToolsView>(
        `/api/platform/church-tools?churchId=${encodeURIComponent(churchId)}`
      );
      if (turn !== generation.current) return;
      setData(result.data);
      setMessage("");
    } catch {
      if (turn !== generation.current) return;
      setData(null);
      setMessage(
        "Your church tools could not be checked. Reconnect and try again."
      );
    }
  }, [churchId]);
  const invalidate = useCallback(() => {
    generation.current++;
  }, []);
  useEffect(() => {
    const hide = () => {
      generation.current++;
      setData(null);
    };
    const refresh = () => {
      if (document.visibilityState !== "hidden") void load();
    };
    const visibility = () =>
      document.visibilityState === "hidden" ? hide() : refresh();
    refresh();
    window.addEventListener("blur", hide);
    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
    window.addEventListener("social-relationships-changed", refresh);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      invalidate();
      window.removeEventListener("blur", hide);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("online", refresh);
      window.removeEventListener("social-relationships-changed", refresh);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [load, invalidate]);
  if (!data?.ownerId && !message && !(data && welcome)) return null;
  const root = `/platform/churches/${encodeURIComponent(churchId)}`,
    caps = data?.capabilities ?? [];
  const structure = caps.includes("MANAGE_STRUCTURE"),
    access = caps.includes("MANAGE_CHURCH_ACCESS"),
    profile = caps.includes("MANAGE_CHURCH_PROFILE");
  const link = "gc-button gc-button-quiet";
  return (
    <section
      id="church-tools"
      className={`gc-church-tools space-y-3 ${welcome ? "" : "rounded-xl border border-gc-divider p-4"}`}
      aria-label="Your church tools"
    >
      {welcome && data && <ChurchWelcome church={welcome} data={data} />}
      {message && (
        <>
          <p role="status">{message}</p>
          <button type="button" className={link} onClick={() => void load()}>
            Check church tools
          </button>
        </>
      )}
      {data?.ownerId && (
        <>
          {caps.length > 0 ? (
            <details open>
              <summary className="min-h-11 cursor-pointer py-2 text-xl font-semibold">
                Manage church
              </summary>
              <nav className="flex flex-wrap gap-3" aria-label="Manage church">
                <Link className={link} href={`${root}/responsibilities`}>
                  My permissions
                </Link>
                {profile && data.profileClaimId && (
                  <Link
                    className={link}
                    href={`/platform/church-claims/${encodeURIComponent(data.profileClaimId)}#church-profile`}
                  >
                    Profile
                  </Link>
                )}
                {profile && (
                  <Link className={link} href={`${root}#church-photos`}>
                    Logo and cover
                  </Link>
                )}
                {structure && (
                  <>
                    <Link className={link} href={`${root}/structure`}>
                      Team / organization
                    </Link>
                    <Link className={link} href={`${root}/structure/roles`}>
                      Roles
                    </Link>
                    <Link className={link} href={`${root}/structure/assign`}>
                      Privileges
                    </Link>
                    <Link className={link} href={`${root}/structure/history`}>
                      Chart history and undo
                    </Link>
                  </>
                )}
                {access && (
                  <Link className={link} href={`${root}/access`}>
                    Church access
                  </Link>
                )}
                {caps.includes("REVIEW_CONNECTIONS") && (
                  <Link className={link} href={`${root}/review`}>
                    Review member requests
                  </Link>
                )}
                {(caps.includes("EDIT_CHURCH_CALENDAR") ||
                  caps.includes("PUBLISH_CHURCH_EVENTS")) && (
                  <Link className={link} href={`${root}/calendar`}>
                    Calendar and events
                  </Link>
                )}
              </nav>
              {structure && (
                <p className="text-sm text-gc-muted">
                  Start with unassigned roles or a chart template. Choosing a
                  title or template never grants permissions; assignments
                  require a separate privileges review.
                </p>
              )}
              {profile && !data.profileClaimId && (
                <p className="text-sm text-gc-muted">
                  Your photo permission is active. Public text changes use an
                  activated representative setup.{" "}
                  <Link className="underline" href="/platform/church-claims">
                    Open your church setup
                  </Link>{" "}
                  to review the available request.
                </p>
              )}
            </details>
          ) : data.member ? (
            <>
              <h3 className="text-lg font-semibold">Your church connection</h3>
              <p className="text-sm text-gc-muted">
                Your membership provides the shared church space. Management
                tools require separately granted permissions.
              </p>
              <nav
                className="flex flex-wrap gap-3"
                aria-label="Member church tools"
              >
                <Link className={link} href={`${root}/overview`}>
                  Church overview
                </Link>
                <Link className={link} href={`${root}/structure`}>
                  Team / organization
                </Link>
                <Link className={link} href={`${root}/responsibilities`}>
                  My responsibilities
                </Link>
              </nav>
            </>
          ) : (
            <h3 className="text-lg font-semibold">Your church setup</h3>
          )}
          {data.contributor && (
            <p className="text-sm text-gc-muted">
              You contributed information to this community listing. Adding a
              listing does not appoint a church representative or grant
              management access.
            </p>
          )}
          {data.claim && (
            <div className="space-y-2">
              <p>
                Representative request:{" "}
                <strong>{claimStatusLabels[data.claim.status]}</strong>
                {data.claim.status === "APPROVED" && !data.claim.activated
                  ? " · Activation still required"
                  : ""}
              </p>
              <Link
                className={link}
                href={`/platform/church-claims/${encodeURIComponent(data.claim.id)}`}
              >
                {data.claim.status === "APPROVED" && !data.claim.activated
                  ? "Review and activate approved access"
                  : data.claim.status === "NEEDS_INFORMATION"
                    ? "Provide the requested information"
                    : "Open your representative request"}
              </Link>
              {data.claim.activated && !caps.length && (
                <p className="text-sm text-gc-muted">
                  This request does not currently provide management access.
                  Check your membership and the request&apos;s current
                  permissions.
                </p>
              )}
            </div>
          )}
          {!data.member && !data.claim && (
            <Link
              className={link}
              href={`/platform/church-claims/new?churchId=${encodeURIComponent(churchId)}`}
            >
              Prepare representative request
            </Link>
          )}
          {!data.reviewEnabled && !data.claim?.activated && (
            <p className="text-sm text-gc-muted">
              Representative review is not accepting submissions yet. You can
              save a private setup draft while review is prepared. Review and
              explicit activation must finish before management access is
              available.
            </p>
          )}
        </>
      )}
    </section>
  );
}
