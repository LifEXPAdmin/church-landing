"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import { accountInputClass, PasswordField } from "./account-form";

export function AccountLifecycle({
  reactivate = false
}: {
  reactivate?: boolean;
}) {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const busy = useRef(false);
  const feedback = useRef<HTMLParagraphElement>(null);
  const action = reactivate ? "Reactivate account" : "Deactivate account";
  const prefix = reactivate ? "reactivate" : "deactivate";
  return (
    <section
      className="gc-settings"
      aria-labelledby={`${prefix}-title`}
      aria-busy={pending}
    >
      <h2 id={`${prefix}-title`}>{action}</h2>
      <div id={`${prefix}-help`} className="space-y-3 text-gc-muted">
        {reactivate ? (
          <>
            <p>
              Use your existing account email and password. Reactivation makes
              your profile, posts, comments and community connections visible
              again. You will then sign in separately.
            </p>
            <p>
              Old sign-ins and directory or coordinator sharing stay off. An
              account suspended by an administrator cannot be restored here.
            </p>
          </>
        ) : (
          <>
            <p>
              Take a break from Godschurches. Your profile, posts, comments,
              likes and follows will be hidden on future page loads. All devices
              will be signed out, and directory details and support coordinator
              sharing will be removed.
            </p>
            <p>
              Your account, community content, church connections and support
              records remain stored. This does not delete your account or erase
              content someone already saw or saved. Authorized support staff can
              still access existing case records.
            </p>
            <p>
              You can return using your existing email and password. Download
              your data above first if you want a copy. Hand off any church,
              contact, operator or support duties before deactivating.
            </p>
          </>
        )}
      </div>
      <form
        className="space-y-4"
        method="post"
        action="/api/platform/account"
        aria-describedby={`${prefix}-help ${prefix}-feedback`}
        onSubmit={async (event) => {
          event.preventDefault();
          if (busy.current) return;
          busy.current = true;
          const form = event.currentTarget;
          const values = new FormData(form);
          setPending(true);
          setMessage("");
          try {
            const response = await fetch("/api/platform/account", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                operation: `${prefix}-account`,
                confirmed: values.get("confirmed") === "on",
                ...(reactivate
                  ? {
                      email: values.get("email"),
                      password: values.get("password")
                    }
                  : { currentPassword: values.get("currentPassword") })
              })
            });
            const result = await response.json();
            if (
              response.ok &&
              typeof result.redirect === "string" &&
              /^\/platform(?:[/?]|$)/.test(result.redirect)
            ) {
              form.reset();
              window.location.replace(result.redirect);
              return;
            }
            const reference = response.headers.get("X-Account-Request-Id");
            setMessage(
              `${result.message ?? "Please try again."}${reference ? ` Reference: ${reference}` : ""}`
            );
          } catch {
            setMessage(
              "We could not confirm the response. Refresh the page to check your account status before trying again."
            );
          } finally {
            busy.current = false;
            setPending(false);
            requestAnimationFrame(() => feedback.current?.focus());
          }
        }}
      >
        {reactivate && (
          <div>
            <label htmlFor="reactivate-email">Account email</label>
            <input
              id="reactivate-email"
              name="email"
              type="email"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              required
              maxLength={254}
              className={accountInputClass}
            />
          </div>
        )}
        <PasswordField
          id={`${prefix}-password`}
          name={reactivate ? "password" : "currentPassword"}
          label={
            reactivate
              ? "Existing password"
              : "Current password for deactivation"
          }
          autocomplete="current-password"
        />
        <label className="flex min-h-11 items-start gap-3">
          <input
            className="mt-1 h-5 w-5 shrink-0"
            name="confirmed"
            type="checkbox"
            required
          />
          <span>
            {reactivate
              ? "I want to reactivate my account and make my community content visible again."
              : "I understand that this hides my account, ends access and sharing, and keeps my records stored."}
          </span>
        </label>
        <button type="submit" className="gc-button" disabled={pending}>
          {pending ? "Please wait…" : action}
        </button>
        <noscript>JavaScript is needed to use this account control.</noscript>
      </form>
      <p
        ref={feedback}
        id={`${prefix}-feedback`}
        role="alert"
        tabIndex={-1}
        className="break-words text-sm text-gc-error"
      >
        {message}
      </p>
      {reactivate && (
        <Link
          className="inline-flex min-h-11 items-center text-gc-accent underline"
          href="/platform/login"
        >
          Back to sign in
        </Link>
      )}
    </section>
  );
}
