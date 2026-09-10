"use client";
import { useRef, useState } from "react";
import type { AccountSessionList } from "@/lib/platform/account-sessions";
import { AccountConfirmation, useAccountConfirmation } from "./google-account";

async function requestSessions(
  operation: string,
  credentials: Record<string, string> = {}
) {
  const response = await fetch("/api/platform/account", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
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
  if (!response.ok) {
    const reference = response.headers.get("X-Account-Request-Id");
    throw new Error(
      `${result.message ?? "Please try again."}${reference ? ` Reference: ${reference}` : ""}`
    );
  }
  return result;
}

export function AccountSessions() {
  const confirmation = useAccountConfirmation("revoke-other-sessions");
  const [listing, setListing] = useState<AccountSessionList | null>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const busy = useRef(false);
  const feedback = useRef<HTMLParagraphElement>(null);
  async function run(action: () => Promise<string>) {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setFailed(false);
    setMessage("");
    try {
      setMessage(await action());
    } catch (error) {
      setListing(null);
      setFailed(true);
      setMessage(
        error instanceof Error && !(error instanceof TypeError)
          ? error.message
          : "We could not confirm the response. Refresh the sign-in list to check before trying again."
      );
    } finally {
      busy.current = false;
      setPending(false);
      requestAnimationFrame(() => feedback.current?.focus());
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
        expires, not recent activity.
      </p>
      <button
        type="button"
        className="gc-button gc-button-quiet"
        disabled={pending}
        onClick={() =>
          run(async () => {
            setListing(await requestSessions("list-sessions"));
            return "Your active sign-ins are shown below.";
          })
        }
      >
        {pending
          ? "Please wait…"
          : listing
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
              Showing this sign-in and the 20 newest others. Signing out others
              removes all other sign-ins.
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
                    {new Date(session.createdAt).toLocaleString()}
                  </time>
                </p>
                <p className="text-sm text-gc-muted">
                  Expires{" "}
                  <time dateTime={session.expiresAt}>
                    {new Date(session.expiresAt).toLocaleString()}
                  </time>
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}
      <form
        method="post"
        action="/api/platform/account"
        className="space-y-4"
        aria-describedby="other-sign-ins-help session-feedback"
        onSubmit={(event) => {
          event.preventDefault();
          const form = event.currentTarget;
          const credentials = confirmation.credentials(new FormData(form));
          void run(async () => {
            let result;
            try {
              result = await requestSessions(
                "revoke-other-sessions",
                credentials
              );
            } finally {
              confirmation.finish();
            }
            form.reset();
            setListing(null);
            return result.message;
          });
        }}
      >
        <p id="other-sign-ins-help" className="text-gc-muted">
          Confirm your account to sign out every other session. This one stays
          signed in. If you think someone knows your password, change it below
          as well.
        </p>
        <AccountConfirmation
          value={confirmation}
          id="session-current-password"
          label="Current password for other sign-ins"
        />
        <button
          type="submit"
          className="gc-button"
          disabled={pending || !confirmation.ready}
        >
          {pending ? "Please wait…" : "Sign out other sessions"}
        </button>
        <noscript>JavaScript is needed to use these sign-in controls.</noscript>
      </form>
      <p
        id="session-feedback"
        ref={feedback}
        tabIndex={-1}
        role={failed ? "alert" : "status"}
        className={`break-words text-sm ${failed ? "text-gc-error" : "text-gc-accent"}`}
      >
        {message}
      </p>
    </section>
  );
}
