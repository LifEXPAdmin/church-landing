"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AccountForm } from "./account-form";
import { Button } from "@/components/ui/button";

export function RecoveryForm({ available }: { available: boolean }) {
  const router = useRouter();
  const [grant, setGrant] = useState<{ token: string; purpose: string } | null>(
    null
  );
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const [complete, setComplete] = useState(false);
  useEffect(() => {
    // Fragments never reach the server. Remove them before any outgoing navigation.
    const params = new URLSearchParams(window.location.hash.slice(1));
    const token = params.get("token");
    const purpose = params.get("purpose");
    if (
      token &&
      /^[A-Za-z0-9_-]{43}$/.test(token) &&
      ["RESET_PASSWORD", "VERIFY_EMAIL"].includes(purpose ?? "")
    )
      setGrant({ token, purpose: purpose! });
    else if (window.location.hash)
      setMessage("This link is incomplete. Request a new one.");
    window.history.replaceState(null, "", window.location.pathname);
    setReady(true);
  }, []);
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
      <div className="space-y-10">
        <p role="status">{message}</p>
        <AccountForm operation="request-reset" />
        <AccountForm operation="request-verification" />
      </div>
    );
  return (
    <form
      className="space-y-5"
      onSubmit={async (event) => {
        event.preventDefault();
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
          setMessage(body.message);
          if (result.ok) {
            form.reset();
            setComplete(true);
            if (body.redirect) {
              router.replace(body.redirect);
              router.refresh();
            }
          }
        } catch {
          setMessage("We could not confirm the change. Please try again.");
        } finally {
          setPending(false);
        }
      }}
    >
      <h2 className="text-3xl text-white">
        {grant.purpose === "RESET_PASSWORD"
          ? "Choose a new password"
          : "Confirm your email"}
      </h2>
      {grant.purpose === "RESET_PASSWORD" && (
        <>
          <p>
            Resetting your password signs out every device. You will need to
            sign in again.
          </p>
          <label className="block">
            New password
            <input
              className="mt-2 w-full rounded-2xl border border-[#f2d8af]/30 bg-[#100b07] p-3 focus:ring-2 focus:ring-[#f4c98c]"
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
              className="mt-2 w-full rounded-2xl border border-[#f2d8af]/30 bg-[#100b07] p-3 focus:ring-2 focus:ring-[#f4c98c]"
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
      <Link href="/platform/login" className="block text-[#f4c98c] underline">
        Return to sign in
      </Link>
    </form>
  );
}
