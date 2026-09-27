"use client";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { safeAccountReturn } from "@/lib/platform/account-entry";
import { ParticipationChoice } from "./participation-choice";
import { AccountConfirmation, useAccountConfirmation } from "./google-account";

import {
  CredentialPrivacyNotice,
  useCredentialPrivacy
} from "./account-credential-privacy";

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
  owner,
  invitation,
  initialEmail = "",
  returnTo = "/platform",
  onRegistered
}: {
  operation: Operation;
  owner?: string;
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
  const privacy = useCredentialPrivacy(owner, change);
  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  useEffect(() => {
    if (change && privacy.visible && message && !pending)
      feedback.current?.focus();
  }, [change, privacy.visible, message, pending]);
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
  if (change && !privacy.visible)
    return <CredentialPrivacyNotice value={privacy} />;
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
        const formValues = new FormData(event.currentTarget);
        const values = Object.fromEntries(formValues);
        const credentials = change ? confirmation.credentials(formValues) : {};
        let redirect: unknown;
        setPending(true);
        setFailed(false);
        setMessage("");
        try {
          if (change) await privacy.begin();
          const response = await fetch("/api/platform/account", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(change ? { "X-Expected-Account": owner ?? "" } : {})
            },
            body: JSON.stringify({
              ...values,
              ...credentials,
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
          if (response.ok && change) {
            setCurrentPassword("");
            setPassword("");
            setConfirmPassword("");
            redirect = result.redirect;
            return;
          }
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
          if (!change) requestAnimationFrame(() => feedback.current?.focus());
        } catch {
          setFailed(true);
          setMessage(
            change
              ? "We could not confirm the response. Try signing in with your new password before submitting another change. This request will not be repeated automatically."
              : "We could not confirm the response. If you were creating an account, try signing in before submitting again. Otherwise check your connection and try again."
          );
          if (!change) requestAnimationFrame(() => feedback.current?.focus());
        } finally {
          if (change) {
            confirmation.finish();
            privacy.finish(redirect);
          }
          busy.current = false;
          setPending(false);
        }
      }}
    >
      <h2 className="text-3xl text-gc-text">
        {registration && invitation ? "Create account and connect" : title}
      </h2>
      {registration && invitation && (
        <p>
          You are choosing to become friends with {invitation.name} after email
          verification and adult eligibility. Either of you can remove the
          connection.{" "}
          <a className="underline" href="/platform/signup">
            Join without connecting
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
          password={{ value: currentPassword, onChange: setCurrentPassword }}
        />
      )}
      {!request && (
        <PasswordField
          id={id("password")}
          name="password"
          label={change ? "New password" : "Password"}
          value={change ? password : undefined}
          onChange={change ? setPassword : undefined}
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
            value={change ? confirmPassword : undefined}
            onChange={change ? setConfirmPassword : undefined}
            autocomplete="new-password"
          />
        </>
      )}
      {registration && <ParticipationChoice id={id("role")} />}
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
