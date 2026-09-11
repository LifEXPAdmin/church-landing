"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import { AccountForm } from "./account-form";
import { GoogleButton } from "./google-account";
import {
  accountEntryHref,
  accountReasons,
  type AccountReason
} from "@/lib/platform/account-entry";
export function AccountAccess({
  initialView,
  passwordChanged = false,
  reactivated = false,
  emailChanged = false,
  returnTo = "/platform",
  reason,
  googleAvailable = false,
  recoveryAvailable = false,
  googleNotice
}: {
  initialView: "login" | "register";
  passwordChanged?: boolean;
  reactivated?: boolean;
  emailChanged?: boolean;
  returnTo?: string;
  reason?: AccountReason;
  googleAvailable?: boolean;
  recoveryAvailable?: boolean;
  googleNotice?: "retry" | "link-required" | "unavailable";
}) {
  const [view, setView] = useState(initialView);
  const [email, setEmail] = useState("");
  const [registered, setRegistered] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  return (
    <div className="mx-auto max-w-xl rounded-xl border border-gc-divider bg-gc-surface p-5 text-gc-text sm:p-8">
      <h1
        ref={heading}
        tabIndex={-1}
        className="text-4xl text-gc-text sm:text-5xl"
      >
        Your Godschurches account
      </h1>
      <p className="my-5 text-gc-muted">
        A place to grow in faith and connect with others. Your account email
        stays private. Create your account or sign in to pick up where you left
        off.
      </p>
      {reason && (
        <p className="mb-5 text-gc-accent">
          {accountReasons[reason]} You’ll return to your destination after
          signing in.
        </p>
      )}
      {registered && (
        <p
          role="status"
          className="mb-6 rounded-xl border border-gc-divider p-4 text-gc-accent"
        >
          Continue by signing in with your email and password. Registration
          never changes an existing account or resets its password.
          {recoveryAvailable &&
            " If this is a new account, a verification email will be sent. Check your inbox and spam folder. You can sign in while you wait."}
        </p>
      )}
      {passwordChanged && (
        <p role="status" className="mb-6 text-gc-accent">
          Your password was changed and all devices were signed out. Sign in
          with your new password.
        </p>
      )}
      {reactivated && (
        <p role="status" className="mb-6 text-gc-accent">
          Your account is active. Sign in to continue. Old sign-ins and sharing
          have not been restored.
        </p>
      )}
      {emailChanged && (
        <p role="status" className="mb-6 text-gc-accent">
          Your sign-in email changed and all devices were signed out. Use your
          new email and password, or your linked Google account, to sign in.
        </p>
      )}
      {googleNotice && (
        <p role="status" className="mb-5 text-gc-muted">
          {googleNotice === "link-required"
            ? "Sign in to your existing Godschurches account first, then connect Google in Account settings. Google has not been linked to that account."
            : googleNotice === "unavailable"
              ? "Google sign-in is not available yet. You can use email sign-in or keep browsing."
              : "Google sign-in was canceled or could not be completed. Try again, or use email sign-in. If an app browser blocks Google, open this page in your regular browser."}
        </p>
      )}
      {googleAvailable && (
        <div className="mb-6 space-y-3">
          <GoogleButton body={{ operation: "start", next: returnTo }} />
          <p className="text-sm text-gc-muted">
            Or continue with your email below.
          </p>
        </div>
      )}
      <AccountForm
        key={view}
        operation={view}
        initialEmail={email}
        returnTo={returnTo}
        onRegistered={(value) => {
          // Short-lived page state only. No identifiers in URLs, history state, or app storage.
          setEmail(value);
          setRegistered(true);
          setView("login");
          window.history.replaceState(
            null,
            "",
            accountEntryHref("login", returnTo, reason)
          );
          requestAnimationFrame(() => heading.current?.focus());
        }}
      />
      <p className="mt-6">
        <Link
          href={accountEntryHref(
            view === "login" ? "signup" : "login",
            returnTo,
            reason
          )}
          className="inline-flex min-h-11 items-center text-gc-accent underline"
        >
          {view === "login"
            ? "New here? Create an account"
            : "Already have an account? Sign in"}
        </Link>
      </p>
      <p className="mt-3 text-sm text-gc-muted">
        {recoveryAvailable
          ? "Use Forgot password? to request a reset link for your existing account. Registering again will not recover it."
          : "Password recovery emails are not available yet. Older accounts without passwords require verified ownership recovery; registering again will not give access to them."}
      </p>
      <div className="mt-4 flex flex-wrap gap-x-6 text-sm text-gc-accent">
        <Link
          href="/platform/account/reactivate"
          className="inline-flex min-h-11 items-center underline"
        >
          Reactivate an account
        </Link>
        <Link
          href="/platform/account/recover"
          className="inline-flex min-h-11 items-center underline"
        >
          Forgot password?
        </Link>
        <Link
          href="/platform"
          className="inline-flex min-h-11 items-center underline"
        >
          Browse the platform
        </Link>
      </div>
    </div>
  );
}
