"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import { accountInputClass } from "./account-fields";
import {
  googleRequest,
  followAccountRedirect,
  useGoogleAccountOptions
} from "./google-account";

export function GoogleOnboarding() {
  const { options, loading } = useGoogleAccountOptions();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const busy = useRef(false);
  const feedback = useRef<HTMLParagraphElement>(null);
  const kind = options?.pending;
  async function submit(body: Record<string, unknown>) {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setMessage("");
    try {
      followAccountRedirect((await googleRequest(body)).redirect);
    } catch (error) {
      setMessage(
        error instanceof Error && !(error instanceof TypeError)
          ? error.message
          : "Could not confirm the response. Check your connection and try again."
      );
      busy.current = false;
      setPending(false);
      requestAnimationFrame(() => feedback.current?.focus());
    }
  }
  return (
    <section className="gc-settings" aria-busy={pending}>
      <h1 className="text-4xl text-gc-text">
        {kind === "reactivate"
          ? "Reactivate your account"
          : "Finish joining Godschurches"}
      </h1>
      {loading ? (
        <p role="status">Checking your Google sign-in…</p>
      ) : !kind ? (
        <p>
          This Google confirmation is no longer available.{" "}
          <Link href="/platform/login" className="text-gc-accent underline">
            Return to sign in
          </Link>{" "}
          to start again.
        </p>
      ) : (
        <form
          className="space-y-5"
          onSubmit={(event) => {
            event.preventDefault();
            const values = new FormData(event.currentTarget);
            void submit(
              kind === "signup"
                ? {
                    operation: "signup",
                    name: values.get("name"),
                    username: values.get("username"),
                    adultAcknowledged: values.get("adultAcknowledged") === "on"
                  }
                : {
                    operation: "reactivate",
                    confirmed: values.get("confirmed") === "on"
                  }
            );
          }}
        >
          {kind === "signup" ? (
            <>
              <p className="text-gc-muted">
                Choose how other members will know you. Your name and username
                appear with public posts and comments. Your account email stays
                private.
              </p>
              <div>
                <label htmlFor="google-name">Name</label>
                <input
                  id="google-name"
                  name="name"
                  autoComplete="name"
                  required
                  minLength={2}
                  maxLength={100}
                  className={accountInputClass}
                />
              </div>
              <div>
                <label htmlFor="google-username">Public username</label>
                <input
                  id="google-username"
                  name="username"
                  autoComplete="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  required
                  minLength={3}
                  maxLength={24}
                  pattern="[a-zA-Z0-9_]{3,24}"
                  aria-describedby="google-username-help"
                  className={accountInputClass}
                />
                <p
                  id="google-username-help"
                  className="mt-2 text-sm text-gc-muted"
                >
                  Use 3 to 24 letters, numbers or underscores.
                </p>
              </div>
              <label className="flex min-h-11 items-start gap-3">
                <input
                  className="mt-1 h-5 w-5 shrink-0"
                  type="checkbox"
                  name="adultAcknowledged"
                  required
                />
                <span>I confirm that I am 18 or older.</span>
              </label>
              <p className="text-sm text-gc-muted">
                Joining does not grant church membership or administrative
                access.
              </p>
            </>
          ) : (
            <>
              <p>
                Your Google account is linked to a deactivated Godschurches
                account. Reactivation makes your profile, posts, comments and
                community connections visible again.
              </p>
              <p className="text-gc-muted">
                You will sign in separately afterward. Old sessions, directory
                sharing and coordinator sharing stay off.
              </p>
              <label className="flex min-h-11 items-start gap-3">
                <input
                  className="mt-1 h-5 w-5 shrink-0"
                  type="checkbox"
                  name="confirmed"
                  required
                />
                <span>
                  I want to reactivate my account and make my community content
                  visible again.
                </span>
              </label>
            </>
          )}
          <button type="submit" className="gc-button" disabled={pending}>
            {pending
              ? "Please wait…"
              : kind === "signup"
                ? "Create my account"
                : "Reactivate my account"}
          </button>
          <button
            type="button"
            className="gc-button gc-button-quiet"
            disabled={pending}
            onClick={() => void submit({ operation: "cancel" })}
          >
            Cancel
          </button>
        </form>
      )}
      <p
        ref={feedback}
        tabIndex={-1}
        role="alert"
        className="break-words text-sm text-gc-error"
      >
        {message}
      </p>
      <Link
        href="/platform"
        className="inline-flex min-h-11 items-center text-gc-accent underline"
      >
        Keep browsing
      </Link>
    </section>
  );
}
