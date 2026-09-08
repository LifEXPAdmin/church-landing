"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

type Operation =
  | "register"
  | "login"
  | "change-password"
  | "request-reset"
  | "request-verification";
const inputClass =
  "w-full rounded-2xl border border-[#f2d8af]/30 bg-[#100b07] px-4 py-3 text-[#f8ead6] outline-none focus:ring-2 focus:ring-[#f4c98c]";
export function AccountForm({ operation }: { operation: Operation }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const registration = operation === "register";
  const change = operation === "change-password";
  const request = operation.startsWith("request-");
  const title = {
    register: "Create account",
    login: "Sign in",
    "change-password": "Change password",
    "request-reset": "Request a password reset",
    "request-verification": "Verify your email"
  }[operation];
  return (
    <form
      className="space-y-4"
      onSubmit={async (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        setPending(true);
        setFailed(false);
        setMessage("");
        try {
          const response = await fetch("/api/platform/account", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              ...Object.fromEntries(new FormData(form)),
              operation
            })
          });
          const result = await response.json();
          setFailed(!response.ok);
          setMessage(result.message ?? "Please try again.");
          if (response.ok) {
            form.reset();
            if (result.redirect) {
              router.replace(result.redirect);
              router.refresh();
            }
          }
        } catch {
          setFailed(true);
          setMessage(
            "We could not connect. Your changes were not confirmed. Please try again."
          );
        } finally {
          setPending(false);
        }
      }}
    >
      <h2 className="text-3xl text-white">{title}</h2>
      {registration && (
        <>
          <label className="block">
            Name
            <input
              className={inputClass}
              name="name"
              autoComplete="name"
              required
              minLength={2}
              maxLength={100}
            />
          </label>
          <label className="block">
            Username
            <input
              className={inputClass}
              name="username"
              autoComplete="username"
              required
              pattern="[a-zA-Z0-9_]{3,24}"
              maxLength={24}
            />
          </label>
        </>
      )}
      {!change && (
        <label className="block">
          Email
          <input
            className={inputClass}
            name="email"
            type="email"
            autoComplete="email"
            maxLength={254}
            required
          />
        </label>
      )}
      {change && (
        <label className="block">
          Current password
          <input
            className={inputClass}
            name="currentPassword"
            type="password"
            autoComplete="current-password"
            minLength={8}
            maxLength={128}
            required
          />
        </label>
      )}
      {!request && (
        <label className="block">
          {change ? "New password" : "Password"}
          <input
            className={inputClass}
            name="password"
            type="password"
            autoComplete={
              registration || change ? "new-password" : "current-password"
            }
            minLength={8}
            maxLength={128}
            required
          />
        </label>
      )}
      {(registration || change) && (
        <label className="block">
          Confirm password
          <input
            className={inputClass}
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            minLength={8}
            maxLength={128}
            required
          />
        </label>
      )}
      {registration && (
        <label className="block">
          How would you like to participate?
          <select name="role" className={inputClass} defaultValue="BELIEVER">
            <option value="BELIEVER">Believer</option>
            <option value="CHURCH">Church</option>
            <option value="CREATOR">Creator</option>
            <option value="BUSINESS">Business</option>
            <option value="BUILDER">Builder</option>
          </select>
        </label>
      )}
      {change && (
        <p className="text-sm text-[#d8c4a8]">
          Changing your password signs out every device, including this one.
          Sign in again with your new password.
        </p>
      )}
      <p
        role={failed ? "alert" : "status"}
        className={`text-sm ${failed ? "text-red-200" : "text-[#f4c98c]"}`}
      >
        {message}
      </p>
      <Button type="submit" disabled={pending} className="w-full rounded-full">
        {pending ? "Please wait..." : title}
      </Button>
    </form>
  );
}
