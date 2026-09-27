"use client";
import { RegionalTime } from "@/components/platform/regional-presentation";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { currentSocialOwner } from "@/lib/platform/social-client";
import type { AccountSessionList } from "@/lib/platform/account-sessions";
import { AccountConfirmation, useAccountConfirmation } from "./google-account";

async function requestSessions(
  operation: string,
  owner: string,
  credentials: Record<string, string> = {}
) {
  const checkOwner = async () => {
    if ((await currentSocialOwner()) !== owner)
      throw new Error(
        "Your sign-in changed. Reload settings before continuing."
      );
  };
  await checkOwner();
  const response = await fetch("/api/platform/account", {
    method: "POST",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      "X-Expected-Account": owner
    },
    body: JSON.stringify({
      operation,
      ...credentials
    })
  });
  let result;
  try {
    result = await response.json();
  } catch {
    throw new Error(
      "We could not confirm the response. Refresh the sign-in list to check before trying again."
    );
  }
  await checkOwner();
  if (!response.ok) {
    const reference = response.headers.get("X-Account-Request-Id");
    throw new Error(
      `${result.message ?? "Please try again."}${reference ? ` Reference: ${reference}` : ""}`
    );
  }
  return result;
}

export function AccountSessions({
  owner,
  confirmationUnavailable
}: {
  owner: string;
  confirmationUnavailable?: React.ReactNode;
}) {
  const confirmation = useAccountConfirmation("revoke-other-sessions");
  const [listing, setListing] = useState<AccountSessionList | null>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const [password, setPassword] = useState("");
  const [visible, setVisible] = useState(false);
  const [notice, setNotice] = useState("Checking your current account…");
  const busy = useRef(false),
    reading = useRef(false),
    queued = useRef(false);
  const requested = useRef(false),
    active = useRef(false),
    generation = useRef(0);
  const feedback = useRef<HTMLParagraphElement>(null);
  const refresh = useCallback(async () => {
    if (
      !active.current ||
      document.visibilityState === "hidden" ||
      navigator.onLine === false
    )
      return;
    if (reading.current || busy.current) {
      queued.current = true;
      return;
    }
    reading.current = true;
    const request = ++generation.current;
    setPending(true);
    setVisible(false);
    setListing(null);
    setNotice("Checking your current account…");
    try {
      if (!requested.current && (await currentSocialOwner()) !== owner)
        throw new Error(
          "Your sign-in changed. Reload settings before continuing."
        );
      const next = requested.current
        ? ((await requestSessions(
            "list-sessions",
            owner
          )) as AccountSessionList)
        : null;
      if (request !== generation.current || !active.current) return;
      setListing(next);
      setVisible(true);
      setNotice("");
    } catch (error) {
      if (request !== generation.current || !active.current) return;
      setNotice(
        error instanceof Error && !(error instanceof TypeError)
          ? error.message
          : "Your account could not be checked. Reconnect and try again."
      );
    } finally {
      reading.current = false;
      if (request === generation.current) setPending(false);
      if (queued.current && active.current) {
        queued.current = false;
        void refresh();
      }
    }
  }, [owner]);
  const hide = useCallback(() => {
    active.current = false;
    queued.current = false;
    generation.current++;
    setVisible(false);
    setListing(null);
    setNotice(
      "Private sign-in details are concealed. Recheck your current account to continue."
    );
  }, []);
  const resume = useCallback(() => {
    if (document.visibilityState !== "hidden" && navigator.onLine !== false) {
      active.current = true;
      void refresh();
    }
  }, [refresh]);
  useEffect(() => {
    const visibility = () =>
      document.visibilityState === "hidden" ? hide() : resume();
    resume();
    window.addEventListener("blur", hide);
    window.addEventListener("offline", hide);
    window.addEventListener("pagehide", hide);
    window.addEventListener("focus", resume);
    window.addEventListener("online", resume);
    window.addEventListener("pageshow", resume);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      hide();
      window.removeEventListener("blur", hide);
      window.removeEventListener("offline", hide);
      window.removeEventListener("pagehide", hide);
      window.removeEventListener("focus", resume);
      window.removeEventListener("online", resume);
      window.removeEventListener("pageshow", resume);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [hide, resume]);
  useEffect(() => {
    if (visible && message && !pending) feedback.current?.focus();
  }, [visible, message, pending]);
  async function revoke(credentials: Record<string, string>) {
    if (busy.current || reading.current || !active.current || !visible) return;
    busy.current = true;
    requested.current = true;
    setPending(true);
    setFailed(false);
    setMessage("");
    try {
      const result = await requestSessions(
        "revoke-other-sessions",
        owner,
        credentials
      );
      setPassword("");
      setMessage(result.message);
      requested.current = true;
    } catch (error) {
      setFailed(true);
      setMessage(
        error instanceof Error && !(error instanceof TypeError)
          ? error.message
          : "We could not confirm the response. Refresh the sign-in list to check before trying again."
      );
      // Do not automatically repeat an uncertain revocation: newer sign-ins
      // might exist. Refresh only the current list so the owner can review it.
    } finally {
      confirmation.finish();
      busy.current = false;
      setPending(false);
      if (active.current) void refresh();
    }
  }
  return (
    <section
      className="gc-settings"
      aria-labelledby="active-sign-ins-title"
      aria-busy={pending}
    >
      <h2 id="active-sign-ins-title">Active sign-ins</h2>
      <p className="text-gc-muted">
        Review your sign-ins and remove access on other browsers. Browser and
        device labels are approximate; dates show when a sign-in started and
        expires, not recent activity. Location and last-used information are
        unavailable.
      </p>
      {!visible && (
        <div className="space-y-3">
          <p role="status">{notice}</p>
          <button
            type="button"
            className="gc-button gc-button-quiet"
            onClick={resume}
          >
            Recheck current account
          </button>
        </div>
      )}
      {visible && (
        <>
          <button
            type="button"
            className="gc-button gc-button-quiet"
            disabled={pending}
            onClick={() => {
              requested.current = true;
              setMessage("");
              void refresh();
            }}
          >
            {pending
              ? "Please wait…"
              : requested.current || failed
                ? "Refresh sign-in list"
                : "Show active sign-ins"}
          </button>
          {listing && (
            <div>
              <p>
                {listing.otherCount === 0
                  ? "Only this sign-in is active."
                  : `${listing.otherCount} other sign-in${listing.otherCount === 1 ? "" : "s"} active.`}
              </p>
              {listing.otherCount > 20 && (
                <p>
                  Showing this sign-in and the 20 newest others. Signing out
                  others removes all other sign-ins.
                </p>
              )}
              <ul className="space-y-4 py-4" aria-label="Active sign-ins">
                {listing.sessions.map((session, index) => (
                  <li
                    key={`${session.createdAt}-${index}`}
                    className="border-t border-gc-divider pt-3"
                  >
                    <p className="font-semibold">
                      {session.isCurrent ? "This sign-in" : "Other sign-in"} ·{" "}
                      {session.label}
                    </p>
                    <p className="text-sm text-gc-muted">
                      Started{" "}
                      <time dateTime={session.createdAt}>
                        {<RegionalTime value={session.createdAt} />}
                      </time>
                    </p>
                    <p className="text-sm text-gc-muted">
                      Expires{" "}
                      <time dateTime={session.expiresAt}>
                        {<RegionalTime value={session.expiresAt} />}
                      </time>
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {confirmationUnavailable ?? (
            <form
              method="post"
              action="/api/platform/account"
              className="space-y-4"
              aria-describedby="other-sign-ins-help session-feedback"
              onSubmit={(event) => {
                event.preventDefault();
                void revoke(
                  confirmation.credentials(new FormData(event.currentTarget))
                );
              }}
            >
              <p id="other-sign-ins-help" className="text-gc-muted">
                Confirm your account to sign out every other session. This one
                stays signed in. If you think someone knows your password, also{" "}
                <Link
                  className="underline"
                  href="/platform/settings/security/password"
                >
                  change your password
                </Link>
                .
              </p>
              <AccountConfirmation
                value={confirmation}
                id="session-current-password"
                label="Current password for other sign-ins"
                password={{ value: password, onChange: setPassword }}
              />
              <button
                type="submit"
                className="gc-button"
                disabled={pending || !confirmation.ready}
              >
                {pending ? "Please wait…" : "Sign out other sessions"}
              </button>
              <noscript>
                JavaScript is needed to use these sign-in controls.
              </noscript>
            </form>
          )}
          <p
            id="session-feedback"
            ref={feedback}
            tabIndex={-1}
            role={failed ? "alert" : "status"}
            className={`break-words text-sm ${failed ? "text-gc-error" : "text-gc-accent"}`}
          >
            {message}
          </p>
        </>
      )}
    </section>
  );
}
