"use client";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { safeAccountReturn } from "@/lib/platform/account-entry";
import { AccountConfirmation, useAccountConfirmation } from "./google-account";

type Operation =
  | "register"
  | "login"
  | "change-password"
  | "request-reset"
  | "request-verification";
import { PasswordField, accountInputClass } from "./account-fields";
export { PasswordField, accountInputClass } from "./account-fields";
export function AccountForm({
  operation,
  invitation,
  initialEmail = "",
  returnTo = "/platform",
  onRegistered
}: {
  operation: Operation;
  invitation?: { code: string; name: string };
  initialEmail?: string;
  returnTo?: string;
  onRegistered?: (email: string) => void;
}) {
  const confirmation = useAccountConfirmation("change-password");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const busy = useRef(false);
  const feedback = useRef<HTMLParagraphElement>(null);
  const registration = operation === "register";
  const change = operation === "change-password";
  const request = operation.startsWith("request-");
  const id = (name: string) => `account-${operation}-${name}`;
  const title = {
    register: invitation
      ? `Create account and connect with ${invitation.name}`
      : "Create account",
    login: "Sign in",
    "change-password":
      confirmation.methods && !confirmation.methods.password
        ? "Add password"
        : "Change password",
    "request-reset": "Request a password reset",
    "request-verification": "Verify your email"
  }[operation];
  return (
    <form
      id={id("form")}
      method="post"
      action="/api/platform/account"
      autoComplete="on"
      className="space-y-5"
      aria-busy={pending}
      aria-describedby={id("feedback")}
      onInvalidCapture={() => {
        setFailed(true);
        setMessage("Please check the highlighted field before continuing.");
      }}
      onSubmit={async (event) => {
        event.preventDefault();
        if (busy.current) return;
        busy.current = true;
        const values = Object.fromEntries(new FormData(event.currentTarget));
        setPending(true);
        setFailed(false);
        setMessage("");
        try {
          const response = await fetch("/api/platform/account", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              ...values,
              ...(change
                ? confirmation.credentials(new FormData(event.currentTarget))
                : {}),
              operation,
              ...(registration && invitation
                ? { friendInvitation: invitation.code, friendConsent: true }
                : {}),
              ...(operation === "login"
                ? { next: safeAccountReturn(returnTo) }
                : {})
            })
          });
          const result = await response.json();
          if (response.ok && registration && onRegistered) {
            onRegistered(String(values.email ?? ""));
            return;
          }
          if (
            response.ok &&
            typeof result.redirect === "string" &&
            /^\/platform(?:[/?]|$)/.test(result.redirect)
          ) {
            // Full navigation clears stale client data. Do not reset credential fields first.
            window.location.replace(result.redirect);
            return;
          }
          setFailed(!response.ok);
          const reference = response.headers.get("X-Account-Request-Id");
          setMessage(
            `${result.message ?? "Please try again."}${!response.ok && reference ? ` Reference: ${reference}` : ""}`
          );
          requestAnimationFrame(() => feedback.current?.focus());
        } catch {
          setFailed(true);
          setMessage(
            "We could not confirm the response. If you were creating an account, try signing in before submitting again. Otherwise check your connection and try again."
          );
          requestAnimationFrame(() => feedback.current?.focus());
        } finally {
          if (change) confirmation.finish();
          busy.current = false;
          setPending(false);
        }
      }}
    >
      <h2 className="text-3xl text-gc-text">{title}</h2>
      {registration && invitation && (
        <p>
          You are choosing to become friends with {invitation.name} after email
          verification and adult eligibility. Either of you can remove the
          connection.{" "}
          <a className="underline" href="/platform/signup">
            Join without connecting instead
          </a>
          .
        </p>
      )}
      {registration && (
        <>
          <div>
            <label htmlFor={id("name")}>Name</label>
            <input
              id={id("name")}
              name="name"
              autoComplete="name"
              required
              minLength={2}
              maxLength={100}
              className={accountInputClass}
            />
          </div>
          <div>
            <label htmlFor={id("handle")}>Public username</label>
            <input
              id={id("handle")}
              name="username"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              required
              pattern="[a-zA-Z0-9_]{3,24}"
              minLength={3}
              maxLength={24}
              aria-describedby={id("handle-help")}
              className={accountInputClass}
            />
            <p id={id("handle-help")} className="mt-2 text-sm text-gc-muted">
              3 to 24 letters, numbers, or underscores. This is public. Use your
              email, not this username, to sign in.
            </p>
          </div>
        </>
      )}
      {!change && (
        <div>
          <label htmlFor={id("email")}>Email</label>
          <input
            id={id("email")}
            name="email"
            type="email"
            inputMode="email"
            autoComplete={request ? "email" : "username"}
            autoCapitalize="none"
            spellCheck={false}
            defaultValue={initialEmail}
            maxLength={254}
            required
            className={accountInputClass}
          />
        </div>
      )}
      {change && (
        <AccountConfirmation
          value={confirmation}
          id={id("current-password")}
          label="Current password"
        />
      )}
      {!request && (
        <PasswordField
          id={id("password")}
          name="password"
          label={change ? "New password" : "Password"}
          autocomplete={
            registration || change ? "new-password" : "current-password"
          }
        />
      )}
      {(registration || change) && (
        <>
          <p className="text-sm text-gc-muted">
            Use 8 to 128 characters. You can paste a password or use one your
            password manager generates.
          </p>
          <PasswordField
            id={id("confirmation")}
            name="confirmPassword"
            label="Confirm password"
            autocomplete="new-password"
          />
        </>
      )}
      {registration && (
        <div>
          <label htmlFor={id("role")}>How would you like to participate?</label>
          <select
            id={id("role")}
            name="role"
            className={accountInputClass}
            defaultValue="BELIEVER"
          >
            <option value="BELIEVER">Believer</option>
            <option value="CHURCH">Church</option>
            <option value="CREATOR">Creator</option>
            <option value="BUSINESS">Business</option>
            <option value="BUILDER">Builder</option>
          </select>
          <p className="mt-2 text-sm text-gc-muted">
            This describes your interests. It does not grant church or
            administrative access.
          </p>
        </div>
      )}
      {change && (
        <p className="text-sm text-gc-muted">
          Changing your password signs out every device, including this one.
          Sign in again with your new password.
        </p>
      )}
      {operation === "login" && (
        <p className="text-sm text-gc-muted">
          On your own device, your sign-in can last up to 30 days. Sign out when
          using a shared device.
        </p>
      )}
      <p
        id={id("feedback")}
        ref={feedback}
        tabIndex={-1}
        role={failed ? "alert" : "status"}
        className={`break-words text-sm ${failed ? "text-gc-error" : "text-gc-accent"}`}
      >
        {message}
      </p>
      <Button
        type="submit"
        disabled={pending || (change && !confirmation.ready)}
        className="min-h-12 w-full rounded-full"
      >
        {pending ? "Please wait..." : title}
      </Button>
      <noscript>
        <p>
          JavaScript is needed to securely submit this form. Please enable it
          and reload.
        </p>
      </noscript>
    </form>
  );
}
