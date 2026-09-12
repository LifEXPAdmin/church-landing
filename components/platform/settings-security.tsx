"use client";
import Link from "next/link";
import type { SettingsContext } from "@/lib/platform/settings-context";

export function canConfirmSettings(data: SettingsContext) {
  return data.methods.password || (data.googleAvailable && data.methods.google);
}

export function SettingsCredentialHelp({ data }: { data: SettingsContext }) {
  return (
    <div className="gc-settings space-y-3">
      <p>
        {data.methods.google
          ? "This account has a linked Google sign-in, but Google confirmation is currently unavailable."
          : "This account does not have a usable password or linked Google sign-in."}{" "}
        A supported account confirmation is required before this change.
      </p>
      <p>
        {data.emailAvailable
          ? "Use email recovery to set a password through the existing verification flow. Requesting a link does not complete recovery."
          : "Email recovery is currently unavailable. Your account and existing choices remain unchanged."}
      </p>
      <Link
        className="gc-button gc-button-quiet"
        href="/platform/account/recover"
      >
        Review recovery options
      </Link>
    </div>
  );
}

export function SettingsSecurity({ data }: { data: SettingsContext }) {
  return (
    <section
      className="gc-settings space-y-4"
      aria-label="Current sign-in protection"
    >
      <dl className="space-y-3">
        <div>
          <dt>Password</dt>
          <dd>{data.methods.password ? "Set" : "Not set"}</dd>
        </div>
        <div>
          <dt>Google sign-in</dt>
          <dd>
            {data.methods.google
              ? data.googleAvailable
                ? "Connected"
                : "Connected; confirmation currently unavailable"
              : "Not connected"}
          </dd>
        </div>
        <div>
          <dt>Account email</dt>
          <dd>{data.emailVerified ? "Verified" : "Not verified"}</dd>
        </div>
        <div>
          <dt>Email recovery</dt>
          <dd>
            {data.emailAvailable
              ? "Available to request"
              : "Currently unavailable"}
          </dd>
        </div>
      </dl>
      <p className="text-gc-muted">
        Password changes, session revocation, email changes, data downloads and
        deactivation require the current password or a supported, one-use Google
        confirmation for that action.
      </p>
      <p className="text-sm text-gc-muted">
        Passkeys, multi-factor setup and configurable security alerts are not
        available here. No additional protection is implied by these settings.
      </p>
      {!canConfirmSettings(data) && <SettingsCredentialHelp data={data} />}
      <div className="flex flex-wrap gap-3">
        <Link
          className="gc-button gc-button-quiet"
          href="/platform/settings/account/sessions"
        >
          Review signed-in devices
        </Link>
        <Link
          className="gc-button gc-button-quiet"
          href="/platform/settings/account/methods"
        >
          Review sign-in methods
        </Link>
        {!data.emailVerified && (
          <Link
            className="gc-button gc-button-quiet"
            href="/platform/account/verify"
          >
            Review email verification
          </Link>
        )}
      </div>
    </section>
  );
}
