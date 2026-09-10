"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { accountInputClass } from "./account-form";
import { AccountConfirmation, useAccountConfirmation } from "./google-account";

export function AccountEmailChange({
  available,
  confirm = false,
  signedIn = true
}: {
  available: boolean;
  confirm?: boolean;
  signedIn?: boolean;
}) {
  const confirmation = useAccountConfirmation(
    confirm ? "confirm-email-change" : "request-email-change"
  );
  const [token, setToken] = useState<string | null>(null);
  const [ready, setReady] = useState(!confirm);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const busy = useRef(false);
  const feedback = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (!confirm) return;
    const params = new URLSearchParams(window.location.hash.slice(1));
    const value = params.get("token");
    if (
      value &&
      /^[A-Za-z0-9_-]{43}$/.test(value) &&
      params.get("purpose") === "CHANGE_EMAIL"
    )
      setToken(value);
    window.history.replaceState(null, "", window.location.pathname);
    setReady(true);
  }, [confirm]);
  const prefix = confirm ? "confirm-email-change" : "request-email-change";
  const button = confirm
    ? "Confirm sign-in email change"
    : "Send email-change confirmation";
  return (
    <section
      className="gc-settings"
      aria-labelledby={`${prefix}-title`}
      aria-busy={pending}
    >
      <h2 id={`${prefix}-title`}>
        {confirm ? "Confirm your new sign-in email" : "Change sign-in email"}
      </h2>
      <p id={`${prefix}-help`} className="text-gc-muted">
        Your existing sign-in email keeps working until you confirm the new
        address. Confirmation signs out every device. Your password, public
        profile and church directory contacts stay the same.
      </p>
      {!available ? (
        <p role="status">
          Sign-in email changes are not available until email delivery is ready.
          Your existing sign-in email is unchanged.
        </p>
      ) : !ready ? (
        <p role="status">Reading your confirmation link…</p>
      ) : confirm && !signedIn ? (
        <p>
          Sign in to the account that requested this change in this browser,
          then reopen the link from your email.{" "}
          <Link className="text-gc-accent underline" href="/platform/login">
            Sign in
          </Link>
        </p>
      ) : confirm && !token && confirmation.loading ? (
        <p role="status">Checking your email confirmation…</p>
      ) : confirm && !token && !confirmation.options?.emailConfirmationReady ? (
        <p>
          Open the confirmation link sent to your new address. You can request a
          fresh link in{" "}
          <Link className="text-gc-accent underline" href="/platform/settings">
            Account settings
          </Link>
          .
        </p>
      ) : (
        <form
          method="post"
          action="/api/platform/account"
          className="space-y-4"
          aria-describedby={`${prefix}-help ${prefix}-feedback`}
          onSubmit={async (event) => {
            event.preventDefault();
            if (busy.current) return;
            busy.current = true;
            const form = event.currentTarget;
            const values = new FormData(form);
            setPending(true);
            setFailed(false);
            setMessage("");
            try {
              const response = await fetch("/api/platform/account", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  operation: prefix,
                  ...confirmation.credentials(values),
                  ...(confirm
                    ? token
                      ? { token }
                      : {}
                    : { newEmail: values.get("newEmail") })
                })
              });
              const result = await response.json();
              if (response.ok) {
                form.reset();
                if (confirm) setToken(null);
                if (
                  typeof result.redirect === "string" &&
                  /^\/platform(?:[/?]|$)/.test(result.redirect)
                ) {
                  window.location.replace(result.redirect);
                  return;
                }
              }
              setFailed(!response.ok);
              const reference = response.headers.get("X-Account-Request-Id");
              setMessage(
                `${result.message ?? "Please try again."}${!response.ok && reference ? ` Reference: ${reference}` : ""}`
              );
            } catch {
              setFailed(true);
              setMessage(
                "We could not confirm the response. Check your inbox or try signing in with your existing and new email before requesting another change."
              );
            } finally {
              confirmation.finish();
              busy.current = false;
              setPending(false);
              requestAnimationFrame(() => feedback.current?.focus());
            }
          }}
        >
          {!confirm && (
            <div>
              <label htmlFor="new-sign-in-email">New sign-in email</label>
              <input
                id="new-sign-in-email"
                type="email"
                name="newEmail"
                autoComplete="email"
                autoCapitalize="none"
                spellCheck={false}
                required
                maxLength={254}
                className={accountInputClass}
              />
              <p className="mt-2 text-sm text-gc-muted">
                Use an address you control. A new request replaces earlier
                confirmation links. Links expire in 30 minutes.
              </p>
            </div>
          )}
          <AccountConfirmation
            value={confirmation}
            emailToken={token}
            id={`${prefix}-password`}
            label="Current password for sign-in email"
          />
          {confirm && (
            <p className="text-gc-muted">
              Confirm the same account that requested this change. Opening this
              page does not change your account.
            </p>
          )}
          <button
            type="submit"
            disabled={pending || !confirmation.ready}
            className="gc-button"
          >
            {pending ? "Please wait…" : button}
          </button>
          <noscript>
            JavaScript is needed to change your sign-in email.
          </noscript>
        </form>
      )}
      <p
        ref={feedback}
        id={`${prefix}-feedback`}
        role={failed ? "alert" : "status"}
        tabIndex={-1}
        className={`break-words text-sm ${failed ? "text-gc-error" : "text-gc-accent"}`}
      >
        {message}
      </p>
    </section>
  );
}
