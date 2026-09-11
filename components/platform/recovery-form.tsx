"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  readAccountLink,
  type RecoveryPurpose
} from "@/lib/platform/account-link";
import { AccountForm } from "./account-form";
import { Button } from "@/components/ui/button";

export function RecoveryForm({
  available,
  purpose = "RESET_PASSWORD",
  initialEmail = "",
  verified = false,
  signedIn = false
}: {
  available: boolean;
  purpose?: RecoveryPurpose;
  initialEmail?: string;
  verified?: boolean;
  signedIn?: boolean;
}) {
  const busy = useRef(false);
  const linkVersion = useRef(0);
  const [grant, setGrant] = useState<{ token: string; purpose: string } | null>(
    null
  );
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const [complete, setComplete] = useState(false);
  useEffect(() => {
    const read = () => {
      if (window.location.hash) {
        linkVersion.current++;
        const incoming = readAccountLink(window.location.hash, purpose);
        setGrant(incoming);
        setComplete(false);
        setMessage(
          incoming ? "" : "This link is incomplete. Request a new one below."
        );
        // Keep Next's navigation state; never put grants in storage or server URLs.
        window.history.replaceState(
          window.history.state,
          "",
          window.location.pathname + window.location.search
        );
      }
      setReady(true);
    };
    read();
    window.addEventListener("hashchange", read);
    window.addEventListener("popstate", read);
    return () => {
      window.removeEventListener("hashchange", read);
      window.removeEventListener("popstate", read);
    };
  }, [purpose]);
  const verification = (grant?.purpose ?? purpose) === "VERIFY_EMAIL";
  const returnHref =
    signedIn && verification ? "/platform/settings" : "/platform/login";
  if (!ready) return <p role="status">Loading account options...</p>;
  if (!available)
    return (
      <p role="status">
        Email recovery and verification are not available yet. Your account and
        posts are unchanged. Existing password accounts can still sign in.
      </p>
    );
  if (!grant)
    return (
      <div className="space-y-5">
        <h1 className="text-4xl">
          {verification ? "Email verification" : "Forgot password?"}
        </h1>
        <p role="status">{message}</p>
        {verification && verified ? (
          <p>Your account email is already verified.</p>
        ) : (
          <>
            <p className="text-gc-muted">
              {verification
                ? "Confirm that this email belongs to you. Verification lets you use church setup and other account features."
                : "Enter your account email and we’ll send a link to choose a new password."}
            </p>
            <AccountForm
              key={purpose}
              operation={
                verification ? "request-verification" : "request-reset"
              }
              initialEmail={initialEmail}
            />
            <p className="text-sm text-gc-muted">
              Check your inbox and spam or junk folder. If the message is in
              Spam, mark it as not spam. If a link does not open, copy the
              complete link into your browser. Links expire after 30 minutes.
            </p>
          </>
        )}
      </div>
    );
  return (
    <form
      className="space-y-5"
      onSubmit={async (event) => {
        event.preventDefault();
        if (busy.current) return;
        busy.current = true;
        const version = linkVersion.current;
        setPending(true);
        setMessage("");
        const form = event.currentTarget;
        try {
          const result = await fetch("/api/platform/account", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              ...Object.fromEntries(new FormData(form)),
              token: grant.token,
              operation:
                grant.purpose === "RESET_PASSWORD"
                  ? "consume-reset"
                  : "consume-verification"
            })
          });
          const body = await result.json();
          if (version !== linkVersion.current) return;
          setMessage(body.message);
          if (result.ok) {
            form.reset();
            setComplete(true);
            if (
              typeof body.redirect === "string" &&
              /^\/platform(?:[/?]|$)/.test(body.redirect)
            ) {
              window.location.replace(body.redirect);
            }
          }
        } catch {
          if (version === linkVersion.current)
            setMessage("We could not confirm the change. Please try again.");
        } finally {
          busy.current = false;
          setPending(false);
        }
      }}
    >
      <h1 className="text-3xl text-gc-text">
        {grant.purpose === "RESET_PASSWORD"
          ? "Choose a new password"
          : "Confirm your email"}
      </h1>
      {grant.purpose === "RESET_PASSWORD" && (
        <>
          <p>
            Resetting your password signs out every device. You will need to
            sign in again.
          </p>
          <label className="block">
            New password
            <input
              className="mt-2 w-full rounded-xl border border-gc-divider bg-gc-canvas p-3 focus:ring-2 focus:ring-gc-focus"
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={8}
              maxLength={128}
              required
            />
          </label>
          <label className="block">
            Confirm password
            <input
              className="mt-2 w-full rounded-xl border border-gc-divider bg-gc-canvas p-3 focus:ring-2 focus:ring-gc-focus"
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
              minLength={8}
              maxLength={128}
              required
            />
          </label>
        </>
      )}
      <p role="status">{message}</p>
      {!complete && (
        <Button
          type="submit"
          disabled={pending}
          className="w-full rounded-full"
        >
          {pending
            ? "Please wait..."
            : grant.purpose === "RESET_PASSWORD"
              ? "Reset password"
              : "Verify my email"}
        </Button>
      )}
      <a href={returnHref} className="block text-gc-accent underline">
        {signedIn && verification
          ? "Return to account settings"
          : "Return to sign in"}
      </a>
      {!complete && (
        <Link
          href={
            verification
              ? "/platform/account/verify"
              : "/platform/account/recover"
          }
          onClick={() => {
            linkVersion.current++;
            setGrant(null);
            setMessage("");
          }}
          className="block text-gc-accent underline"
        >
          Request a new link
        </Link>
      )}
    </form>
  );
}
